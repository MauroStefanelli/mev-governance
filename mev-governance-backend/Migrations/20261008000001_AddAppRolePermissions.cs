using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddAppRolePermissions : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
CREATE TABLE IF NOT EXISTS ""AppRolePermissions"" (
    ""Id""      SERIAL  PRIMARY KEY,
    ""AppId""   TEXT    NOT NULL DEFAULT '',
    ""Role""    TEXT    NOT NULL DEFAULT '',
    ""CanView"" BOOLEAN NOT NULL DEFAULT TRUE,
    ""CanEdit"" BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indice unico per garantire unicità AppId+Role
CREATE UNIQUE INDEX IF NOT EXISTS ix_approlepermissions_appid_role
    ON ""AppRolePermissions"" (""AppId"", ""Role"");
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AppRolePermissions");
        }
    }
}
