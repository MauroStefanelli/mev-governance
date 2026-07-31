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
            migrationBuilder.AddColumn<bool>(
                name: "IsCatalogo",
                table: "ConsumoTow",
                type: "INTEGER",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<decimal>(
                name: "Sconto",
                table: "ConsumoTow",
                type: "TEXT",
                nullable: false,
                defaultValue: 0m);
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
