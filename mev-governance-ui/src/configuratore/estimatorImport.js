// «Importa da Estimatore Catalogo»: l'Estimatore e' il foglio di calcolo con cui si costruisce l'offerta PRIMA di averla in forma di Tabella di Offerta. Ha gli stessi dati
// (interventi, attivita', TOW, righe di dettaglio) e in piu' le ORE UOMO per fase. Qui si leggono i fogli giusti e si prepara cio' che serve al parser di sempre.
//
// Cosa e' diverso dalla Tabella di Offerta (verificato su tre Estimatori veri):
//  - il PRIMO foglio e' «COSTI INTERNI», nascosto, e contiene gli interventi di un'altra iniziativa: il parser della Tabella legge sempre il primo foglio e prenderebbe quelli;
//  - gli interventi stanno in «INIZIATIVA» (visibile), con l'intestazione ID_INTERVENTO alla riga 3 e il codice/titolo in A1;
//  - le attivita' stanno in «DettaglioInterventi», come nella Tabella;
//  - in INIZIATIVA ci sono righe che NON sono interventi: segnaposto vuoti («Intervento-21»…) e note in fondo («LISTINO TOW…», «Ambito», «ESCLUSIONI», «ESCL_01»…);
//  - le colonne Analisi / Sviluppo / Collaudo / Produzione sono le ore uomo di ogni intervento.
import { excelHeader, parseInitiativeWorkbook, readWorkbookSheets } from './configuratoreCore';

export const ESTIMATOR_SHEET = 'INIZIATIVA';
export const DETAIL_SHEET = 'DettaglioInterventi';
export const PHASES = ['Analisi', 'Sviluppo', 'Collaudo', 'Produzione'];

const text = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const norm = value => excelHeader(value);
const number = value => { if (value == null || String(value).trim() === '') return null; const n = Number(String(value).replace(',', '.')); return Number.isFinite(n) ? n : null; };

// E' un Estimatore se ha il foglio INIZIATIVA e, in quel foglio, la colonna ID_INTERVENTO. Una Tabella di Offerta non ha il foglio INIZIATIVA (il suo primo foglio ha il codice).
export function isEstimator(sheets) {
  const sheet = (sheets || []).find(entry => norm(entry.name) === norm(ESTIMATOR_SHEET));
  return !!sheet && sheet.rows.some(row => row.some(value => ['idintervento'].includes(norm(value))));
}

// Le righe di INIZIATIVA che sono davvero interventi. Un intervento ha un ID che non e' una nota e, almeno, una di queste cose: un titolo, un'attivita', un sistema, ore, oppure righe in DettaglioInterventi.
// Non lo e': un segnaposto «Intervento-21» senza nulla (vuoto), ne' una riga di note in fondo (listino TOW, ambito, esclusioni): si riconoscono dall'ID e dal fatto che stanno
// DOPO l'ultimo intervento con contenuto, in blocchi che iniziano con una parola chiave.
const NOTE_IDS = /^(listino tow|ambito|esclusion|escl[_ -]?\d|totale|total|note|legenda|tariffa|sviluppo software|manutenzion)/i;
export function isNoteRow(id) {
  const t = text(id); if (!t) return false;
  return NOTE_IDS.test(t) || /come da offerta economica/i.test(t);
}

// Legge INIZIATIVA. `detailIds` = gli ID che hanno almeno una riga in DettaglioInterventi. Restituisce gli interventi, cio' che e' stato saltato e perche', e i dati dell'iniziativa.
export function readEstimator(sheets) {
  const sheet = sheets.find(entry => norm(entry.name) === norm(ESTIMATOR_SHEET));
  if (!sheet) throw new Error(`Non trovo il foglio «${ESTIMATOR_SHEET}»: non sembra un Estimatore Catalogo.`);
  const rows = sheet.rows;
  const headAt = rows.findIndex(row => row.some(value => norm(value) === 'idintervento'));
  if (headAt < 0) throw new Error(`Nel foglio «${ESTIMATOR_SHEET}» manca la colonna ID_INTERVENTO.`);
  const heads = rows[headAt].map(value => text(value).toUpperCase());
  const sub = rows[headAt + 1] || [];
  const at = name => heads.indexOf(name);
  const col = (...names) => { for (const name of names) { const i = at(name); if (i >= 0) return i; } return -1; };
  const cId = col('ID_INTERVENTO'), cTitle = col('TITOLO'), cDesc = col('DESCRIZIONE'), cAct = col('ATTIVITÀ', 'ATTIVITA'), cSys = col('SISTEMA'), cReq = col('COPERTURA REQUISITI');
  const tow5 = sub.findIndex(value => /TOW\s*0?[12]\.5/i.test(String(value || '')));
  const towStart = sub.findIndex(value => /TOW\s*0?[12]\.1/i.test(String(value || '')));
  const lotMatch = String(sub[towStart] || '').match(/TOW\s*0?([12])\./i);
  // Le ore uomo: le quattro colonne Analisi / Sviluppo / Collaudo / Produzione nella riga sotto l'intestazione (non le quantita' dei listini a destra).
  const phaseCol = Object.fromEntries(PHASES.map(phase => [phase, sub.findIndex(value => text(value).toLowerCase() === phase.toLowerCase())]));
  const hasHours = PHASES.every(phase => phaseCol[phase] >= 0);
  const capCol = sub.findIndex(value => text(value).toUpperCase() === 'CAP'), posteCol = sub.findIndex(value => text(value).toUpperCase() === 'POSTE'), deltaCol = sub.findIndex(value => text(value).toUpperCase() === 'DELTA');
  const meta = String(rows[0]?.[0] || '');
  const rate = (() => { const r = rows.slice(0, headAt).find(row => row.some(value => /TARIFFA MEDIA/i.test(String(value || '')))); if (!r) return null; const i = r.findIndex(value => /TARIFFA MEDIA/i.test(String(value || ''))); return number(r.slice(i + 1).find(value => number(value) != null)); })();
  const found = []; const skipped = { placeholders: [], notes: [] };
  for (const [offset, row] of rows.slice(headAt + 2).entries()) {
    const id = text(row[cId]); if (!id) continue;
    const entry = { id, titolo: text(row[cTitle]), descrizione: text(row[cDesc]), attivita: text(row[cAct]), sistema: text(row[cSys]), requisiti: text(row[cReq]),
      tow5: number(row[tow5]) || 0, hours: hasHours ? Object.fromEntries(PHASES.map(phase => [phase, number(row[phaseCol[phase]]) || 0])) : null,
      values: capCol >= 0 ? { cap: number(row[capCol]), poste: number(row[posteCol]), delta: number(row[deltaCol]) } : null, row: headAt + 2 + offset + 1 };
    found.push(entry);
  }
  return { sheet: sheet.name, meta, rate, lot: lotMatch ? lotMatch[1] : null, hasHours, found, skipped, towStart, tow5 };
}

// Sceglie quali delle righe lette sono interventi. Una riga e' una NOTA se ha un ID da nota; e' un SEGNAPOSTO se non ha nessun contenuto e nessuna riga di dettaglio.
// Il resto e' un intervento. Un intervento senza righe di dettaglio ma con contenuto si importa lo stesso e viene SEGNALATO (non si perde nulla di cio' che l'utente ha scritto).
export function classifyRows(found, detailIds) {
  const withDetail = new Set([...(detailIds || [])].map(id => text(id).toLowerCase()));
  const interventions = []; const placeholders = []; const notes = []; const withoutActivities = [];
  for (const entry of found) {
    const content = !!(entry.titolo || entry.descrizione || entry.attivita || entry.sistema || entry.requisiti || entry.tow5 || (entry.hours && Object.values(entry.hours).some(Boolean)));
    const hasDetail = withDetail.has(text(entry.id).toLowerCase());
    if (isNoteRow(entry.id)) { notes.push(entry); continue; }
    if (!content && !hasDetail) { placeholders.push(entry); continue; }
    interventions.push(entry);
    if (!hasDetail) withoutActivities.push(entry);
  }
  return { interventions, placeholders, notes, withoutActivities };
}

// Il riepilogo che si mostra a chi importa: cosa e' entrato, cosa e' stato saltato e perche', cosa non ha attivita', le ore.
export function summarizeEstimator({ interventions, placeholders, notes, withoutActivities }, detailRows = 0, detailOrphans = []) {
  const hours = Object.fromEntries(PHASES.map(phase => [phase, interventions.reduce((sum, entry) => sum + (entry.hours?.[phase] || 0), 0)]));
  return { interventions: interventions.length, activities: detailRows, placeholders: placeholders.length, notes: notes.length, withoutActivities: withoutActivities.map(entry => entry.id),
    orphanActivities: detailOrphans, hours, totalHours: Object.values(hours).reduce((a, b) => a + b, 0) };
}

// ---------------------------------------------------------------------------------------------------------------------------------------------------------------
// L'import completo. Riusa parseInitiativeWorkbook per le righe di dettaglio (la stessa logica della Tabella di Offerta: codice, lotto, riconoscimento della voce di catalogo,
// prezzi, firma delle righe) e vi aggiunge cio' che e' proprio dell'Estimatore.

export async function parseEstimatorWorkbook(file, catalog) {
  const buffer = await file.arrayBuffer();
  const sheets = await readWorkbookSheets(buffer);
  if (!isEstimator(sheets)) throw new Error(`Questo file non sembra un Estimatore Catalogo: manca il foglio «${ESTIMATOR_SHEET}» con la colonna ID_INTERVENTO. Per una Tabella di Offerta usa «Importa Tabella di Offerta».`);
  const estimator = readEstimator(sheets);
  // gli ID che hanno attivita' nel foglio di dettaglio (anche per riconoscere i segnaposto veri)
  const detail = sheets.find(entry => norm(entry.name) === norm(DETAIL_SHEET));
  if (!detail) throw new Error(`Manca il foglio «${DETAIL_SHEET}»: senza non ci sono attivita' da importare.`);
  const headAt = detail.rows.findIndex(row => row.some(value => norm(value) === 'idintervento') && row.some(value => norm(value) === 'nomedriver'));
  if (headAt < 0) throw new Error(`Intestazioni non riconosciute nel foglio «${DETAIL_SHEET}».`);
  const idCol = detail.rows[headAt].map(norm).indexOf('idintervento');
  const detailRows = detail.rows.slice(headAt + 1).filter(row => text(row[idCol]) && !/^totale?$/i.test(text(row[idCol])));
  const detailIds = new Set(detailRows.map(row => text(row[idCol])));
  const sorted = classifyRows(estimator.found, detailIds);
  if (!sorted.interventions.length) throw new Error('Nel foglio «INIZIATIVA» non ho trovato nessun intervento con contenuto o attivita.');
  // Il parser di sempre legge gli interventi dal foglio indicato e le righe dal dettaglio.
  const parsed = await parseInitiativeWorkbook({ name: file.name, arrayBuffer: async () => buffer }, catalog, { sheetName: estimator.sheet });
  // Si tengono solo gli interventi riconosciuti come tali (via segnaposto e note) e si completano con le ore.
  const keep = new Map(sorted.interventions.map(entry => [text(entry.id).toLowerCase(), entry]));
  const interventions = parsed.interventions.filter(entry => keep.has(text(entry.id).toLowerCase())).map(entry => {
    const source = keep.get(text(entry.id).toLowerCase());
    return { ...entry, ...(source.hours ? { hours: source.hours } : {}), ...(source.values ? { estimateValues: source.values } : {}), fromEstimator: true };
  });
  const keptIds = new Set(interventions.map(entry => text(entry.id).toLowerCase()));
  const items = parsed.items.filter(item => keptIds.has(text(item.interventionId).toLowerCase()));
  const orphans = [...detailIds].filter(id => !estimator.found.some(entry => text(entry.id).toLowerCase() === text(id).toLowerCase()));
  if (!items.length) throw new Error('Nessuna attività valida in «DettaglioInterventi»: controlla che ID Intervento, ID di catalogo, Tipo, Complessità e Quantità siano compilati.');
  const summary = summarizeEstimator(sorted, detailRows.length, orphans);
  return { ...parsed, interventions, items, estimator: { sheet: estimator.sheet, hasHours: estimator.hasHours, rate: estimator.rate, summary,
    skipped: { placeholders: sorted.placeholders.map(entry => entry.id), notes: sorted.notes.map(entry => entry.id) } } };
}
