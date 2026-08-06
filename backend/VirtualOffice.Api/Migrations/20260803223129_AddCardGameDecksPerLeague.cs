using System;
using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddCardGameDecksPerLeague : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // A ORDEM importa: o scaffold queria derrubar `DeckJson` ANTES de criar a
            // tabela nova, e aí o baralho de todo mundo ia junto. Cria, copia, e só
            // então derruba a coluna.
            migrationBuilder.CreateTable(
                name: "CardGameDecks",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    UserId = table.Column<int>(type: "integer", nullable: false),
                    LeagueId = table.Column<string>(type: "text", nullable: false),
                    CardsJson = table.Column<string>(type: "text", nullable: false),
                    UpdatedUtc = table.Column<DateTime>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_CardGameDecks", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_CardGameDecks_UserId_LeagueId",
                table: "CardGameDecks",
                columns: new[] { "UserId", "LeagueId" },
                unique: true);

            // O baralho único de antes vira o da Master: é a liga sem teto, a única
            // que aceita qualquer baralho legal sem risco de nascer inválido. As
            // outras três começam vazias, para a pessoa montar.
            migrationBuilder.Sql("""
                INSERT INTO "CardGameDecks" ("UserId", "LeagueId", "CardsJson", "UpdatedUtc")
                SELECT "UserId", 'master', "DeckJson", now()
                FROM "CardGameProfiles"
                WHERE "DeckJson" IS NOT NULL AND "DeckJson" NOT IN ('', '[]');
                """);

            migrationBuilder.DropColumn(
                name: "DeckJson",
                table: "CardGameProfiles");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "DeckJson",
                table: "CardGameProfiles",
                type: "text",
                nullable: false,
                defaultValue: "[]");

            // Volta o baralho da Master para a coluna antiga; os das outras ligas
            // não têm para onde ir e são perdidos de propósito — a coluna é uma só.
            migrationBuilder.Sql("""
                UPDATE "CardGameProfiles" AS p
                SET "DeckJson" = d."CardsJson"
                FROM "CardGameDecks" AS d
                WHERE d."UserId" = p."UserId" AND d."LeagueId" = 'master';
                """);

            migrationBuilder.DropTable(
                name: "CardGameDecks");
        }
    }
}
