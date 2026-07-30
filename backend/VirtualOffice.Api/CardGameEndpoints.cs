using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public sealed record CardGameDeckRequest(string[] CardIds);
public sealed record CardGameOpenBoosterRequest(string BoosterId, string? TargetCardId);
public sealed record CardGameExchangeRequest(string CardId);
public sealed record CardGameEvolutionExchangeRequest(string CardId, string EvolutionCardId);
public sealed record CardGameReward(string CardId, string Name);
public sealed record CasinoRewardGrant(int Boosters, int BoosterBalance, CardGameReward[] Cards);

public sealed record CardGameBoosterDefinition(
    string Id,
    string Name,
    string Description,
    int? Generation,
    int ShinyChancePerHundredThousand,
    bool IsSpecial = false);

public readonly record struct CardGameCardRef(string CardId, string ShinyBonusSide)
{
    public bool IsShiny => !string.IsNullOrEmpty(ShinyBonusSide);
    public string Token => IsShiny ? $"{CardId}~{ShinyBonusSide}" : CardId;
}

public static class CardGameEndpoints
{
    private const int InitialBoosters = 3;
    private const int CardsPerBooster = 5;
    private const int SpecialExchangeCost = 10;
    private const int EvolutionExchangeCost = 5;
    private const int RareExchangeCost = 50;
    private const int RareExchangeMinSpecies = 10;
    private const int SpecialTargetShinyChance = 10_000; // 10%
    private const int SpecialOtherShinyChance = 50; // 0,05% por carta
    private static readonly string[] Sides = ["top", "right", "bottom", "left"];

    private static readonly CardGameBoosterDefinition[] BoosterDefinitions =
    [
        new("standard", "Booster Nacional", "Cinco cartas de todas as gerações.", null, 250),
        new("generation-1", "Edição Kanto", "Pokémon da Geração I.", 1, 250),
        new("generation-2", "Edição Johto", "Pokémon da Geração II.", 2, 250),
        new("generation-3", "Edição Hoenn", "Pokémon da Geração III.", 3, 250),
        new("generation-4", "Edição Sinnoh", "Pokémon da Geração IV.", 4, 250),
        new("generation-5", "Edição Unova", "Pokémon da Geração V.", 5, 250),
        new("generation-6", "Edição Kalos", "Pokémon da Geração VI.", 6, 250),
        new("generation-7", "Edição Alola", "Pokémon da Geração VII.", 7, 250),
        new("generation-8", "Edição Galar/Hisui", "Pokémon da Geração VIII.", 8, 250),
        new("generation-9", "Edição Paldea", "Pokémon da Geração IX.", 9, 250),
        new("rare", "Booster Raro", "Cartas raras com chance shiny aumentada.", null, 2_500),
        new("ultra-rare", "Booster Ultrarraro",
            "Cinco cartas Rare+, uma Legendary garantida e 10% de shiny por carta.", null, 10_000),
        new("special", "Booster Especial", "Cinco cartas dos tipos do alvo e 10% de shiny do alvo.", null,
            SpecialOtherShinyChance, true),
    ];

    public static void MapCardGameEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/cardgame/profile", Profile);
        api.MapPost("/cardgame/boosters/open", OpenBooster);
        api.MapPost("/cardgame/boosters/exchange", ExchangeDuplicates);
        api.MapPost("/cardgame/boosters/rare/exchange", ExchangeRareBooster);
        api.MapPost("/cardgame/evolutions/exchange", ExchangeEvolution);
        api.MapPut("/cardgame/deck", SaveDeck);
        PokemonCasinoTableEndpoints.Map(api);
    }

    private static async Task<IResult> Profile(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        if (await db.Users.FindAsync(userId) is null)
            return Results.NotFound(new { error = "Jogador não encontrado." });
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
        if (!await OwnsDeckAsync(db, userId, deck))
            return Results.BadRequest(new { error = "Seu baralho contém uma carta que ainda não está no álbum." });

        var profile = await EnsureProfileAsync(db, userId);
        profile.DeckJson = JsonSerializer.Serialize(deck);
        await db.SaveChangesAsync();
        return Results.Ok(await SnapshotAsync(db, profile));
    }

    private static async Task<IResult> OpenBooster(
        HttpRequest req,
        CardGameOpenBoosterRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        var boosterId = string.IsNullOrWhiteSpace(body.BoosterId) ? "standard" : body.BoosterId.Trim();
        var definition = BoosterDefinitions.SingleOrDefault(item => item.Id == boosterId);
        if (definition is null) return Results.BadRequest(new { error = "Tipo de booster inválido." });

        var targetCardId = definition.IsSpecial ? body.TargetCardId?.Trim() ?? "" : "";
        if (definition.IsSpecial
            && (!CardGameCatalog.All.TryGetValue(targetCardId, out var target) || !IsBaseCard(target)))
            return Results.BadRequest(new { error = "Alvo do booster especial inválido." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var profile = await EnsureProfileAsync(db, userId);
        var balance = await db.CardGameBoosterBalances.SingleOrDefaultAsync(row =>
            row.UserId == userId && row.BoosterId == boosterId && row.TargetCardId == targetCardId);
        if (balance is null || balance.Quantity <= 0)
            return Results.BadRequest(new { error = "Você não tem esse booster para abrir." });

        var cards = definition.IsSpecial
            ? await OpenSpecialBoosterAsync(db, userId, CardGameCatalog.All[targetCardId])
            : await OpenRegularBoosterAsync(db, userId, definition);
        balance.Quantity--;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(new
        {
            cards,
            profile = await SnapshotAsync(db, profile),
        });
    }

    private static async Task<IResult> ExchangeDuplicates(
        HttpRequest req,
        CardGameExchangeRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        var cardId = body.CardId?.Trim() ?? "";
        if (!CardGameCatalog.All.TryGetValue(cardId, out var card) || !IsBaseCard(card))
            return Results.BadRequest(new { error = "Somente cartas-base podem ser entregues." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var normal = await db.CardGameCollection.SingleOrDefaultAsync(row =>
            row.UserId == userId && row.CardId == cardId && !row.IsShiny && row.ShinyBonusSide == "");
        if (normal is null || normal.Quantity < SpecialExchangeCost)
            return Results.BadRequest(new { error = $"Você precisa de {SpecialExchangeCost} cópias normais iguais." });

        normal.Quantity -= SpecialExchangeCost;
        var balance = await GetOrCreateBoosterBalanceAsync(db, userId, "special", cardId);
        balance.Quantity++;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        var profile = await EnsureProfileAsync(db, userId);
        return Results.Ok(new
        {
            message = $"Booster Especial de {card.Name} recebido.",
            profile = await SnapshotAsync(db, profile),
        });
    }

    private static async Task<IResult> ExchangeEvolution(
        HttpRequest req,
        CardGameEvolutionExchangeRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        var cardId = body.CardId?.Trim() ?? "";
        var evolutionCardId = body.EvolutionCardId?.Trim() ?? "";
        if (!CardGameCatalog.All.TryGetValue(cardId, out var card)
            || !IsBaseCard(card)
            || !card.EvolvesTo.Contains(evolutionCardId, StringComparer.Ordinal)
            || !CardGameCatalog.All.TryGetValue(evolutionCardId, out var evolution)
            || !IsBaseCard(evolution))
            return Results.BadRequest(new { error = "Essa evolução não é válida para a carta entregue." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var normal = await db.CardGameCollection.SingleOrDefaultAsync(row =>
            row.UserId == userId && row.CardId == cardId && !row.IsShiny && row.ShinyBonusSide == "");
        if (normal is null || normal.Quantity < EvolutionExchangeCost)
            return Results.BadRequest(new { error = $"Você precisa de {EvolutionExchangeCost} cópias normais iguais." });

        normal.Quantity -= EvolutionExchangeCost;
        await AddCardAsync(db, userId, evolutionCardId, "");
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        var profile = await EnsureProfileAsync(db, userId);
        return Results.Ok(new
        {
            message = $"{card.Name} evoluiu para {evolution.Name}.",
            profile = await SnapshotAsync(db, profile),
        });
    }

    private static async Task<IResult> ExchangeRareBooster(
        HttpRequest req,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var normalStacks = await db.CardGameCollection
            .Where(row => row.UserId == userId && !row.IsShiny
                && row.ShinyBonusSide == "" && row.Quantity > 1)
            .ToListAsync();
        var eligible = normalStacks
            .Where(row => CardGameCatalog.All.TryGetValue(row.CardId, out var card)
                && IsBaseCard(card) && IsRareExchangeRarity(card.Rarity))
            .OrderBy(row => RareExchangeRarityRank(CardGameCatalog.All[row.CardId].Rarity))
            .ThenByDescending(row => row.Quantity)
            .ThenBy(row => row.CardId, StringComparer.Ordinal)
            .ToList();
        var species = eligible.Count;
        var spareCards = eligible.Sum(row => row.Quantity - 1);
        if (species < RareExchangeMinSpecies || spareCards < RareExchangeCost)
            return Results.BadRequest(new
            {
                error = $"Você precisa de {RareExchangeCost} cópias normais Rare+ excedentes "
                    + $"distribuídas entre pelo menos {RareExchangeMinSpecies} espécies.",
                spareCards,
                species,
            });

        var remaining = RareExchangeCost;
        foreach (var stack in eligible)
        {
            var consumed = Math.Min(stack.Quantity - 1, remaining);
            stack.Quantity -= consumed;
            remaining -= consumed;
            if (remaining == 0) break;
        }

        var balance = await GetOrCreateBoosterBalanceAsync(db, userId, "rare", "");
        balance.Quantity++;
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        var profile = await EnsureProfileAsync(db, userId);
        return Results.Ok(new
        {
            message = $"Ritual concluído: {RareExchangeCost} cartas entregues e um Booster Raro recebido.",
            profile = await SnapshotAsync(db, profile),
        });
    }

    private static async Task<List<object>> OpenRegularBoosterAsync(
        AppDb db,
        int userId,
        CardGameBoosterDefinition definition)
    {
        var pool = CardGameCatalog.All.Values
            .Where(IsBoosterEligible)
            .Where(card => definition.Generation is null || card.Generation == definition.Generation)
            .Where(card => definition.Id is not ("rare" or "ultra-rare")
                || card.Rarity is "Rare" or "Epic" or "Legendary")
            .ToList();
        if (pool.Count == 0) throw new InvalidOperationException($"Booster {definition.Id} sem cartas.");

        var opened = new List<object>(CardsPerBooster);
        for (var slot = 0; slot < CardsPerBooster; slot++)
        {
            var candidates = slot == CardsPerBooster - 1
                ? definition.Id switch
                {
                    "ultra-rare" => pool.Where(card => card.Rarity == "Legendary").ToList(),
                    "rare" => pool,
                    _ => pool.Where(card => card.Rarity != "Common").ToList(),
                }
                : pool;
            if (candidates.Count == 0) candidates = pool;
            var card = WeightedPick(candidates);
            var shiny = RandomNumberGenerator.GetInt32(100_000) < definition.ShinyChancePerHundredThousand;
            var side = shiny ? RandomSide() : "";
            await AddCardAsync(db, userId, card.Id, side);
            opened.Add(CardPayload(card.Id, side));
        }
        return opened;
    }

    private static async Task<List<object>> OpenSpecialBoosterAsync(
        AppDb db,
        int userId,
        CardGameDefinition target)
    {
        var pool = CardGameCatalog.All.Values
            .Where(IsBaseCard)
            .Where(card => card.Types.Intersect(target.Types, StringComparer.Ordinal).Any())
            .ToList();
        var targetShinySlot = RandomNumberGenerator.GetInt32(100_000) < SpecialTargetShinyChance
            ? RandomNumberGenerator.GetInt32(CardsPerBooster)
            : -1;
        var opened = new List<object>(CardsPerBooster);

        for (var slot = 0; slot < CardsPerBooster; slot++)
        {
            if (slot == targetShinySlot)
            {
                var side = RandomSide();
                await AddCardAsync(db, userId, target.Id, side);
                opened.Add(CardPayload(target.Id, side));
                continue;
            }

            var card = WeightedPick(pool);
            // O shiny da carta-alvo pertence exclusivamente ao roll de 10%.
            var shiny = card.Id != target.Id
                && RandomNumberGenerator.GetInt32(100_000) < SpecialOtherShinyChance;
            var shinySide = shiny ? RandomSide() : "";
            await AddCardAsync(db, userId, card.Id, shinySide);
            opened.Add(CardPayload(card.Id, shinySide));
        }
        return opened;
    }

    private static object CardPayload(string cardId, string shinyBonusSide) => new
    {
        cardId,
        isShiny = !string.IsNullOrEmpty(shinyBonusSide),
        shinyBonusSide,
        cardToken = FormatCardToken(cardId, shinyBonusSide),
    };

    private static async Task AddCardAsync(AppDb db, int userId, string cardId, string shinyBonusSide)
    {
        var shiny = !string.IsNullOrEmpty(shinyBonusSide);
        var item = await db.CardGameCollection.SingleOrDefaultAsync(entry =>
            entry.UserId == userId
            && entry.CardId == cardId
            && entry.IsShiny == shiny
            && entry.ShinyBonusSide == shinyBonusSide);
        if (item is null)
        {
            db.CardGameCollection.Add(new CardGameCollectionItem
            {
                UserId = userId,
                CardId = cardId,
                IsShiny = shiny,
                ShinyBonusSide = shinyBonusSide,
            });
        }
        else item.Quantity++;
    }

    public static async Task<bool> OwnsDeckAsync(AppDb db, int userId, IEnumerable<string> deck)
    {
        var references = deck.Select(ParseCardToken).ToArray();
        if (references.Any(card => card is null)) return false;
        foreach (var card in references.Select(card => card!.Value))
        {
            var owned = await db.CardGameCollection.AnyAsync(item =>
                item.UserId == userId
                && item.Quantity > 0
                && item.CardId == card.CardId
                && item.ShinyBonusSide == card.ShinyBonusSide);
            if (!owned) return false;
        }
        return true;
    }

    public static async Task<CasinoRewardGrant> GrantCasinoRewardsAsync(
        AppDb db,
        int userId,
        int boosters,
        params string[] cardIds)
    {
        await EnsureProfileAsync(db, userId);
        var balance = await GetOrCreateBoosterBalanceAsync(db, userId, "standard", "");
        balance.Quantity = checked(balance.Quantity + Math.Max(0, boosters));
        var rewards = new List<CardGameReward>();
        foreach (var cardId in cardIds.Distinct(StringComparer.Ordinal))
        {
            if (!CardGameCatalog.All.TryGetValue(cardId, out var card))
                throw new InvalidOperationException($"Carta de prêmio desconhecida: {cardId}");
            await AddCardAsync(db, userId, cardId, "");
            rewards.Add(new CardGameReward(card.Id, card.Name));
        }
        return new(Math.Max(0, boosters), balance.Quantity, rewards.ToArray());
    }

    public static async Task<int> GrantBoostersAsync(
        AppDb db,
        int userId,
        int boosters,
        string boosterId = "standard")
    {
        if (!BoosterDefinitions.Any(item => item.Id == boosterId && !item.IsSpecial))
            throw new InvalidOperationException($"Tipo de booster desconhecido: {boosterId}");
        await EnsureProfileAsync(db, userId);
        var balance = await GetOrCreateBoosterBalanceAsync(db, userId, boosterId, "");
        balance.Quantity = checked(balance.Quantity + Math.Max(0, boosters));
        return balance.Quantity;
    }

    private static async Task<CardGameProfile> EnsureProfileAsync(AppDb db, int userId)
    {
        var profile = await db.CardGameProfiles.SingleOrDefaultAsync(row => row.UserId == userId);
        if (profile is null)
        {
            profile = new CardGameProfile { UserId = userId, BoosterCount = 0 };
            db.CardGameProfiles.Add(profile);
            var initial = await GetOrCreateBoosterBalanceAsync(db, userId, "standard", "");
            initial.Quantity = InitialBoosters;
            await db.SaveChangesAsync();
            return profile;
        }

        // Migração preguiçosa dos saldos criados antes de existirem tipos de booster.
        if (profile.BoosterCount > 0)
        {
            var legacy = await GetOrCreateBoosterBalanceAsync(db, userId, "standard", "");
            legacy.Quantity = checked(legacy.Quantity + profile.BoosterCount);
            profile.BoosterCount = 0;
            await db.SaveChangesAsync();
        }
        return profile;
    }

    private static async Task<CardGameBoosterBalance> GetOrCreateBoosterBalanceAsync(
        AppDb db,
        int userId,
        string boosterId,
        string targetCardId)
    {
        var balance = await db.CardGameBoosterBalances.SingleOrDefaultAsync(row =>
            row.UserId == userId && row.BoosterId == boosterId && row.TargetCardId == targetCardId);
        if (balance is not null) return balance;
        balance = new CardGameBoosterBalance
        {
            UserId = userId,
            BoosterId = boosterId,
            TargetCardId = targetCardId,
        };
        db.CardGameBoosterBalances.Add(balance);
        return balance;
    }

    private static async Task<object> SnapshotAsync(AppDb db, CardGameProfile profile)
    {
        var collection = await db.CardGameCollection
            .Where(item => item.UserId == profile.UserId && item.Quantity > 0)
            .OrderBy(item => item.CardId)
            .ThenBy(item => item.IsShiny)
            .ThenBy(item => item.ShinyBonusSide)
            .Select(item => new
            {
                cardId = item.CardId,
                isShiny = item.IsShiny,
                shinyBonusSide = item.ShinyBonusSide,
                cardToken = item.IsShiny ? item.CardId + "~" + item.ShinyBonusSide : item.CardId,
                quantity = item.Quantity,
                firstAcquiredUtc = item.FirstAcquiredUtc,
            })
            .ToListAsync();
        var balances = await db.CardGameBoosterBalances
            .Where(item => item.UserId == profile.UserId && item.Quantity > 0)
            .OrderBy(item => item.BoosterId)
            .ThenBy(item => item.TargetCardId)
            .Select(item => new
            {
                boosterId = item.BoosterId,
                targetCardId = item.TargetCardId,
                quantity = item.Quantity,
            })
            .ToListAsync();
        var rareExchangeStacks = collection
            .Where(item => !item.isShiny && item.quantity > 1
                && CardGameCatalog.All.TryGetValue(item.cardId, out var card)
                && IsBaseCard(card) && IsRareExchangeRarity(card.Rarity))
            .ToList();
        string[] deck;
        try { deck = JsonSerializer.Deserialize<string[]>(profile.DeckJson) ?? []; }
        catch { deck = []; }
        return new
        {
            boosters = balances.Sum(item => item.quantity),
            boosterInventory = balances,
            boosterDefinitions = BoosterDefinitions,
            deck,
            collection,
            uniqueCards = collection.Select(item => item.cardId).Distinct().Count(),
            shinyCards = collection.Where(item => item.isShiny).Sum(item => item.quantity),
            baseTotal = CardGameCatalog.BaseCount,
            specialExchangeCost = SpecialExchangeCost,
            evolutionExchangeCost = EvolutionExchangeCost,
            rareExchangeCost = RareExchangeCost,
            rareExchangeMinSpecies = RareExchangeMinSpecies,
            rareExchangeSpareCards = rareExchangeStacks.Sum(item => item.quantity - 1),
            rareExchangeSpecies = rareExchangeStacks.Count,
        };
    }

    public static CardGameCardRef? ParseCardToken(string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return null;
        var parts = token.Split('~', 2, StringSplitOptions.TrimEntries);
        var cardId = parts[0];
        var side = parts.Length == 2 ? parts[1] : "";
        if (!CardGameCatalog.All.ContainsKey(cardId)) return null;
        if (!string.IsNullOrEmpty(side) && !Sides.Contains(side, StringComparer.Ordinal)) return null;
        return new CardGameCardRef(cardId, side);
    }

    public static string FormatCardToken(string cardId, string shinyBonusSide) =>
        string.IsNullOrEmpty(shinyBonusSide) ? cardId : $"{cardId}~{shinyBonusSide}";

    private static string RandomSide() => Sides[RandomNumberGenerator.GetInt32(Sides.Length)];

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

    private static bool IsBaseCard(CardGameDefinition card) => string.IsNullOrEmpty(card.Variant);

    private static bool IsRareExchangeRarity(string rarity) =>
        rarity is "Rare" or "Epic" or "Legendary";

    private static int RareExchangeRarityRank(string rarity) => rarity switch
    {
        "Rare" => 0,
        "Epic" => 1,
        "Legendary" => 2,
        _ => 3,
    };

    private static bool IsBoosterEligible(CardGameDefinition card) =>
        card.Variant is not ("casino-player" or "casino-king" or "casino-four-spoons"
            or "casino-five-spoons" or "slot-glitch" or "slot-arcade" or "jackpot" or "dealer");
}
