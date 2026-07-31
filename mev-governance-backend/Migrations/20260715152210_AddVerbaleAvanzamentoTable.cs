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
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ""VerbaliAvanzamento"" (
                    ""Id""               INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    ""NomePdf""          TEXT NOT NULL DEFAULT '',
                    ""MeseAvanzamento""  TEXT NOT NULL DEFAULT '',
                    ""RigheElaborate""   INTEGER NOT NULL DEFAULT 0,
                    ""RigheAggiornate""  INTEGER NOT NULL DEFAULT 0,
                    ""CaricatoIl""       TIMESTAMPTZ NOT NULL DEFAULT now(),
                    ""CaricatoDa""       TEXT NOT NULL DEFAULT ''
                );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "VerbaliAvanzamento");
        }
    }
}
