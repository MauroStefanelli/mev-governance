using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddOrdiniConsegna : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "OrdiniConsegna",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    NumeroOrdine = table.Column<string>(type: "TEXT", nullable: false),
                    Data = table.Column<string>(type: "TEXT", nullable: false),
                    DataConsegna = table.Column<string>(type: "TEXT", nullable: false),
                    RifContratto = table.Column<string>(type: "TEXT", nullable: false),
                    Art = table.Column<string>(type: "TEXT", nullable: false),
                    Codice = table.Column<string>(type: "TEXT", nullable: false),
                    Descrizione = table.Column<string>(type: "TEXT", nullable: false),
                    TipoAtt = table.Column<string>(type: "TEXT", nullable: false),
                    Quantita = table.Column<string>(type: "TEXT", nullable: false),
                    Um = table.Column<string>(type: "TEXT", nullable: false),
                    PrezzoNetto = table.Column<string>(type: "TEXT", nullable: false),
                    Importo = table.Column<string>(type: "TEXT", nullable: false),
                    NumeroRda = table.Column<string>(type: "TEXT", nullable: false),
                    Iniziativa = table.Column<string>(type: "TEXT", nullable: false),
                    Ap = table.Column<string>(type: "TEXT", nullable: false),
                    Contratto = table.Column<string>(type: "TEXT", nullable: false),
                    NomePdf = table.Column<string>(type: "TEXT", nullable: false),
                    ImportatoIl = table.Column<DateTime>(type: "TEXT", nullable: false),
                    ImportatoDA = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_OrdiniConsegna", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrdiniConsegna");
        }
    }
}
