import { activeContractLot } from './activeContractLot';
import { resolveTowPrices } from './towPriceResolution';

test('reads Lotto 2 prices when API lot IDs are numeric instead of falling back to Lotto 1', () => {
  const contract = { lots: [{ lotId: 1, towPrices: {} }, { lotId: 2, towPrices: { 'TOW02.1': 3607, 'TOW02.2': 9018, 'TOW02.3': 3156, 'TOW02.4': 1202, 'TOW02.6': 6443 } }] };
  expect(resolveTowPrices(activeContractLot(contract, '2').towPrices)).toEqual(contract.lots[1].towPrices);
});
test('never reads a different lot or disabled lot when selected lot is unavailable', () => {
  expect(activeContractLot({ lots: [{ lotId: '1' }, { lotId: '2', active: false }] }, '2')).toBeNull();
  expect(activeContractLot({ lots: [{ lotId: '1' }] }, '2')).toBeNull();
});
