export const KINDS = {
  razionale: { label: 'Razionale', plural: 'Razionali', hint: 'Perché serve l’intervento' },
  vincolo: { label: 'Vincolo', plural: 'Vincoli', hint: 'Cosa limita o deve essere rispettato' },
  decisione: { label: 'Decisione', plural: 'Decisioni', hint: 'Cosa è stato scelto' },
};
export const KIND_ORDER = ['razionale', 'vincolo', 'decisione'];
export const MAX_QUESTION = 4000;
export const MAX_ENTRY = 600;

export const kindLabel = kind => KINDS[kind]?.label || 'Voce';

export function validateText(text, max) {
  const value = String(text ?? '').trim();
  if (!value) return { ok: false, reason: 'Il testo è obbligatorio.' };
  if (value.length > max) return { ok: false, reason: `Massimo ${max} caratteri (ora ${value.length}).` };
  return { ok: true, value };
}

// The identity of the initiative must match the server's: trimmed and case-insensitive.
export const initiativeCode = initiative => String(initiative?.code || initiative?.title || '').trim();

export function mergeById(current, incoming) {
  const byId = new Map(current.map(item => [item.id, item]));
  incoming.forEach(item => byId.set(item.id, item));
  return [...byId.values()].sort((a, b) => a.id - b.id);
}

// Entries grouped by status for the panel, newest first inside each group.
export function groupEntries(entries) {
  const by = status => entries.filter(entry => entry.status === status).sort((a, b) => b.id - a.id);
  return { proposals: by('proposta'), confirmed: by('confermata'), discarded: [...by('scartata'), ...by('revocata')] };
}

export const confirmedEntries = entries => (entries || []).filter(entry => entry.status === 'confermata');

// Confirmed knowledge, written for the AI and for people: only confirmed entries, grouped by kind, with the source.
export function knowledgeForAi(entries) {
  return confirmedEntries(entries).map(entry => ({ kind: entry.kind, text: entry.text, interventionId: entry.interventionId || '',
    decidedBy: entry.decidedByFullName || entry.decidedBy || '', fromInitiative: entry.sourceEntryId ? 'ripresa da altra iniziativa' : '' }));
}

export function knowledgeMarkdown(entries, title = 'Razionali e vincoli confermati') {
  const confirmed = confirmedEntries(entries);
  if (!confirmed.length) return '';
  return `## ${title}\n\n` + KIND_ORDER.map(kind => {
    const rows = confirmed.filter(entry => entry.kind === kind);
    return rows.length ? `### ${KINDS[kind].plural}\n${rows.map(entry => `- ${entry.text}${entry.interventionId ? ` _(intervento ${entry.interventionId})_` : ''}`).join('\n')}\n` : '';
  }).filter(Boolean).join('\n') + '\n';
}

// An entry tied to an intervention applies to that intervention; an untied one applies to the whole initiative.
export const entriesForIntervention = (entries, interventionId) => confirmedEntries(entries)
  .filter(entry => !entry.interventionId || String(entry.interventionId) === String(interventionId));

export function countByKind(entries) {
  const confirmed = confirmedEntries(entries);
  return Object.fromEntries(KIND_ORDER.map(kind => [kind, confirmed.filter(entry => entry.kind === kind).length]));
}

// Related entries already taken by this initiative are not offered again.
export const notYetTaken = (related, entries) => {
  const taken = new Set((entries || []).filter(entry => entry.sourceEntryId && ['proposta', 'confermata'].includes(entry.status)).map(entry => entry.sourceEntryId));
  return (related || []).filter(entry => !taken.has(entry.id));
};

export function indexRationaleSummary(list) {
  return Object.fromEntries((Array.isArray(list) ? list : []).map(entry => [String(entry.goto).trim().toLowerCase(), entry]));
}
