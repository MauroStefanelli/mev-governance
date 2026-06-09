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

const TOW_TASK   = ["TOW02.1","TOW02.2","TOW02.3","TOW02.4","TOW02.5"];
const TOW_CANONE = ["TOW02.6"];

function ConsumoTowSection({ towRows }) {
  // Estrai tipi contratto distinti (TowContratto)
  const tipiContratto = [...new Set(
    towRows.map(r => r.towContratto).filter(Boolean)
  )].sort();

  const [selectedTipo, setSelectedTipo] = useState("");
  const [openDetail, setOpenDetail]     = useState({});

  // Se c'è solo un tipo lo seleziona automaticamente
  useEffect(() => {
    if (tipiContratto.length === 1) setSelectedTipo(tipiContratto[0]);
  }, [tipiContratto.length]); // eslint-disable-line

  const filtered = selectedTipo
    ? towRows.filter(r => r.towContratto === selectedTipo)
    : towRows;

  const group = (keys) => filtered.filter(r => keys.some(k => r.tow?.toUpperCase().includes(k.toUpperCase())));
  const sum   = (rows, field) => rows.reduce((s, r) => s + (r[field] || 0), 0);

  const sections = [
    { key: "task",   label: "Servizi a Task",   rows: group(TOW_TASK) },
    { key: "canone", label: "Servizi a Canone", rows: group(TOW_CANONE) },
  ].filter(s => s.rows.length > 0);

  if (towRows.length === 0) return null;

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* Titolo + filtro tipo contratto */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "10px" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Consumo TOW
        </div>
        {tipiContratto.length > 1 && (
          <select
            value={selectedTipo}
            onChange={e => setSelectedTipo(e.target.value)}
            style={{
              padding: "4px 10px", border: "1px solid #dadce0", borderRadius: "6px",
              fontSize: "12px", background: "white", color: "#333", cursor: "pointer",
            }}
          >
            <option value="">Tutti i contratti</option>
            {tipiContratto.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {tipiContratto.length === 1 && (
          <span style={{ fontSize: "12px", color: "#555", background: "#f0f4ff", padding: "2px 10px", borderRadius: "12px", border: "1px solid #dadce0" }}>
            {tipiContratto[0]}
          </span>
        )}
      </div>

      <div style={{ borderRadius: "10px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
          <thead>
            <tr>
              <th style={TH()} />
              <th style={TH()}>Servizi</th>
              <th style={TH("right")}>Valore Totale</th>
              <th style={TH("right")}>Approvato</th>
              <th style={TH("right")}>Ordinati (RDA)</th>
              <th style={TH("right")}>Impegnato</th>
              <th style={TH("right")}>Residuo</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const isOpen = !!openDetail[sec.key];
              return (
                <>
                  {/* Riga aggregata cliccabile */}
                  <tr
                    key={sec.key}
                    onClick={() => setOpenDetail(p => ({ ...p, [sec.key]: !p[sec.key] }))}
                    style={{ background: isOpen ? "#e8f0fe" : "#f0f4ff", borderBottom: "1px solid #dadce0", cursor: "pointer" }}
                    onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "#e4edff"; }}
                    onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "#f0f4ff"; }}
                  >
                    <td style={TD("center", { width: "28px", color: "#1a73e8", fontWeight: 700, fontSize: "11px" })}>
                      {isOpen ? "▲" : "▶"}
                    </td>
                    <td style={TD("left", { fontWeight: 700, color: "#1a73e8" })}>{sec.label}</td>
                    <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "valoreTotale"))}</td>
                    <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "approvato"))}</td>
                    <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "ordinatiRda"))}</td>
                    <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "impegnato"))}</td>
                    <td style={TD("right", { fontWeight: 700, color: "#1a73e8" })}>{formatEuro(sum(sec.rows, "residuo"))}</td>
                  </tr>

                  {/* Dettaglio righe TOW */}
                  {isOpen && sec.rows.map((row, ri) => (
                    <tr key={`${sec.key}-${ri}`} style={{ background: ri % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                      <td />
                      <td style={TD("left", { fontSize: "12px", paddingLeft: "28px", color: "#555" })}>{row.tow}</td>
                      <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.valoreTotale)}</td>
                      <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.approvato)}</td>
                      <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.ordinatiRda)}</td>
                      <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.impegnato)}</td>
                      <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.residuo)}</td>
                    </tr>
                  ))}
                </>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

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
      <ConsumoTowSection towRows={towRows} />

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
                                      <div
                                        onClick={() => toggleAnno(annoKey)}
                                        style={{
                                          display: "flex", alignItems: "center", gap: "16px",
                                          padding: "8px 14px", cursor: "pointer",
                                          background: annoOpen ? "#e8f0fe" : "#f0f4ff",
                                          borderBottom: annoOpen ? "1px solid #dadce0" : "none",
                                        }}
                                      >
                                        <span style={{ fontSize: "11px", color: "#1a73e8", fontWeight: 700 }}>{annoOpen ? "▲" : "▶"}</span>
                                        <span style={{ fontWeight: 700, color: "#1a73e8", fontSize: "13px" }}>Anno {a.anno}</span>
                                      </div>
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
                                                  <tr key={oi} style={{ background: oi % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                                                    <td style={TD("left", { fontWeight: 600, color: "#1a73e8" })}>{o.oda}</td>
                                                    <td style={TD("right")}>{formatEuro(o.ordinatoBdo)}</td>
                                                    <td style={TD("right")}>{formatEuro(o.fatturato)}</td>
                                                    <td style={TD("right")}>{formatEuro(o.daFatturare)}</td>
                                                  </tr>
                                                ))}
                                              </tbody>
                                              <tfoot>
                                                <tr style={{ background: "#e8f0fe", borderTop: "2px solid #dadce0" }}>
                                                  <td style={{ ...TD("left"), fontWeight: 700, color: "#1a73e8", fontSize: "12px" }}>Totale Anno {a.anno}</td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.odaList.reduce((s, o) => s + (o.totale || 0), 0))}</td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.odaList.reduce((s, o) => s + (o.ordinatoBdo || 0), 0))}</td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.odaList.reduce((s, o) => s + (o.fatturato || 0), 0))}</td>
                                                  <td style={{ ...TD("right"), fontWeight: 700, color: "#1a73e8" }}>{formatEuro(a.odaList.reduce((s, o) => s + (o.daFatturare || 0), 0))}</td>
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
