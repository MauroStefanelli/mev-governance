using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "MevItems",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    ExcelOrder = table.Column<int>(type: "INTEGER", nullable: false),
                    ExcelId = table.Column<string>(type: "TEXT", nullable: false),
                    GoTo = table.Column<string>(type: "TEXT", nullable: false),
                    Applicativo = table.Column<string>(type: "TEXT", nullable: false),
                    Descrizione = table.Column<string>(type: "TEXT", nullable: false),
                    AnnoCompetenza = table.Column<int>(type: "INTEGER", nullable: false),
                    Stato = table.Column<string>(type: "TEXT", nullable: false),
                    ImportoExcel = table.Column<decimal>(type: "TEXT", nullable: false),
                    PAnno = table.Column<int>(type: "INTEGER", nullable: false),
                    PRelease = table.Column<string>(type: "TEXT", nullable: false),
                    PImporto = table.Column<decimal>(type: "TEXT", nullable: false),
                    PNote = table.Column<string>(type: "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_MevItems", x => x.Id);
                });

            migrationBuilder.CreateTable(
                name: "Users",
                columns: table => new
                {
                    Id = table.Column<int>(type: "INTEGER", nullable: false)
                        .Annotation("Sqlite:Autoincrement", true),
                    Username = table.Column<string>(type: "TEXT", nullable: false),
                    FullName = table.Column<string>(type: "TEXT", nullable: false),
                    Email = table.Column<string>(type: "TEXT", nullable: false),
                    PasswordHash = table.Column<string>(type: "TEXT", nullable: false),
                    Role = table.Column<string>(type: "TEXT", nullable: false),
                    IsActive = table.Column<bool>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Users", x => x.Id);
                });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "MevItems");

            migrationBuilder.DropTable(
                name: "Users");
        }
    }
}
