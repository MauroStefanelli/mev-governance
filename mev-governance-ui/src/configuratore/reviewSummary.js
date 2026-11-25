// Riepilogo della «Verifica AI delle righe»: i dati piu' importanti ricavati dal ragionamento, calcolati SOLO da cio' che l'AI ha restituito per ogni riga
// (stato, motivazione, indicazione). Niente e' inventato: se una riga non ha un'indicazione, non se ne mostra una.
//
// Le righe sono quelle della Tabella di offerta (item.imported); i risultati sono `reviews[rowId]` come li produce parseDetailReviews.

export const STATUS_ORDER = ['non_coerente', 'da_verificare', 'error', 'coerente'];
export const STATUS_LABEL = { coerente: 'Coerenti', da_verificare: 'Da verificare', non_coerente: 'Possibili incoerenze', error: 'Non verificate' };
export const STATUS_TONE = { coerente: 'ok', da_verificare: 'warn', non_coerente: 'bad', error: 'muted' };

const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const cut = (value, max) => { const t = text(value); return t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t; };

// Percentuale di avanzamento: righe gia' valutate su righe da valutare. Mai oltre 100, mai negativa, 0 se non c'e' nulla da fare.
export function percentDone(done, total) {
  const d = Number(done), t = Number(total);
  if (!Number.isFinite(d) || !Number.isFinite(t) || t <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((d / t) * 100)));
}

// Conta le righe per stato. Una riga senza risultato non e' contata come coerente: resta «in attesa».
export function countByStatus(rowIds, reviews) {
  const counts = { coerente: 0, da_verificare: 0, non_coerente: 0, error: 0, waiting: 0 };
  for (const id of rowIds) {
    const status = reviews?.[id]?.status;
    if (status && Object.prototype.hasOwnProperty.call(counts, status) && status !== 'waiting') counts[status] += 1; else counts.waiting += 1;
  }
  return counts;
}

// Le righe che richiedono attenzione, dalla piu' grave: prima le possibili incoerenze, poi quelle da verificare, poi quelle non verificate.
// Ogni voce porta quello che l'AI ha scritto (motivo, indicazione) tagliato per la lettura; l'intervento e l'attivita' servono a riconoscere la riga.
export function attentionRows(entries, { limit = 6 } = {}) {
  const rank = status => STATUS_ORDER.indexOf(status);
  return (entries || []).filter(entry => entry.review && entry.review.status !== 'coerente')
    .sort((a, b) => rank(a.review.status) - rank(b.review.status) || String(a.interventionId).localeCompare(String(b.interventionId), 'it', { numeric: true }))
    .slice(0, limit)
    .map(entry => ({ rowId: entry.rowId, status: entry.review.status, interventionId: entry.interventionId || '', activity: cut(entry.activity, 140), catalog: cut(entry.catalogName, 80),
      reason: cut(entry.review.reason, 260), suggestion: cut(entry.review.suggestion, 260) }));
}

// I temi che tornano nelle indicazioni dell'AI: le voci di catalogo piu' citate tra le righe da controllare. E' un conteggio vero, non una sintesi dell'AI.
export function catalogHotspots(entries, { limit = 3 } = {}) {
  const map = new Map();
  for (const entry of entries || []) {
    if (!entry.review || entry.review.status === 'coerente' || !text(entry.catalogName)) continue;
    const key = text(entry.catalogName); const found = map.get(key) || { name: key, count: 0, bad: 0 };
    found.count += 1; if (entry.review.status === 'non_coerente') found.bad += 1; map.set(key, found);
  }
  return [...map.values()].sort((a, b) => b.bad - a.bad || b.count - a.count || a.name.localeCompare(b.name, 'it')).slice(0, limit);
}

// Il riepilogo completo che la finestra mostra a fine lavoro.
export function summarize(entries) {
  const list = entries || [];
  const counts = countByStatus(list.map(entry => entry.rowId), Object.fromEntries(list.filter(entry => entry.review).map(entry => [entry.rowId, entry.review])));
  const reviewed = list.length - counts.waiting;
  const toCheck = counts.non_coerente + counts.da_verificare;
  const models = [...new Set(list.map(entry => entry.review?.model).filter(Boolean))];
  const interventions = new Set(list.filter(entry => entry.review && entry.review.status !== 'coerente' && entry.interventionId).map(entry => String(entry.interventionId)));
  let verdict = 'empty';
  if (list.length) verdict = counts.non_coerente > 0 ? 'bad' : toCheck > 0 || counts.error > 0 ? 'warn' : counts.waiting > 0 ? 'partial' : 'ok';
  return { total: list.length, reviewed, counts, toCheck, percentCoherent: reviewed ? percentDone(counts.coerente, reviewed) : 0, verdict,
    attention: attentionRows(list), hotspots: catalogHotspots(list), interventionsToCheck: interventions.size, models };
}
