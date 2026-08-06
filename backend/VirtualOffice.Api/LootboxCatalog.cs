namespace VirtualOffice.Api;

/// <summary>Uma linha da tabela de drop: raridade e peso relativo.</summary>
public sealed record LootboxDrop(string Rarity, int Weight);

public sealed record LootboxTier(
    string Id,
    string Name,
    string Description,
    LootboxDrop[] Table,
    int Price = 0,
    int WeeklyLimit = 0,
    bool RequiresWallet = false)
{
    public string CatalogKey => $"{LootboxCatalog.KeyPrefix}{Id}";

    /// <summary>Baú de recompensa não tem balcão: preço zero é o que o mantém fora da loja.</summary>
    public bool IsPurchasable => Price > 0;
}

/// <summary>
/// Baús: o que cada um sorteia, quanto custa e quanto vale quando não há mais o que
/// dropar. Ver docs/PLANO_EQUIPAMENTOS.md §6.
///
/// O baú é um <see cref="GameItemDefinition"/> com <c>ItemType = "lootbox"</c>. Isso não é
/// economia de tabela: comprar, guardar e dar de recompensa já funcionam para instância de
/// item, e um "inventário de baús" paralelo teria de reimplementar os três.
/// </summary>
public static class LootboxCatalog
{
    public const string KeyPrefix = "lootbox:";
    public const string ItemType = "lootbox";

    public const string Common = "common";
    public const string Rare = "rare";
    public const string Premium = "premium";
    public const string Legendary = "legendary";
    public const string Exotic = "exotic";

    public static readonly LootboxTier[] Tiers =
    [
        new(Common, "Baú Comum",
            "Ferramenta de todo dia. Sai da loja e dos objetivos diários.",
            [new(EquipmentCatalog.Common, 65), new(EquipmentCatalog.Uncommon, 35)],
            Price: 350, WeeklyLimit: 5),

        new(Rare, "Baú Raro",
            "O primeiro degrau em que a Lendária aparece.",
            [
                new(EquipmentCatalog.Uncommon, 50),
                new(EquipmentCatalog.Rare, 45),
                new(EquipmentCatalog.Legendary, 5),
            ],
            Price: 1_400, WeeklyLimit: 2),

        // O único item do balcão que exige carteira. Ele existe para a Carteira Black
        // e a Infinita terem o que abrir — sem ele, `storeExclusiveTier` seria uma
        // bandeira que ninguém lê.
        new(Premium, "Baú Selecionado",
            "Prateleira reservada: só quem carrega uma Carteira Black ou melhor enxerga.",
            [
                new(EquipmentCatalog.Rare, 65),
                new(EquipmentCatalog.Legendary, 33),
                new(EquipmentCatalog.Exotic, 2),
            ],
            Price: 2_600, WeeklyLimit: 1, RequiresWallet: true),

        // Melhor que o Selecionado de propósito: este é ganho, aquele é comprado.
        new(Legendary, "Baú Lendário",
            "Prêmio de objetivo semanal, de nível e das jogadas raras do cassino.",
            [
                new(EquipmentCatalog.Rare, 62),
                new(EquipmentCatalog.Legendary, 33),
                new(EquipmentCatalog.Exotic, 5),
            ]),

        new(Exotic, "Baú Exótico",
            "Só a sexta vitória seguida na Liga entrega um. Moeda nenhuma compra.",
            [new(EquipmentCatalog.Legendary, 75), new(EquipmentCatalog.Exotic, 25)]),
    ];

    private static readonly Dictionary<string, LootboxTier> ById = Tiers.ToDictionary(x => x.Id);
    private static readonly Dictionary<string, LootboxTier> ByKey = Tiers.ToDictionary(x => x.CatalogKey);

    public static LootboxTier? Find(string id) => ById.GetValueOrDefault(id);

    public static LootboxTier? FindByCatalogKey(string catalogKey) => ByKey.GetValueOrDefault(catalogKey);

    /// <summary>
    /// Moedas que o baú paga quando o jogador já tem tudo daquela raridade. Equipamento
    /// é único por jogador, então o poço seca — e um baú que abrisse vazio seria pior
    /// que um baú que não caiu.
    /// </summary>
    public static readonly Dictionary<string, int> ConsolationCoins = new()
    {
        [EquipmentCatalog.Common] = 120,
        [EquipmentCatalog.Uncommon] = 260,
        [EquipmentCatalog.Rare] = 700,
        [EquipmentCatalog.Legendary] = 1_800,
        [EquipmentCatalog.Exotic] = 4_000,
    };

    /// <summary>Quantas vezes o sorteio tenta outra raridade antes de virar moeda.</summary>
    public const int RarityRerolls = 3;

    /// <summary>Sorteia uma raridade da tabela, por peso.</summary>
    public static string RollRarity(LootboxTier tier, Func<int, int> next)
    {
        var total = tier.Table.Sum(row => row.Weight);
        var ticket = next(total);
        foreach (var row in tier.Table)
        {
            if (ticket < row.Weight) return row.Rarity;
            ticket -= row.Weight;
        }
        return tier.Table[^1].Rarity;
    }

    /// <summary>Chance de cada raridade, em %, para a UI mostrar o que o baú promete.</summary>
    public static IEnumerable<object> Odds(LootboxTier tier)
    {
        var total = tier.Table.Sum(row => row.Weight);
        return tier.Table.Select(row => new
        {
            rarity = row.Rarity,
            name = EquipmentCatalog.RarityNames[row.Rarity],
            percent = Math.Round(row.Weight * 100.0 / total, 1),
        });
    }
}
