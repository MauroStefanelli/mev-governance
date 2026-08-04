namespace MevGovernanceBackend.Models;

public class CreateMevRequest
{
    // ── Campi identificativi (obbligatori) ───────────────────────────────────
    public string ExcelId     { get; set; } = "";
    public string Applicativo { get; set; } = "";
    public string Descrizione { get; set; } = "";

    // ── Campi opzionali ──────────────────────────────────────────────────────
    public string? GoTo           { get; set; }
    public string? XOrdine        { get; set; }
    public string? PmPoste        { get; set; }
    public string? PmCap          { get; set; }
    public int     AnnoCompetenza { get; set; }
    public string? ReleaseExcel   { get; set; }
    public string  Stato          { get; set; } = "";
    public string? TipoContratto  { get; set; }
    public decimal ImportoExcel   { get; set; }
    public string? Recupero       { get; set; }
    public string? NoteExcel      { get; set; }
    public string? Bc             { get; set; }
    public string? Contratto      { get; set; }
    public string? Rda            { get; set; }
    public string? AtId           { get; set; }
    public string? Nel            { get; set; }
    public string? InVita         { get; set; }
    public string? Cm             { get; set; }
    public string? Subco          { get; set; }
    public string? Tbd            { get; set; }
    public decimal? Accantonato   { get; set; }
    public decimal? Tow021        { get; set; }
    public decimal? Tow022        { get; set; }
    public decimal? Tow023        { get; set; }
    public decimal? Tow024        { get; set; }
    public decimal? Tow025        { get; set; }
    public decimal? Tow026        { get; set; }

    // ── Campi PMO ────────────────────────────────────────────────────────────
    public int     PAnno     { get; set; }
    public string  PRelease  { get; set; } = "";
    public decimal PImporto  { get; set; }
    public string? PNote     { get; set; }
    public decimal ImportoBdo { get; set; }

    // ── Partecipazione: importi € per società ────────────────────────────────
    public string? Capgemini    { get; set; }
    public string? CapImporti   { get; set; }
    public string? SubcoImporti { get; set; }
}
