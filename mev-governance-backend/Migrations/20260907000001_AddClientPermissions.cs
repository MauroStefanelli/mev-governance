using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddClientPermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Tabella UserClientContratti — idempotente
            migrationBuilder.Sql(@"
CREATE TABLE IF NOT EXISTS ""UserClientContratti"" (
    ""Id""           SERIAL PRIMARY KEY,
    ""UserId""       INTEGER NOT NULL,
    ""AmbienteId""   INTEGER NOT NULL,
    ""TowContratto"" TEXT    NOT NULL DEFAULT ''
);
");
            // Tabella UserPagePermissions — idempotente
            migrationBuilder.Sql(@"
CREATE TABLE IF NOT EXISTS ""UserPagePermissions"" (
    ""Id""     SERIAL PRIMARY KEY,
    ""UserId"" INTEGER NOT NULL,
    ""PageId"" TEXT    NOT NULL DEFAULT ''
);
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "UserPagePermissions");
            migrationBuilder.DropTable(name: "UserClientContratti");
        }
    }
}
