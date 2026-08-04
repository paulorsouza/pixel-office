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
    /// Devolve o CoinResult quando pagou algo (para notificar), senão null.
    ///
    /// Mouse, teclado, celular e alguns veículos aumentam esse ganho. O bônus mexe na
    /// taxa E no teto: só na taxa ele seria invisível, porque 1 moeda/min × 1,1 = 1,1
    /// arredonda para 1, e o que passasse do arredondamento morreria no teto de 180
    /// em três horas. Ver docs/PLANO_EQUIPAMENTOS.md §4.1.
    /// </summary>
    public static async Task<CoinResult?> AccrueAsync(AppDb db, User user, int minutes, DateTime nowUtc)
    {
        if (minutes <= 0) return null;
        var (row, _) = await EnsureDayAsync(db, user.Id, nowUtc);
        row.MinutesOnline += minutes;
        row.UpdatedUtc = nowUtc;

        var effects = await EquipmentState.EffectsForAsync(db, user.Id);
        // O celular conta o tempo pelos MESMOS minutos da presença: ficar deslogado não
        // enche o baú. É o que separa "premiar estar no escritório" de "premiar o
        // relógio de parede".
        await Lootboxes.AccrueChestTimerAsync(db, user.Id, minutes, effects, nowUtc);

        var multiplier = 1 + Math.Max(0, effects.PassiveCoinPercent) / 100.0;
        var cap = (int)Math.Floor(GameOptions.PresenceGoldDailyCap * multiplier);

        // Pagamento por DIREITO ACUMULADO, não por incremento: `floor` sobre o total do
        // dia é o que faz a moeda quebrada do bônus fechar e ser paga, em vez de sumir
        // no arredondamento de cada minuto. Sem coluna nova — `MinutesOnline` e
        // `GoldAwarded` já contam a história inteira do dia.
        var entitled = Math.Min(cap, (int)Math.Floor(row.MinutesOnline * GameOptions.PresenceGoldPerMinute * multiplier));
        var gold = entitled - row.GoldAwarded;
        // Negativo acontece quando o jogador tira o equipamento no meio do dia: o teto
        // cai abaixo do que ele já recebeu. Não se estorna moeda paga — só se para.
        if (gold <= 0) return null;

        row.GoldAwarded += gold;
        return await Game.AwardAsync(db, user, new Reward(gold), "tempo online", "presence");
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
