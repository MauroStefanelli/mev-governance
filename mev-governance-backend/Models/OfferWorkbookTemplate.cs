using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.EntityFrameworkCore;

namespace MevGovernanceBackend.Models;

// The Excel model of the Offer Table («Tabella di offerta · Excel HLD»). It does not belong to an initiative: it is the same file for every initiative of a lot, so it is kept once
// and every export starts from it. Updating it adds a new VERSION; the highest version is the one in use and the previous ones are kept (the last few) so a wrong update can be undone.
[Index(nameof(AmbienteId), nameof(Lot), nameof(Version), IsUnique = true)]
public class OfferWorkbookTemplate
{
    public long Id { get; set; }
    public int AmbienteId { get; set; }
    [MaxLength(16)] public string Lot { get; set; } = "";       // the model holds the price list of one lot (TOW02.1 …): one model per lot
    public int Version { get; set; }
    public string FileName { get; set; } = "";
    public long Size { get; set; }
    [MaxLength(64)] public string Sha256 { get; set; } = "";
    [MaxLength(120)] public string UploadedBy { get; set; } = "";
    public string UploadedByFullName { get; set; } = "";
    public DateTime UploadedAt { get; set; }
    [JsonIgnore] public byte[] Content { get; set; } = Array.Empty<byte>();
}
