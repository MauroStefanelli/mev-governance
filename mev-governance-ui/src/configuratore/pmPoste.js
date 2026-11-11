import { getMevOptions } from '../services/mevService';

// PM Poste is chosen from the values already used in MEV and MEV-CAP for the active contract, so the same person is
// always written the same way. A value that is not in the list is allowed (a new project manager) and kept as typed.
export const normalizePm = value => String(value ?? '').replace(/\s+/g, ' ').trim();

export function pmOptions(rawList, current) {
  const seen = new Map();
  [...(Array.isArray(rawList) ? rawList : []), current].forEach(value => {
    const text = normalizePm(value);
    if (text && !seen.has(text.toLowerCase())) seen.set(text.toLowerCase(), text);
  });
  return [...seen.values()].sort((a, b) => a.localeCompare(b, 'it', { sensitivity: 'base' }));
}

export const isKnownPm = (list, value) => {
  const text = normalizePm(value).toLowerCase();
  return !text || (Array.isArray(list) ? list : []).some(item => normalizePm(item).toLowerCase() === text);
};

// Loads the PM list used by MEV and MEV-CAP for the active environment. A failure is never fatal: the field then works as free text.
export async function loadPmPoste() {
  try { const options = await getMevOptions(); return pmOptions(options?.pmPoste, ''); }
  catch { return null; }
}

// The select shows a listed name, "" for none, or the "other" entry when the value is free text.
export const OTHER = '__altro__';
export function pmSelectValue(list, current) {
  const text = normalizePm(current).toLowerCase();
  if (!text) return '';
  const match = (Array.isArray(list) ? list : []).find(item => normalizePm(item).toLowerCase() === text);
  return match ? normalizePm(match) : OTHER;
}
// Choosing "other" keeps a free-text value that is already there, otherwise it starts an empty free-text entry.
export function pmFromSelect(list, chosen, current) {
  if (chosen !== OTHER) return chosen;
  return pmSelectValue(list, current) === OTHER ? current : '';
}
export const showsFreeText = (list, current, otherPicked = false) => !!(Array.isArray(list) && list.length) && (pmSelectValue(list, current) === OTHER || otherPicked);
