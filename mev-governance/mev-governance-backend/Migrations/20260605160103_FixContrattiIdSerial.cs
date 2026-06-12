using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class FixContrattiIdSerial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Su PostgreSQL la colonna Id di Contratti è stata creata come INTEGER senza SERIAL
            // (a causa del tipo SQLite nella migration originale). La convertiamo in SERIAL.
            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    -- Controlla se la sequenza non esiste già
                    IF NOT EXISTS (
                        SELECT 1 FROM pg_class c
                        JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE c.relkind = 'S' AND c.relname = 'Contratti_Id_seq'
                    ) THEN
                        CREATE SEQUENCE ""Contratti_Id_seq"";
                        ALTER TABLE ""Contratti"" ALTER COLUMN ""Id"" SET DEFAULT nextval('""Contratti_Id_seq""');
                        -- Allinea la sequenza al valore massimo attuale
                        PERFORM setval('""Contratti_Id_seq""', COALESCE((SELECT MAX(""Id"") FROM ""Contratti""), 0) + 1, false);
                        ALTER SEQUENCE ""Contratti_Id_seq"" OWNED BY ""Contratti"".""Id"";
                    END IF;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Id"" DROP DEFAULT;
                DROP SEQUENCE IF EXISTS ""Contratti_Id_seq"";
            ");
        }
    }
}
