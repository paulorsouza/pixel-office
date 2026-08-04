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
        int GoldPerHour, int DefaultMinutes,
        bool RequiresWorkItem = false, int DailyTarget = 0, bool AllowsPair = false, bool CountsAsWork = true);

    // A ordem é a ordem dos botões de lançamento rápido.
    //
    // Gold/hora multiplicado por 5 junto com a presença (60 → 300/h): sem isso, uma hora
    // de trabalho renderia menos que cinco minutos de janela aberta, e o quadro e a
    // planilha de horas viravam enfeite. A escala RELATIVA entre atividades não mudou —
    // estudo continua pagando quase o dobro de desenvolvimento.
    private static readonly ActivityDef[] Activities =
    [
        new("task", "Desenvolvimento", "💻", "#2f6bff", 150, 360, RequiresWorkItem: true, DailyTarget: 360),
        new("pair", "Pair programming", "👥", "#7c5cff", 225, 60, AllowsPair: true),
        new("estudo", "Estudo", "📚", "#16a34a", 275, 30, DailyTarget: 30),
        new("reuniao", "Reunião", "📅", "#d98a00", 100, 60),
        new("review", "Code review", "🔍", "#0891b2", 200, 30, AllowsPair: true),
        new("suporte", "Suporte", "🎧", "#db2777", 175, 60),
        new("planejamento", "Planejamento", "🗺️", "#65a30d", 125, 60),
        new("outro", "Outro", "📌", "#8b929d", 75, 30),
    ];

    private sealed record ObjectiveDef(
        string Key, string Name, string Description, string Icon,
        ObjectiveScope Scope, string Metric, int Target, int Gold, string ActivityKey = "");

    // Recompensa em moeda BUFADA junto com a renda nova. Os valores antigos (20, 10,
    // 60...) foram calibrados quando a presença pagava 180/dia; ao lado de 2.700/dia
    // eles viraram troco, e um objetivo que paga troco deixa de ser objetivo.
    //
    // Alvo: os seis diários somam 1.200 (≈45% do teto de presença do dia) e os cinco
    // semanais somam 4.700. Fechar tudo continua valendo mais que só ficar online.
    private static readonly ObjectiveDef[] Goals =
    [
        // As "bem bestas" primeiro: dá para fechar só entrando e batendo o ponto.
        new("daily-login", "Deu as caras", "Entre no escritório hoje.", "👋",
            ObjectiveScope.Daily, "login", 1, 120),
        new("daily-log", "Bateu o ponto", "Faça o primeiro lançamento do dia.", "✅",
            ObjectiveScope.Daily, "entries", 1, 100),
        new("daily-journey", "Jornada completa", "Lance 6 horas de trabalho no dia.", "🕕",
            ObjectiveScope.Daily, "minutes", 360, 400),
        new("daily-pair", "Dupla produtiva", "Uma hora de pair programming.", "👥",
            ObjectiveScope.Daily, "minutes", 60, 200, "pair"),
        new("daily-study", "Meia hora de estudo", "30 minutos aprendendo algo novo.", "📚",
            ObjectiveScope.Daily, "minutes", 30, 200, "estudo"),
        new("daily-review", "Revisor do dia", "30 minutos de code review.", "🔍",
            ObjectiveScope.Daily, "minutes", 30, 180, "review"),

        new("weekly-logins", "Presença VIP", "Apareça no escritório em 5 dias.", "🗓️",
            ObjectiveScope.Weekly, "login_days", 5, 900),
        new("weekly-hours", "Semana de 30 horas", "Some 30 horas de trabalho na semana.", "🏁",
            ObjectiveScope.Weekly, "minutes", 1800, 1400),
        new("weekly-days", "Cinco dias ativos", "Lance horas em 5 dias diferentes.", "🔥",
            ObjectiveScope.Weekly, "active_days", 5, 900),
        new("weekly-tasks", "Três entregas", "Conclua 3 atividades no quadro.", "🚀",
            ObjectiveScope.Weekly, "tasks_done", 3, 800),
        new("weekly-study", "Duas horas de estudo", "Acumule 2 horas de estudo na semana.", "🎓",
            ObjectiveScope.Weekly, "minutes", 120, 700, "estudo"),
        new("weekly-card-master", "Mestre da semana",
            "Conclua os cinco objetivos semanais para receber um Booster Raro e um Baú Raro.", "🃏",
            ObjectiveScope.Weekly, "weekly_objectives", 5, 0),
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
