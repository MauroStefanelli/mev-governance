import { roundUp, chosenQuantity, qtyKey, amountOf, autoTowRow, roundingPreview, towOverrides, STEP, AUTO, MANUAL } from './towModel';
import { calc } from './configuratoreCore';

describe('rounding UP to the next multiple of 0,05', () => {
  test.each([[1.441, 1.45], [1.45, 1.45], [1.451, 1.5], [1.4, 1.4], [0.14, 0.15], [0.157, 0.2], [0.001, 0.05], [2, 2], [99.951, 100], [9.95, 9.95], [9.951, 10]])('%s -> %s', (given, expected) => expect(roundUp(given)).toBe(expected));
  test('the example of the request: 1,441 becomes 1,450', () => expect(roundUp(1.441)).toBe(1.45));
  test('a value that is already a multiple is NOT pushed to the next one (binary decimals: 1,45 / 0,05 = 29,000000000000004)', () => {
    [0.05, 0.1, 0.15, 0.35, 0.7, 1.15, 1.45, 2.55, 7.05, 12.35].forEach(value => expect(roundUp(value)).toBe(value));
    expect(roundUp(1.4500000000000002)).toBe(1.45); expect(roundUp(0.1 + 0.2)).toBe(0.3); expect(roundUp(1.0000000000000002)).toBe(1);
  });
  test('it NEVER goes down: the result is always >= the value (to the thousandth that a quantity is written with)', () => {
    for (let i = 0; i < 3000; i += 1) { const value = Math.round(Math.random() * 50000) / 1000; expect(roundUp(value)).toBeGreaterThanOrEqual(value - 1e-9); expect(roundUp(value) - value).toBeLessThan(STEP + 1e-9); }
  });
  test('the result is always a multiple of 0,05', () => { for (let i = 0; i < 2000; i += 1) { const r = roundUp(Math.round(Math.random() * 90000) / 1000); expect(Math.abs(Math.round(r / STEP) * STEP - r)).toBeLessThan(1e-9); } });
  test('empty, negative, zero and non numeric values are 0', () => { [null, undefined, '', 'abc', -3, 0].forEach(value => expect(roundUp(value)).toBe(0)); });
  test('it accepts numbers written as text', () => expect(roundUp('1.441')).toBe(1.45));
});

describe('a chosen quantity', () => {
  test('is read from tow[<TOW>_qty]; absent, empty, negative or not a number means «none chosen»', () => {
    expect(chosenQuantity({ 'TOW02.1_qty': 1.45 }, 'TOW02.1')).toBe(1.45);
    expect(chosenQuantity({ 'TOW02.1_qty': 0 }, 'TOW02.1')).toBe(0);               // zero e' una scelta valida (nessun TOW .1)
    [{}, { 'TOW02.1_qty': '' }, { 'TOW02.1_qty': null }, { 'TOW02.1_qty': -1 }, { 'TOW02.1_qty': 'x' }, undefined].forEach(tow => expect(chosenQuantity(tow, 'TOW02.1')).toBeNull());
    expect(qtyKey('TOW02.1')).toBe('TOW02.1_qty');
  });
});

describe('a calculated TOW row', () => {
  test('without a chosen quantity it keeps the amount computed from the % and shows the equivalent quantity', () => {
    const row = autoTowRow({ key: 'TOW02.1', computedAmount: 504.98, unitPrice: 3607, tow: {} });
    expect(row).toMatchObject({ source: 'calcolo', amount: 504.98, computedAmount: 504.98 }); expect(row.quantity).toBeCloseTo(0.14, 4);
  });
  test('with a chosen quantity the amount is quantity x unit price, and the computed values are kept to compare', () => {
    const row = autoTowRow({ key: 'TOW02.1', computedAmount: 504.98, unitPrice: 3607, tow: { 'TOW02.1_qty': 0.15 } });
    expect(row).toMatchObject({ source: 'scelta', quantity: 0.15, computedAmount: 504.98 }); expect(row.amount).toBeCloseTo(541.05, 2); expect(row.computedQuantity).toBeCloseTo(0.14, 4);
  });
  test('without a unit price there is no quantity: the amount stays the computed one, a chosen quantity is ignored', () => {
    expect(autoTowRow({ key: 'TOW02.1', computedAmount: 100, unitPrice: 0, tow: { 'TOW02.1_qty': 2 } })).toMatchObject({ source: 'calcolo', quantity: null, amount: 100 });
  });
  test('amountOf is quantity x price and never NaN', () => { expect(amountOf(1.45, 3607)).toBeCloseTo(5230.15, 2); expect(amountOf(null, 3607)).toBe(0); expect(amountOf('x', 5)).toBe(0); });
});

describe('what the rounding button would do', () => {
  const rows = [autoTowRow({ key: 'TOW02.1', computedAmount: 5200, unitPrice: 3607, tow: {} }), autoTowRow({ key: 'TOW02.3', computedAmount: 0, unitPrice: 3156, tow: { 'TOW02.3_qty': 0.15 } })];
  test('lists only the quantities that change and the euro the offer goes up by', () => {
    const preview = roundingPreview(rows);
    expect(preview.changed).toBe(1); expect(preview.lines.find(line => line.key === 'TOW02.1')).toMatchObject({ changes: true, to: 1.45 });
    expect(preview.lines.find(line => line.key === 'TOW02.3').changes).toBe(false);
    expect(preview.extra).toBeCloseTo((1.45 - 5200 / 3607) * 3607, 2); expect(preview.extra).toBeGreaterThan(0);
  });
  test('the offer can only go UP', () => { rows.forEach(row => expect(roundingPreview([row]).extra).toBeGreaterThanOrEqual(-1e-9)); });
  test('rows without a quantity or a price are left out', () => expect(roundingPreview([{ key: 'x', quantity: null, unitPrice: 5, amount: 0 }, { key: 'y', quantity: 1.441, unitPrice: null, amount: 0 }]).lines).toHaveLength(0));
});

describe('the amounts used by the offer calculation', () => {
  const prices = { 'TOW02.1': 3607, 'TOW02.3': 3156, 'TOW02.4': 1202 };
  test('only the TOW with a chosen quantity and a price become overrides', () => {
    expect(towOverrides({ tow: { 'TOW02.1_qty': 1.45, 'TOW02.3_qty': 2 }, lot: '2', prices: { 'TOW02.1': 3607 } })).toEqual({ 'TOW02.1': 1.45 * 3607 });      // .3 senza prezzo: ignorato
    expect(towOverrides({ tow: {}, lot: '2', prices })).toEqual({});
  });
  test('a zero quantity is a real choice (no TOW .1) and gives 0 euro', () => expect(towOverrides({ tow: { 'TOW02.1_qty': 0 }, lot: '2', prices })).toEqual({ 'TOW02.1': 0 }));
  test('the groups are the ones of the offer', () => { expect(AUTO).toEqual(['1', '3', '4']); expect(MANUAL).toEqual(['2', '6']); });
});

describe('calc(): the offer total follows the chosen quantities, and is unchanged without them', () => {
  const base = { items: [{ id: 239, type: 'MODIFICA', complexity: 'Medio', qty: 10, unit: 360 }], lot: '2', contractId: 'poste-tet-2025', archiveContractId: 'poste-tet-2025', tow5Share: 65,
    towPercentages: { 'poste-tet-2025': { 2: { 1: 16, 3: 13, 4: 6 } } }, tow: {}, discount: 0, contingency: 0, catalog: [], priceMode: 'base', builtin: false };
  test('without overrides the result is EXACTLY the one of before (the % of impact)', () => {
    const before = calc(base); const withEmpty = calc({ ...base, towOverrides: {} });
    expect(withEmpty).toEqual(before);
    expect(before.autoTow['TOW02.1']).toBeCloseTo(3600 * 1.53716 * 16 / 100, 4);
  });
  test('an override replaces ONLY that TOW and the totals follow', () => {
    const before = calc(base); const after = calc({ ...base, towOverrides: { 'TOW02.1': 5000 } });
    expect(after.autoTow['TOW02.1']).toBe(5000); expect(after.autoTow['TOW02.3']).toBe(before.autoTow['TOW02.3']); expect(after.autoTow['TOW02.4']).toBe(before.autoTow['TOW02.4']);
    expect(after.autoTotal - before.autoTotal).toBeCloseTo(5000 - before.autoTow['TOW02.1'], 6);
    expect(after.total - before.total).toBeCloseTo(5000 - before.autoTow['TOW02.1'], 6);
    expect(after.cat).toBe(before.cat);                                                    // il catalogo non cambia
  });
  test('an override of 0 really sets the TOW to zero', () => { const after = calc({ ...base, towOverrides: { 'TOW02.4': 0 } }); expect(after.autoTow['TOW02.4']).toBe(0); expect(after.total).toBeLessThan(calc(base).total); });
  test('discount and contingency apply to the new total', () => {
    const after = calc({ ...base, discount: 10, contingency: 5, towOverrides: { 'TOW02.1': 5000 } });
    expect(after.total).toBeCloseTo((after.cat + after.oth) * 0.9 * 1.05, 6);
  });
  test('the manual TOW .2 and .6 are not touched by the overrides', () => {
    const a = calc({ ...base, tow: { 'TOW02.2': 2 } }); const b = calc({ ...base, tow: { 'TOW02.2': 2 }, towOverrides: { 'TOW02.1': 1 } });
    expect(b.manualTotal).toBe(a.manualTotal);
  });
});
