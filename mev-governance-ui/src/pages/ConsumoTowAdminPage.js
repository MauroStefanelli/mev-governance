import React, { useEffect, useState, useCallback, useRef } from "react";
import { getConsumoTow, updateConsumoTow, createConsumoTow, createConsumoTowFiglio, deleteConsumoTowContratto,
  getTowImpatto, setTowImpatto as saveTowImpattoToDb, getMevList,
  getRtiSocieta, createRtiSocieta, updateRtiSocieta, deleteRtiSocieta, bulkImportRtiSocieta,
  resetMevAndConsumoTow, getOrdiniConsegna,
} from "../services/mevService";

const CONTRATTI_ORDER_KEY = "consumo-tow-contratti-order";
export const TOW_IMPATTO_KEY = "tow-impatto-perc"; // { "NomeContratto": { "TOW02.1": 30.5, ... } }

export const loadTowImpatto = (contratto) => {
  try {
    const raw = JSON.parse(localStorage.getItem(TOW_IMPATTO_KEY) || "{}");
    // Retrocompatibilità: se il dato è flat { "TOW02.1": 30 } (valori numerici diretti)
    // lo trattiamo come configurazione del primo contratto disponibile
    const firstVal = Object.values(raw)[0];
    if (typeof firstVal === "number") {
      // struttura vecchia flat — restituisce flat se contratto non specificato
      return contratto ? raw : raw;
    }
    if (contratto) return raw[contratto] || {};
    return raw; // { contratto: { tow: perc } }
  } catch { return contratto ? {} : {}; }
};
const saveTowImpatto = (map) => {
  localStorage.setItem(TOW_IMPATTO_KEY, JSON.stringify(map));
  // Salva anche sul backend (fire-and-forget) per condividere con tutti gli utenti
  saveTowImpattoToDb(map).catch(() => {});
};

const formatEuro = (v) => {
  const n = Number(v);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: true }).format(n) + " €";
};

const formatQta = (v) => {
  const n = Number(v);
  if (isNaN(n)) return "—";
  return n.toLocaleString("it-IT", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
};

const parseNum = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  const s = String(v).replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};


const formatDate = (v) => {
  if (!v) return "—";
  const d = new Date(v);
  if (isNaN(d.getTime())) return v;
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
};

const formatPerc = (v) => {
  const n = Number(v);
  if (isNaN(n)) return "—";
  return (n * 100).toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + "%";
};

const RUOLI = ["Mandataria", "Mandante", "SUBCO", "Altro"];


// Formatta un numero per la visualizzazione nel campo input (formato italiano)
const formatForInput = (v, group) => {
  const n = Number(v);
  if (isNaN(n) || v === "" || v === null || v === undefined) return "0";
  if (group === "euro") {
    return new Intl.NumberFormat("it-IT", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
      useGrouping: true,
    }).format(n);
  }
  // qta: fino a 3 decimali, senza simbolo €
  return new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
    useGrouping: true,
  }).format(n);
};

// Campi con totale abilitato
const TOTALE_KEYS = new Set(["valoreTotale", "approvato", "ordinatiRda", "impegnato", "residuo"]);

// ─── Larghezze colonne condivise tra tabella CONTRATTO e tabella RTI ──────────
// Modificare QUI per cambiare qualsiasi larghezza: entrambe le tabelle le usano.
const CW = {
  arrow:             32,   // freccia expand/collapse (CONTRATTO) / ID (RTI)
  contratto:        180,   // nome contratto (CONTRATTO) / flex split (RTI)
  tow:              100,   // nome TOW (CONTRATTO) / ruolo (RTI)
  qta:               65,   // quantità (CONTRATTO) / società+% (RTI)
  valoreUnitario:   125,
  impatto:           90,   // colonna % impatto (opzionale)
  valoreTotale:     125,
  approvato:        125,
  ordinatiRda:      125,
  impegnato:        125,
  residuo:          125,
  towApprovati:      85,
  towResidui:        85,
  collaudoApprovato:125,
  collaudoOrdinato: 125,
  collaudoFatturato:125,
  azioni:            64,   // solo tabella RTI
};
// Larghezza totale delle prime 4 colonne info (uguale in entrambe le tabelle)
// ORIGINALE const CW_INFO_TOTAL = CW.arrow + CW.contratto + CW.tow + CW.qta; // 377px
const CW_INFO_TOTAL = 345;

const FIELDS = [
  { key: "valoreUnitario",    label: "Valore Unitario",     group: "euro", color: "#64748b" },
  { key: "valoreTotale",      label: "Valore Totale",        group: "euro", color: "#1e293b" },
  { key: "approvato",         label: "Approvato",            group: "euro", color: "#1a73e8" },
  { key: "ordinatiRda",       label: "Ordinato (RDA)",       group: "euro", color: "#10b981" },
  { key: "impegnato",         label: "Impegnato",            group: "euro", color: "#f59e0b" },
  { key: "residuo",           label: "Residuo",              group: "euro", color: "#f97316" },
  { key: "towApprovati",      label: "TOW Approvati",        group: "qta",  color: "#64748b" },
  { key: "towResidui",        label: "TOW Residui",          group: "qta",  color: "#64748b" },
  { key: "collaudoApprovato", label: "Collaudo Approvato",   group: "euro", color: "#64748b" },
  { key: "collaudoOrdinato",  label: "Collaudo Ordinato",    group: "euro", color: "#64748b" },
  { key: "collaudoFatturato", label: "Collaudo Fatturato",   group: "euro", color: "#64748b" },
];

const TH = (align = "right") => ({
  padding: "10px 14px",
  textAlign: align,
  fontWeight: 700,
  fontSize: "11px",
  color: "#64748b",
  textTransform: "uppercase",
  letterSpacing: "0.4px",
  borderBottom: "2px solid #e2e8f0",
  whiteSpace: "nowrap",
  background: "#f8fafc",
  position: "sticky",
  top: 0,
  zIndex: 2,
});

const TD = (align = "right", extra = {}) => ({
  padding: "9px 14px",
  textAlign: align,
  fontSize: "13px",
  borderBottom: "1px solid #f1f5f9",
  whiteSpace: "nowrap",
  color: "#374151",
  ...extra,
});

// ── Modale Nuovo Contratto BASE ───────────────────────────────────────────────
function NewContrattoBaseModal({ onClose, onCreated, onImpattoSaved }) {
  const INIT_TOWS = ["TOW02.1","TOW02.2","TOW02.3","TOW02.4","TOW02.5","TOW02.6"];
  const [nomeContratto, setNomeContratto] = useState("");
  const [towNames, setTowNames]   = useState(INIT_TOWS);
  const [valori, setValori]       = useState(() => Object.fromEntries(INIT_TOWS.map(k => [k, ""])));
  const [qta, setQta]             = useState(() => Object.fromEntries(INIT_TOWS.map(k => [k, ""])));
  const [perc, setPerc]           = useState(() => Object.fromEntries(INIT_TOWS.map(k => [k, ""])));
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const setValore  = (idx, val) => setValori(p  => { const n = { ...p }; n[towNames[idx]] = val; return n; });
  const setQtaVal  = (idx, val) => setQta(p     => { const n = { ...p }; n[towNames[idx]] = val; return n; });
  const setPercVal = (idx, val) => setPerc(p    => { const n = { ...p }; n[towNames[idx]] = val; return n; });
  const setTowName = (idx, val) => {
    setTowNames(prev => {
      const next = [...prev];
      const oldKey = next[idx];
      next[idx] = val;
      setValori(p  => { const n = { ...p }; n[val] = p[oldKey] || ""; delete n[oldKey]; return n; });
      setQta(p     => { const n = { ...p }; n[val] = p[oldKey] || ""; delete n[oldKey]; return n; });
      setPerc(p    => { const n = { ...p }; n[val] = p[oldKey] || ""; delete n[oldKey]; return n; });
      return next;
    });
  };

  const parsedValori = Object.fromEntries(towNames.map(k => [k, parseNum(valori[k])]));
  const parsedQta    = Object.fromEntries(towNames.map(k => [k, parseNum(qta[k])]));
  const valoreTotale = towNames.reduce((s, k) => s + parsedQta[k] * parsedValori[k], 0);

  const handleSave = async () => {
    if (!nomeContratto.trim()) { setError("Inserisci il nome del contratto."); return; }
    if (towNames.some(t => !t.trim())) { setError("Tutti i nomi TOW devono essere compilati."); return; }
    const percTot = towNames.reduce((s, k) => s + (parseNum(perc[k]) || 0), 0);
    if (percTot > 0 && Math.abs(percTot - 100) > 0.1) {
      if (!window.confirm(`La somma delle % è ${percTot.toFixed(1)}% (non 100%). Continuare?`)) return;
    }
    setSaving(true); setError("");
    try {
      const valoriByName = Object.fromEntries(towNames.map(k => [k, parsedValori[k]]));
      const qtaByName    = Object.fromEntries(towNames.map(k => [k, parsedQta[k]]));
      const newRows = await createConsumoTow(nomeContratto.trim(), valoriByName, qtaByName);
      // Salva le % impatto per questo contratto in localStorage
      const percMap = {};
      towNames.forEach(k => { const v = parseNum(perc[k]); if (v > 0) percMap[k] = v; });
      if (Object.keys(percMap).length > 0) {
        const all = loadTowImpatto();
        const isFlat = typeof Object.values(all)[0] === "number";
        const prev = isFlat ? {} : { ...all };
        const next = { ...prev, [nomeContratto.trim()]: percMap };
        saveTowImpatto(next);
        onImpattoSaved?.(next);
      }
      onCreated(newRows);
      onClose();
    } catch (e) { setError(e.message || "Errore durante la creazione"); }
    finally { setSaving(false); }
  };

  const inputBase = { padding: "8px 11px", borderRadius: "7px", border: "1px solid #dadce0", fontSize: "13px", width: "100%", boxSizing: "border-box", outline: "none" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: "100%", maxWidth: "680px", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0", background: "linear-gradient(135deg,#1a73e8 0%,#1557b0 100%)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>Nuovo Contratto BASE</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "3px" }}>Definisci i nomi TOW, le quantità e i valori unitari</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", color: "#fff", width: "30px", height: "30px", borderRadius: "50%", fontSize: "16px", lineHeight: "30px", textAlign: "center" }}>✕</button>
        </div>
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" }}>{error}</div>}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>Nome Contratto</div>
            <input style={inputBase} placeholder="es. Contratto BASE" value={nomeContratto} onChange={e => setNomeContratto(e.target.value)} autoFocus />
          </div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #eff6ff" }}>TOW — Nome, Quantità e Valore Unitario</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Nome TOW</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>QTA</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Valore €</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>% Impatto</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#1e293b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Subtotale</th>
              </tr>
            </thead>
            <tbody>
              {towNames.map((tow, idx) => {
                const sub = parsedQta[tow] * parsedValori[tow];
                return (
                  <tr key={idx} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "6px 12px" }}>
                      <input style={{ ...inputBase, width: "130px", fontWeight: 700 }} value={tow} onChange={e => setTowName(idx, e.target.value)} placeholder="es. TOW01.2" />
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <input style={{ ...inputBase, textAlign: "right", width: "110px" }} placeholder="0" value={qta[tow] ?? ""} onChange={e => setQtaVal(idx, e.target.value)} onBlur={e => setQtaVal(idx, formatForInput(parseNum(e.target.value), "qta"))} />
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <input style={{ ...inputBase, textAlign: "right", width: "140px" }} placeholder="0,00" value={valori[tow] ?? ""} onChange={e => setValore(idx, e.target.value)} onBlur={e => setValore(idx, formatForInput(parseNum(e.target.value), "euro"))} />
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <input
                          style={{ ...inputBase, textAlign: "right", width: "80px", paddingRight: "22px",
                            color: "#7c3aed", fontWeight: perc[tow] ? 700 : 400,
                            background: perc[tow] ? "#f5f3ff" : "#fff",
                            border: "1px solid #ddd8fe" }}
                          placeholder="0"
                          value={perc[tow] ?? ""}
                          onChange={e => setPercVal(idx, e.target.value)}
                        />
                        <span style={{ position: "absolute", right: "8px", fontSize: "11px", color: "#8b5cf6", pointerEvents: "none" }}>%</span>
                      </div>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: "13px", color: sub > 0 ? "#059669" : "#94a3b8" }}>{formatEuro(sub)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* Totali */}
          <div style={{ display: "flex", gap: "12px", marginBottom: "0" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", flex: 1 }}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Valore Totale (Σ QTA × Valore€)</span>
              <span style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{formatEuro(valoreTotale)}</span>
            </div>
            {(() => {
              const totPerc = towNames.reduce((s, k) => s + (parseNum(perc[k]) || 0), 0);
              if (totPerc === 0) return null;
              const ok = Math.abs(totPerc - 100) <= 0.1;
              return (
                <div style={{ background: ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${ok ? "#bbf7d0" : "#fecaca"}`, borderRadius: "10px", padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", minWidth: "160px" }}>
                  <span style={{ fontSize: "13px", fontWeight: 700, color: ok ? "#064e3b" : "#991b1b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Totale %</span>
                  <span style={{ fontSize: "20px", fontWeight: 800, color: ok ? "#059669" : "#dc2626" }}>{totPerc.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</span>
                </div>
              );
            })()}
          </div>
        </div>
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px", background: "#f8fafc" }}>
          <button onClick={onClose} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid #dadce0", background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151", fontWeight: 500 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 22px", borderRadius: "8px", border: "none", background: saving ? "#93c5fd" : "#1a73e8", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Creazione..." : "Crea Contratto BASE"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modale Nuovo Contratto Figlio (non-BASE) ──────────────────────────────────
export function NewContrattoFiglioModal({ onClose, onCreated, baseRows }) {
  const { pos, onMouseDown } = useDrag();
  const baseTowNames = [...new Set(baseRows.map(r => r.tow))];
  const baseContratto = baseRows[0]?.towContratto || "";
  // Legge le % impatto per il contratto BASE (per mostrarle nella tabella)
  const towImpattoAll = loadTowImpatto();
  const isFlat = typeof Object.values(towImpattoAll)[0] === "number";
  const basePerc = isFlat ? towImpattoAll : (towImpattoAll[baseContratto] || {});

  const [nomeContratto, setNomeContratto] = useState("");
  const [sconto, setSconto]               = useState("");
  // Per ogni TOW: qta (N° TOW) oppure subtotale (catalogo), e flag catalogo ereditato da BASE
  const [towData, setTowData] = useState(() =>
    Object.fromEntries(baseTowNames.map(k => {
      const baseRow = baseRows.find(r => r.tow === k);
      return [k, { qta: "", subtotale: "", isCatalogo: !!(baseRow?.isCatalogo) }];
    }))
  );
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState("");

  const scontoNum = parseNum(sconto.replace(",", "."));

  const setTowField = (tow, field, val) =>
    setTowData(p => ({ ...p, [tow]: { ...p[tow], [field]: val } }));

  const getBaseValore = (tow) => {
    const r = baseRows.find(x => x.tow === tow);
    return r ? Number(r.valoreUnitario) || 0 : 0;
  };

  const getValoreScontato = (tow) => getBaseValore(tow) * (1 - scontoNum / 100);

  const getSubtotale = (tow) => {
    const d = towData[tow];
    if (d.isCatalogo) return parseNum(d.subtotale);
    return getValoreScontato(tow) * parseNum(d.qta);
  };

  const handleSave = async () => {
    if (!nomeContratto.trim()) { setError("Inserisci il nome del contratto."); return; }
    if (scontoNum < 0 || scontoNum > 100) { setError("La percentuale di sconto deve essere tra 0 e 100."); return; }
    setSaving(true); setError("");
    try {
      // qta: per righe catalogo passa l'importo €; il backend divide per val.scontato
      const qtaByName = Object.fromEntries(baseTowNames.map(k => {
        const d = towData[k];
        if (d.isCatalogo) return [k, parseNum(d.subtotale)];
        return [k, parseNum(d.qta)];
      }));
      const isCatalogoMap = Object.fromEntries(
        baseTowNames.map(k => [k, !!towData[k].isCatalogo])
      );
      const newRows = await createConsumoTowFiglio(nomeContratto.trim(), scontoNum, qtaByName, isCatalogoMap);
      onCreated(newRows);
      onClose();
    } catch (e) { setError(e.message || "Errore durante la creazione"); }
    finally { setSaving(false); }
  };

  const inputBase = { padding: "8px 11px", borderRadius: "7px", border: "1px solid #dadce0", fontSize: "13px", width: "100%", boxSizing: "border-box", outline: "none" };
  const totaleScontato = baseTowNames.reduce((s, k) => s + getSubtotale(k), 0);

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflow: "auto" }}>
      <div
        style={{
          background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          width: "100%", maxWidth: "800px", display: "flex", flexDirection: "column", overflow: "hidden",
          position: "relative",
          transform: `translate(${pos.x}px, ${pos.y}px)`,
        }}
      >
        {/* Header — draggable */}
        <div
          onMouseDown={onMouseDown}
          style={{
            padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0",
            background: "linear-gradient(135deg,#10b981 0%,#059669 100%)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            cursor: "grab",
          }}
        >
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>Nuovo Contratto</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "3px" }}>
              Trascina per spostare • Inserisci % sconto e N° TOW (o € Catalogo) — valori calcolati dal BASE
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", color: "#fff", width: "30px", height: "30px", borderRadius: "50%", fontSize: "16px", lineHeight: "30px", textAlign: "center", flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", overflowX: "auto", padding: "20px 24px", flex: 1, maxHeight: "65vh" }}>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" }}>{error}</div>}

          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: "14px", marginBottom: "20px" }}>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>Nome Contratto</div>
              <input style={inputBase} placeholder="es. Contratto-XYZ" value={nomeContratto} onChange={e => setNomeContratto(e.target.value)} autoFocus />
            </div>
            <div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>% Sconto sul BASE</div>
              <div style={{ position: "relative" }}>
                <input style={{ ...inputBase, textAlign: "right", paddingRight: "28px" }} placeholder="0,00" value={sconto} onChange={e => setSconto(e.target.value)} onBlur={e => setSconto(formatForInput(parseNum(e.target.value.replace(",", ".")), "qta"))} />
                <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: "#64748b", pointerEvents: "none" }}>%</span>
              </div>
            </div>
          </div>

          <div style={{ fontSize: "11px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #f0fdf4" }}>
            TOW — Valori Calcolati
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed", marginBottom: "20px" }}>
            <colgroup>
              <col style={{ width: "110px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "120px" }} />
              <col style={{ width: "70px" }} />
              <col style={{ width: "60px" }} />
              <col style={{ width: "130px" }} />
              <col style={{ width: "120px" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>TOW</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Val. BASE €</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Val. Scontato €</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#7c3aed", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>% Imp.</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Cat.</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>N° TOW / € Cat.</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#1e293b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Valore Totale</th>
              </tr>
            </thead>
            <tbody>
              {baseTowNames.map((tow, idx) => {
                const baseVal  = getBaseValore(tow);
                const valSc    = getValoreScontato(tow);
                const sub      = getSubtotale(tow);
                const d        = towData[tow];
                return (
                  <tr key={tow} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, fontSize: "13px", color: "#334155" }}>
                      <span style={{ background: "#f1f5f9", borderRadius: "5px", padding: "2px 8px" }}>{tow}</span>
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontSize: "13px", color: "#94a3b8" }}>{formatEuro(baseVal)}</td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontSize: "13px", fontWeight: 600, color: "#059669" }}>{formatEuro(valSc)}</td>
                    {/* % Impatto (read-only, dal contratto BASE) */}
                    <td style={{ padding: "8px 12px", textAlign: "right", fontSize: "13px" }}>
                      {basePerc[tow]
                        ? <span style={{ color: "#7c3aed", fontWeight: 700 }}>{Number(basePerc[tow]).toLocaleString("it-IT", { maximumFractionDigits: 1 })}%</span>
                        : <span style={{ color: "#cbd5e1" }}>—</span>
                      }
                    </td>
                    {/* Catalogo checkbox */}
                    <td style={{ padding: "6px 12px", textAlign: "center" }}>
                      <input
                        type="checkbox"
                        checked={d.isCatalogo}
                        onChange={e => setTowField(tow, "isCatalogo", e.target.checked)}
                        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#10b981" }}
                      />
                    </td>
                    {/* N° TOW o € Catalogo */}
                    <td style={{ padding: "6px 12px" }}>
                      {d.isCatalogo ? (
                        <input
                          style={{ ...inputBase, textAlign: "right", padding: "7px 10px" }}
                          placeholder="€ Catalogo"
                          value={d.subtotale}
                          onChange={e => setTowField(tow, "subtotale", e.target.value)}
                          onBlur={e => setTowField(tow, "subtotale", formatForInput(parseNum(e.target.value), "euro"))}
                        />
                      ) : (
                        <input
                          style={{ ...inputBase, textAlign: "right", padding: "7px 10px" }}
                          placeholder="0"
                          value={d.qta}
                          onChange={e => setTowField(tow, "qta", e.target.value)}
                          onBlur={e => setTowField(tow, "qta", formatForInput(parseNum(e.target.value), "qta"))}
                        />
                      )}
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: "13px", color: sub > 0 ? "#059669" : "#94a3b8" }}>{formatEuro(sub)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Valore Totale (sconto {scontoNum}%)</span>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{formatEuro(totaleScontato)}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px", background: "#f8fafc" }}>
          <button onClick={onClose} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid #dadce0", background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151", fontWeight: 500 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 22px", borderRadius: "8px", border: "none", background: saving ? "#6ee7b7" : "#10b981", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Creazione..." : "Crea Contratto"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Modale Modifica ────────────────────────────────────────────────────────────
// isBase=true → permette modifica nome TOW + tutti i campi importo
// isBase=false → nome TOW readonly, valori BASE readonly, editabili solo sconto e QTA
function EditModal({ row, onClose, onSaved, isBase, baseRows }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Per contratti figlio: sconto e QTA sono i campi editabili
  const [sconto, setSconto] = useState("");
  const [qtaFiglio, setQtaFiglio] = useState("");

  useEffect(() => {
    if (isBase) {
      const init = { tow: row.tow || "", towContratto: row.towContratto || "" };
      FIELDS.forEach(f => { init[f.key] = formatForInput(row[f.key] ?? 0, f.group); });
      setForm(init);
    } else {
      // Recupera sconto e qta dal record figlio
      const scontoVal = row.sconto != null ? row.sconto : 0;
      setSconto(formatForInput(scontoVal, "qta"));
      setQtaFiglio(formatForInput(row.towApprovati ?? 0, "qta"));
      const init = { tow: row.tow || "", towContratto: row.towContratto || "" };
      FIELDS.forEach(f => { init[f.key] = formatForInput(row[f.key] ?? 0, f.group); });
      setForm(init);
    }
  }, [row, isBase]);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  // Per figlio: valore BASE di questo TOW
  const baseRow = baseRows ? baseRows.find(r => r.tow === row.tow) : null;
  const baseValore = baseRow ? Number(baseRow.valoreUnitario) || 0 : 0;
  const scontoNum = parseNum(sconto.replace(",", "."));
  const valoreScontato = baseValore * (1 - scontoNum / 100);
  const qtaFiglioNum = parseNum(qtaFiglio);
  const valoreTotaleFiglio = valoreScontato * qtaFiglioNum;

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      let payload;
      if (isBase) {
        payload = {
          // Preserva tutti i campi originali, sovrascrive solo quelli editati
          tow: form.tow, towContratto: form.towContratto,
          approvato:       parseNum(form.approvato),
          ordinatiRda:     parseNum(form.ordinatiRda),
          impegnato:       parseNum(form.impegnato),
          residuo:         parseNum(form.residuo),
          valoreUnitario:  parseNum(form.valoreUnitario),
          valoreTotale:    parseNum(form.valoreTotale),
          towApprovati:    parseNum(form.towApprovati),
          towImpegnati:    parseNum(form.towImpegnati),
          towResidui:      parseNum(form.towResidui),
          collaudoApprovato:  parseNum(form.collaudoApprovato),
          collaudoOrdinato:   parseNum(form.collaudoOrdinato),
          collaudoFatturato:  parseNum(form.collaudoFatturato),
          sconto:          row.sconto ?? 0,
          isCatalogo:      row.isCatalogo ?? false,
        };
      } else {
        payload = {
          tow: row.tow,
          towContratto: row.towContratto,
          sconto: scontoNum,
          towApprovati: qtaFiglioNum,
          valoreUnitario: valoreScontato,
          valoreTotale: valoreTotaleFiglio,
          // Preserva i campi non editabili
          approvato:          row.approvato ?? 0,
          ordinatiRda:        row.ordinatiRda ?? 0,
          impegnato:          row.impegnato ?? 0,
          residuo:            row.residuo ?? 0,
          towImpegnati:       row.towImpegnati ?? 0,
          towResidui:         row.towResidui ?? 0,
          collaudoApprovato:  row.collaudoApprovato ?? 0,
          collaudoOrdinato:   row.collaudoOrdinato ?? 0,
          collaudoFatturato:  row.collaudoFatturato ?? 0,
          isCatalogo:         row.isCatalogo ?? false,
        };
      }
      const updated = await updateConsumoTow(row.id, payload);
      onSaved(updated); onClose();
    } catch (e) { setError(e.message || "Errore durante il salvataggio"); }
    finally { setSaving(false); }
  };

  const inputBase = { padding: "8px 11px", borderRadius: "7px", border: "1px solid #dadce0", fontSize: "13px", width: "100%", boxSizing: "border-box", outline: "none" };
  const readonlyStyle = { ...inputBase, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: "100%", maxWidth: "700px", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: isBase ? "linear-gradient(135deg,#1a73e8 0%,#1557b0 100%)" : "linear-gradient(135deg,#10b981 0%,#059669 100%)" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
              {isBase ? "Modifica TOW — Contratto BASE" : "Modifica TOW — Contratto Figlio"}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "3px" }}>{row.tow} — {row.towContratto}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", color: "#fff", width: "30px", height: "30px", borderRadius: "50%", fontSize: "16px", lineHeight: "30px", textAlign: "center" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" }}>{error}</div>}

          {isBase ? (
            <>
              {/* BASE: nome TOW editabile + contratto readonly */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>Nome TOW</div>
                  <input style={inputBase} value={form.tow || ""} onChange={e => set("tow", e.target.value)} />
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>Contratto</div>
                  <input style={readonlyStyle} value={form.towContratto || ""} readOnly />
                </div>
              </div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #eff6ff" }}>Valori Euro</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                {FIELDS.filter(f => f.group === "euro").map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>{f.label}</div>
                    <input style={{ ...inputBase, textAlign: "right" }} value={form[f.key] ?? ""} onChange={e => set(f.key, e.target.value)} onBlur={e => set(f.key, formatForInput(parseNum(e.target.value), f.group))} />
                  </div>
                ))}
              </div>
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #f0fdf4" }}>Quantità TOW</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
                {FIELDS.filter(f => f.group === "qta").map(f => (
                  <div key={f.key}>
                    <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>{f.label}</div>
                    <input style={{ ...inputBase, textAlign: "right" }} value={form[f.key] ?? ""} onChange={e => set(f.key, e.target.value)} onBlur={e => set(f.key, formatForInput(parseNum(e.target.value), f.group))} />
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {/* FIGLIO: nome TOW e valori BASE in sola lettura, editabili solo sconto e QTA */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>Nome TOW</div>
                  <input style={readonlyStyle} value={form.tow || ""} readOnly />
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>Contratto</div>
                  <input style={readonlyStyle} value={form.towContratto || ""} readOnly />
                </div>
              </div>

              {/* Riferimento BASE */}
              <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "10px", padding: "12px 16px", marginBottom: "20px" }}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "8px" }}>Riferimento Contratto BASE</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px" }}>Valore Unitario BASE</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#1e293b" }}>{formatEuro(baseValore)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "11px", color: "#64748b", marginBottom: "2px" }}>Valore Scontato ({scontoNum}%)</div>
                    <div style={{ fontSize: "14px", fontWeight: 700, color: "#059669" }}>{formatEuro(valoreScontato)}</div>
                  </div>
                </div>
              </div>

              {/* Campi editabili figlio */}
              <div style={{ fontSize: "11px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #f0fdf4" }}>Parametri Contratto</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>% Sconto sul BASE</div>
                  <div style={{ position: "relative" }}>
                    <input style={{ ...inputBase, textAlign: "right", paddingRight: "28px" }} placeholder="0,00" value={sconto} onChange={e => setSconto(e.target.value)} onBlur={e => setSconto(formatForInput(parseNum(e.target.value.replace(",",".")), "qta"))} />
                    <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", fontSize: "13px", color: "#64748b", pointerEvents: "none" }}>%</span>
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>N° TOW</div>
                  <input style={{ ...inputBase, textAlign: "right" }} placeholder="0" value={qtaFiglio} onChange={e => setQtaFiglio(e.target.value)} onBlur={e => setQtaFiglio(formatForInput(parseNum(e.target.value), "qta"))} />
                </div>
              </div>

              {/* Totale calcolato */}
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: "13px", fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Valore Totale Calcolato</span>
                <span style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{formatEuro(valoreTotaleFiglio)}</span>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px", background: "#f8fafc" }}>
          <button onClick={onClose} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid #dadce0", background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151", fontWeight: 500 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 22px", borderRadius: "8px", border: "none", background: saving ? "#93c5fd" : (isBase ? "#1a73e8" : "#10b981"), color: "#fff", fontSize: "13px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Hook drag per finestre modali spostabili ─────────────────────────────────
function useDrag(initialPos = { x: 0, y: 0 }) {
  const [pos, setPos] = useState(initialPos);
  const dragging = useRef(false);
  const start    = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const onMouseDown = (e) => {
    if (e.target.closest("button,input,select,textarea")) return;
    dragging.current = true;
    start.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    e.preventDefault();
  };

  useEffect(() => {
    const onMove = (e) => {
      if (!dragging.current) return;
      setPos({
        x: start.current.px + e.clientX - start.current.mx,
        y: start.current.py + e.clientY - start.current.my,
      });
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, []);

  return { pos, onMouseDown };
}

// ── Modale Modifica Contratto (tutte le righe TOW di un contratto) ────────────
function EditContrattoModal({ contratto, towRows, isBase, baseRows, onClose, onSaved }) {
  const { pos, onMouseDown } = useDrag();

  // QTA corretta: valoreTotale / valoreUnitario (arrotondata)
  const calcQtaFromRow = (r) => {
    if (r.valoreUnitario > 0) return Math.round((r.valoreTotale || 0) / r.valoreUnitario);
    return r.towApprovati ?? 0;
  };

  const [righe, setRighe] = useState(() =>
    towRows.map(r => ({
      id: r.id,
      tow: r.tow || "",
      valoreUnitario: formatForInput(r.valoreUnitario ?? 0, "euro"),
      qta: formatForInput(calcQtaFromRow(r), "qta"),
      sconto: formatForInput(r.sconto ?? 0, "qta"),
      subtotale: formatForInput(r.valoreTotale ?? 0, "euro"),
      isCatalogo: !!(r.isCatalogo),
    }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState("");

  const setRiga = (idx, field, val) =>
    setRighe(prev => prev.map((r, i) => i === idx ? { ...r, [field]: val } : r));

  const getBaseValore = (tow) => {
    if (!baseRows) return 0;
    const br = baseRows.find(x => x.tow === tow);
    return br ? Number(br.valoreUnitario) || 0 : 0;
  };

  const calcolaValore = (riga) => {
    if (isBase) {
      if (riga.isCatalogo) return parseNum(riga.subtotale);
      return parseNum(riga.valoreUnitario) * parseNum(riga.qta);
    } else {
      const base = getBaseValore(riga.tow);
      const sc   = parseNum(riga.sconto);
      const scontato = base * (1 - sc / 100);
      if (riga.isCatalogo) return parseNum(riga.subtotale);
      return scontato * parseNum(riga.qta);
    }
  };

  const totalContratto = righe.reduce((s, r) => s + calcolaValore(r), 0);

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const results = await Promise.all(righe.map((r, idx) => {
        const orig = towRows[idx]; // riga originale dal DB per preservare i campi non editati
        let payload;
        if (isBase) {
          const vt = calcolaValore(r);
          const qtaNum = r.isCatalogo
            ? (parseNum(r.valoreUnitario) > 0 ? vt / parseNum(r.valoreUnitario) : 0)
            : parseNum(r.qta);
          payload = {
            tow: r.tow,
            towContratto: contratto,
            valoreUnitario:     parseNum(r.valoreUnitario),
            valoreTotale:       vt,
            towApprovati:       qtaNum,
            isCatalogo:         r.isCatalogo,
            // Preserva campi contabili non editabili
            approvato:          orig.approvato ?? 0,
            ordinatiRda:        orig.ordinatiRda ?? 0,
            impegnato:          orig.impegnato ?? 0,
            residuo:            orig.residuo ?? 0,
            towImpegnati:       orig.towImpegnati ?? 0,
            towResidui:         orig.towResidui ?? 0,
            collaudoApprovato:  orig.collaudoApprovato ?? 0,
            collaudoOrdinato:   orig.collaudoOrdinato ?? 0,
            collaudoFatturato:  orig.collaudoFatturato ?? 0,
            sconto:             0,
          };
        } else {
          const base = getBaseValore(r.tow);
          const sc   = parseNum(r.sconto);
          const scontato = base * (1 - sc / 100);
          const vt = r.isCatalogo ? parseNum(r.subtotale) : scontato * parseNum(r.qta);
          const qtaCalc = r.isCatalogo ? (scontato > 0 ? vt / scontato : 0) : parseNum(r.qta);
          payload = {
            tow: r.tow,
            towContratto: contratto,
            sconto:             sc,
            valoreUnitario:     scontato,
            valoreTotale:       vt,
            towApprovati:       qtaCalc,
            isCatalogo:         r.isCatalogo,
            // Preserva campi contabili non editabili
            approvato:          orig.approvato ?? 0,
            ordinatiRda:        orig.ordinatiRda ?? 0,
            impegnato:          orig.impegnato ?? 0,
            residuo:            orig.residuo ?? 0,
            towImpegnati:       orig.towImpegnati ?? 0,
            towResidui:         orig.towResidui ?? 0,
            collaudoApprovato:  orig.collaudoApprovato ?? 0,
            collaudoOrdinato:   orig.collaudoOrdinato ?? 0,
            collaudoFatturato:  orig.collaudoFatturato ?? 0,
          };
        }
        return updateConsumoTow(r.id, payload);
      }));
      onSaved(results);
      onClose();
    } catch (e) { setError(e.message || "Errore durante il salvataggio"); }
    finally { setSaving(false); }
  };

  const inp = { padding: "6px 9px", borderRadius: "6px", border: "1px solid #dadce0", fontSize: "12px", boxSizing: "border-box", outline: "none" };

  // Larghezze colonne fisse per allineamento preciso
  const colW = isBase
    ? ["160px", "140px", "100px", "100px", "120px", "130px"]   // Nome, Val.Unit., Catalogo, N°TOW/€Cat, VT
    : ["130px", "120px", "90px",  "120px", "80px",  "130px", "130px"]; // Nome, BASE, Sconto, Scontato, Catalogo, N°TOW/€Cat, VT

  const thStyle = (align = "right", w) => ({
    padding: "8px 10px", textAlign: align, fontSize: "11px", fontWeight: 700,
    color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0",
    background: "#f8fafc", whiteSpace: "nowrap",
    ...(w ? { width: w, minWidth: w } : {}),
  });

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.45)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 16px", overflow: "auto" }}>
      <div
        style={{
          background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)",
          width: "100%", maxWidth: isBase ? "820px" : "950px",
          display: "flex", flexDirection: "column", overflow: "hidden",
          position: "relative",
          transform: `translate(${pos.x}px, ${pos.y}px)`,
          userSelect: "auto",
        }}
      >
        {/* Header — draggable */}
        <div
          onMouseDown={onMouseDown}
          style={{
            padding: "18px 24px 14px", borderBottom: "1px solid #e2e8f0",
            background: isBase ? "linear-gradient(135deg,#1a73e8 0%,#1557b0 100%)" : "linear-gradient(135deg,#10b981 0%,#059669 100%)",
            display: "flex", alignItems: "flex-start", justifyContent: "space-between",
            cursor: "grab",
          }}
        >
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>
              Modifica Contratto — {contratto}
              {isBase && <span style={{ marginLeft: 8, fontSize: "11px", background: "rgba(255,255,255,0.25)", borderRadius: "5px", padding: "2px 8px" }}>BASE</span>}
            </div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "3px" }}>
              {isBase ? "Trascina per spostare • Modifica Nome TOW, Valore Unitario, Quantità e Catalogo" : "Trascina per spostare • Modifica % Sconto, N° TOW e Catalogo"}
            </div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", color: "#fff", width: "30px", height: "30px", borderRadius: "50%", fontSize: "16px", lineHeight: "30px", textAlign: "center", flexShrink: 0 }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", overflowX: "auto", padding: "20px 24px", flex: 1, maxHeight: "65vh" }}>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", fontSize: "13px" }}>{error}</div>}

          <table style={{ borderCollapse: "collapse", tableLayout: "fixed", width: "100%" }}>
            <colgroup>
              {(isBase ? colW : colW).map((w, i) => <col key={i} style={{ width: w }} />)}
            </colgroup>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={thStyle("left")}>Nome TOW</th>
                {!isBase && <th style={thStyle("right")}>Val. BASE €</th>}
                {isBase  && <th style={thStyle("right")}>Valore Unit. €</th>}
                {!isBase && <th style={thStyle("right", "90px")}>% Sconto</th>}
                {!isBase && <th style={{ ...thStyle("right"), color: "#059669" }}>Val. Scontato €</th>}
                <th style={thStyle("center")}>Catalogo</th>
                <th style={thStyle("right")}>{isBase ? "N° TOW / € Catalogo" : "N° TOW / € Catalogo"}</th>
                <th style={thStyle("right")}>Valore Totale</th>
              </tr>
            </thead>
            <tbody>
              {righe.map((r, idx) => {
                const baseVal   = isBase ? 0 : getBaseValore(r.tow);
                const scontoNum = parseNum(r.sconto);
                const scontato  = isBase ? parseNum(r.valoreUnitario) : baseVal * (1 - scontoNum / 100);
                const vt        = calcolaValore(r);
                return (
                  <tr key={r.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    {/* Nome TOW */}
                    <td style={{ padding: "6px 10px", overflow: "hidden" }}>
                      {isBase
                        ? <input style={{ ...inp, width: "100%", fontWeight: 700 }} value={r.tow} onChange={e => setRiga(idx, "tow", e.target.value)} />
                        : <span style={{ background: "#f1f5f9", borderRadius: "5px", padding: "2px 8px", fontSize: "12px", fontWeight: 700, display: "inline-block" }}>{r.tow}</span>
                      }
                    </td>
                    {/* Val BASE (figlio) */}
                    {!isBase && <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px", color: "#94a3b8" }}>{formatEuro(baseVal)}</td>}
                    {/* Valore unitario (BASE) */}
                    {isBase && (
                      <td style={{ padding: "6px 10px" }}>
                        <input style={{ ...inp, textAlign: "right", width: "100%" }} value={r.valoreUnitario}
                          onChange={e => setRiga(idx, "valoreUnitario", e.target.value)}
                          onBlur={e => setRiga(idx, "valoreUnitario", formatForInput(parseNum(e.target.value), "euro"))} />
                      </td>
                    )}
                    {/* % Sconto (figlio) */}
                    {!isBase && (
                      <td style={{ padding: "6px 10px" }}>
                        <div style={{ position: "relative" }}>
                          <input style={{ ...inp, textAlign: "right", width: "100%", paddingRight: "20px" }} value={r.sconto}
                            onChange={e => setRiga(idx, "sconto", e.target.value)}
                            onBlur={e => setRiga(idx, "sconto", formatForInput(parseNum(e.target.value.replace(",",".")), "qta"))} />
                          <span style={{ position: "absolute", right: "6px", top: "50%", transform: "translateY(-50%)", fontSize: "11px", color: "#64748b", pointerEvents: "none" }}>%</span>
                        </div>
                      </td>
                    )}
                    {/* Val Scontato (figlio) */}
                    {!isBase && <td style={{ padding: "6px 10px", textAlign: "right", fontSize: "12px", fontWeight: 600, color: "#059669" }}>{formatEuro(scontato)}</td>}
                    {/* Flag Catalogo */}
                    <td style={{ padding: "6px 10px", textAlign: "center" }}>
                      <input type="checkbox" checked={r.isCatalogo} onChange={e => setRiga(idx, "isCatalogo", e.target.checked)}
                        style={{ width: "16px", height: "16px", cursor: "pointer", accentColor: "#10b981" }} />
                    </td>
                    {/* N° TOW o € Catalogo */}
                    <td style={{ padding: "6px 10px" }}>
                      {r.isCatalogo ? (
                        <input style={{ ...inp, textAlign: "right", width: "100%" }} value={r.subtotale} placeholder="€ Catalogo"
                          onChange={e => setRiga(idx, "subtotale", e.target.value)}
                          onBlur={e => setRiga(idx, "subtotale", formatForInput(parseNum(e.target.value), "euro"))} />
                      ) : (
                        <input style={{ ...inp, textAlign: "right", width: "100%" }} value={r.qta} placeholder="N° TOW"
                          onChange={e => setRiga(idx, "qta", e.target.value)}
                          onBlur={e => setRiga(idx, "qta", formatForInput(parseNum(e.target.value), "qta"))} />
                      )}
                    </td>
                    {/* Valore Totale calcolato */}
                    <td style={{ padding: "6px 10px", textAlign: "right", fontWeight: 600, fontSize: "13px", color: vt > 0 ? "#059669" : "#94a3b8" }}>{formatEuro(vt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Totale complessivo contratto */}
          <div style={{ marginTop: "16px", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Valore Totale Contratto</span>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{formatEuro(totalContratto)}</span>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px", background: "#f8fafc" }}>
          <button onClick={onClose} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid #dadce0", background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151", fontWeight: 500 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 22px", borderRadius: "8px", border: "none", background: saving ? "#93c5fd" : (isBase ? "#1a73e8" : "#10b981"), color: "#fff", fontSize: "13px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}
export default function ConsumoTowAdminPage({ onUnauthorized, ambienteId }) {
  const [rows, setRows] = useState([]);
  const [mevRows, setMevRows] = useState([]);
  const [ordiniRows, setOrdiniRows] = useState([]);
  const [rtiRighe, setRtiRighe] = useState([]);
  const [rtiLoading, setRtiLoading] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contratti, setContratti] = useState([]);
  const [selectedContratto, setSelectedContratto] = useState("");
  const [expandedContratto, setExpandedContratto] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editContratto, setEditContratto] = useState(null);
  const [showNewContratto, setShowNewContratto] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [showCollaudo, setShowCollaudo] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const [contrattiBudget, setContrattiBudget] = useState([]); // eslint-disable-line
  const [righe] = useState([]); // eslint-disable-line
  const [towImpatto, setTowImpatto] = useState(loadTowImpatto);
  const dragItem = useRef(null);
  const scrollRef = useRef(null);    // scroll orizzontale condiviso tra tabella CONTRATTO e RTI
  const rtiScrollRef = useRef(null); // scroll orizzontale della tabella RTI

  // Il contratto BASE è il primo della lista (indice 0 nell'ordine salvato)
  const baseContratto = contratti[0] || "";
  const baseRows = rows.filter(r => r.towContratto === baseContratto);

  // Applica l'ordine salvato in localStorage ai contratti
  const applyOrder = useCallback((tipi) => {
    try {
      const saved = localStorage.getItem(CONTRATTI_ORDER_KEY);
      if (!saved) return tipi;
      const order = JSON.parse(saved);
      const sorted = order.filter(c => tipi.includes(c));
      const newOnes = tipi.filter(c => !sorted.includes(c));
      return [...sorted, ...newOnes];
    } catch { return tipi; }
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [data, mev, impattoDb, ordini] = await Promise.all([
        getConsumoTow(),
        getMevList().catch(() => []),
        getTowImpatto().catch(() => null),
        getOrdiniConsegna().catch(() => []),
      ]);
      setRows(data);
      setMevRows(mev);
      setOrdiniRows(ordini);
      // Carica % impatto dal DB (fonte primaria); se DB vuoto, migra da localStorage one-shot
      if (impattoDb && Object.keys(impattoDb).length > 0) {
        localStorage.setItem(TOW_IMPATTO_KEY, JSON.stringify(impattoDb));
        setTowImpatto(impattoDb);
      } else {
        // DB vuoto: controlla se localStorage ha dati e migra sul DB
        const lsImpatto = loadTowImpatto();
        if (lsImpatto && Object.keys(lsImpatto).length > 0) {
          setTowImpatto(lsImpatto);
          // Salva sul DB (migrazione one-shot, fire-and-forget)
          saveTowImpattoToDb(lsImpatto).catch(() => {});
        }
      }
      const tipi = [...new Set(data.map(r => r.towContratto).filter(Boolean))];
      const ordered = applyOrder(tipi);
      setContratti(ordered);
      setSelectedContratto(ordered[0] || "");
      setExpandedContratto(ordered[0] || null);
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
      else setError("Errore nel caricamento dei dati");
    } finally { setLoading(false); }
  }, [applyOrder]); // eslint-disable-line

  // Carica le righe RTI separatamente (si usa anche dopo ogni modifica)
  const loadRti = useCallback(async () => {
    setRtiLoading(true);
    try {
      const dbRighe = await getRtiSocieta();
      if (dbRighe.length === 0) {
        // Migrazione one-shot da localStorage
        try {
          const ls = JSON.parse(localStorage.getItem(RTI_KEY) || "[]");
          if (ls.length > 0) {
            const dtos = ls.map(r => ({
              contratto: r.contratto || "",
              ruolo: r.ruolo || "",
              societa: r.societa || "",
              dataInizio: r.dataInizio || null,
              dataApprovazione: r.dataApprovazione || null,
              percentuale: r.percentuale != null ? Number(r.percentuale) : null,
              importo: r.importo != null ? Number(r.importo) : null,
              consumato: r.consumato != null ? Number(r.consumato) : null,
            }));
            const imported = await bulkImportRtiSocieta(dtos).catch(() => null);
            if (imported) {
              setRtiRighe(imported);
              localStorage.removeItem(RTI_KEY);
              return;
            }
          }
        } catch {}
      }
      setRtiRighe(dbRighe);
    } catch {
      // Fallback localStorage
      try { setRtiRighe(JSON.parse(localStorage.getItem(RTI_KEY) || "[]").map((r,i) => ({...r, id: r._id || i+1}))); } catch {}
    } finally { setRtiLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load, ambienteId]); // eslint-disable-line
  useEffect(() => { loadRti(); }, [loadRti, ambienteId]); // eslint-disable-line

  const filteredRows = selectedContratto ? rows.filter(r => r.towContratto === selectedContratto) : [];

  const handleSaved = (updated) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSuccessMsg("Riga aggiornata con successo");
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  const handleContrattoSaved = (updatedRows) => {
    setRows(prev => {
      const map = Object.fromEntries(updatedRows.map(r => [r.id, r]));
      return prev.map(r => map[r.id] ?? r);
    });
    setSuccessMsg("Contratto aggiornato con successo");
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  const handleCreated = (newRows) => {
    setRows(prev => [...prev, ...newRows]);
    const contratto = newRows[0]?.towContratto;
    if (contratto) {
      setContratti(prev => {
        const next = prev.includes(contratto) ? prev : [...prev, contratto];
        localStorage.setItem(CONTRATTI_ORDER_KEY, JSON.stringify(next));
        return next;
      });
      setSelectedContratto(contratto);
    }
    setSuccessMsg(`Contratto "${contratto}" creato con ${newRows.length} TOW`);
    setTimeout(() => setSuccessMsg(""), 4000);
  };

  const handleDelete = async (nome) => {
    if (!window.confirm(`Eliminare definitivamente il contratto "${nome}" e tutti i suoi TOW?`)) return;
    try {
      await deleteConsumoTowContratto(nome);
      setRows(prev => prev.filter(r => r.towContratto !== nome));
      setContratti(prev => {
        const next = prev.filter(c => c !== nome);
        localStorage.setItem(CONTRATTI_ORDER_KEY, JSON.stringify(next));
        return next;
      });
      setSelectedContratto(prev => {
        const remaining = contratti.filter(c => c !== nome);
        return remaining[0] || "";
      });
      setSuccessMsg(`Contratto "${nome}" eliminato.`);
      setTimeout(() => setSuccessMsg(""), 3500);
    } catch (e) {
      setError(e.message || "Errore durante l'eliminazione");
    }
  };

  // ── Reset MEV + ConsumoTow ──────────────────────────────────────────────────
  const [resetting, setResetting] = useState(false);
  const handleResetAll = async () => {
    if (!window.confirm(
      "ATTENZIONE: questa operazione eliminerà TUTTE le righe MEV e TUTTI i dati ConsumoTow (contratti + TOW) per questo ambiente.\n\nI dati RTI & SUBCO, Ordini di Consegna e Verbali NON verranno toccati.\n\nL'operazione è IRREVERSIBILE. Continuare?"
    )) return;
    setResetting(true);
    setError("");
    try {
      const res = await resetMevAndConsumoTow();
      setRows([]);
      setContratti([]);
      setMevRows([]);
      setSelectedContratto("");
      localStorage.removeItem(CONTRATTI_ORDER_KEY);
      setSuccessMsg(`Reset completato — ${res.mevDeleted} righe MEV e ${res.towDeleted} righe ConsumoTow eliminate.`);
      setTimeout(() => setSuccessMsg(""), 6000);
    } catch (e) {
      setError(e.message || "Errore durante il reset");
    } finally {
      setResetting(false);
    }
  };

  // ── Drag & drop handlers ────────────────────────────────────────────────────
  const handleDragStart = (e, c) => {
    dragItem.current = c;
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", c);
  };
  const handleDragOver  = (e, c) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOver !== c) setDragOver(c);
  };
  const handleDragEnd   = () => { dragItem.current = null; setDragOver(null); };
  const handleDrop      = (e, c) => {
    e.preventDefault();
    const from = dragItem.current || e.dataTransfer.getData("text/plain");
    if (!from || from === c) { setDragOver(null); return; }
    setContratti(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx   = next.indexOf(c);
      if (fromIdx === -1 || toIdx === -1) return prev;
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      localStorage.setItem(CONTRATTI_ORDER_KEY, JSON.stringify(next));
      return next;
    });
    dragItem.current = null;
    setDragOver(null);
  };

  // ── Larghezze colonne calcolate qui così RigheSection può allinearsi ──
  const _visFields      = FIELDS.filter(f => showCollaudo || !f.key.startsWith("collaudo"));
  const _hasImpatto     = Object.keys(towImpatto).length > 0;
  const _visFields_A    = _visFields.filter(f => f.key === "valoreUnitario");
  const _visFields_B    = _visFields.filter(f => f.key !== "valoreUnitario");
  const _contractCols   = [32, 180, 100, 65,
    ..._visFields_A.map(() => 125),
    ...(_hasImpatto ? [90] : []),
    ..._visFields_B.map(f => f.group === "euro" ? 125 : 85),
  ];
  const _contractTotalW = _contractCols.reduce((s, w) => s + w, 0);

  return (
    <div style={{ padding: "28px 24px", minHeight: "100vh", background: "#f1f5f9" }}>

      {/* ── Titolo ── */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Gestione Contratto</div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>Monitoraggio</h2>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#64748b" }}>Clicca su un contratto per visualizzare il dettaglio dei TOW</p>
        </div>
        <button
          onClick={handleResetAll}
          disabled={resetting}
          title="Reset MEV + ConsumoTow — elimina MEV e dati contratto per questo ambiente"
          style={{
            marginTop: "4px", flexShrink: 0,
            width: "34px", height: "34px", borderRadius: "8px",
            border: "1.5px solid #fecaca",
            background: resetting ? "#fef2f2" : "#fff",
            color: resetting ? "#fca5a5" : "#dc2626",
            fontSize: "16px", cursor: resetting ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.15s, border-color 0.15s",
          }}
          onMouseEnter={e => { if (!resetting) { e.currentTarget.style.background = "#fef2f2"; e.currentTarget.style.borderColor = "#dc2626"; } }}
          onMouseLeave={e => { if (!resetting) { e.currentTarget.style.background = "#fff"; e.currentTarget.style.borderColor = "#fecaca"; } }}
        >
          {resetting ? "⏳" : "🗑"}
        </button>
      </div>

      {/* Messaggi */}
      {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "10px", padding: "12px 16px", marginBottom: "18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>⚠ {error}</div>}
      {successMsg && <div style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 16px", marginBottom: "18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>✓ {successMsg}</div>}

      {/* Selezione contratto */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "14px" }}>Contratti</div>
        {loading ? (
          <div style={{ color: "#94a3b8", fontSize: "13px" }}>Caricamento...</div>
        ) : (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", alignItems: "flex-start" }}>
            {contratti.map((c, cIdx) => {
              const isBaseCard = cIdx === 0;
              // Mostra badge BASE solo se il nome del contratto non è già "BASE"
              const showBaseBadge = isBaseCard && c.toUpperCase() !== "BASE";
              const tot = rows.filter(r => r.towContratto === c).reduce((s, r) => s + (Number(r.valoreTotale) || 0), 0);
              const active = selectedContratto === c;
              const isDragOver = dragOver === c;
              return (
                <div
                  key={c}
                  draggable
                  onDragStart={e => handleDragStart(e, c)}
                  onDragOver={e => handleDragOver(e, c)}
                  onDrop={e => handleDrop(e, c)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: "flex", flexDirection: "column",
                    borderRadius: "14px", overflow: "hidden",
                    border: isDragOver ? "2px dashed #1a73e8" : active ? "2px solid #1a73e8" : "2px solid #e2e8f0",
                    boxShadow: isDragOver ? "0 0 0 3px rgba(26,115,232,0.18)" : active ? "0 6px 20px rgba(26,115,232,0.22)" : "0 1px 4px rgba(0,0,0,0.06)",
                    background: isDragOver ? "#eff6ff" : active ? "linear-gradient(145deg,#1a73e8 0%,#1557b0 100%)" : "#fff",
                    transition: "border 0.15s, box-shadow 0.15s, background 0.15s",
                    minWidth: "150px",
                    cursor: "grab",
                  }}
                >
                   <div
                    onClick={() => {
                      setSelectedContratto(c);
                      setExpandedContratto(prev => prev === c ? null : c);
                    }}
                    style={{ padding: "14px 18px 10px", flex: 1, userSelect: "none" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
                        <circle cx="3" cy="2" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="7" cy="2" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="3" cy="7" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="7" cy="7" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="3" cy="12" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="7" cy="12" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                      </svg>
                      <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.2px", color: active && !isDragOver ? "#fff" : "#0f172a" }}>{c}</div>
                      {showBaseBadge && (
                        <span style={{
                          fontSize: "10px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px",
                          background: active && !isDragOver ? "rgba(255,255,255,0.25)" : "#dbeafe",
                          color: active && !isDragOver ? "#fff" : "#1d4ed8",
                          borderRadius: "5px", padding: "2px 7px",
                        }}>BASE</span>
                      )}
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: active && !isDragOver ? "rgba(255,255,255,0.75)" : "#64748b", paddingLeft: "16px" }}>{formatEuro(tot)}</div>
                  </div>
                  <div style={{
                    borderTop: active && !isDragOver ? "1px solid rgba(255,255,255,0.2)" : "1px solid #f1f5f9",
                    padding: "6px 10px", display: "flex", justifyContent: "flex-end", gap: "6px",
                  }}>
                    <button
                      onClick={e => { e.stopPropagation(); setEditContratto(c); }}
                      title={`Modifica contratto ${c}`}
                      style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 600, background: active && !isDragOver ? "rgba(255,255,255,0.15)" : "#eff6ff", color: active && !isDragOver ? "rgba(255,255,255,0.8)" : "#1a73e8", transition: "background 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = active && !isDragOver ? "rgba(255,255,255,0.3)" : "#dbeafe"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = active && !isDragOver ? "rgba(255,255,255,0.15)" : "#eff6ff"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                      </svg>
                      Modifica
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(c); }}
                      title={`Elimina contratto ${c}`}
                      style={{ display: "flex", alignItems: "center", gap: "4px", padding: "3px 10px", borderRadius: "6px", border: "none", cursor: "pointer", fontSize: "11px", fontWeight: 600, background: active && !isDragOver ? "rgba(255,255,255,0.15)" : "#f1f5f9", color: active && !isDragOver ? "rgba(255,255,255,0.8)" : "#64748b", transition: "background 0.15s" }}
                      onMouseEnter={e => { e.currentTarget.style.background = active && !isDragOver ? "rgba(239,68,68,0.35)" : "#fee2e2"; e.currentTarget.style.color = active && !isDragOver ? "#fff" : "#dc2626"; }}
                      onMouseLeave={e => { e.currentTarget.style.background = active && !isDragOver ? "rgba(255,255,255,0.15)" : "#f1f5f9"; e.currentTarget.style.color = active && !isDragOver ? "rgba(255,255,255,0.8)" : "#64748b"; }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>
                      </svg>
                      Elimina
                    </button>
                  </div>
                </div>
              );
            })}

            {/* ── Card "+ Nuovo Contratto" ── */}
            {contratti.length === 0 ? (
              <div
                onClick={() => setShowNewContratto("base")}
                style={{ display: "flex", flexDirection: "column", minWidth: "150px", borderRadius: "14px", border: "2px dashed #93c5fd", background: "#f0f9ff", cursor: "pointer", overflow: "hidden", transition: "border 0.15s, background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#dbeafe"; e.currentTarget.style.borderColor = "#1a73e8"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f0f9ff"; e.currentTarget.style.borderColor = "#93c5fd"; }}
              >
                <div style={{ flex: 1, padding: "14px 18px 10px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px" }}>
                  <div style={{ fontSize: "22px", color: "#1a73e8", lineHeight: 1, fontWeight: 300 }}>+</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a73e8" }}>Nuovo BASE</div>
                  <div style={{ fontSize: "11px", color: "#93c5fd" }}>Primo contratto</div>
                </div>
                <div style={{ borderTop: "1px solid #bfdbfe", padding: "6px 10px", display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#1a73e8" }}>Crea →</span>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setShowNewContratto("figlio")}
                style={{ display: "flex", flexDirection: "column", minWidth: "150px", borderRadius: "14px", border: "2px dashed #6ee7b7", background: "#f0fdf4", cursor: "pointer", overflow: "hidden", transition: "border 0.15s, background 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background = "#d1fae5"; e.currentTarget.style.borderColor = "#10b981"; }}
                onMouseLeave={e => { e.currentTarget.style.background = "#f0fdf4"; e.currentTarget.style.borderColor = "#6ee7b7"; }}
              >
                <div style={{ flex: 1, padding: "14px 18px 10px", display: "flex", flexDirection: "column", justifyContent: "center", gap: "4px" }}>
                  <div style={{ fontSize: "22px", color: "#10b981", lineHeight: 1, fontWeight: 300 }}>+</div>
                  <div style={{ fontSize: "13px", fontWeight: 700, color: "#10b981" }}>Nuovo Contratto</div>
                  <div style={{ fontSize: "11px", color: "#6ee7b7" }}>Basato su BASE</div>
                </div>
                <div style={{ borderTop: "1px solid #a7f3d0", padding: "6px 10px", display: "flex", justifyContent: "flex-end" }}>
                  <span style={{ fontSize: "11px", fontWeight: 600, color: "#10b981" }}>Crea →</span>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Tabella collassabile per contratto ── */}
      {!loading && contratti.length > 0 && (() => {
        // Le stesse colonne "aggregate" che compaiono nella riga riassuntiva per contratto
        // e che devono coincidere con quelle della tabella TOW espansa.
        // Le colonne visibili nella tabella interna sono:
        //   TOW (100px) | QTA (65px) | [FIELDS filtrati per showCollaudo]
        // Per allineare i totali di riga alle colonne interne usiamo una <table>
        // con le stesse <col> widths.
        const visibleFields = FIELDS.filter(f => showCollaudo || !f.key.startsWith("collaudo"));
        const isBaseExpanded = expandedContratto === contratti[0];
        const baseContratto0 = contratti[0] || "";
        // Mostra colonna % Impatto sempre se ci sono impatti configurati (allineamento garantito)
        const hasImpatto = Object.keys(towImpatto).length > 0;

        const handleImpattoChange = (contratto, tow, val) => {
          const prev = typeof Object.values(towImpatto)[0] === "number"
            ? { [contratti[0] || "BASE"]: { ...towImpatto } } // migra da flat a per-contratto
            : { ...towImpatto };
          const percContr = { ...(prev[contratto] || {}) };
          if (val === "") delete percContr[tow]; else percContr[tow] = parseNum(val);
          const next = { ...prev, [contratto]: percContr };
          saveTowImpatto(next);
          setTowImpatto(next);
        };

        // Helper: legge la % impatto per un dato contratto e TOW
        const getImpatto = (contratto, tow) => {
          // retrocompatibilità: struttura flat
          if (typeof Object.values(towImpatto)[0] === "number") return towImpatto[tow];
          return towImpatto[contratto]?.[tow];
        };

        return (
          <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "24px" }}>
            <div
              ref={scrollRef}
              onScroll={e => { if (rtiScrollRef.current) rtiScrollRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
              style={{ overflowX: "auto" }}
            >
              <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
                 {/* Colgroup: usa CW (condiviso con tabella RTI) per allineamento garantito */}
                 {(() => {
                   const fieldsA = visibleFields.filter(f => f.key === "valoreUnitario");
                   const fieldsB = visibleFields.filter(f => f.key !== "valoreUnitario");
                    return (
                      <colgroup>
                        <col style={{ width: `${CW.arrow}px` }} />
                        <col style={{ width: `${CW.contratto}px` }} />
                        <col style={{ width: `${CW.tow}px` }} />
                        <col style={{ width: `${CW.qta}px` }} />
                        {fieldsA.map(f => <col key={f.key} style={{ width: `${CW[f.key] || 125}px` }} />)}
                        {hasImpatto && <col style={{ width: `${CW.impatto}px` }} />}
                        {fieldsB.map(f => <col key={f.key} style={{ width: `${CW[f.key] || (f.group === "euro" ? 125 : 85)}px` }} />)}
                      </colgroup>
                    );
                 })()}

                {/* Header */}
                {(() => {
                  const fieldsA = visibleFields.filter(f => f.key === "valoreUnitario");
                  const fieldsB = visibleFields.filter(f => f.key !== "valoreUnitario");
                   return (
                     <thead>
                       <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                         <th style={{ ...TH(), borderBottom: "2px solid #e2e8f0" }} />
                         <th style={{ ...TH("left"), borderBottom: "2px solid #e2e8f0" }}>Contratto</th>
                         <th style={{ ...TH("left"), borderBottom: "2px solid #e2e8f0", color: "#64748b" }}>Nome TOW</th>
                         <th style={{ ...TH("right"), borderBottom: "2px solid #e2e8f0", color: "#64748b" }}>QTA</th>
                         {fieldsA.map(f => <th key={f.key} style={{ ...TH("right"), color: f.color, borderBottom: "2px solid #e2e8f0" }}>{f.label}</th>)}
                         {hasImpatto && <th style={{ ...TH("right"), color: "#8b5cf6", borderBottom: "2px solid #e2e8f0" }}>% Impatto</th>}
                         {fieldsB.map(f => <th key={f.key} style={{ ...TH("right"), color: f.color, borderBottom: "2px solid #e2e8f0" }}>{f.label}</th>)}
                       </tr>
                     </thead>
                   );
                })()}

                <tbody>
                  {contratti.map((c, cIdx) => {
                    const cRows   = rows.filter(r => r.towContratto === c);
                    const isBase  = cIdx === 0;
                    const showBaseBadge = isBase && c.toUpperCase() !== "BASE";
                    const expanded = expandedContratto === c;

                    return (
                      <React.Fragment key={c}>
                        {/* ── Riga riassuntiva contratto (cliccabile) ── */}
                        <tr
                          onClick={() => setExpandedContratto(expanded ? null : c)}
                          style={{
                            background: expanded ? "#eff6ff" : "#fff",
                            cursor: "pointer", transition: "background 0.15s",
                            borderBottom: expanded ? "none" : "1px solid #f1f5f9",
                          }}
                          onMouseEnter={e => { if (!expanded) e.currentTarget.style.background = "#f8fafc"; }}
                          onMouseLeave={e => { if (!expanded) e.currentTarget.style.background = expanded ? "#eff6ff" : "#fff"; }}
                        >
                          {/* Freccia */}
                          <td style={{ ...TD(), textAlign: "center", color: "#94a3b8", fontSize: "10px" }}>
                            <span style={{ display: "inline-block", transition: "transform 0.2s", transform: expanded ? "rotate(90deg)" : "rotate(0deg)" }}>▶</span>
                          </td>
                          {/* Nome contratto */}
                          <td style={{ ...TD("left"), padding: "12px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <span style={{ fontSize: "14px", fontWeight: 800, color: expanded ? "#1a73e8" : "#0f172a" }}>{c}</span>
                              {showBaseBadge && <span style={{ fontSize: "10px", fontWeight: 700, background: "#dbeafe", color: "#1d4ed8", borderRadius: "5px", padding: "1px 7px", textTransform: "uppercase", letterSpacing: "0.4px" }}>BASE</span>}
                              <span style={{ fontSize: "11px", color: "#94a3b8" }}>{cRows.length} TOW</span>
                            </div>
                          </td>
                          {/* Celle vuote per TOW e QTA — allineano con le colonne interne */}
                          <td />
                          <td />
                          {/* Totali per ogni field — rispettando l'ordine con % Impatto dopo valoreTotale */}
                          {visibleFields.filter(f => f.key === "valoreUnitario").map(f => {
                            const tot = cRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                            return (
                              <td key={f.key} style={{ ...TD("right"), fontWeight: TOTALE_KEYS.has(f.key) ? (f.key === "valoreTotale" ? 800 : 600) : 400, color: TOTALE_KEYS.has(f.key) ? f.color : "#94a3b8" }}>
                                {TOTALE_KEYS.has(f.key) ? formatEuro(tot) : ""}
                              </td>
                            );
                          })}
                          {hasImpatto && <td />}
                          {visibleFields.filter(f => f.key !== "valoreUnitario").map(f => {
                            const tot = cRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                            return (
                              <td key={f.key} style={{ ...TD("right"), fontWeight: TOTALE_KEYS.has(f.key) ? 600 : 400, color: TOTALE_KEYS.has(f.key) ? f.color : "#94a3b8" }}>
                                {TOTALE_KEYS.has(f.key) ? formatEuro(tot) : ""}
                              </td>
                            );
                          })}
                        </tr>

                        {/* ── Dettaglio TOW (espanso) — colonne identiche, nessun offset ── */}
                        {expanded && (
                          <tr>
                            <td colSpan={4 + visibleFields.length + (hasImpatto ? 1 : 0)} style={{ padding: 0, borderBottom: "1px solid #f1f5f9" }}>
                              <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                                 <table style={{ width: "max-content", minWidth: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
                                   <colgroup>
                                     <col style={{ width: "32px" }} />
                                     <col style={{ width: "180px" }} />
                                     <col style={{ width: "100px" }} />
                                     <col style={{ width: "65px" }} />
                                     {visibleFields.filter(f => f.key === "valoreUnitario").map(f => (
                                       <col key={f.key} style={{ width: "125px" }} />
                                     ))}
                                     {hasImpatto && <col style={{ width: "90px" }} />}
                                     {visibleFields.filter(f => f.key !== "valoreUnitario").map(f => (
                                       <col key={f.key} style={{ width: f.group === "euro" ? "125px" : "85px" }} />
                                     ))}
                                   </colgroup>
                                  <tbody>
                                    {cRows.map((row, idx) => (
                                      <tr key={row.id}
                                        style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc", transition: "background 0.1s" }}
                                        onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                                        onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#f8fafc"}
                                      >
                                        {/* cella freccia vuota per allineamento */}
                                        <td />
                                        {/* Contratto — vuoto nelle righe espanse */}
                                        <td />
                                        {/* Nome TOW — allineato all'intestazione */}
                                        <td style={{ ...TD("left"), fontWeight: 700 }}>
                                          <span style={{ display: "inline-block", background: "#f1f5f9", borderRadius: "5px", padding: "2px 7px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>{row.tow}</span>
                                        </td>
                                        {/* QTA */}
                                        <td style={{ ...TD("right"), color: "#64748b" }}>
                                          {row.valoreUnitario > 0 ? formatQta(Math.round(row.valoreTotale / row.valoreUnitario)) : "—"}
                                        </td>
                                        {visibleFields.filter(f => f.key === "valoreUnitario").map(f => (
                                          <td key={f.key} style={{ ...TD("right"), color: f.color, fontWeight: TOTALE_KEYS.has(f.key) ? 600 : 400 }}>
                                            {f.group === "euro" ? formatEuro(row[f.key]) : formatQta(row[f.key])}
                                          </td>
                                        ))}
                                        {hasImpatto && (
                                          <td style={{ ...TD("right"), padding: "6px 8px" }}>
                                            <div style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                                              <input
                                                type="number"
                                                min="0"
                                                max="100"
                                                step="0.1"
                                                value={getImpatto(c, row.tow) !== undefined ? getImpatto(c, row.tow) : ""}
                                                onChange={e => handleImpattoChange(c, row.tow, e.target.value)}
                                                placeholder="0"
                                                style={{
                                                  width: "60px", padding: "3px 20px 3px 6px",
                                                  border: "1px solid #ddd8fe", borderRadius: "6px",
                                                  fontSize: "12px", textAlign: "right", outline: "none",
                                                  background: getImpatto(c, row.tow) ? "#f5f3ff" : "#fff",
                                                  color: "#7c3aed", fontWeight: getImpatto(c, row.tow) ? 700 : 400,
                                                }}
                                              />
                                              <span style={{ position: "absolute", right: "6px", fontSize: "11px", color: "#8b5cf6", pointerEvents: "none" }}>%</span>
                                            </div>
                                          </td>
                                        )}
                                        {visibleFields.filter(f => f.key !== "valoreUnitario").map(f => (
                                          <td key={f.key} style={{ ...TD("right"), color: f.color, fontWeight: TOTALE_KEYS.has(f.key) ? 600 : 400 }}>
                                            {f.group === "euro" ? formatEuro(row[f.key]) : formatQta(row[f.key])}
                                          </td>
                                        ))}
                                      </tr>
                                    ))}
                                  </tbody>
                                  {/* Riga totale interna */}
                                     <tfoot>
                                      <tr style={{ background: "#e2e8f0", borderTop: "2px solid #cbd5e1" }}>
                                        <td />
                                        <td />
                                        <td style={{ ...TD("left"), fontWeight: 700, fontSize: "11px", textTransform: "uppercase", color: "#1e293b" }}>Totale</td>
                                        <td />
                                       {visibleFields.filter(f => f.key === "valoreUnitario").map(f => {
                                         if (!TOTALE_KEYS.has(f.key)) return <td key={f.key} style={TD("right")} />;
                                         const tot = cRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                                         return <td key={f.key} style={{ ...TD("right"), fontWeight: 800, color: f.color, fontSize: "13px" }}>{f.group === "euro" ? formatEuro(tot) : formatQta(tot)}</td>;
                                       })}
                                        {hasImpatto && (
                                          <td style={{ ...TD("right"), fontWeight: 700, color: "#7c3aed", fontSize: "12px" }}>
                                            {(() => {
                                              const tot = cRows.reduce((s, r) => s + (Number(getImpatto(c, r.tow)) || 0), 0);
                                              return tot > 0 ? (
                                                <span style={{ background: tot === 100 ? "#f0fdf4" : tot > 100 ? "#fef2f2" : "#f5f3ff", color: tot === 100 ? "#16a34a" : tot > 100 ? "#dc2626" : "#7c3aed", border: `1px solid ${tot === 100 ? "#bbf7d0" : tot > 100 ? "#fecaca" : "#ddd8fe"}`, borderRadius: "5px", padding: "1px 6px", fontSize: "11px" }}>
                                                  {tot.toLocaleString("it-IT", { maximumFractionDigits: 1 })}%
                                                </span>
                                              ) : "—";
                                            })()}
                                          </td>
                                        )}
                                       {visibleFields.filter(f => f.key !== "valoreUnitario").map(f => {
                                         if (!TOTALE_KEYS.has(f.key)) return <td key={f.key} style={TD("right")} />;
                                         const tot = cRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                                         return <td key={f.key} style={{ ...TD("right"), fontWeight: 800, color: f.color, fontSize: "13px" }}>{f.group === "euro" ? formatEuro(tot) : formatQta(tot)}</td>;
                                       })}                                    </tr>
                                   </tfoot>
                                </table>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>

                {/* ── Riga TOTALE CONTRATTI ── */}
                <tfoot>
                  {(() => {
                    const allRows = rows.filter(r => contratti.includes(r.towContratto));
                    const fieldsA = visibleFields.filter(f => f.key === "valoreUnitario");
                    const fieldsB = visibleFields.filter(f => f.key !== "valoreUnitario");
                    const tdTot = (f) => {
                      const tot = allRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                      return (
                        <td key={f.key} style={{ padding: "14px 12px", textAlign: "right", fontSize: "14px", fontWeight: 800, color: TOTALE_KEYS.has(f.key) ? (f.key === "valoreTotale" ? "#1a3a6b" : f.color) : "transparent", filter: (TOTALE_KEYS.has(f.key) && f.key !== "valoreTotale") ? "brightness(0.85)" : "none" }}>
                          {TOTALE_KEYS.has(f.key) ? formatEuro(tot) : ""}
                        </td>
                      );
                    };
                    return (
                       <tr style={{ background: "#e8f0fe", borderTop: "2px solid #c5d8fb" }}>
                         <td />
                         <td style={{ padding: "14px 12px" }}>
                           <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                             <span style={{ fontSize: "12px", fontWeight: 800, color: "#1a3a6b", textTransform: "uppercase", letterSpacing: "0.8px" }}>Totale Contratti</span>
                             <span style={{ fontSize: "11px", color: "#5a7ab5" }}>{contratti.length} contratti · {allRows.length} TOW</span>
                           </div>
                         </td>
                         <td />
                         <td />
                         {fieldsA.map(tdTot)}
                         {hasImpatto && <td />}
                         {fieldsB.map(tdTot)}
                       </tr>
                    );
                  })()}
                 </tfoot>
              </table>
            </div>
          </div>
        );
      })()}

      {editRow && (
        <EditModal
          row={editRow}
          onClose={() => setEditRow(null)}
          onSaved={handleSaved}
          isBase={editRow.towContratto === baseContratto}
          baseRows={baseRows}
        />
      )}
      {showNewContratto === "base" && (
        <NewContrattoBaseModal
          onClose={() => setShowNewContratto(false)}
          onCreated={handleCreated}
          onImpattoSaved={next => setTowImpatto(next)}
        />
      )}
      {showNewContratto === "figlio" && (
        <NewContrattoFiglioModal onClose={() => setShowNewContratto(false)} onCreated={handleCreated} baseRows={baseRows} />
      )}
      {editContratto && (
        <EditContrattoModal
          contratto={editContratto}
          towRows={rows.filter(r => r.towContratto === editContratto)}
          isBase={editContratto === baseContratto}
          baseRows={baseRows}
          onClose={() => setEditContratto(null)}
          onSaved={handleContrattoSaved}
        />
      )}

      {/* RTI & SUBCO — in fondo, con accesso ai dati dei contratti */}
      <RigheSection
        contratti={contratti}
        rows={rows}
        mevRows={mevRows}
        ordiniRows={ordiniRows}
        righeInit={rtiRighe}
        righeLoading={rtiLoading}
        hasImpatto={_hasImpatto}
        contractTotalW={_contractTotalW}
        contractCols={_contractCols}
        contractVisFields={_visFields}
        onRigheChange={setRtiRighe}
        scrollRef={rtiScrollRef}
        onScroll={e => { if (scrollRef.current) scrollRef.current.scrollLeft = e.currentTarget.scrollLeft; }}
      />

    </div>
  );
}


// ─── Contratti (dati reali da ConsumoTow) ────────────────────────────────────
function ContrattiSection({ rows }) {
  // Raggruppa le righe ConsumoTow per towContratto e somma valoreTotale
  const contratti = React.useMemo(() => {
    const map = {};
    (rows || []).forEach(r => {
      const k = r.towContratto || "—";
      if (!map[k]) map[k] = { contratto: k, valoreTotale: 0, righe: 0 };
      map[k].valoreTotale += Number(r.valoreTotale) || 0;
      map[k].righe += 1;
    });
    return Object.values(map).sort((a, b) => a.contratto.localeCompare(b.contratto));
  }, [rows]);

  const TH2 = (align = "right") => ({
    padding: "10px 14px", textAlign: align, fontWeight: 700, fontSize: "11px",
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px",
    borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap", background: "#f8fafc",
  });
  const TD2 = (align = "right", extra = {}) => ({
    padding: "9px 14px", textAlign: align, fontSize: "13px",
    borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap", color: "#374151", ...extra,
  });

  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "24px" }}>
      <div style={{ padding: "14px 22px", background: "linear-gradient(135deg,#1a73e8 0%,#1557b0 100%)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>Contratti</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.75)", marginTop: "2px" }}>Riepilogo valori contrattuali</div>
        </div>
        <div style={{ fontSize: "12px", fontWeight: 600, color: "rgba(255,255,255,0.8)" }}>{contratti.length} contratti</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              <th style={TH2("left")}>Contratto</th>
              <th style={TH2("right")}>Valore Totale</th>
              <th style={TH2("right")}>N. TOW</th>
            </tr>
          </thead>
          <tbody>
            {contratti.length === 0 ? (
              <tr><td colSpan={3} style={{ padding: "36px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                Nessun contratto disponibile — importa i dati dal file Excel
              </td></tr>
            ) : contratti.map((r, idx) => (
              <tr key={r.contratto}
                style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}
                onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafafa"}>
                <td style={{ ...TD2("left"), fontWeight: 700, color: "#0f172a" }}>
                  <span style={{ display: "inline-block", background: "#f1f5f9", borderRadius: "6px", padding: "3px 10px", fontSize: "12px", fontWeight: 800 }}>{r.contratto}</span>
                </td>
                <td style={{ ...TD2("right"), fontWeight: 700, color: "#1a73e8", fontSize: "14px" }}>{formatEuro(r.valoreTotale)}</td>
                <td style={{ ...TD2("right"), color: "#64748b" }}>{r.righe}</td>
              </tr>
            ))}
          </tbody>
          {contratti.length > 1 && (
            <tfoot>
              <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                <td style={{ ...TD2("left"), fontWeight: 700, color: "#1e293b", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px" }}>Totale</td>
                <td style={{ ...TD2("right"), fontWeight: 800, color: "#1e293b", fontSize: "14px" }}>{formatEuro(contratti.reduce((s, r) => s + r.valoreTotale, 0))}</td>
                <td style={TD2("right")} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}


// ─── RTI & SUBCO (dati persistiti su DB backend) ─────────────────────────────
const RTI_KEY = "rtisubco-righe"; // mantenuto per migrazione one-shot da localStorage
const RUOLI_RTI = ["Mandataria", "Mandante", "SUBCO", "Altro"];

function RigheSection({ contratti = [], rows = [], mevRows = [], ordiniRows = [], righeInit = [], righeLoading = false, hasImpatto = false, contractTotalW = 0, contractCols = [], contractVisFields = [], onRigheChange, scrollRef, onScroll }) {
  // Calcola i 5 campi aggregati per contratto dai dati TOW reali
  const valoriContratto = React.useMemo(() => {
    const map = {};
    (rows || []).forEach(r => {
      const k = r.towContratto || "";
      if (!map[k]) map[k] = { valoreTotale: 0, approvato: 0, ordinatiRda: 0, impegnato: 0, residuo: 0 };
      map[k].valoreTotale += Number(r.valoreTotale)  || 0;
      map[k].approvato    += Number(r.approvato)     || 0;
      map[k].ordinatiRda  += Number(r.ordinatiRda)   || 0;
      map[k].impegnato    += Number(r.impegnato)     || 0;
      map[k].residuo      += Number(r.residuo)       || 0;
    });
    return map;
  }, [rows]);

  // ── Ordinato dagli Ordini di Consegna per società ──────────────────────────
  // Logica:
  //   - Se ordine.subappalto è il nome (o parte) di una società RTI (qualsiasi ruolo)
  //     → l'importo va a quella società
  //   - Altrimenti (vuoto, "NO", "SI" non abbinato)
  //     → l'importo va alla Mandataria (prima riga RTI con ruolo Mandataria)
  // Risultato: { "NomeSocietà": totaleOrdinato }   (flat, senza join per contratto)
  const ordiniOrdinatoMap = React.useMemo(() => {
    const map = {}; // { societa: totale }
    const add = (soc, importo) => {
      if (!soc) return;
      map[soc] = (map[soc] || 0) + importo;
    };

    // Tutte le società RTI registrate (nome canonico)
    const tuttiNomi = (righeInit || [])
      .map(r => (r.societa || "").trim())
      .filter(Boolean);

    // Prima Mandataria registrata (fallback per ordini senza subappalto)
    const mandataria = (righeInit || []).find(r => r.ruolo === "Mandataria")?.societa || null;

    (ordiniRows || []).forEach(ord => {
      const importoNum = parseNum(ord.importo || "");
      if (!importoNum || importoNum <= 0) return;

      const subappalto = (ord.subappalto || "").trim();
      const subUpper   = subappalto.toUpperCase();

      if (subappalto && subUpper !== "NO" && subUpper !== "SI" && subUpper !== "") {
        // subappalto contiene il nome della società: cerca match esatto o parziale
        const match = tuttiNomi.find(s =>
          s.toLowerCase() === subappalto.toLowerCase() ||
          s.toLowerCase().includes(subappalto.toLowerCase()) ||
          subappalto.toLowerCase().includes(s.toLowerCase().split(" ")[0].toLowerCase())
        );
        if (match) { add(match, importoNum); return; }
      }
      // Nessun subappalto riconosciuto → Mandataria
      if (mandataria) add(mandataria, importoNum);
    });

    return map;
  }, [ordiniRows, righeInit]); // eslint-disable-line

  // Calcola consumato da MEV per società (somma tutti i contratti — da capImporti e subcoImporti)
  const mevConsumatoMap = React.useMemo(() => {
    const map = {};
    const addToMap = (importiJson) => {
      if (!importiJson) return;
      try {
        const obj = JSON.parse(importiJson);
        Object.entries(obj).forEach(([societa, val]) => {
          map[societa] = (map[societa] || 0) + (Number(val) || 0);
        });
      } catch {}
    };
    (mevRows || []).forEach(r => {
      addToMap(r.capImporti);
      addToMap(r.subcoImporti);
    });
    return map;
  }, [mevRows]);

  // DEBUG — rimuovere dopo verifica
  React.useEffect(() => {
    if (ordiniRows.length > 0 || righeInit.length > 0) {
      console.log("[RTI-DEBUG] ordiniRows:", ordiniRows.length, "sample:", ordiniRows[0]);
      console.log("[RTI-DEBUG] righeInit:", righeInit.length, "sample:", righeInit[0]);
      console.log("[RTI-DEBUG] ordiniOrdinatoMap:", ordiniOrdinatoMap);
    }
  }, [ordiniRows, righeInit, ordiniOrdinatoMap]); // eslint-disable-line

  const emptyForm = { contratto: contratti[0] || "", ruolo: "Mandataria", societa: "", dataInizio: "", dataApprovazione: "", percentuale: "", importo: "", consumato: "" };
  const [righe, setRigheLocal] = React.useState([]);
  const [loadingRighe] = React.useState(false); // il loading è gestito dal padre

  // Sincronizza le righe dalla prop del padre
  React.useEffect(() => { setRigheLocal(righeInit); }, [righeInit]);

  const setRighe = (updater) => {
    setRigheLocal(prev => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      onRigheChange?.(next);
      return next;
    });
  };

  const [showForm, setShowForm] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [editId, setEditId] = React.useState(null);
  const [err, setErr] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [filterContratto, setFilterContratto] = React.useState("");

  const openNew = () => {
    setForm({ ...emptyForm, contratto: contratti[0] || "" });
    setEditId(null); setErr(""); setShowForm(true);
  };
  const openEdit = (riga) => {
    setForm({
      contratto: riga.contratto || "",
      ruolo: riga.ruolo || "Mandataria",
      societa: riga.societa || "",
      dataInizio: riga.dataInizio ? riga.dataInizio.substring(0, 10) : "",
      dataApprovazione: riga.dataApprovazione ? riga.dataApprovazione.substring(0, 10) : "",
      percentuale: riga.percentuale != null ? String(riga.percentuale * 100) : "",
      importo: riga.importo != null ? String(riga.importo) : "",
      consumato: riga.consumato != null ? String(riga.consumato) : "",
    });
    setEditId(riga.id); setErr(""); setShowForm(true);
  };
  const cancel = () => { setShowForm(false); setErr(""); };

  const calcImporto = (contratto, percStr) => {
    const vt = (valoriContratto[contratto] || {}).valoreTotale || 0;
    const perc = parseNum(percStr) / 100;
    return vt * perc;
  };

  const handleSave = async () => {
    if (!form.societa.trim()) { setErr("Inserisci il nome della Società"); return; }
    if (!form.contratto) { setErr("Seleziona un contratto"); return; }
    let importoFinale = null;
    if (form.importo !== "") {
      importoFinale = parseNum(form.importo);
    } else if (form.percentuale !== "") {
      importoFinale = calcImporto(form.contratto, form.percentuale);
    }
    const dto = {
      contratto: form.contratto,
      ruolo: form.ruolo,
      societa: form.societa.trim(),
      dataInizio: form.dataInizio || null,
      dataApprovazione: form.dataApprovazione || null,
      percentuale: form.percentuale !== "" ? parseNum(form.percentuale) / 100 : null,
      importo: importoFinale,
      consumato: form.consumato !== "" ? parseNum(form.consumato) : null,
    };
    setSaving(true); setErr("");
    try {
      if (editId !== null) {
        const updated = await updateRtiSocieta(editId, dto);
        setRighe(prev => prev.map(r => r.id === editId ? updated : r));
      } else {
        const created = await createRtiSocieta(dto);
        setRighe(prev => [...prev, created]);
      }
      setShowForm(false);
    } catch (e) {
      setErr(e.message || "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminare questa riga?")) return;
    try {
      await deleteRtiSocieta(id);
      setRighe(prev => prev.filter(r => r.id !== id));
    } catch (e) {
      alert(e.message || "Errore eliminazione");
    }
  };

  const ruoloBadge = (ruolo) => {
    const colors = { Mandataria: ["#1a73e8","#eff6ff"], Mandante: ["#10b981","#f0fdf4"], SUBCO: ["#f59e0b","#fffbeb"], Altro: ["#64748b","#f1f5f9"] };
    const [fg, bg] = colors[ruolo] || colors["Altro"];
    return <span style={{ background: bg, color: fg, border: `1px solid ${fg}33`, borderRadius: "6px", padding: "2px 8px", fontSize: "11px", fontWeight: 700 }}>{ruolo}</span>;
  };

  const inp = { padding: "8px 11px", borderRadius: "7px", border: "1px solid #dadce0", fontSize: "13px", width: "100%", boxSizing: "border-box" };
  const lbl = { fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" };
  const TH2 = (align = "right") => ({
    padding: "10px 14px", textAlign: align, fontWeight: 700, fontSize: "11px",
    color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px",
    borderBottom: "2px solid #e2e8f0", whiteSpace: "nowrap", background: "#f8fafc",
  });
  const TD2 = (align = "right", extra = {}) => ({
    padding: "9px 14px", textAlign: align, fontSize: "13px",
    borderBottom: "1px solid #f1f5f9", whiteSpace: "nowrap", color: "#374151", ...extra,
  });

  // Righe filtrate per contratto selezionato
  const righeVisibili = filterContratto ? righe.filter(r => r.contratto === filterContratto) : righe;
  const righeRti = righeVisibili.filter(r => r.ruolo !== "SUBCO");

   // ── Mappa MEV per società: aggrega importi per stato ────────────────────────
   // Logica di attribuzione per ogni MEV:
   //   CAP (capgemini field):
   //     "x" (legacy) → tutto l'importo va a "Capgemini Italia S.p.A."
   //     array JSON   → legge capImporti se disponibile; altrimenti divide proporzionalmente
   //   SUBCO (subco field):
   //     SOLO se subcoImporti è valorizzato (quota esplicita); altrimenti ignorato
   //     (quando subcoImporti è null la quota subco è inclusa nell'importo CAP)
   //     Se subcoImporti è valorizzato, la quota subco viene sottratta dalla quota CAP
   //     per evitare doppio conteggio.
   // Struttura risultante: { "NomeSocietà": { approvato, ordinato, impegnato } }
   const mevImportiPerSocieta = React.useMemo(() => {
     const CAP_MANDATARIA = "Capgemini Italia S.p.A.";
     const map = {};
     const ensure = (soc) => {
       if (!map[soc]) map[soc] = { approvato: 0, ordinato: 0, impegnato: 0 };
     };
     const parseJSON = (raw) => {
       if (!raw) return null;
       if (typeof raw === "object") return raw;
       try { return JSON.parse(raw); } catch { return null; }
     };

     // Alloca importoEx tra le società indicate dal campo capField/importiField.
     // Ritorna { soc: quota } o null.
     const allocateCap = (capField, importiField, totalImporto) => {
       if (!capField || capField === "x") {
         return totalImporto > 0 ? { [CAP_MANDATARIA]: totalImporto } : null;
       }
       const soci = parseJSON(capField);
       if (!Array.isArray(soci) || soci.length === 0) return null;
       if (soci.length === 1) {
         return totalImporto > 0 ? { [soci[0]]: totalImporto } : null;
       }
       const importiObj = parseJSON(importiField);
       if (importiObj && Object.keys(importiObj).length > 0) return importiObj;
       const quota = totalImporto / soci.length;
       return Object.fromEntries(soci.map(s => [s, quota]));
     };

      (mevRows || []).forEach(r => {
        const stato        = (r.stato || "").trim();
        if (stato === "Eliminato") return;
        const importoEx    = Number(r.importoExcel) || 0;
        const ordBdo       = Number(r.ordinatoBdo)  || 0;
        const fatturato    = Number(r.fatturato)    || 0;

        // ── CAP allocation ───────────────────────────────────────────────────────
        const capAlloc = allocateCap(r.capgemini, r.capImporti, importoEx);

        // ── SUBCO: legge subcoImporti se valorizzato ─────────────────────────────
        const subcoImportiObj = parseJSON(r.subcoImporti);
        const hasSubcoQuota   = subcoImportiObj && Object.keys(subcoImportiObj).length > 0;

        // Se non c'è né CAP né SUBCO → skip
        if (!capAlloc && !hasSubcoQuota) return;

        // Mappa finale: parte da capAlloc (o vuota se assente)
        const finalAlloc = capAlloc ? { ...capAlloc } : {};

        if (hasSubcoQuota) {
          // Aggiungi quote SUBCO
          Object.entries(subcoImportiObj).forEach(([soc, v]) => {
            finalAlloc[soc] = (finalAlloc[soc] || 0) + Number(v);
          });
          // Sottrai la quota subco totale da CAP Mandataria per evitare doppio conteggio
          if (capAlloc) {
            const subcoTot = Object.values(subcoImportiObj).reduce((s, v) => s + Number(v), 0);
            if (finalAlloc[CAP_MANDATARIA] != null) {
              finalAlloc[CAP_MANDATARIA] = Math.max(0, finalAlloc[CAP_MANDATARIA] - subcoTot);
            }
          }
        }

        // ── Accumula nella mappa per società ─────────────────────────────────────
        Object.entries(finalAlloc).forEach(([soc, v]) => {
          v = Number(v) || 0;
          if (v <= 0) return;
          ensure(soc);
          if (stato === "Approvato")           map[soc].approvato += v;
          if (ordBdo > 0 && importoEx > 0)    map[soc].ordinato  += v * (ordBdo    / importoEx);
          if (fatturato > 0 && importoEx > 0) map[soc].impegnato += v * (fatturato / importoEx);
        });
      });
      return map;
   }, [mevRows]);

  // Helper: restituisce i 5 valori per una riga RTI/SUBCO.
  // - Valore Totale : importo manuale della riga RTI
  // - Approvato     : da mevImportiPerSocieta (somma MEV in stato Approvato per quella società)
  // - Ordinato      : dagli Ordini di Consegna (fonte primaria); fallback MEV ordinatoBdo
  // - Impegnato     : proporzionale al fatturato MEV
  // - Residuo       : per RTI  → VT − Approvato
  //                   per SUBCO → VT − Ordinato
  const calcCampiRiga = (r) => {
    const vt       = r.importo != null ? Number(r.importo) : null;
    const isSubco  = r.ruolo === "SUBCO";
    const mev      = mevImportiPerSocieta[r.societa];

    // Ordinato dagli ordini di consegna (fonte primaria, flat per società)
    const ordiniOrdinato = ordiniOrdinatoMap[r.societa] || 0;

    if (mev) {
      const approvato = mev.approvato || 0;
      const ordinato  = ordiniOrdinato > 0 ? ordiniOrdinato : (mev.ordinato || 0);
      const impegnato = mev.impegnato > 0 ? mev.impegnato : null;
      const residuo   = vt != null
        ? (isSubco ? vt - ordinato : vt - approvato)
        : null;
      return { valoreTotale: vt, approvato, ordinatiRda: ordinato, impegnato, residuo };
    }

    // Fallback: % × totali ConsumoTow (società senza MEV assegnate)
    const vc   = valoriContratto[r.contratto] || {};
    const perc = r.percentuale != null ? Number(r.percentuale) : null;
    const apply = (v) => perc != null ? v * perc : null;
    const approvato = apply(vc.approvato   || 0);
    const ordinato  = ordiniOrdinato > 0 ? ordiniOrdinato : apply(vc.ordinatiRda || 0);
    const impegnato = apply(vc.impegnato   || 0);
    const residuo   = vt != null
      ? (isSubco
          ? vt - (ordinato ?? 0)
          : (approvato != null ? vt - approvato : apply(vc.residuo || 0)))
      : apply(vc.residuo || 0);
    return { valoreTotale: vt, approvato, ordinatiRda: ordinato, impegnato, residuo };
  };

  const totVT       = righeRti.reduce((s, r) => s + (calcCampiRiga(r).valoreTotale || 0), 0);
  const totApp      = righeRti.reduce((s, r) => s + (calcCampiRiga(r).approvato    || 0), 0);
  const totOrd      = righeRti.reduce((s, r) => s + (calcCampiRiga(r).ordinatiRda  || 0), 0);
  const totImp      = righeRti.reduce((s, r) => s + (calcCampiRiga(r).impegnato    || 0), 0);
  const totRes      = righeRti.reduce((s, r) => s + (calcCampiRiga(r).residuo      || 0), 0);

  // Importo % anteprima nel form
  const importoPreview = form.percentuale !== "" ? calcImporto(form.contratto, form.percentuale) : null;

  // ── Colgroup RTI speculare alla tabella CONTRATTO ─────────────────────────────
  // La tabella CONTRATTO ha colgroup (ricostruito da contractCols + contractVisFields):
  //   [arrow 32] [contratto 180] [tow 100] [qta 65]
  //   [valoreUnitario 125] [impatto? 90]
  //   [valoreTotale 125] [approvato 125] [towApprovati 85] [ordinatiRda 125]
  //   [towResidui 85] [impegnato 125] [residuo 125] [collaudo* 125…]
  //
  // Strategia: usare CW (costante condivisa a livello modulo) per definire le
  // larghezze di tutte le colonne. Questo garantisce allineamento pixel-perfect
  // senza alcun calcolo dinamico o passaggio di props.

  const RTI_EURO_KEYS = ["valoreTotale", "approvato", "ordinatiRda", "impegnato", "residuo"];

  // Colonne dopo le info (da valoreUnitario in poi) — costruite da CW, identiche alla tabella CONTRATTO
  const visFields = contractVisFields.length > 0 ? contractVisFields : FIELDS.filter(f => !f.key.startsWith("collaudo"));
  const afterInfoCols = React.useMemo(() => {
    const fieldsA = visFields.filter(f => f.key === "valoreUnitario");
    const fieldsB = visFields.filter(f => f.key !== "valoreUnitario");
    return [
      ...fieldsA.map(f => ({ key: f.key, width: CW[f.key] || 125 })),
      ...(hasImpatto ? [{ key: "__impatto__", width: CW.impatto }] : []),
      ...fieldsB.map(f => ({ key: f.key, width: CW[f.key] || (f.group === "euro" ? 125 : 85) })),
    ];
  }, [visFields, hasImpatto]);

  // Larghezze info RTI: le 6 colonne devono sommare esattamente CW_INFO_TOTAL (377px)
  const COL_ID    = CW.arrow;           // 32px
  const COL_RUOLO = 115;
  const COL_DATAI = 58;
  const COL_DATAA = 58;
  const colFlex   = Math.max(0, CW_INFO_TOTAL - COL_ID - COL_RUOLO - COL_DATAI - COL_DATAA); // 147px
  const colContr  = Math.max(35, Math.round(colFlex * 0.30));  // ~44 → clamp → 60px
  const colSoc    = Math.max(79, colFlex - colContr);          // 87px

  // Larghezza totale tabella RTI = tabella CONTRATTO + colonna Azioni
  // Semplificato: somma le colonne che compaiono realmente
  const contractBaseW = CW.arrow + CW.contratto + CW.tow + CW.qta
    + afterInfoCols.reduce((s, d) => s + d.width, 0);
  const rtiTableW = contractBaseW + CW.azioni;

  // contractAfterInfo → rinominato afterInfoCols sopra
  const contractAfterInfo = afterInfoCols;

  return (
    <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "24px" }}>
      {/* Header */}
      <div style={{ padding: "14px 22px", background: "linear-gradient(135deg,#1a73e8 0%,#1557b0 100%)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "13px", fontWeight: 700, color: "#fff" }}>RTI & SUBCO</div>
          <div style={{ fontSize: "11px", color: "rgba(255,255,255,0.75)", marginTop: "2px" }}>Ripartizione importi per società</div>
        </div>
        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          {/* Filtro per contratto */}
          {contratti.length > 0 && (
            <select
              value={filterContratto}
              onChange={e => setFilterContratto(e.target.value)}
              style={{ padding: "5px 10px", borderRadius: "7px", border: "1.5px solid rgba(255,255,255,0.4)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: "12px", fontWeight: 600, cursor: "pointer" }}
            >
              <option value="" style={{ color: "#0f172a" }}>Tutti i contratti</option>
              {contratti.map(c => <option key={c} value={c} style={{ color: "#0f172a" }}>{c}</option>)}
            </select>
          )}
          <button onClick={openNew} style={{ padding: "6px 16px", borderRadius: "8px", border: "1.5px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.15)", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: "pointer" }}>
            + Nuovo
          </button>
        </div>
      </div>

      {/* Form */}
      {showForm && (
        <div style={{ padding: "18px 22px", borderBottom: "1px solid #e2e8f0", background: "#f8fafc" }}>
          {err && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "8px 12px", marginBottom: "12px", fontSize: "12px" }}>{err}</div>}

          {/* Riga 1: Contratto, Ruolo, Società */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 2fr", gap: "12px", marginBottom: "12px" }}>
            <div>
              <div style={lbl}>Contratto</div>
              <select style={inp} value={form.contratto} onChange={e => setForm(p => ({ ...p, contratto: e.target.value }))}>
                {contratti.length === 0 && <option value="">— nessun contratto —</option>}
                {contratti.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Ruolo</div>
              <select style={inp} value={form.ruolo} onChange={e => setForm(p => ({ ...p, ruolo: e.target.value }))}>
                {RUOLI_RTI.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <div style={lbl}>Società</div>
              <input style={inp} value={form.societa} onChange={e => setForm(p => ({ ...p, societa: e.target.value }))} placeholder="Nome società" />
            </div>
          </div>

          {/* Riga 2: Date, %, Importo, Consumato */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr 1fr", gap: "12px", marginBottom: "10px" }}>
            <div>
              <div style={lbl}>Data Inizio</div>
              <input style={inp} type="date" value={form.dataInizio} onChange={e => setForm(p => ({ ...p, dataInizio: e.target.value }))} />
            </div>
            <div>
              <div style={lbl}>Data Approv.</div>
              <input style={inp} type="date" value={form.dataApprovazione} onChange={e => setForm(p => ({ ...p, dataApprovazione: e.target.value }))} />
            </div>
            <div>
              <div style={lbl}>% Quota</div>
              <div style={{ position: "relative" }}>
                <input
                  style={{ ...inp, textAlign: "right", paddingRight: "24px" }}
                  value={form.percentuale}
                  onChange={e => {
                    const perc = e.target.value;
                     // Pre-compila importo solo se non è stato inserito manualmente
                     const vt = (valoriContratto[form.contratto] || {}).valoreTotale || 0;
                    const calcolato = vt > 0 ? parseNum(perc) / 100 * vt : null;
                    setForm(p => ({
                      ...p,
                      percentuale: perc,
                      importo: calcolato !== null ? String(calcolato) : p.importo,
                    }));
                  }}
                  placeholder="0"
                />
                <span style={{ position: "absolute", right: "9px", top: "50%", transform: "translateY(-50%)", fontSize: "12px", color: "#64748b", pointerEvents: "none" }}>%</span>
              </div>
            </div>
            <div>
              <div style={lbl}>Importo (€)</div>
              <input
                style={{ ...inp, textAlign: "right", borderColor: form.importo !== "" ? "#1a73e8" : "#dadce0" }}
                value={form.importo}
                onChange={e => setForm(p => ({ ...p, importo: e.target.value }))}
                placeholder="0,00"
              />
              {importoPreview !== null && form.importo === "" && (
                <div style={{ fontSize: "11px", color: "#94a3b8", marginTop: "3px", textAlign: "right" }}>
                  da %: {formatEuro(importoPreview)}
                </div>
              )}
            </div>
            <div>
              <div style={lbl}>Consumato (€)</div>
              <input style={{ ...inp, textAlign: "right" }} value={form.consumato} onChange={e => setForm(p => ({ ...p, consumato: e.target.value }))} placeholder="0" />
            </div>
          </div>

          {/* Info valore contratto */}
          {form.contratto && (valoriContratto[form.contratto] || {}).valoreTotale > 0 && (
            <div style={{ background: "#eff6ff", border: "1px solid #bfdbfe", borderRadius: "8px", padding: "8px 14px", marginBottom: "10px", fontSize: "12px", color: "#1a73e8" }}>
              Valore Totale contratto <strong>{form.contratto}</strong>: <strong>{formatEuro((valoriContratto[form.contratto] || {}).valoreTotale)}</strong>
            </div>
          )}

          <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
            <button onClick={cancel} style={{ padding: "7px 18px", borderRadius: "7px", border: "1px solid #dadce0", background: "#fff", fontSize: "12px", cursor: "pointer", color: "#374151" }}>Annulla</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: "7px 18px", borderRadius: "7px", border: "none", background: saving ? "#93c5fd" : "#1a73e8", color: "#fff", fontSize: "12px", fontWeight: 700, cursor: saving ? "default" : "pointer" }}>
              {saving ? "Salvataggio..." : (editId !== null ? "Aggiorna" : "Salva")}
            </button>
          </div>
        </div>
      )}

      {/* Tabella RTI & SUBCO — colgroup speculare alla tabella CONTRATTO per allineamento pixel-perfect.
          Le prime 4 colonne CONTRATTO (arrow+contratto+tow+qta) diventano 6 colonne info RTI
          con la stessa larghezza totale. Le colonne non-euro CONTRATTO (valoreUnitario,
          towApprovati, towResidui, impatto, collaudo) appaiono come <td/> vuote. */}
      <div ref={scrollRef} onScroll={onScroll} style={{ overflowX: "auto" }}>
        <table style={{ width: `max-content`, minWidth: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
          <colgroup>
            <col style={{ width: `${COL_ID}px`    }} />{/* ID */}
            <col style={{ width: `${colContr}px`  }} />{/* Contratto */}
            <col style={{ width: `${COL_RUOLO}px` }} />{/* Ruolo */}
            <col style={{ width: `${colSoc}px`    }} />{/* Società */}
            <col style={{ width: `${COL_DATAI}px` }} />{/* Data Inizio */}
            <col style={{ width: `${COL_DATAA}px` }} />{/* Data Approv. */}
            {contractAfterInfo.map((d, i) => <col key={i} style={{ width: `${d.width}px` }} />)}
            <col style={{ width: `${CW.azioni}px` }} />{/* Azioni */}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...TH2("right"),  fontSize: "10px" }}>ID</th>
              <th style={TH2("left")}>Contratto</th>
              <th style={TH2("left")}>Ruolo</th>
              <th style={TH2("left")}>Società</th>
              <th style={{ ...TH2("center"), fontSize: "10px", whiteSpace: "normal", lineHeight: "1.2" }}>Data<br/>Inizio</th>
              <th style={{ ...TH2("center"), fontSize: "10px", whiteSpace: "normal", lineHeight: "1.2" }}>Data<br/>Approv.</th>
              {contractAfterInfo.map(d => {
                if (d.key === "valoreTotale") return <th key={d.key} style={{ ...TH2("right"), color: "#1e293b" }}>Valore Totale</th>;
                if (d.key === "approvato")    return <th key={d.key} style={{ ...TH2("right"), color: "#1a73e8" }}>Approvato</th>;
                if (d.key === "ordinatiRda")  return <th key={d.key} style={{ ...TH2("right"), color: "#10b981" }}>Ordinato</th>;
                if (d.key === "impegnato")    return <th key={d.key} style={{ ...TH2("right"), color: "#f59e0b" }}>Impegnato</th>;
                if (d.key === "residuo")      return <th key={d.key} style={{ ...TH2("right"), color: "#f97316" }}>Residuo</th>;
                return <th key={d.key} style={{ ...TH2("right"), color: "transparent" }}></th>;
              })}
              <th style={{ ...TH2("center") }}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {righeLoading ? (
              <tr><td colSpan={6 + contractAfterInfo.length + 1} style={{ padding: "36px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                Caricamento in corso...
              </td></tr>
            ) : righeVisibili.length === 0 ? (
              <tr><td colSpan={6 + contractAfterInfo.length + 1} style={{ padding: "36px", textAlign: "center", color: "#94a3b8", fontSize: "13px" }}>
                {filterContratto ? `Nessuna riga per il contratto ${filterContratto}` : "Nessuna riga inserita"}
              </td></tr>
            ) : righeVisibili.map((r, idx) => {
              const campi = calcCampiRiga(r);
              const fmt = (v) => v != null ? formatEuro(v) : "—";
              const percLabel = r.percentuale != null
                ? (r.percentuale * 100).toLocaleString("it-IT", { minimumFractionDigits: 1, maximumFractionDigits: 1 }) + "%"
                : null;
              return (
                <tr key={r.id} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                  onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafafa"}>
                  <td style={{ ...TD2("right"), color: "#94a3b8", fontSize: "10px", padding: "9px 12px" }}>{r.id}</td>
                  <td style={{ ...TD2("left"), padding: "9px 6px" }}>
                    <span style={{ display: "inline-block", background: "#f1f5f9", borderRadius: "5px", padding: "2px 6px", fontSize: "11px", fontWeight: 700 }}>{r.contratto || "—"}</span>
                  </td>
                  <td style={{ ...TD2("left"), padding: "9px 6px" }}>{ruoloBadge(r.ruolo)}</td>
                  <td style={{ ...TD2("left"), padding: "9px 6px", overflow: "hidden" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 600, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.societa}</span>
                      {percLabel && (
                        <span style={{
                          display: "inline-flex", alignItems: "center",
                          background: "#f5f3ff", color: "#7c3aed",
                          border: "1.5px solid #c4b5fd",
                          borderRadius: "6px", padding: "2px 8px",
                          fontSize: "12px", fontWeight: 800,
                          letterSpacing: "0.2px", flexShrink: 0,
                        }}>{percLabel}</span>
                      )}
                    </div>
                  </td>
                  <td style={{ ...TD2("center"), color: "#64748b", fontSize: "11px", padding: "9px 4px" }}>{r.dataInizio ? new Date(r.dataInizio).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"2-digit"}) : "—"}</td>
                  <td style={{ ...TD2("center"), color: "#64748b", fontSize: "11px", padding: "9px 4px" }}>{r.dataApprovazione ? new Date(r.dataApprovazione).toLocaleDateString("it-IT",{day:"2-digit",month:"2-digit",year:"2-digit"}) : "—"}</td>
                  {contractAfterInfo.map(d => {
                    if (d.key === "valoreTotale") return <td key={d.key} style={{ ...TD2("right"), fontWeight: 600, color: "#1e293b" }}>{fmt(campi.valoreTotale)}</td>;
                    if (d.key === "approvato")    return <td key={d.key} style={{ ...TD2("right"), fontWeight: 600, color: "#1a73e8" }}>{fmt(campi.approvato)}</td>;
                    if (d.key === "ordinatiRda")  return <td key={d.key} style={{ ...TD2("right"), fontWeight: 600, color: "#10b981" }}>{fmt(campi.ordinatiRda)}</td>;
                    if (d.key === "impegnato")    return <td key={d.key} style={{ ...TD2("right"), fontWeight: 600, color: "#f59e0b" }}>{fmt(campi.impegnato)}</td>;
                    if (d.key === "residuo")      return <td key={d.key} style={{ ...TD2("right"), fontWeight: 700, color: "#f97316" }}>{fmt(campi.residuo)}</td>;
                    return <td key={d.key} />;  {/* colonne non-euro: vuote */}
                  })}
                  <td style={{ ...TD2("center") }}>
                    <div style={{ display: "flex", gap: "4px", justifyContent: "center" }}>
                      <button
                        onClick={() => openEdit(r)}
                        title="Modifica"
                        style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid #bfdbfe", background: "#eff6ff", color: "#1a73e8", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                      >✏️</button>
                      <button
                        onClick={() => handleDelete(r.id)}
                        title="Elimina"
                        style={{ width: "28px", height: "28px", borderRadius: "6px", border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", fontSize: "14px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }}
                      >🗑️</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {righeVisibili.length > 0 && (
            <tfoot>
              <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                <td colSpan={6} style={{ ...TD2("left"), fontWeight: 700, color: "#1e293b", textTransform: "uppercase", fontSize: "11px", letterSpacing: "0.5px" }}>Totale RTI &amp; SUBCO</td>
                {contractAfterInfo.map(d => {
                  if (d.key === "valoreTotale") return <td key={d.key} style={{ ...TD2("right"), fontWeight: 800, color: "#1e293b" }}>{formatEuro(totVT)}</td>;
                  if (d.key === "approvato")    return <td key={d.key} style={{ ...TD2("right"), fontWeight: 800, color: "#1a73e8" }}>{formatEuro(totApp)}</td>;
                  if (d.key === "ordinatiRda")  return <td key={d.key} style={{ ...TD2("right"), fontWeight: 800, color: "#10b981" }}>{formatEuro(totOrd)}</td>;
                  if (d.key === "impegnato")    return <td key={d.key} style={{ ...TD2("right"), fontWeight: 800, color: "#f59e0b" }}>{formatEuro(totImp)}</td>;
                  if (d.key === "residuo")      return <td key={d.key} style={{ ...TD2("right"), fontWeight: 800, color: totRes >= 0 ? "#10b981" : "#dc2626" }}>{formatEuro(totRes)}</td>;
                  return <td key={d.key} />;
                })}
                <td style={TD2("center")} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
