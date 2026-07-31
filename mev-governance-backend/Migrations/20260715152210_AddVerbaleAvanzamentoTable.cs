using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddVerbaleAvanzamentoTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "VerbaliAvanzamento",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    NomePdf = table.Column<string>(type: "TEXT", nullable: false),
                    MeseAvanzamento = table.Column<string>(type: "TEXT", nullable: false),
                    RigheElaborate = table.Column<int>(type: "INTEGER", nullable: false),
                    RigheAggiornate = table.Column<int>(type: "INTEGER", nullable: false),
                    CaricatoIl = table.Column<DateTime>(type: "TEXT", nullable: false),
                    CaricatoDa = table.Column<string>(type: "TEXT", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_VerbaliAvanzamento", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VerbaliAvanzamento");
        }
    }
}
