using System.Security.Claims;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using VirtualOffice.Api;

var builder = WebApplication.CreateBuilder(args);

AuthOptions.Configure(builder.Configuration);

// Postgres é o único provider: dev, beta e produção rodam o mesmo schema, versionado
// por migrations EF. Ver docs/BANCO_POSTGRES.md para subir o banco local.
GameOptions.Configure(builder.Configuration);
var dbConn = builder.Configuration.GetConnectionString("Default")
    ?? "Host=localhost;Port=5432;Database=officequest;Username=postgres;Password=postgres";
builder.Services.AddDbContextFactory<AppDb>(o => o.UseNpgsql(dbConn));
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
    await db.Database.MigrateAsync();
    // Em produção o banco nasce só com o catálogo curado: nada de time fictício.
    await Seed.RunAsync(db, app.Configuration.GetValue("Seed:DemoData", true));
}

app.UseDefaultFiles();
// CORS antes dos estáticos: o cliente do jogo (porta 8123 em dev) carrega
// wwwroot/shared/* desta origem. Em beta/produção tudo fica atrás do mesmo proxy.
app.UseCors();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = ctx =>
    {
        // wwwroot/shared é CÓDIGO (a UI de kanban/horas que o jogo importa), não
        // asset versionado. Sem revalidar, quem já abriu o jogo continua com a
        // tela antiga depois de um deploy — e em dev a mudança de CSS não aparece.
        if (ctx.Context.Request.Path.StartsWithSegments("/shared"))
            ctx.Context.Response.Headers.CacheControl = "no-cache";
    },
});
app.UseAuthentication();
app.UseAuthorization();
app.MapHub<OfficeHub>("/hub/office");
app.MapAuthEndpoints();

var api = app.MapGroup("/api");
// Em produção (DevBypass=false), toda a API exige token; em dev deixamos aberto p/ o X-User-Id.
if (!AuthOptions.DevBypass) api.RequireAuthorization();

// Kanban, horas e objetivos vivem em WorkEndpoints — é a API que o app web e o
// cliente do jogo compartilham.
api.MapWorkEndpoints();
api.MapCardGameEndpoints();
api.MapCasinoEndpoints();

// Identidade: primeiro o principal validado do JWT; em dev, o header simbólico X-User-Id.
static int? UserId(HttpRequest req) => Identity.UserId(req);

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

    // Bônus de boas-vindas também para quem se cadastrou antes de o beta abrir a torneira.
    if (await Game.EnsureWelcomeGrantAsync(db, user)) await db.SaveChangesAsync();

    // Soma de TimeSpan em memória (volume pequeno, e evita depender de tradução SQL).
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

    var todayRange = Periods.DayRange(DateTime.UtcNow);
    var minutesToday = finished
        .Where(t => t.StartUtc >= todayRange.Start && t.StartUtc < todayRange.End)
        .Sum(t => (t.EndUtc - t.StartUtc).TotalMinutes);

    return Results.Ok(new
    {
        user = new { user.Id, user.Name, user.Role, user.Color, user.Coins },
        levelInfo = LevelInfo(user.Xp),
        coins = user.Coins,
        minutesToday = (int)minutesToday,
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

// ---------- timer (contador ao vivo) ----------
// Um contador aberto por usuário. Parar fecha o lançamento e paga a recompensa
// pelo mesmo caminho do lançamento manual (WorkEndpoints), sem regra paralela.
async Task<object?> StopOpenTimerAsync(AppDb db, int uid, IHubContext<OfficeHub> hub)
{
    var open = await db.TimeEntries
        .Where(t => t.UserId == uid && t.EndUtc == null)
        .OrderByDescending(t => t.StartUtc).FirstOrDefaultAsync();
    if (open is null) return null;

    open.EndUtc = DateTime.UtcNow;
    var minutes = Math.Max(1, (int)Math.Round((open.EndUtc.Value - open.StartUtc).TotalMinutes));
    open.EndUtc = open.StartUtc.AddMinutes(minutes);

    var activity = await db.ActivityTypes.FirstOrDefaultAsync(a => a.Key == open.Category);
    var user = await db.Users.FindAsync(uid);
    XpResult? xp = null;
    if (user is not null && activity is not null)
    {
        var reward = await Game.CapDailyAsync(db, uid, Game.RewardFor(activity, minutes), open.StartUtc);
        if (!reward.IsEmpty)
        {
            xp = await Game.AwardAsync(db, user, reward, $"tempo: {activity.Name} ({minutes}min)", "time");
            open.XpAwarded = reward.Xp;
            open.GoldAwarded = reward.Gold;
        }
        // drop de foco: sessões de 25min+ têm chance de drop
        if (xp is { Drop: null } && minutes >= 25 && Random.Shared.NextDouble() < 0.25)
        {
            var drop = await Game.RollDropAsync(db, uid);
            if (drop is not null) xp = xp with { Drop = drop };
        }
    }
    await db.SaveChangesAsync();
    var completions = await ObjectiveEngine.RecalculateAsync(db, uid);
    await db.SaveChangesAsync();

    foreach (var p in Presence.Players.Values.Where(p => p.UserId == uid)) p.Status = "";
    await hub.Clients.All.SendAsync("Status", new { userId = uid, status = "" });
    if (xp is not null)
        await Notify.SendRewardAsync(hub, uid, xp, $"Contador parado: {minutes}min (+{xp.Amount} XP · +{xp.Gold} 🪙)");
    await Notify.SendObjectivesAsync(hub, uid, completions);
    await Notify.TimeChangedAsync(hub, uid);
    return new { minutes, xp = xp?.Amount ?? 0, gold = xp?.Gold ?? 0 };
}

api.MapPost("/timer/start", async (TimerStart dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var key = string.IsNullOrWhiteSpace(dto.Category) ? (dto.WorkItemId > 0 ? "task" : "outro") : dto.Category!;
    var activity = await db.ActivityTypes.FirstOrDefaultAsync(a => a.Key == key && a.IsActive);
    if (activity is null) return Results.BadRequest(new { error = "Tipo de lançamento desconhecido." });

    var user = await db.Users.FindAsync(uid);
    var workItemId = dto.WorkItemId is 0 or null ? user?.ActiveWorkItemId : dto.WorkItemId;
    if (activity.RequiresWorkItem && workItemId is null)
        return Results.BadRequest(new { error = $"{activity.Name} precisa de uma atividade do quadro." });

    await StopOpenTimerAsync(db, uid, hub);
    var entry = new TimeEntry
    {
        UserId = uid,
        WorkItemId = workItemId,
        Category = activity.Key,
        Note = dto.Note ?? "",
        Source = "timer",
        PairUserId = dto.PairUserId is 0 ? null : dto.PairUserId,
        StartUtc = DateTime.UtcNow,
    };
    db.TimeEntries.Add(entry);
    // Contar tempo é declarar no que se está trabalhando: a atividade ativa segue o contador.
    if (user is not null && workItemId is int wid) user.ActiveWorkItemId = wid;
    await db.SaveChangesAsync();

    var status = $"{activity.Icon} {activity.Name}";
    if (entry.WorkItemId is int wi && await db.WorkItems.FindAsync(wi) is { } item) status = $"🔴 {item.Code}";
    foreach (var p in Presence.Players.Values.Where(p => p.UserId == uid)) p.Status = status;
    await hub.Clients.All.SendAsync("Status", new { userId = uid, status });
    await Notify.TimeChangedAsync(hub, uid);
    return Results.Ok(new { entry.Id, entry.Category, entry.StartUtc, entry.WorkItemId });
});

api.MapPost("/timer/stop", async (HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var result = await StopOpenTimerAsync(db, uid, hub);
    return result is null ? Results.NoContent() : Results.Ok(result);
});

// ---------- relatórios ----------
api.MapGet("/reports/summary", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var days = int.TryParse(req.Query["days"], out var d) ? Math.Clamp(d, 1, 90) : 14;
    // Os dias do relatorio sao dias do time (fuso de GameOptions), nao dias UTC.
    var from = Periods.DayStart(DateTime.UtcNow).AddDays(-(days - 1));

    var entries = await db.TimeEntries
        .Where(e => e.EndUtc != null && e.StartUtc >= from)
        .ToListAsync();
    var users = await db.Users.ToDictionaryAsync(u => u.Id);
    var epics = await db.Epics.ToDictionaryAsync(e => e.Id);
    var workItems = await db.WorkItems.ToDictionaryAsync(w => w.Id);
    var activities = await db.ActivityTypes.ToDictionaryAsync(a => a.Key);

    int Minutes(TimeEntry e) => (int)Math.Round((e.EndUtc!.Value - e.StartUtc).TotalMinutes);

    var byDay = entries.GroupBy(e => Periods.LocalDate(e.StartUtc))
        .ToDictionary(g => g.Key, g => g.Sum(Minutes));
    var perDay = Enumerable.Range(0, days)
        .Select(i => Periods.LocalDate(from.AddDays(i)))
        .Select(day => new
        {
            date = day.ToString("yyyy-MM-dd"),
            minutes = byDay.GetValueOrDefault(day),
        });

    var perCategory = entries.GroupBy(e => e.Category)
        .Select(g => new
        {
            category = g.Key,
            name = activities.TryGetValue(g.Key, out var a) ? a.Name : g.Key,
            icon = activities.TryGetValue(g.Key, out var a2) ? a2.Icon : "",
            color = activities.TryGetValue(g.Key, out var a3) ? a3.Color : "#8b929d",
            minutes = g.Sum(Minutes),
        })
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
api.MapGet("/game/personal-rooms", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    await GameInventorySeed.EnsureUserStockAsync(db, uid);
    var rooms = await db.PersonalRooms
        .Join(db.Users, room => room.UserId, user => user.Id, (room, user) => new
        {
            room.RoomKey,
            room.WingIndex,
            room.SlotIndex,
            room.SceneTemplate,
            owner = new { user.Id, user.Name, user.Color },
            mine = user.Id == uid,
        })
        .OrderBy(x => x.WingIndex).ThenBy(x => x.SlotIndex)
        .ToListAsync();
    var current = rooms.Single(x => x.mine);
    return Results.Ok(new
    {
        roomsPerWing = GameInventorySeed.RoomsPerFloor,
        wingCount = Math.Max(
            GameInventorySeed.MinimumFloors,
            rooms.Count == 0 ? 0 : rooms.Max(x => x.WingIndex) + 1),
        current,
        rooms,
    });
});

api.MapGet("/game/catalog", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    var user = await db.Users.FindAsync(uid);
    if (user is null) return Results.NotFound();
    var definitions = await db.GameItemDefinitions
        .OrderBy(x => x.ItemType).ThenBy(x => x.Category).ThenBy(x => x.Price)
        .Select(x => new
        {
            x.Id, x.CatalogKey, x.Name, x.Category, x.IconPath, x.InteractionType,
            x.ItemType, x.Rarity, x.Price, x.IsPurchasable, x.StarterQuantity,
            x.CapabilitiesJson,
        })
        .ToListAsync();
    return Results.Ok(new { user.Coins, definitions });
});

api.MapPost("/game/catalog/{catalogKey}/purchase", async (
    string catalogKey, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    await using var tx = await db.Database.BeginTransactionAsync();
    var user = await db.Users.FindAsync(uid);
    var definition = await db.GameItemDefinitions.SingleOrDefaultAsync(x => x.CatalogKey == catalogKey);
    if (user is null || definition is null) return Results.NotFound();
    if (!definition.IsPurchasable) return Results.BadRequest(new { error = "Este item não está à venda" });
    if (user.Coins < definition.Price)
        return Results.Conflict(new { error = "Moedas insuficientes", coins = user.Coins, price = definition.Price });
    user.Coins -= definition.Price;
    var instance = new GameItemInstance { UserId = uid, DefinitionId = definition.Id };
    db.GameItemInstances.Add(instance);
    await db.SaveChangesAsync();
    await tx.CommitAsync();
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("InventoryChanged");
    return Results.Created($"/api/game/inventory/{instance.Id}", new
    {
        instance.Id, instance.InstanceKey, coins = user.Coins,
        definition = new { definition.CatalogKey, definition.Name, definition.ItemType },
    });
});

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
            row.d.IconPath, row.d.InteractionType, row.d.ItemType, row.d.Rarity,
            row.d.Price, row.d.IsPurchasable, row.d.CapabilitiesJson,
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

api.MapGet("/game/scenes/{sceneId}/furniture", async (
    string sceneId, IDbContextFactory<AppDb> f) =>
{
    await using var db = await f.CreateDbContextAsync();
    var rows = await db.FurniturePlacements
        .Where(x => x.SceneId == sceneId)
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
    if (dto.SceneId.StartsWith("personal-wing@", StringComparison.OrdinalIgnoreCase)
        && !await db.PersonalRooms.AnyAsync(x => x.RoomKey == dto.RoomId && x.UserId == uid))
        return Results.Json(new { error = "Somente o dono pode decorar esta sala pessoal" }, statusCode: 403);
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
    return await StartWorkSession(db, hub, uid, dto.WorkItemId, $"Estação #{placementId}", dto.ActivityKey);
});

api.MapPost("/game/workstations/scenery/{entityKey}/start", async (
    string entityKey, WorkstationStart dto, HttpRequest req,
    IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    var safeKey = new string(entityKey.Where(c => char.IsLetterOrDigit(c) || c is '-' or '_' or ':').ToArray());
    if (safeKey.Length == 0 || safeKey.Length > 100) return Results.BadRequest(new { error = "Estação inválida" });
    await using var db = await f.CreateDbContextAsync();
    return await StartWorkSession(db, hub, uid, dto.WorkItemId, $"Estação pública {safeKey}", dto.ActivityKey);
});

api.MapPost("/game/workstations/stop", async (
    HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
{
    if (UserId(req) is not int uid) return Results.Unauthorized();
    await using var db = await f.CreateDbContextAsync();
    // Mesmo caminho do /timer/stop: encerrar na estação também paga XP e gold.
    // Antes a estação só fechava a linha e o tempo do jogo não valia nada.
    var result = await StopOpenTimerAsync(db, uid, hub);
    if (result is null) return Results.NotFound(new { error = "Nenhum contador ativo" });
    await hub.Clients.Group(OfficeHub.UserGroup(uid)).SendAsync("WorkSessionChanged", new { active = false });
    return Results.Ok(result);
});

app.Run();

static object FurniturePayload(FurniturePlacement p, GameItemInstance i, GameItemDefinition d) => new
{
    p.Id, p.ItemInstanceId, p.UserId, p.SceneId, p.RoomId, p.X, p.Y, p.FlipX,
    definition = new
    {
        d.Id, d.CatalogKey, d.Name, d.Category, d.IconPath, d.InteractionType,
        d.ItemType, d.Rarity, d.Price, d.CapabilitiesJson,
    },
    instanceKey = i.InstanceKey,
};

static async Task<bool> IsOwnedInteraction(AppDb db, int placementId, int userId, string interaction) =>
    await db.FurniturePlacements.Where(p => p.Id == placementId && p.UserId == userId)
        .Join(db.GameItemInstances, p => p.ItemInstanceId, i => i.Id, (p, i) => i)
        .Join(db.GameItemDefinitions, i => i.DefinitionId, d => d.Id, (i, d) => d)
        .AnyAsync(d => d.InteractionType == interaction);

static async Task<IResult> StartWorkSession(
    AppDb db,
    IHubContext<OfficeHub> hub,
    int userId,
    int? requestedWorkItemId,
    string source,
    string? activityKey = null)
{
    var user = await db.Users.FindAsync(userId);
    var workItemId = requestedWorkItemId ?? user?.ActiveWorkItemId;
    var workItem = workItemId is int id ? await db.WorkItems.FindAsync(id) : null;
    if (workItem is null || workItem.Status == WorkItemStatus.Done)
        return Results.BadRequest(new { error = "Escolha uma atividade disponível" });
    if (await db.TimeEntries.AnyAsync(x => x.UserId == userId && x.EndUtc == null))
        return Results.Conflict(new { error = "Já existe um contador ativo" });
    if (user is not null) user.ActiveWorkItemId = workItem.Id;
    var key = string.IsNullOrWhiteSpace(activityKey) ? "task" : activityKey!;
    if (!await db.ActivityTypes.AnyAsync(a => a.Key == key && a.IsActive)) key = "task";
    var entry = new TimeEntry
    {
        UserId = userId,
        WorkItemId = workItem.Id,
        Category = key,
        Note = $"{source}: {workItem.Code}",
        Source = "game",
        StartUtc = DateTime.UtcNow,
    };
    db.TimeEntries.Add(entry);
    await db.SaveChangesAsync();
    await hub.Clients.All.SendAsync("Status", new { userId, status = $"🔴 {workItem.Code}" });
    await hub.Clients.Group(OfficeHub.UserGroup(userId)).SendAsync("WorkSessionChanged", new
    {
        active = true,
        entryId = entry.Id,
        workItemId = workItem.Id,
        workItem.Code,
        workItem.Title,
        entry.StartUtc,
    });
    return Results.Ok(new
    {
        entryId = entry.Id,
        workItemId = workItem.Id,
        workItem.Code,
        workItem.Title,
        entry.StartUtc,
    });
}

record TimerStart(int? WorkItemId, string? Category, string? Note, int? PairUserId);
record RoomLayout(List<RoomPlacement> Items);
record RoomPlacement(int ItemDefinitionId, int X, int Y);
record SetActiveTask(int? WorkItemId);
record ProximityTokenRequest(string? SceneId, string? RoomId);
record PlaceFurniture(int InventoryItemId, string SceneId, string RoomId, double X, double Y, bool FlipX);
record MoveFurniture(double X, double Y, bool FlipX);
record ChestTransfer(int InventoryItemId);
record WorkstationStart(int? WorkItemId, string? ActivityKey);
