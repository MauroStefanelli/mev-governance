using System.ComponentModel.DataAnnotations;

namespace MevGovernanceBackend.Models;

public class MevItem
{
    [Key]
    public int Id { get; set; }

    // ── Metadati import ──────────────────────────────────────────────────────
    public int ExcelOrder { get; set; }
    public string ExcelId { get; set; } = "";

    // ── Colonne foglio MEV ───────────────────────────────────────────────────
    public string GoTo { get; set; } = "";
    public string Applicativo { get; set; } = "";
    public string? XOrdine { get; set; }
    public string Descrizione { get; set; } = "";
    public string? PmPoste { get; set; }
    public string? PmCap { get; set; }
    public int AnnoCompetenza { get; set; }
    public string? ReleaseExcel { get; set; }
    public string? Capgemini { get; set; }
    public string? Iet { get; set; }
    public string Stato { get; set; } = "";
    public decimal ImportoExcel { get; set; }
    public string? TipoContratto { get; set; }
    public decimal ImportoFornituraScontato { get; set; }
    public string? NoteExcel { get; set; }
    public string? Recupero { get; set; }
    public string? Subco { get; set; }
    public string? Tbd { get; set; }

    // ── Dati ordine / contratto ──────────────────────────────────────────────
    public string? Bc { get; set; }
    public string? Contratto { get; set; }
    public string? Rda { get; set; }
    public string? AtId { get; set; }

    // ── TOW (giorni/quantita') ───────────────────────────────────────────────
    public decimal? Tow021 { get; set; }
    public decimal? Tow022 { get; set; }
    public decimal? Tow023 { get; set; }
    public decimal? Tow024 { get; set; }
    public decimal? Tow025 { get; set; }
    public decimal? Tow026 { get; set; }
    public decimal? TowTotale { get; set; }

    // ── Avanzamento economico ────────────────────────────────────────────────
    public decimal OrdinatoBdo { get; set; }
    public decimal Fatturato { get; set; }
    public decimal ResiduoFatturabile { get; set; }

    // ── Campi extra ──────────────────────────────────────────────────────────
    public string? TabellaOfferta { get; set; }
    public string? PowerAppsId { get; set; }
    public string? SubcoNome { get; set; }
    public decimal? OffertaEuro { get; set; }
    public string? Po { get; set; }
    public string? DocumentoOfferta { get; set; }
    public decimal? Accantonato { get; set; }
    public string? Nel { get; set; }
    public string? InVita { get; set; }
    public string? Cm { get; set; }

    // ── Dati PMO (editabili dalla UI) ────────────────────────────────────────
    public int PAnno { get; set; }
    public string PRelease { get; set; } = "";
    public decimal PImporto { get; set; }
    public string? PNote { get; set; }

    // ── Importo BDO (pre-popolato da OrdinatoBdo, modificabile dalla UI) ─────
    public decimal ImportoBdo { get; set; }

    /// <summary>
    /// Importi in € per le società Mandataria/Mandante, serializzati come JSON.
    /// Formato: { "NomeSocietà": 12345.67, ... }
    /// </summary>
    public string? CapImporti { get; set; }

    /// <summary>
    /// Importi in € per le società SUBCO, serializzati come JSON.
    /// Formato: { "NomeSocietà": 12345.67, ... }
    /// </summary>
    public string? SubcoImporti { get; set; }

    // ── Ambiente ─────────────────────────────────────────────────────────────
    public int AmbienteId { get; set; }
}
