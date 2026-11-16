import { PARTS, mentionedPoints, analyse, needsSplitting, splitProposals, composeHint, isInterrupted, looksLikeCodeQuestion, CONTINUE_REQUEST } from './chatHints';

// La richiesta VERA che ha prodotto la risposta tagliata a 6.000 caratteri (con i suoi errori di battitura).
const REAL = "Vorrei che mi dessi un'analisi approfondita di impatto e una descrizione fuinzionale dell'as-is e del desiderata chiara per il PUNTO1 e che dessi un nome a coscuno dei punti che ti ho inviato così da entare poi in dettaglio su ciascuno di essi";

describe('which parts a request asks for', () => {
  test('the real request asks for as-is, to-be, impact and a name for each point', () => { expect(analyse(REAL).parts).toEqual(expect.arrayContaining(['asis', 'tobe', 'impact', 'names'])); expect(analyse(REAL).points).toEqual([1]); });
  test.each([
    ['as-is', 'Descrivi l’as-is del punto 2', 'asis'], ['as is', 'come funziona l’as is', 'asis'], ['stato attuale', 'qual è lo stato attuale', 'asis'], ['come funziona oggi', 'dimmi come funziona oggi la stampa', 'asis'],
    ['to-be', 'serve il to-be', 'tobe'], ['desiderata', 'il desiderata del cliente', 'tobe'], ['come deve funzionare', 'come deve funzionare dopo', 'tobe'],
    ['impatto', 'analisi di impatto', 'impact'], ['impatti', 'quali impatti', 'impact'], ['rischi', 'elenca i rischi', 'risks'], ['punti aperti', 'i punti aperti', 'risks'],
    ['test', 'quali test servono', 'test'], ['criteri di accettazione', 'i criteri di accettazione', 'test'],
  ])('%s is recognised', (_, text, id) => { expect(analyse(text).parts).toContain(id); });
  test('a name for each point is recognised however it is phrased, typos included', () => {
    const names = PARTS.find(part => part.id === 'names').pattern;
    ['che dessi un nome a coscuno dei punti', 'dai un nome a ciascun punto', 'dammi un nome per ogni punto', 'assegna un nome a ciascuno', 'dia un nome ai punti', 'dare un nome', 'attribuisci un nome', 'nome a ciascuno'].forEach(text => expect(names.test(text)).toBe(true));
  });
  test('an ordinary question mentioning "nome" or "dai" is not a request for names', () => {
    const names = PARTS.find(part => part.id === 'names').pattern;
    ['il nome del servizio', 'come si chiama il nome del campo', 'dove è il nome utente', 'dai uno sguardo al codice', 'dammi la regola'].forEach(text => expect(names.test(text)).toBe(false));
  });
  test('the points: "punto 1", "punti 1 e 2", "punti 1, 2 e 3", a numbered list; a version number is not a point', () => {
    expect(mentionedPoints('punto 1')).toEqual([1]); expect(mentionedPoints('punti 1 e 2')).toEqual([1, 2]); expect(mentionedPoints('punti 1, 2 e 3')).toEqual([1, 2, 3]); expect(mentionedPoints('PUNTO1')).toEqual([1]);
    expect(mentionedPoints('1. uno\n2. due')).toEqual([1, 2]); expect(mentionedPoints('versione 1.4 del 2 maggio')).toEqual([]); expect(mentionedPoints('')).toEqual([]); expect(mentionedPoints(null)).toEqual([]);
  });
});

describe('when a request is too wide for one answer', () => {
  test('the real request is', () => { expect(needsSplitting(REAL)).toBe(true); });
  test('two parts together are', () => { expect(needsSplitting('Fammi l’as-is e il to-be del punto 2')).toBe(true); });
  test('one part on several points is', () => { expect(needsSplitting('Fai l’analisi di impatto dei punti 1 e 2')).toBe(true); });
  test.each([
    'Dove si decide la stampa H7?', 'Quali condizioni impediscono la stampa dell’etichetta H7?', 'In quale punto del codice viene emesso ITEM_V_28?', 'Dimmi i rischi del punto 1', 'Fai l’analisi di impatto del punto 1', 'mi servono i test', 'ciao', '',
  ])('a simple request gets no advice: «%s»', text => { expect(needsSplitting(text)).toBe(false); expect(composeHint(text)).toBeNull(); });
  test('while the AI is answering there is no advice', () => { expect(composeHint(REAL, { busy: true })).toBeNull(); });
});

describe('the advice offered', () => {
  test('one proposal per part asked, in the order that works (names, as-is, to-be, impact, risks, test)', () => {
    expect(splitProposals(REAL).map(part => part.id)).toEqual(['names', 'asis', 'tobe', 'impact']);
    expect(splitProposals('test, rischi, impatto e as-is del punto 3').map(part => part.id)).toEqual(['asis', 'impact', 'risks', 'test']);
  });
  test('each proposal is a complete request for ONE part, about the right point', () => {
    const by = Object.fromEntries(splitProposals(REAL).map(part => [part.id, part.request]));
    expect(by.asis).toMatch(/funzionamento attuale \(as-is\) del PUNTO 1/); expect(by.tobe).toMatch(/\(to-be\) del PUNTO 1/); expect(by.impact).toMatch(/analisi di impatto del PUNTO 1/);
    expect(by.names).toMatch(/nome breve e univoco a ciascuno dei punti/); expect(by.tobe).toMatch(/senza ripetere l'as-is/);
  });
  test('several points are named in the proposal', () => { expect(splitProposals('as-is e impatto dei punti 1 e 3')[0].request).toContain('dei PUNTI 1 e 3'); expect(splitProposals('as-is e impatto dei punti 1, 2 e 3')[0].request).toContain('dei PUNTI 1, 2 e 3'); });
  test('no point named, none invented', () => { expect(splitProposals('fai as-is e to-be').map(part => part.request).join(' ')).not.toMatch(/PUNTO/); });
  test('the advice says why, and has a title and the proposals', () => {
    const hint = composeHint(REAL); expect(hint.title).toBe('Questa richiesta chiede più cose insieme'); expect(hint.body).toMatch(/poco spazio/); expect(hint.proposals).toHaveLength(4);
  });
  test('a proposal always carries a label for the button and a non-empty request', () => { splitProposals(REAL).forEach(part => { expect(part.label.length).toBeGreaterThan(5); expect(part.request.length).toBeGreaterThan(40); }); });
});

describe('an interrupted answer and the question about code', () => {
  test('an answer that ends with the interruption notice is recognised; the same words in the middle are not', () => {
    expect(isInterrupted('Testo.\n\n⚠ Risposta interrotta: il servizio AI ha raggiunto il limite.')).toBe(true);
    expect(isInterrupted('Testo normale che cita "Risposta interrotta" senza essere un avviso')).toBe(false); expect(isInterrupted('')).toBe(false); expect(isInterrupted(null)).toBe(false);
    expect(isInterrupted('Testo.\n\n⚠ Risposta accorciata: superava 20.000 caratteri.')).toBe(false);
  });
  test('the continuation request asks to go on from the exact point without repeating', () => { expect(CONTINUE_REQUEST).toMatch(/Continua dal punto esatto/); expect(CONTINUE_REQUEST).toMatch(/senza ripetere/); });
  test('a question about code is recognised', () => { ['dove è la regola di stampa', 'in quale punto del codice', 'quale classe valida il barcode', 'che condizioni ha il servizio'].forEach(text => expect(looksLikeCodeQuestion(text)).toBe(true)); expect(looksLikeCodeQuestion('ciao come stai')).toBe(false); });
});
