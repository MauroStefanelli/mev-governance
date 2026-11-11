using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

[Index(nameof(AmbienteId), nameof(Goto))]
[Index(nameof(AmbienteId), nameof(GroupId), nameof(Version), IsUnique = true)]
public class InitiativeDocument
{
    public Guid Id { get; set; } = Guid.NewGuid();
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    public string FileName { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public string Sha256 { get; set; } = "";
    public string Author { get; set; } = "";
    public DateTime CreatedAt { get; set; }
    [JsonIgnore] public byte[] Content { get; set; } = Array.Empty<byte>();
    [JsonIgnore] public string? Extraction { get; set; }
    public DateTime? RemovedAt { get; set; }
    public string RemovedBy { get; set; } = "";

    // Workspace documentale: folder, versions and search index. Documents uploaded before the workspace existed
    // are backfilled with GroupId = Id, version 1 and the default folder.
    public string Category { get; set; } = "Allegati ricevuti";
    // A document and all its versions share a GroupId. A document created without one (older code paths)
    // is its own group, so the unique (environment, group, version) index can never collide.
    private Guid? group;
    public Guid GroupId { get => group ?? Id; set => group = value; }
    public int Version { get; set; } = 1;
    public bool IsCurrent { get; set; } = true;
    public bool AiEnabled { get; set; } = true;
    [JsonIgnore] public string? SearchText { get; set; }
    public int IndexVersion { get; set; }
    public DateTime? IndexedAt { get; set; }
    public string IndexStatus { get; set; } = "pending";
    public int IndexedChars { get; set; }
}

// Audit trail of what happened to a document: upload, new version, folder change, AI use, removal.
[Index(nameof(AmbienteId), nameof(Goto), nameof(GroupId))]
public class InitiativeDocumentEvent
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(120)] public string Goto { get; set; } = "";
    public Guid GroupId { get; set; }
    public Guid DocumentId { get; set; }
    public int Version { get; set; }
    [MaxLength(32)] public string Action { get; set; } = "";
    public string Detail { get; set; } = "";
    public string Actor { get; set; } = "";
    public DateTime At { get; set; }
}
