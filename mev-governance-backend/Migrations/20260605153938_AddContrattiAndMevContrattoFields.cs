using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddContrattiAndMevContrattoFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AtId",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Bc",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Contratto",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "OrdinatoBdo",
                table: "MevItems",
                type: "NUMERIC(18,2)",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.CreateTable(
                name: "Contratti",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    RifContratto = table.Column<string>(type: "TEXT", nullable: false),
                    TipoContratto = table.Column<string>(type: "TEXT", nullable: false),
                    Data = table.Column<string>(type: "TEXT", nullable: true),
                    ImpLordo = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    Sconto = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    ImportoNetto = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    Ordinato = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    DaOrdinare = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    Avanzato = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    DaAvanzare = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Contratti", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Contratti");

            migrationBuilder.DropColumn(
                name: "AtId",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Bc",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Contratto",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "OrdinatoBdo",
                table: "MevItems");
        }
    }
}
