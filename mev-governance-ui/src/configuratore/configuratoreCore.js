// ============================================================
// Configuratore Offerta TOW — modulo core (logica pura portata
// dal Configuratore standalone: parsing, calcolo, suggerimenti,
// snapshot, export). Framework-agnostic: usa le API del browser
// ma nessun DOM dell'app host; i component React orchestrano i dati.
// ============================================================

import JSZip from "jszip";
import { APP_DATA } from "./appData";
import { DEFAULT_APPLICATIONS } from "./applications";

export { APP_DATA, DEFAULT_APPLICATIONS };

export const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });

export const esc = (s) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export const asArray = (v) => (Array.isArray(v) ? v : v == null ? [] : [v]);

export const safeUrl = (s) => {
  try {
    const u = new URL(s);
    return /^https?:$/.test(u.protocol) ? u.href : "";
  } catch {
    return "";
  }
};

export const appNorm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");

// ============================================================
// PARSING NUMERI / PDF / EXCEL
// ============================================================

export const parseMoney = (s) => {
  const clean = String(s || "").replace(/\s/g, "").replace(/\./g, "").replace(",", ".").replace(/[^0-9.-]/g, "");
  return Number(clean) || 0;
};

export const zoneText = (items, min, max) =>
  items
    .filter((x) => x.x >= min && x.x < max)
    .sort((a, b) => b.y - a.y || a.x - b.x)
    .map((x) => x.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

export const extractPdfPages = async (file) => {
  if (typeof window === "undefined" || !window.extractPdfPages) {
    await ensurePdfLoader();
  }
  return window.extractPdfPages(file);
};

let pdfLoaderPromise = null;
export const ensurePdfLoader = () => {
  if (pdfLoaderPromise) return pdfLoaderPromise;
  pdfLoaderPromise = new Promise((resolve, reject) => {
    if (typeof window !== "undefined" && window.extractPdfPages) return resolve(true);
    const ready = () => resolve(true);
    window.addEventListener("pdf-reader-ready", ready, { once: true });
    const script = document.createElement("script");
    script.type = "module";
    script.src = "/configuratore/pdf-loader.mjs";
    script.onerror = () => {
      window.removeEventListener("pdf-reader-ready", ready);
      reject(new Error("Impossibile caricare il lettore PDF"));
    };
    document.head.appendChild(script);
  });
  return pdfLoaderPromise;
};

export async function parseCatalogPdf(file, lot) {
  if (!window.extractPdfPages) await ensurePdfLoader();
  const pages = await window.extractPdfPages(file);
  const out = [];
  pages.forEach((page) => {
    const ids = page.items
      .filter((x) => x.x / page.width < 0.07 && /^\d{2,5}$/.test(x.text))
      .sort((a, b) => b.y - a.y);
    ids.forEach((id, i) => {
      const top = i === 0 ? id.y + (id.y - (ids[1]?.y ?? id.y - 40)) / 2 : (ids[i - 1].y + id.y) / 2;
      const bottom = i === ids.length - 1 ? 0 : (id.y + ids[i + 1].y) / 2;
      const row = page.items.filter((x) => x.y <= top && x.y > bottom);
      const prices = row
        .filter((x) => x.x / page.width > 0.7 && /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(x.text))
        .sort((a, b) => a.x - b.x)
        .map((x) => parseMoney(x.text))
        .slice(0, 6);
      if (prices.length < 6) return;
      const w = page.width;
      const name = zoneText(row, w * 0.09, w * 0.185).replace(/^Nome Driver\s*/i, "");
      const ambito = zoneText(row, w * 0.057, w * 0.09).replace(/^Ambito driver\s*/i, "");
      const descrizione = zoneText(row, w * 0.185, w * 0.4).replace(/^Descrizione Driver\s*/i, "");
      const semplice = zoneText(row, w * 0.4, w * 0.51);
      const medio = zoneText(row, w * 0.51, w * 0.62);
      const complesso = zoneText(row, w * 0.62, w * 0.7);
      if (!name) return;
      out.push({
        lotto: Number(lot),
        id: Number(id.text),
        ambito,
        nome: name,
        descrizione,
        criteri: { Semplice: semplice, Medio: medio, Complesso: complesso },
        prezzi: {
          REALIZZAZIONE: { Semplice: prices[0], Medio: prices[1], Complesso: prices[2] },
          MODIFICA: { Semplice: prices[3], Medio: prices[4], Complesso: prices[5] },
        },
        pagina: page.pageNumber,
      });
    });
  });
  if (!out.length) throw new Error(`Nessuna voce riconosciuta nel catalogo del Lotto ${lot}`);
  return out;
}

export async function parseTowPriceFile(file, lot) {
  const prices = {};
  if (file.name.toLowerCase().endsWith(".xlsx")) {
    const rows = await readFirstSheet(file);
    rows.forEach((r) =>
      r.forEach((v, i) => {
        const m = String(v || "").match(new RegExp(`TOW\\s*0?${lot}\\.(\\d+)`, "i"));
        if (m) {
          const value = r.slice(i + 1).map(Number).find((n) => Number.isFinite(n) && n > 0);
          if (value) prices[`TOW0${lot}.${m[1]}`] = value;
        }
      })
    );
  } else {
    if (!window.extractPdfPages) await ensurePdfLoader();
    const pages = await window.extractPdfPages(file);
    pages.forEach((p) => {
      const lines = new Map();
      p.items.forEach((x) => {
        const y = Math.round(x.y / 3) * 3;
        if (!lines.has(y)) lines.set(y, []);
        lines.get(y).push(x);
      });
      for (const items of lines.values()) {
        const txt = items.sort((a, b) => a.x - b.x).map((x) => x.text).join(" ");
        const m = txt.match(new RegExp(`TOW\\s*0?${lot}\\.(\\d+)`, "i"));
        const nums = items.filter((x) => /^\d{1,3}(?:\.\d{3})*,\d{2}$/.test(x.text)).map((x) => parseMoney(x.text));
        if (m && nums.length) prices[`TOW0${lot}.${m[1]}`] = nums.at(-1);
      }
    });
  }
  return prices;
}

// ============================================================
// LETTURA WORKBOOK XLSX (JSZip + DOMParser, port da app.js)
// ============================================================

export const xml = (s) => new DOMParser().parseFromString(s, "application/xml");
export const colIndex = (ref) => [...ref.replace(/\d/g, "")].reduce((n, c) => n * 26 + c.charCodeAt(0) - 64, 0) - 1;

export function sheetRows(doc, shared) {
  return [...doc.querySelectorAll("row")]
    .map((row) => {
      const out = [];
      [...row.querySelectorAll("c")].forEach((c) => {
        const i = colIndex(c.getAttribute("r") || "A1");
        const type = c.getAttribute("t");
        const v = c.querySelector("v")?.textContent ?? "";
        const inline = [...c.querySelectorAll("is t")].map((x) => x.textContent).join("");
        out[i] = type === "s" ? shared[Number(v)] || "" : type === "inlineStr" ? inline : v;
      });
      return out;
    })
    .filter((row) => row.some((v) => String(v || "").trim()));
}

export async function readWorkbookSheets(file) {
  const zip = await JSZip.loadAsync(file);
  const wb = xml(await zip.file("xl/workbook.xml").async("string"));
  const rels = xml(await zip.file("xl/_rels/workbook.xml.rels").async("string"));
  const sharedFile = zip.file("xl/sharedStrings.xml");
  const shared = sharedFile
    ? [...xml(await sharedFile.async("string")).querySelectorAll("si")].map((si) => [...si.querySelectorAll("t")].map((t) => t.textContent).join(""))
    : [];
  const sheets = [];
  for (const sheet of wb.querySelectorAll("sheet")) {
    const rid = sheet.getAttribute("r:id") || sheet.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
    const rel = [...rels.querySelectorAll("Relationship")].find((x) => x.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (!target) continue;
    const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
    const entry = zip.file(path);
    if (entry) sheets.push({ name: sheet.getAttribute("name") || "", rows: sheetRows(xml(await entry.async("string")), shared) });
  }
  if (!sheets.length) throw new Error("Nessun foglio Excel leggibile");
  return sheets;
}

export async function readFirstSheet(file) {
  return (await readWorkbookSheets(file))[0].rows;
}

export const excelHeader = (s) => appNorm(s);

// ============================================================
// REGOLE DI RACCOMANDAZIONE (port da app.js alle r.315-327)
// ============================================================

export const suggestionRules = [
  { words: ["pagina", "schermata", "gui", "frontend", "angular", "react", "popup", "pop-up", "campo", "pulsante", "interfaccia"], ids: [236] },
  { words: ["api", "servizio", "microservizio", "rest", "soap", "backend", "business logic", "servlet"], ids: [239] },
  { words: ["tabella", "schema", "ddl", "database", "struttura dati"], ids: [241, 965] },
  { words: ["sql", "stored", "script", "infasamento", "trigger"], ids: [242] },
  { words: ["etl", "caricamento", "trasformazione dati", "pipeline dati"], ids: [249, 415] },
  { words: ["configurazione", "prodotto", "contratto", "codifica"], ids: [406, 966] },
  { words: ["hdfs", "shell", "hadoop"], ids: [410] },
  { words: ["oozie", "workflow"], ids: [412, 413] },
  { words: ["spark", "streaming", "batch"], ids: [415, 954, 955] },
  { words: ["nifi", "ni-fi", "solr"], ids: [416, 418, 420] },
  { words: ["sap", "abap", "module pool"], ids: [453, 462, 952, 954, 955, 965, 966, 967, 1025] },
  { words: ["osb", "oracle service bus", "pipeline"], ids: [481] },
  { words: ["jms", "bridge", "jboss", "weblogic"], ids: [483] },
  { words: ["bpel", "mediator", "adapter"], ids: [498] },
  { words: ["consumer", "consumatore", "coda"], ids: [992] },
  { words: ["producer", "publisher", "pubblicatore"], ids: [993] },
];

export const reasonFor = (c, source) => {
  const terms = [];
  suggestionRules.filter((r) => r.ids.includes(c.id)).forEach((r) => r.words.forEach((w) => { if (source.includes(w)) terms.push(w); }));
  return terms.length ? `Rilevati riferimenti a ${[...new Set(terms)].slice(0, 4).join(", ")}.` : `Corrispondenza con l'ambito ${c.ambito}.`;
};

export const validComplexities = (c, type) => ["Semplice", "Medio", "Complesso"].filter((k) => (c?.prezzi?.[type]?.[k] ?? 0) > 0);

// ============================================================
// ANALISI / SUGGERIMENTI (scoring r.344)
// ============================================================

export function scoreIntervention({ intervention, detailText, catalog, applicationContextText, historicalCounts, profileCatalogIds }) {
  const source = [
    intervention.titolo,
    intervention.descrizione,
    intervention.attivita,
    detailText,
    applicationContextText,
  ].join(" ").toLowerCase();
  const existing = new Set((intervention.mappings || []).map((m) => m.catalogId));
  const scores = new Map();
  suggestionRules.forEach((r) => {
    const hits = r.words.filter((w) => source.includes(w));
    if (hits.length) r.ids.forEach((id) => scores.set(id, (scores.get(id) || 0) + hits.length * 2));
  });
  catalog.forEach((c) => {
    if (existing.has(c.id)) return;
    const hay = (c.nome + " " + c.ambito + " " + c.descrizione).toLowerCase();
    const tokens = [...new Set(source.match(/[a-zà-ù0-9]{5,}/g) || [])];
    const hits = tokens.filter((t) => hay.includes(t)).length;
    if (hits) scores.set(c.id, (scores.get(c.id) || 0) + Math.min(hits, 5));
  });
  profileCatalogIds.forEach((id) => { if (!existing.has(id)) scores.set(id, (scores.get(id) || 0) + 6); });
  historicalCounts.forEach((count, id) => { if (!existing.has(id)) scores.set(id, (scores.get(id) || 0) + Math.min(12, count * 4)); });
  return { scores, existing, source };
}

// ============================================================
// CALCOLO OFFERTA (r.405) e SNAPSHOT (r.411)
// ============================================================

export function defaultPrice(it, { catalog, priceMode, builtin }) {
  const c = catalog.find((x) => x.id === it.id);
  const base = c?.prezzi?.[it.type]?.[it.complexity] ?? 0;
  const hist = builtin ? APP_DATA.historical_offered_prices?.[`${it.id}|${it.type}|${it.complexity}`] : null;
  return priceMode === "historical" && hist != null ? hist : base;
}

export const itemPrice = (it, ctx) => it.unit ?? defaultPrice(it, ctx);

export function calc({ items, lot, contractId, tow5Share = 65, towPercentages, tow, discount, contingency, catalog, priceMode, builtin }) {
  const ctx = { catalog, priceMode, builtin };
  const cat = items.reduce((a, it) => a + itemPrice(it, ctx) * it.qty, 0);
  const allocationBase = cat * (1 + (100 - tow5Share) / 100);
  const prefix = `TOW0${lot}.`;
  const pct = towPercentages?.[contractId]?.[lot] || { 1: 0, 3: 0, 4: 0 };
  const autoTow = {};
  ["1", "3", "4"].forEach((n) => { autoTow[prefix + n] = allocationBase * (Number(pct[n]) || 0) / 100; });
  const autoTotal = Object.values(autoTow).reduce((a, v) => a + v, 0);
  const manualTotal = ["2", "6"].reduce((a, n) => {
    const k = prefix + n;
    return a + (tow[k] || 0) * (towPrices()[k] || tow[k + "_price"] || 0);
  }, 0);
  const oth = autoTotal + manualTotal;
  const base = cat + oth;
  const disc = base * (Number(discount) || 0) / 100;
  const cont = (base - disc) * (Number(contingency) || 0) / 100;
  return { cat, tow5Share, allocationBase, autoTow, autoTotal, manualTotal, oth, base, disc, cont, total: base - disc + cont };
}

export function towPrices() {
  return APP_DATA.tow_prices || {};
}

export function defaultLotPct(contractId, lot) {
  return contractId === "poste-tet-2025" && String(lot) === "2" ? { 1: 16, 3: 13, 4: 6 } : { 1: 0, 3: 0, 4: 0 };
}

// ============================================================
// EXPORT EXCEL / CSV / JSON
// ============================================================

export const excelColumn = (n) => {
  let s = "";
  while (n >= 0) { s = String.fromCharCode((n % 26) + 65) + s; n = Math.floor(n / 26) - 1; }
  return s;
};

export const xmlEsc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

export function worksheetXml(rows, widths = []) {
  const colDefs = widths.length
    ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("")}</cols>`
    : "";
  const cells = rows.map((row, rowIndex) => {
    const cellsHtml = row.map((value, c) => {
      const ref = `${excelColumn(c)}${rowIndex + 1}`;
      if (typeof value === "number" && Number.isFinite(value)) {
        return `<c r="${ref}"><v>${value}</v></c>`;
      }
      return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value ?? "")}</t></is></c>`;
    });
    return `<row>${cellsHtml.join("")}</row>`;
  });
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${colDefs}<sheetData>${cells.join("")}</sheetData></worksheet>`;
}

export const download = (name, type, content) => {
  const blob = new Blob([content], { type });
  downloadBlob(name, blob);
};

export const downloadBlob = (name, blob) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
};
// ============================================================
// PARSING WORKBOOK INIZIATIVA (port da importExcel r.268)
// Ritorna { code, title, systems, requirements, description,
//           interventions, items } senza toccare il DOM.
// ============================================================

export async function parseInitiativeWorkbook(file, catalog) {
  const sourceWorkbookData = await file.arrayBuffer();
  const sheets = await readWorkbookSheets(sourceWorkbookData);
  const rows = sheets[0].rows;
  const detailSheet = sheets.find((s) => excelHeader(s.name) === "dettagliointerventi");
  const meta = String(rows[0]?.[0] || "");
  const headAt = rows.findIndex((r) => r.some((v) => ["idintervento", "id_intervento"].includes(excelHeader(v))));
  if (headAt < 0) throw new Error("Colonna ID_INTERVENTO non trovata");

  const heads = rows[headAt].map((v) => String(v || "").trim().toUpperCase());
  const subheads = rows[headAt + 1] || [];
  const offerTypes = rows[headAt - 1] || [];
  const at = (n) => heads.indexOf(n);
  const value = (r, n) => String(r[at(n)] ?? "").trim();

  const towStart = subheads.findIndex((v) => /TOW\s*0?[12]\.1/i.test(String(v || "")));
  const tow5Index = subheads.findIndex((v) => /TOW\s*0?[12]\.5/i.test(String(v || "")));
  const catalogStart = tow5Index + 1;
  if (towStart < 0 || tow5Index < 0) throw new Error("Colonne TOW non riconosciute");

  const lotMatch = String(subheads[towStart]).match(/TOW\s*0?([12])\./i);
  const lot = lotMatch ? lotMatch[1] : null;

  const economicRow = rows.find((r) => r.some((v) => String(v || "").trim().toUpperCase() === "IMPORTO ECONOMICO")) || [];

  const interventions = [];
  const importedItems = [];
  for (const r of rows.slice(headAt + 2)) {
    if (r.some((v) => /TOTALE TOW|LISTINO TOW/i.test(String(v || "")))) break;
    const id = value(r, "ID_INTERVENTO");
    if (!id) continue;
    const intervention = {
      id,
      titolo: value(r, "TITOLO"),
      descrizione: value(r, "DESCRIZIONE"),
      attivita: value(r, "ATTIVITÀ") || value(r, "ATTIVITA"),
      sistema: value(r, "SISTEMA"),
      requisiti: value(r, "COPERTURA REQUISITI"),
      tow5: Number(r[tow5Index]) || 0,
      mappings: [],
    };
    if (!detailSheet) {
      for (let c = catalogStart; c < Math.max(r.length, heads.length); c++) {
        const qty = Number(r[c]) || 0;
        const name = String(heads[c] || "").trim();
        if (!qty || !name) continue;
        const complexity = String(subheads[c] || "").replace(/^Pz\.\s*/i, "").trim() || "Medio";
        const type = /MODIFICA/i.test(String(offerTypes[c] || "")) ? "MODIFICA" : "REALIZZAZIONE";
        const component = catalog.find((x) => x.nome.trim().toUpperCase() === name.toUpperCase());
        if (!component) continue;
        const unit = Number(economicRow[c]) || component.prezzi[type]?.[complexity] || 0;
        importedItems.push({
          id: component.id, type, complexity, qty, score: 0,
          reason: `${id}${intervention.titolo ? " — " + intervention.titolo : ""}`,
          interventionId: id, interventionTitle: intervention.titolo,
          key: Date.now() + importedItems.length, unit, imported: true,
        });
        intervention.mappings.push({ catalogId: component.id, name, type, complexity, qty, unit, total: qty * unit });
      }
    }
    interventions.push(intervention);
  }

  if (detailSheet) {
    const detailHeadAt = detailSheet.rows.findIndex((r) => r.some((v) => excelHeader(v) === "idintervento") && r.some((v) => excelHeader(v) === "nomedriver"));
    if (detailHeadAt < 0) throw new Error("Intestazioni non riconosciute nel foglio DettaglioInterventi");
    const detailHeads = detailSheet.rows[detailHeadAt].map(excelHeader);
    const col = (...names) => { for (const name of names) { const i = detailHeads.indexOf(name); if (i >= 0) return i; } return -1; };
    const read = (r, ...names) => { const i = col(...names); return i < 0 ? "" : r[i]; };
    const byId = new Map(interventions.map((x) => [String(x.id).trim(), x]));
    for (const r of detailSheet.rows.slice(detailHeadAt + 1)) {
      const interventionId = String(read(r, "idintervento") || "").trim();
      if (!interventionId || /^totale?$/i.test(interventionId)) continue;
      let intervention = byId.get(interventionId);
      if (!intervention) {
        intervention = { id: interventionId, titolo: "", descrizione: "", attivita: "", sistema: "", requisiti: "", tow5: 0, mappings: [] };
        interventions.push(intervention);
        byId.set(interventionId, intervention);
      }
      const driverName = String(read(r, "nomedriver") || "").trim();
      const catalogId = Number(read(r, "iddicatalogo", "idcatalogo")) || 0;
      const component = catalog.find((x) => x.id === catalogId) || catalog.find((x) => appNorm(x.nome) === appNorm(driverName));
      if (!component) continue;
      const rawType = String(read(r, "tipointervento2", "tipointervento") || "MODIFICA").toUpperCase();
      const type = rawType.includes("REALIZZ") ? "REALIZZAZIONE" : "MODIFICA";
      const rawComplexity = appNorm(read(r, "complessita"));
      const complexity = rawComplexity === "semplice" ? "Semplice" : rawComplexity === "complesso" ? "Complesso" : "Medio";
      const qty = Number(read(r, "quantita")) || 0;
      const unit = Number(read(r, "prezzounitario")) || component.prezzi[type]?.[complexity] || 0;
      const total = Number(read(r, "prezzototale")) || qty * unit;
      if (!qty) continue;
      const mapping = {
        catalogId: component.id, name: driverName || component.nome, type, complexity, qty, unit, total,
        componentApplication: String(read(r, "componenteapplicativo") || "").trim(),
        technology: String(read(r, "tecnologia") || "").trim(),
        unitName: String(read(r, "unita") || "").trim(),
        detailDescription: String(read(r, "descrizioneintervento") || "").trim(),
        ambit: String(read(r, "ambitodriver") || "").trim(),
      };
      intervention.mappings.push(mapping);
      importedItems.push({
        id: component.id, type, complexity, qty, score: 0,
        reason: [interventionId, mapping.componentApplication, mapping.detailDescription].filter(Boolean).join(" — "),
        interventionId, interventionTitle: intervention.titolo,
        key: Date.now() + importedItems.length, unit, imported: true, detail: mapping,
      });
    }
  }

  if (!interventions.length) throw new Error("Nessun intervento trovato");
  if (!importedItems.length) throw new Error("Quantità di catalogo non riconosciute");

  const code = meta.match(/Codice:\s*([^\n\r]+)/i)?.[1]?.trim() || "";
  const title = meta.match(/Titolo:\s*([^\n\r]+)/i)?.[1]?.trim() || "";
  const systems = [...new Set(interventions.map((x) => x.sistema).filter(Boolean))];
  const requirements = [...new Set(interventions.map((x) => x.requisiti).filter(Boolean))];

  return {
    code,
    title,
    systems: systems.join(", "),
    requirements: requirements.join(", "),
    description: interventions.map((x) => [`${x.id}${x.titolo ? " — " + x.titolo : ""}`, x.descrizione, x.attivita].filter(Boolean).join("\n")).join("\n\n"),
    interventions,
    items: importedItems,
    sourceWorkbookData,
    fileName: file.name,
    lot,
  };
}

// ============================================================
// CONTESTO APPLICATIVO (port da applicationContextFor r.137)
// ============================================================

export function applicationContextFor(system, lotApplications, lot) {
  const apps = lotApplications ?? [];
  const sys = String(system || "").trim();
  if (!sys) return [];
  const norm = appNorm(sys);
  const direct = apps.filter((a) => {
    const aliases = [a.code, a.name, ...(a.systemAliases || []), ...(a.aliases || [])]
      .filter(Boolean)
      .map(appNorm);
    return aliases.some((x) => x === norm) || aliases.some((x) => norm.startsWith(x)) || aliases.some((x) => x.includes(norm));
  });
  if (direct.length) return direct;
  const words = sys.split(/[\s,;]+/).filter((w) => w.length >= 3);
  const matched = apps.filter((a) => words.some((w) => appNorm(a.name).includes(appNorm(w))));
  return matched.length ? matched : [];
}

// ============================================================
// SVILUPPO INIZIATIVA — ZIP richiesta codice (port r.114, r.244)
// ============================================================

export const sourceFileAllowed = (name) => {
  const ext = new RegExp(/\.(?:java|kt|scala|groovy|cs|py|js|ts|jsx|tsx|go|rs|rb|php|c|cpp|h|hpp|sql|xml|json|yml|yaml|properties|conf|ini|sh|bat|ps1|vue|svelte|html|css|scss|less|tf|tfvars|proto|graphql|md|txt|gradle|mvn|pom)$/i);
  return /^(Dockerfile|Jenkinsfile|Makefile|Procfile)$/i.test(name) || ext.test(name);
};

export const ignoredSourcePath = (path) =>
  /(^|\/)(node_modules|\.git|\.svn|\.hg|dist|build|target|vendor|\.gradle|\.idea|\.vscode|coverage|__pycache__|\.next|\.nuxt|out|bin|obj)(\/|$)/.test(path) ||
  /\.(?:min\.|\.map$|\.lock$)/.test(path);

export const evaluationSystems = (payload) => {
  const p = payload || {};
  const set = new Set();
  [p.initiative?.system, p.initiative?.systems].flat().filter(Boolean).forEach((s) => set.add(String(s).trim()).size);
  (p.systems || []).forEach((s) => set.add(s));
  (p.importedInterventions || []).forEach((x) => { if (x.sistema) set.add(String(x.sistema).trim()); });
  return [...set].filter(Boolean);
};

export const evaluationApplicationCodes = (payload) => {
  const p = payload || {};
  const set = new Set();
  (p.applicationCodes || []).forEach((c) => set.add(String(c).trim()));
  (p.applicationContext || []).forEach((a) => { if (a.code) set.add(String(a.code).trim()); });
  return [...set].filter(Boolean);
};

export function codeChangePrompt(request) {
  const i = request.initiative;
  const approved = request.approvedInterventions;
  const toolLabel = { vscode: "Visual Studio Code", codex: "Codex", other: "lo strumento di sviluppo scelto" }[request.targetTool] || "Visual Studio Code";
  const start =
    request.targetTool === "vscode"
      ? "Apri in Visual Studio Code la cartella principale del repository. Crea o seleziona il branch indicato, quindi usa questo documento come checklist di implementazione. Se utilizzi un'estensione AI, fornisci anche il JSON e il piano allegati."
      : request.targetTool === "codex"
        ? "Apri il repository sorgente nello stesso workspace di Codex e allega questo pacchetto alla richiesta."
        : "Apri la cartella principale del repository nello strumento scelto e usa questo documento come checklist di implementazione.";
  return `# Richiesta di modifica codice – ${i.code || ""} ${i.title || ""}

**Strumento previsto:** ${toolLabel}

${start}

## Obiettivo
Analizza il repository reale e realizza esclusivamente gli interventi approvati descritti nei file allegati. Verifica che siano necessari e sufficienti rispetto alla richiesta funzionale, senza introdurre funzionalità non autorizzate.

## Regole obbligatorie
1. Prima di modificare, ispeziona architettura, convenzioni, test e stato Git del repository.
2. Non sovrascrivere modifiche preesistenti e non lavorare direttamente sul branch principale.
3. Confronta ogni intervento con i file candidati e individua anche dipendenze tecniche non evidenti.
4. Se manca un'informazione che cambia materialmente la soluzione, fermati e chiedi conferma.
5. Applica soltanto gli interventi approvati (${approved.length}).
6. Esegui test e compilazione disponibili; non dichiarare superato ciò che non hai eseguito.
7. Al termine registra: file modificati, spiegazione puntuale, test eseguiti, esiti, rischi e attività residue.

## Dati principali
- Contratto: ${request.contractName}
- Lotto: ${request.lot}
- Sistema/applicazione: ${(request.systems || []).join(", ") || "non indicato"}
- Applicativi AP: ${(request.applicationCodes || []).join(", ") || "non indicati"}
- Branch suggerito: ${request.branch || "da creare"}
- Cartella selezionata: ${request.repository?.folderName || "non indicata"}

Consulta richiesta_modifica_codice.json per tutti i dati strutturati e piano_sviluppo.md per il dettaglio leggibile.`;
}

export function implementationDocument({ record, proposals, branch, approvalNotes, tests }) {
  const p = record?.payload || {};
  const i = p.initiative || {};
  const selected = proposals;
  const lines = [
    `# Piano di sviluppo – ${i.code || ""} ${i.title || record?.title || ""}`,
    "",
    `- Contratto: ${p.contractName || record?.contract_id || ""}`,
    `- Lotto: ${record?.lot_id || p.lot || ""}`,
    `- Sistema: ${evaluationSystems(p).join(", ")}`,
    `- Branch: ${branch || "da definire"}`,
    "",
    "## Approvazione",
    `- Data: ${new Date().toLocaleString("it-IT")}`,
    `- Note: ${approvalNotes || "nessuna"}`,
    "",
  ];
  selected.forEach((x, n) => {
    lines.push(
      `## ${n + 1}. ID ${x.catalogId || x.id} – ${x.name}`,
      "",
      `**Motivazione:** ${x.reason || ""}`,
      "",
      `**Informazioni aggiuntive e razionale condiviso:** ${x.sharedRationale || x.additionalInfo || "non indicati"}`,
      "",
      `**Interventi necessari:** ${(x.areas || []).join("; ") || (x.activity || "")}`,
      "",
      `**File candidati:** ${(x.files || []).join("; ") || "da individuare"}`,
      "",
      `**Stato:** ${x.executionStatus || "Da avviare"}`,
      "",
      `**File modificati:** ${x.actualFiles || "non indicati"}`,
      "",
      `**Attività effettuate:** ${x.workDone || "non indicate"}`,
      ""
    );
  });
  lines.push("## Compilazione e test", "", tests || "Non indicati");
  return lines.join("\n");
}
