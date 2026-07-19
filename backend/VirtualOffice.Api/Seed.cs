using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public static class Seed
{
    public static async Task RunAsync(AppDb db)
    {
        await db.Database.EnsureCreatedAsync();
        await GameInventorySeed.EnsureSchemaAsync(db);
        if (await db.Users.AnyAsync())
        {
            await GameInventorySeed.RunAsync(db);
            return;
        }

        var paulo = new User { Name = "Paulo", Role = "Tech Lead", Color = "#7c5cff", Xp = 2650 };
        var marina = new User { Name = "Marina", Role = "Dev Backend", Color = "#f472b6", Xp = 1900 };
        var diego = new User { Name = "Diego", Role = "Dev Frontend", Color = "#22d3ee", Xp = 1450 };
        var aline = new User { Name = "Aline", Role = "QA / Suporte", Color = "#f59e0b", Xp = 2100 };
        var nina = new User { Name = "Nina", Role = "Bot", Color = "#94a3b8", IsBot = true, Xp = 300 };
        var tico = new User { Name = "Tico", Role = "Bot", Color = "#84cc16", IsBot = true, Xp = 500 };
        var bento = new User { Name = "Bento", Role = "Bot", Color = "#fb7185", IsBot = true, Xp = 420 };
        db.Users.AddRange(paulo, marina, diego, aline, nina, tico, bento);

        var epicWeb = new Epic { Name = "Plataforma Web", Color = "#7c5cff" };
        var epicApp = new Epic { Name = "App Mobile", Color = "#2dd4a7" };
        var epicSup = new Epic { Name = "Suporte & Operação", Color = "#f59e0b" };
        db.Epics.AddRange(epicWeb, epicApp, epicSup);

        var today = DateTime.UtcNow.Date;
        var sprint12 = new Sprint { Name = "Sprint 12", StartUtc = today.AddDays(-7), EndUtc = today.AddDays(7), IsActive = true };
        var sprint13 = new Sprint { Name = "Sprint 13", StartUtc = today.AddDays(7), EndUtc = today.AddDays(21) };
        db.Sprints.AddRange(sprint12, sprint13);
        await db.SaveChangesAsync();

        WorkItem Wi(string code, string title, WorkItemType type, WorkItemStatus status, Epic epic, Sprint? sprint, User? assignee, double? est = null, string desc = "") => new()
        {
            Code = code, Title = title, Type = type, Status = status,
            EpicId = epic.Id, SprintId = sprint?.Id, AssigneeId = assignee?.Id,
            EstimateHours = est, Description = desc,
            CreatedUtc = today.AddDays(-Random.Shared.Next(3, 20)),
            DoneUtc = status == WorkItemStatus.Done ? today.AddDays(-Random.Shared.Next(0, 5)) : null,
        };

        var items = new[]
        {
            Wi("TSK-1", "Tela de login com SSO", WorkItemType.Task, WorkItemStatus.Done, epicWeb, sprint12, paulo, 8),
            Wi("TSK-2", "Dashboard de indicadores", WorkItemType.Task, WorkItemStatus.InProgress, epicWeb, sprint12, paulo, 16, "Cards de resumo + gráfico de horas por projeto."),
            Wi("TSK-3", "Exportação de relatórios em PDF", WorkItemType.Task, WorkItemStatus.Todo, epicWeb, sprint12, marina, 8),
            Wi("TSK-4", "Refatorar serviço de notificações", WorkItemType.Task, WorkItemStatus.Review, epicWeb, sprint12, marina, 12),
            Wi("TSK-5", "Onboarding do app", WorkItemType.Task, WorkItemStatus.InProgress, epicApp, sprint12, diego, 10),
            Wi("TSK-6", "Push notifications", WorkItemType.Task, WorkItemStatus.Todo, epicApp, sprint12, diego, 6),
            Wi("TSK-7", "Modo offline", WorkItemType.Task, WorkItemStatus.Backlog, epicApp, sprint13, null, 24),
            Wi("TSK-8", "Migrar CI para pipelines novas", WorkItemType.Task, WorkItemStatus.Todo, epicWeb, sprint12, paulo, 6),
            Wi("BUG-1", "Sessão expira antes do tempo", WorkItemType.Bug, WorkItemStatus.InProgress, epicWeb, sprint12, marina, 4, "Refresh token não renova quando a aba fica inativa."),
            Wi("BUG-2", "Crash ao abrir câmera no Android 14", WorkItemType.Bug, WorkItemStatus.Todo, epicApp, sprint12, diego, 4),
            Wi("BUG-3", "Gráfico quebra com mês sem dados", WorkItemType.Bug, WorkItemStatus.Done, epicWeb, sprint12, paulo, 2),
            Wi("ATD-1", "Cliente Acme: erro no import de planilha", WorkItemType.Atendimento, WorkItemStatus.InProgress, epicSup, sprint12, aline, 3),
            Wi("ATD-2", "Cliente Beta: dúvida de permissões", WorkItemType.Atendimento, WorkItemStatus.Done, epicSup, sprint12, aline, 1),
            Wi("ATD-3", "Cliente Gama: lentidão no relatório mensal", WorkItemType.Atendimento, WorkItemStatus.Todo, epicSup, sprint12, aline, 4),
        };
        db.WorkItems.AddRange(items);
        await db.SaveChangesAsync();

        // task ativa default por dev (a mesa já conta horas nela; trocável no kanban)
        paulo.ActiveWorkItemId = items[1].Id;   // TSK-2
        marina.ActiveWorkItemId = items[3].Id;  // TSK-4
        diego.ActiveWorkItemId = items[4].Id;   // TSK-5
        aline.ActiveWorkItemId = items[11].Id;  // ATD-1
        await db.SaveChangesAsync();

        // lançamentos de horas dos últimos 10 dias úteis
        var users = new[] { paulo, marina, diego, aline };
        var byUser = new Dictionary<int, WorkItem[]>
        {
            [paulo.Id] = [items[0], items[1], items[10]],
            [marina.Id] = [items[2], items[3], items[8]],
            [diego.Id] = [items[4], items[5], items[9]],
            [aline.Id] = [items[11], items[12], items[13]],
        };
        foreach (var u in users)
        {
            for (var d = 10; d >= 1; d--)
            {
                var day = today.AddDays(-d);
                if (day.DayOfWeek is DayOfWeek.Saturday or DayOfWeek.Sunday) continue;
                var cursor = day.AddHours(12); // 9h local aprox. (UTC-3)
                var blocks = Random.Shared.Next(2, 5);
                for (var b = 0; b < blocks; b++)
                {
                    var minutes = Random.Shared.Next(30, 150);
                    var isMeeting = Random.Shared.NextDouble() < 0.25;
                    var wi = byUser[u.Id][Random.Shared.Next(byUser[u.Id].Length)];
                    db.TimeEntries.Add(new TimeEntry
                    {
                        UserId = u.Id,
                        WorkItemId = isMeeting ? null : wi.Id,
                        Category = isMeeting ? "reuniao" : "task",
                        Note = isMeeting ? "Reunião de alinhamento" : "",
                        StartUtc = cursor,
                        EndUtc = cursor.AddMinutes(minutes),
                    });
                    cursor = cursor.AddMinutes(minutes + Random.Shared.Next(10, 40));
                }
            }
        }

        // catálogo de itens: skins ({"shirt","hair"}), mobílias e medalhas
        ItemDefinition Def(string name, ItemKind kind, Rarity rarity, string icon, string data = "") =>
            new() { Name = name, Kind = kind, Rarity = rarity, Icon = icon, Data = data };

        var defs = new[]
        {
            Def("Camisa Azul", ItemKind.Skin, Rarity.Common, "👕", """{"shirt":"#3b82f6","hair":"#4a3728"}"""),
            Def("Camisa Verde", ItemKind.Skin, Rarity.Common, "👕", """{"shirt":"#22c55e","hair":"#1f2937"}"""),
            Def("Moletom Cinza", ItemKind.Skin, Rarity.Common, "🧥", """{"shirt":"#6b7280","hair":"#111827"}"""),
            Def("Jaqueta Neon", ItemKind.Skin, Rarity.Rare, "🧥", """{"shirt":"#e11d90","hair":"#22d3ee"}"""),
            Def("Uniforme Retrô", ItemKind.Skin, Rarity.Rare, "👔", """{"shirt":"#b45309","hair":"#78350f"}"""),
            Def("Traje Pixel Dourado", ItemKind.Skin, Rarity.Epic, "✨", """{"shirt":"#f5c518","hair":"#fde68a"}"""),
            Def("Armadura Lendária", ItemKind.Skin, Rarity.Legendary, "🛡️", """{"shirt":"#ffd700","hair":"#f8fafc"}"""),
            Def("Cadeira Gamer", ItemKind.Furniture, Rarity.Common, "🪑"),
            Def("Computador Retrô", ItemKind.Furniture, Rarity.Common, "🖥️"),
            Def("Planta Zen", ItemKind.Furniture, Rarity.Common, "🪴"),
            Def("Estante de Livros", ItemKind.Furniture, Rarity.Common, "📚"),
            Def("Máquina de Café", ItemKind.Furniture, Rarity.Common, "☕"),
            Def("Sofá Confortável", ItemKind.Furniture, Rarity.Rare, "🛋️"),
            Def("Console Retrô", ItemKind.Furniture, Rarity.Rare, "🎮"),
            Def("Aquário", ItemKind.Furniture, Rarity.Rare, "🐟"),
            Def("Estátua Moai", ItemKind.Furniture, Rarity.Epic, "🗿"),
            Def("Troféu de Cristal", ItemKind.Furniture, Rarity.Epic, "🏆"),
            Def("Foguete Decorativo", ItemKind.Furniture, Rarity.Legendary, "🚀"),
            Def("Dragão de Pixel", ItemKind.Furniture, Rarity.Legendary, "🐉"),
        };
        // medalhas das conquistas (concedidas automaticamente ao completar)
        var medals = Game.Achievements
            .Select(a => Def(a.MedalName, ItemKind.Medal, Rarity.Epic, "🎖️"))
            .ToArray();
        db.ItemDefinitions.AddRange(defs);
        db.ItemDefinitions.AddRange(medals);
        await db.SaveChangesAsync();

        // inventário inicial do Paulo para o protótipo já nascer com sala decorável
        InventoryItem Inv(User u, ItemDefinition d, bool equipped = false) => new()
        {
            UserId = u.Id, ItemDefinitionId = d.Id, Equipped = equipped,
            AcquiredUtc = DateTime.UtcNow.AddDays(-Random.Shared.Next(1, 10)),
        };
        db.Inventory.AddRange(
            Inv(paulo, defs[0], equipped: true), Inv(paulo, defs[3]),
            Inv(paulo, defs[7]), Inv(paulo, defs[8]), Inv(paulo, defs[9]),
            Inv(paulo, defs[12]), Inv(paulo, defs[15]),
            Inv(marina, defs[1], equipped: true), Inv(marina, defs[10]),
            Inv(diego, defs[4], equipped: true), Inv(diego, defs[13]),
            Inv(aline, defs[5], equipped: true), Inv(aline, defs[16]));
        await db.SaveChangesAsync();

        // sala pessoal do Paulo já com alguns itens posicionados
        var pauloInv = await db.Inventory.Where(i => i.UserId == paulo.Id).ToListAsync();
        var place = new (int defIdx, int x, int y)[] { (7, 2, 2), (8, 3, 2), (9, 8, 1), (12, 5, 5), (15, 9, 6) };
        foreach (var (defIdx, x, y) in place)
        {
            db.RoomItems.Add(new RoomItem { UserId = paulo.Id, ItemDefinitionId = defs[defIdx].Id, X = x, Y = y });
        }
        await db.SaveChangesAsync();
        _ = pauloInv;
        await GameInventorySeed.RunAsync(db);
    }
}
