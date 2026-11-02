export const normalizeTowCode = value => {
  const match = String(value || '').trim().match(/^TOW\s*0*(\d+)\s*[.,]\s*0*(\d+)$/i);
  return match ? `TOW${String(Number(match[1])).padStart(2, '0')}.${Number(match[2])}` : null;
};

const priceNumber = value => {
  const raw = value && typeof value === 'object' ? value.valoreUnitario : value;
  if (raw == null || raw === '') return null;
  const number = Number(raw);
  return Number.isFinite(number) && number > 0 ? number : null;
};

// Archive prices take precedence. Missing entries can only come from the exact
// selected operational contract in the current environment, never another one.
export function resolveTowPrices(archivePrices = {}, rows = [], contractType = '') {
  const result = {};
  for (const [rawCode, value] of Object.entries(archivePrices)) {
    const code = normalizeTowCode(rawCode); const price = priceNumber(value);
    if (code && price != null) {
      if (result[code] != null && result[code] !== price) throw new Error(`Prezzi discordanti nel listino per ${code}.`);
      result[code] = price;
    }
  }
  if (!contractType) return result;
  const candidates = rows.filter(row => String(row.towContratto || '').trim().toLowerCase() === contractType.trim().toLowerCase());
  const groups = {};
  candidates.forEach(row => {
    const code = normalizeTowCode(row.tow); const price = priceNumber(row.valoreUnitario);
    if (code && price != null) (groups[code] ||= new Set()).add(price);
  });
  for (const [code, prices] of Object.entries(groups)) {
    if (result[code] == null && prices.size === 1) result[code] = [...prices][0];
  }
  return result;
}
