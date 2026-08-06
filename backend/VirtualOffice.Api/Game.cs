using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public record DropResult(ItemDefinition Item, Rarity Rarity);

/// <summary>
/// Resultado de um crédito de moeda. O XP saiu do jogo: ele não desbloqueava nada, e
/// carregar um segundo placar só para exibi-lo em oito telas custava mais do que valia.
/// O que sobrou é o que sempre importou — quanto entrou e quanto o jogador tem.
/// </summary>
public record CoinResult(int Gold, int Coins, DropResult? Drop);

public record AchievementDef(string Id, string Name, string Icon, string Metric, int Target, string MedalName);

/// <summary>Recompensa calculada para um lançamento, já com o teto diário aplicado.</summary>
public record Reward(int Gold)
{
    public static readonly Reward None = new(0);
    public bool IsEmpty => Gold <= 0;
}

/// <summary>
/// Parâmetros de economia que dependem do ambiente. O beta abre o jogo com muita
/// moeda de propósito (para todo mundo testar a loja), então isso é config, não código.
/// </summary>
public static class GameOptions
{
    /// <summary>Moedas de uma conta recém-criada.</summary>
    public static int StartingCoins { get; private set; } = 250;

    /// <summary>
    /// Bônus único concedido a todo usuário humano — inclusive os já existentes.
    /// 0 desliga. No beta vale 10000 (ver deploy/beta.env.example).
    /// </summary>
    public static int WelcomeGrantCoins { get; private set; }

    /// <summary>
    /// Identifica a rodada do bônus. Mudar a chave concede de novo; manter a chave
    /// garante que reiniciar o servidor não repita o crédito.
    /// </summary>
    public static string WelcomeGrantKey { get; private set; } = "beta-v1";

    /// <summary>
    /// Teto diário de gold vindo de lançamento de horas (anti-farm).
    ///
    /// Foram 400 por muito tempo, e a esse valor **uma hora e meia de estudo esgotava o
    /// dia inteiro** enquanto a presença pagava 2.700 — ficar com a janela aberta rendia
    /// quase 7× mais do que produzir. 6.000 devolve o teto ao papel de freio contra
    /// lançamento inventado, em vez de teto sobre quem trabalha de verdade: oito horas
    /// da atividade mais cara (estudo, 275/h) dão 2.200, bem abaixo dele.
    /// </summary>
    public static int DailyGoldCapFromTime { get; private set; } = 6_000;

    /// <summary>
    /// Gold por HORA só de estar online, e o teto diário desse ganho.
    ///
    /// Por hora, e não por minuto, porque a taxa por minuto obrigava o número a ser
    /// inteiro — 500/h não tinha como ser escrito. O pagamento é por direito acumulado
    /// (`floor` sobre o total do dia), então a fração fecha sozinha.
    ///
    /// 500/h com teto de 9 horas (4.500). Com o conjunto lendário completo o bônus
    /// dobra os dois: 1.000/h e 9.000/dia. Ver docs/ECONOMIA.md §2.2-b.
    /// </summary>
    public static int PresenceGoldPerHour { get; private set; } = 500;
    public static int PresenceGoldDailyCap { get; private set; } = 4_500;

    /// <summary>Horas de presença que o teto diário cobre. Só documenta o número acima.</summary>
    public const int PresenceCappedHours = 9;

    /// <summary>
    /// Gold por hora de TRABALHO EM EQUIPE, pago por cima da presença enquanto a pessoa
    /// está de fato com outra: em reunião com alguém, ou pareando ao lado de um colega.
    ///
    /// É fonte separada (`teamwork`), com teto próprio, e não passa pelo multiplicador de
    /// equipamento de propósito: o conjunto paga o tempo online, a equipe paga a
    /// companhia. Misturar os dois faria o jogador com o melhor mouse ganhar mais por
    /// participar da mesma reunião. Ver docs/ECONOMIA.md §2.5.
    /// </summary>
    public static int TeamworkMeetingGoldPerHour { get; private set; } = 180;
    public static int TeamworkPairGoldPerHour { get; private set; } = 240;
    public static int TeamworkGoldDailyCap { get; private set; } = 1_200;

    /// <summary>
    /// Fuso do time, usado para saber onde o dia começa. Sem isso a meta diária
    /// virava às 21h de Brasília e a jornada da noite caía no dia seguinte.
    /// </summary>
    public static int TimeZoneOffsetHours { get; private set; } = -3;

    public static void Configure(IConfiguration config)
    {
        var section = config.GetSection("Game");
        StartingCoins = section.GetValue("StartingCoins", StartingCoins);
        WelcomeGrantCoins = section.GetValue("WelcomeGrantCoins", WelcomeGrantCoins);
        WelcomeGrantKey = section.GetValue("WelcomeGrantKey", WelcomeGrantKey) ?? "beta-v1";
        DailyGoldCapFromTime = section.GetValue("DailyGoldCapFromTime", DailyGoldCapFromTime);
        PresenceGoldPerHour = section.GetValue("PresenceGoldPerHour", PresenceGoldPerHour);
        PresenceGoldDailyCap = section.GetValue("PresenceGoldDailyCap", PresenceGoldDailyCap);
        TeamworkMeetingGoldPerHour = section.GetValue("TeamworkMeetingGoldPerHour", TeamworkMeetingGoldPerHour);
        TeamworkPairGoldPerHour = section.GetValue("TeamworkPairGoldPerHour", TeamworkPairGoldPerHour);
        TeamworkGoldDailyCap = section.GetValue("TeamworkGoldDailyCap", TeamworkGoldDailyCap);
        TimeZoneOffsetHours = Math.Clamp(section.GetValue("TimeZoneOffsetHours", TimeZoneOffsetHours), -12, 14);
    }
}

public static class Game
{
    public static readonly AchievementDef[] Achievements =
    [
        new("first-hours", "Primeiras Horas", "⏱️", "minutes_total", 600, "Medalha: Primeiras Horas"),
        new("meeting-marathon", "Maratonista de Reuniões", "📅", "minutes_meeting", 6000, "Medalha: 100h de Reunião"),
        new("executor", "Executor", "✅", "tasks_done", 10, "Medalha: Executor"),
        new("firefighter", "Bombeiro", "🐛", "bugs_done", 5, "Medalha: Caçador de Bugs"),
        new("support-ninja", "Suporte Ninja", "🎧", "tickets_done", 5, "Medalha: Suporte Ninja"),
        new("veteran", "Veterano", "🌟", "level", 5, "Medalha: Veterano"),
    ];

    /// <summary>
    /// De quantas em quantas horas LANÇADAS cai um Baú Lendário.
    ///
    /// Este marco morava no nível, e o nível morreu junto com o XP. Passar para horas de
    /// trabalho não é só achar outro gancho: é o contrapeso da presença, que virou a
    /// maior fonte do jogo. O baú mais valioso continua saindo de produzir, não de
    /// deixar a janela aberta.
    ///
    /// Caiu de 40 para 25 horas: a 40, um dev de seis horas por dia via um Lendário a
    /// cada sete semanas de trabalho — tempo demais entre dois prêmios para o marco ser
    /// sentido como marco. A 25, é mensal.
    /// </summary>
    public const int ChestWorkHourMilestone = 25;

    public static Rarity RollRarity()
    {
        var r = Random.Shared.NextDouble();
        return r switch
        {
            < 0.03 => Rarity.Legendary,
            < 0.15 => Rarity.Epic,
            < 0.40 => Rarity.Rare,
            _ => Rarity.Common,
        };
    }

    public static async Task<DropResult?> RollDropAsync(AppDb db, int userId)
    {
        var rarity = RollRarity();
        // só dropa skins e mobília; medalhas vêm de conquistas
        var pool = await db.ItemDefinitions
            .Where(i => i.Rarity == rarity && i.Kind != ItemKind.Medal)
            .ToListAsync();
        if (pool.Count == 0) return null;
        var item = pool[Random.Shared.Next(pool.Count)];
        db.Inventory.Add(new InventoryItem
        {
            UserId = userId,
            ItemDefinitionId = item.Id,
            AcquiredUtc = DateTime.UtcNow,
        });
        return new DropResult(item, rarity);
    }

    /// <summary>Credita moeda e registra a linha no livro-caixa. Não chama SaveChanges.</summary>
    public static Task<CoinResult> AwardAsync(
        AppDb db, User user, Reward reward, string reason, string source)
    {
        user.Coins += reward.Gold;
        db.CoinEvents.Add(new CoinEvent
        {
            UserId = user.Id, Gold = reward.Gold,
            Reason = reason, Source = source, CreatedUtc = DateTime.UtcNow,
        });
        return Task.FromResult(new CoinResult(reward.Gold, user.Coins, null));
    }

    /// <summary>Recompensa bruta de um lançamento, proporcional aos minutos.</summary>
    public static Reward RewardFor(ActivityType activity, int minutes) =>
        new((int)Math.Round(activity.GoldPerHour * minutes / 60.0));

    /// <summary>
    /// Baú Lendário a cada <see cref="ChestWorkHourMilestone"/> horas lançadas na vida.
    /// Idempotente pela chave da faixa, então recalcular não duplica prêmio.
    /// </summary>
    public static async Task AwardWorkHourChestsAsync(AppDb db, User user)
    {
        var entries = await db.TimeEntries
            .Where(e => e.UserId == user.Id && e.EndUtc != null)
            .Select(e => new { e.StartUtc, End = e.EndUtc!.Value })
            .ToListAsync();
        var minutes = entries.Sum(e => (e.End - e.StartUtc).TotalMinutes);
        var reached = (int)(minutes / (ChestWorkHourMilestone * 60));
        for (var milestone = 1; milestone <= reached; milestone++)
        {
            await Lootboxes.GrantOnceAsync(
                db, user, LootboxCatalog.Legendary,
                $"work-hours:{milestone * ChestWorkHourMilestone}");
        }
    }

    /// <summary>
    /// Aplica o teto diário: o que passa do teto simplesmente não é creditado.
    /// Lançar o dia inteiro de uma vez rende o mesmo que lançar aos poucos.
    /// </summary>
    public static async Task<Reward> CapDailyAsync(AppDb db, int userId, Reward reward, DateTime dayUtc)
    {
        var (dayStart, dayEnd) = Periods.DayRange(dayUtc);
        var earned = await db.CoinEvents
            .Where(e => e.UserId == userId && e.Source == "time"
                && e.CreatedUtc >= dayStart && e.CreatedUtc < dayEnd)
            .SumAsync(e => (int?)e.Gold) ?? 0;
        return new Reward(Math.Clamp(GameOptions.DailyGoldCapFromTime - earned, 0, reward.Gold));
    }

    /// <summary>Bônus de boas-vindas idempotente (o beta abre com 10 mil moedas).</summary>
    public static async Task<bool> EnsureWelcomeGrantAsync(AppDb db, User user)
    {
        if (GameOptions.WelcomeGrantCoins <= 0) return false;
        var reason = $"welcome:{GameOptions.WelcomeGrantKey}";
        if (await db.CoinEvents.AnyAsync(e => e.UserId == user.Id && e.Source == "grant" && e.Reason == reason))
            return false;
        await AwardAsync(db, user, new Reward(GameOptions.WelcomeGrantCoins), reason, "grant");
        return true;
    }
}
