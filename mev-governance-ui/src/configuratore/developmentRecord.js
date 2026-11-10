import { getConfiguratoreRecords, upsertConfiguratoreRecord, getSharedApplications, rationaleRequest } from '../services/mevService';
import { verifiedPlanSnapshot } from './saveInitiativeSnapshot';
import { newProjectPreparation } from './projectPackage';
import { applicationsFor, applicationContextFor, applicationIdentity } from './configuratoreCore';

export const DEVELOPMENT_ENTITY = 'implementation_plan';
export const DEFAULT_DELIVERY = { tool: 'vscode', branch: '', notes: '', tests: '' };

export const parseRecordPayload = record => {
  const payload = record?.payload ?? record?.Payload;
  if (typeof payload === 'string') { try { return JSON.parse(payload); } catch { return {}; } }
  return payload || {};
};
export const initiativeIdentity = evaluation => String(evaluation?.initiative?.code || evaluation?.initiative?.title || '').trim();
export const developmentRecordKey = (contractId, lot, identity) => `${contractId}|${lot}|development|${encodeURIComponent(String(identity).trim().toLowerCase())}`;

async function findDevelopmentRecord(contractId, lot, key) {
  const { records } = await getConfiguratoreRecords({ entity_type: DEVELOPMENT_ENTITY, contract_id: contractId, lot_id: String(lot) });
  return records.find(record => (record.record_key || record.recordKey) === key) || null;
}

// Development data lives in its own record, so saving an offer can never overwrite it.
// Before the first save the plans saved earlier inside the evaluation are offered as a starting point.
export async function loadDevelopmentState(record) {
  const evaluation = { ...parseRecordPayload(record), recordKey: record.record_key || record.recordKey || '' };
  const identity = initiativeIdentity(evaluation);
  if (!identity) throw new Error('Questa valutazione non ha né GOTO né titolo: aprila nel Configuratore e completa l’identificazione.');
  const contractId = record.contract_id || evaluation.contractId;
  const lot = String(record.lot_id || evaluation.lot || '');
  const key = developmentRecordKey(contractId, lot, identity);
  const saved = await findDevelopmentRecord(contractId, lot, key);
  if (saved) {
    const payload = parseRecordPayload(saved);
    return { evaluation, identity, contractId, lot, key, revision: Number(payload.revision) || 0, source: 'saved',
      savedActivities: payload.activities || null, plans: payload.plans || {}, preparation: payload.preparation || newProjectPreparation(), delivery: { ...DEFAULT_DELIVERY, ...(payload.delivery || {}) } };
  }
  const legacy = evaluation.developmentPlans || {};
  return { evaluation, identity, contractId, lot, key, revision: 0, source: Object.keys(legacy).length ? 'legacy' : 'new', savedActivities: null,
    plans: legacy, preparation: evaluation.projectPreparation || newProjectPreparation(), delivery: { ...DEFAULT_DELIVERY } };
}

export async function saveDevelopmentState(loaded, { plans, preparation, delivery, activities }) {
  const latest = await findDevelopmentRecord(loaded.contractId, loaded.lot, loaded.key);
  const latestRevision = latest ? Number(parseRecordPayload(latest).revision) || 0 : 0;
  if (latestRevision !== loaded.revision) {
    throw new Error('Un collega ha salvato lo sviluppo di questa iniziativa dopo la tua apertura. Il tuo lavoro resta nella pagina: esporta o copia ciò che serve, riapri l’iniziativa e riconcilia le modifiche.');
  }
  const payload = { version: 1, goto: loaded.evaluation.initiative?.code || '', title: loaded.evaluation.initiative?.title || '', lot: loaded.lot,
    initiativeRecordKey: loaded.evaluation.recordKey || '', plans, preparation, delivery, activities, revision: loaded.revision + 1, savedAt: new Date().toISOString() };
  const saved = await upsertConfiguratoreRecord({ record_key: loaded.key, entity_type: DEVELOPMENT_ENTITY, contract_id: loaded.contractId, lot_id: loaded.lot,
    title: `${loaded.identity} · Sviluppo`, payload });
  const returned = parseRecordPayload(saved);
  const confirmed = returned.revision === payload.revision && verifiedPlanSnapshot(plans, returned.plans)
    && verifiedPlanSnapshot(preparation, returned.preparation) && verifiedPlanSnapshot(delivery, returned.delivery);
  if (!confirmed) throw new Error('Il server non ha confermato schede, progetto e consegna. La pagina resta aperta: non chiuderla e riprova.');
  return payload.revision;
}

// The Configuratore stores applications under the catalog contract chosen for the estimate
// (catalogSource), not under the environment contract code used to key the evaluation.
export const applicationScope = (evaluation, fallback) => {
  const source = evaluation?.catalogSource;
  return { contractId: source?.contractId || fallback.contractId, lot: String(source?.lot ?? fallback.lot) };
};

export async function loadApplications(contractId, lot) {
  const builtin = contractId === 'poste-tet-2025';
  try {
    const shared = await getSharedApplications(contractId, lot);
    if (shared?.length) return shared;
  } catch { /* use the saved local configuration below */ }
  let local = applicationsFor(contractId, lot, builtin);
  if (!local.length && builtin) local = applicationsFor(contractId, String(lot) === '1' ? '2' : '1', true);
  return local;
}

// Applications from both places the Configuratore may have saved them: the catalog scope of the
// estimate and the environment scope. Same application (code + name) is listed once, catalog scope first.
export async function loadApplicationsFor(evaluation, fallback) {
  const scope = applicationScope(evaluation, fallback);
  const sameScope = scope.contractId === fallback.contractId && scope.lot === String(fallback.lot);
  const lists = [await loadApplications(scope.contractId, scope.lot)];
  if (!sameScope) lists.push(await loadApplications(fallback.contractId, fallback.lot));
  const seen = new Set();
  return lists.flat().filter(app => { const id = applicationIdentity(app); if (seen.has(id)) return false; seen.add(id); return true; });
}

export const catalogFor = (contracts, appData, source) => {
  if (!source) return [];
  const contract = contracts.find(entry => entry.contractId === source.contractId);
  const lot = (contract?.lots || []).find(entry => entry.active !== false && String(entry.lotId) === String(source.lot));
  if (lot?.catalog?.length) return lot.catalog;
  return source.contractId === 'poste-tet-2025' ? (appData?.cataloghi || {})[String(source.lot)] || [] : [];
};

export const applicationsForInitiative = (evaluation, applications, lot) => applicationContextFor(evaluation.initiative?.system, applications, lot);

export const activitySignature = activities => activities.map(({ key, item }) => ({ key, interventionId: item.interventionId || '',
  description: String(item.detail?.detailDescription || item.reason || '').slice(0, 300) }));

// Plans are keyed by imported row. If the offer is imported again, a row can change meaning.
export function activityChanges(saved, current) {
  if (!Array.isArray(saved)) return { changed: [], added: [], removed: [] };
  const before = new Map(saved.map(entry => [entry.key, entry])); const now = new Map(current.map(entry => [entry.key, entry]));
  return { changed: current.filter(entry => before.has(entry.key) && (before.get(entry.key).description !== entry.description || before.get(entry.key).interventionId !== entry.interventionId)).map(entry => entry.key),
    added: current.filter(entry => !before.has(entry.key)).map(entry => entry.key), removed: saved.filter(entry => !now.has(entry.key)).map(entry => entry.key) };
}

// Short explanation shown when no application matches the system of the initiative.
export function applicationDiagnosis(system, applications, scope) {
  const where = `contratto «${scope.contractId}», lotto «${scope.lot}»`;
  if (!applications.length) return `Nel ${where} non risulta nessun applicativo configurato.`;
  return `Nel ${where} ci sono ${applications.length} applicativi (${applications.slice(0, 6).map(app => app.name).join(', ')}${applications.length > 6 ? '…' : ''}) ma nessuno corrisponde al sistema «${system || '—'}». Aggiungi il nome «${system || ''}» come alias dell’applicativo corretto, oppure crealo.`;
}

// Confirmed rationale and constraints of the initiative. Never blocks Sviluppo: if unavailable it says so.
export async function loadConfirmedKnowledge(code) {
  const value = String(code || '').trim();
  if (!value) return { entries: [], error: '' };
  try { return { entries: await rationaleRequest(`confirmed?goto=${encodeURIComponent(value)}`), error: '' }; }
  catch (e) { return { entries: [], error: e.message }; }
}
