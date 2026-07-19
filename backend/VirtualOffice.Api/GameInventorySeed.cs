using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public static class GameInventorySeed
{
    private static readonly (string Key, string Name, string Category, string Interaction)[] Catalog =
    [
        ("of_258", "Mesa reta madeira", "desks", ""),
        ("of_294", "Mesa reta clara", "desks", ""),
        ("of_300", "Mesa em L madeira", "desks", ""),
        ("of_305", "Mesa em L cinza", "desks", ""),
        ("of_323", "Balcão de recepção", "desks", ""),
        ("of_225", "Estação compacta azul", "workstations", "workstation"),
        ("of_227", "Estação dupla azul", "workstations", "workstation"),
        ("of_229", "Estação compacta ciano", "workstations", "workstation"),
        ("of_231", "Estação dupla ciano", "workstations", "workstation"),
        ("of_233", "Estação compacta coral", "workstations", "workstation"),
        ("of_235", "Estação dupla coral", "workstations", "workstation"),
        ("of_317", "Computador azul", "workstations", "workstation"),
        ("of_318", "Computador violeta", "workstations", "workstation"),
        ("of_319", "Computador cinza", "workstations", "workstation"),
        ("of_320", "Bancada de café clara", "workstations", ""),
        ("of_321", "Bancada de café madeira", "workstations", ""),
        ("of_322", "Bancada de café laranja", "workstations", ""),
        ("of_196", "Poltrona azul", "seating", "seat"),
        ("of_197", "Poltrona violeta", "seating", "seat"),
        ("of_198", "Poltrona cinza", "seating", "seat"),
        ("of_199", "Poltrona amarela", "seating", "seat"),
        ("of_306", "Cadeira laranja lateral", "seating", "seat"),
        ("of_307", "Cadeira escura lateral", "seating", "seat"),
        ("of_315", "Cadeira clara frontal", "seating", "seat"),
        ("of_316", "Cadeira escura frontal", "seating", "seat"),
        ("of_173", "Bebedouro claro", "storage", ""),
        ("of_175", "Máquina de vendas", "storage", ""),
        ("of_176", "Armário servidor", "storage", "chest"),
        ("of_329", "Bebedouro azul", "storage", ""),
        ("of_98", "Planta grande", "decor", ""),
        ("of_99", "Planta baixa", "decor", ""),
        ("of_100", "Planta alta", "decor", ""),
        ("of_163", "Quadro pequeno", "decor", ""),
        ("of_164", "Quadro colorido", "decor", ""),
        ("of_170", "Quadro branco", "decor", ""),
        ("of_171", "Quadro de planejamento", "decor", "kanban"),
        ("of_172", "Quadro de métricas", "decor", ""),
    ];

    public static async Task EnsureSchemaAsync(AppDb db)
    {
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "GameItemDefinitions" (
              "Id" INTEGER NOT NULL CONSTRAINT "PK_GameItemDefinitions" PRIMARY KEY AUTOINCREMENT,
              "CatalogKey" TEXT NOT NULL, "Name" TEXT NOT NULL, "Category" TEXT NOT NULL,
              "IconPath" TEXT NOT NULL, "InteractionType" TEXT NOT NULL);
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
            """);
    }

    public static async Task RunAsync(AppDb db)
    {
        if (!await db.GameItemDefinitions.AnyAsync())
        {
            db.GameItemDefinitions.AddRange(Catalog.Select(item => new GameItemDefinition
            {
                CatalogKey = item.Key,
                Name = item.Name,
                Category = item.Category,
                IconPath = $"assets/furniture/office/{item.Key}.png",
                InteractionType = item.Interaction,
            }));
            await db.SaveChangesAsync();
        }

        var users = await db.Users.Where(x => !x.IsBot).Select(x => x.Id).ToListAsync();
        if (users.Count == 0) return;
        var definitions = await db.GameItemDefinitions.ToListAsync();
        foreach (var userId in users)
        {
            if (await db.GameItemInstances.AnyAsync(x => x.UserId == userId)) continue;
            // Estoque inicial finito para testar a economia; duas unidades por definição.
            foreach (var definition in definitions)
            {
                db.GameItemInstances.Add(new GameItemInstance { UserId = userId, DefinitionId = definition.Id });
                db.GameItemInstances.Add(new GameItemInstance { UserId = userId, DefinitionId = definition.Id });
            }
        }
        await db.SaveChangesAsync();
    }
}
