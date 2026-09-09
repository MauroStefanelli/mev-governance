using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddAllMevColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Accantonato""             NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Cm""                      TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""DocumentoOfferta""        TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""ImportoFornituraScontato"" NUMERIC       NOT NULL DEFAULT 0;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""InVita""                  TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Nel""                     TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""OffertaEuro""             NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""PmCap""                   TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""PmPoste""                 TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Po""                      TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""PowerAppsId""             TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Recupero""                TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""ResiduoFatturabile""      NUMERIC        NOT NULL DEFAULT 0;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""SubcoNome""               TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""TabellaOfferta""          TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Tbd""                     TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""TipoContratto""           TEXT           NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Tow021""                  NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Tow022""                  NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Tow023""                  NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Tow024""                  NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Tow025""                  NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Tow026""                  NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""TowTotale""               NUMERIC        NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""XOrdine""                 TEXT           NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Accantonato",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Cm",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "DocumentoOfferta",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "ImportoFornituraScontato",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "InVita",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Nel",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "OffertaEuro",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "PmCap",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "PmPoste",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Po",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "PowerAppsId",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Recupero",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "ResiduoFatturabile",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "SubcoNome",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TabellaOfferta",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tbd",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TipoContratto",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow021",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow022",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow023",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow024",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow025",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow026",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TowTotale",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "XOrdine",
                table: "MevItems");
        }
    }
}
