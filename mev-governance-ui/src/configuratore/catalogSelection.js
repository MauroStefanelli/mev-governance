// Only select an unambiguous archived contract; never guess between contracts.
//
// There is ONE list of contracts: the ones in the Archivio. The system contract (id poste-tet-2025) is a contract like the others as soon as the
// Archivio holds it; a copy bundled with the app exists only as a safety net for an Archivio that does not have it (see withSafetyNet).
export const SYSTEM_CONTRACT_ID = 'poste-tet-2025';

export function initialCatalogSelection(contracts, code) {
  const candidates = contracts || [];
  const linked = candidates.flatMap(c => (c.lots || [])
    .filter(l => l.active !== false && !l.deleted && code && l.codiceContratto === code)
    .map(l => ({ contractId: c.contractId, lotId: String(l.lotId) })));
  if (linked.length === 1) return linked[0];
  if (linked.length > 1 || candidates.length !== 1) return null;
  const contract = candidates[0];
  const lots = (contract.lots || []).filter(l => l.active !== false && !l.deleted);
  const withCatalog = lots.filter(l => l.catalog?.length > 0);
  const lot = withCatalog.length === 1 ? withCatalog[0] : lots.length === 1 ? lots[0] : null;
  return lot ? { contractId: contract.contractId, lotId: String(lot.lotId) } : null;
}

// The list the Configuratore offers. The Archivio is the source of truth: if it holds the system contract, THAT one is used (with its real
// prices and codes) and the bundled copy is not shown at all. The bundled copy is kept only when the Archivio does not have it, so a fresh
// database or an old revision can still be opened.
export function withSafetyNet(archived, bundled) {
  const list = archived || [];
  return list.some(c => c.contractId === SYSTEM_CONTRACT_ID) ? list : [bundled, ...list].filter(Boolean);
}

// Is the contract currently chosen only the bundled safety net, with a real archived contract available instead?
export function usingSafetyNetOnly(selectedId, archived) {
  return selectedId === SYSTEM_CONTRACT_ID && !(archived || []).some(c => c.contractId === SYSTEM_CONTRACT_ID) && (archived || []).length > 0;
}

// Words shown next to the catalog choice. The label never says "built-in" or "incluso nell'app": the user sees contracts, not their origin.
export function catalogChoiceLabel(contract) {
  if (!contract) return '';
  return contract.contractId === SYSTEM_CONTRACT_ID && contract.safetyNet ? `${contract.name} · copia di riserva (non risulta nell’Archivio contrattuale)` : contract.name;
}

// Why the choice is locked and how to unlock it. Locked only while the offer holds rows priced from this catalog: changing the catalog under them
// would silently change the meaning of those prices.
export function catalogLockMessage(itemCount, { importedCount = 0 } = {}) {
  if (!itemCount) return '';
  const what = importedCount ? 'importate dall’Excel o aggiunte' : 'aggiunte';
  return `Catalogo e lotto non si possono cambiare: l’offerta ha già ${itemCount} ${itemCount === 1 ? 'voce' : 'voci'} ${what}, e i loro prezzi vengono da questo catalogo. Per usarne un altro, rimuovi tutte le voci dal passo Offerta oppure avvia una nuova iniziativa con «+ Nuova Iniziativa». I prezzi dell’Excel non vengono mai sostituiti da soli.`;
}

export function safetyNetNotice(selectedId, archived) {
  return usingSafetyNetOnly(selectedId, archived)
    ? 'Stai usando una copia di riserva del catalogo, non un contratto dell’Archivio contrattuale. Scegli un contratto dell’Archivio per usare i suoi prezzi reali.' : '';
}
