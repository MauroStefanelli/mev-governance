import { catalogEntryInScope } from './suggestionScope';
import { scoreIntervention } from './configuratoreCore';
const catalog = [{id:239,ambito:'Backend',nome:'Servizio/API/Microservizio',descrizione:'Java'}, {id:965,ambito:'SAP',nome:'Tabella/Strutture',descrizione:'database'}, {id:'driver-bapi',ambito:'SAP',nome:'Bapi',descrizione:'Java'}];
test('IPER cannot acquire SAP candidates from generic database rules, profiles or history',()=>{
 const result=scoreIntervention({intervention:{sistema:'IPER',titolo:'validazione itmatt outbound',attivita:'modifica database e servizi Java'},detailText:'script SQL, controlli di completezza, batch',catalog,applicationContextText:'Java SAP',historicalCounts:new Map([[965,10],['driver-bapi',10]]),profileCatalogIds:[965,'driver-bapi']});
 expect(result.scores.has(965)).toBe(false);expect(result.scores.has('driver-bapi')).toBe(false);expect(result.scores.has(239)).toBe(true);
});
test('explicit SAP integrations remain eligible without relying on candidate rationale',()=>{
 expect(catalogEntryInScope(catalog[1],'IPER: integrazione con SAP')).toBe(true);
 expect(catalogEntryInScope(catalog[1],'IPER: pulizia sapone')).toBe(false);
 expect(catalogEntryInScope(catalog[0],'IPER')).toBe(true);
 expect(catalogEntryInScope({...catalog[1],id:'965',ambito:''},'IPER')).toBe(false);
});
