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
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""AtId""       TEXT          NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Bc""         TEXT          NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Contratto""  TEXT          NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""OrdinatoBdo"" NUMERIC(18,2) NOT NULL DEFAULT 0;
                CREATE TABLE IF NOT EXISTS ""Contratti"" (
                    ""Id""            INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
                    ""RifContratto""  TEXT NOT NULL DEFAULT '',
                    ""TipoContratto"" TEXT NOT NULL DEFAULT '',
                    ""Data""          TEXT NULL,
                    ""ImpLordo""      NUMERIC(18,2) NOT NULL DEFAULT 0,
                    ""Sconto""        NUMERIC(18,2) NOT NULL DEFAULT 0,
                    ""ImportoNetto""  NUMERIC(18,2) NOT NULL DEFAULT 0,
                    ""Ordinato""      NUMERIC(18,2) NOT NULL DEFAULT 0,
                    ""DaOrdinare""    NUMERIC(18,2) NOT NULL DEFAULT 0,
                    ""Avanzato""      NUMERIC(18,2) NOT NULL DEFAULT 0,
                    ""DaAvanzare""    NUMERIC(18,2) NOT NULL DEFAULT 0
                );
            ");
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
