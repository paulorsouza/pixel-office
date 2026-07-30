using System.Collections.Concurrent;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public record ChessMoveDto(int From, int To, string? Promo);

// Estado de uma partida de xadrez por tabuleiro (em memória; protótipo single-instance).
public class ChessMatch
{
    public string? WhiteConn;   // connectionId de quem senta de brancas
    public string? BlackConn;
    public string? WhiteName;
    public string? BlackName;
    public readonly List<ChessMoveDto> Moves = new();
}

public partial class OfficeHub(IDbContextFactory<AppDb> dbFactory, IHubContext<OfficeHub> hubContext) : Hub
{
    public static string UserGroup(int userId) => $"game:user:{userId}";
    public static string RoomGroup(string sceneId, string roomId) => $"game:room:{sceneId}:{roomId}";
    // só para o canal de claims: a presença (Snapshot/PlayerMoved) segue global de
    // propósito — a lista de "online" do app web depende do broadcast para todos.
    public static string SceneGroup(string sceneId) => $"game:scene:{sceneId}";

    private static readonly string[] BotReplies =
    [
        "Boa! 👍", "Depois me chama numa call rapidinha?", "Tô terminando uma task aqui...",
        "Alguém viu o bug do deploy?", "Café? ☕", "hahaha", "Manda na daily amanhã!",
        "Consegui fechar a TSK-7 finalmente 🎉", "Esse sprint tá puxado, hein",
    ];

    // Identidade da conexão: o JWT validado vence; o argumento só vale como fallback de dev.
    private int? ResolveUser(int fallback)
    {
        if (Context.User?.FindFirst("uid")?.Value is string s && int.TryParse(s, out var id)) return id;
        return AuthOptions.DevBypass ? fallback : null;
    }

    // Conexões vivas: só o dono do contexto consegue derrubar a própria conexão,
    // então guardamos os contextos para poder encerrar a sessão antiga na troca.
    private static readonly ConcurrentDictionary<string, HubCallerContext> LiveConnections = new();

    public override Task OnConnectedAsync()
    {
        LiveConnections[Context.ConnectionId] = Context;
        return base.OnConnectedAsync();
    }

    /// <summary>
    /// Derruba as outras sessões DE MUNDO desta conta. O painel web fica de fora:
    /// ele só ouve presença/chat e é normal ficar aberto junto com o jogo.
    /// </summary>
    private async Task EvictWorldSessionsAsync(int userId)
    {
        var stale = Presence.Players.Values
            .Where(p => p.UserId == userId && !p.IsBot
                        && p.Client == ClientKind.World && p.Key != Context.ConnectionId)
            .Select(p => p.Key)
            .ToList();
        if (stale.Count == 0) return;

        await Clients.Clients(stale).SendAsync("SessionEnded", new
        {
            reason = "takeover",
            message = "Sua conta entrou no mundo em outra janela. Esta sessão foi encerrada.",
        });

        // A limpeza (avatar, cadeira, timer de horas) acontece no OnDisconnectedAsync
        // de cada uma. O respiro é só para o aviso chegar antes do socket fechar.
        foreach (var key in stale)
        {
            if (!LiveConnections.TryGetValue(key, out var ctx)) continue;
            _ = Task.Run(async () =>
            {
                await Task.Delay(500);
                ctx.Abort();
            });
        }
    }

    public async Task Join(int userId, string? client)
    {
        if (ResolveUser(userId) is not int resolved) return;
        userId = resolved;
        var kind = ClientKind.Normalize(client);
        // Uma conta = um avatar no mundo. A sessão nova ganha e a antiga cai —
        // se fosse ao contrário, uma aba fantasma (browser fechado no tranco,
        // internet caiu) trancaria o dono para fora até o timeout do SignalR.
        if (kind == ClientKind.World) await EvictWorldSessionsAsync(userId);
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
            Client = kind,
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
        await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(userId));

        await Clients.Caller.SendAsync("Snapshot", Presence.Players.Values);
        await Clients.Others.SendAsync("PlayerJoined", state);

        // Entrar no MUNDO marca presença hoje na hora — o objetivo "Deu as caras"
        // fecha ao entrar, sem esperar o primeiro tique do acúmulo (que é a cada
        // minuto). O painel web ("panel") não conta como presença de jogo.
        if (kind == ClientKind.World)
        {
            var (_, isNew) = await PresenceRewards.EnsureDayAsync(db, userId, DateTime.UtcNow);
            if (isNew)
            {
                var completions = await ObjectiveEngine.RecalculateAsync(db, userId);
                await db.SaveChangesAsync();
                await Notify.SendObjectivesAsync(hubContext, userId, completions);
            }
        }
    }

    /// <summary>Assina somente os eventos de inventário e da sala do cliente Phaser.</summary>
    public async Task JoinGame(int userId, string sceneId, string roomId)
    {
        if (ResolveUser(userId) is not int resolved) return;
        await Groups.AddToGroupAsync(Context.ConnectionId, UserGroup(resolved));
        await Groups.AddToGroupAsync(Context.ConnectionId, RoomGroup(sceneId, roomId));
    }

    public Task LeaveGameRoom(string sceneId, string roomId) =>
        Groups.RemoveFromGroupAsync(Context.ConnectionId, RoomGroup(sceneId, roomId));

    /// <summary>
    /// Aparência do avatar Phaser (camadas modulares do CharacterSystem + veículo ativo).
    /// A composição vive no cliente; aqui ela só trafega para os outros renderizarem.
    /// </summary>
    public async Task SetAppearance(string? json)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        // payload é opaco para o servidor: limita tamanho para não virar canal de abuso
        if (json is { Length: > 2000 }) return;
        if (p.Appearance == json) return;
        p.Appearance = json;
        await Clients.Others.SendAsync("PlayerAppearance", new { key = p.Key, appearance = p.Appearance });
    }

    /// <summary>Cena atual do avatar no mundo Phaser. Os clientes filtram o render por cena.</summary>
    public async Task SetScene(string sceneId)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        var previous = p.Scene;
        p.Scene = sceneId ?? "";
        if (previous != p.Scene)
        {
            // sair da cena solta o que estava segurando lá (cadeira, trava, reserva)
            await ReleaseClaimsAsync(previous);
            if (!string.IsNullOrEmpty(previous))
                await Groups.RemoveFromGroupAsync(Context.ConnectionId, SceneGroup(previous));
            if (!string.IsNullOrEmpty(p.Scene))
                await Groups.AddToGroupAsync(Context.ConnectionId, SceneGroup(p.Scene));
        }
        await Clients.All.SendAsync("PlayerScene", new { key = p.Key, scene = p.Scene });
        // estado da cena nova (quem já está sentado, o que está trancado)
        if (!string.IsNullOrEmpty(p.Scene))
            await Clients.Caller.SendAsync("SceneClaims", Presence.ClaimsIn(p.Scene).Values);
    }

    // ---------- estado efêmero com dono (assento, trava de porta, reserva) ----------
    // Portas automáticas NÃO passam por aqui: são derivadas das posições, que a
    // presença já replica. Só entra o que é disputa e não dá para derivar.

    /// <summary>
    /// Toma posse de uma entidade da cena. Recusa se já tem outro dono.
    /// Um mesmo `kind` por conexão: sentar numa cadeira solta a anterior.
    /// </summary>
    public async Task<bool> ClaimEntity(string entityId, string kind, string? data)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return false;
        if (string.IsNullOrWhiteSpace(entityId) || string.IsNullOrWhiteSpace(kind)) return false;
        if (string.IsNullOrEmpty(p.Scene)) return false;
        if (data is { Length: > 2000 }) return false;

        var claims = Presence.ClaimsIn(p.Scene);
        var mine = new SceneClaim(Context.ConnectionId, p.UserId, p.Name, kind, entityId, data);
        if (!claims.TryAdd(entityId, mine))
        {
            // já tinha dono: só sobrescreve se for meu (atualização de dados)
            if (!claims.TryGetValue(entityId, out var current) || current.Key != Context.ConnectionId) return false;
            claims[entityId] = mine;
        }

        // exclusividade por kind: solta o anterior deste mesmo tipo
        foreach (var (otherId, claim) in claims)
        {
            if (otherId == entityId || claim.Key != Context.ConnectionId || claim.Kind != kind) continue;
            if (claims.TryRemove(otherId, out var gone)) await BroadcastClaimAsync(p.Scene, gone, false);
        }

        await BroadcastClaimAsync(p.Scene, mine, true);
        return true;
    }

    /// <summary>Libera uma entidade. Só o dono consegue.</summary>
    public async Task ReleaseEntity(string entityId)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;
        if (string.IsNullOrEmpty(p.Scene)) return;
        var claims = Presence.ClaimsIn(p.Scene);
        if (!claims.TryGetValue(entityId, out var claim) || claim.Key != Context.ConnectionId) return;
        if (claims.TryRemove(entityId, out var gone)) await BroadcastClaimAsync(p.Scene, gone, false);
    }

    private Task BroadcastClaimAsync(string sceneId, SceneClaim claim, bool claimed) =>
        Clients.Group(SceneGroup(sceneId)).SendAsync("EntityClaim", new
        {
            sceneId,
            entityId = claim.EntityId,
            kind = claim.Kind,
            data = claim.Data,
            key = claim.Key,
            userId = claim.UserId,
            name = claim.Name,
            claimed,
        });

    private async Task ReleaseClaimsAsync(string sceneId)
    {
        foreach (var claim in Presence.ReleaseAllFor(Context.ConnectionId, sceneId))
            await BroadcastClaimAsync(sceneId, claim, false);
    }

    // ---------- xadrez em rede ----------
    private static readonly ConcurrentDictionary<string, ChessMatch> ChessMatches = new();
    public static string ChessGroup(string boardId) => $"chess:{boardId}";

    private static object SeatsPayload(ChessMatch m) => new
    {
        white = m.WhiteConn != null, black = m.BlackConn != null,
        whiteName = m.WhiteName, blackName = m.BlackName,
    };

    public async Task JoinChess(string boardId)
    {
        if (string.IsNullOrWhiteSpace(boardId)) return;
        var name = Presence.Players.TryGetValue(Context.ConnectionId, out var p) ? p.Name : "Jogador";
        var m = ChessMatches.GetOrAdd(boardId, _ => new ChessMatch());
        await Groups.AddToGroupAsync(Context.ConnectionId, ChessGroup(boardId));

        string? color = null;
        lock (m)
        {
            if (m.WhiteConn == Context.ConnectionId) color = "w";
            else if (m.BlackConn == Context.ConnectionId) color = "b";
            else if (m.WhiteConn is null) { m.WhiteConn = Context.ConnectionId; m.WhiteName = name; color = "w"; }
            else if (m.BlackConn is null) { m.BlackConn = Context.ConnectionId; m.BlackName = name; color = "b"; }
        }
        await Clients.Caller.SendAsync("ChessState", new { boardId, color, moves = m.Moves, seats = SeatsPayload(m) });
        await Clients.Group(ChessGroup(boardId)).SendAsync("ChessSeats", new { boardId, seats = SeatsPayload(m) });
    }

    public async Task ChessMove(string boardId, int from, int to, string? promo)
    {
        if (!ChessMatches.TryGetValue(boardId, out var m)) return;
        bool ok;
        lock (m)
        {
            // só o jogador da vez (paridade dos lances) pode mover
            var whiteToMove = m.Moves.Count % 2 == 0;
            var seat = whiteToMove ? m.WhiteConn : m.BlackConn;
            ok = seat == Context.ConnectionId && from is >= 0 and < 64 && to is >= 0 and < 64;
            if (ok) m.Moves.Add(new ChessMoveDto(from, to, promo));
        }
        if (ok)
            await Clients.Group(ChessGroup(boardId)).SendAsync("ChessMoved", new { boardId, from, to, promo });
    }

    public async Task ChessReset(string boardId)
    {
        if (!ChessMatches.TryGetValue(boardId, out var m)) return;
        lock (m) m.Moves.Clear();
        await Clients.Group(ChessGroup(boardId)).SendAsync("ChessReset", new { boardId });
    }

    public async Task LeaveChess(string boardId)
    {
        await Groups.RemoveFromGroupAsync(Context.ConnectionId, ChessGroup(boardId));
        if (ChessMatches.TryGetValue(boardId, out var m)) await FreeChessSeat(m, boardId);
    }

    private async Task FreeChessSeat(ChessMatch m, string boardId)
    {
        bool changed = false;
        lock (m)
        {
            if (m.WhiteConn == Context.ConnectionId) { m.WhiteConn = null; m.WhiteName = null; changed = true; }
            if (m.BlackConn == Context.ConnectionId) { m.BlackConn = null; m.BlackName = null; changed = true; }
        }
        if (changed)
            await hubContext.Clients.Group(ChessGroup(boardId)).SendAsync("ChessSeats", new { boardId, seats = SeatsPayload(m) });
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
        LiveConnections.TryRemove(Context.ConnectionId, out _);
        await CleanupCardGameConnectionAsync(Context.ConnectionId);

        // libera assentos de xadrez ocupados por esta conexão
        foreach (var (boardId, match) in ChessMatches)
            if (match.WhiteConn == Context.ConnectionId || match.BlackConn == Context.ConnectionId)
                await FreeChessSeat(match, boardId);

        if (Presence.Players.TryRemove(Context.ConnectionId, out var p))
        {
            // navegador fechado não pode deixar cadeira ocupada ou porta trancada
            await ReleaseClaimsAsync(p.Scene);
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
            var minutes = Math.Max(1, (int)Math.Round((DateTime.UtcNow - entry.StartUtc).TotalMinutes));
            entry.EndUtc = entry.StartUtc.AddMinutes(minutes);
            var user = await db.Users.FindAsync(p.UserId);
            var activity = await db.ActivityTypes.FirstOrDefaultAsync(a => a.Key == entry.Category);
            XpResult? xp = null;
            if (user is not null && activity is not null)
            {
                var reward = await Game.CapDailyAsync(db, user.Id, Game.RewardFor(activity, minutes), entry.StartUtc);
                if (!reward.IsEmpty)
                {
                    xp = await Game.AwardAsync(db, user, reward, $"tempo: {activity.Name} ({minutes}min)", "time");
                    entry.XpAwarded = reward.Xp;
                    entry.GoldAwarded = reward.Gold;
                }
            }
            await db.SaveChangesAsync();
            var completions = await ObjectiveEngine.RecalculateAsync(db, p.UserId);
            await db.SaveChangesAsync();
            if (xp is not null)
            {
                var label = kind == "meeting" ? $"Reunião registrada: {minutes}min" : $"Foco na mesa: {minutes}min";
                await Notify.SendRewardAsync(hubContext, p.UserId, xp, $"{label} (+{xp.Amount} XP · +{xp.Gold} 🪙)");
            }
            await Notify.SendObjectivesAsync(hubContext, p.UserId, completions);
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

    /// <summary>
    /// Recompensa (XP + gold) para todas as sessões do usuário. Vai pelo grupo do
    /// usuário — que o jogo e o app web assinam — e não só pelas conexões com avatar,
    /// senão quem está apenas no painel nunca via a moeda entrar.
    /// </summary>
    public static async Task SendRewardAsync(IHubContext<OfficeHub> hub, int userId, XpResult xp, string message)
    {
        await SendXpAsync(hub, userId, xp, message);
        await hub.Clients.Group(OfficeHub.UserGroup(userId)).SendAsync("RewardGranted", new
        {
            message,
            xp = xp.Amount,
            gold = xp.Gold,
            totalXp = xp.TotalXp,
            coins = xp.Coins,
            level = xp.Level,
            leveledUp = xp.LeveledUp,
        });
    }

    public static async Task SendObjectivesAsync(
        IHubContext<OfficeHub> hub, int userId, IReadOnlyCollection<ObjectiveCompletion> completions)
    {
        if (completions.Count == 0) return;
        await hub.Clients.Group(OfficeHub.UserGroup(userId)).SendAsync("ObjectiveCompleted", completions.Select(c => new
        {
            c.Objective.Key,
            c.Objective.Name,
            c.Objective.Icon,
            xp = c.Objective.XpReward,
            gold = c.Objective.GoldReward,
            boosterId = c.BoosterId,
            coins = c.Reward.Coins,
            totalXp = c.Reward.TotalXp,
        }));
        var keys = Presence.Players.Values.Where(p => p.UserId == userId && !p.IsBot).Select(p => p.Key).ToList();
        if (keys.Count == 0) return;
        foreach (var c in completions)
            await hub.Clients.Clients(keys).SendAsync("Notify", new
            {
                message = c.BoosterId == "rare"
                    ? $"{c.Objective.Icon} Objetivos semanais concluídos · +1 Booster Raro"
                    : $"{c.Objective.Icon} Objetivo concluído: {c.Objective.Name} · +{c.Objective.XpReward} XP · +{c.Objective.GoldReward} 🪙",
                xp = c.Objective.XpReward,
                level = c.Reward.Level,
                leveledUp = c.Reward.LeveledUp,
                drop = (object?)null,
            });
    }

    /// <summary>O quadro é do time inteiro: qualquer mudança vale para todo mundo conectado.</summary>
    public static Task BoardChangedAsync(IHubContext<OfficeHub> hub, int workItemId, string change) =>
        hub.Clients.All.SendAsync("BoardChanged", new { workItemId, change });

    /// <summary>Horas são pessoais: só as sessões do próprio usuário precisam recarregar.</summary>
    public static Task TimeChangedAsync(IHubContext<OfficeHub> hub, int userId) =>
        hub.Clients.Group(OfficeHub.UserGroup(userId)).SendAsync("TimeChanged", new { userId });
}
