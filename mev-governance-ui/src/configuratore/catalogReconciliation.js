const normalizeDriver = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  .replace(/^realizzazione stored procedure script sql o equivalente$/, 'realizzazione stored procedure o equivalente');

// Spreadsheet codes and system driver IDs can differ. Resolve only a unique
// named driver within the selected contract, never prices from another catalog.
export function resolveCatalogEntry(item, catalog) {
  const id = item.id ?? item.catalogId;
  const exact = catalog.filter(c => String(c.id) === String(id));
  if (exact.length === 1) return exact[0];
  if (exact.length > 1) return null;
  const name = normalizeDriver(item.detail?.name || item.name || item.driverName);
  if (!name) return null;
  const ambit = normalizeDriver(item.detail?.ambit || item.ambit);
  const matches = catalog.filter(c => normalizeDriver(c.nome) === name && (!ambit || normalizeDriver(c.ambito) === ambit));
  return matches.length === 1 ? matches[0] : null;
}

// Contract prices are distinct from the immutable values read from the offer.
export function catalogUnitPrice(item, catalog) {
  const entry = resolveCatalogEntry(item, catalog);
  const key = Object.keys(entry?.prezzi || {}).find(k => k.toUpperCase() === String(item.type).toUpperCase());
  const prices = entry?.prezzi?.[key];
  const complexity = Object.keys(prices || {}).find(k => k.toLowerCase() === String(item.complexity).toLowerCase());
  const raw = prices?.[complexity];
  if (raw == null || String(raw).trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0) return null;
  return Number(raw);
}
export function reconcileCatalog(items, catalog) {
  const lines = items.filter(it => it.imported).map(item => {
    const price = catalogUnitPrice(item, catalog);
    const original = item.original || null;
    return { item, price, original, originalTotal: original?.total ?? null,
      catalogTotal: price == null ? null : price * item.qty,
      difference: price == null || original?.unit == null ? null : price - original.unit };
  });
  return { lines, missing: lines.filter(l => l.price == null).length,
    originalTotal: lines.every(l => l.originalTotal != null) ? lines.reduce((s,l) => s+l.originalTotal,0) : null,
    catalogTotal: lines.every(l => l.catalogTotal != null) ? lines.reduce((s,l) => s+l.catalogTotal,0) : null };
}
