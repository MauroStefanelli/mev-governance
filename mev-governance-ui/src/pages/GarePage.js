import React, { useState, useRef } from "react";

const AMBER = "#f59e0b";
const AMBER_DARK = "#b45309";
const AMBER_BG = "#fffbeb";
const AMBER_BORDER = "#fcd34d";
const AMBER_LIGHT = "#fef3c7";

const MOCK_DOCUMENTI = [
  { id: 1, nome: "Relazione Tecnica", tipo: "Documento principale", priorita: "Alta", stato: "Da produrre" },
  { id: 2, nome: "Piano di Qualita'", tipo: "Piano", priorita: "Alta", stato: "Da produrre" },
  { id: 3, nome: "CV del Team", tipo: "Allegato", priorita: "Alta", stato: "In lavorazione" },
  { id: 4, nome: "Referenze aziendali", tipo: "Allegato", priorita: "Media", stato: "Completato" },
  { id: 5, nome: "Piano di Gestione dei Rischi", tipo: "Piano", priorita: "Alta", stato: "Da produrre" },
  { id: 6, nome: "Schema di Offerta Economica", tipo: "Modulo", priorita: "Alta", stato: "Da produrre" },
  { id: 7, nome: "Cronoprogramma", tipo: "Piano", priorita: "Media", stato: "In lavorazione" },
  { id: 8, nome: "Dichiarazioni Antimafia", tipo: "Legale", priorita: "Alta", stato: "Completato" },
  { id: 9, nome: "DGUE compilato", tipo: "Modulo europeo", priorita: "Alta", stato: "Da produrre" },
  { id: 10, nome: "Polizza fideiussoria", tipo: "Garanzie", priorita: "Media", stato: "Da produrre" },
];

const MOCK_TECNICA = [
  { sezione: "1. Inquadramento della soluzione proposta", descrizione: "Descrizione architetturale della soluzione, allineamento ai requisiti del capitolato, approccio metodologico adottato e tecnologie chiave selezionate per garantire scalabilita' e sicurezza." },
  { sezione: "2. Metodologia di esecuzione", descrizione: "Approccio agile con sprint bimestrali, governance strutturata con comitato tecnico, milestone di avanzamento con KPI misurabili e meccanismi di escalation." },
  { sezione: "3. Team di progetto e competenze", descrizione: "Project Manager senior con 15+ anni di esperienza, 2 Solution Architect certificati, team di sviluppo di 6 risorse full-stack, specialista sicurezza informatica." },
  { sezione: "4. Piano di testing e collaudo", descrizione: "Test unitari con copertura minima dell'85%, test di integrazione, UAT con il committente, collaudo finale con rilascio su ambiente di produzione supervisionato." },
  { sezione: "5. Servizi post-avviamento", descrizione: "SLA H24 con tempo di risposta max 4h per severity critica, manutenzione evolutiva inclusa per 12 mesi, trasferimento di knowhow e formazione utenti finali." },
];

const MOCK_ECONOMICA = [
  { voce: "Analisi e progettazione", gg: 45, tariffa: 750, importo: 33750 },
  { voce: "Sviluppo e implementazione", gg: 120, tariffa: 650, importo: 78000 },
  { voce: "Testing e quality assurance", gg: 30, tariffa: 580, importo: 17400 },
  { voce: "Project Management", gg: 60, tariffa: 850, importo: 51000 },
  { voce: "Formazione e change management", gg: 15, tariffa: 700, importo: 10500 },
  { voce: "Infrastruttura cloud (annuale)", gg: null, tariffa: null, importo: 24000 },
  { voce: "Licenze software (annuale)", gg: null, tariffa: null, importo: 8500 },
  { voce: "Manutenzione evolutiva (12 mesi)", gg: 24, tariffa: 620, importo: 14880 },
];

const MOCK_PIANO = [
  { milestone: "Kick-off e analisi requisiti", data: "15 Gen 2025", durata: "3 settimane", responsabile: "PM + Business Analyst", stato: "Pianificato" },
  { milestone: "Progettazione architetturale", data: "05 Feb 2025", durata: "4 settimane", responsabile: "Solution Architect", stato: "Pianificato" },
  { milestone: "Sprint 1 - Core funzionalita'", data: "05 Mar 2025", durata: "6 settimane", responsabile: "Dev Team", stato: "Pianificato" },
  { milestone: "Sprint 2 - Integrazioni", data: "16 Apr 2025", durata: "6 settimane", responsabile: "Dev Team + Integrazione", stato: "Pianificato" },
  { milestone: "Testing e UAT", data: "28 Mag 2025", durata: "4 settimane", responsabile: "QA + Cliente", stato: "Pianificato" },
  { milestone: "Go-live e collaudo finale", data: "25 Giu 2025", durata: "2 settimane", responsabile: "PM + Cliente", stato: "Pianificato" },
  { milestone: "Stabilizzazione post-avviamento", data: "09 Lug 2025", durata: "4 settimane", responsabile: "Supporto operativo", stato: "Pianificato" },
];

const MOCK_CHECKLIST = [
  { id: 1, testo: "Leggere integralmente il bando e il capitolato", priorita: "Alta", done: true },
  { id: 2, testo: "Verificare i requisiti di ammissibilita' (fatturato, referenze)", priorita: "Alta", done: true },
  { id: 3, testo: "Costituire il team di risposta alla gara", priorita: "Alta", done: false },
  { id: 4, testo: "Raccogliere documentazione societaria e antimafia", priorita: "Alta", done: false },
  { id: 5, testo: "Redigere la relazione tecnica", priorita: "Alta", done: false },
  { id: 6, testo: "Elaborare l'offerta economica", priorita: "Alta", done: false },
  { id: 7, testo: "Compilare il DGUE e i moduli allegati", priorita: "Alta", done: false },
  { id: 8, testo: "Richiedere la polizza fideiussoria", priorita: "Media", done: false },
  { id: 9, testo: "Caricare i CV del personale proposto", priorita: "Media", done: false },
  { id: 10, testo: "Revisionare l'offerta con il legale", priorita: "Media", done: false },
  { id: 11, testo: "Preparare la presentazione del progetto", priorita: "Bassa", done: false },
  { id: 12, testo: "Effettuare il sopralluogo (se previsto)", priorita: "Bassa", done: false },
];

function StatCard({ label, value, sub, color }) {
  return (
    <div style={{
      background: "#fff",
      borderRadius: 12,
      padding: "18px 22px",
      boxShadow: "0 2px 10px rgba(0,0,0,0.07)",
      border: "1px solid #f0f0f0",
      flex: 1,
      minWidth: 160,
    }}>
      <div style={{ fontSize: 12, color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, color: color || "#1a1a1a", lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

function PrioritaBadge({ p }) {
  const colors = {
    "Alta":  { bg: "#fef2f2", color: "#dc2626", border: "#fca5a5" },
    "Media": { bg: "#fffbeb", color: AMBER_DARK, border: AMBER_BORDER },
    "Bassa": { bg: "#f0fdf4", color: "#16a34a", border: "#86efac" },
  };
  const c = colors[p] || colors["Media"];
  return (
    <span style={{
      background: c.bg, color: c.color, border: "1px solid " + c.border,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
    }}>{p}</span>
  );
}

function StatoBadge({ s }) {
  const colors = {
    "Completato":    { bg: "#f0fdf4", color: "#16a34a", border: "#86efac" },
    "In lavorazione":{ bg: "#eff6ff", color: "#1d4ed8", border: "#93c5fd" },
    "Da produrre":   { bg: "#f9fafb", color: "#6b7280", border: "#d1d5db" },
    "Pianificato":   { bg: AMBER_BG, color: AMBER_DARK, border: AMBER_BORDER },
  };
  const c = colors[s] || colors["Da produrre"];
  return (
    <span style={{
      background: c.bg, color: c.color, border: "1px solid " + c.border,
      borderRadius: 6, padding: "2px 8px", fontSize: 11, fontWeight: 700,
    }}>{s}</span>
  );
}

export default function GarePage({ onUnauthorized }) {
  const [files, setFiles] = useState([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [activeTab, setActiveTab] = useState("documenti");
  const [checklist, setChecklist] = useState(MOCK_CHECKLIST);
  const fileInputRef = useRef(null);

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith(".pdf") || f.name.endsWith(".docx") || f.name.endsWith(".zip")
    );
    if (dropped.length > 0) setFiles(prev => [...prev, ...dropped]);
  };

  const handleFileChange = (e) => {
    const selected = Array.from(e.target.files).filter(f =>
      f.name.endsWith(".pdf") || f.name.endsWith(".docx") || f.name.endsWith(".zip")
    );
    if (selected.length > 0) setFiles(prev => [...prev, ...selected]);
    e.target.value = "";
  };

  const removeFile = (idx) => setFiles(prev => prev.filter((_, i) => i !== idx));

  const handleAnalyze = () => {
    setAnalyzing(true);
    setTimeout(() => {
      setAnalyzing(false);
      setAnalyzed(true);
    }, 2800);
  };

  const toggleCheck = (id) => {
    setChecklist(prev => prev.map(c => c.id === id ? { ...c, done: !c.done } : c));
  };

  const doneCount = checklist.filter(c => c.done).length;
  const totalEconomica = MOCK_ECONOMICA.reduce((acc, r) => acc + r.importo, 0);

  const tabs = [
    { id: "documenti", label: "Documenti da produrre" },
    { id: "tecnica",   label: "Proposta tecnica" },
    { id: "economica", label: "Proposta economica" },
    { id: "piano",     label: "Piano di risposta" },
  ];

  return (
    <div style={{ background: "#f8f9fa", minHeight: "100vh", fontFamily: "'Segoe UI', system-ui, sans-serif" }}>

      {/* HEADER */}
      <div style={{
        background: "linear-gradient(135deg, #78350f 0%, #92400e 40%, #b45309 100%)",
        padding: "28px 32px 24px",
        borderBottom: "3px solid " + AMBER,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 6 }}>
              <div style={{
                width: 44, height: 44, borderRadius: 12,
                background: "rgba(255,255,255,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 22,
              }}>
                📋
              </div>
              <div>
                <h1 style={{ margin: 0, fontSize: 24, fontWeight: 800, color: "#fff", lineHeight: 1.1 }}>
                  Risposte di Gara
                </h1>
                <p style={{ margin: "4px 0 0", fontSize: 13, color: "rgba(255,255,255,0.75)" }}>
                  Gestione intelligente della documentazione e analisi AI dei bandi
                </p>
              </div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{
              background: AMBER, color: "#78350f",
              borderRadius: 20, padding: "5px 14px",
              fontSize: 12, fontWeight: 800,
              letterSpacing: "0.05em",
              boxShadow: "0 2px 8px rgba(245,158,11,0.4)",
            }}>
              AI-Powered
            </span>
            <span style={{
              background: "rgba(255,255,255,0.15)", color: "rgba(255,255,255,0.9)",
              borderRadius: 20, padding: "5px 14px", border: "1px solid rgba(255,255,255,0.3)",
              fontSize: 12, fontWeight: 600,
            }}>
              Scadenza: 30 Nov 2024
            </span>
          </div>
        </div>
      </div>

      {/* STATISTICHE */}
      <div style={{ padding: "20px 32px 0" }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <StatCard label="Documenti caricati" value={files.length} sub="Pronti per l'analisi" color={AMBER_DARK} />
          <StatCard label="Analisi completate" value={analyzed ? "1" : "0"} sub="Con AI" color="#1d4ed8" />
          <StatCard label="Scadenza gara" value="30 Nov" sub="2024 · 25 giorni rimanenti" color="#dc2626" />
          <StatCard label="Attivita' completate" value={doneCount + "/" + checklist.length} sub="Checklist gara" color="#16a34a" />
        </div>
      </div>

      {/* CORPO PRINCIPALE */}
      <div style={{ display: "flex", gap: 20, padding: "20px 32px 32px", alignItems: "flex-start" }}>

        {/* COLONNA PRINCIPALE */}
        <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 20 }}>

          {/* UPLOAD SEZIONE */}
          <div style={{
            background: "#fff", borderRadius: 14,
            boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
            border: "1px solid #f0f0f0",
            overflow: "hidden",
          }}>
            <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #f5f5f5" }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Carica documenti di gara</div>
              <div style={{ fontSize: 12, color: "#888", marginTop: 2 }}>Supporta PDF, DOCX, ZIP</div>
            </div>
            <div style={{ padding: "20px 24px" }}>
              {/* Drop zone */}
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onClick={() => fileInputRef.current && fileInputRef.current.click()}
                style={{
                  border: "2px dashed " + (isDragOver ? AMBER : "#e0e0e0"),
                  borderRadius: 12,
                  padding: "36px 24px",
                  textAlign: "center",
                  cursor: "pointer",
                  background: isDragOver ? AMBER_LIGHT : "#fafafa",
                  transition: "all 0.2s",
                }}
              >
                <div style={{ fontSize: 36, marginBottom: 12 }}>📂</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: isDragOver ? AMBER_DARK : "#555", marginBottom: 4 }}>
                  Trascina i file qui, o clicca per selezionare
                </div>
                <div style={{ fontSize: 12, color: "#aaa" }}>PDF, DOCX, ZIP fino a 50 MB</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.docx,.zip"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
              </div>

              {/* File list */}
              {files.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#888", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    File selezionati ({files.length})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {files.map((f, idx) => (
                      <div key={idx} style={{
                        display: "flex", alignItems: "center", gap: 12,
                        background: AMBER_BG, borderRadius: 8,
                        border: "1px solid " + AMBER_BORDER,
                        padding: "8px 14px",
                      }}>
                        <span style={{ fontSize: 18 }}>
                          {f.name.endsWith(".pdf") ? "📄" : f.name.endsWith(".zip") ? "🗜️" : "📝"}
                        </span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {f.name}
                          </div>
                          <div style={{ fontSize: 11, color: "#888" }}>
                            {(f.size / 1024).toFixed(1)} KB
                          </div>
                        </div>
                        <button
                          onClick={(e) => { e.stopPropagation(); removeFile(idx); }}
                          style={{
                            background: "none", border: "none", cursor: "pointer",
                            color: "#dc2626", fontSize: 18, lineHeight: 1, padding: "2px 4px",
                            borderRadius: 4,
                          }}
                          title="Rimuovi"
                        >×</button>
                      </div>
                    ))}
                  </div>

                  {/* Pulsante analisi */}
                  <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      style={{
                        background: analyzing ? "#d97706" : AMBER,
                        color: "#78350f",
                        border: "none",
                        borderRadius: 10,
                        padding: "11px 28px",
                        fontSize: 14, fontWeight: 800,
                        cursor: analyzing ? "wait" : "pointer",
                        boxShadow: "0 3px 12px rgba(245,158,11,0.35)",
                        display: "flex", alignItems: "center", gap: 10,
                        transition: "all 0.2s",
                        opacity: analyzing ? 0.85 : 1,
                      }}
                    >
                      {analyzing ? (
                        <>
                          <span style={{
                            display: "inline-block", width: 16, height: 16,
                            border: "2.5px solid rgba(120,53,15,0.3)",
                            borderTopColor: "#78350f",
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite",
                          }} />
                          Analisi in corso...
                        </>
                      ) : (
                        <>
                          <span style={{ fontSize: 16 }}>🤖</span>
                          Analizza con AI
                        </>
                      )}
                    </button>
                    {analyzed && !analyzing && (
                      <span style={{
                        fontSize: 13, fontWeight: 600, color: "#16a34a",
                        display: "flex", alignItems: "center", gap: 6,
                      }}>
                        <span>✓</span> Analisi completata
                      </span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* RISULTATI ANALISI */}
          {analyzed && (
            <div style={{
              background: "#fff", borderRadius: 14,
              boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              border: "1px solid #f0f0f0",
              overflow: "hidden",
            }}>
              <div style={{ padding: "18px 24px 0" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 18 }}>🤖</span>
                  <div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Risultati analisi AI</div>
                    <div style={{ fontSize: 12, color: "#888" }}>Estratti automaticamente dai documenti caricati</div>
                  </div>
                  <span style={{
                    marginLeft: "auto", background: AMBER_LIGHT, color: AMBER_DARK,
                    border: "1px solid " + AMBER_BORDER, borderRadius: 20,
                    padding: "3px 12px", fontSize: 11, fontWeight: 700,
                  }}>Bozza AI</span>
                </div>

                {/* Tab bar */}
                <div style={{ display: "flex", gap: 0, borderBottom: "2px solid #f0f0f0" }}>
                  {tabs.map(t => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id)}
                      style={{
                        padding: "10px 18px",
                        border: "none",
                        background: "none",
                        cursor: "pointer",
                        fontSize: 13, fontWeight: activeTab === t.id ? 700 : 500,
                        color: activeTab === t.id ? AMBER_DARK : "#888",
                        borderBottom: activeTab === t.id ? "2px solid " + AMBER : "2px solid transparent",
                        marginBottom: -2,
                        transition: "all 0.15s",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ padding: "20px 24px" }}>

                {/* TAB: Documenti */}
                {activeTab === "documenti" && (
                  <div>
                    <div style={{ marginBottom: 14, fontSize: 13, color: "#555" }}>
                      L'AI ha identificato <strong style={{ color: AMBER_DARK }}>{MOCK_DOCUMENTI.length} documenti</strong> richiesti dal bando.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {MOCK_DOCUMENTI.map(doc => (
                        <div key={doc.id} style={{
                          display: "flex", alignItems: "center", gap: 14,
                          padding: "12px 16px", borderRadius: 10,
                          background: "#fafafa", border: "1px solid #f0f0f0",
                          transition: "background 0.1s",
                        }}>
                          <span style={{ fontSize: 20 }}>📄</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>{doc.nome}</div>
                            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>{doc.tipo}</div>
                          </div>
                          <PrioritaBadge p={doc.priorita} />
                          <StatoBadge s={doc.stato} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB: Proposta tecnica */}
                {activeTab === "tecnica" && (
                  <div>
                    <div style={{ marginBottom: 14, fontSize: 13, color: "#555" }}>
                      Struttura suggerita dall'AI per la <strong style={{ color: AMBER_DARK }}>relazione tecnica</strong>.
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                      {MOCK_TECNICA.map((s, i) => (
                        <div key={i} style={{
                          borderLeft: "3px solid " + AMBER,
                          paddingLeft: 16, paddingTop: 2, paddingBottom: 2,
                        }}>
                          <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 5 }}>{s.sezione}</div>
                          <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>{s.descrizione}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* TAB: Proposta economica */}
                {activeTab === "economica" && (
                  <div>
                    <div style={{ marginBottom: 14, fontSize: 13, color: "#555" }}>
                      Stima economica <strong style={{ color: AMBER_DARK }}>generata dall'AI</strong> sulla base del capitolato.
                    </div>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ background: AMBER_LIGHT }}>
                            <th style={{ padding: "10px 14px", textAlign: "left", fontWeight: 700, color: AMBER_DARK, borderBottom: "2px solid " + AMBER_BORDER }}>Voce</th>
                            <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: AMBER_DARK, borderBottom: "2px solid " + AMBER_BORDER }}>GG</th>
                            <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: AMBER_DARK, borderBottom: "2px solid " + AMBER_BORDER }}>Tariffa</th>
                            <th style={{ padding: "10px 14px", textAlign: "right", fontWeight: 700, color: AMBER_DARK, borderBottom: "2px solid " + AMBER_BORDER }}>Importo</th>
                          </tr>
                        </thead>
                        <tbody>
                          {MOCK_ECONOMICA.map((r, i) => (
                            <tr key={i} style={{ background: i % 2 === 0 ? "#fff" : "#fafafa" }}>
                              <td style={{ padding: "10px 14px", color: "#1a1a1a", borderBottom: "1px solid #f0f0f0" }}>{r.voce}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", color: "#555", borderBottom: "1px solid #f0f0f0" }}>{r.gg !== null ? r.gg : "-"}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", color: "#555", borderBottom: "1px solid #f0f0f0" }}>{r.tariffa !== null ? "€ " + r.tariffa.toLocaleString("it-IT") : "-"}</td>
                              <td style={{ padding: "10px 14px", textAlign: "right", fontWeight: 600, color: "#1a1a1a", borderBottom: "1px solid #f0f0f0" }}>{"€ " + r.importo.toLocaleString("it-IT")}</td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr style={{ background: AMBER_LIGHT }}>
                            <td colSpan={3} style={{ padding: "12px 14px", fontWeight: 800, color: AMBER_DARK, fontSize: 14 }}>TOTALE OFFERTA</td>
                            <td style={{ padding: "12px 14px", textAlign: "right", fontWeight: 800, color: AMBER_DARK, fontSize: 15 }}>{"€ " + totalEconomica.toLocaleString("it-IT")}</td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                )}

                {/* TAB: Piano */}
                {activeTab === "piano" && (
                  <div>
                    <div style={{ marginBottom: 14, fontSize: 13, color: "#555" }}>
                      <strong style={{ color: AMBER_DARK }}>Timeline di esecuzione</strong> con milestone chiave del progetto.
                    </div>
                    <div style={{ position: "relative" }}>
                      {MOCK_PIANO.map((m, i) => (
                        <div key={i} style={{
                          display: "flex", gap: 16, alignItems: "flex-start",
                          marginBottom: i < MOCK_PIANO.length - 1 ? 0 : 0,
                          paddingBottom: 20,
                          position: "relative",
                        }}>
                          {/* Timeline dot and line */}
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", flexShrink: 0 }}>
                            <div style={{
                              width: 14, height: 14, borderRadius: "50%",
                              background: AMBER, border: "3px solid " + AMBER_LIGHT,
                              boxShadow: "0 0 0 2px " + AMBER,
                              flexShrink: 0, marginTop: 2,
                            }} />
                            {i < MOCK_PIANO.length - 1 && (
                              <div style={{ width: 2, flex: 1, background: AMBER_BORDER, minHeight: 30, marginTop: 4 }} />
                            )}
                          </div>
                          {/* Content */}
                          <div style={{
                            flex: 1, background: "#fafafa", borderRadius: 10,
                            border: "1px solid #f0f0f0", padding: "12px 16px",
                          }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
                              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a" }}>{m.milestone}</div>
                              <StatoBadge s={m.stato} />
                            </div>
                            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 12, color: "#888" }}>
                                <strong style={{ color: AMBER_DARK }}>Data:</strong> {m.data}
                              </span>
                              <span style={{ fontSize: 12, color: "#888" }}>
                                <strong style={{ color: AMBER_DARK }}>Durata:</strong> {m.durata}
                              </span>
                              <span style={{ fontSize: 12, color: "#888" }}>
                                <strong style={{ color: AMBER_DARK }}>Owner:</strong> {m.responsabile}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}

        </div>

        {/* SIDEBAR CHECKLIST */}
        <div style={{ width: 320, flexShrink: 0 }}>
          <div style={{
            background: "#fff", borderRadius: 14,
            boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
            border: "1px solid #f0f0f0",
            overflow: "hidden",
            position: "sticky", top: 20,
          }}>
            <div style={{
              padding: "16px 20px",
              background: "linear-gradient(135deg, #78350f, " + AMBER_DARK + ")",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#fff" }}>Checklist attivita'</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.7)", marginTop: 2 }}>{doneCount} di {checklist.length} completate</div>
              </div>
              <div style={{
                width: 42, height: 42, borderRadius: "50%",
                background: "rgba(255,255,255,0.15)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 20 }}>✅</span>
              </div>
            </div>

            {/* Progress bar */}
            <div style={{ padding: "12px 20px 0" }}>
              <div style={{ height: 6, background: "#f0f0f0", borderRadius: 3, overflow: "hidden" }}>
                <div style={{
                  height: "100%",
                  width: (doneCount / checklist.length * 100).toFixed(1) + "%",
                  background: "linear-gradient(90deg, " + AMBER + ", " + AMBER_DARK + ")",
                  borderRadius: 3, transition: "width 0.4s ease",
                }} />
              </div>
              <div style={{ fontSize: 11, color: "#888", textAlign: "right", marginTop: 4 }}>
                {(doneCount / checklist.length * 100).toFixed(0)}%
              </div>
            </div>

            {/* Items */}
            <div style={{ padding: "8px 20px 20px", maxHeight: 480, overflowY: "auto" }}>
              {["Alta", "Media", "Bassa"].map(prio => {
                const items = checklist.filter(c => c.priorita === prio);
                if (items.length === 0) return null;
                return (
                  <div key={prio} style={{ marginBottom: 16 }}>
                    <div style={{
                      fontSize: 10, fontWeight: 700, letterSpacing: "0.08em",
                      textTransform: "uppercase", color: "#aaa",
                      marginBottom: 8, marginTop: 8,
                      display: "flex", alignItems: "center", gap: 6,
                    }}>
                      <span style={{
                        width: 6, height: 6, borderRadius: "50%",
                        background: prio === "Alta" ? "#dc2626" : prio === "Media" ? AMBER : "#16a34a",
                        flexShrink: 0,
                      }} />
                      Priorita' {prio}
                    </div>
                    {items.map(item => (
                      <div
                        key={item.id}
                        onClick={() => toggleCheck(item.id)}
                        style={{
                          display: "flex", alignItems: "flex-start", gap: 10,
                          padding: "8px 10px", borderRadius: 8, cursor: "pointer",
                          marginBottom: 4,
                          background: item.done ? "#f0fdf4" : "#fafafa",
                          border: "1px solid " + (item.done ? "#86efac" : "#f0f0f0"),
                          transition: "all 0.15s",
                        }}
                      >
                        <div style={{
                          width: 18, height: 18, borderRadius: 4, flexShrink: 0, marginTop: 1,
                          border: "2px solid " + (item.done ? "#16a34a" : "#d1d5db"),
                          background: item.done ? "#16a34a" : "#fff",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          transition: "all 0.15s",
                        }}>
                          {item.done && <span style={{ color: "#fff", fontSize: 11, lineHeight: 1 }}>✓</span>}
                        </div>
                        <span style={{
                          fontSize: 12, color: item.done ? "#6b7280" : "#374151",
                          lineHeight: 1.4, flex: 1,
                          textDecoration: item.done ? "line-through" : "none",
                          transition: "all 0.15s",
                        }}>
                          {item.testo}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

      </div>

      {/* CSS animation */}
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
