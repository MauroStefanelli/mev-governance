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
            migrationBuilder.CreateTable(
                name: "AppRolePermissions",
                columns: table => new
                {
                    Id = table.Column<int>(type: "integer", nullable: false)
                        .Annotation("Npgsql:ValueGenerationStrategy", NpgsqlValueGenerationStrategy.IdentityByDefaultColumn),
                    AppId   = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    Role    = table.Column<string>(type: "text", nullable: false, defaultValue: ""),
                    CanView = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                    CanEdit = table.Column<bool>(type: "boolean", nullable: false, defaultValue: true),
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_AppRolePermissions", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_AppRolePermissions_AppId_Role",
                table: "AppRolePermissions",
                columns: new[] { "AppId", "Role" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(name: "AppRolePermissions");
        }
    }
}
