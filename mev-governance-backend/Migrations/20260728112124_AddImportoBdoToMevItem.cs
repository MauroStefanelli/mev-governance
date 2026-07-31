using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddImportoBdoToMevItem : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""VerbaliAvanzamento"" ADD COLUMN IF NOT EXISTS ""DatiRigheJson"" TEXT NULL;
                ALTER TABLE ""MevItems"" ADD COLUMN IF NOT EXISTS ""ImportoBdo"" NUMERIC(18,2) NOT NULL DEFAULT 0;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "DatiRigheJson",
                table: "VerbaliAvanzamento");

            migrationBuilder.DropColumn(
                name: "ImportoBdo",
                table: "MevItems");
        }
    }
}
