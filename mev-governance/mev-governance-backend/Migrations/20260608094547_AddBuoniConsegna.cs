using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddBuoniConsegna : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "BuoniConsegna",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true)
                        .Annotation("Npgsql:ValueGenerationStrategy", Npgsql.EntityFrameworkCore.PostgreSQL.Metadata.NpgsqlValueGenerationStrategy.IdentityAlwaysColumn),
                    Oda = table.Column<string>(type: "TEXT", nullable: false),
                    Contratto = table.Column<string>(type: "TEXT", nullable: true),
                    RifContratto = table.Column<string>(type: "TEXT", nullable: true),
                    Importo = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    Avanzato = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false),
                    DaAvanzare = table.Column<decimal>(type: "NUMERIC(18,2)", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_BuoniConsegna", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "BuoniConsegna");
        }
    }
}
