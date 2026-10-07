// Mantiene la base d'asta disponibile anche per offerte importate prima del fix.
export function lottiConBaseAsta(lotti, offerte = {}) {
  return lotti.map((lotto, index) => {
    const imported = offerte[index + 1]?.offertaEconomica?.importoBaseGara;
    const current = lotto.importoBase;
    return (current == null || current === "" || Number(current) === 0) && Number(imported) > 0
      ? { ...lotto, importoBase: imported }
      : lotto;
  });
}

export function salvaBasiImportate(gara, offerte, nuoviLotti) {
  if (!gara.capitolato?.lotti) return gara;
  const lotti = gara.capitolato.lotti.map((lotto, index) => {
    const imported = offerte[index + 1]?.offertaEconomica?.importoBaseGara;
    return nuoviLotti.includes(String(index + 1)) && Number(imported) > 0
      ? { ...lotto, importoBase: imported }
      : lotto;
  });
  return { ...gara, capitolato: { ...gara.capitolato, lotti } };
}
