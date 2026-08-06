namespace VirtualOffice.Api;

public sealed record CasinoPrize(
    int Normal,
    int Rare,
    int UltraRare,
    int Legendary,
    bool ExoticChest);

public sealed record CasinoTableLevel(
    int Level,
    CasinoPrize Prize,
    int HousePowerUps,
    bool HouseBoss,
    /// <summary>Teto que a CASA respeita; nulo = catálogo inteiro.</summary>
    int? HouseMaxPower,
    /// <summary>Onde a banda de poder da casa começa dentro do pool permitido.</summary>
    double HouseBandStart);

public sealed record CasinoTableDifficulty(
    string Id,
    string Name,
    int Price,
    int? HouseMaxPower,
    string HouseCopy,
    CasinoTableLevel[] Levels);

/// <summary>
/// As quatro mesas da Liga Pokémon da Casa — uma mesa FÍSICA por liga, dentro do
/// Casino Nerd — e o que acontece em cada uma.
/// </summary>
/// <remarks>
/// Cada mesa tem três modos: Fácil (50), Normal (100) e Hard (200). O preço é pago
/// UMA vez, ao sentar; dentro do modo há uma escada de quatro partidas, e cada
/// vitória sobe uma faixa de prêmio. Dá para sacar entre uma partida e outra: quem
/// perde leva a faixa que já tinha travado, quem insiste arrisca subir mais.
///
/// As faixas são uma escada só, compartilhada pelas doze combinações. O índice é
/// a soma de três degraus:
///
///     faixa = (partida - 1) + degrau da dificuldade + degrau da liga
///
/// Isso garante, sem tabela de 48 linhas para manter, que o prêmio SEMPRE cresce
/// quando qualquer um dos três sobe — e que a última faixa, a única que paga
/// Booster Lendário e Baú Exótico, só é alcançável no ponto mais extremo do jogo:
/// quarta partida do Hard da Master (3 + 2 + 3 = 8).
///
/// O jogador respeita o teto da própria liga nos três modos. Quem passa dele é a
/// casa, e só no Hard — jogando com o teto da liga DE CIMA, não com o catálogo
/// inteiro. Se fosse absoluto, a mesa Common enfrentaria Lendários de 57 com um
/// baralho de 24: seria a mais difícil do salão pagando o menor prêmio.
/// </remarks>
public static class CasinoLeagueTables
{
    public const string Easy = "easy";
    public const string Normal = "normal";
    public const string Hard = "hard";

    /// <summary>Partidas em cada modo. Quatro é o mínimo para a escada ter faixas.</summary>
    public const int MatchesPerRun = 4;

    public static readonly string[] Order = [Easy, Normal, Hard];

    private static readonly IReadOnlyDictionary<string, (string Name, int Price, int Step)> Tiers =
        new Dictionary<string, (string, int, int)>(StringComparer.Ordinal)
        {
            [Easy] = ("Fácil", 50, 0),
            [Normal] = ("Normal", 100, 1),
            [Hard] = ("Hard", 200, 2),
        };

    private static readonly IReadOnlyDictionary<string, int> LeagueStep =
        new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["common"] = 0,
            ["great"] = 1,
            ["ultra"] = 2,
            ["master"] = 3,
        };

    /// <summary>No Hard a casa joga com o teto da liga de cima; nulo = sem teto.</summary>
    private static readonly IReadOnlyDictionary<string, int?> HardHouseCap =
        new Dictionary<string, int?>(StringComparer.Ordinal)
        {
            ["common"] = 34,
            ["great"] = 44,
            ["ultra"] = null,
            ["master"] = null,
        };

    // A escada de faixas, da mais magra à mais gorda. O booster do chefão e o Baú
    // NÃO estão aqui: são o bônus de chefão, somado em `PrizeAt`.
    private static readonly CasinoPrize[] Ladder =
    [
        new(1, 0, 0, 0, false),
        new(2, 0, 0, 0, false),
        new(3, 0, 0, 0, false),
        new(1, 1, 0, 0, false),
        new(2, 2, 0, 0, false),
        new(0, 4, 0, 0, false),
        new(0, 6, 0, 0, false),
        new(0, 8, 0, 0, false),
        new(0, 10, 0, 0, false),
    ];

    public static bool IsKnownTable(string? leagueId) =>
        leagueId is not null && LeagueStep.ContainsKey(leagueId);

    public static bool IsKnownDifficulty(string? difficultyId) =>
        difficultyId is not null && Tiers.ContainsKey(difficultyId);

    /// <summary>O chefão: a última partida do Hard, em qualquer liga.</summary>
    public static bool IsBossMatch(string difficultyId, int match) =>
        difficultyId == Hard && match == MatchesPerRun;

    public static CasinoPrize PrizeAt(string leagueId, string difficultyId, int match)
    {
        var index = Math.Clamp(match, 1, MatchesPerRun) - 1
            + Tiers[difficultyId].Step
            + LeagueStep[leagueId];
        var prize = Ladder[Math.Clamp(index, 0, Ladder.Length - 1)];
        if (!IsBossMatch(difficultyId, match)) return prize;
        // Derrubar o chefão paga booster do topo em toda liga — mas não o mesmo:
        // as três de baixo pagam ULTRARRARO, e o Lendário (mais o Baú Exótico)
        // continua exclusivo da Master. É o que mantém o item que moeda nenhuma
        // compra atrás do baralho irrestrito, sem deixar as mesas de baixo sem
        // um prêmio de chefão que valha a pena.
        var isMaster = leagueId == CardGameLeagues.Master;
        return prize with
        {
            UltraRare = prize.UltraRare + (isMaster ? 0 : 1),
            Legendary = prize.Legendary + (isMaster ? 1 : 0),
            ExoticChest = prize.ExoticChest || isMaster,
        };
    }

    public static CasinoTableDifficulty[] Difficulties(string leagueId)
    {
        var leagueCap = CardGameLeagues.Find(leagueId)?.MaxPower;
        return Order.Select(id =>
        {
            var (name, price, _) = Tiers[id];
            var houseCap = id == Hard ? HardHouseCap[leagueId] : leagueCap;
            var levels = Enumerable.Range(1, MatchesPerRun).Select(match => new CasinoTableLevel(
                Level: match,
                Prize: PrizeAt(leagueId, id, match),
                // Dentro do modo a casa aperta a cada partida.
                HousePowerUps: id switch
                {
                    Easy => match >= 4 ? 1 : 0,
                    Normal => match - 1,
                    _ => match + 1,
                },
                // O Mewtwo Rei 15/15/15/15 é do chefão da MASTER e de mais ninguém:
                // é a mesa do Baú Exótico, e é lá que a carta impossível pertence.
                HouseBoss: IsBossMatch(id, match) && leagueId == CardGameLeagues.Master,
                // O chefão sobe o teto da casa, mas RELATIVO ao seu: +20 sobre o
                // limite da liga. Sem teto nenhum, a Common (baralho de 24 contra
                // casa de 55) virava impossível em vez de difícil.
                HouseMaxPower: IsBossMatch(id, match) ? BossCap(leagueCap) : houseCap,
                HouseBandStart: id switch
                {
                    Easy => 0.00 + 0.12 * (match - 1),
                    Normal => 0.45 + 0.13 * (match - 1),
                    _ => 0.70 + 0.10 * (match - 1),
                })).ToArray();
            return new CasinoTableDifficulty(
                Id: id,
                Name: name,
                Price: price,
                HouseMaxPower: houseCap,
                HouseCopy: HouseCopy(id, leagueCap, houseCap),
                Levels: levels);
        }).ToArray();
    }

    /// <summary>
    /// O teto da casa no chefão: vinte pontos acima do seu. Fica muito acima do que
    /// você pode levar — a Common encara 44 com baralho de 24 — sem virar a parede
    /// intransponível que o catálogo inteiro seria.
    /// </summary>
    private const int BossCapMargin = 20;

    private static int? BossCap(int? leagueCap) =>
        leagueCap is int cap ? cap + BossCapMargin : null;

    public static CasinoTableDifficulty Find(string leagueId, string difficultyId) =>
        Difficulties(leagueId).Single(entry => entry.Id == difficultyId);

    public static CasinoTableLevel Level(string leagueId, string difficultyId, int match) =>
        Find(leagueId, difficultyId).Levels[Math.Clamp(match, 1, MatchesPerRun) - 1];

    private static string HouseCopy(string difficultyId, int? leagueCap, int? houseCap)
    {
        if (difficultyId == Easy)
            return "A casa fica dentro do teto da sua liga e começa pelas cartas mais fracas dele. "
                + "Joga ao acaso, e só aperta um pouco na última partida.";
        if (difficultyId == Normal)
            return "A casa fica dentro do teto da sua liga, mas já parte da metade forte dele e "
                + "joga para ganhar. Ganha uma carta energizada a cada partida.";
        var passa = leagueCap is null
            ? "A casa vem do topo do catálogo"
            : houseCap is int cap
                ? $"Nas três primeiras a casa ignora o teto de {leagueCap} e joga até {cap}"
                : $"Nas três primeiras a casa ignora o teto de {leagueCap} e vem do catálogo inteiro";
        var chefe = leagueCap is int limite
            ? $"a casa sobe para {limite + BossCapMargin} e paga o Booster Ultrarraro"
            : "a casa vem do catálogo inteiro com o Mewtwo Rei, e paga o Booster Lendário mais o Baú Exótico";
        return $"{passa}. Na QUARTA, o chefão: {chefe}. "
            + "Você continua preso ao teto da sua liga o tempo todo.";
    }
}
