using Microsoft.EntityFrameworkCore;

namespace VirtualOffice.Api;

public class AppDb(DbContextOptions<AppDb> options) : DbContext(options)
{
    public DbSet<User> Users => Set<User>();
    public DbSet<Epic> Epics => Set<Epic>();
    public DbSet<Sprint> Sprints => Set<Sprint>();
    public DbSet<WorkItem> WorkItems => Set<WorkItem>();
    public DbSet<TimeEntry> TimeEntries => Set<TimeEntry>();
    public DbSet<CoinEvent> CoinEvents => Set<CoinEvent>();
    public DbSet<ItemDefinition> ItemDefinitions => Set<ItemDefinition>();
    public DbSet<InventoryItem> Inventory => Set<InventoryItem>();
    public DbSet<RoomItem> RoomItems => Set<RoomItem>();
    public DbSet<GameItemDefinition> GameItemDefinitions => Set<GameItemDefinition>();
    public DbSet<GameItemInstance> GameItemInstances => Set<GameItemInstance>();
    public DbSet<FurniturePlacement> FurniturePlacements => Set<FurniturePlacement>();
    public DbSet<PersonalRoom> PersonalRooms => Set<PersonalRoom>();
    public DbSet<GoogleCredential> GoogleCredentials => Set<GoogleCredential>();
    public DbSet<AppRefreshToken> AppRefreshTokens => Set<AppRefreshToken>();
    public DbSet<Label> Labels => Set<Label>();
    public DbSet<WorkItemLabel> WorkItemLabels => Set<WorkItemLabel>();
    public DbSet<WorkItemComment> WorkItemComments => Set<WorkItemComment>();
    public DbSet<ChecklistItem> ChecklistItems => Set<ChecklistItem>();
    public DbSet<WorkItemEvent> WorkItemEvents => Set<WorkItemEvent>();
    public DbSet<ActivityType> ActivityTypes => Set<ActivityType>();
    public DbSet<Objective> Objectives => Set<Objective>();
    public DbSet<ObjectiveProgress> ObjectiveProgress => Set<ObjectiveProgress>();
    public DbSet<CardGameProfile> CardGameProfiles => Set<CardGameProfile>();
    public DbSet<CardGameCollectionItem> CardGameCollection => Set<CardGameCollectionItem>();
    public DbSet<CardGameDeck> CardGameDecks => Set<CardGameDeck>();
    public DbSet<CardGameBoosterBalance> CardGameBoosterBalances => Set<CardGameBoosterBalance>();
    public DbSet<CasinoRound> CasinoRounds => Set<CasinoRound>();
    public DbSet<PresenceDay> PresenceDays => Set<PresenceDay>();
    public DbSet<StorePurchaseQuota> StorePurchaseQuotas => Set<StorePurchaseQuota>();
    public DbSet<ChatMessage> ChatMessages => Set<ChatMessage>();
    public DbSet<ChatRead> ChatReads => Set<ChatRead>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WorkItemLabel>().HasKey(x => new { x.WorkItemId, x.LabelId });
        modelBuilder.Entity<Label>().HasIndex(x => x.Name).IsUnique();
        modelBuilder.Entity<WorkItemComment>().HasIndex(x => x.WorkItemId);
        modelBuilder.Entity<ChecklistItem>().HasIndex(x => x.WorkItemId);
        modelBuilder.Entity<WorkItemEvent>().HasIndex(x => x.WorkItemId);
        modelBuilder.Entity<WorkItem>().HasIndex(x => new { x.Status, x.BoardOrder });
        modelBuilder.Entity<ActivityType>().HasIndex(x => x.Key).IsUnique();
        modelBuilder.Entity<Objective>().HasIndex(x => x.Key).IsUnique();
        // Uma linha por usuário/objetivo/período: é o que torna a concessão idempotente.
        modelBuilder.Entity<ObjectiveProgress>()
            .HasIndex(x => new { x.UserId, x.ObjectiveId, x.PeriodStart }).IsUnique();
        modelBuilder.Entity<PresenceDay>().HasIndex(x => new { x.UserId, x.PeriodDay }).IsUnique();
        modelBuilder.Entity<CardGameProfile>().HasIndex(x => x.UserId).IsUnique();
        modelBuilder.Entity<CardGameCollectionItem>()
            .HasIndex(x => new { x.UserId, x.CardId, x.IsShiny, x.ShinyBonusSide }).IsUnique();
        modelBuilder.Entity<CardGameBoosterBalance>()
            .HasIndex(x => new { x.UserId, x.BoosterId, x.TargetCardId }).IsUnique();
        // Um baralho por liga: a unicidade é o que deixa o "salvar" ser um upsert
        // sem risco de o mesmo jogador acabar com dois baralhos da mesma liga.
        modelBuilder.Entity<CardGameDeck>()
            .HasIndex(x => new { x.UserId, x.LeagueId }).IsUnique();
        // Mesma forma do ObjectiveProgress: a unicidade por período é o que impede
        // dois cliques simultâneos de abrirem duas cotas e furarem o teto.
        modelBuilder.Entity<StorePurchaseQuota>()
            .HasIndex(x => new { x.UserId, x.DefinitionId, x.PeriodStart }).IsUnique();
        modelBuilder.Entity<CasinoRound>()
            .HasIndex(x => new { x.UserId, x.IdempotencyKey }).IsUnique();
        modelBuilder.Entity<CasinoRound>()
            .HasIndex(x => new { x.UserId, x.CreatedUtc });
        modelBuilder.Entity<TimeEntry>().HasIndex(x => new { x.UserId, x.StartUtc });
        modelBuilder.Entity<CoinEvent>().HasIndex(x => new { x.UserId, x.CreatedUtc });
        modelBuilder.Entity<GameItemDefinition>().HasIndex(x => x.CatalogKey).IsUnique();
        modelBuilder.Entity<GameItemInstance>().HasIndex(x => x.InstanceKey).IsUnique();
        // Um item por slot é INVARIANTE, não regra de aplicação: sem o índice parcial,
        // dois PUT simultâneos no mesmo slot deixam o loadout com dois mouses.
        modelBuilder.Entity<GameItemInstance>()
            .HasIndex(x => new { x.UserId, x.EquippedSlot })
            .IsUnique()
            .HasFilter("\"EquippedSlot\" <> ''");
        modelBuilder.Entity<FurniturePlacement>().HasIndex(x => x.ItemInstanceId).IsUnique();
        modelBuilder.Entity<FurniturePlacement>()
            .HasIndex(x => new { x.SceneId, x.RoomId });
        modelBuilder.Entity<PersonalRoom>().HasIndex(x => x.UserId).IsUnique();
        modelBuilder.Entity<PersonalRoom>().HasIndex(x => x.RoomKey).IsUnique();
        modelBuilder.Entity<PersonalRoom>().HasIndex(x => new { x.WingIndex, x.SlotIndex }).IsUnique();
        // Toda leitura de chat é "as últimas N deste canal": o índice composto é o
        // que impede a paginação de virar varredura da tabela inteira.
        modelBuilder.Entity<ChatMessage>().HasIndex(x => new { x.Channel, x.Id });
        // Uma marca de leitura por usuário/canal — é o que torna o upsert seguro
        // com duas janelas abertas na mesma conversa.
        modelBuilder.Entity<ChatRead>().HasIndex(x => new { x.UserId, x.Channel }).IsUnique();
        modelBuilder.Entity<User>().HasIndex(x => x.GoogleSubject);
        // Username é único entre quem tem login local; nulos (bots/seed) não colidem.
        modelBuilder.Entity<User>().HasIndex(x => x.Username).IsUnique();
        modelBuilder.Entity<GoogleCredential>().HasIndex(x => x.UserId).IsUnique();
        modelBuilder.Entity<AppRefreshToken>().HasIndex(x => x.TokenHash);
    }
}
