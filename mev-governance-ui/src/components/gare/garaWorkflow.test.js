import { itemKey, lottoProgress, updateAttachment, updateLotto, scaduto, scadenzaEffettiva } from "./garaWorkflow";

test("progressi distinguono allegato, approvazione, obblighi, ritardi e requisiti", () => {
  const docs = [{ nome: "Tecnica", obbligatorio: true, _docAttachment: { name: "bozza.pdf" } }, { nome: "Economica", obbligatorio: true }, { nome: "Opzionale", obbligatorio: false, _docAttachment: {} }];
  const reqs = ["Sicurezza", "Esperienza"];
  const lotto = { documentiRichiesti: docs, requisitiTecnici: reqs, workflow: { documenti: { [itemKey(docs[2], 2, docs)]: { stato: "Approvato" } }, requisiti: { [itemKey(reqs[0], 0, reqs, "req")]: { stato: "Non conforme" } } } };
  const progress = lottoProgress(lotto, "2026-10-06", new Date(2026, 9, 7));
  expect(progress).toMatchObject({ approved: 1, total: 3, mandatoryMissing: 2, overdue: 2, requirementsPending: 1, requirementsFailed: 1, percent: 33 });
  expect(scaduto("2026-10-07", new Date(2026, 9, 7))).toBe(false);
  expect(scaduto("", new Date())).toBe(false);
  expect(scadenzaEffettiva("2026-12-01", "2026-10-06")).toBe("2026-10-06");
});

test("allegati e workflow si salvano nel lotto corretto senza modificare altri lotti o originali", () => {
  const gara = { capitolato: { lotti: [1, 2].map(num => ({ nome: `Lotto ${num}`, documentiRichiesti: [{ nome: "Tecnica" }], proposte: { tecnica: [{ sezione: "Analisi" }], economica: [{ voce: "Costo" }] } })) } };
  for (const section of ["doc", "tec", "eco"]) {
    const updated = updateAttachment(gara, 1, section, 0, { name: "risposta.pdf" });
    expect(updated.capitolato.lotti[0]).toBe(gara.capitolato.lotti[0]);
    expect(JSON.stringify(updated.capitolato.lotti[1])).toContain("risposta.pdf");
    expect(JSON.stringify(gara)).not.toContain("risposta.pdf");
    expect(JSON.stringify(updateAttachment(updated, 1, section, 0, null))).not.toContain("risposta.pdf");
  }
  const updated = updateLotto(gara, 1, lotto => ({ ...lotto, workflow: { test: true } }));
  expect(updated.capitolato.lotti[1].workflow.test).toBe(true);
  expect(gara.capitolato.lotti[1].workflow).toBeUndefined();
});

test("le chiavi dei documenti univoci restano stabili dopo riordino", () => {
  const docs = [{ nome: "Tecnica", tipo: "PDF" }, { nome: "Economica", tipo: "XLSX" }];
  expect(itemKey(docs[0], 0, docs)).toBe(itemKey(docs[0], 1, [...docs].reverse()));
});
