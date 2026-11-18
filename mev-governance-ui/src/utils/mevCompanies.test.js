import { parseSocieta, companyForMark, resolveMandataryAndPartners } from './mevCompanies';

// La tabella «RTI & SUBCO» di PRODUZIONE, com'e' davvero: la riga 2 e' una SUBCO, IET e' la riga 3.
const PROD = [
  { id: 1, ruolo: 'Mandataria', societa: 'Capgemini Italia S.p.A.' }, { id: 2, ruolo: 'SUBCO', societa: 'Levia HUB S.p.A.' },
  { id: 3, ruolo: 'Mandante', societa: 'IET' }, { id: 4, ruolo: 'SUBCO', societa: 'Logica Informatica S.r.L.' },
];
// Quella di DEV: la riga 2 e' IET, e ci sono altre righe (una seconda Mandataria e una Mandante in piu').
const DEV = [
  { id: 1, ruolo: 'Mandataria', societa: 'Capgemini Italia S.p.A.' }, { id: 2, ruolo: 'Mandante', societa: 'IET' }, { id: 3, ruolo: 'SUBCO', societa: 'Levia HUB S.p.A.' },
  { id: 4, ruolo: 'SUBCO', societa: 'Logica Informatica S.r.L.' }, { id: 5, ruolo: 'Mandataria', societa: 'Capgemini Italia S.p.A.' }, { id: 6, ruolo: 'Mandante', societa: 'Pippo S.r.L.' },
];

describe('the «x» of the Excel columns Capgemini and IET', () => {
  test('in PRODUCTION a «x» in IET is IET, not the SUBCO that happens to be on row 2 (the reported bug)', () => {
    expect(resolveMandataryAndPartners('x', 'x', PROD)).toEqual(['Capgemini Italia S.p.A.', 'IET']);
    expect(resolveMandataryAndPartners('x', 'x', PROD)).not.toContain('Levia HUB S.p.A.');
  });
  test('the real row of PRODUCTION (GoTo 142379): the list in Capgemini already holds both, the «x» of IET adds nothing and does not bring in Levia HUB', () => {
    expect(resolveMandataryAndPartners('["Capgemini Italia S.p.A.","IET"]', 'x', PROD)).toEqual(['Capgemini Italia S.p.A.', 'IET']);
  });
  test('the other rows of PRODUCTION: Capgemini only, as before', () => {
    expect(resolveMandataryAndPartners('x', '', PROD)).toEqual(['Capgemini Italia S.p.A.']);
    expect(resolveMandataryAndPartners('Capgemini Italia S.p.A.', '', PROD)).toEqual(['Capgemini Italia S.p.A.']);
    expect(resolveMandataryAndPartners('x', null, PROD)).toEqual(['Capgemini Italia S.p.A.']);
  });
  test('the same «x» gives the same answer whatever the order of the RTI rows (DEV has IET on row 2)', () => {
    expect(resolveMandataryAndPartners('x', 'x', DEV)).toEqual(['Capgemini Italia S.p.A.', 'IET']);
    expect(resolveMandataryAndPartners('x', 'x', [...PROD].reverse())).toEqual(['Capgemini Italia S.p.A.', 'IET']);
  });
  test('a SUBCO is never taken for a Mandante or a Mandataria, even if it is the only row of that number', () => {
    const onlySubco = [{ id: 1, ruolo: 'SUBCO', societa: 'Solo Subco' }, { id: 2, ruolo: 'SUBCO', societa: 'Altra Subco' }];
    expect(resolveMandataryAndPartners('x', 'x', onlySubco)).toEqual(['Capgemini Italia S.p.A.', 'IET']);
  });
  test('without the RTI table the fallback names are used', () => {
    expect(resolveMandataryAndPartners('x', 'x', [])).toEqual(['Capgemini Italia S.p.A.', 'IET']); expect(resolveMandataryAndPartners('x', 'x', undefined)).toEqual(['Capgemini Italia S.p.A.', 'IET']);
  });
  test('the column IET takes the company named IET among the Mandanti, and any Mandante if IET is not there', () => {
    expect(companyForMark('iet', DEV)).toBe('IET'); expect(companyForMark('iet', [{ id: 9, ruolo: 'Mandante', societa: 'Pippo S.r.L.' }])).toBe('Pippo S.r.L.');
    expect(companyForMark('iet', [{ id: 1, ruolo: 'Mandataria', societa: 'X' }, { id: 6, ruolo: 'Mandante', societa: 'Pippo S.r.L.' }, { id: 7, ruolo: 'Mandante', societa: 'I&T' }])).toBe('I&T');
  });
  test('the column Capgemini takes the Mandataria', () => { expect(companyForMark('capgemini', DEV)).toBe('Capgemini Italia S.p.A.'); expect(companyForMark('capgemini', [{ id: 5, ruolo: 'Mandataria', societa: 'Altra Mandataria' }])).toBe('Altra Mandataria'); });
  test('names written out are kept as they are, lists are read, duplicates written differently are not repeated', () => {
    expect(resolveMandataryAndPartners('["Capgemini Italia S.p.A.","Pippo S.r.L."]', '', PROD)).toEqual(['Capgemini Italia S.p.A.', 'Pippo S.r.L.']);
    expect(resolveMandataryAndPartners('IET', 'x', PROD)).toEqual(['IET']); expect(resolveMandataryAndPartners('iet', 'x', PROD)).toEqual(['iet']);
    expect(resolveMandataryAndPartners('X', 'X', PROD)).toEqual(['Capgemini Italia S.p.A.', 'IET']); expect(resolveMandataryAndPartners(' x ', ' x ', PROD)).toEqual(['Capgemini Italia S.p.A.', 'IET']);
  });
  test('parseSocieta reads a JSON list, a single name, and nothing', () => { expect(parseSocieta('["A","B"]')).toEqual(['A', 'B']); expect(parseSocieta('A')).toEqual(['A']); expect(parseSocieta('')).toEqual([]); expect(parseSocieta(null)).toEqual([]); expect(parseSocieta('[non json')).toEqual(['[non json']); });
});
