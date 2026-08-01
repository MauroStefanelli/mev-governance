import React, { useEffect, useState, useCallback, useRef } from "react";
import { getConsumoTow, updateConsumoTow, createConsumoTow, createConsumoTowFiglio, deleteConsumoTowContratto } from "../services/mevService";

const CONTRATTI_ORDER_KEY = "consumo-tow-contratti-order";

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
function NewContrattoBaseModal({ onClose, onCreated }) {
  const [nomeContratto, setNomeContratto] = useState("");
  const [towNames, setTowNames]   = useState(["TOW02.1","TOW02.2","TOW02.3","TOW02.4","TOW02.5","TOW02.6"]);
  const [valori, setValori]       = useState(() => Object.fromEntries(["TOW02.1","TOW02.2","TOW02.3","TOW02.4","TOW02.5","TOW02.6"].map(k => [k, ""])));
  const [qta, setQta]             = useState(() => Object.fromEntries(["TOW02.1","TOW02.2","TOW02.3","TOW02.4","TOW02.5","TOW02.6"].map(k => [k, ""])));
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState("");

  const setValore  = (idx, val) => setValori(p  => { const n = { ...p }; n[towNames[idx]] = val; return n; });
  const setQtaVal  = (idx, val) => setQta(p     => { const n = { ...p }; n[towNames[idx]] = val; return n; });
  const setTowName = (idx, val) => {
    setTowNames(prev => {
      const next = [...prev];
      const oldKey = next[idx];
      next[idx] = val;
      setValori(p  => { const n = { ...p }; n[val] = p[oldKey] || ""; delete n[oldKey]; return n; });
      setQta(p     => { const n = { ...p }; n[val] = p[oldKey] || ""; delete n[oldKey]; return n; });
      return next;
    });
  };

  const parsedValori = Object.fromEntries(towNames.map(k => [k, parseNum(valori[k])]));
  const parsedQta    = Object.fromEntries(towNames.map(k => [k, parseNum(qta[k])]));
  const valoreTotale = towNames.reduce((s, k) => s + parsedQta[k] * parsedValori[k], 0);

  const handleSave = async () => {
    if (!nomeContratto.trim()) { setError("Inserisci il nome del contratto."); return; }
    if (towNames.some(t => !t.trim())) { setError("Tutti i nomi TOW devono essere compilati."); return; }
    setSaving(true); setError("");
    try {
      const valoriByName = Object.fromEntries(towNames.map(k => [k, parsedValori[k]]));
      const qtaByName    = Object.fromEntries(towNames.map(k => [k, parsedQta[k]]));
      const newRows = await createConsumoTow(nomeContratto.trim(), valoriByName, qtaByName);
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
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: "13px", color: sub > 0 ? "#059669" : "#94a3b8" }}>{formatEuro(sub)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Valore Totale (Σ QTA × Valore€)</span>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{formatEuro(valoreTotale)}</span>
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
function NewContrattoFiglioModal({ onClose, onCreated, baseRows }) {
  const { pos, onMouseDown } = useDrag();
  const baseTowNames = [...new Set(baseRows.map(r => r.tow))];

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
              <col style={{ width: "130px" }} />
              <col style={{ width: "80px" }} />
              <col style={{ width: "150px" }} />
              <col style={{ width: "130px" }} />
            </colgroup>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>TOW</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Val. BASE €</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Val. Scontato €</th>
                <th style={{ padding: "8px 12px", textAlign: "center", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>Catalogo</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", borderBottom: "2px solid #e2e8f0" }}>N° TOW / € Catalogo</th>
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
export default function ConsumoTowAdminPage({ onUnauthorized }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contratti, setContratti] = useState([]);
  const [selectedContratto, setSelectedContratto] = useState("");
  const [expandedContratto, setExpandedContratto] = useState(null);
  const [editRow, setEditRow] = useState(null);
  const [editContratto, setEditContratto] = useState(null); // nome contratto da modificare in blocco
  const [showNewContratto, setShowNewContratto] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [showCollaudo, setShowCollaudo] = useState(false);
  const [dragOver, setDragOver] = useState(null);
  const dragItem = useRef(null);

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
      const data = await getConsumoTow();
      setRows(data);
      const tipi = [...new Set(data.map(r => r.towContratto).filter(Boolean))];
      const ordered = applyOrder(tipi);
      setContratti(ordered);
      setSelectedContratto(prev => prev || ordered[0] || "");
      setExpandedContratto(prev => prev || ordered[0] || null);
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
      else setError("Errore nel caricamento dei dati");
    } finally { setLoading(false); }
  }, [applyOrder]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

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

  return (
    <div style={{ padding: "28px 24px", minHeight: "100vh", background: "#f1f5f9" }}>

      {/* ── Titolo ── */}
      <div style={{ marginBottom: "24px" }}>
        <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Logistica Lotto 2</div>
        <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>Gestione Consumo TOW</h2>
        <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#64748b" }}>Clicca su un contratto per visualizzare il dettaglio dei TOW</p>
      </div>

      {/* Messaggi */}
      {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "10px", padding: "12px 16px", marginBottom: "18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>⚠ {error}</div>}
      {successMsg && <div style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 16px", marginBottom: "18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>✓ {successMsg}</div>}

      {/* ── Selezione contratto ── */}
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

        return (
          <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "24px" }}>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
                {/* Colgroup: stessa struttura della tabella interna, più colonna freccia+contratto */}
                <colgroup>
                  <col style={{ width: "32px" }} />   {/* freccia */}
                  <col style={{ width: "180px" }} />  {/* nome contratto */}
                  <col style={{ width: "100px" }} />  {/* = TOW nella tabella interna */}
                  <col style={{ width: "65px" }} />   {/* = QTA nella tabella interna */}
                  {visibleFields.map(f => (
                    <col key={f.key} style={{ width: f.group === "euro" ? "125px" : "85px" }} />
                  ))}
                </colgroup>

                {/* Header */}
                <thead>
                  <tr style={{ background: "#f8fafc", borderBottom: "2px solid #e2e8f0" }}>
                    <th style={{ ...TH(), borderBottom: "2px solid #e2e8f0" }} />
                    <th style={{ ...TH("left"), borderBottom: "2px solid #e2e8f0" }}>Contratto</th>
                    <th style={{ ...TH(), borderBottom: "2px solid #e2e8f0" }} />  {/* TOW */}
                    <th style={{ ...TH(), borderBottom: "2px solid #e2e8f0" }} />  {/* QTA */}
                    {visibleFields.map(f => (
                      <th key={f.key} style={{ ...TH("right"), color: f.color, borderBottom: "2px solid #e2e8f0" }}>{f.label}</th>
                    ))}
                  </tr>
                </thead>

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
                          {/* Totali per ogni field */}
                          {visibleFields.map(f => {
                            const tot = cRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                            return (
                              <td key={f.key} style={{ ...TD("right"), fontWeight: TOTALE_KEYS.has(f.key) ? (f.key === "valoreTotale" ? 800 : 600) : 400, color: TOTALE_KEYS.has(f.key) ? f.color : "#94a3b8" }}>
                                {TOTALE_KEYS.has(f.key) ? formatEuro(tot) : ""}
                              </td>
                            );
                          })}
                        </tr>

                        {/* ── Dettaglio TOW (espanso) — colonne identiche, nessun offset ── */}
                        {expanded && (
                          <tr>
                            <td colSpan={4 + visibleFields.length} style={{ padding: 0, borderBottom: "1px solid #f1f5f9" }}>
                              <div style={{ background: "#f8fafc", borderTop: "1px solid #e2e8f0" }}>
                                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
                                  <colgroup>
                                    <col style={{ width: "32px" }} />
                                    <col style={{ width: "180px" }} />
                                    <col style={{ width: "100px" }} />
                                    <col style={{ width: "65px" }} />
                                    {visibleFields.map(f => (
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
                                        {/* Nome TOW nella colonna "Contratto" */}
                                        <td style={{ ...TD("left"), fontWeight: 700, paddingLeft: "24px" }}>
                                          <span style={{ display: "inline-block", background: "#f1f5f9", borderRadius: "5px", padding: "2px 7px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>{row.tow}</span>
                                        </td>
                                        {/* TOW (vuoto — usato per "TOW" label nell'header) */}
                                        <td style={TD("right")} />
                                        {/* QTA */}
                                        <td style={{ ...TD("right"), color: "#64748b" }}>
                                          {row.valoreUnitario > 0 ? formatQta(Math.round(row.valoreTotale / row.valoreUnitario)) : "—"}
                                        </td>
                                        {visibleFields.map(f => (
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
                                      <td style={{ ...TD("left"), fontWeight: 700, fontSize: "11px", textTransform: "uppercase", color: "#1e293b", paddingLeft: "24px" }}>Totale</td>
                                      <td />
                                      <td />
                                      {visibleFields.map(f => {
                                        if (!TOTALE_KEYS.has(f.key)) return <td key={f.key} style={TD("right")} />;
                                        const tot = cRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                                        return <td key={f.key} style={{ ...TD("right"), fontWeight: 800, color: f.color, fontSize: "13px" }}>{f.group === "euro" ? formatEuro(tot) : formatQta(tot)}</td>;
                                      })}
                                    </tr>
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
                    return (
                      <tr style={{ background: "linear-gradient(90deg, #1e293b 0%, #334155 100%)", borderTop: "2px solid #1e293b" }}>
                        <td />
                        <td style={{ padding: "14px 12px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "12px", fontWeight: 800, color: "#fff", textTransform: "uppercase", letterSpacing: "0.8px" }}>Totale Contratti</span>
                            <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.5)" }}>{contratti.length} contratti · {allRows.length} TOW</span>
                          </div>
                        </td>
                        <td />
                        <td />
                        {visibleFields.map(f => {
                          const tot = allRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                          return (
                            <td key={f.key} style={{ padding: "14px 12px", textAlign: "right", fontSize: "14px", fontWeight: 800, color: TOTALE_KEYS.has(f.key) ? (f.key === "valoreTotale" ? "#fff" : f.color) : "transparent", filter: (TOTALE_KEYS.has(f.key) && f.key !== "valoreTotale") ? "brightness(1.4)" : "none" }}>
                              {TOTALE_KEYS.has(f.key) ? formatEuro(tot) : ""}
                            </td>
                          );
                        })}
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
        <NewContrattoBaseModal onClose={() => setShowNewContratto(false)} onCreated={handleCreated} />
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
    </div>
  );
}
