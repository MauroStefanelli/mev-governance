import React, { useEffect, useState, useCallback } from "react";
import { getConsumoTow, updateConsumoTow } from "../services/mevService";

// ── Stili condivisi ───────────────────────────────────────────────────────────
const labelStyle = {
  fontSize: "11px", fontWeight: 700, color: "#64748b",
  textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "4px",
};
const inputStyle = {
  padding: "7px 10px", borderRadius: "6px",
  border: "1px solid #dadce0", fontSize: "13px",
  background: "#fff", width: "100%", boxSizing: "border-box",
};
const inputStyleReadonly = {
  ...inputStyle,
  background: "#f1f5f9", color: "#64748b", cursor: "not-allowed",
};

const formatNum = (v) => {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(v);
  return isNaN(n) ? v : n.toLocaleString("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const formatEuro = (v) => {
  if (v === null || v === undefined || v === "") return "";

  const n = Number(v);

  if (isNaN(n)) return "";

  return `€ ${new Intl.NumberFormat("it-IT", {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
    useGrouping: true,
  }).format(n)}`;
};

const formatQta = (v) => {
  if (v === null || v === undefined || isNaN(v)) return "";

  return v.toLocaleString("it-IT", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
};

const parseNum = (v) => {
  if (v === "" || v === null || v === undefined) return 0;
  // accetta sia virgola che punto come separatore decimale
  const s = String(v).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

// Campi numerici con label e chiave
const NUMERIC_FIELDS = [
  { key: "valoreUnitario", label: "Valore Unitario" },
  { key: "valoreTotale", label: "Valore Totale" },
  { key: "approvato", label: "Approvato" },
  { key: "ordinatiRda", label: "Ordinati (RDA)" },
  { key: "impegnato", label: "Impegnato" },
  { key: "residuo", label: "Residuo" },
  { key: "towApprovati", label: "TOW Approvati" },
  { key: "towImpegnati", label: "TOW Impegnati" },
  { key: "towResidui", label: "TOW Residui" },
  { key: "collaudoApprovato", label: "Collaudo Approvato" },
  { key: "collaudoOrdinato", label: "Collaudo Ordinato" },
  { key: "collaudoFatturato", label: "Collaudo Fatturato" },
];

// ── Componente modale di modifica ────────────────────────────────────────────
function EditModal({ row, onClose, onSaved }) {
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    // Inizializza il form con i valori formattati
    const init = {};
    NUMERIC_FIELDS.forEach(f => {
      init[f.key] = formatNum(row[f.key]);
    });
    init.tow = row.tow || "";
    init.towContratto = row.towContratto || "";
    setForm(init);
  }, [row]);

  const handleChange = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const payload = {
        tow: form.tow,
        towContratto: form.towContratto,
      };
      NUMERIC_FIELDS.forEach(f => {
        payload[f.key] = parseNum(form[f.key]);
      });
      const updated = await updateConsumoTow(row.id, payload);
      onSaved(updated);
      onClose();
    } catch (e) {
      setError(e.message || "Errore durante il salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
      zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center",
      padding: "16px",
    }}>
      <div style={{
        background: "#fff", borderRadius: "14px",
        boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
        width: "100%", maxWidth: "680px",
        maxHeight: "90vh", display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 24px 14px", borderBottom: "1px solid #e2e8f0",
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1e293b" }}>
              Modifica TOW
            </div>
            <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
              {row.tow} — {row.towContratto}
            </div>
          </div>
          <button onClick={onClose} style={{
            background: "none", border: "none", cursor: "pointer",
            fontSize: "20px", color: "#94a3b8", lineHeight: 1,
          }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY: "auto", padding: "20px 24px", flex: 1 }}>
          {error && (
            <div style={{
              background: "#fce4ec", color: "#c62828", border: "1px solid #f8bbd0",
              borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px",
            }}>{error}</div>
          )}

          {/* TOW e Contratto - readonly */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
            <div>
              <div style={labelStyle}>TOW</div>
              <input style={inputStyleReadonly} value={form.tow || ""} readOnly />
            </div>
            <div>
              <div style={labelStyle}>Contratto</div>
              <input style={inputStyleReadonly} value={form.towContratto || ""} readOnly />
            </div>
          </div>

          {/* Campi numerici in griglia 2 colonne */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px" }}>
            {NUMERIC_FIELDS.map(f => (
              <div key={f.key}>
                <div style={labelStyle}>{f.label}</div>
                <input
                  style={inputStyle}
                  value={form[f.key] ?? ""}
                  onChange={e => handleChange(f.key, e.target.value)}
                  onFocus={e => {
                    // Mostra il numero grezzo per editing
                    const raw = parseNum(form[f.key]);
                    handleChange(f.key, raw === 0 ? "" : String(raw).replace(".", ","));
                  }}
                  onBlur={e => {
                    // Riformatta al blur
                    handleChange(f.key, formatNum(parseNum(e.target.value)));
                  }}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          padding: "14px 24px", borderTop: "1px solid #e2e8f0",
          display: "flex", justifyContent: "flex-end", gap: "10px",
        }}>
          <button onClick={onClose} style={{
            padding: "8px 20px", borderRadius: "8px", border: "1px solid #dadce0",
            background: "#fff", fontSize: "13px", cursor: "pointer", color: "#374151",
          }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{
            padding: "8px 20px", borderRadius: "8px", border: "none",
            background: saving ? "#93c5fd" : "#1a73e8",
            color: "#fff", fontSize: "13px", fontWeight: 600,
            cursor: saving ? "not-allowed" : "pointer",
          }}>
            {saving ? "Salvataggio..." : "Salva"}
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

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const data = await getConsumoTow();
      setRows(data);
      const tipi = [...new Set(data.map(r => r.towContratto).filter(Boolean))].sort();
      setContratti(tipi);
      if (tipi.length > 0 && !selectedContratto) {
        setSelectedContratto(tipi[0]);
      }
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
      else setError("Errore nel caricamento dei dati");
    } finally {
      setLoading(false);
    }
  }, []); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  const filteredRows = selectedContratto
    ? rows.filter(r => r.towContratto === selectedContratto)
    : [];

  const totaleContratto = filteredRows.reduce(
    (sum, row) => sum + (Number(row.valoreTotale) || 0), 0
  );

  const handleSaved = (updated) => {
    setRows(prev => prev.map(r => r.id === updated.id ? updated : r));
    setSuccessMsg("Riga aggiornata con successo");
    setTimeout(() => setSuccessMsg(""), 3000);
  };

  const euroFields = [
    "valoreUnitario",
    "valoreTotale",
    "approvato",
    "ordinatiRda",
    "impegnato",
    "residuo"
  ];

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "24px 16px" }}>
      {/* Titolo */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        marginBottom: "24px", paddingBottom: "16px",
        borderBottom: "2px solid #f1f5f9",
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#1e293b" }}>
            TOW — Contratto
          </h2>
          <p style={{ margin: "4px 0 0", fontSize: "13px", color: "#64748b" }}>
            Visualizza e modifica i dati relativi ai Tow per contratto
          </p>
        </div>
      </div>

      {/* Messaggi */}
      {error && (
        <div style={{
          background: "#fce4ec", color: "#c62828", border: "1px solid #f8bbd0",
          borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px",
        }}>{error}</div>
      )}
      {successMsg && (
        <div style={{
          background: "#e8f5e9", color: "#2e7d32", border: "1px solid #c8e6c9",
          borderRadius: "8px", padding: "10px 14px", marginBottom: "16px", fontSize: "13px",
        }}>{successMsg}</div>
      )}

      {/* Selezione contratto */}
      <div style={{
        background: "#fff", borderRadius: "12px",
        border: "1px solid #e2e8f0", padding: "16px 20px",
        marginBottom: "20px", display: "flex", alignItems: "center", gap: "16px",
        flexWrap: "wrap",
      }}>
        <div style={labelStyle}>Contratto</div>
        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {contratti.map(c => {
            const totale = rows
              .filter(r => r.towContratto === c)
              .reduce(
                (sum, r) => sum + (Number(r.valoreTotale) || 0),
                0
              );

            return (
              <button
                key={c}
                onClick={() => setSelectedContratto(c)}
                style={{
                  padding: "8px 18px",
                  borderRadius: "20px",
                  fontSize: "13px",
                  fontWeight: selectedContratto === c ? 700 : 400,
                  border:
                    selectedContratto === c
                      ? "2px solid #1a73e8"
                      : "2px solid #e2e8f0",
                  background:
                    selectedContratto === c
                      ? "#eff6ff"
                      : "#fff",
                  color:
                    selectedContratto === c
                      ? "#1a73e8"
                      : "#374151",
                  cursor: "pointer",
                }}
              >
                <div>{c}</div>

                <div
                  style={{
                    fontSize: "11px",
                    fontWeight: 700,
                    marginTop: "2px"
                  }}
                >
                  {formatEuro(totale)}
                </div>
              </button>
            );
          })}

        </div>
        {loading && (
          <span style={{ fontSize: "12px", color: "#94a3b8", marginLeft: "auto" }}>
            Caricamento...
          </span>
        )}
      </div>

      {/* Tabella */}
      {!loading && selectedContratto && (
        <div style={{
          background: "#fff", borderRadius: "12px",
          border: "1px solid #e2e8f0", overflow: "hidden",
          boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
        }}>
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                minWidth: "2300px",
                borderCollapse: "collapse",
                fontSize: "13px"
              }}
            >
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th
                    style={{
                      padding: "11px 14px",
                      textAlign: "left",
                      fontWeight: 700,
                      color: "#374151",
                      borderBottom: "2px solid #e2e8f0",
                      whiteSpace: "nowrap"
                    }}
                  >
                    TOW
                  </th>

                  <th
                    style={{
                      padding: "11px 14px",
                      textAlign: "right",
                      fontWeight: 700,
                      color: "#374151",
                      borderBottom: "2px solid #e2e8f0",
                      whiteSpace: "nowrap"
                    }}
                  >
                    QTA
                  </th>

                  {NUMERIC_FIELDS.map((f) => (
                    <th
                      key={f.key}
                      style={{
                        padding: "11px 14px",
                        textAlign: "right",
                        fontWeight: 700,
                        color: "#374151",
                        borderBottom: "2px solid #e2e8f0",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {f.label}
                    </th>
                  ))}

                  <th
                    style={{
                      padding: "11px 14px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: "#374151",
                      borderBottom: "2px solid #e2e8f0"
                    }}
                  >
                    Azioni
                  </th>
                </tr>
              </thead>

            </table>
          </div>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={NUMERIC_FIELDS.length + 3}
                  style={{
                    padding: "32px",
                    textAlign: "center",
                    color: "#94a3b8"
                  }}
                >
                  Nessuna riga trovata per il contratto selezionato
                </td>
              </tr>
            ) : (
              filteredRows.map((row, idx) => (
                <tr
                  key={row.id}
                  style={{ background: idx % 2 === 0 ? "#fff" : "#f8fafc" }}
                >
                  <td
                    style={{
                      padding: "10px 14px",
                      fontWeight: 600,
                      color: "#1e293b",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {row.tow}
                  </td>

                  {/* QTA */}
                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "right",
                      color: "#374151",
                      borderBottom: "1px solid #f1f5f9",
                      whiteSpace: "nowrap"
                    }}
                  >
                    {row.valoreUnitario > 0
                      ? Math.round(row.valoreTotale / row.valoreUnitario)
                      : ""}
                  </td>

                  {NUMERIC_FIELDS.map((f) => (
                    <td
                      key={f.key}
                      style={{
                        padding: "10px 14px",
                        textAlign: "right",
                        color: "#374151",
                        borderBottom: "1px solid #f1f5f9",
                        whiteSpace: "nowrap"
                      }}
                    >
                      {euroFields.includes(f.key)
                        ? formatEuro(row[f.key])
                        : formatNum(row[f.key])}
                    </td>
                  ))}

                  <td
                    style={{
                      padding: "10px 14px",
                      textAlign: "center",
                      borderBottom: "1px solid #f1f5f9"
                    }}
                  >
                    <button
                      onClick={() => setEditRow(row)}
                      style={{
                        padding: "5px 14px",
                        borderRadius: "6px",
                        border: "1px solid #1a73e8",
                        background: "#eff6ff",
                        color: "#1a73e8",
                        fontSize: "12px",
                        fontWeight: 600,
                        cursor: "pointer"
                      }}
                    >
                      Modifica
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
          {/* Footer conteggio */}
          <div style={{
            padding: "10px 16px", borderTop: "1px solid #e2e8f0",
            fontSize: "12px", color: "#94a3b8",
          }}>
            {filteredRows.length} righe per contratto <strong>{selectedContratto}</strong>
          </div>
        </div>
      )
      }

      {/* Modale modifica */}
      {
        editRow && (
          <EditModal
            row={editRow}
            onClose={() => setEditRow(null)}
            onSaved={handleSaved}
          />
        )
      }
    </div >
  );
}
