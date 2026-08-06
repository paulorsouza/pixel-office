namespace VirtualOffice.Api;

public sealed record CardGameLeague(string Id, string Name, int? MaxPower, string Hint);

/// <summary>
/// As quatro ligas do cardgame.
/// </summary>
/// <remarks>
/// O teto de cada liga é o PODER IMPRESSO da espécie (<c>PowerRating</c>, a soma
/// das quatro bordas). O +1 do shiny NÃO conta: shiny é acabamento, não uma carta
/// mais forte, e senão a mesma espécie mudaria de liga só por ter brilhado no
/// booster. Por isso a conta olha a definição do catálogo, nunca a instância que
/// o jogador possui — o lado shiny do token é descartado de propósito.
///
/// Espelhado em <c>client-web/src/cardgame/Leagues.js</c>. Aqui é a autoridade: o
/// cliente ajuda a montar o baralho, o servidor é quem recusa um baralho ilegal.
/// Mexeu num teto lá, mexa aqui — os dois lados têm teste com os mesmos números.
/// </remarks>
public static class CardGameLeagues
{
    public const string Master = "master";

    public static readonly IReadOnlyList<CardGameLeague> All =
    [
        new("common", "Common League", 24, "Básicos e pré-evoluções"),
        new("great", "Great League", 34, "Evoluções intermediárias"),
        new("ultra", "Ultra League", 44, "Evoluções finais"),
        new(Master, "Master League", null, "Sem teto — vale tudo"),
    ];

    public static CardGameLeague? Find(string? id) =>
        All.FirstOrDefault(league => string.Equals(league.Id, id, StringComparison.Ordinal));

    /// <summary>Poder que a liga enxerga: o impresso da espécie, sem o +1 do shiny.</summary>
    public static int Power(CardGameDefinition card) =>
        card.PowerRating > 0 ? card.PowerRating : card.Edges.Values.Sum();

    public static bool Allows(string? leagueId, CardGameDefinition card)
    {
        var league = Find(leagueId);
        if (league is null) return false;
        return league.MaxPower is not int max || Power(card) <= max;
    }

    /// <summary>
    /// Confere um baralho JÁ validado por <see cref="CardGameCatalog.TryValidateDeck"/>
    /// contra o teto da liga. A mensagem cita as cartas que estouraram porque
    /// "baralho ilegal" sozinho obriga a pessoa a caçar qual das quinze é.
    /// </summary>
    public static bool TryValidateForLeague(string? leagueId, IEnumerable<string> deck, out string error)
    {
        var league = Find(leagueId);
        if (league is null)
        {
            error = "Liga desconhecida.";
            return false;
        }
        if (league.MaxPower is not int max)
        {
            error = "";
            return true;
        }

        var over = deck
            .Select(CardGameEndpoints.ParseCardToken)
            .Where(reference => reference is not null)
            .Select(reference => CardGameCatalog.All[reference!.Value.CardId])
            .Where(card => Power(card) > max)
            .OrderByDescending(Power)
            .ToArray();
        if (over.Length == 0)
        {
            error = "";
            return true;
        }

        var names = string.Join(", ", over.Take(3).Select(card => $"{card.Name} ({Power(card)})"));
        var rest = over.Length > 3 ? $" e mais {over.Length - 3}" : "";
        error = $"{league.Name} aceita até {max} de poder. Fora do teto: {names}{rest}.";
        return false;
    }
}
