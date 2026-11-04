import { euro, fmtItIT } from './utils';

test.each([[2737.5, '2.737,50 €'], [1000, '1.000,00 €'], [9999.99, '9.999,99 €'], [10000, '10.000,00 €'], [1234567.89, '1.234.567,89 €'], [-2737.5, '-2.737,50 €'], [-100, '-100,00 €'], [0, '0,00 €']])('formats currency %s with explicit thousands separators', (value, expected) => {
  expect(euro.format(value)).toBe(expected);
});
test('keeps quantity precision and negative signs intact', () => {
  expect(fmtItIT(-100, 3)).toBe('-100,000');
  expect(fmtItIT(2737.5, 3)).toBe('2.737,500');
});
