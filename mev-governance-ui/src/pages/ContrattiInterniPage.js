import { useEffect, useState } from "react";
import { getContratti } from "../services/mevService";

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
  const [loading, setLoading]             = useState(true);
  const [openContratti, setOpenContratti] = useState({});
  const [openAnni, setOpenAnni]           = useState({});
  const [openBc, setOpenBc]               = useState({});

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

  const toggleContratto = (id) =>
    setOpenContratti((p) => ({ ...p, [id]: !p[id] }));
  const toggleAnno = (key) =>
    setOpenAnni((p) => ({ ...p, [key]: !p[key] }));
  const toggleBc = (key) =>
    setOpenBc((p) => ({ ...p, [key]: !p[key] }));

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento Contratti...
    </div>
  );

  return (
    <div style={{ padding: "20px 24px" }}>

      {contratti.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: "#888", fontSize: "14px" }}>
          Nessun contratto. Carica il file Excel e clicca "Allinea Dati" nella pagina MEV.
        </div>
      )}

      {/* ── Livello 1: tabella contratti ── */}
      {contratti.length > 0 && (
        <div style={{ borderRadius: "10px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                <th style={TH()} />
                <th style={TH()}>Tipo Contratto</th>
                <th style={TH()}>RIF. Contratto</th>
                <th style={TH("right")}>Imp. Lordo</th>
                <th style={TH("right")}>Importo Netto</th>
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
                      <td style={TD("right")}>{formatEuro(c.impLordo)}</td>
                      <td style={TD("right")}>{formatEuro(c.importoNetto)}</td>
                      <td style={TD("right")}>{formatEuro(c.ordinato)}</td>
                      <td style={TD("right")}>{formatEuro(c.daOrdinare)}</td>
                      <td style={TD("right")}>{formatEuro(c.avanzato)}</td>
                      <td style={TD("right")}>{formatEuro(c.daAvanzare)}</td>
                    </tr>

                    {/* ── Livello 2: anni ── */}
                    {isOpen && (
                      <tr key={`${c.id}-anni`}>
                        <td colSpan={9} style={{ padding: 0, borderBottom: "2px solid #1a73e8" }}>
                          <div style={{ background: "#f8fbff", padding: "10px 16px 14px 32px" }}>
                            {c.anni.length === 0 ? (
                              <div style={{ fontSize: "13px", color: "#888", fontStyle: "italic" }}>
                                Nessuna riga MEV con BC collegata a questo contratto.
                              </div>
                            ) : (
                              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                {c.anni.map((a) => {
                                  const annoKey = `${c.id}-${a.anno}`;
                                  const annoOpen = !!openAnni[annoKey];
                                  return (
                                    <div key={annoKey} style={{ borderRadius: "8px", border: "1px solid #dadce0", overflow: "hidden" }}>

                                      {/* Riga anno cliccabile */}
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
                                        <span style={{ fontSize: "12px", color: "#555", marginLeft: "8px" }}>
                                          Imp. Fornitura: <strong>{formatEuro(a.totImportoFornitura)}</strong>
                                        </span>
                                        <span style={{ fontSize: "12px", color: "#555" }}>
                                          Ordinato (BdO): <strong>{formatEuro(a.totOrdinatoBdo)}</strong>
                                        </span>
                                        <span style={{ fontSize: "12px", color: "#555" }}>
                                          Fatturato: <strong>{formatEuro(a.totFatturato)}</strong>
                                        </span>
                                      </div>

                                      {/* ── Livello 3: BC sommati ── */}
                                      {annoOpen && (
                                        <div style={{ background: "white", padding: "8px 14px 12px 28px" }}>
                                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                                            <thead>
                                              <tr>
                                                <th style={TH()} />
                                                <th style={TH()}>BC</th>
                                                <th style={TH("right")}>Imp. Fornitura</th>
                                                <th style={TH("right")}>Ordinato (BdO)</th>
                                                <th style={TH("right")}>Fatturato</th>
                                                <th style={TH("right")}>Da fatturare</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {a.bcList.map((b, bi) => {
                                                const bcKey = `${c.id}-${a.anno}-${b.bc}`;
                                                const bcOpen = !!openBc[bcKey];
                                                return (
                                                  <>
                                                    {/* Riga BC */}
                                                    <tr
                                                      key={bcKey}
                                                      onClick={() => toggleBc(bcKey)}
                                                      style={{
                                                        background: bcOpen ? "#e8f0fe" : bi % 2 === 0 ? "white" : "#fafafa",
                                                        borderBottom: "1px solid #f0f0f0", cursor: "pointer",
                                                      }}
                                                      onMouseEnter={(e) => { if (!bcOpen) e.currentTarget.style.background = "#f0f4ff"; }}
                                                      onMouseLeave={(e) => { if (!bcOpen) e.currentTarget.style.background = bi % 2 === 0 ? "white" : "#fafafa"; }}
                                                    >
                                                      <td style={TD("center", { width: "28px", color: "#1a73e8", fontWeight: 700, fontSize: "11px" })}>
                                                        {bcOpen ? "▲" : "▶"}
                                                      </td>
                                                      <td style={TD("left", { fontWeight: 600, color: "#1a73e8" })}>{b.bc}</td>
                                                      <td style={TD("right")}>{formatEuro(b.totImportoFornitura)}</td>
                                                      <td style={TD("right")}>{formatEuro(b.totOrdinatoBdo)}</td>
                                                      <td style={TD("right")}>{formatEuro(b.totFatturato)}</td>
                                                      <td style={TD("right")}>{formatEuro(b.totImportoFornitura - b.totFatturato)}</td>
                                                    </tr>

                                                    {/* ── Livello 4: dettaglio GoTo ── */}
                                                    {bcOpen && (
                                                      <tr key={`${bcKey}-detail`}>
                                                      <td colSpan={7} style={{ padding: 0 }}>
                                                          <div style={{ background: "#f8fbff", padding: "6px 8px 10px 36px" }}>
                                                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px" }}>
                                              <thead>
                                                <tr>
                                                  <th style={{ ...TH(), fontSize: "11px" }}>GoTo</th>
                                                  <th style={{ ...TH("center"), fontSize: "11px" }}>Anno</th>
                                                  <th style={{ ...TH(), fontSize: "11px" }}>Release</th>
                                                  <th style={{ ...TH(), fontSize: "11px" }}>RDA</th>
                                                  <th style={{ ...TH(), fontSize: "11px" }}>AT ID</th>
                                                  <th style={{ ...TH("right"), fontSize: "11px" }}>Imp. Fornitura Scontato</th>
                                                  <th style={{ ...TH("right"), fontSize: "11px" }}>Ordinato (BdO)</th>
                                                  <th style={{ ...TH("right"), fontSize: "11px" }}>Fatturato</th>
                                                  <th style={{ ...TH("right"), fontSize: "11px" }}>Da fatturare</th>
                                                </tr>
                                              </thead>
                                                              <tbody>
                                                                {b.goToList.map((g, gi) => (
                                                  <tr key={gi} style={{
                                                    background: gi % 2 === 0 ? "white" : "#f4f8ff",
                                                    borderBottom: "1px solid #f0f0f0",
                                                  }}>
                                                    <td style={TD("left", { fontSize: "12px" })}>{g.goTo}</td>
                                                    <td style={TD("center", { fontSize: "12px" })}>{g.annoCompetenza}</td>
                                                    <td style={TD("left", { fontSize: "12px" })}>{g.releaseExcel}</td>
                                                    <td style={TD("left", { fontSize: "12px" })}>{g.rda}</td>
                                                    <td style={TD("left", { fontSize: "12px" })}>{g.atId}</td>
                                                    <td style={TD("right", { fontSize: "12px" })}>{formatEuro(g.importoForniturascontato)}</td>
                                                    <td style={TD("right", { fontSize: "12px" })}>{formatEuro(g.ordinatoBdo)}</td>
                                                    <td style={TD("right", { fontSize: "12px" })}>{formatEuro(g.fatturato)}</td>
                                                    <td style={TD("right", { fontSize: "12px" })}>{formatEuro(g.importoForniturascontato - g.fatturato)}</td>
                                                  </tr>
                                                                ))}
                                                              </tbody>
                                                              {/* Totale GoTo */}
                                                              <tfoot>
                                                                <tr style={{ background: "#e8f0fe", borderTop: "2px solid #dadce0" }}>
                                                  <td colSpan={5} style={{ ...TD("left", { fontSize: "12px" }), fontWeight: 700, color: "#1a73e8" }}>
                                                    Totale
                                                  </td>
                                                                  <td style={{ ...TD("right", { fontSize: "12px" }), fontWeight: 700, color: "#1a73e8" }}>
                                                                    {formatEuro(b.goToList.reduce((s, g) => s + (g.importoForniturascontato || 0), 0))}
                                                                  </td>
                                                                  <td style={{ ...TD("right", { fontSize: "12px" }), fontWeight: 700, color: "#1a73e8" }}>
                                                                    {formatEuro(b.totOrdinatoBdo)}
                                                                  </td>
                                                                  <td style={{ ...TD("right", { fontSize: "12px" }), fontWeight: 700, color: "#1a73e8" }}>
                                                                    {formatEuro(b.totFatturato)}
                                                                  </td>
                                                                  <td style={{ ...TD("right", { fontSize: "12px" }), fontWeight: 700, color: "#1a73e8" }}>
                                                                    {formatEuro(b.totImportoFornitura - b.totFatturato)}
                                                                  </td>
                                                                </tr>
                                                              </tfoot>
                                                            </table>
                                                          </div>
                                                        </td>
                                                      </tr>
                                                    )}
                                                  </>
                                                );
                                              })}
                                            </tbody>
                                            {/* Totale anno */}
                                            <tfoot>
                                              <tr style={{ background: "#e8f0fe", borderTop: "2px solid #dadce0" }}>
                                                <td colSpan={2} style={{ ...TD("left"), fontWeight: 700, color: "#1a73e8", fontSize: "12px" }}>Totale Anno {a.anno}</td>
                                                <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.totImportoFornitura)}</td>
                                                <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.totOrdinatoBdo)}</td>
                                                <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.totFatturato)}</td>
                                                <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.totImportoFornitura - a.totFatturato)}</td>
                                              </tr>
                                            </tfoot>
                                          </table>
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
