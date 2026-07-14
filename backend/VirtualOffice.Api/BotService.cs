using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>Coloca os usuários-bot para circular no escritório, para o protótipo não ficar vazio.</summary>
public class BotService(IDbContextFactory<AppDb> dbFactory, IHubContext<OfficeHub> hub) : BackgroundService
{
    private const int Tile = 28;
    // área livre do mapa (em tiles) por onde os bots circulam — mantida em sincronia com o mapa do front
    private static readonly (int x, int y, int w, int h)[] WalkAreas =
    [
        (3, 11, 16, 8),   // open space
        (25, 14, 8, 5),   // café
        (17, 3, 5, 15),   // corredor entre as mesas e a sala de reunião
    ];

    private sealed record Bot(PlayerState State)
    {
        public double TargetX { get; set; }
        public double TargetY { get; set; }
        public int RestTicks { get; set; }
    }

    private readonly List<Bot> _bots = [];

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await Task.Delay(1500, stoppingToken); // espera o seed
        await using (var db = await dbFactory.CreateDbContextAsync(stoppingToken))
        {
            var botUsers = await db.Users.Where(u => u.IsBot).ToListAsync(stoppingToken);
            foreach (var u in botUsers)
            {
                var (ax, ay, aw, ah) = WalkAreas[Random.Shared.Next(WalkAreas.Length)];
                var state = new PlayerState
                {
                    Key = $"bot-{u.Id}",
                    UserId = u.Id,
                    Name = u.Name,
                    Color = u.Color,
                    X = (ax + Random.Shared.Next(aw)) * Tile,
                    Y = (ay + Random.Shared.Next(ah)) * Tile,
                    IsBot = true,
                };
                Presence.Players[state.Key] = state;
                await hub.Clients.All.SendAsync("PlayerJoined", state, stoppingToken);
                var bot = new Bot(state);
                PickTarget(bot);
                _bots.Add(bot);
            }
        }

        while (!stoppingToken.IsCancellationRequested)
        {
            foreach (var bot in _bots) await TickAsync(bot);
            await Task.Delay(140, stoppingToken);
        }
    }

    private async Task TickAsync(Bot bot)
    {
        var p = bot.State;
        if (bot.RestTicks > 0) { bot.RestTicks--; return; }

        var dx = bot.TargetX - p.X;
        var dy = bot.TargetY - p.Y;
        var dist = Math.Sqrt(dx * dx + dy * dy);
        if (dist < 6)
        {
            bot.RestTicks = Random.Shared.Next(15, 90); // pausa de 2 a 12s
            PickTarget(bot);
            return;
        }
        var speed = 16.0; // px por tick
        p.X += dx / dist * speed;
        p.Y += dy / dist * speed;
        p.Dir = Math.Abs(dx) > Math.Abs(dy) ? (dx > 0 ? "right" : "left") : (dy > 0 ? "down" : "up");
        await hub.Clients.All.SendAsync("PlayerMoved", new { key = p.Key, x = p.X, y = p.Y, dir = p.Dir });
    }

    private static void PickTarget(Bot bot)
    {
        var (ax, ay, aw, ah) = WalkAreas[Random.Shared.Next(WalkAreas.Length)];
        bot.TargetX = (ax + Random.Shared.Next(aw)) * Tile;
        bot.TargetY = (ay + Random.Shared.Next(ah)) * Tile;
    }
}
