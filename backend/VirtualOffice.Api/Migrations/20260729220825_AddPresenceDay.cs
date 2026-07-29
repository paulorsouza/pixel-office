using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddPresenceDay : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PresenceDays",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    PeriodDay = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    MinutesOnline = table.Column<int>(type: "integer", nullable: false),
                    GoldAwarded = table.Column<int>(type: "integer", nullable: false),
                    FirstSeenUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PresenceDays", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PresenceDays_UserId_PeriodDay",
                table: "PresenceDays",
                columns: new[] { "UserId", "PeriodDay" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PresenceDays");
        }
    }
}
