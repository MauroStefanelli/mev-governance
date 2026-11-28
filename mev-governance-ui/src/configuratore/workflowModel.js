// Il workflow «passo dopo passo»: gli step da seguire, in ordine, e a che punto sei. LO STATO NON E' UNA SPUNTA A MANO: si calcola dai dati veri della pagina
// (documenti caricati, voci confermate, interventi confermati, voci nell'offerta, valutazione salvata, ...). Se i dati cambiano, il workflow cambia.
//
// Ogni step ha uno stato:
//   done     = fatto (la sua regola e' soddisfatta)
//   current  = e' IL PROSSIMO da fare (il primo non fatto e obbligatorio)
//   todo     = ancora da fare, dopo il prossimo
//   optional = facoltativo e non ancora fatto: si puo' saltare
//   blocked  = non si puo' ancora fare, e dice cosa manca prima
//   skipped  = facoltativo e saltato per scelta (non c'e' nulla da mostrare: serve solo nella Home se si volesse)
// Il «prossimo» e' sempre uno solo.

export const STATE_LABEL = { done: 'Fatto', current: 'Prossimo passo', todo: 'Da fare', optional: 'Facoltativo', blocked: 'In attesa' };

const has = value => typeof value === 'string' ? value.trim().length > 0 : !!value;

// -------------------------------------------------------------------------------------------------------------------------------------------------------------
// CONFIGURATORE · iniziativa NON importata da Excel: dall'iniziativa vuota all'offerta salvata, pronta per Sviluppo.
// `go` dice dove portare l'utente: { step: 1..4, section: id della sezione del passo 1 }.
export const CONFIGURATOR_STEPS = [
  { id: 'identify', title: 'Identifica l’iniziativa', where: 'Passo 1 · Dati iniziativa', go: { step: 1, section: 'dati' },
    what: 'Scrivi il Codice GOTO e il titolo, poi scegli l’applicativo con «+ Aggiungi applicativo…».',
    why: 'Il GOTO collega tutto il lavoro; l’applicativo dice all’AI su quale sistema lavorate.' },
  { id: 'documents', title: 'Carica i documenti', where: 'Passo 1 · Workspace documentale', go: { step: 1, section: 'documenti' }, optional: true,
    what: 'Trascina le email, le analisi e i requisiti ricevuti da Poste: l’AI li legge e li cita.',
    why: 'Se non hai documenti puoi saltare, ma l’AI avrà meno da cui partire.' },
  { id: 'rationales', title: 'Parla con l’AI e conferma i razionali', where: 'Passo 1 · Razionali e vincoli con l’AI', go: { step: 1, section: 'razionali' },
    what: 'Spiega perché servono gli interventi e conferma le voci proposte («Conferma»), o scrivine una a mano.',
    why: 'Solo le voci confermate guidano gli interventi, la soluzione e lo sviluppo.' },
  { id: 'interventions', title: 'Fatti proporre gli interventi', where: 'Passo 1 · Soluzione', go: { step: 1, section: 'soluzione' },
    what: 'Premi «Proponi gli interventi con l’AI», rivedi ogni scheda e premi «Conferma l’intervento».',
    why: 'Confermando, le voci di catalogo dell’intervento entrano da sole nell’offerta.' },
  { id: 'solution', title: 'Descrivi la soluzione', where: 'Passo 1 · Soluzione', go: { step: 1, section: 'soluzione' }, optional: true,
    what: 'Per ogni intervento compila «Soluzione proposta» e gli altri campi, poi «Salva soluzione».',
    why: 'Produce il file «Scarica MD per Visual Studio Code» per chi sviluppa.' },
  { id: 'offer', title: 'Controlla l’offerta', where: 'Passo 3 · Offerta', go: { step: 3 },
    what: 'Controlla tipo, complessità, quantità e prezzi delle voci; imposta sconto, contingenza e TOW.',
    why: 'Qui l’offerta prende forma: il totale dipende da questi valori.' },
  { id: 'save', title: 'Salva la valutazione', where: 'Passo 4 · Revisione', go: { step: 4 },
    what: 'Controlla i totali e premi «Salva valutazione» (serve il Codice GOTO).',
    why: 'Senza il salvataggio l’iniziativa non compare in Sviluppo.' },
  { id: 'handoff', title: 'Passa a Sviluppo', where: 'Passo 4 · Revisione', go: { step: 4 }, final: true,
    what: 'Premi «Salva e vai a Sviluppo →»: l’iniziativa si apre nell’elenco di Sviluppo con una scheda per ogni voce.',
    why: 'È il punto in cui i dati dell’offerta diventano lavoro per chi scrive il codice.' },
];

// `facts` = i dati veri della pagina:
//   code, title, systemChosen(bool: applicativo scelto o sistema presente)
//   documents (numero), confirmedRationales (numero), proposedPending (voci proposte non decise)
//   interventionsConfirmed, interventionsProposed (da confermare), catalogReady(bool)
//   solutionFilled, solutionTotal
//   offerItems (numero di voci nell'offerta), offerTotal (euro), offerVisited(bool)
//   saved (valutazione salvata e senza modifiche), hasChanges, canEdit
export function configuratorFlow(facts = {}) {
  const f = { documents: 0, confirmedRationales: 0, interventionsConfirmed: 0, interventionsProposed: 0, solutionFilled: 0, solutionTotal: 0, offerItems: 0, ...facts };
  const identified = (has(f.code) || has(f.title)) && !!f.systemChosen;
  const rule = {
    identify: { done: identified, detail: identified ? `${f.code || f.title}${f.systemChosen ? ' · applicativo scelto' : ''}` : [!(has(f.code) || has(f.title)) && 'manca il GOTO o il titolo', !f.systemChosen && 'manca l’applicativo'].filter(Boolean).join(' · '), blockedBy: null },
    documents: { done: f.documents > 0, detail: f.documents > 0 ? `${f.documents} ${f.documents === 1 ? 'documento caricato' : 'documenti caricati'}` : 'nessun documento', blockedBy: !(has(f.code) || has(f.title)) ? 'identifica prima l’iniziativa' : null },
    rationales: { done: f.confirmedRationales > 0, detail: f.confirmedRationales > 0 ? `${f.confirmedRationales} ${f.confirmedRationales === 1 ? 'voce confermata' : 'voci confermate'}` : f.proposedPending > 0 ? `${f.proposedPending} proposte da confermare` : 'nessuna voce confermata', blockedBy: !(has(f.code) || has(f.title)) ? 'identifica prima l’iniziativa' : null },
    interventions: { done: f.interventionsConfirmed > 0, detail: f.interventionsConfirmed > 0 ? `${f.interventionsConfirmed} ${f.interventionsConfirmed === 1 ? 'intervento confermato' : 'interventi confermati'}` : f.interventionsProposed > 0 ? `${f.interventionsProposed} da confermare` : 'nessun intervento',
      blockedBy: f.confirmedRationales === 0 ? 'servono prima voci confermate' : !f.catalogReady ? 'scegli contratto e lotto del catalogo (passo Offerta)' : null },
    solution: { done: f.solutionTotal > 0 && f.solutionFilled >= f.solutionTotal, detail: f.solutionTotal > 0 ? `${f.solutionFilled} di ${f.solutionTotal} descritti` : 'nessun intervento da descrivere', blockedBy: f.interventionsConfirmed === 0 && f.solutionTotal === 0 ? 'servono prima gli interventi confermati' : null },
    offer: { done: f.offerItems > 0 && !!f.offerVisited, detail: f.offerItems > 0 ? `${f.offerItems} ${f.offerItems === 1 ? 'voce' : 'voci'}${f.offerTotal ? ` · ${f.offerTotal}` : ''}${f.offerVisited ? '' : ' · da controllare'}` : 'nessuna voce nell’offerta', blockedBy: f.offerItems === 0 ? 'servono voci nell’offerta: conferma almeno un intervento' : null },
    save: { done: !!f.saved, detail: f.saved ? 'valutazione salvata' : f.hasChanges ? 'modifiche non salvate' : 'non ancora salvata', blockedBy: f.offerItems === 0 ? 'l’offerta è vuota' : !has(f.code) ? 'manca il Codice GOTO' : null },
    handoff: { done: !!f.handedOff, detail: f.handedOff ? 'aperta in Sviluppo' : f.saved ? 'pronta per Sviluppo' : 'si fa dopo il salvataggio', blockedBy: !f.saved ? 'salva prima la valutazione' : null },
  };
  return buildFlow(CONFIGURATOR_STEPS, rule);
}

// Dallo step in un elenco con lo stato di ognuno. Il PROSSIMO e' il primo step obbligatorio non fatto. Se quello e' in attesa di qualcosa, non si finge che sia pronto: resta «In attesa»
// e dice cosa manca (`blockedBy`); in quel caso il prossimo e' comunque l'obbligatorio bloccato, e `next.blocked` lo segnala, cosi' la schermata mostra «cosa fare per sbloccarlo».
// I facoltativi non diventano mai «prossimo»: sono suggeriti, non richiesti.
export function buildFlow(steps, rule) {
  const list = steps.map(step => ({ ...step, done: !!rule[step.id].done, detail: rule[step.id].detail || '', blockedBy: rule[step.id].blockedBy || null }));
  // Un passo «finale» (per esempio «Passa a Sviluppo», che chiude la pagina) non conta nel totale e non puo' mai risultare fatto da dentro: diventa il prossimo quando tutti gli obbligatori sono fatti.
  const required = list.filter(step => !step.optional && !step.final);
  const firstRequired = required.find(step => !step.done);
  const finalStep = !firstRequired ? list.find(step => step.final && !step.done && !step.blockedBy) : null;
  const currentId = firstRequired ? firstRequired.id : finalStep ? finalStep.id : null;
  const out = list.map(step => {
    let state;
    if (step.done) state = 'done';
    else if (step.id === currentId && !step.blockedBy) state = 'current';
    else if (step.blockedBy) state = 'blocked';
    else if (step.optional) state = 'optional';
    else state = 'todo';
    return { ...step, state, isNext: step.id === currentId };
  });
  const requiredSteps = out.filter(step => !step.optional && !step.final); const requiredDone = requiredSteps.filter(step => step.done).length;
  const next = out.find(step => step.isNext) || null;
  return { steps: out, next, done: out.filter(step => step.done).length, total: out.length, requiredDone, requiredTotal: requiredSteps.length, percent: requiredSteps.length ? Math.round(100 * requiredDone / requiredSteps.length) : 0, complete: requiredSteps.length > 0 && requiredDone === requiredSteps.length };
}

// -------------------------------------------------------------------------------------------------------------------------------------------------------------
// SVILUPPO · dall'iniziativa valutata al codice verificato. Lo stato viene da `computeJourney` (developmentJourney.js), la stessa fonte della barra delle fasi: i due non possono dirsi cose diverse.
// `go` = { phase } della barra delle fasi.
export const DEVELOPMENT_STEPS = [
  { id: 'open', title: 'Apri l’iniziativa', where: 'Elenco · Iniziative valutate', go: { phase: null },
    what: 'Cerca la valutazione e cliccala. Compare solo se è stata salvata nel Configuratore e ha delle voci nell’offerta.',
    why: 'Sviluppo crea una scheda per ogni voce dell’offerta salvata.' },
  { id: 'sources', title: 'Collega i sorgenti', where: 'Fase 1 · Fonti', go: { phase: 'fonti' },
    what: 'Controlla l’applicativo e premi «Seleziona cartella sorgenti» per scegliere il repository sul tuo computer.',
    why: 'Le proposte AI delle schede leggono il codice da quella cartella.' },
  { id: 'cards', title: 'Compila le schede', where: 'Fase 2 · Schede', go: { phase: 'schede' },
    what: 'Per ogni attività: «Prepara scheda con AI», poi «Inserisci bozza nella scheda» e completa file, soluzione e criteri.',
    why: 'Una scheda è definita solo con file, soluzione e criteri: la proposta AI da sola non basta.' },
  { id: 'project', title: 'Prepara il progetto di avvio', where: 'Fase 3 · Progetto', go: { phase: 'progetto' }, optional: true,
    what: 'Per un nuovo servizio: nome, obiettivo e le 10 decisioni, poi «Genera progetto di avvio ZIP».',
    why: 'Utile per un nuovo servizio o una Logic App; per una modifica a codice esistente si può saltare.' },
  { id: 'code', title: 'Fai generare il codice', where: 'Fase 4 · Codice', go: { phase: 'codice' }, optional: true,
    what: 'In una scheda definita compila il target e premi «Genera codice / workflow per questa attività», poi «Conserva artefatti nella scheda».',
    why: 'Facoltativo: produce file proposti da confrontare con gli originali. L’app non scrive nel repository.' },
  { id: 'save', title: 'Salva lo sviluppo', where: 'In alto · Salva sviluppo', go: { phase: null, save: true },
    what: 'Premi «Salva sviluppo»: schede, progetto e consegna si conservano sul server.',
    why: 'La fase Consegna richiede lo sviluppo salvato.' },
  { id: 'delivery', title: 'Prepara la consegna', where: 'Fase 5 · Consegna', go: { phase: 'consegna' },
    what: 'Scegli lo strumento, scrivi «Branch suggerito» e «Compilazione e test», poi «Genera ZIP richiesta modifica codice».',
    why: 'Lo ZIP è il pacchetto da dare a chi scrive il codice in Visual Studio Code.' },
  { id: 'verify', title: 'Registra le evidenze', where: 'Fase 6 · Verifica', go: { phase: 'verifica' },
    what: 'Dopo aver applicato e provato il codice, scrivi le «Evidenze di verifica» e imposta «Verificata». Poi «Salva sviluppo».',
    why: 'L’app non esegue i test: «Verificata» è una tua dichiarazione, con le evidenze.' },
];

// `journey` = il risultato di computeJourney; `facts` = { activities (numero), saved (bool), opened (sempre vero dentro un'iniziativa) }.
export function developmentFlow(journey, facts = {}) {
  const phase = id => (journey?.phases || []).find(entry => entry.id === id) || { done: 0, total: 0, status: 'empty', fraction: 0, summary: '' };
  const total = facts.activities ?? journey?.counts?.total ?? 0;
  const sources = phase('fonti'); const cards = phase('schede'); const project = phase('progetto'); const code = phase('codice'); const delivery = phase('consegna'); const verify = phase('verifica');
  const rule = {
    open: { done: !!facts.opened, detail: total ? `${total} ${total === 1 ? 'attività' : 'attività'}` : 'nessuna attività', blockedBy: null },
    sources: { done: sources.status === 'complete' || (cards.status === 'complete'), detail: sources.summary || '', blockedBy: total === 0 ? 'l’offerta non ha voci: torna al Configuratore' : null },
    cards: { done: cards.status === 'complete', detail: cards.summary || '', blockedBy: total === 0 ? 'l’offerta non ha voci: torna al Configuratore' : null },
    project: { done: project.status === 'complete', detail: project.summary || 'Non avviato', blockedBy: null },
    code: { done: code.status === 'complete', detail: code.summary || '', blockedBy: code.status === 'waiting' ? 'servono prima le schede con soluzione e criteri' : null },
    save: { done: !!facts.saved, detail: facts.saved ? 'sviluppo salvato' : 'modifiche da salvare', blockedBy: null },
    delivery: { done: delivery.status === 'complete', detail: delivery.summary || '', blockedBy: !facts.saved ? 'salva prima lo sviluppo' : null },
    verify: { done: verify.status === 'complete', detail: verify.summary || '', blockedBy: cards.status !== 'complete' ? 'servono prima le schede definite' : null },
  };
  return buildFlow(DEVELOPMENT_STEPS, rule);
}
