using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public static class AuthEndpoints
{
    public static void MapAuthEndpoints(this WebApplication app)
    {
        // O cliente consulta isto para decidir se mostra o botão do Google
        // ou o seletor simbólico de dev.
        app.MapGet("/auth/config", () => Results.Ok(new
        {
            googleEnabled = AuthOptions.GoogleEnabled,
            hostedDomain = AuthOptions.HostedDomain,
            devBypass = AuthOptions.DevBypass,
        }));

        app.MapGet("/auth/google/login", (HttpRequest req) =>
        {
            if (!AuthOptions.GoogleEnabled)
                return Results.Json(new { error = "Login com Google não configurado (defina Auth:GoogleClientId/Secret)." }, statusCode: 503);
            var returnUrl = req.Query["return"].ToString();
            if (!IsAllowedReturn(returnUrl, out var safeReturn))
                return Results.BadRequest(new { error = "return não permitido" });
            return Results.Redirect(GoogleOidc.StartLogin(safeReturn));
        });

        app.MapGet("/auth/google/callback", async (
            HttpRequest req, IDbContextFactory<AppDb> f, IDataProtectionProvider dp) =>
        {
            var error = req.Query["error"].ToString();
            var state = req.Query["state"].ToString();
            var code = req.Query["code"].ToString();
            if (!GoogleOidc.TryConsumeState(state, out var returnUrl))
                return Results.BadRequest(new { error = "state inválido ou expirado" });
            if (error.Length > 0) return Results.Redirect(WithFragment(returnUrl, $"error={Uri.EscapeDataString(error)}"));

            var profile = await GoogleOidc.ExchangeAsync(code);
            if (profile is null)
                return Results.Redirect(WithFragment(returnUrl, "error=login_falhou_ou_dominio_nao_autorizado"));

            await using var db = await f.CreateDbContextAsync();
            var user = await UpsertAsync(db, profile, dp.CreateProtector("GoogleTokens"));
            var access = AppJwt.IssueAccessToken(user);
            var refresh = await AppJwt.IssueRefreshTokenAsync(db, user.Id);
            var fragment = $"access_token={Uri.EscapeDataString(access)}" +
                           $"&refresh_token={Uri.EscapeDataString(refresh)}" +
                           $"&expires_in={(int)AuthOptions.AccessTokenLifetime.TotalSeconds}&token_type=Bearer";
            return Results.Redirect(WithFragment(returnUrl, fragment));
        });

        app.MapPost("/auth/refresh", async (RefreshRequest dto, IDbContextFactory<AppDb> f) =>
        {
            if (string.IsNullOrWhiteSpace(dto.RefreshToken)) return Results.BadRequest();
            await using var db = await f.CreateDbContextAsync();
            var user = await AppJwt.RotateAsync(db, dto.RefreshToken);
            if (user is null) return Results.Unauthorized();
            var access = AppJwt.IssueAccessToken(user);
            var refresh = await AppJwt.IssueRefreshTokenAsync(db, user.Id);
            return Results.Ok(new
            {
                access_token = access, refresh_token = refresh,
                expires_in = (int)AuthOptions.AccessTokenLifetime.TotalSeconds, token_type = "Bearer",
            });
        });

        app.MapPost("/auth/logout", async (RefreshRequest dto, IDbContextFactory<AppDb> f) =>
        {
            if (!string.IsNullOrWhiteSpace(dto.RefreshToken))
            {
                await using var db = await f.CreateDbContextAsync();
                await AppJwt.RevokeAsync(db, dto.RefreshToken);
            }
            return Results.NoContent();
        });
    }

    /// <summary>Casa a identidade Google com um usuário (por sub, e-mail ou link seed) e guarda o refresh token.</summary>
    private static async Task<User> UpsertAsync(AppDb db, GoogleProfile p, IDataProtector protector)
    {
        var user = await db.Users.FirstOrDefaultAsync(u => u.GoogleSubject == p.Subject);
        user ??= await db.Users.FirstOrDefaultAsync(u => u.Email == p.Email);
        if (user is null && AuthOptions.SeedEmailLinks.TryGetValue(p.Email, out var seedId))
            user = await db.Users.FindAsync(seedId);
        if (user is null)
        {
            user = new User { Name = p.Name, Role = "", Color = "#7c5cff" };
            db.Users.Add(user);
        }
        user.GoogleSubject = p.Subject;
        user.Email = p.Email;
        if (AuthOptions.AdminEmails.Contains(p.Email)) user.AppRole = UserRole.Admin;
        await db.SaveChangesAsync();

        if (p.RefreshToken is not null)
        {
            var cred = await db.GoogleCredentials.FirstOrDefaultAsync(c => c.UserId == user.Id)
                ?? new GoogleCredential { UserId = user.Id };
            cred.RefreshTokenEnc = protector.Protect(p.RefreshToken);
            cred.Scopes = AuthOptions.Scopes;
            cred.UpdatedUtc = DateTime.UtcNow;
            if (cred.Id == 0) db.GoogleCredentials.Add(cred);
            await db.SaveChangesAsync();
        }
        return user;
    }

    private static bool IsAllowedReturn(string returnUrl, out string safe)
    {
        // Sem return explícito: manda para a origem padrão configurada (ou localhost dev).
        if (string.IsNullOrWhiteSpace(returnUrl))
        {
            safe = AuthOptions.AllowedOrigins.FirstOrDefault() ?? "http://localhost:8123/";
            return true;
        }
        safe = returnUrl;
        if (!Uri.TryCreate(returnUrl, UriKind.Absolute, out var uri)) return false;
        // Evita open-redirect: só http(s) e origem na allowlist (ou localhost quando vazia).
        if (uri.Scheme is not ("http" or "https")) return false;
        var origin = $"{uri.Scheme}://{uri.Authority}";
        if (AuthOptions.AllowedOrigins.Length == 0)
            return uri.Host is "localhost" or "127.0.0.1";
        return AuthOptions.AllowedOrigins.Contains(origin, StringComparer.OrdinalIgnoreCase);
    }

    private static string WithFragment(string url, string fragment) =>
        url.Contains('#') ? $"{url}&{fragment}" : $"{url}#{fragment}";
}

public record RefreshRequest(string RefreshToken);
