import { normalizeTowCode, resolveTowPrices } from './towPriceResolution';

test('normalizes archive TOW codes and structured prices', () => {
  expect(normalizeTowCode('TOW 02.1')).toBe('TOW02.1');
  expect(resolveTowPrices({ 'TOW 02.1': 3607, 'tow2.3': { valoreUnitario: 3156 } })).toEqual({ 'TOW02.1': 3607, 'TOW02.3': 3156 });
});
test('uses only exact selected contract rows and keeps archive prices authoritative', () => {
  const rows = [{ towContratto: 'BASE', tow: 'TOW 02.1', valoreUnitario: 3607 }, { towContratto: 'OTHER', tow: 'TOW02.3', valoreUnitario: 999 }];
  expect(resolveTowPrices({}, rows, 'BASE')).toEqual({ 'TOW02.1': 3607 });
  expect(resolveTowPrices({ 'TOW02.1': 100 }, rows, 'BASE')['TOW02.1']).toBe(100);
  expect(resolveTowPrices({}, rows, '')).toEqual({});
});
test('does not guess among conflicting prices', () => {
  expect(() => resolveTowPrices({ 'TOW 02.1': 100, 'TOW02.1': 200 })).toThrow('discordanti');
  expect(resolveTowPrices({}, [{ towContratto: 'BASE', tow: 'TOW02.1', valoreUnitario: 100 }, { towContratto: 'BASE', tow: 'TOW02.1', valoreUnitario: 200 }], 'BASE')).toEqual({});
});
