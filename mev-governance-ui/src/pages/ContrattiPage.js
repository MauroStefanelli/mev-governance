import { useEffect, useState } from "react";
import { getContratti, alignContratti } from "../services/mevService";

const formatEuro = (value) => {
  if (value === null || value === undefined || value === "") return "€ 0,00";
  const num = parseFloat(value);
  if (isNaN(num)) return "€ 0,00";
  const [intPart, decPart] = num.toFixed(2).split(".");
  return `€ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

const TD = { padding: "6px 10px", fontSize: "13px", color: "#333", verticalAlign: "middle", whiteSpace: "nowrap" };

function ContrattiPage({ onUnauthorized }) {
  const [contratti, setContratti] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [aligning, setAligning]   = useState(false);
  const [openIds, setOpenIds]      = useState({});
  const role = localStorage.getItem("role") || "";

  const load = async () => {
    setLoading(true);
    try {
      const data = await getContratti();
      setContratti(data);
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const toggleOpen = (id) =>
    setOpenIds((prev) => ({ ...prev, [id]: !prev[id] }));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento Contratti...
    </div>
  );

  return (
    <div style={{ padding: "20px 24px" }}>

      {/* Toolbar */}
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "24px" }}>
        <button
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "7px 16px", borderRadius: "6px", fontSize: "13px", fontWeight: 600,
            cursor: aligning ? "not-allowed" : "pointer", border: "none",
            background: "#1a73e8", color: "#fff", boxShadow: "0 1px 3px rgba(26,115,232,.35)",
            opacity: aligning ? 0.7 : 1,
          }}
          disabled={aligning}
          onClick={async () => {
            if (!window.confirm("Allineare i dati Contratti dall'Excel ufficiale?")) return;
            setAligning(true);
            try {
              const result = await alignContratti();
              alert(`Allineamento completato: ${result.count} contratti caricati`);
              await load();
            } catch (e) {
              alert(`Errore allineamento contratti:\n${e.message}`);
            } finally {
              setAligning(false);
            }
          }}
        >
          {aligning ? "Allineamento..." : "⟳ Allinea Contratti"}
        </button>

        <span style={{ fontSize: "12px", color: "#888" }}>
          {contratti.length} contratti
        </span>
      </div>

      {/* Lista contratti */}
      <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
        {contratti.length === 0 && (
          <div style={{ textAlign: "center", padding: "60px", color: "#888", fontSize: "14px" }}>
            Nessun contratto. Carica il file Excel e clicca "Allinea Contratti".
          </div>
        )}

        {contratti.map((c) => (
          <div key={c.id} style={{
            borderRadius: "10px", border: "1px solid #dadce0",
            boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden",
          }}>

            {/* Intestazione contratto */}
            <div style={{
              background: "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)",
              padding: "12px 16px",
              display: "flex", alignItems: "center", flexWrap: "wrap", gap: "8px 24px",
            }}>
              {/* RIF + Tipo */}
              <div style={{ display: "flex", alignItems: "center", gap: "10px", minWidth: "220px" }}>
                <span style={{
                  background: "rgba(255,255,255,0.2)", borderRadius: "6px",
                  padding: "3px 10px", fontSize: "13px", fontWeight: 700, color: "white",
                }}>
                  {c.rifContratto}
                </span>
                <span style={{ fontSize: "12px", color: "rgba(255,255,255,0.85)", fontWeight: 500 }}>
                  {c.tipoContratto}
                </span>
                {c.data && (
                  <span style={{ fontSize: "11px", color: "rgba(255,255,255,0.65)" }}>
                    {c.data}
                  </span>
                )}
              </div>

              {/* Importi */}
              {[
                { label: "Imp. Lordo",     value: c.impLordo },
                { label: "Sconto",         value: c.sconto },
                { label: "Importo Netto",  value: c.importoNetto },
                { label: "Ordinato",       value: c.ordinato },
                { label: "Da Ordinare",    value: c.daOrdinare },
                { label: "Avanzato",       value: c.avanzato },
                { label: "Da Avanzare",    value: c.daAvanzare },
              ].map(({ label, value }) => (
                <div key={label} style={{ textAlign: "right" }}>
                  <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.65)", textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
                  <div style={{ fontSize: "13px", fontWeight: 600, color: "white" }}>{formatEuro(value)}</div>
                </div>
              ))}

              {/* Tasto MEV */}
              <div style={{ marginLeft: "auto" }}>
                <button
                  onClick={() => toggleOpen(c.id)}
                  style={{
                    padding: "5px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
                    cursor: "pointer", border: "1px solid rgba(255,255,255,0.5)",
                    background: openIds[c.id] ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.15)",
                    color: openIds[c.id] ? "#1a73e8" : "white",
                    transition: "all 0.15s",
                  }}
                >
                  {openIds[c.id] ? "▲ Nascondi MEV" : `▼ MEV (${c.mevItems.length})`}
                </button>
              </div>
            </div>

            {/* Tabella righe MEV */}
            {openIds[c.id] && (
              <div style={{ overflowX: "auto" }}>
                {c.mevItems.length === 0 ? (
                  <div style={{ padding: "16px 20px", fontSize: "13px", color: "#888", fontStyle: "italic" }}>
                    Nessuna riga MEV collegata a questo contratto.
                  </div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                    <thead>
                      <tr style={{ background: "#f8f9fa", borderBottom: "2px solid #dadce0" }}>
                        {["BC", "Contratto", "AT ID", "Ordinato (BdO)", "Anno", "Applicativo", "Descrizione", "Stato", "Importo CAP"].map((h) => (
                          <th key={h} style={{
                            padding: "8px 10px", textAlign: h === "Ordinato (BdO)" || h === "Importo CAP" ? "right" : "left",
                            fontWeight: 600, fontSize: "12px", color: "#444", whiteSpace: "nowrap",
                          }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {c.mevItems.map((m, idx) => (
                        <tr key={m.id} style={{
                          backgroundColor: idx % 2 === 0 ? "white" : "#fafafa",
                          borderBottom: "1px solid #f0f0f0",
                        }}>
                          <td style={TD}>{m.bc}</td>
                          <td style={TD}>{m.contratto}</td>
                          <td style={TD}>{m.atId}</td>
                          <td style={{ ...TD, textAlign: "right" }}>{formatEuro(m.ordinatoBdo)}</td>
                          <td style={{ ...TD, textAlign: "center" }}>{m.annoCompetenza}</td>
                          <td style={TD}>{m.applicativo}</td>
                          <td style={{ ...TD, maxWidth: "280px", whiteSpace: "normal" }}>{m.descrizione}</td>
                          <td style={TD}>
                            <span style={{
                              display: "inline-block", padding: "2px 8px", borderRadius: "12px", fontSize: "12px",
                              background: m.stato === "Approvato" ? "#e6f4ea" : m.stato === "In approvazione" ? "#fff8e1" : "#f1f3f4",
                              color:      m.stato === "Approvato" ? "#2e7d32" : m.stato === "In approvazione" ? "#e65100" : "#555",
                            }}>{m.stato || "(vuoto)"}</span>
                          </td>
                          <td style={{ ...TD, textAlign: "right" }}>{formatEuro(m.importoExcel)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background: "#f0f4ff", borderTop: "2px solid #dadce0" }}>
                        <td colSpan={3} style={{ ...TD, fontWeight: 700, fontSize: "12px", color: "#1a73e8" }}>Totale</td>
                        <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: "#1a73e8" }}>
                          {formatEuro(c.mevItems.reduce((s, m) => s + (m.ordinatoBdo || 0), 0))}
                        </td>
                        <td colSpan={4} />
                        <td style={{ ...TD, textAlign: "right", fontWeight: 700, color: "#1a73e8" }}>
                          {formatEuro(c.mevItems.reduce((s, m) => s + (m.importoExcel || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default ContrattiPage;
