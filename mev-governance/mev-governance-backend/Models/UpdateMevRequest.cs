namespace MevGovernanceBackend.Models;

public class UpdateMevRequest
{
    public int PAnno { get; set; }
    public string PRelease { get; set; } = "";
    public decimal PImporto { get; set; }
    public string? PNote { get; set; }
}
