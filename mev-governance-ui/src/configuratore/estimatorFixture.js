// Costruisce un Estimatore Catalogo SINTETICO con la stessa struttura di quelli veri (verificati su tre file reali), senza nessun dato di Poste: serve ai test.
// Struttura: primo foglio nascosto «COSTI INTERNI» con gli interventi di UN'ALTRA iniziativa; «INIZIATIVA» con codice/titolo in A1, intestazioni alla riga 3, TOW alla riga 4,
// le ore Analisi/Sviluppo/Collaudo/Produzione e CAP/POSTE/DELTA; «DettaglioInterventi» con le attivita'; note e segnaposto in fondo/in mezzo.
import JSZip from 'jszip';
import { worksheetXml } from './configuratoreCore';

const esc = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;');
export async function estimatorWorkbook({ meta = 'Interventi Iniziativa \nCodice: 999001\nTitolo:  Iniziativa di prova', interventions, details, placeholders = 0, notes = true, hours = true, withInitiative = true, withDetail = true, hiddenFirst = true, rate = 800, placeholderHours = [0, 0, 0, 0] } = {}) {
  const zip = new JSZip();
  // 1) COSTI INTERNI (nascosto): interventi di un'altra iniziativa, che il parser della Tabella di Offerta leggerebbe al posto dei veri
  const wrongRows = [[''], ['Interventi Iniziativa \nCodice: XXXXXX\nTitolo:  Un altra iniziativa'], [''], ['ID_INTERVENTO', 'Titolo', 'Descrizione', 'Attività', 'Sistema', 'Copertura Requisiti', 'Fase', 'NOTE', 'Quantità TOW RTI'], ['', '', '', '', '', '', '', '', 'TOW 02.1', 'TOW 02.2', 'TOW 02.3', 'TOW 02.4', 'TOW 02.5'],
    ['AltraIniziativa', 'Intervento di un altra iniziativa', 'x', 'y', 'ZZZ', '', 'R1', '', 1, 1, 1, 1, 100], ['AltraIniziativa', 'Altro ancora', 'x', 'y', 'ZZZ', '', 'R1', '', 1, 1, 1, 1, 100]];
  const initRows = [[meta, ...Array(17).fill(''), 'TARIFFA MEDIA', '', rate], [],
    ['ID_INTERVENTO', 'Titolo', 'Descrizione', 'Attività', 'Sistema', 'Copertura Requisiti', 'Fase', 'NOTE', 'Quantità TOW RTI', '', '', '', '', '', '', 'TOTALE SVILUPPO', '', '', ...(hours ? ['Quantità Ore uomo'] : []), '', '', '', '', hours ? 'VALORIZZAZIONE' : ''],
    ['', '', '', '', '', '', '', '', 'TOW 02.1', 'TOW 02.2', 'TOW 02.3', 'TOW 02.4', 'TOW 02.5', '', '', 'TOW 02.2', 'TOT LISTINO', '', ...(hours ? ['Analisi', 'Sviluppo', 'Collaudo', 'Produzione', '', 'CAP', 'POSTE', 'DELTA'] : [])]];
  for (const item of interventions) {
    const row = [item.id, item.titolo ?? '', item.descrizione ?? '', item.attivita ?? '', item.sistema ?? '', item.requisiti ?? '', '', '', item.tow1 ?? 0, 0, item.tow3 ?? 0, item.tow4 ?? 0, item.tow5 ?? 0, '', '', 0, item.tow5 ?? 0, ''];
    if (hours) { const h = item.hours || [0, 0, 0, 0]; row.push(h[0], h[1], h[2], h[3], '', item.cap ?? 0, item.poste ?? 0, item.delta ?? 0); }
    initRows.push(row);
  }
  for (let i = 0; i < placeholders; i += 1) initRows.push([`Intervento-${21 + i}`, '', '', '', '', '', '', '', 0, 0, 0, 0, 0, '', '', 0, 0, '', ...(hours ? [placeholderHours[0], placeholderHours[1], placeholderHours[2], placeholderHours[3], '', 0, 0, 0] : [])]);
  if (notes) initRows.push(['LISTINO TOW (come da Offerta Economica dichiarata in sede di Accordo Quadro)'], ['Ambito', 'Type-of-Work', 'Importo Unitario \nIVA esclusa'], ['Sviluppo Software e Manutenzioni Evolutive Straordinarie ad hoc ', 'TOW 02.1', 3607], ['', 'TOW 02.2', 9018], ['ESCLUSIONI'], ['ESCL_01'], ['ESCL_02']);
  const detailRows = [['ID Intervento', 'Componente-applicativo', 'Tecnologia', 'Unità', 'Descrizione Intervento', 'ID di catalogo', 'Ambito driver', 'Nome Driver', 'Tipo Intervento', 'Complessità', 'Quantità', 'Prezzo Unitario', 'Prezzo Totale', 'Valore'],
    ...(details || []).map(d => [d.id, d.component ?? 'componente-x', d.tech ?? 'Java', d.unit ?? 'Business Logic', d.text ?? `attivita ${d.id}`, d.catalogId, d.ambit ?? 'Backend', d.driver, d.type, d.complexity, d.qty, d.price, d.price * d.qty, 7]),
    ['Total', '', '', '', '', '', '', '', '', '', '', '', 0, 0]];
  const sheets = [];
  if (hiddenFirst) sheets.push({ name: 'COSTI INTERNI', rows: wrongRows, hidden: true });
  if (withInitiative) sheets.push({ name: 'INIZIATIVA', rows: initRows });
  if (withDetail) sheets.push({ name: 'DettaglioInterventi', rows: detailRows });
  zip.file('xl/workbook.xml', `<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" ${s.hidden ? 'state="hidden" ' : ''}r:id="r${i + 1}"/>`).join('')}</sheets></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<Relationships>${sheets.map((s, i) => `<Relationship Id="r${i + 1}" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`);
  sheets.forEach((s, i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, worksheetXml(s.rows)));
  const data = await zip.generateAsync({ type: 'arraybuffer' });
  return { name: 'Estimatore Catalogo_Calculator_Gara 2025_999001.xlsx', arrayBuffer: async () => data };
}
