import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import * as XLSX from "xlsx";
import { getMevList, getReleaseSchedules, getReleaseProgress, putReleaseProgress, getRtiSocieta } from "../services/mevService";

// ── Palette ──────────────────────────────────────────────────────────────────
const C = {
  bg:       "#F4F6FA",
  surface:  "#FFFFFF",
  border:   "#E3E8EF",
  accent:   "#1A6EBD",
  accentLt: "#EAF2FB",
  success:  "#166534",
  successLt:"#DCFCE7",
  warn:     "#92400E",
  warnLt:   "#FEF3C7",
  danger:   "#991B1B",
  dangerLt: "#FEE2E2",
  muted:    "#64748B",
  text:     "#0F172A",
  head:     "#1E3A5F",
};

const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const fmtPct = (v) => v != null && v !== "" ? `${v}%` : "—";
const fmtDate = (v) => v || "—";

// ── Stato colori ─────────────────────────────────────────────────────────────
const statoStyle = (s) => {
  const k = (s || "").trim().toLowerCase();
  if (k === "approvato")   return { background: C.successLt, color: C.success, border: `1px solid #86EFAC` };
  if (k === "in corso")    return { background: C.accentLt,  color: C.accent,  border: `1px solid #93C5FD` };
  if (k === "sospeso")     return { background: C.warnLt,    color: C.warn,    border: `1px solid #FCD34D` };
  if (k === "annullato")   return { background: C.dangerLt,  color: C.danger,  border: `1px solid #FCA5A5` };
  return { background: "#F1F5F9", color: C.muted, border: `1px solid #CBD5E1` };
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const parseSoc = (v) => {
  if (!v) return [];
  if (Array.isArray(v)) return v.filter(Boolean);
  try { const p = JSON.parse(v); if (Array.isArray(p)) return p.filter(Boolean); } catch {}
  return String(v).split(/[,;]/).map(s => s.trim()).filter(Boolean);
};

const resolveMandataria = (capVal, ietVal, rtiRows = []) => {
  const byId = (id) => { const f = rtiRows.find(r => Number(r._id || r.id) === Number(id)); return f?.societa || null; };
  const fromCap = (() => {
    if (!capVal) return [];
    if (String(capVal).trim().toLowerCase() === "x") { const s = byId(1); return s ? [s] : ["Capgemini Italia S.p.A."]; }
    return parseSoc(capVal);
  })();
  const fromIet = (() => {
    if (!ietVal) return [];
    if (String(ietVal).trim().toLowerCase() === "x") { const s = byId(2); return s ? [s] : ["I&T"]; }
    return parseSoc(ietVal);
  })();
  return [...new Set([...fromCap, ...fromIet])];
};

// ── Campi editabili ───────────────────────────────────────────────────────────
const EDITABLE_FIELDS = [
  { key: "requisito",           label: "Requisito",              type: "percent" },
  { key: "analisiProgettazione",label: "Analisi Prog.",          type: "percent" },
  { key: "sviluppo",            label: "Sviluppo",               type: "percent" },
  { key: "dataAggiornamento",   label: "Data Aggiorn.",          type: "date"    },
  { key: "drop1DeployCollaudo", label: "1° Drop Deploy Coll.",   type: "date"    },
  { key: "drop2DeployCollaudo", label: "2° Drop Deploy Coll.",   type: "date"    },
  { key: "drop3DeployCollaudo", label: "3° Drop Deploy Coll.",   type: "date"    },
  { key: "dataT0",              label: "Data T0",                type: "date"    },
  { key: "elapsedSviluppo",     label: "Elapsed Sviluppo",       type: "text"    },
  { key: "deadlineDueDate",     label: "Deadline / Due Date",    type: "date"    },
  { key: "hld",                 label: "HLD",                    type: "date"    },
  { key: "afu",                 label: "AFU",                    type: "date"    },
  { key: "icd",                 label: "ICD",                    type: "date"    },
  { key: "manualeUtente",       label: "Manuale Utente",         type: "date"    },
  { key: "rnManInst",           label: "RN/Man Inst",            type: "date"    },
  { key: "unitTest",            label: "Unit Test",              type: "date"    },
  { key: "note",                label: "Note",                   type: "text"    },
];

// ── Mapping colonne Excel → chiavi modello ────────────────────────────────────
// La chiave è il nome colonna normalizzato (lowercase, spazi collassati)
const EXCEL_COL_MAP = {
  "requisito":                  { key: "requisito",            type: "percent" },
  "analisi progettazione":      { key: "analisiProgettazione", type: "percent" },
  "analisi\nprogettazione":     { key: "analisiProgettazione", type: "percent" },
  "sviluppo":                   { key: "sviluppo",             type: "percent" },
  "data aggiornamento":         { key: "dataAggiornamento",    type: "date"    },
  "1° drop deploy collaudo":    { key: "drop1DeployCollaudo",  type: "date"    },
  "2° drop deploy collaudo":    { key: "drop2DeployCollaudo",  type: "date"    },
  "3° drop deploy collaudo":    { key: "drop3DeployCollaudo",  type: "date"    },
  "data t0":                    { key: "dataT0",               type: "date"    },
  "elapsed sviluppo":           { key: "elapsedSviluppo",      type: "text"    },
  "dead line due date":         { key: "deadlineDueDate",      type: "date"    },
  "deadline due date":          { key: "deadlineDueDate",      type: "date"    },
  "hld":                        { key: "hld",                  type: "date"    },
  "afu":                        { key: "afu",                  type: "date"    },
  "icd":                        { key: "icd",                  type: "date"    },
  "manuale utente":             { key: "manualeUtente",        type: "date"    },
  "rn/man inst":                { key: "rnManInst",            type: "date"    },
  "unit test":                  { key: "unitTest",             type: "date"    },
  "note":                       { key: "note",                 type: "text"    },
};

// Converte serial Excel o stringa data in "YYYY-MM-DD" (o stringa vuota)
const excelDateToISO = (v) => {
  if (v == null || v === "") return "";
  // Già stringa ISO o formato IT gg/mm/aaaa
  if (typeof v === "string") {
    const s = v.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
    const itMatch = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (itMatch) return `${itMatch[3]}-${itMatch[2].padStart(2,"0")}-${itMatch[1].padStart(2,"0")}`;
    return "";
  }
  // Numero seriale Excel
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (!d) return "";
    return `${d.y}-${String(d.m).padStart(2,"0")}-${String(d.d).padStart(2,"0")}`;
  }
  return "";
};

// Normalizza header: lowercase, rimuove BOM/spazi laterali, collassa spazi interni
const normHeader = (h) =>
  String(h || "").replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");

// Legge file Excel e restituisce { matched: [{mevId, goTo, fields}], unmatched: [goTo string] }
const parseExcelToProgress = (file, mevRows) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(e.target.result, { type: "array", cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (raw.length < 2) { resolve({ matched: [], unmatched: [] }); return; }

        // Trova riga header (prima riga con "GOTO" o "GoTo" o "goto")
        let headerRowIdx = 0;
        for (let i = 0; i < Math.min(5, raw.length); i++) {
          if (raw[i].some(c => normHeader(c) === "goto")) { headerRowIdx = i; break; }
        }
        const headers = raw[headerRowIdx].map(normHeader);
        const gotoIdx = headers.indexOf("goto");
        if (gotoIdx === -1) { reject(new Error('Colonna "GOTO" non trovata nel file Excel.')); return; }

        // Costruisce mappa goTo → mevId
        const goToMap = {};
        mevRows.forEach(r => {
          if (r.goTo) goToMap[String(r.goTo).trim().toUpperCase()] = String(r.id);
        });

        const matched = [];
        const unmatchedSet = new Set();

        for (let i = headerRowIdx + 1; i < raw.length; i++) {
          const row = raw[i];
          const goToRaw = String(row[gotoIdx] || "").trim();
          if (!goToRaw) continue;
          const goToKey = goToRaw.toUpperCase();
          const mevId = goToMap[goToKey];
          if (!mevId) { unmatchedSet.add(goToRaw); continue; }

          const fields = {};
          headers.forEach((h, idx) => {
            const mapping = EXCEL_COL_MAP[h];
            if (!mapping) return;
            const raw_val = row[idx];
            if (raw_val == null || raw_val === "") return;
            if (mapping.type === "percent") {
              // Accetta sia 75 sia 0.75 (percentuale come decimale)
              let n = Number(raw_val);
              if (isNaN(n)) return;
              if (n > 0 && n <= 1) n = Math.round(n * 100); // 0.75 → 75
              fields[mapping.key] = Math.min(100, Math.max(0, Math.round(n)));
            } else if (mapping.type === "date") {
              const iso = excelDateToISO(raw_val);
              if (iso) fields[mapping.key] = iso;
            } else {
              fields[mapping.key] = String(raw_val).trim();
            }
          });

          matched.push({ mevId, goTo: goToRaw, fields });
        }

        resolve({ matched, unmatched: [...unmatchedSet] });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error("Errore lettura file."));
    reader.readAsArrayBuffer(file);
  });

// ── Componente cella editabile ────────────────────────────────────────────────
function EditCell({ value, type, onChange, saving }) {
  if (type === "percent") return (
    <input type="number" min={0} max={100} step={1}
      value={value ?? ""}
      onChange={e => onChange(e.target.value === "" ? "" : Number(e.target.value))}
      disabled={saving}
      style={{ width: 64, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 6,
        fontSize: 12, textAlign: "center", background: saving ? "#f8fafc" : "#fff", outline: "none" }} />
  );
  if (type === "date") return (
    <input type="date"
      value={value ?? ""}
      onChange={e => onChange(e.target.value)}
      disabled={saving}
      style={{ width: 130, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 6,
        fontSize: 12, background: saving ? "#f8fafc" : "#fff", outline: "none" }} />
  );
  return (
    <textarea value={value ?? ""} onChange={e => onChange(e.target.value)} disabled={saving} rows={2}
      style={{ width: 180, padding: "4px 6px", border: `1px solid ${C.border}`, borderRadius: 6,
        fontSize: 12, resize: "vertical", background: saving ? "#f8fafc" : "#fff", outline: "none" }} />
  );
}

// ── KPI card ──────────────────────────────────────────────────────────────────
function KpiCard({ label, value, sub, accent }) {
  return (
    <div style={{ background: C.surface, borderRadius: 14, padding: "18px 24px",
      border: `1px solid ${C.border}`, flex: "1 1 180px", minWidth: 0,
      boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: accent || C.accent,
        textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: C.text,
        fontVariantNumeric: "tabular-nums", letterSpacing: "-0.5px" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: C.muted, marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

// ── Barra avanzamento ─────────────────────────────────────────────────────────
function ProgressBar({ value, color = C.accent }) {
  const pct = Math.min(100, Math.max(0, Number(value) || 0));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1, height: 6, background: "#E2E8F0", borderRadius: 99, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 99, transition: "width .3s" }} />
      </div>
      <span style={{ fontSize: 11, color: C.muted, minWidth: 30, textAlign: "right" }}>{pct}%</span>
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────
export default function ReportAvanzamentiPage({ onUnauthorized, ambienteId }) {
  const [mevRows, setMevRows]           = useState([]);
  const [releases, setReleases]         = useState([]);
  const [selectedRelease, setSelectedRelease] = useState("");
  const [progressData, setProgressData] = useState({}); // { mevId: { ...campi } }
  const [dirty, setDirty]               = useState({});  // { mevId: true }
  const [saving, setSaving]             = useState({});   // { mevId: true }
  const [savedOk, setSavedOk]           = useState({});
  const [rtiRows, setRtiRows]           = useState([]);
  const [loading, setLoading]           = useState(true);
  const [loadingProg, setLoadingProg]   = useState(false);
  const [globalSaving, setGlobalSaving] = useState(false);
  const [msg, setMsg]                   = useState(null); // { type: "ok"|"err", text }
  // Import Excel
  const [importPreview, setImportPreview] = useState(null); // { matched, unmatched } | null
  const [importing, setImporting]         = useState(false);
  const fileInputRef = useRef(null);

  // Le release_calendar sono salvate con contract_id = ambienteId (es. "1")
  const releaseContractId = ambienteId ? String(ambienteId) : "poste-tet-2025";
  // Il contractId per release_progress rimane "poste-tet-2025" (chiave archivio)
  const contractId = "poste-tet-2025";

  // Carica MEV + release + RTI al mount
  useEffect(() => {
    Promise.all([
      getMevList().catch(() => []),
      getReleaseSchedules(releaseContractId).catch(() => ({ records: [] })),
      getRtiSocieta().catch(() => []),
    ]).then(([mev, relData, rti]) => {
      setMevRows(mev || []);
      const rel = (relData.records || []).map(r => r.title || "").filter(Boolean).sort();
      setReleases(rel);
      setRtiRows(rti || []);
      // Non preselezionare: l'utente deve scegliere esplicitamente
      setSelectedRelease("");
    }).catch(e => {
      if (e?.status === 401) onUnauthorized?.();
    }).finally(() => setLoading(false));
  }, [ambienteId]); // eslint-disable-line

  // Carica progressData quando cambia la release selezionata
  useEffect(() => {
    if (!selectedRelease) { setProgressData({}); return; }
    setLoadingProg(true);
    getReleaseProgress(contractId, selectedRelease)
      .then(records => {
        const found = records?.[0];
        const payload = found?.payload || found?.Payload || {};
        // payload.rows = { [mevId]: { ...campi } }
        setProgressData(payload.rows || {});
        setDirty({});
      })
      .catch(e => { if (e?.status === 401) onUnauthorized?.(); })
      .finally(() => setLoadingProg(false));
  }, [selectedRelease]); // eslint-disable-line

  // Filtra righe MEV per la release selezionata
  // Esclude righe con stato "Eliminato" o vuoto (stringa vuota / null / undefined)
  const filteredRows = useMemo(() => {
    if (!selectedRelease) return []; // Nessuna release selezionata → nessuna riga
    const STATI_ESCLUSI = new Set(["eliminato"]);
    return mevRows.filter(r => {
      const stato = (r.stato || "").trim().toLowerCase();
      if (!stato || STATI_ESCLUSI.has(stato)) return false;
      return (
        (r.releaseExcel || "").trim() === selectedRelease ||
        (r.pRelease || "").trim() === selectedRelease
      );
    });
  }, [mevRows, selectedRelease]);

  // KPI
  const kpis = useMemo(() => ({
    total: filteredRows.length,
    approvati: filteredRows.filter(r => (r.stato || "").trim().toLowerCase() === "approvato").length,
    importo: filteredRows.reduce((s, r) => s + (Number(r.importoExcel) || 0), 0),
  }), [filteredRows]);

  // Update campo singolo
  const handleFieldChange = useCallback((mevId, field, value) => {
    setProgressData(prev => ({
      ...prev,
      [mevId]: { ...(prev[mevId] || {}), [field]: value }
    }));
    setDirty(prev => ({ ...prev, [mevId]: true }));
  }, []);

  // Salva riga singola
  const saveRow = useCallback(async (mevId) => {
    setSaving(prev => ({ ...prev, [mevId]: true }));
    try {
      // Ricostruisce payload completo con tutte le righe
      const allRows = { ...progressData, [mevId]: progressData[mevId] || {} };
      await putReleaseProgress(contractId, selectedRelease, { rows: allRows });
      setDirty(prev => { const n = { ...prev }; delete n[mevId]; return n; });
      setSavedOk(prev => ({ ...prev, [mevId]: true }));
      setTimeout(() => setSavedOk(prev => { const n = { ...prev }; delete n[mevId]; return n; }), 2000);
    } catch {
      setMsg({ type: "err", text: "Errore salvataggio riga " + mevId });
    } finally {
      setSaving(prev => { const n = { ...prev }; delete n[mevId]; return n; });
    }
  }, [progressData, selectedRelease, contractId]);

  // Salva tutto
  const saveAll = useCallback(async () => {
    if (!selectedRelease) return;
    setGlobalSaving(true);
    try {
      await putReleaseProgress(contractId, selectedRelease, { rows: progressData });
      setDirty({});
      setMsg({ type: "ok", text: "Tutti gli avanzamenti salvati." });
      setTimeout(() => setMsg(null), 3000);
    } catch {
      setMsg({ type: "err", text: "Errore salvataggio globale." });
    } finally {
      setGlobalSaving(false);
    }
  }, [progressData, selectedRelease, contractId]);

  // Import Excel: parsing e anteprima
  const handleImportFile = useCallback(async (e) => {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) fileInputRef.current = e.target;
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    try {
      const result = await parseExcelToProgress(file, mevRows);
      setImportPreview(result);
    } catch (err) {
      setMsg({ type: "err", text: "Errore import: " + (err.message || "file non valido") });
    } finally {
      setImporting(false);
    }
  }, [mevRows]);

  // Applica i dati importati al progressData
  const applyImport = useCallback(() => {
    if (!importPreview) return;
    setProgressData(prev => {
      const next = { ...prev };
      importPreview.matched.forEach(({ mevId, fields }) => {
        next[mevId] = { ...(next[mevId] || {}), ...fields };
      });
      return next;
    });
    setDirty(prev => {
      const next = { ...prev };
      importPreview.matched.forEach(({ mevId }) => { next[mevId] = true; });
      return next;
    });
    setMsg({ type: "ok", text: `Importate ${importPreview.matched.length} righe. Ricorda di salvare.` });
    setTimeout(() => setMsg(null), 4000);
    setImportPreview(null);
  }, [importPreview]);

  const hasDirty = Object.keys(dirty).length > 0;

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300, color: C.muted, fontSize: 15 }}>
      Caricamento dati…
    </div>
  );

  return (
    <div style={{ background: C.bg, minHeight: "100vh", padding: "28px 24px 60px" }}>

      {/* ── Intestazione ── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 800, color: C.head, letterSpacing: "-0.4px" }}>
          Report Avanzamenti Attività
        </h1>
        <p style={{ margin: 0, color: C.muted, fontSize: 13 }}>
          Monitora lo stato di avanzamento delle attività per release. I dati MEV sono in sola lettura; i campi di avanzamento sono modificabili.
        </p>
      </div>

      {/* ── Selezione release + Salva tutto ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 24, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: 12, padding: "10px 16px",
          boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.muted }}>Release</span>
          {releases.length > 0 ? (
            <select
              value={selectedRelease}
              onChange={e => setSelectedRelease(e.target.value)}
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px",
                fontSize: 14, fontWeight: 700, color: C.accent, background: C.accentLt,
                cursor: "pointer", outline: "none", minWidth: 160 }}>
              <option value="">— Tutte le release —</option>
              {releases.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          ) : (
            <input value={selectedRelease} onChange={e => setSelectedRelease(e.target.value)}
              placeholder="Es. R2025-04"
              style={{ border: `1px solid ${C.border}`, borderRadius: 8, padding: "6px 12px",
                fontSize: 14, outline: "none", minWidth: 160 }} />
          )}
          {loadingProg && <span style={{ fontSize: 11, color: C.muted }}>…</span>}
        </div>

        {hasDirty && (
          <button onClick={saveAll} disabled={globalSaving}
            style={{ padding: "10px 22px", background: C.accent, color: "#fff", border: "none",
              borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: "pointer",
              boxShadow: "0 2px 8px rgba(26,110,189,0.25)", opacity: globalSaving ? 0.7 : 1 }}>
            {globalSaving ? "Salvataggio…" : `Salva tutto (${Object.keys(dirty).length} modif.)`}
          </button>
        )}

        {/* ── Importa da Excel ── */}
        {selectedRelease && (
          <>
            <label style={{ display: "inline-flex", alignItems: "center", gap: 8,
              padding: "10px 18px", background: "#F0FDF4", border: `1px solid #86EFAC`,
              borderRadius: 10, fontWeight: 700, fontSize: 13, color: C.success,
              cursor: importing ? "wait" : "pointer", opacity: importing ? 0.7 : 1,
              boxShadow: "0 1px 4px rgba(0,0,0,0.05)", whiteSpace: "nowrap" }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              {importing ? "Lettura…" : "Importa da Excel"}
              <input type="file" accept=".xlsx,.xls,.xlsm" style={{ display: "none" }}
                onChange={handleImportFile} />
            </label>
          </>
        )}

        {msg && (
          <div style={{ padding: "8px 16px", borderRadius: 8, fontSize: 13, fontWeight: 600,
            background: msg.type === "ok" ? C.successLt : C.dangerLt,
            color: msg.type === "ok" ? C.success : C.danger,
            border: `1px solid ${msg.type === "ok" ? "#86EFAC" : "#FCA5A5"}` }}>
            {msg.text}
          </div>
        )}
      </div>

      {/* ── KPI bar — visibile solo con release selezionata ── */}
      {selectedRelease && (
      <div style={{ display: "flex", gap: 16, marginBottom: 28, flexWrap: "wrap" }}>
        <KpiCard label="GoTo in release" value={kpis.total} sub="attività filtrate" accent={C.accent} />
        <KpiCard label="Approvati" value={kpis.approvati}
          sub={`${kpis.total ? Math.round(kpis.approvati / kpis.total * 100) : 0}% del totale`}
          accent={C.success} />
        <KpiCard label="Importo Fornitura" value={euro.format(kpis.importo)}
          sub="righe filtrate" accent="#7C3AED" />
      </div>
      )}

      {/* ── Tabella ── */}
      {!selectedRelease ? (
        <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
          padding: "60px 24px", textAlign: "center", color: C.muted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Seleziona una release</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Scegli una release dal menu a tendina per visualizzare le attività.</div>
        </div>
      ) : filteredRows.length === 0 ? (
        <div style={{ background: C.surface, borderRadius: 14, border: `1px solid ${C.border}`,
          padding: "60px 24px", textAlign: "center", color: C.muted }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Nessuna attività per questa release</div>
          <div style={{ fontSize: 13, marginTop: 6 }}>Le righe con stato "Eliminato" o vuoto sono escluse. Verifica i dati MEV.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: 14,
          boxShadow: "0 2px 12px rgba(0,0,0,0.07)", border: `1px solid ${C.border}` }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, background: C.surface }}>
            <thead>
              <tr style={{ background: C.head, color: "#fff", position: "sticky", top: 0, zIndex: 5 }}>
                {/* Colonne MEV read-only */}
                {[
                  ["GoTo",               "80px"],
                  ["Titolo / Descr.",     "220px"],
                  ["Sistemi",            "110px"],
                  ["PM Poste",           "110px"],
                  ["PM CAP",             "110px"],
                  ["Stato",               "90px"],
                  ["Importo",             "110px"],
                  ["Mandataria/Mandante","160px"],
                ].map(([lbl, w]) => (
                  <th key={lbl} style={{ padding: "12px 14px", textAlign: "left", whiteSpace: "nowrap",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.4px", minWidth: w, borderRight: `1px solid rgba(255,255,255,0.1)` }}>
                    {lbl}
                  </th>
                ))}
                {/* Separatore */}
                <th style={{ padding: "12px 6px", background: "#152C4A", minWidth: 4, borderRight: "2px solid #4A90C4" }}></th>
                {/* Colonne editabili */}
                {EDITABLE_FIELDS.map(f => (
                  <th key={f.key} style={{ padding: "12px 10px", textAlign: "left", whiteSpace: "nowrap",
                    fontSize: 11, fontWeight: 700, letterSpacing: "0.4px", minWidth: f.type === "text" ? "200px" : f.type === "date" ? "140px" : "90px",
                    background: "#1E4976", borderRight: `1px solid rgba(255,255,255,0.1)` }}>
                    {f.label}
                    {f.type === "percent" && <span style={{ fontWeight: 400, opacity: 0.7 }}> %</span>}
                  </th>
                ))}
                <th style={{ padding: "12px 10px", background: "#1E4976", minWidth: 80 }}>Salva</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r, idx) => {
                const mevId = String(r.id);
                const prog = progressData[mevId] || {};
                const isDirty = !!dirty[mevId];
                const isSaving = !!saving[mevId];
                const isOk = !!savedOk[mevId];
                const mandataria = resolveMandataria(r.capgemini, r.iet, rtiRows).join(", ") || "—";
                const bg = isDirty ? "#FFFBEB" : idx % 2 === 0 ? C.surface : "#F8FAFC";
                const reqPct = Number(prog.requisito) || 0;
                const analPct = Number(prog.analisiProgettazione) || 0;
                const svlPct = Number(prog.sviluppo) || 0;

                return (
                  <tr key={mevId} style={{ background: bg, transition: "background .15s",
                    borderBottom: `1px solid ${C.border}` }}>
                    {/* GoTo */}
                    <td style={{ padding: "12px 14px", fontWeight: 700, color: C.accent, whiteSpace: "nowrap" }}>
                      {r.goTo || "—"}
                    </td>
                    {/* Titolo */}
                    <td style={{ padding: "12px 14px", maxWidth: 220 }}>
                      <div style={{ fontWeight: 600, color: C.text, lineHeight: 1.4,
                        overflow: "hidden", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                        {r.descrizione || r.goTo || "—"}
                      </div>
                    </td>
                    {/* Sistemi */}
                    <td style={{ padding: "12px 14px", color: C.muted, whiteSpace: "nowrap" }}>
                      {r.applicativo || "—"}
                    </td>
                    {/* PM Poste */}
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>{r.pmPoste || "—"}</td>
                    {/* PM CAP */}
                    <td style={{ padding: "12px 14px", whiteSpace: "nowrap" }}>{r.pmCap || "—"}</td>
                    {/* Stato */}
                    <td style={{ padding: "12px 14px" }}>
                      {r.stato ? (
                        <span style={{ ...statoStyle(r.stato), borderRadius: 20,
                          padding: "3px 10px", fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                          {r.stato}
                        </span>
                      ) : <span style={{ color: C.muted }}>—</span>}
                    </td>
                    {/* Importo */}
                    <td style={{ padding: "12px 14px", fontWeight: 600, whiteSpace: "nowrap",
                      color: r.importoExcel ? C.text : C.muted }}>
                      {r.importoExcel ? euro.format(r.importoExcel) : "—"}
                    </td>
                    {/* Mandataria */}
                    <td style={{ padding: "12px 14px", maxWidth: 160, color: C.muted, fontSize: 11 }}>
                      {mandataria}
                    </td>
                    {/* Separatore */}
                    <td style={{ padding: 0, borderRight: "2px solid #4A90C4", background: "#EBF4FF" }}></td>

                    {/* Campi editabili */}
                    {EDITABLE_FIELDS.map(f => (
                      <td key={f.key} style={{ padding: "8px 10px", verticalAlign: "middle" }}>
                        {f.type === "percent" ? (
                          <div>
                            <EditCell value={prog[f.key]} type={f.type}
                              onChange={v => handleFieldChange(mevId, f.key, v)} saving={isSaving} />
                            <ProgressBar value={prog[f.key]}
                              color={f.key === "requisito" ? "#7C3AED" : f.key === "analisiProgettazione" ? C.accent : C.success} />
                          </div>
                        ) : (
                          <EditCell value={prog[f.key]} type={f.type}
                            onChange={v => handleFieldChange(mevId, f.key, v)} saving={isSaving} />
                        )}
                      </td>
                    ))}

                    {/* Bottone salva riga */}
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {isOk ? (
                        <span style={{ fontSize: 18, color: C.success }}>✓</span>
                      ) : (
                        <button onClick={() => saveRow(mevId)}
                          disabled={!isDirty || isSaving}
                          style={{ padding: "6px 14px", background: isDirty ? C.accent : "#E2E8F0",
                            color: isDirty ? "#fff" : C.muted, border: "none", borderRadius: 8,
                            fontWeight: 700, fontSize: 12, cursor: isDirty ? "pointer" : "default",
                            opacity: isSaving ? 0.6 : 1, transition: "all .15s", whiteSpace: "nowrap" }}>
                          {isSaving ? "…" : "Salva"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Legenda avanzamento ── */}
      {filteredRows.length > 0 && (
        <div style={{ marginTop: 20, display: "flex", gap: 24, flexWrap: "wrap", fontSize: 11, color: C.muted }}>
          <span><span style={{ color: "#7C3AED", fontWeight: 700 }}>■</span> Requisito</span>
          <span><span style={{ color: C.accent, fontWeight: 700 }}>■</span> Analisi / Progett.</span>
          <span><span style={{ color: C.success, fontWeight: 700 }}>■</span> Sviluppo</span>
          <span style={{ marginLeft: "auto" }}>
            {hasDirty ? `${Object.keys(dirty).length} righe con modifiche non salvate` : "Tutti i dati sono sincronizzati"}
          </span>
        </div>
      )}

      {/* ── Modal preview import ── */}
      {importPreview && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000,
          display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={() => setImportPreview(null)}>
          <div style={{ background: C.surface, borderRadius: 18, boxShadow: "0 8px 40px rgba(0,0,0,0.22)",
            width: "100%", maxWidth: 560, maxHeight: "80vh", overflowY: "auto", padding: "28px 28px 24px" }}
            onClick={e => e.stopPropagation()}>

            <h2 style={{ margin: "0 0 6px", fontSize: 17, fontWeight: 800, color: C.head }}>
              Anteprima Import Excel
            </h2>
            <p style={{ margin: "0 0 20px", fontSize: 13, color: C.muted }}>
              Controlla i dati prima di applicarli. Le modifiche non vengono salvate automaticamente.
            </p>

            {/* Riepilogo */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <div style={{ flex: 1, minWidth: 120, background: C.successLt, border: `1px solid #86EFAC`,
                borderRadius: 10, padding: "12px 16px" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: C.success }}>{importPreview.matched.length}</div>
                <div style={{ fontSize: 11, color: C.success, fontWeight: 600, marginTop: 2 }}>GoTo trovati</div>
              </div>
              {importPreview.unmatched.length > 0 && (
                <div style={{ flex: 1, minWidth: 120, background: C.warnLt, border: `1px solid #FCD34D`,
                  borderRadius: 10, padding: "12px 16px" }}>
                  <div style={{ fontSize: 22, fontWeight: 800, color: C.warn }}>{importPreview.unmatched.length}</div>
                  <div style={{ fontSize: 11, color: C.warn, fontWeight: 600, marginTop: 2 }}>GoTo non trovati</div>
                </div>
              )}
            </div>

            {/* Lista matched (prime 10) */}
            {importPreview.matched.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.muted, marginBottom: 6,
                  textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  Righe da importare {importPreview.matched.length > 10 ? `(prime 10 di ${importPreview.matched.length})` : ""}
                </div>
                <div style={{ border: `1px solid ${C.border}`, borderRadius: 8, overflow: "hidden" }}>
                  {importPreview.matched.slice(0, 10).map(({ goTo, fields }) => (
                    <div key={goTo} style={{ display: "flex", alignItems: "flex-start", gap: 10,
                      padding: "8px 12px", borderBottom: `1px solid ${C.border}`,
                      background: C.surface, fontSize: 12 }}>
                      <span style={{ fontWeight: 700, color: C.accent, minWidth: 80 }}>{goTo}</span>
                      <span style={{ color: C.muted, fontSize: 11, lineHeight: 1.5 }}>
                        {Object.entries(fields).map(([k, v]) => {
                          const f = EDITABLE_FIELDS.find(ef => ef.key === k);
                          return `${f ? f.label : k}: ${v}`;
                        }).join(" · ")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Lista unmatched */}
            {importPreview.unmatched.length > 0 && (
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.warn, marginBottom: 6,
                  textTransform: "uppercase", letterSpacing: "0.4px" }}>
                  GoTo non presenti in questa release (verranno ignorati)
                </div>
                <div style={{ background: C.warnLt, border: `1px solid #FCD34D`, borderRadius: 8,
                  padding: "10px 14px", fontSize: 12, color: C.warn, lineHeight: 1.8 }}>
                  {importPreview.unmatched.slice(0, 20).join(", ")}
                  {importPreview.unmatched.length > 20 && ` … e altri ${importPreview.unmatched.length - 20}`}
                </div>
              </div>
            )}

            {/* Azioni */}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button onClick={() => setImportPreview(null)}
                style={{ padding: "10px 20px", background: "#F1F5F9", color: C.muted,
                  border: "none", borderRadius: 8, fontWeight: 600, fontSize: 13, cursor: "pointer" }}>
                Annulla
              </button>
              <button onClick={applyImport} disabled={importPreview.matched.length === 0}
                style={{ padding: "10px 24px", background: importPreview.matched.length > 0 ? C.success : "#E2E8F0",
                  color: importPreview.matched.length > 0 ? "#fff" : C.muted,
                  border: "none", borderRadius: 8, fontWeight: 700, fontSize: 13,
                  cursor: importPreview.matched.length > 0 ? "pointer" : "default" }}>
                Applica {importPreview.matched.length} righe
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
