using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class FixDecimalColumnsForPostgres : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Converte idempotentemente tutte le colonne decimal di MevItems
            // che su Postgres DEV potrebbero ancora essere di tipo 'text'
            // a causa di migration precedenti generate da SQLite.
            migrationBuilder.Sql(@"
                DO $$
                DECLARE col TEXT;
                BEGIN
                    FOREACH col IN ARRAY ARRAY[
                        'ImportoExcel',
                        'PImporto',
                        'OrdinatoBdo',
                        'Fatturato',
                        'ImportoBdo',
                        'ImportoFornituraScontato',
                        'ResiduoFatturabile',
                        'Tow021',
                        'Tow022',
                        'Tow023',
                        'Tow024',
                        'Tow025',
                        'Tow026',
                        'TowTotale',
                        'Accantonato',
                        'OffertaEuro'
                    ]
                    LOOP
                        IF EXISTS (
                            SELECT 1 FROM information_schema.columns
                            WHERE table_schema = current_schema()
                              AND table_name   = 'MevItems'
                              AND column_name  = col
                              AND data_type    = 'text'
                        ) THEN
                            EXECUTE format('ALTER TABLE ""MevItems"" ALTER COLUMN ""%s"" DROP DEFAULT', col);
                            EXECUTE format('ALTER TABLE ""MevItems"" ALTER COLUMN ""%s"" TYPE NUMERIC USING ""%s""::NUMERIC', col, col);
                        END IF;
                    END LOOP;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // Non si torna indietro — NUMERIC è il tipo corretto
        }
    }
}
