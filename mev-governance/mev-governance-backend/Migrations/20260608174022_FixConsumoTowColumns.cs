using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class FixConsumoTowColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Ricrea la tabella ConsumoTow con la struttura corretta su PostgreSQL
            migrationBuilder.Sql(@"
DO $$
BEGIN
    DROP TABLE IF EXISTS ""ConsumoTow"";
    CREATE TABLE ""ConsumoTow"" (
        ""Id""             SERIAL          PRIMARY KEY,
        ""Tow""            TEXT            NOT NULL DEFAULT '',
        ""TowContratto""   TEXT            NULL,
        ""ValoreUnitario"" NUMERIC(18,2)   NOT NULL DEFAULT 0,
        ""ValoreTotale""   NUMERIC(18,2)   NOT NULL DEFAULT 0,
        ""Approvato""      NUMERIC(18,2)   NOT NULL DEFAULT 0,
        ""OrdinatiRda""    NUMERIC(18,2)   NOT NULL DEFAULT 0,
        ""Impegnato""      NUMERIC(18,2)   NOT NULL DEFAULT 0,
        ""Residuo""        NUMERIC(18,2)   NOT NULL DEFAULT 0
    );
END
$$;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP TABLE IF EXISTS ""ConsumoTow"";");
        }
    }
}
