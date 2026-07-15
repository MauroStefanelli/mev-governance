using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddVapColumnsToOrdineConsegna : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(@"
                DO $$ BEGIN
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='MeseAvanzamento') THEN
                        ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""MeseAvanzamento"" TEXT NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='QtaAvanzata') THEN
                        ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""QtaAvanzata"" TEXT NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='ImportoFatturabile') THEN
                        ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""ImportoFatturabile"" TEXT NOT NULL DEFAULT '';
                    END IF;
                    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='OrdiniConsegna' AND column_name='Subappalto') THEN
                        ALTER TABLE ""OrdiniConsegna"" ADD COLUMN ""Subappalto"" TEXT NOT NULL DEFAULT '';
                    END IF;
                END $$;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(name: "ImportoFatturabile", table: "OrdiniConsegna");
            migrationBuilder.DropColumn(name: "MeseAvanzamento",    table: "OrdiniConsegna");
            migrationBuilder.DropColumn(name: "QtaAvanzata",        table: "OrdiniConsegna");
            migrationBuilder.DropColumn(name: "Subappalto",         table: "OrdiniConsegna");
        }
    }
}
