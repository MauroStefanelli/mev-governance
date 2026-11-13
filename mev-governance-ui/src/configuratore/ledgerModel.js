import { STATUSES, statusById } from './initiativeLedgerParser';

export const STATUS_ORDER = STATUSES.map(status => status.id);
export const statusLabel = id => statusById(id)?.label || id || '—';
export const statusTone = id => statusById(id)?.tone || 'neutral';

// The server wants ISO dates and plain fields: this is the only place that shapes a parsed row for the request.
export function toImportRows(parsedRows) {
  return parsedRows.map(row => ({ goto: row.goto, title: row.title, system: row.system, pmPoste: row.pmPoste, status: row.status, release: row.release, plannedRelease: row.plannedRelease,
    collaudoDate: row.collaudoDate, collaudoText: row.collaudoDate ? null : row.collaudoText, notes: row.notes, released: row.released, missing: row.missing,
    amounts: (row.amounts || []).map(a => ({ text: a.text, value: a.value })) }));
}

export { sha256Hex } from './cryptoCompat';

// A file is read as UTF-8 text; anything else (a spreadsheet, a PDF…) is refused with a reason before reading it.
export const MAX_LEDGER_FILE = 1024 * 1024;
export function checkLedgerFile(file) {
  if (!file) return 'Seleziona un file.';
  if (!/\.(md|markdown|txt)$/i.test(file.name || '')) return 'Il file deve essere un documento Markdown (.md).';
  if (!file.size) return 'Il file è vuoto.';
  if (file.size > MAX_LEDGER_FILE) return 'Il file supera 1 MB: non sembra un elenco di iniziative.';
  return '';
}

export const OUTCOME = {
  nuova: { label: 'Nuova', tone: 'ok', hint: 'Non era nello storico: viene aggiunta.' },
  aggiornata: { label: 'Aggiornata', tone: 'info', hint: 'Esiste già: cambiano i campi indicati, con il valore precedente nella cronologia.' },
  invariata: { label: 'Invariata', tone: 'muted', hint: 'Già presente con gli stessi valori: non cambia nulla.' },
  scartata: { label: 'Scartata', tone: 'bad', hint: 'Non importata: vedi il motivo.' },
};
export const outcomeOf = id => OUTCOME[id] || OUTCOME.invariata;

export function previewSummary(preview) {
  if (!preview) return '';
  const parts = [];
  if (preview.created) parts.push(`${preview.created} ${preview.created === 1 ? 'nuova' : 'nuove'}`);
  if (preview.updated) parts.push(`${preview.updated} ${preview.updated === 1 ? 'aggiornata' : 'aggiornate'}`);
  if (preview.unchanged) parts.push(`${preview.unchanged} ${preview.unchanged === 1 ? 'invariata' : 'invariate'}`);
  if (preview.skipped) parts.push(`${preview.skipped} ${preview.skipped === 1 ? 'scartata' : 'scartate'}`);
  return parts.join(' · ') || 'Nessuna riga';
}
export const hasWork = preview => !!preview && (preview.created > 0 || preview.updated > 0);

// What a person is allowed to change in the panel, as the server expects it. An empty text means "empty it on purpose".
export const EDITABLE = [['status', 'Stato'], ['pmPoste', 'PM Poste'], ['release', 'Release'], ['plannedRelease', 'Release prevista'], ['notes', 'Note'], ['released', 'Cosa è rilasciato'], ['missing', 'Cosa manca']];
export function buildUpdate(initiative, draft) {
  if (!initiative || !draft) return null; // nothing loaded yet: nothing to save
  const body = { expectedRevision: initiative.revision };
  let changed = false;
  if (draft.status != null && draft.status !== initiative.status) { body.status = draft.status; changed = true; }
  if (draft.title != null && draft.title.trim() !== (initiative.title || '').trim()) { body.title = draft.title; changed = true; }
  for (const key of ['pmPoste', 'release', 'plannedRelease', 'notes', 'released', 'missing']) {
    if (draft[key] == null) continue;
    if (String(draft[key]).trim() !== String(initiative[key] || '').trim()) { body[key] = draft[key]; body[`${key}Provided`] = true; changed = true; }
  }
  if (draft.goto != null && String(draft.goto).trim() !== String(initiative.goto || '').trim()) { body.goto = draft.goto; body.gotoProvided = true; changed = true; }
  return changed ? body : null;
}

export function filterLabel(filters, total, shown) {
  const active = Object.entries(filters).filter(([, v]) => v && v !== '').length;
  return active ? `${shown} di ${total} iniziative · ${active} ${active === 1 ? 'filtro attivo' : 'filtri attivi'}` : `${total} iniziative`;
}

export const EVENT_KINDS = {
  import: { label: 'Importazione', tone: 'info' }, stato: { label: 'Cambio di stato', tone: 'ok' }, modifica: { label: 'Modifica', tone: 'neutral' },
  attivita: { label: 'Attività', tone: 'info' }, nota: { label: 'Nota', tone: 'muted' }, creazione: { label: 'Creazione', tone: 'ok' },
};
export const eventKind = kind => EVENT_KINDS[kind] || { label: kind, tone: 'neutral' };

export function downloadText(name, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/markdown;charset=utf-8' }));
  const link = document.createElement('a'); link.href = url; link.download = name; document.body.appendChild(link); link.click();
  setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 1000);
}

// Compact "released / total" line shown next to the icon so the history is useful without opening it.
export function ledgerFacts(counts, total) {
  if (!total) return 'Nessuna iniziativa';
  return `${total} iniziative · ${counts.rilasciata || 0} rilasciate · ${(counts['in-approvazione'] || 0) + (counts['in-analisi'] || 0)} in corso`;
}

// Reads a file as UTF-8 text. Blob.text() is the modern way, FileReader works everywhere; the first is used when it exists.
export function readFileText(file) {
  if (file && typeof file.text === 'function') return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('Impossibile leggere il file.'));
    reader.readAsText(file, 'utf-8');
  });
}

// What the Configuratore needs from a ledger record to start (or continue) an initiative: only the identifying fields,
// and never a placeholder "TBD" as a code.
export function initiativeFromLedger(record) {
  const r = record || {};
  return {
    code: r.gotoPlaceholder ? '' : String(r.goto || ''),
    title: String(r.title || ''),
    system: String(r.system || ''),
    release: String(r.release || r.plannedRelease || ''),
    pmPoste: String(r.pmPoste || ''),
  };
}
