import { STATUS, checkMapping, checkProposed, proposalsFromAi, confirm, discard, restore, withText, withMapping, addMapping, removeMapping, canConfirm, asInterventions, mergeInterventions, counts, normalizeStored,
  isProposedId, nextProposedId, MAX_PROPOSED, MAX_MAPPINGS, MAX_QTY } from './proposedInterventions';
import REAL_CATALOG from './__fixtures__/lotto2Catalogo.json';   // il catalogo vero del lotto 2: 27 voci con i loro prezzi

// Una voce che il catalogo prezza solo per una complessita' e un tipo: per provare i casi limite (le voci vere sono tutte complete).
const PARTIAL = { id: 9001, nome: 'Voce solo realizzazione media', ambito: 'Backend', prezzi: { REALIZZAZIONE: { Medio: 1000 } } };
const CATALOG = [...REAL_CATALOG, PARTIAL];
const SPA = REAL_CATALOG.find(entry => entry.id === 236);      // Realizzazione Single Page Application: 4.800 € REALIZZAZIONE Complesso, 840 € MODIFICA Medio
const raw = (over = {}) => ({ title: 'Adeguare la stampa H7', description: 'Consentire la stampa immediata.', activity: 'Stampa etichetta', system: 'ILP', requirements: 'Punto 1', components: ['ILP_BACKEND_print-app'],
  mappings: [{ catalogId: 236, type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 2, component: 'ILP_frontend', technology: 'Angular', why: 'maschera di stampa' }], ...over });

describe('every catalogue row proposed is checked against the real catalogue of the lot', () => {
  test('a real row is accepted with its real name, ambit and price', () => {
    const row = checkMapping({ catalogId: 236, type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 2 }, CATALOG);
    expect(row).toMatchObject({ catalogId: 236, name: SPA.nome, ambit: 'Frontend', type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 2, unit: 4800, correction: null });
  });
  test('the price comes from the catalogue for the type and the complexity, never from the AI', () => {
    expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'Medio', qty: 1, unit: 1, price: 1, prezzo: 1 }, CATALOG).unit).toBe(840);
    expect(checkMapping({ catalogId: 236, type: 'REALIZZAZIONE', complexity: 'Semplice', qty: 1, unit: 999999 }, CATALOG).unit).toBe(1200);
  });
  test('a catalogue id that does not exist is refused, whatever the AI says about it', () => { expect(checkMapping({ catalogId: 99999, type: 'REALIZZAZIONE', complexity: 'Medio' }, CATALOG).rejected).toMatch(/non esiste nel catalogo di questo lotto/); expect(checkMapping({}, CATALOG).rejected).toMatch(/senza id/); expect(checkMapping(null, CATALOG).rejected).toBeTruthy(); });
  test('a type that is not MODIFICA or REALIZZAZIONE is refused', () => { expect(checkMapping({ catalogId: 236, type: 'DEMOLIZIONE' }, CATALOG).rejected).toMatch(/MODIFICA o REALIZZAZIONE/); expect(checkMapping({ catalogId: 236 }, CATALOG).rejected).toMatch(/MODIFICA o REALIZZAZIONE/); });
  test('the type is understood from the usual spellings', () => { expect(checkMapping({ catalogId: 236, type: 'realizzazione', complexity: 'Medio' }, CATALOG).type).toBe('REALIZZAZIONE'); expect(checkMapping({ catalogId: 236, type: 'Modifica evolutiva', complexity: 'Medio' }, CATALOG).type).toBe('MODIFICA'); });
  test('a type the catalogue has no price for is refused', () => { expect(checkMapping({ catalogId: 9001, type: 'MODIFICA', complexity: 'Medio' }, CATALOG).rejected).toMatch(/non ha un prezzo per MODIFICA/); });
  test('a complexity the catalogue does not price is corrected to the first one it prices, and says so', () => {
    const row = checkMapping({ catalogId: 9001, type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 1 }, CATALOG);
    expect(row.complexity).toBe('Medio'); expect(row.unit).toBe(1000); expect(row.correction).toMatch(/complessità «Complesso» non prevista per REALIZZAZIONE: usata «Medio»/);
  });
  test('the complexity is read whatever the case', () => { expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'COMPLESSO' }, CATALOG).complexity).toBe('Complesso'); expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'semplice' }, CATALOG).correction).toBeNull(); });
  test('a missing complexity is corrected and said', () => { const row = checkMapping({ catalogId: 236, type: 'MODIFICA' }, CATALOG); expect(row.complexity).toBe('Semplice'); expect(row.correction).toMatch(/\(vuota\)/); });
  test('the quantity is a whole number between 1 and the limit', () => {
    expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'Medio', qty: 0 }, CATALOG).qty).toBe(1); expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'Medio', qty: -5 }, CATALOG).qty).toBe(1);
    expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'Medio', qty: 2.6 }, CATALOG).qty).toBe(3); expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'Medio', qty: 5000 }, CATALOG).qty).toBe(MAX_QTY);
    expect(checkMapping({ catalogId: 236, type: 'MODIFICA', complexity: 'Medio', qty: 'abc' }, CATALOG).qty).toBe(1);
  });
  test('the id can come as a string and the component and the reason are kept, limited in size', () => {
    const row = checkMapping({ id: '236', type: 'MODIFICA', complexity: 'Medio', component: 'c'.repeat(500), why: 'w'.repeat(900) }, CATALOG);
    expect(row.catalogId).toBe(236); expect(row.component).toHaveLength(120); expect(row.why).toHaveLength(300);
  });
  test('every one of the 27 real rows can be proposed, with a price, for every type and complexity', () => {
    REAL_CATALOG.forEach(entry => ['MODIFICA', 'REALIZZAZIONE'].forEach(type => ['Semplice', 'Medio', 'Complesso'].forEach(complexity => {
      const row = checkMapping({ catalogId: entry.id, type, complexity, qty: 1 }, CATALOG); expect(row.rejected).toBeUndefined(); expect(row.unit).toBe(entry.prezzi[type][complexity]); expect(row.correction).toBeNull();
    })));
  });
});

describe('a proposed intervention', () => {
  test('is built from the AI answer with a stable id of its own, status "proposed" and the AI as author', () => {
    const item = checkProposed(raw(), CATALOG, []);
    expect(item).toMatchObject({ id: 'P-1', title: 'Adeguare la stampa H7', system: 'ILP', status: STATUS.PROPOSED, byAi: true, components: ['ILP_BACKEND_print-app'] }); expect(item.mappings).toHaveLength(1); expect(item.rejectedMappings).toEqual([]);
  });
  test('the id never collides with the ones already used', () => { expect(nextProposedId([{ id: 'P-1' }, { id: 'P-7' }, { id: '145480' }])).toBe('P-8'); expect(nextProposedId([])).toBe('P-1'); expect(isProposedId('P-3')).toBe(true); expect(isProposedId('3')).toBe(false); expect(isProposedId('P-x')).toBe(false); });
  test('an intervention without a title is refused', () => { expect(checkProposed(raw({ title: '  ' }), CATALOG).rejected).toMatch(/senza titolo/); });
  test('invented catalogue rows are dropped and reported, the good ones stay', () => {
    const item = checkProposed(raw({ mappings: [{ catalogId: 236, type: 'MODIFICA', complexity: 'Medio' }, { catalogId: 12345, type: 'MODIFICA', complexity: 'Medio' }, { catalogId: 239, type: 'XX' }] }), CATALOG);
    expect(item.mappings.map(row => row.catalogId)).toEqual([236]); expect(item.rejectedMappings).toHaveLength(2); expect(item.rejectedMappings.join(' ')).toMatch(/12345/);
  });
  test('the same row for the same type twice is kept once', () => { const item = checkProposed(raw({ mappings: [{ catalogId: 236, type: 'MODIFICA', complexity: 'Medio' }, { catalogId: 236, type: 'MODIFICA', complexity: 'Complesso' }] }), CATALOG); expect(item.mappings).toHaveLength(1); expect(item.rejectedMappings[0]).toMatch(/ripetuta/); });
  test('the same row as MODIFICA and as REALIZZAZIONE are two different rows', () => { expect(checkProposed(raw({ mappings: [{ catalogId: 236, type: 'MODIFICA', complexity: 'Medio' }, { catalogId: 236, type: 'REALIZZAZIONE', complexity: 'Medio' }] }), CATALOG).mappings).toHaveLength(2); });
  test('the number of rows is limited', () => { const many = REAL_CATALOG.slice(0, 20).map(entry => ({ catalogId: entry.id, type: 'MODIFICA', complexity: 'Medio' })); expect(checkProposed(raw({ mappings: many }), CATALOG).mappings).toHaveLength(MAX_MAPPINGS); });
  test('texts are limited and the components are cleaned and limited', () => {
    const item = checkProposed(raw({ title: 't'.repeat(400), description: 'd'.repeat(5000), components: Array.from({ length: 30 }, (_, i) => ` c${i} `) }), CATALOG);
    expect(item.title).toHaveLength(160); expect(item.description).toHaveLength(1200); expect(item.components).toHaveLength(10); expect(item.components[0]).toBe('c0');
  });
  test('italian keys (titolo, descrizione, attivita, sistema, requisiti) are understood too', () => { const item = checkProposed({ titolo: 'Titolo it', descrizione: 'Desc', attivita: 'Att', sistema: 'S', requisiti: 'R', mappings: raw().mappings }, CATALOG); expect(item).toMatchObject({ title: 'Titolo it', description: 'Desc', activity: 'Att', system: 'S', requirements: 'R' }); });
  test('the rationale ids it rests on are numbers only', () => { expect(checkProposed(raw({ rationaleIds: [3, '4', 'x', null, '', 0, -2, 2.5, true, [1], 5] }), CATALOG).rationaleIds).toEqual([3, 4, 5]); expect(checkProposed(raw({ rationaleIds: 'no' }), CATALOG).rationaleIds).toEqual([]); });
});

describe('what the server already dropped is not lost on the way to the team', () => {
  test('the interventions the server already refused are counted among the refused ones, together with the browser\'s', () => {
    const { accepted, rejected } = proposalsFromAi({ interventions: [raw(), { title: '' }], rejected: [{ title: 'Senza voci', reason: 'già proposto' }, { reason: 'x' }, null] }, CATALOG, []);
    expect(accepted).toHaveLength(1); expect(rejected.map(item => item.title)).toEqual(['Senza voci', '(senza titolo)', '(senza titolo)', '(senza titolo)']); expect(rejected[0].reason).toBe('già proposto');
    expect(proposalsFromAi({ interventions: [], rejected: 'no' }, CATALOG, []).rejected).toEqual([]);
  });
  test('the rows the server refused stay in the list of the ones that did not enter, together with the ones the browser refuses', () => {
    const item = checkProposed(raw({ mappings: [{ catalogId: 236, type: 'MODIFICA', complexity: 'Medio' }, { catalogId: 12345, type: 'MODIFICA' }], rejectedMappings: ['la voce di catalogo 77777 non esiste nel catalogo di questo lotto'] }), CATALOG);
    expect(item.rejectedMappings).toHaveLength(2); expect(item.rejectedMappings[0]).toMatch(/77777/); expect(item.rejectedMappings[1]).toMatch(/12345/);
  });
  test('through the whole path from the answer to the proposals', () => { expect(proposalsFromAi({ interventions: [raw({ rejectedMappings: ['voce X scartata dal server'] })] }, CATALOG, []).accepted[0].rejectedMappings).toEqual(['voce X scartata dal server']); });
  test('what comes with the answer is cleaned and limited', () => {
    expect(checkProposed(raw({ rejectedMappings: ['  ok  ', '', null, 'x'.repeat(900)] }), CATALOG).rejectedMappings.map(text => text.length)).toEqual([2, 300]);
    expect(checkProposed(raw({ rejectedMappings: Array.from({ length: 50 }, (_, i) => 'r' + i) }), CATALOG).rejectedMappings.length).toBeLessThanOrEqual(MAX_MAPPINGS * 2);
    expect(checkProposed(raw({ rejectedMappings: 'no' }), CATALOG).rejectedMappings).toEqual([]);
  });
});

describe('from the AI answer to the proposals for the team', () => {
  test('several interventions get consecutive ids and the rejected ones are listed with the reason', () => {
    const { accepted, rejected } = proposalsFromAi({ interventions: [raw(), raw({ title: 'Escludere CHA per PDDP' }), { title: '' }, raw({ title: 'Bloccare la partenza HU' })] }, CATALOG, []);
    expect(accepted.map(item => item.id)).toEqual(['P-1', 'P-2', 'P-3']); expect(rejected).toEqual([{ title: '(senza titolo)', reason: 'intervento senza titolo' }]);
  });
  test('the answer can be the list itself', () => { expect(proposalsFromAi([raw()], CATALOG, []).accepted).toHaveLength(1); expect(proposalsFromAi({}, CATALOG, []).accepted).toEqual([]); expect(proposalsFromAi(null, CATALOG, []).accepted).toEqual([]); });
  test('a title already proposed is not proposed again (case does not matter), but a discarded one can come back', () => {
    const current = [{ ...checkProposed(raw(), CATALOG, []), id: 'P-1' }, { ...checkProposed(raw({ title: 'Scartato' }), CATALOG, []), id: 'P-2', status: STATUS.DISCARDED }];
    const { accepted, rejected } = proposalsFromAi({ interventions: [raw({ title: 'ADEGUARE LA STAMPA H7' }), raw({ title: 'Scartato' })] }, CATALOG, current);
    expect(rejected).toEqual([{ title: 'Adeguare la stampa H7'.replace('Adeguare', 'ADEGUARE').replace('stampa', 'STAMPA'), reason: 'già proposto' }].map(row => ({ ...row, title: 'ADEGUARE LA STAMPA H7' }))); expect(accepted.map(item => item.id)).toEqual(['P-3']);
  });
  test('new ids continue after the existing ones', () => { const current = [{ ...checkProposed(raw(), CATALOG, []), id: 'P-4' }]; expect(proposalsFromAi({ interventions: [raw({ title: 'Altro' })] }, CATALOG, current).accepted[0].id).toBe('P-5'); });
  test('the total number of proposed interventions is limited', () => {
    const current = Array.from({ length: MAX_PROPOSED - 1 }, (_, i) => ({ ...checkProposed(raw({ title: 'T' + i }), CATALOG, []), id: 'P-' + (i + 1) }));
    const { accepted, rejected } = proposalsFromAi({ interventions: [raw({ title: 'Nuovo 1' }), raw({ title: 'Nuovo 2' })] }, CATALOG, current); expect(accepted).toHaveLength(1); expect(rejected[0].reason).toMatch(/oltre il limite/);
  });
});

describe('what the team does with a proposal', () => {
  const base = () => checkProposed(raw(), CATALOG, []);
  test('confirm, discard and restore change only the status', () => { expect(confirm(base()).status).toBe(STATUS.CONFIRMED); expect(discard(base()).status).toBe(STATUS.DISCARDED); expect(restore(discard(base())).status).toBe(STATUS.PROPOSED); expect(confirm(base()).title).toBe(base().title); });
  test('changing a confirmed intervention puts it back under review', () => {
    expect(withText(confirm(base()), 'title', 'Nuovo titolo')).toMatchObject({ title: 'Nuovo titolo', status: STATUS.PROPOSED }); expect(withText(base(), 'title', 'x').status).toBe(STATUS.PROPOSED); expect(withText(discard(base()), 'title', 'x').status).toBe(STATUS.DISCARDED);
  });
  test('changing a row (type, complexity, quantity) is checked again against the catalogue and the price follows', () => {
    const { item } = withMapping(base(), 0, { complexity: 'Semplice', qty: 3 }, CATALOG); expect(item.mappings[0]).toMatchObject({ complexity: 'Semplice', qty: 3, unit: 1200 });
    const modif = withMapping(base(), 0, { type: 'MODIFICA', complexity: 'Medio' }, CATALOG).item; expect(modif.mappings[0]).toMatchObject({ type: 'MODIFICA', unit: 840 });
  });
  test('a row change that the catalogue cannot price is refused and the intervention is left as it was', () => {
    const one = checkProposed(raw({ mappings: [{ catalogId: 9001, type: 'REALIZZAZIONE', complexity: 'Medio' }] }), CATALOG); const result = withMapping(one, 0, { type: 'MODIFICA' }, CATALOG);
    expect(result.problem).toMatch(/non ha un prezzo per MODIFICA/); expect(result.item).toBe(one);
  });
  test('changing a row of a confirmed intervention puts it back under review', () => { expect(withMapping(confirm(base()), 0, { qty: 5 }, CATALOG).item.status).toBe(STATUS.PROPOSED); });
  test('a row from the catalogue can be added, once, with the type of the others', () => {
    const added = addMapping(base(), REAL_CATALOG.find(entry => entry.id === 239), CATALOG); expect(added.item.mappings.map(row => row.catalogId)).toEqual([236, 239]); expect(added.item.mappings[1]).toMatchObject({ type: 'REALIZZAZIONE', complexity: 'Medio', qty: 1 });
    expect(addMapping(added.item, REAL_CATALOG.find(entry => entry.id === 239), CATALOG).problem).toMatch(/già tra le voci/);
  });
  test('rows are limited, and a row the catalogue cannot price for the type is refused', () => {
    let item = checkProposed(raw({ mappings: REAL_CATALOG.slice(0, MAX_MAPPINGS).map(entry => ({ catalogId: entry.id, type: 'MODIFICA', complexity: 'Medio' })) }), CATALOG); expect(item.mappings).toHaveLength(MAX_MAPPINGS);
    expect(addMapping(item, REAL_CATALOG[MAX_MAPPINGS], CATALOG).problem).toMatch(/Massimo 8/);
    const modif = checkProposed(raw({ mappings: [{ catalogId: 236, type: 'MODIFICA', complexity: 'Medio' }] }), CATALOG); expect(addMapping(modif, PARTIAL, CATALOG).problem).toMatch(/non ha un prezzo per MODIFICA/);
  });
  test('a row can be removed, and an intervention without rows cannot be confirmed', () => {
    const empty = removeMapping(base(), 0); expect(empty.mappings).toEqual([]); expect(canConfirm(empty)).toBe(false); expect(canConfirm(base())).toBe(true); expect(canConfirm(discard(base()))).toBe(false); expect(canConfirm({ ...base(), title: ' ' })).toBe(false);
  });
});

describe('proposed interventions seen by the rest of the app', () => {
  const proposed = () => [confirm(checkProposed(raw(), CATALOG, [])), { ...checkProposed(raw({ title: 'Solo proposto' }), CATALOG, []), id: 'P-2' }, { ...discard(checkProposed(raw({ title: 'Scartato' }), CATALOG, [])), id: 'P-3' }];
  test('only the confirmed ones become interventions: a proposal is not yet an intervention', () => { expect(asInterventions(proposed()).map(item => item.id)).toEqual(['P-1']); });
  test('they have exactly the shape of the interventions of the offer table, with the price and the total', () => {
    const [item] = asInterventions(proposed()); expect(item).toMatchObject({ id: 'P-1', titolo: 'Adeguare la stampa H7', descrizione: 'Consentire la stampa immediata.', attivita: 'Stampa etichetta', sistema: 'ILP', requisiti: 'Punto 1', proposed: true });
    expect(item.mappings[0]).toMatchObject({ catalogId: 236, name: SPA.nome, type: 'REALIZZAZIONE', complexity: 'Complesso', qty: 2, unit: 4800, total: 9600, componentApplication: 'ILP_frontend', technology: 'Angular', detailDescription: 'maschera di stampa', ambit: 'Frontend' });
  });
  test('merged after the ones of the table, and on a clash the table wins', () => {
    const imported = [{ id: '145480', titolo: 'Dalla tabella', mappings: [] }, { id: 'P-1', titolo: 'Ufficiale', mappings: [] }];
    expect(mergeInterventions(imported, proposed()).map(item => item.titolo)).toEqual(['Dalla tabella', 'Ufficiale']);   // P-1 e' gia' nella Tabella: resta quello, non si duplica
    expect(mergeInterventions([{ id: '145480', titolo: 'Dalla tabella', mappings: [] }], proposed()).map(item => item.id)).toEqual(['145480', 'P-1']);   // e i proposti vengono DOPO quelli della Tabella expect(mergeInterventions([], proposed()).map(item => item.id)).toEqual(['P-1']); expect(mergeInterventions(null, null)).toEqual([]);
  });
  test('counts by status', () => { expect(counts(proposed())).toEqual({ proposed: 1, confirmed: 1, discarded: 1, total: 3 }); expect(counts([])).toEqual({ proposed: 0, confirmed: 0, discarded: 0, total: 0 }); });
});

describe('what comes back from the server is put in order again', () => {
  test('a saved list survives the round trip', () => { const list = [confirm(checkProposed(raw(), CATALOG, []))]; expect(normalizeStored(JSON.parse(JSON.stringify(list)))).toEqual(list.map(item => ({ ...item, rejectedMappings: [] }))); });
  test('garbage, foreign ids, empty titles and bad statuses are removed or fixed', () => {
    const stored = normalizeStored([null, 5, { id: '145480', title: 'x' }, { id: 'P-1', title: '  ' }, { id: 'P-2', title: 'Buono', status: 'strano', mappings: [{ catalogId: 'x' }, { catalogId: 236, qty: 99999 }] }]);
    expect(stored).toHaveLength(1); expect(stored[0]).toMatchObject({ id: 'P-2', status: STATUS.PROPOSED }); expect(stored[0].mappings).toHaveLength(1); expect(stored[0].mappings[0].qty).toBe(MAX_QTY);
  });
  test('not a list gives an empty list', () => { expect(normalizeStored(null)).toEqual([]); expect(normalizeStored({})).toEqual([]); expect(normalizeStored('x')).toEqual([]); });
  test('the number of proposed interventions is limited', () => { expect(normalizeStored(Array.from({ length: 80 }, (_, i) => ({ id: 'P-' + (i + 1), title: 'T' + i })))).toHaveLength(MAX_PROPOSED); });
});
