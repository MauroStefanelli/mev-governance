// Contract prices are distinct from the immutable values read from the offer.
export function catalogUnitPrice(item, catalog) {
  const entry = catalog.find(c => String(c.id) === String(item.id ?? item.catalogId));
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
