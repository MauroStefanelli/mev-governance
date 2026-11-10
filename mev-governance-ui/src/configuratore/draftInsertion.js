const filled = value => typeof value === 'string' && value.trim().length > 0;
export const proposalOf = plan => plan?.aiProposal || plan?.aiDraft || null;
export const LOCKED_STATES = ['In sviluppo', 'Da verificare', 'Verificata'];
export const hasWrittenContent = plan => !!(plan && (filled(plan.files) || filled(plan.solution) || filled(plan.acceptance)));

// The patch that copies a proposal into the editable fields. Files are replaced only when the
// proposal cites some: an empty citation list never blanks files the analyst already wrote.
export function draftPatch(plan, proposal) {
  const cited = [...new Set((proposal.evidence || []).map(entry => entry.path).filter(Boolean))];
  return { files: cited.length ? cited.join('\n') : (plan?.files || ''), solution: proposal.analysis.solution,
    acceptance: proposal.analysis.acceptance, status: 'Da analizzare', aiDraft: proposal };
}

// Why a sheet is not touched by the bulk insertion (null when it can be updated).
export function insertionBlocker(plan, overwrite) {
  const proposal = proposalOf(plan);
  if (!proposal || typeof proposal.analysis?.solution !== 'string' || typeof proposal.analysis?.acceptance !== 'string') return 'senza proposta AI';
  if (LOCKED_STATES.includes(plan.status)) return `stato «${plan.status}»`;
  if (plan.generatedCode?.files?.length) return 'ha file generati da questa scheda';
  if (plan.solution === proposal.analysis.solution && plan.acceptance === proposal.analysis.acceptance) return 'bozza già inserita';
  if (!overwrite && hasWrittenContent(plan)) return 'scheda già compilata';
  return null;
}

export function planInsertion(activities, plans, selectedKeys, overwrite) {
  const eligible = []; const skipped = [];
  activities.filter(a => selectedKeys.has(a.key)).forEach(a => {
    const reason = insertionBlocker(plans[a.key], overwrite);
    if (reason) skipped.push({ key: a.key, number: a.number, reason }); else eligible.push(a);
  });
  return { eligible, skipped };
}

export function applyInsertion(previous, keys) {
  const next = { ...previous }; const before = {}; const after = {};
  keys.forEach(key => {
    const plan = previous[key];
    if (insertionBlocker(plan, true)) return; // re-check against the latest state
    before[key] = plan; after[key] = next[key] = { ...plan, ...draftPatch(plan, proposalOf(plan)) };
  });
  return { next, before, after };
}

// Restores a sheet only if nobody edited it since the insertion; otherwise the newer edit wins.
export function undoInsertion(current, before, after) {
  const next = { ...current }; const kept = [];
  Object.entries(before).forEach(([key, plan]) => { if (current[key] === after[key]) next[key] = plan; else kept.push(key); });
  return { next, kept };
}
