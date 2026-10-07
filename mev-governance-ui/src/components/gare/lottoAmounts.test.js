import { lottiConBaseAsta, salvaBasiImportate } from "./lottoAmounts";

test("recupera importi già importati per il lotto corretto e preserva la base manuale", () => {
  const lotti = [{ nome: "Lotto 1", importoBase: 120 }, { nome: "Lotto 2", importoBase: "" }];
  const offerte = { 1: { offertaEconomica: { importoBaseGara: 100 } }, 2: { offertaEconomica: { importoBaseGara: 14860949 } } };
  const actual = lottiConBaseAsta(lotti, offerte);
  expect(actual.map(l => l.importoBase)).toEqual([120, 14860949]);
  expect(lotti[1].importoBase).toBe("");
});

test("salva solo la base dei lotti appena importati e non cancella importi se manca la base Excel", () => {
  const gara = { capitolato: { lotti: [{ importoBase: 100 }, { importoBase: 200 }] } };
  const offerte = { 1: { offertaEconomica: { importoBaseGara: null } }, 2: { offertaEconomica: { importoBaseGara: 14860949 } } };
  expect(salvaBasiImportate(gara, offerte, ["1", "2"]).capitolato.lotti.map(l => l.importoBase)).toEqual([100, 14860949]);
  expect(gara.capitolato.lotti[1].importoBase).toBe(200);
});
