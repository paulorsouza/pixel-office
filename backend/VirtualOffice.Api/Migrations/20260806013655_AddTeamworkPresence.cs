using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddTeamworkPresence : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "TeamworkGoldAwarded",
                table: "PresenceDays",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "TeamworkMinutes",
                table: "PresenceDays",
                type: "integer",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TeamworkGoldAwarded",
                table: "PresenceDays");

            migrationBuilder.DropColumn(
                name: "TeamworkMinutes",
                table: "PresenceDays");
        }
    }
}
