import { offerWorkbookDetails } from './OfferWorkbookExport';

test('exports selected contractual prices rather than example or imported prices', () => {
  const details = offerWorkbookDetails([{ id: 239, interventionId: 'I1', type: 'MODIFICA', complexity: 'Medio', qty: 2, unit: 999 }],
    [{ id: 239, nome: 'API', prezzi: { MODIFICA: { Medio: 75 } } }]);
  expect(details[0]).toMatchObject({ interventionId: 'I1', unitPrice: 75, quantity: 2 });
});
test('does not silently export zero for missing contractual prices', () => {
  expect(() => offerWorkbookDetails([{ id: 239 }], [])).toThrow('prezzo del contratto mancante');
});
