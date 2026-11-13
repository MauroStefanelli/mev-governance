import { termsOf, informativeTerms, matches, partsOf, scoreFile, bestLine, CONFIG_FILE } from './sourceSearch';

describe('terms taken from a question', () => {
  test('short codes that name a rule are kept: H7, CHA, PDDP, LDV, ITA, HU, P1', () => {
    const terms = termsOf('Nel P1 dove sono le condizioni di stampa H7, l\'esclusione CHA per PDDP, la LDV ITA nell\'inserimento in HU?');
    ['p1', 'h7', 'cha', 'pddp', 'ldv', 'ita', 'hu', 'stampa', 'condizioni'].forEach(term => expect(terms).toContain(term));
  });
  test('common Italian and English words are dropped, so they cannot match every file', () => {
    const terms = termsOf('Dove sono le regole che il sistema usa per la stampa? What is the rule of the print?');
    ['dove', 'sono', 'le', 'che', 'il', 'per', 'la', 'what', 'is', 'the', 'of'].forEach(word => expect(terms).not.toContain(word));
    expect(terms).toEqual(expect.arrayContaining(['regole', 'sistema', 'stampa', 'rule', 'print']));
  });
  test('numbers alone are not terms, an accent does not matter', () => {
    expect(termsOf('versione 4 18 0 perché')).not.toContain('4'); expect(termsOf('validità')).toContain('validita'); expect(termsOf('perché')).toEqual([]);
  });
  test('an identifier is searched whole and by its parts', () => {
    expect(termsOf('PrintRulesH7')).toEqual(expect.arrayContaining(['printrulesh7', 'print', 'rules', 'h7']));
    expect(termsOf('ldv_ita-resolver')).toEqual(expect.arrayContaining(['ldv', 'ita', 'resolver']));
  });
  test('words typed by the user in "Cerca nel codice" are added to the question', () => {
    expect(termsOf('domanda', { extra: 'H7 PrintRules' })).toEqual(expect.arrayContaining(['domanda', 'h7', 'print', 'rules']));
  });
});

describe('matching', () => {
  test('a short term matches only as a whole token: "hu" is not in "should" or "human", "h7" is not in "h70"', () => {
    expect(matches(' should ', 'hu')).toBe(false); expect(matches(' human ', 'hu')).toBe(false); expect(matches(' h70 ', 'h7')).toBe(false);
    expect(matches('inserisci nella hu corretta', 'hu')).toBe(true); expect(matches(' print rules h7 ', 'h7')).toBe(true);
  });
  test('a long term matches as plain text', () => { expect(matches('itemoutboundvalidationservice', 'validation')).toBe(true); });
  test('parts of a path keep a code whole: H7, CP87, HUT107 are never cut', () => {
    expect(partsOf('print/PrintRulesH7.java')).toContain(' h7 '.trim()); expect(partsOf('CP87Rounding.java')).toContain('cp87'); expect(partsOf('HUT107Check.java')).toContain('hut107');
    expect(partsOf('LdvItaResolver.java')).toBe('ldv ita resolver java');
  });
  test('build and configuration files are recognised', () => {
    ['a/pom.xml', 'a/build.gradle', 'a/package.json', 'a/application-prod.yml', 'a/app.csproj'].forEach(path => expect(CONFIG_FILE.test(path)).toBe(true));
    ['a/Print.java', 'a/ApplicationService.java', 'a/pomodoro.java'].forEach(path => expect(CONFIG_FILE.test(path)).toBe(false));
  });
});

describe('ranking', () => {
  const terms = ['h7', 'stampa'];
  test('a file named after the term beats a file that only mentions it', () => {
    const named = scoreFile({ path: 'x/PrintRulesH7.java', lines: ['class A {}'], terms });
    const mentions = scoreFile({ path: 'x/Other.java', lines: ['// H7 e stampa'], terms });
    expect(named.score).toBeGreaterThan(0); expect(named.inPath).toEqual(['h7']);
    expect(scoreFile({ path: 'x/Other.java', lines: ['// h7 stampa'], terms }).score).toBeGreaterThan(scoreFile({ path: 'x/Other.java', lines: ['// nulla'], terms }).score);
    expect(mentions.inText).toEqual(['h7', 'stampa']);
  });
  test('the excerpt starts at the line with the most different terms, not at the first line that has any', () => {
    const lines = ['// stampa di cortesia', 'x', 'x', 'x', 'if (isH7() && stampa) {', 'y'];
    expect(bestLine(lines, ['h7', 'stampa'])).toBe(4); expect(bestLine(lines, ['inesistente'])).toBe(-1);
  });
  test('a file that repeats a term a thousand times does not beat one that has more different terms', () => {
    const big = scoreFile({ path: 'a/B.java', lines: Array(1000).fill('h7 h7 h7'), terms: ['h7', 'stampa', 'cha'] });
    const varied = scoreFile({ path: 'a/C.java', lines: ['h7 stampa cha'], terms: ['h7', 'stampa', 'cha'] });
    expect(varied.score).toBeGreaterThan(big.score);
  });
});

describe('terms that separate nothing', () => {
  const paths = Array.from({ length: 20 }, (_, i) => `item-service/src/main/Classe${i}.java`).concat(['item-service/src/print/PrintRulesH7.java']);
  test('a word in the path of most files (project name, src, main) is set aside and reported', () => {
    const { terms, ignored } = informativeTerms(['item', 'src', 'h7', 'stampa'], paths);
    expect(ignored).toEqual(expect.arrayContaining(['item', 'src'])); expect(terms).toEqual(['h7', 'stampa']);
  });
  test('a small folder keeps every term: with a few files nothing is "everywhere"', () => {
    expect(informativeTerms(['item', 'src'], paths.slice(0, 5))).toEqual({ terms: ['item', 'src'], ignored: [] });
  });
  test('if every term would be set aside, none is: a search with no words would find nothing', () => {
    expect(informativeTerms(['item', 'src'], paths)).toEqual({ terms: ['item', 'src'], ignored: [] });
  });
  test('a small folder keeps a term that is in all its paths even when another term is rarer', () => {
    expect(informativeTerms(['item', 'h7'], ['a/item/X.java', 'a/item/PrintH7.java', 'a/item/Y.java'])).toEqual({ terms: ['item', 'h7'], ignored: [] });
  });
  test('a term in a third of the paths still separates something and is kept; one in nearly all of them is set aside', () => {
    const many = Array.from({ length: 30 }, (_, i) => `p/${i < 10 ? 'print' : 'other'}/C${i}.java`);
    const { terms, ignored } = informativeTerms(['print', 'p', 'h7'], many); expect(terms).toEqual(expect.arrayContaining(['print', 'h7'])); expect(ignored).toEqual(['p']);
  });
});

describe('how much a repeated term counts', () => {
  test('repeating one term more than five times in a file adds nothing: only different terms keep adding', () => {
    const five = scoreFile({ path: 'a/A.java', lines: ['h7 h7 h7 h7 h7'], terms: ['h7'] });
    const eight = scoreFile({ path: 'a/B.java', lines: ['h7 h7 h7 h7 h7 h7 h7 h7'], terms: ['h7'] });
    expect(eight.score).toBe(five.score);
  });
});
