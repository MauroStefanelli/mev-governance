using Microsoft.EntityFrameworkCore.Migrations;
using Npgsql.EntityFrameworkCore.PostgreSQL.Metadata;

#nullable disable

namespace MevGovernanceBackend.Migrations;

public partial class AddTeamMembers : Migration
{
    protected override void Up(MigrationBuilder migrationBuilder)
    {
        // Pre-patch: crea la tabella in schema esplicito se non esiste
        migrationBuilder.Sql("""
            DO $$
            DECLARE
              s TEXT := current_setting('search_path');
              schema_name TEXT;
            BEGIN
              schema_name := trim(split_part(s, ',', 1));
              IF schema_name = '' OR schema_name = '"$user"' THEN
                schema_name := 'public';
              END IF;
              EXECUTE format(
                'CREATE TABLE IF NOT EXISTS %I."TeamMembers" (
                  "Id" serial PRIMARY KEY,
                  "AmbienteId" integer NOT NULL DEFAULT 0,
                  "Risorsa" text NOT NULL DEFAULT '''',
                  "Ambito" text,
                  "Specialita" text,
                  "PosteApplication" text,
                  "Note" text,
                  "RisorsaGrade" text,
                  "Grade" text,
                  "Cdc" text,
                  "Practice" text,
                  "Adrc" text,
                  "Cor" text,
                  "CorpId" text,
                  "Email" text
                )', schema_name
              );
            END $$;
            """);
    }

    protected override void Down(MigrationBuilder migrationBuilder)
    {
        migrationBuilder.DropTable(name: "TeamMembers");
    }
}
