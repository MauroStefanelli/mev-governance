using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class FixOrdinatoBdoColumnType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Converte le colonne decimal da TEXT a NUMERIC(18,2) su PostgreSQL
            // se non sono già del tipo corretto (idempotente).

            migrationBuilder.Sql(@"
                DO $$
                BEGIN
                    IF (SELECT data_type FROM information_schema.columns
                        WHERE table_name='MevItems' AND column_name='OrdinatoBdo') = 'text' THEN
                        ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" DROP DEFAULT;
                        ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" TYPE NUMERIC(18,2) USING ""OrdinatoBdo""::NUMERIC;
                        ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" SET DEFAULT 0;
                    END IF;
                END $$;
            ");

            migrationBuilder.Sql(@"
                DO $$
                DECLARE col TEXT;
                BEGIN
                    FOREACH col IN ARRAY ARRAY['ImpLordo','Sconto','ImportoNetto','Ordinato','DaOrdinare','Avanzato','DaAvanzare']
                    LOOP
                        IF (SELECT data_type FROM information_schema.columns
                            WHERE table_name='Contratti' AND column_name=col) = 'text' THEN
                            EXECUTE format('ALTER TABLE ""Contratti"" ALTER COLUMN ""%s"" DROP DEFAULT', col);
                            EXECUTE format('ALTER TABLE ""Contratti"" ALTER COLUMN ""%s"" TYPE NUMERIC(18,2) USING ""%s""::NUMERIC', col, col);
                            EXECUTE format('ALTER TABLE ""Contratti"" ALTER COLUMN ""%s"" SET DEFAULT 0', col);
                        END IF;
                    END LOOP;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Non convertiamo indietro — il tipo NUMERIC è corretto
        }
    }
}
