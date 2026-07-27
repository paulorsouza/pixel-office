using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>Identidade da requisição: JWT primeiro, X-User-Id só quando o DevBypass está ligado.</summary>
public static class Identity
{
    public static int? UserId(HttpRequest req)
    {
        if (req.HttpContext.User?.FindFirst("uid")?.Value is string s && int.TryParse(s, out var id)) return id;
        if (AuthOptions.DevBypass && int.TryParse(req.Headers["X-User-Id"], out var dev)) return dev;
        return null;
    }
}

/// <summary>
/// Kanban, lançamento de horas e objetivos. É a mesma API para o app web e para o
/// cliente do jogo — os dois consomem a UI compartilhada de <c>wwwroot/shared</c>,
/// então qualquer regra nova precisa nascer aqui e não na tela.
/// </summary>
public static class WorkEndpoints
{
    private const double OrderGap = 1000.0;

    public static void MapWorkEndpoints(this RouteGroupBuilder api)
    {
        MapBoard(api);
        MapWorkItemDetail(api);
        MapLabels(api);
        MapTime(api);
        MapObjectives(api);
    }

    // ---------------------------------------------------------------- kanban

    private static void MapBoard(RouteGroupBuilder api)
    {
        api.MapGet("/board", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var q = db.WorkItems.AsQueryable();
            if (req.Query["includeArchived"] != "true") q = q.Where(w => w.ArchivedUtc == null);
            if (int.TryParse(req.Query["sprintId"], out var sid))
                q = sid == 0 ? q.Where(w => w.SprintId == null) : q.Where(w => w.SprintId == sid);
            if (Enum.TryParse<WorkItemType>(req.Query["type"], out var type)) q = q.Where(w => w.Type == type);
            if (Enum.TryParse<WorkItemPriority>(req.Query["priority"], out var prio)) q = q.Where(w => w.Priority == prio);
            if (int.TryParse(req.Query["epicId"], out var eid)) q = q.Where(w => w.EpicId == eid);
            if (int.TryParse(req.Query["assigneeId"], out var aid))
                q = aid == 0 ? q.Where(w => w.AssigneeId == null) : q.Where(w => w.AssigneeId == aid);
            if (req.Query["blocked"] == "true") q = q.Where(w => w.IsBlocked);
            var term = req.Query["q"].ToString().Trim();
            if (term.Length > 0)
                q = q.Where(w => EF.Functions.ILike(w.Title, $"%{term}%") || EF.Functions.ILike(w.Code, $"%{term}%"));
            if (int.TryParse(req.Query["labelId"], out var lid) && lid > 0)
                q = q.Where(w => db.WorkItemLabels.Any(x => x.WorkItemId == w.Id && x.LabelId == lid));

            var items = await q.OrderBy(w => w.BoardOrder).ThenBy(w => w.Id).ToListAsync();
            return Results.Ok(new
            {
                columns = Enum.GetNames<WorkItemStatus>(),
                items = await CardsAsync(db, items),
            });
        });

        // Compatibilidade: o cliente do jogo e telas antigas usam esta lista simples.
        api.MapGet("/workitems", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var q = db.WorkItems.Where(w => w.ArchivedUtc == null);
            if (int.TryParse(req.Query["sprintId"], out var sid))
                q = sid == 0 ? q.Where(w => w.SprintId == null) : q.Where(w => w.SprintId == sid);
            if (Enum.TryParse<WorkItemType>(req.Query["type"], out var type)) q = q.Where(w => w.Type == type);
            if (int.TryParse(req.Query["epicId"], out var eid)) q = q.Where(w => w.EpicId == eid);
            var items = await q.OrderBy(w => w.BoardOrder).ThenBy(w => w.Id).ToListAsync();
            return Results.Ok(await CardsAsync(db, items));
        });

        api.MapPost("/workitems", async (
            WorkItemCreate dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            var title = (dto.Title ?? "").Trim();
            if (title.Length == 0) return Results.BadRequest(new { error = "Dê um título para a atividade." });
            await using var db = await f.CreateDbContextAsync();

            var prefix = dto.Type switch
            {
                WorkItemType.Bug => "BUG",
                WorkItemType.Atendimento => "ATD",
                _ => "TSK",
            };
            // O código é sequencial por tipo e não pode repetir mesmo com itens arquivados.
            var count = await db.WorkItems.CountAsync(w => w.Type == dto.Type);
            var code = $"{prefix}-{count + 1}";
            while (await db.WorkItems.AnyAsync(w => w.Code == code)) code = $"{prefix}-{++count + 1}";

            var status = dto.Status ?? (dto.SprintId is null or 0 ? WorkItemStatus.Backlog : WorkItemStatus.Todo);
            var now = DateTime.UtcNow;
            var item = new WorkItem
            {
                Code = code,
                Title = title[..Math.Min(160, title.Length)],
                Description = dto.Description ?? "",
                Type = dto.Type,
                Status = status,
                Priority = dto.Priority ?? WorkItemPriority.Medium,
                EpicId = dto.EpicId is 0 ? null : dto.EpicId,
                SprintId = dto.SprintId is 0 ? null : dto.SprintId,
                AssigneeId = dto.AssigneeId is 0 ? null : dto.AssigneeId,
                CreatedById = uid,
                EstimateHours = dto.EstimateHours,
                DueUtc = dto.DueUtc is DateTime due ? Periods.Utc(due) : null,
                CreatedUtc = now,
                UpdatedUtc = now,
                BoardOrder = await NextOrderAsync(db, status),
            };
            db.WorkItems.Add(item);
            await db.SaveChangesAsync();
            await ApplyLabelsAsync(db, item.Id, dto.LabelIds);
            db.WorkItemEvents.Add(new WorkItemEvent { WorkItemId = item.Id, UserId = uid, Kind = "created", ToValue = code });
            await db.SaveChangesAsync();

            await Notify.BoardChangedAsync(hub, item.Id, "created");
            return Results.Ok((await CardsAsync(db, [item])).Single());
        });

        api.MapPatch("/workitems/{id:int}", async (
            int id, WorkItemPatch dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var item = await db.WorkItems.FindAsync(id);
            if (item is null) return Results.NotFound();

            void Log(string kind, string from, string to)
            {
                if (from == to) return;
                db.WorkItemEvents.Add(new WorkItemEvent
                {
                    WorkItemId = item.Id, UserId = uid, Kind = kind, FromValue = from, ToValue = to,
                });
            }

            if (dto.Title is not null) item.Title = dto.Title.Trim();
            if (dto.Description is not null) item.Description = dto.Description;
            if (dto.EpicId is int e) item.EpicId = e == 0 ? null : e;
            if (dto.SprintId is int s) { Log("sprint", $"{item.SprintId}", $"{s}"); item.SprintId = s == 0 ? null : s; }
            if (dto.AssigneeId is int a) { Log("assignee", $"{item.AssigneeId}", $"{a}"); item.AssigneeId = a == 0 ? null : a; }
            if (dto.Priority is WorkItemPriority p) { Log("priority", item.Priority.ToString(), p.ToString()); item.Priority = p; }
            if (dto.EstimateHours is double est) item.EstimateHours = est == 0 ? null : est;
            if (dto.DueUtc is DateTime due) item.DueUtc = due == default ? null : Periods.Utc(due);
            if (dto.IsBlocked is bool blocked)
            {
                Log("blocked", item.IsBlocked ? "sim" : "não", blocked ? "sim" : "não");
                item.IsBlocked = blocked;
                item.BlockedReason = blocked ? (dto.BlockedReason ?? item.BlockedReason) : "";
            }
            else if (dto.BlockedReason is not null) item.BlockedReason = dto.BlockedReason;
            if (dto.Archived is bool archived) item.ArchivedUtc = archived ? DateTime.UtcNow : null;
            if (dto.LabelIds is not null) await ApplyLabelsAsync(db, item.Id, dto.LabelIds);

            object? reward = null;
            if (dto.Status is WorkItemStatus st && st != item.Status)
            {
                Log("status", item.Status.ToString(), st.ToString());
                reward = await ApplyStatusAsync(db, hub, item, st, uid);
            }
            item.UpdatedUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await Notify.BoardChangedAsync(hub, item.Id, "updated");
            return Results.Ok(new { card = (await CardsAsync(db, [item])).Single(), reward });
        });

        // Mover é separado do patch porque carrega posição: o drag & drop precisa
        // preservar a ordem dentro da coluna, não só o status.
        api.MapPost("/workitems/{id:int}/move", async (
            int id, MoveCard dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var item = await db.WorkItems.FindAsync(id);
            if (item is null) return Results.NotFound();

            var target = dto.Status ?? item.Status;
            var siblings = await db.WorkItems
                .Where(w => w.Status == target && w.Id != id && w.ArchivedUtc == null)
                .OrderBy(w => w.BoardOrder).ThenBy(w => w.Id)
                .Select(w => w.BoardOrder)
                .ToListAsync();
            var index = Math.Clamp(dto.Position ?? siblings.Count, 0, siblings.Count);
            var before = index > 0 ? siblings[index - 1] : (double?)null;
            var after = index < siblings.Count ? siblings[index] : (double?)null;
            item.BoardOrder = (before, after) switch
            {
                (null, null) => OrderGap,
                (null, double n) => n - OrderGap,
                (double p, null) => p + OrderGap,
                (double p, double n) => (p + n) / 2,
            };

            object? reward = null;
            if (target != item.Status)
            {
                db.WorkItemEvents.Add(new WorkItemEvent
                {
                    WorkItemId = item.Id, UserId = uid, Kind = "status",
                    FromValue = item.Status.ToString(), ToValue = target.ToString(),
                });
                reward = await ApplyStatusAsync(db, hub, item, target, uid);
            }
            item.UpdatedUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            await Notify.BoardChangedAsync(hub, item.Id, "moved");
            return Results.Ok(new { card = (await CardsAsync(db, [item])).Single(), reward });
        });
    }

    /// <summary>Aplica a troca de status, marcando início/conclusão e pagando a recompensa uma única vez.</summary>
    private static async Task<object?> ApplyStatusAsync(
        AppDb db, IHubContext<OfficeHub> hub, WorkItem item, WorkItemStatus status, int actorId)
    {
        var wasDone = item.Status == WorkItemStatus.Done;
        item.Status = status;
        if (status == WorkItemStatus.InProgress) item.StartedUtc ??= DateTime.UtcNow;
        item.DoneUtc = status == WorkItemStatus.Done ? DateTime.UtcNow : null;
        if (status != WorkItemStatus.Done || wasDone) return null;

        // Quem entrega ganha; sem responsável, quem moveu leva o crédito.
        var beneficiary = item.AssigneeId ?? actorId;
        var user = await db.Users.FindAsync(beneficiary);
        if (user is null) return null;

        var (xp, gold) = item.Type switch
        {
            WorkItemType.Bug => (60, 45),
            WorkItemType.Atendimento => (40, 30),
            _ => (50, 35),
        };
        var multiplier = item.Priority switch
        {
            WorkItemPriority.Urgent => 1.6,
            WorkItemPriority.High => 1.3,
            WorkItemPriority.Low => 0.8,
            _ => 1.0,
        };
        var reward = new Reward((int)Math.Round(xp * multiplier), (int)Math.Round(gold * multiplier));
        var result = await Game.AwardAsync(db, user, reward, $"concluiu {item.Code}", "workitem");
        var completions = await ObjectiveEngine.RecalculateAsync(db, beneficiary);
        await db.SaveChangesAsync();

        await Notify.SendRewardAsync(hub, beneficiary, result, $"{item.Code} concluída! +{reward.Xp} XP · +{reward.Gold} 🪙");
        await Notify.SendObjectivesAsync(hub, beneficiary, completions);
        return new { xp = result.Amount, gold = result.Gold, result.LeveledUp, result.Level };
    }

    private static void MapWorkItemDetail(RouteGroupBuilder api)
    {
        api.MapGet("/workitems/{id:int}", async (int id, IDbContextFactory<AppDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            var item = await db.WorkItems.FindAsync(id);
            if (item is null) return Results.NotFound();
            var users = await db.Users.ToDictionaryAsync(u => u.Id);
            var comments = await db.WorkItemComments.Where(c => c.WorkItemId == id)
                .OrderBy(c => c.CreatedUtc).ToListAsync();
            var checklist = await db.ChecklistItems.Where(c => c.WorkItemId == id)
                .OrderBy(c => c.Position).ThenBy(c => c.Id).ToListAsync();
            var events = await db.WorkItemEvents.Where(x => x.WorkItemId == id)
                .OrderByDescending(x => x.CreatedUtc).Take(40).ToListAsync();
            var entries = await db.TimeEntries.Where(t => t.WorkItemId == id && t.EndUtc != null)
                .OrderByDescending(t => t.StartUtc).Take(50).ToListAsync();

            object? Who(int? uid) => uid is int v && users.TryGetValue(v, out var u)
                ? new { u.Id, u.Name, u.Color } : null;

            return Results.Ok(new
            {
                card = (await CardsAsync(db, [item])).Single(),
                comments = comments.Select(c => new { c.Id, c.Body, c.CreatedUtc, c.EditedUtc, author = Who(c.UserId) }),
                checklist = checklist.Select(c => new { c.Id, c.Text, c.Done, c.Position }),
                events = events.Select(x => new { x.Id, x.Kind, x.FromValue, x.ToValue, x.CreatedUtc, actor = Who(x.UserId) }),
                timeEntries = entries.Select(t => new
                {
                    t.Id, t.Category, t.StartUtc, t.EndUtc,
                    minutes = (int)Math.Round((t.EndUtc!.Value - t.StartUtc).TotalMinutes),
                    user = Who(t.UserId),
                }),
            });
        });

        api.MapPost("/workitems/{id:int}/comments", async (
            int id, CommentBody dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            var body = (dto.Body ?? "").Trim();
            if (body.Length == 0) return Results.BadRequest(new { error = "Comentário vazio." });
            await using var db = await f.CreateDbContextAsync();
            if (!await db.WorkItems.AnyAsync(w => w.Id == id)) return Results.NotFound();
            var comment = new WorkItemComment { WorkItemId = id, UserId = uid, Body = body[..Math.Min(4000, body.Length)] };
            db.WorkItemComments.Add(comment);
            db.WorkItemEvents.Add(new WorkItemEvent { WorkItemId = id, UserId = uid, Kind = "comment" });
            await db.SaveChangesAsync();
            await Notify.BoardChangedAsync(hub, id, "comment");
            var author = await db.Users.FindAsync(uid);
            return Results.Ok(new
            {
                comment.Id, comment.Body, comment.CreatedUtc,
                author = author is null ? null : new { author.Id, author.Name, author.Color },
            });
        });

        api.MapDelete("/comments/{id:int}", async (int id, HttpRequest req, IDbContextFactory<AppDb> f) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var comment = await db.WorkItemComments.FirstOrDefaultAsync(c => c.Id == id && c.UserId == uid);
            if (comment is null) return Results.NotFound();
            db.WorkItemComments.Remove(comment);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        api.MapPost("/workitems/{id:int}/checklist", async (
            int id, ChecklistBody dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is null) return Results.Unauthorized();
            var text = (dto.Text ?? "").Trim();
            if (text.Length == 0) return Results.BadRequest(new { error = "Descreva o item." });
            await using var db = await f.CreateDbContextAsync();
            if (!await db.WorkItems.AnyAsync(w => w.Id == id)) return Results.NotFound();
            var position = await db.ChecklistItems.Where(c => c.WorkItemId == id)
                .Select(c => (int?)c.Position).MaxAsync() ?? 0;
            var row = new ChecklistItem { WorkItemId = id, Text = text[..Math.Min(300, text.Length)], Position = position + 1 };
            db.ChecklistItems.Add(row);
            await db.SaveChangesAsync();
            await Notify.BoardChangedAsync(hub, id, "checklist");
            return Results.Ok(new { row.Id, row.Text, row.Done, row.Position });
        });

        api.MapPatch("/checklist/{id:int}", async (
            int id, ChecklistBody dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is null) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var row = await db.ChecklistItems.FindAsync(id);
            if (row is null) return Results.NotFound();
            if (dto.Text is not null) row.Text = dto.Text.Trim();
            if (dto.Done is bool done) row.Done = done;
            await db.SaveChangesAsync();
            await Notify.BoardChangedAsync(hub, row.WorkItemId, "checklist");
            return Results.Ok(new { row.Id, row.Text, row.Done, row.Position });
        });

        api.MapDelete("/checklist/{id:int}", async (
            int id, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is null) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var row = await db.ChecklistItems.FindAsync(id);
            if (row is null) return Results.NotFound();
            db.ChecklistItems.Remove(row);
            await db.SaveChangesAsync();
            await Notify.BoardChangedAsync(hub, row.WorkItemId, "checklist");
            return Results.NoContent();
        });
    }

    private static void MapLabels(RouteGroupBuilder api)
    {
        api.MapGet("/labels", async (IDbContextFactory<AppDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await db.Labels.OrderBy(l => l.Name).ToListAsync();
        });

        api.MapPost("/labels", async (Label dto, HttpRequest req, IDbContextFactory<AppDb> f) =>
        {
            if (Identity.UserId(req) is null) return Results.Unauthorized();
            var name = (dto.Name ?? "").Trim().ToLowerInvariant();
            if (name.Length == 0) return Results.BadRequest(new { error = "Nome da etiqueta é obrigatório." });
            await using var db = await f.CreateDbContextAsync();
            var existing = await db.Labels.FirstOrDefaultAsync(l => l.Name == name);
            if (existing is not null) return Results.Ok(existing);
            var label = new Label { Name = name[..Math.Min(40, name.Length)], Color = dto.Color };
            db.Labels.Add(label);
            await db.SaveChangesAsync();
            return Results.Ok(label);
        });
    }

    // ------------------------------------------------------------- horas

    private static void MapTime(RouteGroupBuilder api)
    {
        api.MapGet("/activity-types", async (IDbContextFactory<AppDb> f) =>
        {
            await using var db = await f.CreateDbContextAsync();
            return await db.ActivityTypes.Where(a => a.IsActive).OrderBy(a => a.SortOrder)
                .Select(a => new
                {
                    a.Key, a.Name, a.Icon, a.Color, a.XpPerHour, a.GoldPerHour,
                    a.RequiresWorkItem, a.DefaultMinutes, a.DailyTargetMinutes, a.CountsAsWork, a.AllowsPair,
                }).ToListAsync();
        });

        // Timesheet: a grade da semana, os totais por dia/categoria e o quanto falta
        // para a meta — tudo calculado no servidor para o jogo e o app não divergirem.
        api.MapGet("/timesheet", async (HttpRequest req, IDbContextFactory<AppDb> f) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var now = DateTime.UtcNow;
            var from = DateTime.TryParse(req.Query["from"], out var fr) ? Periods.Utc(fr) : Periods.WeekStart(now);
            var to = DateTime.TryParse(req.Query["to"], out var t) ? Periods.Utc(t) : from.AddDays(7);

            var entries = await db.TimeEntries
                .Where(e => e.UserId == uid && e.StartUtc >= from && e.StartUtc < to)
                .OrderByDescending(e => e.StartUtc).ToListAsync();
            var activities = await db.ActivityTypes.ToDictionaryAsync(a => a.Key);
            var wiIds = entries.Where(e => e.WorkItemId != null).Select(e => e.WorkItemId!.Value).Distinct().ToList();
            var wis = await db.WorkItems.Where(w => wiIds.Contains(w.Id)).ToDictionaryAsync(w => w.Id);
            var pairIds = entries.Where(e => e.PairUserId != null).Select(e => e.PairUserId!.Value).Distinct().ToList();
            var pairs = await db.Users.Where(u => pairIds.Contains(u.Id)).ToDictionaryAsync(u => u.Id);

            static int Mins(TimeEntry e) => e.EndUtc is null
                ? 0 : (int)Math.Round((e.EndUtc.Value - e.StartUtc).TotalMinutes);

            var closed = entries.Where(e => e.EndUtc != null).ToList();
            var open = entries.FirstOrDefault(e => e.EndUtc == null);
            var dayTotals = closed
                .GroupBy(e => Periods.LocalDate(e.StartUtc))
                .ToDictionary(g => g.Key.ToString("yyyy-MM-dd"), g => g.Sum(Mins));

            return Results.Ok(new
            {
                from,
                to,
                timeZoneOffsetHours = GameOptions.TimeZoneOffsetHours,
                dayTotals,
                byActivity = closed.GroupBy(e => e.Category)
                    .Select(g => new
                    {
                        activityKey = g.Key,
                        name = activities.TryGetValue(g.Key, out var a) ? a.Name : g.Key,
                        color = activities.TryGetValue(g.Key, out var a2) ? a2.Color : "#8b929d",
                        icon = activities.TryGetValue(g.Key, out var a3) ? a3.Icon : "📌",
                        minutes = g.Sum(Mins),
                        days = g.GroupBy(e => Periods.LocalDate(e.StartUtc))
                            .ToDictionary(d => d.Key.ToString("yyyy-MM-dd"), d => d.Sum(Mins)),
                    }),
                totalMinutes = closed.Sum(Mins),
                xpEarned = closed.Sum(e => e.XpAwarded),
                goldEarned = closed.Sum(e => e.GoldAwarded),
                running = open is null ? null : new
                {
                    open.Id, open.Category, open.Note, open.StartUtc,
                    workItem = open.WorkItemId is int w && wis.TryGetValue(w, out var rw)
                        ? new { rw.Id, rw.Code, rw.Title } : null,
                },
                entries = closed.Select(e => new
                {
                    e.Id, e.Category, e.Note, e.StartUtc, e.EndUtc, e.Source,
                    e.XpAwarded, e.GoldAwarded,
                    minutes = Mins(e),
                    date = Periods.LocalDate(e.StartUtc).ToString("yyyy-MM-dd"),
                    workItem = e.WorkItemId is int w && wis.TryGetValue(w, out var wi)
                        ? new { wi.Id, wi.Code, wi.Title } : null,
                    pair = e.PairUserId is int p && pairs.TryGetValue(p, out var pu)
                        ? new { pu.Id, pu.Name, pu.Color } : null,
                }),
            });
        });

        api.MapPost("/timeentries", async (
            LogEntry dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var result = await LogAsync(db, hub, uid, dto);
            return result;
        });

        // Lançamento rápido: um clique usa a duração padrão do tipo (6h de dev,
        // 1h de pair, 30min de estudo…). É o atalho que o time usa todo dia.
        api.MapPost("/timeentries/quick", async (
            QuickEntry dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var activity = await db.ActivityTypes.FirstOrDefaultAsync(a => a.Key == dto.ActivityKey && a.IsActive);
            if (activity is null) return Results.BadRequest(new { error = "Tipo de lançamento desconhecido." });
            var user = await db.Users.FindAsync(uid);
            return await LogAsync(db, hub, uid, new LogEntry(
                dto.Date,
                dto.Minutes is > 0 ? dto.Minutes : activity.DefaultMinutes,
                dto.WorkItemId ?? (activity.RequiresWorkItem ? user?.ActiveWorkItemId : null),
                activity.Key,
                dto.Note,
                dto.PairUserId,
                "quick"));
        });

        api.MapPatch("/timeentries/{id:int}", async (
            int id, LogEntry dto, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var entry = await db.TimeEntries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == uid);
            if (entry is null) return Results.NotFound();
            if (entry.EndUtc is null) return Results.Conflict(new { error = "Pare o contador antes de editar." });

            await RevertRewardAsync(db, entry);
            if (dto.Minutes > 0)
            {
                if (dto.Minutes > 24 * 60) return Results.BadRequest(new { error = "Duração inválida." });
                entry.EndUtc = entry.StartUtc.AddMinutes(dto.Minutes);
            }
            if (dto.ActivityKey is not null) entry.Category = dto.ActivityKey;
            if (dto.Note is not null) entry.Note = dto.Note;
            if (dto.WorkItemId is int wi) entry.WorkItemId = wi == 0 ? null : wi;
            if (dto.PairUserId is int pu) entry.PairUserId = pu == 0 ? null : pu;

            var activity = await db.ActivityTypes.FirstOrDefaultAsync(a => a.Key == entry.Category);
            await ApplyRewardAsync(db, hub, uid, entry, activity);
            await db.SaveChangesAsync();
            var completions = await ObjectiveEngine.RecalculateAsync(db, uid);
            await db.SaveChangesAsync();
            await Notify.SendObjectivesAsync(hub, uid, completions);
            return Results.Ok(new { entry.Id, entry.XpAwarded, entry.GoldAwarded });
        });

        api.MapDelete("/timeentries/{id:int}", async (
            int id, HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var entry = await db.TimeEntries.FirstOrDefaultAsync(e => e.Id == id && e.UserId == uid);
            if (entry is null) return Results.NotFound();
            // Apagar devolve exatamente o que este lançamento pagou — sem isso dava
            // para farmar lançando e apagando.
            await RevertRewardAsync(db, entry);
            db.TimeEntries.Remove(entry);
            await db.SaveChangesAsync();
            await ObjectiveEngine.RecalculateAsync(db, uid);
            await db.SaveChangesAsync();
            await Notify.TimeChangedAsync(hub, uid);
            return Results.NoContent();
        });
    }

    /// <summary>Cria um lançamento fechado, paga a recompensa e reavalia os objetivos.</summary>
    private static async Task<IResult> LogAsync(AppDb db, IHubContext<OfficeHub> hub, int uid, LogEntry dto)
    {
        if (dto.Minutes <= 0 || dto.Minutes > 24 * 60)
            return Results.BadRequest(new { error = "Duração inválida (1 min a 24 h)." });
        var key = string.IsNullOrWhiteSpace(dto.ActivityKey) ? "task" : dto.ActivityKey!;
        var activity = await db.ActivityTypes.FirstOrDefaultAsync(a => a.Key == key && a.IsActive);
        if (activity is null) return Results.BadRequest(new { error = "Tipo de lançamento desconhecido." });

        var user = await db.Users.FindAsync(uid);
        if (user is null) return Results.NotFound();

        var workItemId = dto.WorkItemId is 0 ? null : dto.WorkItemId;
        if (activity.RequiresWorkItem && workItemId is null)
            return Results.BadRequest(new { error = $"{activity.Name} precisa de uma atividade do quadro." });
        if (workItemId is int wid && !await db.WorkItems.AnyAsync(w => w.Id == wid))
            return Results.BadRequest(new { error = "Atividade inexistente." });

        // A data vem como dia local; ancoramos no meio da manhã para o lançamento
        // cair no dia certo independentemente do fuso.
        var day = dto.Date is DateTime d && d != default ? d : DateTime.UtcNow;
        var start = Periods.DayStart(Periods.Utc(day)).AddHours(9);
        var entry = new TimeEntry
        {
            UserId = uid,
            WorkItemId = workItemId,
            Category = activity.Key,
            Note = (dto.Note ?? "").Trim(),
            Source = dto.Source ?? "manual",
            PairUserId = dto.PairUserId is 0 ? null : dto.PairUserId,
            StartUtc = start,
            EndUtc = start.AddMinutes(dto.Minutes),
        };
        db.TimeEntries.Add(entry);
        var result = await ApplyRewardAsync(db, hub, uid, entry, activity);
        await db.SaveChangesAsync();

        var completions = await ObjectiveEngine.RecalculateAsync(db, uid);
        await db.SaveChangesAsync();
        await Notify.SendObjectivesAsync(hub, uid, completions);
        await Notify.TimeChangedAsync(hub, uid);

        return Results.Ok(new
        {
            entry.Id, entry.Category, entry.StartUtc, entry.EndUtc,
            minutes = dto.Minutes,
            xp = entry.XpAwarded,
            gold = entry.GoldAwarded,
            coins = user.Coins,
            leveledUp = result?.LeveledUp ?? false,
            level = result?.Level ?? Game.LevelForXp(user.Xp),
        });
    }

    private static async Task<XpResult?> ApplyRewardAsync(
        AppDb db, IHubContext<OfficeHub> hub, int uid, TimeEntry entry, ActivityType? activity)
    {
        entry.XpAwarded = 0;
        entry.GoldAwarded = 0;
        if (activity is null || entry.EndUtc is null) return null;
        var user = await db.Users.FindAsync(uid);
        if (user is null) return null;

        var minutes = (int)Math.Round((entry.EndUtc.Value - entry.StartUtc).TotalMinutes);
        var reward = await Game.CapDailyAsync(db, uid, Game.RewardFor(activity, minutes), entry.StartUtc);
        if (reward.IsEmpty) return null;

        var result = await Game.AwardAsync(db, user, reward, $"tempo: {activity.Name} ({minutes}min)", "time");
        entry.XpAwarded = reward.Xp;
        entry.GoldAwarded = reward.Gold;
        await Notify.SendRewardAsync(hub, uid, result,
            $"{activity.Icon} {minutes}min de {activity.Name} · +{reward.Xp} XP · +{reward.Gold} 🪙");
        return result;
    }

    private static async Task RevertRewardAsync(AppDb db, TimeEntry entry)
    {
        if (entry.XpAwarded == 0 && entry.GoldAwarded == 0) return;
        var user = await db.Users.FindAsync(entry.UserId);
        if (user is null) return;
        user.Xp = Math.Max(0, user.Xp - entry.XpAwarded);
        user.Coins = Math.Max(0, user.Coins - entry.GoldAwarded);
        db.XpEvents.Add(new XpEvent
        {
            UserId = entry.UserId, Amount = -entry.XpAwarded, Gold = -entry.GoldAwarded,
            Reason = "estorno de lançamento", Source = "time", CreatedUtc = DateTime.UtcNow,
        });
        entry.XpAwarded = 0;
        entry.GoldAwarded = 0;
    }

    // -------------------------------------------------------- objetivos

    private static void MapObjectives(RouteGroupBuilder api)
    {
        api.MapGet("/objectives", async (HttpRequest req, IDbContextFactory<AppDb> f, IHubContext<OfficeHub> hub) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            // Recalcular na leitura mantém o painel honesto mesmo depois de um
            // lançamento feito por outro cliente.
            var completions = await ObjectiveEngine.RecalculateAsync(db, uid);
            await db.SaveChangesAsync();
            await Notify.SendObjectivesAsync(hub, uid, completions);
            return Results.Ok(await ObjectiveEngine.SnapshotAsync(db, uid));
        });
    }

    // ---------------------------------------------------------- helpers

    private static async Task<double> NextOrderAsync(AppDb db, WorkItemStatus status) =>
        (await db.WorkItems.Where(w => w.Status == status).Select(w => (double?)w.BoardOrder).MaxAsync() ?? 0) + OrderGap;

    private static async Task ApplyLabelsAsync(AppDb db, int workItemId, IEnumerable<int>? labelIds)
    {
        if (labelIds is null) return;
        var wanted = labelIds.Distinct().ToList();
        var current = await db.WorkItemLabels.Where(x => x.WorkItemId == workItemId).ToListAsync();
        db.WorkItemLabels.RemoveRange(current.Where(x => !wanted.Contains(x.LabelId)));
        foreach (var id in wanted.Where(id => current.All(x => x.LabelId != id)))
            db.WorkItemLabels.Add(new WorkItemLabel { WorkItemId = workItemId, LabelId = id });
        await db.SaveChangesAsync();
    }

    /// <summary>Payload de card usado por todas as telas — quadro, detalhe e o painel do jogo.</summary>
    private static async Task<List<object>> CardsAsync(AppDb db, IReadOnlyCollection<WorkItem> items)
    {
        if (items.Count == 0) return [];
        var ids = items.Select(w => w.Id).ToList();
        var users = await db.Users.ToDictionaryAsync(u => u.Id);
        var epics = await db.Epics.ToDictionaryAsync(e => e.Id);
        var sprints = await db.Sprints.ToDictionaryAsync(s => s.Id);
        var labels = await db.WorkItemLabels.Where(x => ids.Contains(x.WorkItemId))
            .Join(db.Labels, x => x.LabelId, l => l.Id, (x, l) => new { x.WorkItemId, l.Id, l.Name, l.Color })
            .ToListAsync();
        var checklist = await db.ChecklistItems.Where(c => ids.Contains(c.WorkItemId))
            .GroupBy(c => c.WorkItemId)
            .Select(g => new { WorkItemId = g.Key, Total = g.Count(), Done = g.Count(x => x.Done) })
            .ToListAsync();
        var comments = await db.WorkItemComments.Where(c => ids.Contains(c.WorkItemId))
            .GroupBy(c => c.WorkItemId).Select(g => new { WorkItemId = g.Key, Count = g.Count() })
            .ToListAsync();
        var logged = (await db.TimeEntries
            .Where(t => t.WorkItemId != null && ids.Contains(t.WorkItemId!.Value) && t.EndUtc != null)
            .Select(t => new { WorkItemId = t.WorkItemId!.Value, t.StartUtc, EndUtc = t.EndUtc!.Value })
            .ToListAsync())
            .GroupBy(x => x.WorkItemId)
            .ToDictionary(g => g.Key, g => (int)g.Sum(x => (x.EndUtc - x.StartUtc).TotalMinutes));

        return items.Select(object (w) => new
        {
            w.Id, w.Code, w.Title, w.Description, w.Type, w.Status, w.Priority,
            w.EpicId, w.SprintId, w.AssigneeId, w.EstimateHours, w.BoardOrder,
            w.CreatedUtc, w.UpdatedUtc, w.StartedUtc, w.DoneUtc, w.DueUtc, w.ArchivedUtc,
            w.IsBlocked, w.BlockedReason,
            assignee = w.AssigneeId is int a && users.TryGetValue(a, out var u) ? new { u.Id, u.Name, u.Color } : null,
            epic = w.EpicId is int e && epics.TryGetValue(e, out var ep) ? new { ep.Id, ep.Name, ep.Color } : null,
            sprint = w.SprintId is int s && sprints.TryGetValue(s, out var sp) ? new { sp.Id, sp.Name, sp.IsActive } : null,
            labels = labels.Where(l => l.WorkItemId == w.Id).Select(l => new { l.Id, l.Name, l.Color }),
            checklist = checklist.FirstOrDefault(c => c.WorkItemId == w.Id) is { } cl
                ? new { total = cl.Total, done = cl.Done } : new { total = 0, done = 0 },
            commentCount = comments.FirstOrDefault(c => c.WorkItemId == w.Id)?.Count ?? 0,
            loggedMinutes = logged.GetValueOrDefault(w.Id),
        }).ToList();
    }
}

public record WorkItemCreate(
    string? Title, string? Description, WorkItemType Type, WorkItemStatus? Status, WorkItemPriority? Priority,
    int? EpicId, int? SprintId, int? AssigneeId, double? EstimateHours, DateTime? DueUtc, List<int>? LabelIds);

public record WorkItemPatch(
    string? Title, string? Description, WorkItemStatus? Status, WorkItemPriority? Priority,
    int? EpicId, int? SprintId, int? AssigneeId, double? EstimateHours, DateTime? DueUtc,
    bool? IsBlocked, string? BlockedReason, bool? Archived, List<int>? LabelIds);

public record MoveCard(WorkItemStatus? Status, int? Position);
public record CommentBody(string? Body);
public record ChecklistBody(string? Text, bool? Done);
public record LogEntry(
    DateTime? Date, int Minutes, int? WorkItemId, string? ActivityKey, string? Note, int? PairUserId, string? Source);
public record QuickEntry(string ActivityKey, int Minutes, DateTime? Date, int? WorkItemId, string? Note, int? PairUserId);
