import { useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from "recharts";

// ===============================
// Costanti
// ===============================
const COLORS = [
  "#1a73e8", "#e8710a", "#34a853", "#ea4335", "#9c27b0",
  "#00bcd4", "#ff9800", "#607d8b", "#795548", "#e91e63",
  "#3f51b5", "#009688", "#8bc34a", "#ff5722", "#607d8b"
];

// ===============================
// Utils
// ===============================
const formatEuroShort = (value) => {
  if (value >= 1000000) return `€ ${(value / 1000000).toFixed(1)}M`;
  if (value >= 1000) return `€ ${(value / 1000).toFixed(0)}K`;
  return `€ ${value.toFixed(0)}`;
};

const formatEuroFull = (value) => {
  if (value === null || value === undefined) return "";
  const [intPart, decPart] = Number(value).toFixed(2).split(".");
  const intFormatted = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `€ ${intFormatted},${decPart}`;
};

// ===============================
// Tooltip personalizzato
// ===============================
const makeTooltip = (groupLabel) => ({ active, payload, label }) => {
  if (!active || !payload || !payload.length) return null;
  const total = payload.reduce((s, p) => s + (p.value || 0), 0);
  return (
    <div style={{
      background: "white", border: "1px solid #ddd", borderRadius: "6px",
      padding: "12px 16px", fontSize: "13px", boxShadow: "0 2px 8px rgba(0,0,0,0.12)",
      maxWidth: "320px"
    }}>
      <p style={{ fontWeight: "bold", marginBottom: "8px", borderBottom: "1px solid #eee", paddingBottom: "6px" }}>
        {groupLabel}: {label}
      </p>
      {payload.map((p) => (
        <div key={p.name} style={{ display: "flex", justifyContent: "space-between", gap: "24px", marginBottom: "4px" }}>
          <span style={{ color: p.fill }}>● {p.name}</span>
          <span style={{ fontWeight: "bold" }}>{formatEuroFull(p.value)}</span>
        </div>
      ))}
      <div style={{ borderTop: "1px solid #eee", marginTop: "6px", paddingTop: "6px", display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontWeight: "bold" }}>Totale</span>
        <span style={{ fontWeight: "bold" }}>{formatEuroFull(total)}</span>
      </div>
    </div>
  );
};

// ===============================
// Componente grafico riutilizzabile
// ===============================
function BarChartSection({ title, groupKey, groupLabel, seriesKey, rows }) {
  const allSeries = [...new Set(rows.map((r) => r[seriesKey]).filter(Boolean))].sort();

  // Raggruppa per groupKey → somma importoExcel per seriesKey
  const groupMap = {};
  rows.forEach((r) => {
    const group = r[groupKey] || "N/D";
    const series = r[seriesKey] || "N/D";
    const importo = Number(r.importoExcel) || 0;
    if (!groupMap[group]) groupMap[group] = {};
    groupMap[group][series] = (groupMap[group][series] || 0) + importo;
  });

  const chartData = Object.entries(groupMap)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([group, series]) => ({ group, ...series }));

  const grandTotal = chartData.reduce(
    (s, d) => s + allSeries.reduce((ss, ser) => ss + (d[ser] || 0), 0), 0
  );

  const CustomTooltip = makeTooltip(groupLabel);

  return (
    <div style={{ marginBottom: "48px" }}>
      <h3 style={{ marginTop: 0, marginBottom: "4px" }}>{title}</h3>
      <p style={{ color: "#666", fontSize: "13px", marginBottom: "20px" }}>
        Totale complessivo: <strong>{formatEuroFull(grandTotal)}</strong>
      </p>

      <ResponsiveContainer width="100%" height={420}>
        <BarChart
          data={chartData}
          margin={{ top: 10, right: 30, left: 20, bottom: 80 }}
        >
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
          <XAxis
            dataKey="group"
            tick={{ fontSize: 11 }}
            angle={-35}
            textAnchor="end"
            interval={0}
          />
          <YAxis
            tickFormatter={formatEuroShort}
            tick={{ fontSize: 11 }}
            width={80}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ paddingTop: "16px", fontSize: "13px" }} verticalAlign="bottom" />
          {allSeries.map((s, i) => (
            <Bar key={s} dataKey={s} name={s} stackId="a" fill={COLORS[i % COLORS.length]} />
          ))}
        </BarChart>
      </ResponsiveContainer>

      {/* Tabella riepilogativa */}
      <h4 style={{ marginTop: "28px", marginBottom: "8px" }}>Riepilogo per {groupLabel}</h4>
      <div style={{ overflowX: "auto" }}>
        <table border="1" cellPadding="8" style={{ borderCollapse: "collapse", fontSize: "13px", width: "100%" }}>
          <thead style={{ background: "#f0f0f0" }}>
            <tr>
              <th style={{ textAlign: "left" }}>{groupLabel}</th>
              {allSeries.map((s) => <th key={s} style={{ textAlign: "right" }}>{s}</th>)}
              <th style={{ textAlign: "right" }}>Totale</th>
            </tr>
          </thead>
          <tbody>
            {chartData.map((d, i) => {
              const tot = allSeries.reduce((s, ser) => s + (d[ser] || 0), 0);
              return (
                <tr key={d.group} style={{ background: i % 2 === 0 ? "white" : "#fafafa" }}>
                  <td><strong>{d.group}</strong></td>
                  {allSeries.map((s) => (
                    <td key={s} style={{ textAlign: "right" }}>{d[s] ? formatEuroFull(d[s]) : "—"}</td>
                  ))}
                  <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatEuroFull(tot)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot style={{ background: "#f0f0f0" }}>
            <tr>
              <td><strong>Totale</strong></td>
              {allSeries.map((s) => {
                const tot = chartData.reduce((sum, d) => sum + (d[s] || 0), 0);
                return <td key={s} style={{ textAlign: "right", fontWeight: "bold" }}>{formatEuroFull(tot)}</td>;
              })}
              <td style={{ textAlign: "right", fontWeight: "bold" }}>{formatEuroFull(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ===============================
// Pagina principale
// ===============================
function ChartPage({ rows }) {
  const [activeTab, setActiveTab] = useState("release");

  const tabStyle = (id) => ({
    padding: "8px 20px",
    cursor: "pointer",
    border: "1px solid #ddd",
    borderBottom: activeTab === id ? "2px solid #1a73e8" : "1px solid #ddd",
    background: activeTab === id ? "white" : "#f8f9fa",
    color: activeTab === id ? "#1a73e8" : "#444",
    fontWeight: activeTab === id ? "bold" : "normal",
    fontSize: "14px",
    marginRight: "4px",
    borderRadius: "4px 4px 0 0"
  });

  return (
    <div style={{ padding: "20px" }}>
      {/* Tab switcher */}
      <div style={{ borderBottom: "1px solid #ddd", marginBottom: "24px" }}>
        <button style={tabStyle("release")} onClick={() => setActiveTab("release")}>
          Per Release
        </button>
        <button style={tabStyle("applicativo")} onClick={() => setActiveTab("applicativo")}>
          Per Applicativo
        </button>
        <button style={tabStyle("anno")} onClick={() => setActiveTab("anno")}>
          Per Anno
        </button>
      </div>

      {activeTab === "release" && (
        <BarChartSection
          title="Importi CAP per Release suddivisi per Stato"
          groupKey="pRelease"
          groupLabel="Release"
          seriesKey="stato"
          rows={rows}
        />
      )}

      {activeTab === "applicativo" && (
        <BarChartSection
          title="Importi CAP per Applicativo suddivisi per Stato"
          groupKey="applicativo"
          groupLabel="Applicativo"
          seriesKey="stato"
          rows={rows}
        />
      )}

      {activeTab === "anno" && (
        <BarChartSection
          title="Importi CAP per Anno suddivisi per Stato"
          groupKey="annoCompetenza"
          groupLabel="Anno"
          seriesKey="stato"
          rows={rows}
        />
      )}
    </div>
  );
}

export default ChartPage;
