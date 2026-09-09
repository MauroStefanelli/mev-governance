using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddFatturatoReleaseExcelToMevItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""Fatturato""    NUMERIC(18,2) NOT NULL DEFAULT 0;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""ReleaseExcel"" TEXT NULL;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Fatturato",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "ReleaseExcel",
                table: "MevItems");
        }
    }
}
