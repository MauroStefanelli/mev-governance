using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddRtiSocietaRighe : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "RtiSocietaRighe",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    AmbienteId = table.Column<int>(type: "INTEGER", nullable: false),
                    Contratto = table.Column<string>(type: "TEXT", nullable: false),
                    Ruolo = table.Column<string>(type: "TEXT", nullable: false),
                    Societa = table.Column<string>(type: "TEXT", nullable: false),
                    DataInizio = table.Column<DateTime>(type: "TEXT", nullable: true),
                    DataApprovazione = table.Column<DateTime>(type: "TEXT", nullable: true),
                    Percentuale = table.Column<decimal>(type: "TEXT", nullable: true),
                    Importo = table.Column<decimal>(type: "TEXT", nullable: true),
                    Consumato = table.Column<decimal>(type: "TEXT", nullable: true),
                    Ordine = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_RtiSocietaRighe", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "RtiSocietaRighe");
        }
    }
}
