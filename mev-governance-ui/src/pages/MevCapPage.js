import { useEffect, useState, useRef } from "react";
import {
  getMevList, updateMev, alignMevData, exportMev, uploadExcel
} from "../services/mevService";
import { fmtItIT } from "../utils";

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
        {label} {"\u25BE"}
      </div>

      {open && (
        <div style={{
          position: "absolute", top: "100%", left: 0, zIndex: 20,
          background: "white", border: "1px solid #dadce0", borderRadius: "4px",
          marginTop: "2px", minWidth: "220px", maxHeight: "300px", overflowY: "auto",
          boxShadow: "0 4px 8px rgba(0,0,0,0.15)"
        }}>
          <div style={{
            position: "sticky", top: 0, zIndex: 2, display: "flex", justifyContent: "space-between",
            background: "white", borderBottom: "1px solid #dadce0", boxShadow: "0 1px 2px rgba(0,0,0,0.05)"
          }}>
            <div onClick={() => onChange(options.map((o) => String(o)))}
              style={{ padding: "8px 10px", color: "#34a853", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}>
              Seleziona tutti
            </div>
            <div onClick={() => onChange([])}
              style={{ padding: "8px 10px", color: "#ea4335", cursor: "pointer", fontSize: "11px", fontWeight: 600 }}>
              Deseleziona tutti
            </div>
          </div>
          {options.map((opt) => (
            <label key={opt} style={{
              display: "flex", alignItems: "center", gap: "6px", padding: "6px 10px",
              fontSize: "12px", cursor: "pointer", textAlign: "left"
            }}>
              <input type="checkbox" checked={selected.includes(String(opt))} onChange={() => toggle(String(opt))}
                style={{ cursor: "pointer", margin: 0 }} />
              <span>{formatOption ? formatOption(opt) : opt}</span>
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
  return `\u20AC ${fmtItIT(num)}`;
};

const fmtNum = (v) => {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  if (isNaN(n)) return "";
  return fmtItIT(n);
};

const isScostamento = (excel, pianificato) =>
  excel !== null && pianificato !== null && Number(excel) !== Number(pianificato);

const TD = { padding: "6px 8px", fontSize: "13px", color: "#333", verticalAlign: "middle" };

const btn = (variant = "default") => {
  const base = {
    display: "inline-flex", alignItems: "center", gap: "6px",
    padding: "7px 16px", borderRadius: "6px", fontSize: "13px",
    fontWeight: 600, cursor: "pointer", border: "none",
    transition: "opacity 0.15s, box-shadow 0.15s", whiteSpace: "nowrap",
  };
  const variants = {
    primary: { ...base, background: "#1a73e8", color: "#fff", boxShadow: "0 1px 3px rgba(26,115,232,.35)" },
    danger:  { ...base, background: "#ea4335", color: "#fff", boxShadow: "0 1px 3px rgba(234,67,53,.35)" },
    ghost:   { ...base, background: "#f1f3f4", color: "#444", border: "1px solid #dadce0" },
    success: { ...base, background: "#34a853", color: "#fff", boxShadow: "0 1px 3px rgba(52,168,83,.35)" },
    default: { ...base, background: "#f1f3f4", color: "#444", border: "1px solid #dadce0" },
  };
  return variants[variant] || variants.default;
};

const inputStyle = (extra = {}) => ({
  padding: "6px 8px", border: "1px solid #dadce0", borderRadius: "4px",
  fontSize: "13px", background: "white", color: "#333", width: "100%",
  boxSizing: "border-box", ...extra,
});

// ── Modale di modifica ────────────────────────────────────────────────────────
function EditModal({ row, onClose, onSave }) {
  const [form, setForm] = useState({ ...row });
  const [saving, setSaving] = useState(false);

  const set = (field, value) => setForm((prev) => ({ ...prev, [field]: value }));

  const handleSave = async () => {
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { alert(`Errore salvataggio: ${e.message}`); }
    finally { setSaving(false); }
  };

  const Field = ({ label, field, type = "text", readOnly = false, width = "100%" }) => (
    <div style={{ marginBottom: "12px", width }}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
      {readOnly
        ? <div style={{ ...inputStyle(), background: "#f8f9fa", color: "#888" }}>{form[field] ?? ""}</div>
        : <input value={form[field] ?? ""} type={type}
            onChange={(e) => set(field, e.target.value)}
            style={inputStyle()} />
      }
    </div>
  );

  const Section = ({ title, children }) => (
    <div style={{ marginBottom: "18px" }}>
      <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px", borderBottom: "2px solid #e8f0fe", paddingBottom: "4px" }}>{title}</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>{children}</div>
    </div>
  );

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center"
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "white", borderRadius: "12px", boxShadow: "0 8px 40px rgba(0,0,0,0.25)",
        width: "min(880px, 95vw)", maxHeight: "90vh", overflowY: "auto",
        padding: "28px 32px", position: "relative"
      }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
          <div>
            <div style={{ fontSize: "18px", fontWeight: 700, color: "#1a1a1a" }}>Modifica MEV</div>
            <div style={{ fontSize: "13px", color: "#888", marginTop: "2px" }}>
              ID {row.excelId} &mdash; {row.applicativo} &mdash; {row.descrizione}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "22px", color: "#888", lineHeight: 1 }}>x</button>
        </div>

        {/* Sezione: Identificazione */}
        <Section title="Identificazione">
          <Field label="ID Excel" field="excelId" readOnly width="calc(10% - 8px)" />
          <Field label="GoTo" field="goTo" readOnly width="calc(12% - 8px)" />
          <Field label="Applicativo" field="applicativo" readOnly width="calc(18% - 8px)" />
          <Field label="X ORDINE" field="xOrdine" readOnly width="calc(20% - 8px)" />
          <Field label="Descrizione" field="descrizione" readOnly width="calc(40% - 8px)" />
        </Section>

        {/* Sezione: Responsabili */}
        <Section title="Responsabili">
          <Field label="PM Poste" field="pmPoste" width="calc(25% - 8px)" />
          <Field label="PM CAP" field="pmCap" width="calc(25% - 8px)" />
          <Field label="Anno Competenza" field="annoCompetenza" type="number" readOnly width="calc(15% - 8px)" />
          <Field label="Release Excel" field="releaseExcel" readOnly width="calc(20% - 8px)" />
          <Field label="Recupero" field="recupero" width="calc(15% - 8px)" />
        </Section>

        {/* Sezione: Stato e Contratto */}
        <Section title="Stato e Contratto">
          <Field label="Stato" field="stato" width="calc(20% - 8px)" />
          <Field label="Tipo Contratto" field="tipoContratto" width="calc(15% - 8px)" />
          <Field label="BC" field="bc" width="calc(20% - 8px)" />
          <Field label="Contratto" field="contratto" width="calc(15% - 8px)" />
          <Field label="RDA" field="rda" width="calc(15% - 8px)" />
          <Field label="AT ID" field="atId" width="calc(15% - 8px)" />
        </Section>

        {/* Sezione: Importi */}
        <Section title="Importi">
          <Field label="Importo Fornitura" field="importoExcel" readOnly width="calc(20% - 8px)" />
          <Field label="Importo Scontato" field="importoFornituraScontato" readOnly width="calc(20% - 8px)" />
          <Field label="Ordinato (BdO)" field="ordinatoBdo" readOnly width="calc(20% - 8px)" />
          <Field label="Fatturato" field="fatturato" readOnly width="calc(20% - 8px)" />
          <Field label="Residuo Fatt." field="residuoFatturabile" readOnly width="calc(20% - 8px)" />
        </Section>

        {/* Sezione: TOW */}
        <Section title="TOW (gg/qty)">
          <Field label="TOW02.1" field="tow021" type="number" width="calc(16% - 8px)" />
          <Field label="TOW02.2" field="tow022" type="number" width="calc(16% - 8px)" />
          <Field label="TOW02.3" field="tow023" type="number" width="calc(16% - 8px)" />
          <Field label="TOW02.4" field="tow024" type="number" width="calc(16% - 8px)" />
          <Field label="TOW02.5" field="tow025" type="number" width="calc(16% - 8px)" />
          <Field label="TOW02.6" field="tow026" type="number" width="calc(16% - 8px)" />
          <Field label="Totale TOW" field="towTotale" readOnly width="calc(20% - 8px)" />
        </Section>

        {/* Sezione: Extra */}
        <Section title="Extra">
          <Field label="Accantonato" field="accantonato" type="number" width="calc(15% - 8px)" />
          <Field label="NEL" field="nel" width="calc(15% - 8px)" />
          <Field label="In Vita" field="inVita" width="calc(15% - 8px)" />
          <Field label="CM" field="cm" width="calc(15% - 8px)" />
          <Field label="SUBCO" field="subco" width="calc(20% - 8px)" />
          <Field label="TBD" field="tbd" width="calc(20% - 8px)" />
        </Section>

        {/* Sezione: Note Excel */}
        <Section title="Note Excel">
          <div style={{ width: "100%" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Note</label>
            <textarea value={form.noteExcel ?? ""} onChange={(e) => set("noteExcel", e.target.value)}
              style={{ ...inputStyle(), minHeight: "80px", resize: "vertical" }} />
          </div>
        </Section>

        {/* Sezione: PMO */}
        <Section title="PMO (editabili)">
          <Field label="P Anno" field="pAnno" type="number" width="calc(12% - 8px)" />
          <Field label="P Release" field="pRelease" width="calc(20% - 8px)" />
          <Field label="P Importo" field="pImporto" type="number" width="calc(20% - 8px)" />
          <Field label="Importo BDO" field="importoBdo" type="number" width="calc(20% - 8px)" />
          <div style={{ width: "calc(28% - 8px)" }}>
            <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>P Note</label>
            <textarea value={form.pNote ?? ""} onChange={(e) => set("pNote", e.target.value)}
              style={{ ...inputStyle(), minHeight: "60px", resize: "vertical" }} />
          </div>
        </Section>

        {/* Azioni */}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "8px", paddingTop: "16px", borderTop: "1px solid #f0f0f0" }}>
          <button style={btn("ghost")} onClick={onClose}>Annulla</button>
          <button style={btn("primary")} onClick={handleSave} disabled={saving}>
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────────────
function MevCapPage({ onUnauthorized, onRowsChange, onFilteredRowsChange, onAligned, ambienteId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aligning, setAligning] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [savedRows, setSavedRows] = useState({});
  const [notePopover, setNotePopover] = useState(null);
  const role = localStorage.getItem("role") || "";

  const defaultFilters = {
    goTo: [], applicativo: [], stato: [], annoCompetenza: [],
    tipoContratto: [], releaseExcel: [], pmPoste: [], pmCap: [],
    oda: [], rda: [], capgemini: [], iet: [], subco: [],
    pAnno: [], pRelease: [], importoExcel: []
  };

  const [filters, setFilters] = useState(() => {
    const saved = localStorage.getItem(FILTERS_STORAGE_KEY);
    if (!saved) return defaultFilters;
    return { ...defaultFilters, ...JSON.parse(saved) };
  });

  // ── Data load ─────────────────────────────────────────────────────────────
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
    } finally { setLoading(false); }
  };

  useEffect(() => { loadMev(); }, [ambienteId]); // eslint-disable-line
  useEffect(() => { localStorage.setItem(FILTERS_STORAGE_KEY, JSON.stringify(filters)); }, [filters]);

  const resetFilters = () => {
    setFilters(defaultFilters);
    localStorage.removeItem(FILTERS_STORAGE_KEY);
  };

  const handleFilterChange = (field, value) =>
    setFilters((prev) => ({ ...prev, [field]: value }));

  // ── Chiudi popover note ───────────────────────────────────────────────────
  useEffect(() => {
    if (!notePopover) return;
    const handler = (e) => {
      if (!e.target.closest("[data-note-popover]") && !e.target.closest("button[data-note-btn]"))
        setNotePopover(null);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [notePopover]);

  // ── Options per filtri ───────────────────────────────────────────────────
  const buildOptions = (field) =>
    [...new Set(rows.map((r) => r[field]).filter((v) => v !== null && v !== undefined && v !== ""))].sort();

  const withVuoto = (opts, field) => {
    const hasEmpty = rows.some((r) => !r[field] || String(r[field]).trim() === "");
    return [...opts, ...(hasEmpty ? ["(vuoto)"] : [])];
  };

  const matchField = (r, filterKey, rowField) => {
    if (filters[filterKey].length === 0) return true;
    const val = r[rowField] ?? "";
    if (!String(val).trim() && filters[filterKey].includes("(vuoto)")) return true;
    return filters[filterKey].includes(String(val));
  };

  const filteredRows = rows.filter((r) =>
    matchField(r, "goTo", "goTo") &&
    matchField(r, "applicativo", "applicativo") &&
    matchField(r, "stato", "stato") &&
    matchField(r, "annoCompetenza", "annoCompetenza") &&
    matchField(r, "tipoContratto", "tipoContratto") &&
    matchField(r, "releaseExcel", "releaseExcel") &&
    matchField(r, "pmPoste", "pmPoste") &&
    matchField(r, "pmCap", "pmCap") &&
    matchField(r, "oda", "bc") &&
    matchField(r, "rda", "atId") &&
    matchField(r, "capgemini", "capgemini") &&
    matchField(r, "iet", "iet") &&
    matchField(r, "subco", "subco") &&
    matchField(r, "pAnno", "pAnno") &&
    matchField(r, "pRelease", "pRelease") &&
    (filters.importoExcel.length === 0 || filters.importoExcel.includes(String(r.importoExcel)))
  );

  const totCap    = filteredRows.reduce((s, r) => s + (Number(r.importoExcel) || 0), 0);
  const totPoste  = filteredRows.reduce((s, r) => s + (Number(r.pImporto) || 0), 0);
  const hasActive = Object.values(filters).some((v) => Array.isArray(v) ? v.length > 0 : !!v);

  useEffect(() => { onFilteredRowsChange?.(filteredRows); }, [filteredRows]); // eslint-disable-line

  // ── Save da modale ────────────────────────────────────────────────────────
  const handleModalSave = async (form) => {
    const updated = await updateMev(form.id, {
      pAnno:      Number(form.pAnno),
      pRelease:   form.pRelease ?? "",
      pImporto:   Number(form.pImporto),
      pNote:      form.pNote,
      importoBdo: Number(form.importoBdo ?? 0),
      stato:      form.stato,
      pmPoste:    form.pmPoste,
      pmCap:      form.pmCap,
      tipoContratto: form.tipoContratto,
      recupero:   form.recupero,
      subco:      form.subco,
      tbd:        form.tbd,
      bc:         form.bc,
      contratto:  form.contratto,
      rda:        form.rda,
      atId:       form.atId,
      tow021:     form.tow021 != null ? Number(form.tow021) : null,
      tow022:     form.tow022 != null ? Number(form.tow022) : null,
      tow023:     form.tow023 != null ? Number(form.tow023) : null,
      tow024:     form.tow024 != null ? Number(form.tow024) : null,
      tow025:     form.tow025 != null ? Number(form.tow025) : null,
      tow026:     form.tow026 != null ? Number(form.tow026) : null,
      accantonato: form.accantonato != null ? Number(form.accantonato) : null,
      nel:        form.nel,
      inVita:     form.inVita,
      cm:         form.cm,
      noteExcel:  form.noteExcel,
    });
    setRows((prev) => prev.map((r) => (r.id === form.id ? { ...r, ...updated } : r)));
    setSavedRows((prev) => ({ ...prev, [form.id]: true }));
    setTimeout(() => setSavedRows((prev) => ({ ...prev, [form.id]: false })), 2000);
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento MEV...
    </div>
  );

  // ── Helper colonne ────────────────────────────────────────────────────────
  const TH = ({ children, minW }) => (
    <th style={{ padding: "10px 8px", textAlign: "center", fontWeight: 600, fontSize: "12px", color: "#444", whiteSpace: "nowrap", minWidth: minW }}>
      {children}
    </th>
  );

  const statoBadge = (stato) => {
    const map = {
      "Approvato":       { bg: "#e6f4ea", color: "#2e7d32" },
      "In approvazione": { bg: "#fff8e1", color: "#e65100" },
    };
    const s = map[stato] || { bg: "#f1f3f4", color: "#555" };
    return (
      <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "12px", fontSize: "12px", background: s.bg, color: s.color }}>
        {stato || "(vuoto)"}
      </span>
    );
  };

  const checkMark = (val) =>
    val?.trim().toLowerCase() === "x"
      ? <span title="ok" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: "20px", height: "20px", borderRadius: "50%", background: "#e6f4ea", color: "#2e7d32", fontSize: "13px", fontWeight: 700 }}>V</span>
      : (val ?? "");

  // ── Render principale ─────────────────────────────────────────────────────
  return (
    <div style={{ padding: "20px 24px" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "20px", flexWrap: "wrap" }}>
        <button style={btn("primary")} disabled={aligning}
          onClick={async () => {
            if (!window.confirm("Riallineare i dati MEV con l'Excel ufficiale?\nLe modifiche PMO verranno preservate.")) return;
            setAligning(true);
            try {
              const result = await alignMevData({});
              const msg = result.countContratti !== undefined
                ? `Allineamento completato: ${result.count} record MEV, ${result.countContratti} contratti`
                : `Allineamento completato: ${result.count} record caricati`;
              alert(msg);
              onAligned?.();
              await loadMev();
            } catch (e) { alert(`Errore allineamento:\n${e.message}`); }
            finally { setAligning(false); }
          }}>
          {aligning ? "Allineamento..." : "\u27F3 Allinea Dati"}
        </button>

        <button style={btn("success")} onClick={async () => {
          try { await exportMev(filteredRows, filters); }
          catch (e) { alert(`Errore export: ${e.message}`); }
        }}>
          Esporta Excel
        </button>

        <button style={{ ...btn("ghost"), opacity: hasActive ? 1 : 0.5 }}
          onClick={resetFilters} disabled={!hasActive}>
          X Reset filtri
        </button>

        {role === "Admin" && (
          <>
            <input id="upload-excel" type="file" accept=".xlsx" style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  await uploadExcel(file);
                  alert("File caricato. Clicca 'Allinea Dati' per importare.");
                } catch (err) { alert(`Errore caricamento: ${err.message}`); }
                e.target.value = "";
              }} />
            <label htmlFor="upload-excel" style={{ ...btn("ghost"), cursor: "pointer" }}>
              Carica Excel
            </label>
          </>
        )}

        <div style={{ marginLeft: "auto", display: "flex", gap: "16px" }}>
          <div style={{ background: "#e8f0fe", borderRadius: "8px", padding: "8px 16px", textAlign: "right", minWidth: "160px" }}>
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

      {/* Contatore */}
      <div style={{ fontSize: "12px", color: "#888", marginBottom: "8px" }}>
        {filteredRows.length} righe{hasActive ? ` (filtrate su ${rows.length} totali)` : ""}
      </div>

      {/* Tabella */}
      <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 220px)", borderRadius: "8px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead style={{ position: "sticky", top: 0, zIndex: 10 }}>
            {/* Riga filtri */}
            <tr style={{ background: "#fff", borderBottom: "1px solid #dadce0" }}>
              <th style={{ padding: "4px 6px", minWidth: "40px" }}></th>
              <th style={{ padding: "4px 6px", minWidth: "60px" }}></th>
              <th style={{ padding: "4px 6px", minWidth: "80px" }}><MultiSelect options={buildOptions("goTo")} selected={filters.goTo} onChange={(v) => handleFilterChange("goTo", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "110px" }}><MultiSelect options={buildOptions("applicativo")} selected={filters.applicativo} onChange={(v) => handleFilterChange("applicativo", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "200px" }}></th>
              <th style={{ padding: "4px 6px", minWidth: "100px" }}><MultiSelect options={withVuoto(buildOptions("pmPoste"), "pmPoste")} selected={filters.pmPoste} onChange={(v) => handleFilterChange("pmPoste", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "100px" }}><MultiSelect options={withVuoto(buildOptions("pmCap"), "pmCap")} selected={filters.pmCap} onChange={(v) => handleFilterChange("pmCap", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "70px" }}><MultiSelect options={buildOptions("annoCompetenza")} selected={filters.annoCompetenza} onChange={(v) => handleFilterChange("annoCompetenza", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "100px" }}><MultiSelect options={withVuoto(buildOptions("releaseExcel"), "releaseExcel")} selected={filters.releaseExcel} onChange={(v) => handleFilterChange("releaseExcel", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "100px" }}><MultiSelect options={withVuoto(buildOptions("stato"), "stato")} selected={filters.stato} onChange={(v) => handleFilterChange("stato", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "100px" }}><MultiSelect options={withVuoto(buildOptions("tipoContratto"), "tipoContratto")} selected={filters.tipoContratto} onChange={(v) => handleFilterChange("tipoContratto", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "130px" }}></th>
              <th style={{ padding: "4px 6px" }}></th>
              <th style={{ padding: "4px 6px", minWidth: "120px" }}><MultiSelect options={withVuoto(buildOptions("bc"), "bc")} selected={filters.oda} onChange={(v) => handleFilterChange("oda", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "100px" }}><MultiSelect options={withVuoto(buildOptions("atId"), "atId")} selected={filters.rda} onChange={(v) => handleFilterChange("rda", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={buildOptions("capgemini")} selected={filters.capgemini} onChange={(v) => handleFilterChange("capgemini", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={buildOptions("iet")} selected={filters.iet} onChange={(v) => handleFilterChange("iet", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={withVuoto(buildOptions("subco"), "subco")} selected={filters.subco} onChange={(v) => handleFilterChange("subco", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={buildOptions("pAnno")} selected={filters.pAnno} onChange={(v) => handleFilterChange("pAnno", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={withVuoto(buildOptions("pRelease"), "pRelease")} selected={filters.pRelease} onChange={(v) => handleFilterChange("pRelease", v)} placeholder="Tutte" /></th>
              <th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th>
            </tr>
            {/* Intestazioni */}
            <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dadce0" }}>
              <TH minW="50px">Azioni</TH>
              <TH minW="50px">ID</TH>
              <TH minW="80px">GoTo</TH>
              <TH minW="110px">Applicativo</TH>
              <TH minW="200px">Descrizione</TH>
              <TH minW="100px">PM Poste</TH>
              <TH minW="100px">PM CAP</TH>
              <TH minW="60px">Anno</TH>
              <TH minW="100px">Release</TH>
              <TH minW="100px">Stato</TH>
              <TH minW="80px">Tipo Contr.</TH>
              <TH minW="130px">Importo CAP</TH>
              <TH minW="60px">Note</TH>
              <TH minW="120px">ODA (BC)</TH>
              <TH minW="100px">RDA (AT ID)</TH>
              <TH minW="60px">CAP</TH>
              <TH minW="50px">IET</TH>
              <TH minW="80px">Subco</TH>
              <TH minW="75px">TOW01</TH>
              <TH minW="75px">TOW02</TH>
              <TH minW="75px">TOW03</TH>
              <TH minW="75px">TOW04</TH>
              <TH minW="75px">TOW05</TH>
              <TH minW="75px">TOW06</TH>
              <TH minW="90px">Tot TOW</TH>
              <TH minW="70px">P Anno</TH>
              <TH minW="90px">P Release</TH>
              <TH minW="120px">Importo BDO</TH>
              <TH minW="130px">P Note</TH>
            </tr>
          </thead>

          <tbody>
            {filteredRows.map((r, index) => {
              const scost = isScostamento(r.importoExcel, r.pImporto);
              const bg = scost ? "#fff5f5" : index % 2 === 0 ? "white" : "#fafafa";
              const bgHover = scost ? "#ffe8e8" : "#f0f4ff";
              return (
                <tr key={r.id}
                  style={{ backgroundColor: bg, borderBottom: "1px solid #f0f0f0", transition: "background-color 0.1s" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = bgHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = bg)}>

                  {/* Azioni */}
                  <td style={{ ...TD, textAlign: "center" }}>
                    <button onClick={() => setEditRow(r)}
                      style={{
                        ...btn("primary"), padding: "4px 10px", fontSize: "12px",
                        background: savedRows[r.id] ? "#34a853" : "#1a73e8"
                      }}>
                      {savedRows[r.id] ? "V" : "Modifica"}
                    </button>
                  </td>

                  <td style={{ ...TD, fontSize: "12px", color: "#999" }}>{r.excelId}</td>
                  <td style={{ ...TD }}>{r.goTo}</td>
                  <td style={{ ...TD }}>{r.applicativo}</td>
                  <td style={{ ...TD, maxWidth: "280px" }}>{r.descrizione}</td>
                  <td style={{ ...TD }}>{r.pmPoste ?? ""}</td>
                  <td style={{ ...TD }}>{r.pmCap ?? ""}</td>
                  <td style={{ ...TD, textAlign: "center" }}>{r.annoCompetenza}</td>
                  <td style={{ ...TD }}>{r.releaseExcel ?? ""}</td>
                  <td style={{ ...TD }}>{statoBadge(r.stato)}</td>
                  <td style={{ ...TD, fontSize: "12px" }}>{r.tipoContratto ?? ""}</td>
                  <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{formatEuro(r.importoExcel)}</td>

                  {/* Note */}
                  <td style={{ ...TD, textAlign: "center" }}>
                    {r.noteExcel ? (
                      <button data-note-btn="1"
                        onClick={(e) => {
                          if (notePopover && notePopover.id === r.id) { setNotePopover(null); return; }
                          const rect = e.currentTarget.getBoundingClientRect();
                          setNotePopover({ id: r.id, text: r.noteExcel, x: rect.left, y: rect.bottom + window.scrollY + 6 });
                        }}
                        style={{
                          padding: "3px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600,
                          cursor: "pointer", border: "1px solid #1a73e8",
                          background: notePopover?.id === r.id ? "#1a73e8" : "#e8f0fe",
                          color: notePopover?.id === r.id ? "#fff" : "#1a73e8",
                        }}>
                        Note
                      </button>
                    ) : null}
                  </td>

                  <td style={{ ...TD, color: "#12c937", fontWeight: "bold", fontSize: "12px" }}>{r.bc ?? ""}</td>
                  <td style={{ ...TD, color: "#12c937", fontWeight: "bold", fontSize: "12px" }}>{r.atId ?? ""}</td>
                  <td style={{ ...TD, textAlign: "center" }}>{checkMark(r.capgemini)}</td>
                  <td style={{ ...TD, textAlign: "center" }}>{checkMark(r.iet)}</td>
                  <td style={{ ...TD, fontSize: "12px" }}>{r.subco ?? ""}</td>

                  {/* TOW */}
                  <td style={{ ...TD, textAlign: "right", fontSize: "12px" }}>{fmtNum(r.tow021)}</td>
                  <td style={{ ...TD, textAlign: "right", fontSize: "12px" }}>{fmtNum(r.tow022)}</td>
                  <td style={{ ...TD, textAlign: "right", fontSize: "12px" }}>{fmtNum(r.tow023)}</td>
                  <td style={{ ...TD, textAlign: "right", fontSize: "12px" }}>{fmtNum(r.tow024)}</td>
                  <td style={{ ...TD, textAlign: "right", fontSize: "12px" }}>{fmtNum(r.tow025)}</td>
                  <td style={{ ...TD, textAlign: "right", fontSize: "12px" }}>{fmtNum(r.tow026)}</td>
                  <td style={{ ...TD, textAlign: "right", fontSize: "12px", fontWeight: 600 }}>{fmtNum(r.towTotale)}</td>

                  {/* PMO */}
                  <td style={{ ...TD, textAlign: "center" }}>{r.pAnno}</td>
                  <td style={{ ...TD }}>{r.pRelease}</td>
                  <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{formatEuro(r.importoBdo && r.importoBdo !== 0 ? r.importoBdo : r.ordinatoBdo)}</td>
                  <td style={{ ...TD, maxWidth: "180px", fontSize: "12px", color: "#666" }}>{r.pNote ?? ""}</td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredRows.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px", color: "#888", fontSize: "14px" }}>Nessun risultato trovato</div>
        )}
      </div>

      {/* Popover Note */}
      {notePopover && (
        <div data-note-popover="1" style={{
          position: "fixed",
          left: Math.min(notePopover.x, window.innerWidth - 320),
          top: notePopover.y - window.scrollY,
          zIndex: 9999, background: "#fff", border: "1px solid #dadce0",
          borderRadius: "8px", boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          padding: "12px 16px", maxWidth: "300px", minWidth: "180px",
          fontSize: "13px", color: "#333", lineHeight: "1.5",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <span style={{ fontWeight: 700, fontSize: "12px", color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.5px" }}>Note</span>
            <span onClick={() => setNotePopover(null)} style={{ cursor: "pointer", color: "#888", fontSize: "16px", lineHeight: 1 }}>x</span>
          </div>
          {notePopover.text}
        </div>
      )}

      {/* Modale edit */}
      {editRow && (
        <EditModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSave={handleModalSave}
        />
      )}
    </div>
  );
}

export default MevCapPage;
