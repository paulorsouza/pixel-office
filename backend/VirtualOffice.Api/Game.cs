using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public record DropResult(ItemDefinition Item, Rarity Rarity);
public record XpResult(int Amount, int Gold, int TotalXp, int Coins, int Level, bool LeveledUp, DropResult? Drop);

public record AchievementDef(string Id, string Name, string Icon, string Metric, int Target, string MedalName);

/// <summary>Recompensa calculada para um lançamento, já com o teto diário aplicado.</summary>
public record Reward(int Xp, int Gold)
{
    public static readonly Reward None = new(0, 0);
    public bool IsEmpty => Xp <= 0 && Gold <= 0;
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

    /// <summary>Teto diário de XP e gold vindos de lançamento de horas (anti-farm).</summary>
    public static int DailyXpCapFromTime { get; private set; } = 600;
    public static int DailyGoldCapFromTime { get; private set; } = 400;

    /// <summary>
    /// Gold por minuto só de estar online (sem precisar lançar atividade), e o teto
    /// diário desse ganho. O trickle é de propósito menor que o do trabalho: ficar
    /// logado rende, mas não substitui produzir. 1/min com teto 180 ≈ 3 h por dia.
    /// </summary>
    public static int PresenceGoldPerMinute { get; private set; } = 1;
    public static int PresenceGoldDailyCap { get; private set; } = 180;

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
        DailyXpCapFromTime = section.GetValue("DailyXpCapFromTime", DailyXpCapFromTime);
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

    // XP acumulado necessário para estar no nível `level` (nível 1 = 0)
    public static int CumulativeXpForLevel(int level) =>
        level <= 1 ? 0 : (int)(200 * Math.Pow(level - 1, 1.5));

    public static int LevelForXp(int xp)
    {
        var level = 1;
        while (xp >= CumulativeXpForLevel(level + 1)) level++;
        return level;
    }

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

    /// <summary>Registra XP+gold, atualiza nível e rola drop em level-up. Não chama SaveChanges.</summary>
    public static async Task<XpResult> AwardAsync(
        AppDb db, User user, Reward reward, string reason, string source, bool dropOnLevelUp = true)
    {
        var levelBefore = LevelForXp(user.Xp);
        user.Xp += reward.Xp;
        user.Coins += reward.Gold;
        db.XpEvents.Add(new XpEvent
        {
            UserId = user.Id, Amount = reward.Xp, Gold = reward.Gold,
            Reason = reason, Source = source, CreatedUtc = DateTime.UtcNow,
        });
        var levelAfter = LevelForXp(user.Xp);
        DropResult? drop = null;
        if (levelAfter > levelBefore && dropOnLevelUp)
            drop = await RollDropAsync(db, user.Id);
        return new XpResult(reward.Xp, reward.Gold, user.Xp, user.Coins, levelAfter, levelAfter > levelBefore, drop);
    }

    /// <summary>Recompensa bruta de um lançamento, proporcional aos minutos.</summary>
    public static Reward RewardFor(ActivityType activity, int minutes) => new(
        (int)Math.Round(activity.XpPerHour * minutes / 60.0),
        (int)Math.Round(activity.GoldPerHour * minutes / 60.0));

    /// <summary>
    /// Aplica o teto diário: o que passa do teto simplesmente não é creditado.
    /// Lançar o dia inteiro de uma vez rende o mesmo que lançar aos poucos.
    /// </summary>
    public static async Task<Reward> CapDailyAsync(AppDb db, int userId, Reward reward, DateTime dayUtc)
    {
        var (dayStart, dayEnd) = Periods.DayRange(dayUtc);
        var earned = await db.XpEvents
            .Where(e => e.UserId == userId && e.Source == "time"
                && e.CreatedUtc >= dayStart && e.CreatedUtc < dayEnd)
            .GroupBy(e => 1)
            .Select(g => new { Xp = g.Sum(e => e.Amount), Gold = g.Sum(e => e.Gold) })
            .FirstOrDefaultAsync();
        return new Reward(
            Math.Clamp(GameOptions.DailyXpCapFromTime - (earned?.Xp ?? 0), 0, reward.Xp),
            Math.Clamp(GameOptions.DailyGoldCapFromTime - (earned?.Gold ?? 0), 0, reward.Gold));
    }

    /// <summary>Bônus de boas-vindas idempotente (o beta abre com 10 mil moedas).</summary>
    public static async Task<bool> EnsureWelcomeGrantAsync(AppDb db, User user)
    {
        if (GameOptions.WelcomeGrantCoins <= 0) return false;
        var reason = $"welcome:{GameOptions.WelcomeGrantKey}";
        if (await db.XpEvents.AnyAsync(e => e.UserId == user.Id && e.Source == "grant" && e.Reason == reason))
            return false;
        await AwardAsync(db, user, new Reward(0, GameOptions.WelcomeGrantCoins), reason, "grant", dropOnLevelUp: false);
        return true;
    }
}
