using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using Microsoft.AspNetCore.SignalR;

namespace VirtualOffice.Api;

public sealed class CardGameCatalogFile
{
    public int Version { get; set; }
    public int BaseCount { get; set; }
    public List<CardGameDefinition> Cards { get; set; } = [];
}

public sealed class CardGameDefinition
{
    public string Id { get; set; } = "";
    public int Dex { get; set; }
    public string Name { get; set; } = "";
    public List<string> Types { get; set; } = [];
    public Dictionary<string, int> Edges { get; set; } = [];
    public int PowerRating { get; set; }
    public int Generation { get; set; }
    public List<string> EvolvesTo { get; set; } = [];
    public string Rarity { get; set; } = "";
    public string Art { get; set; } = "";
    public string Variant { get; set; } = "";
}

public static class CardGameCatalog
{
    private static readonly Lazy<IReadOnlyDictionary<string, CardGameDefinition>> Definitions = new(Load);
    private static int _baseCount;

    public static IReadOnlyDictionary<string, CardGameDefinition> All => Definitions.Value;
    public static int BaseCount
    {
        get
        {
            _ = Definitions.Value;
            return _baseCount;
        }
    }

    public static bool TryValidateDeck(IEnumerable<string>? ids, out string[] deck, out string error)
    {
        deck = ids?.Where(id => !string.IsNullOrWhiteSpace(id)).ToArray() ?? [];
        if (deck.Length != 15)
        {
            error = "O baralho precisa ter exatamente 15 cartas.";
            return false;
        }
        var references = deck.Select(CardGameEndpoints.ParseCardToken).ToArray();
        if (references.Any(card => card is null))
        {
            error = "O baralho contém uma carta desconhecida.";
            return false;
        }
        if (references.Select(card => card!.Value.CardId).Distinct(StringComparer.Ordinal).Count() != deck.Length)
        {
            error = "O baralho não pode repetir a mesma carta.";
            return false;
        }
        error = "";
        return true;
    }

    private static IReadOnlyDictionary<string, CardGameDefinition> Load()
    {
        var path = Path.Combine(AppContext.BaseDirectory, "Data", "cardgame-catalog.json");
        var json = File.ReadAllText(path);
        var catalog = JsonSerializer.Deserialize<CardGameCatalogFile>(json, new JsonSerializerOptions
        {
            PropertyNameCaseInsensitive = true,
        }) ?? throw new InvalidOperationException("Catálogo do cardgame inválido.");
        if (catalog.BaseCount < 1) throw new InvalidOperationException("Catálogo sem Pokémon-base.");
        _baseCount = catalog.BaseCount;
        return catalog.Cards.ToDictionary(card => card.Id, StringComparer.Ordinal);
    }
}

public sealed class CardGameChallenge
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string ChallengerConnection { get; init; } = "";
    public string TargetConnection { get; init; } = "";
    public string ChallengerName { get; init; } = "";
    public string TargetName { get; init; } = "";
    public string[] ChallengerDeck { get; init; } = [];
    /// <summary>Em qual liga o duelo acontece — quem escolhe é quem desafia.</summary>
    public string LeagueId { get; init; } = CardGameLeagues.Master;
    public DateTime ExpiresUtc { get; init; } = DateTime.UtcNow.AddSeconds(45);
}

public sealed class CardGameBoardCell
{
    public string CardId { get; set; } = "";
    public int Controller { get; set; }
}

public sealed class CardGameMatch
{
    public string Id { get; init; } = Guid.NewGuid().ToString("N");
    public string[] PlayerConnections { get; init; } = [];
    public string[] PlayerNames { get; init; } = [];
    public List<string>[] Hands { get; init; } = [];
    public Queue<string>[] DrawPiles { get; init; } = [];
    public CardGameBoardCell?[] Board { get; init; } = new CardGameBoardCell?[9];
    public int StartingPlayer { get; init; }
    public int CurrentPlayer { get; set; }
    public int Turn { get; set; }
    public string Status { get; set; } = "ongoing";
    public int? Winner { get; set; }
    public int Version { get; set; } = 1;
    public string LeagueId { get; init; } = CardGameLeagues.Master;
}

public partial class OfficeHub
{
    private const double CardChallengeDistancePx = 150;
    private static readonly ConcurrentDictionary<string, CardGameChallenge> CardChallenges = new();
    private static readonly ConcurrentDictionary<string, CardGameMatch> CardMatches = new();
    private static readonly ConcurrentDictionary<string, string> CardMatchByConnection = new();

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

    /// <remarks>
    /// O baralho não vem mais do cliente: com um baralho salvo por liga, o servidor
    /// carrega o da liga escolhida e confere teto, posse e as quinze cartas. Antes
    /// dava para mandar qualquer lista pelo socket e só a posse era checada.
    /// </remarks>
    public async Task ChallengeCardGame(string targetConnectionId, string leagueId)
    {
        ClearExpiredCardChallenges();
        var league = CardGameLeagues.Find(leagueId);
        if (league is null)
        {
            await CardGameErrorAsync("Liga desconhecida.");
            return;
        }
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var challenger)
            || !Presence.Players.TryGetValue(targetConnectionId, out var target)
            || challenger.IsBot || target.IsBot)
        {
            await CardGameErrorAsync("Jogador indisponível.");
            return;
        }
        if (!PlayersCanChallenge(challenger, target))
        {
            await CardGameErrorAsync("Chegue mais perto desse jogador para desafiar.");
            return;
        }
        if (CardMatchByConnection.ContainsKey(challenger.Key) || CardMatchByConnection.ContainsKey(target.Key))
        {
            await CardGameErrorAsync("Um dos jogadores já está em uma partida.");
            return;
        }
        string[] deck;
        await using (var db = await dbFactory.CreateDbContextAsync())
        {
            string deckError;
            (deck, deckError) = await CardGameEndpoints.LoadPlayableDeckAsync(db, challenger.UserId, leagueId);
            if (deck.Length == 0)
            {
                await CardGameErrorAsync(deckError);
                return;
            }
        }

        foreach (var existing in CardChallenges.Values.Where(challenge =>
                     challenge.ChallengerConnection == challenger.Key || challenge.TargetConnection == target.Key))
        {
            CardChallenges.TryRemove(existing.Id, out _);
        }

        var pending = new CardGameChallenge
        {
            ChallengerConnection = challenger.Key,
            TargetConnection = target.Key,
            ChallengerName = challenger.Name,
            TargetName = target.Name,
            ChallengerDeck = deck,
            LeagueId = league.Id,
        };
        CardChallenges[pending.Id] = pending;
        await Clients.Client(target.Key).SendAsync("CardChallengeReceived", new
        {
            challengeId = pending.Id,
            fromKey = challenger.Key,
            fromUserId = challenger.UserId,
            fromName = challenger.Name,
            leagueId = league.Id,
            leagueName = league.Name,
            leagueMaxPower = league.MaxPower,
            expiresUtc = pending.ExpiresUtc,
        });
        await Clients.Caller.SendAsync("CardChallengeSent", new
        {
            challengeId = pending.Id,
            targetName = target.Name,
            leagueId = league.Id,
            leagueName = league.Name,
        });
    }

    /// <remarks>A liga é a do desafio: quem aceita joga com o baralho DAQUELA liga.</remarks>
    public async Task AcceptCardGameChallenge(string challengeId)
    {
        ClearExpiredCardChallenges();
        if (!CardChallenges.TryRemove(challengeId, out var pending)
            || pending.TargetConnection != Context.ConnectionId)
        {
            await CardGameErrorAsync("Esse desafio expirou.");
            return;
        }
        if (!Presence.Players.TryGetValue(pending.ChallengerConnection, out var challenger)
            || !Presence.Players.TryGetValue(pending.TargetConnection, out var target)
            || !PlayersCanChallenge(challenger, target))
        {
            await CardGameErrorAsync("O desafiante não está mais por perto.");
            return;
        }
        if (CardMatchByConnection.ContainsKey(challenger.Key) || CardMatchByConnection.ContainsKey(target.Key))
        {
            await CardGameErrorAsync("Um dos jogadores já está em uma partida.");
            return;
        }
        string[] targetDeck;
        await using (var db = await dbFactory.CreateDbContextAsync())
        {
            string deckError;
            (targetDeck, deckError) = await CardGameEndpoints.LoadPlayableDeckAsync(
                db, target.UserId, pending.LeagueId);
            if (targetDeck.Length == 0)
            {
                await CardGameErrorAsync(deckError);
                return;
            }
        }

        var match = CreateCardGameMatch(pending, targetDeck);
        CardMatches[match.Id] = match;
        CardMatchByConnection[challenger.Key] = match.Id;
        CardMatchByConnection[target.Key] = match.Id;
        await Clients.Clients(match.PlayerConnections).SendAsync("CardMatchStarted", new { matchId = match.Id });
        await SendCardMatchStateAsync(match);
    }

    public async Task DeclineCardGameChallenge(string challengeId)
    {
        if (!CardChallenges.TryRemove(challengeId, out var pending)
            || pending.TargetConnection != Context.ConnectionId) return;
        await Clients.Client(pending.ChallengerConnection).SendAsync("CardChallengeDeclined", new
        {
            challengeId,
            targetName = pending.TargetName,
        });
    }

    public async Task CardGameMove(string matchId, string cardId, int cellIndex, int expectedVersion)
    {
        if (!CardMatches.TryGetValue(matchId, out var match))
        {
            await CardGameErrorAsync("Partida não encontrada.");
            return;
        }

        string? error;
        lock (match)
        {
            error = ApplyCardGameMove(match, Context.ConnectionId, cardId, cellIndex, expectedVersion);
        }
        if (error is not null)
        {
            await CardGameErrorAsync(error);
            return;
        }
        await SendCardMatchStateAsync(match);
    }

    public async Task ResignCardGame(string matchId)
    {
        if (!CardMatches.TryGetValue(matchId, out var match)) return;
        lock (match)
        {
            var player = Array.IndexOf(match.PlayerConnections, Context.ConnectionId);
            if (player < 0 || match.Status != "ongoing") return;
            match.Status = "finished";
            match.Winner = player == 0 ? 1 : 0;
            match.Version++;
        }
        await SendCardMatchStateAsync(match);
        RemoveCardMatch(match);
    }

    private static CardGameMatch CreateCardGameMatch(CardGameChallenge pending, string[] targetDeck)
    {
        var decks = new[] { Shuffle(pending.ChallengerDeck), Shuffle(targetDeck) };
        var startingPlayer = RandomNumberGenerator.GetInt32(2);
        return new CardGameMatch
        {
            PlayerConnections = [pending.ChallengerConnection, pending.TargetConnection],
            PlayerNames = [pending.ChallengerName, pending.TargetName],
            LeagueId = pending.LeagueId,
            Hands =
            [
                decks[0].Take(6).ToList(),
                decks[1].Take(6).ToList(),
            ],
            DrawPiles =
            [
                new Queue<string>(decks[0].Skip(6)),
                new Queue<string>(decks[1].Skip(6)),
            ],
            StartingPlayer = startingPlayer,
            CurrentPlayer = startingPlayer,
        };
    }

    private static string[] Shuffle(IEnumerable<string> cards) =>
        cards.OrderBy(_ => RandomNumberGenerator.GetInt32(int.MaxValue)).ToArray();

    private static string? ApplyCardGameMove(
        CardGameMatch match,
        string connectionId,
        string cardId,
        int cellIndex,
        int expectedVersion)
    {
        if (match.Status != "ongoing") return "A partida já terminou.";
        if (match.Version != expectedVersion) return "A partida foi atualizada; tente novamente.";
        var player = Array.IndexOf(match.PlayerConnections, connectionId);
        if (player < 0) return "Você não participa desta partida.";
        if (match.CurrentPlayer != player) return "Ainda não é sua vez.";
        if (cellIndex is < 0 or >= 9) return "Casa inválida.";
        if (match.Board[cellIndex] is not null) return "Essa casa já está ocupada.";
        if (!match.Hands[player].Remove(cardId)) return "Essa carta não está na sua mão.";

        match.Board[cellIndex] = new CardGameBoardCell { CardId = cardId, Controller = player };
        CaptureCardGameNeighbors(match, cellIndex, player);
        if (match.DrawPiles[player].TryDequeue(out var drawn)) match.Hands[player].Add(drawn);

        match.Turn++;
        match.Version++;
        if (match.Turn == 9)
        {
            match.Status = "finished";
            var score0 = match.Board.Count(cell => cell?.Controller == 0);
            match.Winner = score0 >= 5 ? 0 : 1;
        }
        else
        {
            match.CurrentPlayer = player == 0 ? 1 : 0;
        }
        return null;
    }

    private static void CaptureCardGameNeighbors(CardGameMatch match, int cellIndex, int player)
    {
        var row = cellIndex / 3;
        var col = cellIndex % 3;
        var directions = new[]
        {
            (Side: "top", Opposite: "bottom", Row: -1, Col: 0),
            (Side: "right", Opposite: "left", Row: 0, Col: 1),
            (Side: "bottom", Opposite: "top", Row: 1, Col: 0),
            (Side: "left", Opposite: "right", Row: 0, Col: -1),
        };
        var placedRef = CardGameEndpoints.ParseCardToken(match.Board[cellIndex]!.CardId)!.Value;
        var placed = CardGameCatalog.All[placedRef.CardId];
        foreach (var direction in directions)
        {
            var neighborRow = row + direction.Row;
            var neighborCol = col + direction.Col;
            if (neighborRow is < 0 or >= 3 || neighborCol is < 0 or >= 3) continue;
            var neighborIndex = neighborRow * 3 + neighborCol;
            var neighbor = match.Board[neighborIndex];
            if (neighbor is null || neighbor.Controller == player) continue;
            var defendingRef = CardGameEndpoints.ParseCardToken(neighbor.CardId)!.Value;
            var defending = CardGameCatalog.All[defendingRef.CardId];
            var attack = PrintedEdge(placed, placedRef, direction.Side)
                + (HasTypeAdvantage(placed, defending) ? 1 : 0);
            var defense = PrintedEdge(defending, defendingRef, direction.Opposite)
                + (HasTypeAdvantage(defending, placed) ? 1 : 0);
            if (attack > defense) neighbor.Controller = player;
        }
    }

    private static int PrintedEdge(CardGameDefinition card, CardGameCardRef reference, string side) =>
        card.Edges[side] + (reference.ShinyBonusSide == side ? 1 : 0);

    private static bool HasTypeAdvantage(CardGameDefinition attacker, CardGameDefinition defender) =>
        attacker.Types.Any(type => TypeAdvantages.TryGetValue(type, out var targets)
            && defender.Types.Any(targets.Contains));

    private async Task SendCardMatchStateAsync(CardGameMatch match)
    {
        for (var viewer = 0; viewer < 2; viewer++)
        {
            await Clients.Client(match.PlayerConnections[viewer])
                .SendAsync("CardMatchState", CardMatchPayload(match, viewer));
        }
        if (match.Status == "finished") RemoveCardMatch(match);
    }

    private static object CardMatchPayload(CardGameMatch match, int viewer)
    {
        var score = new[]
        {
            match.Board.Count(cell => cell?.Controller == 0),
            match.Board.Count(cell => cell?.Controller == 1),
        };
        return new
        {
            matchId = match.Id,
            playerIndex = viewer,
            leagueId = match.LeagueId,
            leagueName = CardGameLeagues.Find(match.LeagueId)?.Name ?? "",
            players = new[]
            {
                new { name = match.PlayerNames[0], handCount = match.Hands[0].Count, drawPileCount = match.DrawPiles[0].Count },
                new { name = match.PlayerNames[1], handCount = match.Hands[1].Count, drawPileCount = match.DrawPiles[1].Count },
            },
            hand = match.Hands[viewer].ToArray(),
            board = match.Board.Select(cell => cell is null ? null : new
            {
                cardId = cell.CardId,
                controller = cell.Controller,
            }).ToArray(),
            match.StartingPlayer,
            match.CurrentPlayer,
            match.Turn,
            match.Status,
            match.Winner,
            match.Version,
            score,
        };
    }

    private static bool PlayersCanChallenge(PlayerState challenger, PlayerState target) =>
        challenger.Scene == target.Scene
        && !string.IsNullOrWhiteSpace(challenger.Scene)
        && Presence.Dist(challenger, target) <= CardChallengeDistancePx;

    private Task CardGameErrorAsync(string message) =>
        Clients.Caller.SendAsync("CardGameError", new { message });

    private static void ClearExpiredCardChallenges()
    {
        var now = DateTime.UtcNow;
        foreach (var challenge in CardChallenges.Values.Where(challenge => challenge.ExpiresUtc <= now))
            CardChallenges.TryRemove(challenge.Id, out _);
    }

    private static void RemoveCardMatch(CardGameMatch match)
    {
        CardMatches.TryRemove(match.Id, out _);
        foreach (var connection in match.PlayerConnections)
            CardMatchByConnection.TryRemove(connection, out _);
    }

    private async Task CleanupCardGameConnectionAsync(string connectionId)
    {
        foreach (var challenge in CardChallenges.Values.Where(challenge =>
                     challenge.ChallengerConnection == connectionId || challenge.TargetConnection == connectionId))
        {
            if (!CardChallenges.TryRemove(challenge.Id, out var removed)) continue;
            var other = removed.ChallengerConnection == connectionId
                ? removed.TargetConnection
                : removed.ChallengerConnection;
            await Clients.Client(other).SendAsync("CardChallengeCancelled", new { challengeId = removed.Id });
        }

        if (!CardMatchByConnection.TryGetValue(connectionId, out var matchId)
            || !CardMatches.TryGetValue(matchId, out var match)) return;
        lock (match)
        {
            if (match.Status == "ongoing")
            {
                var player = Array.IndexOf(match.PlayerConnections, connectionId);
                match.Status = "finished";
                match.Winner = player == 0 ? 1 : 0;
                match.Version++;
            }
        }
        await SendCardMatchStateAsync(match);
        RemoveCardMatch(match);
    }
}
