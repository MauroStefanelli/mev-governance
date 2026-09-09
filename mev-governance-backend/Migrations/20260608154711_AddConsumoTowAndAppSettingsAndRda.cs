using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddConsumoTowAndAppSettingsAndRda : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Rda"" TEXT NULL;
                CREATE TABLE IF NOT EXISTS ""AppSettings"" (
                    ""Id""          SERIAL PRIMARY KEY,
                    ""LastAlignAt"" TIMESTAMPTZ NULL
                );
                CREATE TABLE IF NOT EXISTS ""ConsumoTow"" (
                    ""Id""          SERIAL PRIMARY KEY,
                    ""Voce""        TEXT NOT NULL DEFAULT '',
                    ""ValoreTotale"" NUMERIC NOT NULL DEFAULT 0,
                    ""Approvato""   NUMERIC NOT NULL DEFAULT 0,
                    ""OrdinatiRda"" NUMERIC NOT NULL DEFAULT 0,
                    ""Impegnato""   NUMERIC NOT NULL DEFAULT 0,
                    ""Residuo""     NUMERIC NOT NULL DEFAULT 0
                );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "AppSettings");

            migrationBuilder.DropTable(
                name: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "Rda",
                table: "MevItems");
        }
    }
}
