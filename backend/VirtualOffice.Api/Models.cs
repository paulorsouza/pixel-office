namespace VirtualOffice.Api;

public enum WorkItemType { Task, Bug, Atendimento }
public enum WorkItemStatus { Backlog, Todo, InProgress, Review, Done }
public enum WorkItemPriority { Low, Medium, High, Urgent }
public enum ItemKind { Skin, Furniture, Medal }
public enum Rarity { Common, Rare, Epic, Legendary }

/// <summary>Janela em que um objetivo é medido e reiniciado.</summary>
public enum ObjectiveScope { Daily, Weekly }

// Papel de permissão da aplicação (independe de Role, que é o cargo decorativo).
public enum UserRole { Member, Manager, Admin }

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public string Color { get; set; } = "#7c5cff";
    public int Coins { get; set; } = 250;
    public bool IsBot { get; set; }
    // task que o dev escolheu como "ativa" — o timer da mesa conta horas nela
    public int? ActiveWorkItemId { get; set; }

    // ---- identidade ----
    // A conta é este User. Cada forma de entrar é só uma credencial pendurada nele:
    // senha local (beta) e/ou Google (depois). Vincular uma não mexe no progresso.
    public string? Username { get; set; }          // login local, sempre normalizado (minúsculo)
    public string? PasswordHash { get; set; }      // PBKDF2 — ver PasswordAuth
    public DateTime? PasswordUpdatedUtc { get; set; }

    // 'sub' do Google: chave de vínculo estável (e-mail pode mudar, sub não).
    public string? GoogleSubject { get; set; }
    public string? Email { get; set; }
    public UserRole AppRole { get; set; } = UserRole.Member;

    /// <summary>
    /// Aparência do avatar: um par camada→opção por linha, em JSON (<c>{"body":"body-03",…}</c>).
    ///
    /// Mora aqui, e não no <c>localStorage</c>, porque a customização é a identidade da
    /// pessoa no mundo — trocar de navegador ou entrar pelo celular não pode devolver
    /// um estranho. O servidor guarda os ids sem conhecê-los: o catálogo é asset do
    /// cliente (<c>assets/character/catalog.json</c>) e é ele quem valida o que existe.
    /// Vazio = nunca customizou, e o cliente aplica o conjunto padrão.
    /// </summary>
    public string CharacterJson { get; set; } = "";
}

/// <summary>
/// Registro imutável de uma rodada do cassino. A configuração escolhida,
/// o resultado e os saldos ficam
/// persistidos para auditoria e para tornar retries idempotentes.
/// </summary>
public class CasinoRound
{
    public long Id { get; set; }
    public int UserId { get; set; }
    public string GameId { get; set; } = "";
    public string RulesVersion { get; set; } = "";
    public string IdempotencyKey { get; set; } = "";
    public int Bet { get; set; }
    public string OutcomeJson { get; set; } = "[]";
    public int Payout { get; set; }
    public int BalanceBefore { get; set; }
    public int BalanceAfter { get; set; }
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}

// Token offline do Google por usuário — usado depois para Calendar/Meet.
// RefreshToken guardado cifrado (nunca em texto puro).
public class GoogleCredential
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string RefreshTokenEnc { get; set; } = "";
    public string Scopes { get; set; } = "";
    public DateTime UpdatedUtc { get; set; }
}

// Refresh token da PRÓPRIA aplicação (rotativo, revogável). Guardado só o hash.
public class AppRefreshToken
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string TokenHash { get; set; } = "";
    public DateTime ExpiresUtc { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime? RevokedUtc { get; set; }
}

public class Epic
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#2dd4a7";
}

public class Sprint
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public DateTime StartUtc { get; set; }
    public DateTime EndUtc { get; set; }
    public bool IsActive { get; set; }
}

public class WorkItem
{
    public int Id { get; set; }
    public string Code { get; set; } = "";
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public WorkItemType Type { get; set; }
    public WorkItemStatus Status { get; set; }
    public WorkItemPriority Priority { get; set; } = WorkItemPriority.Medium;
    public int? EpicId { get; set; }
    public int? SprintId { get; set; }
    public int? AssigneeId { get; set; }
    public int? CreatedById { get; set; }
    public double? EstimateHours { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; }
    public DateTime? StartedUtc { get; set; }
    public DateTime? DoneUtc { get; set; }
    public DateTime? DueUtc { get; set; }
    // Arquivar tira do quadro sem perder histórico de horas.
    public DateTime? ArchivedUtc { get; set; }
    // Impedimento é atributo do card, não uma coluna — um card bloqueado continua no fluxo.
    public bool IsBlocked { get; set; }
    public string BlockedReason { get; set; } = "";
    /// <summary>Posição dentro da coluna. Espaçada de 1000 em 1000 para reordenar sem renumerar tudo.</summary>
    public double BoardOrder { get; set; }
}

public class Label
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Color { get; set; } = "#7c5cff";
}

public class WorkItemLabel
{
    public int WorkItemId { get; set; }
    public int LabelId { get; set; }
}

public class WorkItemComment
{
    public int Id { get; set; }
    public int WorkItemId { get; set; }
    public int UserId { get; set; }
    public string Body { get; set; } = "";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
    public DateTime? EditedUtc { get; set; }
}

public class ChecklistItem
{
    public int Id { get; set; }
    public int WorkItemId { get; set; }
    public string Text { get; set; } = "";
    public bool Done { get; set; }
    public int Position { get; set; }
}

/// <summary>Trilha de auditoria do card: quem moveu, atribuiu ou concluiu, e quando.</summary>
public class WorkItemEvent
{
    public int Id { get; set; }
    public int WorkItemId { get; set; }
    public int? UserId { get; set; }
    // created | status | assignee | priority | sprint | blocked | comment | checklist
    public string Kind { get; set; } = "";
    public string FromValue { get; set; } = "";
    public string ToValue { get; set; } = "";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Catálogo de tipos de lançamento. É dado, não enum: a economia (gold por hora),
/// o atalho de lançamento rápido e a meta diária saem daqui, então dá para ajustar
/// balanceamento sem recompilar.
/// </summary>
public class ActivityType
{
    public int Id { get; set; }
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Icon { get; set; } = "";
    public string Color { get; set; } = "#7c5cff";
    public int GoldPerHour { get; set; }
    /// <summary>Lançamento exige um card do kanban (ex.: desenvolvimento sim, estudo não).</summary>
    public bool RequiresWorkItem { get; set; }
    /// <summary>Duração sugerida no botão de lançamento rápido (minutos).</summary>
    public int DefaultMinutes { get; set; } = 60;
    /// <summary>Meta diária em minutos; 0 = sem meta.</summary>
    public int DailyTargetMinutes { get; set; }
    /// <summary>Entra no total da jornada (pausa e café, por exemplo, não entrariam).</summary>
    public bool CountsAsWork { get; set; } = true;
    /// <summary>Permite apontar a dupla (pair programming).</summary>
    public bool AllowsPair { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

public class TimeEntry
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int? WorkItemId { get; set; }
    /// <summary>Chave de <see cref="ActivityType"/>. Mantém o nome antigo por compatibilidade dos dados.</summary>
    public string Category { get; set; } = "task";
    public string Note { get; set; } = "";
    public DateTime StartUtc { get; set; }
    public DateTime? EndUtc { get; set; }
    // timer | manual | game
    public string Source { get; set; } = "manual";
    /// <summary>Dupla do pair programming — rende o lançamento espelhado para os dois.</summary>
    public int? PairUserId { get; set; }
    // Recompensa concedida por este lançamento: apagar o lançamento devolve exatamente isto.
    public int GoldAwarded { get; set; }
}

/// <summary>
/// Livro-caixa de tudo que o jogo dá de moeda. Toda concessão passa por aqui com um
/// `Source` (time | workitem | objective | presence | grant | chest), e é por ele que
/// o teto diário sabe o que limitar e que a auditoria sabe de onde veio o dinheiro.
///
/// Linhas de valor zero são MARCADORES de idempotência ("já dei este baú?"), não
/// renda — ver <see cref="Lootboxes.GrantOnceAsync"/>.
/// </summary>
public class CoinEvent
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int Gold { get; set; }
    public string Reason { get; set; } = "";
    public string Source { get; set; } = "";
    public DateTime CreatedUtc { get; set; }
}

/// <summary>Definição de objetivo (diário ou semanal). Progresso vive em <see cref="ObjectiveProgress"/>.</summary>
public class Objective
{
    public int Id { get; set; }
    public string Key { get; set; } = "";
    public string Name { get; set; } = "";
    public string Description { get; set; } = "";
    public string Icon { get; set; } = "🎯";
    public ObjectiveScope Scope { get; set; }
    /// <summary>minutes | entries | tasks_done | active_days</summary>
    public string Metric { get; set; } = "minutes";
    /// <summary>Restringe a métrica a um tipo de lançamento; vazio = todos os que contam como trabalho.</summary>
    public string ActivityKey { get; set; } = "";
    public int Target { get; set; }
    public int GoldReward { get; set; }
    public int SortOrder { get; set; }
    public bool IsActive { get; set; } = true;
}

/// <summary>
/// Uma linha por usuário/objetivo/período. O período é a data-âncora em UTC
/// (o dia, ou a segunda-feira da semana), o que torna a concessão idempotente.
/// </summary>
public class ObjectiveProgress
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int ObjectiveId { get; set; }
    public DateTime PeriodStart { get; set; }
    public int Value { get; set; }
    public DateTime? CompletedUtc { get; set; }
    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Presença do usuário num dia local. Uma linha por (usuário, dia). Serve a duas
/// coisas: os objetivos de login (existe linha hoje? em quantos dias da semana?)
/// e o gold por tempo online, que acumula minutos e paga até o teto diário — sem
/// exigir que a pessoa esteja fazendo atividade.
/// </summary>
public class PresenceDay
{
    public int Id { get; set; }
    public int UserId { get; set; }
    /// <summary>Data-âncora em UTC (início do dia local), como em ObjectiveProgress.</summary>
    public DateTime PeriodDay { get; set; }
    public int MinutesOnline { get; set; }
    public int GoldAwarded { get; set; }

    /// <summary>
    /// Minutos do dia em que a pessoa esteve COM alguém — em reunião ou pareando.
    /// Contador separado do tempo online porque paga por uma régua própria e tem teto
    /// próprio: o jogo quer distinguir "estava aqui" de "estava junto".
    /// </summary>
    public int TeamworkMinutes { get; set; }
    public int TeamworkGoldAwarded { get; set; }

    public DateTime FirstSeenUtc { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
}

public class ItemDefinition
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public ItemKind Kind { get; set; }
    public Rarity Rarity { get; set; }
    public string Icon { get; set; } = "";
    // Skin: json {"shirt":"#hex","hair":"#hex"} — Furniture/Medal: sem dados extras
    public string Data { get; set; } = "";
}

public class InventoryItem
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int ItemDefinitionId { get; set; }
    public bool Equipped { get; set; }
    public DateTime AcquiredUtc { get; set; }
}

public class RoomItem
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int ItemDefinitionId { get; set; }
    public int X { get; set; }
    public int Y { get; set; }
}

// Inventário do cliente Phaser. As tabelas antigas acima continuam atendendo o
// protótipo/backoffice; estas entidades modelam cada unidade física de um item.
public class GameItemDefinition
{
    public int Id { get; set; }
    public string CatalogKey { get; set; } = "";
    public string Name { get; set; } = "";
    public string Category { get; set; } = "";
    public string IconPath { get; set; } = "";
    public string InteractionType { get; set; } = "";
    // furniture | vehicle | equipment. O catálogo é compartilhado pela economia do Phaser.
    public string ItemType { get; set; } = "furniture";
    public string Rarity { get; set; } = "common";
    public int Price { get; set; }
    public bool IsPurchasable { get; set; }
    /// <summary>
    /// Quantas unidades um jogador pode comprar por semana. 0 = sem teto, que é o
    /// caso de todo móvel e equipamento — a raridade deles já mora no preço.
    /// </summary>
    public int WeeklyPurchaseLimit { get; set; }
    public int StarterQuantity { get; set; }
    // Capacidades desacoplam regra de negócio do asset visual (ex.: ["kanban","wall-mounted"]).
    public string CapabilitiesJson { get; set; } = "[]";
}

/// <summary>
/// Quanto de um item o jogador já levou na semana corrente. Uma linha por
/// usuário/item/semana: é ela que torna o teto verificável dentro da transação
/// da compra, em vez de recontar o histórico a cada clique.
/// </summary>
public class StorePurchaseQuota
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int DefinitionId { get; set; }
    /// <summary>Segunda-feira local da semana, em UTC (<see cref="Periods.WeekStart"/>).</summary>
    public DateTime PeriodStart { get; set; }
    public int Quantity { get; set; }
}

public class GameItemInstance
{
    public int Id { get; set; }
    public string InstanceKey { get; set; } = Guid.NewGuid().ToString("N");
    public int UserId { get; set; }
    public int DefinitionId { get; set; }
    // inventory | placed | chest | equipped
    public string Location { get; set; } = "inventory";
    /// <summary>
    /// Slot em que a unidade está vestida (<see cref="EquipmentCatalog.Slots"/>), ou
    /// vazio. O loadout vive AQUI, e não no localStorage do cliente, porque a partir
    /// da v2 o que está equipado muda quanto o jogo paga — e efeito que o cliente
    /// declara sozinho é efeito que o cliente inventa.
    /// </summary>
    public string EquippedSlot { get; set; } = "";
    public int? ContainerPlacementId { get; set; }
    public DateTime AcquiredUtc { get; set; } = DateTime.UtcNow;
    public string StateJson { get; set; } = "{}";

    /// <summary>
    /// Posição da unidade na bag, escolhida pelo jogador arrastando o card. Zero é
    /// "nunca movida", e aí vale a ordenação natural (slot, raridade, nome).
    /// </summary>
    public int BagOrder { get; set; }
}

public class FurniturePlacement
{
    public int Id { get; set; }
    public int ItemInstanceId { get; set; }
    public int UserId { get; set; }
    public string SceneId { get; set; } = "";
    public string RoomId { get; set; } = "";
    public double X { get; set; }
    public double Y { get; set; }
    public bool FlipX { get; set; }
    public string StateJson { get; set; } = "{}";
}

/// <summary>
/// Uma sala pessoal ocupa um slot estável numa ala pública modular.
/// RoomKey não expõe o id sequencial do usuário e isola mobília/voz dentro do cômodo.
/// </summary>
public class PersonalRoom
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string RoomKey { get; set; } = Guid.NewGuid().ToString("N")[..12];
    public int WingIndex { get; set; }
    public int SlotIndex { get; set; }
    public string SceneTemplate { get; set; } = "personal-wing";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>Progressão persistente do cardgame. Criada no primeiro acesso com três boosters.</summary>
public class CardGameProfile
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int BoosterCount { get; set; } = 3;
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// O baralho de uma liga. Cada jogador tem até um por liga de
/// <see cref="CardGameLeagues"/>, e é uma LINHA por liga em vez de quatro colunas
/// no perfil justamente porque liga é dado do catálogo de regras: criar a quinta
/// liga não pode custar uma migration.
/// </summary>
public class CardGameDeck
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string LeagueId { get; set; } = "";
    /// <summary>Os quinze tokens (`cardId` ou `cardId~lado` para shiny).</summary>
    public string CardsJson { get; set; } = "[]";
    public DateTime UpdatedUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Entrada do álbum. A versão shiny é uma descoberta separada, mas usa a mesma
/// definição-base da carta para manter o catálogo pequeno e orientado a dados.
/// </summary>
public class CardGameCollectionItem
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string CardId { get; set; } = "";
    public bool IsShiny { get; set; }
    /// <summary>top/right/bottom/left para shiny; vazio para carta normal.</summary>
    public string ShinyBonusSide { get; set; } = "";
    public int Quantity { get; set; } = 1;
    public DateTime FirstAcquiredUtc { get; set; } = DateTime.UtcNow;
}

/// <summary>
/// Saldo de um tipo de booster. TargetCardId só é preenchido no booster especial
/// obtido ao entregar dez cópias normais da mesma carta.
/// </summary>
public class CardGameBoosterBalance
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public string BoosterId { get; set; } = "";
    public string TargetCardId { get; set; } = "";
    public int Quantity { get; set; }
}
