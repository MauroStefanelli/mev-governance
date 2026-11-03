import { resolveCatalogEntry } from './catalogReconciliation';

export function detailReviewInput(item, catalog, interventions, contractId, lot, index) {
  const entry = resolveCatalogEntry(item, catalog);
  const intervention = interventions.find(i => String(i.id) === String(item.interventionId));
  return {
    rowId: String(item.sourceRowId || item.key || `detail-${index + 1}`),
    contractId, lot: String(lot),
    intervention: { id: item.interventionId, title: intervention?.titolo || item.interventionTitle || '', description: intervention?.descrizione || '', activity: intervention?.attivita || '', requirements: intervention?.requisiti || '', system: intervention?.sistema || '' },
    detail: { component: item.detail?.componentApplication || '', technology: item.detail?.technology || '', unit: item.detail?.unitName || '', description: item.detail?.detailDescription || item.reason || '', excelCatalogId: item.original?.catalogId ?? item.id, type: item.type, complexity: item.complexity, quantity: item.qty },
    catalogEntry: entry ? { id: entry.id, name: entry.nome, ambit: entry.ambito || '', description: entry.descrizione || '', criteria: entry.criteri || {} } : null,
  };
}

export const detailReviewSignature = input => JSON.stringify(input);

export function parseDetailReviews(response, rows) {
  const reviews = response.analysis?.reviews;
  if (!Array.isArray(reviews)) throw new Error('Risposta AI incompleta: mancano le verifiche per riga.');
  return rows.map(input => {
    const matches = reviews.filter(review => String(review.rowId) === input.rowId);
    const review = matches[0];
    if (matches.length !== 1 || !['coerente', 'da_verificare', 'non_coerente'].includes(review.status) || typeof review.reason !== 'string' || !review.reason.trim())
      return { rowId: input.rowId, signature: detailReviewSignature(input), status: 'error', reason: 'Risposta AI mancante o non valida per questa riga. Ripetere la verifica.' };
    return { rowId: input.rowId, signature: detailReviewSignature(input), status: review.status, reason: review.reason,
      suggestion: typeof review.suggestion === 'string' ? review.suggestion : '', evidence: typeof review.evidence === 'string' ? review.evidence : '',
      model: response.model || '', reviewedAt: response.reviewedAt || new Date().toISOString() };
  });
}
