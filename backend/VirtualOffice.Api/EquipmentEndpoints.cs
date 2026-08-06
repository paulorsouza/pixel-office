using System.Data;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public sealed record EquipRequest(int? InstanceId);

/// <summary>Bag na ordem em que o jogador arrastou os cards, da primeira à última.</summary>
public sealed record ReorderRequest(int[] InstanceIds);

/// <summary>
/// Loadout e efeitos de equipamento. Duas rotas só: ler o conjunto e trocar um slot.
///
/// O loadout mora no servidor porque, da v2 em diante, o que está equipado muda quanto
/// o jogo paga (presença, cassino, loja). Antes vivia no `localStorage`, o que estava
/// certo enquanto o efeito era cosmético e deixou de estar no minuto em que não é.
/// Ver docs/PLANO_EQUIPAMENTOS.md.
/// </summary>
public static class EquipmentEndpoints
{
    public static void MapEquipmentEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/game/equipment", GetEquipment);
        api.MapPut("/game/equipment/{slot}", SetSlot);
        api.MapPut("/game/equipment/bag/order", Reorder);
        api.MapPost("/game/lootboxes/{instanceId:int}/open", OpenLootbox);
    }

    /// <summary>
    /// Grava a ordem da bag. Chega a lista inteira, não um "moveu de 3 para 7": o
    /// cliente já reordenou a grade na tela e mandar a lista final é o que impede as
    /// duas ordens de divergirem quando dois arrastes se atropelam.
    ///
    /// Índices começam em 1 porque zero é o valor de quem nunca arrastou nada — e
    /// esses ficam no fim, na ordenação natural.
    /// </summary>
    private static async Task<IResult> Reorder(
        ReorderRequest body,
        HttpRequest req,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        var ids = body?.InstanceIds ?? [];
        if (ids.Length > 500) return Results.BadRequest(new { error = "Ordem grande demais." });

        await using var db = await factory.CreateDbContextAsync();
        var owned = await db.GameItemInstances
            .Where(x => x.UserId == userId && ids.Contains(x.Id))
            .ToListAsync();
        foreach (var instance in owned)
        {
            instance.BagOrder = Array.IndexOf(ids, instance.Id) + 1;
        }
        await db.SaveChangesAsync();
        return Results.Ok(await SnapshotAsync(db, userId));
    }

    /// <summary>
    /// Abre um baú do inventário. Serializable porque abrir é ler-sortear-gravar: em
    /// ReadCommitted, dois cliques no mesmo baú sorteariam dois prêmios e removeriam a
    /// mesma unidade duas vezes.
    /// </summary>
    private static async Task<IResult> OpenLootbox(
        int instanceId,
        HttpRequest req,
        IDbContextFactory<AppDb> factory,
        IHubContext<OfficeHub> hub)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var user = await db.Users.FindAsync(userId);
        var chest = await db.GameItemInstances
            .SingleOrDefaultAsync(x => x.Id == instanceId && x.UserId == userId);
        if (user is null || chest is null)
            return Results.NotFound(new { error = "Baú não encontrado no seu inventário." });

        var result = await Lootboxes.OpenAsync(db, user, chest);
        if (result is null) return Results.BadRequest(new { error = "Este item não é um baú." });
        await db.SaveChangesAsync();
        await tx.CommitAsync();

        await hub.Clients.Group(OfficeHub.UserGroup(userId)).SendAsync("EquipmentChanged");
        return Results.Ok(new
        {
            opened = new
            {
                tier = result.TierId,
                tierName = result.TierName,
                result.Rarity,
                rarityName = EquipmentCatalog.RarityNames.GetValueOrDefault(result.Rarity, result.Rarity),
                item = result.Item is null ? null : new
                {
                    result.Item.Id,
                    result.Item.Name,
                    result.Item.Slot,
                    result.Item.Description,
                    // Lido DEPOIS do SaveChanges: antes dele o id ainda é zero.
                    instanceId = result.Instance?.Id ?? 0,
                    effectLabels = EquipmentCatalog.Describe(result.Item.Effects),
                },
                // Sem item novo, o baú virou moeda: a UI precisa dos dois para não
                // anunciar "você ganhou" apontando para o nada.
                coins = result.Coins,
                result.Duplicate,
                // A caixa do beta entrega centenas de coisas: o que a tela anuncia
                // é o resumo, não um prêmio.
                beta = result.Beta is null ? null : new
                {
                    result.Beta.Equipment,
                    result.Beta.Furniture,
                    result.Beta.Chests,
                    result.Beta.Boosters,
                    result.Beta.BoosterKinds,
                },
            },
            equipment = await SnapshotAsync(db, userId),
            coins = user.Coins,
        });
    }

    /// <summary>
    /// O que o jogador tem, o que está vestindo e o que o conjunto faz.
    /// A UI não recalcula nada disto: ela desenha.
    /// </summary>
    private static async Task<IResult> GetEquipment(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        return Results.Ok(await SnapshotAsync(db, userId));
    }

    private static async Task<IResult> SetSlot(
        string slot,
        EquipRequest body,
        HttpRequest req,
        IDbContextFactory<AppDb> factory,
        IHubContext<OfficeHub> hub)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!EquipmentCatalog.IsSlot(slot))
            return Results.NotFound(new { error = "Slot inexistente." });

        await using var db = await factory.CreateDbContextAsync();
        // Serializable pelo mesmo motivo da compra: trocar de slot é ler-tirar-pôr, e
        // dois cliques simultâneos em ReadCommitted esbarram no índice único e um deles
        // estoura em vez de esperar.
        await using var tx = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);

        var current = await db.GameItemInstances
            .SingleOrDefaultAsync(x => x.UserId == userId && x.EquippedSlot == slot);

        GameItemInstance? next = null;
        if (body.InstanceId is int instanceId)
        {
            var row = await db.GameItemInstances
                .Where(x => x.Id == instanceId && x.UserId == userId)
                .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => new { x, d })
                .SingleOrDefaultAsync();
            if (row is null) return Results.NotFound(new { error = "Item não encontrado no seu inventário." });

            var item = EquipmentCatalog.FindByCatalogKey(row.d.CatalogKey);
            if (item is null) return Results.BadRequest(new { error = "Este item não é equipável." });
            if (item.Slot != slot)
                return Results.BadRequest(new { error = $"{item.Name} pertence ao slot {SlotName(item.Slot)}." });
            // Móvel colocado na sala não é o caso aqui (equipamento não se posiciona),
            // mas a checagem impede que uma unidade guardada num baú suma de lá ao vestir.
            if (row.x.Location is "placed" or "chest")
                return Results.Conflict(new { error = "Recolha o item antes de equipar." });
            next = row.x;
        }

        if (current is not null && current.Id != next?.Id)
        {
            current.EquippedSlot = "";
            current.Location = "inventory";
        }
        if (next is not null)
        {
            next.EquippedSlot = slot;
            next.Location = "equipped";
        }
        await db.SaveChangesAsync();
        await tx.CommitAsync();

        await hub.Clients.Group(OfficeHub.UserGroup(userId)).SendAsync("EquipmentChanged");
        return Results.Ok(await SnapshotAsync(db, userId));
    }

    private sealed record OwnedRow(GameItemInstance Instance, EquipmentItem Item);

    /// <summary>
    /// Só as unidades que são equipamento de verdade. Instância cuja definição não está
    /// mais no catálogo é ignorada em vez de explodir — o seed apaga as aposentadas, mas
    /// a leitura não pode depender de o seed já ter rodado.
    /// </summary>
    private static async Task<List<OwnedRow>> OwnedAsync(AppDb db, int userId)
    {
        var rows = await db.GameItemInstances
            .Where(x => x.UserId == userId)
            .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => new { x, d.CatalogKey })
            .ToListAsync();
        return [.. rows
            .Select(row => new { row.x, Item = EquipmentCatalog.FindByCatalogKey(row.CatalogKey) })
            .Where(row => row.Item is not null)
            .Select(row => new OwnedRow(row.x, row.Item!))
            // Quem o jogador arrastou vem primeiro, na ordem dele; o resto segue a
            // ordenação natural. Sem o `MaxValue`, item novo (BagOrder zero) nasceria
            // na frente de tudo que a pessoa organizou.
            .OrderBy(row => row.Instance.BagOrder == 0 ? int.MaxValue : row.Instance.BagOrder)
            .ThenBy(row => Array.IndexOf(EquipmentCatalog.Slots.Select(s => s.Id).ToArray(), row.Item.Slot))
            .ThenByDescending(row => EquipmentCatalog.RarityRank(row.Item.Rarity))
            .ThenBy(row => row.Item.Name)];
    }

    private static string SlotName(string slot) =>
        EquipmentCatalog.Slots.FirstOrDefault(x => x.Id == slot)?.Name ?? slot;

    /// <summary>
    /// Baús fechados do jogador, agrupados por tipo. Agrupados porque cinco Baús Comuns
    /// são cinco cliques no mesmo botão, não cinco cards diferentes na bag.
    /// </summary>
    private static async Task<List<object>> ChestsAsync(AppDb db, int userId)
    {
        var rows = await db.GameItemInstances
            .Where(x => x.UserId == userId)
            .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => new { x.Id, d.CatalogKey })
            .ToListAsync();
        return [.. rows
            .Select(row => new { row.Id, Tier = LootboxCatalog.FindByCatalogKey(row.CatalogKey) })
            .Where(row => row.Tier is not null)
            .GroupBy(row => row.Tier!.Id)
            .OrderBy(group => Array.FindIndex(LootboxCatalog.Tiers, t => t.Id == group.Key))
            .Select(group => (object)new
            {
                tier = group.Key,
                name = group.First().Tier!.Name,
                description = group.First().Tier!.Description,
                count = group.Count(),
                // A UI abre um por vez e sempre o mais antigo: manter a ordem torna a
                // ação previsível quando o jogador clica cinco vezes seguidas.
                instanceIds = group.Select(row => row.Id).Order().ToArray(),
                odds = LootboxCatalog.Odds(group.First().Tier!),
                // A cor da borda vinha da última linha das chances. A caixa do beta não
                // tem chances (ela não sorteia), e sem isto ela nascia cinza de comum.
                rarity = group.First().Tier!.Table.MaxBy(
                    row => EquipmentCatalog.RarityRank(row.Rarity))!.Rarity,
                everything = group.First().Tier!.GrantsEverything,
            })];
    }

    private static async Task<object> SnapshotAsync(AppDb db, int userId) =>
        Snapshot(await OwnedAsync(db, userId), await ChestsAsync(db, userId));

    private static object Snapshot(List<OwnedRow> owned, List<object> chests)
    {
        var equipped = owned.Where(row => row.Instance.EquippedSlot != "").ToList();
        var effects = EquipmentCatalog.Aggregate(equipped.Select(row => row.Item.CatalogKey));
        return new
        {
            slots = EquipmentCatalog.Slots.Select(slot => new
            {
                slot.Id, slot.Name, slot.ShortLabel, slot.Description,
            }),
            rarities = EquipmentCatalog.Rarities.Select(rarity => new
            {
                id = rarity,
                name = EquipmentCatalog.RarityNames[rarity],
                rank = EquipmentCatalog.RarityRank(rarity),
            }),
            // Chave = slot, valor = id da instância vestida (ou null). É o formato que a
            // UI já usava no localStorage, então o cliente troca a fonte sem trocar a forma.
            loadout = EquipmentCatalog.Slots.ToDictionary(
                slot => slot.Id,
                slot => equipped.FirstOrDefault(row => row.Instance.EquippedSlot == slot.Id) is { } row
                    ? Describe(row, effects)
                    : (object?)null),
            items = owned.Select(row => Describe(row, effects)),
            chests,
            effects = Payload(effects),
            effectLabels = EquipmentCatalog.Describe(effects),
        };
    }

    /// <summary>
    /// Progresso do relógio de baú desta unidade, ou null quando ela não gera baú.
    /// O intervalo vem do conjunto (o veículo pode adiantar), o acumulado vem do item.
    /// </summary>
    private static object? ChestProgress(OwnedRow row, EquipmentEffects setEffects)
    {
        if (string.IsNullOrEmpty(row.Item.Effects.ChestTier)) return null;
        // Só quem está equipado usa o intervalo do conjunto: um celular guardado na bag
        // mostraria um adiantamento de veículo que não está valendo para ele.
        var hours = row.Instance.EquippedSlot != ""
            ? setEffects.ChestIntervalHours ?? row.Item.Effects.ChestIntervalHours
            : row.Item.Effects.ChestIntervalHours;
        if (hours is not int interval) return null;
        var minutes = Lootboxes.ChestMinutesOf(row.Instance);
        return new
        {
            tier = row.Item.Effects.ChestTier,
            tierName = LootboxCatalog.Find(row.Item.Effects.ChestTier)?.Name ?? "Baú",
            intervalMinutes = interval * 60,
            minutes,
            // Contar só enquanto equipado é a regra: desequipar pausa, não zera.
            running = row.Instance.EquippedSlot != "",
        };
    }

    private static object Describe(OwnedRow row, EquipmentEffects setEffects) => new
    {
        instanceId = row.Instance.Id,
        id = row.Item.Id,
        catalogKey = row.Item.CatalogKey,
        row.Item.Name,
        row.Item.Slot,
        row.Item.Rarity,
        rarityName = EquipmentCatalog.RarityNames[row.Item.Rarity],
        rarityRank = EquipmentCatalog.RarityRank(row.Item.Rarity),
        row.Item.Description,
        row.Item.Price,
        equippedSlot = row.Instance.EquippedSlot,
        equipped = row.Instance.EquippedSlot != "",
        bagOrder = row.Instance.BagOrder,
        acquiredUtc = row.Instance.AcquiredUtc,
        effects = Payload(row.Item.Effects),
        effectLabels = EquipmentCatalog.Describe(row.Item.Effects),
        chest = ChestProgress(row, setEffects),
    };

    private static object Payload(EquipmentEffects effects) => new
    {
        effects.PassiveCoinPercent,
        effects.TeamworkCoinPercent,
        effects.DiceStartRolls,
        effects.DiceTwoExtraRolls,
        effects.DiceTwelveKeepsRoll,
        effects.DiceDoublesBonusRoll,
        effects.SlotsBoosterChancePercent,
        effects.BoosterShinyPercent,
        effects.StoreDiscountPercent,
        effects.StoreWeeklyBonus,
        effects.StoreExclusiveTier,
        chestTier = effects.ChestTier,
        chestIntervalHours = effects.ChestIntervalHours,
    };
}
