import { useEffect, useState, useRef } from "react";
import {
  getMevList, updateMev, alignMevData, exportMev, uploadExcel, getRtiSocieta
} from "../services/mevService";
import { fmtItIT } from "../utils";

// ── Helpers RTI (stessa logica di MevCapPage) ─────────────────────────────────
const parseSocietà = (val) => {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return val ? [val] : [];
};

const resolveCapMandanti = (capVal, ietVal, rtiRows = []) => {
  const byId = (id) => {
    const found = rtiRows.find(r => String(r._id || r.id) === String(id) || Number(r._id || r.id) === Number(id));
    return found?.societa || null;
  };
  const fromCap = (() => {
    if (!capVal) return [];
    const trimmed = String(capVal).trim().toLowerCase();
    if (trimmed === "x") { const soc = byId(1); return soc ? [soc] : ["Capgemini Italia S.p.A."]; }
    return parseSocietà(capVal);
  })();
  const fromIet = (() => {
    if (!ietVal) return [];
    const trimmed = String(ietVal).trim().toLowerCase();
    if (trimmed === "x") { const soc = byId(2); return soc ? [soc] : ["I&T"]; }
    return parseSocietà(ietVal);
  })();
  const combined = [...fromCap];
  fromIet.forEach(s => { if (!combined.includes(s)) combined.push(s); });
  return combined;
};

const resolveSubco = (subcoVal, rtiRows = []) => {
  if (!subcoVal) return [];
  const byId = (id) => {
    const found = rtiRows.find(r => String(r._id || r.id) === String(id) || Number(r._id || r.id) === Number(id));
    return found?.societa || null;
  };
  // prova prima come JSON array di id
  try {
    const parsed = JSON.parse(subcoVal);
    if (Array.isArray(parsed)) {
      return parsed.map(id => byId(id) || String(id)).filter(Boolean);
    }
  } catch {}
  // fallback: stringa separata da virgola/punto e virgola
  return subcoVal.split(/[,;]+/).map(s => s.trim()).filter(Boolean);
};

const FILTERS_STORAGE_KEY = "mevPageFilters";

// ── MultiSelect dropdown con checkbox ────────────────────────────────────────
function MultiSelect({ options, selected, onChange, placeholder, formatOption }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (val) => {
    if (selected.includes(val)) onChange(selected.filter((v) => v !== val));
    else onChange([...selected, val]);
  };

  const label = selected.length === 0
    ? placeholder
    : selected.length === 1
      ? String(selected[0])
      : `${selected.length} selezionati`;

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <div
        onClick={() => setOpen((v) => !v)}
        style={{
          padding: "4px 6px", border: "1px solid #dadce0", borderRadius: "4px",
          fontSize: "12px", background: "white", cursor: "pointer", color: selected.length ? "#1a73e8" : "#333",
          fontWeight: selected.length ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
          userSelect: "none",
        }}
      >
        {label} ▾
      </div>

      {open && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            zIndex: 20,
            background: "white",
            border: "1px solid #dadce0",
            borderRadius: "4px",
            marginTop: "2px",
            minWidth: "220px",
            maxHeight: "300px",
            overflowY: "auto",
            boxShadow: "0 4px 8px rgba(0,0,0,0.15)"
          }}
        >
          <div
            style={{
              position: "sticky",
              top: 0,
              zIndex: 2,
              display: "flex",
              justifyContent: "space-between",
              background: "white",
              borderBottom: "1px solid #dadce0",
              boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
            }}
          >
            <div
              onClick={() => onChange(options.map((o) => String(o)))}
              style={{
                padding: "8px 10px",
                color: "#34a853",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600
              }}
            >
              ✓ Seleziona tutti
            </div>

            <div
              onClick={() => onChange([])}
              style={{
                padding: "8px 10px",
                color: "#ea4335",
                cursor: "pointer",
                fontSize: "11px",
                fontWeight: 600
              }}
            >
              ✕ Deseleziona tutti
            </div>
          </div>

          {options.map((opt) => (
            <label
              key={opt}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                padding: "6px 10px",
                fontSize: "12px",
                cursor: "pointer",
                textAlign: "left"
              }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.background = "#f8f9fa")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.background = "white")
              }
            >
              <input
                type="checkbox"
                checked={selected.includes(String(opt))}
                onChange={() => toggle(String(opt))}
                style={{ cursor: "pointer", margin: 0 }}
              />
              <span style={{ textAlign: "left" }}>{formatOption ? formatOption(opt) : opt}</span>
            </label>
          ))}
        </div>
      )}

    </div>
  );
}

// ── Utils ────────────────────────────────────────────────────────────────────
const formatEuro = (value) => {
  if (value === null || value === undefined || value === "") return "";
  const num = parseFloat(value);
  if (isNaN(num)) return "";
  return `€ ${fmtItIT(num)}`;
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
    primary: { ...base, background: "#1a73e8", color: "#fff", boxShadow: "0 1px 3px rgba(26,115,232,.35)" },
    danger: { ...base, background: "#ea4335", color: "#fff", boxShadow: "0 1px 3px rgba(234,67,53,.35)" },
    ghost: { ...base, background: "#f1f3f4", color: "#444", border: "1px solid #dadce0" },
    success: { ...base, background: "#34a853", color: "#fff", boxShadow: "0 1px 3px rgba(52,168,83,.35)" },
    default: { ...base, background: "#f1f3f4", color: "#444", border: "1px solid #dadce0" },
  };
  return variants[variant] || variants.default;
};


const inputStyle = (extra = {}) => ({
  padding: "5px 8px", border: "1px solid #dadce0", borderRadius: "4px",
  fontSize: "13px", background: "white", color: "#333", ...extra,
});

// ── Modale dettaglio sola lettura ─────────────────────────────────────────────
const ViewSection = ({ title, children }) => (
  <div style={{ marginBottom: "18px" }}>
    <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.6px", borderBottom: "1px solid #e8f0fe", paddingBottom: "4px", marginBottom: "10px" }}>{title}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px" }}>{children}</div>
  </div>
);

const ViewField = ({ label, value, wide, green }) => (
  <div style={{ minWidth: wide ? "100%" : "160px", flex: wide ? "1 1 100%" : "1 1 160px" }}>
    <div style={{ fontSize: "11px", color: "#888", marginBottom: "2px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>{label}</div>
    <div style={{ fontSize: "13px", color: green ? "#12c937" : "#1a1a1a", fontWeight: green ? 700 : 400, padding: "4px 8px", background: "#f8f9fa", borderRadius: "4px", minHeight: "28px" }}>{value || "—"}</div>
  </div>
);

// ── Componente ───────────────────────────────────────────────────────────────
function MevPage({ onUnauthorized, onRowsChange, onFilteredRowsChange, onAligned, ambienteId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savedRows, setSavedRows] = useState({});
  const [editingImporto, setEditingImporto] = useState({});
  const [editingBdo, setEditingBdo] = useState({});
  const [aligning, setAligning] = useState(false);
  const [alignStatus, setAlignStatus] = useState(null); // { step: "running"|"done"|"error", msg: string }
  const [notePopover, setNotePopover] = useState(null); // { id, text, x, y }
  const [viewRow, setViewRow] = useState(null); // riga aperta in sola lettura
  const [rtiRows, setRtiRows] = useState([]);
  const role = localStorage.getItem("role") || "";

  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
    const defaults = { goTo: [], applicativo: [], stato: [], annoCompetenza: [], pAnno: [], pRelease: [], oda: [], rda: [], mandataria: [], subco: [], importoExcel: [] };
    if (!saved) return defaults;
    const parsed = JSON.parse(saved);
    return { ...defaults, ...parsed };
  });

  // ── Data load ──────────────────────────────────────────────────────────────
  const loadMev = async () => {
    setLoading(true);
    setRows([]);
    onRowsChange?.([]);
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

  useEffect(() => { loadMev(); }, [ambienteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { getRtiSocieta().then(setRtiRows).catch(() => {}); }, [ambienteId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters)); }, [filters]);

  const resetFilters = () => {
    setFilters({ goTo: [], applicativo: [], stato: [], annoCompetenza: [], pAnno: [], pRelease: [], oda: [], mandataria: [], subco: [], importoExcel: [] });
    localStorage.removeItem(FILTERS_STORAGE_KEY);
  };

  const handleFilterChange = (field, value) =>
    setFilters((prev) => ({ ...prev, [field]: value }));

  // ── Options ────────────────────────────────────────────────────────────────
  const buildOptions = (field) =>
    [...new Set(rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== ""))].sort();

  const goToOptions = buildOptions("goTo");
  const applicativoOptions = buildOptions("applicativo");
  const annoOptions = buildOptions("annoCompetenza");
  const pAnnoOptions = buildOptions("pAnno");
  const pReleaseOptions = buildOptions("pRelease");
  const subcoOptions = [...new Set(
    rows.flatMap(r => resolveSubco(r.subco, rtiRows))
  )].filter(Boolean).sort();
  const importoExcelOptions = [...new Set(rows.map((r) => r.importoExcel).filter((v) => v !== null && v !== undefined && v !== ""))].sort((a, b) => Number(a) - Number(b)).map(String);

  // Opzioni filtro Mandataria/Mandante: nomi reali risolti da rtiRows
  const mandatariaOptions = [...new Set(
    rows.flatMap(r => resolveCapMandanti(r.capgemini, r.iet, rtiRows))
  )].filter(Boolean).sort();

  // Stato: include "(vuoto)" se esistono righe con stato vuoto/null
  const hasEmptyStato = rows.some((r) => !r.stato || r.stato.trim() === "");
  const statoOptions = [
    ...buildOptions("stato"),
    ...(hasEmptyStato ? ["(vuoto)"] : []),
  ];

  // RDA: include "(vuoto)" se esistono righe con RDA vuoto/null
  const hasEmptyOda = rows.some(
    (r) => !r.bc || String(r.bc).trim() === ""
  );

  const odaOptions = [
    ...buildOptions("bc"),
    ...(hasEmptyOda ? ["(vuoto)"] : []),
  ];

  const hasEmptyRda = rows.some((r) => !r.atId || String(r.atId).trim() === "");
  const rdaOptions = [
    ...buildOptions("atId"),
    ...(hasEmptyRda ? ["(vuoto)"] : []),
  ];


  // ── Filtering ──────────────────────────────────────────────────────────────
  const matchStato = (r) => {
    if (filters.stato.length === 0) return true;
    const val = r.stato ?? "";
    if (!val.trim() && filters.stato.includes("(vuoto)")) return true;
    return filters.stato.includes(String(val));
  };

  const matchOda = (r) => {
    if (filters.oda.length === 0) return true;
    const val = r.bc ?? "";
    if (!String(val).trim() && filters.oda.includes("(vuoto)")) return true;
    return filters.oda.includes(String(val));
  };

  const matchRda = (r) => {
    if (filters.rda.length === 0) return true;
    const val = r.atId ?? "";
    if (!String(val).trim() && filters.rda.includes("(vuoto)")) return true;
    return filters.rda.includes(String(val));
  };


  const filteredRows = rows.filter((r) =>
    (filters.goTo.length === 0 || filters.goTo.includes(String(r.goTo))) &&
    (filters.applicativo.length === 0 || filters.applicativo.includes(String(r.applicativo))) &&
    matchStato(r) &&
    (filters.annoCompetenza.length === 0 || filters.annoCompetenza.includes(String(r.annoCompetenza))) &&
    matchOda(r) &&
    matchRda(r) &&
    (filters.pAnno.length === 0 || filters.pAnno.includes(String(r.pAnno))) &&
    (filters.pRelease.length === 0 || filters.pRelease.includes(String(r.pRelease))) &&
    (filters.mandataria.length === 0 || resolveCapMandanti(r.capgemini, r.iet, rtiRows).some(s => filters.mandataria.includes(s))) &&
    (filters.subco.length === 0 || resolveSubco(r.subco, rtiRows).some(s => filters.subco.includes(s))) &&
    (filters.importoExcel.length === 0 || filters.importoExcel.includes(String(r.importoExcel)))
  );

  const totCap = filteredRows.reduce((s, r) => s + (Number(r.importoExcel) || 0), 0);
  const totPoste = filteredRows.reduce((s, r) => s + (Number(r.pImporto) || 0), 0);
  const totOda = filteredRows.reduce((s, r) => s + (Number(r.ordinatoBdo) || 0), 0);
  const hasActiveFilters = Object.values(filters).some((v) => Array.isArray(v) ? v.length > 0 : v !== "");

  useEffect(() => { onFilteredRowsChange?.(filteredRows); }, [filteredRows]); // eslint-disable-line

  // ── Editing ────────────────────────────────────────────────────────────────
  const handleChange = (rowId, field, value) => {
    setRows((prev) =>
      prev.map((r) => (r.id === rowId ? { ...r, [field]: value } : r))
    );
  };

  const rowsRef = useRef(rows);
  useEffect(() => { rowsRef.current = rows; }, [rows]);

  const handleSave = async (rowId) => {
    const row = rowsRef.current.find((r) => r.id === rowId);
    if (!row) return;
    try {
      const updatedItem = await updateMev(row.id, {
        pAnno: Number(row.pAnno), pRelease: row.pRelease,
        pImporto: Number(row.pImporto), pNote: row.pNote,
        importoBdo: Number(row.importoBdo && row.importoBdo !== 0 ? row.importoBdo : (row.ordinatoBdo ?? 0)),
      });
      setRows((prev) =>
        prev.map((r) => (r.id === row.id ? { ...r, ...updatedItem } : r))
      );
      setSavedRows((prev) => ({ ...prev, [row.id]: true }));
      setTimeout(() => setSavedRows((prev) => ({ ...prev, [row.id]: false })), 2000);
    } catch {
      alert("Errore salvataggio");
    }
  };

  // ── Chiudi popover cliccando fuori ────────────────────────────────────────
  useEffect(() => {
    if (!notePopover) return;
    const handler = (e) => {
      if (!e.target.closest("[data-note-popover]") && !e.target.closest("button[data-note-btn]"))
        setNotePopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notePopover]);

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
            setAlignStatus({ step: "running", msg: "Avvio allineamento..." });
            try {
              setAlignStatus({ step: "running", msg: "Importazione dati in corso..." });
              const result = await alignMevData({});
              const msg = result.countContratti !== undefined
                ? `Completato: ${result.count} record MEV, ${result.countContratti} contratti`
                : `Completato: ${result.count} record caricati`;
              setAlignStatus({ step: "done", msg });
              onAligned?.();
              await loadMev();
              setTimeout(() => setAlignStatus(null), 2000);
            } catch (e) {
              setAlignStatus({ step: "error", msg: `Errore: ${e.message}` });
              setTimeout(() => setAlignStatus(null), 4000);
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

        {/* Carica Excel — Admin e SuperAdmin */}
        {["Admin", "SuperAdmin"].includes(role) && (
          <>
            <input
              id="upload-excel"
              type="file"
              accept=".xlsx"
              style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  await uploadExcel(file);
                  alert("File caricato. Clicca 'Allinea Dati' per importare.");
                } catch (err) {
                  alert(`Errore caricamento: ${err.message}`);
                }
                e.target.value = "";
              }}
            />
            <label htmlFor="upload-excel" style={{ ...btn("ghost"), cursor: "pointer" }}>
              ↑ Carica Excel
            </label>
          </>
        )}

        {/* Totali */}
        <div style={{ marginLeft: "auto", display: "flex", gap: "16px" }}>
          <div style={{ background: "#e8f0fe", borderRadius: "8px", padding: "8px 16px", textAlign: "right", minWidth: "160px" }}>
            <div style={{ fontSize: "11px", color: "#1a73e8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Totale Fornitura</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a73e8" }}>{formatEuro(totCap)}</div>
          </div>
          <div style={{ background: "#e6f9f0", borderRadius: "8px", padding: "8px 16px", textAlign: "right", minWidth: "160px" }}>
            <div style={{ fontSize: "11px", color: "#12c937", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Totale ODA</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#12c937" }}>{formatEuro(totOda)}</div>
          </div>
          <div style={{
            background: isScostamento(totCap, totPoste) ? "#fce8e6" : "#e6f4ea",
            borderRadius: "8px", padding: "8px 16px", textAlign: "right", minWidth: "160px"
          }}>
            <div style={{ fontSize: "11px", color: isScostamento(totCap, totPoste) ? "#ea4335" : "#34a853", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>Totale Poste</div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: isScostamento(totCap, totPoste) ? "#ea4335" : "#34a853" }}>{formatEuro(totPoste)}</div>
          </div>
        </div>
      </div>

      {/* ── Contatore righe ── */}
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
        {filteredRows.length} righe{hasActiveFilters ? ` (filtrate su ${rows.length} totali)` : ""}
      </div>

      {/* ── Tabella ── */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 220px)", borderRadius: "8px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            {/* Filtri */}
            <tr style={{ background: "#fff", borderBottom: "1px solid #dadce0" }}>
              <th style={{ padding: "4px 6px" }}>{/* ID */}</th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={goToOptions} selected={filters.goTo} onChange={(v) => handleFilterChange("goTo", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={applicativoOptions} selected={filters.applicativo} onChange={(v) => handleFilterChange("applicativo", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}>{/* Descrizione */}</th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={annoOptions} selected={filters.annoCompetenza} onChange={(v) => handleFilterChange("annoCompetenza", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={statoOptions} selected={filters.stato} onChange={(v) => handleFilterChange("stato", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={importoExcelOptions} selected={filters.importoExcel} onChange={(v) => handleFilterChange("importoExcel", v)} placeholder="Tutti" formatOption={(v) => `€ ${fmtItIT(parseFloat(v))}`} /></th>
              <th style={{ padding: "4px 6px" }}>{/* Note */}</th>
               <th style={{ padding: "4px 6px" }}><MultiSelect options={odaOptions} selected={filters.oda} onChange={(v) => handleFilterChange("oda", v)} placeholder="Tutti" /></th>
               <th style={{ padding: "4px 6px" }}><MultiSelect options={rdaOptions} selected={filters.rda} onChange={(v) => handleFilterChange("rda", v)} placeholder="Tutti" /></th>
               <th style={{ padding: "4px 6px" }}>{/* Importo ODA */}</th>
               <th style={{ padding: "4px 6px" }}><MultiSelect options={mandatariaOptions} selected={filters.mandataria} onChange={(v) => handleFilterChange("mandataria", v)} placeholder="Tutti" /></th>
               <th style={{ padding: "4px 6px" }}><MultiSelect options={subcoOptions} selected={filters.subco} onChange={(v) => handleFilterChange("subco", v)} placeholder="Tutti" /></th>
               <th style={{ padding: "4px 6px" }}><MultiSelect options={pAnnoOptions} selected={filters.pAnno} onChange={(v) => handleFilterChange("pAnno", v)} placeholder="Tutti" /></th>
               <th style={{ padding: "4px 6px" }}><MultiSelect options={pReleaseOptions} selected={filters.pRelease} onChange={(v) => handleFilterChange("pRelease", v)} placeholder="Tutte" /></th>
               <th style={{ padding: "4px 6px" }}>{/* P Importo */}</th>
               <th style={{ padding: "4px 6px" }}>{/* P Note */}</th>
              <th style={{ padding: "4px 6px" }}>{/* Azioni */}</th>
            </tr>
            {/* Intestazioni */}
            <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dadce0" }}>
              {["ID", "GoTo", "Applicativo", "Descrizione", "Anno", "Stato", "Importo CAP", "Note", "ODA", "RDA", "Importo ODA", "Mandataria/Mandante", "Subco", "P Anno", "P Release", "P Importo", "P Note", "Azioni"].map((h) => (
                <th key={h} style={{ padding: "10px 8px", textAlign: "center", fontWeight: 600, fontSize: "13px", color: "#444", whiteSpace: "nowrap", minWidth: h === "Importo CAP" ? "130px" : undefined }}>{h}</th>
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
                    cursor: "pointer",
                  }}
                  onClick={(e) => {
                    // non aprire il modale se si clicca su input, button o select
                    if (["INPUT","BUTTON","SELECT","TEXTAREA"].includes(e.target.tagName)) return;
                    setViewRow(r);
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
                      color: r.stato === "Approvato" ? "#2e7d32" : r.stato === "In approvazione" ? "#e65100" : "#555",
                    }}>{r.stato || "(vuoto)"}</span>
                  </td>
                  <td style={{ ...TD, textAlign: "right", minWidth: "130px", whiteSpace: "nowrap" }}>{formatEuro(r.importoExcel)}</td>

                  <td style={{ ...TD, textAlign: "center" }}>
                    {r.noteExcel ? (
                      <button
                        data-note-btn="1"
                        onClick={(e) => {
                          if (notePopover && notePopover.id === r.id) { setNotePopover(null); return; }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setNotePopover({ id: r.id, text: r.noteExcel, x: rect.left, y: rect.bottom + window.scrollY + 6 });
                        }}
                        style={{
                          padding: "3px 10px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
                          cursor: "pointer", border: "1px solid #1a73e8",
                          background: notePopover?.id === r.id ? "#1a73e8" : "#e8f0fe",
                          color: notePopover?.id === r.id ? "#fff" : "#1a73e8",
                        }}
                      >
                        Note
                      </button>
                    ) : null}
                  </td>

                  <td style={{ ...TD, color: "#12c937", fontWeight: "bold", fontSize: "13px" }}>{r.bc ?? ""}</td>
                  <td style={{ ...TD, color: "#12c937", fontWeight: "bold", fontSize: "13px" }}>{r.atId ?? ""}</td>
                  <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap", color: "#12c937", fontWeight: "bold", fontSize: "13px" }}>{formatEuro(r.ordinatoBdo)}</td>

                  <td style={{ ...TD }}>
                    {resolveCapMandanti(r.capgemini, r.iet, rtiRows).length > 0
                      ? <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                          {resolveCapMandanti(r.capgemini, r.iet, rtiRows).map(s => (
                            <span key={s} style={{ background: "#eff6ff", color: "#1a73e8", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" }}>{s}</span>
                          ))}
                        </div>
                      : <span style={{ color: "#cbd5e1", fontSize: "11px" }}>—</span>
                    }
                  </td>
                  <td style={{ ...TD }}>
                    {resolveSubco(r.subco, rtiRows).length > 0
                      ? <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                          {resolveSubco(r.subco, rtiRows).map(s => (
                            <span key={s} style={{ background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" }}>{s}</span>
                          ))}
                        </div>
                      : <span style={{ color: "#cbd5e1", fontSize: "11px" }}>—</span>
                    }
                  </td>

                  <td style={{ ...TD }}>
                    <input type="number" value={r.pAnno}
                      onChange={(e) => handleChange(r.id, "pAnno", e.target.value)}
                      style={inputStyle({ width: "68px", textAlign: "center" })}
                    />
                  </td>

                  <td style={{ ...TD }}>
                    <input value={r.pRelease}
                      onChange={(e) => handleChange(r.id, "pRelease", e.target.value)}
                      style={inputStyle({ width: "90px" })}
                    />
                  </td>

                  <td style={{ ...TD, textAlign: "right" }}>
                    <input
                      type="text"
                      value={editingBdo[r.id] !== undefined ? editingBdo[r.id] : formatEuro(r.importoBdo ?? 0)}
                      onFocus={() => setEditingBdo((prev) => ({ ...prev, [r.id]: r.importoBdo ?? "" }))}
                      onChange={(e) => setEditingBdo((prev) => ({ ...prev, [r.id]: e.target.value }))}
                      onBlur={(e) => {
                        let raw = e.target.value.trim();
                        if (raw.includes(".") && raw.includes(",")) raw = raw.replace(/\./g, "").replace(",", ".");
                        else raw = raw.replace(",", ".");
                        raw = raw.replace(/[^\d.]/g, "");
                        const value = isNaN(parseFloat(raw)) ? 0 : parseFloat(raw);
                        handleChange(r.id, "importoBdo", value);
                        setEditingBdo((prev) => { const n = { ...prev }; delete n[r.id]; return n; });
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
                      onChange={(e) => handleChange(r.id, "pNote", e.target.value)}
                      style={inputStyle({ width: "100%", minWidth: "120px" })}
                    />
                  </td>

                  <td style={{ ...TD, textAlign: "center" }}>
                    <button
                      onClick={() => handleSave(r.id)}
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

      {/* ── Modale progress Allinea Dati ── */}
      {alignStatus && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "12px", padding: "28px 36px", minWidth: "320px", maxWidth: "440px", boxShadow: "0 8px 40px rgba(0,0,0,0.2)", textAlign: "center" }}>
            {alignStatus.step === "running" && (
              <div style={{ marginBottom: "16px" }}>
                <div style={{ width: "40px", height: "40px", border: "4px solid #e8f0fe", borderTop: "4px solid #1a73e8", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 14px" }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            )}
            {alignStatus.step === "done" && (
              <div style={{ fontSize: "32px", marginBottom: "12px" }}>✓</div>
            )}
            {alignStatus.step === "error" && (
              <div style={{ fontSize: "32px", marginBottom: "12px", color: "#ea4335" }}>✗</div>
            )}
            <div style={{ fontSize: "15px", fontWeight: 600, color: alignStatus.step === "error" ? "#ea4335" : alignStatus.step === "done" ? "#34a853" : "#1a73e8", marginBottom: "6px" }}>
              {alignStatus.step === "running" ? "Allineamento in corso" : alignStatus.step === "done" ? "Allineamento completato" : "Errore"}
            </div>
            <div style={{ fontSize: "13px", color: "#555" }}>{alignStatus.msg}</div>
          </div>
        </div>
      )}

      {/* ── Modale dettaglio riga (sola lettura) ── */}
      {viewRow && (
        <div
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={() => setViewRow(null)}
        >
          <div
            style={{ background: "#fff", borderRadius: "12px", padding: "28px 32px", width: "700px", maxWidth: "95vw", maxHeight: "85vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,0.2)" }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "20px" }}>
              <div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a" }}>{viewRow.goTo || "—"}</div>
                <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a", marginTop: "2px" }}>{viewRow.descrizione || ""}</div>
              </div>
              <button onClick={() => setViewRow(null)} style={{ background: "none", border: "none", fontSize: "22px", cursor: "pointer", color: "#888", lineHeight: 1 }}>×</button>
            </div>

            {/* Sezione Identificazione */}
            <ViewSection title="Identificazione">
              <ViewField label="ID"          value={viewRow.excelId} />
              <ViewField label="GoTo"        value={viewRow.goTo} />
              <ViewField label="Applicativo" value={viewRow.applicativo} />
            </ViewSection>

            {/* Sezione Responsabili */}
            <ViewSection title="Responsabili">
              <ViewField label="PM Poste"    value={viewRow.pmPoste} />
              <ViewField label="PM CAP"      value={viewRow.pmCap} />
              {/* Tabella Mandataria/Mandante */}
              <div style={{ width: "100%", marginTop: "6px" }}>
                <div style={{ fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: "4px" }}>Mandataria / Mandante</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f0f4ff" }}>
                      <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#1a73e8", border: "1px solid #dbeafe" }}>Società</th>
                      <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#1a73e8", border: "1px solid #dbeafe" }}>Ruolo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const mandanti = resolveCapMandanti(viewRow.capgemini, viewRow.iet, rtiRows);
                      return mandanti.length > 0
                        ? mandanti.map((s, i) => (
                            <tr key={i}>
                              <td style={{ padding: "5px 10px", border: "1px solid #f0f0f0" }}>{s}</td>
                              <td style={{ padding: "5px 10px", border: "1px solid #f0f0f0", color: "#555" }}>
                                {rtiRows.find(r => r.societa === s)?.ruolo || "Mandataria/Mandante"}
                              </td>
                            </tr>
                          ))
                        : <tr><td colSpan={2} style={{ padding: "5px 10px", color: "#aaa", fontStyle: "italic" }}>—</td></tr>;
                    })()}
                  </tbody>
                </table>
              </div>
              {/* Tabella SubCo */}
              <div style={{ width: "100%", marginTop: "10px" }}>
                <div style={{ fontSize: "11px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", marginBottom: "4px" }}>SubCo</div>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#fffbeb" }}>
                      <th style={{ padding: "5px 10px", textAlign: "left", fontWeight: 600, color: "#d97706", border: "1px solid #fde68a" }}>Società</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(() => {
                      const subs = resolveSubco(viewRow.subco, rtiRows);
                      return subs.length > 0
                        ? subs.map((s, i) => (
                            <tr key={i}>
                              <td style={{ padding: "5px 10px", border: "1px solid #f0f0f0" }}>{s}</td>
                            </tr>
                          ))
                        : <tr><td style={{ padding: "5px 10px", color: "#aaa", fontStyle: "italic" }}>—</td></tr>;
                    })()}
                  </tbody>
                </table>
              </div>
            </ViewSection>

            {/* Sezione Release */}
            <ViewSection title="Release">
              <ViewField label="Anno"        value={viewRow.annoCompetenza} />
              <ViewField label="Release"     value={viewRow.releaseExcel} />
              <ViewField label="P Anno"      value={viewRow.pAnno} />
              <ViewField label="P Release"   value={viewRow.pRelease} />
            </ViewSection>

            {/* Sezione Stato e Contratto */}
            <ViewSection title="Stato e Contratto">
              <ViewField label="Stato"          value={viewRow.stato} />
              <ViewField label="Tipo Contratto" value={viewRow.tipoContratto} />
              <ViewField label="BC (ODA)"       value={viewRow.bc} green />
              <ViewField label="RDA (AT ID)"    value={viewRow.atId} green />
              <ViewField label="Contratto"      value={viewRow.contratto} />
              <ViewField label="RDA"            value={viewRow.rda} />
              <ViewField label="Importo ODA"    value={viewRow.ordinatoBdo != null ? formatEuro(viewRow.ordinatoBdo) : "—"} green />
              <ViewField label="P Importo"      value={viewRow.importoBdo != null ? formatEuro(viewRow.importoBdo) : "—"} />
              <ViewField label="Importo CAP"    value={viewRow.importoExcel != null ? formatEuro(viewRow.importoExcel) : "—"} />
            </ViewSection>

          </div>
        </div>
      )}

      {/* ── Popover Note ── */}
      {notePopover && (
        <div
          data-note-popover="1"
          style={{
            position: "fixed",
            left: Math.min(notePopover.x, window.innerWidth - 320),
            top: notePopover.y - window.scrollY,
            zIndex: 9999,
            background: "#fff",
            border: "1px solid #dadce0",
            borderRadius: "8px",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            padding: "12px 16px",
            maxWidth: "300px",
            minWidth: "180px",
            fontSize: "13px",
            color: "#333",
            lineHeight: "1.5",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontWeight: 700, fontSize: "12px", color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Note</span>
            <span onClick={() => setNotePopover(null)} style={{ cursor: "pointer", color: "#888", fontSize: "16px", lineHeight: 1 }}>×</span>
          </div>
          {notePopover.text}
        </div>
      )}
    </div>
  );
}

export default MevPage;
