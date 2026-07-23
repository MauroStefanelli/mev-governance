import React, { useEffect, useState, useCallback } from "react";
import { getConsumoTow, updateConsumoTow } from "../services/mevService";

const formatEuro = (v) => {
  const n = Number(v);
  if (isNaN(n)) return "—";
  return new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
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

// Campi con totale abilitato
const TOTALE_KEYS = new Set(["valoreTotale", "approvato", "ordinatiRda", "impegnato", "residuo"]);

const FIELDS = [
  { key: "valoreUnitario",    label: "Valore Unitario",     group: "euro", color: "#64748b" },
  { key: "valoreTotale",      label: "Valore Totale",        group: "euro", color: "#1e293b" },
  { key: "approvato",         label: "Approvato",            group: "euro", color: "#1a73e8" },
  { key: "ordinatiRda",       label: "Ordinati (RDA)",       group: "euro", color: "#10b981" },
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

// ── Modale ────────────────────────────────────────────────────────────────────
function EditModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const init = { tow: row.tow || "", towContratto: row.towContratto || "" };
    FIELDS.forEach(f => { init[f.key] = row[f.key] ?? 0; });
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
                  onBlur={e => set(f.key, parseNum(e.target.value))}
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
                  onBlur={e => set(f.key, parseNum(e.target.value))}
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
  const [successMsg, setSuccessMsg] = useState("");
  const [showCollaudo, setShowCollaudo] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const data = await getConsumoTow();
      setRows(data);
      const tipi = [...new Set(data.map(r => r.towContratto).filter(Boolean))].sort();
      setContratti(tipi);
      setSelectedContratto(prev => prev || tipi[0] || "");
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
      else setError("Errore nel caricamento dei dati");
    } finally { setLoading(false); }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const filteredRows = selectedContratto ? rows.filter(r => r.towContratto === selectedContratto) : [];

  const handleSaved = (updated) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSuccessMsg("Riga aggiornata con successo");
    setTimeout(() => setSuccessMsg(""), 3500);
  };

  return (
    <div style={{ padding: "28px 24px", minHeight: "100vh", background: "#f1f5f9" }}>

      {/* ── Titolo ── */}
      <div style={{ marginBottom: "24px", display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: "12px" }}>
        <div>
          <div style={{ fontSize: "11px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "1px", marginBottom: "4px" }}>Admin</div>
          <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 800, color: "#0f172a", letterSpacing: "-0.3px" }}>Gestione Consumo TOW</h2>
          <p style={{ margin: "5px 0 0", fontSize: "13px", color: "#64748b" }}>Seleziona un contratto per visualizzare e modificare le righe</p>
        </div>
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
              return (
                <button key={c} onClick={() => setSelectedContratto(c)} style={{
                  padding: "12px 22px", borderRadius: "12px", cursor: "pointer", textAlign: "left",
                  border: active ? "2px solid #1a73e8" : "2px solid #e2e8f0",
                  background: active ? "linear-gradient(135deg,#1a73e8 0%,#1557b0 100%)" : "#f8fafc",
                  color: active ? "#fff" : "#374151",
                  boxShadow: active ? "0 6px 16px rgba(26,115,232,0.28)" : "0 1px 3px rgba(0,0,0,0.04)",
                  transition: "all 0.18s",
                  minWidth: "120px",
                }}>
                  <div style={{ fontSize: "15px", fontWeight: 800, letterSpacing: "-0.2px" }}>{c}</div>
                  <div style={{ fontSize: "11px", marginTop: "3px", opacity: active ? 0.85 : 0.55, fontWeight: 600 }}>{formatEuro(tot)}</div>
                </button>
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
              <span style={{ fontSize: "14px", fontWeight: 700, color: "#0f172a" }}>Contratto </span>
              <span style={{ fontSize: "14px", fontWeight: 800, color: "#1a73e8" }}>{selectedContratto}</span>
              <span style={{ fontSize: "12px", fontWeight: 500, color: "#94a3b8", marginLeft: "10px" }}>{filteredRows.length} righe</span>
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
                      return (
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
    </div>
  );
}
