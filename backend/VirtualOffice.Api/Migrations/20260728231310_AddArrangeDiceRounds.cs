using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddArrangeDiceRounds : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "CasinoRounds",
                columns: table => new
                {
                    Id = table.Column<long>(type: "bigint", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    GameId = table.Column<string>(type: "text", nullable: false),
                    RulesVersion = table.Column<string>(type: "text", nullable: false),
                    IdempotencyKey = table.Column<string>(type: "text", nullable: false),
                    Bet = table.Column<int>(type: "integer", nullable: false),
                    OutcomeJson = table.Column<string>(type: "text", nullable: false),
                    Payout = table.Column<int>(type: "integer", nullable: false),
                    BalanceBefore = table.Column<int>(type: "integer", nullable: false),
                    BalanceAfter = table.Column<int>(type: "integer", nullable: false),
                    CreatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CasinoRounds", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CasinoRounds_UserId_CreatedUtc",
                table: "CasinoRounds",
                columns: new[] { "UserId", "CreatedUtc" });

            migrationBuilder.CreateIndex(
                name: "IX_CasinoRounds_UserId_IdempotencyKey",
                table: "CasinoRounds",
                columns: new[] { "UserId", "IdempotencyKey" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "CasinoRounds");
        }
    }
}
