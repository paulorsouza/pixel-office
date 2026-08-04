using System.Data;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public sealed record PokemonCasinoStartRequest(string Difficulty, string IdempotencyKey);
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
    /// <summary>Liga da mesa. Fica no estado para a rodada saber a própria régua.</summary>
    public string LeagueId { get; set; } = CardGameLeagues.Master;
    /// <summary>easy | normal | hard — o modo pago ao sentar.</summary>
    public string Difficulty { get; set; } = CasinoLeagueTables.Normal;
    /// <summary>Qual das quatro partidas do modo está em jogo.</summary>
    public int Match { get; set; } = 1;
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
    /// <summary>A faixa travada: a última partida vencida nesta escada.</summary>
    public int MatchesWon { get; set; }
    public int NormalBoostersAwarded { get; set; }
    public int RareBoostersAwarded { get; set; }
    public int LegendaryBoostersAwarded { get; set; }
    public bool ExoticChestAwarded { get; set; }
}

public static class PokemonCasinoTableEndpoints
{
    // Uma mesa por liga, e cada mesa é um jogo próprio no histórico do cassino:
    // assim "qual foi minha última rodada" continua sendo uma pergunta por mesa.
    private static string GameIdFor(string leagueId) => $"pokemon-card-table-{leagueId}";
    private const string RulesVersion = "2026-08-03.1";
    private const string MewtwoKingId = "special-casino-mewtwo";
    private const int DeckSize = 15;
    private const int OpeningHand = 6;
    private static readonly string[] PowerUpSides = ["top", "right", "bottom", "left"];

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
        api.MapGet("/cardgame/casino-table", Tables);
        api.MapGet("/cardgame/casino-table/{leagueId}", Snapshot);
        api.MapPost("/cardgame/casino-table/{leagueId}/start", Start);
        api.MapPost("/cardgame/casino-table/{leagueId}/move", Move);
        api.MapPost("/cardgame/casino-table/{leagueId}/leave", Leave);
    }

    /// <summary>O salão: as quatro mesas com preço, prêmio e situação de cada uma.</summary>
    private static async Task<IResult> Tables(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        var coins = await db.Users.Where(row => row.Id == userId)
            .Select(row => (int?)row.Coins).SingleOrDefaultAsync();
        if (coins is null) return Results.NotFound(new { error = "Jogador não encontrado." });

        var tables = new List<object>();
        foreach (var league in CardGameLeagues.All)
        {
            var (deck, deckError) = await CardGameEndpoints.LoadPlayableDeckAsync(db, userId, league.Id);
            var latest = await LatestRoundAsync(db, userId, league.Id);
            tables.Add(new
            {
                leagueId = league.Id,
                name = league.Name,
                maxPower = league.MaxPower,
                difficulties = DifficultyTable(league.Id),
                deckReady = deck.Length > 0,
                deckError,
                round = latest is null ? null : RoundPayload(latest, Deserialize(latest)),
            });
        }
        return Results.Ok(new { name = "Liga Pokémon da Casa", coins, tables });
    }

    private static async Task<IResult> Snapshot(
        HttpRequest req,
        string leagueId,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!CasinoLeagueTables.IsKnownTable(leagueId))
            return Results.NotFound(new { error = "Mesa desconhecida." });
        await using var db = await factory.CreateDbContextAsync();
        var latest = await LatestRoundAsync(db, userId, leagueId);
        var coins = await db.Users.Where(row => row.Id == userId)
            .Select(row => (int?)row.Coins).SingleOrDefaultAsync();
        if (coins is null) return Results.NotFound(new { error = "Jogador não encontrado." });
        var league = CardGameLeagues.Find(leagueId)!;
        var (deck, deckError) = await CardGameEndpoints.LoadPlayableDeckAsync(db, userId, leagueId);
        return Results.Ok(new
        {
            gameId = GameIdFor(leagueId),
            leagueId,
            name = $"Liga Pokémon da Casa · {league.Name}",
            maxPower = league.MaxPower,
            coins,
            deckReady = deck.Length > 0,
            deckError,
            difficulties = DifficultyTable(leagueId),
            round = latest is null ? null : RoundPayload(latest, Deserialize(latest)),
        });
    }

    private static async Task<IResult> Start(
        HttpRequest req,
        string leagueId,
        PokemonCasinoStartRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!CasinoLeagueTables.IsKnownTable(leagueId))
            return Results.NotFound(new { error = "Mesa desconhecida." });
        if (!CasinoLeagueTables.IsKnownDifficulty(body.Difficulty))
            return Results.BadRequest(new { error = "Dificuldade desconhecida." });
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

        var latest = await LatestRoundAsync(db, userId, leagueId);
        if (latest is not null)
        {
            var previous = Deserialize(latest);
            if (previous.Status == "ongoing")
            {
                await transaction.CommitAsync();
                return Results.Ok(RoundPayload(latest, previous));
            }
        }

        // A mesa é da liga: quem senta joga com o baralho DAQUELA liga, e o teto de
        // poder vale para o jogador nas três dificuldades. Quem passa dele é a casa.
        var (deck, deckError) = await CardGameEndpoints.LoadPlayableDeckAsync(db, userId, leagueId);
        if (deck.Length == 0) return Results.BadRequest(new { error = deckError });

        // Continuar a escada é de graça: o preço do modo foi pago na primeira
        // partida. Só uma sequência NOVA cobra de novo.
        var previousRun = latest is null ? null : Deserialize(latest);
        var continuing = previousRun is not null
            && previousRun.Status == "won"
            && previousRun.Difficulty == body.Difficulty
            && previousRun.Match < CasinoLeagueTables.MatchesPerRun
            && !previousRun.RewardGranted;
        var match = continuing ? previousRun!.Match + 1 : 1;
        var difficulty = CasinoLeagueTables.Find(leagueId, body.Difficulty);
        var user = await db.Users.SingleOrDefaultAsync(row => row.Id == userId);
        if (user is null) return Results.NotFound(new { error = "Jogador não encontrado." });
        var price = continuing ? 0 : difficulty.Price;
        if (user.Coins < price)
            return Results.Conflict(new
            {
                error = $"O modo {difficulty.Name} custa {difficulty.Price} moedas.",
                coins = user.Coins,
                price = difficulty.Price,
            });

        var state = CreateBattle(leagueId, difficulty, match, deck);
        state.MatchesWon = continuing ? previousRun!.MatchesWon : 0;
        if (state.CurrentPlayer == 1) PlayHouseTurn(state);
        var balanceBefore = user.Coins;
        user.Coins = checked(user.Coins - price);
        var round = new CasinoRound
        {
            UserId = userId,
            GameId = GameIdFor(leagueId),
            RulesVersion = RulesVersion,
            IdempotencyKey = body.IdempotencyKey,
            Bet = price,
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
        string leagueId,
        PokemonCasinoMoveRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!Guid.TryParse(body.IdempotencyKey, out _))
            return Results.BadRequest(new { error = "Chave de idempotência inválida." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var gameId = GameIdFor(leagueId);
        var round = await db.CasinoRounds.SingleOrDefaultAsync(row =>
            row.Id == body.RoundId && row.UserId == userId && row.GameId == gameId);
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
        if (state.Status == "won")
        {
            state.MatchesWon = state.Match;
            // Vencer a quarta fecha a escada: paga na hora, não há o que subir.
            if (state.Match == CasinoLeagueTables.MatchesPerRun)
                await GrantRewardAsync(db, userId, state);
        }
        // Perder entrega a faixa que já estava travada — e nada se ainda não havia.
        else if (state.Status == "lost") await GrantRewardAsync(db, userId, state);
        round.OutcomeJson = JsonSerializer.Serialize(state);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(RoundPayload(round, state));
    }

    private static async Task<IResult> Leave(
        HttpRequest req,
        string leagueId,
        PokemonCasinoLeaveRequest body,
        IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (!Guid.TryParse(body.IdempotencyKey, out _))
            return Results.BadRequest(new { error = "Chave de idempotência inválida." });

        await using var db = await factory.CreateDbContextAsync();
        await using var transaction = await db.Database.BeginTransactionAsync(IsolationLevel.Serializable);
        var gameId = GameIdFor(leagueId);
        var round = await db.CasinoRounds.SingleOrDefaultAsync(row =>
            row.Id == body.RoundId && row.UserId == userId && row.GameId == gameId);
        if (round is null) return Results.NotFound(new { error = "Partida da mesa não encontrada." });
        var state = Deserialize(round);
        if (state.ActionKeys.Contains(body.IdempotencyKey) || state.RewardGranted)
        {
            await transaction.CommitAsync();
            return Results.Ok(RoundPayload(round, state));
        }

        // Sacar: leva a faixa travada. No meio de uma partida em andamento, a
        // partida corrente é abandonada — a faixa dela não conta.
        if (state.Status is "ongoing" or "won") state.Status = "left";
        state.ActionKeys.Add(body.IdempotencyKey);
        await GrantRewardAsync(db, userId, state);
        round.OutcomeJson = JsonSerializer.Serialize(state);
        await db.SaveChangesAsync();
        await transaction.CommitAsync();
        return Results.Ok(RoundPayload(round, state));
    }

    private static PokemonCasinoState CreateBattle(
        string leagueId,
        CasinoTableDifficulty difficulty,
        int match,
        string[] playerDeck)
    {
        var player = Shuffle(playerDeck);
        var house = HouseDeck(difficulty.Levels[match - 1]);
        return new PokemonCasinoState
        {
            LeagueId = leagueId,
            Difficulty = difficulty.Id,
            Match = match,
            CurrentPlayer = RandomNumberGenerator.GetInt32(2),
            PlayerHand = player.Take(OpeningHand).ToList(),
            PlayerDrawPile = player.Skip(OpeningHand).ToList(),
            HouseHand = house.Take(OpeningHand).ToList(),
            HouseDrawPile = house.Skip(OpeningHand).ToList(),
        };
    }

    /// <summary>
    /// O baralho da casa. É AQUI que a dificuldade mora.
    /// </summary>
    /// <remarks>
    /// No Fácil e no Normal a casa respeita o mesmo teto que você — o que muda é de
    /// onde ela tira as cartas dentro dele, e isso sobe a cada partida da escada.
    /// No Hard ela passa do seu teto (ver CasinoLeagueTables) e ganha cartas
    /// energizadas em número crescente, com o Mewtwo Rei na quarta.
    ///
    /// O jogador nunca escapa do teto da própria liga — é essa assimetria que
    /// impede a última faixa de sair toda vez.
    /// </remarks>
    private static string[] HouseDeck(CasinoTableLevel level)
    {
        var ordered = CardGameCatalog.All.Values
            .Where(card => string.IsNullOrEmpty(card.Variant))
            .Where(card => level.HouseMaxPower is not int cap || card.PowerRating <= cap)
            .OrderBy(card => card.PowerRating)
            .ThenBy(card => card.Id, StringComparer.Ordinal)
            .ToList();
        var bandSize = Math.Max(DeckSize, ordered.Count / 4);
        var start = Math.Min(ordered.Count - bandSize, (int)(ordered.Count * level.HouseBandStart));
        var selected = Shuffle(ordered.Skip(Math.Max(0, start)).Take(bandSize).Select(card => card.Id))
            .Take(level.HouseBoss ? DeckSize - 1 : DeckSize)
            .ToArray();
        var powerUps = level.HousePowerUps;
        for (var index = 0; index < Math.Min(powerUps, selected.Length); index++)
            selected[index] = CardGameEndpoints.FormatCardToken(
                selected[index],
                PowerUpSides[RandomNumberGenerator.GetInt32(PowerUpSides.Length)]);
        return level.HouseBoss ? [MewtwoKingId, .. selected] : selected;
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
        // No Fácil a casa joga ao acaso; do Normal para cima ela joga para ganhar.
        var choice = state.Difficulty == CasinoLeagueTables.Easy
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
        // O peso do poder cresce com a dificuldade: no Fácil a casa quase ignora a
        // força da carta, no Hard ela guarda as melhores para o momento certo.
        var weight = state.Difficulty switch
        {
            CasinoLeagueTables.Easy => 1,
            CasinoLeagueTables.Normal => 3,
            _ => 6,
        };
        return captures * 1_000 + printedPower * weight + centerBonus;
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

    private static async Task GrantRewardAsync(AppDb db, int userId, PokemonCasinoState state)
    {
        if (state.RewardGranted) return;
        if (state.MatchesWon <= 0)
        {
            // Perdeu a primeira: pagou o modo e não travou faixa nenhuma.
            state.RewardGranted = true;
            return;
        }
        var reward = CasinoLeagueTables.PrizeAt(state.LeagueId, state.Difficulty, state.MatchesWon);
        if (reward.Normal > 0)
            await CardGameEndpoints.GrantBoostersAsync(db, userId, reward.Normal, "standard");
        if (reward.Rare > 0)
            await CardGameEndpoints.GrantBoostersAsync(db, userId, reward.Rare, "rare");
        // O Lendário continua sendo o que moeda nenhuma compra — e sai de um lugar
        // só: o Hard da MASTER. Ver CasinoLeagueTables e ECONOMIA.md §6.
        if (reward.Legendary > 0)
            await CardGameEndpoints.GrantBoostersAsync(db, userId, reward.Legendary, "legendary");
        // Mesma ideia do lado do equipamento: fonte única de Baú Exótico no jogo.
        if (reward.ExoticChest)
            await Lootboxes.GrantAsync(db, userId, LootboxCatalog.Exotic);
        state.NormalBoostersAwarded = reward.Normal;
        state.RareBoostersAwarded = reward.Rare;
        state.LegendaryBoostersAwarded = reward.Legendary;
        state.ExoticChestAwarded = reward.ExoticChest;
        state.RewardGranted = true;
    }

    private static async Task<CasinoRound?> LatestRoundAsync(AppDb db, int userId, string leagueId)
    {
        var gameId = GameIdFor(leagueId);
        return await db.CasinoRounds.Where(row => row.UserId == userId && row.GameId == gameId)
            .OrderByDescending(row => row.Id).FirstOrDefaultAsync();
    }

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
        var difficulty = CasinoLeagueTables.Find(state.LeagueId, state.Difficulty);
        var level = difficulty.Levels[Math.Clamp(state.Match, 1, CasinoLeagueTables.MatchesPerRun) - 1];
        var locked = state.MatchesWon > 0
            ? CasinoLeagueTables.PrizeAt(state.LeagueId, state.Difficulty, state.MatchesWon)
            : null;
        return new
        {
            roundId = round.Id,
            round.RulesVersion,
            state.LeagueId,
            state.Difficulty,
            difficultyName = difficulty.Name,
            state.Match,
            matches = CasinoLeagueTables.MatchesPerRun,
            state.MatchesWon,
            houseMaxPower = level.HouseMaxPower,
            houseCopy = difficulty.HouseCopy,
            state.Status,
            state.CurrentPlayer,
            state.Turn,
            playerHand = state.PlayerHand,
            playerDrawCount = state.PlayerDrawPile.Count,
            houseHandCount = state.HouseHand.Count,
            houseDrawCount = state.HouseDrawPile.Count,
            housePowerUps = level.HousePowerUps,
            houseBoss = level.HouseBoss ? new
            {
                cardId = MewtwoKingId,
                name = CardGameCatalog.All[MewtwoKingId].Name,
            } : null,
            board = state.Board,
            score,
            // `prize` é a faixa que esta partida coloca em jogo; `lockedPrize` é a
            // que já está garantida e sai se a pessoa sacar agora.
            prize = level.Prize,
            lockedPrize = locked,
            prizeTaken = state.RewardGranted && state.MatchesWon > 0,
            price = round.Bet,
            coins = round.BalanceAfter,
        };
    }

    private static object[] DifficultyTable(string leagueId) => CasinoLeagueTables.Difficulties(leagueId)
        .Select(entry => (object)new
        {
            entry.Id,
            entry.Name,
            entry.Price,
            entry.HouseMaxPower,
            entry.HouseCopy,
            matches = CasinoLeagueTables.MatchesPerRun,
            levels = entry.Levels.Select(level => new
            {
                level.Level,
                prize = level.Prize,
                level.HouseBoss,
                level.HousePowerUps,
            }).ToArray(),
        }).ToArray();

    private static string[] Shuffle(IEnumerable<string> cards) =>
        cards.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).ToArray();
}
