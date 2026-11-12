// What the user sees about merging two Archivio contracts. Pure functions: the screen only draws what they return, so the wording is testable.

export const ACTION_LABEL = { aggiungi: 'Viene aggiunto', completa: 'Viene completato', nessuna: 'Resta com’è', ignora: 'Ignorato' };

// A contract is "incomplete" when an active lot has a catalog but no TOW prices: exactly what an import from a tender leaves behind.
export function contractHealth(contract) {
  const lots = (contract?.lots || []).filter(l => !l.deleted);
  const problems = [];
  lots.filter(l => l.active !== false).forEach(l => {
    const prices = Object.keys(l.towPrices || {}).length; const catalog = (l.catalog || []).length;
    if (!prices) problems.push(`Lotto ${l.lotId}: nessun prezzo TOW${catalog ? ' (il catalogo c’è: l’importazione da gara non ha letto il listino)' : ''}`);
    if (!catalog) problems.push(`Lotto ${l.lotId}: catalogo vuoto`);
  });
  if (!lots.length) problems.push('Nessun lotto');
  return { complete: problems.length === 0, problems };
}

// Two contracts that probably are the same thing: they share catalog size and lot ids. Only a hint; the user decides.
export function likelyDuplicates(contracts) {
  // Only the lots that are in use count: a leftover empty or switched-off lot must not hide that two contracts are the same thing.
  const sig = c => (c.lots || []).filter(l => !l.deleted && l.active !== false && (l.catalog || []).length).map(l => `${l.lotId}:${(l.catalog || []).length}`).sort().join(',');
  const real = (contracts || []).filter(c => !c.builtin);
  const groups = new Map();
  real.forEach(c => { const key = sig(c); if (!key) return; groups.set(key, [...(groups.get(key) || []), c]); });
  return [...groups.values()].filter(group => group.length > 1);
}

// Which of the two should stay, as a suggestion: the one with more prices, then more catalog, then the one with real file names.
export function suggestedKeeper(a, b) {
  const score = c => { const lots = (c.lots || []).filter(l => !l.deleted && l.active !== false); return lots.reduce((n, l) => n + Object.keys(l.towPrices || {}).length * 1000 + (l.catalog || []).length * 10 + (l.priceFile && !String(l.priceFile).startsWith('(importato') ? 1 : 0), 0); };
  return score(a) >= score(b) ? a : b;
}

export function summarizePlan(plan) {
  const lots = plan?.lots || [];
  const changes = lots.filter(l => l.action === 'aggiungi' || l.action === 'completa').length + (plan?.sharedApplications || []).filter(a => a.action !== 'nessuna').length + (plan?.references || []).length;
  const lines = [];
  lots.forEach(l => lines.push({ kind: 'lotto', title: `Lotto ${l.lotId}`, action: l.action, text: l.reason }));
  (plan?.sharedApplications || []).forEach(a => lines.push({ kind: 'applicativi', title: `Applicativi condivisi (${a.lotKey === 'all' ? 'tutti i lotti' : 'lotto ' + a.lotKey})`, action: a.action,
    text: a.action === 'aggiungi' ? `${a.fromApps} applicativi passano al contratto che resta.` : a.action === 'completa' ? `${a.added} applicativi mancanti vengono aggiunti (${a.toApps} già presenti restano).` : 'Sono già tutti presenti.' }));
  (plan?.references || []).forEach(r => lines.push({ kind: 'riferimento', title: r.title || r.recordKey, action: 'completa', text: 'Questa valutazione usa il catalogo del contratto da eliminare: viene collegata a quello che resta.' }));
  return { changes, lines, canRemove: !!plan?.canRemove, blockers: plan?.blockers || [], notes: plan?.notes || [],
    headline: !plan?.canRemove ? 'Non si può eliminare questo contratto' : changes ? `${changes} ${changes === 1 ? 'elemento verrà spostato' : 'elementi verranno spostati'} e poi il contratto sarà eliminato` : 'Non c’è nulla da spostare: il contratto che resta ha già tutto' };
}

// ---- Links to a contract that no longer exists ----
export function orphanHeadline(orphans) {
  const revisions = (orphans || []).reduce((n, o) => n + (o.revisions || 0), 0); const evaluations = (orphans || []).reduce((n, o) => n + (o.evaluations || 0), 0);
  if (!revisions && !evaluations) return '';
  const parts = [];
  if (revisions) parts.push(`${revisions} ${revisions === 1 ? 'revisione' : 'revisioni'}`);
  if (evaluations) parts.push(`${evaluations} ${evaluations === 1 ? 'valutazione salvata' : 'valutazioni salvate'}`);
  return `${parts.join(' e ')} fanno riferimento a un contratto che non esiste più e non si possono aprire.`;
}
export const orphanInitiatives = orphans => [...new Set((orphans || []).flatMap(o => o.goto || o.Goto || []))].sort();
// The contract proposed to receive the links: the one with the most prices, then the most catalog entries (same rule as for the merge).
export function suggestedRepairTarget(contracts) {
  const real = (contracts || []).filter(c => (c.lots || []).some(l => !l.deleted && l.active !== false));
  if (!real.length) return '';
  return real.reduce((best, c) => suggestedKeeper(best, c) === best ? best : c, real[0]).contractId;
}

// Shown when a saved revision cannot be opened because the catalog it was built on is gone. It must say what is missing, what is safe, and who can fix it.
export function missingCatalogMessage(source, contracts = []) {
  const known = (contracts || []).find(c => c.contractId === source?.contractId);
  const lotOnly = !!known && (known.lots || []).some(l => String(l.lotId) === String(source?.lot) && l.active === false);
  const what = known
    ? (lotOnly ? `il lotto ${source.lot} del contratto «${known.name || known.contractId}» è stato disattivato` : `il contratto «${known.name || known.contractId}» non ha più il lotto ${source?.lot}`)
    : `il contratto usato da questa revisione («${source?.contractId || 'sconosciuto'}», lotto ${source?.lot ?? '?'}) non esiste più`;
  return `Questa revisione non si può aprire perché ${what}. Non è stato perso nulla: il lavoro corrente è conservato e la revisione è intatta. ${known && lotOnly ? 'Riattiva il lotto in Archivio contrattuale.' : 'Chi gestisce i contratti può ricollegarla da Archivio contrattuale → «Ripara i collegamenti…».'}`;
}
