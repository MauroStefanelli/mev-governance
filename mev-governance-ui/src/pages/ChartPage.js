import { useMemo, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";

const TABS = [
  { id: "release", label: "Release" },
  { id: "applicativo", label: "Applicativo" },
  { id: "anno", label: "Anno" },
];
const PALETTE = ["#526DAB", "#C48A39", "#438579", "#8D78AB", "#A96A78", "#688B9C"];
const STATUS_COLORS = {
  approvato: "#526DAB", "in lavorazione": "#C48A39", chiuso: "#438579",
};
const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
const compact = new Intl.NumberFormat("it-IT", { notation: "compact", maximumFractionDigits: 1 });
const count = new Intl.NumberFormat("it-IT");
const collator = new Intl.Collator("it", { numeric: true, sensitivity: "base" });
const amount = (value) => {
  if (typeof value !== "number" && typeof value !== "string") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const labelOf = (value) => String(value == null ? "" : value).trim() || "N/D";
const normalize = (value) => labelOf(value).toLocaleLowerCase("it-IT");
const shortEuro = (value) => `${compact.format(amount(value))} €`;
const panel = {
  background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: 16,
  boxShadow: "0 3px 14px rgba(23, 39, 63, 0.035)", minWidth: 0,
};
const muted = { color: "#68758A", fontSize: 13, lineHeight: 1.6 };
const cell = { padding: "14px 18px", borderBottom: "1px solid #EDF0F4", whiteSpace: "nowrap" };

function aggregate(rows, tab) {
  const names = new Map();
  rows.forEach((row) => {
    const key = normalize(row.stato);
    if (!names.has(key)) names.set(key, labelOf(row.stato));
  });
  // Internal keys avoid collisions with labels containing dots or reserved names.
  const series = [...names.entries()].sort((a, b) => collator.compare(a[1], b[1]))
    .map(([status, name], index) => ({
      status, name, key: `s${index}`, color: STATUS_COLORS[status] || PALETTE[index % PALETTE.length],
    }));
  const statusKeys = new Map(series.map((item) => [item.status, item.key]));
  const groups = new Map();
  rows.forEach((row) => {
    const group = labelOf(tab === "release"
      ? (labelOf(row.releaseExcel) !== "N/D" ? row.releaseExcel : row.pRelease)
      : tab === "anno" ? row.annoCompetenza : row.applicativo);
    if (!groups.has(group)) {
      groups.set(group, { group, total: 0, records: 0, ...Object.fromEntries(series.map((s) => [s.key, 0])) });
    }
    const entry = groups.get(group);
    const value = amount(row.importoExcel);
    entry[statusKeys.get(normalize(row.stato))] += value;
    entry.total += value;
    entry.records += 1;
  });
  const data = [...groups.values()].sort((a, b) => collator.compare(a.group, b.group));
  const totals = Object.fromEntries(series.map((s) => [s.key, data.reduce((sum, row) => sum + row[s.key], 0)]));
  return { data, series, totals, total: data.reduce((sum, row) => sum + row.total, 0) };
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div style={{ ...panel, padding: 16, maxWidth: 320, fontSize: 12 }}>
      <div style={{ fontWeight: 700, marginBottom: 12, overflowWrap: "anywhere" }}>{label}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 24, marginTop: 8 }}>
          <span><span style={{ color: entry.color }}>●</span> {entry.name}</span>
          <strong style={{ whiteSpace: "nowrap" }}>{euro.format(amount(entry.value))}</strong>
        </div>
      ))}
      <div style={{ display: "flex", justifyContent: "space-between", gap: 24, borderTop: "1px solid #E3E8EF", marginTop: 12, paddingTop: 12 }}>
        <span>Totale fornitura</span><strong>{euro.format(payload[0].payload.total)}</strong>
      </div>
    </div>
  );
}

function KpiCard({ title, value, description, accent, symbol }) {
  return (
    <section aria-label={title} style={{ ...panel, padding: 24, flex: "1 1 230px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ ...muted, fontWeight: 600 }}>{title}</span>
        <span aria-hidden="true" style={{ color: accent, background: `${accent}12`, borderRadius: 10, width: 36, height: 36, display: "grid", placeItems: "center", fontWeight: 700 }}>{symbol}</span>
      </div>
      <div style={{ fontSize: "clamp(23px, 2.5vw, 32px)", fontWeight: 700, letterSpacing: "-0.8px", margin: "15px 0 8px", overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums" }}>{euro.format(value)}</div>
      <div style={{ ...muted, fontSize: 12 }}>{description}</div>
    </section>
  );
}

export default function ChartPage({ rows = [] }) {
  const [activeTab, setActiveTab] = useState("release");
  const [sort, setSort] = useState("name");
  const safeRows = useMemo(() => Array.isArray(rows) ? rows.filter((row) => row && typeof row === "object") : [], [rows]);
  const kpis = useMemo(() => safeRows.reduce((result, row) => {
    // Approved uses the supply amount, consistently with the chart measure.
    if (normalize(row.stato) === "approvato") result.approved += amount(row.importoExcel);
    result.ordered += amount(row.ordinatoBdo);
    result.invoiced += amount(row.fatturato);
    return result;
  }, { approved: 0, ordered: 0, invoiced: 0 }), [safeRows]);
  const summary = useMemo(() => aggregate(safeRows, activeTab), [safeRows, activeTab]);
  const data = useMemo(() => sort === "amount"
    ? [...summary.data].sort((a, b) => b.total - a.total || collator.compare(a.group, b.group))
    : summary.data, [summary.data, sort]);
  const tabLabel = TABS.find((tab) => tab.id === activeTab).label;
  const chartWidth = Math.max(640, data.length * 86);

  return (
    <main style={{ background: "#F5F7FA", color: "#243247", padding: "clamp(16px, 3vw, 36px)", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", minWidth: 0, boxSizing: "border-box" }}>
      <div style={{ maxWidth: 1480, margin: "0 auto" }}>
        <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.8px", color: "#718097", marginBottom: 10 }}>MEV / ANALISI ECONOMICA</div>
            <h1 style={{ fontSize: 30, letterSpacing: "-0.8px", margin: "0 0 8px", fontWeight: 700 }}>Grafici</h1>
            <p style={{ ...muted, margin: 0 }}>Una vista d’insieme su forniture, ordini e fatturazione.</p>
          </div>
          <span style={{ padding: "8px 12px", background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: 8, fontSize: 12, color: "#68758A" }}>{count.format(safeRows.length)} MEV nel perimetro</span>
        </header>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
          <KpiCard title="Totale approvato" value={kpis.approved} description="Importo fornitura · stato Approvato" accent="#526DAB" symbol="✓" />
          <KpiCard title="Totale ordinato" value={kpis.ordered} description="Ordinato BDO · tutti gli stati" accent="#687A99" symbol="≡" />
          <KpiCard title="Totale fatturato" value={kpis.invoiced} description="Fatturato · tutti gli stati" accent="#438579" symbol="€" />
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, marginBottom: 18 }}>
          <nav aria-label="Raggruppamento grafici" style={{ display: "flex", flexWrap: "wrap", padding: 4, border: "1px solid #E3E8EF", background: "#EAF0F5", borderRadius: 11, gap: 4 }}>
            {TABS.map((tab) => (
              <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} style={{ fontFamily: "inherit", border: "1px solid transparent", cursor: "pointer", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: activeTab === tab.id ? "#FFFFFF" : "transparent", color: activeTab === tab.id ? "#263D63" : "#68758A", boxShadow: activeTab === tab.id ? "0 2px 5px rgba(24,39,63,0.07)" : "none" }}>{tab.label}</button>
            ))}
          </nav>
          <label style={{ ...muted, display: "flex", gap: 10, alignItems: "center" }}>
            Ordina per
            <select value={sort} onChange={(event) => setSort(event.target.value)} style={{ fontFamily: "inherit", background: "#FFFFFF", border: "1px solid #DCE3EC", color: "#34445C", borderRadius: 8, padding: "9px 12px", fontSize: 13 }}>
              <option value="name">{tabLabel}</option>
              <option value="amount">Importo decrescente</option>
            </select>
          </label>
        </div>

        <section aria-label={`Importi per ${tabLabel}`} style={{ ...panel, padding: "24px 0", marginBottom: 20 }}>
          <div style={{ padding: "0 24px", display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div>
              <h2 style={{ margin: "0 0 6px", fontSize: 18, letterSpacing: "-0.3px" }}>Importi per {tabLabel.toLowerCase()}</h2>
              <p style={{ ...muted, margin: 0 }}>Importo fornitura suddiviso per stato · valori in euro</p>
            </div>
            <div>
              <div style={{ ...muted, fontSize: 11, textTransform: "uppercase", letterSpacing: "0.7px" }}>Totale fornitura</div>
              <div style={{ fontSize: 21, fontWeight: 700, marginTop: 5 }}>{euro.format(summary.total)}</div>
            </div>
          </div>
          {!data.length ? (
            <div role="status" style={{ textAlign: "center", padding: "72px 24px" }}>
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Nessun dato disponibile</div>
              <div style={muted}>I grafici saranno visibili quando saranno presenti righe MEV nel perimetro selezionato.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 20px", padding: "22px 24px 12px" }}>
                {summary.series.map((s) => <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 12, color: "#56657B" }}><span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 3, background: s.color }} />{s.name}</span>)}
              </div>
              <div role="region" aria-label="Grafico a barre; dati completi nella tabella seguente. Scorrimento orizzontale disponibile." tabIndex={0} style={{ overflowX: "auto", margin: "0 12px" }}>
                <div style={{ minWidth: chartWidth, height: 390 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={data} stackOffset="sign" margin={{ top: 20, right: 24, left: 8, bottom: 18 }} barCategoryGap="30%" accessibilityLayer>
                      <CartesianGrid stroke="#E9EDF3" strokeDasharray="3 4" vertical={false} />
                      <XAxis dataKey="group" axisLine={false} tickLine={false} interval={0} height={72} angle={-30} textAnchor="end" tick={{ fill: "#68758A", fontSize: 11 }} tickMargin={12} tickFormatter={(value) => value.length > 20 ? `${value.slice(0, 18)}…` : value} />
                      <YAxis width={85} axisLine={false} tickLine={false} tick={{ fill: "#8290A3", fontSize: 11 }} tickFormatter={shortEuro} />
                      <Tooltip content={<ChartTooltip />} cursor={{ fill: "#F0F3F8" }} />
                      {summary.series.map((s) => <Bar key={s.key} dataKey={s.key} name={s.name} stackId="amount" fill={s.color} maxBarSize={46} isAnimationActive={false} />)}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
              <p style={{ ...muted, fontSize: 11, margin: "4px 24px 0" }}>Ogni barra rappresenta il totale fornitura del gruppo. Le etichette complete e gli importi sono disponibili nel dettaglio seguente.</p>
            </>
          )}
        </section>

        {!!data.length && (
          <section style={{ ...panel, overflow: "hidden" }}>
            <div style={{ padding: "22px 24px", display: "flex", flexWrap: "wrap", justifyContent: "space-between", gap: 8, alignItems: "center" }}>
              <h2 style={{ fontSize: 17, margin: 0 }}>Dettaglio per {tabLabel.toLowerCase()}</h2>
              <span style={muted}>{count.format(data.length)} gruppi</span>
            </div>
            <div role="region" aria-label={`Tabella importi per ${tabLabel}`} tabIndex={0} style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                <caption style={{ textAlign: "left", padding: "0 24px 16px", ...muted, fontSize: 12 }}>Importo fornitura per stato, in euro. N/D indica un valore non disponibile.</caption>
                <thead style={{ background: "#F8FAFC", color: "#68758A" }}>
                  <tr>
                    <th scope="col" style={{ ...cell, textAlign: "left" }}>{tabLabel}</th>
                    <th scope="col" style={{ ...cell, textAlign: "right" }}>MEV</th>
                    {summary.series.map((s) => <th scope="col" key={s.key} style={{ ...cell, textAlign: "right" }}>{s.name}</th>)}
                    <th scope="col" style={{ ...cell, textAlign: "right" }}>Totale</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, index) => (
                    <tr key={row.group} style={{ background: index % 2 ? "#FBFCFE" : "#FFFFFF" }}>
                      <th scope="row" style={{ ...cell, textAlign: "left", fontWeight: 600 }}>{row.group}</th>
                      <td style={{ ...cell, textAlign: "right", color: "#68758A" }}>{count.format(row.records)}</td>
                      {summary.series.map((s) => <td key={s.key} style={{ ...cell, textAlign: "right" }}>{euro.format(row[s.key])}</td>)}
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700 }}>{euro.format(row.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot style={{ background: "#EFF3F8", fontWeight: 700 }}>
                  <tr>
                    <th scope="row" style={{ ...cell, textAlign: "left" }}>Totale complessivo</th>
                    <td style={{ ...cell, textAlign: "right" }}>{count.format(safeRows.length)}</td>
                    {summary.series.map((s) => <td key={s.key} style={{ ...cell, textAlign: "right" }}>{euro.format(summary.totals[s.key])}</td>)}
                    <td style={{ ...cell, textAlign: "right" }}>{euro.format(summary.total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>
        )}
        <p style={{ ...muted, fontSize: 11, margin: "18px 2px 0" }}>Analisi delle righe ricevute dalla pagina. Gli importi fornitura fanno riferimento a importoExcel, prima dello sconto.</p>
      </div>
    </main>
  );
}
