import React, { useState, useRef } from "react";
import { getGare, putGara, deleteGara, analizzaCapitolatoGara, analizzaProposteGara } from "../services/mevService";

const AMBER        = "#f59e0b";
const AMBER_DARK   = "#b45309";
const AMBER_BG     = "#fffbeb";
const AMBER_BORDER = "#fcd34d";
const AMBER_LIGHT  = "#fef3c7";

const DEFAULT_CHECKLIST = [
  { id: 1,  testo: "Leggere integralmente il bando e il capitolato",     priorita: "Alta",  done: false },
  { id: 2,  testo: "Verificare i requisiti di ammissibilita'",            priorita: "Alta",  done: false },
  { id: 3,  testo: "Costituire il team di risposta alla gara",            priorita: "Alta",  done: false },
  { id: 4,  testo: "Raccogliere documentazione societaria e antimafia",   priorita: "Alta",  done: false },
  { id: 5,  testo: "Redigere la relazione tecnica",                       priorita: "Alta",  done: false },
  { id: 6,  testo: "Elaborare l'offerta economica",                       priorita: "Alta",  done: false },
  { id: 7,  testo: "Compilare il DGUE e i moduli allegati",               priorita: "Alta",  done: false },
  { id: 8,  testo: "Richiedere la polizza fideiussoria",                  priorita: "Media", done: false },
  { id: 9,  testo: "Caricare i CV del personale proposto",                priorita: "Media", done: false },
  { id: 10, testo: "Revisionare l'offerta con il legale",                 priorita: "Media", done: false },
  { id: 11, testo: "Preparare la presentazione del progetto",             priorita: "Bassa", done: false },
  { id: 12, testo: "Effettuare il sopralluogo (se previsto)",             priorita: "Bassa", done: false },
];

function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2,6); }

function giorni(scadenza) {
  if (!scadenza) return null;
  return Math.ceil((new Date(scadenza) - new Date()) / 86400000);
}

function fmtData(iso) {
  if (!iso) return "-";
  return new Date(iso).toLocaleDateString("it-IT", { day: "2-digit", month: "short", year: "numeric" });
}

// ── Badge ─────────────────────────────────────────────────────────────────────
function PrioritaBadge({ p }) {
  const map = {
    Alta:  { bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" },
    Media: { bg: AMBER_BG,  color: AMBER_DARK, border: AMBER_BORDER },
    Bassa: { bg: "#f0fdf4", color: "#16a34a", border: "#86efac" },
  };
  const c = map[p] || map.Media;
  return <span style={{ background: c.bg, color: c.color, border: "1px solid " + c.border, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{p}</span>;
}

function StatoBadge({ s }) {
  const map = {
    "Bozza":         { bg: "#f9fafb", color: "#6b7280",  border: "#d1d5db" },
    "In lavorazione":{ bg: "#eff6ff", color: "#1d4ed8",  border: "#93c5fd" },
    "Inviata":       { bg: "#f0fdf4", color: "#16a34a",  border: "#86efac" },
    "Completato":    { bg: "#f0fdf4", color: "#16a34a",  border: "#86efac" },
    "Da produrre":   { bg: "#f9fafb", color: "#6b7280",  border: "#d1d5db" },
    "Pianificato":   { bg: AMBER_BG,  color: AMBER_DARK, border: AMBER_BORDER },
  };
  const c = map[s] || map["Bozza"];
  return <span style={{ background: c.bg, color: c.color, border: "1px solid " + c.border, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700 }}>{s}</span>;
}

// ── Checklist sidebar ─────────────────────────────────────────────────────────
function ChecklistSidebar({ checklist, onToggle, lottoNome }) {
  const doneCount = checklist.filter(c => c.done).length;
  const pct = checklist.length ? Math.round(doneCount / checklist.length * 100) : 0;
  return (
    <div style={{ width: 300, flexShrink: 0, position: "sticky", top: 20 }}>
      <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 12px rgba(0,0,0,0.08)", border: "1px solid #f0f0f0", overflow: "hidden" }}>
        <div style={{ padding: "16px 20px", background: "linear-gradient(135deg, #78350f, " + AMBER_DARK + ")", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Attivita' da fare{lottoNome ? ` — ${lottoNome}` : ""}</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{doneCount} / {checklist.length} completate</div>
          </div>
          <div style={{ fontSize: 22 }}>✅</div>
        </div>
        <div style={{ padding: "12px 20px 4px" }}>
          <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ height: "100%", width: pct + "%", background: "linear-gradient(90deg," + AMBER + "," + AMBER_DARK + ")", borderRadius: 3, transition: "width 0.4s" }} />
          </div>
          <div style={{ fontSize: 11, color: "#aaa", textAlign: "right", marginTop: 3 }}>{pct}%</div>
        </div>
        <div style={{ padding: "4px 20px 20px", maxHeight: 500, overflowY: "auto" }}>
          {["Alta","Media","Bassa"].map(prio => {
            const items = checklist.filter(c => c.priorita === prio);
            if (!items.length) return null;
            return (
              <div key={prio} style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "#bbb", marginBottom: 6, marginTop: 8, display: "flex", alignItems: "center", gap: 5 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: prio === "Alta" ? "#dc2626" : prio === "Media" ? AMBER : "#16a34a", flexShrink: 0 }} />
                  Priorita' {prio}
                </div>
                {items.map(item => (
                  <div key={item.id} onClick={() => onToggle(item.id)} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "7px 9px", borderRadius: 8, cursor: "pointer", marginBottom: 4, background: item.done ? "#f0fdf4" : "#fafafa", border: "1px solid " + (item.done ? "#86efac" : "#f0f0f0"), transition: "all 0.15s" }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, flexShrink: 0, marginTop: 1, border: "2px solid " + (item.done ? "#16a34a" : "#d1d5db"), background: item.done ? "#16a34a" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.15s" }}>
                      {item.done && <span style={{ color: "#fff", fontSize: 10, lineHeight: 1 }}>✓</span>}
                    </div>
                    <span style={{ fontSize: 12, color: item.done ? "#6b7280" : "#374151", lineHeight: 1.4, flex: 1, textDecoration: item.done ? "line-through" : "none" }}>{item.testo}</span>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Vista 1: Lista Gare ───────────────────────────────────────────────────────
function ListaGare({ gare, onApri, onNuova, onDelete }) {
  const statoColor = {
    "Bozza":          { bg: "#f9fafb", color: "#6b7280", dot: "#9ca3af" },
    "In lavorazione": { bg: "#eff6ff", color: "#1d4ed8", dot: "#3b82f6" },
    "Inviata":        { bg: "#f0fdf4", color: "#16a34a", dot: "#22c55e" },
  };

  return (
    <div style={{ background: "#f4f6f9", minHeight: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #78350f 0%, #92400e 40%, #b45309 100%)", padding: "28px 36px 24px", borderBottom: "3px solid " + AMBER }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 48, height: 48, borderRadius: 14, background: "rgba(255,255,255,0.15)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 }}>🏆</div>
            <div>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>Risposte di Gara</h1>
              <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.72)" }}>Gestisci le tue gare, carica i documenti e ottieni supporto AI</p>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ background: AMBER, color: "#78350f", borderRadius: 20, padding: "5px 14px", fontSize: 12, fontWeight: 800, letterSpacing: "0.05em", boxShadow: "0 2px 8px rgba(245,158,11,0.4)" }}>AI-Powered</span>
            <button onClick={onNuova} style={{ background: "#fff", color: AMBER_DARK, border: "2px solid " + AMBER, borderRadius: 10, padding: "10px 22px", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8, boxShadow: "0 2px 10px rgba(0,0,0,0.12)", transition: "all 0.2s" }}>
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Nuova Gara
            </button>
          </div>
        </div>
      </div>

      {/* Contatore */}
      <div style={{ padding: "24px 36px 0" }}>
        <div style={{ fontSize: 13, color: "#888", fontWeight: 500 }}>
          {gare.length === 0 ? "Nessuna gara ancora" : gare.length + " gara" + (gare.length > 1 ? "e" : "") + " in archivio"}
        </div>
      </div>

      {/* Empty state */}
      {gare.length === 0 && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "80px 24px", textAlign: "center" }}>
          <div style={{ fontSize: 72, marginBottom: 24, opacity: 0.35 }}>📋</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#374151", marginBottom: 10 }}>Nessuna gara ancora</div>
          <div style={{ fontSize: 15, color: "#9ca3af", marginBottom: 32, maxWidth: 400, lineHeight: 1.6 }}>
            Crea la tua prima gara per iniziare a caricare documenti e ottenere analisi AI sul bando.
          </div>
          <button onClick={onNuova} style={{ background: "linear-gradient(135deg, " + AMBER + ", " + AMBER_DARK + ")", color: "#fff", border: "none", borderRadius: 12, padding: "14px 32px", fontSize: 16, fontWeight: 800, cursor: "pointer", boxShadow: "0 4px 16px rgba(245,158,11,0.4)", display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 20 }}>+</span> Crea la prima gara
          </button>
        </div>
      )}

      {/* Griglia card */}
      {gare.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 340px), 1fr))", gap: 18, padding: "20px 36px 40px" }}>
          {gare.map(g => {
            const gg = giorni(g.scadenza);
            const sc = statoColor[g.stato] || statoColor["Bozza"];
            const doneCount = (g.checklist || []).filter(c => c.done).length;
            const totCheck = (g.checklist || []).length;
            const pct = totCheck ? Math.round(doneCount / totCheck * 100) : 0;
            return (
              <div key={g.id} onClick={() => onApri(g.id)} style={{ background: "#fff", borderRadius: 16, border: "1px solid #e5e7eb", boxShadow: "0 2px 10px rgba(0,0,0,0.06)", padding: "20px 22px", cursor: "pointer", transition: "all 0.2s", position: "relative", overflow: "hidden" }}
                onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-3px)"; e.currentTarget.style.boxShadow = "0 8px 24px rgba(0,0,0,0.12)"; e.currentTarget.style.borderColor = AMBER_BORDER; }}
                onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; e.currentTarget.style.boxShadow = "0 2px 10px rgba(0,0,0,0.06)"; e.currentTarget.style.borderColor = "#e5e7eb"; }}>
                {/* Pulsante elimina */}
                <button onClick={e => { e.stopPropagation(); onDelete(g); }} title="Elimina gara" style={{ position: "absolute", top: 10, right: 10, background: "none", border: "none", cursor: "pointer", color: "#d1d5db", fontSize: 16, lineHeight: 1, padding: "2px 5px", borderRadius: 4, zIndex: 1 }}
                  onMouseEnter={e => e.currentTarget.style.color = "#dc2626"}
                  onMouseLeave={e => e.currentTarget.style.color = "#d1d5db"}>×</button>
                {/* Accent top */}
                <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: "linear-gradient(90deg," + AMBER + "," + AMBER_DARK + ")" }} />
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#111827", lineHeight: 1.3, marginBottom: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.nome}</div>
                    {g.ente && <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 500 }}>{g.ente}</div>}
                  </div>
                  <span style={{ background: sc.bg, color: sc.color, border: "1px solid " + sc.dot + "55", borderRadius: 20, padding: "3px 10px", fontSize: 11, fontWeight: 700, flexShrink: 0, display: "flex", alignItems: "center", gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: sc.dot, flexShrink: 0 }} />
                    {g.stato}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
                  {g.scadenza && (
                    <div style={{ fontSize: 12, color: gg !== null && gg <= 7 ? "#dc2626" : "#6b7280" }}>
                      <span style={{ fontWeight: 600 }}>Scadenza:</span> {fmtData(g.scadenza)}
                      {gg !== null && <span style={{ marginLeft: 5, fontWeight: 700, color: gg <= 0 ? "#dc2626" : gg <= 7 ? "#d97706" : "#16a34a" }}>({gg <= 0 ? "scaduta" : gg + " gg"})</span>}
                    </div>
                  )}
                  {g.cig && <div style={{ fontSize: 12, color: "#9ca3af" }}>CIG: <span style={{ color: "#374151", fontWeight: 600 }}>{g.cig}</span></div>}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, color: "#9ca3af" }}>Attivita'</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: AMBER_DARK }}>{pct}%</span>
                    </div>
                    <div style={{ height: 5, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: pct + "%", background: "linear-gradient(90deg," + AMBER + "," + AMBER_DARK + ")", borderRadius: 3, transition: "width 0.4s" }} />
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, fontSize: 12, color: "#9ca3af" }}>{(g.fileNames || []).length} doc</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Modale Nuova Gara ─────────────────────────────────────────────────────────
function ModaleNuovaGara({ onCrea, onAnnulla }) {
  const [form, setForm] = React.useState({ nome: "", ente: "", scadenza: "", cig: "", importoBase: "", note: "" });
  const [error, setError] = React.useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.nome.trim()) { setError("Il nome della gara e' obbligatorio."); return; }
    onCrea(form);
  };

  const inputStyle = { width: "100%", padding: "9px 12px", border: "1px solid #e5e7eb", borderRadius: 8, fontSize: 13, fontFamily: "inherit", outline: "none", boxSizing: "border-box", marginTop: 4 };
  const labelStyle = { display: "block", fontSize: 12, fontWeight: 600, color: "#374151", marginBottom: 2 };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000, padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 20, padding: "32px 36px", maxWidth: 520, width: "100%", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", maxHeight: "90vh", overflowY: "auto" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#111827" }}>Nuova Gara</div>
            <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>Inserisci i dati principali della gara</div>
          </div>
          <button onClick={onAnnulla} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#9ca3af", lineHeight: 1 }}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Nome gara <span style={{ color: "#dc2626" }}>*</span></label>
            <input style={inputStyle} placeholder="es. Gara MEV Digitale 2025" value={form.nome} onChange={e => set("nome", e.target.value)} />
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Ente committente</label>
            <input style={inputStyle} placeholder="es. Poste Italiane S.p.A." value={form.ente} onChange={e => set("ente", e.target.value)} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
            <div>
              <label style={labelStyle}>Data scadenza</label>
              <input type="date" style={inputStyle} value={form.scadenza} onChange={e => set("scadenza", e.target.value)} />
            </div>
            <div>
              <label style={labelStyle}>CIG (opzionale)</label>
              <input style={inputStyle} placeholder="es. 9876543210" value={form.cig} onChange={e => set("cig", e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle}>Importo a base d'asta (€)</label>
            <input type="number" style={inputStyle} placeholder="es. 500000" value={form.importoBase} onChange={e => set("importoBase", e.target.value)} />
          </div>
          <div style={{ marginBottom: 20 }}>
            <label style={labelStyle}>Note</label>
            <textarea style={{ ...inputStyle, height: 72, resize: "vertical" }} placeholder="Annotazioni, link al bando, riferimenti interni..." value={form.note} onChange={e => set("note", e.target.value)} />
          </div>

          {error && <div style={{ background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "8px 12px", fontSize: 12, color: "#dc2626", marginBottom: 16 }}>{error}</div>}

          <div style={{ display: "flex", gap: 12, justifyContent: "flex-end" }}>
            <button type="button" onClick={onAnnulla} style={{ padding: "10px 22px", borderRadius: 9, border: "1px solid #e5e7eb", background: "#fff", color: "#6b7280", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Annulla</button>
            <button type="submit" style={{ padding: "10px 28px", borderRadius: 9, border: "none", background: "linear-gradient(135deg," + AMBER + "," + AMBER_DARK + ")", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer", boxShadow: "0 3px 10px rgba(245,158,11,0.35)" }}>Crea Gara</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Vista 3: Dettaglio Gara ───────────────────────────────────────────────────
function DettaglioGara({ gara, onBack, onUpdate, onDelete }) {
  const [isDragOver, setIsDragOver]           = React.useState(false);
  const [analyzing,  setAnalyzing]            = React.useState(false);
  const [activeTab,  setActiveTab]            = React.useState("documenti");
  const [analyzingCap, setAnalyzingCap]       = React.useState(false);
  const [capError,     setCapError]           = React.useState("");
  const [dettagliOpen, setDettagliOpen]       = React.useState({});
  // lottoAttivo: null = tutti (solo se >1 lotti), 0 = primo lotto, ecc.
  // Inizializza a 0 se c'è già un capitolato con un solo lotto
  const [lottoAttivo,  setLottoAttivo]        = React.useState(() => {
    const lottiSalvati = gara?.capitolato?.lotti || [];
    return lottiSalvati.length === 1 ? 0 : null;
  });
  const [towFiles,     setTowFiles]           = React.useState({});     // { 1: File, 2: File, ... }
  const [catalogFiles, setCatalogFiles]       = React.useState({});     // { 1: File, 2: File, ... }
  const [capFile,      setCapFile]            = React.useState(null);   // File capitolato tenuto in memoria
  const [analyzingProposte, setAnalyzingProposte] = React.useState({}); // { lottoIdx: bool }
  const towFileRefs    = React.useRef({});
  const catalogFileRefs = React.useRef({});
  const docFileRefs = React.useRef({});
  const fileInputRef    = useRef(null);
  const capFileInputRef = useRef(null);

  const files      = gara.fileNames || [];
  const checklist  = gara.checklist || DEFAULT_CHECKLIST.map(c => ({ ...c }));
  const cap        = gara.capitolato || null;

  // Lotti estratti dall'AI — array di { nome, descrizione, sezioni, requisitiTecnici, tow,
  // documentiRichiesti, criteriValutazione, proposte:{tecnica,economica,piano} }
  const lotti = cap?.lotti || [];
  const lottoCorr = lottoAttivo != null ? lotti[lottoAttivo] : null;

  // aiResult: dal lotto attivo se disponibile, altrimenti dal livello radice
  const aiResult = (() => {
    const src = lottoCorr || cap;
    if (src?.proposte) {
      return {
        documenti: src.documentiRichiesti || [],
        tecnica:   src.proposte.tecnica   || [],
        economica: src.proposte.economica || [],
        piano:     src.proposte.piano     || [],
      };
    }
    if (gara.aiResult) {
      const r = gara.aiResult;
      const norm = arr => arr.map((x, j) => ({ ...x, _id: j, dettagli: x.dettagli || "", allegatiRiferimento: x.allegatiRiferimento || [], _docAttachment: x._docAttachment || null }));
      return {
        documenti: norm(r.documenti || []),
        tecnica:   norm(r.tecnica   || []),
        economica: norm(r.economica || []),
        piano:     r.piano || [],
      };
    }
    return null;
  })();

  const analyzed = aiResult !== null;

  const handleDrop = (e) => {
    e.preventDefault(); setIsDragOver(false);
    const newFiles = Array.from(e.dataTransfer.files)
      .filter(f => f.name.endsWith(".pdf") || f.name.endsWith(".docx") || f.name.endsWith(".zip"))
      .map(f => ({ name: f.name, size: f.size }));
    if (newFiles.length) onUpdate({ ...gara, fileNames: [...files, ...newFiles], stato: gara.stato === "Bozza" ? "In lavorazione" : gara.stato });
  };

  const handleFileChange = (e) => {
    const newFiles = Array.from(e.target.files)
      .filter(f => f.name.endsWith(".pdf") || f.name.endsWith(".docx") || f.name.endsWith(".zip"))
      .map(f => ({ name: f.name, size: f.size }));
    if (newFiles.length) onUpdate({ ...gara, fileNames: [...files, ...newFiles], stato: gara.stato === "Bozza" ? "In lavorazione" : gara.stato });
    e.target.value = "";
  };

  const removeFile = (idx) => onUpdate({ ...gara, fileNames: files.filter((_, i) => i !== idx) });

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      onUpdate({
        ...gara,
        analyzed: true,
        aiResult: {
          documenti: [
            { id: 1, nome: "Relazione Tecnica",          tipo: "Documento principale", priorita: "Alta",  stato: "Da produrre" },
            { id: 2, nome: "Piano di Qualita'",           tipo: "Piano",               priorita: "Alta",  stato: "Da produrre" },
            { id: 3, nome: "CV del Team",                 tipo: "Allegato",            priorita: "Alta",  stato: "Da produrre" },
            { id: 4, nome: "Referenze aziendali",         tipo: "Allegato",            priorita: "Media", stato: "Da produrre" },
            { id: 5, nome: "Piano Gestione Rischi",       tipo: "Piano",               priorita: "Alta",  stato: "Da produrre" },
            { id: 6, nome: "Schema Offerta Economica",    tipo: "Modulo",              priorita: "Alta",  stato: "Da produrre" },
            { id: 7, nome: "Cronoprogramma",              tipo: "Piano",               priorita: "Media", stato: "Da produrre" },
            { id: 8, nome: "DGUE compilato",              tipo: "Modulo europeo",      priorita: "Alta",  stato: "Da produrre" },
          ],
          tecnica: [
            { sezione: "1. Soluzione proposta",      desc: "Architettura della soluzione, allineamento ai requisiti del capitolato e tecnologie chiave." },
            { sezione: "2. Metodologia",             desc: "Approccio agile con sprint bimestrali, governance strutturata e KPI misurabili." },
            { sezione: "3. Team di progetto",        desc: "PM senior, 2 Solution Architect certificati, team dev 6 risorse, specialista sicurezza." },
            { sezione: "4. Piano di testing",        desc: "Test unitari 85% copertura, test integrazione, UAT con committente, collaudo finale." },
            { sezione: "5. Post-avviamento",         desc: "SLA H24 4h severity critica, manutenzione evolutiva 12 mesi, formazione utenti." },
          ],
          economica: [
            { voce: "Analisi e progettazione",       gg: 45,  tariffa: 750, importo: 33750 },
            { voce: "Sviluppo e implementazione",    gg: 120, tariffa: 650, importo: 78000 },
            { voce: "Testing e QA",                  gg: 30,  tariffa: 580, importo: 17400 },
            { voce: "Project Management",            gg: 60,  tariffa: 850, importo: 51000 },
            { voce: "Formazione",                    gg: 15,  tariffa: 700, importo: 10500 },
            { voce: "Infrastruttura cloud (annuale)", gg: null, tariffa: null, importo: 24000 },
            { voce: "Manutenzione evolutiva 12 mesi", gg: 24, tariffa: 620, importo: 14880 },
          ],
          piano: [
            { milestone: "Kick-off e analisi requisiti",   data: "15 Feb 2025", durata: "3 sett.", owner: "PM + BA",             stato: "Pianificato" },
            { milestone: "Progettazione architetturale",   data: "08 Mar 2025", durata: "4 sett.", owner: "Solution Architect",   stato: "Pianificato" },
            { milestone: "Sprint 1 - Core funzionalita'",  data: "05 Apr 2025", durata: "6 sett.", owner: "Dev Team",            stato: "Pianificato" },
            { milestone: "Sprint 2 - Integrazioni",        data: "17 Mag 2025", durata: "6 sett.", owner: "Dev Team",            stato: "Pianificato" },
            { milestone: "Testing e UAT",                  data: "28 Giu 2025", durata: "4 sett.", owner: "QA + Cliente",        stato: "Pianificato" },
            { milestone: "Go-live",                        data: "26 Lug 2025", durata: "2 sett.", owner: "PM + Cliente",        stato: "Pianificato" },
          ],
        },
      });
    }, 2800);
  };

  const handleAnalizzaCapitolato = async (file) => {
    if (!file) return;
    setCapFile(file); // teniamo il file per analisi proposte on-demand
    setAnalyzingCap(true);
    setCapError("");
    try {
      const result = await analizzaCapitolatoGara(file, towFiles, catalogFiles);
      const a = result.analysis || {};
      console.log("[GarePage] analisi capitolato - chiavi:", Object.keys(a));

      const get    = (obj, ...ks) => { for (const k of ks) if (obj[k] != null) return obj[k]; return null; };
      const getArr = (obj, ...ks) => { const v = get(obj, ...ks); return Array.isArray(v) ? v : []; };

      const normDoc = (d, i) => ({
        _id: i,
        nome: get(d,"nome","name") || "",
        tipo: get(d,"tipo","type") || "",
        obbligatorio: get(d,"obbligatorio","required") ?? true,
        dettagli: get(d,"dettagli","details") || "",
        _docAttachment: null,
      });
      const normTec = (s, i) => ({
        _id: i,
        sezione: get(s,"sezione","section","titolo","title") || "",
        desc: get(s,"desc","descrizione","description") || "",
        dettagli: get(s,"dettagli","details") || "",
        _docAttachment: null,
      });
      const normEco = (r, i) => ({
        _id: i,
        voce: get(r,"voce","nome","name","descrizione") || "",
        gg: get(r,"gg","giorni") ?? null,
        tariffa: get(r,"tariffa") ?? null,
        importo: Number(get(r,"importo","totale","amount") ?? 0),
        dettagli: get(r,"dettagli","nota","note") || "",
        _docAttachment: null,
      });
      const normTow = (t, i) => ({
        _id: i,
        id: get(t,"id","Id","ID","codice") || null,
        descrizione: get(t,"descrizione","description","nome") || "",
        quantita:    get(t,"quantita","Quantita","qty") ?? null,
        importo:     get(t,"importo","Importo","price","prezzo") ?? null,
      });
      const normCatalog = (c, i) => ({
        _id: i,
        id: c.id ?? i,
        ambito: c.ambito || "",
        nome: c.nome || "",
        descrizione: c.descrizione || "",
        prezziSemplice:  c.prezziSemplice  ?? null,
        prezziMedio:     c.prezziMedio     ?? null,
        prezziComplesso: c.prezziComplesso ?? null,
        modSemplice:     c.modSemplice     ?? null,
        modMedio:        c.modMedio        ?? null,
        modComplesso:    c.modComplesso    ?? null,
      });
      const normLotto = (l, i) => {
        const proposte = get(l,"proposte","Proposte") || {};
        return {
          _id: i,
          nome: get(l,"nome","name","lotto","titolo") || `Lotto ${i+1}`,
          descrizione: get(l,"descrizione","description","sintesi") || "",
          importoBase: get(l,"importoBase","importo_base","importo","baseAsta") || "",
          sezioni: getArr(l,"sezioni","sections"),
          requisitiTecnici: getArr(l,"requisitiTecnici","requisiti_tecnici","requisiti","requirements"),
          tow: getArr(l,"tow","TOW","tows","transazioni").map(normTow),
          documentiRichiesti: getArr(l,"documentiRichiesti","documenti","documents").map(normDoc),
          criteriValutazione: getArr(l,"criteriValutazione","criteri","criteria"),
          catalogo: getArr(l,"catalogo","catalog","vociCatalogo").map(normCatalog),
          proposte: {
            tecnica:   getArr(proposte,"tecnica","technical").map(normTec),
            economica: getArr(proposte,"economica","economic").map(normEco),
            piano:     getArr(proposte,"piano","plan"),
          },
          checklist: DEFAULT_CHECKLIST.map(c => ({ ...c })),
        };
      };

      // Struttura nuova: { titolo, sintesi, lotti:[] }
      // Struttura vecchia fallback: nessun campo lotti
      const lottiRaw = getArr(a,"lotti","Lotti","lots","lotto");
      const lotti = lottiRaw.length > 0
        ? lottiRaw.map(normLotto)
        : [{
            _id: 0,
            nome: "Gara",
            descrizione: get(a,"sintesi","oggetto") || "",
            sezioni: getArr(a,"sezioni","sections"),
            requisitiTecnici: getArr(a,"requisitiTecnici","requisiti_tecnici","requisiti"),
            tow: getArr(a,"tow","TOW","tows","transazioni").map(normTow),
            documentiRichiesti: getArr(a,"documentiRichiesti","documenti").map(normDoc),
            criteriValutazione: getArr(a,"criteriValutazione","criteri"),
            proposte: {
              tecnica:   getArr(get(a,"proposte")||{},"tecnica","technical").map(normTec),
              economica: getArr(get(a,"proposte")||{},"economica","economic").map(normEco),
              piano:     getArr(get(a,"proposte")||{},"piano","plan"),
            },
          }];

      const capData = {
        titolo:        get(a,"titolo","title") || result.fileName || file.name,
        sintesi:       get(a,"sintesi","summary","sommario") || "",
        oggetto:       get(a,"oggetto","object") || "",
        committente:   get(a,"committente","client","ente") || "",
        importoBase:   get(a,"importoBase","importo_base","importo") || "",
        scadenza:      get(a,"scadenza","deadline") || "",
        allegatiCitati: getArr(a,"allegatiCitati","allegati_citati","allegati"),
        lotti,
        note:          get(a,"note","notes") || "",
        fileName:      result.fileName || file.name,
        analyzedAt:    new Date().toISOString(),
      };

      // Debug: log errori parser dal backend
      const rawLotti = getArr(a,"lotti","Lotti","lots","lotto");
      rawLotti.forEach((l, i) => {
        if (l._catalogError) console.error(`[GarePage] Lotto ${i+1} catalogError:`, l._catalogError);
        if (l._towError)     console.error(`[GarePage] Lotto ${i+1} towError:`, l._towError);
        console.log(`[GarePage] Lotto ${i+1} debug:`, { towCapitolato: l._towCapitolatoCount, towPrices: l._towPricesCount, catalogCount: l._catalogCount });
      });
      console.log("[GarePage] capData:", { nLotti: capData.lotti.length, lotti: capData.lotti.map(l => ({ nome: l.nome, nTow: l.tow.length, nDoc: l.documentiRichiesti.length, nCatalog: (l.catalogo||[]).length, importoBase: l.importoBase })) });
      setLottoAttivo(capData.lotti.length > 1 ? null : 0);
      onUpdate({ ...gara, capitolato: capData });
    } catch (err) {
      console.error("[GarePage] errore analisi capitolato:", err?.message || err);
      setCapError(err?.message || "Errore analisi capitolato");
    } finally {
      setAnalyzingCap(false);
    }
  };

  // Genera proposte (tecnica/economica/piano) per un lotto specifico — on-demand
  const handleGeneraProposte = async (lottoIdx) => {
    const lotto = lotti[lottoIdx];
    if (!lotto) return;
    setAnalyzingProposte(prev => ({ ...prev, [lottoIdx]: true }));
    try {
      // Contesto JSON strutturato — stesso pattern di Gestione Contratti, NO upload PDF
      const context = {
        gara: {
          titolo:      cap?.titolo || "",
          committente: cap?.committente || "",
          importoBase: cap?.importoBase || "",
          scadenza:    cap?.scadenza || "",
        },
        lotto: {
          nome:               lotto.nome,
          descrizione:        lotto.descrizione || "",
          importoBase:        lotto.importoBase || "",
          requisitiTecnici:   lotto.requisitiTecnici || [],
          criteriValutazione: lotto.criteriValutazione || [],
          documentiRichiesti: (lotto.documentiRichiesti || []).map(d => d.nome).filter(Boolean),
        },
      };
      const result = await analizzaProposteGara(context);
      const p = result.proposte || {};
      const get    = (obj, ...ks) => { for (const k of ks) if (obj && obj[k] != null) return obj[k]; return null; };
      const getArr = (obj, ...ks) => { const v = get(obj, ...ks); return Array.isArray(v) ? v : []; };
      const normTec = (s, i) => ({ _id: i, sezione: get(s,"sezione","section","titolo") || "", desc: get(s,"desc","descrizione","description") || "", dettagli: get(s,"dettagli","details") || "", _docAttachment: null });
      const normEco = (r, i) => ({ _id: i, voce: get(r,"voce","nome","name","descrizione") || "", gg: get(r,"gg","giorni") ?? null, tariffa: get(r,"tariffa") ?? null, importo: Number(get(r,"importo","totale","amount") ?? 0), dettagli: get(r,"dettagli","nota","note") || "", _docAttachment: null });
      const proposte = {
        tecnica:   getArr(p,"tecnica","technical").map(normTec),
        economica: getArr(p,"economica","economic").map(normEco),
        piano:     getArr(p,"piano","plan"),
      };
      const lottiUpd = lotti.map((l, i) => i === lottoIdx ? { ...l, proposte } : l);
      onUpdate({ ...gara, capitolato: { ...cap, lotti: lottiUpd } });
    } catch (err) {
      alert("Errore generazione proposte: " + (err?.message || err));
    } finally {
      setAnalyzingProposte(prev => ({ ...prev, [lottoIdx]: false }));
    }
  };

  // Checklist: usa quella del lotto attivo se disponibile, altrimenti quella della gara
  const checklistAttiva = lottoCorr?.checklist || checklist;
  const toggleCheck = (id) => {
    if (lottoCorr && cap) {
      // Aggiorna checklist del lotto attivo
      const lottiUpd = lotti.map((l, i) => i === lottoAttivo
        ? { ...l, checklist: l.checklist.map(c => c.id === id ? { ...c, done: !c.done } : c) }
        : l);
      onUpdate({ ...gara, capitolato: { ...cap, lotti: lottiUpd } });
    } else {
      const updated = checklist.map(c => c.id === id ? { ...c, done: !c.done } : c);
      onUpdate({ ...gara, checklist: updated });
    }
  };

  // Apre/chiude il pannello Dettagli per una voce (key = "doc-0", "tec-1", "eco-2")
  const toggleDettagli = (key) => setDettagliOpen(prev => ({ ...prev, [key]: !prev[key] }));

  // Collega un file (documento prodotto) a una voce di documentiRichiesti/tecnica/economica
  // section: "doc" | "tec" | "eco" — idx: indice nell'array
  const handleAttachDoc = (section, idx, file) => {
    if (!file || !gara.capitolato) return;
    const cap = { ...gara.capitolato };
    const reader = new FileReader();
    reader.onload = (ev) => {
      const attachment = { name: file.name, size: file.size, dataUrl: ev.target.result, attachedAt: new Date().toISOString() };
      if (section === "doc") {
        cap.documentiRichiesti = cap.documentiRichiesti.map((d, i) => i === idx ? { ...d, _docAttachment: attachment } : d);
      } else if (section === "tec") {
        cap.proposte = { ...cap.proposte, tecnica: (cap.proposte?.tecnica || []).map((s, i) => i === idx ? { ...s, _docAttachment: attachment } : s) };
      } else if (section === "eco") {
        cap.proposte = { ...cap.proposte, economica: (cap.proposte?.economica || []).map((r, i) => i === idx ? { ...r, _docAttachment: attachment } : r) };
      }
      onUpdate({ ...gara, capitolato: cap });
    };
    reader.readAsDataURL(file);
  };

  // Rimuove il documento allegato da una voce
  const handleRemoveDoc = (section, idx) => {
    if (!gara.capitolato) return;
    const cap = { ...gara.capitolato };
    if (section === "doc") {
      cap.documentiRichiesti = cap.documentiRichiesti.map((d, i) => i === idx ? { ...d, _docAttachment: null } : d);
    } else if (section === "tec") {
      cap.proposte = { ...cap.proposte, tecnica: (cap.proposte?.tecnica || []).map((s, i) => i === idx ? { ...s, _docAttachment: null } : s) };
    } else if (section === "eco") {
      cap.proposte = { ...cap.proposte, economica: (cap.proposte?.economica || []).map((r, i) => i === idx ? { ...r, _docAttachment: null } : r) };
    }
    onUpdate({ ...gara, capitolato: cap });
  };

  const gg = giorni(gara.scadenza);
  const tabs = [
    { id: "documenti", label: "Documenti da produrre" },
    { id: "tecnica",   label: "Proposta tecnica" },
    { id: "economica", label: "Proposta economica" },
    { id: "piano",     label: "Piano di risposta" },
  ];
  const totEco = aiResult ? aiResult.economica.reduce((s, r) => s + r.importo, 0) : 0;

  return (
    <div style={{ background: "#f4f6f9", minHeight: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* Header */}
      <div style={{ background: "linear-gradient(135deg, #78350f 0%, #92400e 40%, #b45309 100%)", padding: "22px 36px 18px", borderBottom: "3px solid " + AMBER }}>
        {/* Breadcrumb */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
          <button onClick={onBack} style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)", color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600 }}>← Risposte di Gara</button>
          <button onClick={() => onDelete(gara)} style={{ background: "rgba(220,38,38,0.25)", border: "1px solid rgba(220,38,38,0.4)", color: "#fca5a5", borderRadius: 6, padding: "3px 10px", fontSize: 12, cursor: "pointer", fontWeight: 600, marginLeft: "auto" }}>Elimina gara</button>
          <span style={{ color: "rgba(255,255,255,0.5)", fontSize: 12 }}>/</span>
          <span style={{ color: "rgba(255,255,255,0.9)", fontSize: 12, fontWeight: 600 }}>{gara.nome}</span>
        </div>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, color: "#fff", lineHeight: 1.2 }}>{gara.nome}</h1>
            {gara.ente && <div style={{ fontSize: 13, color: "rgba(255,255,255,0.75)", marginTop: 3 }}>{gara.ente}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <StatoBadge s={gara.stato} />
            {gara.scadenza && (
              <span style={{ background: "rgba(255,255,255,0.15)", color: gg !== null && gg <= 7 ? AMBER_LIGHT : "rgba(255,255,255,0.9)", border: "1px solid rgba(255,255,255,0.25)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 700 }}>
                Scadenza: {fmtData(gara.scadenza)} {gg !== null && "(" + (gg <= 0 ? "scaduta" : gg + " gg") + ")"}
              </span>
            )}
            {gara.cig && <span style={{ background: "rgba(255,255,255,0.12)", color: "rgba(255,255,255,0.8)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 20, padding: "4px 12px", fontSize: 11 }}>CIG: {gara.cig}</span>}
          </div>
        </div>
      </div>

      {/* KPI bar */}
      <div style={{ display: "flex", gap: 14, padding: "20px 36px 0", flexWrap: "wrap" }}>
        {[
          { label: "Documenti caricati", value: files.length, color: AMBER_DARK },
          { label: "Analisi AI",         value: analyzed ? "Completata" : "Non eseguita", color: analyzed ? "#16a34a" : "#9ca3af" },
          { label: "Attivita' completate", value: (checklist.filter(c=>c.done).length) + "/" + checklist.length, color: "#1d4ed8" },
          gara.importoBase ? { label: "Base d'asta", value: "\u20ac " + Number(gara.importoBase).toLocaleString("it-IT"), color: "#7c3aed" } : null,
        ].filter(Boolean).map((k, i) => (
          <div key={i} style={{ background: "#fff", borderRadius: 10, padding: "14px 20px", boxShadow: "0 1px 6px rgba(0,0,0,0.07)", border: "1px solid #f0f0f0", minWidth: 140 }}>
            <div style={{ fontSize: 11, color: "#9ca3af", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: k.color }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Body */}
      <div style={{ display: "flex", gap: 20, padding: "20px 36px 40px", alignItems: "flex-start" }}>

        {/* Colonna principale */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 18 }}>

          {/* Upload */}
          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "1px solid #f0f0f0", overflow: "hidden" }}>
            <div style={{ padding: "16px 22px 12px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Documenti di gara</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>Carica il bando, capitolato, allegati — PDF, DOCX, ZIP</div>
              </div>
              {files.length > 0 && <span style={{ fontSize: 12, color: AMBER_DARK, fontWeight: 700, background: AMBER_LIGHT, borderRadius: 20, padding: "3px 10px", border: "1px solid " + AMBER_BORDER }}>{files.length} file</span>}
            </div>
            <div style={{ padding: "18px 22px" }}>
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                style={{ border: "2px dashed " + (isDragOver ? AMBER : "#e5e7eb"), borderRadius: 12, padding: "28px 20px", textAlign: "center", cursor: "pointer", background: isDragOver ? AMBER_LIGHT : "#fafafa", transition: "all 0.2s" }}>
                <div style={{ fontSize: 32, marginBottom: 8, opacity: 0.7 }}>📂</div>
                <div style={{ fontSize: 13, fontWeight: 600, color: isDragOver ? AMBER_DARK : "#6b7280" }}>Trascina i file qui, o clicca per selezionare</div>
                <div style={{ fontSize: 11, color: "#d1d5db", marginTop: 3 }}>PDF, DOCX, ZIP fino a 50 MB</div>
                <input ref={fileInputRef} type="file" multiple accept=".pdf,.docx,.zip" style={{ display: "none" }} onChange={handleFileChange} />
              </div>

              {files.length > 0 && (
                <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 7 }}>
                  {files.map((f, idx) => (
                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 10, background: AMBER_BG, borderRadius: 8, border: "1px solid " + AMBER_BORDER, padding: "7px 12px" }}>
                      <span style={{ fontSize: 16 }}>{(f.name||"").endsWith(".pdf") ? "📄" : (f.name||"").endsWith(".zip") ? "🗜️" : "📝"}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: "#111827", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</div>
                        {f.size && <div style={{ fontSize: 11, color: "#9ca3af" }}>{(f.size / 1024).toFixed(1)} KB</div>}
                      </div>
                      <button onClick={e => { e.stopPropagation(); removeFile(idx); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 18, lineHeight: 1, padding: "2px 4px" }}>×</button>
                    </div>
                  ))}
                  <div style={{ marginTop: 10 }}>
                    <button onClick={handleAnalyze} disabled={analyzing} style={{ background: analyzing ? "#d97706" : AMBER, color: "#78350f", border: "none", borderRadius: 9, padding: "10px 24px", fontSize: 14, fontWeight: 800, cursor: analyzing ? "wait" : "pointer", boxShadow: "0 3px 10px rgba(245,158,11,0.3)", display: "inline-flex", alignItems: "center", gap: 8, opacity: analyzing ? 0.85 : 1, transition: "all 0.2s" }}>
                      {analyzing ? (
                        <><span style={{ display: "inline-block", width: 14, height: 14, border: "2.5px solid rgba(120,53,15,0.3)", borderTopColor: "#78350f", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Analisi in corso...</>
                      ) : (
                        <><span style={{ fontSize: 15 }}>🤖</span>{analyzed ? "Rigenera analisi AI" : "Analizza con AI"}</>
                      )}
                    </button>
                    {analyzed && !analyzing && <span style={{ marginLeft: 12, fontSize: 12, color: "#16a34a", fontWeight: 700 }}>✓ Analisi completata</span>}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── SEZIONE ANALISI CAPITOLATO ── */}
          <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "1px solid #f0f0f0", overflow: "hidden" }}>
            <div style={{ padding: "16px 22px 12px", borderBottom: "1px solid #f5f5f5", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Analisi Capitolato AI</div>
                <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 1 }}>Carica il capitolato tecnico PDF: l'AI estrae sintesi, sezioni, requisiti e documenti richiesti</div>
              </div>
              {gara.capitolato && (
                <span style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>
                  ✓ Analizzato: {gara.capitolato.fileName}
                </span>
              )}
            </div>
            <div style={{ padding: "18px 22px" }}>
              {/* Upload PDF capitolato */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", marginBottom: gara.capitolato ? 16 : 0 }}>
                <button
                  onClick={() => capFileInputRef.current && capFileInputRef.current.click()}
                  disabled={analyzingCap}
                  style={{ background: analyzingCap ? "#d97706" : "#fff", color: AMBER_DARK, border: "2px solid " + AMBER, borderRadius: 9, padding: "9px 20px", fontSize: 13, fontWeight: 700, cursor: analyzingCap ? "wait" : "pointer", display: "flex", alignItems: "center", gap: 8, opacity: analyzingCap ? 0.8 : 1, transition: "all 0.2s" }}>
                  {analyzingCap
                    ? <><span style={{ display: "inline-block", width: 13, height: 13, border: "2px solid rgba(120,53,15,0.3)", borderTopColor: AMBER_DARK, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Analisi in corso...</>
                    : <><span style={{ fontSize: 15 }}>📄</span>{gara.capitolato ? "Rianalizza capitolato" : "Carica e analizza capitolato PDF"}</>
                  }
                </button>
                <input ref={capFileInputRef} type="file" accept=".pdf" style={{ display: "none" }}
                  onChange={e => { const f = e.target.files[0]; if (f) handleAnalizzaCapitolato(f); e.target.value = ""; }} />
              </div>
              {capError && (
                <div style={{ marginTop: 10, background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ fontSize: 12, color: "#dc2626", fontWeight: 700, marginBottom: 4 }}>Errore analisi AI</div>
                  <div style={{ fontSize: 11, color: "#7f1d1d", fontFamily: "monospace", whiteSpace: "pre-wrap", maxHeight: 200, overflowY: "auto", wordBreak: "break-all" }}>{capError}</div>
                </div>
              )}

              {/* ── File TOW e Catalogo per lotto (opzionali) ── */}
              {(() => {
                // Mostra i lotti noti dall'analisi precedente, oppure Lotto 1 e Lotto 2 come default
                const lottiNoti = (gara.capitolato?.lotti || []);
                const numLotti = lottiNoti.length > 0 ? lottiNoti.length : 2;
                const rows = Array.from({ length: numLotti }, (_, i) => ({
                  num: i + 1,
                  nome: lottiNoti[i]?.nome || `Lotto ${i + 1}`,
                }));
                return (
                  <div style={{ marginTop: 14, background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0", padding: "12px 16px" }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                      File Listino TOW e Catalogo — opzionali, migliorano la precisione
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {rows.map(({ num, nome }) => (
                        <div key={num} style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                          <span style={{ background: AMBER_LIGHT, color: AMBER_DARK, border: "1px solid " + AMBER_BORDER, borderRadius: 6, padding: "2px 10px", fontWeight: 700, fontSize: 12, flexShrink: 0, minWidth: 68 }}>{nome}</span>

                          {/* TOW */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => towFileRefs.current[num] && towFileRefs.current[num].click()}
                              style={{ background: towFiles[num] ? "#f0fdf4" : "#fff", color: towFiles[num] ? "#16a34a" : "#6b7280", border: "1px solid " + (towFiles[num] ? "#86efac" : "#e5e7eb"), borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              {towFiles[num] ? `✓ TOW: ${towFiles[num].name.slice(0,28)}` : "📋 Listino TOW (PDF/XLSX)"}
                            </button>
                            <input
                              ref={el => towFileRefs.current[num] = el}
                              type="file" accept=".pdf,.xlsx,.xls" style={{ display: "none" }}
                              onChange={e => { const f = e.target.files[0]; if (f) setTowFiles(prev => ({ ...prev, [num]: f })); e.target.value = ""; }} />
                            {towFiles[num] && (
                              <button type="button" onClick={() => setTowFiles(prev => { const n = {...prev}; delete n[num]; return n; })}
                                style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                            )}
                          </div>

                          {/* Catalogo */}
                          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => catalogFileRefs.current[num] && catalogFileRefs.current[num].click()}
                              style={{ background: catalogFiles[num] ? "#eff6ff" : "#fff", color: catalogFiles[num] ? "#1d4ed8" : "#6b7280", border: "1px solid " + (catalogFiles[num] ? "#93c5fd" : "#e5e7eb"), borderRadius: 7, padding: "5px 12px", fontSize: 11, fontWeight: 600, cursor: "pointer" }}>
                              {catalogFiles[num] ? `✓ Cat: ${catalogFiles[num].name.slice(0,28)}` : "📦 Catalogo (PDF)"}
                            </button>
                            <input
                              ref={el => catalogFileRefs.current[num] = el}
                              type="file" accept=".pdf" style={{ display: "none" }}
                              onChange={e => { const f = e.target.files[0]; if (f) setCatalogFiles(prev => ({ ...prev, [num]: f })); e.target.value = ""; }} />
                            {catalogFiles[num] && (
                              <button type="button" onClick={() => setCatalogFiles(prev => { const n = {...prev}; delete n[num]; return n; })}
                                style={{ background: "none", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 16, lineHeight: 1 }}>×</button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 8 }}>
                      I listini TOW e Catalogo vengono letti con lo stesso parser di "Gestione Contratti" — dati precisi senza AI.
                    </div>
                  </div>
                );
              })()}

              {/* Risultati analisi capitolato */}
              {gara.capitolato && (() => {
                const cap = gara.capitolato;
                const lotti = cap.lotti || [];
                const lotto = lottoAttivo != null ? lotti[lottoAttivo] : null;
                return (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

                    {/* Info generali */}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                      {[
                        { label: "Committente", value: cap.committente },
                        { label: "Oggetto",     value: cap.oggetto },
                        { label: "Importo base", value: cap.importoBase },
                        { label: "Scadenza",    value: cap.scadenza },
                      ].filter(r => r.value).map((r, i) => (
                        <div key={i} style={{ background: AMBER_BG, border: "1px solid " + AMBER_BORDER, borderRadius: 8, padding: "9px 12px" }}>
                          <div style={{ fontSize: 10, fontWeight: 700, color: AMBER_DARK, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 3 }}>{r.label}</div>
                          <div style={{ fontSize: 13, color: "#374151", fontWeight: 500 }}>{r.value}</div>
                        </div>
                      ))}
                    </div>

                    {/* Sintesi gara */}
                    {cap.sintesi && (
                      <div style={{ background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", padding: "12px 16px" }}>
                        <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sintesi della gara</div>
                        <div style={{ fontSize: 13, color: "#475569", lineHeight: 1.7 }}>{cap.sintesi}</div>
                      </div>
                    )}

                    {/* ── SELETTORE LOTTI ── */}
                    {lotti.length > 0 && (
                      <div style={{ background: "#fff", borderRadius: 12, border: "2px solid " + AMBER_BORDER, overflow: "hidden" }}>
                        <div style={{ background: "linear-gradient(135deg,#78350f," + AMBER_DARK + ")", padding: "12px 18px", display: "flex", alignItems: "center", gap: 10 }}>
                          <span style={{ fontSize: 16 }}>🗂️</span>
                          <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Lotti della gara</div>
                          <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>{lotti.length} lott{lotti.length === 1 ? "o" : "i"}</span>
                        </div>
                        <div style={{ padding: "14px 18px" }}>
                          {lotti.length > 1 && (
                            <div style={{ marginBottom: 12, fontSize: 12, color: "#6b7280" }}>
                              Seleziona un lotto per filtrare tutte le sezioni, o visualizza tutti insieme.
                            </div>
                          )}
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {lotti.length > 1 && (
                              <button
                                onClick={() => setLottoAttivo(null)}
                                style={{ padding: "8px 18px", borderRadius: 9, border: "2px solid " + (lottoAttivo === null ? AMBER : "#e5e7eb"), background: lottoAttivo === null ? AMBER_LIGHT : "#fff", color: lottoAttivo === null ? AMBER_DARK : "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s" }}>
                                Tutti i lotti
                              </button>
                            )}
                            {lotti.map((l, i) => (
                              <button
                                key={i}
                                onClick={() => setLottoAttivo(i)}
                                style={{ padding: "8px 18px", borderRadius: 9, border: "2px solid " + (lottoAttivo === i ? AMBER : "#e5e7eb"), background: lottoAttivo === i ? AMBER : "#fff", color: lottoAttivo === i ? "#78350f" : "#374151", fontSize: 13, fontWeight: 700, cursor: "pointer", transition: "all 0.15s", boxShadow: lottoAttivo === i ? "0 2px 8px rgba(245,158,11,0.3)" : "none" }}>
                                {l.nome}
                              </button>
                            ))}
                          </div>
                          {lotto && (lotto.descrizione || lotto.importoBase) && (
                            <div style={{ marginTop: 12, padding: "10px 14px", background: AMBER_BG, borderRadius: 8, border: "1px solid " + AMBER_BORDER, fontSize: 13, color: "#374151", lineHeight: 1.6 }}>
                              {lotto.descrizione && <div>{lotto.descrizione}</div>}
                              {lotto.importoBase && (
                                <div style={{ marginTop: lotto.descrizione ? 6 : 0, fontSize: 12, fontWeight: 700, color: AMBER_DARK }}>
                                  Base d'asta: {lotto.importoBase}
                                </div>
                              )}
                            </div>
                          )}
                          {/* Bottone genera proposte per lotto selezionato */}
                          {lotto && lottoAttivo != null && (
                            <div style={{ marginTop: 10 }}>
                              {(() => {
                                const haProp = (lotto.proposte?.tecnica?.length || 0) + (lotto.proposte?.economica?.length || 0) > 0;
                                const isGen  = analyzingProposte[lottoAttivo];
                                return (
                                  <button
                                    onClick={() => setTimeout(() => handleGeneraProposte(lottoAttivo), 0)}
                                    disabled={isGen || analyzingCap}
                                    style={{ background: haProp ? "#fff" : AMBER, color: haProp ? AMBER_DARK : "#78350f", border: "2px solid " + AMBER, borderRadius: 8, padding: "7px 16px", fontSize: 12, fontWeight: 700, cursor: isGen ? "wait" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, opacity: isGen ? 0.8 : 1 }}>
                                    {isGen
                                      ? <><span style={{ display: "inline-block", width: 12, height: 12, border: "2px solid rgba(120,53,15,0.3)", borderTopColor: AMBER_DARK, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} /> Generazione proposte...</>
                                      : <><span>🤖</span>{haProp ? "Rigenera proposte AI" : "Genera proposte AI per questo lotto"}</>
                                    }
                                  </button>
                                );
                              })()}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── CONTENUTO FILTRATO PER LOTTO ── */}
                    {(() => {
                      const src = lotto || (lotti.length === 1 ? lotti[0] : null);
                      if (!src && lotti.length > 1) return (
                        <div style={{ padding: "18px", background: "#f8fafc", borderRadius: 10, border: "1px solid #e2e8f0", fontSize: 13, color: "#6b7280", textAlign: "center" }}>
                          Seleziona un lotto per visualizzare sezioni, requisiti, TOW, documenti e criteri.
                        </div>
                      );
                      const d = src || {};
                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

                          {/* Sezioni */}
                          {(d.sezioni || []).length > 0 && (() => {
                            // Raggruppa per numero padre (es. "1", "2") — i sotto-numeri sono "1.1", "1.2"
                            const gruppi = {};
                            (d.sezioni || []).forEach(s => {
                              const num = String(s.numero || "");
                              const padre = num.includes(".") ? num.split(".")[0] : num;
                              if (!gruppi[padre]) gruppi[padre] = { padre: null, figli: [] };
                              if (!num.includes(".")) gruppi[padre].padre = s;
                              else gruppi[padre].figli.push(s);
                            });
                            return (
                              <div>
                                <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sezioni ({d.sezioni.length})</div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                  {Object.entries(gruppi).sort(([a],[b]) => parseFloat(a)-parseFloat(b)).map(([numPadre, g]) => {
                                    const hasFigli = g.figli.length > 0;
                                    const isOpen = !!dettagliOpen["sez-" + numPadre];
                                    return (
                                      <div key={numPadre} style={{ borderRadius: 8, border: "1px solid " + (isOpen ? AMBER_BORDER : "#f0f0f0"), overflow: "hidden" }}>
                                        {/* Riga padre */}
                                        <div
                                          onClick={() => hasFigli && toggleDettagli("sez-" + numPadre)}
                                          style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "9px 12px", background: isOpen ? AMBER_BG : "#fafafa", cursor: hasFigli ? "pointer" : "default" }}>
                                          <span style={{ background: AMBER_LIGHT, color: AMBER_DARK, border: "1px solid " + AMBER_BORDER, borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{numPadre}</span>
                                          <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{g.padre?.titolo || `Sezione ${numPadre}`}</div>
                                            {g.padre?.sintesi && <div style={{ fontSize: 12, color: "#6b7280", marginTop: 2 }}>{g.padre.sintesi}</div>}
                                          </div>
                                          {hasFigli && (
                                            <span style={{ fontSize: 11, color: AMBER_DARK, fontWeight: 700, flexShrink: 0, marginTop: 2 }}>
                                              {isOpen ? "▲" : "▼"} {g.figli.length} sottosezioni
                                            </span>
                          )}

                          {/* Catalogo voci */}
                          {(d.catalogo || []).length > 0 && (
                            <div style={{ background: "#fff", borderRadius: 10, border: "2px solid #93c5fd", overflow: "hidden" }}>
                              <div style={{ background: "linear-gradient(135deg, #1e3a8a, #1d4ed8)", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 16 }}>📦</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>Voci di Catalogo ({d.catalogo.length})</div>
                                <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Estratti dal catalogo</span>
                              </div>
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
                                  <thead>
                                    <tr style={{ background: "#eff6ff", borderBottom: "2px solid #93c5fd" }}>
                                      <th rowSpan={2} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", whiteSpace: "nowrap", borderRight: "1px solid #bfdbfe", verticalAlign: "middle" }}>ID</th>
                                      <th rowSpan={2} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", borderRight: "1px solid #bfdbfe", verticalAlign: "middle" }}>Ambito</th>
                                      <th rowSpan={2} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", borderRight: "1px solid #bfdbfe", verticalAlign: "middle" }}>Nome componente</th>
                                      <th colSpan={3} style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", borderRight: "1px solid #bfdbfe", borderBottom: "1px solid #bfdbfe" }}>Realizzazione</th>
                                      <th colSpan={3} style={{ padding: "6px 10px", textAlign: "center", fontWeight: 700, color: "#1d4ed8", textTransform: "uppercase", borderBottom: "1px solid #bfdbfe" }}>Modifica</th>
                                    </tr>
                                    <tr style={{ background: "#eff6ff", borderBottom: "2px solid #93c5fd" }}>
                                      {["Semplice","Medio","Complesso"].map((l,i) => (
                                        <th key={l} style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: "#1d4ed8", whiteSpace: "nowrap", borderRight: i===2 ? "1px solid #bfdbfe" : "none" }}>{l}</th>
                                      ))}
                                      {["Semplice","Medio","Complesso"].map(l => (
                                        <th key={"m"+l} style={{ padding: "5px 8px", textAlign: "right", fontWeight: 600, color: "#1d4ed8", whiteSpace: "nowrap" }}>{l}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.catalogo.map((c, i) => {
                                      const fmt = v => v != null && v > 0 ? Number(v).toLocaleString("it-IT", { minimumFractionDigits: 2 }) : <span style={{ color: "#d1d5db" }}>—</span>;
                                      return (
                                        <tr key={i} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#f8faff" }}>
                                          <td style={{ padding: "7px 10px", whiteSpace: "nowrap", borderRight: "1px solid #f0f0f0" }}>
                                            <span style={{ background: "#eff6ff", color: "#1d4ed8", border: "1px solid #93c5fd", borderRadius: 5, padding: "2px 6px", fontWeight: 700 }}>{c.id}</span>
                                          </td>
                                          <td style={{ padding: "7px 10px", color: "#374151", borderRight: "1px solid #f0f0f0" }}>{c.ambito || "—"}</td>
                                          <td style={{ padding: "7px 10px", color: "#111827", fontWeight: 500, borderRight: "1px solid #f0f0f0" }}>{c.nome || "—"}</td>
                                          <td style={{ padding: "7px 10px", color: "#374151", textAlign: "right" }}>{fmt(c.prezziSemplice)}</td>
                                          <td style={{ padding: "7px 10px", color: "#374151", textAlign: "right" }}>{fmt(c.prezziMedio)}</td>
                                          <td style={{ padding: "7px 10px", color: "#374151", textAlign: "right", borderRight: "1px solid #f0f0f0" }}>{fmt(c.prezziComplesso)}</td>
                                          <td style={{ padding: "7px 10px", color: "#6b7280", textAlign: "right" }}>{fmt(c.modSemplice)}</td>
                                          <td style={{ padding: "7px 10px", color: "#6b7280", textAlign: "right" }}>{fmt(c.modMedio)}</td>
                                          <td style={{ padding: "7px 10px", color: "#6b7280", textAlign: "right" }}>{fmt(c.modComplesso)}</td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                                        </div>
                                        {/* Figli espandibili */}
                                        {hasFigli && isOpen && (
                                          <div style={{ borderTop: "1px solid " + AMBER_BORDER, background: "#fff" }}>
                                            {g.figli.sort((a,b) => parseFloat(a.numero)-parseFloat(b.numero)).map((sf, fi) => (
                                              <div key={fi} style={{ display: "flex", gap: 12, alignItems: "flex-start", padding: "8px 12px 8px 28px", borderBottom: fi < g.figli.length-1 ? "1px solid #f5f5f5" : "none" }}>
                                                <span style={{ background: "#f1f5f9", color: "#475569", border: "1px solid #e2e8f0", borderRadius: 6, padding: "2px 7px", fontSize: 10, fontWeight: 700, flexShrink: 0 }}>{sf.numero}</span>
                                                <div style={{ flex: 1 }}>
                                                  <div style={{ fontSize: 12, fontWeight: 600, color: "#374151" }}>{sf.titolo}</div>
                                                  {sf.sintesi && <div style={{ fontSize: 11, color: "#6b7280", marginTop: 2 }}>{sf.sintesi}</div>}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          })()}

                          {/* 3 colonne: requisiti, documenti, criteri */}
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
                            {(d.requisitiTecnici || []).length > 0 && (
                              <div style={{ background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0", padding: "12px 14px" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Requisiti tecnici ({d.requisitiTecnici.length})</div>
                                {d.requisitiTecnici.map((r, i) => (
                                  <div key={i} style={{ fontSize: 12, color: "#475569", padding: "3px 0", borderBottom: i < d.requisitiTecnici.length-1 ? "1px solid #f0f0f0" : "none" }}>• {r}</div>
                                ))}
                              </div>
                            )}
                            {(d.documentiRichiesti || []).length > 0 && (
                              <div style={{ background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0", padding: "12px 14px" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Documenti richiesti ({d.documentiRichiesti.length})</div>
                                {d.documentiRichiesti.map((doc, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", padding: "3px 0", borderBottom: i < d.documentiRichiesti.length-1 ? "1px solid #f0f0f0" : "none" }}>
                                    <span style={{ fontSize: 9, color: doc.obbligatorio ? "#dc2626" : "#9ca3af" }}>●</span>
                                    <span style={{ flex: 1 }}>{doc.nome}</span>
                                    {doc.tipo && <span style={{ background: "#f1f5f9", color: "#64748b", borderRadius: 4, padding: "1px 6px", fontSize: 10, fontWeight: 600 }}>{doc.tipo}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                            {(d.criteriValutazione || []).length > 0 && (
                              <div style={{ background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0", padding: "12px 14px" }}>
                                <div style={{ fontSize: 11, fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>Criteri valutazione ({d.criteriValutazione.length})</div>
                                {d.criteriValutazione.map((c, i) => (
                                  <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, fontSize: 12, color: "#475569", padding: "3px 0", borderBottom: i < d.criteriValutazione.length-1 ? "1px solid #f0f0f0" : "none" }}>
                                    <span style={{ flex: 1 }}>{c.criterio}</span>
                                    {c.peso && <span style={{ background: AMBER_LIGHT, color: AMBER_DARK, border: "1px solid " + AMBER_BORDER, borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700 }}>{c.peso}</span>}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* TOW */}
                          {(d.tow || []).length > 0 && (
                            <div style={{ background: "#fff", borderRadius: 10, border: "2px solid " + AMBER_BORDER, overflow: "hidden" }}>
                              <div style={{ background: "linear-gradient(135deg, #78350f, " + AMBER_DARK + ")", padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                                <span style={{ fontSize: 16 }}>📋</span>
                                <div style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>TOW — Transazioni di Lavoro ({d.tow.length})</div>
                                <span style={{ marginLeft: "auto", background: "rgba(255,255,255,0.2)", color: "#fff", borderRadius: 20, padding: "2px 10px", fontSize: 11, fontWeight: 700 }}>Estratti dal capitolato</span>
                              </div>
                              <div style={{ overflowX: "auto" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                  <thead>
                                    <tr style={{ background: AMBER_BG, borderBottom: "2px solid " + AMBER_BORDER }}>
                                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: AMBER_DARK, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>ID/Cod.</th>
                                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, color: AMBER_DARK, fontSize: 11, textTransform: "uppercase" }}>Descrizione</th>
                                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: AMBER_DARK, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>Quantità</th>
                                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 700, color: AMBER_DARK, fontSize: 11, textTransform: "uppercase", whiteSpace: "nowrap" }}>Importo</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {d.tow.map((t, i) => (
                                      <tr key={i} style={{ borderBottom: "1px solid #f0f0f0", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                                        <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                                          {t.id ? <span style={{ background: AMBER_LIGHT, color: AMBER_DARK, border: "1px solid " + AMBER_BORDER, borderRadius: 5, padding: "2px 7px", fontWeight: 700, fontSize: 11 }}>{t.id}</span> : <span style={{ color: "#d1d5db" }}>—</span>}
                                        </td>
                                        <td style={{ padding: "8px 12px", color: "#111827", fontWeight: 500, lineHeight: 1.4 }}>{t.descrizione || "—"}</td>
                                        <td style={{ padding: "8px 12px", color: "#374151", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{t.quantita != null ? Number(t.quantita).toLocaleString("it-IT") : <span style={{ color: "#d1d5db" }}>—</span>}</td>
                                        <td style={{ padding: "8px 12px", color: "#111827", textAlign: "right", fontWeight: 600, whiteSpace: "nowrap" }}>{t.importo != null ? "€ " + Number(t.importo).toLocaleString("it-IT", { minimumFractionDigits: 2 }) : <span style={{ color: "#d1d5db" }}>—</span>}</td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}

                        </div>
                      );
                    })()}

                    {cap.note && (
                      <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#92400e" }}>
                        <strong>Note:</strong> {cap.note}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Risultati AI */}
          {analyzed && aiResult && (
            <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.07)", border: "1px solid #f0f0f0", overflow: "hidden" }}>
              <div style={{ padding: "16px 22px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                  <span style={{ fontSize: 18 }}>🤖</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#111827" }}>Risultati analisi AI</div>
                    <div style={{ fontSize: 12, color: "#9ca3af" }}>Estratti dai documenti caricati — revisiona e adatta</div>
                  </div>
                  <span style={{ marginLeft: "auto", background: AMBER_LIGHT, color: AMBER_DARK, border: "1px solid " + AMBER_BORDER, borderRadius: 20, padding: "3px 12px", fontSize: 11, fontWeight: 700 }}>Bozza AI</span>
                </div>
                <div style={{ display: "flex", borderBottom: "2px solid #f0f0f0" }}>
                  {tabs.map(t => (
                    <button key={t.id} onClick={() => setActiveTab(t.id)} style={{ padding: "9px 16px", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500, color: activeTab === t.id ? AMBER_DARK : "#9ca3af", borderBottom: activeTab === t.id ? "2px solid " + AMBER : "2px solid transparent", marginBottom: -2, transition: "all 0.15s", whiteSpace: "nowrap" }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ padding: "18px 22px" }}>

                {/* ── TAB DOCUMENTI DA PRODURRE ── */}
                {activeTab === "documenti" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {aiResult.documenti.map((d, i) => {
                      const key = "doc-" + i;
                      const open = !!dettagliOpen[key];
                      const att = d._docAttachment;
                      return (
                        <div key={i} style={{ borderRadius: 10, background: "#fafafa", border: "1px solid #f0f0f0", overflow: "hidden" }}>
                          {/* Riga principale */}
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                            <span style={{ fontSize: 17 }}>📄</span>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{d.nome || d.name}</div>
                              <div style={{ fontSize: 11, color: "#9ca3af" }}>{d.tipo || d.type}</div>
                            </div>
                            {d.priorita && <PrioritaBadge p={d.priorita} />}
                            {d.obbligatorio != null && (
                              <span style={{ fontSize: 10, fontWeight: 700, color: d.obbligatorio ? "#dc2626" : "#9ca3af", border: "1px solid " + (d.obbligatorio ? "#fca5a5" : "#e5e7eb"), borderRadius: 6, padding: "1px 7px" }}>{d.obbligatorio ? "Obbligatorio" : "Facoltativo"}</span>
                            )}
                            {/* Tasto Dettagli */}
                            {d.dettagli && (
                              <button onClick={() => toggleDettagli(key)} style={{ background: open ? AMBER_LIGHT : "#f1f5f9", color: open ? AMBER_DARK : "#475569", border: "1px solid " + (open ? AMBER_BORDER : "#e2e8f0"), borderRadius: 7, padding: "4px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                {open ? "Chiudi" : "Dettagli"}
                              </button>
                            )}
                            {/* Tasto Documento */}
                            <div style={{ position: "relative" }}>
                              <input ref={el => docFileRefs.current[key] = el} type="file" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) handleAttachDoc("doc", i, f); e.target.value = ""; }} />
                              {att ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.name}>✓ {att.name}</span>
                                  <button onClick={() => handleRemoveDoc("doc", i)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, padding: "3px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✕</button>
                                </div>
                              ) : (
                                <button onClick={() => docFileRefs.current[key]?.click()} style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "4px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                  + Documento
                                </button>
                              )}
                            </div>
                          </div>
                          {/* Pannello Dettagli */}
                          {open && d.dettagli && (
                            <div style={{ borderTop: "1px solid #f0e8d0", background: AMBER_BG, padding: "12px 16px 12px 42px" }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: AMBER_DARK, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Istruzioni operative</div>
                              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>{d.dettagli}</div>
                              {(d.allegatiRiferimento || []).length > 0 && (
                                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: AMBER_DARK, fontWeight: 700 }}>Allegati da consultare:</span>
                                  {d.allegatiRiferimento.map((al, ai) => (
                                    <span key={ai} style={{ background: "#fff", border: "1px solid " + AMBER_BORDER, color: "#92400e", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{al}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── TAB PROPOSTA TECNICA ── */}
                {activeTab === "tecnica" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                    {aiResult.tecnica.map((s, i) => {
                      const key = "tec-" + i;
                      const open = !!dettagliOpen[key];
                      const att = s._docAttachment;
                      return (
                        <div key={i} style={{ borderRadius: 10, border: "1px solid #f0f0f0", overflow: "hidden", background: "#fafafa" }}>
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "12px 14px", borderLeft: "3px solid " + AMBER }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#111827", marginBottom: 3 }}>{s.sezione}</div>
                              <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>{s.desc}</div>
                            </div>
                            <div style={{ display: "flex", gap: 7, flexShrink: 0, flexWrap: "wrap", justifyContent: "flex-end" }}>
                              {s.dettagli && (
                                <button onClick={() => toggleDettagli(key)} style={{ background: open ? AMBER_LIGHT : "#f1f5f9", color: open ? AMBER_DARK : "#475569", border: "1px solid " + (open ? AMBER_BORDER : "#e2e8f0"), borderRadius: 7, padding: "4px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                  {open ? "Chiudi" : "Dettagli"}
                                </button>
                              )}
                              <div>
                                <input ref={el => docFileRefs.current[key] = el} type="file" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) handleAttachDoc("tec", i, f); e.target.value = ""; }} />
                                {att ? (
                                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, maxWidth: 110, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.name}>✓ {att.name}</span>
                                    <button onClick={() => handleRemoveDoc("tec", i)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, padding: "3px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✕</button>
                                  </div>
                                ) : (
                                  <button onClick={() => docFileRefs.current[key]?.click()} style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "4px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                    + Documento
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                          {open && s.dettagli && (
                            <div style={{ borderTop: "1px solid #f0e8d0", background: AMBER_BG, padding: "12px 16px 12px 20px" }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: AMBER_DARK, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Istruzioni operative</div>
                              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>{s.dettagli}</div>
                              {(s.allegatiRiferimento || []).length > 0 && (
                                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: AMBER_DARK, fontWeight: 700 }}>Allegati da consultare:</span>
                                  {s.allegatiRiferimento.map((al, ai) => (
                                    <span key={ai} style={{ background: "#fff", border: "1px solid " + AMBER_BORDER, color: "#92400e", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{al}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* ── TAB PROPOSTA ECONOMICA ── */}
                {activeTab === "economica" && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {aiResult.economica.map((r, i) => {
                      const key = "eco-" + i;
                      const open = !!dettagliOpen[key];
                      const att = r._docAttachment;
                      return (
                        <div key={i} style={{ borderRadius: 10, border: "1px solid #f0f0f0", overflow: "hidden", background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px" }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: "#111827" }}>{r.voce}</div>
                            </div>
                            <span style={{ fontSize: 12, color: "#6b7280", minWidth: 50, textAlign: "right" }}>{r.gg != null ? r.gg + " gg" : "-"}</span>
                            <span style={{ fontSize: 12, color: "#6b7280", minWidth: 80, textAlign: "right" }}>{r.tariffa ? "€ " + r.tariffa.toLocaleString("it-IT") : "-"}</span>
                            <span style={{ fontSize: 13, fontWeight: 700, color: "#111827", minWidth: 90, textAlign: "right" }}>{"€ " + (r.importo || 0).toLocaleString("it-IT")}</span>
                            {r.dettagli && (
                              <button onClick={() => toggleDettagli(key)} style={{ background: open ? AMBER_LIGHT : "#f1f5f9", color: open ? AMBER_DARK : "#475569", border: "1px solid " + (open ? AMBER_BORDER : "#e2e8f0"), borderRadius: 7, padding: "4px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                                {open ? "Chiudi" : "Dettagli"}
                              </button>
                            )}
                            <div>
                              <input ref={el => docFileRefs.current[key] = el} type="file" style={{ display: "none" }} onChange={e => { const f = e.target.files[0]; if (f) handleAttachDoc("eco", i, f); e.target.value = ""; }} />
                              {att ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: "#16a34a", fontWeight: 600, maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={att.name}>✓ {att.name}</span>
                                  <button onClick={() => handleRemoveDoc("eco", i)} style={{ background: "#fee2e2", color: "#dc2626", border: "none", borderRadius: 6, padding: "3px 7px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>✕</button>
                                </div>
                              ) : (
                                <button onClick={() => docFileRefs.current[key]?.click()} style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #86efac", borderRadius: 7, padding: "4px 11px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                                  + Documento
                                </button>
                              )}
                            </div>
                          </div>
                          {open && r.dettagli && (
                            <div style={{ borderTop: "1px solid #f0e8d0", background: AMBER_BG, padding: "12px 16px" }}>
                              <div style={{ fontSize: 12, fontWeight: 700, color: AMBER_DARK, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.05em" }}>Stima e giustificazione</div>
                              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.7 }}>{r.dettagli}</div>
                              {(r.allegatiRiferimento || []).length > 0 && (
                                <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 6 }}>
                                  <span style={{ fontSize: 11, color: AMBER_DARK, fontWeight: 700 }}>Allegati da consultare:</span>
                                  {r.allegatiRiferimento.map((al, ai) => (
                                    <span key={ai} style={{ background: "#fff", border: "1px solid " + AMBER_BORDER, color: "#92400e", borderRadius: 6, padding: "2px 8px", fontSize: 11 }}>{al}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {/* Totale */}
                    <div style={{ background: AMBER_LIGHT, border: "1px solid " + AMBER_BORDER, borderRadius: 10, padding: "11px 14px", display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 16 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: AMBER_DARK }}>TOTALE</span>
                      <span style={{ fontSize: 15, fontWeight: 800, color: AMBER_DARK }}>{"€ " + totEco.toLocaleString("it-IT")}</span>
                    </div>
                  </div>
                )}

                {activeTab === "piano" && (
                  <div>
                    {aiResult.piano.map((m, i) => (
                      <div key={i} style={{ display: "flex", gap: 14, alignItems: "flex-start", paddingBottom: 16, position: "relative" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                          <div style={{ width: 13, height: 13, borderRadius: "50%", background: AMBER, boxShadow: "0 0 0 3px " + AMBER_LIGHT, marginTop: 3 }} />
                          {i < aiResult.piano.length - 1 && <div style={{ width: 2, flex: 1, background: AMBER_BORDER, minHeight: 24, marginTop: 4 }} />}
                        </div>
                        <div style={{ flex: 1, background: "#fafafa", borderRadius: 10, border: "1px solid #f0f0f0", padding: "10px 14px" }}>
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginBottom: 5 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>{m.milestone}</div>
                            <StatoBadge s={m.stato} />
                          </div>
                          <div style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 12, color: "#9ca3af" }}>
                            <span><strong style={{ color: AMBER_DARK }}>Data:</strong> {m.data}</span>
                            <span><strong style={{ color: AMBER_DARK }}>Durata:</strong> {m.durata}</span>
                            <span><strong style={{ color: AMBER_DARK }}>Owner:</strong> {m.owner}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

              </div>
            </div>
          )}

          {/* Note */}
          {gara.note && (
            <div style={{ background: AMBER_BG, borderRadius: 12, border: "1px solid " + AMBER_BORDER, padding: "14px 18px" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: AMBER_DARK, marginBottom: 5, textTransform: "uppercase", letterSpacing: "0.05em" }}>Note</div>
              <div style={{ fontSize: 13, color: "#374151", lineHeight: 1.6 }}>{gara.note}</div>
            </div>
          )}

        </div>

        {/* Sidebar checklist */}
        <ChecklistSidebar checklist={checklistAttiva} onToggle={toggleCheck} lottoNome={lottoCorr?.nome || null} />

      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

// ── Componente principale ─────────────────────────────────────────────────────
export default function GarePage({ onUnauthorized }) {
  const [gare,            setGare]            = React.useState([]);
  const [loading,         setLoading]         = React.useState(true);
  const [saving,          setSaving]          = React.useState(false);
  const [error,           setError]           = React.useState("");
  const [selectedId,      setSelectedId]      = React.useState(null);
  const [showNuovaModale, setShowNuovaModale] = React.useState(false);

  const selectedGara = gare.find(g => g.id === selectedId) || null;

  // Carica gare dal backend all'avvio
  React.useEffect(() => {
    setLoading(true);
    getGare()
      .then(data => { setGare(data || []); setLoading(false); })
      .catch(err => {
        if (err?.status === 401 || err?.status === 403) { onUnauthorized && onUnauthorized(); }
        setError("Errore caricamento gare");
        setLoading(false);
      });
  }, []);

  const handleCreaGara = async (form) => {
    const nuova = {
      id:          newId(),
      nome:        form.nome.trim(),
      ente:        form.ente.trim(),
      scadenza:    form.scadenza,
      cig:         form.cig.trim(),
      importoBase: form.importoBase,
      note:        form.note.trim(),
      stato:       "Bozza",
      fileNames:   [],
      checklist:   DEFAULT_CHECKLIST.map(c => ({ ...c })),
      analyzed:    false,
      aiResult:    null,
      createdAt:   new Date().toISOString(),
    };
    setSaving(true);
    try {
      const saved = await putGara(nuova);
      const payload = saved.payload || saved.Payload || nuova;
      const withRecordId = { ...payload, _recordId: saved.Id || saved.id || payload._recordId };
      setGare(prev => [withRecordId, ...prev]);
      setShowNuovaModale(false);
      setSelectedId(nuova.id);
    } catch (err) {
      setError("Errore salvataggio gara");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdateGara = async (updated) => {
    // Aggiorna stato locale immediatamente (UI reattiva)
    setGare(prev => prev.map(g => g.id === updated.id ? updated : g));
    // Persiste in background
    try {
      await putGara(updated);
    } catch (err) {
      setError("Errore salvataggio — riprova");
    }
  };

  const handleDeleteGara = async (gara) => {
    if (!window.confirm("Eliminare la gara \"" + gara.nome + "\"? L'operazione non è reversibile.")) return;
    setGare(prev => prev.filter(g => g.id !== gara.id));
    if (selectedId === gara.id) setSelectedId(null);
    if (gara._recordId) {
      try { await deleteGara(gara._recordId); } catch {}
    }
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 36, height: 36, border: "3px solid #fcd34d", borderTopColor: "#b45309", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
        <div style={{ color: "#9ca3af", fontSize: 14 }}>Caricamento gare...</div>
      </div>
      <style>{"@keyframes spin{from{transform:rotate(0)}to{transform:rotate(360deg)}}"}</style>
    </div>
  );

  return (
    <>
      {error && (
        <div style={{ position: "fixed", top: 16, left: "50%", transform: "translateX(-50%)", zIndex: 9999, background: "#fef2f2", border: "1px solid #fca5a5", borderRadius: 8, padding: "10px 20px", fontSize: 13, color: "#dc2626", fontWeight: 600, boxShadow: "0 4px 12px rgba(0,0,0,0.1)" }}>
          {error} <button onClick={() => setError("")} style={{ marginLeft: 10, background: "none", border: "none", cursor: "pointer", color: "#dc2626", fontSize: 16 }}>×</button>
        </div>
      )}
      {saving && (
        <div style={{ position: "fixed", bottom: 20, right: 20, zIndex: 9998, background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 8, padding: "8px 16px", fontSize: 12, color: "#b45309", fontWeight: 600 }}>
          Salvataggio...
        </div>
      )}
      {selectedGara ? (
        <DettaglioGara
          gara={selectedGara}
          onBack={() => setSelectedId(null)}
          onUpdate={handleUpdateGara}
          onDelete={handleDeleteGara}
        />
      ) : (
        <ListaGare
          gare={gare}
          onApri={(id) => setSelectedId(id)}
          onNuova={() => setShowNuovaModale(true)}
          onDelete={handleDeleteGara}
        />
      )}
      {showNuovaModale && (
        <ModaleNuovaGara
          onCrea={handleCreaGara}
          onAnnulla={() => setShowNuovaModale(false)}
        />
      )}
    </>
  );
}
