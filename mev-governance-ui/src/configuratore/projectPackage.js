import JSZip from 'jszip';
import { developmentActivities, developmentMarkdown } from './developmentActivityModel';

export const PROJECT_DECISIONS = [
  ['runtime', 'Tecnologia e runtime', 'Stack, versioni e hosting da concordare.'],
  ['input', 'Contratto di ingresso', 'Chiamante, protocollo, schema e richiesta di esempio.'],
  ['output', 'Contratto di uscita', 'Destinazione, schema e risposta di esempio.'],
  ['mapping', 'Regole dati e mapping', 'Origine dati, aggregazioni e campi obbligatori.'],
  ['response', 'Modalità di risposta', 'Sincrono/asincrono, callback ed esiti.'],
  ['duplicates', 'Idempotenza e duplicati', 'Chiave, durata, storage e concorrenza.'],
  ['errors', 'Errori e ritentativi', 'Timeout, KO funzionali, retry e backoff.'],
  ['access', 'Accesso e ambienti', 'Modalità di autenticazione e rete, senza credenziali.'],
  ['repository', 'Repository e consegna', 'Repository, branch/commit base e convenzioni.'],
  ['tests', 'Build e test', 'Strumenti, comandi e prerequisiti del progetto.'],
];
export const newProjectPreparation = () => ({ name: '', kind: 'Da definire', objective: '', decisions: {} });
export const decisionComplete = d => !!(d?.choice?.trim() && d?.source?.trim() && d?.owner?.trim());
const slug = value => String(value || 'iniziativa').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'iniziativa';

export async function buildProjectPackage({ initiative, preparation, items, plans, applications, workspaceContext, branch }) {
  if (!initiative.code?.trim() || !initiative.title?.trim()) throw new Error('Compila GOTO e titolo prima di generare il progetto.');
  if (!preparation.name?.trim() || !preparation.objective?.trim()) throw new Error('Inserisci nome del progetto e obiettivo tecnico.');
  const activities = developmentActivities(items);
  if (!activities.length) throw new Error('Aggiungi o importa almeno un’attività.');
  const context = workspaceContext?.goto === initiative.code.trim() ? workspaceContext : null;
  const manifest = { formatVersion: 1, generatedAt: new Date().toISOString(), status: 'preparazione-non-implementazione', initiative, preparation, branch: branch || '',
    analysisReference: { version: context?.version || 0, saved: context?.saved === true }, analysis: context?.analysis || null,
    openDecisions: PROJECT_DECISIONS.filter(([id]) => !decisionComplete(preparation.decisions?.[id])).map(([id, label]) => ({ id, label })),
    applications: applications.map(app => ({ name: app.name, repositoryReference: app.codeUrl || '' })),
    activities: activities.map(({ key, number, item }) => ({ key, number, interventionId: item.interventionId || '', description: item.detail?.detailDescription || item.reason || '', plan: plans[key] || {} })) };
  const zip = new JSZip();
  zip.file('progetto.json', JSON.stringify(manifest, null, 2));
  zip.file(`${slug(preparation.name)}.code-workspace`, JSON.stringify({ folders: [{ path: '.' }], settings: {} }, null, 2));
  zip.file('README.md', `# ${preparation.name}\n\nGOTO: ${initiative.code}\nTitolo: ${initiative.title}\nTipo: ${preparation.kind}\n\n## Obiettivo\n${preparation.objective}\n\n## Stato\nPreparazione, NON codice implementato o distribuibile. ${manifest.openDecisions.length} decisioni aperte. Analisi v${manifest.analysisReference.version}: ${manifest.analysisReference.saved ? 'salvata' : 'bozza/non salvata'}.\n\n## Visual Studio Code\n1. Estrai lo ZIP e apri il file .code-workspace per consultare le schede.\n2. Apri separatamente il repository reale oppure crea il progetto dopo aver concordato runtime e convenzioni. I sorgenti non sono copiati nello ZIP.\n3. Completa docs/DECISIONI.md e i contratti.\n4. Implementa una sola attività alla volta, controllando file ed evidenze sul checkout reale e preservando il lavoro concorrente.\n5. Esegui build/test del progetto reale e riporta esiti e commit nel configuratore.\n\nNessun endpoint, segreto, workflow cloud operativo o comando di deploy è generato.\n`);
  zip.file('docs/DECISIONI.md', '# Decisioni tecniche\n\nDocumentata non significa approvata automaticamente.\n\n' + PROJECT_DECISIONS.map(([id, label, hint]) => { const d = preparation.decisions?.[id] || {}; return `## ${id} — ${label}\n${hint}\nStato: ${decisionComplete(d) ? 'DOCUMENTATA — da validare con il team' : 'APERTA'}\nScelta: ${d.choice || 'Da definire'}\nFonte/versione: ${d.source || 'Da indicare'}\nReferente: ${d.owner || 'Da indicare'}\n`; }).join('\n'));
  zip.file('docs/ARCHITETTURA.md', `# Architettura candidata\n\n${preparation.objective}\n\n## Applicativi e riferimenti\n${manifest.applications.map(a => `- ${a.name}: ${a.repositoryReference || 'Da configurare'}`).join('\n')}\n\nI riferimenti non attestano la lettura dei sorgenti. Verificare le evidenze delle schede sul repository reale.\n\n## Analisi e fonti\n${JSON.stringify(manifest.analysis, null, 2)}\n`);
  zip.file('SCHEDE_SVILUPPO.md', developmentMarkdown(activities, plans, applications));
  zip.file('contracts/README.md', '# Contratti da concordare\nInserire ICD/schema/versione e request/response anonimizzate approvate. Nessun contratto operativo è dedotto automaticamente dall’Excel.\n');
  zip.file('fixtures/README.md', '# Dati di prova\nPreparare casi sintetici concordati: positivo, input invalido, valori limite, duplicati ed errori. Nessun fixture di produzione o payload inventato è incluso.\n');
  zip.file('src/README.md', '# Implementazione da realizzare\nCreare il codice dopo la validazione di schede, stack e decisioni. Nessuna modifica al repository è eseguita dal pacchetto.\n');
  zip.file('tests/piano-test.json', JSON.stringify({ status: 'casi-proposti-non-eseguiti', activities: manifest.activities.map(a => ({ key: a.key, interventionId: a.interventionId, description: a.description,
    acceptance: a.plan.acceptance || 'Da definire', files: a.plan.files || 'Da individuare', evidence: a.plan.verification || '', cases: ['Caso positivo conforme al requisito', 'Input invalido e valori limite', 'Errori dipendenze se applicabili', 'Regressione componenti condivisi'], result: 'NON ESEGUITO' })) }, null, 2));
  zip.file('docs/TEST_PLAN.md', '# Piano test\nI casi JSON sono checklist, non test eseguibili. Registrare per ogni attività: precondizioni, fixture/versione schema, comando, atteso, osservato, esito, autore, data e commit. Definire gli strumenti nella decisione tests prima di creare task eseguibili.\n');
  return { zip, name: `${slug(preparation.name)}-${slug(initiative.code)}.zip`, manifest };
}
