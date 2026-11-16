// Consigli dati MENTRE si chatta con l'AI, non solo nel manuale.
//
// Una risposta dell'AI ha uno spazio limitato. Una richiesta che chiede molte cose insieme (per esempio l'analisi di impatto E l'as-is E il to-be, su piu' punti)
// rischia di riempire quello spazio e di essere interrotta. Qui si decide, dal testo che l'utente sta scrivendo, SE conviene avvisarlo e COME dividere la richiesta.
// Nessun consiglio blocca l'invio: l'utente puo' sempre inviare la richiesta com'e'.

// Le "parti" che una richiesta puo' chiedere: ciascuna e' un lavoro a se' e produce un testo lungo. Si riconoscono dalle parole che l'utente usa.
export const PARTS = [
  { id: 'asis', label: 'As-is (come funziona oggi)', pattern: /\bas[\s-]?is\b|stato\s+attuale|situazione\s+attuale|come\s+funziona\s+(?:oggi|adesso|ora)|funzionamento\s+attuale/i },
  { id: 'tobe', label: 'To-be / desiderata (come deve funzionare)', pattern: /\bto[\s-]?be\b|desiderat[ao]|stato\s+futuro|come\s+(?:deve|dovrebbe)\s+funzionare|comportamento\s+(?:atteso|desiderato)/i },
  { id: 'impact', label: 'Analisi di impatto', pattern: /\bimpatt[oi]\b|impact/i },
  { id: 'risks', label: 'Rischi e punti aperti', pattern: /\brischi[oa]?\b|punti\s+aperti|criticit[àa]/i },
  { id: 'test', label: 'Test e criteri di accettazione', pattern: /\btest\b|collaudo|criteri\s+di\s+accettazione|casi\s+di\s+prova/i },
  { id: 'names', label: 'Un nome per ciascun punto', pattern: /(?:\bd(?:a\w*|ia|ai|essi|esse|are|ammi|ammene)|assegn\w*|propon\w*|attribuisc\w*)\s+(?:un\s+|il\s+)?nom[ei]|nome\s+(?:a|per)\s+(?:ciascun|ogni|cosc\w+|cias\w+)/i },
];

// I punti numerati o elencati nel testo (1. ... 2. ... / punto 1 / punti 1 e 2): un'indicazione che la richiesta riguarda piu' cose.
export function mentionedPoints(text) {
  const t = String(text || ''); const found = new Set();
  for (const m of t.matchAll(/\bpunt[oi]\s*(\d{1,2})(?:\s*(?:,|e|ed|-|–|\/)\s*(\d{1,2}))?(?:\s*(?:,|e|ed|-|–|\/)\s*(\d{1,2}))?/gi)) [m[1], m[2], m[3]].filter(Boolean).forEach(n => found.add(Number(n)));
  for (const m of t.matchAll(/(?:^|\n)\s*(\d{1,2})\s*[.)]\s+\S/g)) found.add(Number(m[1]));
  return [...found].sort((a, b) => a - b);
}

// Quale parte e' stata richiesta, e quali punti: serve per proporre le richieste da fare una alla volta.
export function analyse(text) {
  const t = String(text || '');
  const parts = PARTS.filter(part => part.pattern.test(t)).map(part => part.id);
  return { parts, points: mentionedPoints(t) };
}

// Soglia: due o piu' parti insieme, oppure una parte su piu' punti, oppure tre parti. Una richiesta semplice (una domanda sola) non riceve nessun consiglio.
export const SPLIT_FROM_PARTS = 2;
export function needsSplitting(text) {
  const { parts, points } = analyse(text);
  return parts.length >= SPLIT_FROM_PARTS || (parts.length >= 1 && points.length >= 2);
}

// Un titolo per il punto o i punti di cui si parla (da usare nella richiesta ricomposta).
const subject = points => (points.length === 0 ? '' : points.length === 1 ? ` del PUNTO ${points[0]}` : ` dei PUNTI ${points.slice(0, -1).join(', ')} e ${points[points.length - 1]}`);

// La richiesta ricomposta per UNA sola parte: e' quella da inviare al posto dell'originale.
const REQUESTS = {
  asis: s => `Descrivi in modo chiaro il funzionamento attuale (as-is)${s}: cosa succede oggi, con i dati e i passaggi che conosci, distinguendo ciò che è documentato da ciò che è una tua ipotesi.`,
  tobe: s => `Descrivi in modo chiaro il comportamento desiderato (to-be)${s}: cosa deve cambiare rispetto a oggi e perché, senza ripetere l'as-is.`,
  impact: s => `Fai l'analisi di impatto${s}: processi, dati, integrazioni e componenti toccati. Indica per ciascun impatto se è verificato nel codice o è un'ipotesi.`,
  risks: s => `Elenca i rischi e i punti aperti${s}, ciascuno con una frase, e le domande da chiarire.`,
  test: s => `Proponi i test e i criteri di accettazione${s}: casi principali e casi limite.`,
  names: () => 'Dai un nome breve e univoco a ciascuno dei punti che ti ho inviato, così potremo riferirci a loro uno per volta.',
};

// Le richieste proposte, una per parte riconosciuta, nell'ordine in cui conviene farle (prima i nomi, poi as-is, to-be, impatto, rischi, test).
const ORDER = ['names', 'asis', 'tobe', 'impact', 'risks', 'test'];
export function splitProposals(text) {
  const { parts, points } = analyse(text); const s = subject(points);
  return ORDER.filter(id => parts.includes(id)).map(id => ({ id, label: PARTS.find(part => part.id === id).label, request: REQUESTS[id](s) }));
}

// Il consiglio mostrato sopra la casella. `null` = nessun consiglio (richiesta semplice, o l'utente sta aspettando la risposta).
export function composeHint(text, { busy = false } = {}) {
  if (busy || !needsSplitting(text)) return null;
  const proposals = splitProposals(text);
  return {
    title: 'Questa richiesta chiede più cose insieme',
    body: 'L’AI ha poco spazio per ogni risposta e una richiesta così ampia rischia di essere interrotta a metà. Funziona meglio una parte alla volta: scegli da dove cominciare, poi chiedi le altre.',
    proposals,
  };
}

// L'avviso di risposta interrotta (lo mette il server in fondo al messaggio): serve per offrire il pulsante che chiede di continuare.
export const CONTINUE_REQUEST = 'Continua dal punto esatto in cui ti sei fermato, senza ripetere quanto hai già scritto.';
export const isInterrupted = text => /\n\n⚠ Risposta interrotta/.test(String(text || ''));

// Il consiglio fisso quando si fanno domande sul codice con la cartella salvata: e' gia' nel pannello strumenti, qui si decide solo se la domanda parla di codice.
export const looksLikeCodeQuestion = text => /\b(?:codice|sorgent[ei]|classe|metodo|servizio|endpoint|regola|condizion[ei]|validazion[ei]|dove\s+(?:si|viene|è)|in\s+quale\s+(?:punto|file))\b/i.test(String(text || ''));
