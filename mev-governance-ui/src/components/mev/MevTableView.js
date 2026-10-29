import React, { Children, cloneElement, useLayoutEffect, useRef, useState } from "react";

export const pageStyle = { padding: "24px clamp(12px, 2vw, 28px) 40px", background: "#f4f7fc", fontFamily: "system-ui, -apple-system, sans-serif", color: "#243247", minWidth: 0 };
export const toolbarStyle = { display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap", padding: 12, background: "#fff", border: "1px solid #dde5f0", borderRadius: 10 };
export function PageHeading({ title }) {
  return <header style={{ marginBottom: 22 }}><div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.5, color: "#526581", marginBottom: 6 }}>GOVERNANCE · PORTAFOGLIO ATTIVITÀ</div><h1 style={{ margin: "0 0 8px", fontSize: 28, letterSpacing: -.7 }}>{title}</h1><p style={{ margin: 0, color: "#526581", fontSize: 14 }}>Importi, ordini e subforniture. Una vista condivisa per seguire ogni attività.</p></header>;
}
export function FinancialSummary({ supply, oda, subco, format, approved = false }) {
  return <section aria-label="Riepilogo economico delle iniziative filtrate" style={{ display: "flex", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, marginLeft: "auto", maxWidth: "100%" }}>
    {[
      ["Totale Fornitura", supply, "#1a73e8", "#185abc", "#eef5ff", approved ? "Iniziative filtrate · solo approvati" : "Iniziative filtrate"],
      ["Totale ODA", oda, "#12c937", "#176b2b", "#eefaf1", "Ordinato · iniziative filtrate"],
      ["Totale SUBCO", subco, "#d97706", "#92400e", "#fff7ed", "Subforniture · iniziative filtrate"],
    ].map(([label, value, accent, ink, bg, detail]) => <div key={label} style={{ background: bg, border: "1px solid #dce4ee", borderTop: `2px solid ${accent}`, borderRadius: 8, padding: "8px 12px", minWidth: 130, textAlign: "right", flex: "0 1 auto", maxWidth: "100%" }}><div style={{ fontSize: 10, fontWeight: 700, color: ink }}>{label}</div><div style={{ margin: "3px 0", fontSize: 17, fontWeight: 750, color: ink, fontVariantNumeric: "tabular-nums", overflowWrap: "anywhere" }}>{format(value)}</div><div style={{ fontSize: 10, color: "#526174" }}>{detail}</div></div>)}
  </section>;
}

// All three table bands use the same width and offset model. On narrow screens
// fall back to ID/GoTo when the selected prefix leaves too little space to scroll.
export default function MevTableView({ children, widths, capIndex, rdaIndex, label }) {
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
  const prefixFits = index => available >= widths.slice(0, index + 1).reduce((a, b) => a + b, 0) + 180;
  const canFreezeCap = prefixFits(capIndex);
  const canFreezeRda = prefixFits(rdaIndex);
  const requestedCount = freeze === "rda" ? rdaIndex + 1 : freeze === "cap" ? capIndex + 1 : freeze === "id" ? 1 : 2;
  const limited = (freeze === "rda" && !canFreezeRda) || (freeze === "cap" && !canFreezeCap);
  const count = limited ? 2 : requestedCount;
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
          style: { ...cell.props.style, boxSizing: "border-box", width: widths[i], minWidth: widths[i], maxWidth: widths[i], padding: head ? "6px 5px" : "7px 5px", fontSize: head ? 11 : 12, whiteSpace: head ? "normal" : cell.props.style?.whiteSpace, overflowWrap: "anywhere", color: "#26364a", borderBottom: "1px solid #e4eaf2", position: fixed ? "sticky" : undefined, left: fixed ? offsets[i] : undefined, zIndex: fixed ? 2 : undefined, background: head ? "#f0f5fc" : fixed ? (cell.props.style?.background || row.props.style?.backgroundColor || "#fff") : cell.props.style?.background, borderRight: i === count - 1 ? "2px solid #c5d5eb" : undefined, boxShadow: i === count - 1 ? "4px 0 8px -6px #64748b" : undefined },
        });
      }));
    }));
  });
  return <section style={{ minWidth: 0, border: "1px solid #dce4ef", borderRadius: 10, background: "#fff", boxShadow: "0 4px 18px #18345b08" }}>
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, justifyContent: "space-between", alignItems: "center", padding: "10px 12px", borderBottom: "1px solid #dce4ef" }}><div><strong style={{ fontSize: 13 }}>Dettaglio iniziative</strong><div style={{ fontSize: 12, color: "#526581", marginTop: 4 }}>Scorri in orizzontale per esplorare tutte le colonne.</div></div><label style={{ fontSize: 12, color: "#334155", display: "flex", alignItems: "center", gap: 8 }}>Colonne fisse<select aria-label="Colonne fisse" value={freeze} onChange={e => setFreeze(e.target.value)} style={{ padding: "6px 8px", border: "1px solid #b6c6dc", background: "#fff", borderRadius: 6, color: "#185abc", font: "inherit" }}><option value="id">ID</option><option value="goto">ID/GoTo</option><option value="cap" disabled={!canFreezeCap}>Fino a Importo CAP{!canFreezeCap ? " (schermo ampio)" : ""}</option><option value="rda" disabled={!canFreezeRda}>Fino a RDA{!canFreezeRda ? " (schermo ampio)" : ""}</option></select>{limited && <span>Ora: ID/GoTo</span>}</label></div>
    <div ref={viewport} role="region" aria-label={label} tabIndex={0} style={{ overflow: "auto", maxHeight: "70vh", minWidth: 0, borderRadius: "0 0 10px 10px" }}>
      {cloneElement(table, { style: { tableLayout: "fixed", width: widths.reduce((a, b) => a + b, 0), borderCollapse: "separate", borderSpacing: 0, fontSize: 12 } }, <colgroup>{widths.map((width, i) => <col key={i} style={{ width }} />)}</colgroup>, bands)}
    </div>
  </section>;
}
