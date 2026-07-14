using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace VirtualOffice.Api;

/// <summary>
/// Emissão de tokens de acesso do LiveKit (SFU de A/V).
/// JWT HS256 escrito à mão para não puxar dependência — o formato é o
/// documentado em https://docs.livekit.io (claims "video" com os grants).
/// </summary>
public static class LiveKitService
{
    // padrões de desenvolvimento — casam com livekit/livekit.yaml
    public static string Url { get; private set; } = "ws://localhost:7880";
    public static string ApiKey { get; private set; } = "devkey";
    public static string ApiSecret { get; private set; } = "devsecret_officequest_32chars_min!";

    public static void Configure(IConfiguration config)
    {
        Url = config["LiveKit:Url"] ?? Url;
        ApiKey = config["LiveKit:ApiKey"] ?? ApiKey;
        ApiSecret = config["LiveKit:ApiSecret"] ?? ApiSecret;
    }

    public static string CreateToken(string identity, string displayName, string room, TimeSpan? ttl = null)
    {
        var now = DateTimeOffset.UtcNow;
        var header = new { alg = "HS256", typ = "JWT" };
        var payload = new Dictionary<string, object>
        {
            ["iss"] = ApiKey,
            ["sub"] = identity,
            ["name"] = displayName,
            ["nbf"] = now.AddSeconds(-10).ToUnixTimeSeconds(),
            ["exp"] = now.Add(ttl ?? TimeSpan.FromHours(6)).ToUnixTimeSeconds(),
            ["video"] = new Dictionary<string, object>
            {
                ["room"] = room,
                ["roomJoin"] = true,
                ["canPublish"] = true,
                ["canSubscribe"] = true,
                ["canPublishData"] = true,
            },
        };

        var headerB64 = Base64Url(JsonSerializer.SerializeToUtf8Bytes(header));
        var payloadB64 = Base64Url(JsonSerializer.SerializeToUtf8Bytes(payload));
        var signingInput = $"{headerB64}.{payloadB64}";
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(ApiSecret));
        var signature = Base64Url(hmac.ComputeHash(Encoding.UTF8.GetBytes(signingInput)));
        return $"{signingInput}.{signature}";
    }

    private static string Base64Url(byte[] bytes) =>
        Convert.ToBase64String(bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_');
}
