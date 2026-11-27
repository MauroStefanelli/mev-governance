// Gli interventi PROPOSTI dall'AI e CONFERMATI dal team entrano nell'offerta (le voci di `items`, quelle del passo 3), come ci entrerebbero se arrivassero da una Tabella di Offerta.
//
// Sono due insiemi di dati con due vite diverse: gli interventi stanno nel record della Soluzione, le voci dell'offerta stanno nella valutazione. Per collegarli ogni voce che nasce da un
// intervento proposto porta un'etichetta (`proposedId` = «P-3», `proposedLine` = la riga di catalogo di quell'intervento): cosi' alla conferma si aggiunge, allo scarto si toglie, e MAI
// si duplica. Quello che il team ha cambiato a mano nell'offerta (prezzo, quantita', note, tipo, complessita') non viene riscritto da una nuova sincronizzazione.
import { STATUS } from './proposedInterventions';

export const lineKey = (proposedId, mapping) => `${proposedId}|${mapping.catalogId}|${mapping.type}`;
export const isFromProposal = item => !!item?.proposedId;
const NOTE = 'Proposta AI';

// La voce d'offerta che corrisponde a una riga di catalogo di un intervento proposto. La forma e' quella di una voce di `items` (vedi addManualItem e parseInitiativeWorkbook).
// `imported: false`: non arrivano da un Excel (il confronto con l'Excel e la verifica AI delle righe lavorano solo sulle importate). `selected: true`: sono interventi approvati
// (Sviluppo li conta cosi'). `interventionId` e' quello dell'intervento proposto: le voci compaiono raggruppate per intervento e l'esportazione Excel le associa a un intervento.
export function itemFromMapping(proposed, mapping) {
  return {
    id: mapping.catalogId, type: mapping.type, complexity: mapping.complexity, qty: mapping.qty, score: 0, selected: true, key: `prop:${lineKey(proposed.id, mapping)}`, unit: null, imported: false,
    reason: [proposed.id, mapping.component, mapping.why].filter(Boolean).join(' — ') || 'Intervento proposto dall’AI e confermato dal team.',
    additionalInfo: NOTE, interventionId: proposed.id, interventionTitle: proposed.title, proposedId: proposed.id, proposedLine: lineKey(proposed.id, mapping),
    proposedOrigin: { qty: mapping.qty, type: mapping.type, complexity: mapping.complexity },
    detail: { componentApplication: mapping.component || '', technology: mapping.technology || '', detailDescription: mapping.why || proposed.description || '', name: mapping.name, ambit: mapping.ambit || '' },
  };
}

const mappingOf = (proposed, item) => {
  const entry = (proposed || []).find(candidate => candidate.id === item.proposedId);
  return { entry, mapping: entry && (entry.mappings || []).find(candidate => lineKey(entry.id, candidate) === item.proposedLine) };
};

// Una voce d'offerta e' stata cambiata a mano DOPO l'ingresso? Si confronta con i valori con cui e' entrata (`proposedOrigin`), non con quelli attuali dell'intervento: cambiare
// l'intervento non e' un ritocco a mano dell'offerta.
export function editedByHand(item) {
  const origin = item.proposedOrigin || {};
  return item.unit != null || String(item.additionalInfo || '') !== NOTE || Number(item.qty) !== Number(origin.qty) || item.type !== origin.type || item.complexity !== origin.complexity;
}

// Il confronto tra cio' che l'offerta DEVE avere (gli interventi confermati) e cio' che ha.
//  - da aggiungere: le righe volute che non ci sono e che l'utente non ha tolto a mano (`exclusions`);
//  - da togliere: le voci di interventi non piu' confermati. Un intervento SCARTATO o cancellato porta via tutte le sue voci; uno rimesso in revisione porta via quelle non toccate a mano,
//    ma conserva quelle che il team ha ritoccato (prezzo, note...). Una riga di catalogo che non esiste piu' nell'intervento porta via la sua voce.
//  - `additiveOnly`: solo aggiungere. Si usa quando la soluzione si CARICA: lo stato salvato puo' essere piu' vecchio dell'offerta e non deve cancellare nulla.
export function planSync(items, proposed, { exclusions = [], additiveOnly = false } = {}) {
  const wanted = new Map();
  (proposed || []).filter(entry => entry.status === STATUS.CONFIRMED).forEach(entry => (entry.mappings || []).forEach(mapping => wanted.set(lineKey(entry.id, mapping), itemFromMapping(entry, mapping))));
  const skipped = new Set(exclusions);
  const have = new Map((items || []).filter(isFromProposal).map(item => [item.proposedLine, item]));
  const toAdd = [...wanted].filter(([line]) => !have.has(line) && !skipped.has(line)).map(([, item]) => item);
  const toRemove = additiveOnly ? [] : [...have].filter(([line]) => !wanted.has(line)).filter(([, item]) => {
    const { entry, mapping } = mappingOf(proposed, item);
    if (!entry) return false;                                                       // intervento sconosciuto (la soluzione non e' stata salvata o ricaricata): non si cancella alla cieca
    if (entry.status === STATUS.DISCARDED || !mapping) return true;                 // scartato o riga tolta dall'intervento: via
    return !editedByHand(item);                                                     // in revisione: via solo se nessuno l'ha ritoccata
  }).map(([, item]) => item.key);
  // Le righe tolte a mano restano escluse solo finche' l'intervento le vuole: se non le vuole piu', l'esclusione non serve (rimettendo l'intervento tornano).
  const stillExcluded = exclusions.filter(line => wanted.has(line));
  return { toAdd, toRemove, exclusions: stillExcluded };
}

// L'offerta dopo la sincronizzazione. Se non cambia nulla restituisce LO STESSO array, cosi' chi lo guarda non rifa' calcoli ne' marca la pagina come modificata.
export function syncItems(items, proposed, options = {}) {
  const { toAdd, toRemove } = planSync(items, proposed, options);
  if (!toAdd.length && !toRemove.length) return items;
  const removed = new Set(toRemove);
  return [...(items || []).filter(item => !removed.has(item.key)), ...toAdd];
}

// Cosa e' cambiato, per dirlo all'utente.
export function describeChange(items, proposed, options = {}) {
  const { toAdd, toRemove } = planSync(items, proposed, options);
  return { added: toAdd.length, removed: toRemove.length };
}

export function summary(items, proposed) {
  const confirmed = (proposed || []).filter(entry => entry.status === STATUS.CONFIRMED);
  const inOffer = (items || []).filter(isFromProposal);
  return { confirmed: confirmed.length, lines: confirmed.reduce((sum, entry) => sum + (entry.mappings || []).length, 0), inOffer: inOffer.length, handEdited: inOffer.filter(item => editedByHand(item)).length };
}
