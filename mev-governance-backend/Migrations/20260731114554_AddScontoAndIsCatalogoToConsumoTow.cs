using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddScontoAndIsCatalogoToConsumoTow : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""IsCatalogo"" BOOLEAN NOT NULL DEFAULT false;
                ALTER TABLE ""ConsumoTow"" ADD COLUMN IF NOT EXISTS ""Sconto""     NUMERIC NOT NULL DEFAULT 0;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsCatalogo",
                table: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "Sconto",
                table: "ConsumoTow");
        }
    }
}
