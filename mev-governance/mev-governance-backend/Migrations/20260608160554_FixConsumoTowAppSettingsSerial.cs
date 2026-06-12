using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Infrastructure;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class FixConsumoTowAppSettingsSerial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Su PostgreSQL la migration precedente ha creato Id come INTEGER NOT NULL
            // senza SERIAL/sequence. Ricreaiamo le tabelle con la struttura corretta.
            // Usiamo IF EXISTS / IF NOT EXISTS per rendere il fix idempotente.

            migrationBuilder.Sql(@"
DO $$
BEGIN
    -- ── Fix ConsumoTow ──────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ConsumoTow') THEN
        -- Verifica se Id ha già una sequence (SERIAL)
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'ConsumoTow'
              AND column_name = 'Id'
              AND column_default LIKE 'nextval%'
        ) THEN
            -- Ricrea la tabella con SERIAL
            DROP TABLE ""ConsumoTow"";
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ConsumoTow') THEN
        CREATE TABLE ""ConsumoTow"" (
            ""Id""           SERIAL          PRIMARY KEY,
            ""Voce""         TEXT            NOT NULL DEFAULT '',
            ""ValoreTotale"" NUMERIC(18,2)   NOT NULL DEFAULT 0,
            ""Approvato""    NUMERIC(18,2)   NOT NULL DEFAULT 0,
            ""OrdinatiRda""  NUMERIC(18,2)   NOT NULL DEFAULT 0,
            ""Impegnato""    NUMERIC(18,2)   NOT NULL DEFAULT 0,
            ""Residuo""      NUMERIC(18,2)   NOT NULL DEFAULT 0
        );
    END IF;

    -- ── Fix AppSettings ─────────────────────────────────────────
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AppSettings') THEN
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_name = 'AppSettings'
              AND column_name = 'Id'
              AND column_default LIKE 'nextval%'
        ) THEN
            DROP TABLE ""AppSettings"";
        END IF;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'AppSettings') THEN
        CREATE TABLE ""AppSettings"" (
            ""Id""          SERIAL      PRIMARY KEY,
            ""LastAlignAt"" TIMESTAMPTZ NULL
        );
    END IF;

END
$$;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"DROP TABLE IF EXISTS ""ConsumoTow"";");
            migrationBuilder.Sql(@"DROP TABLE IF EXISTS ""AppSettings"";");
        }
    }
}
