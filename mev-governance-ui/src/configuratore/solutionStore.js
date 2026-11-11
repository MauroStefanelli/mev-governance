import { getConfiguratoreRecords, upsertConfiguratoreRecord } from '../services/mevService';
import { validateSolution } from './solutionModel';

export const SOLUTION_ENTITY = 'initiative_solution';

const parse = record => {
  const payload = record?.payload ?? record?.Payload;
  if (typeof payload === 'string') { try { return JSON.parse(payload); } catch { return {}; } }
  return payload || {};
};
const clean = value => String(value ?? '').trim();

// One record per initiative of an environment, shared by everyone: the key mirrors how other initiative records are keyed.
export const solutionRecordKey = (contractId, code) => `${contractId}|solution|${encodeURIComponent(clean(code).toLowerCase())}`;

async function find(contractId, key) {
  const { records } = await getConfiguratoreRecords({ entity_type: SOLUTION_ENTITY, contract_id: contractId });
  return records.find(record => (record.record_key || record.recordKey) === key) || null;
}

export async function loadSolution(contractId, code) {
  if (!clean(code)) return { solution: { entries: {}, summary: '' }, revision: 0, exists: false };
  const record = await find(contractId, solutionRecordKey(contractId, code));
  if (!record) return { solution: { entries: {}, summary: '' }, revision: 0, exists: false };
  const payload = parse(record);
  return { solution: { entries: payload.entries || {}, summary: payload.summary || '', updatedBy: payload.updatedBy || '', updatedAt: payload.updatedAt || '' }, revision: Number(payload.revision) || 0, exists: true };
}

// Optimistic concurrency: the save is refused when a colleague saved after this user loaded, so nobody overwrites anyone.
export async function saveSolution({ contractId, lot, initiative, solution, revision, author }) {
  const code = clean(initiative?.code || initiative?.title);
  if (!code) throw new Error('Compila il codice GOTO o il titolo prima di salvare la soluzione.');
  const problem = validateSolution(solution);
  if (problem) throw new Error(problem);
  const key = solutionRecordKey(contractId, code);
  const latest = await find(contractId, key);
  const latestRevision = latest ? Number(parse(latest).revision) || 0 : 0;
  if (latestRevision !== revision) throw new Error('Un collega ha salvato la soluzione dopo la tua apertura. Il tuo testo resta nella pagina: copialo, ricarica la soluzione e riconcilia le modifiche prima di salvare di nuovo.');
  const payload = { version: 1, goto: code, title: clean(initiative?.title), lot: String(lot ?? ''), entries: solution.entries || {}, summary: solution.summary || '', revision: revision + 1, updatedBy: author || '', updatedAt: new Date().toISOString() };
  const saved = await upsertConfiguratoreRecord({ record_key: key, entity_type: SOLUTION_ENTITY, contract_id: contractId, lot_id: String(lot ?? ''), title: `${code} · Soluzione`, payload });
  const returned = parse(saved);
  // Success is declared only when the server returns exactly what was sent.
  if (returned.revision !== payload.revision || JSON.stringify(returned.entries || {}) !== JSON.stringify(payload.entries) || (returned.summary || '') !== payload.summary)
    throw new Error('Il server non ha confermato la soluzione salvata. La pagina resta aperta: non chiuderla e riprova.');
  return { revision: payload.revision, updatedBy: payload.updatedBy, updatedAt: payload.updatedAt };
}
