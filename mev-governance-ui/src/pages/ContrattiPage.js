import { useEffect, useState } from "react";
import { getContrattiPubblico, getConsumoTow } from "../services/mevService";

const formatEuro = (value) => {
  if (value === null || value === undefined || value === "") return "€ 0,00";
  const num = parseFloat(value);
  if (isNaN(num)) return "€ 0,00";
  const [intPart, decPart] = num.toFixed(2).split(".");
  return `€ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

const TH = (align = "left") => ({
  padding: "8px 12px", fontSize: "12px", fontWeight: 600, color: "#444",
  whiteSpace: "nowrap", background: "#f8f9fa", textAlign: align,
  borderBottom: "2px solid #dadce0",
});
const TD = (align = "left", extra = {}) => ({
  padding: "6px 12px", fontSize: "13px", color: "#333",
  verticalAlign: "middle", whiteSpace: "nowrap", textAlign: align, ...extra,
});

function ContrattiPage({ onUnauthorized }) {
  const [contratti, setContratti]         = useState([]);
  const [towRows, setTowRows]             = useState([]);
  const [loading, setLoading]             = useState(true);
  const [openContratti, setOpenContratti] = useState({});
  const [openAnni, setOpenAnni]           = useState({});

  const load = async () => {
    setLoading(true);
    try {
      const [data, tow] = await Promise.all([getContrattiPubblico(), getConsumoTow()]);
      setContratti(data);
      setTowRows(tow);
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  const toggleContratto = (id) =>
    setOpenContratti((p) => ({ ...p, [id]: !p[id] }));
  const toggleAnno = (key) =>
    setOpenAnni((p) => ({ ...p, [key]: !p[key] }));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento Contratti...
    </div>
  );

  return (
    <div style={{ padding: "20px 24px" }}>

      {/* ── Sezione ConsumoTOW ── */}
      {towRows.length > 0 && (() => {
        const TOW_TASK = ["TOW02.1","TOW02.2","TOW02.3","TOW02.4","TOW02.6"];
        const TOW_5    = ["TOW02.5"];
        const group = (keys) => towRows.filter(r => keys.some(k => r.voce?.toUpperCase().includes(k)));
        const sum   = (rows, field) => rows.reduce((s, r) => s + (r[field] || 0), 0);
        const servTask = group(TOW_TASK);
        const tow5     = group(TOW_5);
        const sections = [
          { label: "Servizi a TASK", rows: servTask },
          { label: "TOW02.5",        rows: tow5 },
        ].filter(s => s.rows.length > 0);
        return (
          <div style={{ marginBottom: "24px" }}>
            <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a73e8", marginBottom: "8px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
              Consumo TOW
            </div>
            <div style={{ borderRadius: "10px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                <thead>
                  <tr>
                    <th style={TH()}>Voce</th>
                    <th style={TH("right")}>Valore Totale</th>
                    <th style={TH("right")}>Approvato</th>
                    <th style={TH("right")}>Ordinati (RDA)</th>
                    <th style={TH("right")}>Impegnato</th>
                    <th style={TH("right")}>Residuo</th>
                  </tr>
                </thead>
                <tbody>
                  {sections.map((sec, si) => (
                    <>
                      {/* Riga totale sezione */}
                      <tr key={`sec-${si}`} style={{ background: "#e8f0fe", borderBottom: "2px solid #1a73e8" }}>
                        <td style={TD("left", { fontWeight: 700, color: "#1a73e8" })}>{sec.label}</td>
                        <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "valoreTotale"))}</td>
                        <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "approvato"))}</td>
                        <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "ordinatiRda"))}</td>
                        <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "impegnato"))}</td>
                        <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "residuo"))}</td>
                      </tr>
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {contratti.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: "#888", fontSize: "14px" }}>
          Nessun contratto disponibile.
        </div>
      )}

      {contratti.length > 0 && (
        <div style={{ borderRadius: "10px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={TH()} />
                <th style={TH()}>Tipo Contratto</th>
                <th style={TH()}>RIF. Contratto</th>
                <th style={TH("right")}>Importo</th>
                <th style={TH("right")}>Ordinato</th>
                <th style={TH("right")}>Da Ordinare</th>
                <th style={TH("right")}>Avanzato</th>
                <th style={TH("right")}>Da Avanzare</th>
              </tr>
            </thead>
            <tbody>
              {contratti.map((c, ci) => {
                const isOpen = !!openContratti[c.id];
                return (
                  <>
                    {/* Riga contratto */}
                    <tr
                      key={c.id}
                      onClick={() => toggleContratto(c.id)}
                      style={{
                        background: isOpen ? "#e8f0fe" : ci % 2 === 0 ? "white" : "#fafafa",
                        borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                      }}
                      onMouseEnter={(e) => { if (!isOpen) e.currentTarget.style.background = "#f0f4ff"; }}
                      onMouseLeave={(e) => { if (!isOpen) e.currentTarget.style.background = ci % 2 === 0 ? "white" : "#fafafa"; }}
                    >
                      <td style={TD("center", { width: "32px", color: "#1a73e8", fontWeight: 700, fontSize: "11px" })}>
                        {isOpen ? "▲" : "▶"}
                      </td>
                      <td style={TD("left", { color: "#555" })}>{c.tipoContratto}</td>
                      <td style={TD("left", { fontWeight: 600, color: "#1a73e8" })}>{c.rifContratto}</td>
                      <td style={TD("right")}>{formatEuro(c.importo)}</td>
                      <td style={TD("right")}>{formatEuro(c.ordinato)}</td>
                      <td style={TD("right")}>{formatEuro(c.daOrdinare)}</td>
                      <td style={TD("right")}>{formatEuro(c.avanzato)}</td>
                      <td style={TD("right")}>{formatEuro(c.daAvanzare)}</td>
                    </tr>

                    {/* Dettaglio anni */}
                    {isOpen && (
                      <tr key={`${c.id}-anni`}>
                        <td colSpan={8} style={{ padding: 0, borderBottom: "2px solid #1a73e8" }}>
                          <div style={{ background: "#f8fbff", padding: "10px 16px 14px 32px" }}>
                            {c.anni.length === 0 ? (
                              <div style={{ fontSize: "13px", color: "#888", fontStyle: "italic" }}>
                                Nessun ODA collegato a questo contratto.
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {c.anni.map((a) => {
                                  const annoKey = `${c.id}-${a.anno}`;
                                  const annoOpen = !!openAnni[annoKey];
                                  return (
                                    <div key={annoKey} style={{ borderRadius: "8px", border: "1px solid #dadce0", overflow: "hidden" }}>

                                      {/* Intestazione anno cliccabile */}
                                      <div
                                        onClick={() => toggleAnno(annoKey)}
                                        style={{
                                          display: "flex", alignItems: "center", gap: "16px",
                                          padding: "8px 14px", cursor: "pointer",
                                          background: annoOpen ? "#e8f0fe" : "#f0f4ff",
                                          borderBottom: annoOpen ? "1px solid #dadce0" : "none",
                                        }}
                                      >
                                        <span style={{ fontSize: "11px", color: "#1a73e8", fontWeight: 700 }}>
                                          {annoOpen ? "▲" : "▶"}
                                        </span>
                                        <span style={{ fontWeight: 700, color: "#1a73e8", fontSize: "13px" }}>
                                          Anno {a.anno}
                                        </span>
                                      </div>

                                      {/* Tabella ODA per anno */}
                                      {annoOpen && (
                                        <div style={{ background: "white", padding: "8px 14px 12px 28px" }}>
                                          {a.odaList.length === 0 ? (
                                            <div style={{ fontSize: "13px", color: "#888", fontStyle: "italic", padding: "8px 0" }}>
                                              Nessun ODA per questo anno.
                                            </div>
                                          ) : (
                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                              <thead>
                                                <tr>
                                                  <th style={TH()}>ODA</th>
                                                  <th style={TH("right")}>Ordinato (BdO)</th>
                                                  <th style={TH("right")}>Fatturato</th>
                                                  <th style={TH("right")}>Da fatturare</th>
                                                </tr>
                                              </thead>
                                              <tbody>
                                                {a.odaList.map((o, oi) => (
                                                  <tr key={oi} style={{
                                                    background: oi % 2 === 0 ? "white" : "#fafafa",
                                                    borderBottom: "1px solid #f0f0f0",
                                                  }}>
                                                    <td style={TD("left", { fontWeight: 600, color: "#1a73e8" })}>{o.oda}</td>
                                                    <td style={TD("right")}>{formatEuro(o.ordinatoBdo)}</td>
                                                    <td style={TD("right")}>{formatEuro(o.fatturato)}</td>
                                                    <td style={TD("right")}>{formatEuro(o.daFatturare)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                              <tfoot>
                                                <tr style={{ background: "#e8f0fe", borderTop: "2px solid #dadce0" }}>
                                                  <td style={{ ...TD("left"), fontWeight: 700, color: "#1a73e8", fontSize: "12px" }}>
                                                    Totale Anno {a.anno}
                                                  </td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>
                                                    {formatEuro(a.odaList.reduce((s, o) => s + (o.totale || 0), 0))}
                                                  </td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>
                                                    {formatEuro(a.odaList.reduce((s, o) => s + (o.ordinatoBdo || 0), 0))}
                                                  </td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>
                                                    {formatEuro(a.odaList.reduce((s, o) => s + (o.fatturato || 0), 0))}
                                                  </td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>
                                                    {formatEuro(a.odaList.reduce((s, o) => s + (o.daFatturare || 0), 0))}
                                                  </td>
                                                </tr>
                                              </tfoot>
                                            </table>
                                          )}
                                        </div>
                                      )}
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
