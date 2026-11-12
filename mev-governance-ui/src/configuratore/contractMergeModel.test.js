import { contractHealth, likelyDuplicates, suggestedKeeper, summarizePlan, ACTION_LABEL } from './contractMergeModel';

const cat = n => Array.from({ length: n }, (_, i) => ({ id: i }));
const prices = n => Object.fromEntries(Array.from({ length: n }, (_, i) => [`TOW02.${i + 1}`, i]));
const complete = { contractId: 'tet', name: 'Tracciatura e Logistica Integrata', lots: [{ lotId: '1', active: false, towPrices: {}, catalog: [] }, { lotId: '2', active: true, towPrices: prices(5), catalog: cat(27), priceFile: 'Listino.pdf', catalogFile: 'Catalogo.pdf' }] };
const fromTender = { contractId: 'aq', name: 'Accordo Quadro', lots: [{ lotId: '2', active: true, towPrices: {}, catalog: cat(27), priceFile: '(importato da gara abc)' }] };

test('a contract imported from a tender is reported as incomplete, and says why', () => {
  const h = contractHealth(fromTender);
  expect(h.complete).toBe(false); expect(h.problems).toHaveLength(1); expect(h.problems[0]).toMatch(/Lotto 2: nessun prezzo TOW/); expect(h.problems[0]).toMatch(/non ha letto il listino/);
});
test('a contract with prices and catalog on its active lot is complete, even if an inactive lot is empty', () => {
  expect(contractHealth(complete)).toEqual({ complete: true, problems: [] });
});
test('deleted lots are ignored, and a contract with no lots is incomplete', () => {
  expect(contractHealth({ lots: [{ lotId: '1', deleted: true, towPrices: {}, catalog: [] }] }).problems).toEqual(['Nessun lotto']);
  expect(contractHealth(undefined).complete).toBe(false);
});
test('an active lot without catalog is reported', () => {
  expect(contractHealth({ lots: [{ lotId: '1', active: true, towPrices: prices(2), catalog: [] }] }).problems).toEqual(['Lotto 1: catalogo vuoto']);
});

test('two contracts with the same lots and the same catalog size are flagged as likely duplicates; the built-in and different ones are not', () => {
  const other = { contractId: 'altro', name: 'Altro', lots: [{ lotId: '1', active: true, towPrices: prices(1), catalog: cat(5) }] };
  const builtin = { contractId: 'poste-tet-2025', builtin: true, lots: complete.lots };
  const groups = likelyDuplicates([complete, fromTender, other, builtin]);
  expect(groups).toHaveLength(1); expect(groups[0].map(c => c.contractId).sort()).toEqual(['aq', 'tet']);
  expect(likelyDuplicates([complete, other])).toEqual([]);
});
test('contracts with an empty catalog are never reported as duplicates of each other', () => {
  const a = { contractId: 'a', lots: [{ lotId: '1', catalog: [] }] }; const b = { contractId: 'b', lots: [{ lotId: '1', catalog: [] }] };
  expect(likelyDuplicates([a, b])).toEqual([]);
});

test('the suggested contract to keep is the one with the prices, in either order', () => {
  expect(suggestedKeeper(complete, fromTender).contractId).toBe('tet');
  expect(suggestedKeeper(fromTender, complete).contractId).toBe('tet');
});
test('with the same data the first one is suggested, so the answer is stable', () => {
  const twin = { ...complete, contractId: 'twin' };
  expect(suggestedKeeper(complete, twin).contractId).toBe('tet');
});

describe('summarizePlan', () => {
  test('nothing to move: says the kept contract already has everything', () => {
    const s = summarizePlan({ canRemove: true, lots: [{ lotId: '2', action: 'nessuna', reason: 'Il lotto di destinazione ha già tutto: non cambia.' }], sharedApplications: [], references: [] });
    expect(s.changes).toBe(0); expect(s.headline).toMatch(/nulla da spostare/); expect(s.canRemove).toBe(true);
  });
  test('counts lots to add or complete, applications to add and evaluations to relink', () => {
    const s = summarizePlan({ canRemove: true, lots: [{ lotId: '1', action: 'aggiungi', reason: 'x' }, { lotId: '2', action: 'completa', reason: 'y' }, { lotId: '3', action: 'nessuna', reason: 'z' }],
      sharedApplications: [{ lotKey: '2', action: 'completa', fromApps: 3, toApps: 2, added: 1 }, { lotKey: 'all', action: 'nessuna', fromApps: 1, toApps: 1, added: 0 }], references: [{ recordKey: 'k', title: '145480 · Prova' }] });
    expect(s.changes).toBe(4); expect(s.headline).toBe('4 elementi verranno spostati e poi il contratto sarà eliminato'); expect(s.lines).toHaveLength(6);
    expect(s.lines.find(l => l.kind === 'riferimento').text).toMatch(/collegata a quello che resta/); expect(s.lines.find(l => l.title.includes('tutti i lotti'))).toBeTruthy();
  });
  test('a single change uses the singular', () => {
    expect(summarizePlan({ canRemove: true, lots: [{ lotId: '1', action: 'completa', reason: 'x' }], sharedApplications: [], references: [] }).headline).toBe('1 elemento verrà spostato e poi il contratto sarà eliminato');
  });
  test('a blocked plan lists the reasons and never says it can be removed', () => {
    const s = summarizePlan({ canRemove: false, blockers: ['Il contratto di sistema (built-in) non si elimina.'], lots: [], sharedApplications: [], references: [] });
    expect(s.canRemove).toBe(false); expect(s.headline).toBe('Non si può eliminare questo contratto'); expect(s.blockers).toHaveLength(1);
  });
  test('an empty or missing plan does not crash', () => { expect(summarizePlan(undefined).canRemove).toBe(false); expect(summarizePlan({}).lines).toEqual([]); });
  test('every action has a readable label', () => { ['aggiungi', 'completa', 'nessuna', 'ignora'].forEach(a => expect(ACTION_LABEL[a]).toBeTruthy()); });
});
