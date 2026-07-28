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
    public int Xp { get; set; }
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
/// Catálogo de tipos de lançamento. É dado, não enum: a economia (XP/gold por hora),
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
    public int XpPerHour { get; set; }
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
    public int XpAwarded { get; set; }
    public int GoldAwarded { get; set; }
}

public class XpEvent
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int Amount { get; set; }
    public int Gold { get; set; }
    public string Reason { get; set; } = "";
    // time | workitem | objective | grant | drop
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
    public int XpReward { get; set; }
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
    public int StarterQuantity { get; set; }
    // Capacidades desacoplam regra de negócio do asset visual (ex.: ["kanban","wall-mounted"]).
    public string CapabilitiesJson { get; set; } = "[]";
}

public class GameItemInstance
{
    public int Id { get; set; }
    public string InstanceKey { get; set; } = Guid.NewGuid().ToString("N");
    public int UserId { get; set; }
    public int DefinitionId { get; set; }
    // inventory | placed | chest
    public string Location { get; set; } = "inventory";
    public int? ContainerPlacementId { get; set; }
    public DateTime AcquiredUtc { get; set; } = DateTime.UtcNow;
    public string StateJson { get; set; } = "{}";
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
    public string DeckJson { get; set; } = "[]";
    public DateTime CreatedUtc { get; set; } = DateTime.UtcNow;
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
    public int Quantity { get; set; } = 1;
    public DateTime FirstAcquiredUtc { get; set; } = DateTime.UtcNow;
}
