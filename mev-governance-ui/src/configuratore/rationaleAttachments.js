import { scanForSecrets, RULE_LABELS } from './secretScan';
import { activitySourceContext, createSourceCache } from './activitySourceContext';

// What the user can attach to a question of the rationale chat: excerpts of THEIR source code (read in the browser, from a folder they pick)
// and data they paste (for example the result of a query run on their VPN). Everything is checked here and again on the server;
// an item with a credential never leaves the browser, and the screen says which one and on which line, never the value.
export const MAX_ITEMS = 8;
export const MAX_CHARS_EACH = 4000;
export const MAX_CHARS_TOTAL = 20000;
export const MAX_PASTE = 4000;

export const formatSize = bytes => bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

// Words of the question that tell which part of the code matters ("retry", "invio", "NPSO"): the same idea as in Sviluppo, on the whole chat question.
export async function sourceExcerptsFor(question, files, cache, { extraTerms = '', onProgress } = {}) {
  if (!files?.length) return { items: [], coverage: null, terms: [] };
  const context = await activitySourceContext(files, question, cache, { extraTerms, onProgress });
  return { items: context.files.map(file => ({ kind: 'sorgente', name: file.path, text: file.text, startLine: file.startLine, endLine: file.endLine, why: file.why })), coverage: context.coverage, terms: context.terms || [] };
}

// For the user: which files were chosen and why, so that "the AI did not see the rule" is never a mystery. Only paths and the words that matched.
export function chosenFilesSummary(items, terms = []) {
  const rows = (items || []).filter(item => item.kind === 'sorgente').map(item => ({ path: item.name, lines: item.startLine ? `righe ${item.startLine}-${item.endLine}` : '',
    because: [...new Set([...(item.why?.inPath || []), ...(item.why?.inText || [])])] }));
  return { rows, terms };
}

export function pasteItem(name, text) {
  const label = String(name || '').trim() || 'Dati incollati';
  return { kind: 'dati', name: label, text: String(text || '').trim(), startLine: null, endLine: null };
}

// Splits what can be sent from what must stay on the user's computer. Order is kept; the limits are the server's.
export function checkAttachments(items) {
  const kept = []; const dropped = []; let total = 0;
  for (const item of items || []) {
    const text = String(item.text || '');
    if (!text.trim()) { dropped.push({ name: item.name, reason: 'vuoto', line: 0 }); continue; }
    const hits = scanForSecrets(item.name, text);
    if (hits.length) { dropped.push({ name: item.name, reason: RULE_LABELS[hits[0].rule] || hits[0].rule, line: hits[0].line }); continue; }
    const clipped = text.length > MAX_CHARS_EACH ? text.slice(0, MAX_CHARS_EACH) : text;
    if (kept.length >= MAX_ITEMS) { dropped.push({ name: item.name, reason: `oltre il limite di ${MAX_ITEMS} allegati`, line: 0 }); continue; }
    if (total + clipped.length > MAX_CHARS_TOTAL) { dropped.push({ name: item.name, reason: 'oltre il limite totale degli allegati', line: 0 }); continue; }
    total += clipped.length; const { why: _why, ...toSend } = item; kept.push({ ...toSend, text: clipped });
  }
  return { kept, dropped };
}

export const attachmentSummary = ({ sent = [], dropped = [], notes = [] } = {}) => {
  const parts = [];
  if (sent.length) parts.push(`${sent.length} ${sent.length === 1 ? 'allegato inviato' : 'allegati inviati'} all’AI`);
  if (dropped.length) parts.push(`${dropped.length} non ${dropped.length === 1 ? 'inviato' : 'inviati'}: ${dropped.map(d => `«${d.name}» (${d.reason}${d.line ? `, riga ${d.line}` : ''})`).join(', ')}`);
  return { text: parts.join(' · '), notes };
};
export { createSourceCache };

// Notes the user keeps about HOW to reach an environment (which VPN, which database, who grants access). They are text for people, never credentials,
// and they are kept in the browser of the user that wrote them: they do not go to the server, to the AI or to colleagues.
export const CONNECTION_KEY = 'mev-rationale-connection-notes';
export const CONNECTION_FIELDS = [
  { id: 'environment', label: 'Ambiente', placeholder: 'es. Collaudo NPSO' },
  { id: 'vpn', label: 'VPN', placeholder: 'es. VPN Poste, profilo «Sviluppo»' },
  { id: 'host', label: 'Database o servizio', placeholder: 'es. Oracle NPSO collaudo, schema SAPLES' },
  { id: 'access', label: 'Chi concede l’accesso', placeholder: 'es. Mario Rossi (Sistemi)' },
];
export const emptyConnection = () => Object.fromEntries(CONNECTION_FIELDS.map(field => [field.id, '']));
export function connectionWarnings(notes) {
  const found = [];
  Object.entries(notes || {}).forEach(([key, value]) => scanForSecrets(key, String(value || '')).forEach(hit => found.push({ field: key, rule: RULE_LABELS[hit.rule] || hit.rule })));
  return found;
}
export const loadConnection = (storage = globalThis.localStorage) => { try { return { ...emptyConnection(), ...(JSON.parse(storage.getItem(CONNECTION_KEY) || '{}')) }; } catch { return emptyConnection(); } };
export const saveConnection = (notes, storage = globalThis.localStorage) => { try { storage.setItem(CONNECTION_KEY, JSON.stringify(notes)); return true; } catch { return false; } };
