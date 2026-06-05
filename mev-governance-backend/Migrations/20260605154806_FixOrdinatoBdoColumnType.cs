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
            // Fix: EF Core con SQLite ha generato tipo TEXT per colonne decimal.
            // Su PostgreSQL occorre convertire esplicitamente al tipo corretto.
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems""
                    ALTER COLUMN ""OrdinatoBdo"" TYPE NUMERIC(18,2)
                    USING ""OrdinatoBdo""::NUMERIC;
            ");

            migrationBuilder.Sql(@"
                ALTER TABLE ""Contratti""
                    ALTER COLUMN ""ImpLordo""     TYPE NUMERIC(18,2) USING ""ImpLordo""::NUMERIC,
                    ALTER COLUMN ""Sconto""       TYPE NUMERIC(18,2) USING ""Sconto""::NUMERIC,
                    ALTER COLUMN ""ImportoNetto"" TYPE NUMERIC(18,2) USING ""ImportoNetto""::NUMERIC,
                    ALTER COLUMN ""Ordinato""     TYPE NUMERIC(18,2) USING ""Ordinato""::NUMERIC,
                    ALTER COLUMN ""DaOrdinare""   TYPE NUMERIC(18,2) USING ""DaOrdinare""::NUMERIC,
                    ALTER COLUMN ""Avanzato""     TYPE NUMERIC(18,2) USING ""Avanzato""::NUMERIC,
                    ALTER COLUMN ""DaAvanzare""   TYPE NUMERIC(18,2) USING ""DaAvanzare""::NUMERIC;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems""
                    ALTER COLUMN ""OrdinatoBdo"" TYPE TEXT USING ""OrdinatoBdo""::TEXT;
            ");

            migrationBuilder.Sql(@"
                ALTER TABLE ""Contratti""
                    ALTER COLUMN ""ImpLordo""     TYPE TEXT USING ""ImpLordo""::TEXT,
                    ALTER COLUMN ""Sconto""       TYPE TEXT USING ""Sconto""::TEXT,
                    ALTER COLUMN ""ImportoNetto"" TYPE TEXT USING ""ImportoNetto""::TEXT,
                    ALTER COLUMN ""Ordinato""     TYPE TEXT USING ""Ordinato""::TEXT,
                    ALTER COLUMN ""DaOrdinare""   TYPE TEXT USING ""DaOrdinare""::TEXT,
                    ALTER COLUMN ""Avanzato""     TYPE TEXT USING ""Avanzato""::TEXT,
                    ALTER COLUMN ""DaAvanzare""   TYPE TEXT USING ""DaAvanzare""::TEXT;
            ");
        }
    }
}
