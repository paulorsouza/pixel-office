using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VirtualOffice.Api;

var builder = WebApplication.CreateBuilder(args);

AuthOptions.Configure(builder.Configuration);

// Provider por config: sqlite (dev, default) ou postgres (produção).
var dbProvider = builder.Configuration["Database:Provider"] ?? "sqlite";
var dbConn = builder.Configuration.GetConnectionString("Default");
builder.Services.AddDbContextFactory<AppDb>(o =>
{
    if (dbProvider.Equals("postgres", StringComparison.OrdinalIgnoreCase))
        o.UseNpgsql(dbConn ?? "Host=localhost;Database=officequest;Username=postgres;Password=postgres");
    else
        o.UseSqlite(dbConn ?? "Data Source=office.db");
});
builder.Services.ConfigureHttpJsonOptions(o => o.SerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddSignalR().AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services.AddHostedService<BotService>();
builder.Services.AddDataProtection();

// Autenticação: valida o JWT próprio da app (HS256). O X-User-Id só sobrevive via DevBypass.
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false; // mantém as claims "uid"/"role" com o nome original
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidIssuer = AuthOptions.JwtIssuer,
            ValidAudience = AuthOptions.JwtAudience,
            IssuerSigningKey = AuthOptions.SigningKey,
            ValidateIssuerSigningKey = true,
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),
            NameClaimType = "name",
            RoleClaimType = "role",
        };
        // SignalR entrega o token via querystring (?access_token=) no handshake do WebSocket.
        options.Events = new JwtBearerEvents
        {
            OnMessageReceived = ctx =>
            {
                var token = ctx.Request.Query["access_token"];
                if (!string.IsNullOrEmpty(token) && ctx.HttpContext.Request.Path.StartsWithSegments("/hub"))
                    ctx.Token = token;
                return Task.CompletedTask;
            },
        };
    });
builder.Services.AddAuthorization(options =>
{
    options.AddPolicy("Admin", p => p.RequireClaim("role", nameof(UserRole.Admin)));
    options.AddPolicy("Manager", p => p.RequireClaim("role", nameof(UserRole.Manager), nameof(UserRole.Admin)));
});

builder.Services.AddCors(options => options.AddDefaultPolicy(policy =>
{
    if (AuthOptions.AllowedOrigins.Length > 0)
        policy.WithOrigins(AuthOptions.AllowedOrigins).AllowAnyHeader().AllowAnyMethod().AllowCredentials();
    else
        policy.AllowAnyOrigin().AllowAnyHeader().AllowAnyMethod(); // dev: sem credenciais/cookies
}));

var app = builder.Build();

LiveKitService.Configure(app.Configuration);

await using (var db = await app.Services.GetRequiredService<IDbContextFactory<AppDb>>().CreateDbContextAsync())
{
    await Seed.RunAsync(db);
    await AuthSchema.EnsureAsync(db);
}

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapHub<OfficeHub>("/hub/office");
app.MapAuthEndpoints();

var api = app.MapGroup("/api");
// Em produção (DevBypass=false), toda a API exige token; em dev deixamos aberto p/ o X-User-Id.
if (!AuthOptions.DevBypass) api.RequireAuthorization();

// Identidade: primeiro o principal validado do JWT; em dev, o header simbólico X-User-Id.
static int? UserId(HttpRequest req)
{
    if (req.HttpContext.User?.FindFirst("uid")?.Value is string s && int.TryParse(s, out var id)) return id;
    if (AuthOptions.DevBypass && int.TryParse(req.Headers["X-User-Id"], out var dev)) return dev;
    return null;
}

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

// A/V por proximidade: uma sala LiveKit por cena; o cliente assina/ajusta por distância.
// Diferente de /av/token, não exige estar na zona de reunião — basta estar autenticado no mundo.
api.MapPost("/av/proximity-token", async (ProximityTokenRequest dto, HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    static string Slug(string? value) =>
        new((value ?? "").Where(c => char.IsLetterOrDigit(c) || c is '-' or '_').ToArray());
    var scene = Slug(dto.SceneId);
    if (scene.Length == 0) return Results.BadRequest(new { error = "Cena obrigatória" });
    await using var db = await f.CreateDbContextAsync();
    var user = await db.Users.FindAsync(uid);
    if (user is null) return Results.NotFound();
    // Uma sala LiveKit por (cena, sala): dentro de uma sala fechada o call é isolado;
    // sem roomId, a sala da cena inteira mantém a voz por proximidade da área aberta.
    var roomSlug = Slug(dto.RoomId);
    var room = roomSlug.Length > 0 ? $"proximity-{scene}--{roomSlug}" : $"proximity-{scene}";
    var identity = $"{uid}-{Guid.NewGuid():N}"[..16];
    var token = LiveKitService.CreateToken(identity, user.Name, room);
    return Results.Ok(new { url = LiveKitService.Url, token, room, identity });
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

// ---------- inventário unitário e mobília do cliente Phaser ----------
api.MapGet("/game/inventory", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var placements = await db.FurniturePlacements.Where(x => x.UserId == uid)
        .ToDictionaryAsync(x => x.ItemInstanceId);
    var items = await db.GameItemInstances.Where(x => x.UserId == uid)
        .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => new { x, d })
        .ToListAsync();
    return Results.Ok(items.Select(row => new
    {
        row.x.Id, row.x.InstanceKey, row.x.Location, row.x.ContainerPlacementId, row.x.AcquiredUtc,
        definition = new
        {
            row.d.Id, row.d.CatalogKey, row.d.Name, row.d.Category,
            row.d.IconPath, row.d.InteractionType,
        },
        placement = placements.TryGetValue(row.x.Id, out var p) ? new
        {
            p.Id, p.SceneId, p.RoomId, p.X, p.Y, p.FlipX,
        } : null,
    }));
});

api.MapGet("/game/rooms/{sceneId}/{roomId}/furniture", async (
    string sceneId, string roomId, IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var rows = await db.FurniturePlacements
        .Where(x => x.SceneId == sceneId && x.RoomId == roomId)
        .Join(db.GameItemInstances, p => p.ItemInstanceId, i => i.Id, (p, i) => new { p, i })
        .Join(db.GameItemDefinitions, row => row.i.DefinitionId, d => d.Id, (row, d) => new { row.p, row.i, d })
        .ToListAsync();
    return Results.Ok(rows.Select(row => FurniturePayload(row.p, row.i, row.d)));
});

api.MapPost("/game/furniture", async (
    PlaceFurniture dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    if (string.IsNullOrWhiteSpace(dto.SceneId) || string.IsNullOrWhiteSpace(dto.RoomId))
        return Results.BadRequest(new { error = "Cena e sala são obrigatórias" });
    await using var db = await f.CreateDbContextAsync();
    await using var tx = await db.Database.BeginTransactionAsync();
    var item = await db.GameItemInstances.FirstOrDefaultAsync(x => x.Id == dto.InventoryItemId && x.UserId == uid);
    if (item is null) return Results.NotFound(new { error = "Item não encontrado" });
    if (item.Location != "inventory") return Results.Conflict(new { error = "Este item não está disponível no inventário" });
    var definition = await db.GameItemDefinitions.FindAsync(item.DefinitionId);
    if (definition is null) return Results.BadRequest(new { error = "Definição inválida" });
    var placement = new FurniturePlacement
    {
        ItemInstanceId = item.Id, UserId = uid,
        SceneId = dto.SceneId.Trim()[..Math.Min(80, dto.SceneId.Trim().Length)],
        RoomId = dto.RoomId.Trim()[..Math.Min(80, dto.RoomId.Trim().Length)],
        X = Math.Clamp(dto.X, -1000, 1000), Y = Math.Clamp(dto.Y, -1000, 1000), FlipX = dto.FlipX,
    };
    db.FurniturePlacements.Add(placement);
    item.Location = "placed";
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    var payload = FurniturePayload(placement, item, definition);
    await hub.Clients.Group(OfficeHub.RoomGroup(placement.SceneId, placement.RoomId)).SendAsync("FurniturePlaced", payload);
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("InventoryChanged");
    return Results.Created($"/api/game/furniture/{placement.Id}", payload);
});

api.MapPatch("/game/furniture/{id:int}", async (
    int id, MoveFurniture dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var placement = await db.FurniturePlacements.FirstOrDefaultAsync(x => x.Id == id && x.UserId == uid);
    if (placement is null) return Results.NotFound();
    placement.X = Math.Clamp(dto.X, -1000, 1000);
    placement.Y = Math.Clamp(dto.Y, -1000, 1000);
    placement.FlipX = dto.FlipX;
    await db.SaveChangesAsync();
    var item = await db.GameItemInstances.FindAsync(placement.ItemInstanceId);
    var definition = item is null ? null : await db.GameItemDefinitions.FindAsync(item.DefinitionId);
    if (item is null || definition is null) return Results.BadRequest();
    var payload = FurniturePayload(placement, item, definition);
    await hub.Clients.Group(OfficeHub.RoomGroup(placement.SceneId, placement.RoomId)).SendAsync("FurnitureMoved", payload);
    return Results.Ok(payload);
});

api.MapDelete("/game/furniture/{id:int}", async (
    int id, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    await using var tx = await db.Database.BeginTransactionAsync();
    var placement = await db.FurniturePlacements.FirstOrDefaultAsync(x => x.Id == id && x.UserId == uid);
    if (placement is null) return Results.NotFound();
    var item = await db.GameItemInstances.FindAsync(placement.ItemInstanceId);
    if (item is null) return Results.BadRequest();
    var sceneId = placement.SceneId;
    var roomId = placement.RoomId;
    db.FurniturePlacements.Remove(placement);
    item.Location = "inventory";
    item.ContainerPlacementId = null;
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    await hub.Clients.Group(OfficeHub.RoomGroup(sceneId, roomId)).SendAsync("FurnitureRemoved", new { id });
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("InventoryChanged");
    return Results.NoContent();
});

api.MapGet("/game/chests/{placementId:int}", async (
    int placementId, HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    if (!await IsOwnedInteraction(db, placementId, uid, "chest")) return Results.NotFound();
    var rows = await db.GameItemInstances.Where(x => x.UserId == uid && x.ContainerPlacementId == placementId)
        .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => new
        {
            x.Id, x.InstanceKey, x.Location,
            definition = new { d.Id, d.CatalogKey, d.Name, d.Category, d.IconPath, d.InteractionType },
        }).ToListAsync();
    return Results.Ok(rows);
});

api.MapPost("/game/chests/{placementId:int}/{action}", async (
    int placementId, string action, ChestTransfer dto, HttpRequest req,
    IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    if (!await IsOwnedInteraction(db, placementId, uid, "chest")) return Results.NotFound();
    var item = await db.GameItemInstances.FirstOrDefaultAsync(x => x.Id == dto.InventoryItemId && x.UserId == uid);
    if (item is null) return Results.NotFound(new { error = "Item não encontrado" });
    if (action == "deposit" && item.Location == "inventory")
    {
        item.Location = "chest";
        item.ContainerPlacementId = placementId;
    }
    else if (action == "withdraw" && item.Location == "chest" && item.ContainerPlacementId == placementId)
    {
        item.Location = "inventory";
        item.ContainerPlacementId = null;
    }
    else return Results.Conflict(new { error = "O item não está na origem esperada" });
    await db.SaveChangesAsync();
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("InventoryChanged");
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("ChestChanged", new { placementId });
    return Results.Ok();
});

api.MapPost("/game/workstations/{placementId:int}/start", async (
    int placementId, WorkstationStart dto, HttpRequest req,
    IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    if (!await IsOwnedInteraction(db, placementId, uid, "workstation")) return Results.NotFound();
    var user = await db.Users.FindAsync(uid);
    var workItemId = dto.WorkItemId ?? user?.ActiveWorkItemId;
    var workItem = workItemId is int id ? await db.WorkItems.FindAsync(id) : null;
    if (workItem is null || workItem.Status == WorkItemStatus.Done)
        return Results.BadRequest(new { error = "Escolha uma atividade disponível" });
    if (await db.TimeEntries.AnyAsync(x => x.UserId == uid && x.EndUtc == null))
        return Results.Conflict(new { error = "Já existe um contador ativo" });
    if (user is not null) user.ActiveWorkItemId = workItem.Id;
    var entry = new TimeEntry
    {
        UserId = uid, WorkItemId = workItem.Id, Category = "task",
        Note = $"Estação #{placementId}: {workItem.Code}", StartUtc = DateTime.UtcNow,
    };
    db.TimeEntries.Add(entry);
    await db.SaveChangesAsync();
    await hub.Clients.All.SendAsync("Status", new { userId = uid, status = $"🔴 {workItem.Code}" });
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("WorkSessionChanged", new
    {
        active = true, entryId = entry.Id, workItemId = workItem.Id,
        workItem.Code, workItem.Title, entry.StartUtc,
    });
    return Results.Ok(new
    {
        entryId = entry.Id, workItemId = workItem.Id,
        workItem.Code, workItem.Title, entry.StartUtc,
    });
});

api.MapPost("/game/workstations/stop", async (
    HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var entry = await db.TimeEntries.Where(x => x.UserId == uid && x.EndUtc == null)
        .OrderByDescending(x => x.StartUtc).FirstOrDefaultAsync();
    if (entry is null) return Results.NotFound(new { error = "Nenhum contador ativo" });
    entry.EndUtc = DateTime.UtcNow;
    await db.SaveChangesAsync();
    await hub.Clients.All.SendAsync("Status", new { userId = uid, status = "" });
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("WorkSessionChanged", new { active = false, entry.Id, entry.EndUtc });
    return Results.Ok(new { entry.Id, entry.EndUtc });
});

app.Run();

static object FurniturePayload(FurniturePlacement p, GameItemInstance i, GameItemDefinition d) => new
{
    p.Id, p.ItemInstanceId, p.UserId, p.SceneId, p.RoomId, p.X, p.Y, p.FlipX,
    definition = new { d.Id, d.CatalogKey, d.Name, d.Category, d.IconPath, d.InteractionType },
    instanceKey = i.InstanceKey,
};

static async Task<bool> IsOwnedInteraction(AppDb db, int placementId, int userId, string interaction) =>
    await db.FurniturePlacements.Where(p => p.Id == placementId && p.UserId == userId)
        .Join(db.GameItemInstances, p => p.ItemInstanceId, i => i.Id, (p, i) => i)
        .Join(db.GameItemDefinitions, i => i.DefinitionId, d => d.Id, (i, d) => d)
        .AnyAsync(d => d.InteractionType == interaction);

record WorkItemCreate(string Title, string? Description, WorkItemType Type, int? EpicId, int? SprintId, int? AssigneeId, double? EstimateHours);
record WorkItemPatch(string? Title, string? Description, WorkItemStatus? Status, int? EpicId, int? SprintId, int? AssigneeId, double? EstimateHours);
record TimerStart(int? WorkItemId, string? Category, string? Note);
record ManualEntry(DateTime Date, int Minutes, int? WorkItemId, string? Category, string? Note);
record RoomLayout(List<RoomPlacement> Items);
record RoomPlacement(int ItemDefinitionId, int X, int Y);
record SetActiveTask(int? WorkItemId);
record ProximityTokenRequest(string? SceneId, string? RoomId);
record PlaceFurniture(int InventoryItemId, string SceneId, string RoomId, double X, double Y, bool FlipX);
record MoveFurniture(double X, double Y, bool FlipX);
record ChestTransfer(int InventoryItemId);
record WorkstationStart(int? WorkItemId);
