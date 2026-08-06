using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

/// <summary>
/// Porta única para "o que o conjunto deste jogador faz".
///
/// Presença, cassino e loja precisam da mesma resposta, e cada um resolvendo por
/// conta própria significaria três consultas com três formatos — e três lugares
/// para esquecer de um slot novo. Quem quer efeito chama aqui.
/// </summary>
public static class EquipmentState
{
    public static async Task<EquipmentEffects> EffectsForAsync(AppDb db, int userId)
    {
        var equipped = await db.GameItemInstances
            .Where(x => x.UserId == userId && x.EquippedSlot != "")
            .Join(db.GameItemDefinitions, x => x.DefinitionId, d => d.Id, (x, d) => d.CatalogKey)
            .ToListAsync();
        return EquipmentCatalog.Aggregate(equipped);
    }

    /// <summary>
    /// Preço com o desconto da carteira. Booster de cardgame fica de fora: o preço
    /// dele foi calibrado contra a renda semanal (ECONOMIA.md §5.3), e deixar uma
    /// carteira tirar 15% dali mexeria na progressão do álbum de lambuja.
    /// </summary>
    public static int PriceFor(string itemType, int price, EquipmentEffects effects)
    {
        if (itemType == "booster" || effects.StoreDiscountPercent <= 0 || price <= 0) return price;
        var discounted = price * (1 - effects.StoreDiscountPercent / 100.0);
        // Piso de 1 moeda em item pago: desconto não transforma compra em brinde.
        return Math.Max(1, (int)Math.Round(discounted, MidpointRounding.AwayFromZero));
    }

    public static int PriceFor(GameItemDefinition definition, EquipmentEffects effects) =>
        PriceFor(definition.ItemType, definition.Price, effects);

    /// <summary>
    /// Teto semanal com o bônus da carteira. Item sem teto continua sem teto.
    ///
    /// O bônus **nunca passa do dobro** do teto original. Sem esse freio, a Carteira
    /// Infinita (+5) levaria o Booster Ultrarraro de 1 para 6 por semana — e aquele
    /// teto de 1 não é decoração, é o que segura o pico de quem teve uma noite boa no
    /// cassino (ECONOMIA.md §5.2). Dobrar já é um perk que se sente; sextuplicar
    /// reescreveria a progressão do álbum de carona numa mudança de equipamento.
    /// </summary>
    public static int WeeklyLimitFor(int weeklyLimit, EquipmentEffects effects) =>
        weeklyLimit <= 0
            ? 0
            : Math.Min(weeklyLimit * 2, weeklyLimit + Math.Max(0, effects.StoreWeeklyBonus));

    public static int WeeklyLimitFor(GameItemDefinition definition, EquipmentEffects effects) =>
        WeeklyLimitFor(definition.WeeklyPurchaseLimit, effects);

    /// <summary>
    /// O item está liberado para este conjunto? Só o Baú Selecionado exige carteira
    /// hoje; qualquer outro item passa direto.
    /// </summary>
    public static bool MeetsWalletGate(string catalogKey, EquipmentEffects effects) =>
        LootboxCatalog.FindByCatalogKey(catalogKey)?.RequiresWallet != true
        || effects.StoreExclusiveTier;
}
