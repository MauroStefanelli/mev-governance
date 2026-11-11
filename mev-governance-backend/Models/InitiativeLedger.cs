using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

// The history of the initiatives of an environment: one row per initiative IDENTITY (GOTO + system + title).
// The same GOTO on two systems, or two titles on one system, are two rows. An unassigned GOTO ("TBD") has no code until Poste gives one.
[Index(nameof(AmbienteId), nameof(Key), IsUnique = true)]
[Index(nameof(AmbienteId), nameof(Status))]
public class LedgerInitiative
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(300)] public string Key { get; set; } = "";
    [MaxLength(60)] public string? Goto { get; set; }
    public string Title { get; set; } = "";
    [MaxLength(120)] public string System { get; set; } = "";
    [MaxLength(120)] public string? PmPoste { get; set; }
    [MaxLength(24)] public string Status { get; set; } = "";
    [MaxLength(60)] public string? Release { get; set; }
    [MaxLength(60)] public string? PlannedRelease { get; set; }
    public DateTime? CollaudoDate { get; set; }
    public string? CollaudoText { get; set; }
    public string? Notes { get; set; }
    public string? Released { get; set; }
    public string? Missing { get; set; }
    public string? AmountsJson { get; set; }
    public string Source { get; set; } = "file";          // file | app
    public string? SourceFile { get; set; }
    public DateTime? SourceDate { get; set; }
    public DateTime CreatedAt { get; set; }
    public string CreatedBy { get; set; } = "";
    public DateTime UpdatedAt { get; set; }
    public string UpdatedBy { get; set; } = "";
    public int Revision { get; set; } = 1;
    public bool Archived { get; set; }
}

// Every change to an initiative, with who and when: the file imports, the edits and the activities done in the app.
[Index(nameof(AmbienteId), nameof(InitiativeId), nameof(Id))]
public class LedgerEvent
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    public long InitiativeId { get; set; }
    [MaxLength(24)] public string Kind { get; set; } = "";   // import | modifica | stato | attivita | nota | creazione
    public string Summary { get; set; } = "";
    public string? ChangesJson { get; set; }                 // [{field, from, to}]
    public string Actor { get; set; } = "";
    public string ActorFullName { get; set; } = "";
    public DateTime At { get; set; }
    public long? ImportId { get; set; }
}

// One row per import run, so a re-import is idempotent and the user can see what each file changed.
[Index(nameof(AmbienteId), nameof(Id))]
public class LedgerImport
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    public string FileName { get; set; } = "";
    [MaxLength(64)] public string Sha256 { get; set; } = "";
    public DateTime? SourceDate { get; set; }
    public int Rows { get; set; }
    public int Created { get; set; }
    public int Updated { get; set; }
    public int Unchanged { get; set; }
    public int Skipped { get; set; }
    public string Actor { get; set; } = "";
    public DateTime At { get; set; }
}
