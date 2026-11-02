import { offerWorkbookDetails, offerTowQuantities } from './OfferWorkbookExport';

test('exports selected contractual prices rather than example or imported prices', () => {
  const details = offerWorkbookDetails([{ id: 239, interventionId: 'I1', type: 'MODIFICA', complexity: 'Medio', qty: 2, unit: 999 }],
    [{ id: 239, nome: 'API', prezzi: { MODIFICA: { Medio: 75 } } }]);
  expect(details[0]).toMatchObject({ interventionId: 'I1', unitPrice: 75, quantity: 2 });
});

test('calculates automatic TOW quantities from contractual percentages and apportions manual TOW', () => {
  const details = [{ interventionId: 'I1', quantity: 2, unitPrice: 100 }, { interventionId: 'I2', quantity: 1, unitPrice: 100 }];
  const context = { lot: '2', percentages: { 1: 16, 3: 13, 4: 6 }, multiplier: 1.5, prices: { 'TOW02.1': 10, 'TOW02.3': 20, 'TOW02.4': 30 }, tow: { 'TOW02.2': 3 } };
  const first = offerTowQuantities(details, 'I1', context);
  const second = offerTowQuantities(details, 'I2', context);
  expect(first[1]).toBeCloseTo(4.8); expect(first[3]).toBeCloseTo(1.95); expect(first[4]).toBeCloseTo(.6);
  expect(first[2]).toBe(2); expect(second[2]).toBe(1);
  expect((first[1] + second[1]) * 10).toBeCloseTo(300 * 1.5 * .16);
});

test('requires configured percentages but accepts explicit zero', () => {
  const context = { lot: '2', prices: { 'TOW02.1': 10, 'TOW02.3': 20, 'TOW02.4': 30 } };
  expect(() => offerTowQuantities([], 'I1', context)).toThrow('Percentuale contrattuale');
  expect(offerTowQuantities([], 'I1', { ...context, percentages: { 1: 0, 3: 0, 4: 0 } })).toEqual({ 1: 0, 2: 0, 3: 0, 4: 0 });
});
test('does not silently export zero for missing contractual prices', () => {
  expect(() => offerWorkbookDetails([{ id: 239 }], [])).toThrow('prezzo del contratto mancante');
});
