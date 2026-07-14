using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public class OfficeHub(IDbContextFactory<AppDb> dbFactory, IHubContext<OfficeHub> hubContext) : Hub
{
    private static readonly string[] BotReplies =
    [
        "Boa! 👍", "Depois me chama numa call rapidinha?", "Tô terminando uma task aqui...",
        "Alguém viu o bug do deploy?", "Café? ☕", "hahaha", "Manda na daily amanhã!",
        "Consegui fechar a TSK-7 finalmente 🎉", "Esse sprint tá puxado, hein",
    ];

    public async Task Join(int userId)
    {
        await using var db = await dbFactory.CreateDbContextAsync();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return;

        var skin = await db.Inventory
            .Where(i => i.UserId == userId && i.Equipped)
            .Join(db.ItemDefinitions, i => i.ItemDefinitionId, d => d.Id, (i, d) => d)
            .Where(d => d.Kind == ItemKind.Skin)
            .FirstOrDefaultAsync();

        var activeTimer = await db.TimeEntries
            .Where(t => t.UserId == userId && t.EndUtc == null)
            .OrderByDescending(t => t.StartUtc)
            .FirstOrDefaultAsync();
        var status = "";
        if (activeTimer is not null)
        {
            var code = activeTimer.WorkItemId is int wi
                ? (await db.WorkItems.FindAsync(wi))?.Code : null;
            status = activeTimer.Category == "reuniao" ? "📅 Reunião"
                : code is not null ? $"🔴 {code}" : "⏱️ Focado";
        }

        // mesa do dev: posição entre os não-bots define qual das 4 salas
        var nonBotIds = await db.Users.Where(u => !u.IsBot).OrderBy(u => u.Id).Select(u => u.Id).ToListAsync();
        var desk = OfficeLayout.ForIndex(nonBotIds.IndexOf(userId));

        var state = new PlayerState
        {
            Key = Context.ConnectionId,
            UserId = user.Id,
            Name = user.Name,
            Color = user.Color,
            SkinData = skin?.Data,
            X = 17 * 28 + Random.Shared.Next(0, 60),
            Y = 11 * 28 + Random.Shared.Next(0, 40),
            Status = status,
            DeskX = desk?.DeskX ?? -1,
            DeskY = desk?.DeskY ?? -1,
        };
        Presence.Players[Context.ConnectionId] = state;

        await Clients.Caller.SendAsync("Snapshot", Presence.Players.Values);
        await Clients.Others.SendAsync("PlayerJoined", state);
    }

    public async Task Move(double x, double y, string dir)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        p.X = x; p.Y = y; p.Dir = dir;
        await Clients.Others.SendAsync("PlayerMoved", new { key = p.Key, x, y, dir });
    }

    public async Task SetZone(string zone)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        var previous = p.Zone;
        p.Zone = zone;
        if (previous == zone) return;

        await using var db = await dbFactory.CreateDbContextAsync();

        if (zone == "meeting")
        {
            await StartMeetingAsync(db, p);
        }
        else if (previous == "meeting" && !p.HasHeadset)
        {
            // saiu da sala sem fone: reunião encerra
            await CloseAutoIfKindAsync(db, p, "meeting");
        }
        await Clients.All.SendAsync("Zone", new { key = p.Key, zone });
    }

    /// <summary>Sentar/levantar da própria mesa: inicia/encerra o timer da task ativa.</summary>
    public async Task SitAt(int tileX, int tileY)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        var atOwnDesk = tileX >= 0 && p.DeskX == tileX && p.DeskY == tileY;
        if (atOwnDesk == p.AtDesk) return;
        p.AtDesk = atOwnDesk;

        await using var db = await dbFactory.CreateDbContextAsync();
        if (atOwnDesk)
        {
            var user = await db.Users.FindAsync(p.UserId);
            if (user?.ActiveWorkItemId is not int wid)
            {
                await Clients.Caller.SendAsync("Notify", new { message = "Escolha uma task ativa no quadro kanban da sua sala para contar horas." });
                return;
            }
            var wi = await db.WorkItems.FindAsync(wid);
            if (wi is null || wi.Status == WorkItemStatus.Done)
            {
                await Clients.Caller.SendAsync("Notify", new { message = "Sua task ativa não está mais disponível — escolha outra no kanban." });
                return;
            }
            await StartAutoEntryAsync(db, p, "desk", "task", wid, $"Mesa: {wi.Code}", $"🔴 {wi.Code}");
        }
        else
        {
            await CloseAutoIfKindAsync(db, p, "desk");
        }
    }

    private Task StartMeetingAsync(AppDb db, PlayerState p) =>
        StartAutoEntryAsync(db, p, "meeting", "reuniao", null, "Sala de reunião (office)", "📅 Reunião");

    /// <summary>Pega um fone na sala de reunião: pode circular pelo mapa sem sair da reunião.</summary>
    public async Task PickUpHeadset()
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        if (p.HasHeadset) return;
        if (p.Zone != "meeting")
        {
            await Clients.Caller.SendAsync("Notify", new { message = "Os fones ficam na sala de reunião — pegue um lá dentro." });
            return;
        }
        p.HasHeadset = true;
        await using var db = await dbFactory.CreateDbContextAsync();
        await StartMeetingAsync(db, p);
        await Clients.All.SendAsync("Headset", new { key = p.Key, userId = p.UserId, hasHeadset = true });
    }

    /// <summary>Solta o fone; se estiver fora da sala, a reunião (e o lançamento de horas) encerra.</summary>
    public async Task DropHeadset()
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        if (!p.HasHeadset) return;
        p.HasHeadset = false;
        await Clients.All.SendAsync("Headset", new { key = p.Key, userId = p.UserId, hasHeadset = false });
        if (p.Zone != "meeting")
        {
            await using var db = await dbFactory.CreateDbContextAsync();
            await CloseAutoIfKindAsync(db, p, "meeting");
        }
    }

    // ---------- auto-timer unificado (reunião / mesa) ----------
    // inicia um lançamento automático, se não houver nenhum timer aberto para o usuário
    private async Task StartAutoEntryAsync(AppDb db, PlayerState p, string kind, string category,
        int? workItemId, string note, string status)
    {
        if (p.AutoEntryId != null) return; // já há auto-timer em aberto
        var open = await db.TimeEntries.AnyAsync(t => t.UserId == p.UserId && t.EndUtc == null);
        if (open) return;                  // já há um timer manual aberto — não conflita
        var entry = new TimeEntry
        {
            UserId = p.UserId,
            Category = category,
            WorkItemId = workItemId,
            Note = note,
            StartUtc = DateTime.UtcNow,
        };
        db.TimeEntries.Add(entry);
        await db.SaveChangesAsync();
        p.AutoEntryId = entry.Id;
        p.AutoKind = kind;
        p.Status = status;
        await Clients.All.SendAsync("Status", new { userId = p.UserId, status });
    }

    private async Task CloseAutoIfKindAsync(AppDb db, PlayerState p, string kind)
    {
        if (p.AutoKind == kind) await CloseAutoEntryAsync(db, p);
    }

    public async Task Chat(string text)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        if (string.IsNullOrWhiteSpace(text)) return;
        text = text.Trim();
        if (text.Length > 300) text = text[..300];

        var payload = new { key = p.Key, name = p.Name, text };
        var near = Presence.Near(p).ToList();
        var targets = near.Where(t => !t.IsBot).Select(t => t.Key).Append(p.Key).ToList();
        await Clients.Clients(targets).SendAsync("Chat", payload);

        // bots por perto respondem para dar vida ao protótipo
        var bot = near.FirstOrDefault(t => t.IsBot);
        if (bot is not null && Random.Shared.NextDouble() < 0.8)
        {
            var reply = BotReplies[Random.Shared.Next(BotReplies.Length)];
            _ = Task.Run(async () =>
            {
                await Task.Delay(Random.Shared.Next(1200, 2600));
                if (!Presence.Players.ContainsKey(bot.Key)) return;
                var replyTargets = Presence.Near(bot).Where(t => !t.IsBot).Select(t => t.Key).ToList();
                await hubContext.Clients.Clients(replyTargets)
                    .SendAsync("Chat", new { key = bot.Key, name = bot.Name, text = reply });
            });
        }
    }

    public override async Task OnDisconnectedAsync(Exception? exception)
    {
        if (Presence.Players.TryRemove(Context.ConnectionId, out var p))
        {
            if (p.AutoEntryId != null)
            {
                await using var db = await dbFactory.CreateDbContextAsync();
                await CloseAutoEntryAsync(db, p);
            }
            await Clients.Others.SendAsync("PlayerLeft", p.Key);
        }
        await base.OnDisconnectedAsync(exception);
    }

    // fecha o lançamento automático em aberto (reunião ou mesa), lança horas e dá XP
    private async Task CloseAutoEntryAsync(AppDb db, PlayerState p)
    {
        if (p.AutoEntryId is not int id) return;
        var kind = p.AutoKind;
        p.AutoEntryId = null;
        p.AutoKind = "";

        var entry = await db.TimeEntries.FindAsync(id);
        if (entry is not null && entry.EndUtc is null)
        {
            entry.EndUtc = DateTime.UtcNow;
            var minutes = Math.Max(1, (int)Math.Round((entry.EndUtc.Value - entry.StartUtc).TotalMinutes));
            var user = await db.Users.FindAsync(p.UserId);
            XpResult? xp = null;
            if (user is not null)
            {
                var amount = await Game.XpFromTimeMinutesAsync(db, user.Id, minutes);
                if (amount > 0) xp = await Game.AwardXpAsync(db, user, amount, $"tempo: {entry.Category} ({minutes}min)");
            }
            await db.SaveChangesAsync();
            if (xp is not null)
            {
                var label = kind == "meeting" ? $"Reunião registrada: {minutes}min" : $"Foco na mesa: {minutes}min";
                await Notify.SendXpAsync(hubContext, p.UserId, xp, label);
            }
        }

        p.Status = "";
        await hubContext.Clients.All.SendAsync("Status", new { userId = p.UserId, status = "" });
    }
}

public static class Notify
{
    /// <summary>Envia toast de XP/level-up/drop para todas as conexões do usuário.</summary>
    public static async Task SendXpAsync(IHubContext<OfficeHub> hub, int userId, XpResult xp, string message)
    {
        var keys = Presence.Players.Values.Where(p => p.UserId == userId && !p.IsBot).Select(p => p.Key).ToList();
        if (keys.Count == 0) return;
        await hub.Clients.Clients(keys).SendAsync("Notify", new
        {
            message,
            xp = xp.Amount,
            level = xp.Level,
            leveledUp = xp.LeveledUp,
            drop = xp.Drop is null ? null : new { name = xp.Drop.Item.Name, icon = xp.Drop.Item.Icon, rarity = xp.Drop.Rarity.ToString() },
        });
    }
}
