// API payloads can represent lot IDs as numbers or strings. Never fall back to
// a different lot when the requested one is absent or disabled.
export function activeContractLot(contract, lot) {
  return (contract?.lots || []).find(entry => entry.active !== false && String(entry.lotId) === String(lot)) || null;
}
