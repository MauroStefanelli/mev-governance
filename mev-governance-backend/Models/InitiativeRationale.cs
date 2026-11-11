using System.ComponentModel.DataAnnotations;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

// Permanent chat between the analysts and the AI about why interventions are needed and which constraints apply.
[Index(nameof(AmbienteId), nameof(Goto), nameof(Id))]
public class RationaleMessage
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    [MaxLength(16)] public string Role { get; set; } = "user"; // user | assistant
    [MaxLength(120)] public string Author { get; set; } = "";
    public string AuthorFullName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    public string Text { get; set; } = "";
    public string Model { get; set; } = "";
}

// A rationale, constraint or decision. Only "confermata" entries are reused by the offer, by Sviluppo and by other initiatives.
[Index(nameof(AmbienteId), nameof(Goto))]
public class RationaleEntry
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    public string GotoLabel { get; set; } = "";
    public string SystemKey { get; set; } = "";
    [MaxLength(16)] public string Kind { get; set; } = "razionale";   // razionale | vincolo | decisione
    public string Text { get; set; } = "";
    public string? InterventionId { get; set; }
    [MaxLength(16)] public string Status { get; set; } = "proposta"; // proposta | confermata | scartata | revocata
    public bool ByAi { get; set; }
    public long? SourceMessageId { get; set; }
    public long? SourceEntryId { get; set; }                        // set when copied from another initiative
    [MaxLength(120)] public string CreatedBy { get; set; } = "";
    public string CreatedByFullName { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    [MaxLength(120)] public string? DecidedBy { get; set; }
    public string? DecidedByFullName { get; set; }
    public DateTime? DecidedAt { get; set; }
    // Provenance of an entry that comes from the work history of an AI assistant (null for everything written in the app).
    public string? SourceFile { get; set; }
    [MaxLength(64)] public string? SourceSha { get; set; }
    public string? SourceAuthor { get; set; }
    public string? ImportedBy { get; set; }
}
