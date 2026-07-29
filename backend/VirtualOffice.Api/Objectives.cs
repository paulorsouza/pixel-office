using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>
/// Fronteiras de dia e semana no fuso do time, sempre devolvidas em UTC
/// (o Postgres guarda timestamptz; qualquer DateTime gravado precisa ser Utc).
/// </summary>
public static class Periods
{
    public static DateTime Utc(DateTime value) => value.Kind switch
    {
        DateTimeKind.Utc => value,
        DateTimeKind.Local => value.ToUniversalTime(),
        _ => DateTime.SpecifyKind(value, DateTimeKind.Utc),
    };

    private static DateTime ToLocal(DateTime utc) => Utc(utc).AddHours(GameOptions.TimeZoneOffsetHours);
    private static DateTime ToUtc(DateTime local) =>
        DateTime.SpecifyKind(local.AddHours(-GameOptions.TimeZoneOffsetHours), DateTimeKind.Utc);

    /// <summary>Início do dia local que contém <paramref name="utc"/>, em UTC.</summary>
    public static DateTime DayStart(DateTime utc) => ToUtc(ToLocal(utc).Date);

    public static (DateTime Start, DateTime End) DayRange(DateTime utc)
    {
        var start = DayStart(utc);
        return (start, start.AddDays(1));
    }

    /// <summary>Início da semana (segunda-feira local) que contém <paramref name="utc"/>, em UTC.</summary>
    public static DateTime WeekStart(DateTime utc)
    {
        var local = ToLocal(utc).Date;
        return ToUtc(local.AddDays(-(((int)local.DayOfWeek + 6) % 7)));
    }

    public static (DateTime Start, DateTime End) WeekRange(DateTime utc)
    {
        var start = WeekStart(utc);
        return (start, start.AddDays(7));
    }

    public static DateTime PeriodStart(ObjectiveScope scope, DateTime utc) =>
        scope == ObjectiveScope.Weekly ? WeekStart(utc) : DayStart(utc);

    public static (DateTime Start, DateTime End) Range(ObjectiveScope scope, DateTime utc) =>
        scope == ObjectiveScope.Weekly ? WeekRange(utc) : DayRange(utc);

    /// <summary>Dia local (para agrupar lançamentos por data no relatório).</summary>
    public static DateOnly LocalDate(DateTime utc) => DateOnly.FromDateTime(ToLocal(utc));
}

public record ObjectiveCompletion(Objective Objective, XpResult Reward);

/// <summary>
/// Motor de objetivos. O progresso é sempre <b>recalculado a partir dos lançamentos</b>,
/// nunca incrementado — assim apagar ou corrigir um lançamento ajusta a meta sozinho,
/// e a concessão da recompensa continua idempotente pela linha (usuário, objetivo, período).
/// </summary>
public static class ObjectiveEngine
{
    /// <summary>
    /// Recalcula todos os objetivos ativos do usuário no momento indicado e concede
    /// o que tiver acabado de completar. Não chama SaveChanges.
    /// </summary>
    public static async Task<List<ObjectiveCompletion>> RecalculateAsync(
        AppDb db, int userId, DateTime? atUtc = null)
    {
        var now = Periods.Utc(atUtc ?? DateTime.UtcNow);
        var objectives = await db.Objectives.Where(o => o.IsActive).OrderBy(o => o.SortOrder).ToListAsync();
        if (objectives.Count == 0) return [];

        var user = await db.Users.FindAsync(userId);
        if (user is null) return [];

        var workActivities = await db.ActivityTypes.Where(a => a.CountsAsWork).Select(a => a.Key).ToListAsync();
        var completions = new List<ObjectiveCompletion>();

        foreach (var scope in new[] { ObjectiveScope.Daily, ObjectiveScope.Weekly })
        {
            var scoped = objectives.Where(o => o.Scope == scope).ToList();
            if (scoped.Count == 0) continue;

            var (start, end) = Periods.Range(scope, now);
            var periodStart = start;

            var entries = await db.TimeEntries
                .Where(e => e.UserId == userId && e.EndUtc != null && e.StartUtc >= start && e.StartUtc < end)
                .Select(e => new { e.Category, e.StartUtc, EndUtc = e.EndUtc!.Value })
                .ToListAsync();
            var tasksDone = await db.WorkItems
                .CountAsync(w => w.AssigneeId == userId && w.DoneUtc != null && w.DoneUtc >= start && w.DoneUtc < end);
            // Dias de presença no período: alimentam os objetivos de login. É um
            // COUNT no banco (não a lista) porque só precisamos de quantos são.
            var loginDays = await db.PresenceDays
                .CountAsync(p => p.UserId == userId && p.PeriodDay >= start && p.PeriodDay < end);

            var existing = await db.ObjectiveProgress
                .Where(p => p.UserId == userId && p.PeriodStart == periodStart)
                .ToListAsync();

            foreach (var objective in scoped)
            {
                var value = objective.Metric switch
                {
                    "minutes" => (int)Math.Round(entries
                        .Where(e => objective.ActivityKey.Length > 0
                            ? e.Category == objective.ActivityKey
                            : workActivities.Contains(e.Category))
                        .Sum(e => (e.EndUtc - e.StartUtc).TotalMinutes)),
                    "entries" => entries.Count(e => objective.ActivityKey.Length == 0 || e.Category == objective.ActivityKey),
                    "tasks_done" => tasksDone,
                    "active_days" => entries
                        .Select(e => Periods.LocalDate(e.StartUtc)).Distinct().Count(),
                    // login: 1 se apareceu hoje (a linha do dia já existe); login_days:
                    // em quantos dias da semana apareceu. Ambos vêm da presença.
                    "login" => loginDays > 0 ? 1 : 0,
                    "login_days" => loginDays,
                    _ => 0,
                };

                var progress = existing.FirstOrDefault(p => p.ObjectiveId == objective.Id);
                if (progress is null)
                {
                    if (value <= 0) continue; // não cria linha só para registrar zero
                    progress = new ObjectiveProgress
                    {
                        UserId = userId, ObjectiveId = objective.Id, PeriodStart = periodStart,
                    };
                    db.ObjectiveProgress.Add(progress);
                }
                progress.Value = value;
                progress.UpdatedUtc = DateTime.UtcNow;

                if (progress.CompletedUtc is null && value >= objective.Target && objective.Target > 0)
                {
                    progress.CompletedUtc = DateTime.UtcNow;
                    var reward = await Game.AwardAsync(
                        db, user, new Reward(objective.XpReward, objective.GoldReward),
                        $"objetivo: {objective.Name}", "objective");
                    completions.Add(new ObjectiveCompletion(objective, reward));
                }
            }
        }

        return completions;
    }

    /// <summary>Objetivos do usuário com o progresso do período corrente, prontos para a UI.</summary>
    public static async Task<object> SnapshotAsync(AppDb db, int userId, DateTime? atUtc = null)
    {
        var now = Periods.Utc(atUtc ?? DateTime.UtcNow);
        var objectives = await db.Objectives.Where(o => o.IsActive)
            .OrderBy(o => o.Scope).ThenBy(o => o.SortOrder).ToListAsync();
        var dayStart = Periods.DayStart(now);
        var weekStart = Periods.WeekStart(now);
        var progress = await db.ObjectiveProgress
            .Where(p => p.UserId == userId && (p.PeriodStart == dayStart || p.PeriodStart == weekStart))
            .ToListAsync();

        return new
        {
            periodDay = dayStart,
            periodWeek = weekStart,
            objectives = objectives.Select(o =>
            {
                var start = o.Scope == ObjectiveScope.Weekly ? weekStart : dayStart;
                var p = progress.FirstOrDefault(x => x.ObjectiveId == o.Id && x.PeriodStart == start);
                return new
                {
                    o.Id, o.Key, o.Name, o.Description, o.Icon, o.Scope, o.Metric,
                    o.ActivityKey, o.Target, o.XpReward, o.GoldReward,
                    value = p?.Value ?? 0,
                    done = p?.CompletedUtc != null,
                    completedUtc = p?.CompletedUtc,
                };
            }),
        };
    }
}
