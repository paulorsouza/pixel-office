using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <inheritdoc />
    public partial class ExpandCardGameCollectionAndBoosters : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CardGameCollection_UserId_CardId_IsShiny",
                table: "CardGameCollection");

            migrationBuilder.AddColumn<string>(
                name: "ShinyBonusSide",
                table: "CardGameCollection",
                type: "text",
                nullable: false,
                defaultValue: "");

            // Shinies antigos não guardavam o lado bonificado. Distribui os quatro
            // lados de forma estável para preservar cada descoberta existente.
            migrationBuilder.Sql("""
                UPDATE "CardGameCollection"
                SET "ShinyBonusSide" = CASE MOD("Id", 4)
                    WHEN 0 THEN 'top'
                    WHEN 1 THEN 'right'
                    WHEN 2 THEN 'bottom'
                    ELSE 'left'
                END
                WHERE "IsShiny" = TRUE
                """);

            migrationBuilder.CreateTable(
                name: "CardGameBoosterBalances",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    BoosterId = table.Column<string>(type: "text", nullable: false),
                    TargetCardId = table.Column<string>(type: "text", nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardGameBoosterBalances", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CardGameCollection_UserId_CardId_IsShiny_ShinyBonusSide",
                table: "CardGameCollection",
                columns: new[] { "UserId", "CardId", "IsShiny", "ShinyBonusSide" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CardGameBoosterBalances_UserId_BoosterId_TargetCardId",
                table: "CardGameBoosterBalances",
                columns: new[] { "UserId", "BoosterId", "TargetCardId" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CardGameBoosterBalances");

            migrationBuilder.DropIndex(
                name: "IX_CardGameCollection_UserId_CardId_IsShiny_ShinyBonusSide",
                table: "CardGameCollection");

            migrationBuilder.DropColumn(
                name: "ShinyBonusSide",
                table: "CardGameCollection");

            migrationBuilder.CreateIndex(
                name: "IX_CardGameCollection_UserId_CardId_IsShiny",
                table: "CardGameCollection",
                columns: new[] { "UserId", "CardId", "IsShiny" },
                unique: true);
        }
    }
}
