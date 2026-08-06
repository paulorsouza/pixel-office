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
        // O `Local` PRIMEIRO, e isto não é otimização: presença e equipe chamam este
        // método no mesmo tique, antes de qualquer SaveChanges. Um INSERT pendente é
        // invisível para a consulta, então a segunda chamada criaria uma SEGUNDA linha do
        // mesmo dia — e o índice único (UserId, PeriodDay) derrubaria o tique inteiro na
        // primeira virada de dia com alguém conectado.
        var row = db.PresenceDays.Local.FirstOrDefault(p => p.UserId == userId && p.PeriodDay == day)
            ?? await db.PresenceDays.FirstOrDefaultAsync(p => p.UserId == userId && p.PeriodDay == day);
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
        var entitled = Math.Min(cap, (int)Math.Floor(
            row.MinutesOnline * (GameOptions.PresenceGoldPerHour / 60.0) * multiplier));
        var gold = entitled - row.GoldAwarded;
        // Negativo acontece quando o jogador tira o equipamento no meio do dia: o teto
        // cai abaixo do que ele já recebeu. Não se estorna moeda paga — só se para.
        if (gold <= 0) return null;

        row.GoldAwarded += gold;
        return await Game.AwardAsync(db, user, new Reward(gold), "tempo online", "presence");
    }

    /// <summary>Como a pessoa está acompanhada neste minuto. Vazio = sozinha.</summary>
    public const string TeamworkPair = "pair";
    public const string TeamworkMeeting = "meeting";

    public static int TeamworkGoldPerHour(string kind) => kind switch
    {
        TeamworkPair => GameOptions.TeamworkPairGoldPerHour,
        TeamworkMeeting => GameOptions.TeamworkMeetingGoldPerHour,
        _ => 0,
    };

    /// <summary>
    /// Paga o tempo em que a pessoa esteve COM alguém, por cima da presença.
    ///
    /// O contador é de minutos, e a régua é a do minuto que está sendo pago: uma hora de
    /// reunião seguida de uma hora de pair vale 180 + 240, não 420 sobre o total. Por
    /// isso o gold entra direto no acumulado do dia em vez de sair de um `floor` sobre
    /// `TeamworkMinutes` — as duas atividades têm preços diferentes e o minuto já passou.
    ///
    /// O teto é próprio (não é o da presença): um dia inteiro de reunião não deve
    /// substituir o dia inteiro de trabalho, e um dia inteiro de trabalho não deve
    /// impedir que a reunião pague.
    /// </summary>
    public static async Task<CoinResult?> AccrueTeamworkAsync(
        AppDb db, User user, string kind, int minutes, DateTime nowUtc)
    {
        var perHour = TeamworkGoldPerHour(kind);
        if (minutes <= 0 || perHour <= 0) return null;

        var (row, _) = await EnsureDayAsync(db, user.Id, nowUtc);
        row.TeamworkMinutes += minutes;
        row.UpdatedUtc = nowUtc;

        // Só o bônus de EQUIPE do celular entra aqui — a passiva do mouse e do teclado
        // não. Como na presença, o bônus mexe na taxa e no teto: só na taxa, ele morreria
        // no teto do dia e o jogador nunca veria a diferença.
        var effects = await EquipmentState.EffectsForAsync(db, user.Id);
        var multiplier = 1 + Math.Max(0, effects.TeamworkCoinPercent) / 100.0;
        var room = (int)Math.Floor(GameOptions.TeamworkGoldDailyCap * multiplier) - row.TeamworkGoldAwarded;
        if (room <= 0) return null;
        // `Round` e não `Floor`: 180/h dá 3 moedas por minuto redondas, mas 180 × 1,05 do
        // celular Comum daria 3,15 — e truncar todo minuto jogaria o bônus inteiro fora.
        var gold = Math.Min(room, (int)Math.Round(minutes * perHour * multiplier / 60.0));
        if (gold <= 0) return null;

        row.TeamworkGoldAwarded += gold;
        var reason = kind == TeamworkPair ? "pair programming" : "reunião";
        return await Game.AwardAsync(db, user, new Reward(gold), reason, "teamwork");
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
        // Bots entram na conta de QUEM ACOMPANHA, mas não recebem: um bot parado ao lado
        // da sua mesa não é um par. Por isso a lista de companhia é filtrada aqui, e não
        // dentro do `TeamworkKindOf`.
        var players = Presence.Players.Values
            .Where(p => !p.IsBot && p.Client == ClientKind.World)
            .ToList();
        if (players.Count == 0) return;

        var now = DateTime.UtcNow;
        await using var db = await dbFactory.CreateDbContextAsync();
        foreach (var player in players.GroupBy(p => p.UserId).Select(g => g.First()))
        {
            var user = await db.Users.FindAsync(player.UserId);
            if (user is null) continue;

            var reward = await PresenceRewards.AccrueAsync(db, user, 1, now);
            var teamworkKind = Presence.TeamworkKindOf(player, players);
            var teamwork = teamworkKind is ""
                ? null
                : await PresenceRewards.AccrueTeamworkAsync(db, user, teamworkKind, 1, now);
            var completions = await ObjectiveEngine.RecalculateAsync(db, user.Id, now);
            // O baú de equipe é do DIA e sai de tempo acompanhado, não de moeda: quem
            // bateu o teto de gold continua andando para o baú.
            await Lootboxes.GrantTeamworkChestsAsync(db, user, now);
            await db.SaveChangesAsync();

            if (reward is not null || teamwork is not null) await Notify.TimeChangedAsync(hub, user.Id);
            await Notify.SendObjectivesAsync(hub, user.Id, completions);
            await AnnounceTeamworkAsync(player, teamworkKind);
        }
    }

    /// <summary>
    /// Avisa quando a companhia começa e quando acaba — uma vez cada, não a cada minuto.
    ///
    /// Sem isto o bônus seria invisível: ele pinga três ou quatro moedas por minuto no
    /// meio do trickle da presença, e ninguém descobre por que a moeda subiu mais rápido
    /// hoje. O jogo precisa DIZER que sentar junto vale mais.
    /// </summary>
    private async Task AnnounceTeamworkAsync(PlayerState player, string kind)
    {
        if (player.TeamworkKind == kind) return;
        var previous = player.TeamworkKind;
        player.TeamworkKind = kind;

        var message = kind switch
        {
            PresenceRewards.TeamworkPair =>
                $"Pair programming: +{GameOptions.TeamworkPairGoldPerHour} moedas/h enquanto estiverem lado a lado.",
            PresenceRewards.TeamworkMeeting =>
                $"Reunião com o time: +{GameOptions.TeamworkMeetingGoldPerHour} moedas/h enquanto durar.",
            // Só anuncia o fim de quem estava ganhando algo — sair de "" para "" não
            // acontece, mas sair de reunião para pair já foi anunciado pela linha de cima.
            _ when previous is not "" => "Bônus de equipe encerrado — você está trabalhando sozinho.",
            _ => null,
        };
        if (message is null) return;
        await hub.Clients.Clients(player.Key).SendAsync("Notify", new { message });
    }
}
