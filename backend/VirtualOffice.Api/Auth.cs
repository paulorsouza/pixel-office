using System.Collections.Concurrent;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;

namespace VirtualOffice.Api;

/// <summary>
/// Configuração e primitivas de autenticação: fluxo OIDC do Google Workspace,
/// emissão/validação do JWT próprio da aplicação e restrição por domínio.
///
/// Enquanto o OAuth do Google não estiver configurado (ou em Development), o
/// <see cref="DevBypass"/> mantém o antigo header simbólico X-User-Id funcionando,
/// para não quebrar o loop de desenvolvimento. Em produção, defina os segredos e
/// deixe DevBypass=false: aí só o token assinado vale.
/// </summary>
public static class AuthOptions
{
    // Aceita X-User-Id / userId no hub sem token (só para dev). Nunca em produção.
    public static bool DevBypass { get; private set; } = true;

    // Restrição de domínio (claim "hd" do Google). Vazio = sem restrição (dev).
    public static string HostedDomain { get; private set; } = "";

    // Google OAuth (crie no Google Cloud Console do Workspace da Tooq).
    public static string GoogleClientId { get; private set; } = "";
    public static string GoogleClientSecret { get; private set; } = "";
    public static string GoogleRedirectUri { get; private set; } = "http://localhost:5210/auth/google/callback";
    public static bool GoogleEnabled => GoogleClientId.Length > 0 && GoogleClientSecret.Length > 0;

    // Escopos do consentimento. Default = só login (não sensível, sem verificação).
    // Para Calendar/Meet depois: acrescente " https://www.googleapis.com/auth/calendar.events"
    // e ligue OfflineAccess (aí o Google devolve refresh_token para uso em background).
    public static string Scopes { get; private set; } = "openid email profile";

    // access_type=offline + prompt=consent — só necessário para APIs em background (Calendar).
    public static bool OfflineAccess { get; private set; }

    // JWT próprio da app (HS256). Em produção venha de env/secret, nunca do appsettings versionado.
    public static string JwtKey { get; private set; } = "dev-only-insecure-key-change-me_at-least-32-bytes!!";
    public static string JwtIssuer { get; private set; } = "office-quest";
    public static string JwtAudience { get; private set; } = "office-quest-clients";
    public static TimeSpan AccessTokenLifetime { get; private set; } = TimeSpan.FromMinutes(30);
    public static TimeSpan RefreshTokenLifetime { get; private set; } = TimeSpan.FromDays(14);

    // Origens permitidas para redirect pós-login e CORS. Vazio = libera localhost (dev).
    public static string[] AllowedOrigins { get; private set; } = [];

    // Primeiros admins (por e-mail). Também usado para promover no primeiro login.
    public static HashSet<string> AdminEmails { get; private set; } = new(StringComparer.OrdinalIgnoreCase);

    // Vincula o primeiro login de um e-mail a um usuário seed já existente (preserva inventário/horas).
    public static Dictionary<string, int> SeedEmailLinks { get; private set; } = new(StringComparer.OrdinalIgnoreCase);

    public static void Configure(IConfiguration config)
    {
        var a = config.GetSection("Auth");
        DevBypass = a.GetValue("DevBypass", DevBypass);
        HostedDomain = a["HostedDomain"] ?? HostedDomain;
        GoogleClientId = a["GoogleClientId"] ?? GoogleClientId;
        GoogleClientSecret = a["GoogleClientSecret"] ?? GoogleClientSecret;
        GoogleRedirectUri = a["GoogleRedirectUri"] ?? GoogleRedirectUri;
        Scopes = a["Scopes"] ?? Scopes;
        OfflineAccess = a.GetValue("OfflineAccess", OfflineAccess);
        JwtKey = a["JwtKey"] ?? JwtKey;
        JwtIssuer = a["JwtIssuer"] ?? JwtIssuer;
        JwtAudience = a["JwtAudience"] ?? JwtAudience;
        if (int.TryParse(a["AccessTokenMinutes"], out var m) && m > 0) AccessTokenLifetime = TimeSpan.FromMinutes(m);
        if (int.TryParse(a["RefreshTokenDays"], out var d) && d > 0) RefreshTokenLifetime = TimeSpan.FromDays(d);
        AllowedOrigins = a.GetSection("AllowedOrigins").Get<string[]>() ?? AllowedOrigins;
        AdminEmails = new(a.GetSection("AdminEmails").Get<string[]>() ?? [], StringComparer.OrdinalIgnoreCase);
        SeedEmailLinks = a.GetSection("SeedEmailLinks").Get<Dictionary<string, int>>() ?? SeedEmailLinks;
    }

    public static SymmetricSecurityKey SigningKey => new(Encoding.UTF8.GetBytes(JwtKey));
}

/// <summary>Cria as colunas/tabelas de auth em bancos SQLite já existentes (schema aditivo).</summary>
public static class AuthSchema
{
    public static async Task EnsureAsync(AppDb db)
    {
        // Aditivo específico de SQLite (pragma/ALTER). No Postgres o EnsureCreated
        // já cria as colunas/tabelas de auth a partir do modelo EF.
        if (db.Database.ProviderName?.Contains("Sqlite", StringComparison.OrdinalIgnoreCase) != true) return;
        await AddColumnIfMissing(db, "Users", "GoogleSubject", "TEXT NULL");
        await AddColumnIfMissing(db, "Users", "Email", "TEXT NULL");
        await AddColumnIfMissing(db, "Users", "AppRole", "INTEGER NOT NULL DEFAULT 0");
        await db.Database.ExecuteSqlRawAsync("""
            CREATE TABLE IF NOT EXISTS "GoogleCredentials" (
              "Id" INTEGER NOT NULL CONSTRAINT "PK_GoogleCredentials" PRIMARY KEY AUTOINCREMENT,
              "UserId" INTEGER NOT NULL, "RefreshTokenEnc" TEXT NOT NULL,
              "Scopes" TEXT NOT NULL, "UpdatedUtc" TEXT NOT NULL);
            CREATE UNIQUE INDEX IF NOT EXISTS "IX_GoogleCredentials_UserId" ON "GoogleCredentials" ("UserId");
            CREATE TABLE IF NOT EXISTS "AppRefreshTokens" (
              "Id" INTEGER NOT NULL CONSTRAINT "PK_AppRefreshTokens" PRIMARY KEY AUTOINCREMENT,
              "UserId" INTEGER NOT NULL, "TokenHash" TEXT NOT NULL,
              "ExpiresUtc" TEXT NOT NULL, "CreatedUtc" TEXT NOT NULL, "RevokedUtc" TEXT NULL);
            CREATE INDEX IF NOT EXISTS "IX_AppRefreshTokens_TokenHash" ON "AppRefreshTokens" ("TokenHash");
            """);
    }

    private static async Task AddColumnIfMissing(AppDb db, string table, string column, string definition)
    {
        // SQLite não tem "ADD COLUMN IF NOT EXISTS"; consultamos o pragma primeiro.
        var conn = db.Database.GetDbConnection();
        if (conn.State != System.Data.ConnectionState.Open) await conn.OpenAsync();
        await using var check = conn.CreateCommand();
        check.CommandText = $"SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name = '{column}';";
        var exists = Convert.ToInt64(await check.ExecuteScalarAsync()) > 0;
        if (!exists)
            await db.Database.ExecuteSqlRawAsync($"ALTER TABLE \"{table}\" ADD COLUMN \"{column}\" {definition};");
    }
}

/// <summary>Emissão e validação do JWT próprio + refresh tokens rotativos.</summary>
public static class AppJwt
{
    public static string IssueAccessToken(User u)
    {
        var creds = new SigningCredentials(AuthOptions.SigningKey, SecurityAlgorithms.HmacSha256);
        var claims = new List<Claim>
        {
            new("uid", u.Id.ToString()),
            new("name", u.Name),
            new("role", u.AppRole.ToString()),
            new("email", u.Email ?? ""),
        };
        var token = new JwtSecurityToken(
            issuer: AuthOptions.JwtIssuer, audience: AuthOptions.JwtAudience, claims: claims,
            notBefore: DateTime.UtcNow, expires: DateTime.UtcNow.Add(AuthOptions.AccessTokenLifetime),
            signingCredentials: creds);
        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    /// <summary>Gera um refresh token opaco e persiste apenas o hash.</summary>
    public static async Task<string> IssueRefreshTokenAsync(AppDb db, int userId)
    {
        var raw = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        db.AppRefreshTokens.Add(new AppRefreshToken
        {
            UserId = userId, TokenHash = Sha256(raw),
            CreatedUtc = DateTime.UtcNow, ExpiresUtc = DateTime.UtcNow.Add(AuthOptions.RefreshTokenLifetime),
        });
        await db.SaveChangesAsync();
        return raw;
    }

    /// <summary>Valida e rotaciona um refresh token; devolve o usuário se válido.</summary>
    public static async Task<User?> RotateAsync(AppDb db, string rawRefresh)
    {
        var hash = Sha256(rawRefresh);
        var row = await db.AppRefreshTokens.FirstOrDefaultAsync(t => t.TokenHash == hash);
        if (row is null || row.RevokedUtc != null || row.ExpiresUtc < DateTime.UtcNow) return null;
        row.RevokedUtc = DateTime.UtcNow; // rotação: o antigo morre ao ser usado
        await db.SaveChangesAsync();
        return await db.Users.FindAsync(row.UserId);
    }

    public static async Task RevokeAsync(AppDb db, string rawRefresh)
    {
        var hash = Sha256(rawRefresh);
        await db.AppRefreshTokens.Where(t => t.TokenHash == hash && t.RevokedUtc == null)
            .ExecuteUpdateAsync(s => s.SetProperty(t => t.RevokedUtc, DateTime.UtcNow));
    }

    public static string Sha256(string value) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}

/// <summary>Perfil devolvido pela troca do authorization code no Google.</summary>
public record GoogleProfile(string Subject, string Email, string Name, string? HostedDomain, string? RefreshToken);

/// <summary>Fluxo OIDC (Authorization Code) contra o Google, mediado pelo backend.</summary>
public static class GoogleOidc
{
    private static readonly HttpClient Http = new();

    // state -> (returnUrl, criado). CSRF + para onde redirecionar após o login.
    // Em memória: o protótipo roda uma instância só; migrar para store distribuído ao escalar.
    private static readonly ConcurrentDictionary<string, (string ReturnUrl, DateTime CreatedUtc)> Pending = new();

    public static string StartLogin(string returnUrl)
    {
        var state = Convert.ToBase64String(RandomNumberGenerator.GetBytes(24))
            .TrimEnd('=').Replace('+', '-').Replace('/', '_');
        Pending[state] = (returnUrl, DateTime.UtcNow);
        PruneExpired();

        var query = new Dictionary<string, string?>
        {
            ["client_id"] = AuthOptions.GoogleClientId,
            ["redirect_uri"] = AuthOptions.GoogleRedirectUri,
            ["response_type"] = "code",
            ["scope"] = AuthOptions.Scopes,
            ["include_granted_scopes"] = "true",
            ["state"] = state,
        };
        if (AuthOptions.OfflineAccess)
        {
            query["access_type"] = "offline";  // pede refresh_token (uso offline p/ Calendar/Meet)
            query["prompt"] = "consent";        // garante refresh_token mesmo em re-login
        }
        if (AuthOptions.HostedDomain.Length > 0) query["hd"] = AuthOptions.HostedDomain;
        var qs = string.Join('&', query.Where(kv => kv.Value != null)
            .Select(kv => $"{Uri.EscapeDataString(kv.Key)}={Uri.EscapeDataString(kv.Value!)}"));
        return $"https://accounts.google.com/o/oauth2/v2/auth?{qs}";
    }

    public static bool TryConsumeState(string state, out string returnUrl)
    {
        PruneExpired();
        if (Pending.TryRemove(state, out var entry)) { returnUrl = entry.ReturnUrl; return true; }
        returnUrl = "";
        return false;
    }

    /// <summary>Troca o code por tokens, valida o id_token e devolve o perfil verificado.</summary>
    public static async Task<GoogleProfile?> ExchangeAsync(string code)
    {
        using var response = await Http.PostAsync("https://oauth2.googleapis.com/token", new FormUrlEncodedContent(
            new Dictionary<string, string>
            {
                ["code"] = code,
                ["client_id"] = AuthOptions.GoogleClientId,
                ["client_secret"] = AuthOptions.GoogleClientSecret,
                ["redirect_uri"] = AuthOptions.GoogleRedirectUri,
                ["grant_type"] = "authorization_code",
            }));
        if (!response.IsSuccessStatusCode) return null;

        using var doc = JsonDocument.Parse(await response.Content.ReadAsStringAsync());
        var root = doc.RootElement;
        if (!root.TryGetProperty("id_token", out var idTokenEl)) return null;
        var refreshToken = root.TryGetProperty("refresh_token", out var rt) ? rt.GetString() : null;

        // O id_token vem direto do endpoint do Google por TLS: a origem já está
        // autenticada, então (conforme o OIDC Core §3.1.3.7) validamos as claims sem
        // reverificar a assinatura RS256 aqui.
        var claims = DecodeJwtPayload(idTokenEl.GetString()!);
        if (claims is null) return null;

        var aud = claims.Value.TryGetProperty("aud", out var a) ? a.GetString() : null;
        var iss = claims.Value.TryGetProperty("iss", out var i) ? i.GetString() : null;
        var exp = claims.Value.TryGetProperty("exp", out var e) ? e.GetInt64() : 0;
        var emailVerified = claims.Value.TryGetProperty("email_verified", out var ev)
            && (ev.ValueKind == JsonValueKind.True || (ev.ValueKind == JsonValueKind.String && ev.GetString() == "true"));
        var sub = claims.Value.TryGetProperty("sub", out var s) ? s.GetString() : null;
        var email = claims.Value.TryGetProperty("email", out var em) ? em.GetString() : null;
        var name = claims.Value.TryGetProperty("name", out var n) ? n.GetString() : email;
        var hd = claims.Value.TryGetProperty("hd", out var h) ? h.GetString() : null;

        if (aud != AuthOptions.GoogleClientId) return null;
        if (iss is not ("accounts.google.com" or "https://accounts.google.com")) return null;
        if (exp < DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return null;
        if (!emailVerified || sub is null || email is null) return null;
        // Restrição de domínio: a claim assinada é a garantia (o parâmetro hd é só UX).
        if (AuthOptions.HostedDomain.Length > 0 &&
            !string.Equals(hd, AuthOptions.HostedDomain, StringComparison.OrdinalIgnoreCase)) return null;

        return new GoogleProfile(sub, email, name ?? email, hd, refreshToken);
    }

    private static JsonElement? DecodeJwtPayload(string jwt)
    {
        var parts = jwt.Split('.');
        if (parts.Length < 2) return null;
        var payload = parts[1].Replace('-', '+').Replace('_', '/');
        payload = payload.PadRight(payload.Length + (4 - payload.Length % 4) % 4, '=');
        try
        {
            using var doc = JsonDocument.Parse(Convert.FromBase64String(payload));
            return doc.RootElement.Clone();
        }
        catch { return null; }
    }

    private static void PruneExpired()
    {
        var cutoff = DateTime.UtcNow.AddMinutes(-10);
        foreach (var kv in Pending)
            if (kv.Value.CreatedUtc < cutoff) Pending.TryRemove(kv.Key, out _);
    }
}
