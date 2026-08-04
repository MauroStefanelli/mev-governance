import { useEffect, useState, useRef, useCallback } from "react";
import {
  getMevList, updateMev, createMev, getMevOptions, alignMevData, exportMev, uploadExcel,
  getConsumoTow, createConsumoTowFiglio,
} from "../services/mevService";
import { fmtItIT } from "../utils";
import { loadTowImpatto, NewContrattoFiglioModal } from "./ConsumoTowAdminPage";

const FILTERS_STORAGE_KEY = "mevPageFilters";
const RTI_KEY = "rtisubco-righe";

// Legge le righe RTI&SUBCO da localStorage
const loadRtiSocietà = () => {
  try { return JSON.parse(localStorage.getItem(RTI_KEY) || "[]"); } catch { return []; }
};

// Società per ruolo
const getSocietàPerRuolo = (ruoli) =>
  loadRtiSocietà()
    .filter(r => ruoli.includes(r.ruolo))
    .map(r => r.societa)
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i); // unique

// Parse valore campo multi-società (JSON array o stringa singola)
const parseSocietà = (val) => {
  if (!val) return [];
  try {
    const parsed = JSON.parse(val);
    if (Array.isArray(parsed)) return parsed;
  } catch {}
  return val ? [val] : [];
};

// Risolve il valore di capgemini/iet per la colonna Mandataria/Mandante.
// Se il valore è "x" (legacy checkmark) cerca la società per _id in RTI&SUBCO,
// altrimenti usa parseSocietà normalmente.
// capId  = _id della riga RTI da usare per la x di CAP  (default 1 = Capgemini Italia S.p.A.)
// ietId  = _id della riga RTI da usare per la x di IET  (default 2 = I&T)
const resolveCapMandanti = (capVal, ietVal) => {
  const rtiRows = loadRtiSocietà();
  const byId = (id) => {
    const found = rtiRows.find(r => String(r._id) === String(id) || Number(r._id) === Number(id));
    return found?.societa || null;
  };

  const fromCap = (() => {
    if (!capVal) return [];
    const trimmed = String(capVal).trim().toLowerCase();
    if (trimmed === "x") {
      const soc = byId(1);
      return soc ? [soc] : ["Capgemini Italia S.p.A."];
    }
    return parseSocietà(capVal);
  })();

  const fromIet = (() => {
    if (!ietVal) return [];
    const trimmed = String(ietVal).trim().toLowerCase();
    if (trimmed === "x") {
      const soc = byId(2);
      return soc ? [soc] : ["I&T"];
    }
    return parseSocietà(ietVal);
  })();

  // unisci evitando duplicati
  const combined = [...fromCap];
  fromIet.forEach(s => { if (!combined.includes(s)) combined.push(s); });
  return combined;
};

// Serializza array → JSON string (o "" se vuoto)
const serializeSocietà = (arr) =>
  arr.length === 0 ? "" : arr.length === 1 ? arr[0] : JSON.stringify(arr);

// ── MultiSelect dropdown con checkbox ────────────────────────────────────────
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

// ── SocietàMultiSelect: dropdown con chips colorate per selezione multi-società ──
function SocietàMultiSelect({ value, onChange, ruoli, label, width, color = "#1a73e8", bgColor = "#eff6ff" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const selected = parseSocietà(value);
  const options = getSocietàPerRuolo(ruoli);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggle = (soc) => {
    const next = selected.includes(soc) ? selected.filter(s => s !== soc) : [...selected, soc];
    onChange(serializeSocietà(next));
  };

  return (
    <div style={{ marginBottom: "12px", width: width || "100%" }}>
      {label && <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>}
      <div ref={ref} style={{ position: "relative" }}>
        <div
          onClick={() => setOpen(v => !v)}
          style={{
            minHeight: "34px", padding: "4px 8px", border: `1.5px solid ${open ? color : "#dadce0"}`,
            borderRadius: "6px", background: "#fff", cursor: "pointer",
            display: "flex", flexWrap: "wrap", gap: "4px", alignItems: "center",
            transition: "border-color 0.15s",
          }}
        >
          {selected.length === 0
            ? <span style={{ fontSize: "12px", color: "#aaa" }}>{options.length === 0 ? "— nessuna società in RTI&SUBCO —" : "Seleziona..."}</span>
            : selected.map(s => (
              <span key={s} style={{
                display: "inline-flex", alignItems: "center", gap: "4px",
                background: bgColor, color, border: `1px solid ${color}33`,
                borderRadius: "12px", padding: "2px 8px", fontSize: "11px", fontWeight: 700,
              }}>
                {s}
                <span
                  onClick={e => { e.stopPropagation(); toggle(s); }}
                  style={{ cursor: "pointer", fontSize: "12px", lineHeight: 1, color, opacity: 0.7, fontWeight: 900 }}
                >×</span>
              </span>
            ))
          }
          <span style={{ marginLeft: "auto", fontSize: "10px", color: "#aaa" }}>▾</span>
        </div>
        {open && options.length > 0 && (
          <div style={{
            position: "absolute", top: "100%", left: 0, zIndex: 50,
            background: "#fff", border: "1px solid #dadce0", borderRadius: "8px",
            marginTop: "3px", minWidth: "200px", maxHeight: "220px", overflowY: "auto",
            boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 10px", borderBottom: "1px solid #f1f5f9", background: "#f8fafc", position: "sticky", top: 0 }}>
              <span onClick={() => { onChange(serializeSocietà(options)); setOpen(false); }} style={{ fontSize: "11px", color: "#34a853", fontWeight: 700, cursor: "pointer" }}>Tutti</span>
              <span onClick={() => { onChange(""); }} style={{ fontSize: "11px", color: "#ea4335", fontWeight: 700, cursor: "pointer" }}>Nessuno</span>
            </div>
            {options.map(soc => (
              <label key={soc} style={{ display: "flex", alignItems: "center", gap: "8px", padding: "7px 12px", cursor: "pointer", fontSize: "13px" }}
                onMouseEnter={e => e.currentTarget.style.background = bgColor}
                onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                <input type="checkbox" checked={selected.includes(soc)} onChange={() => toggle(soc)}
                  style={{ cursor: "pointer", accentColor: color }} />
                <span style={{ fontWeight: selected.includes(soc) ? 700 : 400, color: selected.includes(soc) ? color : "#374151" }}>{soc}</span>
              </label>
            ))}
          </div>
        )}
      </div>
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

// Input € per la riga TOW: tiene uno stato di testo locale durante la digitazione
// e aggiorna la qty (tramite onCommit) solo su blur / Enter.
// Questo evita che React riscriva il campo ad ogni keystroke.
function TowEuroInput({ importoTow, valUnitTow, onCommit }) {
  // testo visualizzato mentre l'utente digita
  const [draft, setDraft] = useState(null); // null = non in editing
  const displayValue = draft !== null
    ? draft
    : (importoTow != null ? parseFloat(importoTow.toFixed(2)) : "");

  const commit = (raw) => {
    setDraft(null);
    const euro = parseFloat(String(raw).replace(",", "."));
    if (!isNaN(euro) && valUnitTow > 0) {
      onCommit(parseFloat((euro / valUnitTow).toFixed(3)));
    } else if (raw === "" || raw === null) {
      onCommit(null);
    }
  };

  return (
    <div style={{ display: "flex", alignItems: "center", border: "1px solid #e2e8f0", borderRadius: "4px", overflow: "hidden", background: "#f8fafc" }}>
      <span style={{ padding: "2px 4px", fontSize: "10px", color: "#64748b", background: "#f1f5f9", borderRight: "1px solid #e2e8f0", flexShrink: 0, fontWeight: 700 }}>€</span>
      <input
        type="number"
        step="0.01"
        min="0"
        value={displayValue}
        placeholder="—"
        onFocus={e => {
          // All'ingresso nel campo, imposta il draft con il valore attuale
          setDraft(importoTow != null ? parseFloat(importoTow.toFixed(2)) : "");
        }}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(e.target.value); } }}
        style={{ flex: 1, padding: "2px 4px", border: "none", fontSize: "11px", color: "#334155", textAlign: "right", minWidth: 0, outline: "none", background: "transparent" }}
      />
    </div>
  );
}

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

// ── Field e Section: definiti FUORI dalla modale per evitare re-mount ad ogni render ──

// Campo con dropdown puro (select) — per edit mode
const ModalField = ({ label, field, type, readOnly, width, form, onChange, options, step }) => (
  <div style={{ marginBottom: "12px", width: width || "100%" }}>
    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
    {readOnly
      ? <div style={{ padding: "6px 8px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "13px", background: "#f8f9fa", color: "#888", minHeight: "32px" }}>{form[field] ?? ""}</div>
      : options
        ? <select value={form[field] ?? ""} onChange={(e) => onChange(field, e.target.value)}
            style={{ ...inputStyle(), height: "32px", cursor: "pointer" }}>
            <option value="">-- seleziona --</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        : <input value={form[field] ?? ""} type={type || "text"}
            step={type === "number" ? (step ?? "any") : undefined}
            onChange={(e) => onChange(field, e.target.value)}
            style={inputStyle()} />
    }
  </div>
);

// Campo combo: dropdown con opzioni + "Aggiungi nuovo..." per inserire valori custom
const ComboField = ({ label, field, width, form, onChange, options }) => {
  const [addingNew, setAddingNew] = useState(false);
  const [newVal, setNewVal] = useState("");
  const currentValue = String(form[field] ?? "");
  const isKnown = currentValue === "" || options.includes(currentValue);

  const confirm = () => {
    if (newVal.trim()) onChange(field, newVal.trim());
    setAddingNew(false);
    setNewVal("");
  };

  return (
    <div style={{ marginBottom: "12px", width: width || "100%" }}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
      {addingNew ? (
        <div style={{ display: "flex", gap: "4px" }}>
          <input autoFocus value={newVal} onChange={(e) => setNewVal(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") confirm(); if (e.key === "Escape") { setAddingNew(false); setNewVal(""); } }}
            placeholder="Nuovo valore..." style={{ ...inputStyle(), flex: 1 }} />
          <button type="button" onClick={confirm}
            style={{ padding: "4px 10px", background: "#34a853", color: "#fff", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: 700 }}>OK</button>
          <button type="button" onClick={() => { setAddingNew(false); setNewVal(""); }}
            style={{ padding: "4px 8px", background: "#f1f3f4", color: "#555", border: "1px solid #dadce0", borderRadius: "4px", cursor: "pointer" }}>X</button>
        </div>
      ) : (
        <select value={isKnown ? currentValue : "__custom__"}
          onChange={(e) => { if (e.target.value === "__new__") setAddingNew(true); else onChange(field, e.target.value); }}
          style={{ ...inputStyle(), height: "32px", cursor: "pointer" }}>
          <option value="">-- seleziona --</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
          {!isKnown && currentValue && <option value="__custom__">{currentValue}</option>}
          <option value="__new__">+ Aggiungi nuovo...</option>
        </select>
      )}
    </div>
  );
};

const ModalSection = ({ title, children, color }) => (
  <div style={{ marginBottom: "18px" }}>
    <div style={{ fontSize: "11px", fontWeight: 700, color: color || "#1a73e8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "10px", borderBottom: `2px solid ${color ? color + "33" : "#e8f0fe"}`, paddingBottom: "4px" }}>{title}</div>
    <div style={{ display: "flex", flexWrap: "wrap", gap: "0 16px" }}>{children}</div>
  </div>
);

// Campo Tipo Contratto: dropdown dai contratti ConsumoTow + pulsante "Crea"
function ContrattoSelectField({ label, field, width, form, onChange, contrattiOptions, onCrea }) {
  const currentValue = String(form[field] ?? "");
  const isKnown = currentValue === "" || contrattiOptions.includes(currentValue);
  return (
    <div style={{ marginBottom: "12px", width: width || "100%" }}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
      <div style={{ display: "flex", gap: "6px" }}>
        <select
          value={isKnown ? currentValue : "__custom__"}
          onChange={e => onChange(field, e.target.value === "__custom__" ? currentValue : e.target.value)}
          style={{ ...inputStyle(), height: "32px", cursor: "pointer", flex: 1 }}
        >
          <option value="">-- seleziona --</option>
          {contrattiOptions.map(c => <option key={c} value={c}>{c}</option>)}
          {!isKnown && currentValue && <option value="__custom__">{currentValue}</option>}
        </select>
        <button
          type="button"
          onClick={onCrea}
          title="Crea nuovo contratto"
          style={{
            padding: "0 12px", height: "32px", borderRadius: "6px", border: "1.5px solid #10b981",
            background: "#f0fdf4", color: "#10b981", fontSize: "12px", fontWeight: 700,
            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
          }}
        >+ Crea</button>
      </div>
    </div>
  );
}

// Campo importo read-only visualizzato in €
const EuroField = ({ label, value, width }) => (
  <div style={{ marginBottom: "12px", width: width || "calc(20% - 8px)" }}>
    <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
    <div style={{ padding: "6px 10px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "13px", background: "#f8f9fa", color: "#1a73e8", fontWeight: 600, minHeight: "32px", textAlign: "right", whiteSpace: "nowrap" }}>
      {formatEuro(value)}
    </div>
  </div>
);

// Campo importo editabile con simbolo € — 3 decimali
const EuroEditField = ({ label, field, width, form, onChange }) => {
  const raw = form[field];
  const num = raw != null && raw !== "" ? Number(raw) : "";
  return (
    <div style={{ marginBottom: "12px", width: width || "calc(20% - 8px)" }}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #dadce0", borderRadius: "4px", overflow: "hidden", background: "white" }}>
        <input
          value={num === "" ? "" : num}
          type="number"
          step="0.001"
          min="0"
          onChange={e => onChange(field, e.target.value === "" ? null : parseFloat(e.target.value))}
          style={{ flex: 1, padding: "5px 8px", border: "none", fontSize: "13px", color: "#1a73e8", fontWeight: 600, textAlign: "right", minWidth: 0, outline: "none" }}
        />
        <span style={{ padding: "0 8px", color: "#888", fontSize: "12px", flexShrink: 0 }}>€</span>
      </div>
    </div>
  );
};

// Campo TOW con step 0.001 e pulsanti +/-
const TowField = ({ label, field, width, form, onChange }) => {
  const val = form[field];
  const num = parseFloat(val) || 0;
  const step = 0.001;
  return (
    <div style={{ marginBottom: "12px", width: width || "calc(16% - 8px)" }}>
      <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</label>
      <div style={{ display: "flex", alignItems: "center", border: "1px solid #dadce0", borderRadius: "4px", overflow: "hidden", background: "white" }}>
        <button type="button"
          onClick={() => onChange(field, Math.max(0, parseFloat((num - step).toFixed(3))))}
          style={{ padding: "4px 8px", background: "#f1f3f4", border: "none", borderRight: "1px solid #dadce0", cursor: "pointer", fontSize: "14px", color: "#555", lineHeight: 1, flexShrink: 0 }}>−</button>
        <input
          value={val ?? ""}
          type="number"
          step="0.001"
          min="0"
          onChange={(e) => onChange(field, e.target.value === "" ? null : parseFloat(e.target.value))}
          style={{ flex: 1, padding: "5px 6px", border: "none", fontSize: "13px", color: "#333", textAlign: "right", minWidth: 0, outline: "none" }}
        />
        <button type="button"
          onClick={() => onChange(field, parseFloat((num + step).toFixed(3)))}
          style={{ padding: "4px 8px", background: "#f1f3f4", border: "none", borderLeft: "1px solid #dadce0", cursor: "pointer", fontSize: "14px", color: "#555", lineHeight: 1, flexShrink: 0 }}>+</button>
      </div>
    </div>
  );
};

// TOW keys → field nel form
const TOW_FIELDS = [
  { key: "TOW02.1", field: "tow021" }, { key: "TOW02.2", field: "tow022" },
  { key: "TOW02.3", field: "tow023" }, { key: "TOW02.4", field: "tow024" },
  { key: "TOW02.5", field: "tow025" }, { key: "TOW02.6", field: "tow026" },
];

// Calcola importo fornitura = sum(tow * valoreUnitario) per il tipo contratto scelto.
// TOW02.5 è un importo diretto in €: viene sommato senza moltiplicazione.
const calcImporto = (form, priceMap) => {
  const prices = priceMap?.[form.tipoContratto];
  if (!prices) return 0;
  return TOW_FIELDS.reduce((sum, { key, field }) => {
    const qty = parseFloat(form[field]) || 0;
    if (key === "TOW02.5") {
      // importo diretto in €
      return sum + qty;
    }
    return sum + qty * (prices[key] ?? 0);
  }, 0);
};

// ── Modale di modifica / creazione ───────────────────────────────────────────
function EditModal({ row, mode, options, nextId, onClose, onSave }) {
  const isCreate = mode === "create";

  const emptyForm = {
    excelId: nextId != null ? String(nextId) : "",
    applicativo: "", descrizione: "", goTo: "", xOrdine: "",
    pmPoste: "", pmCap: "", annoCompetenza: String(new Date().getFullYear()), releaseExcel: "",
    stato: "", tipoContratto: "", importoExcel: 0, recupero: "",
    bc: "", contratto: "", rda: "", atId: "", nel: "", inVita: "", cm: "",
    capMandanti: "", subco: "", tbd: "", accantonato: null,
    tow021: null, tow022: null, tow023: null, tow024: null, tow025: null, tow026: null,
    noteExcel: "", pAnno: new Date().getFullYear(), pRelease: "", pImporto: 0,
    pNote: "", importoBdo: 0,
  };

  const [form, setForm] = useState(() => {
    if (isCreate) return emptyForm;
    // Risolve il valore legacy "x" di capgemini/iet in nomi società reali
    const rtiRows = loadRtiSocietà();
    const byId = (id) => rtiRows.find(r => Number(r._id) === Number(id))?.societa || null;
    const resolveToArray = (capVal, ietVal) => {
      const fromCap = (() => {
        if (!capVal) return [];
        if (String(capVal).trim().toLowerCase() === "x") { const s = byId(1); return s ? [s] : ["Capgemini Italia S.p.A."]; }
        return parseSocietà(capVal);
      })();
      const fromIet = (() => {
        if (!ietVal) return [];
        if (String(ietVal).trim().toLowerCase() === "x") { const s = byId(2); return s ? [s] : ["I&T"]; }
        return parseSocietà(ietVal);
      })();
      const combined = [...fromCap];
      fromIet.forEach(s => { if (!combined.includes(s)) combined.push(s); });
      return combined;
    };
    const resolved = resolveToArray(row?.capgemini, row?.iet);
    const capMandanti = resolved.length > 0 ? serializeSocietà(resolved) : "";
    return { ...row, capMandanti };
  });
  const [saving, setSaving] = useState(false);
  const [contrattiTow, setContrattiTow] = useState([]);
  const [baseRowsTow, setBaseRowsTow] = useState([]);
  const [localPriceMap, setLocalPriceMap] = useState({});
  const [showCreaContratto, setShowCreaContratto] = useState(false);
  // Sezione Extra (Accantonato, NEL, In Vita, CM, TBD): visibile se già compilata o aperta manualmente
  const hasExtraData = !!(form.accantonato || form.nel || form.inVita || form.cm || form.tbd);
  const [showExtra, setShowExtra] = useState(() => hasExtraData);
  const towImpattoAll = loadTowImpatto(); // { "NomeContratto": { "TOW02.1": 30, ... } } o flat legacy
  // Percentuali di impatto per il tipo contratto selezionato
  // Se la struttura è flat (legacy), usarla direttamente; altrimenti estrarre per contratto
  const towImpatto = (() => {
    const firstVal = Object.values(towImpattoAll)[0];
    if (!towImpattoAll || Object.keys(towImpattoAll).length === 0) return {};
    if (typeof firstVal === "number") return towImpattoAll; // flat legacy
    return towImpattoAll[form.tipoContratto] || {};
  })();

  // Carica contratti ConsumoTow per il dropdown Tipo Contratto
  useEffect(() => {
    getConsumoTow().then(data => {
      const contratti = [...new Set(data.map(r => r.towContratto).filter(Boolean))];
      setContrattiTow(contratti);
      // baseRows = righe del primo contratto (BASE)
      const base = contratti[0] || "";
      setBaseRowsTow(data.filter(r => r.towContratto === base));
      // Costruisce localPriceMap: { "NomeContratto": { "TOW02.1": valoreUnitario, ... } }
      const pm = {};
      data.forEach(r => {
        if (!r.towContratto || !r.tow) return;
        if (!pm[r.towContratto]) pm[r.towContratto] = {};
        pm[r.towContratto][r.tow] = Number(r.valoreUnitario) || 0;
      });
      setLocalPriceMap(pm);
    }).catch(() => {});
  }, []);

  // priceMap effettivo: preferisce localPriceMap (dal DB), fallback su options.priceMap
  const effectivePriceMap = Object.keys(localPriceMap).length > 0 ? localPriceMap : (options.priceMap || {});

  // Ricalcolo importo fornitura dai TOW — funziona sia in create che in edit
  const computedImporto = calcImporto(form, effectivePriceMap);
  const hasPriceMap     = !!(effectivePriceMap[form.tipoContratto]);
  // In edit, se non c'è priceMap per il tipoContratto corrente, mantieni il valore originale
  const displayImporto  = (hasPriceMap && computedImporto > 0) ? computedImporto : (form.importoExcel ?? 0);
  // Importo scontato: ricalcolato proporzionalmente se l'importo originale era > 0
  const origImporto     = parseFloat(row?.importoExcel) || 0;
  const origScontato    = parseFloat(row?.importoFornituraScontato) || 0;
  const scontoRatio     = origImporto > 0 ? origScontato / origImporto : 1;
  const displayScontato = hasPriceMap && origImporto > 0
    ? computedImporto * scontoRatio
    : (form.importoFornituraScontato ?? 0);

  const set = useCallback((field, value) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      // In modalità creazione, auto-genera xOrdine = goTo + "_" + applicativo
      // solo se xOrdine è ancora vuoto oppure coincide con il valore auto-generato precedente
      if (isCreate && (field === "goTo" || field === "applicativo")) {
        const autoGenPrev = [prev.goTo, prev.applicativo].filter(Boolean).join("_");
        const isAutoOrEmpty = !prev.xOrdine || prev.xOrdine === autoGenPrev;
        if (isAutoOrEmpty) {
          const newGoTo  = field === "goTo"        ? value : prev.goTo;
          const newAppl  = field === "applicativo"  ? value : prev.applicativo;
          next.xOrdine   = [newGoTo, newAppl].filter(Boolean).join("_");
        }
      }
      return next;
    });
  }, [isCreate]);

  const handleSave = async () => {
    if (isCreate) {
      if (!form.excelId?.trim()) { alert("ID obbligatorio"); return; }
      if (!form.applicativo?.trim()) { alert("Applicativo obbligatorio"); return; }
      if (!form.descrizione?.trim()) { alert("Descrizione obbligatoria"); return; }
    }
    setSaving(true);
    const towTotale = TOW_FIELDS.reduce((s, { field }) => s + (parseFloat(form[field]) || 0), 0);
    const formToSave = isCreate
      ? { ...form, importoExcel: computedImporto, towTotale, capgemini: form.capMandanti }
      : { ...form, importoExcel: displayImporto, importoFornituraScontato: displayScontato, towTotale, capgemini: form.capMandanti };
    try { await onSave(formToSave); onClose(); }
    catch (e) { alert(`Errore salvataggio: ${e.message}`); }
    finally { setSaving(false); }
  };

  // Colori sezioni
  const sectionColor = isCreate ? "#0d6e3d" : "#1a73e8";
  const accentBg     = isCreate ? "#f0fdf4" : "#f0f6ff";
  const accentBorder = isCreate ? "#a7f3d0" : "#bfdbfe";
  const headerBg     = isCreate
    ? "linear-gradient(135deg, #0d6e3d 0%, #15803d 100%)"
    : "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)";

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(15,23,42,0.55)", display: "flex", alignItems: "center", justifyContent: "center",
      backdropFilter: "blur(2px)",
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "white", borderRadius: "16px",
        boxShadow: "0 24px 64px rgba(0,0,0,0.28), 0 4px 16px rgba(0,0,0,0.12)",
        width: "min(960px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column",
        position: "relative", overflow: "hidden",
      }}>

        {/* ── Header colorato ── */}
        <div style={{ background: headerBg, padding: "22px 28px 18px", flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>
                MEV-CAP
              </div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "#fff", letterSpacing: "-0.3px" }}>
                {isCreate ? "Nuovo GoTo" : "Modifica MEV"}
              </div>
              {!isCreate && (
                <div style={{ fontSize: "13px", color: "rgba(255,255,255,0.75)", marginTop: "4px" }}>
                  ID {row.excelId} &nbsp;&mdash;&nbsp; {row.applicativo} &nbsp;&mdash;&nbsp; {row.descrizione}
                </div>
              )}
            </div>
            <button onClick={onClose} style={{
              background: "rgba(255,255,255,0.15)", border: "none", borderRadius: "8px",
              cursor: "pointer", color: "#fff", width: "32px", height: "32px",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: "18px", lineHeight: 1, flexShrink: 0,
            }}>×</button>
          </div>
        </div>

        {/* ── Corpo scrollabile ── */}
        <div style={{ overflowY: "auto", padding: "24px 28px", flex: 1 }}>

          {/* Sezione: Identificazione */}
          <ModalSection title="Identificazione" color={sectionColor}>
            <ModalField label="ID *"          field="excelId"    readOnly={true}      form={form} onChange={set} width="calc(10% - 8px)" />
            <ModalField label="GoTo"          field="goTo"        form={form} onChange={set} width="calc(12% - 8px)" />
            <ComboField label={isCreate ? "Applicativo *" : "Applicativo"} field="applicativo" options={options.applicativo || []} form={form} onChange={set} width="calc(20% - 8px)" />
            <ModalField label="X Ordine"      field="xOrdine"    form={form} onChange={set} width="calc(18% - 8px)" />
            <ModalField label="Descrizione *" field="descrizione" form={form} onChange={set} width="calc(40% - 8px)" />
          </ModalSection>

          {/* Sezione: Responsabili */}
          <ModalSection title="Responsabili" color={sectionColor}>
            <ComboField label="PM Poste"       field="pmPoste"        options={options.pmPoste || []}        form={form} onChange={set} width="calc(30% - 8px)" />
            <ComboField label="PM CAP"          field="pmCap"          options={options.pmCap || []}          form={form} onChange={set} width="calc(30% - 8px)" />
          </ModalSection>

          {/* Sezione: Release */}
          <ModalSection title="Release" color={sectionColor}>
            <ComboField label="Anno Competenza" field="annoCompetenza" options={options.annoCompetenza || []} form={form} onChange={set} width="calc(20% - 8px)" />
            <ComboField label="Release"         field="releaseExcel"   options={options.releaseExcel || []}   form={form} onChange={set} width="calc(25% - 8px)" />
          </ModalSection>

          {/* Sezione: Stato e Contratto */}
          <ModalSection title="Stato e Contratto" color={sectionColor}>
            <ComboField label="Stato"          field="stato"         options={options.stato || []}         form={form} onChange={set} width="calc(20% - 8px)" />
            <ContrattoSelectField
              label="Tipo Contratto"
              field="tipoContratto"
              form={form}
              onChange={set}
              width="calc(20% - 8px)"
              contrattiOptions={contrattiTow.length > 0 ? contrattiTow : (options.tipoContratto || [])}
              onCrea={() => setShowCreaContratto(true)}
            />
            <ModalField label="BC"             field="bc"            form={form} onChange={set} width="calc(20% - 8px)" />
            <ModalField label="Contratto"      field="contratto"     form={form} onChange={set} width="calc(15% - 8px)" />
            <ModalField label="RDA"            field="rda"           form={form} onChange={set} width="calc(15% - 8px)" />
            <ModalField label="AT ID"          field="atId"          form={form} onChange={set} width="calc(10% - 8px)" />
          </ModalSection>

          {/* Sezione: TOW Offerta — griglia tabellare allineata */}
          <ModalSection title="TOW Offerta" color={sectionColor}>
            {/* Pulsante Calcola */}
            {TOW_FIELDS.some(({ key }) => towImpatto[key]) && (
              <div style={{ width: "100%", display: "flex", alignItems: "center", gap: "10px", marginBottom: "10px", padding: "8px 12px", background: "#f5f3ff", borderRadius: "8px", border: "1px solid #ddd8fe" }}>
                <span style={{ fontSize: "12px", color: "#7c3aed", fontWeight: 600, flex: 1 }}>
                  Inserisci il valore in TOW02.5 e clicca Calcola per distribuire proporzionalmente
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const importo025 = parseFloat(form.tow025) || 0;
                    if (!importo025) { alert("Inserisci prima il valore in € per TOW02.5"); return; }
                    if (!form.tipoContratto) { alert("Seleziona prima il Tipo Contratto"); return; }
                    const perc025 = towImpatto["TOW02.5"];
                    if (!perc025) { alert("Configura la % impatto per TOW02.5 in Gestione Contratto"); return; }
                    const prices = effectivePriceMap[form.tipoContratto] || {};
                    const totaleIntervento = importo025 / (perc025 / 100);
                    const updates = {};
                    TOW_FIELDS.forEach(({ key, field }) => {
                      if (field === "tow025") return;
                      const perc = towImpatto[key];
                      if (!perc) return;
                      const importoTow = totaleIntervento * perc / 100;
                      const valUnit = Number(prices[key]) || 0;
                      updates[field] = valUnit > 0
                        ? parseFloat((importoTow / valUnit).toFixed(3))
                        : parseFloat(importoTow.toFixed(2));
                    });
                    setForm(prev => ({ ...prev, ...updates }));
                  }}
                  style={{ padding: "5px 16px", borderRadius: "6px", border: "none", background: "#7c3aed", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}
                >
                  Calcola
                </button>
              </div>
            )}
            {/* Griglia tabellare: 6 colonne, una per TOW */}
            <div style={{ width: "100%", overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "6px 0", tableLayout: "fixed" }}>
                <colgroup>
                  {TOW_FIELDS.map(({ key }) => <col key={key} style={{ width: `${100 / TOW_FIELDS.length}%` }} />)}
                </colgroup>
                {/* Intestazioni: TOW key — % — importo€ */}
                <thead>
                  <tr>
                    {TOW_FIELDS.map(({ key, field }) => {
                      const perc = towImpatto[key];
                      const val = parseFloat(form[field]) || 0;
                      const prices = effectivePriceMap[form.tipoContratto] || {};
                      const valUnitTow = Number(prices[key]) || 0;
                      // TOW02.5: importo diretto in € (qty = €, nessuna moltiplicazione)
                      const importoTow = key === "TOW02.5"
                        ? (val > 0 ? val : null)
                        : (val > 0 && valUnitTow > 0 ? val * valUnitTow : null);
                      const perc025 = towImpatto["TOW02.5"];
                      const importo025 = parseFloat(form.tow025) || 0;
                      const totaleIntervento = perc025 && importo025 ? importo025 / (perc025 / 100) : null;
                      const atesoQty = totaleIntervento && perc && valUnitTow && field !== "tow025"
                        ? (totaleIntervento * perc / 100) / valUnitTow : null;
                      const scostamento = atesoQty && val ? Math.abs(val - atesoQty) / atesoQty * 100 : 0;
                      const isError = atesoQty != null && val > 0 && scostamento > 0.5;
                      return (
                        <th key={key} style={{ padding: "0 0 4px 0", textAlign: "center", verticalAlign: "bottom", fontWeight: 700, fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.4px", color: isError ? "#dc2626" : perc ? "#7c3aed" : "#555", whiteSpace: "nowrap" }}>
                          <div>{key}{isError && <span title={`Atteso: ${atesoQty?.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} — scost.: ${scostamento.toLocaleString("it-IT", { maximumFractionDigits: 2 })}%`} style={{ marginLeft: "3px", cursor: "help" }}>⚠</span>}</div>
                          {perc && <div style={{ fontWeight: 600, fontSize: "10px", color: "#7c3aed" }}>{perc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</div>}
                          {importoTow != null && <div style={{ fontWeight: 700, fontSize: "10px", color: isError ? "#dc2626" : "#1a73e8", marginTop: "1px" }}>{formatEuro(importoTow)}</div>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {/* Riga quantità (qty) */}
                  <tr>
                    {TOW_FIELDS.map(({ key, field }) => {
                      const prices = effectivePriceMap[form.tipoContratto] || {};
                      const valUnitTow = Number(prices[key]) || 0;
                      const val = parseFloat(form[field]) || 0;
                      const perc = towImpatto[key];
                      const perc025 = towImpatto["TOW02.5"];
                      const importo025 = parseFloat(form.tow025) || 0;
                      const totaleIntervento = perc025 && importo025 ? importo025 / (perc025 / 100) : null;
                      const atesoQty = totaleIntervento && perc && valUnitTow && field !== "tow025"
                        ? (totaleIntervento * perc / 100) / valUnitTow : null;
                      const scostamento = atesoQty && val ? Math.abs(val - atesoQty) / atesoQty * 100 : 0;
                      const isError = atesoQty != null && val > 0 && scostamento > 0.5;
                      return (
                        <td key={field} style={{ padding: "0 0 4px 0", verticalAlign: "top" }}>
                          <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${isError ? "#fca5a5" : "#dadce0"}`, borderRadius: "4px", overflow: "hidden", background: isError ? "#fff5f5" : "white" }}>
                            <button type="button"
                              onClick={() => set(field, Math.max(0, parseFloat(((parseFloat(form[field]) || 0) - 0.001).toFixed(3))))}
                              style={{ padding: "3px 5px", background: "#f1f3f4", border: "none", borderRight: "1px solid #dadce0", cursor: "pointer", fontSize: "13px", color: "#555", lineHeight: 1, flexShrink: 0 }}>−</button>
                            <input
                              value={form[field] ?? ""}
                              type="number" step="0.001" min="0"
                              onChange={e => set(field, e.target.value === "" ? null : parseFloat(e.target.value))}
                              style={{ flex: 1, padding: "4px 4px", border: "none", fontSize: "12px", color: isError ? "#dc2626" : "#333", textAlign: "right", minWidth: 0, outline: "none", background: "transparent", fontWeight: isError ? 700 : 400 }}
                            />
                            <button type="button"
                              onClick={() => set(field, parseFloat(((parseFloat(form[field]) || 0) + 0.001).toFixed(3)))}
                              style={{ padding: "3px 5px", background: "#f1f3f4", border: "none", borderLeft: "1px solid #dadce0", cursor: "pointer", fontSize: "13px", color: "#555", lineHeight: 1, flexShrink: 0 }}>+</button>
                          </div>
                          {isError && (
                            <div style={{ fontSize: "9px", color: "#dc2626", marginTop: "1px", textAlign: "right" }}>
                              Att.: {atesoQty?.toLocaleString("it-IT", { minimumFractionDigits: 3, maximumFractionDigits: 3 })}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                  {/* Riga importo € (visibile solo se almeno un TOW ha valoreUnitario, oppure TOW02.5 è presente) */}
                  {(TOW_FIELDS.some(({ key }) => Number((effectivePriceMap[form.tipoContratto] || {})[key]) > 0) || form.tow025) && (
                    <tr>
                      {TOW_FIELDS.map(({ key, field }) => {
                        const prices = effectivePriceMap[form.tipoContratto] || {};
                        const valUnitRaw = Number(prices[key]) || 0;
                        // TOW02.5: importo diretto in € → valUnitTow virtuale = 1
                        const valUnitTow = key === "TOW02.5" ? 1 : valUnitRaw;
                        const val = parseFloat(form[field]) || 0;
                        // TOW02.5: importoTow = qty stessa (è già in €)
                        const importoTow = key === "TOW02.5"
                          ? (val > 0 ? val : null)
                          : (val > 0 && valUnitTow > 0 ? val * valUnitTow : null);
                        return (
                          <td key={field} style={{ padding: "0 0 2px 0", verticalAlign: "top" }}>
                            {valUnitTow > 0 ? (
                              <TowEuroInput
                                importoTow={importoTow}
                                valUnitTow={valUnitTow}
                                onCommit={qty => set(field, qty)}
                              />
                            ) : (
                              <div style={{ height: "22px" }} />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ModalSection>

          {/* Sezione: Importi — tutti in € */}
          <ModalSection title="Importi" color={sectionColor}>
            {/* Importo Fornitura: calcolato in tempo reale dai TOW se priceMap disponibile */}
            <div style={{ marginBottom: "12px", width: "calc(25% - 8px)" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Importo Fornitura
              </label>
              <div style={{ padding: "6px 10px", border: `2px solid ${hasPriceMap ? sectionColor : "#dadce0"}`, borderRadius: "4px", fontSize: "13px", background: hasPriceMap ? (isCreate ? "#f0fdf4" : "#f0f6ff") : "#f8f9fa", color: hasPriceMap ? sectionColor : "#888", fontWeight: hasPriceMap ? 700 : 400, minHeight: "32px", textAlign: "right", whiteSpace: "nowrap" }}>
                {form.tipoContratto
                  ? hasPriceMap
                    ? formatEuro(displayImporto)
                    : <span style={{ color: "#ea4335", fontWeight: 400 }}>Nessun prezzo per {form.tipoContratto}</span>
                  : <span style={{ fontWeight: 400 }}>— seleziona Tipo Contratto —</span>
                }
              </div>
            </div>
            {/* Importo Scontato: ricalcolato proporzionalmente */}
            <div style={{ marginBottom: "12px", width: "calc(20% - 8px)" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                Importo Scontato
              </label>
              <div style={{ padding: "6px 10px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "13px", background: "#f8f9fa", color: "#1a73e8", fontWeight: 600, minHeight: "32px", textAlign: "right", whiteSpace: "nowrap" }}>
                {formatEuro(displayScontato)}
              </div>
            </div>
            <EuroField label="Ordinato (BdO)"  value={form.ordinatoBdo}        width="calc(20% - 8px)" />
            <EuroField label="Fatturato"        value={form.fatturato}          width="calc(20% - 8px)" />
            <ModalField label="Recupero"        field="recupero"  form={form} onChange={set} width="calc(12% - 8px)" />
            <EuroField label="Residuo Fatt."    value={form.residuoFatturabile} width="calc(15% - 8px)" />
          </ModalSection>

          {/* Sezione: Partecipazione — sempre visibile */}
          <ModalSection title="Partecipazione" color={sectionColor}>
            <div style={{ width: "calc(50% - 8px)" }}>
              <SocietàMultiSelect
                label="Mandataria / Mandante"
                value={form.capMandanti}
                onChange={v => set("capMandanti", v)}
                ruoli={["Mandataria", "Mandante"]}
                color="#1a73e8"
                bgColor="#eff6ff"
              />
            </div>
            <div style={{ width: "calc(50% - 8px)" }}>
              <SocietàMultiSelect
                label="SUBCO"
                value={form.subco}
                onChange={v => set("subco", v)}
                ruoli={["SUBCO"]}
                color="#f59e0b"
                bgColor="#fffbeb"
              />
            </div>
          </ModalSection>

          {/* Sezione: Extra — collassabile, mostra Accantonato, NEL, In Vita, CM, TBD */}
          {!showExtra ? (
            <div style={{ marginBottom: "16px" }}>
              <button type="button"
                onClick={() => setShowExtra(true)}
                style={{ fontSize: "12px", color: "#1a73e8", background: "none", border: "1px dashed #93c5fd", borderRadius: "6px", padding: "5px 14px", cursor: "pointer", fontWeight: 600 }}>
                + Extra
              </button>
            </div>
          ) : (
            <ModalSection title="Extra" color={sectionColor}>
              <ModalField label="Accantonato" field="accantonato" type="number" form={form} onChange={set} width="calc(15% - 8px)" />
              <ModalField label="NEL"         field="nel"         form={form} onChange={set} width="calc(10% - 8px)" />
              <ModalField label="In Vita"     field="inVita"      form={form} onChange={set} width="calc(10% - 8px)" />
              <ModalField label="CM"          field="cm"          form={form} onChange={set} width="calc(10% - 8px)" />
              <ModalField label="TBD"         field="tbd"         form={form} onChange={set} width="calc(10% - 8px)" />
              <div style={{ marginLeft: "auto", display: "flex", alignItems: "flex-end", paddingBottom: "2px" }}>
                <button type="button" onClick={() => setShowExtra(false)}
                  style={{ fontSize: "11px", color: "#94a3b8", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  Nascondi
                </button>
              </div>
            </ModalSection>
          )}

          {/* Sezione: Note Excel */}
          <ModalSection title="Note Excel" color={sectionColor}>
            <div style={{ width: "100%" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>Note</label>
              <textarea value={form.noteExcel ?? ""} onChange={(e) => set("noteExcel", e.target.value)}
                style={{ ...inputStyle(), minHeight: "72px", resize: "vertical" }} />
            </div>
          </ModalSection>

          {/* Sezione: PMO Poste */}
          <ModalSection title="PMO Poste" color={sectionColor}>
            <ModalField   label="P Anno"      field="pAnno"      type="number" form={form} onChange={set} width="calc(12% - 8px)" />
            <ComboField   label="P Release"   field="pRelease"   options={options.releaseExcel || []} form={form} onChange={set} width="calc(20% - 8px)" />
            <EuroEditField label="P Importo"  field="pImporto"   form={form} onChange={set} width="calc(20% - 8px)" />
            <EuroEditField label="Importo BDO" field="importoBdo" form={form} onChange={set} width="calc(20% - 8px)" />
            <div style={{ width: "calc(28% - 8px)" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>P Note</label>
              <textarea value={form.pNote ?? ""} onChange={(e) => set("pNote", e.target.value)}
                style={{ ...inputStyle(), minHeight: "56px", resize: "vertical" }} />
            </div>
          </ModalSection>
        </div>

        {/* ── Footer fisso ── */}
        <div style={{
          padding: "16px 28px", borderTop: "1px solid #e2e8f0", background: "#f8fafc",
          display: "flex", justifyContent: "space-between", alignItems: "center", flexShrink: 0,
        }}>
          <div style={{ fontSize: "12px", color: "#94a3b8" }}>
            {isCreate ? "Compila tutti i campi obbligatori (*)" : `Modifica riga ID ${row.excelId}`}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button style={btn("ghost")} onClick={onClose}>Annulla</button>
            <button
              style={{
                ...btn(isCreate ? "success" : "primary"),
                opacity: saving ? 0.7 : 1,
                minWidth: "140px",
              }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Salvataggio..." : isCreate ? "Crea GoTo" : "Salva modifiche"}
            </button>
          </div>
        </div>
      </div>

      {/* Modale Crea Contratto — si apre sopra la modale attuale, usa la stessa UI di Gestione Contratto */}
      {showCreaContratto && (
        <NewContrattoFiglioModal
          baseRows={baseRowsTow}
          onClose={() => setShowCreaContratto(false)}
          onCreated={(newRows) => {
            const nome = newRows[0]?.towContratto;
            if (nome) {
              setContrattiTow(prev => prev.includes(nome) ? prev : [...prev, nome]);
              set("tipoContratto", nome);
            }
            setShowCreaContratto(false);
          }}
        />
      )}
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────────────
function MevCapPage({ onUnauthorized, onRowsChange, onFilteredRowsChange, onAligned, ambienteId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [aligning, setAligning] = useState(false);
  const [editRow, setEditRow] = useState(null);
  const [createModal, setCreateModal] = useState(false);
  const [savedRows, setSavedRows] = useState({});
  const [notePopover, setNotePopover] = useState(null);
  const [mevOptions, setMevOptions] = useState({
    applicativo: [], pmPoste: [], pmCap: [], annoCompetenza: [],
    releaseExcel: [], stato: [], tipoContratto: [], priceMap: {},
  });
  const role = localStorage.getItem("role") || "";

  const defaultFilters = {
    goTo: [], applicativo: [], stato: [], annoCompetenza: [],
    tipoContratto: [], releaseExcel: [], pmPoste: [], pmCap: [],
    oda: [], rda: [], capgemini: [], iet: [], subco: [],
    recupero: [], pAnno: [], pRelease: [], importoExcel: []
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
      const [data, opts] = await Promise.all([getMevList(), getMevOptions()]);
      setRows(data);
      onRowsChange?.(data);
      setMevOptions({
        applicativo:    opts.applicativo    || [],
        pmPoste:        opts.pmPoste        || [],
        pmCap:          opts.pmCap          || [],
        annoCompetenza: opts.annoCompetenza || [],
        releaseExcel:   opts.releaseExcel   || [],
        stato:          opts.stato          || [],
        tipoContratto:  opts.tipoContratto  || [],
        priceMap:       opts.priceMap       || {},
      });
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

  // Opzioni filtro Mandataria/Mandante: risolve i valori legacy "x" nei nomi reali
  const buildOptionsMandataria = () => {
    const names = new Set();
    rows.forEach(r => {
      resolveCapMandanti(r.capgemini, r.iet).forEach(s => { if (s && s.trim()) names.add(s); });
    });
    return [...names].sort();
  };

  const withVuoto = (opts, field) => {
    const hasEmpty = rows.some((r) => !r[field] || String(r[field]).trim() === "");
    return [...opts, ...(hasEmpty ? ["(vuoto)"] : [])];
  };

  const withVuotoMandataria = (opts) => {
    const hasEmpty = rows.some(r => resolveCapMandanti(r.capgemini, r.iet).length === 0);
    return [...opts, ...(hasEmpty ? ["(vuoto)"] : [])];
  };

  const matchField = (r, filterKey, rowField) => {
    if (filters[filterKey].length === 0) return true;
    const val = r[rowField] ?? "";
    if (!String(val).trim() && filters[filterKey].includes("(vuoto)")) return true;
    return filters[filterKey].includes(String(val));
  };

  // Filtro Mandataria/Mandante: usa i nomi risolti (gestisce legacy "x")
  const matchMandataria = (r) => {
    if (filters.capgemini.length === 0) return true;
    const resolved = resolveCapMandanti(r.capgemini, r.iet);
    if (resolved.length === 0 && filters.capgemini.includes("(vuoto)")) return true;
    return resolved.some(s => filters.capgemini.includes(s));
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
    matchMandataria(r) &&
    matchField(r, "iet", "iet") &&
    matchField(r, "subco", "subco") &&
    matchField(r, "recupero", "recupero") &&
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
      // Importi ricalcolati dai TOW (se presenti nel form dopo il save della modale)
      importoExcel:               form.importoExcel             != null ? Number(form.importoExcel) : undefined,
      importoFornituraScontato:   form.importoFornituraScontato != null ? Number(form.importoFornituraScontato) : undefined,
      towTotale:                  form.towTotale                != null ? Number(form.towTotale) : undefined,
    });
    setRows((prev) => prev.map((r) => (r.id === form.id ? { ...r, ...updated } : r)));
    setSavedRows((prev) => ({ ...prev, [form.id]: true }));
    setTimeout(() => setSavedRows((prev) => ({ ...prev, [form.id]: false })), 2000);
  };

  // ── Crea nuova riga ───────────────────────────────────────────────────────
  const handleCreateSave = async (form) => {
    const newItem = await createMev({
      excelId:       form.excelId?.trim(),
      applicativo:   form.applicativo,
      descrizione:   form.descrizione,
      goTo:          form.goTo,
      xOrdine:       form.xOrdine,
      pmPoste:       form.pmPoste,
      pmCap:         form.pmCap,
      annoCompetenza: Number(form.annoCompetenza) || 0,
      releaseExcel:  form.releaseExcel,
      stato:         form.stato,
      tipoContratto: form.tipoContratto,
      importoExcel:  Number(form.importoExcel) || 0,
      recupero:      form.recupero,
      noteExcel:     form.noteExcel,
      bc:            form.bc,
      contratto:     form.contratto,
      rda:           form.rda,
      atId:          form.atId,
      nel:           form.nel,
      inVita:        form.inVita,
      cm:            form.cm,
      subco:         form.subco,
      tbd:           form.tbd,
      accantonato:   form.accantonato != null ? Number(form.accantonato) : null,
      tow021:        form.tow021 != null ? Number(form.tow021) : null,
      tow022:        form.tow022 != null ? Number(form.tow022) : null,
      tow023:        form.tow023 != null ? Number(form.tow023) : null,
      tow024:        form.tow024 != null ? Number(form.tow024) : null,
      tow025:        form.tow025 != null ? Number(form.tow025) : null,
      tow026:        form.tow026 != null ? Number(form.tow026) : null,
      pAnno:         Number(form.pAnno) || 0,
      pRelease:      form.pRelease ?? "",
      pImporto:      Number(form.pImporto) || 0,
      pNote:         form.pNote,
      importoBdo:    Number(form.importoBdo) || 0,
    });
    setRows((prev) => [...prev, newItem]);
    onRowsChange?.([...rows, newItem]);
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
            <input id="upload-excel-cap" type="file" accept=".xlsx" style={{ display: "none" }}
              onChange={async (e) => {
                const file = e.target.files[0];
                if (!file) return;
                try {
                  await uploadExcel(file);
                  alert("File caricato sul server come MEV_LAST.xlsx.\nClicca 'Allinea Dati' per importare i dati.");
                } catch (err) { alert(`Errore caricamento: ${err.message}`); }
                e.target.value = "";
              }} />
            <label htmlFor="upload-excel-cap" style={{ ...btn("ghost"), cursor: "pointer" }}>
              Carica Excel
            </label>
          </>
        )}

        {/* Info: da dove viene il file */}
        <div style={{ fontSize: "11px", color: "#888", padding: "4px 8px", background: "#f8f9fa", borderRadius: "6px", border: "1px solid #e8eaed", maxWidth: "280px" }}>
          <strong style={{ color: "#555" }}>Allinea Dati</strong> usa l'ultimo file caricato con "Carica Excel" (MEV_LAST.xlsx sul server). Le modifiche PMO vengono preservate.
        </div>

        <button style={btn("success")} onClick={() => setCreateModal(true)}>
          + Nuovo GoTo
        </button>

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
              <th style={{ padding: "4px 6px", minWidth: "80px" }}><MultiSelect options={withVuoto(buildOptions("recupero"), "recupero")} selected={filters.recupero || []} onChange={(v) => handleFilterChange("recupero", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "130px" }}></th>
              <th style={{ padding: "4px 6px" }}></th>
              <th style={{ padding: "4px 6px", minWidth: "120px" }}><MultiSelect options={withVuoto(buildOptions("bc"), "bc")} selected={filters.oda} onChange={(v) => handleFilterChange("oda", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px", minWidth: "100px" }}><MultiSelect options={withVuoto(buildOptions("atId"), "atId")} selected={filters.rda} onChange={(v) => handleFilterChange("rda", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={withVuotoMandataria(buildOptionsMandataria())} selected={filters.capgemini} onChange={(v) => handleFilterChange("capgemini", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={withVuoto(buildOptions("subco"), "subco")} selected={filters.subco} onChange={(v) => handleFilterChange("subco", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={buildOptions("pAnno")} selected={filters.pAnno} onChange={(v) => handleFilterChange("pAnno", v)} placeholder="Tutti" /></th>
              <th style={{ padding: "4px 6px" }}><MultiSelect options={withVuoto(buildOptions("pRelease"), "pRelease")} selected={filters.pRelease} onChange={(v) => handleFilterChange("pRelease", v)} placeholder="Tutte" /></th>
              <th style={{ padding: "4px 6px" }}></th><th style={{ padding: "4px 6px" }}></th>
            </tr>
            {/* Intestazioni */}
            <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dadce0" }}>
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
              <TH minW="80px">Recupero</TH>
              <TH minW="130px">Importo CAP</TH>
              <TH minW="60px">Note</TH>
              <TH minW="120px">ODA (BC)</TH>
              <TH minW="100px">RDA (AT ID)</TH>
              <TH minW="140px">Mandataria/Mandante</TH>
              <TH minW="120px">Subco</TH>
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
                  onClick={() => setEditRow(r)}
                  style={{ backgroundColor: bg, borderBottom: "1px solid #f0f0f0", transition: "background-color 0.1s", cursor: "pointer" }}
                  onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = bgHover)}
                  onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = bg)}>

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
                  <td style={{ ...TD, textAlign: "center", fontSize: "12px" }}>
                    {r.recupero ? (
                      <span style={{
                        display: "inline-block", padding: "2px 8px", borderRadius: "12px", fontSize: "11px", fontWeight: 600,
                        background: r.recupero.toUpperCase() === "SI" ? "#e6f4ea" : "#f1f3f4",
                        color: r.recupero.toUpperCase() === "SI" ? "#2e7d32" : "#555",
                      }}>{r.recupero}</span>
                    ) : ""}
                  </td>
                  <td style={{ ...TD, textAlign: "right", whiteSpace: "nowrap" }}>{formatEuro(r.importoExcel)}</td>

                  {/* Note */}
                  <td style={{ ...TD, textAlign: "center" }}>
                    {r.noteExcel ? (
                      <button data-note-btn="1"
                        onClick={(e) => {
                          e.stopPropagation();
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
                  <td style={{ ...TD }}>
                    {resolveCapMandanti(r.capgemini, r.iet).length > 0
                      ? <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                          {resolveCapMandanti(r.capgemini, r.iet).map(s => (
                            <span key={s} style={{ background: "#eff6ff", color: "#1a73e8", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" }}>{s}</span>
                          ))}
                        </div>
                      : <span style={{ color: "#cbd5e1", fontSize: "11px" }}>—</span>
                    }
                  </td>
                  <td style={{ ...TD }}>
                    {parseSocietà(r.subco).length > 0
                      ? <div style={{ display: "flex", flexWrap: "wrap", gap: "3px" }}>
                          {parseSocietà(r.subco).map(s => (
                            <span key={s} style={{ background: "#fffbeb", color: "#d97706", border: "1px solid #fde68a", borderRadius: "10px", padding: "1px 7px", fontSize: "11px", fontWeight: 700, whiteSpace: "nowrap" }}>{s}</span>
                          ))}
                        </div>
                      : <span style={{ color: "#cbd5e1", fontSize: "11px" }}>—</span>
                    }
                  </td>

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
          mode="edit"
          options={mevOptions}
          onClose={() => setEditRow(null)}
          onSave={handleModalSave}
        />
      )}

      {/* Modale crea nuova riga */}
      {createModal && (
        <EditModal
          row={null}
          mode="create"
          options={mevOptions}
          nextId={(() => {
            const nums = rows
              .map((r) => parseInt(r.excelId, 10))
              .filter((n) => !isNaN(n));
            return nums.length > 0 ? Math.max(...nums) + 1 : 1;
          })()}
          onClose={() => setCreateModal(false)}
          onSave={handleCreateSave}
        />
      )}
    </div>
  );
}

export default MevCapPage;
