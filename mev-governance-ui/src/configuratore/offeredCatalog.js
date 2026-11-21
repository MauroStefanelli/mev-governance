// «Voci di catalogo offerti»: after the award the prices that count are the OFFERED ones. They are kept in the lot next to the tender catalog
// (`lot.offeredCatalog`: id + prezzi), never over it. These functions are the single place that decides which prices a lot works with.

const TYPES = ['REALIZZAZIONE', 'MODIFICA'];
const BANDS = ['Semplice', 'Medio', 'Complesso'];

const priceOf = (prezzi, type, band) => {
  const typeKey = Object.keys(prezzi || {}).find(k => k.toUpperCase() === type);
  const bandKey = Object.keys((prezzi || {})[typeKey] || {}).find(k => k.toLowerCase() === band.toLowerCase());
  const raw = typeKey && bandKey ? prezzi[typeKey][bandKey] : null;
  return raw == null || String(raw).trim() === '' || !Number.isFinite(Number(raw)) || Number(raw) < 0 ? null : Number(raw);
};

export const hasOfferedCatalog = lot => Array.isArray(lot?.offeredCatalog) && lot.offeredCatalog.length > 0;

// The catalog a lot works with: the tender catalog, with the offered prices in place of the tender ones for every voice the offered catalog covers.
// A price the offered catalog leaves empty (a voice that is 0 in the tender) stays as in the tender. Names, ambits and descriptions are always the tender ones.
export function effectiveCatalog(lot) {
  const tender = Array.isArray(lot?.catalog) ? lot.catalog : [];
  if (!hasOfferedCatalog(lot)) return tender;
  const offered = new Map(lot.offeredCatalog.map(entry => [String(entry.id), entry]));
  return tender.map(entry => {
    const match = offered.get(String(entry.id));
    if (!match) return entry;
    const prezzi = {};
    for (const type of TYPES) {
      prezzi[type] = {};
      for (const band of BANDS) {
        const value = priceOf(match.prezzi, type, band);
        prezzi[type][band] = value ?? priceOf(entry.prezzi, type, band);
      }
    }
    const descrizioni = match.descrizioni && Object.keys(match.descrizioni).length ? match.descrizioni : undefined;
    return { ...entry, prezzi, priceBasis: 'offerto', basePrezzi: entry.prezzi, ...(descrizioni ? { descrizioni } : {}) };
  });
}

// Which catalog the lot is using, in words for the user.
export const catalogBasisLabel = lot => hasOfferedCatalog(lot) ? 'Prezzi offerti' : 'Prezzi di gara (base d’asta)';

// The tender and the offered price of every cell of the lot, to show the discount.
export function offeredComparison(lot) {
  const tender = Array.isArray(lot?.catalog) ? lot.catalog : [];
  const offered = new Map((lot?.offeredCatalog || []).map(entry => [String(entry.id), entry]));
  return tender.map(entry => {
    const match = offered.get(String(entry.id));
    const cells = [];
    for (const type of TYPES) for (const band of BANDS) {
      const base = priceOf(entry.prezzi, type, band);
      const price = match ? priceOf(match.prezzi, type, band) : null;
      cells.push({ type, band, base, offered: price,
        discount: base > 0 && price != null ? Math.round((1 - price / base) * 10000) / 100 : null });
    }
    return { id: entry.id, ambito: entry.ambito || '', nome: entry.nome || '', covered: !!match, descrizioni: match?.descrizioni || null, cells };
  });
}

// How many voices of the tender catalog the offered catalog covers.
export const offeredCoverage = lot => offeredComparison(lot).filter(row => row.covered).length;

// «Riallinea ai prezzi offerti»: what an initiative would become if its saved unit prices were replaced with the offered ones. NOTHING is changed here: it only
// describes. A row is realigned only when the offered catalog gives a price for that voice; rows without a match keep the price they have.
export function realignPreview(items, offeredLot, resolveEntry) {
  const effective = effectiveCatalog(offeredLot);
  const rows = (items || []).map(item => {
    const entry = resolveEntry(item, effective);
    const type = Object.keys(entry?.prezzi || {}).find(k => k.toUpperCase() === String(item.type).toUpperCase());
    const band = Object.keys(entry?.prezzi?.[type] || {}).find(k => k.toLowerCase() === String(item.complexity).toLowerCase());
    const raw = entry?.priceBasis === 'offerto' && type && band ? entry.prezzi[type][band] : null;
    const next = raw == null || !Number.isFinite(Number(raw)) ? null : Number(raw);
    const current = item.unit == null || !Number.isFinite(Number(item.unit)) ? null : Number(item.unit);
    const qty = Number(item.qty) || 0;
    return { item, current, next, qty, changes: next != null && current !== next,
      before: (current ?? next ?? 0) * qty, after: (next ?? current ?? 0) * qty };
  });
  const totalBefore = rows.reduce((sum, row) => sum + row.before, 0);
  const totalAfter = rows.reduce((sum, row) => sum + row.after, 0);
  return { rows, changed: rows.filter(row => row.changes).length, unmatched: rows.filter(row => row.next == null).length, totalBefore, totalAfter };
}

// Applies the preview: only the rows that change get the offered unit price. Returns new items; the originals are not modified.
export const applyRealign = preview => preview.rows.map(row => row.changes ? { ...row.item, unit: row.next } : row.item);
