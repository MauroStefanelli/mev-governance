// Reads the "Stato delle iniziative" Markdown file: one table per status, columns that change from table to table.
// It reads what the file says and nothing else: a missing value stays missing (null), it is never guessed.

export const STATUSES = [
  { id: 'rilasciata', label: 'Rilasciata', heading: /^rilasciat[ae]$/i, order: 1, tone: 'ok' },
  { id: 'parziale', label: 'Rilasciata parzialmente', heading: /^rilasciat[ae]\s+parzialmente$/i, order: 2, tone: 'info' },
  { id: 'approvata', label: 'Approvata', heading: /^approvat[ae]$/i, order: 3, tone: 'ok' },
  { id: 'in-approvazione', label: 'In approvazione', heading: /^in\s+approvazione$/i, order: 4, tone: 'warn' },
  { id: 'in-analisi', label: 'In analisi / stima', heading: /^in\s+analisi(\s*\/\s*stima)?$/i, order: 5, tone: 'info' },
  { id: 'cr-da-stimare', label: 'CR da stimare', heading: /^cr\s+da\s+stimare$/i, order: 6, tone: 'neutral' },
];
export const statusById = id => STATUSES.find(status => status.id === id) || null;
export const statusFromHeading = text => STATUSES.find(status => status.heading.test(String(text || '').replace(/^\d+\.\s*/, '').trim())) || null;

const EMPTY = new Set(['', '—', '-', '–', 'n/d', 'nd']);
const clean = value => { const text = String(value ?? '').replace(/\s+/g, ' ').trim(); return EMPTY.has(text.toLowerCase()) ? null : text; };
const norm = value => String(value || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

// Column titles of the file → fields of the record.
const COLUMN = {
  goto: 'goto', titolo: 'title', sistema: 'system', 'pm poste': 'pmPoste', release: 'release', 'release prevista': 'plannedRelease',
  'rilascio al collaudo': 'collaudoDate', note: 'notes', 'cosa e rilasciato': 'released', 'cosa manca': 'missing',
};
const field = header => COLUMN[norm(header)] || null;

// "05/11/2026" → "2026-11-05". Anything that is not a full date stays as text in the notes, never turned into a date.
export function parseItalianDate(text) {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(text || '').trim());
  if (!match) return null;
  const [, d, m, y] = match.map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
}

// Amounts in the notes ("stima 15.493,18 €"): found, never invented.
export function amountsIn(text) {
  return [...String(text || '').matchAll(/(\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?|\d+(?:,\d{1,2})?)\s*€/g)]
    .map(match => ({ text: match[0].trim(), value: Number(match[1].replace(/\./g, '').replace(',', '.')) })).filter(a => Number.isFinite(a.value));
}

export const isPlaceholderGoto = goto => !goto || /^(tbd|n\/?d|da assegnare)$/i.test(String(goto).trim());
export const normalizeKey = value => norm(value).replace(/ /g, '-');

// A stable identity for a row: GOTO + system + title. An unassigned GOTO ("TBD") is identified by system + title only.
export function rowKey({ goto, system, title }) {
  const g = isPlaceholderGoto(goto) ? 'tbd' : normalizeKey(goto);
  return `${g}|${normalizeKey(system)}|${normalizeKey(title)}`;
}

function splitCells(line) {
  const body = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = []; let current = ''; let escaped = false;
  for (const ch of body) {
    if (escaped) { current += ch === '|' ? '|' : '\\' + ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (ch === '|') { cells.push(current); current = ''; continue; }
    current += ch;
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
}
const isSeparator = cells => cells.length > 0 && cells.every(cell => /^:?-{2,}:?$/.test(cell));

export function parseInitiativeLedger(markdown) {
  const text = String(markdown ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const warnings = []; const errors = []; const rows = []; const summary = {};
  const meta = {};
  const lines = text.split('\n');
  let status = null; let skipping = false; let header = null; let ordinal = 0; let headingName = '';

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const heading = /^#{1,3}\s+(.*)$/.exec(line);
    if (heading) {
      headingName = heading[1].trim(); header = null;
      const found = statusFromHeading(headingName);
      if (found) { status = found; skipping = false; } else { status = null; skipping = /riepilogo|indice/i.test(headingName); }
      return;
    }
    if (!line.trim().startsWith('|')) return;
    const cells = splitCells(line);
    if (isSeparator(cells)) return;
    // Metadata table at the top: "| Aggiornato al | 11/11/2026 |"
    if (!status && !skipping && !header && cells.length === 2) {
      const key = norm(cells[0]); if (key && cells[1]) meta[key] = cells[1];
      return;
    }
    if (/riepilogo/i.test(headingName)) {
      // The summary names a status the way the headings do ("Approvate"), so it is matched to a status the same way.
      const label = cells[0].replace(/\*/g, '').trim(); const count = cells[1]?.replace(/\*/g, '').trim();
      if (cells.length >= 2 && /^\d+$/.test(count)) { const found = statusFromHeading(label); summary[found ? found.id : norm(label)] = Number(count); }
      return;
    }
    if (!status) return;
    if (!header) {
      header = cells.map(field);
      if (!header.includes('goto') || !header.includes('title')) { errors.push(`Riga ${lineNumber}: la tabella «${headingName}» non ha le colonne GOTO e Titolo.`); header = null; status = null; return; }
      const unknown = cells.filter((cell, i) => cell && !header[i]); if (unknown.length) warnings.push(`Tabella «${headingName}»: colonne non riconosciute e ignorate: ${unknown.join(', ')}.`);
      return;
    }
    if (cells.length !== header.length) { warnings.push(`Riga ${lineNumber}: ${cells.length} colonne invece di ${header.length}, riga saltata.`); return; }
    const record = {};
    header.forEach((name, i) => { if (name) record[name] = clean(cells[i]); });
    if (!record.title || !record.system) { warnings.push(`Riga ${lineNumber}: titolo o sistema mancanti, riga saltata.`); return; }
    const goto = isPlaceholderGoto(record.goto) ? null : record.goto;
    ordinal += 1;
    rows.push({
      key: rowKey({ goto, system: record.system, title: record.title }), goto, gotoPlaceholder: goto === null, title: record.title, system: record.system, pmPoste: record.pmPoste || null,
      status: status.id, release: record.release || null, plannedRelease: record.plannedRelease || null,
      collaudoDate: parseItalianDate(record.collaudoDate), collaudoText: record.collaudoDate || null, notes: record.notes || null,
      released: record.released || null, missing: record.missing || null, amounts: amountsIn([record.notes, record.released, record.missing].filter(Boolean).join(' ')),
      sourceLine: lineNumber, ordinal,
    });
  });

  // The same identity twice in one file would silently merge two rows: report it.
  const seen = new Map();
  rows.forEach(row => { if (seen.has(row.key)) errors.push(`Righe ${seen.get(row.key)} e ${row.sourceLine}: stessa iniziativa (GOTO, sistema e titolo uguali) ripetuta.`); else seen.set(row.key, row.sourceLine); });

  // The file counts its own rows: a mismatch means the table was changed or the parser lost something.
  const counts = Object.fromEntries(STATUSES.map(s => [s.id, rows.filter(r => r.status === s.id).length]));
  STATUSES.forEach(s => { const declared = summary[s.id]; if (declared != null && declared !== counts[s.id]) warnings.push(`Il riepilogo dichiara ${declared} righe «${s.label}», ma ne ho lette ${counts[s.id]}.`); });
  const declaredTotal = summary.totale; if (declaredTotal != null && declaredTotal !== rows.length) warnings.push(`Il riepilogo dichiara ${declaredTotal} righe in totale, ma ne ho lette ${rows.length}.`);
  if (!rows.length && !errors.length) errors.push('Nessuna iniziativa trovata: il file deve avere una tabella per stato con le colonne GOTO, Titolo e Sistema.');

  return { rows, counts, meta: { updatedAt: parseItalianDate(meta['aggiornato al']), pmCap: meta['pm cap'] || null, source: meta.fonte || null }, warnings, errors, declared: summary };
}
