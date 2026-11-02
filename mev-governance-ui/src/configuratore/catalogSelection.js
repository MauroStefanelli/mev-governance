// Only select an unambiguous archived contract; never guess between contracts.
export function initialCatalogSelection(contracts, code) {
  const candidates = contracts.filter(c => c.contractId !== 'poste-tet-2025');
  const linked = candidates.flatMap(c => (c.lots || [])
    .filter(l => l.active !== false && code && l.codiceContratto === code)
    .map(l => ({ contractId: c.contractId, lotId: String(l.lotId) })));
  if (linked.length === 1) return linked[0];
  if (linked.length > 1 || candidates.length !== 1) return null;
  const contract = candidates[0];
  const lots = (contract.lots || []).filter(l => l.active !== false);
  const withCatalog = lots.filter(l => l.catalog?.length > 0);
  const lot = withCatalog.length === 1 ? withCatalog[0] : lots.length === 1 ? lots[0] : null;
  return lot ? { contractId: contract.contractId, lotId: String(lot.lotId) } : null;
}
