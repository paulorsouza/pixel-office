using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>Resultado de abrir um baú: ou saiu item, ou saiu moeda.</summary>
public sealed record LootboxResult(
    string TierId,
    string TierName,
    string Rarity,
    EquipmentItem? Item,
    /// A INSTÂNCIA, não o id: quem abre ainda não deu SaveChanges, e o id de uma
    /// entidade recém-adicionada só existe depois dele. Guardar o int aqui
    /// devolveria zero para a UI.
    GameItemInstance? Instance,
    int Coins,
    bool Duplicate);

/// <summary>
/// Conceder e abrir baú. Todas as sete fontes do plano (§6.1) passam por
/// <see cref="GrantAsync"/>, e a abertura inteira mora em <see cref="OpenAsync"/>.
///
/// Não chama SaveChanges: quem chama decide a transação — várias fontes concedem baú no
/// meio de outra operação (fim de rodada, virada de nível, conclusão de objetivo) e um
/// commit no meio quebraria o de fora.
/// </summary>
public static class Lootboxes
{
    /// <summary>Fonte da concessão, usada no `Reason` do evento que torna a entrega idempotente.</summary>
    public const string GrantSource = "chest";

    /// <summary>Cria uma unidade fechada do baú no inventário do jogador.</summary>
    public static async Task<GameItemInstance?> GrantAsync(AppDb db, int userId, string tierId)
    {
        var tier = LootboxCatalog.Find(tierId);
        if (tier is null) return null;
        var definition = await db.GameItemDefinitions
            .SingleOrDefaultAsync(x => x.CatalogKey == tier.CatalogKey);
        // Definição ausente só acontece antes do primeiro seed. Melhor não conceder do
        // que estourar no meio de uma rodada de cassino por causa de um baú.
        if (definition is null) return null;
        var instance = new GameItemInstance { UserId = userId, DefinitionId = definition.Id };
        db.GameItemInstances.Add(instance);
        return instance;
    }

    /// <summary>
    /// Concede uma vez por chave. A chave é gravada como <see cref="CoinEvent"/> de valor
    /// zero — o mesmo truque do bônus de boas-vindas. Sem ledger próprio: o que se quer
    /// saber é "já dei este baú?", e `CoinEvents` já é o livro-caixa de tudo que o jogo dá.
    /// </summary>
    public static async Task<bool> GrantOnceAsync(AppDb db, User user, string tierId, string key)
    {
        if (await db.CoinEvents.AnyAsync(e =>
            e.UserId == user.Id && e.Source == GrantSource && e.Reason == key)) return false;
        if (await GrantAsync(db, user.Id, tierId) is null) return false;
        db.CoinEvents.Add(new CoinEvent
        {
            UserId = user.Id, Gold = 0,
            Reason = key, Source = GrantSource, CreatedUtc = DateTime.UtcNow,
        });
        return true;
    }

    /// <summary>
    /// Marcos de tempo ACOMPANHADO no dia que valem baú: uma hora junto e três horas.
    ///
    /// É a recompensa não-monetária do pilar de equipe, e é diária de propósito: o baú
    /// por marco de vida (40 h lançadas) premia acúmulo, este premia a rotina de sentar
    /// com alguém. Marcos em minutos porque o contador do dia é em minutos.
    /// </summary>
    private static readonly (int Minutes, string Tier)[] TeamworkChests =
    [
        (60, LootboxCatalog.Common),
        (180, LootboxCatalog.Rare),
    ];

    /// <summary>
    /// Baú por tempo de equipe acumulado HOJE. Idempotente pela chave do dia, então
    /// pode ser chamado a cada minuto sem duplicar prêmio.
    /// </summary>
    public static async Task GrantTeamworkChestsAsync(AppDb db, User user, DateTime nowUtc)
    {
        var day = Periods.DayStart(nowUtc);
        var row = await db.PresenceDays
            .FirstOrDefaultAsync(p => p.UserId == user.Id && p.PeriodDay == day);
        if (row is null || row.TeamworkMinutes <= 0) return;
        foreach (var (minutes, tier) in TeamworkChests)
        {
            if (row.TeamworkMinutes < minutes) continue;
            await GrantOnceAsync(db, user, tier, $"teamwork:{day:yyyy-MM-dd}:{minutes}");
        }
    }

    /// <summary>
    /// Abre o baú: consome a unidade, sorteia a raridade e entrega um item que o jogador
    /// ainda NÃO tem.
    ///
    /// Equipamento é único por jogador — dois mouses iguais não fazem sentido em um slot
    /// só —, então o poço seca. Quando a raridade sorteada já está completa, o sorteio
    /// tenta outra; esgotadas as tentativas, o baú paga moeda. Abrir e não receber nada
    /// seria pior que não ter caído baú nenhum.
    /// </summary>
    public static async Task<LootboxResult?> OpenAsync(AppDb db, User user, GameItemInstance chest)
    {
        var definition = await db.GameItemDefinitions.FindAsync(chest.DefinitionId);
        var tier = definition is null ? null : LootboxCatalog.FindByCatalogKey(definition.CatalogKey);
        if (tier is null) return null;

        var ownedKeys = await db.GameItemInstances
            .Where(x => x.UserId == user.Id)
            .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => d.CatalogKey)
            .ToListAsync();
        var owned = ownedKeys.ToHashSet();

        var rarity = LootboxCatalog.RollRarity(tier, RandomNumberGenerator.GetInt32);
        EquipmentItem? prize = null;
        var duplicate = false;
        for (var attempt = 0; attempt <= LootboxCatalog.RarityRerolls; attempt++)
        {
            var pool = EquipmentCatalog.Items
                .Where(item => item.Rarity == rarity && !owned.Contains(item.CatalogKey))
                .ToArray();
            if (pool.Length > 0)
            {
                prize = pool[RandomNumberGenerator.GetInt32(pool.Length)];
                break;
            }
            duplicate = true;
            if (attempt == LootboxCatalog.RarityRerolls) break;
            rarity = LootboxCatalog.RollRarity(tier, RandomNumberGenerator.GetInt32);
        }

        db.GameItemInstances.Remove(chest);

        if (prize is null)
        {
            var coins = LootboxCatalog.ConsolationCoins.GetValueOrDefault(rarity, 0);
            await Game.AwardAsync(db, user, new Reward(coins),
                $"baú sem novidade: {tier.Name}", GrantSource);
            return new LootboxResult(tier.Id, tier.Name, rarity, null, null, coins, true);
        }

        var prizeDefinition = await db.GameItemDefinitions
            .SingleOrDefaultAsync(x => x.CatalogKey == prize.CatalogKey);
        if (prizeDefinition is null) return null;
        var instance = new GameItemInstance { UserId = user.Id, DefinitionId = prizeDefinition.Id };
        db.GameItemInstances.Add(instance);
        return new LootboxResult(tier.Id, tier.Name, prize.Rarity, prize, instance, 0, duplicate);
    }

    /// <summary>Nome do campo do relógio dentro do <c>StateJson</c> da unidade.</summary>
    private const string ChestMinutesField = "chestMinutes";

    /// <summary>Minutos que esta unidade já acumulou rumo ao próximo baú.</summary>
    public static int ChestMinutesOf(GameItemInstance instance)
    {
        if (string.IsNullOrWhiteSpace(instance.StateJson)) return 0;
        try
        {
            using var doc = JsonDocument.Parse(instance.StateJson);
            return doc.RootElement.TryGetProperty(ChestMinutesField, out var node)
                && node.TryGetInt32(out var minutes)
                    ? Math.Max(0, minutes)
                    : 0;
        }
        catch (JsonException) { return 0; }
    }

    private static void SetChestMinutes(GameItemInstance instance, int minutes)
    {
        instance.StateJson = JsonSerializer.Serialize(
            new Dictionary<string, int> { [ChestMinutesField] = Math.Max(0, minutes) });
    }

    /// <summary>
    /// Tique do relógio de baú. Soma os minutos online **na própria unidade** e entrega
    /// um baú a cada intervalo cheio.
    ///
    /// O relógio mora no item, não no jogador: cada celular acumula o seu. Guardar um
    /// contador por usuário fazia o progresso do Flagship migrar para o Dobrável na
    /// troca — e o jogador que comprou os dois teria um relógio só. Desequipar **não
    /// zera**: o item guarda o que já contou e simplesmente para de contar, porque a
    /// única coisa que avança o relógio é estar no slot.
    ///
    /// Devolve os baús concedidos neste tique (normalmente zero ou um).
    /// </summary>
    public static async Task<List<string>> AccrueChestTimerAsync(
        AppDb db, int userId, int minutes, EquipmentEffects effects, DateTime nowUtc)
    {
        var granted = new List<string>();
        if (effects.ChestIntervalHours is not int hours || minutes <= 0) return granted;

        // A unidade que CONTA é a que gera baú (o celular). O veículo só encurta o
        // intervalo, então ele entra pelo agregado, não como dono do relógio.
        var rows = await db.GameItemInstances
            .Where(x => x.UserId == userId && x.EquippedSlot != "")
            .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => new { x, d.CatalogKey })
            .ToListAsync();
        var carrier = rows
            .Select(row => new { row.x, Item = EquipmentCatalog.FindByCatalogKey(row.CatalogKey) })
            .FirstOrDefault(row => !string.IsNullOrEmpty(row.Item?.Effects.ChestTier))?.x;
        if (carrier is null) return granted;

        var accrued = ChestMinutesOf(carrier) + minutes;
        var interval = hours * 60;
        // `while` e não `if`: um celular melhor (ou um veículo que adianta) encurta o
        // intervalo, e o saldo acumulado pode já cobrir mais de um baú.
        while (accrued >= interval)
        {
            if (await GrantAsync(db, userId, effects.ChestTier) is null) break;
            accrued -= interval;
            granted.Add(effects.ChestTier);
        }
        SetChestMinutes(carrier, accrued);
        return granted;
    }
}
