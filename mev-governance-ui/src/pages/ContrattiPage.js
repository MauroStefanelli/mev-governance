import { useEffect, useState } from "react";
import { getConsumoTow } from "../services/mevService";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";

// ── Formattazione ─────────────────────────────────────────
const formatEuro = (value) => {
  if (!value && value !== 0) return "€ 0,00";
  const num = parseFloat(value);
  const [intPart, decPart] = num.toFixed(2).split(".");
  return `€ ${intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${decPart}`;
};

const formatEuroK = (value) => {
  if (!value) return "€ 0";
  const num = parseFloat(value);
  if (Math.abs(num) >= 1_000_000) return `€ ${(num / 1_000_000).toFixed(1)}M`;
  if (Math.abs(num) >= 1_000) return `€ ${(num / 1_000).toFixed(0)}K`;
  return `€ ${num.toFixed(0)}`;
};

// ── LABEL ESTERNA (FIX DEFINITIVO) ───────────────────────

const renderCustomizedLabel = ({
  cx, cy, midAngle, outerRadius, percent, value, name
}) => {
  const RADIAN = Math.PI / 180;

  // ✅ più spazio → evita che la label alta sparisca
  const radius = outerRadius + 30;

  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#333"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      style={{ fontSize: "11px", fontWeight: 500 }}
    >
      {`${name} ${formatEuro(value)} (${(percent * 100).toFixed(0)}%)`}
    </text>
  );
};


// ── TOOLTIP ───────────────────────────────────────────────

function PieTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;

  const p = payload[0];

  // ✅ FIX fondamentale
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
      {p.name}: <b>{formatEuro(p.value)}</b> ({perc}%)
    </div>
  );
}


// ── PIE COMPONENT ─────────────────────────────────────────

function TowPieChart({ title, rows, sum }) {
  const [activeIndex, setActiveIndex] = useState(null);

  const valoreTotale = sum(rows, "valoreTotale");

  // ✅ ORDINE + COLORI CORRETTI
  const baseData = [
    {
      name: "Ordinato",
      value: sum(rows, "ordinatiRda"),
      fill: "#00B853"
    },
    {
      name: "Impegnato",
      value: sum(rows, "impegnato"),
      fill: "#E49506"
    },
    {
      name: "Residuo",
      value: sum(rows, "residuo"),
      fill: "#2E75B6"
    }
  ].filter(d => d.value > 0);

  const data = baseData.map(d => ({
    ...d,
    allData: baseData
  }));

  return (
    <div style={{
      flex: "1 1 280px",
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

      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={260}>
          <PieChart margin={{ top: 30, right: 30, bottom: 30, left: 30 }}>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              startAngle={90}
              endAngle={-270}
              innerRadius={60}
              outerRadius={95}
              paddingAngle={3}
              dataKey="value"
              activeIndex={activeIndex}
              onMouseEnter={(_, i) => setActiveIndex(i)}
              onMouseLeave={() => setActiveIndex(null)}

              // ✅ fondamentali
              labelLine={{ stroke: "#999" }}
              label={renderCustomizedLabel}
              isAnimationActive={false}

              stroke="#fff"
              strokeWidth={2}
            >
              {data.map((entry, i) => (
                <Cell key={i} fill={entry.fill} />
              ))}
            </Pie>

            <Tooltip content={<PieTooltip />} />

            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: "11px", paddingTop: "6px" }}
            />
          </PieChart>
        </ResponsiveContainer>

        {/* ✅ CENTRO */}
        <div style={{
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          textAlign: "center",
          pointerEvents: "none",
        }}>
          <div style={{
            fontSize: "10px",
            color: "#888",
            fontWeight: 600,
            textTransform: "uppercase",
          }}>
            Totale
          </div>
          <div style={{
            fontSize: "14px",
            color: "#1a73e8",
            fontWeight: 700,
          }}>
            {formatEuroK(valoreTotale)}
          </div>
        </div>
      </div>
    </div>
  );
}


// ── MAIN SECTION ─────────────────────────────────────────
function ConsumoTowSection({ towRows }) {
  const sum = (rows, f) => rows.reduce((s, r) => s + (r[f] || 0), 0);

  const allRows = towRows;

  return (
    <div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <TowPieChart title="Totale Servizi" rows={allRows} sum={sum} />
      </div>
    </div>
  );
}

// ── PAGE ─────────────────────────────────────────────────
function ContrattiPage() {
  const [towRows, setTowRows] = useState([]);

  useEffect(() => {
    (async () => {
      const tow = await getConsumoTow();
      setTowRows(tow);
    })();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <ConsumoTowSection towRows={towRows} />
    </div>
  );
}

export default ContrattiPage;