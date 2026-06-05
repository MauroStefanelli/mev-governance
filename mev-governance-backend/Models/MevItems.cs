using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class MevItem
{
    [Key]
    public int Id { get; set; }

    // Dati Excel

    // ✅ ordine originale Excel
    public int ExcelOrder { get; set; }

    // ✅ ID proveniente dal file Excel
    public string ExcelId { get; set; } = "";

    public string GoTo { get; set; } = "";
    public string Applicativo { get; set; } = "";
    public string Descrizione { get; set; } = "";
    public int AnnoCompetenza { get; set; }
    public string Stato { get; set; } = "";
    public decimal ImportoExcel { get; set; }
    public string? NoteExcel { get; set; }


    // Dati PMO
    public int PAnno { get; set; }
    public string PRelease { get; set; } = "";
    public decimal PImporto { get; set; }
    public string? PNote { get; set; }
}

