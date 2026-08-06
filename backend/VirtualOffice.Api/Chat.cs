using System.Text.RegularExpressions;

namespace VirtualOffice.Api;

/// <summary>
/// Uma mensagem de chat. Fica no banco (e não só em memória como a presença)
/// porque conversa sem histórico é bilhete: quem entra depois precisa ver o que
/// já foi dito, e uma PM tem de esperar o destinatário voltar.
/// </summary>
public class ChatMessage
{
    public long Id { get; set; }
    public string Channel { get; set; } = "";   // ver ChatChannels
    public int UserId { get; set; }
    public string Text { get; set; } = "";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Até onde este usuário já leu um canal. É o que sustenta o badge de não lidas —
/// sem isso, "tem mensagem nova" viraria estado de aba, e sumiria a cada refresh.
/// </summary>
public class ChatRead
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string Channel { get; set; } = "";
    public long LastReadMessageId { get; set; }
}

/// <summary>
/// Os quatro canais do chat, como STRING opaca para o resto do sistema:
///
///   <c>global</c>                     — todo mundo conectado
///   <c>building:&lt;id&gt;</c>        — um prédio (o campus e seus andares são um só)
///   <c>room:&lt;cena&gt;|&lt;sala&gt;</c> — uma sala dentro de uma cena
///   <c>dm:&lt;menor&gt;:&lt;maior&gt;</c>  — conversa entre duas pessoas
///
/// O servidor não conhece o mapa: quem diz "estou no prédio X, sala Y" é o
/// cliente, que é quem carrega os mapas do Tiled. Aqui os ids só são
/// higienizados e viram nome de grupo do SignalR.
/// </summary>
public static class ChatChannels
{
    public const string Global = "global";
    public const int MaxTextLength = 500;

    // Tudo que não é [A-Za-z0-9._@-] vira '-': é o que garante que ':' e '|'
    // continuem sendo separadores, e não parte de um id vindo do cliente.
    private static readonly Regex Unsafe = new("[^A-Za-z0-9._@-]", RegexOptions.Compiled);

    /// <summary>Canal do prédio, ou null quando o id não sobrevive à higienização.</summary>
    public static string? Building(string? buildingId) =>
        Slug(buildingId) is string id ? $"building:{id}" : null;

    /// <summary>Canal da sala, ou null quando cena ou sala não são utilizáveis.</summary>
    public static string? Room(string? sceneId, string? roomId) =>
        Slug(sceneId) is string scene && Slug(roomId) is string room ? $"room:{scene}|{room}" : null;

    public static string Direct(int a, int b) => $"dm:{Math.Min(a, b)}:{Math.Max(a, b)}";

    /// <summary>Grupo do SignalR que carrega o canal. DM não usa: vai pelo grupo do usuário.</summary>
    public static string Group(string channel) => $"chat:{channel}";

    // Um id vazio (ou tão longo que não é id nenhum) não vira canal: `building:`
    // sozinho passaria em tudo e viraria um prédio fantasma no diretório.
    private static string? Slug(string? value) =>
        Unsafe.Replace(value ?? "", "-") is { Length: > 0 and <= 120 } clean ? clean : null;

    /// <summary>Canal de lugar (global/prédio/sala): quem está lá pode ouvir e falar.</summary>
    public static bool IsPlace(string? channel) =>
        channel == Global
        || (channel is not null
            && (channel.StartsWith("building:", StringComparison.Ordinal)
                || channel.StartsWith("room:", StringComparison.Ordinal))
            && channel.Length <= 260
            && !channel.Contains(".."));

    /// <summary>Os dois lados de uma PM, ou null se o canal não for uma PM válida.</summary>
    public static (int A, int B)? DirectPair(string? channel)
    {
        if (channel is null || !channel.StartsWith("dm:", StringComparison.Ordinal)) return null;
        var parts = channel.Split(':');
        if (parts.Length != 3) return null;
        if (!int.TryParse(parts[1], out var a) || !int.TryParse(parts[2], out var b)) return null;
        if (a >= b || a <= 0) return null;   // canônico: menor:maior
        return (a, b);
    }

    /// <summary>O outro lado da PM, do ponto de vista deste usuário.</summary>
    public static int? DirectPeer(string? channel, int userId)
    {
        if (DirectPair(channel) is not (int a, int b) pair) return null;
        if (userId == pair.A) return pair.B;
        if (userId == pair.B) return pair.A;
        return null;
    }

    /// <summary>Este usuário pode LER este canal? Lugar é público; PM é só de quem é.</summary>
    public static bool CanRead(string? channel, int userId) =>
        IsPlace(channel) || DirectPeer(channel, userId) is not null;

    /// <summary>Aparado e limitado. Devolve null quando não sobrou mensagem.</summary>
    public static string? NormalizeText(string? text)
    {
        var trimmed = (text ?? "").Trim();
        if (trimmed.Length == 0) return null;
        return trimmed.Length > MaxTextLength ? trimmed[..MaxTextLength] : trimmed;
    }
}

/// <summary>
/// Onde uma conexão está ouvindo. No jogo vem do avatar (cena + sala sob os pés);
/// no app web vem da escolha na lista de canais ativos — o mesmo caminho, porque
/// falar num prédio em que não se está entraria por aqui e não deve.
/// </summary>
public record ChatLocation(
    string? BuildingId,
    string? BuildingName,
    string? SceneId,
    string? RoomId,
    string? RoomName);
