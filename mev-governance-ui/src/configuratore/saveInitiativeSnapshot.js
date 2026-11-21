import { workspaceRequest } from '../services/mevService';

export function verifiedPlanSnapshot(expected, actual) {
  const canonical = value => Array.isArray(value) ? value.map(canonical)
    : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
  return JSON.stringify(canonical(expected || {})) === JSON.stringify(canonical(actual || {}));
}

// The archive offer and the shared workspace must restore the same plans.
// Requests are not transactional: if either fails, report failure and keep UI open.
const me = () => { try { return String(localStorage.getItem('XUSER') || '').trim().toLowerCase(); } catch { return ''; } };
const same = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const parse = revision => { try { return typeof revision.payload === 'string' ? JSON.parse(revision.payload) : revision.payload || {}; } catch { return {}; } };
// The analysis written by hand (as-is, to-be, decisions…): everything except what a save rewrites by itself (the estimate, and the identifying fields taken from the initiative).
const analysisPart = state => canonical(Object.fromEntries(Object.entries(state || {}).filter(([key]) => !['estimate', 'title', 'system', 'pmPoste'].includes(key))));

// The page learns the new version only after the shared analysis reloads. A revision written by THIS user since then (an earlier save of the same page: the draft saved on entering
// Revisione, an autosave) is not a colleague's work, so the save may continue from it, but only when it left the analysis exactly as this page holds it. Anything else is a conflict.
export function newerRevisions(history, knownVersion) { return history.filter(revision => revision.version > knownVersion); }
export function ownRevisionsSince(history, context, user = me()) {
  const newer = newerRevisions(history, context.version);
  return !!user && newer.length > 0 && newer.every(revision => same(revision.author, user) && JSON.stringify(analysisPart(parse(revision))) === JSON.stringify(analysisPart(context.analysis)));
}
// Says what happened: who saved, when, and which version this page is stopped at.
export function conflictMessage(history, context, user = me()) {
  const newer = newerRevisions(history, context.version);
  const other = newer.find(revision => !same(revision.author, user)) || newer[newer.length - 1];
  const when = other?.createdAt ? new Date(other.createdAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
  const who = !other ? 'Lo storico' : same(other.author, user) ? 'Hai già salvato un’altra versione dell’analisi (da un’altra scheda o sessione)' : `${other.author} ha aggiornato lo storico`;
  return `${who}${when ? ` il ${when}` : ''}: versione ${other?.version ?? history[0]?.version ?? '?'}, la tua pagina è ferma alla ${context.version}. Aggiorna lo storico e confronta la bozza prima di salvare; il lavoro corrente è conservato.`;
}

// Saves are done one after the other. The draft saved on entering Revisione and «Salva e Chiudi» can start together: both would read the same history and the second would
// be refused by the server as if somebody else had saved. Queued, the second one reads the history the first one wrote.
let queue = Promise.resolve();
const step0 = (onStep, name) => { try { onStep?.(name); } catch { /* vedi sopra */ } };
// `onStep` (facoltativo) riceve la fase in corso: 'waiting' (un altro salvataggio e' ancora in corso), 'history', 'offer', 'revision'. Serve solo a mostrare l'avanzamento.
export function saveInitiativeSnapshot(body, context, saveOffer, onStep) {
  step0(onStep, 'waiting');
  const run = queue.then(() => saveNow(body, context, saveOffer, onStep));
  queue = run.catch(() => {});
  return run;
}

async function saveNow(body, context, saveOffer, onStep) {
  const step = name => { try { onStep?.(name); } catch { /* mostrare l'avanzamento non deve mai far fallire un salvataggio */ } };
  const code = String(body.payload.initiative.code || '').trim();
  if (!code) throw new Error('Inserisci il GOTO per salvare offerta e storico insieme.');
  const path = `${encodeURIComponent(code)}/revisions`;
  step('history');
  const history = await workspaceRequest(path);
  const current = history[0] ? JSON.parse(history[0].payload) : {};
  const matching = context?.goto === code && context.version > 0;
  const latest = history[0]?.version || 0;
  if (matching && context.version !== latest && !(context.version < latest && ownRevisionsSince(history, context))) throw new Error(conflictMessage(history, context));
  const analysis = matching ? context.analysis : current;
  const state = { ...analysis, title: body.payload.initiative.title || analysis.title || code,
    system: body.payload.initiative.system || analysis.system || '', estimate: body.payload };
  // Save offer first. A later revision failure is explicitly a partial save.
  step('offer');
  const offer = await saveOffer(body);
  const offerPayload = typeof offer.payload === 'string' ? JSON.parse(offer.payload) : offer.payload;
  if (!offerPayload || !verifiedPlanSnapshot(body.payload.developmentPlans, offerPayload.developmentPlans))
    throw new Error('Il server non ha confermato le schede dell’offerta. La pagina rimane aperta: non ricaricare.');
  step('revision');
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
