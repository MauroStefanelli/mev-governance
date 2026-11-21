// I dettagli del catalogo che servono a decidere COSA si fa (tipo) e QUANTO e' impegnativo (complessita'), in un posto solo.
//
// Fonti, in ordine: le descrizioni del catalogo offerto / dell'Archivio (voce.descrizioni = { Semplice, Medio, Complesso }), poi i criteri del catalogo di sistema
// (voce.criteri, in appData.js). Una voce senza testo, o con «N.A.», NON ha criteri: in quel caso non si finge di averne.
//
// Le regole (le stesse scritte nei prompt dell'AI, cosi' chi decide a mano e chi decide con l'AI ragionano allo stesso modo):
//  - TIPO: MODIFICA se l'attivita' cambia qualcosa che esiste gia'; REALIZZAZIONE se nasce qualcosa di nuovo. Se la voce prezza un solo tipo, vale quello.
//  - COMPLESSITA': il livello PIU' ALTO tra quelli compatibili con i criteri e giustificabile dal testo dell'attivita'. Non si sale senza un elemento del criterio
//    che il testo mostri; non si scende sotto un elemento del criterio che il testo mostri.
import { APP_DATA } from './appData';

export const LEVELS = ['Semplice', 'Medio', 'Complesso'];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const isNone = text => { const t = clean(text).toUpperCase().replace(/\./g, ''); return !t || t === 'NA' || t === 'N A' || t === 'NON APPLICABILE' || t === '-'; };

// Criteri di sistema per voce, dal catalogo incluso nell'app (cercati per ID e lotto: servono solo come riserva).
const systemCriteria = (id, lot) => {
  const list = (APP_DATA?.cataloghi || {})[String(lot)] || [];
  return list.find(entry => String(entry.id) === String(id))?.criteri || null;
};

// I criteri di una voce: { Semplice, Medio, Complesso } con testo vero, oppure null se non ce ne sono (tutti vuoti o «N.A.»).
export function criteriaOf(entry, lot) {
  const source = (entry?.descrizioni && Object.keys(entry.descrizioni).length ? entry.descrizioni : null) || entry?.criteri || systemCriteria(entry?.id, lot);
  if (!source) return null;
  const out = {}; let any = false;
  for (const level of LEVELS) {
    const key = Object.keys(source).find(k => k.toLowerCase() === level.toLowerCase());
    const text = key ? clean(source[key]) : '';
    if (!isNone(text)) { out[level] = text; any = true; }
  }
  return any ? out : null;
}

// Il catalogo come lo riceve l'AI: id, nome, ambito, descrizione del driver (intera, entro un limite) e criteri per complessita'. I prezzi non servono e non si mandano.
export function catalogForAi(catalog, lot, { descriptionMax = 700, criterionMax = 420 } = {}) {
  return (catalog || []).filter(entry => entry?.id != null && clean(entry.nome)).map(entry => {
    const criteria = criteriaOf(entry, lot);
    return { id: entry.id, nome: clean(entry.nome), ambito: clean(entry.ambito), descrizione: clean(entry.descrizione).slice(0, descriptionMax),
      criteri: criteria ? Object.fromEntries(Object.entries(criteria).map(([level, text]) => [level, text.slice(0, criterionMax)])) : null,
      tipi: ['REALIZZAZIONE', 'MODIFICA'].filter(type => LEVELS.some(level => Number(entry.prezzi?.[type]?.[level]) > 0)) };
  });
}

// --- TIPO -------------------------------------------------------------------------------------------------------------------------------------------------------
const NEW_WORDS = /\b(nuov[aoie]|realizz\w+|creazion\w+|crear\w+|creare|sviluppo di|introduz\w+|introdurre|implementazion\w+ di un[ao]?|da zero|ex novo|aggiunta di un[ao]? nuov\w+|costruzione|costruire)\b/i;
const CHANGE_WORDS = /\b(modific\w+|adegua\w+|evoluz\w+|aggiornament\w+|aggiornare|estension\w+|estendere|integrazion\w+ (di|su|a)|integrare|correzion\w+|correggere|rientro|ottimizzaz\w+|revisione|rivedere|cambi\w+|sostituzion\w+|manutenzion\w+|ampliament\w+|aggiungere (un )?(campo|colonna|controllo|filtro|check)|aggiunta di un (campo|colonna|controllo|filtro))\b/i;

// Dice se l'attivita' cambia qualcosa che esiste (MODIFICA) o crea qualcosa di nuovo (REALIZZAZIONE). Nel dubbio sceglie MODIFICA se il testo parla di un elemento
// che gia' c'e', altrimenti REALIZZAZIONE; segnala sempre il motivo e quanto e' sicura la scelta.
export function inferType(text, entry) {
  const t = clean(text);
  const prices = entry ? ['REALIZZAZIONE', 'MODIFICA'].filter(type => LEVELS.some(level => Number(entry.prezzi?.[type]?.[level]) > 0)) : ['REALIZZAZIONE', 'MODIFICA'];
  if (prices.length === 1) return { type: prices[0], confidence: 'alta', why: `la voce ha un solo tipo con prezzo (${prices[0]})` };
  const change = t.match(CHANGE_WORDS); const fresh = t.match(NEW_WORDS);
  if (change && !fresh) return { type: 'MODIFICA', confidence: 'alta', why: `il testo parla di cambiare qualcosa che esiste («${change[0]}»)` };
  if (fresh && !change) return { type: 'REALIZZAZIONE', confidence: 'alta', why: `il testo parla di creare qualcosa di nuovo («${fresh[0]}»)` };
  if (change && fresh) return { type: 'MODIFICA', confidence: 'media', why: `il testo parla sia di cambiare («${change[0]}») sia di creare («${fresh[0]}»): prevale quanto esiste gia'; da verificare` };
  return { type: 'REALIZZAZIONE', confidence: 'bassa', why: 'il testo non dice se cambia qualcosa di esistente o crea qualcosa di nuovo: da verificare' };
}

// --- COMPLESSITA' -----------------------------------------------------------------------------------------------------------------------------------------------
const WORDS_NUMBER = { uno: 1, una: 1, un: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9, dieci: 10 };
const toNumber = raw => { const n = Number(String(raw).replace(',', '.')); return Number.isFinite(n) ? n : WORDS_NUMBER[String(raw).toLowerCase()] ?? null; };
const NUM = '(\\d+(?:[.,]\\d+)?|uno|una|un|due|tre|quattro|cinque|sei|sette|otto|nove|dieci)';

// Le soglie numeriche di un criterio (es. «Da 1 a 10 tabelle», «Più di 30 tabelle», «fino a 2 topic»): { unit, max?, min? }.
export function thresholds(criterion) {
  const text = clean(criterion).toLowerCase(); const found = [];
  for (const m of text.matchAll(new RegExp(`da ${NUM} a ${NUM}\\s+([a-zà-ù/]+)`, 'g'))) found.push({ unit: m[3], min: toNumber(m[1]), max: toNumber(m[2]) });
  for (const m of text.matchAll(new RegExp(`(?:fino a|max(?:imo)?|entro)\\s+${NUM}\\s+([a-zà-ù/]+)`, 'g'))) found.push({ unit: m[2], max: toNumber(m[1]) });
  for (const m of text.matchAll(new RegExp(`(?:più di|oltre|maggiore di|>\\s*)\\s*${NUM}\\s+([a-zà-ù/]+)`, 'g'))) if (m[2] !== 'numero') found.push({ unit: m[2], min: toNumber(m[1]) + 1 });
  for (const m of text.matchAll(new RegExp(`([a-zà-ù/]{3,})\\s*>\\s*${NUM}`, 'g'))) found.push({ unit: m[1], min: toNumber(m[2]) + 1 });
  // Come sono scritti davvero alcuni criteri del catalogo di sistema (voce 236): «Numero Campi min uguale= 10» (fino a 10 campi) e «>10 Numero Campi min = 20» (da 11 a 20 campi).
  for (const m of text.matchAll(new RegExp(`([a-zà-ù/]{3,})\\s+min(?:imo)?\\s+uguale\\s*=?\\s*${NUM}`, 'g'))) found.push({ unit: m[1], max: toNumber(m[2]) });
  for (const m of text.matchAll(new RegExp(`>\\s*${NUM}\\s+numero\\s+([a-zà-ù/]{3,})\\s+min(?:imo)?\\s*=\\s*${NUM}`, 'g'))) found.push({ unit: m[2], min: toNumber(m[1]) + 1, max: toNumber(m[3]) });
  return found.filter(t => t.unit && (t.max != null || t.min != null));
}
const singular = word => String(word).replace(/(i|e)$/, '').replace(/^(tabell)$/, 'tabell');
const sameUnit = (a, b) => singular(a) === singular(b) || singular(a).startsWith(singular(b)) || singular(b).startsWith(singular(a));

// Quantita' dichiarate nel testo dell'attivita', per unita': «5 tabelle», «tre topic», «12 campi».
export function quantitiesIn(text) {
  const out = [];
  // «5 tabelle», ma anche «5 nuove tabelle» o «12 ulteriori campi»: l'unita' e' la parola dopo il numero o quella dopo l'aggettivo.
  for (const m of clean(text).toLowerCase().matchAll(new RegExp(`${NUM}\\s+([a-zà-ù/]{3,})(?:\\s+([a-zà-ù/]{3,}))?`, 'g'))) {
    const n = toNumber(m[1]); if (n == null) continue;
    out.push({ n, unit: m[2] }); if (m[3]) out.push({ n, unit: m[3] });
  }
  return out;
}

// Sceglie la complessita'. Regola: il livello PIU' ALTO compatibile con i criteri e giustificabile dal testo.
//  1) soglie numeriche: un criterio «da 11 a 30 tabelle» o «più di 30 tabelle» e' RISPETTATO da una quantita' nel suo intervallo; un criterio «fino a 2 topic» e' un
//     massimo: e' rispettato da ogni quantita' fino a 2, ma la quantita' lo SPINGE verso quel livello solo se supera il massimo del livello sotto. Fra i livelli
//     compatibili si prende il piu' alto GIUSTIFICATO: quello a cui la quantita' appartiene (non uno piu' alto solo perche' il suo massimo e' piu' largo);
//  2) altrimenti frasi del criterio ritrovate nel testo (almeno due parole distintive vicine, non una parola sciolta);
//  3) altrimenti nessun elemento: non si sale a caso, si resta al livello piu' basso con prezzo e si dice che va verificato.
// `levels` sono i livelli con un prezzo per il tipo scelto. Restituisce sempre anche la motivazione e il criterio citato.
export function inferComplexity(text, entry, levels = LEVELS, lot) {
  const allowed = LEVELS.filter(level => levels.includes(level));
  if (!allowed.length) return null;
  const criteria = criteriaOf(entry, lot);
  const lowest = allowed[0];
  if (!criteria) return { complexity: lowest, confidence: 'bassa', basis: 'nessun criterio nel catalogo', why: `la voce non ha criteri di complessita' scritti: scelto «${lowest}», il livello piu' basso con prezzo; da verificare`, criterion: '' };
  const quantities = quantitiesIn(text);

  // 1) soglie numeriche. Per ogni unita' si guardano i livelli in ordine: la quantita' appartiene al PRIMO livello il cui massimo la contiene, a meno che un livello
  //    superiore dichiari un intervallo [min, max] o un minimo che la contiene davvero (allora quello e' piu' preciso).
  const numeric = [];
  for (const quantity of quantities) {
    const rules = allowed.map(level => ({ level, rules: thresholds(criteria[level] || '').filter(rule => sameUnit(quantity.unit, rule.unit)) })).filter(entryRule => entryRule.rules.length);
    if (!rules.length) continue;
    const exact = rules.find(({ rules: list }) => list.some(rule => rule.min != null && quantity.n >= rule.min && (rule.max == null || quantity.n <= rule.max)));
    if (exact) { numeric.push({ level: exact.level, quantity, rule: exact.rules.find(rule => rule.min != null && quantity.n >= rule.min && (rule.max == null || quantity.n <= rule.max)) }); continue; }
    const capped = rules.find(({ rules: list }) => list.some(rule => rule.min == null && rule.max != null && quantity.n <= rule.max));
    if (capped) { numeric.push({ level: capped.level, quantity, rule: capped.rules.find(rule => rule.min == null && rule.max != null && quantity.n <= rule.max) }); continue; }
    // oltre il massimo del livello piu' alto che ha un massimo: e' quel livello (e va verificato, perche' esce dal criterio). Una quantita' SOTTO tutti i minimi
    // (es. 8 campi quando l'unica soglia e' «piu' di 20 campi») non dice nulla: non e' «oltre il massimo».
    const withMax = [...rules].reverse().find(({ rules: list }) => list.some(rule => rule.max != null && quantity.n > rule.max));
    if (withMax) numeric.push({ level: withMax.level, quantity, rule: withMax.rules[0], over: true });
  }
  if (numeric.length) {
    const best = numeric.reduce((hi, item) => (LEVELS.indexOf(item.level) > LEVELS.indexOf(hi.level) ? item : hi));
    return { complexity: best.level, confidence: best.over ? 'bassa' : 'alta', basis: 'soglia numerica',
      why: `${best.quantity.n} ${best.quantity.unit} ${best.over ? 'superano i massimi del criterio' : 'rientrano nel criterio'} «${(criteria[best.level] || '').slice(0, 120)}»${numeric.length > 1 ? ` (livello piu' alto tra le quantita' trovate)` : ''}`, criterion: criteria[best.level] };
  }

  // 2) Nessuna soglia numerica applicabile: i criteri sono descrittivi («logica complessa», «non include IF/THEN/ELSE») e leggerli richiede di capirne il senso, anche le
  //    negazioni. Un confronto di parole qui darebbe l'impressione di una motivazione che non c'e' (provato: «complesse» risultava tipica di Semplice perche' il criterio
  //    dice «Non include logiche complesse»). Quindi non si sale e non si finge: si propone il livello piu' basso con prezzo e si mostra il criterio da leggere.
  return { complexity: lowest, confidence: 'bassa', basis: 'criteri descrittivi', why: `i criteri della voce sono descrittivi e non si possono confrontare con il testo in modo affidabile: proposto «${lowest}», il livello piu' basso con prezzo, da confermare leggendo i criteri`, criterion: criteria[lowest] || '' };
}
// Tipo + complessita' per un'attivita' e una voce: il risultato usato dal passo 1 senza AI.
export function classify(text, entry, lot) {
  const typeResult = inferType(text, entry);
  const levels = LEVELS.filter(level => Number(entry?.prezzi?.[typeResult.type]?.[level]) > 0);
  const complexityResult = inferComplexity(text, entry, levels.length ? levels : LEVELS, lot);
  return { type: typeResult.type, complexity: complexityResult?.complexity || 'Medio',
    needsReview: typeResult.confidence === 'bassa' || complexityResult?.confidence === 'bassa',
    note: `Tipo ${typeResult.type}: ${typeResult.why}. Complessità ${complexityResult?.complexity || 'Medio'}: ${complexityResult?.why || 'nessun criterio disponibile'}.` };
}

// Quello che l'AI scrive di tipo e complessita' non va mai preso alla lettera: deve esistere con un prezzo per quella voce. Se non c'e', si corregge e si dice cosa e' stato cambiato.
export function validProposal(entry, { type, complexity }) {
  const askedType = String(type || '').toUpperCase().includes('REALIZZ') ? 'REALIZZAZIONE' : String(type || '').toUpperCase().includes('MODIF') ? 'MODIFICA' : '';
  const typesWithPrice = ['REALIZZAZIONE', 'MODIFICA'].filter(t => LEVELS.some(level => Number(entry?.prezzi?.[t]?.[level]) > 0));
  const fixes = [];
  let finalType = askedType;
  if (!finalType || !typesWithPrice.includes(finalType)) { finalType = typesWithPrice.includes('MODIFICA') ? 'MODIFICA' : typesWithPrice[0] || 'MODIFICA'; fixes.push(`tipo «${type || 'vuoto'}» non prezzato per questa voce: usato ${finalType}`); }
  const levels = LEVELS.filter(level => Number(entry?.prezzi?.[finalType]?.[level]) > 0);
  const askedLevel = LEVELS.find(level => level.toLowerCase() === String(complexity || '').trim().toLowerCase());
  let finalLevel = askedLevel;
  if (!finalLevel || !levels.includes(finalLevel)) {
    // Nessun livello e' giustificato da una scelta valida dell'AI: si usa il PIU' BASSO con prezzo, per non gonfiare la stima, e lo si dice.
    finalLevel = levels[0] || 'Medio';
    fixes.push(`complessità «${complexity || 'vuota'}» non prezzata per ${finalType}: usata «${finalLevel}», il livello più basso con prezzo`);
  }
  return { type: finalType, complexity: finalLevel, fixes };
}
