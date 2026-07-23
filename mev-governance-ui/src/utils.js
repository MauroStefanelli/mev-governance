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
  for (let i = 0; i < intPart.length; i++) {
    if (i > 0 && (intPart.length - i) % 3 === 0) intFormatted += ".";
    intFormatted += intPart[i];
  }
  return decimals > 0 ? `${intFormatted},${decPart}` : intFormatted;
};

export const fmtEuroIt = (value) => {
  const s = fmtItIT(value);
  return s === "" ? "" : `€ ${s}`;
};
