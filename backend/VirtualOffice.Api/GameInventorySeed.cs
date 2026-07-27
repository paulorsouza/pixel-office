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
        string Capabilities = "[]");

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

        new("equipment:skate", "Skate básico", "vehicles", ItemType: "vehicle", Price: 0,
            Purchasable: false, StarterQuantity: 1, Capabilities: """["movement"]"""),
        new("equipment:skate-neon", "Skate Neon", "vehicles", ItemType: "vehicle", Rarity: "rare",
            Price: 620, Capabilities: """["movement"]"""),
        new("equipment:roller-skates", "Patins", "vehicles", ItemType: "vehicle", Rarity: "uncommon",
            Price: 450, Capabilities: """["movement"]"""),
        new("equipment:roller-skates-pro", "Patins Pro", "vehicles", ItemType: "vehicle", Rarity: "rare",
            Price: 720, Capabilities: """["movement"]"""),
        new("equipment:electric-scooter", "Patinete elétrico", "vehicles", ItemType: "vehicle",
            Rarity: "rare", Price: 900, Capabilities: """["movement"]"""),
        new("equipment:electric-scooter-city", "Patinete City", "vehicles", ItemType: "vehicle",
            Rarity: "epic", Price: 1250, Capabilities: """["movement"]"""),
        new("equipment:motorcycle", "Moto", "vehicles", ItemType: "vehicle", Rarity: "epic",
            Price: 1800, Capabilities: """["movement"]"""),
        new("equipment:motorcycle-retro", "Moto Retrô", "vehicles", ItemType: "vehicle",
            Rarity: "epic", Price: 2100, Capabilities: """["movement"]"""),
        new("equipment:silver-chain", "Corrente de prata", "wearables", ItemType: "equipment",
            Rarity: "uncommon", Price: 260),
        new("equipment:gold-chain", "Corrente dourada", "wearables", ItemType: "equipment",
            Rarity: "epic", Price: 820),
        new("equipment:pixel-earrings", "Brincos Pixel", "wearables", ItemType: "equipment",
            Rarity: "rare", Price: 480),
        new("equipment:ruby-earrings", "Brincos Rubi", "wearables", ItemType: "equipment",
            Rarity: "epic", Price: 850),
        new("equipment:focus-bracelet", "Pulseira Foco", "wearables", ItemType: "equipment",
            Rarity: "uncommon", Price: 300),
        new("equipment:pulse-bracelet", "Pulseira Pulse", "wearables", ItemType: "equipment",
            Rarity: "rare", Price: 520),
        new("equipment:mechanical-keyboard", "Teclado mecânico", "peripherals", ItemType: "equipment",
            Rarity: "rare", Price: 600),
        new("equipment:compact-keyboard", "Teclado compacto", "peripherals", ItemType: "equipment",
            Rarity: "uncommon", Price: 340),
        new("equipment:precision-mouse", "Mouse Precision", "peripherals", ItemType: "equipment",
            Rarity: "uncommon", Price: 280),
        new("equipment:rgb-mouse", "Mouse RGB", "peripherals", ItemType: "equipment",
            Rarity: "epic", Price: 760),
    ];

    public static async Task EnsureSchemaAsync(AppDb db)
    {
        if (db.Database.ProviderName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) != true) return;
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "GameItemDefinitions" (
              "Id" INTEGER NOT NULL CONSTRAINT "PK_GameItemDefinitions" PRIMARY KEY AUTOINCREMENT,
              "CatalogKey" TEXT NOT NULL, "Name" TEXT NOT NULL, "Category" TEXT NOT NULL,
              "IconPath" TEXT NOT NULL, "InteractionType" TEXT NOT NULL,
              "ItemType" TEXT NOT NULL DEFAULT 'furniture', "Rarity" TEXT NOT NULL DEFAULT 'common',
              "Price" INTEGER NOT NULL DEFAULT 0, "IsPurchasable" INTEGER NOT NULL DEFAULT 0,
              "StarterQuantity" INTEGER NOT NULL DEFAULT 0, "CapabilitiesJson" TEXT NOT NULL DEFAULT '[]');
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GameItemDefinitions_CatalogKey" ON "GameItemDefinitions" ("CatalogKey");
            CREATE TABLE IF NOT EXISTS "GameItemInstances" (
              "Id" INTEGER NOT NULL CONSTRAINT "PK_GameItemInstances" PRIMARY KEY AUTOINCREMENT,
              "InstanceKey" TEXT NOT NULL, "UserId" INTEGER NOT NULL, "DefinitionId" INTEGER NOT NULL,
              "Location" TEXT NOT NULL, "ContainerPlacementId" INTEGER NULL,
              "AcquiredUtc" TEXT NOT NULL, "StateJson" TEXT NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GameItemInstances_InstanceKey" ON "GameItemInstances" ("InstanceKey");
            CREATE TABLE IF NOT EXISTS "FurniturePlacements" (
              "Id" INTEGER NOT NULL CONSTRAINT "PK_FurniturePlacements" PRIMARY KEY AUTOINCREMENT,
              "ItemInstanceId" INTEGER NOT NULL, "UserId" INTEGER NOT NULL,
              "SceneId" TEXT NOT NULL, "RoomId" TEXT NOT NULL,
              "X" REAL NOT NULL, "Y" REAL NOT NULL, "FlipX" INTEGER NOT NULL, "StateJson" TEXT NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_FurniturePlacements_ItemInstanceId" ON "FurniturePlacements" ("ItemInstanceId");
            CREATE INDEX IF NOT EXISTS "IX_FurniturePlacements_SceneId_RoomId" ON "FurniturePlacements" ("SceneId", "RoomId");
            CREATE TABLE IF NOT EXISTS "PersonalRooms" (
              "Id" INTEGER NOT NULL CONSTRAINT "PK_PersonalRooms" PRIMARY KEY AUTOINCREMENT,
              "UserId" INTEGER NOT NULL, "RoomKey" TEXT NOT NULL,
              "WingIndex" INTEGER NOT NULL, "SlotIndex" INTEGER NOT NULL,
              "SceneTemplate" TEXT NOT NULL,
              "CreatedUtc" TEXT NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PersonalRooms_UserId" ON "PersonalRooms" ("UserId");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PersonalRooms_RoomKey" ON "PersonalRooms" ("RoomKey");
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PersonalRooms_WingIndex_SlotIndex" ON "PersonalRooms" ("WingIndex", "SlotIndex");
            """);

        await AddColumnIfMissing(db, "Users", "Coins", "INTEGER NOT NULL DEFAULT 250");
        await AddColumnIfMissing(db, "GameItemDefinitions", "ItemType", "TEXT NOT NULL DEFAULT 'furniture'");
        await AddColumnIfMissing(db, "GameItemDefinitions", "Rarity", "TEXT NOT NULL DEFAULT 'common'");
        await AddColumnIfMissing(db, "GameItemDefinitions", "Price", "INTEGER NOT NULL DEFAULT 0");
        await AddColumnIfMissing(db, "GameItemDefinitions", "IsPurchasable", "INTEGER NOT NULL DEFAULT 0");
        await AddColumnIfMissing(db, "GameItemDefinitions", "StarterQuantity", "INTEGER NOT NULL DEFAULT 0");
        await AddColumnIfMissing(db, "GameItemDefinitions", "CapabilitiesJson", "TEXT NOT NULL DEFAULT '[]'");
        await AddColumnIfMissing(db, "PersonalRooms", "WingIndex", "INTEGER NOT NULL DEFAULT 0");
        await AddColumnIfMissing(db, "PersonalRooms", "SlotIndex", "INTEGER NOT NULL DEFAULT 0");
        await db.Database.ExecuteSqlRawAsync("""
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_PersonalRooms_WingIndex_SlotIndex"
            ON "PersonalRooms" ("WingIndex", "SlotIndex");
            """);
    }

    private static async Task AddColumnIfMissing(AppDb db, string table, string column, string sqlType)
    {
        var connection = db.Database.GetDbConnection();
        if (connection.State != System.Data.ConnectionState.Open) await connection.OpenAsync();
        await using var command = connection.CreateCommand();
        command.CommandText = $"PRAGMA table_info(\"{table}\")";
        await using var reader = await command.ExecuteReaderAsync();
        while (await reader.ReadAsync())
            if (string.Equals(reader.GetString(1), column, StringComparison.OrdinalIgnoreCase)) return;
        await reader.DisposeAsync();
        await db.Database.ExecuteSqlRawAsync($"ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {sqlType}");
    }

    public static async Task RunAsync(AppDb db)
    {
        var existing = await db.GameItemDefinitions.ToDictionaryAsync(d => d.CatalogKey);
        foreach (var item in Catalog)
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
            definition.StarterQuantity = item.StarterQuantity;
            definition.CapabilitiesJson = item.Capabilities;
        }
        await db.SaveChangesAsync();

        var users = await db.Users.Where(x => !x.IsBot).Select(x => x.Id).ToListAsync();
        foreach (var userId in users) await EnsureUserStockAsync(db, userId);
    }

    /// <summary>
    /// Provisionamento idempotente: cria a instância de sala e garante somente os itens iniciais.
    /// Nunca remove nem duplica itens adquiridos por usuários existentes.
    /// </summary>
    public static async Task<PersonalRoom> EnsureUserStockAsync(AppDb db, int userId)
    {
        var room = await db.PersonalRooms.SingleOrDefaultAsync(x => x.UserId == userId);
        if (room is null)
        {
            const int roomsPerWing = 12;
            var occupied = await db.PersonalRooms
                .Select(x => new { x.WingIndex, x.SlotIndex })
                .ToListAsync();
            var taken = occupied.Select(x => (x.WingIndex, x.SlotIndex)).ToHashSet();
            var ordinal = 0;
            while (taken.Contains((ordinal / roomsPerWing, ordinal % roomsPerWing))) ordinal++;
            room = new PersonalRoom
            {
                UserId = userId,
                WingIndex = ordinal / roomsPerWing,
                SlotIndex = ordinal % roomsPerWing,
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
        var sceneId = $"{room.SceneTemplate}@{room.WingIndex}";
        var column = room.SlotIndex % 6;
        var lowerRow = room.SlotIndex >= 6;
        // As salas compartilham paredes; a primeira começa no próprio perímetro da ala.
        var roomX = 2 + column * 15;
        var roomY = lowerRow ? 40 : 2;
        var placements = new Dictionary<string, (double X, double Y)>
        {
            ["of_258"] = (roomX + 7, roomY + 10),
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
