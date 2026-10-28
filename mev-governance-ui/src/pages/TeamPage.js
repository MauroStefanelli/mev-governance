import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { getTeam, createTeamMember, updateTeamMember, deleteTeamMember, importTeam } from "../services/mevService";

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtEuro = (v) => {
  const n = Number(v);
  if (v === null || v === undefined || v === "") return "—";
  return `€ ${n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};
const fmtDate = (v) => {
  if (!v) return "";
  try { return new Date(v).toLocaleDateString("it-IT"); } catch { return v; }
};
const parseDate = (v) => {
  if (!v) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{5,}$/.test(s)) {
    const d = XLSX.SSF.parse_date_code(Number(s));
    if (d) return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  const it = s.match(new RegExp('^(\\d{1,2})[\\/\\-](\\d{1,2})[\\/\\-](\\d{4})$'));
  if (it) return `${it[3]}-${it[2].padStart(2,"0")}-${it[1].padStart(2,"0")}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
};
const normalize = (s) => String(s ?? "").trim().toLowerCase();
const isAttiva = (r) => {
  if (!r.dataUscita) return true;
  const today = new Date(); today.setHours(0,0,0,0);
  return new Date(r.dataUscita) >= today;
};
const costoEffettivo = (r) => (Number(r.cor) || 0) * (Number(r.percImpegno) || 100) / 100;

// ── Dati colonne ───────────────────────────────────────────────────────────────
const EMPTY_FORM = {
  risorsa: "", ambito: "", specialita: "", posteApplication: "",
  note: "", risorsaGrade: "", grade: "", cdc: "", practice: "",
  adrc: "", cor: "", percImpegno: 100, corpId: "", email: "",
  dataIngresso: "", dataUscita: "",
};
// Colonne mostrate in tabella (ridotte)
const COLS = [
  { key: "risorsa",          label: "Risorsa",           required: true, minW: 140 },
  { key: "ambito",           label: "Ambito",                            minW: 100 },
  { key: "posteApplication", label: "Poste App.",                        minW: 100 },
  { key: "grade",            label: "GRADE",                             minW: 70  },
  { key: "adrc",             label: "ADRC (€)",          euro: true,     minW: 100 },
  { key: "cor",              label: "COR (€)",           euro: true,     minW: 100 },
  { key: "percImpegno",      label: "% Impegno",         perc: true,     minW: 90  },
  { key: "corpId",           label: "Corp ID",                           minW: 80  },
  { key: "dataIngresso",     label: "Data Ingresso",     date: true,     minW: 110 },
  { key: "dataUscita",       label: "Data Uscita",       date: true,     minW: 110 },
];

// Tutti i campi per il modale di edit/creazione
const ALL_FORM_COLS = [
  { key: "risorsa",          label: "Risorsa",           required: true },
  { key: "ambito",           label: "Ambito" },
  { key: "specialita",       label: "Specialità" },
  { key: "posteApplication", label: "Poste Application" },
  { key: "risorsaGrade",     label: "Risorse GRADE" },
  { key: "grade",            label: "GRADE" },
  { key: "cdc",              label: "CDC" },
  { key: "practice",         label: "Practice" },
  { key: "adrc",             label: "ADRC (€)",          euro: true },
  { key: "cor",              label: "COR (€)",           euro: true },
  { key: "percImpegno",      label: "% Impegno",         perc: true },
  { key: "corpId",           label: "Corp ID" },
  { key: "email",            label: "E-mail",            mail: true },
  { key: "dataIngresso",     label: "Data Ingresso",     date: true },
  { key: "dataUscita",       label: "Data Uscita",       date: true },
  { key: "note",             label: "Note" },
];

const EXCEL_COL_MAP = {
  "risorse": "risorsa", "risorsa": "risorsa",
  "ambito": "ambito",
  "specialità": "specialita", "specialita": "specialita",
  "poste application": "posteApplication", "poste app": "posteApplication",
  "note": "note",
  "risorse grade": "risorsaGrade", "risorse_grade": "risorsaGrade",
  "grade": "grade",
  "cdc": "cdc",
  "practice": "practice",
  "adrc": "adrc",
  "cor": "cor",
  "% impegno": "percImpegno", "%impegno": "percImpegno", "impegno": "percImpegno",
  "corp id": "corpId", "corp_id": "corpId", "corpid": "corpId",
  "e-mail address": "email", "email address": "email", "email": "email", "e-mail": "email",
  "data ingresso": "dataIngresso", "data_ingresso": "dataIngresso", "ingresso": "dataIngresso",
  "data uscita": "dataUscita", "data_uscita": "dataUscita", "uscita": "dataUscita",
};

// ── Sotto-componenti UI ────────────────────────────────────────────────────────
const KpiCard = ({ label, value, sub, color, bg, icon }) => (
  <div style={{
    background: bg, borderRadius: "14px", padding: "18px 24px",
    minWidth: "210px", flex: "1", maxWidth: "280px",
    boxShadow: "0 2px 8px rgba(0,0,0,0.07)",
    display: "flex", alignItems: "center", gap: "16px",
  }}>
    <div style={{ fontSize: "28px", opacity: 0.85 }}>{icon}</div>
    <div>
      <div style={{ fontSize: "11px", fontWeight: 700, color, textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>{label}</div>
      <div style={{ fontSize: "24px", fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: "11px", color, opacity: 0.7, marginTop: "3px" }}>{sub}</div>}
    </div>
  </div>
);

function Badge({ children, color = "#6b7280", bg = "#f3f4f6" }) {
  return (
    <span style={{ display: "inline-block", padding: "2px 8px", borderRadius: "10px", fontSize: "11px", fontWeight: 600, color, background: bg, whiteSpace: "nowrap" }}>
      {children}
    </span>
  );
}

// ── Modale add/edit ────────────────────────────────────────────────────────────
function MemberModal({ initial, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(() => initial ? {
    ...EMPTY_FORM, ...initial,
    adrc: initial.adrc != null ? String(Number(initial.adrc).toFixed(2)).replace(".", ",") : "",
    cor:  initial.cor  != null ? String(Number(initial.cor).toFixed(2)).replace(".", ",")  : "",
    percImpegno: initial.percImpegno ?? 100,
    dataIngresso: initial.dataIngresso ? String(initial.dataIngresso).slice(0,10) : "",
    dataUscita:   initial.dataUscita   ? String(initial.dataUscita).slice(0,10)   : "",
  } : { ...EMPTY_FORM });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.risorsa.trim()) { alert("Risorsa obbligatoria"); return; }
    setSaving(true);
    const payload = {
      ...form,
      adrc: form.adrc !== "" && form.adrc !== null ? Number(String(form.adrc).replace(",",".")) : null,
      cor:  form.cor  !== "" && form.cor  !== null ? Number(String(form.cor).replace(",","."))  : null,
      percImpegno: Number(form.percImpegno) || 100,
      dataIngresso: form.dataIngresso || null,
      dataUscita:   form.dataUscita   || null,
    };
    try { await onSave(payload); onClose(); }
    catch (e) { alert(`Errore: ${e.message}`); }
    finally { setSaving(false); }
  };

  const Field = ({ col }) => (
    <div style={{ width: col.key === "note" ? "100%" : "calc(33% - 9px)", minWidth: "140px", marginBottom: "2px" }}>
      <label style={{ display: "block", fontSize: "10px", fontWeight: 700, color: "#6b7280", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.5px" }}>
        {col.label}{col.required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {col.key === "note" ? (
        <textarea value={form[col.key] ?? ""} onChange={e => set(col.key, e.target.value)} rows={2}
          style={inputSt()} />
      ) : col.date ? (
        <input type="date" value={form[col.key] ?? ""} onChange={e => set(col.key, e.target.value)} style={inputSt()} />
      ) : col.euro ? (
        <div style={{ display: "flex", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden", background: "#fafafa" }}>
          <input type="text" inputMode="decimal" value={form[col.key] ?? ""} onChange={e => set(col.key, e.target.value)}
            placeholder="0.00"
            style={{ flex: 1, padding: "8px 10px", border: "none", fontSize: "13px", textAlign: "right", background: "transparent", outline: "none" }} />
          <span style={{ padding: "0 10px", color: "#9ca3af", fontSize: "13px", fontWeight: 600 }}>€</span>
        </div>
      ) : col.perc ? (
        <div style={{ display: "flex", alignItems: "center", border: "1px solid #e5e7eb", borderRadius: "8px", overflow: "hidden", background: "#fafafa" }}>
          <input type="text" inputMode="decimal" value={form[col.key] ?? 100} onChange={e => set(col.key, e.target.value)}
            placeholder="100"
            style={{ flex: 1, padding: "8px 10px", border: "none", fontSize: "13px", textAlign: "right", background: "transparent", outline: "none" }} />
          <span style={{ padding: "0 10px", color: "#9ca3af", fontSize: "13px", fontWeight: 600 }}>%</span>
        </div>
      ) : (
        <input value={form[col.key] ?? ""} onChange={e => set(col.key, e.target.value)} style={inputSt()} />
      )}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", width: "min(760px, 96vw)", maxHeight: "92vh", overflowY: "auto", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "24px" }}>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>{initial ? "Modifica membro" : "Nuovo membro"}</h3>
            <p style={{ margin: "2px 0 0", fontSize: "13px", color: "#94a3b8" }}>{initial ? "Aggiorna i dati della risorsa" : "Aggiungi una nuova risorsa al team"}</p>
          </div>
          <button onClick={onClose} style={{ background: "#f1f5f9", border: "none", borderRadius: "8px", width: "32px", height: "32px", fontSize: "18px", cursor: "pointer", color: "#64748b", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {ALL_FORM_COLS.map(col => <Field key={col.key} col={col} />)}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "10px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #f1f5f9" }}>
          <div>
            {initial && onDelete && (
              <button onClick={() => onDelete(initial)} style={{ padding: "9px 18px", borderRadius: "8px", border: "none", background: "#fee2e2", fontSize: "13px", fontWeight: 700, cursor: "pointer", color: "#dc2626" }}>
                🗑 Elimina
              </button>
            )}
          </div>
          <div style={{ display: "flex", gap: "10px" }}>
            <button onClick={onClose} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#64748b" }}>Annulla</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "9px 24px", borderRadius: "8px", border: "none", background: saving ? "#93c5fd" : "#2563eb", fontSize: "13px", fontWeight: 700, cursor: "pointer", color: "white" }}>
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const inputSt = () => ({ width: "100%", padding: "8px 10px", border: "1px solid #e5e7eb", borderRadius: "8px", fontSize: "13px", boxSizing: "border-box", background: "#fafafa", outline: "none" });

// ── Tabella risorse ────────────────────────────────────────────────────────────
function TeamTable({ rows, onEdit, dimmed }) {
  if (rows.length === 0) return (
    <div style={{ textAlign: "center", padding: "40px", color: "#94a3b8", fontSize: "14px" }}>
      Nessuna risorsa
    </div>
  );
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
        <thead>
          <tr>
            <th style={thSt()}>#</th>
            {COLS.map(c => <th key={c.key} style={{ ...thSt(), minWidth: c.minW }}>{c.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, idx) => (
            <tr key={r.id}
              onClick={() => onEdit(r)}
              style={{ opacity: dimmed ? 0.65 : 1, background: idx % 2 === 0 ? "#fff" : "#f8fafc", cursor: "pointer" }}
              onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
              onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#f8fafc"}>
              <td style={{ ...tdSt(), color: "#cbd5e1", fontSize: "11px", textAlign: "center" }}>{idx + 1}</td>
              {COLS.map(c => (
                <td key={c.key} style={{ ...tdSt(), overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {c.euro
                    ? <span style={{ fontWeight: 600, color: "#0ea5e9" }}>{fmtEuro(r[c.key])}</span>
                    : c.perc
                      ? <Badge color={Number(r[c.key]) < 100 ? "#d97706" : "#16a34a"} bg={Number(r[c.key]) < 100 ? "#fef3c7" : "#dcfce7"}>{Number(r[c.key]) || 100}%</Badge>
                      : c.date
                        ? <span style={{ color: "#64748b", fontSize: "12px" }}>{fmtDate(r[c.key])}</span>
                        : c.mail && r[c.key]
                          ? <a href={`mailto:${r[c.key]}`} style={{ color: "#2563eb", textDecoration: "none" }} onClick={e => e.stopPropagation()}>{r[c.key]}</a>
                          : <span>{r[c.key] ?? ""}</span>
                  }
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const thSt = () => ({ padding: "10px 10px", textAlign: "left", fontWeight: 700, fontSize: "11px", color: "#64748b", whiteSpace: "nowrap", borderBottom: "2px solid #e2e8f0", background: "#f8fafc", position: "sticky", top: 0, zIndex: 2, textTransform: "uppercase", letterSpacing: "0.4px" });
const tdSt = () => ({ padding: "9px 10px", fontSize: "13px", color: "#1e293b", borderBottom: "1px solid #f1f5f9", verticalAlign: "middle" });

// ── Pagina principale ──────────────────────────────────────────────────────────
export default function TeamPage({ onUnauthorized, ambienteId }) {
  const [rows, setRows]               = useState([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState("");
  const [modal, setModal]             = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [importing, setImporting]     = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [showDestaffati, setShowDestaffati] = useState(false);
  const [giorniAnno, setGiorniAnnoState] = useState(() => {
    const saved = localStorage.getItem("team_giorniAnno");
    return saved ? Number(saved) : 232;
  });
  const setGiorniAnno = (v) => { setGiorniAnnoState(v); localStorage.setItem("team_giorniAnno", v); };

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await getTeam()); }
    catch (e) { if (e.message === "401") onUnauthorized?.(); }
    finally { setLoading(false); }
  }, [ambienteId]); // eslint-disable-line
  useEffect(() => { load(); }, [load]);

  // ── Filtro e split ─────────────────────────────────────────────────────────
  const q = search.trim().toLowerCase();
  const filtered = rows.filter(r => !q || COLS.some(c => String(r[c.key] ?? "").toLowerCase().includes(q)));
  const attivi      = filtered.filter(isAttiva);
  const destaffati  = filtered.filter(r => !isAttiva(r));

  // ── KPI (solo attivi nella ricerca corrente) ───────────────────────────────
  const costoGiorno = attivi.reduce((s, r) => s + costoEffettivo(r), 0);
  const costoMese   = costoGiorno * 20;
  const costoAnno   = costoGiorno * (Number(giorniAnno) || 232);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleSave = async (form) => {
    if (modal.mode === "create") {
      const created = await createTeamMember(form);
      setRows(prev => [...prev, created].sort((a, b) => a.risorsa.localeCompare(b.risorsa)));
    } else {
      const updated = await updateTeamMember(modal.row.id, form);
      setRows(prev => prev.map(r => r.id === modal.row.id ? updated : r));
    }
  };

  const handleDelete = async (row) => {
    try { await deleteTeamMember(row.id); setRows(prev => prev.filter(r => r.id !== row.id)); }
    catch (e) { alert(`Errore: ${e.message}`); }
    setConfirmDelete(null);
  };

  const handleImport = (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    e.target.value = ""; setImporting(true); setImportResult(null);
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array", cellDates: false });
        const sheetName = wb.SheetNames.find(n => n.trim().toUpperCase().startsWith("TEAM"));
        if (!sheetName) { alert(`Foglio "TEAM*" non trovato.\n${wb.SheetNames.join(", ")}`); setImporting(false); return; }
        const ws = wb.Sheets[sheetName];
        let jsonRows = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const hasMappable = (rs) => rs.some(row => Object.keys(row).some(k => EXCEL_COL_MAP[normalize(k)]));
        if (jsonRows.length === 0 || !hasMappable(jsonRows)) {
          const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          let hi = -1;
          for (let i = 0; i < Math.min(10, raw.length); i++) { if (raw[i].some(c => EXCEL_COL_MAP[normalize(c)])) { hi = i; break; } }
          if (hi >= 0) { const hdr = raw[hi]; jsonRows = raw.slice(hi+1).map(row => { const o = {}; hdr.forEach((h,i)=>{o[h]=row[i]??""}); return o; }); }
        }
        const mapped = jsonRows.map(row => {
          const out = { ...EMPTY_FORM };
          for (const [ek, val] of Object.entries(row)) {
            const f = EXCEL_COL_MAP[normalize(ek)]; if (!f) continue;
            if (f === "adrc" || f === "cor") { const n = parseFloat(String(val).replace(",",".")); out[f] = isNaN(n) ? null : n; }
            else if (f === "percImpegno") { const n = parseFloat(String(val)); out[f] = isNaN(n) ? 100 : n; }
            else if (f === "dataIngresso" || f === "dataUscita") { out[f] = parseDate(val); }
            else { out[f] = String(val ?? "").trim(); }
          }
          return out;
        }).filter(r => r.risorsa?.trim());
        if (!mapped.length) { alert("Nessuna riga valida."); setImporting(false); return; }
        const result = await importTeam(mapped);
        setImportResult(`Importati ${result.imported} membri`);
        await load();
      } catch (err) { alert(`Errore importazione: ${err.message}`); }
      finally { setImporting(false); }
    };
    reader.readAsArrayBuffer(file);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "300px", flexDirection: "column", gap: "12px" }}>
      <div style={{ width: "36px", height: "36px", border: "3px solid #e2e8f0", borderTop: "3px solid #2563eb", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <span style={{ color: "#94a3b8", fontSize: "14px" }}>Caricamento team…</span>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", maxWidth: "1700px", margin: "0 auto", fontFamily: "system-ui, -apple-system, sans-serif" }}>

      {/* ── Page header ── */}
      <div style={{ marginBottom: "24px" }}>
        <h1 style={{ margin: 0, fontSize: "26px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.5px" }}>Gestione Team</h1>
        <p style={{ margin: "4px 0 0", fontSize: "14px", color: "#94a3b8" }}>
          {rows.length} risorse totali · {attivi.length} attive · {destaffati.length} destaffate
        </p>
      </div>

      {/* ── KPI ── */}
      <div style={{ display: "flex", gap: "16px", marginBottom: "28px", flexWrap: "wrap" }}>
        <KpiCard label="Costo al giorno" value={fmtEuro(costoGiorno)} sub={`${attivi.length} risorse attive${q ? " (filtrate)" : ""}`} color="#2563eb" bg="linear-gradient(135deg,#eff6ff,#dbeafe)" icon="💼" />
        <KpiCard label="Costo al mese" value={fmtEuro(costoMese)} sub="× 20 giorni lavorativi" color="#059669" bg="linear-gradient(135deg,#ecfdf5,#d1fae5)" icon="📅" />
        <div style={{ background: "linear-gradient(135deg,#fff7ed,#fed7aa)", borderRadius: "14px", padding: "18px 24px", minWidth: "210px", flex: "1", maxWidth: "280px", boxShadow: "0 2px 8px rgba(0,0,0,0.07)", display: "flex", alignItems: "center", gap: "16px" }}>
          <div style={{ fontSize: "28px", opacity: 0.85 }}>📆</div>
          <div>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#c2410c", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "4px" }}>Costo anno</div>
            <div style={{ fontSize: "24px", fontWeight: 800, color: "#ea580c", lineHeight: 1 }}>{fmtEuro(costoAnno)}</div>
            <div style={{ fontSize: "11px", color: "#c2410c", opacity: 0.85, marginTop: "4px", display: "flex", alignItems: "center", gap: "4px" }}>
              ×
              <input
                type="text" inputMode="numeric"
                value={giorniAnno}
                onChange={e => setGiorniAnno(e.target.value.replace(/[^0-9]/g, ""))}
                style={{ width: "36px", padding: "1px 4px", border: "1px solid #fdba74", borderRadius: "4px", fontSize: "11px", fontWeight: 700, color: "#c2410c", background: "rgba(255,255,255,0.6)", textAlign: "center", outline: "none" }}
              />
              gg lavorativi/anno
            </div>
          </div>
        </div>
        <KpiCard label="Risorse attive" value={attivi.length} sub={`${destaffati.length} destaffate`} color="#7c3aed" bg="linear-gradient(135deg,#f5f3ff,#ede9fe)" icon="👥" />
      </div>

      {/* ── Toolbar ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "20px" }}>
        <div style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: "12px", top: "50%", transform: "translateY(-50%)", color: "#94a3b8", fontSize: "14px" }}>🔍</span>
          <input type="text" placeholder="Cerca risorsa, ambito, specialità…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ paddingLeft: "36px", paddingRight: "12px", paddingTop: "9px", paddingBottom: "9px", border: "1px solid #e2e8f0", borderRadius: "10px", fontSize: "13px", width: "280px", background: "#f8fafc", outline: "none" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {importResult && <span style={{ fontSize: "12px", color: "#16a34a", fontWeight: 700, background: "#dcfce7", padding: "4px 10px", borderRadius: "6px" }}>{importResult}</span>}
          <label style={{ padding: "9px 16px", display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", border: "1px solid #e2e8f0", borderRadius: "10px", fontSize: "13px", fontWeight: 600, color: "#374151", background: "#f8fafc" }}>
            {importing ? "⏳ Importazione…" : "📥 Importa Excel"}
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: "none" }} disabled={importing} />
          </label>
          <button onClick={() => setModal({ mode: "create" })}
            style={{ padding: "9px 20px", borderRadius: "10px", border: "none", background: "#2563eb", fontSize: "13px", fontWeight: 700, cursor: "pointer", color: "white", boxShadow: "0 2px 8px rgba(37,99,235,0.3)" }}>
            + Nuovo membro
          </button>
        </div>
      </div>

      {/* ── Tabella attivi ── */}
      <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.05)", marginBottom: "24px" }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#22c55e", display: "inline-block" }} />
            <span style={{ fontWeight: 700, fontSize: "15px", color: "#0f172a" }}>Team Attivo</span>
            <Badge color="#16a34a" bg="#dcfce7">{attivi.length}</Badge>
          </div>
        </div>
        <TeamTable rows={attivi} onEdit={r => setModal({ mode: "edit", row: r })} dimmed={false} />
      </div>

      {/* ── Tabella destaffati (collassabile) ── */}
      {destaffati.length > 0 && (
        <div style={{ background: "#fff", borderRadius: "16px", border: "1px solid #e2e8f0", overflow: "hidden", boxShadow: "0 2px 12px rgba(0,0,0,0.05)" }}>
          <div style={{ padding: "16px 20px", borderBottom: showDestaffati ? "1px solid #f1f5f9" : "none", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}
            onClick={() => setShowDestaffati(p => !p)}>
            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
              <span style={{ width: "10px", height: "10px", borderRadius: "50%", background: "#94a3b8", display: "inline-block" }} />
              <span style={{ fontWeight: 700, fontSize: "15px", color: "#64748b" }}>Team Destaffato</span>
              <Badge color="#64748b" bg="#f1f5f9">{destaffati.length}</Badge>
            </div>
            <span style={{ color: "#94a3b8", fontSize: "18px", transition: "transform 0.2s", display: "inline-block", transform: showDestaffati ? "rotate(180deg)" : "rotate(0deg)" }}>▼</span>
          </div>
          {showDestaffati && (
            <TeamTable rows={destaffati} onEdit={r => setModal({ mode: "edit", row: r })} dimmed={true} />
          )}
        </div>
      )}

      {/* ── Modale ── */}
      {modal && <MemberModal initial={modal.mode === "edit" ? modal.row : null} onClose={() => setModal(null)} onSave={handleSave} onDelete={modal.mode === "edit" ? (r) => { setModal(null); setConfirmDelete(r); } : null} />}

      {/* ── Conferma eliminazione ── */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.5)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(2px)" }}>
          <div style={{ background: "#fff", borderRadius: "16px", padding: "28px 32px", width: "min(420px, 92vw)", boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
            <div style={{ fontSize: "32px", marginBottom: "12px" }}>🗑️</div>
            <h3 style={{ margin: "0 0 8px", fontSize: "18px", fontWeight: 800, color: "#0f172a" }}>Elimina risorsa</h3>
            <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: "14px" }}>
              Stai eliminando <strong>{confirmDelete.risorsa}</strong>. L&apos;operazione non è reversibile.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px" }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: "9px 20px", borderRadius: "8px", border: "1px solid #e2e8f0", background: "#fff", fontSize: "13px", fontWeight: 600, cursor: "pointer", color: "#64748b" }}>Annulla</button>
              <button onClick={() => handleDelete(confirmDelete)} style={{ padding: "9px 20px", borderRadius: "8px", border: "none", background: "#dc2626", fontSize: "13px", fontWeight: 700, cursor: "pointer", color: "white" }}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
