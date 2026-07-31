using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddAllMevColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "Accantonato",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Cm",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "DocumentoOfferta",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ImportoFornituraScontato",
                table: "MevItems",
                type: "NUMERIC",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "InVita",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Nel",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "OffertaEuro",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PmCap",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PmPoste",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Po",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "PowerAppsId",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Recupero",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "ResiduoFatturabile",
                table: "MevItems",
                type: "NUMERIC",
                nullable: false,
                defaultValue: 0m);

            migrationBuilder.AddColumn<string>(
                name: "SubcoNome",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TabellaOfferta",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "Tbd",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TipoContratto",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Tow021",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Tow022",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Tow023",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Tow024",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Tow025",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "Tow026",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<decimal>(
                name: "TowTotale",
                table: "MevItems",
                type: "NUMERIC",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "XOrdine",
                table: "MevItems",
                type: "TEXT",
                nullable: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "Accantonato",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Cm",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "DocumentoOfferta",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "ImportoFornituraScontato",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "InVita",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Nel",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "OffertaEuro",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "PmCap",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "PmPoste",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Po",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "PowerAppsId",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Recupero",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "ResiduoFatturabile",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "SubcoNome",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TabellaOfferta",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tbd",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TipoContratto",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow021",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow022",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow023",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow024",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow025",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "Tow026",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "TowTotale",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "XOrdine",
                table: "MevItems");
        }
    }
}
