// Come si legge una riga della «Verifica AI delle righe»: l'esito in una parola, una breve descrizione per l'elenco e quanto pesa ogni esito (per ordinare e contare).
// Lo stato di una riga e' lo stesso che calcola il confronto: «da aggiornare» se i dati sono cambiati dopo la verifica (la firma non coincide).
export const LABELS = { coerente: 'Coerente secondo AI', da_verificare: 'Da verificare', non_coerente: 'Possibile incoerenza', error: 'Verifica non disponibile' };
export const SHORT = { coerente: 'Coerente', da_verificare: 'Da verificare', non_coerente: 'Incoerenza', error: 'Non disponibile', stale: 'Da aggiornare', none: 'Da eseguire' };
// Dal piu' urgente al meno urgente: chi guarda l'elenco vede prima cio' che richiede attenzione.
export const SEVERITY = { non_coerente: 0, da_verificare: 1, error: 2, stale: 3, none: 4, coerente: 5 };

export function rowState(review, isStale) {
  if (!review) return 'none';
  if (isStale) return 'stale';
  return review.status in SEVERITY ? review.status : 'none';
}

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const cut = (text, size) => (text.length > size ? `${text.slice(0, size - 1).trimEnd()}…` : text);

// La breve descrizione di una riga: cosa si fa, in una riga. Prima la descrizione dell'attivita', poi il motivo, poi l'intervento; mai piu' di `size` caratteri.
export function shortDescription(item, size = 120) {
  const text = clean(item.detail?.detailDescription) || clean(item.reason) || clean(item.detail?.componentApplication) || clean(item.interventionTitle) || '';
  return cut(text, size) || 'Nessuna descrizione';
}
// Una frase dell'esito AI per l'elenco: il motivo, accorciato.
export function shortReason(review, size = 140) { return review?.reason ? cut(clean(review.reason), size) : ''; }

// Le righe dell'elenco: stato, ordine (le piu' urgenti prima, a parita' l'ordine del file) e conteggi per i filtri.
export function summarize(rows) {
  const counts = { all: rows.length };
  rows.forEach(row => { counts[row.state] = (counts[row.state] || 0) + 1; });
  return counts;
}
export function sortRows(rows, bySeverity) {
  return bySeverity ? [...rows].sort((a, b) => (SEVERITY[a.state] - SEVERITY[b.state]) || (a.position - b.position)) : [...rows].sort((a, b) => a.position - b.position);
}
export function filterRows(rows, filter) { return filter === 'all' ? rows : filter === 'attention' ? rows.filter(row => ['non_coerente', 'da_verificare', 'error', 'stale'].includes(row.state)) : rows.filter(row => row.state === filter); }
