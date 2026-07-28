using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCardGameCollection : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CardGameCollection",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    CardId = table.Column<string>(type: "text", nullable: false),
                    IsShiny = table.Column<bool>(type: "boolean", nullable: false),
                    Quantity = table.Column<int>(type: "integer", nullable: false),
                    FirstAcquiredUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardGameCollection", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "CardGameProfiles",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    BoosterCount = table.Column<int>(type: "integer", nullable: false),
                    DeckJson = table.Column<string>(type: "text", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardGameProfiles", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CardGameCollection_UserId_CardId_IsShiny",
                table: "CardGameCollection",
                columns: new[] { "UserId", "CardId", "IsShiny" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_CardGameProfiles_UserId",
                table: "CardGameProfiles",
                column: "UserId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CardGameCollection");

            migrationBuilder.DropTable(
                name: "CardGameProfiles");
        }
    }
}
