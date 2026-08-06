using System.Globalization;

namespace VirtualOffice.Api;

/// <summary>
/// Um efeito de equipamento. Tudo que um item faz cabe aqui, e somar dois itens é
/// somar dois destes — é por isso que o agregado do conjunto não precisa saber
/// quais slots existem.
///
/// O servidor é dono desta tabela. O <c>catalog.json</c> do cliente guarda só o
/// visual (sprite, cor, velocidade); efeito que o cliente pudesse escolher não
/// seria efeito, seria sugestão.
/// </summary>
public sealed record EquipmentEffects
{
    /// <summary>Soma % à taxa E ao teto do gold de presença. Ver PLANO_EQUIPAMENTOS §4.1.</summary>
    public double PassiveCoinPercent { get; init; }

    /// <summary>
    /// Soma % ao gold de EQUIPE (reunião e pair programming), não ao de presença.
    ///
    /// Mora no celular porque é o item de estar acessível — e porque o pilar de equipe
    /// precisava de um item que falasse com ele. Sem isso, o conjunto inteiro empurra
    /// só a moeda de ficar online, e a parte do jogo que premia sentar com alguém não
    /// teria como ser melhorada com nada.
    /// </summary>
    public double TeamworkCoinPercent { get; init; }

    /// <summary>+N lançamentos iniciais no Arrange Dice, dentro do teto de lançamentos.</summary>
    public int DiceStartRolls { get; init; }

    /// <summary>+N lançamentos ao tirar 2 — soma ao +2 que a regra base já dá.</summary>
    public int DiceTwoExtraRolls { get; init; }

    /// <summary>Tirar 12 não consome lançamento (o coringa continua valendo).</summary>
    public bool DiceTwelveKeepsRoll { get; init; }

    /// <summary>+N lançamentos ao tirar duas duplas seguidas.</summary>
    public int DiceDoublesBonusRoll { get; init; }

    /// <summary>+N pontos percentuais na chance da trinca de booster do Nerd Slots.</summary>
    public double SlotsBoosterChancePercent { get; init; }

    /// <summary>+N pontos percentuais de shiny ao abrir booster.</summary>
    public double BoosterShinyPercent { get; init; }

    /// <summary>Desconto na loja. Não vale para booster de cardgame — ver PLANO_EQUIPAMENTOS §5.5.</summary>
    public double StoreDiscountPercent { get; init; }

    /// <summary>+N no teto semanal de cada item que tem teto.</summary>
    public int StoreWeeklyBonus { get; init; }

    /// <summary>Libera os itens de loja marcados como exclusivos de carteira.</summary>
    public bool StoreExclusiveTier { get; init; }

    /// <summary>
    /// Horas até o celular gerar um baú. Positivo no celular; negativo no veículo,
    /// que ACELERA o timer. Somar os dois é a conta certa, com piso aplicado em
    /// <see cref="ChestIntervalHours"/>.
    /// </summary>
    public int ChestHours { get; init; }

    /// <summary>Qual baú o timer gera. Vence o mais raro entre os itens equipados.</summary>
    public string ChestTier { get; init; } = "";

    public static readonly EquipmentEffects None = new();

    /// <summary>Piso do timer de baú: nenhum conjunto derruba abaixo disto.</summary>
    public const int MinChestIntervalHours = 3;

    /// <summary>Intervalo efetivo do baú do celular, ou null quando nada gera baú.</summary>
    public int? ChestIntervalHours =>
        string.IsNullOrEmpty(ChestTier) ? null : Math.Max(MinChestIntervalHours, ChestHours);

    public EquipmentEffects Plus(EquipmentEffects other) => new()
    {
        PassiveCoinPercent = PassiveCoinPercent + other.PassiveCoinPercent,
        TeamworkCoinPercent = TeamworkCoinPercent + other.TeamworkCoinPercent,
        DiceStartRolls = DiceStartRolls + other.DiceStartRolls,
        DiceTwoExtraRolls = DiceTwoExtraRolls + other.DiceTwoExtraRolls,
        DiceTwelveKeepsRoll = DiceTwelveKeepsRoll || other.DiceTwelveKeepsRoll,
        DiceDoublesBonusRoll = DiceDoublesBonusRoll + other.DiceDoublesBonusRoll,
        SlotsBoosterChancePercent = SlotsBoosterChancePercent + other.SlotsBoosterChancePercent,
        BoosterShinyPercent = BoosterShinyPercent + other.BoosterShinyPercent,
        StoreDiscountPercent = StoreDiscountPercent + other.StoreDiscountPercent,
        StoreWeeklyBonus = StoreWeeklyBonus + other.StoreWeeklyBonus,
        StoreExclusiveTier = StoreExclusiveTier || other.StoreExclusiveTier,
        ChestHours = ChestHours + other.ChestHours,
        // Baú melhor vence: um celular Lendário no bolso não é rebaixado pelo veículo.
        ChestTier = EquipmentCatalog.BestChestTier(ChestTier, other.ChestTier),
    };
}

public sealed record EquipmentSlot(string Id, string Name, string ShortLabel, string Description);

public sealed record EquipmentItem(
    string Id,
    string Name,
    string Slot,
    string Rarity,
    string Description,
    EquipmentEffects Effects,
    int Price = 0,
    bool Starter = false)
{
    public string CatalogKey => $"{EquipmentCatalog.KeyPrefix}{Id}";

    /// <summary>
    /// Regra dura do plano: Comum e Incomum se compram; Rara para cima só sai de baú.
    /// Deriva da raridade de propósito — um campo separado abriria espaço para um item
    /// Lendário aparecer no balcão por descuido de digitação.
    /// </summary>
    public bool IsPurchasable => !Starter
        && Price > 0
        && EquipmentCatalog.RarityRank(Rarity) <= EquipmentCatalog.RarityRank(EquipmentCatalog.Uncommon);
}

/// <summary>
/// Catálogo de equipamento: slots, raridades, itens e o que cada item faz.
/// Fonte da verdade de economia e efeito. Ver docs/PLANO_EQUIPAMENTOS.md.
/// </summary>
public static class EquipmentCatalog
{
    public const string KeyPrefix = "equipment:";

    public const string Common = "common";
    public const string Uncommon = "uncommon";
    public const string Rare = "rare";
    public const string Legendary = "legendary";
    public const string Exotic = "exotic";

    /// <summary>Do mais comum ao mais raro. A ordem é a régua de tudo: loja, drop e borda na UI.</summary>
    public static readonly string[] Rarities = [Common, Uncommon, Rare, Legendary, Exotic];

    public static readonly Dictionary<string, string> RarityNames = new()
    {
        [Common] = "Comum",
        [Uncommon] = "Incomum",
        [Rare] = "Rara",
        [Legendary] = "Lendária",
        [Exotic] = "Exótica",
    };

    public static int RarityRank(string rarity) =>
        Math.Max(0, Array.IndexOf(Rarities, rarity));

    public const string SlotMouse = "mouse";
    public const string SlotKeyboard = "keyboard";
    public const string SlotAmulet = "amulet";
    public const string SlotVehicle = "vehicle";
    public const string SlotPhone = "phone";
    public const string SlotWallet = "wallet";

    public static readonly EquipmentSlot[] Slots =
    [
        new(SlotMouse, "Mouse", "MS", "Periférico de precisão — rende moeda passiva"),
        new(SlotKeyboard, "Teclado", "TC", "Periférico principal — rende moeda passiva"),
        new(SlotAmulet, "Amuleto", "AM", "Sorte nos jogos do cassino"),
        new(SlotVehicle, "Automóvel", "AU", "Segure Shift para usar"),
        new(SlotPhone, "Celular", "CE", "Moeda passiva e baú por tempo equipado"),
        new(SlotWallet, "Carteira", "CA", "Desconto e cota extra na loja"),
    ];

    /// <summary>Baú que o timer do celular gera, por item. Vazio = não gera.</summary>
    public const string ChestCommon = "common";
    public const string ChestRare = "rare";
    public const string ChestLegendary = "legendary";

    private static readonly string[] ChestTierOrder = [ChestCommon, ChestRare, ChestLegendary];

    public static string BestChestTier(string left, string right)
    {
        if (string.IsNullOrEmpty(left)) return right;
        if (string.IsNullOrEmpty(right)) return left;
        return Array.IndexOf(ChestTierOrder, left) >= Array.IndexOf(ChestTierOrder, right) ? left : right;
    }

    /// <summary>
    /// A escala de <c>PassiveCoinPercent</c> é ancorada no conjunto LENDÁRIO:
    /// mouse 28 + teclado 28 + celular 24 + Harley 20 = <b>+100%</b>, que sobre a base
    /// de 300 moedas/hora dá exatamente as 600/h que o jogo promete no topo.
    ///
    /// Amuleto e carteira não dão passiva de propósito: cada um dos seis slots tem UM
    /// papel, e dois deles são cassino e loja. Espalhar passiva por todos faria a
    /// escolha de conjunto virar "pegue o mais raro de cada" — que não é escolha.
    ///
    /// | Slot     | Comum | Incomum | Rara | Lendária | Exótica |
    /// |----------|------:|--------:|-----:|---------:|--------:|
    /// | Mouse    |     5 |      10 |   18 |       28 |      40 |
    /// | Teclado  |     5 |      10 |   18 |       28 |      40 |
    /// | Celular  |     4 |       8 |   15 |       24 |      34 |
    /// | Automóvel|     — |     3-5 | 8-10 |    16-20 |      26 |
    /// </summary>
    public static readonly EquipmentItem[] Items =
    [
        // ---- Mouse: moeda passiva ----
        new("mouse-office", "Mouse de escritório", SlotMouse, Common,
            "Dois botões, uma roda e nenhuma pretensão.",
            new EquipmentEffects { PassiveCoinPercent = 5 }, Price: 180),
        new("mouse-precision", "Mouse Precision", SlotMouse, Uncommon,
            "Formato clássico e sensor confiável.",
            new EquipmentEffects { PassiveCoinPercent = 10 }, Price: 380),
        new("mouse-rgb", "Mouse RGB", SlotMouse, Rare,
            "Iluminação colorida para setups ousados.",
            new EquipmentEffects { PassiveCoinPercent = 18 }),
        new("mouse-pro-wireless", "Mouse Pro Wireless", SlotMouse, Legendary,
            "Sem fio, sem atraso e sem desculpa.",
            new EquipmentEffects { PassiveCoinPercent = 28 }),
        new("mouse-quantum", "Mouse Quantum", SlotMouse, Exotic,
            "O cursor chega antes da sua mão.",
            new EquipmentEffects { PassiveCoinPercent = 40 }),

        // ---- Teclado: moeda passiva ----
        new("keyboard-membrane", "Teclado de membrana", SlotKeyboard, Common,
            "Silencioso porque desistiu.",
            new EquipmentEffects { PassiveCoinPercent = 5 }, Price: 200),
        new("keyboard-compact", "Teclado compacto", SlotKeyboard, Uncommon,
            "Pequeno, leve e ideal para mesas enxutas.",
            new EquipmentEffects { PassiveCoinPercent = 10 }, Price: 400),
        new("keyboard-mechanical", "Teclado mecânico", SlotKeyboard, Rare,
            "Teclas altas e resposta precisa.",
            new EquipmentEffects { PassiveCoinPercent = 18 }),
        new("keyboard-optical", "Teclado óptico", SlotKeyboard, Legendary,
            "O acionamento é um feixe de luz. Sério.",
            new EquipmentEffects { PassiveCoinPercent = 28 }),
        new("keyboard-holo", "Teclado holográfico", SlotKeyboard, Exotic,
            "Não existe fisicamente. Digita mais rápido mesmo assim.",
            new EquipmentEffects { PassiveCoinPercent = 40 }),

        // ---- Celular: moeda passiva + baú por tempo + o item da EQUIPE ----
        //
        // O relógio do baú conta MINUTOS ONLINE, não horas de parede: com o teto de nove
        // horas por dia, as 24 horas do celular Comum eram quase três dias de jogo por
        // baú. Os intervalos caíram para 12/9/7/5/4 — o Comum entrega em pouco mais de um
        // dia de escritório, o Exótico em meio dia.
        new("phone-basic", "Celular básico", SlotPhone, Common,
            "Liga, desliga e ainda avisa quando o time chama.",
            new EquipmentEffects
            {
                PassiveCoinPercent = 4, TeamworkCoinPercent = 5,
                ChestHours = 12, ChestTier = ChestCommon,
            },
            Price: 220),
        new("phone-smart", "Smartphone", SlotPhone, Uncommon,
            "Notifica você sobre o próprio baú e sobre a reunião que já começou.",
            new EquipmentEffects
            {
                PassiveCoinPercent = 8, TeamworkCoinPercent = 10,
                ChestHours = 9, ChestTier = ChestCommon,
            },
            Price: 460),
        new("phone-flagship", "Flagship", SlotPhone, Rare,
            "Câmera boa demais para o que você fotografa, microfone bom demais para a daily.",
            new EquipmentEffects
            {
                PassiveCoinPercent = 15, TeamworkCoinPercent = 20,
                ChestHours = 7, ChestTier = ChestRare,
            }),
        new("phone-foldable", "Dobrável", SlotPhone, Legendary,
            "Abre, fecha, entrega baú raro e deixa o pair mais rentável.",
            new EquipmentEffects
            {
                PassiveCoinPercent = 24, TeamworkCoinPercent = 35,
                ChestHours = 5, ChestTier = ChestRare,
            }),
        new("phone-neural", "Neural Link", SlotPhone, Exotic,
            "Você não usa: ele usa você. Em troca, chove baú e ninguém fala sozinho.",
            new EquipmentEffects
            {
                PassiveCoinPercent = 34, TeamworkCoinPercent = 50,
                ChestHours = 4, ChestTier = ChestLegendary,
            }),

        // ---- Amuleto: cassino ----
        //
        // Os bônus da MESA DE DADOS (lançamento inicial, 2, 12, duplas) são exclusivos de
        // Lendária para cima. Eles multiplicam o RTP da mesa por 2 a 2,5 vezes — um
        // amuleto Comum de 240 moedas com esse poder pagaria a si mesmo em minutos.
        // Comum, Incomum e Rara ficam com os bônus de caça-níqueis e de shiny, que
        // rendem carta e não moeda.
        new("amulet-clover", "Amuleto Trevo", SlotAmulet, Common,
            "Um empurrãozinho na chance de booster do caça-níqueis.",
            new EquipmentEffects { SlotsBoosterChancePercent = 0.3 }, Price: 240),
        new("amulet-dice", "Amuleto do Dado", SlotAmulet, Uncommon,
            "Mais booster no caça-níqueis, e uma pontinha de shiny.",
            new EquipmentEffects { SlotsBoosterChancePercent = 0.6, BoosterShinyPercent = 0.3 },
            Price: 520),
        new("amulet-horseshoe", "Amuleto Ferradura", SlotAmulet, Rare,
            "Sorte de verdade no caça-níqueis — mas a mesa de dados ainda ignora você.",
            new EquipmentEffects { SlotsBoosterChancePercent = 1, BoosterShinyPercent = 0.5 }),
        new("amulet-phoenix", "Amuleto Fênix", SlotAmulet, Legendary,
            "Duplas seguidas viram lançamento, e o slot solta mais booster.",
            new EquipmentEffects
            {
                DiceStartRolls = 1,
                DiceTwelveKeepsRoll = true,
                DiceDoublesBonusRoll = 1,
                SlotsBoosterChancePercent = 1,
            }),
        new("amulet-void", "Amuleto do Vazio", SlotAmulet, Exotic,
            "A mesa inteira joga a seu favor — inclusive o shiny.",
            new EquipmentEffects
            {
                DiceStartRolls = 1,
                DiceTwoExtraRolls = 2,
                DiceTwelveKeepsRoll = true,
                DiceDoublesBonusRoll = 1,
                SlotsBoosterChancePercent = 2,
                BoosterShinyPercent = 1,
            }),

        // Brinde de beta: mesmo poder do Vazio, entregue a todo mundo.
        //
        // `Starter: true` faz o seed conceder a cada usuário humano em todo boot, então
        // quem se cadastrar depois também recebe. Não é comprável e não sai de baú — é o
        // único item do jogo cuja porta é "estar aqui durante o beta".
        //
        // ⚠️ Como TODO jogador o carrega, é o RTP DELE que vale como RTP real da mesa de
        // dados: 85%. Aposentá-lo depois do beta deixa a mesa em 32% para quem não tiver
        // outro amuleto — reequilibrar aí é obrigatório, não opcional.
        new("amulet-beta", "Amuleto do Beta", SlotAmulet, Exotic,
            "Cortesia de quem testou o jogo antes de ele existir. Todos os atributos.",
            new EquipmentEffects
            {
                DiceStartRolls = 1,
                DiceTwoExtraRolls = 2,
                DiceTwelveKeepsRoll = true,
                DiceDoublesBonusRoll = 1,
                SlotsBoosterChancePercent = 2,
                BoosterShinyPercent = 1,
            },
            Starter: true),

        // ---- Carteira: loja ----
        new("wallet-canvas", "Carteira de lona", SlotWallet, Common,
            "Segura o troco e um desconto tímido.",
            new EquipmentEffects { StoreDiscountPercent = 2 }, Price: 200),
        new("wallet-leather", "Carteira de couro", SlotWallet, Uncommon,
            "Desconto melhor e uma compra a mais por semana.",
            new EquipmentEffects { StoreDiscountPercent = 4, StoreWeeklyBonus = 1 }, Price: 450),
        new("wallet-titanium", "Carteira de titânio", SlotWallet, Rare,
            "Pesada, fria e generosa no balcão.",
            new EquipmentEffects { StoreDiscountPercent = 7, StoreWeeklyBonus = 2 }),
        new("wallet-black", "Carteira Black", SlotWallet, Legendary,
            "Abre a prateleira que o resto da loja não vê.",
            new EquipmentEffects
            {
                StoreDiscountPercent = 10,
                StoreWeeklyBonus = 3,
                StoreExclusiveTier = true,
            }),
        new("wallet-infinite", "Carteira Infinita", SlotWallet, Exotic,
            "O caixa agradece e você nem sente.",
            new EquipmentEffects
            {
                StoreDiscountPercent = 15,
                StoreWeeklyBonus = 5,
                StoreExclusiveTier = true,
            }),

        // ---- Automóvel: velocidade mora no catalog.json do cliente; aqui, o atributo ----
        //
        // Regra que faltava neste slot: DENTRO de uma raridade, todo veículo carrega a
        // mesma passiva; o que muda é o extra por cima. Antes o Super Skate (Rara) dava
        // +10% de passiva e o Patins Pro (Rara) dava +2% de desconto na loja — dois itens
        // do mesmo degrau em que um era estritamente melhor, e escolher entre eles era só
        // descobrir qual. Agora escolhe-se o EXTRA (loja, cassino, baú), não o poder.
        //
        // Passiva por degrau: Comum 2 · Incomum 5 · Rara 10 · Lendária 16 · Exótica 26.
        new("skate", "Skate", SlotVehicle, Common,
            "Ágil e fácil de controlar nos corredores.",
            // Era o único item do jogo sem efeito nenhum. Como é o veículo inicial de
            // todo mundo, era também o primeiro card que a bag mostrava — vazio.
            new EquipmentEffects { PassiveCoinPercent = 2 }, Starter: true),
        new("roller-skates", "Patins", SlotVehicle, Uncommon,
            "Mais rápidos, com passadas curtas e suaves.",
            new EquipmentEffects { PassiveCoinPercent = 5 }, Price: 450),
        new("china-custom", "Chinesa Custom", SlotVehicle, Uncommon,
            "Barulhenta, barata e surpreendentemente veloz.",
            new EquipmentEffects { PassiveCoinPercent = 5, StoreDiscountPercent = 2 }, Price: 780),
        new("skate-neon", "Skate Neon", SlotVehicle, Rare,
            "Prancha iluminada — e o caça-níqueis parece notar.",
            new EquipmentEffects { PassiveCoinPercent = 10, SlotsBoosterChancePercent = 0.5 }),
        new("super-skate", "Super Skate", SlotVehicle, Rare,
            "Rolamento cerâmico e um empurrão nos ganhos passivos.",
            new EquipmentEffects { PassiveCoinPercent = 10, TeamworkCoinPercent = 10 }),
        new("roller-skates-pro", "Patins Pro", SlotVehicle, Rare,
            "Botas esportivas com rodas de alta resposta.",
            new EquipmentEffects { PassiveCoinPercent = 10, StoreDiscountPercent = 2 }),
        new("electric-scooter", "Patinete elétrico", SlotVehicle, Rare,
            "Aceleração estável para atravessar áreas abertas.",
            new EquipmentEffects { PassiveCoinPercent = 10, StoreWeeklyBonus = 1 }),
        new("royal-enfield", "Royal Enfield", SlotVehicle, Rare,
            "Motor de curso longo e crédito na praça.",
            new EquipmentEffects { PassiveCoinPercent = 10, StoreDiscountPercent = 3 }),
        new("electric-scooter-city", "Patinete City", SlotVehicle, Legendary,
            "Modelo urbano premium — adianta o baú do celular em uma hora.",
            new EquipmentEffects { PassiveCoinPercent = 16, ChestHours = -1 }),
        new("tesla-scooter", "Patinete da Tesla", SlotVehicle, Legendary,
            "Silencioso a ponto de assustar. Adianta o baú em duas horas.",
            new EquipmentEffects { PassiveCoinPercent = 16, ChestHours = -2 }),
        new("motorcycle-retro", "Moto Retrô", SlotVehicle, Legendary,
            "Carenagem clássica com acabamento cobre — e carona que rende.",
            new EquipmentEffects { PassiveCoinPercent = 16, TeamworkCoinPercent = 20 }),
        new("motorcycle", "Moto", SlotVehicle, Legendary,
            "Veloz o bastante para exigir cuidado em espaços internos.",
            new EquipmentEffects { PassiveCoinPercent = 18 }),
        new("indian-custom", "Indian Custom", SlotVehicle, Legendary,
            "Guidão largo, tanque pintado à mão e um dado a mais na mesa.",
            new EquipmentEffects { PassiveCoinPercent = 16, DiceStartRolls = 1 }),
        new("harley-custom", "Harley Custom", SlotVehicle, Legendary,
            "O ronco chega antes de você.",
            new EquipmentEffects { PassiveCoinPercent = 20 }),
        new("kawasaki-custom", "Kawasaki Custom", SlotVehicle, Exotic,
            "A coisa mais rápida do prédio, e ela sabe disso.",
            new EquipmentEffects { PassiveCoinPercent = 26, SlotsBoosterChancePercent = 1 }),
    ];

    private static readonly Dictionary<string, EquipmentItem> ById =
        Items.ToDictionary(x => x.Id);

    private static readonly Dictionary<string, EquipmentItem> ByCatalogKey =
        Items.ToDictionary(x => x.CatalogKey);

    public static EquipmentItem? Find(string id) => ById.GetValueOrDefault(id);

    public static EquipmentItem? FindByCatalogKey(string catalogKey) =>
        ByCatalogKey.GetValueOrDefault(catalogKey);

    public static bool IsEquipmentKey(string catalogKey) => ByCatalogKey.ContainsKey(catalogKey);

    public static bool IsSlot(string slot) => Slots.Any(x => x.Id == slot);

    /// <summary>Efeito do conjunto: soma dos itens equipados. Chave desconhecida é ignorada.</summary>
    public static EquipmentEffects Aggregate(IEnumerable<string> catalogKeys) =>
        catalogKeys
            .Select(FindByCatalogKey)
            .Where(item => item is not null)
            .Aggregate(EquipmentEffects.None, (total, item) => total.Plus(item!.Effects));

    /// <summary>
    /// Chaves que existiram e não existem mais. O seed apaga a definição E as
    /// instâncias — o jogo está em beta e os vestíveis antigos não têm slot novo
    /// para onde ir. Sem isso, sobra item órfão no inventário de quem já jogou.
    /// </summary>
    public static readonly string[] RetiredCatalogKeys =
    [
        "equipment:silver-chain",
        "equipment:gold-chain",
        "equipment:pixel-earrings",
        "equipment:ruby-earrings",
        "equipment:focus-bracelet",
        "equipment:pulse-bracelet",
        // Periféricos antigos: os ids novos (`mouse-*`, `keyboard-*`) carregam efeito,
        // então o par velho sai em vez de ser renomeado.
        "equipment:precision-mouse",
        "equipment:rgb-mouse",
        "equipment:mechanical-keyboard",
        "equipment:compact-keyboard",
    ];

    /// <summary>
    /// Texto pt-BR de cada efeito, para a UI não precisar conhecer o vocabulário.
    /// Formatar aqui mantém "+2%" e "+1 lançamento" com a mesma cara em todo lugar.
    /// </summary>
    public static string[] Describe(EquipmentEffects effects)
    {
        var lines = new List<string>();
        void Percent(double value, string label)
        {
            if (value > 0) lines.Add($"+{Number(value)}% {label}");
        }

        Percent(effects.PassiveCoinPercent, "de moedas por minuto");
        Percent(effects.TeamworkCoinPercent, "de moedas em reunião e pair programming");
        if (effects.DiceStartRolls > 0)
            lines.Add($"+{effects.DiceStartRolls} lançamento inicial nos dados");
        if (effects.DiceTwoExtraRolls > 0)
            lines.Add($"+{effects.DiceTwoExtraRolls} lançamento ao tirar 2");
        if (effects.DiceTwelveKeepsRoll)
            lines.Add("O 12 não consome lançamento");
        if (effects.DiceDoublesBonusRoll > 0)
            lines.Add($"+{effects.DiceDoublesBonusRoll} lançamento a cada duas duplas seguidas");
        Percent(effects.SlotsBoosterChancePercent, "de chance de booster no caça-níqueis");
        Percent(effects.BoosterShinyPercent, "de chance de shiny");
        Percent(effects.StoreDiscountPercent, "de desconto na loja");
        if (effects.StoreWeeklyBonus > 0)
            lines.Add($"+{effects.StoreWeeklyBonus} no limite semanal da loja");
        if (effects.StoreExclusiveTier)
            lines.Add("Libera os itens exclusivos da loja");
        if (effects.ChestIntervalHours is int hours)
            // O nome vem do catálogo de BAÚS, não do de raridades: "Baú" é masculino e
            // as raridades são femininas, então `RarityNames` produzia "Baú Rara".
            lines.Add($"{LootboxCatalog.Find(effects.ChestTier)?.Name ?? "Baú"} a cada {hours} h equipado");
        // `ChestHours` negativo sem `ChestTier` é o veículo que ACELERA o baú do celular.
        // Sozinho ele não gera baú nenhum, então a linha acima não sai — e o item
        // apareceria na bag sem efeito algum, parecendo quebrado.
        else if (effects.ChestHours < 0)
            lines.Add($"Adianta o baú do celular em {-effects.ChestHours} h");
        return [.. lines];
    }

    private static string Number(double value) => value == Math.Floor(value)
        ? value.ToString("0", CultureInfo.InvariantCulture)
        : value.ToString("0.#", CultureInfo.InvariantCulture);
}
