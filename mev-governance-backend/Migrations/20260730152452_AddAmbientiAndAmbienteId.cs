using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace mevgovernancebackend.Migrations
{
    /// <inheritdoc />
    public partial class AddAmbientiAndAmbienteId : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Aggiunge AmbienteId (default 0 = non assegnato) a tutte le tabelle dati
            migrationBuilder.Sql(@"
                ALTER TABLE ""VerbaliAvanzamento"" ADD COLUMN IF NOT EXISTS ""AmbienteId"" INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE ""OrdiniConsegna""     ADD COLUMN IF NOT EXISTS ""AmbienteId"" INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE ""MevItems""           ADD COLUMN IF NOT EXISTS ""AmbienteId"" INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE ""Contratti""          ADD COLUMN IF NOT EXISTS ""AmbienteId"" INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE ""ConsumoTow""         ADD COLUMN IF NOT EXISTS ""AmbienteId"" INTEGER NOT NULL DEFAULT 0;
                ALTER TABLE ""BuoniConsegna""      ADD COLUMN IF NOT EXISTS ""AmbienteId"" INTEGER NOT NULL DEFAULT 0;
            ");

            // Crea tabella Ambienti
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ""Ambienti"" (
                    ""Id""               SERIAL PRIMARY KEY,
                    ""CodiceContratto""  TEXT NOT NULL DEFAULT '',
                    ""Descrizione""      TEXT NOT NULL DEFAULT '',
                    ""IsActive""         BOOLEAN NOT NULL DEFAULT true,
                    ""CreatedAt""        TIMESTAMPTZ NOT NULL DEFAULT now()
                );
            ");

            // Crea tabella UserAmbienti
            migrationBuilder.Sql(@"
                CREATE TABLE IF NOT EXISTS ""UserAmbienti"" (
                    ""Id""          SERIAL PRIMARY KEY,
                    ""UserId""      INTEGER NOT NULL,
                    ""AmbienteId""  INTEGER NOT NULL,
                    ""Ruolo""       TEXT NOT NULL DEFAULT 'Editor'
                );
            ");

            // Seed: crea l'ambiente 4490015980 e associa tutti i dati esistenti
            migrationBuilder.Sql(@"
                INSERT INTO ""Ambienti"" (""CodiceContratto"", ""Descrizione"", ""IsActive"", ""CreatedAt"")
                SELECT '4490015980', 'Contratto principale', true, now()
                WHERE NOT EXISTS (SELECT 1 FROM ""Ambienti"" WHERE ""CodiceContratto"" = '4490015980');

                UPDATE ""MevItems""           SET ""AmbienteId"" = (SELECT ""Id"" FROM ""Ambienti"" WHERE ""CodiceContratto"" = '4490015980' LIMIT 1) WHERE ""AmbienteId"" = 0;
                UPDATE ""Contratti""          SET ""AmbienteId"" = (SELECT ""Id"" FROM ""Ambienti"" WHERE ""CodiceContratto"" = '4490015980' LIMIT 1) WHERE ""AmbienteId"" = 0;
                UPDATE ""BuoniConsegna""      SET ""AmbienteId"" = (SELECT ""Id"" FROM ""Ambienti"" WHERE ""CodiceContratto"" = '4490015980' LIMIT 1) WHERE ""AmbienteId"" = 0;
                UPDATE ""ConsumoTow""         SET ""AmbienteId"" = (SELECT ""Id"" FROM ""Ambienti"" WHERE ""CodiceContratto"" = '4490015980' LIMIT 1) WHERE ""AmbienteId"" = 0;
                UPDATE ""OrdiniConsegna""     SET ""AmbienteId"" = (SELECT ""Id"" FROM ""Ambienti"" WHERE ""CodiceContratto"" = '4490015980' LIMIT 1) WHERE ""AmbienteId"" = 0;
                UPDATE ""VerbaliAvanzamento"" SET ""AmbienteId"" = (SELECT ""Id"" FROM ""Ambienti"" WHERE ""CodiceContratto"" = '4490015980' LIMIT 1) WHERE ""AmbienteId"" = 0;
            ");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Ambienti");

            migrationBuilder.DropTable(
                name: "UserAmbienti");

            migrationBuilder.DropColumn(
                name: "AmbienteId",
                table: "VerbaliAvanzamento");

            migrationBuilder.DropColumn(
                name: "AmbienteId",
                table: "OrdiniConsegna");

            migrationBuilder.DropColumn(
                name: "AmbienteId",
                table: "MevItems");

            migrationBuilder.DropColumn(
                name: "AmbienteId",
                table: "Contratti");

            migrationBuilder.DropColumn(
                name: "AmbienteId",
                table: "ConsumoTow");

            migrationBuilder.DropColumn(
                name: "AmbienteId",
                table: "BuoniConsegna");
        }
    }
}
