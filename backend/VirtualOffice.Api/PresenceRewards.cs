using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>
/// Presença: registra que o usuário está online hoje e paga gold por tempo
/// conectado, até o teto diário. Alimenta os objetivos de login (existe linha
/// hoje? em quantos dias da semana?) e o trickle de moedas sem exigir trabalho.
/// Não chama SaveChanges — quem chama decide a transação.
/// </summary>
public static class PresenceRewards
{
    /// <summary>Garante a linha de presença do dia. Devolve (linha, novaHoje).</summary>
    public static async Task<(PresenceDay Row, bool IsNew)> EnsureDayAsync(
        AppDb db, int userId, DateTime nowUtc)
    {
        var day = Periods.DayStart(nowUtc);
        var row = await db.PresenceDays.FirstOrDefaultAsync(p => p.UserId == userId && p.PeriodDay == day);
        if (row is not null) return (row, false);
        row = new PresenceDay { UserId = userId, PeriodDay = day, FirstSeenUtc = nowUtc, UpdatedUtc = nowUtc };
        db.PresenceDays.Add(row);
        return (row, true);
    }

    /// <summary>
    /// Soma minutos online e paga o gold correspondente, respeitando o teto do dia.
    /// Devolve o XpResult quando pagou algo (para notificar), senão null.
    /// </summary>
    public static async Task<XpResult?> AccrueAsync(AppDb db, User user, int minutes, DateTime nowUtc)
    {
        if (minutes <= 0) return null;
        var (row, _) = await EnsureDayAsync(db, user.Id, nowUtc);
        row.MinutesOnline += minutes;
        row.UpdatedUtc = nowUtc;

        var remaining = Math.Max(0, GameOptions.PresenceGoldDailyCap - row.GoldAwarded);
        var gold = Math.Min(remaining, minutes * GameOptions.PresenceGoldPerMinute);
        if (gold <= 0) return null;

        row.GoldAwarded += gold;
        // XP zero: presença dá moeda, não progressão de nível — senão ficar de
        // janela aberta subiria de nível sem jogar.
        return await Game.AwardAsync(db, user, new Reward(0, gold), "tempo online", "presence", dropOnLevelUp: false);
    }
}

/// <summary>
/// Tiquetaqueia a presença de quem está no mundo: a cada minuto, soma um minuto
/// online e paga o gold (com teto), recalcula os objetivos de login e avisa os
/// clientes. Só o cliente "world" conta — o painel web aberto em paralelo não.
/// </summary>
public sealed class PresenceAccrualService(
    IDbContextFactory<AppDb> dbFactory,
    IHubContext<OfficeHub> hub,
    ILogger<PresenceAccrualService> log) : BackgroundService
{
    private static readonly TimeSpan Interval = TimeSpan.FromMinutes(1);

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        using var timer = new PeriodicTimer(Interval);
        while (await timer.WaitForNextTickAsync(stoppingToken))
        {
            try { await TickAsync(); }
            catch (Exception ex) { log.LogWarning(ex, "Falha ao acumular presença"); }
        }
    }

    private async Task TickAsync()
    {
        var userIds = Presence.Players.Values
            .Where(p => !p.IsBot && p.Client == ClientKind.World)
            .Select(p => p.UserId)
            .Distinct()
            .ToList();
        if (userIds.Count == 0) return;

        var now = DateTime.UtcNow;
        await using var db = await dbFactory.CreateDbContextAsync();
        foreach (var userId in userIds)
        {
            var user = await db.Users.FindAsync(userId);
            if (user is null) continue;

            var reward = await PresenceRewards.AccrueAsync(db, user, 1, now);
            var completions = await ObjectiveEngine.RecalculateAsync(db, userId, now);
            await db.SaveChangesAsync();

            if (reward is not null) await Notify.TimeChangedAsync(hub, userId);
            await Notify.SendObjectivesAsync(hub, userId, completions);
        }
    }
}
