using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public static class GameInventorySeed
{
    private sealed record CatalogItem(
        string Key,
        string Name,
        string Category,
        string Interaction = "",
        string ItemType = "furniture",
        string Rarity = "common",
        int Price = 0,
        bool Purchasable = true,
        int StarterQuantity = 0,
        string Capabilities = "[]",
        int WeeklyLimit = 0);

    /// <summary>
    /// Preço e teto dos boosters vendidos por moeda. A renda semanal máxima é de
    /// ~5.945 moedas (ver docs/ECONOMIA.md), então em uso normal quem limita é a
    /// carteira: os três Raros mais o Ultrarraro já custam uma semana inteira, e o
    /// jogador escolhe onde gastar. O teto existe para o pico — uma noite boa no
    /// cassino não vira cinquenta pacotes da mesma geração.
    /// </summary>
    private const int GenerationBoosterPrice = 400;
    private const int GenerationBoosterWeeklyLimit = 10;

    /// <summary>Só cartas Rare+ e 2,5% de shiny: vale três Edições.</summary>
    private const int RareBoosterPrice = 1_200;
    private const int RareBoosterWeeklyLimit = 3;

    /// <summary>
    /// `Epic` garantida e 5% de shiny — o teto do que MOEDA compra. A `Legendary`
    /// garantida é do Booster Lendário, que só sai da Liga.
    ///
    /// Preço abaixo de três Raros (3.600) de propósito: com a garantia menor, cobrar
    /// mais deixaria o item dominado — três Raros dão 15 cartas contra estas 5.
    /// </summary>
    private const int UltraRareBoosterPrice = 2_500;
    private const int UltraRareBoosterWeeklyLimit = 1;

    private static readonly CatalogItem[] Catalog =
    [
        new("of_258", "Mesa reta madeira", "desks", Price: 120, StarterQuantity: 1),
        new("of_294", "Mesa reta clara", "desks", Price: 150),
        new("of_300", "Mesa em L madeira", "desks", Price: 220),
        new("of_305", "Mesa em L cinza", "desks", Price: 240),
        new("of_323", "Balcão de recepção", "desks", Price: 280),
        new("of_225", "Estação compacta azul", "workstations", "workstation", Price: 320,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_227", "Estação dupla azul", "workstations", "workstation", Price: 360,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_229", "Estação compacta ciano", "workstations", "workstation", Price: 340,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_231", "Estação dupla ciano", "workstations", "workstation", Price: 380,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_233", "Estação compacta coral", "workstations", "workstation", Price: 340,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_235", "Estação dupla coral", "workstations", "workstation", Price: 380,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_317", "Computador azul", "workstations", "workstation", Price: 260,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_318", "Computador violeta", "workstations", "workstation", Price: 280,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_319", "Computador cinza", "workstations", "workstation", Price: 260,
            Capabilities: """["work-log","task-picker"]"""),
        new("of_320", "Bancada de café clara", "workstations", "coffee", Price: 180,
            Capabilities: """["coffee-cup","hand-animation"]"""),
        new("of_321", "Bancada de café madeira", "workstations", "coffee", Price: 190,
            Capabilities: """["coffee-cup","hand-animation"]"""),
        new("of_322", "Bancada de café laranja", "workstations", "coffee", Price: 200,
            Capabilities: """["coffee-cup","hand-animation"]"""),
        new("of_196", "Poltrona azul", "seating", "seat", Price: 90),
        new("of_197", "Poltrona violeta", "seating", "seat", Price: 100),
        new("of_198", "Poltrona cinza", "seating", "seat", Price: 100),
        new("of_199", "Poltrona amarela", "seating", "seat", Price: 110),
        new("of_306", "Cadeira laranja lateral", "seating", "seat", Price: 80),
        new("of_307", "Cadeira escura lateral", "seating", "seat", Price: 80),
        new("of_315", "Cadeira clara frontal", "seating", "seat", Price: 90),
        new("of_316", "Cadeira escura frontal", "seating", "seat", Price: 90),
        new("of_173", "Bebedouro claro", "storage", Price: 100),
        new("of_175", "Terminal da loja", "storage", "store", Price: 180,
            Capabilities: """["catalog","purchase"]"""),
        new("of_176", "Armário servidor", "storage", "chest", Price: 240,
            Capabilities: """["storage"]"""),
        new("of_329", "Bebedouro azul", "storage", Price: 110),
        new("of_98", "Planta grande", "decor", Price: 70),
        new("of_99", "Planta baixa", "decor", Price: 55),
        new("of_100", "Planta alta", "decor", Price: 65),
        new("of_163", "Quadro pequeno", "decor", Price: 60),
        new("of_164", "Quadro colorido", "decor", Price: 75),
        new("of_170", "Quadro branco", "decor", "whiteboard", Price: 160,
            Capabilities: """["drawio"]"""),
        new("of_171", "Quadro de planejamento", "decor", "kanban", Price: 180, StarterQuantity: 1,
            Capabilities: """["kanban","task-picker"]"""),
        new("of_172", "Quadro de métricas", "decor", "timeclock", Price: 190,
            Capabilities: """["hours-report"]"""),

        // Equipamento NÃO fica aqui: ele é gerado de `EquipmentCatalog`, que é dono do
        // efeito, do preço e da raridade (ver docs/PLANO_EQUIPAMENTOS.md §7). Duas listas
        // seria duas verdades — e a que tem efeito precisa ser a única.

        // O Nacional continua fora do balcão: ele é a moeda de recompensa do cassino e
        // o pacote inicial, então vendê-lo apagaria as duas coisas. O Especial também
        // não entra — ele é preso a uma espécie-alvo e não cabe num item de catálogo.
        new("cardgame:booster", "Booster Nacional", "cards", ItemType: "booster",
            Rarity: "rare", Price: 0, Purchasable: false),
        new("cardgame:booster-generation-1", "Edição Kanto", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-2", "Edição Johto", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-3", "Edição Hoenn", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-4", "Edição Sinnoh", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-5", "Edição Unova", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-6", "Edição Kalos", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-7", "Edição Alola", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-8", "Edição Galar/Hisui", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-generation-9", "Edição Paldea", "cards", ItemType: "booster",
            Rarity: "rare", Price: GenerationBoosterPrice, WeeklyLimit: GenerationBoosterWeeklyLimit),
        new("cardgame:booster-rare", "Booster Raro", "cards", ItemType: "booster",
            Rarity: "epic", Price: RareBoosterPrice, WeeklyLimit: RareBoosterWeeklyLimit),
        new("cardgame:booster-ultra-rare", "Booster Ultrarraro", "cards", ItemType: "booster",
            Rarity: "legendary", Price: UltraRareBoosterPrice, WeeklyLimit: UltraRareBoosterWeeklyLimit),
    ];

    /// <summary>
    /// Qual balcão vende o quê. O tipo de loja é DERIVADO do tipo do item — sem
    /// coluna nova e sem chance de um item existir fora de toda loja.
    /// </summary>
    public static string StoreKindFor(string itemType) => itemType switch
    {
        "furniture" => "furniture",
        // Baú divide balcão com equipamento: é o que ele solta, e é onde o jogador
        // procura. Um terceiro balcão exigiria um móvel novo em cada mapa por um
        // catálogo de cinco linhas.
        "equipment" or "vehicle" or LootboxCatalog.ItemType => "equipment",
        "booster" => "cards",
        _ => "",
    };

    /// <summary>
    /// Projeta o catálogo de equipamento no formato do seed. O tipo do item vem do
    /// slot: só o automóvel é `vehicle` (é o que o cliente usa para mover), o resto é
    /// `equipment`. Os dois caem no mesmo balcão via <see cref="StoreKindFor"/>.
    /// </summary>
    private static IEnumerable<CatalogItem> EquipmentCatalogItems() =>
        EquipmentCatalog.Items.Select(item => new CatalogItem(
            Key: item.CatalogKey,
            Name: item.Name,
            Category: item.Slot,
            ItemType: item.Slot == EquipmentCatalog.SlotVehicle ? "vehicle" : "equipment",
            Rarity: item.Rarity,
            Price: item.Price,
            Purchasable: item.IsPurchasable,
            StarterQuantity: item.Starter ? 1 : 0,
            Capabilities: item.Slot == EquipmentCatalog.SlotVehicle ? """["movement"]""" : "[]"));

    /// <summary>
    /// Baús no formato do seed. Eles são item de inventário como qualquer outro — é isso
    /// que faz comprar, guardar e receber de recompensa já funcionarem sem código novo.
    /// </summary>
    private static IEnumerable<CatalogItem> LootboxCatalogItems() =>
        LootboxCatalog.Tiers.Select(tier => new CatalogItem(
            Key: tier.CatalogKey,
            Name: tier.Name,
            Category: "lootbox",
            ItemType: LootboxCatalog.ItemType,
            // A raridade do baú é a MELHOR coisa que ele pode soltar: é o que o jogador
            // quer saber de relance, e é o que colore a borda na loja e na bag.
            Rarity: tier.Table.MaxBy(row => EquipmentCatalog.RarityRank(row.Rarity))!.Rarity,
            Price: tier.Price,
            Purchasable: tier.IsPurchasable,
            WeeklyLimit: tier.WeeklyLimit));

    public static async Task RunAsync(AppDb db)
    {
        await RetireObsoleteEquipmentAsync(db);
        var existing = await db.GameItemDefinitions.ToDictionaryAsync(d => d.CatalogKey);
        foreach (var item in Catalog.Concat(EquipmentCatalogItems()).Concat(LootboxCatalogItems()))
        {
            if (!existing.TryGetValue(item.Key, out var definition))
            {
                definition = new GameItemDefinition { CatalogKey = item.Key };
                db.GameItemDefinitions.Add(definition);
            }
            definition.Name = item.Name;
            definition.Category = item.Category;
            definition.IconPath = item.ItemType == "furniture"
                ? $"assets/furniture/office/{item.Key}.png"
                : "";
            definition.InteractionType = item.Interaction;
            definition.ItemType = item.ItemType;
            definition.Rarity = item.Rarity;
            definition.Price = item.Price;
            definition.IsPurchasable = item.Purchasable;
            definition.WeeklyPurchaseLimit = item.WeeklyLimit;
            definition.StarterQuantity = item.StarterQuantity;
            definition.CapabilitiesJson = item.Capabilities;
        }
        await db.SaveChangesAsync();

        await DropOrphanPersonalRoomsAsync(db);
        await RepackPersonalRoomsAsync(db);
        await RealignPersonalFurnitureAsync(db);
        var users = await db.Users.Where(x => !x.IsBot).Select(x => x.Id).ToListAsync();
        foreach (var userId in users) await EnsureUserStockAsync(db, userId);
    }

    /// <summary>
    /// Apaga os equipamentos que saíram do jogo — definição, instâncias e cota de loja.
    ///
    /// O jogo está em beta e os vestíveis antigos (brincos, corrente, pulseira) não têm
    /// slot para onde ir na v2; os periféricos velhos foram substituídos por ids que
    /// carregam efeito. Deixar a definição de pé só criaria item órfão: sem slot, ele
    /// não aparece na bag nem pode ser equipado, mas continua ocupando o inventário e
    /// aparecendo em qualquer consulta que junte instância com definição.
    /// </summary>
    public static async Task RetireObsoleteEquipmentAsync(AppDb db)
    {
        var retired = await db.GameItemDefinitions
            .Where(x => EquipmentCatalog.RetiredCatalogKeys.Contains(x.CatalogKey))
            .ToListAsync();
        if (retired.Count == 0) return;
        var ids = retired.Select(x => x.Id).ToList();
        await db.GameItemInstances.Where(x => ids.Contains(x.DefinitionId)).ExecuteDeleteAsync();
        await db.StorePurchaseQuotas.Where(x => ids.Contains(x.DefinitionId)).ExecuteDeleteAsync();
        db.GameItemDefinitions.RemoveRange(retired);
        await db.SaveChangesAsync();
    }

    /// <summary>Salas por andar. O mapa `personal-wing` tem exatamente estes slots físicos.</summary>
    public const int RoomsPerFloor = 6;

    /// <summary>Andares de salas pessoais que sempre existem, mesmo com o prédio vazio.</summary>
    public const int MinimumFloors = 2;

    /// <summary>Tamanho da sala do slot, em tiles. Espelha `personal-wing.tmj`.</summary>
    private const int RoomWidth = 16;
    private const int RoomHeight = 16;

    /// <summary>Distância entre colunas de sala. Vizinhas dividem parede.</summary>
    private const int ColumnPitch = 15;

    /// <summary>
    /// Canto superior esquerdo da sala do slot, em tiles, na planta do andar.
    /// Espelha `wingBoundaries` de `tools/generate-tooq-campus.mjs`: três salas de cada lado
    /// do corredor, dividindo parede com a vizinha.
    /// </summary>
    public static (int X, int Y) FloorSlotOrigin(int slotIndex)
    {
        var column = slotIndex % 3;
        var lowerRow = slotIndex >= 3;
        return (2 + column * ColumnPitch, lowerRow ? 28 : 2);
    }

    /// <summary>
    /// Área útil da sala, em tiles: para dentro das paredes lateral, norte e sul.
    /// Mesmo recorte que `validateFurniturePlacement` usa no cliente.
    /// </summary>
    private static (double X, double Y, double Right, double Bottom) SlotInterior(int slotIndex)
    {
        var (x, y) = FloorSlotOrigin(slotIndex);
        return (x + 1, y + 2, x + RoomWidth - 1, y + RoomHeight - 2);
    }

    /// <summary>
    /// Sala de usuário que não existe mais continua ocupando slot na planta — e a mobília
    /// dela continua sendo desenhada por quem entra no andar. Some com as duas.
    /// </summary>
    public static async Task DropOrphanPersonalRoomsAsync(AppDb db)
    {
        var live = await db.Users.Select(x => x.Id).ToListAsync();
        var orphans = await db.PersonalRooms.Where(x => !live.Contains(x.UserId)).ToListAsync();
        if (orphans.Count == 0) return;
        var keys = orphans.Select(x => x.RoomKey).ToList();
        await db.FurniturePlacements.Where(x => keys.Contains(x.RoomId)).ExecuteDeleteAsync();
        db.PersonalRooms.RemoveRange(orphans);
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// Reacomoda salas que ficaram fora da planta quando o andar passou a ter seis slots.
    /// Preserva a ordem de chegada, então ninguém troca de sala com ninguém. Só mexe no
    /// slot: quem reancora a mobília é <see cref="RealignPersonalFurnitureAsync"/>.
    /// </summary>
    public static async Task RepackPersonalRoomsAsync(AppDb db)
    {
        var rooms = await db.PersonalRooms
            .OrderBy(x => x.WingIndex).ThenBy(x => x.SlotIndex).ThenBy(x => x.Id)
            .ToListAsync();
        // Buraco no meio do andar não é problema: o próximo usuário ocupa o slot vago.
        // Recompactar sem necessidade trocaria a sala (e os vizinhos) de todo mundo.
        if (rooms.All(x => x.SlotIndex < RoomsPerFloor)) return;
        for (var ordinal = 0; ordinal < rooms.Count; ordinal++)
        {
            rooms[ordinal].WingIndex = ordinal / RoomsPerFloor;
            rooms[ordinal].SlotIndex = ordinal % RoomsPerFloor;
        }
        await db.SaveChangesAsync();
    }

    /// <summary>
    /// A mobília do dono é coordenada ABSOLUTA do mapa, e a planta do andar já mudou de
    /// forma duas vezes (seis salas em fila viraram três de cada lado do corredor). Quem
    /// foi colocado sob a planta antiga ficou dentro da parede, no corredor ou fora do
    /// mapa — invisível e impossível de recolher, porque o editor só enxerga móvel dentro
    /// da sala.
    ///
    /// A reancoragem é idempotente e roda todo boot: mobília que já está na área útil não
    /// é tocada. Preferimos SEMPRE mover o conjunto inteiro junto, para o arranjo que a
    /// pessoa montou sobreviver à mudança de planta.
    /// </summary>
    public static async Task RealignPersonalFurnitureAsync(AppDb db)
    {
        foreach (var room in await db.PersonalRooms.ToListAsync())
        {
            var placements = await db.FurniturePlacements
                .Where(x => x.RoomId == room.RoomKey)
                .ToListAsync();
            if (placements.Count == 0) continue;
            foreach (var placement in placements)
                placement.SceneId = $"{room.SceneTemplate}@{room.WingIndex}";

            var interior = SlotInterior(room.SlotIndex);
            var (minX, maxX) = (placements.Min(p => p.X), placements.Max(p => p.X));
            var (minY, maxY) = (placements.Min(p => p.Y), placements.Max(p => p.Y));
            if (Fits(minX, maxX, interior.X, interior.Right)
                && Fits(minY, maxY, interior.Y, interior.Bottom)) continue;

            // Primeira tentativa: descobrir a origem sob a qual o conjunto foi colocado.
            // As origens possíveis formam uma grade (colunas de 15 em 15, duas fileiras),
            // então arredondar o canto do conjunto para baixo até a grade devolve a sala
            // antiga — e a translação preserva o arranjo exatamente como estava.
            var deltaX = interior.X - (LatticeColumn(minX) + 1);
            var deltaY = interior.Y - (LatticeRow(minY) + 2);
            if (!Fits(minX + deltaX, maxX + deltaX, interior.X, interior.Right)
                || !Fits(minY + deltaY, maxY + deltaY, interior.Y, interior.Bottom))
            {
                // Origem irreconhecível (planta de uma era ainda mais antiga): vale o menor
                // deslocamento que traga o conjunto inteiro para dentro.
                deltaX = Shift(minX, maxX, interior.X, interior.Right);
                deltaY = Shift(minY, maxY, interior.Y, interior.Bottom);
            }
            foreach (var placement in placements)
            {
                placement.X = Math.Clamp(placement.X + deltaX, interior.X, interior.Right);
                placement.Y = Math.Clamp(placement.Y + deltaY, interior.Y, interior.Bottom);
            }
        }
        await db.SaveChangesAsync();
    }

    private static bool Fits(double min, double max, double low, double high) =>
        min >= low && max <= high;

    /// <summary>Menor deslocamento que encaixa [min,max] em [low,high]. 0 se já cabe.</summary>
    private static double Shift(double min, double max, double low, double high) =>
        min < low ? low - min : max > high ? high - max : 0;

    private static double LatticeColumn(double x) =>
        2 + ColumnPitch * Math.Max(0, Math.Floor((x - 2) / ColumnPitch));

    private static double LatticeRow(double y) => y >= 28 ? 28 : 2;

    /// <summary>
    /// Provisionamento idempotente: cria a instância de sala e garante somente os itens iniciais.
    /// Nunca remove nem duplica itens adquiridos por usuários existentes.
    /// </summary>
    public static async Task<PersonalRoom> EnsureUserStockAsync(AppDb db, int userId)
    {
        var room = await db.PersonalRooms.SingleOrDefaultAsync(x => x.UserId == userId);
        var roomIsNew = room is null;
        if (room is null)
        {
            var occupied = await db.PersonalRooms
                .Select(x => new { x.WingIndex, x.SlotIndex })
                .ToListAsync();
            var taken = occupied.Select(x => (x.WingIndex, x.SlotIndex)).ToHashSet();
            var ordinal = 0;
            while (taken.Contains((ordinal / RoomsPerFloor, ordinal % RoomsPerFloor))) ordinal++;
            room = new PersonalRoom
            {
                UserId = userId,
                WingIndex = ordinal / RoomsPerFloor,
                SlotIndex = ordinal % RoomsPerFloor,
            };
            db.PersonalRooms.Add(room);
            await db.SaveChangesAsync();
        }

        var starterDefinitions = await db.GameItemDefinitions
            .Where(x => x.StarterQuantity > 0).ToListAsync();
        foreach (var definition in starterDefinitions)
        {
            var current = await db.GameItemInstances.CountAsync(x =>
                x.UserId == userId && x.DefinitionId == definition.Id);
            for (var index = current; index < definition.StarterQuantity; index++)
                db.GameItemInstances.Add(new GameItemInstance { UserId = userId, DefinitionId = definition.Id });
        }
        await db.SaveChangesAsync();

        // A sala nasce usável: mesa e kanban pertencem ao usuário e já estão colocados.
        //
        // Só na criação. Isto rodava a cada boot e recolocava a mobília inicial sempre
        // que a primeira instância do item estivesse sem placement — ou seja, DESFAZIA
        // "Recolher seus móveis" e devolvia a mesa guardada no baú para o meio da sala,
        // no login seguinte. Provisionar é um evento, não um estado a reconciliar.
        if (!roomIsNew) return room;
        var sceneId = $"{room.SceneTemplate}@{room.WingIndex}";
        var (roomX, roomY) = FloorSlotOrigin(room.SlotIndex);
        var placements = new Dictionary<string, (double X, double Y)>
        {
            ["of_258"] = (roomX + 7, roomY + 9),
            ["of_171"] = (roomX + 7.5, roomY + 3.5),
        };
        foreach (var (catalogKey, point) in placements)
        {
            var instance = await db.GameItemInstances
                .Join(db.GameItemDefinitions, i => i.DefinitionId, d => d.Id, (i, d) => new { i, d })
                .Where(row => row.i.UserId == userId && row.d.CatalogKey == catalogKey)
                .Select(row => row.i)
                .FirstOrDefaultAsync();
            if (instance is null || await db.FurniturePlacements.AnyAsync(x => x.ItemInstanceId == instance.Id)) continue;
            db.FurniturePlacements.Add(new FurniturePlacement
            {
                ItemInstanceId = instance.Id,
                UserId = userId,
                SceneId = sceneId,
                RoomId = room.RoomKey,
                X = point.X,
                Y = point.Y,
            });
            instance.Location = "placed";
        }
        await db.SaveChangesAsync();
        return room;
    }
}
