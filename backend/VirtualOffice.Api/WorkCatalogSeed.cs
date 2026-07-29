using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>
/// Catálogo curado de tipos de lançamento, objetivos e etiquetas.
/// Reconcilia (acrescenta o que falta e atualiza o que mudou) sem apagar nada:
/// o balanceamento pode ser ajustado aqui e vale no próximo boot.
/// </summary>
public static class WorkCatalogSeed
{
    private sealed record ActivityDef(
        string Key, string Name, string Icon, string Color,
        int XpPerHour, int GoldPerHour, int DefaultMinutes,
        bool RequiresWorkItem = false, int DailyTarget = 0, bool AllowsPair = false, bool CountsAsWork = true);

    // A ordem é a ordem dos botões de lançamento rápido.
    private static readonly ActivityDef[] Activities =
    [
        new("task", "Desenvolvimento", "💻", "#2f6bff", 60, 30, 360, RequiresWorkItem: true, DailyTarget: 360),
        new("pair", "Pair programming", "👥", "#7c5cff", 80, 45, 60, AllowsPair: true),
        new("estudo", "Estudo", "📚", "#16a34a", 90, 55, 30, DailyTarget: 30),
        new("reuniao", "Reunião", "📅", "#d98a00", 40, 20, 60),
        new("review", "Code review", "🔍", "#0891b2", 70, 40, 30, AllowsPair: true),
        new("suporte", "Suporte", "🎧", "#db2777", 60, 35, 60),
        new("planejamento", "Planejamento", "🗺️", "#65a30d", 50, 25, 60),
        new("outro", "Outro", "📌", "#8b929d", 30, 15, 30),
    ];

    private sealed record ObjectiveDef(
        string Key, string Name, string Description, string Icon,
        ObjectiveScope Scope, string Metric, int Target, int Xp, int Gold, string ActivityKey = "");

    private static readonly ObjectiveDef[] Goals =
    [
        // As "bem bestas" primeiro: dá para fechar só entrando e batendo o ponto.
        new("daily-login", "Deu as caras", "Entre no escritório hoje.", "👋",
            ObjectiveScope.Daily, "login", 1, 10, 20),
        new("daily-log", "Bateu o ponto", "Faça o primeiro lançamento do dia.", "✅",
            ObjectiveScope.Daily, "entries", 1, 10, 10),
        new("daily-journey", "Jornada completa", "Lance 6 horas de trabalho no dia.", "🕕",
            ObjectiveScope.Daily, "minutes", 360, 120, 60),
        new("daily-pair", "Dupla produtiva", "Uma hora de pair programming.", "👥",
            ObjectiveScope.Daily, "minutes", 60, 40, 30, "pair"),
        new("daily-study", "Meia hora de estudo", "30 minutos aprendendo algo novo.", "📚",
            ObjectiveScope.Daily, "minutes", 30, 30, 25, "estudo"),
        new("daily-review", "Revisor do dia", "30 minutos de code review.", "🔍",
            ObjectiveScope.Daily, "minutes", 30, 25, 20, "review"),

        new("weekly-logins", "Presença VIP", "Apareça no escritório em 5 dias.", "🗓️",
            ObjectiveScope.Weekly, "login_days", 5, 120, 150),
        new("weekly-hours", "Semana de 30 horas", "Some 30 horas de trabalho na semana.", "🏁",
            ObjectiveScope.Weekly, "minutes", 1800, 300, 220),
        new("weekly-days", "Cinco dias ativos", "Lance horas em 5 dias diferentes.", "🔥",
            ObjectiveScope.Weekly, "active_days", 5, 200, 150),
        new("weekly-tasks", "Três entregas", "Conclua 3 atividades no quadro.", "🚀",
            ObjectiveScope.Weekly, "tasks_done", 3, 150, 120),
        new("weekly-study", "Duas horas de estudo", "Acumule 2 horas de estudo na semana.", "🎓",
            ObjectiveScope.Weekly, "minutes", 120, 120, 90, "estudo"),
    ];

    private static readonly (string Name, string Color)[] Labels =
    [
        ("frontend", "#2f6bff"), ("backend", "#7c5cff"), ("infra", "#0891b2"),
        ("urgente", "#e0685f"), ("débito técnico", "#d98a00"), ("ux", "#db2777"),
    ];

    public static async Task RunAsync(AppDb db)
    {
        var activities = await db.ActivityTypes.ToDictionaryAsync(a => a.Key);
        for (var i = 0; i < Activities.Length; i++)
        {
            var def = Activities[i];
            if (!activities.TryGetValue(def.Key, out var row))
            {
                row = new ActivityType { Key = def.Key };
                db.ActivityTypes.Add(row);
            }
            row.Name = def.Name;
            row.Icon = def.Icon;
            row.Color = def.Color;
            row.XpPerHour = def.XpPerHour;
            row.GoldPerHour = def.GoldPerHour;
            row.RequiresWorkItem = def.RequiresWorkItem;
            row.DefaultMinutes = def.DefaultMinutes;
            row.DailyTargetMinutes = def.DailyTarget;
            row.CountsAsWork = def.CountsAsWork;
            row.AllowsPair = def.AllowsPair;
            row.SortOrder = i;
            row.IsActive = true;
        }

        var goals = await db.Objectives.ToDictionaryAsync(o => o.Key);
        for (var i = 0; i < Goals.Length; i++)
        {
            var def = Goals[i];
            if (!goals.TryGetValue(def.Key, out var row))
            {
                row = new Objective { Key = def.Key };
                db.Objectives.Add(row);
            }
            row.Name = def.Name;
            row.Description = def.Description;
            row.Icon = def.Icon;
            row.Scope = def.Scope;
            row.Metric = def.Metric;
            row.ActivityKey = def.ActivityKey;
            row.Target = def.Target;
            row.XpReward = def.Xp;
            row.GoldReward = def.Gold;
            row.SortOrder = i;
            row.IsActive = true;
        }

        var existingLabels = await db.Labels.Select(l => l.Name).ToListAsync();
        foreach (var (name, color) in Labels)
            if (!existingLabels.Contains(name))
                db.Labels.Add(new Label { Name = name, Color = color });

        await db.SaveChangesAsync();
    }
}
