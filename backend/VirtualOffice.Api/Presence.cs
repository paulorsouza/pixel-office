using System.Collections.Concurrent;

namespace VirtualOffice.Api;

public class PlayerState
{
    public string Key { get; set; } = "";       // connectionId ou "bot-N"
    public int UserId { get; set; }
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
}

public static class Presence
{
    public static readonly ConcurrentDictionary<string, PlayerState> Players = new();

    public static IEnumerable<PlayerState> Near(PlayerState from, double radiusPx = 190)
        => Players.Values.Where(p =>
            p.Key != from.Key &&
            (SameMeeting(from, p) || Dist(from, p) <= radiusPx));

    /// <summary>Participa da reunião: está na sala OU circulando com o fone.</summary>
    public static bool InMeeting(PlayerState p)
        => p.Zone == "meeting" || p.HasHeadset;

    public static bool SameMeeting(PlayerState a, PlayerState b)
        => InMeeting(a) && InMeeting(b);

    public static double Dist(PlayerState a, PlayerState b)
        => Math.Sqrt((a.X - b.X) * (a.X - b.X) + (a.Y - b.Y) * (a.Y - b.Y));
}
