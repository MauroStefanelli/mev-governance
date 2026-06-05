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
            // Fix: colonne decimal create come TEXT da EF Core/SQLite.
            // Su PostgreSQL bisogna prima droppare il default, cambiare il tipo, poi rimettere il default.

            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" DROP DEFAULT;
                ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" TYPE NUMERIC(18,2) USING ""OrdinatoBdo""::NUMERIC;
                ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" SET DEFAULT 0;
            ");

            migrationBuilder.Sql(@"
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImpLordo""     DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Sconto""       DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImportoNetto"" DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Ordinato""     DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaOrdinare""   DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Avanzato""     DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaAvanzare""   DROP DEFAULT;

                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImpLordo""     TYPE NUMERIC(18,2) USING ""ImpLordo""::NUMERIC;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Sconto""       TYPE NUMERIC(18,2) USING ""Sconto""::NUMERIC;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImportoNetto"" TYPE NUMERIC(18,2) USING ""ImportoNetto""::NUMERIC;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Ordinato""     TYPE NUMERIC(18,2) USING ""Ordinato""::NUMERIC;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaOrdinare""   TYPE NUMERIC(18,2) USING ""DaOrdinare""::NUMERIC;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Avanzato""     TYPE NUMERIC(18,2) USING ""Avanzato""::NUMERIC;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaAvanzare""   TYPE NUMERIC(18,2) USING ""DaAvanzare""::NUMERIC;

                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImpLordo""     SET DEFAULT 0;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Sconto""       SET DEFAULT 0;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImportoNetto"" SET DEFAULT 0;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Ordinato""     SET DEFAULT 0;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaOrdinare""   SET DEFAULT 0;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Avanzato""     SET DEFAULT 0;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaAvanzare""   SET DEFAULT 0;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" DROP DEFAULT;
                ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" TYPE TEXT USING ""OrdinatoBdo""::TEXT;
                ALTER TABLE ""MevItems"" ALTER COLUMN ""OrdinatoBdo"" SET DEFAULT '0';
            ");

            migrationBuilder.Sql(@"
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImpLordo""     DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Sconto""       DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImportoNetto"" DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Ordinato""     DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaOrdinare""   DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Avanzato""     DROP DEFAULT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaAvanzare""   DROP DEFAULT;

                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImpLordo""     TYPE TEXT USING ""ImpLordo""::TEXT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Sconto""       TYPE TEXT USING ""Sconto""::TEXT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImportoNetto"" TYPE TEXT USING ""ImportoNetto""::TEXT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Ordinato""     TYPE TEXT USING ""Ordinato""::TEXT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaOrdinare""   TYPE TEXT USING ""DaOrdinare""::TEXT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Avanzato""     TYPE TEXT USING ""Avanzato""::TEXT;
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaAvanzare""   TYPE TEXT USING ""DaAvanzare""::TEXT;

                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImpLordo""     SET DEFAULT '0';
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Sconto""       SET DEFAULT '0';
                ALTER TABLE ""Contratti"" ALTER COLUMN ""ImportoNetto"" SET DEFAULT '0';
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Ordinato""     SET DEFAULT '0';
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaOrdinare""   SET DEFAULT '0';
                ALTER TABLE ""Contratti"" ALTER COLUMN ""Avanzato""     SET DEFAULT '0';
                ALTER TABLE ""Contratti"" ALTER COLUMN ""DaAvanzare""   SET DEFAULT '0';
            ");
        }
    }
}
