export function importoDocumentale(value) {
  if (typeof value === "number") return Number.isFinite(value) && value > 0 ? value : null;
  let text = String(value ?? "").replace(/EUR|€/gi, "").replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(text)) return null;
  if (text.includes(",")) text = text.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(text)) text = text.replace(/\./g, "");
  const amount = Number(text);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

// Mantiene la base d'asta disponibile anche per offerte importate prima del fix.
export function lottiConBaseAsta(lotti, offerte = {}) {
  return lotti.map((lotto, index) => {
    const num = numeroLotto(lotto, index);
    const imported = importoDocumentale(offerte[num]?.offertaEconomica?.importoBaseGara);
    // L'importo estratto dall'Excel è prioritario rispetto ai vecchi valori manuali.
    return Number(imported) > 0
      ? { ...lotto, importoBase: imported, baseAstaFonte: offerte[num].excelFileName || "Excel offerta importato" }
      : { ...lotto, importoBase: importoDocumentale(lotto.importoBase) };
  });
}

export function salvaBasiImportate(gara, offerte, nuoviLotti) {
  if (!gara.capitolato?.lotti) return gara;
  const lotti = gara.capitolato.lotti.map((lotto, index) => {
    const num = numeroLotto(lotto, index);
    const imported = importoDocumentale(offerte[num]?.offertaEconomica?.importoBaseGara);
    return nuoviLotti.includes(num) && Number(imported) > 0
      ? { ...lotto, importoBase: imported, baseAstaFonte: offerte[num].excelFileName || "Excel offerta importato" }
      : lotto;
  });
  return { ...gara, capitolato: { ...gara.capitolato, lotti } };
}
export function numeroLotto(lotto, index) {
  return String(lotto?.numeroLotto || lotto?.numero || lotto?.nome?.match(/lotto\s*(\d+)/i)?.[1] || index + 1);
}
