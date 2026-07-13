using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddLogoutMinutesToAppSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "CollaudoApprovato",
                table: "ConsumoTow",
                type: "TEXT",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CollaudoFatturato",
                table: "ConsumoTow",
                type: "TEXT",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<decimal>(
                name: "CollaudoOrdinato",
                table: "ConsumoTow",
                type: "TEXT",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<int>(
                name: "LogoutMinutes",
                table: "AppSettings",
                type: "INTEGER",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CollaudoApprovato",
                table: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "CollaudoFatturato",
                table: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "CollaudoOrdinato",
                table: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "LogoutMinutes",
                table: "AppSettings");
        }
    }
}
