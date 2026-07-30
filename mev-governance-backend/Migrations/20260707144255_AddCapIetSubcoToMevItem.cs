using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddCapIetSubcoToMevItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Colonne DateTime su Users — TIMESTAMPTZ invece di TEXT
            migrationBuilder.Sql(@"
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""LastLogin""          TIMESTAMPTZ NULL;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""LastLogout""         TIMESTAMPTZ NULL;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""RefreshToken""       TEXT NULL;
                ALTER TABLE ""Users"" ADD COLUMN IF NOT EXISTS ""RefreshTokenExpiry"" TIMESTAMPTZ NULL;
            ");

            // Colonne MevItems
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Cap""   TEXT NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Iet""   TEXT NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Subco"" TEXT NULL;
            ");

            // Colonne ConsumoTow — NUMERIC invece di TEXT
            migrationBuilder.Sql(@"
                ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""TowApprovati"" NUMERIC(18,2) NOT NULL DEFAULT 0;
                ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""TowImpegnati"" NUMERIC(18,2) NOT NULL DEFAULT 0;
                ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""TowResidui""   NUMERIC(18,2) NOT NULL DEFAULT 0;
            ");

            // UserAccessLogs — SERIAL per Id, TIMESTAMPTZ per date
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ""UserAccessLogs"" (
                    ""Id""       SERIAL PRIMARY KEY,
                    ""UserId""   INTEGER NOT NULL,
                    ""Username"" TEXT NOT NULL DEFAULT '',
                    ""FullName"" TEXT NOT NULL DEFAULT '',
                    ""Role""     TEXT NOT NULL DEFAULT '',
                    ""LoginAt""  TIMESTAMPTZ NOT NULL DEFAULT now(),
                    ""LogoutAt"" TIMESTAMPTZ NULL
                );
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "UserAccessLogs");

            migrationBuilder.DropColumn(
                name: "LastLogin",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "LastLogout",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RefreshToken",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "RefreshTokenExpiry",
                table: "Users");

            migrationBuilder.DropColumn(
                name: "Cap",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Iet",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Subco",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TowApprovati",
                table: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "TowImpegnati",
                table: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "TowResidui",
                table: "ConsumoTow");
        }
    }
}
