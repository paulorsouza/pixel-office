namespace VirtualOffice.Api;

public enum WorkItemType { Task, Bug, Atendimento }
public enum WorkItemStatus { Backlog, Todo, InProgress, Review, Done }
public enum ItemKind { Skin, Furniture, Medal }
public enum Rarity { Common, Rare, Epic, Legendary }

public class User
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Role { get; set; } = "";
    public string Color { get; set; } = "#7c5cff";
    public int Xp { get; set; }
    public bool IsBot { get; set; }
    // task que o dev escolheu como "ativa" — o timer da mesa conta horas nela
    public int? ActiveWorkItemId { get; set; }
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
    public int? EpicId { get; set; }
    public int? SprintId { get; set; }
    public int? AssigneeId { get; set; }
    public double? EstimateHours { get; set; }
    public DateTime CreatedUtc { get; set; }
    public DateTime? DoneUtc { get; set; }
}

public class TimeEntry
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int? WorkItemId { get; set; }
    // "task" | "reuniao" | "outro"
    public string Category { get; set; } = "task";
    public string Note { get; set; } = "";
    public DateTime StartUtc { get; set; }
    public DateTime? EndUtc { get; set; }
}

public class XpEvent
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int Amount { get; set; }
    public string Reason { get; set; } = "";
    public DateTime CreatedUtc { get; set; }
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
