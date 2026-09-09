using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddTowImpattoAndPartecipazione : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems""    ADD COLUMN IF NOT EXISTS ""CapImporti""    TEXT NULL;
                ALTER TABLE ""MevItems""    ADD COLUMN IF NOT EXISTS ""SubcoImporti""  TEXT NULL;
                ALTER TABLE ""AppSettings"" ADD COLUMN IF NOT EXISTS ""TowImpattoJson"" TEXT NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "CapImporti",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "SubcoImporti",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TowImpattoJson",
                table: "AppSettings");
        }
    }
}
