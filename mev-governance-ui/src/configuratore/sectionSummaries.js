import { countByKind, confirmedEntries } from './rationaleKnowledge';

// One short line per section: the most important facts, readable without opening it.
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

export function rationaleFacts(entries) {
  const list = entries || [];
  const confirmed = confirmedEntries(list);
  const proposed = list.filter(entry => entry.status === 'proposta').length;
  const counts = countByKind(list);
  const facts = [];
  if (confirmed.length) facts.push(`${confirmed.length} confermate: ${counts.razionale} razionali · ${counts.vincolo} vincoli · ${counts.decisione} decisioni`);
  if (proposed) facts.push(plural(proposed, 'proposta da confermare', 'proposte da confermare'));
  if (!facts.length) facts.push('Nessuna voce ancora');
  return facts;
}

export function solutionFacts(progress) {
  if (!progress || !progress.total) return ['Nessun intervento nell’offerta'];
  const facts = [`${progress.filled} di ${progress.total} interventi descritti`];
  if (progress.orphans) facts.push(plural(progress.orphans, 'soluzione non più nell’offerta', 'soluzioni non più nell’offerta'));
  if (progress.revision) facts.push(`revisione ${progress.revision}`);
  return facts;
}

export function analysisFacts(context) {
  if (!context) return ['Nessuna revisione ancora'];
  const facts = [context.version ? `Revisione ${context.version}` : 'Nessuna revisione salvata'];
  facts.push(context.saved === false ? 'bozza con modifiche non salvate' : context.version ? 'salvata' : '');
  const status = context.analysis?.status; if (status && context.version) facts.push(status);
  return facts.filter(Boolean);
}

export function sourceFacts(selectedAppIds, applications, techProfile) {
  const apps = (selectedAppIds || []).map(id => (applications || []).find(app => String(app.id) === String(id))).filter(Boolean);
  if (!apps.length) return ['Nessun applicativo selezionato'];
  const facts = [apps.length <= 2 ? apps.map(app => app.name).join(', ') : plural(apps.length, 'applicativo', 'applicativi')];
  const profiled = apps.filter(app => app.techProfile).length + (techProfile && !apps.some(app => app.techProfile) ? 1 : 0);
  facts.push(profiled ? plural(profiled, 'con profilo tecnico', 'con profilo tecnico') : 'senza profilo tecnico');
  return facts;
}

export function knowledgeFacts({ rationale, libraryFacts, solutionProgress, importedInterventions, mappingCount, tow5Total }) {
  const facts = [];
  if (importedInterventions?.length) facts.push(`${importedInterventions.length} interventi · ${mappingCount} valorizzazioni`);
  const confirmed = confirmedEntries(rationale || []).length;
  if (confirmed) facts.push(plural(confirmed, 'voce confermata', 'voci confermate'));
  if (solutionProgress?.total) facts.push(`soluzione ${solutionProgress.filled}/${solutionProgress.total}`);
  if (libraryFacts) facts.push(libraryFacts);
  if (!facts.length) facts.push('Ancora nessuna conoscenza raccolta');
  return facts;
}

export const libraryFactsText = ({ documents = 0, memory = 0, searchable = 0 } = {}) => documents
  ? `${plural(documents, 'documento', 'documenti')}${memory ? ` · ${memory} memorie iniziali` : ''} · ${searchable} ricercabili` : 'Nessun documento';
