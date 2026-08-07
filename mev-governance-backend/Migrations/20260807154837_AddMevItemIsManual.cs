using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddMevItemIsManual : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Aggiunge la colonna solo se non esiste già (idempotente).
            // La colonna potrebbe essere già presente come INTEGER da una migrazione
            // precedente fallita; in quel caso questo blocco viene saltato.
            migrationBuilder.Sql(@"
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='MevItems' AND column_name='IsManual'
    ) THEN
        ALTER TABLE ""MevItems"" ADD COLUMN ""IsManual"" INTEGER NOT NULL DEFAULT 0;
    END IF;
END $$;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "IsManual",
                table: "MevItems");
        }
    }
}
