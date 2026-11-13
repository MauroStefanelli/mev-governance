import { PROJECT_DECISIONS, decisionComplete } from './projectPackage';

const filled = value => typeof value === 'string' && value.trim().length > 0;

// Facts about one activity sheet. Every other number in the journey is derived from these.
export const hasSolution = plan => !!(plan && filled(plan.solution) && filled(plan.acceptance));
export const isDefined = plan => !!(plan && hasSolution(plan) && filled(plan.files));
export const hasProposal = plan => !!(plan?.aiProposal || plan?.aiDraft);
export const hasCode = plan => !!plan?.generatedCode?.files?.length;
export const isVerified = plan => plan?.status === 'Verificata';
export const hasEvidence = plan => filled(plan?.verification);

export const ACTIVITY_STATES = ['Da analizzare', 'Soluzione definita', 'Pronta per sviluppo', 'In sviluppo', 'Da verificare', 'Verificata'];
export const stateAllowed = (state, plan) => !((state === 'Verificata' && !hasEvidence(plan)) || (state === 'Pronta per sviluppo' && !isDefined(plan)));

export function activityNextStep(plan) {
  if (isVerified(plan)) return { phase: null, text: 'Completata e verificata.' };
  if (hasCode(plan)) return { phase: 'verifica', text: 'Applica i file in Visual Studio Code, esegui build e test e registra le evidenze nella fase Verifica.' };
  if (isDefined(plan)) return { phase: 'codice', text: 'Scheda definita: genera i file nella fase Codice oppure prosegui con la consegna.' };
  if (hasProposal(plan)) return { phase: null, text: 'Leggi la proposta AI e inseriscila nella scheda, poi completa i campi mancanti.' };
  return { phase: null, text: 'Prepara una proposta con l’AI oppure compila a mano file, soluzione e criteri di accettazione.' };
}

export const PHASES = [
  { id: 'fonti', label: 'Fonti', required: true, session: true,
    purpose: 'Collega il sistema da modificare ai suoi sorgenti, così AI e generazione di file lavorano sul codice giusto.',
    needs: ['Un applicativo associato al sistema dell’iniziativa', 'La cartella del repository, scelta una volta e conservata in questo browser'],
    produces: ['Il contesto di sorgenti per le proposte AI e per i file generati'],
    rules: ['La cartella scelta resta salvata in questo browser (una copia dei file di codice, senza credenziali): riselezionala solo per aggiornarla o integrarla.', 'Puoi compilare le schede anche senza cartella, ma senza proposte AI.'] },
  { id: 'schede', label: 'Schede', required: true,
    purpose: 'Una scheda tecnica per ogni riga di dettaglio dell’offerta: dove intervenire, come e come si accetta il risultato.',
    needs: ['Le attività importate dal Configuratore', 'Idealmente la cartella dei sorgenti (per le proposte AI)'],
    produces: ['File coinvolti, soluzione tecnica e criteri di accettazione per ogni attività'],
    rules: ['Una scheda è “definita” quando ha file, soluzione e criteri.', '“Pronta per sviluppo” richiede una scheda definita.', 'La proposta AI non diventa mai una decisione da sola: la inserisci tu dopo averla letta.'] },
  { id: 'progetto', label: 'Progetto', required: false,
    purpose: 'Prepara la struttura del progetto e le decisioni da concordare con il team, soprattutto per un nuovo servizio.',
    needs: ['Nome, tipo e obiettivo tecnico', 'Le decisioni su runtime, contratti, errori, accessi e test'],
    produces: ['Uno ZIP di avvio con README, workspace VS Code, registro decisioni e piano di test'],
    rules: ['Una decisione è documentata solo con scelta, fonte e referente.', 'Le voci mancanti restano aperte: non scegliere una tecnologia senza conferma.', 'Il piano di test è una checklist non eseguita.'] },
  { id: 'codice', label: 'Codice', required: false,
    purpose: 'Genera file reali (codice o workflow) per un applicativo di destinazione, partendo da una scheda definita.',
    needs: ['Soluzione e criteri nella scheda', 'Applicativo, componente, stack e database del target', 'Gli originali completi se modifichi file esistenti'],
    produces: ['File proposti con originale a confronto, impronte e test suggeriti'],
    rules: ['Un target alla volta per attività.', 'Generato non significa compilato né collaudato: nulla viene scritto nel repository.', 'Una nuova generazione sostituisce quella precedente solo dopo conferma.'] },
  { id: 'consegna', label: 'Consegna', required: true,
    purpose: 'Raccoglie schede, interventi approvati e riferimenti al repository nel pacchetto per chi scrive il codice.',
    needs: ['Strumento, branch e comandi di test', 'Interventi approvati nell’offerta', 'Sviluppo salvato'],
    produces: ['ZIP della richiesta di modifica codice, piano di sviluppo e documento AI'],
    rules: ['Lo ZIP riporta ciò che vedi in pagina, anche se non ancora salvato.', 'L’app non scrive nel repository e non esegue build, test o deploy.'] },
  { id: 'verifica', label: 'Verifica', required: true,
    purpose: 'Registra le evidenze che il codice scritto soddisfa i criteri di accettazione.',
    needs: ['Il codice applicato e provato in Visual Studio Code', 'Comandi, esiti e commit'],
    produces: ['Attività verificate, con le evidenze conservate nella scheda'],
    rules: ['“Verificata” richiede evidenze: l’app non esegue i test, le registri tu.', 'Modificare una scheda verificata la riporta a “Da verificare”.'] },
];

const share = (done, total) => total ? done / total : 0;
const statusOf = (done, total) => (total > 0 && done >= total) ? 'complete' : done > 0 ? 'partial' : 'empty';

export function computeJourney({ activities, plans, preparation = {}, delivery = {}, applications = [], files = [], techProfile = null, approvedCount = 0, dirty = false, revision = 0 }) {
  const list = activities.map(({ key, number, item }) => ({ key, number, item, plan: plans[key] || {} }));
  const total = list.length;
  const defined = list.filter(a => isDefined(a.plan));
  const withSolution = list.filter(a => hasSolution(a.plan));
  const proposals = list.filter(a => hasProposal(a.plan));
  const coded = list.filter(a => hasCode(a.plan));
  const verified = list.filter(a => isVerified(a.plan));
  const repository = files.length > 0 || !!techProfile;
  const decisionsDone = PROJECT_DECISIONS.filter(([id]) => decisionComplete(preparation.decisions?.[id])).length;
  const projectDone = (filled(preparation.name) ? 1 : 0) + (filled(preparation.objective) ? 1 : 0) + decisionsDone;
  const projectTotal = 2 + PROJECT_DECISIONS.length;
  const saved = !dirty && revision > 0;
  const deliveryChecks = [
    ['Sviluppo salvato', saved], ['Interventi approvati nell’offerta', approvedCount > 0],
    ['Branch indicato', filled(delivery.branch)], ['Comandi di build e test indicati', filled(delivery.tests)],
  ];
  const deliveryDone = deliveryChecks.filter(([, ok]) => ok).length;
  const sourcesDone = (applications.length ? 1 : 0) + (repository ? 1 : 0);

  const data = {
    fonti: { done: sourcesDone, total: 2, status: statusOf(sourcesDone, 2),
      summary: repository ? 'Repository collegato' : applications.length ? 'Cartella da selezionare' : 'Nessun applicativo',
      missing: [!applications.length && 'Nessun applicativo associato al sistema dell’iniziativa', !repository && 'Cartella dei sorgenti non ancora salvata in questo browser'].filter(Boolean) },
    schede: { done: defined.length, total, status: statusOf(defined.length, total), extra: `${proposals.length} con proposta AI`,
      summary: total ? `${defined.length}/${total} definite` : 'Nessuna attività',
      missing: list.filter(a => !isDefined(a.plan)).map(a => a.number) },
    progetto: { done: projectDone, total: projectTotal, status: statusOf(projectDone, projectTotal), optional: true,
      summary: projectDone ? `${decisionsDone}/${PROJECT_DECISIONS.length} decisioni` : 'Non avviato',
      missing: [!filled(preparation.name) && 'nome del progetto', !filled(preparation.objective) && 'obiettivo tecnico', decisionsDone < PROJECT_DECISIONS.length && `${PROJECT_DECISIONS.length - decisionsDone} decisioni aperte`].filter(Boolean) },
    codice: { done: coded.length, total: withSolution.length, status: withSolution.length ? statusOf(coded.length, withSolution.length) : 'waiting', optional: true,
      summary: withSolution.length ? `${coded.length}/${withSolution.length} con file` : 'In attesa delle schede',
      missing: withSolution.filter(a => !hasCode(a.plan)).map(a => a.number) },
    consegna: { done: deliveryDone, total: deliveryChecks.length, status: statusOf(deliveryDone, deliveryChecks.length),
      summary: `${deliveryDone}/${deliveryChecks.length} controlli`, missing: deliveryChecks.filter(([, ok]) => !ok).map(([label]) => label), checks: deliveryChecks },
    verifica: { done: verified.length, total, status: statusOf(verified.length, total),
      summary: total ? `${verified.length}/${total} verificate` : 'Nessuna attività', missing: list.filter(a => !isVerified(a.plan)).map(a => a.number) },
  };
  const phases = PHASES.map(phase => ({ ...phase, ...data[phase.id], fraction: share(data[phase.id].done, data[phase.id].total) }));

  // The folder permission is lost on every reload: it only blocks the journey while no sheet has been defined yet.
  const pending = phases.find(phase => phase.required && phase.status !== 'complete' && !(phase.id === 'fonti' && defined.length > 0));
  const messages = {
    fonti: () => data.fonti.missing[0]?.startsWith('Nessun applicativo')
      ? 'Nessun applicativo collegato: nel Configuratore apri Risorse e configurazione → Applicativi e imposta il percorso dei sorgenti.'
      : 'Seleziona la cartella dei sorgenti: abilita le proposte AI e la generazione dei file.',
    schede: () => `Completa le schede: ${total - defined.length} su ${total} non hanno ancora file, soluzione e criteri. Inizia dall’attività ${data.schede.missing[0]}.`,
    consegna: () => `Prepara la consegna: manca ${data.consegna.missing.map(m => m.toLowerCase()).join(', ')}.`,
    verifica: () => `Registra le evidenze: ${total - verified.length} attività non sono ancora verificate.`,
  };
  const next = pending ? { phase: pending.id, label: pending.label, text: messages[pending.id]() } : null;
  const fractions = phases.filter(p => p.required && !p.session).map(p => p.fraction);
  return { phases, next, overall: fractions.length ? Math.round(100 * fractions.reduce((a, b) => a + b, 0) / fractions.length) : 0,
    counts: { total, defined: defined.length, proposals: proposals.length, coded: coded.length, verified: verified.length } };
}

// Compact summary for the initiative list, from a saved development record.
export function developmentSummary(payload, activityCount) {
  if (!payload) return null;
  const plans = Object.values(payload.plans || {});
  const defined = plans.filter(isDefined).length;
  const verified = plans.filter(isVerified).length;
  const state = activityCount > 0 && verified >= activityCount ? 'Verificato' : defined || verified ? 'In corso' : 'Avviato';
  return { defined, verified, total: activityCount, revision: Number(payload.revision) || 0, savedAt: payload.savedAt || '', state };
}
