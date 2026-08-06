using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <summary>
    /// Tira o XP do jogo e move o relógio de baú para dentro da unidade do item.
    ///
    /// ⚠️ Escrita À MÃO a partir do scaffold. O EF gerou `DropTable("XpEvents")` +
    /// `CreateTable("CoinEvents")`, o que jogaria fora o livro-caixa inteiro — e com ele
    /// os marcadores de idempotência que impedem baú repetido (`daily-objectives:…`,
    /// `work-hours:…`) e o do bônus de boas-vindas, que pagaria 10 mil moedas de novo
    /// para todo mundo do beta. A tabela é a MESMA: só perde a coluna `Amount` e muda
    /// de nome.
    /// </summary>
    public partial class RemoveXpAndPerItemChestTimer : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // O relógio por usuário virou um campo no StateJson de cada unidade, então a
            // tabela não tem mais dono. O saldo em curso se perde de propósito: ele era
            // do jogador, e agora pertence a um celular específico.
            migrationBuilder.DropTable(name: "EquipmentChestTimers");

            // ---- XpEvents -> CoinEvents, preservando as linhas ----
            migrationBuilder.DropIndex(
                name: "IX_XpEvents_UserId_CreatedUtc",
                table: "XpEvents");

            migrationBuilder.DropColumn(name: "Amount", table: "XpEvents");

            migrationBuilder.RenameTable(name: "XpEvents", newName: "CoinEvents");

            // O nome da PK não acompanha o RENAME TABLE no Postgres; sem isto o snapshot
            // do EF e o banco divergem na primeira migration que tocar a tabela.
            migrationBuilder.Sql(
                """ALTER TABLE "CoinEvents" RENAME CONSTRAINT "PK_XpEvents" TO "PK_CoinEvents";""");

            migrationBuilder.CreateIndex(
                name: "IX_CoinEvents_UserId_CreatedUtc",
                table: "CoinEvents",
                columns: new[] { "UserId", "CreatedUtc" });

            // ---- colunas de XP ----
            migrationBuilder.DropColumn(name: "Xp", table: "Users");
            migrationBuilder.DropColumn(name: "XpAwarded", table: "TimeEntries");
            migrationBuilder.DropColumn(name: "XpReward", table: "Objectives");
            migrationBuilder.DropColumn(name: "XpPerHour", table: "ActivityTypes");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_CoinEvents_UserId_CreatedUtc",
                table: "CoinEvents");

            migrationBuilder.Sql(
                """ALTER TABLE "CoinEvents" RENAME CONSTRAINT "PK_CoinEvents" TO "PK_XpEvents";""");

            migrationBuilder.RenameTable(name: "CoinEvents", newName: "XpEvents");

            migrationBuilder.AddColumn<int>(
                name: "Amount",
                table: "XpEvents",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.CreateIndex(
                name: "IX_XpEvents_UserId_CreatedUtc",
                table: "XpEvents",
                columns: new[] { "UserId", "CreatedUtc" });

            migrationBuilder.AddColumn<int>(
                name: "Xp", table: "Users", type: "integer", nullable: false, defaultValue: 0);
            migrationBuilder.AddColumn<int>(
                name: "XpAwarded", table: "TimeEntries", type: "integer", nullable: false, defaultValue: 0);
            migrationBuilder.AddColumn<int>(
                name: "XpReward", table: "Objectives", type: "integer", nullable: false, defaultValue: 0);
            migrationBuilder.AddColumn<int>(
                name: "XpPerHour", table: "ActivityTypes", type: "integer", nullable: false, defaultValue: 0);

            migrationBuilder.CreateTable(
                name: "EquipmentChestTimers",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    ChestsGranted = table.Column<int>(type: "integer", nullable: false),
                    LastGrantUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: true),
                    MinutesEquipped = table.Column<int>(type: "integer", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false),
                    UserId = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_EquipmentChestTimers", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_EquipmentChestTimers_UserId",
                table: "EquipmentChestTimers",
                column: "UserId",
                unique: true);
        }
    }
}
