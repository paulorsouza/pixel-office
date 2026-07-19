using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Epic> Epics => Set<Epic>();
    public DbSet<Sprint> Sprints => Set<Sprint>();
    public DbSet<WorkItem> WorkItems => Set<WorkItem>();
    public DbSet<TimeEntry> TimeEntries => Set<TimeEntry>();
    public DbSet<XpEvent> XpEvents => Set<XpEvent>();
    public DbSet<ItemDefinition> ItemDefinitions => Set<ItemDefinition>();
    public DbSet<InventoryItem> Inventory => Set<InventoryItem>();
    public DbSet<RoomItem> RoomItems => Set<RoomItem>();
    public DbSet<GameItemDefinition> GameItemDefinitions => Set<GameItemDefinition>();
    public DbSet<GameItemInstance> GameItemInstances => Set<GameItemInstance>();
    public DbSet<FurniturePlacement> FurniturePlacements => Set<FurniturePlacement>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<GameItemDefinition>().HasIndex(x => x.CatalogKey).IsUnique();
        modelBuilder.Entity<GameItemInstance>().HasIndex(x => x.InstanceKey).IsUnique();
        modelBuilder.Entity<FurniturePlacement>().HasIndex(x => x.ItemInstanceId).IsUnique();
        modelBuilder.Entity<FurniturePlacement>()
            .HasIndex(x => new { x.SceneId, x.RoomId });
    }
}
