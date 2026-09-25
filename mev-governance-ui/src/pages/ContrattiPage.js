import { useEffect, useState, useCallback } from "react";
import { getConsumoTow, getReleaseSchedules, upsertReleaseSchedule, deleteConfiguratoreRecord, getConfiguratoreContracts } from "../services/mevService";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell, Sector
} from "recharts";


const TH = (align = "left") => ({
  padding: "13px 16px", fontSize: "13px", fontWeight: 700, color: "#000",
  whiteSpace: "nowrap", background: "#ffffff", textAlign: align,
  borderBottom: "1px solid #e2e8f0", textTransform: "uppercase", letterSpacing: "0.5px",
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

const formatPerc = (value, total) => {
  if (!total || total === 0) return "";
  const perc = (parseFloat(value) / parseFloat(total)) * 100;
  if (isNaN(perc)) return "";
  return `${perc.toFixed(1)}%`;
};

const PercBadge = ({ value, total, color = "#64748b" }) => {
  const perc = (!total || total === 0) ? null : (parseFloat(value) / parseFloat(total)) * 100;
  if (perc === null || isNaN(perc)) return null;
  return (
    <span style={{
      fontSize: "10px", fontWeight: 600, color,
      background: color + "18",
      border: `1px solid ${color}33`,
      borderRadius: "10px",
      padding: "1px 6px",
      marginLeft: "6px",
      whiteSpace: "nowrap",
      letterSpacing: "0.2px",
    }}>
      {perc.toFixed(1)}%
    </span>
  );
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
// I nomi reali dipendono dal contratto (es. TOW02.x o TOW01.x).
// La distinzione task/canone si basa sulla posizione: l'ultimo TOW (ordinato)
// è il canone, tutti gli altri sono task. Questi array restano come fallback
// per contratti con naming TOW02.x (contratto BASE storico).
const TOW_TASK_LEGACY   = ["TOW02.1", "TOW02.2", "TOW02.3", "TOW02.4", "TOW02.5"];
const TOW_CANONE_LEGACY = ["TOW02.6"];

// Calcola task/canone dinamicamente dai nomi TOW reali di un contratto.
// Convenzione: l'ultimo TOW (sort alfabetico) è il canone, gli altri sono task.
const getTowGroups = (rows) => {
  const towNames = [...new Set(rows.map(r => r.tow?.trim()).filter(Boolean))].sort();
  if (towNames.length === 0) return { taskKeys: TOW_TASK_LEGACY, canoneKeys: TOW_CANONE_LEGACY };
  const canoneKey = towNames[towNames.length - 1];
  const taskKeys  = towNames.slice(0, -1);
  return { taskKeys, canoneKeys: [canoneKey] };
};

// Palette colori per le 5 voci
const COLORS = {
  valoreTotale: "#1e293b",
  approvato: "#3b82f6",
  ordinatiRda: "#10b981",
  impegnato: "#FFFF00",
  residuo: "#f97316",
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

  // ── Calcola task/canone dinamicamente in base ai TOW reali del contratto ──
  const { taskKeys, canoneKeys } = getTowGroups(filtered);

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
    filtered.filter(r => keys.some(k => r.tow?.trim().toUpperCase() === k.trim().toUpperCase()));
  const sum = (rows, field) =>
    rows.reduce((s, r) => s + (r[field] || 0), 0);


  const taskRows = group(taskKeys);

  const canoneRows = group(canoneKeys);

  // Le righe collaudo sono i task TOW che hanno dati collaudo valorizzati
  const collaudoRows = taskRows.filter(
    r => r.collaudoApprovato != null || r.collaudoOrdinato != null || r.collaudoFatturato != null
  );

  // Righe task senza collaudo (per altri usi)
  const collaudoTowNames = new Set(collaudoRows.map(r => r.tow?.toUpperCase()));
  const taskOnlyRows = taskRows.filter(
    r => !collaudoTowNames.has(r.tow?.toUpperCase())
  );

  // Totali riga blu = somma grezza di tutti i taskRows (Servizi a Task netto + Collaudo)
  const blueRowTotals = {
    valoreTotale: sum(taskRows, "valoreTotale"),
    approvato: sum(taskRows, "approvato"),
    ordinatiRda: sum(taskRows, "ordinatiRda"),
    impegnato: sum(taskRows, "impegnato"),
    residuo: sum(taskRows, "residuo"),
  };

  // Totali per la riga "Collaudo" (sezione cliccabile)
  const collaudoTotals = {
    approvato: sum(collaudoRows, "collaudoApprovato"),
    ordinatiRda: sum(collaudoRows, "collaudoOrdinato"),
    impegnato: sum(collaudoRows, "collaudoFatturato"),
  };

  // Totali per la riga "Servizi a Task" = task TOW al netto della quota collaudo
  const taskNetTotals = {
    approvato: sum(taskOnlyRows, "approvato") + collaudoRows.reduce((s, r) => s + r.approvato - (r.collaudoApprovato || 0), 0),
    ordinatiRda: sum(taskOnlyRows, "ordinatiRda") + collaudoRows.reduce((s, r) => s + r.ordinatiRda - (r.collaudoOrdinato || 0), 0),
    impegnato: sum(taskOnlyRows, "impegnato") + collaudoRows.reduce((s, r) => s + r.impegnato - (r.collaudoFatturato || 0), 0),
    residuo: sum(taskRows, "residuo"),
  };

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
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#1e293b" }}>Monitoraggio contratto</div>
          <div style={{ fontSize: "12px", color: "#94a3b8", marginTop: "1px" }}>Monitoraggio consumi per tipo di contratto</div>
        </div>

        {tipiContratto.length > 1 && (
          <div
            style={{
              marginLeft: "auto",
              display: "flex",
              alignItems: "center",
              gap: "10px",
            }}
          >
            <span
              style={{
                fontSize: "18px",
                fontWeight: 600,
                color: "#1e293b",
              }}
            >
              Contratto
            </span>

            <select
              value={selectedTipo}
              onChange={e => {
                setSelectedTipo(e.target.value);
                setOpenDetail({});
              }}
              style={{
                padding: "8px 14px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                fontSize: "13px",
                background: "white",
                color: selectedTipo ? "#1e293b" : "#94a3b8",
                cursor: "pointer",
                fontWeight: 500,
                outline: "none",
                boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
              }}
            >
              <option value="">— Seleziona contratto —</option>
              {tipiContratto.map(t => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
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
          {FIELDS.map(f => {
            const hasPerc = f !== "valoreTotale";
            const perc = hasPerc && totali.valoreTotale
              ? ((totali[f] / totali.valoreTotale) * 100).toFixed(1)
              : null;
            return (
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
                <div style={{ display: "flex", alignItems: "baseline", gap: "8px", flexWrap: "wrap" }}>
                  <div style={{ fontSize: "15px", fontWeight: 700, color: "#1e293b" }}>
                    {formatEuro(totali[f])}
                  </div>
                  {perc !== null && (
                    <span style={{
                      fontSize: "15px", fontWeight: 700,
                      color: "#1e293b",
                      background: COLORS[f] + "18",
                      border: `1px solid ${COLORS[f]}44`,
                      borderRadius: "10px",
                      padding: "1px 8px",
                      whiteSpace: "nowrap",
                    }}>
                      {perc}%
                    </span>
                  )}
                </div>
              </div>
            );
          })}
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
          <div style={{ borderRadius: "0px", border: "1px solid #e2e8f0", boxShadow: "0 4px 16px rgba(0,0,0,0.06)", overflow: "hidden", marginBottom: "24px" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr>
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
                        background: "#DCEEFF",
                        borderBottom: "1px solid #BFDFFF",
                        cursor: "pointer",
                      }}
                    >
                      <td style={TD("left", { fontWeight: 700, color: "#0F4C81", fontSize: "13px" })}>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <Chevron open={openServizi} color="#0F4C81" />
                          <span>Servizi a Task e Collaudo</span>
                        </div>
                      </td>
                      <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(blueRowTotals.valoreTotale)}</td>
                      <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(blueRowTotals.approvato)}</td>
                      <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(blueRowTotals.ordinatiRda)}</td>
                      <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(blueRowTotals.impegnato)}</td>
                      <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(blueRowTotals.residuo)}</td>
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
                              <td style={TD("left", { fontWeight: 700, color: "#1e40af", paddingLeft: "32px" })}>
                                <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                  <Chevron open={isOpen} color="#3b82f6" />
                                  <span>{sec.label}</span>
                                </div>
                              </td>


                              {/* Valore Totale: vuoto per Task e Collaudo */}
                              <td style={TD("right")} />
                              {sec.key === "collaudo" ? (
                                <>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(collaudoTotals.approvato)}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(collaudoTotals.ordinatiRda)}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(collaudoTotals.impegnato)}</td>
                                  <td />{/* Residuo vuoto */}
                                </>
                              ) : (
                                <>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(taskNetTotals.approvato)}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(taskNetTotals.ordinatiRda)}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(taskNetTotals.impegnato)}</td>
                                  <td style={TD("right", { fontWeight: 700, color: "#1e40af" })}>{formatEuro(taskNetTotals.residuo)}</td>
                                </>
                              )}
                            </tr>
                            {isOpen && sec.key === "collaudo" && (
                              <tr style={{ background: "#f1f5f9", borderBottom: "1px solid #e2e8f0" }}>
                                <td style={TD("left", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px", paddingLeft: "60px" })}>TOW</td>
                                <td />{/* Valore Totale vuoto */}
                                <td style={TD("right", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" })}>Approvato</td>
                                <td style={TD("right", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" })}>Ordinato</td>
                                <td style={TD("right", { fontWeight: 700, fontSize: "11px", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.4px" })}>Impegnato</td>
                                <td />
                              </tr>
                            )}

                            {isOpen && sec.rows.map((row, ri) => (
                              <tr key={`${sec.key}-${ri}`} style={{ background: ri % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                                <td style={TD("left", { fontSize: "12px", paddingLeft: "60px", color: "#555" })}>{row.tow}</td>

                                 {sec.key !== "collaudo" && (
                                  <td style={TD("right", { fontSize: "12px" })}>
                                    {formatEuro(row.valoreTotale)}
                                  </td>
                                )}

                                {sec.key === "collaudo" ? (
                                  <>
                                    <td />{/* Valore Totale vuoto */}
                                    <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.collaudoApprovato)}</td>
                                    <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.collaudoOrdinato)}</td>
                                    <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.collaudoFatturato)}</td>
                                    <td />{/* Residuo vuoto */}
                                  </>
                                ) : (
                                   <>
                                    {/* Per i TOW con collaudo mostra i valori al netto */}
                                    {(() => {
                                      const isCollaudo = collaudoTowNames.has(row.tow?.toUpperCase());
                                      return (
                                        <>
                                          <td style={TD("right", { fontSize: "12px" })}>
                                            {formatEuro(isCollaudo ? row.approvato - (row.collaudoApprovato || 0) : row.approvato)}
                                          </td>
                                          <td style={TD("right", { fontSize: "12px" })}>
                                            {formatEuro(isCollaudo ? row.ordinatiRda - (row.collaudoOrdinato || 0) : row.ordinatiRda)}
                                          </td>
                                          <td style={TD("right", { fontSize: "12px" })}>
                                            {formatEuro(isCollaudo ? row.impegnato - (row.collaudoFatturato || 0) : row.impegnato)}
                                          </td>
                                          <td style={TD("right", { fontSize: "12px" })}>
                                            {formatEuro(row.residuo)}
                                          </td>
                                        </>
                                      );
                                    })()}
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
                              background: "#DCEEFF",
                              borderBottom: "1px solid #BFDFFF",
                              cursor: "pointer",
                            }}
                          >
                            <td style={TD("left", { fontWeight: 700, color: "#0F4C81" })}>
                              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                <Chevron open={isOpen} color="#0F4C81" />
                                <span>{sec.label}</span>
                              </div>
                            </td>
                            <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(sum(sec.rows, "valoreTotale"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(sum(sec.rows, "approvato"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(sum(sec.rows, "ordinatiRda"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(sum(sec.rows, "impegnato"))}</td>
                            <td style={TD("right", { fontWeight: 700, color: "#0F4C81" })}>{formatEuro(sum(sec.rows, "residuo"))}</td>
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
                                <td style={TD("left", { fontSize: "12px", paddingLeft: "32px", color: "#555" })}>
                                  {row.tow}
                                </td>
                                <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.valoreTotale)}</td>
                                <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.approvato)}</td>
                                <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.ordinatiRda)}</td>
                                <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.impegnato)}</td>
                                <td style={TD("right", { fontSize: "12px" })}>{formatEuro(row.residuo)}</td>
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
              <TowPieChart title="Servizi a Task e Collaudo" rows={taskRows} sum={sum} />
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


// ── Tabella Release per Contratto ─────────────────────────────────────────────
// Colonne raggruppate: ogni fase ha inizio+fine. In tabella vengono mostrate
// come due sub-colonne sotto un'intestazione di gruppo per ridurre la larghezza.
const RELEASE_GROUPS = [
  { group: "Sviluppo",         start: "devStart",   end: "devEnd"   },
  { group: "Coll. Funz.",      start: "cfStart",    end: "cfEnd"    },
  { group: "Coll. E2E",        start: "e2eStart",   end: "e2eEnd"   },
  { group: "UAT",              start: "uatStart",   end: "uatEnd"   },
  { group: "Certificazione",   start: "certStart",  end: "certEnd"  },
  { group: "Pass in prod",     start: "passInProd", end: null       },
  { group: "Disp. cliente",    start: "dispClient", end: null       },
];

// Lista piatta per il form
const RELEASE_DATE_FIELDS = [
  { key: "devStart",    label: "Sviluppo inizio" },
  { key: "devEnd",      label: "Sviluppo fine" },
  { key: "cfStart",     label: "Coll. Funzionale inizio" },
  { key: "cfEnd",       label: "Coll. Funzionale fine" },
  { key: "e2eStart",    label: "Coll. E2E inizio" },
  { key: "e2eEnd",      label: "Coll. E2E fine" },
  { key: "uatStart",    label: "UAT inizio" },
  { key: "uatEnd",      label: "UAT fine" },
  { key: "certStart",   label: "Certificazione inizio" },
  { key: "certEnd",     label: "Certificazione fine" },
  { key: "passInProd",  label: "Pass in prod" },
  { key: "dispClient",  label: "Disp. al cliente" },
];

const EMPTY_RELEASE = () => ({
  name: "", devStart: "", devEnd: "", cfStart: "", cfEnd: "",
  e2eStart: "", e2eEnd: "", uatStart: "", uatEnd: "",
  certStart: "", certEnd: "", passInProd: "", dispClient: "",
});

function formatDate(d) {
  if (!d) return "–";
  try { return new Date(d).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "2-digit" }); }
  catch { return d; }
}

function ReleaseScheduleSection() {
  // Carica i contratti del Configuratore per il selector
  const [contracts,    setContracts]    = useState([]);
  const [contractId,   setContractId]   = useState("");
  const [records,      setRecords]      = useState([]);
  const [editing,      setEditing]      = useState(null);
  const [draft,        setDraft]        = useState(EMPTY_RELEASE());
  const [saving,       setSaving]       = useState(false);
  const [msg,          setMsg]          = useState("");

  // Carica la lista contratti del Configuratore
  useEffect(() => {
    getConfiguratoreContracts()
      .then(d => {
        const list = d?.contracts || d || [];
        setContracts(list);
        if (list.length > 0 && !contractId) setContractId(list[0].contractId || list[0].contract_id || "");
      })
      .catch(() => {});
  }, []); // eslint-disable-line

  const load = useCallback(() => {
    if (!contractId) return;
    getReleaseSchedules(contractId).then(d => setRecords(d.records || [])).catch(() => setRecords([]));
  }, [contractId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setDraft(EMPTY_RELEASE()); setEditing("new"); setMsg(""); };
  const openEdit = (rec) => {
    let p = {};
    try { p = typeof rec.payload === "string" ? JSON.parse(rec.payload) : (rec.payload || {}); } catch {}
    setDraft({ name: rec.title || "", ...p });
    setEditing(rec);
    setMsg("");
  };
  const cancel = () => { setEditing(null); setMsg(""); };

  const save = async () => {
    if (!draft.name.trim()) { setMsg("Inserire il nome della release."); return; }
    setSaving(true);
    try {
      await upsertReleaseSchedule(contractId, { ...draft, name: draft.name.trim() });
      setMsg("Salvato.");
      setEditing(null);
      load();
    } catch (e) { setMsg("Errore: " + e.message); }
    finally { setSaving(false); }
  };

  const del = async (rec) => {
    if (!window.confirm(`Eliminare la release "${rec.title}"?`)) return;
    try { await deleteConfiguratoreRecord(rec.Id || rec.id); load(); }
    catch (e) { setMsg("Errore: " + e.message); }
  };

  const cardStyle = {
    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
    padding: "20px 24px", marginTop: 24, boxShadow: "0 1px 4px rgba(0,0,0,0.05)",
  };
  const inputStyle = {
    border: "1px solid #cbd5e1", borderRadius: 6, padding: "5px 8px",
    fontSize: 12, width: "100%", boxSizing: "border-box",
  };

  return (
    <div style={cardStyle}>
      {/* Header + selector contratto */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, flexWrap: "wrap", gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: "#1e293b" }}>Pianificazione Release</div>
          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>Date di rilascio per release — legate al contratto selezionato</div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {/* Selector contratto */}
          <select
            value={contractId}
            onChange={e => setContractId(e.target.value)}
            style={{ padding: "7px 12px", border: "1px solid #cbd5e1", borderRadius: 7, fontSize: 13, minWidth: 180, background: "#f8fafc" }}>
            {contracts.length === 0
              ? <option value="">— nessun contratto —</option>
              : contracts.map(c => (
                  <option key={c.contractId || c.contract_id} value={c.contractId || c.contract_id}>
                    {c.name || c.contractId}
                  </option>
                ))
            }
          </select>
          <button
            onClick={openNew}
            disabled={!contractId}
            style={{ padding: "7px 16px", background: contractId ? "#102a47" : "#94a3b8", color: "#fff", border: "none", borderRadius: 7, fontSize: 13, fontWeight: 600, cursor: contractId ? "pointer" : "not-allowed" }}>
            + Nuova release
          </button>
        </div>
      </div>

      {/* Form inserimento/modifica */}
      {editing && (
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: "#102a47", marginBottom: 12 }}>
            {editing === "new" ? "Nuova release" : `Modifica: ${editing.title}`}
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#475569", display: "block", marginBottom: 4 }}>Nome release</label>
            <input style={{ ...inputStyle, fontSize: 14, fontWeight: 600 }} placeholder="es. R2025-04, Sprint 12, Fase 1…"
              value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: "8px 12px" }}>
            {RELEASE_DATE_FIELDS.map(f => (
              <label key={f.key} style={{ fontSize: 11, fontWeight: 600, color: "#475569" }}>
                {f.label}
                <input type="date" style={{ ...inputStyle, marginTop: 3 }}
                  value={draft[f.key] || ""}
                  onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
              </label>
            ))}
          </div>
          {msg && <div style={{ fontSize: 12, color: msg.startsWith("Errore") ? "#dc2626" : "#16a34a", marginTop: 8, fontWeight: 600 }}>{msg}</div>}
          <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
            <button onClick={cancel} style={{ padding: "7px 16px", background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 6, fontSize: 13, cursor: "pointer" }}>Annulla</button>
            <button onClick={save} disabled={saving} style={{ padding: "7px 16px", background: "#1a73e8", color: "#fff", border: "none", borderRadius: 6, fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              {saving ? "Salvataggio…" : "Salva"}
            </button>
          </div>
        </div>
      )}

      {/* Tabella release — intestazioni a doppio livello, font compatto */}
      {!contractId ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Seleziona un contratto per visualizzare le release pianificate.</p>
      ) : records.length === 0 && !editing ? (
        <p style={{ color: "#94a3b8", fontSize: 13 }}>Nessuna release pianificata per questo contratto. Aggiungi la prima con "+ Nuova release".</p>
      ) : records.length > 0 ? (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, tableLayout: "auto" }}>
            <thead>
              {/* Riga 1: gruppi */}
              <tr style={{ background: "#102a47", color: "#fff" }}>
                <th rowSpan={2} style={{ padding: "6px 10px", textAlign: "left", whiteSpace: "nowrap", verticalAlign: "middle", minWidth: 100, borderRight: "1px solid #1e3a5f" }}>
                  Nome Release
                </th>
                {RELEASE_GROUPS.map(g => (
                  <th key={g.group}
                    colSpan={g.end ? 2 : 1}
                    style={{ padding: "4px 6px", textAlign: "center", whiteSpace: "nowrap", fontSize: 10, fontWeight: 700, borderRight: "1px solid #1e3a5f", borderBottom: "1px solid #1e3a5f", letterSpacing: "0.2px" }}>
                    {g.group}
                  </th>
                ))}
                <th rowSpan={2} style={{ padding: "6px 8px", textAlign: "center", verticalAlign: "middle", whiteSpace: "nowrap", minWidth: 110 }}>
                  Azioni
                </th>
              </tr>
              {/* Riga 2: Inizio / Fine */}
              <tr style={{ background: "#1a3a5c", color: "#c8d9ee" }}>
                {RELEASE_GROUPS.map(g => g.end ? (
                  [
                    <th key={g.start} style={{ padding: "3px 5px", textAlign: "center", fontSize: 9, fontWeight: 600, borderRight: "1px solid #1e3a5f" }}>Inizio</th>,
                    <th key={g.end}   style={{ padding: "3px 5px", textAlign: "center", fontSize: 9, fontWeight: 600, borderRight: "1px solid #1e3a5f" }}>Fine</th>,
                  ]
                ) : (
                  <th key={g.start} style={{ padding: "3px 5px", textAlign: "center", fontSize: 9, fontWeight: 600, borderRight: "1px solid #1e3a5f" }}>Data</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {records.map((rec, ri) => {
                const p = typeof rec.payload === "string" ? (() => { try { return JSON.parse(rec.payload); } catch { return {}; } })() : rec.payload || {};
                return (
                  <tr key={rec.Id || rec.id} style={{ background: ri % 2 === 0 ? "#fff" : "#f8fafc", borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "6px 10px", fontWeight: 700, color: "#1e293b", whiteSpace: "nowrap", borderRight: "1px solid #e2e8f0" }}>{rec.title}</td>
                    {RELEASE_GROUPS.map(g => g.end ? (
                      [
                        <td key={g.start} style={{ padding: "5px 6px", textAlign: "center", color: p[g.start] ? "#1e293b" : "#cbd5e1", fontSize: 11, whiteSpace: "nowrap" }}>
                          {formatDate(p[g.start])}
                        </td>,
                        <td key={g.end} style={{ padding: "5px 6px", textAlign: "center", color: p[g.end] ? "#1e293b" : "#cbd5e1", fontSize: 11, whiteSpace: "nowrap", borderRight: "1px solid #e2e8f0" }}>
                          {formatDate(p[g.end])}
                        </td>,
                      ]
                    ) : (
                      <td key={g.start} style={{ padding: "5px 6px", textAlign: "center", color: p[g.start] ? "#1e293b" : "#cbd5e1", fontSize: 11, whiteSpace: "nowrap", borderRight: "1px solid #e2e8f0" }}>
                        {formatDate(p[g.start])}
                      </td>
                    ))}
                    <td style={{ padding: "5px 8px", textAlign: "center", whiteSpace: "nowrap" }}>
                      <button onClick={() => openEdit(rec)} style={{ marginRight: 5, padding: "3px 8px", fontSize: 10, background: "#f1f5f9", border: "1px solid #cbd5e1", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>Modifica</button>
                      <button onClick={() => del(rec)} style={{ padding: "3px 8px", fontSize: 10, background: "#fff", border: "1px solid #fca5a5", color: "#dc2626", borderRadius: 4, cursor: "pointer", fontWeight: 600 }}>Elimina</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

// ── Pagina ────────────────────────────────────────────────────────────────────
function ContrattiPage({ onUnauthorized, ambienteId }) {
  const [towRows, setTowRows] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setTowRows([]);
      try {
        const tow = await getConsumoTow();
        setTowRows(tow);
      } catch (e) {
        if (e.message === "401") onUnauthorized?.();
      } finally {
        setLoading(false);
      }
    })();
  }, [ambienteId]); // eslint-disable-line

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento...
    </div>
  );

  return (
    <div style={{ padding: "24px 28px", background: "#f8fafc", minHeight: "100vh" }}>
      <ConsumoTowSection towRows={towRows} />
      <ReleaseScheduleSection />
    </div>
  );
}


export default ContrattiPage;
