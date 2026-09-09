using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class RenameConsumoTowVoceToContratto : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Idempotente: rinomina Voce→Contratto solo se Voce esiste e Contratto non esiste
            migrationBuilder.Sql(@"
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ConsumoTow' AND column_name = 'Voce'
    ) AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'ConsumoTow' AND column_name = 'Contratto'
    ) THEN
        ALTER TABLE ""ConsumoTow"" RENAME COLUMN ""Voce"" TO ""Contratto"";
    END IF;
END $$;
");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.RenameColumn(
                name: "Contratto",
                table: "ConsumoTow",
                newName: "Voce");
        }
    }
}
