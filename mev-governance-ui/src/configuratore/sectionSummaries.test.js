import { rationaleFacts, solutionFacts, analysisFacts, sourceFacts, knowledgeFacts, libraryFactsText } from './sectionSummaries';

const entry = (kind, status) => ({ kind, status });

test('rationale: confirmed entries by kind and proposals waiting for a decision', () => {
  expect(rationaleFacts([])).toEqual(['Nessuna voce ancora']);
  expect(rationaleFacts(undefined)).toEqual(['Nessuna voce ancora']);
  expect(rationaleFacts([entry('razionale', 'confermata'), entry('vincolo', 'confermata'), entry('vincolo', 'confermata'), entry('decisione', 'proposta'), entry('razionale', 'scartata')]))
    .toEqual(['3 confermate: 1 razionali · 2 vincoli · 0 decisioni', '1 proposta da confermare']);
  expect(rationaleFacts([entry('razionale', 'proposta'), entry('vincolo', 'proposta')])).toEqual(['2 proposte da confermare']);
});

test('solution: how many interventions are described, orphans and revision', () => {
  expect(solutionFacts(null)).toEqual(['Nessun intervento nell’offerta']);
  expect(solutionFacts({ total: 0, filled: 0 })).toEqual(['Nessun intervento nell’offerta']);
  expect(solutionFacts({ total: 5, filled: 2, orphans: 0, revision: 0 })).toEqual(['2 di 5 interventi descritti']);
  expect(solutionFacts({ total: 5, filled: 5, orphans: 1, revision: 3 })).toEqual(['5 di 5 interventi descritti', '1 soluzione non più nell’offerta', 'revisione 3']);
  expect(solutionFacts({ total: 1, filled: 1, orphans: 2, revision: 1 })[1]).toBe('2 soluzioni non più nell’offerta');
});

test('shared analysis: revision, saved state and status', () => {
  expect(analysisFacts(null)).toEqual(['Nessuna revisione ancora']);
  expect(analysisFacts({ version: 0, saved: true })).toEqual(['Nessuna revisione salvata']);
  expect(analysisFacts({ version: 4, saved: true, analysis: { status: 'In analisi' } })).toEqual(['Revisione 4', 'salvata', 'In analisi']);
  expect(analysisFacts({ version: 4, saved: false })).toEqual(['Revisione 4', 'bozza con modifiche non salvate']);
});

test('source code: applications and whether a technical profile exists', () => {
  const apps = [{ id: 1, name: 'NPSO', techProfile: { x: 1 } }, { id: 2, name: 'IPER' }, { id: 3, name: 'BEP' }];
  expect(sourceFacts([], apps, null)).toEqual(['Nessun applicativo selezionato']);
  expect(sourceFacts(['1'], apps, null)).toEqual(['NPSO', '1 con profilo tecnico']);
  expect(sourceFacts(['2'], apps, null)).toEqual(['IPER', 'senza profilo tecnico']);
  expect(sourceFacts(['1', '2', '3'], apps, null)[0]).toBe('3 applicativi');
  expect(sourceFacts(['9'], apps, null)).toEqual(['Nessun applicativo selezionato']);
});

test('knowledge overview: only what exists is mentioned', () => {
  expect(knowledgeFacts({})).toEqual(['Ancora nessuna conoscenza raccolta']);
  expect(knowledgeFacts({ importedInterventions: [{}, {}], mappingCount: 7, rationale: [entry('vincolo', 'confermata')], solutionProgress: { total: 2, filled: 1 }, libraryFacts: '3 documenti' }))
    .toEqual(['2 interventi · 7 valorizzazioni', '1 voce confermata', 'soluzione 1/2', '3 documenti']);
});

test('document summary line', () => {
  expect(libraryFactsText()).toBe('Nessun documento');
  expect(libraryFactsText({ documents: 1, memory: 0, searchable: 1 })).toBe('1 documento · 1 ricercabili');
  expect(libraryFactsText({ documents: 5, memory: 2, searchable: 4 })).toBe('5 documenti · 2 memorie iniziali · 4 ricercabili');
});
