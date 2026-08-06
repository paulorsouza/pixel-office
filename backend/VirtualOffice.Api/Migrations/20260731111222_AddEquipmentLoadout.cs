using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace VirtualOffice.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddEquipmentLoadout : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "EquippedSlot",
                table: "GameItemInstances",
                type: "text",
                nullable: false,
                defaultValue: "");

            migrationBuilder.CreateIndex(
                name: "IX_GameItemInstances_UserId_EquippedSlot",
                table: "GameItemInstances",
                columns: new[] { "UserId", "EquippedSlot" },
                unique: true,
                filter: "\"EquippedSlot\" <> ''");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_GameItemInstances_UserId_EquippedSlot",
                table: "GameItemInstances");

            migrationBuilder.DropColumn(
                name: "EquippedSlot",
                table: "GameItemInstances");
        }
    }
}
