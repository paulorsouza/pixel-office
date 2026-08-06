using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>
/// Chat: global, por prédio, por sala e PM.
///
/// Duas entregas diferentes, de propósito. Canal de LUGAR (global/prédio/sala) é
/// grupo do SignalR e só chega em quem está ouvindo aquele lugar — é o que faz o
/// "por sala" significar alguma coisa. PM vai pelo GRUPO DO USUÁRIO, que o jogo e
/// o painel web já assinam no <c>Join</c>: assim a mensagem chega em todas as
/// janelas da pessoa sem ninguém precisar assinar conversa nenhuma.
/// </summary>
public partial class OfficeHub
{
    /// <summary>
    /// Declara onde esta conexão está ouvindo. Chamar de novo troca de canal:
    /// entrar numa sala tira da anterior. Passar <c>null</c> deixa só o global.
    /// </summary>
    public async Task ChatSetLocation(ChatLocation? location)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return;

        var building = ChatChannels.Building(location?.BuildingId) ?? "";
        // Sem prédio não há sala: uma sala solta não teria como ser encontrada de
        // volta pelo diretório, que é indexado pelo prédio.
        var room = building.Length == 0 ? "" : ChatChannels.Room(location?.SceneId, location?.RoomId) ?? "";

        await SwapGroupAsync(p.ChatBuildingChannel, building);
        await SwapGroupAsync(p.ChatRoomChannel, room);

        p.ChatBuildingChannel = building;
        p.ChatBuildingId = building.Length == 0 ? "" : (location?.BuildingId ?? "");
        p.ChatBuildingName = building.Length == 0 ? "" : Trim(location?.BuildingName, 60);
        p.ChatRoomChannel = room;
        p.ChatRoomName = room.Length == 0 ? "" : Trim(location?.RoomName, 60);

        // O global é para todos, mas só depois de o cliente se anunciar: uma
        // conexão que nunca chamou isto não recebe (nem manda) chat nenhum.
        await Groups.AddToGroupAsync(Context.ConnectionId, ChatChannels.Group(ChatChannels.Global));

        await Clients.Caller.SendAsync("ChatChannels", new
        {
            global = ChatChannels.Global,
            building = building.Length == 0 ? null : building,
            buildingName = p.ChatBuildingName,
            room = room.Length == 0 ? null : room,
            roomName = p.ChatRoomName,
        });
    }

    private static string Trim(string? value, int max)
    {
        var v = (value ?? "").Trim();
        return v.Length <= max ? v : v[..max];
    }

    private async Task SwapGroupAsync(string previous, string next)
    {
        if (previous == next) return;
        if (previous.Length > 0) await Groups.RemoveFromGroupAsync(Context.ConnectionId, ChatChannels.Group(previous));
        if (next.Length > 0) await Groups.AddToGroupAsync(Context.ConnectionId, ChatChannels.Group(next));
    }

    /// <summary>
    /// Manda uma mensagem. Devolve <c>false</c> quando o canal não é desta
    /// conexão — falar num prédio em que não se está é o abuso óbvio aqui, e a
    /// checagem é a mesma para o jogo e para o app web.
    /// </summary>
    public async Task<bool> SendChat(string channel, string text)
    {
        if (!Presence.Players.TryGetValue(Context.ConnectionId, out var p)) return false;
        if (ChatChannels.NormalizeText(text) is not string message) return false;

        var direct = ChatChannels.DirectPeer(channel, p.UserId);
        if (direct is null)
        {
            var allowed = channel == ChatChannels.Global
                || channel == p.ChatBuildingChannel
                || channel == p.ChatRoomChannel;
            if (!allowed || !ChatChannels.IsPlace(channel)) return false;
        }

        await using var db = await dbFactory.CreateDbContextAsync();
        // A PM tem de ter destinatário de verdade: sem isto, `dm:1:999` viraria
        // uma caixa de mensagens que ninguém nunca lê.
        if (direct is int peer && !await db.Users.AnyAsync(u => u.Id == peer && !u.IsBot)) return false;

        var row = new ChatMessage
        {
            Channel = channel,
            UserId = p.UserId,
            Text = message,
            CreatedUtc = DateTime.UtcNow,
        };
        db.ChatMessages.Add(row);
        // Quem escreve já leu o que escreveu: sem isto a própria mensagem
        // voltava contando como não lida na outra janela da mesma pessoa.
        await db.SaveChangesAsync();
        await MarkReadAsync(db, p.UserId, channel, row.Id);
        await db.SaveChangesAsync();

        await BroadcastChatAsync(hubContext, row, p.Name, p.Color);
        return true;
    }

    /// <summary>Entrega para quem é de direito e formata o payload uma vez só.</summary>
    internal static Task BroadcastChatAsync(
        IHubContext<OfficeHub> hub, ChatMessage row, string name, string color)
    {
        var payload = new
        {
            row.Id,
            row.Channel,
            row.UserId,
            name,
            color,
            row.Text,
            sentUtc = row.CreatedUtc,
        };
        if (ChatChannels.DirectPair(row.Channel) is (int a, int b) pair)
        {
            return hub.Clients
                .Groups(UserGroup(pair.A), UserGroup(pair.B))
                .SendAsync("ChatMessage", payload);
        }
        return hub.Clients.Group(ChatChannels.Group(row.Channel)).SendAsync("ChatMessage", payload);
    }

    /// <summary>Marca leitura sem nunca ANDAR PARA TRÁS (duas abas leem fora de ordem).</summary>
    internal static async Task MarkReadAsync(AppDb db, int userId, string channel, long messageId)
    {
        var read = await db.ChatReads.FirstOrDefaultAsync(r => r.UserId == userId && r.Channel == channel);
        if (read is null)
        {
            db.ChatReads.Add(new ChatRead { UserId = userId, Channel = channel, LastReadMessageId = messageId });
            return;
        }
        if (messageId > read.LastReadMessageId) read.LastReadMessageId = messageId;
    }
}
