using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>
/// O que o socket não dá: histórico, não lidas e a lista de com quem dá para
/// falar. O tempo real continua sendo do hub (<see cref="OfficeHub"/>); aqui é o
/// que a tela precisa ao ABRIR — e é a mesma API para o app web e para o jogo,
/// porque a tela de chat existe uma vez só, em <c>wwwroot/shared</c>.
/// </summary>
public static class ChatEndpoints
{
    private const int MaxHistory = 80;

    // Canal de outra pessoa (uma PM que não é sua). O corpo `{ error }` é o
    // formato que o cliente compartilhado sabe ler e mostrar.
    private static IResult NotYours =>
        Results.Json(new { error = "Esta conversa não é sua." }, statusCode: 403);

    public static void MapChatEndpoints(this RouteGroupBuilder api)
    {
        // ---------- histórico de um canal ----------
        api.MapGet("/chat/history", async (
            HttpRequest req, IDbContextFactory<AppDb> f, string channel, long? before, int? limit) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            if (!ChatChannels.CanRead(channel, uid)) return NotYours;

            await using var db = await f.CreateDbContextAsync();
            var take = Math.Clamp(limit ?? 50, 1, MaxHistory);
            // Página para trás (as mais recentes primeiro) e devolve em ordem de
            // leitura: é o que o "carregar mais" do topo da lista espera.
            var page = await db.ChatMessages
                .Where(m => m.Channel == channel && (before == null || m.Id < before))
                .OrderByDescending(m => m.Id)
                .Take(take)
                .Join(db.Users, m => m.UserId, u => u.Id, (m, u) => new
                {
                    m.Id, m.Channel, m.UserId, u.Name, u.Color, m.Text, sentUtc = m.CreatedUtc,
                })
                .ToListAsync();
            page.Reverse();
            return Results.Ok(new { channel, messages = page, hasMore = page.Count == take });
        });

        // ---------- caixa de entrada: PMs + não lidas dos canais pedidos ----------
        api.MapGet("/chat/inbox", async (HttpRequest req, IDbContextFactory<AppDb> f, string? channels) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();

            var reads = await db.ChatReads.Where(r => r.UserId == uid)
                .ToDictionaryAsync(r => r.Channel, r => r.LastReadMessageId);
            long ReadUpTo(string channel) => reads.GetValueOrDefault(channel, 0L);

            // Conversas: todo canal `dm:` que menciona este usuário. O par é
            // canônico (menor:maior), então os dois prefixos cobrem os dois lados.
            var mine = $"dm:{uid}:";
            var theirs = $":{uid}";
            var directChannels = await db.ChatMessages
                .Where(m => m.Channel.StartsWith("dm:")
                            && (m.Channel.StartsWith(mine) || m.Channel.EndsWith(theirs)))
                .Select(m => m.Channel)
                .Distinct()
                .ToListAsync();
            // O EndsWith pega `dm:2:12` para o usuário 2 também ("...:12" não
            // termina em ":2", mas `dm:12:2` não existe — o par é ordenado).
            // Ainda assim, confirmar a participação em memória é barato e honesto.
            directChannels = directChannels.Where(c => ChatChannels.DirectPeer(c, uid) is not null).ToList();

            var directs = new List<ChatDirectDto>();
            foreach (var channel in directChannels)
            {
                var peerId = ChatChannels.DirectPeer(channel, uid)!.Value;
                var peer = await db.Users.FindAsync(peerId);
                if (peer is null) continue;
                var last = await db.ChatMessages.Where(m => m.Channel == channel)
                    .OrderByDescending(m => m.Id).FirstAsync();
                var readUpTo = ReadUpTo(channel);
                directs.Add(new ChatDirectDto(
                    channel, peer.Id, peer.Name, peer.Color, last.Text, last.CreatedUtc,
                    await db.ChatMessages
                        .CountAsync(m => m.Channel == channel && m.Id > readUpTo && m.UserId != uid)));
            }

            // Não lidas dos canais de lugar que a tela está mostrando agora.
            var counts = new Dictionary<string, int>();
            foreach (var channel in (channels ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                if (!ChatChannels.IsPlace(channel) || counts.ContainsKey(channel)) continue;
                var readUpTo = ReadUpTo(channel);
                counts[channel] = await db.ChatMessages
                    .CountAsync(m => m.Channel == channel && m.Id > readUpTo && m.UserId != uid);
            }

            return Results.Ok(new
            {
                directs = directs.OrderByDescending(d => d.LastUtc).ToList(),
                counts,
            });
        });

        // ---------- marcar como lido ----------
        api.MapPost("/chat/read", async (HttpRequest req, IDbContextFactory<AppDb> f, ChatReadDto body) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            if (!ChatChannels.CanRead(body.Channel, uid)) return NotYours;
            await using var db = await f.CreateDbContextAsync();
            await OfficeHub.MarkReadAsync(db, uid, body.Channel, body.MessageId);
            await db.SaveChangesAsync();
            return Results.NoContent();
        });

        // ---------- diretório: onde há gente falando agora ----------
        // Vem da presença, não de um catálogo de mapas duplicado no servidor: quem
        // conhece prédio e sala é o cliente do jogo, que carrega os mapas do Tiled.
        api.MapGet("/chat/directory", (HttpRequest req) =>
        {
            if (Identity.UserId(req) is not int uid) return Results.Unauthorized();
            var players = Presence.Players.Values.Where(p => !p.IsBot).ToList();

            var buildings = players
                .Where(p => p.ChatBuildingChannel.Length > 0)
                .GroupBy(p => p.ChatBuildingChannel)
                .Select(g => new
                {
                    channel = g.Key,
                    id = g.First().ChatBuildingId,
                    name = g.First().ChatBuildingName,
                    people = g.Select(p => p.UserId).Distinct().Count(),
                })
                .OrderBy(b => b.name)
                .ToList();

            var rooms = players
                .Where(p => p.ChatRoomChannel.Length > 0)
                .GroupBy(p => p.ChatRoomChannel)
                .Select(g => new
                {
                    channel = g.Key,
                    name = g.First().ChatRoomName,
                    buildingId = g.First().ChatBuildingId,
                    buildingName = g.First().ChatBuildingName,
                    people = g.Select(p => p.UserId).Distinct().Count(),
                })
                .OrderBy(r => r.name)
                .ToList();

            // Onde o avatar DESTA conta está: o painel web abre já no lugar certo
            // sem a pessoa ter de procurar o próprio prédio na lista.
            var world = players.FirstOrDefault(p => p.UserId == uid && p.Client == ClientKind.World);
            return Results.Ok(new
            {
                buildings,
                rooms,
                you = world is null ? null : new
                {
                    building = world.ChatBuildingChannel.Length > 0 ? world.ChatBuildingChannel : null,
                    buildingName = world.ChatBuildingName,
                    room = world.ChatRoomChannel.Length > 0 ? world.ChatRoomChannel : null,
                    roomName = world.ChatRoomName,
                },
                online = players
                    .Where(p => p.Client == ClientKind.World)
                    .GroupBy(p => p.UserId)
                    .Select(g => g.First())
                    .Select(p => new { userId = p.UserId, name = p.Name, color = p.Color })
                    .ToList(),
            });
        });
    }
}

public record ChatReadDto(string Channel, long MessageId);

public record ChatDirectDto(
    string Channel, int UserId, string Name, string Color,
    string LastText, DateTime LastUtc, int Unread);
