using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class FixRtiSocietaRigheSerial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Su PostgreSQL la migration originale (generata per SQLite) non ha creato
            // la colonna Id come serial/identity. Questo SQL la corregge.
            migrationBuilder.Sql(@"
                DO $$
                DECLARE
                    seq_name text;
                BEGIN
                    -- Controlla se Id ha già un default nextval (già serial)
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'RtiSocietaRighe'
                          AND column_name = 'Id'
                          AND column_default LIKE 'nextval%'
                    ) THEN
                        seq_name := current_schema() || '.' || '""RtiSocietaRighe_Id_seq""';
                        EXECUTE 'CREATE SEQUENCE IF NOT EXISTS ' || seq_name;
                        EXECUTE 'SELECT setval(''' || seq_name || ''', COALESCE((SELECT MAX(""Id"") FROM ""RtiSocietaRighe""), 0) + 1, false)';
                        EXECUTE 'ALTER TABLE ""RtiSocietaRighe"" ALTER COLUMN ""Id"" SET DEFAULT nextval(''' || seq_name || ''')';
                    END IF;

                    -- Converti colonne TEXT in tipi corretti se necessario
                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'RtiSocietaRighe'
                          AND column_name = 'Importo'
                          AND data_type = 'text'
                    ) THEN
                        ALTER TABLE ""RtiSocietaRighe""
                            ALTER COLUMN ""Percentuale"" TYPE numeric USING NULLIF(""Percentuale"", '')::numeric,
                            ALTER COLUMN ""Importo""     TYPE numeric USING NULLIF(""Importo"", '')::numeric,
                            ALTER COLUMN ""Consumato""   TYPE numeric USING NULLIF(""Consumato"", '')::numeric;
                    END IF;

                    IF EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name = 'RtiSocietaRighe'
                          AND column_name = 'DataInizio'
                          AND data_type IN ('text', 'timestamp without time zone')
                    ) THEN
                        ALTER TABLE ""RtiSocietaRighe""
                            ALTER COLUMN ""DataInizio""       TYPE timestamptz USING ""DataInizio""::timestamptz,
                            ALTER COLUMN ""DataApprovazione"" TYPE timestamptz USING ""DataApprovazione""::timestamptz;
                    END IF;
                END$$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Non si fa rollback della conversione di tipo
        }
    }
}
