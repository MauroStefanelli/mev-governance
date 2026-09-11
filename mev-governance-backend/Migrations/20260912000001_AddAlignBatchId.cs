using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace MevGovernanceBackend.Migrations;

public partial class AddAlignBatchId : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Aggiunge LastAlignBatchId a MevItems (idempotente)
        migrationBuilder.Sql(@"
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'MevItems' AND column_name = 'LastAlignBatchId'
                ) THEN
                    ALTER TABLE ""MevItems"" ADD COLUMN ""LastAlignBatchId"" TEXT NULL;
                END IF;
            END $$;
        ");

        // Aggiunge LastAlignBatchId a AppSettings (idempotente)
        migrationBuilder.Sql(@"
            DO $$ BEGIN
                IF NOT EXISTS (
                    SELECT 1 FROM information_schema.columns
                    WHERE table_name = 'AppSettings' AND column_name = 'LastAlignBatchId'
                ) THEN
                    ALTER TABLE ""AppSettings"" ADD COLUMN ""LastAlignBatchId"" TEXT NULL;
                END IF;
            END $$;
        ");
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.Sql(@"ALTER TABLE ""MevItems"" DROP COLUMN IF EXISTS ""LastAlignBatchId"";");
        migrationBuilder.Sql(@"ALTER TABLE ""AppSettings"" DROP COLUMN IF EXISTS ""LastAlignBatchId"";");
    }
}
