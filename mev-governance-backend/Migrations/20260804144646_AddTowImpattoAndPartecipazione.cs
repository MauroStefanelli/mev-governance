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
            migrationBuilder.AddColumn<string>(
                name: "CapImporti",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "SubcoImporti",
                table: "MevItems",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "TowImpattoJson",
                table: "AppSettings",
                type: "TEXT",
                nullable: true);
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
