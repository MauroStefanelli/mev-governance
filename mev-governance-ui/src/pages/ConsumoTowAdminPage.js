import React, { useEffect, useState, useCallback, useRef } from "react";
import { getConsumoTow, updateConsumoTow, createConsumoTow, deleteConsumoTowContratto } from "../services/mevService";

const CONTRATTI_ORDER_KEY = "consumo-tow-contratti-order";

const TOW_KEYS = ["TOW02.1", "TOW02.2", "TOW02.3", "TOW02.4", "TOW02.5", "TOW02.6"];

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

// ── Modale Nuovo Contratto ────────────────────────────────────────────────────
function NewContrattoModal({ onClose, onCreated }) {
  const [nomeContratto, setNomeContratto] = useState("");
  const [valori, setValori]   = useState(() => Object.fromEntries(TOW_KEYS.map(k => [k, ""])));
  const [qta, setQta]         = useState(() => Object.fromEntries(TOW_KEYS.map(k => [k, ""])));
  const [saving, setSaving]   = useState(false);
  const [error, setError]     = useState("");

  const setValore = (tow, val) => setValori(p => ({ ...p, [tow]: val }));
  const setQtaVal = (tow, val) => setQta(p => ({ ...p, [tow]: val }));

  const parsedValori = Object.fromEntries(TOW_KEYS.map(k => [k, parseNum(valori[k])]));
  const parsedQta    = Object.fromEntries(TOW_KEYS.map(k => [k, parseNum(qta[k])]));

  // Valore Totale = somma di (QTA × ValoreUnitario) per ogni TOW
  const valoreTotale = TOW_KEYS.reduce((s, k) => s + parsedQta[k] * parsedValori[k], 0);

  const handleSave = async () => {
    if (!nomeContratto.trim()) { setError("Inserisci il nome del contratto."); return; }
    setSaving(true); setError("");
    try {
      const newRows = await createConsumoTow(nomeContratto.trim(), parsedValori, parsedQta);
      onCreated(newRows);
      onClose();
    } catch (e) { setError(e.message || "Errore durante la creazione"); }
    finally { setSaving(false); }
  };

  const inputBase = {
    padding: "8px 11px", borderRadius: "7px", border: "1px solid #dadce0",
    fontSize: "13px", width: "100%", boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: "100%", maxWidth: "660px", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0", background: "linear-gradient(135deg,#10b981 0%,#059669 100%)", display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>Nuovo Contratto</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "3px" }}>Inserisci nome, QTA e valore € per ciascun TOW</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", color: "#fff", width: "30px", height: "30px", borderRadius: "50%", fontSize: "16px", lineHeight: "30px", textAlign: "center" }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" }}>{error}</div>}

          {/* Nome contratto */}
          <div style={{ marginBottom: "20px" }}>
            <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>Nome Contratto</div>
            <input style={inputBase} placeholder="es. Contratto-XYZ" value={nomeContratto} onChange={e => setNomeContratto(e.target.value)} autoFocus />
          </div>

          {/* Tabella TOW: QTA + Valore € + subtotale */}
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #eff6ff" }}>
            TOW — Quantità e Valore Unitario
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "20px" }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ padding: "8px 12px", textAlign: "left",  fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "2px solid #e2e8f0" }}>TOW</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "2px solid #e2e8f0" }}>QTA</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "2px solid #e2e8f0" }}>Valore €</th>
                <th style={{ padding: "8px 12px", textAlign: "right", fontSize: "11px", fontWeight: 700, color: "#1e293b", textTransform: "uppercase", letterSpacing: "0.4px", borderBottom: "2px solid #e2e8f0" }}>Subtotale</th>
              </tr>
            </thead>
            <tbody>
              {TOW_KEYS.map((tow, idx) => {
                const sub = parsedQta[tow] * parsedValori[tow];
                  <tr key={tow} style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 700, fontSize: "13px", color: "#334155" }}>
                      <span style={{ background: "#f1f5f9", borderRadius: "5px", padding: "2px 8px" }}>{tow}</span>
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <input
                        style={{ ...inputBase, textAlign: "right", width: "110px" }}
                        placeholder="0"
                        value={qta[tow]}
                        onChange={e => setQtaVal(tow, e.target.value)}
                        onBlur={e => setQtaVal(tow, formatForInput(parseNum(e.target.value), "qta"))}
                      />
                    </td>
                    <td style={{ padding: "6px 12px" }}>
                      <input
                        style={{ ...inputBase, textAlign: "right", width: "140px" }}
                        placeholder="0,00"
                        value={valori[tow]}
                        onChange={e => setValore(tow, e.target.value)}
                        onBlur={e => setValore(tow, formatForInput(parseNum(e.target.value), "euro"))}
                      />
                    </td>
                    <td style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, fontSize: "13px", color: sub > 0 ? "#059669" : "#94a3b8" }}>
                      {formatEuro(sub)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Valore Totale calcolato */}
          <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: "13px", fontWeight: 700, color: "#064e3b", textTransform: "uppercase", letterSpacing: "0.4px" }}>Valore Totale (Σ QTA × Valore€)</span>
            <span style={{ fontSize: "20px", fontWeight: 800, color: "#059669" }}>{formatEuro(valoreTotale)}</span>
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

// ── Modale ────────────────────────────────────────────────────────────────────
function EditModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const init = { tow: row.tow || "", towContratto: row.towContratto || "" };
    FIELDS.forEach(f => { init[f.key] = formatForInput(row[f.key] ?? 0, f.group); });
    setForm(init);
  }, [row]);

  const set = (key, val) => setForm(p => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      const payload = { tow: form.tow, towContratto: form.towContratto };
      FIELDS.forEach(f => { payload[f.key] = parseNum(form[f.key]); });
      const updated = await updateConsumoTow(row.id, payload);
      onSaved(updated); onClose();
    } catch (e) { setError(e.message || "Errore durante il salvataggio"); }
    finally { setSaving(false); }
  };

  const inputBase = {
    padding: "8px 11px", borderRadius: "7px", border: "1px solid #dadce0",
    fontSize: "13px", width: "100%", boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(15,23,42,0.55)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: "16px" }}>
      <div style={{ background: "#fff", borderRadius: "16px", boxShadow: "0 20px 60px rgba(0,0,0,0.25)", width: "100%", maxWidth: "700px", maxHeight: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

        {/* Header modale */}
        <div style={{ padding: "20px 24px 16px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", background: "linear-gradient(135deg,#1a73e8 0%,#1557b0 100%)" }}>
          <div>
            <div style={{ fontSize: "15px", fontWeight: 700, color: "#fff" }}>Modifica TOW</div>
            <div style={{ fontSize: "12px", color: "rgba(255,255,255,0.75)", marginTop: "3px" }}>{row.tow} — Contratto {row.towContratto}</div>
          </div>
          <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", cursor: "pointer", color: "#fff", width: "30px", height: "30px", borderRadius: "50%", fontSize: "16px", lineHeight: "30px", textAlign: "center" }}>✕</button>
        </div>

        {/* Body modale */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px" }}>{error}</div>}

          {/* TOW readonly */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            {[{ k: "tow", l: "TOW" }, { k: "towContratto", l: "Contratto" }].map(({ k, l }) => (
              <div key={k}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>{l}</div>
                <input style={{ ...inputBase, background: "#f1f5f9", color: "#64748b", cursor: "not-allowed" }} value={form[k] || ""} readOnly />
              </div>
            ))}
          </div>

          {/* Sezione Euro */}
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #eff6ff" }}>Valori Euro</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "20px" }}>
            {FIELDS.filter(f => f.group === "euro").map(f => (
              <div key={f.key}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>{f.label}</div>
                <input
                  style={{ ...inputBase, textAlign: "right" }}
                  value={form[f.key] ?? ""}
                  onChange={e => set(f.key, e.target.value)}
                  onBlur={e => set(f.key, formatForInput(parseNum(e.target.value), f.group))}
                />
              </div>
            ))}
          </div>

          {/* Sezione Quantità */}
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#10b981", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px", paddingBottom: "6px", borderBottom: "2px solid #f0fdf4" }}>Quantità TOW</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "14px" }}>
            {FIELDS.filter(f => f.group === "qta").map(f => (
              <div key={f.key}>
                <div style={{ fontSize: "11px", fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "5px" }}>{f.label}</div>
                <input
                  style={{ ...inputBase, textAlign: "right" }}
                  value={form[f.key] ?? ""}
                  onChange={e => set(f.key, e.target.value)}
                  onBlur={e => set(f.key, formatForInput(parseNum(e.target.value), f.group))}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer modale */}
        <div style={{ padding: "14px 24px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: "10px", background: "#f8fafc" }}>
          <button onClick={onClose} style={{ padding: "8px 22px", borderRadius: "8px", border: "1px solid #dadce0", background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151", fontWeight: 500 }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "8px 22px", borderRadius: "8px", border: "none", background: saving ? "#93c5fd" : "#1a73e8", color: "#fff", fontSize: "13px", fontWeight: 600, cursor: saving ? "not-allowed" : "pointer" }}>
            {saving ? "Salvataggio..." : "Salva modifiche"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pagina principale ─────────────────────────────────────────────────────────
export default function ConsumoTowAdminPage({ onUnauthorized }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [contratti, setContratti] = useState([]);
  const [selectedContratto, setSelectedContratto] = useState("");
  const [editRow, setEditRow] = useState(null);
  const [showNewContratto, setShowNewContratto] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");
  const [showCollaudo, setShowCollaudo] = useState(false);
  const [dragOver, setDragOver] = useState(null); // nome contratto su cui si sta trascinando
  const dragItem = useRef(null);   // nome contratto che si sta trascinando

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
  const handleDragStart = (c) => { dragItem.current = c; };
  const handleDragOver  = (e, c) => { e.preventDefault(); setDragOver(c); };
  const handleDragEnd   = () => { dragItem.current = null; setDragOver(null); };
  const handleDrop      = (c) => {
    if (!dragItem.current || dragItem.current === c) return;
    setContratti(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(dragItem.current);
      const toIdx   = next.indexOf(c);
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, dragItem.current);
      localStorage.setItem(CONTRATTI_ORDER_KEY, JSON.stringify(next));
      return next;
    });
    setDragOver(null);
  };

  return (
    <div style={{ padding: "28px 24px", minHeight: "100vh", background: "#f1f5f9" }}>

      {/* ── Titolo ── */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "14px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Logistica Lotto 2</div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>Gestione Consumo TOW</h2>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#64748b" }}>Seleziona un contratto per visualizzare e modificare</p>
        </div>
        <button
          onClick={() => setShowNewContratto(true)}
          style={{ padding: "10px 20px", borderRadius: "10px", border: "none", background: "#10b981", color: "#fff", fontSize: "13px", fontWeight: 700, cursor: "pointer", boxShadow: "0 2px 8px rgba(16,185,129,0.3)", letterSpacing: "0.2px" }}
        >
          + Nuovo Contratto
        </button>
      </div>

      {/* Messaggi */}
      {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "10px", padding: "12px 16px", marginBottom: "18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>⚠ {error}</div>}
      {successMsg && <div style={{ background: "#f0fdf4", color: "#16a34a", border: "1px solid #bbf7d0", borderRadius: "10px", padding: "12px 16px", marginBottom: "18px", fontSize: "13px", display: "flex", alignItems: "center", gap: "8px" }}>✓ {successMsg}</div>}

      {/* ── Selezione contratto ── */}
      <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", padding: "20px 24px", marginBottom: "24px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: "11px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "14px" }}>Contratto</div>
        {loading ? (
          <div style={{ color: "#94a3b8", fontSize: "13px" }}>Caricamento...</div>
        ) : (
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            {contratti.map(c => {
              const tot = rows.filter(r => r.towContratto === c).reduce((s, r) => s + (Number(r.valoreTotale) || 0), 0);
              const active = selectedContratto === c;
              const isDragOver = dragOver === c;
              return (
                <div
                  key={c}
                  draggable
                  onDragStart={() => handleDragStart(c)}
                  onDragOver={e => handleDragOver(e, c)}
                  onDrop={() => handleDrop(c)}
                  onDragEnd={handleDragEnd}
                  style={{
                    display: "flex", flexDirection: "column",
                    borderRadius: "14px", overflow: "hidden",
                    border: isDragOver ? "2px dashed #1a73e8" : active ? "2px solid #1a73e8" : "2px solid #e2e8f0",
                    boxShadow: active ? "0 6px 20px rgba(26,115,232,0.22)" : "0 1px 4px rgba(0,0,0,0.06)",
                    background: isDragOver ? "#eff6ff" : active ? "linear-gradient(145deg,#1a73e8 0%,#1557b0 100%)" : "#fff",
                    transition: "border 0.15s, box-shadow 0.15s, background 0.15s",
                    minWidth: "150px",
                    cursor: "grab",
                    opacity: dragItem.current === c ? 0.5 : 1,
                    transform: isDragOver ? "scale(1.03)" : "scale(1)",
                  }}
                >
                  {/* Maniglia drag in alto + area click */}
                  <div
                    onClick={() => setSelectedContratto(c)}
                    style={{ padding: "14px 18px 10px", flex: 1, userSelect: "none" }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                      {/* Icona grip */}
                      <svg width="10" height="14" viewBox="0 0 10 14" fill="none" style={{ opacity: 0.35, flexShrink: 0 }}>
                        <circle cx="3" cy="2" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="7" cy="2" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="3" cy="7" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="7" cy="7" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="3" cy="12" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                        <circle cx="7" cy="12" r="1.2" fill={active && !isDragOver ? "#fff" : "#64748b"}/>
                      </svg>
                      <div style={{ fontSize: "16px", fontWeight: 800, letterSpacing: "-0.2px", color: active && !isDragOver ? "#fff" : "#0f172a" }}>{c}</div>
                    </div>
                    <div style={{ fontSize: "12px", fontWeight: 600, color: active && !isDragOver ? "rgba(255,255,255,0.75)" : "#64748b", paddingLeft: "16px" }}>{formatEuro(tot)}</div>
                  </div>
                  {/* Separatore + bottone elimina */}
                  <div style={{
                    borderTop: active && !isDragOver ? "1px solid rgba(255,255,255,0.2)" : "1px solid #f1f5f9",
                    padding: "6px 10px",
                    display: "flex", justifyContent: "flex-end",
                  }}>
                    <button
                      onClick={e => { e.stopPropagation(); handleDelete(c); }}
                      title={`Elimina contratto ${c}`}
                      style={{
                        display: "flex", alignItems: "center", gap: "4px",
                        padding: "3px 10px", borderRadius: "6px", border: "none", cursor: "pointer",
                        fontSize: "11px", fontWeight: 600,
                        background: active && !isDragOver ? "rgba(255,255,255,0.15)" : "#f1f5f9",
                        color: active && !isDragOver ? "rgba(255,255,255,0.8)" : "#64748b",
                        transition: "background 0.15s",
                      }}
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
          </div>
        )}
      </div>

      {/* ── KPI cards ── */}
      {!loading && selectedContratto && (() => {
        const kpis = [
          { label: "Valore Totale", key: "valoreTotale", color: "#1e293b", bg: "#f8fafc" },
          { label: "Approvato",     key: "approvato",    color: "#1a73e8", bg: "#eff6ff" },
          { label: "Ordinato",      key: "ordinatiRda",  color: "#10b981", bg: "#f0fdf4" },
          { label: "Impegnato",     key: "impegnato",    color: "#f59e0b", bg: "#fffbeb" },
          { label: "Residuo",       key: "residuo",      color: "#f97316", bg: "#fff7ed" },
        ];
        return (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: "14px", marginBottom: "24px" }}>
            {kpis.map(k => {
              const tot = filteredRows.reduce((s, r) => s + (Number(r[k.key]) || 0), 0);
              const perc = kpis[0].key !== k.key && filteredRows.reduce((s, r) => s + (Number(r.valoreTotale) || 0), 0) > 0
                ? (tot / filteredRows.reduce((s, r) => s + (Number(r.valoreTotale) || 0), 0) * 100).toFixed(1)
                : null;
              return (
                <div key={k.key} style={{ background: "#fff", borderRadius: "12px", border: "1px solid #e2e8f0", padding: "16px 18px", borderTop: `4px solid ${k.color}`, boxShadow: "0 1px 4px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize: "10px", fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "8px" }}>{k.label}</div>
                  <div style={{ fontSize: "14px", fontWeight: 800, color: k.color, letterSpacing: "-0.2px" }}>{formatEuro(tot)}</div>
                  {perc !== null && (
                    <div style={{ marginTop: "5px", display: "inline-block", fontSize: "11px", fontWeight: 700, color: k.color, background: k.bg, border: `1px solid ${k.color}33`, borderRadius: "6px", padding: "1px 7px" }}>{perc}%</div>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      {/* ── Tabella ── */}
      {!loading && selectedContratto && (
        <div style={{ background: "#fff", borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>

          {/* Header tabella */}
          <div style={{ padding: "16px 22px", borderBottom: "1px solid #e2e8f0", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#fafbfc" }}>
            <div>
              <span style={{ fontSize: "18px", fontWeight: 700, color: "#0f1012" }}>Contratto </span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#1a73e8" }}>{selectedContratto}</span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#94a3b8", marginLeft: "10px" }}>{filteredRows.length} righe</span>
            </div>
            <button
              onClick={() => setShowCollaudo(v => !v)}
              style={{
                padding: "7px 16px", borderRadius: "8px", fontSize: "12px", fontWeight: 600,
                cursor: "pointer", transition: "all 0.15s",
                border: showCollaudo ? "1.5px solid #1a73e8" : "1.5px solid #cbd5e1",
                background: showCollaudo ? "#eff6ff" : "#fff",
                color: showCollaudo ? "#1a73e8" : "#64748b",
                display: "flex", alignItems: "center", gap: "6px",
              }}
            >
              <span style={{ fontSize: "10px" }}>{showCollaudo ? "▼" : "▶"}</span>
              {showCollaudo ? "Nascondi Collaudo" : "Mostra Collaudo"}
            </button>
          </div>

          {/* Tabella scrollabile */}
          <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: "calc(100vh - 420px)" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ ...TH("left"), width: "100px" }}>TOW</th>
                  <th style={{ ...TH("right"), width: "65px" }}>QTA</th>
                  {FIELDS.filter(f => showCollaudo || !f.key.startsWith("collaudo")).map(f => (
                    <th key={f.key} style={{ ...TH("right"), width: f.group === "euro" ? "125px" : "85px", color: f.color }}>{f.label}</th>
                  ))}
                  <th style={{ ...TH("center"), width: "85px" }}>Azioni</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.length === 0 ? (
                  <tr>
                    <td colSpan={FIELDS.filter(f => showCollaudo || !f.key.startsWith("collaudo")).length + 3} style={{ padding: "48px", textAlign: "center", color: "#94a3b8", fontSize: "14px" }}>
                      Nessuna riga per il contratto selezionato
                    </td>
                  </tr>
                ) : filteredRows.map((row, idx) => (
                  <tr key={row.id}
                    style={{ background: idx % 2 === 0 ? "#fff" : "#fafafa", transition: "background 0.1s" }}
                    onMouseEnter={e => e.currentTarget.style.background = "#eff6ff"}
                    onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "#fff" : "#fafafa"}
                  >
                    <td style={{ ...TD("left"), fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis" }}>
                      <span style={{ display: "inline-block", background: "#f1f5f9", borderRadius: "5px", padding: "2px 7px", fontSize: "12px", fontWeight: 700, color: "#334155" }}>{row.tow}</span>
                    </td>
                    <td style={{ ...TD("right"), color: "#64748b", fontWeight: 500 }}>
                      {row.valoreUnitario > 0 ? formatQta(Math.round(row.valoreTotale / row.valoreUnitario)) : "—"}
                    </td>
                    {FIELDS.filter(f => showCollaudo || !f.key.startsWith("collaudo")).map(f => (
                      <td key={f.key} style={{ ...TD("right"), color: f.color, fontWeight: TOTALE_KEYS.has(f.key) ? 600 : 400 }}>
                        {f.group === "euro" ? formatEuro(row[f.key]) : formatQta(row[f.key])}
                      </td>
                    ))}
                    <td style={TD("center")}>
                      <button onClick={() => setEditRow(row)} style={{
                        padding: "4px 12px", borderRadius: "6px",
                        border: "1px solid #1a73e8", background: "#eff6ff",
                        color: "#1a73e8", fontSize: "11px", fontWeight: 700, cursor: "pointer",
                        letterSpacing: "0.2px",
                      }}>Modifica</button>
                    </td>
                  </tr>
                ))}
              </tbody>

              {/* Riga totali */}
              {filteredRows.length > 0 && (
                <tfoot>
                  <tr style={{ background: "#f1f5f9", borderTop: "2px solid #e2e8f0" }}>
                    <td style={{ ...TD("left"), fontWeight: 700, color: "#1e293b", fontSize: "12px", letterSpacing: "0.5px", textTransform: "uppercase" }}>Totale</td>
                    <td style={TD("right")} />
                    {FIELDS.filter(f => showCollaudo || !f.key.startsWith("collaudo")).map(f => {
                      if (!TOTALE_KEYS.has(f.key)) return <td key={f.key} style={TD("right")} />;
                      const tot = filteredRows.reduce((s, r) => s + (Number(r[f.key]) || 0), 0);
                        <td key={f.key} style={{ ...TD("right"), fontWeight: 800, color: f.color, fontSize: "13px" }}>
                          {f.group === "euro" ? formatEuro(tot) : formatQta(tot)}
                        </td>
                      );
                    })}
                    <td style={TD("center")} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}

      {editRow && <EditModal row={editRow} onClose={() => setEditRow(null)} onSaved={handleSaved} />}
      {showNewContratto && <NewContrattoModal onClose={() => setShowNewContratto(false)} onCreated={handleCreated} />}
    </div>
  );
}
