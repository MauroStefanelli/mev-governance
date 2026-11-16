// Interventi PROPOSTI (non arrivati dalla Tabella di Offerta): nascono dai razionali e dagli applicativi, e il team li conferma uno per uno.
//
// Gli interventi della Tabella di Offerta restano come sono. Quelli proposti si aggiungono e hanno lo stesso aspetto (id, titolo, descrizione, attivita', sistema, requisiti,
// righe di catalogo), cosi' la soluzione, il Markdown e l'offerta possono trattarli allo stesso modo. Ogni voce di catalogo che l'AI propone viene CONTROLLATA qui
// contro il catalogo vero del lotto: una voce inventata, o una complessita' che quel catalogo non prezza, non entra mai.
import { validComplexities } from './configuratoreCore';
import { catalogUnitPrice } from './catalogReconciliation';

export const STATUS = { PROPOSED: 'proposto', CONFIRMED: 'confermato', DISCARDED: 'scartato' };
export const MAX_PROPOSED = 30;
export const MAX_TEXT = 1200;
export const MAX_TITLE = 160;
export const MAX_MAPPINGS = 8;
export const MAX_QTY = 999;
export const TYPES = ['MODIFICA', 'REALIZZAZIONE'];
export const COMPLEXITIES = ['Semplice', 'Medio', 'Complesso'];

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
// Identificativi numerici di voci di razionale: Number(null) e Number('') valgono 0 e non sono identificativi, quindi si scartano prima di convertire.
const ids = value => (Array.isArray(value) ? value : []).filter(item => item !== null && item !== '' && item !== true && item !== false && !Array.isArray(item)).map(Number).filter(n => Number.isInteger(n) && n > 0).slice(0, 20);
const cleanBlock = value => String(value ?? '').replace(/\r\n/g, '\n').trim();

// Un identificativo stabile che non puo' scontrarsi con quelli della Tabella (che sono numerici o codici di Poste): «P-» e un numero progressivo.
export const PROPOSED_PREFIX = 'P-';
export const isProposedId = id => /^P-\d+$/.test(String(id || ''));
export function nextProposedId(existing = []) {
  const used = existing.map(item => String(item.id || '')).filter(isProposedId).map(id => Number(id.slice(PROPOSED_PREFIX.length)));
  return `${PROPOSED_PREFIX}${(used.length ? Math.max(...used) : 0) + 1}`;
}

// Una riga di catalogo proposta, controllata. Restituisce la riga pulita, oppure { rejected: motivo } se non puo' entrare.
export function checkMapping(raw, catalog) {
  const id = Number(raw?.catalogId ?? raw?.id);
  const entry = (catalog || []).find(item => Number(item.id) === id);
  if (!Number.isFinite(id) || !entry) return { rejected: `la voce di catalogo ${raw?.catalogId ?? raw?.id ?? '(senza id)'} non esiste nel catalogo di questo lotto` };
  const type = String(raw?.type || '').toUpperCase().includes('REALIZZ') ? 'REALIZZAZIONE' : String(raw?.type || '').toUpperCase().includes('MODIF') ? 'MODIFICA' : '';
  if (!type) return { rejected: `«${entry.nome}»: il tipo deve essere MODIFICA o REALIZZAZIONE` };
  const allowed = validComplexities(entry, type);
  if (!allowed.length) return { rejected: `«${entry.nome}» non ha un prezzo per ${type} in questo lotto` };
  const asked = clean(raw?.complexity).toLowerCase();
  const complexity = allowed.find(item => item.toLowerCase() === asked) || null;
  // Una complessita' che il catalogo non prezza non si indovina: si usa la prima prezzata e lo si dice, cosi' il team vede e decide.
  const corrected = complexity ? null : `complessità «${clean(raw?.complexity) || '(vuota)'}» non prevista per ${type}: usata «${allowed[0]}»`;
  const qty = Math.min(MAX_QTY, Math.max(1, Math.round(Number(raw?.qty) || 1)));
  const unit = catalogUnitPrice({ id: entry.id, type, complexity: complexity || allowed[0] }, [entry]);
  return {
    catalogId: entry.id, name: entry.nome, ambit: entry.ambito || '', type, complexity: complexity || allowed[0], qty, unit,
    component: clean(raw?.component || raw?.componentApplication).slice(0, 120), technology: clean(raw?.technology).slice(0, 80), why: clean(raw?.why || raw?.reason).slice(0, 300), correction: corrected,
  };
}

// Un intervento proposto, controllato. Un intervento senza titolo o senza nessuna riga di catalogo valida non e' un intervento: viene scartato con il motivo.
export function checkProposed(raw, catalog, existingIds = []) {
  const title = clean(raw?.title || raw?.titolo).slice(0, MAX_TITLE);
  if (!title) return { rejected: 'intervento senza titolo' };
  // Le voci che il SERVER ha gia' scartato (id inventato, tipo non prezzato...) arrivano nell'elenco: si conservano, cosi' l'utente vede cosa l'AI aveva proposto e perche' non e' entrato.
  const rejectedMappings = (Array.isArray(raw?.rejectedMappings) ? raw.rejectedMappings : []).map(value => clean(value).slice(0, 300)).filter(Boolean).slice(0, MAX_MAPPINGS * 2); const mappings = [];
  for (const mapping of (Array.isArray(raw?.mappings) ? raw.mappings : []).slice(0, MAX_MAPPINGS * 2)) {
    const checked = checkMapping(mapping, catalog);
    if (checked.rejected) { rejectedMappings.push(checked.rejected); continue; }
    if (mappings.some(item => item.catalogId === checked.catalogId && item.type === checked.type)) { rejectedMappings.push(`«${checked.name}» è ripetuta per ${checked.type}`); continue; }
    mappings.push(checked); if (mappings.length >= MAX_MAPPINGS) break;
  }
  return {
    id: nextProposedId(existingIds.map(id => ({ id }))), title, description: cleanBlock(raw?.description || raw?.descrizione).slice(0, MAX_TEXT), activity: cleanBlock(raw?.activity || raw?.attivita).slice(0, MAX_TEXT),
    system: clean(raw?.system || raw?.sistema).slice(0, 120), requirements: cleanBlock(raw?.requirements || raw?.requisiti).slice(0, MAX_TEXT),
    rationaleIds: ids(raw?.rationaleIds),
    components: (Array.isArray(raw?.components) ? raw.components : []).map(value => clean(value).slice(0, 120)).filter(Boolean).slice(0, 10),
    mappings, rejectedMappings, status: STATUS.PROPOSED, byAi: true,
  };
}

// Dalla risposta dell'AI alle proposte pronte per il team. Un intervento gia' proposto con lo stesso titolo non si ripete; il totale non supera MAX_PROPOSED.
export function proposalsFromAi(response, catalog, current = []) {
  const list = Array.isArray(response?.interventions) ? response.interventions : Array.isArray(response) ? response : [];
  // Gli interventi che il SERVER ha gia' scartato (senza titolo, gia' proposti...) non sono nell'elenco: arrivano a parte e si contano insieme a quelli che scarta il browser.
  const accepted = []; const rejected = (Array.isArray(response?.rejected) ? response.rejected : []).map(item => ({ title: clean(item?.title) || '(senza titolo)', reason: clean(item?.reason) || 'scartato dal server' })).slice(0, MAX_PROPOSED); const used = current.map(item => item.id);
  const titles = new Set(current.filter(item => item.status !== STATUS.DISCARDED).map(item => clean(item.title).toLowerCase()));
  for (const raw of list) {
    if (current.length + accepted.length >= MAX_PROPOSED) { rejected.push({ title: clean(raw?.title || raw?.titolo), reason: `oltre il limite di ${MAX_PROPOSED} interventi proposti` }); continue; }
    const checked = checkProposed(raw, catalog, [...used, ...accepted.map(item => item.id)]);
    if (checked.rejected) { rejected.push({ title: clean(raw?.title || raw?.titolo) || '(senza titolo)', reason: checked.rejected }); continue; }
    if (titles.has(checked.title.toLowerCase())) { rejected.push({ title: checked.title, reason: 'già proposto' }); continue; }
    titles.add(checked.title.toLowerCase()); accepted.push(checked);
  }
  return { accepted, rejected };
}

// Cosa si puo' fare con una proposta.
export const confirm = item => ({ ...item, status: STATUS.CONFIRMED });
export const discard = item => ({ ...item, status: STATUS.DISCARDED });
export const restore = item => ({ ...item, status: STATUS.PROPOSED });
export const withText = (item, key, value) => ({ ...item, [key]: value, status: item.status === STATUS.CONFIRMED ? STATUS.PROPOSED : item.status });   // modificare un intervento confermato lo rimette in revisione

export function withMapping(item, index, patch, catalog) {
  const mappings = item.mappings.map((mapping, i) => (i === index ? { ...mapping, ...patch } : mapping));
  const checked = checkMapping(mappings[index], catalog);
  if (checked.rejected) return { item, problem: checked.rejected };
  const next = mappings.map((mapping, i) => (i === index ? { ...checked, correction: checked.correction } : mapping));
  return { item: { ...item, mappings: next, status: item.status === STATUS.CONFIRMED ? STATUS.PROPOSED : item.status } };
}
export function addMapping(item, catalogEntry, catalog) {
  if (item.mappings.length >= MAX_MAPPINGS) return { item, problem: `Massimo ${MAX_MAPPINGS} voci di catalogo per intervento.` };
  const type = item.mappings[0]?.type || 'REALIZZAZIONE';
  const checked = checkMapping({ catalogId: catalogEntry.id, type, complexity: 'Medio', qty: 1 }, catalog);
  if (checked.rejected) return { item, problem: checked.rejected };
  if (item.mappings.some(mapping => mapping.catalogId === checked.catalogId && mapping.type === checked.type)) return { item, problem: `«${checked.name}» è già tra le voci di questo intervento.` };
  return { item: { ...item, mappings: [...item.mappings, checked], status: item.status === STATUS.CONFIRMED ? STATUS.PROPOSED : item.status } };
}
export const removeMapping = (item, index) => ({ ...item, mappings: item.mappings.filter((_, i) => i !== index), status: item.status === STATUS.CONFIRMED ? STATUS.PROPOSED : item.status });

// Un intervento si puo' confermare solo se ha almeno una voce di catalogo valida: senza, non si puo' ne' prezzare ne' mappare.
export const canConfirm = item => item.status !== STATUS.DISCARDED && item.mappings.length > 0 && clean(item.title).length > 0;

// Gli interventi proposti come li vede il resto dell'app: stessa forma di quelli importati dalla Tabella. Solo quelli CONFERMATI entrano; le proposte non sono interventi.
export function asInterventions(proposed = []) {
  return proposed.filter(item => item.status === STATUS.CONFIRMED).map(item => ({
    id: item.id, titolo: item.title, descrizione: item.description, attivita: item.activity, sistema: item.system, requisiti: item.requirements, tow5: 0, proposed: true, components: item.components || [],
    mappings: item.mappings.map(mapping => ({ catalogId: mapping.catalogId, name: mapping.name, type: mapping.type, complexity: mapping.complexity, qty: mapping.qty, unit: mapping.unit, total: mapping.unit == null ? null : mapping.unit * mapping.qty,
      componentApplication: mapping.component, technology: mapping.technology, detailDescription: mapping.why, ambit: mapping.ambit })),
  }));
}

// Gli interventi della soluzione: quelli della Tabella e, dopo, quelli proposti e confermati. Se un id coincide, vince la Tabella (e' il dato ufficiale).
export function mergeInterventions(imported = [], proposed = []) {
  const known = new Set((imported || []).map(item => String(item.id)));
  return [...(imported || []), ...asInterventions(proposed).filter(item => !known.has(String(item.id)))];
}

export function counts(proposed = []) {
  const by = status => proposed.filter(item => item.status === status).length;
  return { proposed: by(STATUS.PROPOSED), confirmed: by(STATUS.CONFIRMED), discarded: by(STATUS.DISCARDED), total: proposed.length };
}

// Lo stato salvato deve avere la forma attesa: tutto cio' che arriva dal server (o da un salvataggio vecchio) si rimette in regola.
export function normalizeStored(value) {
  return (Array.isArray(value) ? value : []).filter(item => item && isProposedId(item.id) && clean(item.title)).slice(0, MAX_PROPOSED).map(item => ({
    id: String(item.id), title: clean(item.title).slice(0, MAX_TITLE), description: cleanBlock(item.description).slice(0, MAX_TEXT), activity: cleanBlock(item.activity).slice(0, MAX_TEXT), system: clean(item.system).slice(0, 120),
    requirements: cleanBlock(item.requirements).slice(0, MAX_TEXT), rationaleIds: ids(item.rationaleIds), components: (item.components || []).map(clean).filter(Boolean).slice(0, 10),
    mappings: (Array.isArray(item.mappings) ? item.mappings : []).slice(0, MAX_MAPPINGS).filter(mapping => Number.isFinite(Number(mapping?.catalogId))).map(mapping => ({ ...mapping, catalogId: Number(mapping.catalogId), qty: Math.min(MAX_QTY, Math.max(1, Number(mapping.qty) || 1)) })),
    rejectedMappings: [], status: Object.values(STATUS).includes(item.status) ? item.status : STATUS.PROPOSED, byAi: item.byAi !== false,
  }));
}
