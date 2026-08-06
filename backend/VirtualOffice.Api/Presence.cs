using System.Collections.Concurrent;

namespace VirtualOffice.Api;

public static class ClientKind
{
    public const string World = "world";   // cliente Phaser: um avatar por conta
    public const string Panel = "panel";   // app web: só presença/chat, pode duplicar

    public static string Normalize(string? value) =>
        string.Equals(value, World, StringComparison.OrdinalIgnoreCase) ? World : Panel;
}

public class PlayerState
{
    public string Key { get; set; } = "";       // connectionId ou "bot-N"
    public int UserId { get; set; }
    // De onde veio a conexão: "world" (cliente Phaser) ou "panel" (app web).
    // Só o mundo é exclusivo por conta — o painel pode ficar aberto em paralelo.
    public string Client { get; set; } = ClientKind.Panel;
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#7c5cff";
    public string? SkinData { get; set; }        // json da skin equipada (inventário legado do app web)
    public string? Appearance { get; set; }      // json do avatar Phaser: camadas modulares + veículo
    public double X { get; set; }
    public double Y { get; set; }
    public string Dir { get; set; } = "down";
    public string Scene { get; set; } = "";       // cena do mundo Phaser onde o avatar está
    public string Zone { get; set; } = "";       // "" | "meeting" | "coffee"
    public string Status { get; set; } = "";     // ex.: "🔴 TSK-12"
    public bool IsBot { get; set; }
    public bool HasHeadset { get; set; }         // fone pego na sala: segue na reunião fora dela

    // sala de dev / rastreio da mesa
    public int DeskX { get; set; } = -1;          // mesa do dev (tile); -1 = sem sala
    public int DeskY { get; set; } = -1;
    public bool AtDesk { get; set; }              // sentado na própria mesa
    public int? AutoEntryId { get; set; }         // id do lançamento automático em aberto
    public string AutoKind { get; set; } = "";    // "meeting" | "desk" — qual estado abriu o auto-timer

    // Com quem está trabalhando agora: "" | "meeting" | "pair". Mora aqui, e não no
    // banco, porque é estado do minuto: serve para avisar quando ENTRA e quando SAI da
    // companhia — o pago mesmo é contado em `PresenceDay`.
    public string TeamworkKind { get; set; } = "";
}

/// <summary>
/// Estado efêmero com dono dentro de uma cena: assento ocupado, porta trancada,
/// sala reservada. Não é derivável das posições (é uma disputa) nem precisa
/// sobreviver ao processo — some quando o dono cai. Persistir é caso de banco.
/// </summary>
public record SceneClaim(
    string Key,        // connectionId do dono
    int UserId,
    string Name,
    string Kind,       // "seat" | "door-lock" | "room"
    string EntityId,
    string? Data);

public static class Presence
{
    public static readonly ConcurrentDictionary<string, PlayerState> Players = new();

    /// <summary>sceneId -> entityId -> dono</summary>
    public static readonly ConcurrentDictionary<string,
        ConcurrentDictionary<string, SceneClaim>> SceneClaims = new();

    public static ConcurrentDictionary<string, SceneClaim> ClaimsIn(string sceneId)
        => SceneClaims.GetOrAdd(sceneId ?? "", _ => new());

    /// <summary>Solta tudo que a conexão segura numa cena. Devolve o que saiu.</summary>
    public static List<SceneClaim> ReleaseAllFor(string connectionId, string sceneId)
    {
        var released = new List<SceneClaim>();
        if (string.IsNullOrEmpty(sceneId)) return released;
        var claims = ClaimsIn(sceneId);
        foreach (var (entityId, claim) in claims)
        {
            if (claim.Key != connectionId) continue;
            if (claims.TryRemove(entityId, out var gone)) released.Add(gone);
        }
        if (claims.IsEmpty) SceneClaims.TryRemove(sceneId, out _);
        return released;
    }

    public static IEnumerable<PlayerState> Near(PlayerState from, double radiusPx = 190)
        => Players.Values.Where(p =>
            p.Key != from.Key &&
            (SameMeeting(from, p) || Dist(from, p) <= radiusPx));

    /// <summary>Participa da reunião: está na sala OU circulando com o fone.</summary>
    public static bool InMeeting(PlayerState p)
        => p.Zone == "meeting" || p.HasHeadset;

    public static bool SameMeeting(PlayerState a, PlayerState b)
        => InMeeting(a) && InMeeting(b);

    /// <summary>
    /// Trabalhando em dupla: os dois sentados na PRÓPRIA mesa (o que só acontece com uma
    /// task ativa aberta), na mesma cena e perto o bastante para conversarem — é o mesmo
    /// raio da voz por proximidade, então a regra é "dá para parear se dá para ouvir".
    ///
    /// Não basta estar perto: duas pessoas paradas no corredor não estão pareando, e
    /// pagar por isso transformaria o bônus em "fique ao lado de alguém".
    /// </summary>
    public static bool PairingWith(PlayerState a, PlayerState b, double radiusPx = 190)
        => a.AtDesk && b.AtDesk
            && a.Key != b.Key
            && a.Scene == b.Scene
            && Dist(a, b) <= radiusPx;

    /// <summary>
    /// Com quem esta pessoa está trabalhando agora: "pair", "meeting" ou "".
    /// Pair vence porque paga mais e é o compromisso maior — quem está pareando dentro
    /// de uma reunião está, antes de tudo, pareando.
    /// </summary>
    public static string TeamworkKindOf(PlayerState p, IReadOnlyCollection<PlayerState> others)
    {
        if (others.Any(other => PairingWith(p, other))) return "pair";
        if (InMeeting(p) && others.Any(other => other.Key != p.Key && SameMeeting(p, other))) return "meeting";
        return "";
    }

    public static double Dist(PlayerState a, PlayerState b)
        => Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y));
}
