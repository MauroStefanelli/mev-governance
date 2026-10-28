import { useMemo, useState, useEffect } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getConsumoTow } from "../services/mevService";

const TABS = [
  { id: "release", label: "Release" },
  { id: "applicativo", label: "Applicativo" },
  { id: "anno", label: "Anno" },
];
const PALETTE = ["#526DAB", "#C48A39", "#438579", "#8D78AB", "#A96A78", "#688B9C"];
const STATUS_COLORS = {
  approvato:              "#526DAB",
  "in approvazione":      "#C48A39",
  "in analisi / stima":   "#438579",
  "in analisi":           "#438579",
  "in lavorazione":       "#8D78AB",
  chiuso:                 "#688B9C",
};
// Ordine di visualizzazione preferenziale (i primi 3 sono quelli principali)
const STATUS_ORDER = [
  "approvato",
  "in approvazione",
  "in analisi / stima",
  "in analisi",
  "in lavorazione",
  "chiuso",
];
// Stati sempre esclusi dai grafici (non mostrati neanche con "Mostra tutti")
const STATI_ESCLUSI = new Set(["eliminato", "sospeso"]);
// Stati mostrati di default
const DEFAULT_VISIBLE = ["approvato", "in approvazione", "in analisi / stima", "in analisi"];

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
    const value = amount(row.importoBdo || row.importoExcel); // preferisce importoBdo, fallback su importoExcel
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

function KpiCard({ title, value, description, accent, symbol, loading = false }) {
  return (
    <section aria-label={title} style={{ ...panel, padding: 24, flex: "1 1 230px" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
        <span style={{ ...muted, fontWeight: 600 }}>{title}</span>
        <span aria-hidden="true" style={{ color: accent, background: `${accent}12`, borderRadius: 10, width: 36, height: 36, display: "grid", placeItems: "center", fontWeight: 700 }}>{symbol}</span>
      </div>
      <div style={{ fontSize: "clamp(23px, 2.5vw, 32px)", fontWeight: 700, letterSpacing: "-0.8px", margin: "15px 0 8px", overflowWrap: "anywhere", fontVariantNumeric: "tabular-nums", color: loading ? "#C8D0DC" : "inherit" }}>
        {loading ? "—" : euro.format(value ?? 0)}
      </div>
      <div style={{ ...muted, fontSize: 12 }}>{description}</div>
    </section>
  );
}

export default function ChartPage({ rows = [], ambienteId }) {
  const [activeTab, setActiveTab] = useState("release");
  const [sort, setSort] = useState("name");

  // ── KPI da ConsumoTow (stessa fonte del Monitoraggio contratto) ───────────
  const [towRows, setTowRows] = useState(null); // null = loading
  useEffect(() => {
    getConsumoTow()
      .then(data => setTowRows(Array.isArray(data) ? data : []))
      .catch(() => setTowRows([]));
  }, [ambienteId]);

  // Tutti gli stati presenti nei dati — escluso Eliminato e Sospeso
  const safeRows = useMemo(() =>
    Array.isArray(rows)
      ? rows.filter((row) => {
          if (!row || typeof row !== "object") return false;
          const s = String(row.stato || "").trim();
          if (!s) return false;
          if (STATI_ESCLUSI.has(s.toLocaleLowerCase("it-IT"))) return false;
          return true;
        })
      : [], [rows]);

  const allStates = useMemo(() => {
    const seen = new Map();
    safeRows.forEach(row => {
      const key = normalize(row.stato);
      if (!seen.has(key)) seen.set(key, labelOf(row.stato));
    });
    // Ordine fisso: prima STATUS_ORDER, poi eventuali altri stati alfabeticamente
    const ordered = [];
    STATUS_ORDER.forEach(k => { if (seen.has(k)) ordered.push([k, seen.get(k)]); });
    [...seen.entries()]
      .filter(([k]) => !STATUS_ORDER.includes(k))
      .sort((a, b) => collator.compare(a[1], b[1]))
      .forEach(e => ordered.push(e));
    return ordered;
  }, [safeRows]);

  // Filtro stati attivi — default: solo Approvato e In Approvazione se presenti, altrimenti tutti
  const [activeStates, setActiveStates] = useState(null); // null = non ancora inizializzato
  const resolvedActiveStates = useMemo(() => {
    if (activeStates !== null) return activeStates;
    // Inizializzazione lazy: seleziona DEFAULT_VISIBLE se presenti, altrimenti tutti
    const defaults = allStates.filter(([key]) => DEFAULT_VISIBLE.includes(key)).map(([key]) => key);
    return defaults.length > 0 ? new Set(defaults) : new Set(allStates.map(([key]) => key));
  }, [activeStates, allStates]);

  const toggleState = (key) => {
    setActiveStates(prev => {
      const current = prev ?? resolvedActiveStates;
      const next = new Set(current);
      if (next.has(key)) { if (next.size > 1) next.delete(key); } // almeno 1 sempre attivo
      else next.add(key);
      return next;
    });
  };

  const selectAll = () => setActiveStates(new Set(allStates.map(([k]) => k)));

  // Righe filtrate per stato
  const filteredRows = useMemo(() =>
    safeRows.filter(row => resolvedActiveStates.has(normalize(row.stato))),
    [safeRows, resolvedActiveStates]);

  // ── KPI aggregati dalla tabella ConsumoTow — allineati al Monitoraggio contratto ──
  // towRows contiene tutte le righe dell'ambiente; sommiamo senza filtro per contratto.
  const kpis = useMemo(() => {
    if (!towRows) return null; // loading
    const sumField = (field) => towRows.reduce((s, r) => s + (r[field] || 0), 0);
    return {
      approved:   sumField("approvato"),
      ordered:    sumField("ordinatiRda"),
      impegnato:  sumField("impegnato"),
      // In Approvazione e In Analisi: non disponibili in ConsumoTow → calcolati da safeRows
      inApproval: safeRows.reduce((s, r) => normalize(r.stato) === "in approvazione" ? s + amount(r.importoBdo || r.importoExcel) : s, 0),
      inAnalisi:  safeRows.reduce((s, r) => ["in analisi / stima","in analisi"].includes(normalize(r.stato)) ? s + amount(r.importoBdo || r.importoExcel) : s, 0),
    };
  }, [towRows, safeRows]);

  const summary = useMemo(() => aggregate(filteredRows, activeTab), [filteredRows, activeTab]);
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
            <p style={{ ...muted, margin: 0 }}>Una vista d'insieme su forniture, ordini e fatturazione.</p>
          </div>
          <span style={{ padding: "8px 12px", background: "#FFFFFF", border: "1px solid #E3E8EF", borderRadius: 8, fontSize: 12, color: "#68758A" }}>{count.format(filteredRows.length)} MEV nel perimetro</span>
        </header>

        {/* ── KPI box — allineati al Monitoraggio contratto (fonte: ConsumoTow) ── */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, marginBottom: 28 }}>
          <KpiCard title="Approvato"        value={kpis?.approved}   description="Da ConsumoTow · identico al Monitoraggio" accent="#526DAB" symbol="✓" loading={!kpis} />
          <KpiCard title="In Approvazione"  value={kpis?.inApproval} description="Importo MEV · stato In Approvazione"      accent="#C48A39" symbol="⏳" loading={!kpis} />
          <KpiCard title="In Analisi / Stima" value={kpis?.inAnalisi} description="Importo MEV · In Analisi / Stima"         accent="#438579" symbol="◎" loading={!kpis} />
          <KpiCard title="Ordinato"         value={kpis?.ordered}    description="Da ConsumoTow · OrdinatiRda"               accent="#687A99" symbol="≡" loading={!kpis} />
          <KpiCard title="Impegnato"        value={kpis?.impegnato}  description="Da ConsumoTow · Approvato − Ordinato"      accent="#8D78AB" symbol="◐" loading={!kpis} />
        </div>

        {/* ── Tab raggruppamento + Filtro Visualizza + Ordina ── */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12, marginBottom: 18 }}>
          {/* Sinistra: tab + filtro stati inline */}
          <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <nav aria-label="Raggruppamento grafici" style={{ display: "flex", flexWrap: "wrap", padding: 4, border: "1px solid #E3E8EF", background: "#EAF0F5", borderRadius: 11, gap: 4 }}>
              {TABS.map((tab) => (
                <button key={tab.id} type="button" aria-pressed={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} style={{ fontFamily: "inherit", border: "1px solid transparent", cursor: "pointer", padding: "10px 18px", borderRadius: 8, fontSize: 13, fontWeight: 600, background: activeTab === tab.id ? "#FFFFFF" : "transparent", color: activeTab === tab.id ? "#263D63" : "#68758A", boxShadow: activeTab === tab.id ? "0 2px 5px rgba(24,39,63,0.07)" : "none" }}>{tab.label}</button>
              ))}
            </nav>
            {/* Filtro stati accanto alle tab */}
            {allStates.map(([key, label]) => {
              const active = resolvedActiveStates.has(key);
              const color = STATUS_COLORS[key] || PALETTE[allStates.findIndex(([k]) => k === key) % PALETTE.length];
              return (
                <label key={key} style={{ display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", padding: "8px 12px", borderRadius: 8, border: `1px solid ${active ? color : "#DCE3EC"}`, background: active ? `${color}14` : "#F8FAFC", fontSize: 12, fontWeight: 600, color: active ? color : "#8290A3", userSelect: "none" }}>
                  <input type="checkbox" checked={active} onChange={() => toggleState(key)}
                    style={{ accentColor: color, width: 12, height: 12, cursor: "pointer" }} />
                  {label}
                </label>
              );
            })}
            {resolvedActiveStates.size < allStates.length && (
              <button type="button" onClick={selectAll} style={{ background: "none", border: "1px solid #DCE3EC", color: "#526DAB", fontSize: 12, cursor: "pointer", padding: "8px 12px", fontWeight: 600, borderRadius: 8 }}>
                Mostra tutti
              </button>
            )}
          </div>
          {/* Destra: ordina */}
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
              <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Nessun dato per i filtri selezionati</div>
              <div style={muted}>{safeRows.length > 0 ? "Seleziona almeno uno stato nel filtro sopra." : "Nessuna riga MEV disponibile per questo ambiente."}</div>
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
