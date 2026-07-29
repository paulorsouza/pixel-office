using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public sealed record CardGameDeckRequest(string[] CardIds);
public sealed record CardGameReward(string CardId, string Name);
public sealed record CasinoRewardGrant(int Boosters, int BoosterBalance, CardGameReward[] Cards);

public static class CardGameEndpoints
{
    private const int InitialBoosters = 3;
    private const int CardsPerBooster = 5;

    public static void MapCardGameEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/cardgame/profile", Profile);
        api.MapPost("/cardgame/boosters/open", OpenBooster);
        api.MapPut("/cardgame/deck", SaveDeck);
    }

    private static async Task<IResult> Profile(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        if (await db.Users.FindAsync(userId) is null) return Results.NotFound(new { error = "Jogador não encontrado." });
        var profile = await EnsureProfileAsync(db, userId);
        return Results.Ok(await SnapshotAsync(db, profile));
    }

    private static async Task<IResult> SaveDeck(
        HttpRequest req,
        CardGameDeckRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!CardGameCatalog.TryValidateDeck(body.CardIds, out var deck, out var error))
            return Results.BadRequest(new { error });

        await using var db = await factory.CreateDbContextAsync();
        var owned = await db.CardGameCollection
            .Where(item => item.UserId == userId && item.Quantity > 0)
            .Select(item => item.CardId)
            .Distinct()
            .ToListAsync();
        if (deck.Any(id => !owned.Contains(id, StringComparer.Ordinal)))
            return Results.BadRequest(new { error = "Seu baralho contém uma carta que ainda não está no álbum." });

        var profile = await EnsureProfileAsync(db, userId);
        profile.DeckJson = JsonSerializer.Serialize(deck);
        await db.SaveChangesAsync();
        return Results.Ok(await SnapshotAsync(db, profile));
    }

    private static async Task<IResult> OpenBooster(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var profile = await EnsureProfileAsync(db, userId);
        if (profile.BoosterCount <= 0)
            return Results.BadRequest(new { error = "Você não tem boosters para abrir." });

        var ownedIds = await db.CardGameCollection
            .Where(item => item.UserId == userId && item.Quantity > 0)
            .Select(item => item.CardId)
            .Distinct()
            .ToListAsync();
        var boosterCatalog = CardGameCatalog.All.Values.Where(IsBoosterEligible).ToList();
        var availableNew = boosterCatalog.Where(card => !ownedIds.Contains(card.Id)).ToList();
        var pool = availableNew.Count >= CardsPerBooster
            ? availableNew
            : boosterCatalog;
        var opened = new List<object>(CardsPerBooster);

        for (var slot = 0; slot < CardsPerBooster; slot++)
        {
            // A última carta sempre é incomum ou melhor. Legendary/Special continuam
            // extremamente raras e o sorteio é autoritativo no servidor.
            var candidates = slot == CardsPerBooster - 1
                ? pool.Where(card => card.Rarity != "Common").ToList()
                : pool;
            if (candidates.Count == 0) candidates = pool;
            var card = WeightedPick(candidates);
            pool.RemoveAll(candidate => candidate.Id == card.Id);
            var shiny = RandomNumberGenerator.GetInt32(100_000) < ShinyChance(card.Rarity);

            var item = await db.CardGameCollection.SingleOrDefaultAsync(entry =>
                entry.UserId == userId && entry.CardId == card.Id && entry.IsShiny == shiny);
            if (item is null)
            {
                item = new CardGameCollectionItem
                {
                    UserId = userId,
                    CardId = card.Id,
                    IsShiny = shiny,
                };
                db.CardGameCollection.Add(item);
            }
            else item.Quantity++;

            opened.Add(new { cardId = card.Id, isShiny = shiny });
        }

        profile.BoosterCount--;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(new
        {
            cards = opened,
            profile = await SnapshotAsync(db, profile),
        });
    }

    public static async Task<bool> OwnsDeckAsync(AppDb db, int userId, IEnumerable<string> deck)
    {
        var ids = deck.Distinct(StringComparer.Ordinal).ToArray();
        var owned = await db.CardGameCollection
            .Where(item => item.UserId == userId && item.Quantity > 0 && ids.Contains(item.CardId))
            .Select(item => item.CardId)
            .Distinct()
            .CountAsync();
        return owned == ids.Length;
    }

    public static async Task<CasinoRewardGrant> GrantCasinoRewardsAsync(
        AppDb db,
        int userId,
        int boosters,
        params string[] cardIds)
    {
        var profile = await EnsureProfileAsync(db, userId);
        profile.BoosterCount = checked(profile.BoosterCount + Math.Max(0, boosters));
        var rewards = new List<CardGameReward>();
        foreach (var cardId in cardIds.Distinct(StringComparer.Ordinal))
        {
            if (!CardGameCatalog.All.TryGetValue(cardId, out var card))
                throw new InvalidOperationException($"Carta de prêmio desconhecida: {cardId}");
            var item = await db.CardGameCollection.SingleOrDefaultAsync(entry =>
                entry.UserId == userId && entry.CardId == cardId && !entry.IsShiny);
            if (item is null)
            {
                db.CardGameCollection.Add(new CardGameCollectionItem
                {
                    UserId = userId,
                    CardId = cardId,
                    IsShiny = false,
                });
            }
            else item.Quantity++;
            rewards.Add(new CardGameReward(card.Id, card.Name));
        }
        return new(Math.Max(0, boosters), profile.BoosterCount, rewards.ToArray());
    }

    private static async Task<CardGameProfile> EnsureProfileAsync(AppDb db, int userId)
    {
        var profile = await db.CardGameProfiles.SingleOrDefaultAsync(row => row.UserId == userId);
        if (profile is not null) return profile;
        profile = new CardGameProfile { UserId = userId, BoosterCount = InitialBoosters };
        db.CardGameProfiles.Add(profile);
        await db.SaveChangesAsync();
        return profile;
    }

    private static async Task<object> SnapshotAsync(AppDb db, CardGameProfile profile)
    {
        var collection = await db.CardGameCollection
            .Where(item => item.UserId == profile.UserId && item.Quantity > 0)
            .OrderBy(item => item.CardId)
            .ThenBy(item => item.IsShiny)
            .Select(item => new
            {
                cardId = item.CardId,
                isShiny = item.IsShiny,
                quantity = item.Quantity,
                firstAcquiredUtc = item.FirstAcquiredUtc,
            })
            .ToListAsync();
        string[] deck;
        try { deck = JsonSerializer.Deserialize<string[]>(profile.DeckJson) ?? []; }
        catch { deck = []; }
        return new
        {
            boosters = profile.BoosterCount,
            deck,
            collection,
            uniqueCards = collection.Select(item => item.cardId).Distinct().Count(),
            shinyCards = collection.Count(item => item.isShiny),
            baseTotal = 151,
        };
    }

    private static CardGameDefinition WeightedPick(IReadOnlyList<CardGameDefinition> cards)
    {
        var weights = cards.Select(card => RarityWeight(card.Rarity)).ToArray();
        var roll = RandomNumberGenerator.GetInt32(weights.Sum());
        for (var index = 0; index < cards.Count; index++)
        {
            if (roll < weights[index]) return cards[index];
            roll -= weights[index];
        }
        return cards[^1];
    }

    private static int RarityWeight(string rarity) => rarity switch
    {
        "Uncommon" => 2_500,
        "Rare" => 650,
        "Epic" => 90,
        "Legendary" => 8,
        "Special" => 1,
        _ => 6_500,
    };

    private static bool IsBoosterEligible(CardGameDefinition card) =>
        card.Variant is not ("casino-player" or "casino-king" or "casino-four" or "casino-five"
            or "jackpot" or "dealer");

    // Por booster completo: aproximadamente 1,25% antes de considerar os ajustes.
    private static int ShinyChance(string rarity) => rarity switch
    {
        "Legendary" or "Special" => 80,
        "Epic" => 120,
        _ => 250,
    };
}
