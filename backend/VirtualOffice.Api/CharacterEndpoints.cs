using System.Text.Json;
using System.Text.RegularExpressions;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>
/// Aparência do avatar: ler e gravar. Duas rotas, um campo.
///
/// O servidor guarda os ids das camadas SEM conhecer o catálogo — quem sabe que
/// `hairstyle-24-03` existe é o cliente, dono de `assets/character/catalog.json`, e
/// duplicar essas 435 entradas aqui só criaria duas listas para manter em dia. O que
/// este endpoint garante é o que o servidor consegue garantir sozinho: que o campo
/// não vire depósito de texto arbitrário.
///
/// A validação de existência acontece na leitura, no cliente: opção que sumiu do
/// catálogo cai no padrão da camada (<c>normalizeCharacterSelection</c>). Isso deixa
/// aposentar um asset ser uma mudança de arquivo, não uma migração de banco.
/// </summary>
public static class CharacterEndpoints
{
    // Camadas e opções são slugs do catálogo do cliente. O limite existe para o campo
    // não virar depósito: sete camadas hoje, com folga para o dobro.
    private const int MaxLayers = 16;
    private static readonly Regex SlugPattern = new("^[a-z0-9][a-z0-9-]{0,47}$", RegexOptions.Compiled);

    public static void MapCharacterEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/game/character", GetCharacter);
        api.MapPut("/game/character", SetCharacter);
    }

    private static async Task<IResult> GetCharacter(HttpRequest req, IDbContextFactory<AppDb> factory)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        await using var db = await factory.CreateDbContextAsync();
        var stored = await db.Users.Where(x => x.Id == userId)
            .Select(x => x.CharacterJson)
            .SingleOrDefaultAsync();
        return Results.Ok(new { character = Parse(stored) });
    }

    private static async Task<IResult> SetCharacter(
        Dictionary<string, string> body,
        HttpRequest req,
        IDbContextFactory<AppDb> factory,
        IHubContext<OfficeHub> hub)
    {
        if (Identity.UserId(req) is not int userId) return Results.Unauthorized();
        if (body is null || body.Count > MaxLayers)
            return Results.BadRequest(new { error = "Aparência inválida." });

        var selection = new Dictionary<string, string>();
        foreach (var (layer, option) in body)
        {
            if (!SlugPattern.IsMatch(layer) || !SlugPattern.IsMatch(option ?? ""))
                return Results.BadRequest(new { error = $"Camada inválida: {layer}." });
            selection[layer] = option!;
        }

        await using var db = await factory.CreateDbContextAsync();
        var user = await db.Users.FindAsync(userId);
        if (user is null) return Results.Unauthorized();
        user.CharacterJson = JsonSerializer.Serialize(selection);
        await db.SaveChangesAsync();

        // Só as outras abas DESTE jogador: quem está no mundo já vê a mudança pela
        // presença (`PlayerAppearance`), que carrega a aparência junto da posição.
        await hub.Clients.Group(OfficeHub.UserGroup(userId)).SendAsync("CharacterChanged", selection);
        return Results.Ok(new { character = selection });
    }

    /// <summary>Texto guardado → dicionário. Campo vazio ou corrompido vira "nunca customizou".</summary>
    private static Dictionary<string, string> Parse(string? stored)
    {
        if (string.IsNullOrWhiteSpace(stored)) return [];
        try
        {
            return JsonSerializer.Deserialize<Dictionary<string, string>>(stored) ?? [];
        }
        catch (JsonException)
        {
            return [];
        }
    }
}
