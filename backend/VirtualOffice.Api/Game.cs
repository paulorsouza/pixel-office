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

    /// <summary>Teto diário de gold vindo de lançamento de horas (anti-farm).</summary>
    public static int DailyGoldCapFromTime { get; private set; } = 400;

    /// <summary>
    /// Gold por minuto só de estar online, e o teto diário desse ganho.
    ///
    /// 5/min = **300 moedas por hora**, com teto de 9 horas por dia (2.700). Com o
    /// conjunto lendário completo o bônus dobra os dois: 600/h e 5.400/dia.
    /// Ver docs/ECONOMIA.md §2.2-b.
    /// </summary>
    public static int PresenceGoldPerMinute { get; private set; } = 5;
    public static int PresenceGoldDailyCap { get; private set; } = 2_700;

    /// <summary>Horas de presença que o teto diário cobre. Só documenta o número acima.</summary>
    public const int PresenceCappedHours = 9;

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
        PresenceGoldPerMinute = section.GetValue("PresenceGoldPerMinute", PresenceGoldPerMinute);
        PresenceGoldDailyCap = section.GetValue("PresenceGoldDailyCap", PresenceGoldDailyCap);
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
    /// </summary>
    public const int ChestWorkHourMilestone = 40;

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
