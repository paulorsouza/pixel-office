using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public record DropResult(ItemDefinition Item, Rarity Rarity);
public record XpResult(int Amount, int TotalXp, int Level, bool LeveledUp, DropResult? Drop);

public record AchievementDef(string Id, string Name, string Icon, string Metric, int Target, string MedalName);

public static class Game
{
    public const int DailyXpCapFromTime = 480; // minutos que viram XP por dia

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

    /// <summary>Registra XP, atualiza nível e rola drop em level-up. Não chama SaveChanges.</summary>
    public static async Task<XpResult> AwardXpAsync(AppDb db, User user, int amount, string reason, bool dropOnLevelUp = true)
    {
        var levelBefore = LevelForXp(user.Xp);
        user.Xp += amount;
        db.XpEvents.Add(new XpEvent { UserId = user.Id, Amount = amount, Reason = reason, CreatedUtc = DateTime.UtcNow });
        var levelAfter = LevelForXp(user.Xp);
        DropResult? drop = null;
        if (levelAfter > levelBefore && dropOnLevelUp)
            drop = await RollDropAsync(db, user.Id);
        return new XpResult(amount, user.Xp, levelAfter, levelAfter > levelBefore, drop);
    }

    public static async Task<int> XpFromTimeMinutesAsync(AppDb db, int userId, int minutes)
    {
        // teto diário anti-farm: no máx. DailyXpCapFromTime de XP por tempo por dia
        var dayStart = DateTime.UtcNow.Date;
        var earnedToday = await db.XpEvents
            .Where(e => e.UserId == userId && e.CreatedUtc >= dayStart && e.Reason.StartsWith("tempo:"))
            .SumAsync(e => (int?)e.Amount) ?? 0;
        return Math.Clamp(DailyXpCapFromTime - earnedToday, 0, minutes);
    }
}
