import { lottiConBaseAsta, salvaBasiImportate, importoDocumentale } from "./lottoAmounts";

test("recupera importi documentali per il lotto corretto e li preferisce ai vecchi valori manuali", () => {
  const lotti = [{ nome: "Lotto 1", importoBase: 120 }, { nome: "Lotto 2", importoBase: "" }];
  const offerte = { 1: { offertaEconomica: { importoBaseGara: 100 } }, 2: { offertaEconomica: { importoBaseGara: 14860949 } } };
  const actual = lottiConBaseAsta(lotti, offerte);
  expect(actual.map(l => l.importoBase)).toEqual([100, 14860949]);
  expect(lotti[1].importoBase).toBe("");
});

test("normalizza gli importi italiani estratti dal PDF senza trasformare dati mancanti in zero", () => {
  for (const input of ["€ 14.860.949,00", "14860949.00", 14860949]) expect(importoDocumentale(input)).toBe(14860949);
  expect(importoDocumentale("14.860.949")).toBe(14860949);
  for (const input of [null, "non disponibile", "", -1]) expect(importoDocumentale(input)).toBeNull();
});

test("gli importi seguono il numero del lotto anche quando l'analisi cambia l'ordine", () => {
  const lotti = [{ nome: "Lotto 2 - Logistica" }, { nome: "Lotto 1 - Tracciatura" }];
  const offerte = { 1: { offertaEconomica: { importoBaseGara: 100 } }, 2: { offertaEconomica: { importoBaseGara: 200 } } };
  expect(lottiConBaseAsta(lotti, offerte).map(l => l.importoBase)).toEqual([200, 100]);
  expect(salvaBasiImportate({ capitolato: { lotti } }, offerte, ["2"]).capitolato.lotti.map(l => l.importoBase)).toEqual([200, undefined]);
});

test("salva solo la base dei lotti appena importati e non cancella importi se manca la base Excel", () => {
  const gara = { capitolato: { lotti: [{ importoBase: 100 }, { importoBase: 200 }] } };
  const offerte = { 1: { offertaEconomica: { importoBaseGara: null } }, 2: { offertaEconomica: { importoBaseGara: 14860949 } } };
  expect(salvaBasiImportate(gara, offerte, ["1", "2"]).capitolato.lotti.map(l => l.importoBase)).toEqual([100, 14860949]);
  expect(gara.capitolato.lotti[1].importoBase).toBe(200);
});
