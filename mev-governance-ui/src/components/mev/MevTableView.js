import React, { Children, cloneElement, useLayoutEffect, useRef, useState } from "react";

export const pageStyle = { padding: "24px clamp(12px, 2vw, 28px) 40px", background: "#f4f7fc", fontFamily: "system-ui, -apple-system, sans-serif", color: "#243247", minWidth: 0 };
export const toolbarStyle = { display: "flex", alignItems: "center", gap: 10, marginBottom: 20, flexWrap: "wrap", padding: 16, background: "#fff", border: "1px solid #dde5f0", borderRadius: 10 };
export function PageHeading({ title }) {
  return <header style={{ marginBottom: 22 }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#526581", marginBottom: 6 }}>GOVERNANCE · PORTAFOGLIO ATTIVITÀ</div><h1 style={{ margin: "0 0 8px", fontSize: 28, letterSpacing: -.7 }}>{title}</h1><p style={{ margin: 0, color: "#526581", fontSize: 14 }}>Importi, ordini e subforniture. Una vista condivisa per seguire ogni attività.</p></header>;
}
export function FinancialSummary({ supply, oda, subco, format, approved = false }) {
  return <section aria-label="Riepilogo economico delle righe filtrate" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 220px), 1fr))", gap: 14, marginBottom: 20 }}>
    {[
      ["Totale Fornitura", supply, "#1a73e8", "#185abc", "#eef5ff", approved ? "Righe filtrate · solo approvati" : "Righe filtrate"],
      ["Totale ODA", oda, "#12c937", "#176b2b", "#eefaf1", "Ordinato · righe filtrate"],
      ["Totale SUBCO", subco, "#d97706", "#92400e", "#fff7ed", "Subforniture · righe filtrate"],
    ].map(([label, value, accent, ink, bg, detail]) => <div key={label} style={{ background: bg, border: "1px solid #dce4ee", borderTop: `3px solid ${accent}`, borderRadius: 10, padding: "18px 20px" }}><div style={{ fontSize: 12, fontWeight: 700, color: ink }}>{label}</div><div style={{ margin: "8px 0", fontSize: 25, fontWeight: 750, color: ink, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{format(value)}</div><div style={{ fontSize: 12, color: "#526174" }}>{detail}</div></div>)}
  </section>;
}

// All three table bands use the same width and offset model. On narrow screens
// only ID/GoTo remain fixed so the frozen area never hides the scrollable data.
export default function MevTableView({ children, widths, rdaIndex, label }) {
  const viewport = useRef(null);
  const [available, setAvailable] = useState(0);
  const [freeze, setFreeze] = useState("goto");
  useLayoutEffect(() => {
    const update = () => setAvailable(viewport.current?.clientWidth || 0);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(viewport.current);
    return () => observer.disconnect();
  }, []);
  const rdaWidth = widths.slice(0, rdaIndex + 1).reduce((a, b) => a + b, 0);
  const canFreezeRda = available >= rdaWidth + 300;
  const count = freeze === "rda" && canFreezeRda ? rdaIndex + 1 : freeze === "id" ? 1 : 2;
  const offsets = widths.map((_, i) => widths.slice(0, i).reduce((a, b) => a + b, 0));
  const table = Children.only(children);
  const bands = Children.map(table.props.children, band => {
    if (!React.isValidElement(band) || !["thead", "tbody"].includes(band.type)) return null;
    const head = band.type === "thead";
    return cloneElement(band, { style: head ? { position: "sticky", top: 0, zIndex: 5 } : undefined }, Children.map(band.props.children, row => {
      if (!React.isValidElement(row)) return row;
      return cloneElement(row, {}, Children.map(row.props.children, (cell, i) => {
        if (!React.isValidElement(cell)) return cell;
        const fixed = i < count;
        return cloneElement(cell, {
          scope: head ? "col" : undefined,
          style: { ...cell.props.style, boxSizing: "border-box", width: widths[i], minWidth: widths[i], maxWidth: widths[i], padding: head ? "10px 10px" : "11px 10px", overflowWrap: "anywhere", color: "#26364a", borderBottom: "1px solid #e4eaf2", position: fixed ? "sticky" : undefined, left: fixed ? offsets[i] : undefined, zIndex: fixed ? 2 : undefined, background: head ? "#f0f5fc" : fixed ? (cell.props.style?.background || row.props.style?.backgroundColor || "#fff") : cell.props.style?.background, borderRight: i === count - 1 ? "2px solid #c5d5eb" : undefined, boxShadow: i === count - 1 ? "4px 0 8px -6px #64748b" : undefined },
        });
      }));
    }));
  });
  return <section style={{ minWidth: 0, border: "1px solid #dce4ef", borderRadius: 10, background: "#fff", boxShadow: "0 4px 18px #18345b08" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "space-between", alignItems: "center", padding: "14px 16px", borderBottom: "1px solid #dce4ef" }}><div><strong style={{ fontSize: 14 }}>Dettaglio attività</strong><div style={{ fontSize: 12, color: "#526581", marginTop: 4 }}>Scorri in orizzontale per esplorare tutte le colonne.</div></div><label style={{ fontSize: 12, color: "#334155", display: "flex", alignItems: "center", gap: 8 }}>Colonne fisse<select aria-label="Colonne fisse" value={freeze} onChange={e => setFreeze(e.target.value)} style={{ padding: "8px 10px", border: "1px solid #b6c6dc", background: "#fff", borderRadius: 6, color: "#185abc", font: "inherit" }}><option value="id">Solo ID</option><option value="goto">ID e GoTo</option><option value="rda" disabled={!canFreezeRda}>Fino a RDA{!canFreezeRda ? " (schermo ampio)" : ""}</option></select>{freeze === "rda" && !canFreezeRda && <span>Ora: ID e GoTo</span>}</label></div>
    <div ref={viewport} role="region" aria-label={label} tabIndex={0} style={{ overflow: "auto", maxHeight: "70vh", minWidth: 0, borderRadius: "0 0 10px 10px" }}>
      {cloneElement(table, { style: { tableLayout: "fixed", width: widths.reduce((a, b) => a + b, 0), borderCollapse: "separate", borderSpacing: 0, fontSize: 13 } }, <colgroup>{widths.map((width, i) => <col key={i} style={{ width }} />)}</colgroup>, bands)}
    </div>
  </section>;
}
