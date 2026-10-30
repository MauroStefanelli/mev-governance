import { catalogUnitPrice, reconcileCatalog } from './catalogReconciliation';
import { defaultPrice, validComplexities, parseInitiativeWorkbook, worksheetXml } from './configuratoreCore';
import JSZip from 'jszip';
const catalog = [{ id: 239, nome: 'Servizio/API/Microservizio', prezzi: { Realizzazione: { Semplice: 0, Medio: 1200, Complesso: 4050 }, MODIFICA: { Medio: 360 } } },
  { id: 242, nome: 'Stored procedure', prezzi: { REALIZZAZIONE: { Semplice: 120, Medio: 300 } } },
  { id: 236, nome: 'SPA', prezzi: { MODIFICA: { Semplice: 98 } } }];
test('reads contract price variants, preserves zero and distinguishes missing prices', () => {
  const row = { id: '239', type: 'REALIZZAZIONE', complexity: 'Medio' };
  expect(catalogUnitPrice(row, catalog)).toBe(1200);
  expect(defaultPrice(row, { catalog })).toBe(1200);
  expect(validComplexities(catalog[0], 'REALIZZAZIONE')).toEqual(['Semplice','Medio','Complesso']);
  expect(catalogUnitPrice({ ...row, complexity: 'Semplice' }, catalog)).toBe(0);
  expect(catalogUnitPrice({ ...row, id: 999 }, catalog)).toBeNull();
});
async function workbook(details) {
  const zip = new JSZip();
  zip.file('xl/workbook.xml','<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="145480" r:id="r1"/><sheet name="DettaglioInterventi" r:id="r2"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels','<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/><Relationship Id="r2" Target="worksheets/sheet2.xml"/></Relationships>');
  zip.file('xl/worksheets/sheet1.xml',worksheetXml([
    ['Interventi\nCodice: 145480\nTitolo: Iniziativa pilota'],
    ['ID_INTERVENTO','Titolo','Descrizione','Attività','Sistema','Copertura Requisiti','','','Quantità TOW RTI'],
    ['','','','','','','','','TOW 02.1','TOW 02.2','TOW 02.3','TOW 02.4','TOW 02.5'],
    ['MNPRES-001','Intervento uno','','Attività uno','NPSO','REQ-1','','',.545,0,.51,.62,7950],
    ['MNPRES-002','Intervento due','','Attività due','NPSO','REQ-2','','',.14,0,.13,.16,2034],
    ['','','','','','','','TOTALE TOW'],
  ]));
  zip.file('xl/worksheets/sheet2.xml',worksheetXml([
    ['ID Intervento','Componente-applicativo','Tecnologia','Unità','Descrizione Intervento','ID di catalogo','Ambito driver','Nome Driver','Tipo Intervento2','Complessità','Quantità','Prezzo Unitario','Prezzo Totale'], ...details,
  ]));
  const data = await zip.generateAsync({type:'arraybuffer'});
  return { name: 'pilota.xlsx', arrayBuffer: async () => data };
}
const detail = (id, price, complexity, type, group = 'MNPRES-001') => [group,'componente','Java','Business Logic','Attività distinta',id,'Backend','Servizio/API/Microservizio',type,complexity,1,price,price];
test('pilot preserves all 24 rows and reconciles the two totals without deduplication', async () => {
  const details = [detail(239,4050,'Complesso','REALIZZAZIONE'),detail(239,360,'Medio','MODIFICA'),detail(239,1200,'Medio','REALIZZAZIONE'),detail(239,360,'Medio','MODIFICA'),detail(239,360,'Medio','MODIFICA'),detail(239,1200,'Medio','REALIZZAZIONE'),detail(242,300,'Medio','REALIZZAZIONE'),detail(242,120,'Semplice','REALIZZAZIONE'),
    detail(242,300,'Medio','REALIZZAZIONE','MNPRES-002'), ...Array.from({length:12},() => detail(242,120,'Semplice','REALIZZAZIONE','MNPRES-002')), ...Array.from({length:3},() => detail(236,98,'Semplice','MODIFICA','MNPRES-002'))];
  const parsed = await parseInitiativeWorkbook(await workbook(details),catalog);
  expect(parsed.code).toBe('145480'); expect(parsed.lot).toBe('2'); expect(parsed.items).toHaveLength(24);
  expect(parsed.interventions.map(i => i.mappings.length)).toEqual([8,16]);
  expect(new Set(parsed.items.map(it => it.key)).size).toBe(24);
  expect(parsed.interventions.map(i => i.mappings.reduce((s,m) => s+m.total,0))).toEqual([7950,2034]);
  const report = reconcileCatalog(parsed.items,catalog);
  expect(report.originalTotal).toBe(9984); expect(report.catalogTotal).toBe(9984); expect(report.missing).toBe(0);
  const changed = [{...parsed.items[0],unit:1,qty:2},...parsed.items.slice(1)];
  expect(reconcileCatalog(changed,catalog).originalTotal).toBe(9984);
  expect(reconcileCatalog(JSON.parse(JSON.stringify(parsed.items)),catalog)).toEqual(report);
});
test('retains unmapped rows and original zero prices instead of dropping or replacing them', async () => {
  const parsed = await parseInitiativeWorkbook(await workbook([detail(999,70,'Medio','MODIFICA'),detail(239,0,'Medio','REALIZZAZIONE')]),catalog);
  expect(parsed.items).toHaveLength(2); expect(parsed.items[0].id).toBe(999); expect(parsed.items[1].unit).toBe(0);
  const report = reconcileCatalog(parsed.items,catalog);
  expect(report.missing).toBe(1); expect(report.catalogTotal).toBeNull(); expect(report.originalTotal).toBe(70);
});

test('resolves Excel codes against unique named drivers in the selected system contract', async () => {
 const systemCatalog = [{ id:'driver-api',nome:'Servizio/API/Microservizio',ambito:'Backend',prezzi:{REALIZZAZIONE:{Medio:3000},MODIFICA:{Medio:900}} }];
 const row=detail(239,360,'Medio','MODIFICA');
 const parsed=await parseInitiativeWorkbook(await workbook([row]),systemCatalog);
 expect(parsed.items[0].id).toBe('driver-api');
 expect(parsed.items[0].original.catalogId).toBe(239);
 expect(parsed.items[0].unit).toBe(360);
 expect(reconcileCatalog(parsed.items,systemCatalog).catalogTotal).toBe(900);
 // Old saved estimates that still have numeric IDs also resolve on read.
 expect(catalogUnitPrice({...parsed.items[0],id:239},systemCatalog)).toBe(900);
 expect(catalogUnitPrice({...parsed.items[0],id:239},[...systemCatalog,{...systemCatalog[0],id:'ambiguous'}])).toBeNull();
 expect(catalogUnitPrice({...parsed.items[0],id:239},[{...systemCatalog[0],ambito:'SAP'}])).toBeNull();
 expect(catalogUnitPrice({...parsed.items[0],id:239},[])).toBeNull();
});
