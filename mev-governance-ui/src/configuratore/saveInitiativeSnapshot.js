import { workspaceRequest } from '../services/mevService';

export function verifiedPlanSnapshot(expected, actual) {
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(expected || {})) === JSON.stringify(canonical(actual || {}));
}

// The archive offer and the shared workspace must restore the same plans.
// Requests are not transactional: if either fails, report failure and keep UI open.
export async function saveInitiativeSnapshot(body, context, saveOffer) {
  const code = String(body.payload.initiative.code || '').trim();
  if (!code) throw new Error('Inserisci il GOTO per salvare offerta e storico insieme.');
  const path = `${encodeURIComponent(code)}/revisions`;
  const history = await workspaceRequest(path);
  const current = history[0] ? JSON.parse(history[0].payload) : {};
  const matching = context?.goto === code && context.version > 0;
  if (matching && context.version !== (history[0]?.version || 0)) throw new Error('Un collega ha aggiornato lo storico. Aggiornalo e confronta la bozza prima di salvare; il lavoro corrente è conservato.');
  const analysis = matching ? context.analysis : current;
  const state = { ...analysis, title: body.payload.initiative.title || analysis.title || code,
    system: body.payload.initiative.system || analysis.system || '', estimate: body.payload };
  // Save offer first. A later revision failure is explicitly a partial save.
  const offer = await saveOffer(body);
  const offerPayload = typeof offer.payload === 'string' ? JSON.parse(offer.payload) : offer.payload;
  if (!offerPayload || !verifiedPlanSnapshot(body.payload.developmentPlans, offerPayload.developmentPlans))
    throw new Error('Il server non ha confermato le schede dell’offerta. La pagina rimane aperta: non ricaricare.');
  try {
    const revision = await workspaceRequest(path, { expectedVersion: history[0]?.version || 0,
      reason: 'Salvataggio valutazione con schede e proposte AI correnti', state });
    const returned = typeof revision.payload === 'string' ? JSON.parse(revision.payload) : revision.payload;
    if (!returned || !verifiedPlanSnapshot(body.payload.developmentPlans, returned.estimate?.developmentPlans))
      throw new Error('Le schede non sono presenti nella conferma dello storico.');
    return revision;
  } catch (error) {
    throw new Error(`Offerta salvata, ma storico non aggiornato: ${error.message} La pagina resta aperta; conserva la bozza e riconcilia lo storico prima di chiudere.`);
  }
}
