import { useEffect, useState } from "react";
import { getContratti, alignContratti } from "../services/mevService";

const formatEuro = (value) => {
  if (value === null || value === undefined || value === "") return "€ 0,00";
  const num = parseFloat(value);
  if (isNaN(num)) return "€ 0,00";
  const [intPart, decPart] = num.toFixed(2).split(".");
  return `€ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

const TD      = { padding: "7px 12px", fontSize: "13px", color: "#333", verticalAlign: "middle", whiteSpace: "nowrap" };
const TD_R    = { ...TD, textAlign: "right" };
const TD_C    = { ...TD, textAlign: "center" };
const TH_BASE = { padding: "8px 12px", fontSize: "12px", fontWeight: 600, color: "#444", whiteSpace: "nowrap", background: "#f8f9fa" };
const TH_R    = { ...TH_BASE, textAlign: "right" };
const TH_L    = { ...TH_BASE, textAlign: "left" };

function ContrattiPage({ onUnauthorized }) {
  const [contratti, setContratti] = useState([]);
  const [loading, setLoading]     = useState(true);
  const [aligning, setAligning]   = useState(false);
  const [openIds, setOpenIds]     = useState({});

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
        <span style={{ fontSize: "12px", color: "#888" }}>{contratti.length} contratti</span>
      </div>

      {/* Nessun dato */}
      {contratti.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: "#888", fontSize: "14px" }}>
          Nessun contratto. Carica il file Excel e clicca "Allinea Contratti".
        </div>
      )}

      {/* Tabella contratti */}
      {contratti.length > 0 && (
        <div style={{ borderRadius: "10px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #dadce0" }}>
                <th style={{ ...TH_L, width: "32px" }} />
                <th style={TH_L}>RIF. Contratto</th>
                <th style={TH_R}>Imp. Lordo</th>
                <th style={TH_R}>Importo Netto</th>
                <th style={TH_R}>Ordinato</th>
                <th style={TH_R}>Da Ordinare</th>
                <th style={TH_R}>Avanzato</th>
                <th style={TH_R}>Da Avanzare</th>
              </tr>
            </thead>
            <tbody>
              {contratti.map((c, idx) => {
                const isOpen = !!openIds[c.id];

                // Raggruppa le righe MEV per Anno Competenza
                const byAnno = {};
                (c.mevItems || []).forEach((m) => {
                  const anno = m.annoCompetenza || "N/D";
                  if (!byAnno[anno]) byAnno[anno] = [];
                  byAnno[anno].push(m);
                });
                const anni = Object.keys(byAnno).sort();

                return (
                  <>
                    {/* Riga contratto cliccabile */}
                    <tr
                      key={c.id}
                      onClick={() => toggleOpen(c.id)}
                      style={{
                        backgroundColor: isOpen ? "#e8f0fe" : idx % 2 === 0 ? "white" : "#fafafa",
                        borderBottom: isOpen ? "none" : "1px solid #f0f0f0",
                        cursor: "pointer",
                        transition: "background-color 0.1s",
                      }}
                      onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.backgroundColor = "#f0f4ff"; }}
                      onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.backgroundColor = idx % 2 === 0 ? "white" : "#fafafa"; }}
                    >
                      {/* Freccia */}
                      <td style={{ ...TD_C, color: "#1a73e8", fontWeight: 700, fontSize: "11px" }}>
                        {isOpen ? "▲" : "▶"}
                      </td>
                      <td style={{ ...TD, fontWeight: 600, color: "#1a73e8" }}>{c.rifContratto}</td>
                      <td style={TD_R}>{formatEuro(c.impLordo)}</td>
                      <td style={TD_R}>{formatEuro(c.importoNetto)}</td>
                      <td style={TD_R}>{formatEuro(c.ordinato)}</td>
                      <td style={TD_R}>{formatEuro(c.daOrdinare)}</td>
                      <td style={TD_R}>{formatEuro(c.avanzato)}</td>
                      <td style={TD_R}>{formatEuro(c.daAvanzare)}</td>
                    </tr>

                    {/* Dettaglio MEV per Anno — espandibile */}
                    {isOpen && (
                      <tr key={`${c.id}-detail`}>
                        <td colSpan={8} style={{ padding: "0", borderBottom: "2px solid #1a73e8" }}>
                          <div style={{ background: "#f8fbff", padding: "12px 24px 16px 40px" }}>
                            {anni.length === 0 ? (
                              <div style={{ fontSize: "13px", color: "#888", fontStyle: "italic", padding: "8px 0" }}>
                                Nessuna riga MEV collegata a questo contratto.
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                                {anni.map((anno) => {
                                  const righe = byAnno[anno];
                                  const totImporto   = righe.reduce((s, m) => s + (Number(m.importoExcel) || 0), 0);
                                  const totOrdinato  = righe.reduce((s, m) => s + (Number(m.ordinatoBdo)  || 0), 0);

                                  return (
                                    <div key={anno}>
                                      {/* Intestazione anno */}
                                      <div style={{
                                        fontSize: "12px", fontWeight: 700, color: "#1a73e8",
                                        textTransform: "uppercase", letterSpacing: "0.5px",
                                        marginBottom: "4px", paddingLeft: "4px",
                                        borderLeft: "3px solid #1a73e8", paddingLeft: "8px",
                                      }}>
                                        Anno {anno}
                                      </div>

                                      <div style={{ overflowX: "auto", borderRadius: "6px", border: "1px solid #dadce0" }}>
                                        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                          <thead>
                                            <tr style={{ borderBottom: "2px solid #dadce0" }}>
                                              <th style={TH_L}>BC</th>
                                              <th style={TH_R}>Importo Fornitura</th>
                                              <th style={TH_R}>Ordinato (BdO)</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {righe.map((m, i) => (
                                              <tr key={m.id} style={{
                                                backgroundColor: i % 2 === 0 ? "white" : "#fafafa",
                                                borderBottom: "1px solid #f0f0f0",
                                              }}>
                                                <td style={TD}>{m.bc}</td>
                                                <td style={TD_R}>{formatEuro(m.importoExcel)}</td>
                                                <td style={TD_R}>{formatEuro(m.ordinatoBdo)}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                          <tfoot>
                                            <tr style={{ background: "#e8f0fe", borderTop: "2px solid #dadce0" }}>
                                              <td style={{ ...TD, fontWeight: 700, color: "#1a73e8" }}>
                                                Totale — {righe.length} righe
                                              </td>
                                              <td style={{ ...TD_R, fontWeight: 700, color: "#1a73e8" }}>{formatEuro(totImporto)}</td>
                                              <td style={{ ...TD_R, fontWeight: 700, color: "#1a73e8" }}>{formatEuro(totOrdinato)}</td>
                                            </tr>
                                          </tfoot>
                                        </table>
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default ContrattiPage;
