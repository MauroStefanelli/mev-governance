using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class FixIsManualColumnType : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // La colonna IsManual è stata creata come INTEGER dalla prima migrazione.
            // PostgreSQL non può leggere INTEGER come bool — la convertiamo a boolean.
            migrationBuilder.Sql(
                "ALTER TABLE \"MevItems\" ALTER COLUMN \"IsManual\" TYPE boolean USING (\"IsManual\"::boolean);");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                "ALTER TABLE \"MevItems\" ALTER COLUMN \"IsManual\" TYPE integer USING (\"IsManual\"::integer);");
        }
    }
}
