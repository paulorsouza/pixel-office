using System.Text.Json.Serialization;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using VirtualOffice.Api;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddDbContextFactory<AppDb>(o => o.UseSqlite("Data Source=office.db"));
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSignalR().AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddHostedService<BotService>();

var app = builder.Build();

LiveKitService.Configure(app.Configuration);

await using (var db = await app.Services.GetRequiredService<IDbContextFactory<AppDb>>().CreateDbContextAsync())
    await Seed.RunAsync(db);

app.UseDefaultFiles();
app.UseStaticFiles();
app.MapHub<OfficeHub>("/hub/office");

var api = app.MapGroup("/api");

static int? UserId(HttpRequest req) =>
    int.TryParse(req.Headers["X-User-Id"], out var id) ? id : null;

static object LevelInfo(int xp)
{
    var level = Game.LevelForXp(xp);
    return new
    {
        level,
        xp,
        levelFloor = Game.CumulativeXpForLevel(level),
        nextLevelXp = Game.CumulativeXpForLevel(level + 1),
    };
}

// ---------- usuários ----------
api.MapGet("/users", async (IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    return await db.Users.Where(u => !u.IsBot)
        .Select(u => new { u.Id, u.Name, u.Role, u.Color, u.Xp })
        .ToListAsync();
});

api.MapGet("/me", async (HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var user = await db.Users.FindAsync(uid);
    if (user is null) return Results.NotFound();

    // SQLite não traduz Sum de TimeSpan — soma em memória (volume pequeno)
    var finished = await db.TimeEntries
        .Where(t => t.UserId == uid && t.EndUtc != null)
        .Select(t => new { t.Category, t.StartUtc, EndUtc = t.EndUtc!.Value })
        .ToListAsync();
    var minutesTotal = (int)finished.Sum(t => (t.EndUtc - t.StartUtc).TotalMinutes);
    var minutesMeeting = (int)finished.Where(t => t.Category == "reuniao").Sum(t => (t.EndUtc - t.StartUtc).TotalMinutes);
    var tasksDone = await db.WorkItems.CountAsync(w => w.AssigneeId == uid && w.Status == WorkItemStatus.Done && w.Type == WorkItemType.Task);
    var bugsDone = await db.WorkItems.CountAsync(w => w.AssigneeId == uid && w.Status == WorkItemStatus.Done && w.Type == WorkItemType.Bug);
    var ticketsDone = await db.WorkItems.CountAsync(w => w.AssigneeId == uid && w.Status == WorkItemStatus.Done && w.Type == WorkItemType.Atendimento);
    var level = Game.LevelForXp(user.Xp);

    int Progress(string metric) => metric switch
    {
        "minutes_total" => minutesTotal,
        "minutes_meeting" => minutesMeeting,
        "tasks_done" => tasksDone,
        "bugs_done" => bugsDone,
        "tickets_done" => ticketsDone,
        "level" => level,
        _ => 0,
    };

    // concede medalha automaticamente quando a conquista completa
    var medalDefs = await db.ItemDefinitions.Where(d => d.Kind == ItemKind.Medal).ToListAsync();
    var owned = await db.Inventory.Where(i => i.UserId == uid).Select(i => i.ItemDefinitionId).ToListAsync();
    foreach (var a in Game.Achievements)
    {
        if (Progress(a.Metric) < a.Target) continue;
        var medal = medalDefs.FirstOrDefault(m => m.Name == a.MedalName);
        if (medal is not null && !owned.Contains(medal.Id))
            db.Inventory.Add(new InventoryItem { UserId = uid, ItemDefinitionId = medal.Id, AcquiredUtc = DateTime.UtcNow });
    }
    await db.SaveChangesAsync();

    var active = await db.TimeEntries
        .Where(t => t.UserId == uid && t.EndUtc == null)
        .OrderByDescending(t => t.StartUtc).FirstOrDefaultAsync();
    WorkItem? activeWi = active?.WorkItemId is int awi ? await db.WorkItems.FindAsync(awi) : null;

    // task ativa escolhida (mesa conta horas nela)
    WorkItem? activeTask = user.ActiveWorkItemId is int atid ? await db.WorkItems.FindAsync(atid) : null;
    if (activeTask is { Status: WorkItemStatus.Done }) activeTask = null;

    // mesa do dev (mesma regra do hub: rank entre não-bots)
    var nonBotIds = await db.Users.Where(u => !u.IsBot).OrderBy(u => u.Id).Select(u => u.Id).ToListAsync();
    var deskDef = OfficeLayout.ForIndex(nonBotIds.IndexOf(uid));

    return Results.Ok(new
    {
        user = new { user.Id, user.Name, user.Role, user.Color },
        levelInfo = LevelInfo(user.Xp),
        activeTask = activeTask is null ? null : new { activeTask.Id, activeTask.Code, activeTask.Title, activeTask.Type },
        desk = deskDef is null ? null : new { deskDef.DeskX, deskDef.DeskY, deskDef.KanbanX, deskDef.KanbanY },
        activeTimer = active is null ? null : new
        {
            active.Id, active.Category, active.Note, active.StartUtc,
            workItem = activeWi is null ? null : new { activeWi.Id, activeWi.Code, activeWi.Title },
        },
        achievements = Game.Achievements.Select(a => new
        {
            a.Id, a.Name, a.Icon, a.Target,
            progress = Math.Min(Progress(a.Metric), a.Target),
            done = Progress(a.Metric) >= a.Target,
        }),
        stats = new { minutesTotal, minutesMeeting, tasksDone, bugsDone, ticketsDone },
    });
});

api.MapGet("/leaderboard", async (IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var users = await db.Users.Where(u => !u.IsBot).OrderByDescending(u => u.Xp).ToListAsync();
    return users.Select(u => new { u.Id, u.Name, u.Color, u.Xp, level = Game.LevelForXp(u.Xp) });
});

// escolhe a task ativa (o timer da mesa conta horas nela)
api.MapPost("/me/active-task", async (SetActiveTask dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var user = await db.Users.FindAsync(uid);
    if (user is null) return Results.NotFound();

    if (dto.WorkItemId is null or 0)
    {
        user.ActiveWorkItemId = null;
    }
    else
    {
        var wi = await db.WorkItems.FindAsync(dto.WorkItemId.Value);
        if (wi is null || wi.AssigneeId != uid)
            return Results.BadRequest(new { error = "Essa task não está no seu nome." });
        if (wi.Status == WorkItemStatus.Done)
            return Results.BadRequest(new { error = "Essa task já está concluída." });
        user.ActiveWorkItemId = wi.Id;
    }
    await db.SaveChangesAsync();

    // reflete na barra do jogo de quem já estiver conectado
    foreach (var p in Presence.Players.Values.Where(p => p.UserId == uid && !p.IsBot))
        await hub.Clients.Client(p.Key).SendAsync("ActiveTask", new
        {
            workItemId = user.ActiveWorkItemId,
        });
    return Results.Ok(new { activeWorkItemId = user.ActiveWorkItemId });
});

// mesas/salas dos devs (para o mapa desenhar placas e detectar a própria mesa)
api.MapGet("/desks", async (IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var users = await db.Users.Where(u => !u.IsBot).OrderBy(u => u.Id).ToListAsync();
    return users.Select((u, i) =>
    {
        var d = OfficeLayout.ForIndex(i);
        return d is null ? null : new
        {
            userId = u.Id, name = u.Name, color = u.Color,
            d.DeskX, d.DeskY, d.KanbanX, d.KanbanY,
        };
    }).Where(x => x is not null);
});

// ---------- épicos e sprints ----------
api.MapGet("/epics", async (IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    return await db.Epics.ToListAsync();
});

api.MapGet("/sprints", async (IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    return await db.Sprints.OrderBy(s => s.StartUtc).ToListAsync();
});

// ---------- work items ----------
api.MapGet("/workitems", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var q = db.WorkItems.AsQueryable();
    if (int.TryParse(req.Query["sprintId"], out var sid))
        q = sid == 0 ? q.Where(w => w.SprintId == null) : q.Where(w => w.SprintId == sid);
    if (Enum.TryParse<WorkItemType>(req.Query["type"], out var type)) q = q.Where(w => w.Type == type);
    if (int.TryParse(req.Query["epicId"], out var eid)) q = q.Where(w => w.EpicId == eid);

    var items = await q.OrderBy(w => w.Id).ToListAsync();
    var users = await db.Users.ToDictionaryAsync(u => u.Id);
    var epics = await db.Epics.ToDictionaryAsync(e => e.Id);
    var logged = (await db.TimeEntries
        .Where(t => t.WorkItemId != null && t.EndUtc != null)
        .Select(t => new { WorkItemId = t.WorkItemId!.Value, t.StartUtc, EndUtc = t.EndUtc!.Value })
        .ToListAsync())
        .GroupBy(x => x.WorkItemId)
        .ToDictionary(g => g.Key, g => (int)g.Sum(x => (x.EndUtc - x.StartUtc).TotalMinutes));

    return Results.Ok(items.Select(w => new
    {
        w.Id, w.Code, w.Title, w.Description, w.Type, w.Status,
        w.EpicId, w.SprintId, w.AssigneeId, w.EstimateHours, w.CreatedUtc, w.DoneUtc,
        assignee = w.AssigneeId is int a && users.TryGetValue(a, out var u) ? new { u.Id, u.Name, u.Color } : null,
        epic = w.EpicId is int e && epics.TryGetValue(e, out var ep) ? new { ep.Id, ep.Name, ep.Color } : null,
        loggedMinutes = logged.GetValueOrDefault(w.Id),
    }));
});

api.MapPost("/workitems", async (WorkItemCreate dto, IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var prefix = dto.Type switch
    {
        WorkItemType.Bug => "BUG",
        WorkItemType.Atendimento => "ATD",
        _ => "TSK",
    };
    var count = await db.WorkItems.CountAsync(w => w.Type == dto.Type);
    var item = new WorkItem
    {
        Code = $"{prefix}-{count + 1}",
        Title = dto.Title,
        Description = dto.Description ?? "",
        Type = dto.Type,
        Status = dto.SprintId is null or 0 ? WorkItemStatus.Backlog : WorkItemStatus.Todo,
        EpicId = dto.EpicId is 0 ? null : dto.EpicId,
        SprintId = dto.SprintId is 0 ? null : dto.SprintId,
        AssigneeId = dto.AssigneeId is 0 ? null : dto.AssigneeId,
        EstimateHours = dto.EstimateHours,
        CreatedUtc = DateTime.UtcNow,
    };
    db.WorkItems.Add(item);
    await db.SaveChangesAsync();
    return Results.Ok(item);
});

api.MapPatch("/workitems/{id:int}", async (int id, WorkItemPatch dto, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    await using var db = await f.CreateDbContextAsync();
    var item = await db.WorkItems.FindAsync(id);
    if (item is null) return Results.NotFound();

    if (dto.Title is not null) item.Title = dto.Title;
    if (dto.Description is not null) item.Description = dto.Description;
    if (dto.EpicId is int e) item.EpicId = e == 0 ? null : e;
    if (dto.SprintId is int s) item.SprintId = s == 0 ? null : s;
    if (dto.AssigneeId is int a) item.AssigneeId = a == 0 ? null : a;
    if (dto.EstimateHours is double est) item.EstimateHours = est == 0 ? null : est;

    object? xpInfo = null;
    if (dto.Status is WorkItemStatus st && st != item.Status)
    {
        var wasDone = item.Status == WorkItemStatus.Done;
        item.Status = st;
        item.DoneUtc = st == WorkItemStatus.Done ? DateTime.UtcNow : null;
        if (st == WorkItemStatus.Done && !wasDone && item.AssigneeId is int assignee)
        {
            var user = await db.Users.FindAsync(assignee);
            if (user is not null)
            {
                var bonus = item.Type switch
                {
                    WorkItemType.Bug => 60,
                    WorkItemType.Atendimento => 40,
                    _ => 50,
                };
                var xp = await Game.AwardXpAsync(db, user, bonus, $"concluiu {item.Code}");
                await Notify.SendXpAsync(hub, user.Id, xp, $"{item.Code} concluída! +{bonus} XP");
                xpInfo = new { bonus, xp.LeveledUp };
            }
        }
    }
    await db.SaveChangesAsync();
    return Results.Ok(new { item.Id, item.Status, xpInfo });
});

// ---------- timer ----------
async Task<object?> StopOpenTimerAsync(AppDb db, int uid, IHubContext<OfficeHub> hub)
{
    var open = await db.TimeEntries
        .Where(t => t.UserId == uid && t.EndUtc == null)
        .OrderByDescending(t => t.StartUtc).FirstOrDefaultAsync();
    if (open is null) return null;

    open.EndUtc = DateTime.UtcNow;
    var minutes = Math.Max(1, (int)Math.Round((open.EndUtc.Value - open.StartUtc).TotalMinutes));
    var user = await db.Users.FindAsync(uid);
    XpResult? xp = null;
    if (user is not null)
    {
        var amount = await Game.XpFromTimeMinutesAsync(db, uid, minutes);
        if (amount > 0)
            xp = await Game.AwardXpAsync(db, user, amount, $"tempo: {open.Category} ({minutes}min)");
        // drop de foco: sessões de 25min+ têm chance de drop
        if (xp is { Drop: null } && minutes >= 25 && Random.Shared.NextDouble() < 0.25)
        {
            var drop = await Game.RollDropAsync(db, uid);
            if (drop is not null) xp = xp with { Drop = drop };
        }
    }
    await db.SaveChangesAsync();

    foreach (var p in Presence.Players.Values.Where(p => p.UserId == uid)) p.Status = "";
    await hub.Clients.All.SendAsync("Status", new { userId = uid, status = "" });
    if (xp is not null)
        await Notify.SendXpAsync(hub, uid, xp, $"Timer parado: {minutes}min registrados (+{xp.Amount} XP)");
    return new { minutes, xp = xp?.Amount ?? 0 };
}

api.MapPost("/timer/start", async (TimerStart dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    await StopOpenTimerAsync(db, uid, hub);

    var entry = new TimeEntry
    {
        UserId = uid,
        WorkItemId = dto.WorkItemId is 0 ? null : dto.WorkItemId,
        Category = dto.Category ?? (dto.WorkItemId > 0 ? "task" : "outro"),
        Note = dto.Note ?? "",
        StartUtc = DateTime.UtcNow,
    };
    db.TimeEntries.Add(entry);
    await db.SaveChangesAsync();

    var status = "⏱️ Focado";
    if (entry.Category == "reuniao") status = "📅 Reunião";
    else if (entry.WorkItemId is int wi && await db.WorkItems.FindAsync(wi) is { } item)
        status = $"🔴 {item.Code}";
    foreach (var p in Presence.Players.Values.Where(p => p.UserId == uid)) p.Status = status;
    await hub.Clients.All.SendAsync("Status", new { userId = uid, status });
    return Results.Ok(entry);
});

api.MapPost("/timer/stop", async (HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var result = await StopOpenTimerAsync(db, uid, hub);
    return result is null ? Results.NoContent() : Results.Ok(result);
});

// ---------- lançamentos ----------
api.MapGet("/timeentries", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var from = DateTime.TryParse(req.Query["from"], out var fr) ? fr.ToUniversalTime() : DateTime.UtcNow.AddDays(-7);
    var to = DateTime.TryParse(req.Query["to"], out var t) ? t.ToUniversalTime() : DateTime.UtcNow.AddDays(1);

    var entries = await db.TimeEntries
        .Where(e => e.UserId == uid && e.StartUtc >= from && e.StartUtc < to)
        .OrderByDescending(e => e.StartUtc).ToListAsync();
    var wiIds = entries.Where(e => e.WorkItemId != null).Select(e => e.WorkItemId!.Value).Distinct().ToList();
    var wis = await db.WorkItems.Where(w => wiIds.Contains(w.Id)).ToDictionaryAsync(w => w.Id);

    return Results.Ok(entries.Select(e => new
    {
        e.Id, e.Category, e.Note, e.StartUtc, e.EndUtc,
        minutes = e.EndUtc == null ? 0 : (int)Math.Round((e.EndUtc.Value - e.StartUtc).TotalMinutes),
        workItem = e.WorkItemId is int w && wis.TryGetValue(w, out var wi) ? new { wi.Id, wi.Code, wi.Title } : null,
    }));
});

api.MapPost("/timeentries", async (ManualEntry dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    if (dto.Minutes <= 0 || dto.Minutes > 24 * 60) return Results.BadRequest(new { error = "Duração inválida" });
    await using var db = await f.CreateDbContextAsync();

    var start = dto.Date.Date.AddHours(12);
    db.TimeEntries.Add(new TimeEntry
    {
        UserId = uid,
        WorkItemId = dto.WorkItemId is 0 ? null : dto.WorkItemId,
        Category = dto.Category ?? "task",
        Note = dto.Note ?? "",
        StartUtc = start,
        EndUtc = start.AddMinutes(dto.Minutes),
    });
    var user = await db.Users.FindAsync(uid);
    XpResult? xp = null;
    if (user is not null)
    {
        var amount = await Game.XpFromTimeMinutesAsync(db, uid, dto.Minutes);
        if (amount > 0) xp = await Game.AwardXpAsync(db, user, amount, $"tempo: lançamento manual ({dto.Minutes}min)");
    }
    await db.SaveChangesAsync();
    if (xp is not null)
        await Notify.SendXpAsync(hub, uid, xp, $"Lançamento de {dto.Minutes}min (+{xp.Amount} XP)");
    return Results.Ok();
});

api.MapDelete("/timeentries/{id:int}", async (int id, HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var entry = await db.TimeEntries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == uid);
    if (entry is null) return Results.NotFound();
    db.TimeEntries.Remove(entry);
    await db.SaveChangesAsync();
    return Results.NoContent();
});

// ---------- relatórios ----------
api.MapGet("/reports/summary", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var days = int.TryParse(req.Query["days"], out var d) ? Math.Clamp(d, 1, 90) : 14;
    var from = DateTime.UtcNow.Date.AddDays(-(days - 1));

    var entries = await db.TimeEntries
        .Where(e => e.EndUtc != null && e.StartUtc >= from)
        .ToListAsync();
    var users = await db.Users.ToDictionaryAsync(u => u.Id);
    var epics = await db.Epics.ToDictionaryAsync(e => e.Id);
    var workItems = await db.WorkItems.ToDictionaryAsync(w => w.Id);

    int Minutes(TimeEntry e) => (int)Math.Round((e.EndUtc!.Value - e.StartUtc).TotalMinutes);

    var perDay = Enumerable.Range(0, days)
        .Select(i => from.AddDays(i))
        .Select(day => new
        {
            date = day.ToString("yyyy-MM-dd"),
            minutes = entries.Where(e => e.StartUtc.Date == day).Sum(Minutes),
        });

    var perCategory = entries.GroupBy(e => e.Category)
        .Select(g => new { category = g.Key, minutes = g.Sum(Minutes) })
        .OrderByDescending(x => x.minutes);

    var perUser = entries.GroupBy(e => e.UserId)
        .Select(g => new
        {
            name = users.TryGetValue(g.Key, out var u) ? u.Name : "?",
            color = users.TryGetValue(g.Key, out var u2) ? u2.Color : "#888",
            minutes = g.Sum(Minutes),
        })
        .OrderByDescending(x => x.minutes);

    var perEpic = entries
        .Where(e => e.WorkItemId is int w && workItems.ContainsKey(w) && workItems[w].EpicId != null)
        .GroupBy(e => workItems[e.WorkItemId!.Value].EpicId!.Value)
        .Select(g => new
        {
            name = epics.TryGetValue(g.Key, out var ep) ? ep.Name : "?",
            color = epics.TryGetValue(g.Key, out var ep2) ? ep2.Color : "#888",
            minutes = g.Sum(Minutes),
        })
        .OrderByDescending(x => x.minutes);

    return Results.Ok(new { days, perDay, perCategory, perUser, perEpic });
});

// ---------- A/V (LiveKit): token só para quem está na reunião ----------
api.MapPost("/av/token", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();

    var inMeeting = Presence.Players.Values.Any(p => p.UserId == uid && Presence.InMeeting(p));
    if (!inMeeting)
        return Results.Json(new { error = "Você não está na reunião (entre na sala ou pegue um fone)." }, statusCode: 403);

    await using var db = await f.CreateDbContextAsync();
    var user = await db.Users.FindAsync(uid);
    if (user is null) return Results.NotFound();

    // identidade única por conexão: o mesmo usuário pode estar no web e no Unity
    var identity = $"{uid}-{Guid.NewGuid():N}"[..16];
    var token = LiveKitService.CreateToken(identity, user.Name, room: "meeting");
    return Results.Ok(new { url = LiveKitService.Url, token, room = "meeting", identity });
});

// ---------- gamificação: inventário, skins, sala ----------
api.MapGet("/inventory", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var inv = await db.Inventory.Where(i => i.UserId == uid)
        .Join(db.ItemDefinitions, i => i.ItemDefinitionId, d => d.Id, (i, d) => new
        {
            i.Id, i.Equipped, i.AcquiredUtc,
            def = new { d.Id, d.Name, d.Kind, d.Rarity, d.Icon, d.Data },
        })
        .ToListAsync();
    return Results.Ok(inv);
});

api.MapPost("/inventory/{id:int}/equip", async (int id, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var item = await db.Inventory.FirstOrDefaultAsync(i => i.Id == id && i.UserId == uid);
    if (item is null) return Results.NotFound();
    var def = await db.ItemDefinitions.FindAsync(item.ItemDefinitionId);
    if (def is null || def.Kind != ItemKind.Skin) return Results.BadRequest(new { error = "Só skins podem ser equipadas" });

    var skinDefIds = await db.ItemDefinitions.Where(x => x.Kind == ItemKind.Skin).Select(x => x.Id).ToListAsync();
    await db.Inventory
        .Where(i => i.UserId == uid && skinDefIds.Contains(i.ItemDefinitionId))
        .ExecuteUpdateAsync(s => s.SetProperty(i => i.Equipped, false));
    item.Equipped = true;
    await db.SaveChangesAsync();

    foreach (var p in Presence.Players.Values.Where(p => p.UserId == uid)) p.SkinData = def.Data;
    await hub.Clients.All.SendAsync("Skin", new { userId = uid, skinData = def.Data });
    return Results.Ok();
});

api.MapGet("/room/{userId:int}", async (int userId, IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var user = await db.Users.FindAsync(userId);
    if (user is null) return Results.NotFound();
    var items = await db.RoomItems.Where(r => r.UserId == userId)
        .Join(db.ItemDefinitions, r => r.ItemDefinitionId, d => d.Id, (r, d) => new
        {
            r.Id, r.X, r.Y,
            def = new { d.Id, d.Name, d.Kind, d.Rarity, d.Icon },
        })
        .ToListAsync();
    return Results.Ok(new { owner = new { user.Id, user.Name, user.Color }, items });
});

api.MapPut("/room", async (RoomLayout layout, HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();

    var ownedDefIds = await db.Inventory.Where(i => i.UserId == uid).Select(i => i.ItemDefinitionId).ToListAsync();
    if (layout.Items.Any(i => !ownedDefIds.Contains(i.ItemDefinitionId)))
        return Results.BadRequest(new { error = "Item não está no seu inventário" });

    await db.RoomItems.Where(r => r.UserId == uid).ExecuteDeleteAsync();
    db.RoomItems.AddRange(layout.Items.Select(i => new RoomItem
    {
        UserId = uid, ItemDefinitionId = i.ItemDefinitionId,
        X = Math.Clamp(i.X, 0, 11), Y = Math.Clamp(i.Y, 0, 7),
    }));
    await db.SaveChangesAsync();
    return Results.Ok();
});

app.Run();

record WorkItemCreate(string Title, string? Description, WorkItemType Type, int? EpicId, int? SprintId, int? AssigneeId, double? EstimateHours);
record WorkItemPatch(string? Title, string? Description, WorkItemStatus? Status, int? EpicId, int? SprintId, int? AssigneeId, double? EstimateHours);
record TimerStart(int? WorkItemId, string? Category, string? Note);
record ManualEntry(DateTime Date, int Minutes, int? WorkItemId, string? Category, string? Note);
record RoomLayout(List<RoomPlacement> Items);
record RoomPlacement(int ItemDefinitionId, int X, int Y);
record SetActiveTask(int? WorkItemId);
