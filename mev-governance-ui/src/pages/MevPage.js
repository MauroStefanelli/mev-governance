import { useEffect, useState } from "react";
import {
  getMevList, updateMev, alignMevData, exportMev
} from "../services/mevService";

const FILTERS_STORAGE_KEY = "mevPageFilters";

// ── Utils ────────────────────────────────────────────────────────────────────
const formatEuro = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const num = parseFloat(value);
  if (isNaN(num)) return "";
  const [intPart, decPart] = num.toFixed(2).split(".");
  return `€ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

const isScostamento = (excel, pianificato) =>
  excel !== null && pianificato !== null && Number(excel) !== Number(pianificato);

// ── Stili condivisi ──────────────────────────────────────────────────────────
const TD = { padding: "6px 8px", fontSize: "13px", color: "#333", verticalAlign: "middle" };

const btn = (variant = "default") => {
  const base = {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "7px 16px", borderRadius: "6px", fontSize: "13px",
    fontWeight: 600, cursor: "pointer", border: "none",
    transition: "opacity 0.15s, box-shadow 0.15s",
    whiteSpace: "nowrap",
  };
  const variants = {
    primary:  { ...base, background: "#1a73e8", color: "#fff", boxShadow: "0 1px 3px rgba(26,115,232,.35)" },
    danger:   { ...base, background: "#ea4335", color: "#fff", boxShadow: "0 1px 3px rgba(234,67,53,.35)" },
    ghost:    { ...base, background: "#f1f3f4", color: "#444", border: "1px solid #dadce0" },
    success:  { ...base, background: "#34a853", color: "#fff", boxShadow: "0 1px 3px rgba(52,168,83,.35)" },
    default:  { ...base, background: "#f1f3f4", color: "#444", border: "1px solid #dadce0" },
  };
  return variants[variant] || variants.default;
};

const selectStyle = {
  padding: "4px 6px", border: "1px solid #dadce0", borderRadius: "4px",
  fontSize: "12px", background: "white", width: "100%", color: "#333",
};

const inputStyle = (extra = {}) => ({
  padding: "5px 8px", border: "1px solid #dadce0", borderRadius: "4px",
  fontSize: "13px", background: "white", color: "#333", ...extra,
});

// ── Componente ───────────────────────────────────────────────────────────────
function MevPage({ onUnauthorized, onRowsChange, onFilteredRowsChange }) {
  const [rows, setRows]                     = useState([]);
  const [loading, setLoading]               = useState(true);
  const [savedRows, setSavedRows]           = useState({});
  const [editingImporto, setEditingImporto] = useState({});
  const [aligning, setAligning]             = useState(false);

  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
    return saved ? JSON.parse(saved) : { goTo: "", applicativo: "", stato: "", annoCompetenza: "", pAnno: "", pRelease: "" };
  });

  // ── Data load ──────────────────────────────────────────────────────────────
  const loadMev = async () => {
    setLoading(true);
    try {
      const data = await getMevList();
      setRows(data);
      onRowsChange?.(data);
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadMev(); }, []);
  useEffect(() => { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters)); }, [filters]);

  const resetFilters = () => {
    setFilters({ goTo: "", applicativo: "", stato: "", annoCompetenza: "", pAnno: "", pRelease: "" });
    localStorage.removeItem(FILTERS_STORAGE_KEY);
  };

  const handleFilterChange = (field, value) =>
    setFilters((prev) => ({ ...prev, [field]: value }));

  // ── Options ────────────────────────────────────────────────────────────────
  const buildOptions = (field) =>
    [...new Set(rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== ""))].sort();

  const goToOptions        = buildOptions("goTo");
  const applicativoOptions = buildOptions("applicativo");
  const statoOptions       = buildOptions("stato");
  const annoOptions        = buildOptions("annoCompetenza");
  const pAnnoOptions       = buildOptions("pAnno");
  const pReleaseOptions    = buildOptions("pRelease");

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filteredRows = rows.filter((r) =>
    (!filters.goTo         || r.goTo === filters.goTo) &&
    (!filters.applicativo  || r.applicativo === filters.applicativo) &&
    (!filters.stato        || r.stato === filters.stato) &&
    (!filters.annoCompetenza || String(r.annoCompetenza) === filters.annoCompetenza) &&
    (!filters.pAnno        || String(r.pAnno) === filters.pAnno) &&
    (!filters.pRelease     || r.pRelease === filters.pRelease)
  );

  const totCap   = filteredRows.reduce((s, r) => s + (Number(r.importoExcel) || 0), 0);
  const totPoste = filteredRows.reduce((s, r) => s + (Number(r.pImporto)    || 0), 0);
  const hasActiveFilters = Object.values(filters).some((v) => v !== "");

  useEffect(() => { onFilteredRowsChange?.(filteredRows); }, [filteredRows]); // eslint-disable-line

  // ── Editing ────────────────────────────────────────────────────────────────
  const handleChange = (index, field, value) => {
    const updated = [...rows];
    updated[index][field] = value;
    setRows(updated);
  };

  const handleSave = async (row) => {
    try {
      await updateMev(row.id, {
        pAnno: Number(row.pAnno), pRelease: row.pRelease,
        pImporto: Number(row.pImporto), pNote: row.pNote,
      });
      setSavedRows((prev) => ({ ...prev, [row.id]: true }));
      setTimeout(() => setSavedRows((prev) => ({ ...prev, [row.id]: false })), 2000);
    } catch {
      alert("Errore salvataggio");
    }
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento MEV...
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 24px" }}>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button
          style={btn("primary")}
          onClick={async () => {
            if (!window.confirm("Riallineare i dati MEV con l'Excel ufficiale?\nLe modifiche PMO verranno preservate.")) return;
            setAligning(true);
            try {
              const result = await alignMevData({});
              alert(`Allineamento completato: ${result.count} record caricati`);
              await loadMev();
            } catch (e) {
              alert(`Errore allineamento:\n${e.message}`);
            } finally {
              setAligning(false);
            }
          }}
          disabled={aligning}
        >
          {aligning ? "Allineamento..." : "⟳ Allinea Dati"}
        </button>

        <button style={btn("success")} onClick={async () => {
          try { await exportMev(filteredRows, filters); }
          catch (e) { alert(`Errore export: ${e.message}`); }
        }}>
          ↓ Esporta Excel
        </button>

        <button
          style={{ ...btn("ghost"), opacity: hasActiveFilters ? 1 : 0.5 }}
          onClick={resetFilters}
          disabled={!hasActiveFilters}
        >
          ✕ Reset filtri
        </button>

        {/* Totali */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "16px" }}>
          <div style={{
            background: "#e8f0fe", borderRadius: "8px", padding: "8px 16px",
            textAlign: "right", minWidth: "160px"
          }}>
            <div style={{ fontSize: "11px", color: "#1a73e8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tot CAP</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a73e8" }}>{formatEuro(totCap)}</div>
          </div>
          <div style={{
            background: isScostamento(totCap, totPoste) ? "#fce8e6" : "#e6f4ea",
            borderRadius: "8px", padding: "8px 16px", textAlign: "right", minWidth: "160px"
          }}>
            <div style={{ fontSize: "11px", color: isScostamento(totCap, totPoste) ? "#ea4335" : "#34a853", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Tot Poste</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: isScostamento(totCap, totPoste) ? "#ea4335" : "#34a853" }}>{formatEuro(totPoste)}</div>
          </div>
        </div>
      </div>

      {/* ── Contatore righe ── */}
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
        {filteredRows.length} righe{hasActiveFilters ? ` (filtrate su ${rows.length} totali)` : ""}
      </div>

      {/* ── Tabella ── */}
      <div style={{ overflowX: "auto", borderRadius: "8px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            {/* Filtri */}
            <tr style={{ background: "#fff", borderBottom: "1px solid #dadce0" }}>
              <th style={{ padding: "4px 6px" }} />
              {[
                { field: "goTo",           opts: goToOptions,        placeholder: "Tutti" },
                { field: "applicativo",    opts: applicativoOptions, placeholder: "Tutti" },
                null,
                { field: "annoCompetenza", opts: annoOptions,        placeholder: "Tutti" },
                { field: "stato",          opts: statoOptions,       placeholder: "Tutti" },
                null,
                { field: "pAnno",          opts: pAnnoOptions,       placeholder: "Tutti" },
                { field: "pRelease",       opts: pReleaseOptions,    placeholder: "Tutte" },
                null, null, null,
              ].map((col, i) => (
                <th key={i} style={{ padding: "4px 6px" }}>
                  {col ? (
                    <select style={selectStyle} value={filters[col.field]} onChange={(e) => handleFilterChange(col.field, e.target.value)}>
                      <option value="">{col.placeholder}</option>
                      {col.opts.map((v) => <option key={v} value={String(v)}>{v}</option>)}
                    </select>
                  ) : null}
                </th>
              ))}
            </tr>
            {/* Intestazioni */}
            <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dadce0" }}>
              {["ID","GoTo","Applicativo","Descrizione","Anno","Stato","Importo CAP","P Anno","P Release","P Importo","P Note",""].map((h) => (
                <th key={h} style={{ padding: "10px 8px", textAlign: h === "Importo CAP" || h === "P Importo" ? "right" : "left", fontWeight: 600, fontSize: "13px", color: "#444", whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((r, index) => {
              const scost = isScostamento(r.importoExcel, r.pImporto);
              return (
                <tr
                  key={r.id}
                  style={{
                    backgroundColor: scost ? "#fff5f5" : index % 2 === 0 ? "white" : "#fafafa",
                    borderBottom: "1px solid #f0f0f0",
                    transition: "background-color 0.1s",
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.backgroundColor = scost ? "#ffe8e8" : "#f0f4ff"}
                  onMouseLeave={(e) => e.currentTarget.style.backgroundColor = scost ? "#fff5f5" : index % 2 === 0 ? "white" : "#fafafa"}
                >
                  <td style={{ ...TD }}>{r.excelId}</td>
                  <td style={{ ...TD }}>{r.goTo}</td>
                  <td style={{ ...TD }}>{r.applicativo}</td>
                  <td style={{ ...TD, maxWidth: "300px" }}>{r.descrizione}</td>
                  <td style={{ ...TD, textAlign: "center" }}>{r.annoCompetenza}</td>
                  <td style={{ ...TD }}>
                    <span style={{
                      display: "inline-block", padding: "2px 8px", borderRadius: "12px",
                      fontSize: "13px",
                      background: r.stato === "Approvato" ? "#e6f4ea" : r.stato === "In approvazione" ? "#fff8e1" : "#f1f3f4",
                      color:      r.stato === "Approvato" ? "#2e7d32" : r.stato === "In approvazione" ? "#e65100" : "#555",
                    }}>{r.stato}</span>
                  </td>
                  <td style={{ ...TD, textAlign: "right" }}>{formatEuro(r.importoExcel)}</td>

                  <td style={{ ...TD }}>
                    <input type="number" value={r.pAnno}
                      onChange={(e) => handleChange(index, "pAnno", e.target.value)}
                      style={inputStyle({ width: "68px", textAlign: "center" })}
                    />
                  </td>

                  <td style={{ ...TD }}>
                    <input value={r.pRelease}
                      onChange={(e) => handleChange(index, "pRelease", e.target.value)}
                      style={inputStyle({ width: "90px" })}
                    />
                  </td>

                  <td style={{ ...TD, textAlign: "right" }}>
                    <input
                      type="text"
                      value={editingImporto[r.id] !== undefined ? editingImporto[r.id] : formatEuro(r.pImporto)}
                      onFocus={() => setEditingImporto((prev) => ({ ...prev, [r.id]: r.pImporto ?? "" }))}
                      onChange={(e) => setEditingImporto((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      onBlur={(e) => {
                        let raw = e.target.value.trim();
                        if (raw.includes(".") && raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
                        else raw = raw.replace(",", ".");
                        raw = raw.replace(/[^\d.]/g, "");
                        const value = isNaN(parseFloat(raw)) ? 0 : parseFloat(raw);
                        handleChange(index, "pImporto", value);
                        setEditingImporto((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
                      }}
                      style={inputStyle({
                        width: "120px", textAlign: "right",
                        backgroundColor: savedRows[r.id] ? "#d4edda" : "",
                        transition: "background-color 0.3s ease",
                      })}
                    />
                  </td>

                  <td style={{ ...TD }}>
                    <input value={r.pNote ?? ""}
                      onChange={(e) => handleChange(index, "pNote", e.target.value)}
                      style={inputStyle({ width: "100%", minWidth: "120px" })}
                    />
                  </td>

                  <td style={{ ...TD, textAlign: "center" }}>
                    <button
                      onClick={() => handleSave(r)}
                      style={{
                        ...btn("primary"),
                        padding: "5px 12px", fontSize: "13px",
                        background: savedRows[r.id] ? "#34a853" : "#1a73e8",
                      }}
                    >
                      {savedRows[r.id] ? "✓" : "Salva"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "#888", fontSize: "14px" }}>
            Nessun risultato trovato
          </div>
        )}
      </div>
    </div>
  );
}

export default MevPage;
