namespace MevGovernanceBackend.Models;

public class TeamMember
{
    public int Id { get; set; }
    public int AmbienteId { get; set; }

    public string Risorsa { get; set; } = "";
    public string? Ambito { get; set; }
    public string? Specialita { get; set; }
    public string? PosteApplication { get; set; }
    public string? Note { get; set; }
    public string? RisorsaGrade { get; set; }
    public string? Grade { get; set; }
    public string? Cdc { get; set; }
    public string? Practice { get; set; }
    public string? Adrc { get; set; }
    public string? Cor { get; set; }
    public string? CorpId { get; set; }
    public string? Email { get; set; }
}
