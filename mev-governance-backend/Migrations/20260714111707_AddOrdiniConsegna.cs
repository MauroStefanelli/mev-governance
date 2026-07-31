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
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ""OrdiniConsegna"" (
                    ""Id""            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    ""NumeroOrdine""  TEXT NOT NULL DEFAULT '',
                    ""Data""          TEXT NOT NULL DEFAULT '',
                    ""DataConsegna""  TEXT NOT NULL DEFAULT '',
                    ""RifContratto""  TEXT NOT NULL DEFAULT '',
                    ""Art""           TEXT NOT NULL DEFAULT '',
                    ""Codice""        TEXT NOT NULL DEFAULT '',
                    ""Descrizione""   TEXT NOT NULL DEFAULT '',
                    ""TipoAtt""       TEXT NOT NULL DEFAULT '',
                    ""Quantita""      TEXT NOT NULL DEFAULT '',
                    ""Um""            TEXT NOT NULL DEFAULT '',
                    ""PrezzoNetto""   TEXT NOT NULL DEFAULT '',
                    ""Importo""       TEXT NOT NULL DEFAULT '',
                    ""NumeroRda""     TEXT NOT NULL DEFAULT '',
                    ""Iniziativa""    TEXT NOT NULL DEFAULT '',
                    ""Ap""            TEXT NOT NULL DEFAULT '',
                    ""Contratto""     TEXT NOT NULL DEFAULT '',
                    ""NomePdf""       TEXT NOT NULL DEFAULT '',
                    ""ImportatoIl""   TIMESTAMPTZ NOT NULL DEFAULT now(),
                    ""ImportatoDA""   TEXT NOT NULL DEFAULT ''
                );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "OrdiniConsegna");
        }
    }
}
