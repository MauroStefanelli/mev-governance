import { initialCatalogSelection, withSafetyNet, usingSafetyNetOnly, catalogChoiceLabel, catalogLockMessage, safetyNetNotice, SYSTEM_CONTRACT_ID } from './catalogSelection';

const contract = { contractId: 'accordo-quadro', lots: [
  { lotId: '1', catalog: [] },
  { lotId: '2', catalog: [{ id: 'api' }] },
] };
// the user's real situation: the system contract lives in the Archivio, Lotto 1 is switched off, Lotto 2 is linked to the environment code
const system = { contractId: 'poste-tet-2025', name: 'Poste Italiane – Tracciatura e Logistica Integrata', builtin: true, lots: [
  { lotId: '1', active: false, catalog: [{ id: 1 }], codiceContratto: '' },
  { lotId: '2', active: true, catalog: [{ id: 'api' }, { id: 'db' }], codiceContratto: '4490015980' },
] };
const bundled = { contractId: 'poste-tet-2025', name: 'Poste TeT', builtin: true, safetyNet: true, lots: [{ lotId: '1', active: true, catalog: [{ id: 1 }] }, { lotId: '2', active: true, catalog: [{ id: 2 }] }] };

test('defaults to the only archived contract and its populated Lotto 2', () => {
  expect(initialCatalogSelection([contract])).toEqual({ contractId: 'accordo-quadro', lotId: '2' });
});

test('prefers the active environment link and excludes inactive lots', () => {
  const linked = { contractId: 'linked', lots: [{ lotId: '3', codiceContratto: '449' }] };
  expect(initialCatalogSelection([contract, linked], '449')).toEqual({ contractId: 'linked', lotId: '3' });
  expect(initialCatalogSelection([{ ...linked, lots: [{ ...linked.lots[0], active: false }] }], '449')).toBeNull();
});

test('does not guess between contracts or between populated lots', () => {
  expect(initialCatalogSelection([contract, { ...contract, contractId: 'other' }])).toBeNull();
  expect(initialCatalogSelection([{ ...contract, lots: contract.lots.map(l => ({ ...l, catalog: [{}] })) }])).toBeNull();
});

test('the system contract held in the Archivio is chosen like any other: by the environment code, on the right lot', () => {
  expect(initialCatalogSelection([system], '4490015980')).toEqual({ contractId: 'poste-tet-2025', lotId: '2' });
  expect(initialCatalogSelection([system, contract], '4490015980')).toEqual({ contractId: 'poste-tet-2025', lotId: '2' });
});
test('the system contract alone is chosen on its only populated active lot, never on a switched-off one', () => {
  expect(initialCatalogSelection([system])).toEqual({ contractId: 'poste-tet-2025', lotId: '2' });
  expect(initialCatalogSelection([{ ...system, lots: system.lots.map(l => ({ ...l, active: false })) }])).toBeNull();
});
test('a lot flagged as deleted is never chosen, even if it carries the environment code', () => {
  expect(initialCatalogSelection([{ ...system, lots: [{ ...system.lots[1], deleted: true }] }], '4490015980')).toBeNull();
});
test('two lots linked to the same environment code are ambiguous: nothing is chosen', () => {
  expect(initialCatalogSelection([system, { contractId: 'dup', lots: [{ lotId: '2', active: true, catalog: [{}], codiceContratto: '4490015980' }] }], '4490015980')).toBeNull();
});
test('no contracts at all, or missing data, does not crash', () => {
  expect(initialCatalogSelection([])).toBeNull(); expect(initialCatalogSelection(undefined)).toBeNull(); expect(initialCatalogSelection([{ contractId: 'x' }])).toBeNull();
});

describe('one list of contracts', () => {
  test('when the Archivio holds the system contract, the bundled copy is NOT in the list', () => {
    const list = withSafetyNet([system, contract], bundled);
    expect(list.map(c => c.contractId)).toEqual(['poste-tet-2025', 'accordo-quadro']); expect(list.some(c => c.safetyNet)).toBe(false); expect(list[0]).toBe(system);
  });
  test('the contract named "Poste TeT" never appears twice', () => {
    expect(withSafetyNet([system], bundled).filter(c => c.contractId === SYSTEM_CONTRACT_ID)).toHaveLength(1);
  });
  test('when the Archivio does not hold it, the bundled copy is kept first so an old revision can still be opened', () => {
    const list = withSafetyNet([contract], bundled); expect(list[0]).toBe(bundled); expect(list).toHaveLength(2);
  });
  test('with an empty Archivio the bundled copy is the only choice', () => { expect(withSafetyNet([], bundled)).toEqual([bundled]); expect(withSafetyNet(undefined, bundled)).toEqual([bundled]); });
  test('the safety-net notice appears only while the bundled copy is selected AND real contracts exist', () => {
    expect(usingSafetyNetOnly('poste-tet-2025', [contract])).toBe(true); expect(usingSafetyNetOnly('poste-tet-2025', [system])).toBe(false);
    expect(usingSafetyNetOnly('poste-tet-2025', [])).toBe(false); expect(usingSafetyNetOnly('accordo-quadro', [contract])).toBe(false);
    expect(safetyNetNotice('poste-tet-2025', [contract])).toMatch(/copia di riserva/); expect(safetyNetNotice('poste-tet-2025', [system])).toBe('');
  });
});

describe('words shown to the user', () => {
  test('the label is the contract name; only the bundled copy is described, and never as "built-in" or "incluso nell\'app"', () => {
    expect(catalogChoiceLabel(system)).toBe('Poste Italiane – Tracciatura e Logistica Integrata');
    expect(catalogChoiceLabel(bundled)).toMatch(/copia di riserva/); expect(catalogChoiceLabel(bundled)).not.toMatch(/built-in|incluso nell/i); expect(catalogChoiceLabel(undefined)).toBe('');
  });
  test('the lock message gives the reason, the number of rows and BOTH ways out; nothing when there are no rows', () => {
    expect(catalogLockMessage(0)).toBe('');
    const one = catalogLockMessage(1); expect(one).toMatch(/1 voce aggiunte/); const many = catalogLockMessage(12, { importedCount: 5 });
    expect(many).toMatch(/12 voci importate dall’Excel o aggiunte/); expect(many).toMatch(/rimuovi tutte le voci dal passo Offerta/); expect(many).toMatch(/\+ Nuova Iniziativa/); expect(many).toMatch(/non vengono mai sostituiti da soli/);
    expect(many).not.toMatch(/built-in|Poste TeT/);
  });
});
