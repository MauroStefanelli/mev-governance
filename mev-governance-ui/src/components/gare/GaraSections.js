import React from "react";

const summaryText = section => {
  const value = section?.sintesi;
  return typeof value === "string" ? value.trim() : "";
};
function SectionBody({ section }) {
  const text = summaryText(section);
  return <div style={{ fontSize: 13, color: text ? "#374151" : "#6b7280", lineHeight: 1.6, padding: "10px 14px" }}>
    {text || "Sintesi non disponibile nell’analisi. Consulta questa sezione nel capitolato originale."}
  </div>;
}

export default function GaraSections({ sections = [] }) {
  const groups = new Map();
  sections.forEach((section, index) => {
    const number = String(section.numero ?? "").trim();
    const key = number ? number.split(".")[0] : `senza-numero-${index}`;
    if (!groups.has(key)) groups.set(key, { number: number.split(".")[0], parent: null, children: [] });
    const group = groups.get(key);
    if (!number.includes(".") && !group.parent) group.parent = section;
    else group.children.push(section);
  });
  if (!sections.length) return null;
  const compare = (a, b) => String(a ?? "").localeCompare(String(b ?? ""), "it", { numeric: true });
  return <div>
    <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8 }}>Sezioni ({sections.length})</div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {[...groups.values()].sort((a, b) => compare(a.number, b.number)).map((group, index) =>
        <details key={index} style={{ borderRadius: 8, border: "1px solid #fcd34d", overflow: "hidden" }}>
          <summary style={{ padding: "9px 12px", background: "#fffbeb", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
            {group.number && `${group.number} — `}{group.parent?.titolo || `Sezione ${group.number}`}
            {group.children.length > 0 && ` (${group.children.length} sottosezioni)`}
          </summary>
          {group.parent && <SectionBody section={group.parent} />}
          {[...group.children].sort((a, b) => compare(a.numero, b.numero)).map((child, childIndex) =>
            <details key={childIndex} style={{ margin: "0 12px 8px 24px", borderTop: "1px solid #f0f0f0" }}>
              <summary style={{ padding: "8px 0", cursor: "pointer", fontSize: 12, fontWeight: 600 }}>
                {child.numero} — {child.titolo}
              </summary>
              <SectionBody section={child} />
            </details>)}
        </details>)}
    </div>
  </div>;
}
