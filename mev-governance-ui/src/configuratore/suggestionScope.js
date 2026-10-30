const sapIds = new Set(['453','462','952','954','955','965','966','967','1025']);
const sapMention = /\b(sap|abap|bapi|spro)\b/i;
// Scope comes from the user's requirement and imported activities, never from
// the candidate's own rationale, a generic profile, or unrelated past estimates.
export function catalogEntryInScope(entry, evidence) {
  const isSap = sapIds.has(String(entry.id)) || sapMention.test(`${entry.ambito || ''} ${entry.nome || ''}`);
  return !isSap || sapMention.test(String(evidence || ''));
}
export const initiativeScopeText = initiative => [initiative.system, initiative.title, initiative.description, initiative.requirements].filter(Boolean).join(' ');
