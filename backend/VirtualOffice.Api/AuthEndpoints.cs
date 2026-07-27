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
            passwordEnabled = AuthOptions.PasswordEnabled,
            registrationOpen = AuthOptions.PasswordEnabled && AuthOptions.AllowRegistration,
            hostedDomain = AuthOptions.HostedDomain,
            devBypass = AuthOptions.DevBypass,
        }));

        MapPasswordEndpoints(app);

        app.MapGet("/auth/google/login", (HttpRequest req) =>
        {
            if (!AuthOptions.GoogleEnabled)
                return Results.Json(new { error = "Login com Google não configurado (defina Auth:GoogleClientId/Secret)." }, statusCode: 503);
            var returnUrl = req.Query["return"].ToString();
            if (!IsAllowedReturn(returnUrl, out var safeReturn))
                return Results.BadRequest(new { error = "return não permitido" });
            // ?link=<access_token>: em vez de logar, pendura o Google na conta já autenticada.
            int? linkUserId = null;
            if (req.Query["link"].ToString() is { Length: > 0 } linkToken)
            {
                if (AppJwt.ReadUserId(linkToken) is not int uid)
                    return Results.Unauthorized();
                linkUserId = uid;
            }
            return Results.Redirect(GoogleOidc.StartLogin(safeReturn, linkUserId));
        });

        app.MapGet("/auth/google/callback", async (
            HttpRequest req, IDbContextFactory<AppDb> f, IDataProtectionProvider dp) =>
        {
            var error = req.Query["error"].ToString();
            var state = req.Query["state"].ToString();
            var code = req.Query["code"].ToString();
            if (!GoogleOidc.TryConsumeState(state, out var returnUrl, out var linkUserId))
                return Results.BadRequest(new { error = "state inválido ou expirado" });
            if (error.Length > 0) return Results.Redirect(WithFragment(returnUrl, $"error={Uri.EscapeDataString(error)}"));

            var profile = await GoogleOidc.ExchangeAsync(code);
            if (profile is null)
                return Results.Redirect(WithFragment(returnUrl, "error=login_falhou_ou_dominio_nao_autorizado"));

            await using var db = await f.CreateDbContextAsync();
            var protector = dp.CreateProtector("GoogleTokens");
            User? user;
            if (linkUserId is int targetId)
            {
                user = await db.Users.FindAsync(targetId);
                if (user is null) return Results.Redirect(WithFragment(returnUrl, "error=conta_nao_encontrada"));
                // Esse Google já é de outra conta: recusa em vez de roubar a identidade.
                var taken = await db.Users.AnyAsync(u => u.GoogleSubject == profile.Subject && u.Id != targetId);
                if (taken) return Results.Redirect(WithFragment(returnUrl, "error=google_ja_vinculado"));
                user = await LinkGoogleAsync(db, user, profile, protector);
            }
            else
            {
                user = await UpsertAsync(db, profile, protector);
            }
            // O mesmo provisionamento atende cadastro local e primeiro login Google.
            await GameInventorySeed.EnsureUserStockAsync(db, user.Id);
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
        return await LinkGoogleAsync(db, user, p, protector);
    }

    /// <summary>Pendura a identidade Google num usuário existente — sem tocar no progresso dele.</summary>
    private static async Task<User> LinkGoogleAsync(AppDb db, User user, GoogleProfile p, IDataProtector protector)
    {
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

    /// <summary>Cadastro, login, troca de senha e desvínculo do Google — tudo sobre o mesmo User.</summary>
    private static void MapPasswordEndpoints(WebApplication app)
    {
        app.MapPost("/auth/register", async (RegisterRequest dto, HttpRequest req, IDbContextFactory<AppDb> f) =>
        {
            if (!AuthOptions.PasswordEnabled)
                return Results.Json(new { error = "Login por senha desativado." }, statusCode: 503);
            if (!AuthOptions.AllowRegistration)
                return Results.Json(new { error = "Cadastro fechado no momento." }, statusCode: 403);

            var username = PasswordAuth.NormalizeUsername(dto.Username);
            if (!PasswordAuth.IsValidUsername(username, out var usernameError))
                return Results.BadRequest(new { error = usernameError });
            if (!PasswordAuth.IsValidPassword(dto.Password, out var passwordError))
                return Results.BadRequest(new { error = passwordError });

            var email = (dto.Email ?? "").Trim();
            if (email.Length > 0 && !email.Contains('@'))
                return Results.BadRequest(new { error = "E-mail inválido." });

            await using var db = await f.CreateDbContextAsync();
            if (await db.Users.AnyAsync(u => u.Username == username))
                return Results.Conflict(new { error = "Esse usuário já existe." });
            if (email.Length > 0 && await db.Users.AnyAsync(u => u.Email == email))
                return Results.Conflict(new { error = "Esse e-mail já está em uma conta." });

            var displayName = (dto.Name ?? "").Trim();
            if (displayName.Length == 0) displayName = username;
            if (displayName.Length > 40) displayName = displayName[..40];

            var user = new User
            {
                Name = displayName,
                Role = "",
                Color = "#7c5cff",
                Username = username,
                PasswordHash = PasswordAuth.Hash(dto.Password!),
                PasswordUpdatedUtc = DateTime.UtcNow,
                Email = email.Length > 0 ? email : null,
            };
            if (email.Length > 0 && AuthOptions.AdminEmails.Contains(email)) user.AppRole = UserRole.Admin;
            db.Users.Add(user);
            await db.SaveChangesAsync();

            // Conta nova começa com o estoque inicial — senão entra num mundo sem nada.
            await GameInventorySeed.EnsureUserStockAsync(db, user.Id);

            LoginThrottle.Clear(ClientIp(req));
            return Results.Ok(await IssueSessionAsync(db, user));
        });

        app.MapPost("/auth/login", async (LoginRequest dto, HttpRequest req, IDbContextFactory<AppDb> f) =>
        {
            if (!AuthOptions.PasswordEnabled)
                return Results.Json(new { error = "Login por senha desativado." }, statusCode: 503);

            var username = PasswordAuth.NormalizeUsername(dto.Username);
            var ip = ClientIp(req);
            if (LoginThrottle.IsBlocked(username) || LoginThrottle.IsBlocked(ip))
                return Results.Json(new { error = "Muitas tentativas. Tente de novo em alguns minutos." }, statusCode: 429);

            await using var db = await f.CreateDbContextAsync();
            var user = username.Length > 0
                ? await db.Users.FirstOrDefaultAsync(u => u.Username == username)
                : null;

            // Usuário inexistente gasta o mesmo tempo de uma verificação real.
            if (user?.PasswordHash is null)
            {
                PasswordAuth.FakeVerify();
                LoginThrottle.RegisterFailure(username);
                LoginThrottle.RegisterFailure(ip);
                return Results.Json(new { error = "Usuário ou senha inválidos." }, statusCode: 401);
            }

            if (!PasswordAuth.Verify(dto.Password ?? "", user.PasswordHash, out var needsRehash))
            {
                LoginThrottle.RegisterFailure(username);
                LoginThrottle.RegisterFailure(ip);
                return Results.Json(new { error = "Usuário ou senha inválidos." }, statusCode: 401);
            }

            if (needsRehash)
            {
                user.PasswordHash = PasswordAuth.Hash(dto.Password!);
                await db.SaveChangesAsync();
            }
            LoginThrottle.Clear(username);
            LoginThrottle.Clear(ip);
            return Results.Ok(await IssueSessionAsync(db, user));
        });

        // A partir daqui é só para quem tem token de verdade (o X-User-Id de dev não vale).
        app.MapGet("/auth/me", async (HttpContext ctx, IDbContextFactory<AppDb> f) =>
        {
            if (TokenUserId(ctx) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var user = await db.Users.FindAsync(uid);
            return user is null ? Results.NotFound() : Results.Ok(Identity(user));
        }).RequireAuthorization();

        app.MapPost("/auth/password", async (ChangePasswordRequest dto, HttpContext ctx, IDbContextFactory<AppDb> f) =>
        {
            if (TokenUserId(ctx) is not int uid) return Results.Unauthorized();
            if (!PasswordAuth.IsValidPassword(dto.NewPassword, out var passwordError))
                return Results.BadRequest(new { error = passwordError });

            await using var db = await f.CreateDbContextAsync();
            var user = await db.Users.FindAsync(uid);
            if (user is null) return Results.NotFound();

            // Quem entrou pelo Google e ainda não tem senha define a primeira aqui.
            if (user.PasswordHash is not null &&
                !PasswordAuth.Verify(dto.CurrentPassword ?? "", user.PasswordHash, out _))
                return Results.Json(new { error = "Senha atual incorreta." }, statusCode: 401);

            if (user.Username is null)
            {
                var username = PasswordAuth.NormalizeUsername(dto.Username);
                if (!PasswordAuth.IsValidUsername(username, out var usernameError))
                    return Results.BadRequest(new { error = usernameError });
                if (await db.Users.AnyAsync(u => u.Username == username && u.Id != uid))
                    return Results.Conflict(new { error = "Esse usuário já existe." });
                user.Username = username;
            }

            user.PasswordHash = PasswordAuth.Hash(dto.NewPassword!);
            user.PasswordUpdatedUtc = DateTime.UtcNow;
            await db.SaveChangesAsync();
            // Troca de senha derruba as outras sessões; esta ganha um par novo.
            await AppJwt.RevokeAllAsync(db, uid);
            return Results.Ok(await IssueSessionAsync(db, user));
        }).RequireAuthorization();

        app.MapPost("/auth/google/unlink", async (HttpContext ctx, IDbContextFactory<AppDb> f) =>
        {
            if (TokenUserId(ctx) is not int uid) return Results.Unauthorized();
            await using var db = await f.CreateDbContextAsync();
            var user = await db.Users.FindAsync(uid);
            if (user is null) return Results.NotFound();
            // Sem senha, tirar o Google deixaria a conta sem nenhuma forma de entrar.
            if (user.PasswordHash is null)
                return Results.BadRequest(new { error = "Defina uma senha antes de desvincular o Google." });
            user.GoogleSubject = null;
            await db.GoogleCredentials.Where(c => c.UserId == uid).ExecuteDeleteAsync();
            await db.SaveChangesAsync();
            return Results.Ok(Identity(user));
        }).RequireAuthorization();
    }

    /// <summary>Emite o par access/refresh e devolve junto o resumo da identidade.</summary>
    private static async Task<object> IssueSessionAsync(AppDb db, User user) => new
    {
        access_token = AppJwt.IssueAccessToken(user),
        refresh_token = await AppJwt.IssueRefreshTokenAsync(db, user.Id),
        expires_in = (int)AuthOptions.AccessTokenLifetime.TotalSeconds,
        token_type = "Bearer",
        user = Identity(user),
    };

    private static object Identity(User u) => new
    {
        id = u.Id,
        name = u.Name,
        username = u.Username,
        email = u.Email,
        role = u.AppRole.ToString(),
        hasPassword = u.PasswordHash is not null,
        hasGoogle = u.GoogleSubject is not null,
    };

    /// <summary>Id vindo do JWT validado (ignora o X-User-Id de dev de propósito).</summary>
    private static int? TokenUserId(HttpContext ctx) =>
        int.TryParse(ctx.User.FindFirst("uid")?.Value, out var id) ? id : null;

    private static string ClientIp(HttpRequest req) =>
        req.HttpContext.Connection.RemoteIpAddress?.ToString() ?? "desconhecido";

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
public record RegisterRequest(string? Username, string? Password, string? Name, string? Email);
public record LoginRequest(string? Username, string? Password);
/// <summary>Username só é lido quando a conta ainda não tem login local (veio do Google).</summary>
public record ChangePasswordRequest(string? CurrentPassword, string? NewPassword, string? Username);
