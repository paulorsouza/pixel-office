using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text;

namespace VirtualOffice.Api;

/// <summary>
/// Credencial local (usuário + senha) — o caminho de login do beta, sem Google.
///
/// A senha vive como PBKDF2-SHA256 no formato "pbkdf2$sha256$iters$saltB64$hashB64",
/// então dá para subir as iterações depois sem invalidar as contas antigas. A conta é
/// o mesmo <see cref="User"/> usado pelo login Google: quando o Workspace entrar, basta
/// vincular o GoogleSubject ao usuário que já existe (ver /auth/google/link) e todo o
/// progresso — XP, horas, inventário, móveis — continua no mesmo Id.
/// </summary>
public static class PasswordAuth
{
    private const int Iterations = 210_000;
    private const int SaltBytes = 16;
    private const int HashBytes = 32;

    public static string Hash(string password)
    {
        var salt = RandomNumberGenerator.GetBytes(SaltBytes);
        var hash = Rfc2898DeriveBytes.Pbkdf2(password, salt, Iterations, HashAlgorithmName.SHA256, HashBytes);
        return $"pbkdf2$sha256${Iterations}${Convert.ToBase64String(salt)}${Convert.ToBase64String(hash)}";
    }

    /// <summary>Confere a senha em tempo constante. needsRehash indica parâmetros defasados.</summary>
    public static bool Verify(string password, string stored, out bool needsRehash)
    {
        needsRehash = false;
        var parts = stored.Split('$');
        if (parts.Length != 5 || parts[0] != "pbkdf2" || parts[1] != "sha256") return false;
        if (!int.TryParse(parts[2], out var iterations) || iterations <= 0) return false;

        byte[] salt, expected;
        try
        {
            salt = Convert.FromBase64String(parts[3]);
            expected = Convert.FromBase64String(parts[4]);
        }
        catch { return false; }

        var actual = Rfc2898DeriveBytes.Pbkdf2(password, salt, iterations, HashAlgorithmName.SHA256, expected.Length);
        if (!CryptographicOperations.FixedTimeEquals(actual, expected)) return false;
        needsRehash = iterations < Iterations;
        return true;
    }

    /// <summary>Gasta o mesmo tempo de um Verify real — evita descobrir usuários pelo tempo de resposta.</summary>
    public static void FakeVerify() =>
        Rfc2898DeriveBytes.Pbkdf2("dummy", new byte[SaltBytes], Iterations, HashAlgorithmName.SHA256, HashBytes);

    // ---- regras de formato ----

    /// <summary>Normaliza o login: minúsculo, sem espaços. Guardamos já normalizado.</summary>
    public static string NormalizeUsername(string? username) => (username ?? "").Trim().ToLowerInvariant();

    public static bool IsValidUsername(string normalized, out string error)
    {
        error = "";
        if (normalized.Length is < 3 or > 32) { error = "O usuário precisa ter de 3 a 32 caracteres."; return false; }
        foreach (var c in normalized)
        {
            if (char.IsAsciiLetterLower(c) || char.IsAsciiDigit(c) || c is '.' or '_' or '-') continue;
            error = "Use apenas letras, números, ponto, hífen ou underline no usuário.";
            return false;
        }
        if (!char.IsAsciiLetterLower(normalized[0]) && !char.IsAsciiDigit(normalized[0]))
        {
            error = "O usuário precisa começar com letra ou número.";
            return false;
        }
        return true;
    }

    public static bool IsValidPassword(string? password, out string error)
    {
        error = "";
        if ((password ?? "").Length < 8) { error = "A senha precisa ter pelo menos 8 caracteres."; return false; }
        if (password!.Length > 200) { error = "Senha longa demais."; return false; }
        return true;
    }
}

/// <summary>
/// Freio de força bruta em memória (o beta roda uma instância só). Conta falhas por
/// chave (usuário ou IP) e bloqueia por alguns minutos ao estourar o limite.
/// </summary>
public static class LoginThrottle
{
    private const int MaxFailures = 8;
    private static readonly TimeSpan Window = TimeSpan.FromMinutes(15);
    private static readonly ConcurrentDictionary<string, (int Failures, DateTime FirstUtc)> Attempts = new();

    public static bool IsBlocked(string key)
    {
        if (!Attempts.TryGetValue(Norm(key), out var entry)) return false;
        if (DateTime.UtcNow - entry.FirstUtc > Window) { Attempts.TryRemove(Norm(key), out _); return false; }
        return entry.Failures >= MaxFailures;
    }

    public static void RegisterFailure(string key)
    {
        var k = Norm(key);
        Attempts.AddOrUpdate(k,
            _ => (1, DateTime.UtcNow),
            (_, prev) => DateTime.UtcNow - prev.FirstUtc > Window
                ? (1, DateTime.UtcNow)
                : (prev.Failures + 1, prev.FirstUtc));
    }

    public static void Clear(string key) => Attempts.TryRemove(Norm(key), out _);

    private static string Norm(string key) => key.ToLowerInvariant();
}
