import { useEffect, useState } from "react";
import { getConsumoTow } from "../services/mevService";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector
} from "recharts";


const TH = (align = "left") => ({
  padding: "13px 16px", fontSize: "13px", fontWeight: 700, color: "#fff",
  whiteSpace: "nowrap", background: "#1e293b", textAlign: align,
  borderBottom: "none", textTransform: "uppercase", letterSpacing: "0.5px",
});
const TD = (align = "left", extra = {}) => ({
  padding: "8px 16px", fontSize: "13px", color: "#334155",
  verticalAlign: "middle", whiteSpace: "nowrap", textAlign: align, ...extra,
});

// ── Chevron SVG ───────────────────────────────────────────────────────────────
const Chevron = ({ open, color = "#64748b" }) => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"
    style={{ display: "block", flexShrink: 0, transition: "transform 0.2s", transform: open ? "rotate(90deg)" : "rotate(0deg)" }}>
    <path d="M6 4l4 4-4 4" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

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
  if (Math.abs(num) >= 1_000) return `€ ${(num / 1_000).toFixed(0)}K`;
  return `€ ${num.toFixed(0)}`;
};

// ── Costanti TOW ──────────────────────────────────────────────────────────────
const TOW_TASK = ["TOW02.1", "TOW02.2", "TOW02.3", "TOW02.4", "TOW02.5"];
const TOW_CANONE = ["TOW02.6"];

// Palette colori per le 5 voci
const COLORS = {
  valoreTotale: "#1e293b",
  approvato:    "#3b82f6",
  ordinatiRda:  "#10b981",
  impegnato:    "#FFFF00",
  residuo:      "#f97316",
};

const LABELS = {
  valoreTotale: "Valore Totale",
  approvato: "Approvato",
  ordinatiRda: "Ordinato",
  impegnato: "Impegnato",
  residuo: "Residuo",
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
      flex: "1 1 220px",
      minWidth: 0,
      background: "white",
      border: "1px solid #e2e8f0",
      borderRadius: "14px",
      padding: "20px 24px",
      boxShadow: "0 4px 16px rgba(0,0,0,0.07)",
    }}>
      <div style={{
        fontSize: "11px",
        fontWeight: 700,
        color: "#64748b",
        textTransform: "uppercase",
        letterSpacing: "0.6px",
        marginBottom: "14px",
        display: "flex",
        alignItems: "center",
        gap: "8px",
      }}>
        <span style={{ width: 8, height: 8, borderRadius: "50%", background: "#3b82f6", display: "inline-block" }} />
        {title}
      </div>

      <div style={{ position: "relative", overflow: "visible" }}>
        <ResponsiveContainer width="100%" height={280}>
          <PieChart>

            <Pie
              data={data}
              cx="50%"
              cy="55%"
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
              y="47%"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={10}
              fill="#888"
            >
              Val Totale
            </text>

            <text
              x="50%"
              y="55%"
              textAnchor="middle"
              dominantBaseline="middle"
              fontSize={13}
              fontWeight={700}
              fill="#1a73e8"
            >
              {formatEuroK(valoreTotale)}
            </text>

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
    approvato: sum(rows, "approvato"),
    ordinatiRda: sum(rows, "ordinatiRda"),
    impegnato: sum(rows, "impegnato"),
    residuo: sum(rows, "residuo"),
  }];

  return (
    <div style={{
      flex: "1 1 240px", padding: "12px 14px", minWidth: 0,
      background: "white", border: "1px solid #dadce0",
      borderRadius: "12px", padding: "12px 16px",
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
            <div style={{ fontSize: "12px", fontWeight: 700, color: COLORS.valoreTotale, marginTop: "2px", whiteSpace: "nowrap" }}>
              {formatEuro(data[0][f])}
            </div>
          </div>
        ))}
      </div>

      {/* Grafico a barre raggruppate */}
      <ResponsiveContainer width="100%" height={500}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 4 }}
          barCategoryGap="30%" barGap={3}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
          <XAxis dataKey="name" hide />
          <YAxis tickFormatter={formatEuroK} tick={{ fontSize: 10, fill: "#888" }} width={60} />
          <Tooltip content={<CustomTooltip />} />

          <Legend
            wrapperStyle={{ fontSize: "12px" }}
            iconType="square"
            payload={[
              { value: "Ordinato", type: "square", color: "#00B853" },
              { value: "Impegnato", type: "square", color: "#FFFF00" },
              { value: "Residuo", type: "square", color: "#FFC000" }
            ]}
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
  const { cx, cy, midAngle, outerRadius, percent, value, name, fill } = props;

  if (value === 0) return null;

  const RADIAN = Math.PI / 180;
  const off = 14;

  const x1 = cx + outerRadius * Math.cos(-midAngle * RADIAN);
  const y1 = cy + outerRadius * Math.sin(-midAngle * RADIAN);

  const x2 = cx + (outerRadius + off) * Math.cos(-midAngle * RADIAN);
  const y2 = cy + (outerRadius + off) * Math.sin(-midAngle * RADIAN);

  const x3 = cx + (outerRadius + off + 20) * Math.cos(-midAngle * RADIAN);
  const y3 = cy + (outerRadius + off + 20) * Math.sin(-midAngle * RADIAN);

  const textAnchor = x3 > cx ? "start" : "end";

  const labelText = `${name}: ${formatEuroK(value)} (${(percent * 100).toFixed(0)}%)`;
  const boxWidth = Math.min(155, labelText.length * 6.8 + 16);
  const boxHeight = 20;

  const rectX = textAnchor === "start" ? x3 - 4 : x3 - boxWidth + 4;
  const rectY = y3 - boxHeight / 2;

  const dotX = textAnchor === "start" ? rectX + 9 : rectX + boxWidth - 9;
  const textX = textAnchor === "start" ? dotX + 9 : dotX - 9;

  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="#94a3b8" strokeWidth={1.5} />
      <line x1={x2} y1={y2} x2={x3} y2={y3} stroke="#94a3b8" strokeWidth={1.5} />
      <circle cx={x2} cy={y2} r={2} fill="#94a3b8" />
      <rect
        x={rectX} y={rectY} width={boxWidth} height={boxHeight}
        fill="white" stroke="#e2e8f0" rx={4}
        style={{ filter: "drop-shadow(0px 1px 4px rgba(0,0,0,0.08))" }}
      />
      <circle cx={dotX} cy={y3} r={4} fill={fill} />
      <text
        x={textX}
        y={y3}
        textAnchor={textAnchor}
        dominantBaseline="middle"
        fontSize={11}
        fill="#334155"
        fontWeight={500}
      >
        {labelText}
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
  const [openDetail, setOpenDetail] = useState({});
  const [openServizi, setOpenServizi] = useState(true);


  useEffect(() => {
    if (tipiContratto.length === 0) return;
    const base = tipiContratto.find(t => t.toUpperCase() === "BASE") || tipiContratto[0];
    setSelectedTipo(base);
  }, [tipiContratto.length]); // eslint-disable-line

  const filtered = selectedTipo
    ? towRows.filter(r => r.towContratto === selectedTipo)
    : [];


  // ✅ CALCOLO PERCENTUALI PER TOW

  const percentData = filtered.map(t => {
    const totale = t.valoreTotale || 1;

    const ordinato = (t.ordinatiRda / totale) * 100;
    const impegnato = (t.impegnato / totale) * 100;
    const residuo = (t.residuo / totale) * 100;

    return {
      tow: t.tow,
      ordinatoPerc: Number(ordinato.toFixed(1)),
      impegnatoPerc: Number(impegnato.toFixed(1)),
      residuoPerc: Number(residuo.toFixed(1)),
      ordinatoEuro: t.ordinatiRda || 0,
      impegnatoEuro: t.impegnato || 0,
      residuoEuro: t.residuo || 0,
      totaleEuro: totale,
    };
  });


  const group = (keys) =>
    filtered.filter(r => keys.some(k => r.tow?.toUpperCase().includes(k.toUpperCase())));
  const sum = (rows, field) =>
    rows.reduce((s, r) => s + (r[field] || 0), 0);


  const taskRows = group(TOW_TASK);

  const canoneRows = group(TOW_CANONE);

  const collaudoRows = taskRows.filter(
    r => r.tow?.toUpperCase() === "TOW02.3"
  );

  const allRows = [...taskRows, ...canoneRows];

  const serviziSections = [
    { key: "task", label: "Servizi a Task", rows: taskRows },
    { key: "collaudo", label: "Collaudo", rows: collaudoRows },
  ];

  const canoneSections = [
    { key: "canone", label: "Servizi a Canone", rows: canoneRows },
  ];




  const totali = {
    valoreTotale: sum(allRows, "valoreTotale"),
    approvato: sum(allRows, "approvato"),
    ordinatiRda: sum(allRows, "ordinatiRda"),
    impegnato: sum(allRows, "impegnato"),
    residuo: sum(allRows, "residuo"),
  };

  if (towRows.length === 0) return null;

  return (
    <div style={{ marginBottom: "32px" }}>
      {/* ── Header pagina ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        marginBottom: "24px", paddingBottom: "16px",
        borderBottom: "2px solid #f1f5f9",
      }}>
        <div style={{
          width: 36, height: 36, borderRadius: "10px",
          background: "linear-gradient(135deg, #3b82f6, #1d4ed8)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "18px", color: "white", boxShadow: "0 2px 8px rgba(59,130,246,0.4)",
        }}>📊</div>
        <div>
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>Consumo TOW</div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "1px" }}>Monitoraggio consumi per tipo di contratto</div>
        </div>
        {tipiContratto.length > 1 && (
          <select
            value={selectedTipo}
            onChange={e => { setSelectedTipo(e.target.value); setOpenDetail({}); }}
            style={{
              marginLeft: "auto",
              padding: "8px 14px", border: "1px solid #e2e8f0", borderRadius: "8px",
              fontSize: "13px", background: "white", color: selectedTipo ? "#1e293b" : "#94a3b8",
              cursor: "pointer", fontWeight: 500, outline: "none",
              boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
            }}
          >
            <option value="">— Seleziona contratto —</option>
            {tipiContratto.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        {tipiContratto.length === 1 && (
          <span style={{
            marginLeft: "auto",
            fontSize: "12px", fontWeight: 600, color: "#3b82f6",
            background: "#eff6ff", padding: "4px 14px", borderRadius: "20px",
            border: "1px solid #bfdbfe",
          }}>
            {tipiContratto[0]}
          </span>
        )}
      </div>

      {/* ── KPI cards totali ── */}
      {selectedTipo && allRows.length > 0 && (
        <div style={{ display: "flex", gap: "12px", flexWrap: "wrap", marginBottom: "24px" }}>
          {FIELDS.map(f => (
            <div key={f} style={{
              flex: "1 1 140px", minWidth: 0,
              background: "white",
              border: "1px solid #e2e8f0",
              borderRadius: "12px",
              padding: "14px 18px",
              borderTop: `4px solid ${COLORS[f]}`,
              boxShadow: "0 2px 8px rgba(0,0,0,0.05)",
            }}>
              <div style={{ fontSize: "10px", color: "#94a3b8", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "6px" }}>
                {LABELS[f]}
              </div>
              <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
                {formatEuro(totali[f])}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Placeholder ── */}
      {!selectedTipo && tipiContratto.length > 1 && (
        <div style={{
          padding: "48px 32px", textAlign: "center", color: "#94a3b8", fontSize: "14px",
          borderRadius: "12px", border: "2px dashed #e2e8f0", background: "#f8fafc",
        }}>
          <div style={{ fontSize: "32px", marginBottom: "12px" }}>📂</div>
          Seleziona un tipo di contratto per visualizzare i dati
        </div>
      )}

      {selectedTipo && (
        <>
          {/* ── Tabella Servizi a Task / Canone espandibile ── */}
          <div style={{ borderRadius: "12px", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "24px" }}>
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
                {(serviziSections.length + canoneSections.length) === 0 ? (
                  <tr><td colSpan={7} style={{ padding: "16px", textAlign: "center", color: "#888", fontSize: "13px" }}>
                    Nessun dato per questo tipo di contratto.
                  </td></tr>

                ) : (
                  <>
                    <tr
                      onClick={() => setOpenServizi(v => !v)}
                      style={{
                        background: "linear-gradient(90deg, #1e40af 0%, #2563eb 100%)",
                        borderBottom: "1px solid #1d4ed8",
                        cursor: "pointer",
                      }}
                    >
                      <td style={TD("center", { width: "40px", padding: "8px" })}>
                        <Chevron open={openServizi} color="white" />
                      </td>
                      <td style={TD("left", { fontWeight: 700, color: "white", fontSize: "13px" })}>
                        Servizi a Task e Collaudo
                      </td>
                      <td style={TD("right", { fontWeight: 700, color: "white" })}>{formatEuro(sum(taskRows, "valoreTotale"))}</td>
                      <td style={TD("right", { fontWeight: 700, color: "white" })}>{formatEuro(sum(taskRows, "approvato"))}</td>
                      <td style={TD("right", { fontWeight: 700, color: "white" })}>{formatEuro(sum(taskRows, "ordinatiRda"))}</td>
                      <td style={TD("right", { fontWeight: 700, color: "white" })}>{formatEuro(sum(taskRows, "impegnato"))}</td>
                      <td style={TD("right", { fontWeight: 700, color: "white" })}>{formatEuro(sum(taskRows, "residuo"))}</td>
                    </tr>

                    {openServizi &&
                      serviziSections.map((sec) => {
                        const isOpen = !!openDetail[sec.key];
                        return (
                          <>
                            <tr
                              key={sec.key}
                              onClick={() => setOpenDetail(p => ({ ...p, [sec.key]: !p[sec.key] }))}
                              style={{ background: isOpen ? "#eff6ff" : "#f8fafc", borderBottom: "1px solid #e2e8f0", cursor: "pointer" }}
                              onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "#eff6ff"; }}
                              onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "#f8fafc"; }}
                            >
                              <td style={TD("center", { width: "40px", padding: "8px" })}>
                                <Chevron open={isOpen} color="#3b82f6" />
                              </td>
                              <td style={TD("left", { fontWeight: 700, color: "#1e40af", paddingLeft: "44px" })}>
                                {sec.label}
                              </td>
                              {/* Valore Totale: vuoto per Task e Collaudo */}
                              <td style={TD("right")} />
                              {sec.key === "collaudo" ? (
                                <>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "collaudoApprovato"))}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "collaudoOrdinato"))}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "collaudoFatturato"))}</td>
                                  <td />
                                </>
                              ) : (
                                <>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "approvato"))}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "ordinatiRda"))}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "impegnato"))}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "residuo"))}</td>
                                </>
                              )}
                            </tr>
                            {isOpen && sec.key === "collaudo" && (
                              <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
                                <td />
                                <td style={TD("left", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", paddingLeft: "28px" })}>TOW</td>
                                <td />{/* Valore Totale vuoto */}
                                <td style={TD("right", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" })}>Approvato</td>
                                <td style={TD("right", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" })}>Ordinato</td>
                                <td style={TD("right", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" })}>Impegnato</td>
                                <td />
                              </tr>
                            )}

                            {isOpen && sec.rows.map((row, ri) => (
                              <tr key={`${sec.key}-${ri}`} style={{ background: ri % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                                <td />
                                <td style={TD("left", { fontSize: "12px", paddingLeft: "28px", color: "#555" })}>{row.tow}</td>

                                 {sec.key !== "collaudo" && (
                                   <td style={TD("right", { fontSize: "12px" })}>
                                     {formatEuro(row.valoreTotale)}
                                   </td>
                                 )}

                                 {sec.key === "collaudo" ? (
                                   <>
                                     <td />{/* cella vuota per Valore Totale */}
                                     <td style={TD("right", { fontSize: "12px" })}>
                                       {formatEuro(row.collaudoApprovato)}
                                     </td>
                                     <td style={TD("right", { fontSize: "12px" })}>
                                       {formatEuro(row.collaudoOrdinato)}
                                     </td>
                                     <td style={TD("right", { fontSize: "12px" })}>
                                       {formatEuro(row.collaudoFatturato)}
                                     </td>
                                     <td />
                                   </>
                                 ) : (
                                   <>
                                     <td style={TD("right", { fontSize: "12px" })}>
                                       {formatEuro(row.approvato)}
                                     </td>
                                     <td style={TD("right", { fontSize: "12px" })}>
                                       {formatEuro(row.ordinatiRda)}
                                     </td>
                                     <td style={TD("right", { fontSize: "12px" })}>
                                       {formatEuro(row.impegnato)}
                                     </td>
                                     <td style={TD("right", { fontSize: "12px" })}>
                                       {formatEuro(row.residuo)}
                                     </td>
                                   </>
                                 )}

                              </tr>
                            ))}
                          </>
                        );
                      })}


                    {canoneSections.map((sec) => {
                      const isOpen = !!openDetail[sec.key];

                      return (
                        <>
                          <tr
                            key={sec.key}
                            onClick={() =>
                              setOpenDetail((p) => ({
                                ...p,
                                [sec.key]: !p[sec.key],
                              }))
                            }
                            style={{
                              background: isOpen ? "#eff6ff" : "#f8fafc",
                              borderBottom: "1px solid #e2e8f0",
                              cursor: "pointer",
                            }}
                          >
                            <td style={TD("center", { width: "40px", padding: "8px" })}>
                              <Chevron open={isOpen} color="#3b82f6" />
                            </td>
                            <td style={TD("left", { fontWeight: 700, color: "#1e40af" })}>
                              {sec.label}
                            </td>
                            <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "valoreTotale"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "approvato"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "ordinatiRda"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "impegnato"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(sum(sec.rows, "residuo"))}</td>
                          </tr>

                          {isOpen &&
                            sec.rows.map((row, ri) => (
                              <tr
                                key={`${sec.key}-${ri}`}
                                style={{
                                  background: ri % 2 === 0 ? "white" : "#fafafa",
                                  borderBottom: "1px solid #f0f0f0",
                                }}
                              >
                                <td />
                                <td
                                  style={TD("left", {
                                    fontSize: "12px",
                                    paddingLeft: "28px",
                                    color: "#555",
                                  })}
                                >
                                  {row.tow}
                                </td>

                                {sec.key === "collaudo" ? (
                                  <td />
                                ) : (
                                  <td style={TD("right", { fontSize: "12px" })}>
                                    {formatEuro(row.valoreTotale)}
                                  </td>
                                )}
                                <td style={TD("right")}>{formatEuro(row.approvato)}</td>
                                <td style={TD("right")}>{formatEuro(row.ordinatiRda)}</td>
                                <td style={TD("right")}>{formatEuro(row.impegnato)}</td>
                                <td style={TD("right")}>{formatEuro(row.residuo)}</td>
                              </tr>
                            ))
                          }
                        </>
                      );
                    })}

                  </>
                )}


              </tbody >
            </table>
          </div>

          {/* ── 3 Grafici a torta: Totale → Task → Canone ── */}
          <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", marginBottom: "24px" }}>
            {allRows.length > 0 && (
              <TowPieChart title="Totale Servizi" rows={allRows} sum={sum} />
            )}
            {taskRows.length > 0 && (
              <TowPieChart title="Servizi a Task" rows={taskRows} sum={sum} />
            )}
            {canoneRows.length > 0 && (
              <TowPieChart title="Servizi a Canone" rows={canoneRows} sum={sum} />
            )}
          </div>


          {/* ── Grafico TOW contratto selezionato ── */}
          {selectedTipo && filtered.length > 0 && (
            <div style={{
              background: "white",
              border: "1px solid #e5e7eb",
              borderRadius: "12px",
              padding: "20px 20px 12px",
              marginTop: "12px",
              boxShadow: "0 1px 3px rgba(0,0,0,0.04)",
            }}>
              <div style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "16px",
              }}>
                <div style={{
                  fontSize: "13px",
                  fontWeight: 600,
                  color: "#1e293b",
                  letterSpacing: "0.3px",
                }}>
                  Consumo TOW
                </div>
                <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
                  {["ordinatiRda", "impegnato", "residuo"].map(key => (
                    <div key={key} style={{
                      display: "flex", alignItems: "center", gap: "7px",
                      background: "#f8fafc", borderRadius: "8px",
                      padding: "5px 12px 5px 10px",
                    }}>
                      <span style={{
                        width: 12, height: 12, borderRadius: "4px",
                        background: COLORS[key], display: "inline-block",
                        flexShrink: 0,
                      }} />
                      <span style={{ fontSize: "13px", color: "#1e293b", fontWeight: 600 }}>
                        {LABELS[key]}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <ResponsiveContainer width="100%" height={Math.max(200, percentData.length * 50)}>
                <BarChart data={percentData} layout="vertical"
                  margin={{ top: 0, right: 36, left: 0, bottom: 0 }}
                  barCategoryGap={10}
                >
                  <XAxis
                    type="number"
                    domain={[0, 100]}
                    tick={{ fontSize: 10, fill: "#94a3b8" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={v => `${v}%`}
                  />
                  <YAxis
                    dataKey="tow"
                    type="category"
                    tick={{ fontSize: 12, fill: "#475569", fontWeight: 500 }}
                    axisLine={false}
                    tickLine={false}
                    width={150}
                  />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      const EURO_KEY = {
                        ordinatoPerc: "ordinatoEuro",
                        impegnatoPerc: "impegnatoEuro",
                        residuoPerc: "residuoEuro",
                      };
                      return (
                        <div style={{
                          background: "white",
                          border: "1px solid #e5e7eb",
                          borderRadius: "8px",
                          padding: "10px 14px",
                          boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
                          fontSize: "12px",
                          minWidth: 180,
                        }}>
                          <div style={{ fontWeight: 600, color: "#1e293b", marginBottom: "6px", borderBottom: "1px solid #f1f5f9", paddingBottom: "6px" }}>
                            {label}
                          </div>
                          {payload.filter(p => p.value > 0).map(p => {
                            const euroKey = EURO_KEY[p.dataKey];
                            const euroVal = p.payload?.[euroKey];
                            return (
                              <div key={p.dataKey} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <span style={{
                                    width: 8, height: 8, borderRadius: "50%",
                                    background: p.color, display: "inline-block", flexShrink: 0,
                                  }} />
                                  <span style={{ color: "#64748b" }}>{p.name}</span>
                                </div>
                                <span style={{ fontWeight: 600, color: "#1e293b", textAlign: "right", whiteSpace: "nowrap" }}>
                                  {formatEuro(euroVal)}
                                  <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: "4px" }}>
                                    ({Number(p.value).toFixed(1)}%)
                                  </span>
                                </span>
                              </div>
                            );
                          })}
                          {payload[0]?.payload?.totaleEuro > 0 && (
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "6px", borderTop: "1px solid #f1f5f9", paddingTop: "6px" }}>
                              <span style={{ color: "#64748b", fontWeight: 500 }}>Totale</span>
                              <span style={{ fontWeight: 700, color: "#1e293b" }}>{formatEuro(payload[0].payload.totaleEuro)}</span>
                            </div>
                          )}
                        </div>
                      );
                    }}
                  />

                  <Bar
                    dataKey="ordinatoPerc"
                    stackId="a"
                    fill={COLORS.ordinatiRda}
                    name="Ordinato"
                    minPointSize={8}
                    radius={[4, 0, 0, 4]}
                    background={{ fill: "#f1f5f9", radius: 4 }}
                    label={{
                      position: "insideLeft",
                      formatter: (v) => v > 2 ? `${Number(v).toFixed(0)}%` : "",
                      fontSize: 11,
                      fontWeight: 600,
                      fill: "#fff",
                    }}
                  />
                  <Bar
                    dataKey="impegnatoPerc"
                    stackId="a"
                    fill={COLORS.impegnato}
                    name="Impegnato"
                    minPointSize={5}
                    label={{
                      position: "inside",
                      formatter: (v) => v > 4 ? `${Number(v).toFixed(0)}%` : "",
                      fontSize: 11,
                      fontWeight: 600,
                      fill: "#1e293b",
                    }}
                  />
                  <Bar
                    dataKey="residuoPerc"
                    stackId="a"
                    fill={COLORS.residuo}
                    name="Residuo"
                    radius={[0, 4, 4, 0]}
                    label={{
                      position: "right",
                      formatter: (v) => v > 0 ? `${Number(v).toFixed(0)}%` : "",
                      fontSize: 11,
                      fill: "#64748b",
                      offset: 4,
                    }}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )
      }
    </div >
  );
}


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
    <div style={{ padding: "24px 28px", background: "#f8fafc", minHeight: "100vh" }}>
      <ConsumoTowSection towRows={towRows} />
    </div>
  );
}


export default ContrattiPage;
