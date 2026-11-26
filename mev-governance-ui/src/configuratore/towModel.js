// TOW .1 .3 .4: «previsti» e modificabili. Oggi gli euro di questi tre TOW si calcolano dalla % di impatto (catalogo x moltiplicatore x %). Qui si aggiunge la possibilita' di
// scegliere una QUANTITA': allora gli euro di quel TOW sono quantita' x prezzo unitario e la % non conta piu' per quel TOW. Senza una quantita' scelta tutto resta come prima.
//
// Dove si salva: dentro `tow` (che si salva gia' con la valutazione), con la chiave «<TOW>_qty». I TOW .2 e .6 sono gia' manuali: la loro quantita' e' `tow[<TOW>]`.

export const AUTO = ['1', '3', '4'];
export const MANUAL = ['2', '6'];
export const STEP = 0.05;

const num = value => { if (value == null || value === '') return null; const n = Number(value); return Number.isFinite(n) ? n : null; };
export const qtyKey = key => `${key}_qty`;

// La quantita' scelta dall'utente per un TOW calcolato, oppure null se non ne ha scelta una (si usa il calcolo da percentuale).
export const chosenQuantity = (tow, key) => { const n = num(tow?.[qtyKey(key)]); return n != null && n >= 0 ? n : null; };

// Arrotonda PER ECCESSO al multiplo di 0,05 (1,441 -> 1,45; 1,45 -> 1,45; 1,451 -> 1,5). Lavora in centesimi interi per non farsi ingannare dai decimali binari
// (1,45 non deve diventare 1,5 perche' 1,45 / 0,05 = 29,000000000000004).
export function roundUp(value, step = STEP) {
  const n = num(value); if (n == null || n <= 0) return 0;
  const unit = Math.round(step * 1000);                   // 50 millesimi
  // Si lavora in MILLESIMI interi: una quantita' si scrive al massimo con tre decimali, quello che sta oltre e' rumore dei decimali binari (1,441 * 1000 = 1441.0000000000002).
  // Arrotondare al millesimo prima di dividere evita che 1,45 diventi 1,5; ma una quantita' VERA oltre il millesimo (2,0004) non sparisce: si arrotonda al millesimo piu' vicino
  // e poi si sale (2,0004 -> 2,000 -> 2,00: nessun salto; 2,0006 -> 2,001 -> 2,05).
  const thousandths = Math.round(n * 1000);
  return Math.ceil(thousandths / unit) * unit / 1000;
}

// Gli euro di un TOW: quantita' x prezzo unitario.
export const amountOf = (quantity, unitPrice) => (Number(quantity) || 0) * (Number(unitPrice) || 0);

// Per un TOW calcolato: la quantita' che si usa (scelta, oppure ricavata dagli euro calcolati dalla percentuale), da dove viene, e gli euro.
// `computedAmount` = gli euro che il calcolo da percentuale darebbe; `unitPrice` = prezzo unitario del TOW.
export function autoTowRow({ key, computedAmount, unitPrice, tow }) {
  const chosen = chosenQuantity(tow, key);
  const price = Number(unitPrice) > 0 ? Number(unitPrice) : null;
  const computedQty = price ? (Number(computedAmount) || 0) / price : null;
  if (chosen != null && price) return { key, source: 'scelta', quantity: chosen, computedQuantity: computedQty, amount: amountOf(chosen, price), computedAmount: Number(computedAmount) || 0, unitPrice: price };
  return { key, source: 'calcolo', quantity: computedQty, computedQuantity: computedQty, amount: Number(computedAmount) || 0, computedAmount: Number(computedAmount) || 0, unitPrice: price };
}

// La quantita' arrotondata per eccesso per un TOW calcolato: parte da quella che si usa ora (scelta o calcolata). Senza prezzo unitario non c'e' quantita' da arrotondare.
export function roundedQuantityFor(row) { return row.quantity == null ? null : roundUp(row.quantity); }

// Quanto cambiano gli euro se si arrotondano per eccesso tutti i TOW (anteprima del tasto): TOW calcolati e manuali.
export function roundingPreview(rows) {
  const lines = rows.filter(row => row.quantity != null && row.unitPrice).map(row => { const next = roundUp(row.quantity); return { key: row.key, from: row.quantity, to: next, changes: Math.abs(next - row.quantity) > 1e-9, extra: amountOf(next, row.unitPrice) - row.amount }; });
  return { lines, changed: lines.filter(line => line.changes).length, extra: lines.reduce((sum, line) => sum + (line.changes ? line.extra : 0), 0) };
}

// Gli euro dei TOW calcolati, pronti per calc(): per ogni TOW .1/.3/.4 con una quantita' scelta, quantita' x prezzo; gli altri non compaiono (restano calcolati).
export function towOverrides({ tow, lot, prices }) {
  const out = {};
  for (const n of AUTO) {
    const key = `TOW0${lot}.${n}`; const chosen = chosenQuantity(tow, key); const price = Number(prices?.[key]);
    if (chosen != null && price > 0) out[key] = amountOf(chosen, price);
  }
  return out;
}
