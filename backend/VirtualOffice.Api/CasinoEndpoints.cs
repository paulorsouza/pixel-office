using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public sealed record CasinoRoundRequest(int Bet, string IdempotencyKey, int[]? Cards = null);
public sealed record CasinoActionRequest(string Action, string IdempotencyKey, int? Card = null);
public sealed record ArrangeDiceRoll(int Die1, int Die2, int Sum);
public sealed record ArrangeDiceRun(
    int Start,
    int Length,
    int[] Cards,
    int Multiplier);
public sealed class ArrangeDiceState
{
    public int[] Cards { get; set; } = [];
    public List<ArrangeDiceRoll> Rolls { get; set; } = [];
    public List<int> LiftedCards { get; set; } = [];
    public List<string> ActionKeys { get; set; } = [];
    public int RollsRemaining { get; set; } = 5;
    public bool WildcardPending { get; set; }
    public string Status { get; set; } = "rolling";
    public ArrangeDiceRun? WinningRun { get; set; }
    public int SequenceRepeatCard { get; set; }
    public int SequenceRepeatCount { get; set; }
    public int RepeatMultiplier { get; set; } = 1;
    public int BestRepeatedSum { get; set; }
    public int BestRepeatedCount { get; set; }
    public int Multiplier { get; set; }
    public int Payout { get; set; }
    public int BoostersAwarded { get; set; }
    public int? BoosterBalance { get; set; }
    public List<CardGameReward> CardsAwarded { get; set; } = [];
}
public sealed record BlackjackCard(string Rank, string Suit);
public sealed class BlackjackState
{
    public List<BlackjackCard> Deck { get; set; } = [];
    public List<BlackjackCard> PlayerCards { get; set; } = [];
    public List<BlackjackCard> DealerCards { get; set; } = [];
    public List<string> ActionKeys { get; set; } = [];
    public string Status { get; set; } = "player-turn";
    public string Outcome { get; set; } = "";
    public bool Natural { get; set; }
    public int Payout { get; set; }
    public int BoostersAwarded { get; set; }
    public int? BoosterBalance { get; set; }
    public List<CardGameReward> CardsAwarded { get; set; } = [];
}

public static class CasinoEndpoints
{
    private const string ArrangeDiceId = "arrange-dice";
    private const string NerdSlotsId = "nerd-slots";
    // Mantido somente para desserializar rodadas históricas da máquina removida.
    private const string PokemonSlotsId = "pokemon-slots";
    private const string BlackjackId = "blackjack";
    private const string ArrangeDiceRules = "2026-07-29.3";
    private const string NerdSlotsRules = "2026-07-29.5";
    private const string BlackjackRules = "2026-07-29.3";
    private const string PikachuPlayerId = "special-casino-pikachu";
    private const string MewtwoKingId = "special-casino-mewtwo";
    private const string GengarJackpotId = "special-slot-gengar";
    private const string CharizardJackpotId = "special-slot-charizard";
    private const string PorygonJackpotId = "special-slot-porygon";
    private const string MeowthDealerId = "special-blackjack-meowth";
    private const string QuadraId = "special-casino-quadra";
    private const string QuinaId = "special-casino-quina";
    private static readonly int[] ArrangeDiceBets = [10, 25, 50];
    private static readonly int[] SlotBets = [5, 10, 25];
    private static readonly int[] BlackjackBets = [10, 20, 50];

    public static void MapCasinoEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/casino/games/{gameId}", Game);
        api.MapPost("/casino/games/{gameId}/rounds", Play);
        api.MapPost("/casino/games/{gameId}/rounds/{roundId:long}/actions", CasinoAction);
        api.MapGet("/casino/history", History);
    }

    private static async Task<IResult> Game(
        string gameId,
        HttpRequest req,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!IsGame(gameId)) return Results.NotFound(new { error = "Jogo não encontrado." });
        await using var db = await factory.CreateDbContextAsync();
        var coins = await db.Users.Where(x => x.Id == userId).Select(x => (int?)x.Coins).SingleOrDefaultAsync();
        if (coins is null) return Results.NotFound(new { error = "Jogador não encontrado." });
        object? activeRound = null;
        if (gameId.Equals(BlackjackId, StringComparison.OrdinalIgnoreCase))
        {
            var recent = await db.CasinoRounds
                .Where(x => x.UserId == userId && x.GameId == BlackjackId && x.RulesVersion == BlackjackRules)
                .OrderByDescending(x => x.CreatedUtc)
                .Take(10)
                .ToListAsync();
            var pending = recent.FirstOrDefault(row => DeserializeBlackjack(row).Status == "player-turn");
            if (pending is not null) activeRound = ToBlackjackResult(pending);
        }
        else if (gameId.Equals(ArrangeDiceId, StringComparison.OrdinalIgnoreCase))
        {
            var recent = await db.CasinoRounds
                .Where(x => x.UserId == userId && x.GameId == ArrangeDiceId && x.RulesVersion == ArrangeDiceRules)
                .OrderByDescending(x => x.CreatedUtc)
                .Take(10)
                .ToListAsync();
            var pending = recent.FirstOrDefault(row => DeserializeArrange(row).Status != "complete");
            if (pending is not null) activeRound = ToArrangeDiceResult(pending);
        }
        return Results.Ok(GameSnapshot(gameId, coins.Value, activeRound));
    }

    private static async Task<IResult> Play(
        string gameId,
        CasinoRoundRequest body,
        HttpRequest req,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!IsGame(gameId)) return Results.NotFound(new { error = "Jogo não encontrado." });
        var bets = BetsFor(gameId);
        if (!bets.Contains(body.Bet))
            return Results.BadRequest(new { error = "Aposta inválida.", bets });
        if (!Guid.TryParse(body.IdempotencyKey, out _))
            return Results.BadRequest(new { error = "Chave de idempotência inválida." });
        if (gameId.Equals(ArrangeDiceId, StringComparison.OrdinalIgnoreCase)
            && !ArrangeDiceMath.IsValidArrangement(body.Cards))
            return Results.BadRequest(new { error = "Escolha sete cartas únicas entre 3 e 11, na ordem desejada." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var previous = await db.CasinoRounds.SingleOrDefaultAsync(x =>
            x.UserId == userId && x.IdempotencyKey == body.IdempotencyKey);
        if (previous is not null)
        {
            await transaction.CommitAsync();
            return Results.Ok(ToGameResult(previous));
        }
        if (gameId.Equals(BlackjackId, StringComparison.OrdinalIgnoreCase)
            || gameId.Equals(ArrangeDiceId, StringComparison.OrdinalIgnoreCase))
        {
            var rows = await db.CasinoRounds
                .Where(x => x.UserId == userId
                    && x.GameId == gameId.ToLowerInvariant()
                    && x.RulesVersion == (gameId.ToLowerInvariant() == BlackjackId ? BlackjackRules : ArrangeDiceRules))
                .OrderByDescending(x => x.CreatedUtc)
                .Take(10)
                .ToListAsync();
            var active = gameId.Equals(BlackjackId, StringComparison.OrdinalIgnoreCase)
                ? rows.FirstOrDefault(row => DeserializeBlackjack(row).Status == "player-turn")
                : rows.FirstOrDefault(row => DeserializeArrange(row).Status != "complete");
            if (active is not null)
                return Results.Conflict(new
                {
                    error = "Conclua sua rodada atual antes de iniciar outra.",
                    activeRound = ToGameResult(active),
                });
        }

        var user = await db.Users.SingleOrDefaultAsync(x => x.Id == userId);
        if (user is null) return Results.NotFound(new { error = "Jogador não encontrado." });
        if (user.Coins < body.Bet)
            return Results.Conflict(new { error = "Moedas insuficientes.", coins = user.Coins, bet = body.Bet });

        CasinoRound round = gameId.ToLowerInvariant() switch
        {
            ArrangeDiceId => CreateArrangeDiceRound(user, body),
            NerdSlotsId => await CreateSlotRoundAsync(db, user, body),
            BlackjackId => await CreateBlackjackRoundAsync(db, user, body),
            _ => throw new InvalidOperationException("Jogo sem implementação."),
        };
        db.CasinoRounds.Add(round);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(ToGameResult(round));
    }

    private static async Task<IResult> CasinoAction(
        string gameId,
        long roundId,
        CasinoActionRequest body,
        HttpRequest req,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!gameId.Equals(BlackjackId, StringComparison.OrdinalIgnoreCase)
            && !gameId.Equals(ArrangeDiceId, StringComparison.OrdinalIgnoreCase))
            return Results.NotFound(new { error = "Este jogo não possui ações de rodada." });
        if (!Guid.TryParse(body.IdempotencyKey, out _))
            return Results.BadRequest(new { error = "Chave de idempotência inválida." });

        return gameId.Equals(ArrangeDiceId, StringComparison.OrdinalIgnoreCase)
            ? await ArrangeDiceAction(roundId, body, userId, factory)
            : await BlackjackAction(roundId, body, userId, factory);
    }

    private static async Task<IResult> ArrangeDiceAction(
        long roundId,
        CasinoActionRequest body,
        int userId,
        IDbContextFactory<AppDb> factory)
    {
        var action = (body.Action ?? "").Trim().ToLowerInvariant();
        if (action is not ("roll" or "wildcard"))
            return Results.BadRequest(new { error = "Ação inválida. Use roll ou wildcard." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var round = await db.CasinoRounds.SingleOrDefaultAsync(x =>
            x.Id == roundId && x.UserId == userId && x.GameId == ArrangeDiceId);
        if (round is null) return Results.NotFound(new { error = "Rodada não encontrada." });
        var state = DeserializeArrange(round);
        if (state.ActionKeys.Contains(body.IdempotencyKey))
        {
            await transaction.CommitAsync();
            return Results.Ok(ToArrangeDiceResult(round, state));
        }
        if (state.Status == "complete")
            return Results.Conflict(new { error = "Esta rodada já terminou." });
        if (action == "roll" && state.WildcardPending)
            return Results.Conflict(new { error = "Escolha uma carta para o coringa antes do próximo lançamento." });
        if (action == "wildcard")
        {
            if (!state.WildcardPending)
                return Results.Conflict(new { error = "Não há coringa aguardando escolha." });
            if (body.Card is not int card || !state.Cards.Contains(card) || state.LiftedCards.Contains(card))
                return Results.BadRequest(new { error = "Escolha uma carta ainda abaixada do seu arranjo." });
            state.LiftedCards.Add(card);
            state.WildcardPending = false;
        }
        else
        {
            if (state.RollsRemaining <= 0)
                return Results.Conflict(new { error = "Não restam lançamentos." });
            var roll = ArrangeDiceMath.Roll();
            state.Rolls.Add(roll);
            state.RollsRemaining--;
            if (roll.Sum == 2)
                state.RollsRemaining = Math.Min(
                    state.RollsRemaining + 2,
                    ArrangeDiceMath.MaxRolls - state.Rolls.Count);
            else if (roll.Sum == 12)
            {
                state.RollsRemaining = Math.Max(0, state.RollsRemaining - 1);
                state.WildcardPending = state.LiftedCards.Count < state.Cards.Length;
            }
            else if (state.Cards.Contains(roll.Sum) && !state.LiftedCards.Contains(roll.Sum))
                state.LiftedCards.Add(roll.Sum);
        }

        state.ActionKeys.Add(body.IdempotencyKey);
        if (state.RollsRemaining == 0 && !state.WildcardPending)
        {
            ArrangeDiceMath.Finish(state, round.Bet);
            var rewardCards = new List<string>();
            var sequenceCard = state.WinningRun?.Length switch
            {
                7 => MewtwoKingId,
                6 => PikachuPlayerId,
                _ => null,
            };
            if (sequenceCard is not null) rewardCards.Add(sequenceCard);
            if (state.BestRepeatedCount >= 5) rewardCards.Add(QuinaId);
            else if (state.BestRepeatedCount >= 4) rewardCards.Add(QuadraId);
            var grant = await CardGameEndpoints.GrantCasinoRewardsAsync(db, userId, 0, rewardCards.ToArray());
            state.BoosterBalance = grant.BoosterBalance;
            state.CardsAwarded = grant.Cards.ToList();
            var user = await db.Users.SingleAsync(x => x.Id == userId);
            user.Coins = checked(user.Coins + state.Payout);
            round.Payout = state.Payout;
            round.BalanceAfter = user.Coins;
        }

        round.OutcomeJson = JsonSerializer.Serialize(state);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(ToArrangeDiceResult(round, state));
    }

    private static async Task<IResult> BlackjackAction(
        long roundId,
        CasinoActionRequest body,
        int userId,
        IDbContextFactory<AppDb> factory)
    {
        var action = (body.Action ?? "").Trim().ToLowerInvariant();
        if (action is not ("hit" or "stand"))
            return Results.BadRequest(new { error = "Ação inválida. Use hit ou stand." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var round = await db.CasinoRounds.SingleOrDefaultAsync(x =>
            x.Id == roundId && x.UserId == userId && x.GameId == BlackjackId);
        if (round is null) return Results.NotFound(new { error = "Mão não encontrada." });
        var state = DeserializeBlackjack(round);
        if (state.ActionKeys.Contains(body.IdempotencyKey))
        {
            await transaction.CommitAsync();
            return Results.Ok(ToBlackjackResult(round, state));
        }
        if (state.Status != "player-turn")
            return Results.Conflict(new { error = "Esta mão já terminou." });

        state.ActionKeys.Add(body.IdempotencyKey);
        if (action == "hit")
        {
            state.PlayerCards.Add(BlackjackMath.Draw(state));
            var playerScore = BlackjackMath.Score(state.PlayerCards).Total;
            if (playerScore > 21) BlackjackMath.Finish(state, round.Bet, "player-bust");
            else if (playerScore == 21) BlackjackMath.PlayDealerAndFinish(state, round.Bet);
        }
        else BlackjackMath.PlayDealerAndFinish(state, round.Bet);
        if (state.Status == "complete")
        {
            await GrantBlackjackRewardsAsync(db, userId, state);
            var user = await db.Users.SingleAsync(x => x.Id == userId);
            user.Coins = checked(user.Coins + state.Payout);
            round.Payout = state.Payout;
            round.BalanceAfter = user.Coins;
        }
        round.OutcomeJson = JsonSerializer.Serialize(state);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(ToBlackjackResult(round, state));
    }

    private static async Task<IResult> History(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        var rows = await db.CasinoRounds
            .Where(x => x.UserId == userId)
            .OrderByDescending(x => x.CreatedUtc)
            .Take(30)
            .ToListAsync();
        return Results.Ok(rows.Select(ToGameResult));
    }

    private static CasinoRound CreateArrangeDiceRound(User user, CasinoRoundRequest body)
    {
        var before = user.Coins;
        user.Coins = checked(user.Coins - body.Bet);
        var state = new ArrangeDiceState { Cards = body.Cards! };
        return new CasinoRound
        {
            UserId = user.Id,
            GameId = ArrangeDiceId,
            RulesVersion = ArrangeDiceRules,
            IdempotencyKey = body.IdempotencyKey,
            Bet = body.Bet,
            OutcomeJson = JsonSerializer.Serialize(state),
            Payout = 0,
            BalanceBefore = before,
            BalanceAfter = user.Coins,
        };
    }

    private static async Task<CasinoRound> CreateSlotRoundAsync(
        AppDb db,
        User user,
        CasinoRoundRequest body)
    {
        var symbols = Enumerable.Range(0, 3)
            .Select(_ => NerdSlotsMath.Spin())
            .ToArray();
        var multiplier = NerdSlotsMath.Multiplier(symbols);
        var payout = checked(body.Bet * multiplier);
        var special = NerdSlotsMath.SpecialReward(symbols);
        var cardIds = special?.Card switch
        {
            "gengar" => new[] { GengarJackpotId },
            "charizard" => new[] { CharizardJackpotId },
            "porygon" => new[] { PorygonJackpotId },
            _ => [],
        };
        var grant = await CardGameEndpoints.GrantCasinoRewardsAsync(
            db, user.Id, special?.Boosters ?? 0, cardIds);
        var before = user.Coins;
        user.Coins = checked(user.Coins - body.Bet + payout);
        return new CasinoRound
        {
            UserId = user.Id,
            GameId = NerdSlotsId,
            RulesVersion = NerdSlotsRules,
            IdempotencyKey = body.IdempotencyKey,
            Bet = body.Bet,
            OutcomeJson = JsonSerializer.Serialize(new
            {
                symbols,
                multiplier,
                boostersAwarded = grant.Boosters,
                boosterBalance = grant.BoosterBalance,
                cardsAwarded = grant.Cards,
            }),
            Payout = payout,
            BalanceBefore = before,
            BalanceAfter = user.Coins,
        };
    }

    private static async Task<CasinoRound> CreateBlackjackRoundAsync(
        AppDb db,
        User user,
        CasinoRoundRequest body)
    {
        var state = BlackjackMath.Deal(body.Bet);
        if (state.Status == "complete")
            await GrantBlackjackRewardsAsync(db, user.Id, state);
        var before = user.Coins;
        user.Coins = checked(user.Coins - body.Bet + state.Payout);
        return new CasinoRound
        {
            UserId = user.Id,
            GameId = BlackjackId,
            RulesVersion = BlackjackRules,
            IdempotencyKey = body.IdempotencyKey,
            Bet = body.Bet,
            OutcomeJson = JsonSerializer.Serialize(state),
            Payout = state.Payout,
            BalanceBefore = before,
            BalanceAfter = user.Coins,
        };
    }

    private static async Task GrantBlackjackRewardsAsync(AppDb db, int userId, BlackjackState state)
    {
        var wonWithTwentyOne = (state.Outcome is "player-blackjack" or "player-win" or "dealer-bust")
            && BlackjackMath.Score(state.PlayerCards).Total == 21;
        var cards = state.Outcome == "player-blackjack" ? new[] { MeowthDealerId } : [];
        state.BoostersAwarded = wonWithTwentyOne ? 1 : 0;
        var grant = await CardGameEndpoints.GrantCasinoRewardsAsync(
            db, userId, state.BoostersAwarded, cards);
        state.BoosterBalance = grant.BoosterBalance;
        state.CardsAwarded = grant.Cards.ToList();
    }

    private static bool IsGame(string gameId) =>
        gameId.Equals(ArrangeDiceId, StringComparison.OrdinalIgnoreCase)
        || gameId.Equals(NerdSlotsId, StringComparison.OrdinalIgnoreCase)
        || gameId.Equals(BlackjackId, StringComparison.OrdinalIgnoreCase);

    private static int[] BetsFor(string gameId) => gameId.ToLowerInvariant() switch
    {
        ArrangeDiceId => ArrangeDiceBets,
        NerdSlotsId => SlotBets,
        BlackjackId => BlackjackBets,
        _ => [],
    };

    private static object GameSnapshot(string gameId, int coins, object? activeRound = null) =>
        gameId.ToLowerInvariant() switch
    {
        ArrangeDiceId => new
        {
            id = ArrangeDiceId,
            name = "Grandia III · Arrange Dice",
            rulesVersion = ArrangeDiceRules,
            cards = ArrangeDiceMath.AvailableCards,
            cardsToChoose = 7,
            initialRolls = 5,
            maxRolls = ArrangeDiceMath.MaxRolls,
            bets = ArrangeDiceBets,
            coins,
            payouts = new[]
            {
                new { run = 3, multiplier = 4, card = (string?)null },
                new { run = 4, multiplier = 12, card = (string?)null },
                new { run = 5, multiplier = 40, card = (string?)null },
                new { run = 6, multiplier = 80, card = (string?)PikachuPlayerId },
                new { run = 7, multiplier = 200, card = (string?)MewtwoKingId },
            },
            deuce = "Repete o lançamento e concede uma rodada extra.",
            boxcars = "Remove uma rodada futura e permite levantar qualquer carta.",
            repeatedSequence = new[]
            {
                new { repeats = 2, multiplier = 3 },
                new { repeats = 3, multiplier = 20 },
            },
            repeatedRewards = new[]
            {
                new { repeats = 4, card = QuadraId },
                new { repeats = 5, card = QuinaId },
            },
            activeRound,
        },
        NerdSlotsId => new
        {
            id = NerdSlotsId,
            name = "Nerd Slots",
            rulesVersion = NerdSlotsRules,
            bets = SlotBets,
            coins,
            symbols = NerdSlotsMath.Symbols,
            triplePayouts = NerdSlotsMath.TriplePayouts,
            specialCombinations = NerdSlotsMath.SpecialCombinations,
            pairMultiplier = 0,
        },
        BlackjackId => new
        {
            id = BlackjackId,
            name = "Blackjack",
            rulesVersion = BlackjackRules,
            bets = BlackjackBets,
            coins,
            dealerStandsOn = 17,
            blackjackPayout = "x5",
            normalPayoutMultiplier = 4,
            blackjackPayoutMultiplier = 5,
            twentyOneBooster = 1,
            naturalCard = MeowthDealerId,
            activeRound,
        },
        _ => new { },
    };

    private static object ToGameResult(CasinoRound round) => round.GameId switch
    {
        ArrangeDiceId => ToArrangeDiceResult(round),
        NerdSlotsId => ToSlotResult(round),
        PokemonSlotsId => ToSlotResult(round),
        BlackjackId => ToBlackjackResult(round),
        _ => new { roundId = round.Id, round.GameId, round.Bet, round.Payout, coins = round.BalanceAfter },
    };

    private static ArrangeDiceState DeserializeArrange(CasinoRound round) =>
        JsonSerializer.Deserialize<ArrangeDiceState>(round.OutcomeJson)
        ?? throw new InvalidOperationException("Estado de Arrange Dice inválido.");

    private static object ToArrangeDiceResult(CasinoRound round) =>
        ToArrangeDiceResult(round, DeserializeArrange(round));

    private static object ToArrangeDiceResult(CasinoRound round, ArrangeDiceState state)
    {
        return new
        {
            roundId = round.Id,
            round.GameId,
            round.RulesVersion,
            round.Bet,
            state.Cards,
            state.Rolls,
            state.LiftedCards,
            state.RollsRemaining,
            state.WildcardPending,
            state.Status,
            state.WinningRun,
            state.SequenceRepeatCard,
            state.SequenceRepeatCount,
            state.RepeatMultiplier,
            state.BestRepeatedSum,
            state.BestRepeatedCount,
            state.Multiplier,
            payout = state.Payout,
            net = state.Status == "complete" ? state.Payout - round.Bet : -round.Bet,
            coins = round.BalanceAfter,
            rewards = new
            {
                boosters = state.BoostersAwarded,
                boosterBalance = state.BoosterBalance,
                cards = state.CardsAwarded,
            },
            round.CreatedUtc,
        };
    }

    private static object ToSlotResult(CasinoRound round)
    {
        using var doc = JsonDocument.Parse(round.OutcomeJson);
        var root = doc.RootElement;
        var symbols = root.GetProperty("symbols").Deserialize<string[]>() ?? [];
        var multiplier = root.GetProperty("multiplier").GetInt32();
        var boosters = root.TryGetProperty("boostersAwarded", out var boostersNode)
            ? boostersNode.GetInt32() : 0;
        var boosterBalance = root.TryGetProperty("boosterBalance", out var balanceNode)
            ? balanceNode.GetInt32() : (int?)null;
        var cards = root.TryGetProperty("cardsAwarded", out var cardsNode)
            ? cardsNode.Deserialize<CardGameReward[]>() ?? [] : [];
        return new
        {
            roundId = round.Id,
            round.GameId,
            round.RulesVersion,
            round.Bet,
            symbols,
            multiplier,
            round.Payout,
            net = round.Payout - round.Bet,
            coins = round.BalanceAfter,
            rewards = new { boosters, boosterBalance, cards },
            round.CreatedUtc,
        };
    }

    private static BlackjackState DeserializeBlackjack(CasinoRound round) =>
        JsonSerializer.Deserialize<BlackjackState>(round.OutcomeJson)
        ?? throw new InvalidOperationException("Estado de blackjack inválido.");

    private static object ToBlackjackResult(CasinoRound round) =>
        ToBlackjackResult(round, DeserializeBlackjack(round));

    private static object ToBlackjackResult(CasinoRound round, BlackjackState state)
    {
        var complete = state.Status == "complete";
        var dealerCards = state.DealerCards.Select((card, index) =>
            !complete && index == 1 ? (object)new { hidden = true } : card).ToArray();
        return new
        {
            roundId = round.Id,
            round.GameId,
            round.RulesVersion,
            round.Bet,
            playerCards = state.PlayerCards,
            dealerCards,
            playerScore = BlackjackMath.Score(state.PlayerCards).Total,
            dealerScore = complete ? BlackjackMath.Score(state.DealerCards).Total : (int?)null,
            state.Status,
            state.Outcome,
            state.Natural,
            payout = state.Payout,
            net = state.Status == "complete" ? state.Payout - round.Bet : -round.Bet,
            coins = round.BalanceAfter,
            rewards = new
            {
                boosters = state.BoostersAwarded,
                boosterBalance = state.BoosterBalance,
                cards = state.CardsAwarded,
            },
            round.CreatedUtc,
        };
    }
}

public static class NerdSlotsMath
{
    public sealed record SpecialCombination(
        string[] Symbols,
        int Boosters,
        string? Card,
        string Label);

    public static readonly string[] Symbols =
        ["bug", "coffee", "code", "d20", "rocket", "booster", "gengar", "charizard", "porygon"];
    public static readonly Dictionary<string, int> TriplePayouts = new()
    {
        ["bug"] = 4,
        ["coffee"] = 6,
        ["code"] = 8,
        ["d20"] = 12,
        ["rocket"] = 20,
    };
    public static readonly SpecialCombination[] SpecialCombinations =
    [
        new(["booster", "booster", "booster"], 1, null, "1 booster"),
        new(["gengar", "gengar", "gengar"], 0, "gengar", "Gengar Glitch"),
        new(["charizard", "charizard", "charizard"], 0, "charizard", "Charizard Arcade"),
        new(["porygon", "porygon", "porygon"], 0, "porygon", "Porygon Jackpot"),
    ];
    private static readonly string[] WeightedSymbols =
    [
        "bug", "bug", "bug", "bug", "coffee", "coffee", "coffee",
        "code", "code", "d20", "d20", "rocket",
        "booster", "booster", "booster", "booster",
        "gengar", "gengar", "charizard", "porygon",
    ];

    public static string Spin() => WeightedSymbols[RandomNumberGenerator.GetInt32(WeightedSymbols.Length)];

    public static int Multiplier(IReadOnlyList<string> symbols)
    {
        if (symbols.Count != 3 || symbols.Any(x => !Symbols.Contains(x)))
            throw new ArgumentException("Rolos inválidos.", nameof(symbols));
        return symbols.Distinct().Count() == 1
            && TriplePayouts.TryGetValue(symbols[0], out var multiplier)
                ? multiplier
                : 0;
    }

    public static SpecialCombination? SpecialReward(IReadOnlyList<string> symbols)
    {
        if (symbols.Count != 3 || symbols.Any(x => !Symbols.Contains(x)))
            throw new ArgumentException("Rolos inválidos.", nameof(symbols));
        return SpecialCombinations.FirstOrDefault(combination =>
            combination.Symbols.SequenceEqual(symbols));
    }
}

public static class BlackjackMath
{
    private static readonly string[] Ranks =
        ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
    private static readonly string[] Suits = ["hearts", "diamonds", "clubs", "spades"];

    public readonly record struct HandScore(int Total, bool Soft);

    private static List<BlackjackCard> ShuffledDeck()
    {
        var deck = Suits.SelectMany(suit => Ranks.Select(rank => new BlackjackCard(rank, suit))).ToList();
        for (var index = deck.Count - 1; index > 0; index--)
        {
            var target = RandomNumberGenerator.GetInt32(index + 1);
            (deck[index], deck[target]) = (deck[target], deck[index]);
        }
        return deck;
    }

    public static BlackjackCard Draw(BlackjackState state)
    {
        if (state.Deck.Count == 0) throw new InvalidOperationException("Baralho vazio.");
        var card = state.Deck[^1];
        state.Deck.RemoveAt(state.Deck.Count - 1);
        return card;
    }

    public static HandScore Score(IReadOnlyList<BlackjackCard> cards)
    {
        var total = 0;
        var aces = 0;
        foreach (var card in cards)
        {
            if (card.Rank == "A") { total += 11; aces++; }
            else if (card.Rank is "J" or "Q" or "K") total += 10;
            else total += int.Parse(card.Rank);
        }
        var soft = aces > 0;
        while (total > 21 && aces-- > 0)
        {
            total -= 10;
            soft = aces > 0;
        }
        return new(total, soft);
    }

    public static BlackjackState Deal(int bet)
    {
        var state = new BlackjackState
        {
            Deck = ShuffledDeck(),
        };
        state.PlayerCards = [Draw(state), Draw(state)];
        state.DealerCards = [Draw(state), Draw(state)];
        var playerNatural = Score(state.PlayerCards).Total == 21;
        var dealerNatural = Score(state.DealerCards).Total == 21;
        if (playerNatural && dealerNatural) Finish(state, bet, "push", true);
        else if (playerNatural) Finish(state, bet, "player-blackjack", true);
        else if (dealerNatural) Finish(state, bet, "dealer-blackjack", true);
        return state;
    }

    public static void PlayDealerAndFinish(BlackjackState state, int bet)
    {
        while (Score(state.DealerCards).Total < 17) state.DealerCards.Add(Draw(state));
        var player = Score(state.PlayerCards).Total;
        var dealer = Score(state.DealerCards).Total;
        if (dealer > 21) Finish(state, bet, "dealer-bust");
        else if (player > dealer) Finish(state, bet, "player-win");
        else if (player < dealer) Finish(state, bet, "dealer-win");
        else Finish(state, bet, "push");
    }

    public static void Finish(BlackjackState state, int bet, string outcome, bool natural = false)
    {
        state.Status = "complete";
        state.Outcome = outcome;
        state.Natural = natural;
        state.Payout = outcome switch
        {
            "player-blackjack" => checked(bet * 5),
            "player-win" or "dealer-bust" => checked(bet * 4),
            "push" => bet,
            _ => 0,
        };
    }
}

public static class ArrangeDiceMath
{
    public static readonly int[] AvailableCards = [3, 4, 5, 6, 7, 8, 9, 10, 11];
    public const int MaxRolls = 15;

    public static bool IsValidArrangement(IReadOnlyList<int>? cards) =>
        cards is { Count: 7 }
        && cards.Distinct().Count() == 7
        && cards.All(AvailableCards.Contains);

    public static ArrangeDiceRoll Roll()
    {
        var die1 = RandomNumberGenerator.GetInt32(1, 7);
        var die2 = RandomNumberGenerator.GetInt32(1, 7);
        return new(die1, die2, die1 + die2);
    }

    public static void Finish(ArrangeDiceState state, int bet)
    {
        if (!IsValidArrangement(state.Cards))
            throw new ArgumentException("Arranjo inválido.", nameof(state));
        if (bet <= 0) throw new ArgumentOutOfRangeException(nameof(bet));
        var lifted = state.LiftedCards.ToHashSet();
        ArrangeDiceRun? winningRun = null;
        for (var start = 0; start < state.Cards.Length;)
        {
            if (!lifted.Contains(state.Cards[start]))
            {
                start++;
                continue;
            }
            var end = start;
            while (end + 1 < state.Cards.Length && lifted.Contains(state.Cards[end + 1])) end++;
            var length = end - start + 1;
            if (length >= 3)
            {
                var multiplier = length switch
                {
                    3 => 4,
                    4 => 12,
                    5 => 40,
                    6 => 80,
                    _ => 200,
                };
                if (winningRun is null || length > winningRun.Length)
                    winningRun = new(start, length, state.Cards.Skip(start).Take(length).ToArray(), multiplier);
            }
            start = end + 1;
        }
        state.WinningRun = winningRun;
        var mostRepeated = state.Rolls
            .GroupBy(roll => roll.Sum)
            .OrderByDescending(group => group.Count())
            .ThenBy(group => group.Key)
            .FirstOrDefault();
        state.BestRepeatedSum = mostRepeated?.Key ?? 0;
        state.BestRepeatedCount = mostRepeated?.Count() ?? 0;

        if (winningRun is not null)
        {
            var sequenceRepeat = winningRun.Cards
                .Select(card => new
                {
                    Card = card,
                    Count = state.Rolls.Count(roll => roll.Sum == card),
                })
                .OrderByDescending(item => item.Count)
                .ThenBy(item => item.Card)
                .First();
            state.SequenceRepeatCard = sequenceRepeat.Card;
            state.SequenceRepeatCount = sequenceRepeat.Count;
            state.RepeatMultiplier = sequenceRepeat.Count >= 3 ? 20
                : sequenceRepeat.Count == 2 ? 3
                : 1;
        }
        state.Multiplier = checked((winningRun?.Multiplier ?? 0) * state.RepeatMultiplier);
        state.Payout = checked(bet * state.Multiplier);
        state.Status = "complete";
    }
}
