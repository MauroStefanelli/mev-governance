import React from "react";

const text = value => typeof value === "string" ? value.trim() : "";
const sectionNumber = section => String(section?.numero ?? "").trim().match(/^(\d+(?:\.\d+)*)/)?.[1] ||
  text(section?.titolo).match(/^(\d+(?:\.\d+)*)(?:\s|[—–:-])/)?.[1] || "";
function sectionTitle(section, number) {
  const title = text(section?.titolo);
  if (!number) return title;
  const escaped = number.replace(/\./g, "\\.");
  return title.replace(new RegExp(`^${escaped}(?:\\s*[—–:-]\\s*|\\.\\s+|\\s+)`), "").trim();
}

// I riferimenti recuperano solo gli antenati, senza aggiungere sezioni di altri lotti.
export function buildSectionsTree(sections = [], referenceSections = []) {
  const references = new Map();
  for (const section of referenceSections) {
    if (!section || typeof section !== "object") continue;
    const number = sectionNumber(section);
    if (number && sectionTitle(section, number)) references.set(number, section);
  }
  const nodes = new Map();
  const ensure = number => {
    if (!nodes.has(number)) {
      const reference = references.get(number);
      nodes.set(number, { key: number, number, section: reference || { numero: number }, children: [], inferred: !reference });
    }
    return nodes.get(number);
  };
  sections.forEach((section, index) => {
    if (!section || typeof section !== "object") return;
    const number = sectionNumber(section);
    if (!number) {
      nodes.set(`unnumbered-${index}`, { key: `unnumbered-${index}`, number: "", section, children: [] });
      return;
    }
    const node = ensure(number);
    const previous = node.section;
    node.section = { ...previous, ...section,
      titolo: sectionTitle(section, number) || sectionTitle(previous, number),
      sintesi: text(section.sintesi) || text(previous.sintesi),
    };
    node.inferred = false;
    let parent = number;
    while (parent.includes(".")) { parent = parent.slice(0, parent.lastIndexOf(".")); ensure(parent); }
  });
  const roots = [];
  for (const node of nodes.values()) {
    const parent = node.number.includes(".") ? node.number.slice(0, node.number.lastIndexOf(".")) : "";
    if (parent && nodes.has(parent)) nodes.get(parent).children.push(node);
    else roots.push(node);
  }
  const sort = list => {
    list.sort((a, b) => a.number.localeCompare(b.number, "it", { numeric: true }));
    list.forEach(node => sort(node.children));
  };
  sort(roots);
  return roots;
}

function SectionNode({ node, depth = 0 }) {
  const title = sectionTitle(node.section, node.number);
  const summary = text(node.section.sintesi);
  return <details style={{ margin: depth ? "0 12px 8px 18px" : "0 0 8px", borderRadius: 8, border: "1px solid #dce4ed", overflow: "hidden" }}>
    <summary style={{ padding: "10px 12px", background: depth ? "#f8fafc" : "#eff6ff", color: "#20334a", cursor: "pointer", fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }}>
      {node.number && `${node.number} — `}{title || (node.number ? "Titolo non disponibile" : "Sezione senza titolo")}
    </summary>
    {(!node.inferred || !node.children.length) && <div style={{ fontSize: 13, color: summary ? "#374151" : "#64748b", lineHeight: 1.7, padding: "10px 14px", whiteSpace: "pre-wrap" }}>
      {summary && <div style={{ fontSize: 11, fontWeight: 700, color: "#475569", marginBottom: 4 }}>Sintesi del paragrafo</div>}
      {summary || "Sintesi non disponibile nell’analisi. Rianalizza il capitolato per includere il contenuto del paragrafo, oppure consulta il documento originale."}
    </div>}
    {node.children.map(child => <SectionNode key={child.key} node={child} depth={depth + 1} />)}
  </details>;
}

export default function GaraSections({ sections = [], referenceSections = [] }) {
  const tree = buildSectionsTree(sections, referenceSections);
  if (!tree.length) return null;
  return <section aria-label="Sezioni del capitolato">
    <div style={{ fontSize: 13, fontWeight: 700, color: "#20334a", marginBottom: 6 }}>Sezioni del capitolato</div>
    <p style={{ fontSize: 12, color: "#64748b", margin: "0 0 12px" }}>Apri i titoli per seguire la gerarchia e leggere la sintesi del paragrafo.</p>
    {tree.map(node => <SectionNode key={node.key} node={node} />)}
  </section>;
}
