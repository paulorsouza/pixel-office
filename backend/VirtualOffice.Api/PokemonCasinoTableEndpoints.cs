using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public sealed record PokemonCasinoStartRequest(string IdempotencyKey);
public sealed record PokemonCasinoLeaveRequest(long RoundId, string IdempotencyKey);
public sealed record PokemonCasinoMoveRequest(
    long RoundId,
    string CardId,
    int CellIndex,
    string IdempotencyKey);

public sealed class PokemonCasinoCell
{
    public string CardId { get; set; } = "";
    public int Controller { get; set; }
}

public sealed class PokemonCasinoState
{
    public int Level { get; set; } = 1;
    public string Status { get; set; } = "ongoing";
    public int CurrentPlayer { get; set; }
    public int Turn { get; set; }
    public List<string> PlayerHand { get; set; } = [];
    public List<string> PlayerDrawPile { get; set; } = [];
    public List<string> HouseHand { get; set; } = [];
    public List<string> HouseDrawPile { get; set; } = [];
    public PokemonCasinoCell?[] Board { get; set; } = new PokemonCasinoCell?[9];
    public List<string> ActionKeys { get; set; } = [];
    public bool RewardGranted { get; set; }
    public int RewardLevelAwarded { get; set; }
    public int NormalBoostersAwarded { get; set; }
    public int RareBoostersAwarded { get; set; }
    public int LegendaryBoostersAwarded { get; set; }
}

public static class PokemonCasinoTableEndpoints
{
    private const string GameId = "pokemon-card-table";
    private const string RulesVersion = "2026-07-30.3";
    private const string MewtwoKingId = "special-casino-mewtwo";
    private const int DeckSize = 15;
    private const int OpeningHand = 6;
    private const int MaxLevel = 6;
    private const int EntryCost = 100;
    private static readonly string[] PowerUpSides = ["top", "right", "bottom", "left"];

    private static readonly (int Normal, int Rare, int Legendary)[] Rewards =
    [
        (1, 0, 0),
        (3, 0, 0),
        (1, 1, 0),
        (3, 3, 0),
        (0, 5, 0),
        (0, 1, 1),
    ];

    private static readonly IReadOnlyDictionary<string, string[]> TypeAdvantages =
        new Dictionary<string, string[]>(StringComparer.Ordinal)
        {
            ["normal"] = [],
            ["fire"] = ["grass", "ice", "bug", "steel"],
            ["water"] = ["fire", "ground", "rock"],
            ["electric"] = ["water", "flying"],
            ["grass"] = ["water", "ground", "rock"],
            ["ice"] = ["grass", "ground", "flying", "dragon"],
            ["fighting"] = ["normal", "ice", "rock", "dark", "steel"],
            ["poison"] = ["grass", "fairy"],
            ["ground"] = ["fire", "electric", "poison", "rock", "steel"],
            ["flying"] = ["grass", "fighting", "bug"],
            ["psychic"] = ["fighting", "poison"],
            ["bug"] = ["grass", "psychic", "dark"],
            ["rock"] = ["fire", "ice", "flying", "bug"],
            ["ghost"] = ["psychic", "ghost"],
            ["dragon"] = ["dragon"],
            ["dark"] = ["psychic", "ghost"],
            ["steel"] = ["ice", "rock", "fairy"],
            ["fairy"] = ["fighting", "dragon", "dark"],
        };

    public static void Map(RouteGroupBuilder api)
    {
        api.MapGet("/cardgame/casino-table", Snapshot);
        api.MapPost("/cardgame/casino-table/start", Start);
        api.MapPost("/cardgame/casino-table/move", Move);
        api.MapPost("/cardgame/casino-table/leave", Leave);
    }

    private static async Task<IResult> Snapshot(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        var latest = await LatestRoundAsync(db, userId);
        var coins = await db.Users.Where(row => row.Id == userId)
            .Select(row => (int?)row.Coins).SingleOrDefaultAsync();
        if (coins is null) return Results.NotFound(new { error = "Jogador não encontrado." });
        return Results.Ok(new
        {
            gameId = GameId,
            name = "Liga Pokémon da Casa",
            maxLevel = MaxLevel,
            entryCost = EntryCost,
            coins,
            rewards = RewardTable(),
            round = latest is null ? null : RoundPayload(latest, Deserialize(latest)),
        });
    }

    private static async Task<IResult> Start(
        HttpRequest req,
        PokemonCasinoStartRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!Guid.TryParse(body.IdempotencyKey, out _))
            return Results.BadRequest(new { error = "Chave de idempotência inválida." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var repeated = await db.CasinoRounds.SingleOrDefaultAsync(row =>
            row.UserId == userId && row.IdempotencyKey == body.IdempotencyKey);
        if (repeated is not null)
        {
            await transaction.CommitAsync();
            return Results.Ok(RoundPayload(repeated, Deserialize(repeated)));
        }

        var latest = await LatestRoundAsync(db, userId);
        if (latest is not null)
        {
            var previous = Deserialize(latest);
            if (previous.Status == "ongoing")
            {
                await transaction.CommitAsync();
                return Results.Ok(RoundPayload(latest, previous));
            }
        }

        var profile = await db.CardGameProfiles.SingleOrDefaultAsync(row => row.UserId == userId);
        string[] deck;
        try { deck = JsonSerializer.Deserialize<string[]>(profile?.DeckJson ?? "[]") ?? []; }
        catch { deck = []; }
        if (!CardGameCatalog.TryValidateDeck(deck, out deck, out var error)
            || !await CardGameEndpoints.OwnsDeckAsync(db, userId, deck))
            return Results.BadRequest(new { error = error.Length > 0
                ? error
                : "Monte um baralho válido de 15 cartas antes de enfrentar a casa." });

        var level = 1;
        if (latest is not null)
        {
            var previous = Deserialize(latest);
            if (previous.Status == "won" && previous.Level < MaxLevel) level = previous.Level + 1;
        }
        var user = await db.Users.SingleOrDefaultAsync(row => row.Id == userId);
        if (user is null) return Results.NotFound(new { error = "Jogador não encontrado." });
        var isNewSequence = level == 1;
        if (isNewSequence && user.Coins < EntryCost)
            return Results.Conflict(new
            {
                error = $"São necessárias {EntryCost} moedas para iniciar a sequência.",
                coins = user.Coins,
                entryCost = EntryCost,
            });

        var state = CreateBattle(level, deck);
        if (state.CurrentPlayer == 1) PlayHouseTurn(state);
        var balanceBefore = user.Coins;
        if (isNewSequence) user.Coins = checked(user.Coins - EntryCost);
        var round = new CasinoRound
        {
            UserId = userId,
            GameId = GameId,
            RulesVersion = RulesVersion,
            IdempotencyKey = body.IdempotencyKey,
            Bet = isNewSequence ? EntryCost : 0,
            Payout = 0,
            BalanceBefore = balanceBefore,
            BalanceAfter = user.Coins,
            OutcomeJson = JsonSerializer.Serialize(state),
        };
        db.CasinoRounds.Add(round);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(RoundPayload(round, state));
    }

    private static async Task<IResult> Move(
        HttpRequest req,
        PokemonCasinoMoveRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!Guid.TryParse(body.IdempotencyKey, out _))
            return Results.BadRequest(new { error = "Chave de idempotência inválida." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var round = await db.CasinoRounds.SingleOrDefaultAsync(row =>
            row.Id == body.RoundId && row.UserId == userId && row.GameId == GameId);
        if (round is null) return Results.NotFound(new { error = "Partida da mesa não encontrada." });
        var state = Deserialize(round);
        if (state.ActionKeys.Contains(body.IdempotencyKey))
        {
            await transaction.CommitAsync();
            return Results.Ok(RoundPayload(round, state));
        }
        if (state.Status != "ongoing")
            return Results.Conflict(new { error = "Esta batalha já terminou." });
        if (state.CurrentPlayer != 0)
            return Results.Conflict(new { error = "A casa ainda está jogando." });

        var error = Play(state, 0, body.CardId, body.CellIndex);
        if (error is not null) return Results.BadRequest(new { error });
        state.ActionKeys.Add(body.IdempotencyKey);
        if (state.Status == "ongoing") PlayHouseTurn(state);
        if (state.Status == "lost")
            await GrantRewardAsync(db, userId, state, state.Level - 1);
        else if (state.Status == "won" && state.Level == MaxLevel)
            await GrantRewardAsync(db, userId, state, MaxLevel);
        round.OutcomeJson = JsonSerializer.Serialize(state);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(RoundPayload(round, state));
    }

    private static async Task<IResult> Leave(
        HttpRequest req,
        PokemonCasinoLeaveRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!Guid.TryParse(body.IdempotencyKey, out _))
            return Results.BadRequest(new { error = "Chave de idempotência inválida." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var round = await db.CasinoRounds.SingleOrDefaultAsync(row =>
            row.Id == body.RoundId && row.UserId == userId && row.GameId == GameId);
        if (round is null) return Results.NotFound(new { error = "Partida da mesa não encontrada." });
        var state = Deserialize(round);
        if (state.ActionKeys.Contains(body.IdempotencyKey) || state.RewardGranted)
        {
            await transaction.CommitAsync();
            return Results.Ok(RoundPayload(round, state));
        }

        var achievedLevel = state.Status == "won" ? state.Level : Math.Max(0, state.Level - 1);
        if (state.Status is "ongoing" or "won")
            state.Status = "left";
        state.ActionKeys.Add(body.IdempotencyKey);
        await GrantRewardAsync(db, userId, state, achievedLevel);
        round.OutcomeJson = JsonSerializer.Serialize(state);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(RoundPayload(round, state));
    }

    private static PokemonCasinoState CreateBattle(int level, string[] playerDeck)
    {
        var player = Shuffle(playerDeck);
        var house = HouseDeck(level);
        return new PokemonCasinoState
        {
            Level = level,
            CurrentPlayer = RandomNumberGenerator.GetInt32(2),
            PlayerHand = player.Take(OpeningHand).ToList(),
            PlayerDrawPile = player.Skip(OpeningHand).ToList(),
            HouseHand = house.Take(OpeningHand).ToList(),
            HouseDrawPile = house.Skip(OpeningHand).ToList(),
        };
    }

    private static string[] HouseDeck(int level)
    {
        var ordered = CardGameCatalog.All.Values
            .Where(card => string.IsNullOrEmpty(card.Variant))
            .OrderBy(card => card.PowerRating)
            .ThenBy(card => card.Id, StringComparer.Ordinal)
            .ToList();
        var bandSize = Math.Max(DeckSize, ordered.Count / 4);
        var startRatio = level switch
        {
            1 => 0.00,
            2 => 0.15,
            3 => 0.32,
            4 => 0.50,
            5 => 0.68,
            _ => 0.82,
        };
        var start = Math.Min(ordered.Count - bandSize, (int)(ordered.Count * startRatio));
        var selected = Shuffle(ordered.Skip(Math.Max(0, start)).Take(bandSize).Select(card => card.Id))
            .Take(level == MaxLevel ? DeckSize - 1 : DeckSize)
            .ToArray();
        var powerUps = level switch
        {
            4 => 1,
            5 => 3,
            6 => 5,
            _ => 0,
        };
        for (var index = 0; index < Math.Min(powerUps, selected.Length); index++)
            selected[index] = CardGameEndpoints.FormatCardToken(
                selected[index],
                PowerUpSides[RandomNumberGenerator.GetInt32(PowerUpSides.Length)]);
        return level == MaxLevel ? [MewtwoKingId, .. selected] : selected;
    }

    private static void PlayHouseTurn(PokemonCasinoState state)
    {
        if (state.Status != "ongoing" || state.CurrentPlayer != 1) return;
        var empty = Enumerable.Range(0, state.Board.Length).Where(index => state.Board[index] is null).ToArray();
        var options = state.HouseHand.SelectMany(cardId => empty.Select(cell => new
        {
            CardId = cardId,
            Cell = cell,
            Score = HouseMoveScore(state, cardId, cell),
            Tie = RandomNumberGenerator.GetInt32(int.MaxValue),
        }));
        var choice = state.Level == 1
            ? options.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).First()
            : options.OrderByDescending(option => option.Score).ThenBy(option => option.Tie).First();
        _ = Play(state, 1, choice.CardId, choice.Cell);
    }

    private static int HouseMoveScore(PokemonCasinoState state, string cardId, int cell)
    {
        var reference = CardGameEndpoints.ParseCardToken(cardId)!.Value;
        var card = CardGameCatalog.All[reference.CardId];
        var captures = CapturableNeighbors(state.Board, cell, cardId, 1).Count;
        var printedPower = card.Edges.Values.Sum()
            + (string.IsNullOrEmpty(reference.ShinyBonusSide) ? 0 : 1);
        var centerBonus = cell == 4 ? 5 : cell is 0 or 2 or 6 or 8 ? 2 : 0;
        return captures * 1_000 + printedPower * state.Level + centerBonus;
    }

    private static string? Play(PokemonCasinoState state, int player, string cardId, int cellIndex)
    {
        if (cellIndex is < 0 or >= 9) return "Casa inválida.";
        if (state.Board[cellIndex] is not null) return "Essa casa já está ocupada.";
        var hand = player == 0 ? state.PlayerHand : state.HouseHand;
        if (!hand.Remove(cardId)) return "Essa carta não está na mão.";
        if (CardGameEndpoints.ParseCardToken(cardId) is null) return "Carta inválida.";

        state.Board[cellIndex] = new PokemonCasinoCell { CardId = cardId, Controller = player };
        foreach (var index in CapturableNeighbors(state.Board, cellIndex, cardId, player))
            state.Board[index]!.Controller = player;
        var drawPile = player == 0 ? state.PlayerDrawPile : state.HouseDrawPile;
        if (drawPile.Count > 0)
        {
            hand.Add(drawPile[0]);
            drawPile.RemoveAt(0);
        }
        state.Turn++;
        if (state.Turn == 9)
        {
            var playerScore = state.Board.Count(cell => cell?.Controller == 0);
            state.Status = playerScore >= 5 ? "won" : "lost";
        }
        else state.CurrentPlayer = player == 0 ? 1 : 0;
        return null;
    }

    private static List<int> CapturableNeighbors(
        PokemonCasinoCell?[] board,
        int cellIndex,
        string cardId,
        int player)
    {
        var captures = new List<int>();
        var row = cellIndex / 3;
        var col = cellIndex % 3;
        var directions = new[]
        {
            (Side: "top", Opposite: "bottom", Row: -1, Col: 0),
            (Side: "right", Opposite: "left", Row: 0, Col: 1),
            (Side: "bottom", Opposite: "top", Row: 1, Col: 0),
            (Side: "left", Opposite: "right", Row: 0, Col: -1),
        };
        var attackRef = CardGameEndpoints.ParseCardToken(cardId)!.Value;
        var attack = CardGameCatalog.All[attackRef.CardId];
        foreach (var direction in directions)
        {
            var neighborRow = row + direction.Row;
            var neighborCol = col + direction.Col;
            if (neighborRow is < 0 or >= 3 || neighborCol is < 0 or >= 3) continue;
            var neighborIndex = neighborRow * 3 + neighborCol;
            var neighbor = board[neighborIndex];
            if (neighbor is null || neighbor.Controller == player) continue;
            var defenseRef = CardGameEndpoints.ParseCardToken(neighbor.CardId)!.Value;
            var defense = CardGameCatalog.All[defenseRef.CardId];
            var attackValue = PrintedEdge(attack, attackRef, direction.Side)
                + (HasTypeAdvantage(attack, defense) ? 1 : 0);
            var defenseValue = PrintedEdge(defense, defenseRef, direction.Opposite)
                + (HasTypeAdvantage(defense, attack) ? 1 : 0);
            if (attackValue > defenseValue) captures.Add(neighborIndex);
        }
        return captures;
    }

    private static int PrintedEdge(CardGameDefinition card, CardGameCardRef reference, string side) =>
        card.Edges[side] + (reference.ShinyBonusSide == side ? 1 : 0);

    private static bool HasTypeAdvantage(CardGameDefinition attacker, CardGameDefinition defender) =>
        attacker.Types.Any(type => TypeAdvantages.TryGetValue(type, out var targets)
            && defender.Types.Any(targets.Contains));

    private static async Task GrantRewardAsync(
        AppDb db,
        int userId,
        PokemonCasinoState state,
        int achievedLevel)
    {
        if (state.RewardGranted) return;
        if (achievedLevel <= 0)
        {
            state.RewardLevelAwarded = 0;
            state.RewardGranted = true;
            return;
        }
        var reward = Rewards[Math.Min(achievedLevel, MaxLevel) - 1];
        if (reward.Normal > 0)
            await CardGameEndpoints.GrantBoostersAsync(db, userId, reward.Normal, "standard");
        if (reward.Rare > 0)
            await CardGameEndpoints.GrantBoostersAsync(db, userId, reward.Rare, "rare");
        // O topo da Liga paga o Lendário, que NÃO está à venda: a Banca só chega ao
        // Ultrarraro, um degrau abaixo. Seis vitórias seguidas continuam valendo
        // algo que moeda nenhuma compra.
        if (reward.Legendary > 0)
            await CardGameEndpoints.GrantBoostersAsync(db, userId, reward.Legendary, "legendary");
        state.NormalBoostersAwarded = reward.Normal;
        state.RareBoostersAwarded = reward.Rare;
        state.LegendaryBoostersAwarded = reward.Legendary;
        state.RewardLevelAwarded = achievedLevel;
        state.RewardGranted = true;
    }

    private static async Task<CasinoRound?> LatestRoundAsync(AppDb db, int userId) =>
        await db.CasinoRounds.Where(row => row.UserId == userId && row.GameId == GameId)
            .OrderByDescending(row => row.Id).FirstOrDefaultAsync();

    private static PokemonCasinoState Deserialize(CasinoRound round) =>
        JsonSerializer.Deserialize<PokemonCasinoState>(round.OutcomeJson)
        ?? throw new InvalidOperationException("Estado da Liga Pokémon inválido.");

    private static object RoundPayload(CasinoRound round, PokemonCasinoState state)
    {
        var score = new[]
        {
            state.Board.Count(cell => cell?.Controller == 0),
            state.Board.Count(cell => cell?.Controller == 1),
        };
        return new
        {
            roundId = round.Id,
            round.RulesVersion,
            state.Level,
            state.Status,
            state.CurrentPlayer,
            state.Turn,
            playerHand = state.PlayerHand,
            playerDrawCount = state.PlayerDrawPile.Count,
            houseHandCount = state.HouseHand.Count,
            houseDrawCount = state.HouseDrawPile.Count,
            housePowerUps = state.Level switch { 4 => 1, 5 => 3, 6 => 5, _ => 0 },
            houseBoss = state.Level == MaxLevel ? new
            {
                cardId = MewtwoKingId,
                name = CardGameCatalog.All[MewtwoKingId].Name,
            } : null,
            board = state.Board,
            score,
            reward = new
            {
                normal = state.NormalBoostersAwarded,
                rare = state.RareBoostersAwarded,
                legendary = state.LegendaryBoostersAwarded,
            },
            rewardLevel = state.RewardLevelAwarded,
            entryCost = round.Bet,
            coins = round.BalanceAfter,
            nextLevel = state.Status == "won" && state.Level < MaxLevel ? state.Level + 1 : 1,
        };
    }

    private static object[] RewardTable() => Rewards.Select((reward, index) => (object)new
    {
        level = index + 1,
        normal = reward.Normal,
        rare = reward.Rare,
        legendary = reward.Legendary,
    }).ToArray();

    private static string[] Shuffle(IEnumerable<string> cards) =>
        cards.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).ToArray();
}
