import { useEffect, useState } from "react";
import { getConsumoTow } from "../services/mevService";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector
} from "recharts";


const TH = (align = "left") => ({
  padding: "8px 12px", fontSize: "12px", fontWeight: 600, color: "#444",
  whiteSpace: "nowrap", background: "#f8f9fa", textAlign: align,
  borderBottom: "2px solid #dadce0",
});
const TD = (align = "left", extra = {}) => ({
  padding: "6px 12px", fontSize: "13px", color: "#333",
  verticalAlign: "middle", whiteSpace: "nowrap", textAlign: align, ...extra,
});

// ── Formattazione ─────────────────────────────────────────────────────────────
const formatEuro = (value) => {
  if (value === null || value === undefined || value === "") return "€ 0,00";
  const num = parseFloat(value);
  if (isNaN(num)) return "€ 0,00";
  const [intPart, decPart] = num.toFixed(2).split(".");
  return `€ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

const formatEuroK = (value) => {
  if (!value) return "€ 0";
  const num = parseFloat(value);
  if (isNaN(num)) return "€ 0";
  if (Math.abs(num) >= 1_000_000) return `€ ${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000)     return `€ ${(num / 1_000).toFixed(0)}K`;
  return `€ ${num.toFixed(0)}`;
};

// ── Costanti TOW ──────────────────────────────────────────────────────────────
const TOW_TASK   = ["TOW02.1", "TOW02.2", "TOW02.3", "TOW02.4", "TOW02.5"];
const TOW_CANONE = ["TOW02.6"];

// Palette colori per le 5 voci
const COLORS = {
  valoreTotale: "#262626",
  approvato:    "#00B853",
  ordinatiRda:  "#2E75B6",
  impegnato:    "#9DC3E6",
  residuo:      "#D6DCE5",
};

const LABELS = {
  valoreTotale: "Valore Totale",
  approvato:    "Approvato", 
  ordinatiRda:  "Ordinato",
  impegnato:    "Impegnato",
  residuo:      "Residuo",
};

const FIELDS = ["valoreTotale", "approvato", "ordinatiRda", "impegnato", "residuo"];

// ── Tooltip personalizzato ────────────────────────────────────────────────────
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: "white", border: "1px solid #dadce0", borderRadius: "8px",
      padding: "10px 14px", boxShadow: "0 2px 8px rgba(0,0,0,0.12)", fontSize: "12px",
    }}>
      <div style={{ fontWeight: 700, marginBottom: "6px", color: "#333" }}>{label}</div>
      {payload.map(p => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: p.fill, display: "inline-block" }} />
          <span style={{ color: "#555" }}>{LABELS[p.dataKey] || p.dataKey}:</span>
          <span style={{ fontWeight: 600, color: "#333" }}>{formatEuro(p.value)}</span>
        </div>
      ))}
    </div>
  );
}


function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const p = payload[0];
  const total = p.payload.allData.reduce((s, d) => s + d.value, 0);
  const perc = ((p.value / total) * 100).toFixed(1);

  return (
    <div style={{
      background: "white",
      border: "1px solid #dadce0",
      borderRadius: "8px",
      padding: "8px 12px",
      boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      fontSize: "12px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{
          width: 10,
          height: 10,
          borderRadius: "50%",
          background: p.payload.fill,
          display: "inline-block"
        }} />
        <span style={{ color: "#555" }}>{p.name}:</span>
        <span style={{ fontWeight: 600, color: "#333" }}>
          {formatEuro(p.value)}
        </span>
        <span style={{ color: "#888" }}>
          ({perc}%)
        </span>
      </div>
    </div>
  );
}



function TowPieChart({ title, rows, sum }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const valoreTotale = sum(rows, "valoreTotale");

  const PIE_FIELDS = ["ordinatiRda", "impegnato", "residuo"];

  let data = PIE_FIELDS.map(f => ({
    name: LABELS[f],
    value: sum(rows, f),
    fill: COLORS[f],
  })).filter(d => d.value > 0);

  data = data.map(d => ({ ...d, allData: data }));

  return (
    <div style={{
      flex: "1 1 280px",
      minWidth: 0,
      background: "white",
      border: "1px solid #dadce0",
      borderRadius: "12px",
      padding: "16px 20px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        fontSize: "13px",
        fontWeight: 700,
        color: "#1a73e8",
        textTransform: "uppercase",
        marginBottom: "12px",
      }}>
        {title}
      </div>

      <div style={{ position: "relative", overflow: "visible" }}>
        <ResponsiveContainer width="100%" height={340}>
          <PieChart>

            <Pie
              data={data}
              cx="50%"
              cy="60%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={4}
              dataKey="value"

              startAngle={90}
              endAngle={-270}

              isAnimationActive
              animationDuration={1200}

              activeIndex={activeIndex}
              activeShape={(props) => (
                <Sector
                  {...props}
                  outerRadius={props.outerRadius + 6}
                  stroke="#fff"
                  strokeWidth={2}
                />
              )}

              onMouseEnter={(_, index) => setActiveIndex(index)}
              onMouseLeave={() => setActiveIndex(null)}

              label={renderCalloutLabel}
              labelLine={false}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>

            {/* ✅ ✅ KPI CENTRALE (FIX DEFINITIVO) */}
            <text
              x="50%"
              y="60%"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#888"
            >
              Val Totale
            </text>

            <text
              x="50%"
              y="66%"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fontWeight="700"
              fill="#1a73e8"
            >
              {formatEuroK(valoreTotale)}
            </text>

            <Legend
              payload={[
                { value: "Ordinato", type: "circle", color: COLORS.ordinatiRda },
                { value: "Impegnato", type: "circle", color: COLORS.impegnato },
                { value: "Residuo", type: "circle", color: COLORS.residuo },
              ]}
              iconSize={8}
              wrapperStyle={{ fontSize: "11px", paddingTop: "4px" }}
            />

          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ── Grafico a barre ───────────────────────────────────────────────────────────
function TowChart({ title, rows, sum }) {
  // Un unico "gruppo" con tutte le 5 voci come barre separate
  const data = [{
    name: title,
    valoreTotale: sum(rows, "valoreTotale"),
    approvato:    sum(rows, "approvato"),
    ordinatiRda:  sum(rows, "ordinatiRda"),
    impegnato:    sum(rows, "impegnato"),
    residuo:      sum(rows, "residuo"),
  }];

  return (
    <div style={{
      flex: "1 1 300px", minWidth: 0,
      background: "white", border: "1px solid #dadce0",
      borderRadius: "12px", padding: "16px 20px",
      boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    }}>
      <div style={{
        fontSize: "13px", fontWeight: 700, color: "#1a73e8",
        textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: "14px",
      }}>
        {title}
      </div>

      {/* Valori numerici in cima */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", marginBottom: "16px" }}>
        {FIELDS.map(f => (
          <div key={f} style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            background: "#f8f9fa", borderRadius: "8px", padding: "6px 12px",
            borderLeft: `3px solid ${COLORS[f]}`, flex: "1 1 80px", minWidth: 0,
          }}>
            <div style={{ fontSize: "10px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px", whiteSpace: "nowrap" }}>
              {LABELS[f]}
            </div>
            <div style={{ fontSize: "12px", fontWeight: 700, color: COLORS[f], marginTop: "2px", whiteSpace: "nowrap" }}>
              {formatEuro(data[0][f])}
            </div>
          </div>
        ))}
      </div>

      {/* Grafico a barre raggruppate */}
      <ResponsiveContainer width="100%" height={300}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
          barCategoryGap="30%" barGap={3}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="name" hide />
          <YAxis tickFormatter={formatEuroK} tick={{ fontSize: 10, fill: "#888" }} width={60} />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            formatter={(value) => (
              <span style={{ fontSize: "11px", color: "#555" }}>{LABELS[value] || value}</span>
            )}
          />
          {FIELDS.map(f => (
            <Bar key={f} dataKey={f} name={f} fill={COLORS[f]} radius={[4, 4, 0, 0]} maxBarSize={40} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
const renderCalloutLabel = (props) => {
  const { cx, cy, midAngle, outerRadius, percent, value, name } = props;

  if (value === 0) return null;

  const RADIAN = Math.PI / 180;

  const x1 = cx + outerRadius * Math.cos(-midAngle * RADIAN);
  const y1 = cy + outerRadius * Math.sin(-midAngle * RADIAN);

  const x2 = cx + (outerRadius + 15) * Math.cos(-midAngle * RADIAN);
  const y2 = cy + (outerRadius + 15) * Math.sin(-midAngle * RADIAN);

  const x3 = cx + (outerRadius + 45) * Math.cos(-midAngle * RADIAN);
  const y3 = cy + (outerRadius + 45) * Math.sin(-midAngle * RADIAN);

  const textAnchor = x3 > cx ? "start" : "end";

  const boxWidth = 110;
  const boxHeight = 30;

  const rectX = textAnchor === "start" ? x3 - 5 : x3 - boxWidth;
  const rectY = y3 - boxHeight / 2;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#999" />
      <line x1={x2} y1={y2} x2={x3} y2={y3} stroke="#999" />
      <circle cx={x2} cy={y2} r={2} fill="#999" />

      <rect
        x={rectX}
        y={rectY}
        width={boxWidth}
        height={boxHeight}
        fill="white"
        stroke="#ddd"
        rx={6}
        style={{ filter: "drop-shadow(0px 2px 6px rgba(0,0,0,0.18))" }}
      />

      <text
        x={x3}
        y={y3 - 6}
        textAnchor={textAnchor}
        fontSize={10}
        fill="#555"
      >
        {name}
      </text>

      <text
        x={x3}
        y={y3 + 10}
        textAnchor={textAnchor}
        fontSize={11}
        fontWeight={700}
        fill="#222"
      >
        {formatEuro(value)} ({(percent * 100).toFixed(1)}%)
      </text>
    </g>
  );
};



// ── Sezione principale ────────────────────────────────────────────────────────
function ConsumoTowSection({ towRows }) {
  const tipiContratto = [...new Set(
    towRows.map(r => r.towContratto).filter(Boolean)
  )].sort();

  const [selectedTipo, setSelectedTipo] = useState("");
  const [openDetail, setOpenDetail]     = useState({});

  useEffect(() => {
    if (tipiContratto.length === 0) return;
    const base = tipiContratto.find(t => t.toUpperCase() === "BASE") || tipiContratto[0];
    setSelectedTipo(base);
  }, [tipiContratto.length]); // eslint-disable-line

  const filtered = selectedTipo
    ? towRows.filter(r => r.towContratto === selectedTipo)
    : [];

  const group = (keys) =>
    filtered.filter(r => keys.some(k => r.tow?.toUpperCase().includes(k.toUpperCase())));
  const sum = (rows, field) =>
    rows.reduce((s, r) => s + (r[field] || 0), 0);

  const taskRows   = group(TOW_TASK);
  const canoneRows = group(TOW_CANONE);
  const allRows    = [...taskRows, ...canoneRows];

  const sections = [
    { key: "task",   label: "Servizi a Task",   rows: taskRows },
    { key: "canone", label: "Servizi a Canone", rows: canoneRows },
  ].filter(s => s.rows.length > 0);

  const totali = {
    valoreTotale: sum(allRows, "valoreTotale"),
    approvato:    sum(allRows, "approvato"),
    ordinatiRda:  sum(allRows, "ordinatiRda"),
    impegnato:    sum(allRows, "impegnato"),
    residuo:      sum(allRows, "residuo"),
  };

  if (towRows.length === 0) return null;

  return (
    <div style={{ marginBottom: "24px" }}>
      {/* ── Header: titolo + dropdown + totali ── */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "16px", flexWrap: "wrap" }}>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a73e8", textTransform: "uppercase", letterSpacing: "0.4px" }}>
          Consumo TOW
        </div>

        {tipiContratto.length > 1 && (
          <select
            value={selectedTipo}
            onChange={e => { setSelectedTipo(e.target.value); setOpenDetail({}); }}
            style={{
              padding: "4px 10px", border: "1px solid #dadce0", borderRadius: "6px",
              fontSize: "12px", background: "white", color: selectedTipo ? "#333" : "#888",
              cursor: "pointer",
            }}
          >
            <option value="">-- Seleziona tipo contratto --</option>
            {tipiContratto.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {tipiContratto.length === 1 && (
          <span style={{ fontSize: "12px", color: "#555", background: "#f0f4ff", padding: "2px 10px", borderRadius: "12px", border: "1px solid #dadce0" }}>
            {tipiContratto[0]}
          </span>
        )}

        {selectedTipo && allRows.length > 0 && (
          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginLeft: "4px" }}>
            {FIELDS.map(f => (
              <div key={f} style={{
                display: "flex", flexDirection: "column", alignItems: "center",
                background: "white", border: "1px solid #dadce0", borderRadius: "8px",
                padding: "5px 14px", borderTop: `3px solid ${COLORS[f]}`,
              }}>
                <div style={{ fontSize: "10px", color: "#888", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.3px" }}>
                  {LABELS[f]}
                </div>
                <div style={{ fontSize: "13px", fontWeight: 700, color: COLORS[f] }}>
                  {formatEuro(totali[f])}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Placeholder ── */}
      {!selectedTipo && tipiContratto.length > 1 && (
        <div style={{
          padding: "32px", textAlign: "center", color: "#888", fontSize: "13px",
          borderRadius: "10px", border: "1px dashed #dadce0", background: "#fafafa",
        }}>
          Seleziona un tipo di contratto per visualizzare i dati
        </div>
      )}

      {selectedTipo && (
        <>
          {/* ── Tabella Servizi a Task / Canone espandibile ── */}
          <div style={{ borderRadius: "10px", border: "1px solid #dadce0", boxShadow: "0 1px 4px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "20px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
                  <th style={TH()} />
                  <th style={TH()}>Servizi</th>
                  <th style={TH("right")}>Valore Totale</th>
                  <th style={TH("right")}>Approvato</th>
                  <th style={TH("right")}>Ordinato</th>
                  <th style={TH("right")}>Impegnato</th>
                  <th style={TH("right")}>Residuo</th>
                </tr>
              </thead>
              <tbody>
                {sections.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                    Nessun dato per questo tipo di contratto.
                  </td></tr>
                ) : sections.map((sec) => {
                  const isOpen = !!openDetail[sec.key];
                  return (
                    <>
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

          {/* ── 3 Grafici a torta: Totale → Task → Canone ── */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "16px" }}>
            {allRows.length > 0 && (
              <TowPieChart title="Totale Servizi"   rows={allRows}    sum={sum} />
            )}
            {taskRows.length > 0 && (
              <TowPieChart title="Servizi a Task"   rows={taskRows}   sum={sum} />
            )}
            {canoneRows.length > 0 && (
              <TowPieChart title="Servizi a Canone" rows={canoneRows} sum={sum} />
            )}
          </div>


        </>
      )}
    </div>
  );
}



const renderCalloutLabel = (props) => {
  const { cx, cy, midAngle, outerRadius, percent, value, name } = props;

  if (value === 0) return null;

  const RADIAN = Math.PI / 180;

  // punto sulla torta
  const x1 = cx + outerRadius * Math.cos(-midAngle * RADIAN);
  const y1 = cy + outerRadius * Math.sin(-midAngle * RADIAN);

  // punto intermedio
  const x2 = cx + (outerRadius + 15) * Math.cos(-midAngle * RADIAN);
  const y2 = cy + (outerRadius + 15) * Math.sin(-midAngle * RADIAN);

  // posizione finale
  const x3 = cx + (outerRadius + 45) * Math.cos(-midAngle * RADIAN);
  const y3 = cy + (outerRadius + 45) * Math.sin(-midAngle * RADIAN);

  const textAnchor = x3 > cx ? "start" : "end";

  // posizione box (dipende se sei a dx o sx)
  const boxWidth = 95;
  const boxHeight = 22;

  const rectX = textAnchor === "start" ? x3 - 5 : x3 - boxWidth;
  const rectY = y3 - boxHeight / 2;

  return (
    <g>
      {/* linea */}
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#999" strokeWidth={1} />
      <line x1={x2} y1={y2} x2={x3} y2={y3} stroke="#999" strokeWidth={1} />

      {/* pallino */}
      <circle cx={x2} cy={y2} r={2} fill="#999" />

      {/* ✅ BOX tipo tooltip */}
      <rect
        x={rectX}
        y={rectY}
        width={boxWidth}
        height={boxHeight}
        fill="white"
        stroke="#ddd"
        rx={6}
        style={{ filter: "drop-shadow(0px 2px 6px rgba(0,0,0,0.18))" }}
      />

      {/* ✅ TESTO sopra il box */}

      <text
        x={x3}
        y={y3 - 8}
        textAnchor={textAnchor}
        fontSize={10}
        fill="#555"
      >
        {name}
      </text>

      <text
        x={x3}
        y={y3 + 8}
        textAnchor={textAnchor}
        fontSize={11}
        fontWeight={700}
        fill="#222"
      >
        {formatEuro(value)} ({(percent * 100).toFixed(1)}%)
      </text>

    </g>
  );
};

// ── Pagina ────────────────────────────────────────────────────────────────────
function ContrattiPage({ onUnauthorized }) {
  const [towRows, setTowRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const tow = await getConsumoTow();
        setTowRows(tow);
      } catch (e) {
        if (e.message === "401") onUnauthorized?.();
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento...
    </div>
  );

  return (
    <div style={{ padding: "20px 24px" }}>
      <ConsumoTowSection towRows={towRows} />
    </div>
  );
}

export default ContrattiPage;
