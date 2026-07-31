using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddLogoutMinutesToAppSettings : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // CollaudoApprovato/Fatturato/Ordinato potrebbero già esistere in produzione
            // (aggiunte manualmente). Le aggiungiamo solo se non presenti.
            migrationBuilder.Sql(@"
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='ConsumoTow' AND column_name='CollaudoApprovato'
                    ) THEN
                        ALTER TABLE ""ConsumoTow"" ADD COLUMN ""CollaudoApprovato"" NUMERIC NOT NULL DEFAULT 0;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='ConsumoTow' AND column_name='CollaudoFatturato'
                    ) THEN
                        ALTER TABLE ""ConsumoTow"" ADD COLUMN ""CollaudoFatturato"" NUMERIC NOT NULL DEFAULT 0;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='ConsumoTow' AND column_name='CollaudoOrdinato'
                    ) THEN
                        ALTER TABLE ""ConsumoTow"" ADD COLUMN ""CollaudoOrdinato"" NUMERIC NOT NULL DEFAULT 0;
                    END IF;
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.columns
                        WHERE table_name='AppSettings' AND column_name='LogoutMinutes'
                    ) THEN
                        ALTER TABLE ""AppSettings"" ADD COLUMN ""LogoutMinutes"" INTEGER NOT NULL DEFAULT 60;
                    END IF;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "CollaudoApprovato", table: "ConsumoTow");
            migrationBuilder.DropColumn(name: "CollaudoFatturato", table: "ConsumoTow");
            migrationBuilder.DropColumn(name: "CollaudoOrdinato",  table: "ConsumoTow");
            migrationBuilder.DropColumn(name: "LogoutMinutes",     table: "AppSettings");
        }
    }
}
