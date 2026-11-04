/**
 * Formattazione numero in stile it-IT (punto migliaia, virgola decimale)
 * Indipendente dal supporto ICU del browser.
 */
export const fmtItIT = (num, decimals = 3) => {
  if (num === null || num === undefined || num === "") return "";
  const n = parseFloat(num);
  if (isNaN(n)) return "";
  const fixed = n.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  let intFormatted = "";
  const digits = intPart.replace(/^-/, "");
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) intFormatted += ".";
    intFormatted += digits[i];
  }
  if (n < 0) intFormatted = `-${intFormatted}`;
  return decimals > 0 ? `${intFormatted},${decPart}` : intFormatted;
};

// Do not rely on it-IT ICU grouping thresholds: some browsers omit the
// separator for four-digit numbers. Keep all currency displays deterministic.
export const euro = { format: value => {
  const number = Number(value);
  return Number.isFinite(number) ? `${fmtItIT(number, 2)} €` : '—';
} };

export const fmtEuroIt = (value) => {
  const s = fmtItIT(value);
  return s === "" ? "" : `€ ${s}`;
};
