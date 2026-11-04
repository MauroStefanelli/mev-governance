import { workspaceRequest } from '../services/mevService';

export async function saveImportedRevision(initiative, estimate, fileName) {
  const code = String(initiative.code || '').trim();
  if (!code) throw new Error('Inserisci un GOTO per creare lo storico dell’importazione.');
  const path = `${encodeURIComponent(code)}/revisions`;
  const history = await workspaceRequest(path);
  const previous = history[0] ? JSON.parse(history[0].payload) : {};
  return workspaceRequest(path, {
    expectedVersion: history[0]?.version || 0,
    reason: `Importazione Tabella di Offerta: ${fileName}`,
    state: { ...previous, title: initiative.title || previous.title || code, system: initiative.system || previous.system || '', estimate },
  });
}
