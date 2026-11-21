import lotto2 from './__fixtures__/lotto2Catalogo.json';
import { APP_DATA } from './appData';
import { LEVELS, criteriaOf, catalogForAi, inferType, inferComplexity, classify, thresholds, quantitiesIn, validProposal } from './catalogCriteria';
import { importedGapSuggestions } from './developmentActivityModel';
import { effectiveCatalog } from './offeredCatalog';

// Il catalogo del lotto 2 (prezzi) con i criteri reali di sistema (appData): le stesse 27 voci che usa il Configuratore.
const real = id => ({ ...lotto2.find(entry => entry.id === id), criteri: APP_DATA.cataloghi['2'].find(entry => entry.id === id).criteri });
const decide = (id, text) => { const r = classify(text, real(id), '2'); return `${r.type} ${r.complexity}${r.needsReview ? ' ?' : ''}`; };

describe('criteria of a voice', () => {
  test('are read from the system catalogue when the voice has none of its own (by id and lot)', () => {
    expect(criteriaOf({ id: 241 }, '2').Semplice).toBe('Da 1 a 10 tabelle');
    expect(criteriaOf({ id: 241 }, '1').Semplice).toBe('Da 1 a 10 tabelle');      // il lotto 1 ha i suoi criteri per la stessa voce
    expect(criteriaOf({ id: 241 }, '9')).toBeNull();      // un lotto che il catalogo di sistema non conosce non eredita quelli di un altro
    expect(criteriaOf({ id: 99999 }, '2')).toBeNull();      // una voce che non conosce non ne ha
  });
  test('the descriptions of the offered catalog win over the system ones', () => {
    expect(criteriaOf({ id: 241, descrizioni: { Semplice: 'fino a 3 tabelle', Medio: 'da 4 a 9', Complesso: 'oltre 9' } }, '2').Semplice).toBe('fino a 3 tabelle');
  });
  test('«N.A.», empty or dash levels are NOT criteria: a voice with only those has none', () => {
    expect(criteriaOf(real(453), '2')).toBeNull();
    expect(criteriaOf({ id: 1, criteri: { Semplice: 'N.A.', Medio: '', Complesso: ' - ' } }, '2')).toBeNull();
    expect(criteriaOf({ id: 1, criteri: { Semplice: 'N.A.', Medio: 'fino a 5 campi', Complesso: '' } }, '2')).toEqual({ Medio: 'fino a 5 campi' });
  });
  test('the catalogue sent to the AI has the description, the criteria and the types, and never the prices', () => {
    const sent = catalogForAi([real(241), real(453)], '2');
    expect(sent[0]).toMatchObject({ id: 241, nome: 'Realizzazione schema (DDL)', tipi: ['REALIZZAZIONE', 'MODIFICA'] });
    expect(sent[0].criteri.Complesso).toBe('Più di 30 tabelle');
    expect(sent[1].criteri).toBeNull();
    expect(JSON.stringify(sent)).not.toMatch(/prezzi|1200|2800/);
  });
});

describe('the type: change what exists, create what is new', () => {
  test.each([
    ['Modifica del servizio di stampa', 'MODIFICA'], ['Adeguamento della pagina esistente', 'MODIFICA'], ['Evoluzione del flusso', 'MODIFICA'], ['Correzione di un controllo', 'MODIFICA'],
    ['Nuovo servizio REST per i resi', 'REALIZZAZIONE'], ['Creazione di una nuova tabella', 'REALIZZAZIONE'], ['Realizzare un batch da zero', 'REALIZZAZIONE'],
  ])('«%s» is %s', (text, expected) => expect(inferType(text, real(239)).type).toBe(expected));
  test('a text that says nothing is REALIZZAZIONE with LOW confidence (to be verified), never a confident guess', () => {
    const r = inferType('Gestione dei resi lato magazzino', real(239));
    expect(r).toMatchObject({ type: 'REALIZZAZIONE', confidence: 'bassa' });
    expect(r.why).toMatch(/da verificare/);
  });
  test('a text that says both prefers what already exists, and asks to verify', () => {
    expect(inferType('Modifica della pagina e creazione di un nuovo campo', real(236))).toMatchObject({ type: 'MODIFICA', confidence: 'media' });
  });
  test('a voice that prices only one type has that type, whatever the text says', () => {
    const onlyNew = { id: 9, prezzi: { REALIZZAZIONE: { Medio: 1000 } } };
    expect(inferType('Modifica del programma', onlyNew)).toMatchObject({ type: 'REALIZZAZIONE', confidence: 'alta' });
  });
});

describe('the complexity: the highest level that is compatible and justified', () => {
  test('numeric thresholds: «da 1 a 10», «da 11 a 30», «più di 30» tabelle (voice 241, real criteria)', () => {
    expect(decide(241, 'Creare 5 nuove tabelle')).toBe('REALIZZAZIONE Semplice');
    expect(decide(241, 'Creazione di 12 tabelle')).toBe('REALIZZAZIONE Medio');
    expect(decide(241, 'Realizzare 35 tabelle di appoggio')).toBe('REALIZZAZIONE Complesso');
    expect(decide(241, 'Creare 10 tabelle')).toBe('REALIZZAZIONE Semplice');       // il confine appartiene al livello che lo dichiara
    expect(decide(241, 'Creare 11 tabelle')).toBe('REALIZZAZIONE Medio');
    expect(decide(241, 'Creare 31 tabelle')).toBe('REALIZZAZIONE Complesso');
  });
  test('«fino a N» is a ceiling: 2 topic is NOT Complesso just because Complesso also allows up to 3 (voice 992)', () => {
    expect(decide(992, 'Nuovo consumer da 1 topic')).toBe('REALIZZAZIONE Semplice');
    expect(decide(992, 'Nuovo consumer da 2 topic')).toBe('REALIZZAZIONE Medio');
    expect(decide(992, 'Nuovo consumer da 3 topic')).toBe('REALIZZAZIONE Complesso');
  });
  test('beyond every ceiling it is the top level, but it is flagged for verification', () => {
    expect(decide(992, 'Nuovo consumer da 7 topic')).toBe('REALIZZAZIONE Complesso ?');
  });
  test('the real wording of voice 236: «Numero Campi min uguale= 10», «>10 … min = 20», «> 20»', () => {
    expect(thresholds(real(236).criteri.Semplice)).toEqual([{ unit: 'campi', max: 10 }]);
    expect(thresholds(real(236).criteri.Medio)).toEqual([{ unit: 'campi', min: 11, max: 20 }]);
    expect(thresholds(real(236).criteri.Complesso)).toEqual([{ unit: 'campi', min: 21 }]);
    expect(decide(236, 'Nuova pagina con 8 campi')).toBe('REALIZZAZIONE Semplice');
    expect(decide(236, 'Nuova pagina con 20 campi')).toBe('REALIZZAZIONE Medio');
    expect(decide(236, 'Nuova pagina con 25 campi')).toBe('REALIZZAZIONE Complesso');
  });
  test('with several quantities in the text the HIGHEST level wins (the rule asked for)', () => {
    expect(decide(992, 'Nuovo consumer: legge da 1 topic e scrive su 3 tabelle')).toBe('REALIZZAZIONE Complesso');
  });
  test('an adjective between the number and the unit does not hide the quantity («5 nuove tabelle»)', () => {
    expect(quantitiesIn('Creare 5 nuove tabelle')).toEqual(expect.arrayContaining([{ n: 5, unit: 'tabelle' }]));
    expect(quantitiesIn('tre topic e dieci campi')).toEqual([{ n: 3, unit: 'topic' }, { n: 10, unit: 'campi' }]);
  });
  test('descriptive criteria (no numbers) are NOT guessed from words: lowest priced level, flagged, with the reason', () => {
    const r = classify('Nuova stored procedure che raccoglie resultset da diverse tabelle con logiche di business', real(242), '2');
    expect(r).toMatchObject({ type: 'REALIZZAZIONE', complexity: 'Semplice', needsReview: true });
    expect(r.note).toMatch(/descrittivi/);
    expect(r.note).toMatch(/da confermare leggendo i criteri/);
  });
  test('a voice without criteria says so and is flagged (SAP custom, 453)', () => {
    const r = classify('Modifica programma SAP custom', real(453), '2');
    expect(r).toMatchObject({ type: 'MODIFICA', complexity: 'Semplice', needsReview: true });
    expect(r.note).toMatch(/non ha criteri di complessita' scritti/);
  });
  test('the level is always one the voice prices for the chosen type', () => {
    const onlyComplex = { id: 9002, criteri: { Semplice: 'fino a 2 tabelle', Medio: 'fino a 5 tabelle', Complesso: 'oltre 5 tabelle' }, prezzi: { MODIFICA: { Complesso: 5000 } } };
    expect(classify('Modifica di 1 tabella', onlyComplex, '2').complexity).toBe('Complesso');
  });
  test('it never throws on empty input', () => {
    expect(classify('', real(241), '2')).toMatchObject({ type: 'REALIZZAZIONE' });
    expect(classify(undefined, undefined, '2').complexity).toBeDefined();
    expect(inferComplexity('x', real(241), [], '2')).toBeNull();
  });
  test('every voice of lot 2 gets a valid type and a complexity it really prices', () => {
    for (const entry of lotto2.map(e => real(e.id))) {
      const r = classify('Modifica di 4 tabelle e del servizio', entry, '2');
      expect(['MODIFICA', 'REALIZZAZIONE']).toContain(r.type);
      expect(Number(entry.prezzi[r.type][r.complexity])).toBeGreaterThan(0);
    }
    expect(LEVELS).toEqual(['Semplice', 'Medio', 'Complesso']);
  });
});

describe('what the AI writes is never taken as it is', () => {
  const e = real(241);
  test('a valid type and complexity are kept', () => expect(validProposal(e, { type: 'MODIFICA', complexity: 'Medio' })).toEqual({ type: 'MODIFICA', complexity: 'Medio', fixes: [] }));
  test('case and wording are understood («realizzazione», «Modifica evolutiva»)', () => {
    expect(validProposal(e, { type: 'realizzazione', complexity: 'complesso' })).toMatchObject({ type: 'REALIZZAZIONE', complexity: 'Complesso', fixes: [] });
    expect(validProposal(e, { type: 'Modifica evolutiva', complexity: 'Medio' }).type).toBe('MODIFICA');
  });
  test('a level that does not exist is replaced by the LOWEST priced one, and the correction is written', () => {
    const r = validProposal(e, { type: 'MODIFICA', complexity: 'Altissimo' });
    expect(r).toMatchObject({ type: 'MODIFICA', complexity: 'Semplice' });
    expect(r.fixes[0]).toMatch(/Altissimo.*non prezzata.*livello più basso/);
  });
  test('a type the voice does not price is replaced and the correction is written', () => {
    const onlyNew = { id: 9, prezzi: { REALIZZAZIONE: { Medio: 1000 } } };
    const r = validProposal(onlyNew, { type: 'MODIFICA', complexity: 'Medio' });
    expect(r).toMatchObject({ type: 'REALIZZAZIONE', complexity: 'Medio' });
    expect(r.fixes[0]).toMatch(/non prezzato/);
  });
  test('an empty answer gets a valid, flagged value', () => {
    const r = validProposal(e, {});
    expect(r.fixes.length).toBeGreaterThan(0); expect(['MODIFICA', 'REALIZZAZIONE']).toContain(r.type);
  });
});

describe('the step «Analizza e suggerisci» uses the catalogue details', () => {
  const entry = { ...real(241), nome: 'Realizzazione schema (DDL)' };
  test('missing voices found in the imported text get type and complexity from the criteria, with the reason', () => {
    const suggestions = importedGapSuggestions([{ id: 'I1', titolo: 'Nuova funzione', attivita: 'Realizzazione schema (DDL) con 12 tabelle per i resi', mappings: [] }], [entry], '2');
    expect(suggestions[0]).toMatchObject({ id: 241, selected: false, type: 'REALIZZAZIONE', complexity: 'Medio', needsReview: false });
    expect(suggestions[0].reason).toMatch(/12 tabelle rientrano nel criterio «Da 11 a 30 tabelle»/);
  });
  test('it is no longer always «Medio»: 4 tables is Semplice and an «adeguamento» is MODIFICA', () => {
    const s = importedGapSuggestions([{ id: 'I1', titolo: 'Adeguamento', attivita: 'Adeguamento Realizzazione schema (DDL) su 4 tabelle', mappings: [] }], [entry], '2')[0];
    expect(s).toMatchObject({ type: 'MODIFICA', complexity: 'Semplice' });
  });
  test('when nothing can be decided it is flagged for verification', () => {
    const s = importedGapSuggestions([{ id: 'I1', titolo: 'Schema', attivita: 'Realizzazione schema (DDL) per i resi', mappings: [] }], [entry], '2')[0];
    expect(s.needsReview).toBe(true);
    expect(s.reason).toMatch(/da verificare|da confermare/);
  });
  test('with the OFFERED catalog the descriptions of the offered voice are the criteria', () => {
    const offered = effectiveCatalog({ catalog: [entry], offeredCatalog: [{ id: 241, prezzi: entry.prezzi, descrizioni: { Semplice: 'fino a 3 tabelle', Medio: 'da 4 a 6 tabelle', Complesso: 'oltre 6 tabelle' } }] });
    const s = importedGapSuggestions([{ id: 'I1', titolo: 'Schema', attivita: 'Realizzazione schema (DDL) con 5 tabelle', mappings: [] }], offered, '2')[0];
    expect(s.complexity).toBe('Medio');
    expect(s.reason).toMatch(/da 4 a 6 tabelle/);
  });
});

describe('the three places where the AI reads the catalogue all get the details', () => {
  const fs = require('fs'); const path = require('path');
  const src = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
  test('second opinion: the context sends the criteria, the full description and the types (not only name and prices)', () => {
    const page = src('pages/ConfiguratorePage.js');
    expect(page).toMatch(/catalog: catalogForAi\(catalog, lot\)\.map/);
    expect(page).toMatch(/criteria:\s+c\.criteri/);
    expect(page).toMatch(/description: c\.descrizione/);
  });
  test('proposals from the rationale: the catalogue sent to the server carries the criteria and up to 700 characters of description', () => {
    const panel = src('configuratore/InterventionProposalsPanel.js');
    expect(panel).toMatch(/criteri: criteriaOf\(entry\) \|\| undefined/);
    expect(panel).toMatch(/slice\(0, 700\)/);
  });
  test('row review: the criteria come from the catalogue in use (offered or Archivio), not only from the built-in data', () => {
    const { detailReviewInput } = require('./offerDetailReview');
    const catalog = [{ id: 241, nome: 'Realizzazione schema (DDL)', ambito: 'Database', descrizione: 'x', descrizioni: { Semplice: 'fino a 3 tabelle', Medio: 'da 4 a 9', Complesso: 'oltre 9' }, prezzi: {} }];
    const input = detailReviewInput({ id: 241, type: 'REALIZZAZIONE', complexity: 'Medio', qty: 1, key: 'k' }, catalog, [], 'c', '2', 0);
    expect(input.catalogEntry.criteria).toEqual({ Semplice: 'fino a 3 tabelle', Medio: 'da 4 a 9', Complesso: 'oltre 9' });
    const noOwn = detailReviewInput({ id: 241, type: 'REALIZZAZIONE', complexity: 'Medio', qty: 1, key: 'k' }, [{ id: 241, nome: 'x', prezzi: {} }], [], 'c', '2', 0);
    expect(noOwn.catalogEntry.criteria.Medio).toBe('Da 11 a 30 tabelle');      // riserva: il catalogo di sistema
    const none = detailReviewInput({ id: 453, type: 'MODIFICA', complexity: 'Medio', qty: 1, key: 'k' }, [{ id: 453, nome: 'SAP', prezzi: {} }], [], 'c', '2', 0);
    expect(none.catalogEntry.criteria).toEqual({});      // «N.A.»: nessun criterio, non un criterio finto
  });
  test('the AI answer is applied through validProposal: a type or level without a price is corrected, not saved as it is', () => {
    expect(src('pages/ConfiguratorePage.js')).toMatch(/const checked = validProposal\(catalogItem, \{ type: p\.type, complexity: p\.complexity \}\)/);
    expect(src('pages/ConfiguratorePage.js')).toMatch(/Correzione automatica:/);
  });
  test('the step «Analizza e suggerisci» (no AI) decides with the criteria and shows why', () => {
    const page = src('pages/ConfiguratorePage.js');
    expect(page).toMatch(/const decision = classify\(requirementText \|\| source, c, lot\)/);
    expect(page).toMatch(/needsReview: decision\.needsReview/);
    expect(page).toMatch(/importedGapSuggestions\(interventions, selectedCatalog, lot\)/);
    expect(page).toMatch(/Criteri di complessità della voce/);
  });
});
