using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddConsumoTowAndAppSettingsAndRda : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Rda",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "AppSettings",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    LastAlignAt = table.Column<DateTime>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppSettings", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "ConsumoTow",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Voce = table.Column<string>(type: "TEXT", nullable: false),
                    ValoreTotale = table.Column<decimal>(type: "TEXT", nullable: false),
                    Approvato = table.Column<decimal>(type: "TEXT", nullable: false),
                    OrdinatiRda = table.Column<decimal>(type: "TEXT", nullable: false),
                    Impegnato = table.Column<decimal>(type: "TEXT", nullable: false),
                    Residuo = table.Column<decimal>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_ConsumoTow", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppSettings");

            migrationBuilder.DropTable(
                name: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "Rda",
                table: "MevItems");
        }
    }
}
