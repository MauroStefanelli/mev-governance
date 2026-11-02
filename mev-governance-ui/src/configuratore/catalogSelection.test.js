import { initialCatalogSelection } from './catalogSelection';

const contract = { contractId: 'accordo-quadro', lots: [
  { lotId: '1', catalog: [] },
  { lotId: '2', catalog: [{ id: 'api' }] },
] };

test('defaults to the only archived contract and its populated Lotto 2', () => {
  expect(initialCatalogSelection([contract])).toEqual({ contractId: 'accordo-quadro', lotId: '2' });
});

test('prefers the active environment link and excludes inactive lots', () => {
  const linked = { contractId: 'linked', lots: [{ lotId: '3', codiceContratto: '449' }] };
  expect(initialCatalogSelection([contract, linked], '449')).toEqual({ contractId: 'linked', lotId: '3' });
  expect(initialCatalogSelection([{ ...linked, lots: [{ ...linked.lots[0], active: false }] }], '449')).toBeNull();
});

test('does not guess between contracts or populated lots or select the included catalog', () => {
  expect(initialCatalogSelection([contract, { ...contract, contractId: 'other' }])).toBeNull();
  expect(initialCatalogSelection([{ ...contract, lots: contract.lots.map(l => ({ ...l, catalog: [{}] })) }])).toBeNull();
  expect(initialCatalogSelection([{ ...contract, contractId: 'poste-tet-2025' }])).toBeNull();
});
