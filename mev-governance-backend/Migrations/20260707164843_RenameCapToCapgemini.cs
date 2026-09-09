using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class RenameCapToCapgemini : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotente: rinomina Cap→Capgemini solo se Cap esiste e Capgemini non esiste ancora
            migrationBuilder.Sql(@"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'MevItems' AND column_name = 'Cap'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'MevItems' AND column_name = 'Capgemini'
    ) THEN
        ALTER TABLE ""MevItems"" RENAME COLUMN ""Cap"" TO ""Capgemini"";
    END IF;
END $$;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Capgemini",
                table: "MevItems",
                newName: "Cap");
        }
    }
}
