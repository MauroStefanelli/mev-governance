namespace MevGovernanceBackend.Models;

public class UpdateMevRequest
{
    // ── Campi PMO ────────────────────────────────────────────────────────────
    public int PAnno { get; set; }
    public string PRelease { get; set; } = "";
    public decimal PImporto { get; set; }
    public string? PNote { get; set; }
    public decimal ImportoBdo { get; set; }

    // ── Campi Excel editabili ────────────────────────────────────────────────
    public string? Stato { get; set; }
    public string? ReleaseExcel { get; set; }
    public string? PmPoste { get; set; }
    public string? PmCap { get; set; }
    public string? TipoContratto { get; set; }
    public string? Recupero { get; set; }
    public string? Capgemini { get; set; }
    public string? Subco { get; set; }
    public string? Tbd { get; set; }
    public string? Bc { get; set; }
    public string? Contratto { get; set; }
    public string? Rda { get; set; }
    public string? AtId { get; set; }
    public decimal? Tow021 { get; set; }
    public decimal? Tow022 { get; set; }
    public decimal? Tow023 { get; set; }
    public decimal? Tow024 { get; set; }
    public decimal? Tow025 { get; set; }
    public decimal? Tow026 { get; set; }
    public decimal? Accantonato { get; set; }
    public string? Nel { get; set; }
    public string? InVita { get; set; }
    public string? Cm { get; set; }
    public string? NoteExcel { get; set; }

    // ── Importi ricalcolati dai TOW ──────────────────────────────────────────
    public decimal? ImportoExcel { get; set; }
    public decimal? ImportoFornituraScontato { get; set; }
    public decimal? TowTotale { get; set; }

    // ── Partecipazione: importi € per società ────────────────────────────────
    public string? CapImporti { get; set; }
    public string? SubcoImporti { get; set; }
}
