const chapter = (title, subtitle, steps, note, extra = {}) => ({ title, subtitle, steps, note, ...extra });
// Un passo che vale solo per alcuni ruoli: { text, roles }. I ruoli sono quelli di chi legge il manuale (vedi manualRoles.js).
const only = (roles, text) => ({ text, roles });
const ADMIN = ['Admin', 'SuperAdmin'];
const accessNote = 'Le azioni visibili dipendono dal ruolo e dai permessi assegnati. Verifica il contratto/ambiente nella barra superiore: i dati operativi sono riferiti al contesto attivo.';
const tableChapter = chapter('Filtri e consultazione', 'Restringere i dati senza modificarli', [
  'Apri i filtri nelle intestazioni e seleziona i valori desiderati. Le opzioni si aggiornano considerando le selezioni negli altri filtri.',
  'Scorri orizzontalmente per raggiungere tutte le colonne. Usa “Colonne fisse” per scegliere quali mantenere visibili; la scelta è memorizzata separatamente per MEV e MEV-CAP.',
  '“Reset filtri” ripristina la vista completa. I totali si aggiornano sulle iniziative filtrate: controlla il perimetro prima di confrontare gli importi.',
], 'Su schermi stretti la parte fissa può ridursi automaticamente a ID/GoTo, senza sovrascrivere la preferenza scelta.');
const alignChapter = chapter('Importazione ed esportazione', 'Scaricare i dati; per gli amministratori anche aggiornarli dall’Excel ufficiale', [
  '«Esporta Excel» scarica un file con le righe che stai vedendo, cioè quelle che passano i filtri. Prima di premerlo controlla i filtri e il numero di iniziative: con tutti i filtri azzerati il file contiene l’intero elenco.',
  'Il file è una vera tabella di Excel: ogni intestazione ha il pulsante del filtro, le righe sono a bande, le intestazioni e le colonne ID e GoTo restano visibili mentre scorri. Gli importi (Importo CAP, Importo ODA, Imp. Subco, P Importo) sono numeri mostrati in euro, per esempio «1.234,50 €», quindi si possono sommare e ordinare. In fondo c’è la riga dei totali, che segue i filtri applicati in Excel.',
  'Le colonne sono quelle della tabella a video (in MEV-CAP anche Mandataria/Mandante e le quantità TOW). Sotto la tabella una nota dice quando hai esportato e con quali filtri della pagina. Se sei un Client il file contiene solo le righe dei tuoi contratti.',
  only(['Client'], 'Per te l’Excel è solo di consultazione: non puoi caricare né riallineare i dati, e per questo nella barra in alto non vedi «Carica Excel», «Allinea Dati» né «Annulla ultimo Align». I dati che vedi sono limitati ai contratti che ti sono stati assegnati.'),
  only(['Editor', 'Developer'], 'Puoi esportare l’Excel, ma non caricare né riallineare i dati: «Carica Excel», «Allinea Dati» e «Annulla ultimo Align» sono riservati agli amministratori. Se serve aggiornare i dati dall’Excel ufficiale, chiedilo a un Admin.'),
  only(ADMIN, '«Carica Excel» (Admin e SuperAdmin) carica il file ufficiale sul server. Da solo non cambia i dati in tabella: li cambia «Allinea Dati».'),
  only(ADMIN, '«Allinea Dati» chiede conferma («Riallineare i dati MEV con l’Excel ufficiale?») e importa il file caricato. Le modifiche inserite a mano nei campi PMO (P Anno, P Release, P Importo, P Note, Note CAP) vengono preservate. Attendi la conferma di completamento prima di iniziare altre modifiche.'),
  only(ADMIN, '«Annulla ultimo Align» compare solo se esiste un allineamento da annullare ed ELIMINA tutte le righe inserite o aggiornate dall’ultimo «Allinea Dati»: se l’ultimo allineamento ha caricato l’intero elenco, si svuota tutto il contratto e l’operazione non si può annullare. Prima di premerlo esporta l’Excel come copia, e usalo solo subito dopo un allineamento sbagliato. Il server accetta questa operazione solo da Admin e SuperAdmin.'),
], 'L’allineamento è un’operazione diversa dal salvataggio delle modifiche manuali: le due cose non si sostituiscono. In MEV-CAP «Carica Excel» è disponibile solo all’Admin; «Allinea Dati» invece compare a tutti: chiede comunque conferma prima di partire.');
export const PAGE_MANUALS = {
  mev: { title: 'MEV', summary: 'Consulta le iniziative, filtra importi e ordini e aggiorna i campi di pianificazione disponibili.', chapters: [
    chapter('Cosa trovi nella pagina', 'Il quadro economico delle iniziative del contratto', [
      'La pagina «MEV · Quadro economico» elenca le iniziative del contratto che hai selezionato nella barra in alto. Se cambi contratto, l’elenco cambia: controlla sempre quale è attivo prima di leggere gli importi.',
      only(['Client'], 'Vedi solo le iniziative dei contratti che ti sono stati assegnati. Se un’iniziativa che cerchi non c’è, non è un errore della pagina: non rientra nei contratti a te abilitati; chiedi a un Admin.'),
      'In alto trovi quattro totali che seguono i filtri: «Totale Fornitura», «Totale ODA», «Da Ordinare» e «Totale SUBCO». «Da Ordinare» è Totale Fornitura meno Totale ODA, cioè quanto della fornitura non è ancora stato ordinato (negativo se l’ordinato supera la fornitura). I totali sommano le righe filtrate: se togli un filtro cambiano.',
      'Ogni riga è un’iniziativa. Le colonne principali sono ID, GoTo, Applicativo, Descrizione, Anno, Stato, «Importo CAP», ODA, RDA, «Importo ODA», Subco, «Imp. Subco» (importo della subfornitura) e i campi di pianificazione PMO (P Anno, P Release, P Importo, P Note, Note CAP).',
      'Clicca su una riga (fuori dai campi modificabili) per aprire la scheda dell’iniziativa: è in sola lettura, per tutti i ruoli. Mostra identificazione, responsabili (PM Poste, PM CAP), mandataria/mandante e subco, release, stato e contratto. Si chiude con «×».',
    ], accessNote),
    tableChapter,
    chapter('Pianificazione e salvataggio', 'Aggiornare i campi PMO senza perdere le modifiche', [
      'Cinque campi della riga si scrivono direttamente nella tabella: «P Anno», «P Release», «P Importo», «P Note» e «Note CAP». Gli altri sono dati dell’Excel ufficiale e si leggono soltanto.',
      'Dopo aver scritto, premi «Salva» sulla stessa riga: diventa «✓» quando il salvataggio è confermato. La sola digitazione non è un salvataggio: se cambi pagina prima di salvare, la modifica si perde.',
      only(['Client'], 'Nella pagina i campi PMO risultano modificabili anche per te: usali solo se è previsto dal tuo lavoro. Le modifiche sono visibili a tutti gli utenti di quel contratto.'),
      'I campi PMO inseriti a mano vengono preservati quando un amministratore riallinea i dati dall’Excel ufficiale: non servono a correggere l’Excel, ma a pianificare.',
      'Verifica l’iniziativa e l’importo prima di passare ad altre pagine.',
    ], 'I valori PMO sono stime di pianificazione: non cambiano gli importi dell’Excel ufficiale («Importo CAP», «Importo ODA»).'),
    alignChapter,
  ] },
  mevcap: { title: 'MEV-CAP', summary: 'Gestisci i dettagli delle iniziative, i responsabili, le associazioni e le quantità TOW.', chapters: [
    chapter('Cosa trovi nella pagina', 'La vista operativa delle iniziative', [
      'La pagina «MEV-CAP · Gestione attività» mostra le stesse iniziative di MEV con più dettaglio: responsabili (PM Poste, PM CAP), release, tipo contratto, ODA/RDA, mandataria/mandante, subco e le quantità TOW (TOW01–TOW06 e totale).',
      'I totali in alto seguono i filtri. A differenza di MEV, «Totale Fornitura» somma solo le iniziative in stato Approvato, mentre «Totale ODA» somma tutte quelle filtrate: per questo «Da Ordinare» (Totale Fornitura meno Totale ODA) può risultare negativo.',
      'La tabella è di sola lettura: per modificare un’iniziativa clicca sulla riga e apri la scheda.',
    ], accessNote), tableChapter,
    chapter('Scheda iniziativa', 'Aprire, modificare e salvare', [
      'La scheda si chiama «Modifica MEV» e si apre cliccando la riga. È divisa in sezioni: Identificazione, Responsabili, Release, Stato e Contratto, TOW Offerta, Importi, Partecipazione (Mandataria/Mandante e SUBCO), Extra, Note e PMO Poste.',
      'Nella sezione «Partecipazione» il campo «Mandataria / Mandante» elenca le società che partecipano (Capgemini, IET…). Le SUBCO, come Levia HUB, si scelgono nel campo SUBCO accanto e non compaiono qui. Se togli una società e salvi, alla riapertura non ricompare. Nei file Excel storici la partecipazione è una «x»: l\'app la riconosce cercando il ruolo (Mandataria o Mandante) nella tabella «RTI & SUBCO», non il numero di riga.',
      'Il campo «ID» è in sola lettura. «Importo ODA», «Importo Fornitura», «Importo Scontato», «Fatturato» e «Residuo Fatt.» sono calcolati dal programma: non si scrivono, si aggiornano quando cambi le quantità TOW.',
      'Premi «✔ Salva modifiche» e attendi l’esito; «✕ Annulla» chiude la scheda senza salvare. «Elimina GoTo» (con il cestino) cancella l’iniziativa e chiede conferma: non si annulla.',
      only(['Client'], 'La scheda si apre e si può salvare anche con il tuo ruolo. Poiché modifica i dati di tutti gli utenti del contratto, usala con attenzione e solo se rientra nel tuo lavoro.'),
      '«Nuovo GoTo» (in fondo alla barra degli strumenti) apre la stessa scheda vuota (titolo «Nuovo GoTo»): «Applicativo» e «Descrizione» sono obbligatori e il pulsante diventa «✚ Crea GoTo». Verifica il contratto attivo prima di creare.',
    ], 'Il ricalcolo dai TOW dipende dalla disponibilità di prezzi affidabili per l’ambiente. Una voce a catalogo può richiedere un importo anziché una quantità.'), alignChapter,
  ] },
  contratti: { title: 'Contratti', summary: 'Consulta contratti e pianificazione delle release nell’ambiente selezionato.', chapters: [
    chapter('Consultare i contratti', 'Valori, ordinato e residuo per servizio e TOW', [
      'La pagina riassume il contratto attivo (barra in alto): per ogni servizio mostra «Valore Totale», «Approvato», «Ordinato», «Impegnato» e «Residuo». Se cambi contratto, cambiano tutti i valori.',
      'Le righe «Servizi a Task e Collaudo» e «Servizi a Canone» si espandono: dentro trovi il dettaglio per TOW con valore unitario, valore totale, quantità e quantità approvate e residue. I tre grafici a torta («Totale Servizi», «Servizi a Task e Collaudo», «Servizi a Canone») mostrano come si ripartisce il valore.',
            '«↺ Ricalcola» rilegge dalle iniziative i valori ordinato, impegnato e residuo e aggiorna la pagina. Usalo dopo che le iniziative o gli ordini sono cambiati; non modifica le iniziative.',
      'I dati contrattuali e le associazioni guidano le altre pagine: usa codici coerenti con quelli delle iniziative.',
    ], accessNote),
    chapter('Pianificazione Release', 'Organizzare le attività nel tempo', [
      'In fondo alla pagina, nella sezione «Pianificazione Release», trovi le release pianificate del contratto con le loro date.',
      '«+ Nuova release» ne aggiunge una; «↑ Importa Excel» ne carica più di una da un file; «↻» ricarica l’elenco. Sulla riga, «✏» modifica e «✕» elimina (chiede conferma).',
      'Per modificare una release cambia i campi e conferma con «Salva»; per uscire senza cambiare usa «Annulla».',
      only(['Client'], 'Nel programma questi comandi risultano disponibili anche per te: modificano il calendario condiviso del contratto, quindi usali solo se rientra nel tuo lavoro.'),
      'Verifica la coerenza tra release pianificate e assegnazione delle iniziative. La pianificazione non sostituisce l’aggiornamento dei dati delle singole MEV.',
    ]),
  ] },
  contratti_interni: { title: 'Ordini', summary: 'Consulta ordini, buoni di consegna e iniziative collegate.', chapters: [
    chapter('Leggere la tabella', 'Contratti, ordinato e da ordinare', [
      'La pagina è di sola consultazione: non ci sono pulsanti di modifica, per nessun ruolo.',
      'La prima tabella elenca i contratti con «Tipo Contratto», «RIF. Contratto», «Imp. Lordo», «Importo Netto», «Ordinato», «Da Ordinare», «Avanzato» e «Da Avanzare». «Da Ordinare» è la parte di importo non ancora ordinata; «Da Avanzare» quella non ancora avanzata.',
      'Clicca su un contratto per aprire i livelli sotto: anno e poi BC (buono di consegna). Per ogni BC vedi RDA, AT ID, «Imp. Fornitura», «Ordinato (BdO)», «Fatturato» e «Da fatturare».',
    ], accessNote),
    chapter('Controllo operativo', 'Usare correttamente le informazioni', [
      'Verifica il contratto attivo prima di consultare gli ordini: i valori sono riferiti al contratto selezionato in alto.',
      'Controlla il livello del dato: contratto, buono di consegna e singola MEV non sono la stessa entità, e gli importi non vanno sommati tra livelli diversi.',
      'Confronta anno e importi con le MEV collegate; un riferimento diverso può indicare un’associazione da controllare.',
      only(ADMIN, 'Per acquisire ordini e verbali non si usa questa pagina: usa «Gestione Ordini» (Strumenti), disponibile agli amministratori.'),
    ]),
  ] },
  reportavanzamenti: { title: 'Report Avanzamenti', summary: 'Monitora le attività per release e aggiorna gli avanzamenti autorizzati.', chapters: [
    chapter('Selezionare la release', 'Definire il perimetro del report', [
      'In alto scegli la «Release» (oppure «— Tutte le release —»). Il riepilogo mostra «GoTo in release», «Approvati» e «Importo Fornitura» della release scelta.',
      'La tabella elenca le attività con GoTo, titolo, sistemi, PM Poste, PM CAP, stato, importo e mandataria/mandante, e barre di avanzamento per Requisito, Analisi, Progettazione e Sviluppo, con la «Data Aggiorn.».',
      'Clicca su un’attività per aprire il dettaglio. In alto a destra «Chiudi» torna all’elenco.',
      only(['Client'], 'Il dettaglio di un’attività è per te di sola lettura: puoi consultare gli avanzamenti ma non cambiarli.'),
    ], accessNote),
    chapter('Il dettaglio di un’attività', 'Dati MEV e avanzamento', [
      'Il dettaglio ha una sezione «Dati MEV» (anagrafica: GoTo, sistema, PM, importo, mandataria/mandante), sempre in sola lettura, e le sezioni di avanzamento: «Avanzamento attività» (percentuali), «Documenti e aggiornamenti» (HLD, AFU, ICD, Manuale Utente, RN/Man Inst, Unit Test, note) e «Pianificazione e rilasci» (Drop Deploy Collaudo, Data T0, Deadline).',
      only(['Client', 'Editor', 'Developer', 'Bid Manager'], 'Ogni sezione di avanzamento porta il distintivo «Sola lettura»: puoi consultarla ma non modificarla. Le modifiche agli avanzamenti sono riservate agli amministratori.'),
      only(ADMIN, 'Le sezioni di avanzamento portano il distintivo «Modificabile»: scrivi i valori e usa «Salva» nella scheda. «🗑 Elimina dati riga» cancella i dati di avanzamento di quella attività e chiede conferma.'),
      'Dopo il salvataggio controlla l’attività nel report e la release selezionata.',
    ]),
    chapter('Release e importazione', 'Gestire dati senza confondere i perimetri', [
      '«+ Nuova» crea una nuova release. «Importa da Excel» (con una release selezionata) legge i valori di avanzamento da un file: li mostra come modifiche da salvare, e solo «Salva tutto» li scrive. Controlla il file e la release rilevata prima di confermare.',
      only(['Client', 'Editor', 'Developer', 'Bid Manager'], 'Anche per il tuo ruolo «+ Nuova» e «Importa da Excel» risultano disponibili. Poiché «Salva tutto» scrive sui dati condivisi, usali solo se è previsto dal tuo lavoro.'),
      only(ADMIN, 'Con una release selezionata puoi anche rinominarla (✏ «Rinomina release») o toglierla dal calendario (🗑 «Elimina release dal calendario»: non cancella i dati di avanzamento). «🗑 Elimina dati» cancella i dati di avanzamento della release scelta, o di tutte: leggi con attenzione la conferma, sono operazioni distinte.'),
    ], 'Rimuovere gli avanzamenti di una release ed eliminare la release dal calendario sono operazioni diverse. «Salva tutto» compare solo quando ci sono modifiche in sospeso.'),
  ] },
  chart: { title: 'Grafici', summary: 'Esplora la distribuzione delle iniziative per release, applicativo e anno.', chapters: [
    chapter('Leggere i grafici', 'Una sintesi dei dati MEV', [
      'La pagina «Grafici» è di sola lettura per tutti i ruoli. Mostra le iniziative del contratto attivo raggruppate per «Release», «Applicativo» o «Anno»: scegli il raggruppamento con le tre schede in alto.',
      'In cima ci sono gli indicatori «Approvato», «In Approvazione», «In Analisi / Stima», «Ordinato» e «Impegnato». Le caselle degli stati scelgono quali stati sommare; il pulsante di selezione di tutti li riattiva.',
      '«Ordina per» cambia l’ordine delle righe: per importo decrescente oppure per nome del raggruppamento scelto. L’ultima riga, «Totale complessivo», somma tutto.',
      only(['Client'], 'I grafici si basano sulle iniziative caricate dalla pagina MEV: se non vedi dati, apri prima MEV e poi torna ai grafici.'),
      'Per verificare una singola iniziativa o modificarne i dati apri MEV o MEV-CAP. I grafici sono una sintesi e non sostituiscono il dettaglio operativo.',
    ], accessNote),
  ] },
  team: { title: 'Gestione Team', summary: 'Consulta e gestisci le risorse del team nel contratto attivo.', chapters: [
    chapter('Risorse del team', 'Anagrafica e costi', [
      'In alto trovi tre indicatori: «Costo al giorno», «Costo al mese» e «Risorse attive». Sotto, le risorse sono divise in «Team Attivo» e «Team Destaffato» (quest’ultimo si apre e si chiude). Il campo di ricerca cerca per risorsa, ambito e specialità.',
      'Ogni riga mostra Risorsa, Ambito, Poste App., GRADE, ADRC (€), COR (€), «% Impegno», Corp ID, data ingresso e data uscita. Clicca una riga per aprire la scheda.',
      only(['Client'], 'La pagina ti è stata assegnata: vedi le risorse del contratto e i costi. Nel programma i comandi di modifica risultano disponibili anche per il tuo ruolo; i dati sono condivisi con tutto il team, quindi modificali solo se rientra nel tuo lavoro.'),
    ], accessNote),
    chapter('Aggiungere, modificare, importare', 'Tenere l’anagrafica aggiornata', [
      '«+ Nuovo membro» apre la scheda vuota; cliccando una riga si apre «Modifica membro». I campi sono Risorsa, Ambito, Specialità, Poste Application, GRADE, CDC, Practice, ADRC (€), COR (€), «% Impegno», Corp ID, e-mail, date di ingresso e uscita e note. Salva e verifica la risorsa nell’elenco.',
      'Per togliere una risorsa dal team attivo compila la data di uscita: passa al «Team Destaffato» e i costi attivi si ricalcolano. «🗑 Elimina» la cancella del tutto e chiede conferma («Elimina risorsa»): non si annulla.',
      '«📥 Importa Excel» carica più risorse da un file: controlla l’anteprima e l’esito prima di proseguire.',
    ]),
  ] },
  consumotow: { title: 'Gestione TOW', summary: 'Configura contratti operativi, quantità, prezzi e associazioni TOW.', chapters: [
    chapter('Contratti e TOW', 'Dati che alimentano i calcoli', ['Verifica l’ambiente e il contratto operativo selezionato.', 'Consulta le righe TOW e distingui quantità, prezzo unitario, sconto e flag “A catalogo”.', 'Nelle righe a catalogo il valore può rappresentare un importo complessivo: controlla l’etichetta del campo prima di inserirlo.'], accessNote),
    chapter('Modifiche e verifiche', 'Mantenere coerenza con le iniziative', ['Usa i comandi di creazione e modifica previsti per contratti e righe.', 'Salva le modifiche e verifica che codici TOW e nome del contratto coincidano con le associazioni usate nelle iniziative.', 'Le percentuali di impatto del configuratore sono diverse dal prezzo unitario e dallo sconto: verifica ogni valore nella sezione dedicata.']),
  ] },
  tools: { title: 'Strumenti', summary: 'Acquisisci e gestisci i documenti operativi e le associazioni disponibili.', chapters: [
    chapter('Scegliere lo strumento', 'Documenti, ordini e verbali', ['Verifica contratto/ambiente, poi apri il pannello relativo al documento o all’operazione.', 'Seleziona il file o inserisci i riferimenti richiesti. Controlla i dati estratti prima di confermare.', 'Per ordini, verbali e associazioni Subco verifica sempre riferimenti e iniziative coinvolte.'], accessNote),
    chapter('Confermare i risultati', 'Controllare acquisizione e associazioni', ['Attendi l’esito dell’elaborazione o del salvataggio.', 'Controlla che il documento sia collegato al contratto e all’iniziativa corretti.', 'Se l’operazione fallisce, leggi il messaggio prima di ripetere il caricamento per evitare duplicazioni.']),
  ] },
  gara: { title: 'Gare', summary: 'Gestisci documenti di gara, lotti, offerta e trasferimento dei dati contrattuali.', chapters: [
    chapter('Aprire una gara', 'Documenti e lotti', ['Apri una gara dall’elenco o creane una nuova se autorizzato.', 'Carica i documenti nei campi corretti: capitolato, listini TOW, cataloghi e offerta economica non hanno lo stesso ruolo.', 'Esegui l’analisi e controlla sezioni, lotti, voci e messaggi di estrazione.'], accessNote),
    chapter('Verifica economica e contratto', 'Dai documenti al sistema', ['Controlla la distinzione fra base d’asta e prezzi offerti.', 'Verifica i dati di ogni lotto prima di trasferire la gara in un contratto dell’Archivio.', 'Dopo il trasferimento controlla catalogo e listino nell’Archivio Contrattuale: non assumere che dati mancanti siano stati ricostruiti.']),
  ] },
  superadmin: { title: 'Archivio Contrattuale e accessi', summary: 'Consulta cataloghi e listini per lotto e gestisci collegamenti ai contratti MEV e accessi degli utenti.', chapters: [
    chapter('Archivio contrattuale', 'Cataloghi, documenti e prezzi per lotto', ['Scegli il contratto nell’elenco dell’Archivio. Consulta le sezioni Lotti e prezzi, Documenti, Collegamenti MEV e Contratti e Accessi.', 'Apri il lotto per consultare Voci Catalogo e prezzi TOW. Distingui prezzi unitari, quantità contrattuali, pesi e percentuali di impatto del configuratore.', 'Per un nuovo contratto usa l’importazione dai documenti o dalla gara prevista dalla pagina. Dopo il caricamento verifica il numero di voci e prezzi disponibili.', 'Controlla il collegamento al codice contratto MEV: il nome del contratto archiviato non coincide necessariamente con il codice dell’ambiente.']),
    chapter('Voci di catalogo offerti', 'I prezzi dopo l’aggiudicazione, accanto a quelli di gara', [
      'Le voci di catalogo caricate dai documenti di gara hanno i prezzi della base d’asta. Dopo l’aggiudicazione valgono i prezzi offerti, con gli sconti: si gestiscono nella sezione «Voci di catalogo offerti» del contratto, con una scheda per lotto, e restano accanto al catalogo di gara, che non viene modificato. In cima alla scheda vedi il riepilogo: voci di gara, voci offerte, ultimo aggiornamento e chi lo ha fatto.',
      'Il caricamento da Excel è chiuso finché non lo apri: premi «Carica catalogo» (se il catalogo offerto non c’è ancora) oppure «Aggiorna catalogo» (se c’è già). Si apre un riquadro con tre passi, che si richiude con «Chiudi», con «Annulla» o dopo il salvataggio.',
      'Passo 1, «Prepara il file Excel». Hai già il foglio del catalogo con i prezzi offerti (colonne «ID di catalogo», «Nome Driver», «P. OFFERTO REALIZZAZIONE», «PREZZO OFFERTO MODIFICA» e, se ci sono, «Descrizione Driver», «Descrizione semplice», «Descrizione medio», «Descrizione complesso»)? Caricalo così com’è: le altre colonne, come quantità, totali e percentuali, vengono ignorate; le descrizioni vengono salvate con i prezzi. La «Descrizione Driver» del file sostituisce quella di gara nel catalogo con cui si lavora (se la cella è vuota resta quella di gara); il catalogo di gara non viene modificato e rimuovendo il catalogo offerto torna la descrizione originale.',
      'Altrimenti premi «Scarica il modello Excel»: il file contiene già ID, ambito e nome di ogni voce di gara. Nel foglio «CatalogoOfferto» scrivi il prezzo offerto nelle celle gialle (Realizzazione e Modifica, Semplice, Medio e Complesso). Accanto ai prezzi ci sono quattro colonne facoltative, «Descrizione Driver», «Descrizione Semplice», «Descrizione Medio» e «Descrizione Complesso»: compilale se vuoi una descrizione dettagliata della voce (quella del driver sostituisce la descrizione di gara; lasciata vuota resta quella di gara). Il foglio «BaseAsta» mostra prezzi e descrizione di gara solo per confronto; il foglio «Istruzioni» riassume le regole.',
      'Non cambiare ID, intestazioni, nomi dei fogli né le righe: servono tutte le voci del lotto. Se in gara una voce ha prezzo 0 lascia la cella vuota; in tutti gli altri casi il prezzo offerto è obbligatorio. Scrivi importi positivi o zero, senza il simbolo €.',
      'Passo 2, «Scegli il file e controllalo»: premi «Scegli il file Excel» e poi «Controlla il file». Non salva nulla: mostra il formato riconosciuto, gli errori riga per riga (ID inesistente o doppio, voce mancante, prezzo mancante o non valido) e, se è corretto, il confronto tra prezzo di gara, prezzo offerto e sconto. Nome e ambito diversi da quelli di gara vengono solo segnalati: restano quelli di gara. Un prezzo offerto più alto della base d’asta non blocca il salvataggio ma viene segnalato.',
      'Passo 3: con «Salva il catalogo offerto» il catalogo sostituisce l’eventuale precedente. Un file con anche un solo errore non viene salvato. «Rimuovi il catalogo offerto» riporta il lotto ai prezzi di gara.',
      'Dopo l’import compare la tabella «Catalogo offerto caricato» con tutte le voci, nell’ordine ID, Ambito, Voce, Descrizione Driver, Descrizione Semplice, Descrizione Medio, Descrizione Complesso, poi i prezzi Realizzazione e Modifica (Semplice, Medio, Complesso). ID, Ambito e Voce sono quelli di gara e non si modificano; descrizioni e prezzi offerti sì, direttamente nelle celle. Sotto ogni prezzo vedi la base d’asta. Le celle cambiate si colorano di giallo e «Salva le modifiche» le salva tutte insieme con gli stessi controlli dell’import (prezzo mancante, non valido o negativo, descrizione oltre 2000 caratteri). «Annulla le modifiche» ripristina i valori salvati.',
      'Se un altro utente ha salvato il catalogo mentre lo modificavi, il salvataggio viene rifiutato e non scrive nulla: ricarica la tabella e rifai le modifiche.',
      'Le descrizioni per complessità («Descrizione per complessità (dal catalogo offerto)») compaiono sotto la voce in «Voci di catalogo» e nel dettaglio della voce nel Configuratore.',
      'Da quel momento il Configuratore e Sviluppo usano i prezzi offerti per le nuove voci. Le iniziative già salvate non cambiano da sole: aprendole nel Configuratore compare «Riallinea ai prezzi offerti», con l’anteprima dei totali e la conferma.',
    ], 'La stessa sezione è disponibile all’Admin dalla Home («Voci di catalogo offerti»), limitata ai lotti del suo contratto.'),
    chapter('Eliminare o unire un contratto', 'Spostare i dati utili prima di cancellare un duplicato', [
      'Un contratto può comparire due volte, ad esempio perché è stato importato a mano con i PDF e poi di nuovo dalla gara. Sotto il titolo dell’Archivio compare «Possibile duplicato» quando due contratti hanno gli stessi lotti e lo stesso catalogo; sul contratto compare «Dati incompleti» se un lotto attivo non ha prezzi TOW o catalogo.',
      'Apri il contratto che vuoi togliere e premi «Elimina contratto…». Non cancella subito: si apre una finestra in cui scegli quale contratto resta (di solito quello completo, già proposto) e vedi, riga per riga, cosa verrebbe spostato. Tra i contratti che possono restare c’è anche quello di sistema, indicato «(contratto di sistema)»: può ricevere i dati, anche se lui non si può eliminare.',
      'Per ogni lotto la finestra dice se viene «aggiunto» (non esiste nel contratto che resta), «completato» (si riempie solo ciò che manca: listino TOW, catalogo, percentuali di impatto, nome dei file, codice contratto) o «resta com’è» (il contratto che resta ha già tutto). I dati del contratto che resta non vengono mai sovrascritti né svuotati.',
      'Anche gli applicativi condivisi del contratto da eliminare passano all’altro, confrontati per codice e nome: quelli già presenti non si duplicano. Le valutazioni del Configuratore che avevano usato come catalogo il contratto da eliminare vengono ricollegate a quello che resta; il resto della valutazione non cambia.',
      'Spunta «Ho letto cosa succede e voglio procedere» e premi «Sposta i dati ed elimina il contratto» (oppure «Elimina il contratto» se non c’è nulla da spostare). L’operazione è unica: o riesce tutta oppure non cambia niente, anche in caso di errore.',
    ], 'L’eliminazione non si può annullare. Il pulsante resta spento se il contratto non si può togliere: è il contratto di sistema (quello può solo ricevere dati, mai essere eliminato), non esiste un altro contratto che resti, oppure sotto il contratto sono salvati dati che l’unione non sa spostare (la finestra li nomina: spostali o eliminali prima).', {
      fields: { caption: 'Il contratto di sistema', rows: [
        ['Che cos’è', 'Il contratto «Poste Italiane – Tracciatura e Logistica Integrata» (identificativo poste-tet-2025). È un contratto come gli altri: sta nell’Archivio contrattuale, con i suoi lotti, prezzi TOW e catalogo, ed è marcato «Contratto di sistema».'],
        ['Perché non si elimina', 'È il contratto da cui partono le iniziative e le revisioni più vecchie. Può però ricevere i dati di un duplicato.'],
        ['Compare due volte?', 'No: nel Configuratore c’è una sola voce. Se l’Archivio non contiene il contratto di sistema, l’app mostra una «copia di riserva» chiaramente indicata, solo per poter aprire lavori vecchi.'],
        ['Quale uso per le mie iniziative?', 'Quello collegato al codice contratto del tuo ambiente: l’app lo sceglie da sola. Se non è collegato nessun lotto, scegli tu il contratto e il lotto.'],
      ] },
    }),
    chapter('Ripara i collegamenti ai contratti', 'Quando una revisione non si apre perché il suo catalogo non c’è più', [
      'Se una revisione dell’analisi o una valutazione salvata si apre con il messaggio «Questa revisione non si può aprire perché il contratto usato … non esiste più», non è stato perso nulla: il lavoro corrente è conservato e la revisione è intatta. Succede quando il contratto da cui prendeva il catalogo è stato eliminato.',
      'In cima all’elenco dell’Archivio, se ci sono collegamenti rotti, compare un avviso con quanti sono («6 revisioni e 2 valutazioni salvate fanno riferimento a un contratto che non esiste più») e il pulsante «Ripara i collegamenti…».',
      'Nella finestra scegli il contratto da cui prendere il catalogo (quello con i prezzi è già proposto) e leggi l’anteprima: quante revisioni e valutazioni verranno ricollegate e quali iniziative sono coinvolte. Spunta «Ho letto cosa succede e voglio procedere» e premi «Ricollega».',
      'Cambia soltanto il riferimento al catalogo: decisioni, documenti, stima e lotto di ogni revisione restano come sono. Se il contratto scelto non ha il lotto che la revisione usava, il pulsante resta spento e la finestra dice quale lotto manca, senza indovinare.',
      'Da ora, quando elimini un contratto con «Elimina contratto…», le revisioni che lo usavano vengono ricollegate in automatico a quello che resta: la riparazione serve solo per i collegamenti già rotti.',
    ], 'L’operazione è unica: o riesce tutta oppure non cambia niente. Se la finestra non compare il backend non è aggiornato; se compare un errore, nulla è stato modificato.'),
    chapter('Contratto MEV e utenti', 'Accessi al contesto operativo', ['Seleziona un contratto MEV oppure crealo con il comando dedicato.', 'Consulta gli utenti associati e assegna i ruoli previsti dal sistema.', 'Verifica che ciascun utente abbia solo i ruoli necessari nel contratto corretto; il ruolo operativo può cambiare tra ambienti.'], accessNote),
  ] },
  admin: { title: 'Gestione Utenti e Funzioni', summary: 'Crea e gestisci gli account, i ruoli e le funzioni abilitate a ciascun ruolo.', chapters: [
    chapter('Utenti e ruoli', 'Creare un account e assegnare i ruoli', [
      'La scheda «Utenti e Ruoli» ha in alto il modulo «Nuovo Utente»: Username, Nome Completo, Email, Password e Ruolo. Il ruolo scelto qui è quello dell’account; i ruoli effettivi dell’utente si assegnano poi sul contratto.',
      'Sotto, l’«Elenco utenti» mostra ruolo, stato, ultima attività e le azioni: attiva/disattiva, «Storico accessi», «API Key», «Modifica», «Elimina» e il cambio password. Eliminare chiede conferma ed è definitivo.',
      'Nella tabella puoi cambiare il ruolo principale e aggiungere ruoli extra con le caselle. Un utente con più ruoli ottiene ciò che almeno uno dei suoi ruoli permette: assegna solo quelli necessari.',
      only(ADMIN, 'Per un utente con ruolo Client compare il pulsante «Gestisci permessi pagine e contratti»: apre «Pagine visibili» (quali card vede il Client) e «Contratti visibili» (a quali contratti ha accesso). Salva con «Salva Permessi».'),
      only(['SuperAdmin'], 'Solo tu vedi il pulsante del tema («Chiaro»/«Scuro») accanto all’utente.'),
    ], accessNote),
    chapter('Funzioni e permessi per ruolo', 'Quali app può vedere e modificare ogni ruolo', [
      'La scheda «Funzioni e Permessi App» contiene la tabella «Configurazione accessi per sotto-applicazione»: per ogni app (MEV, MEV-CAP, Contratti TOW, Contratti Interni, Grafici, Report Avanzamenti, Ordini Consegna, Consumo TOW, Tools, Gare, Configuratore, Sviluppo iniziative, Gestione Team) e per ogni ruolo ci sono le colonne «Vista» e «Modifica».',
      'Togliere «Vista» nasconde l’app a quel ruolo e toglie anche «Modifica». SuperAdmin ha sempre accesso completo e non è configurabile. Premi «Salva permessi» per applicare.',
      'La tabella vale per il ruolo che l’utente ha sul contratto. Quando assegni i contratti a un utente con account Client, sul contratto riceve il ruolo Client; i ruoli già assegnati a mano restano. Un utente con più ruoli ottiene ciò che almeno uno dei suoi ruoli permette: se un Client vede più pagine del previsto, controlla che sul contratto non abbia anche Editor.',
      'Importante: nell’interfaccia la colonna «Modifica» non blocca i pulsanti delle pagine. Per limitare davvero chi scrive, agisci sulla colonna «Vista» e sulle pagine assegnate ai Client.',
    ]),
  ] },
  dbconfig: { title: 'Configurazione database', summary: 'Consulta e gestisci la configurazione di connessione prevista dall’app.', chapters: [
    chapter('Impostazioni applicazione', 'Parametri operativi dell’app', ['Apri la scheda Impostazioni Applicazione per consultare i parametri disponibili.', 'Verifica il significato dei campi e salva solo modifiche concordate con chi gestisce l’ambiente.', 'Le impostazioni di applicazione sono diverse dalla configurazione della connessione database.']),
    chapter('Configurazione', 'Verificare la destinazione dei dati', ['Controlla l’ambiente prima di consultare o aggiornare la configurazione.', 'Usa solo i campi e i comandi presenti nella pagina e attendi la conferma di verifica o salvataggio.', 'Non condividere password o stringhe di connessione nei documenti operativi o nei messaggi di assistenza.'], accessNote),
  ] },
  sviluppo: { title: 'Sviluppo iniziative', summary: 'Trasforma una valutazione del Configuratore in schede per attività, progetto di avvio, file generati e richiesta di modifica codice.', chapters: [
    chapter('Introduzione e sequenza', 'A cosa serve e in che ordine si lavora', [
      'Accedi con un ruolo Developer o SuperAdmin: sono i soli che vedono «Sviluppo iniziative» nella Home. Prima di aprirla, nel Configuratore, la valutazione deve essere stata salvata (passo Revisione → «Salva valutazione», oppure «Salva e vai a Sviluppo →»).',
      'Dalla Home apri «Sviluppo iniziative». Nell’elenco «Iniziative valutate» cerca per GOTO, titolo o sistema e clicca la riga. Se hai modifiche non salvate su un’altra iniziativa l’app lo chiede: «Aprire un’altra iniziativa?».',
      'Se l’iniziativa è nuova si apre la fase Fonti, altrimenti la fase Schede. In alto vedi sempre il riquadro «Prossimo passo»: indica la prima cosa da fare e il pulsante «Vai a … →» ti porta nella fase giusta.',
      'Lavora le fasi nell’ordine consigliato: 1 Fonti → 2 Schede → 3 Progetto (facoltativa) → 4 Codice (facoltativa) → 5 Consegna → 6 Verifica. Non sono bloccate: puoi saltare avanti e tornare indietro con la barra in alto o con i pulsanti in fondo alla pagina.',
      'Il pulsante «Mostra le regole della fase» spiega a cosa serve la fase, cosa serve per completarla, cosa produce e quali regole vigono. L’avanzamento complessivo (in alto) considera solo Schede, Consegna e Verifica: Progetto e Codice sono facoltative e la cartella dei sorgenti, che si perde a ogni ricarica, non lo fa scendere.',
      'Salva spesso con «Salva sviluppo» (si attiva solo se ci sono modifiche). A fine lavoro usa «Salva e chiudi», che chiude solo se il salvataggio riesce, oppure «Chiudi senza salvare».',
    ], 'L’app prepara materiale (schede, ZIP, bozze di codice) e tiene traccia di cosa è stato fatto. Non scrive nel repository, non compila, non esegue test né deploy: lo fai tu in Visual Studio Code.', {
      intro: 'Sviluppo iniziative prende una valutazione già fatta nel Configuratore e la porta fino al codice. Per ogni riga di dettaglio dell’offerta crea una scheda tecnica (dove intervenire, come, come si accetta il risultato), aiuta a prepararla con l’AI leggendo i sorgenti, produce i pacchetti da dare a chi scrive il codice e raccoglie le evidenze che il lavoro è stato verificato. Si procede in sei fasi.',
      figure: { id: 'development', title: 'Figura 1 — Le sei fasi.', caption: 'Quali fasi contano nell’avanzamento, quando una scheda è «definita» e gli stati che attraversa.', alt: 'Il percorso ha sei fasi in sequenza: 1 Fonti, 2 Schede, 3 Progetto (facoltativa), 4 Codice (facoltativa), 5 Consegna, 6 Verifica. Nell’avanzamento complessivo contano Schede, Consegna e Verifica. Una scheda è «definita» quando ha tutti e tre: file coinvolti, soluzione tecnica e criteri di accettazione; una proposta AI da sola non la rende definita. Gli stati di una scheda sono, in ordine: Da analizzare, Soluzione definita, Pronta per sviluppo, In sviluppo, Da verificare, Verificata. «Pronta per sviluppo» richiede la scheda definita; «Verificata» richiede le evidenze; modificare una scheda verificata la riporta a «Da verificare». L’app non scrive nel repository, non compila e non esegue test o deploy.' },
    }),
    chapter('L’elenco delle iniziative', 'Cosa vedi e come lo leggi', [
      'L’elenco mostra le sole valutazioni salvate nel Configuratore per l’ambiente attivo. Un’iniziativa non salvata non compare: se è vuoto leggi «Nessuna iniziativa valutata in questo ambiente. Salva prima una valutazione nel Configuratore.».',
      'Ogni riga riporta il GOTO (o «Senza GOTO»), il titolo, il sistema, il numero di attività e la data di valutazione. La pillola di stato dice a che punto è lo sviluppo.',
      'Sotto la pillola vedi quante schede sono definite su quante e quante verificate, con una barra, e l’ultima attività («Ultimo lavoro: … ») con chi è collegato in questo momento. Il pulsante «↻ Aggiorna» ricarica l’elenco.',
    ], 'Il campo di ricerca filtra per GOTO, titolo e sistema; non ci sono altri filtri.', {
      fields: { caption: 'Le pillole di stato dell’elenco', rows: [
        ['Da avviare', 'Non esiste ancora uno sviluppo salvato per questa iniziativa («Nessuno sviluppo salvato»).'],
        ['Avviato', 'Lo sviluppo esiste ma nessuna scheda è ancora definita.'],
        ['In corso', 'C’è almeno una scheda definita o verificata.'],
        ['Verificato', 'Tutte le attività sono verificate.'],
      ] },
    }),
    chapter('Fase 1 · Fonti', 'Collegare il codice e leggere i vincoli', [
      'Controlla «Razionali e vincoli confermati»: sono le voci confermate nel Configuratore (passo Iniziativa), divise in razionali, vincoli e decisioni. Qui si consultano soltanto.',
      'Guarda «Applicativi dell’iniziativa» (se l’iniziativa ha un Sistema, accanto compare «· sistema …»). Sotto il nome dell’applicativo c’è il link al repository, se lo hai indicato in Configuratore: è facoltativo, perché il browser non può leggerlo e le cartelle si scelgono qui sotto. Gli applicativi dell’iniziativa sono quelli che hai scelto nel Configuratore con «+ Aggiungi applicativo…» più quelli nominati nel campo Sistema (anche più nomi separati da virgola: «IPERSUITE, IPER» li trova entrambi, e «IPER» non confonde IPERSUITE). Se nessuno corrisponde, l’app scrive il nome del contratto e del lotto in cui ha cercato e cosa manca: aggiungi il sistema come alias dell’applicativo giusto in Configuratore → «Risorse e configurazione» → «Applicativi e tecnologie».',
      'Premi «Seleziona cartella sorgenti» e scegli la cartella del repository. L’app ne conserva una copia in questo browser (solo file di codice; quelli di configurazione con una credenziale restano fuori): la ritrovi alla prossima visita senza riselezionarla e non viene caricata sul server.',
      'Per aggiornare o integrare premi «Aggiungi o aggiorna una cartella» e scegli di nuovo la cartella: l’app mostra quanti file sono nuovi, modificati, invariati o non più presenti e ne legge solo i nuovi e i modificati. Puoi poi scegliere «Aggiorna» (la copia diventa uguale alla cartella scelta), «Integra» (aggiunge e aggiorna senza togliere nulla, utile per una sottocartella o un secondo progetto) o «Tieni entrambe». La casella davanti al nome esclude una cartella dalle analisi senza cancellarla; «Rimuovi» la cancella dal browser, mai dal tuo disco.',
      'Verifica il messaggio sotto il pulsante: indica quanti file hai selezionato e quanti sorgenti sono presi in considerazione, oppure «Nessuna cartella: uso il profilo tecnico dell’applicativo». Senza cartella e senza profilo le proposte AI e la generazione di file non sono disponibili.',
    ], 'Le cartelle scelte restano salvate in questo browser e per questo utente: non vanno riselezionate. Se il browser è in finestra privata o blocca l’archivio, l’app lo dice e le cartelle durano solo finché la pagina è aperta. Proposte e schede salvate si consultano anche senza cartella.', {
      warnings: [
        ['«Nessun applicativo collegato».', 'Nel Configuratore apri Risorse e configurazione → Applicativi, crea l’applicativo e imposta il percorso dei sorgenti.'],
        ['«Razionali non disponibili».', 'Il servizio non ha risposto: Sviluppo continua a funzionare. Riapri l’iniziativa più tardi.'],
        ['Un collega ha confermato nuovi razionali.', 'Si leggono all’apertura: chiudi e riapri l’iniziativa per includerli.'],
      ],
    }),
    chapter('Razionali e vincoli dell’iniziativa', 'La conoscenza confermata nel Configuratore, usata ovunque', [
      'Nella fase Fonti trovi «Razionali e vincoli confermati»: le voci che il team ha confermato nel Configuratore (passo Iniziativa) per questa iniziativa, divise in razionali, vincoli e decisioni. Qui si consultano; per modificarle torna al Configuratore.',
      'Guidano il lavoro: sono incluse nelle richieste di «Prepara scheda con AI» e di «Genera codice», sono mostrate dentro ogni attività a cui si applicano (una voce collegata a un intervento vale per le sue attività, una generale per tutte) e finiscono negli ZIP in RAZIONALI_E_VINCOLI.md, nella richiesta JSON e nel progetto di avvio.',
      'Solo le voci confermate vengono usate. Se un vincolo rende impossibile una richiesta, la generazione dei file lo segnala come blocco. Se il servizio dei razionali non è disponibile, Sviluppo continua a funzionare e lo dice.',
      'I razionali si leggono quando apri l’iniziativa: se un collega ne conferma di nuovi mentre lavori, richiudi e riapri l’iniziativa per includerli.',
    ], 'Le voci non sostituiscono le verifiche: restano indicazioni del team, non prove che il codice le rispetti.'),
    chapter('Fase 2 · Schede, passo per passo', 'Compilare una scheda per ogni attività', [
      'Apri la fase Schede. Ogni attività è un riquadro apribile, uno alla volta, con cinque tappe: Requisito → Proposta AI → Scheda definita → File generati → Verificata. Sotto, «Prossimo passo» dice cosa fare.',
      'Filtra con i pulsanti degli stati (Tutte, Da analizzare, Soluzione definita, Pronta per sviluppo, In sviluppo, Da verificare, Verificata): accanto a ciascuno c’è il numero di schede.',
      'Leggi il «Requisito» (sola lettura) e, se ci sono, i razionali e vincoli confermati che valgono per quell’attività.',
      'Se hai selezionato la cartella, premi «Prepara scheda con AI»: l’AI legge un campione di sorgenti, scelti per le parole della descrizione dell’attività (anche le sigle corte), e scrive una proposta. Controlla soluzione, criteri e i «File e righe citati negli estratti». I riferimenti confermano dove si trovano nel campione, non che la soluzione sia corretta.',
      'Se la proposta ti convince premi «Inserisci bozza nella scheda» (chiede conferma e sostituisce file, soluzione e criteri correnti). Poi completa a mano i dettagli.',
      'Compila i quattro campi (tabella sotto), scegli lo «Stato di verifica» e salva con «Salva sviluppo».',
    ], '«Pronta per sviluppo» richiede la scheda definita (file, soluzione e criteri). «Verificata» richiede le evidenze. Se modifichi una scheda verificata senza cambiare lo stato, torna a «Da verificare».', {
      fields: { caption: 'I campi di una scheda', rows: [
        ['File coinvolti (uno per riga, percorso relativo)', 'I file da toccare, ad esempio src/main/java/…/Servizio.java. Servono per dire che la scheda è definita.'],
        ['Soluzione tecnica', 'Che cosa si modifica e come, in modo che un altro sviluppatore possa realizzarlo.'],
        ['Criteri di accettazione', 'Come si capisce che il lavoro è finito e corretto.'],
        ['Evidenze di verifica (test, comando, esito, commit)', 'Cosa hai eseguito e con quale esito. Obbligatorie per impostare «Verificata».'],
        ['Stato di verifica', 'Da analizzare, Soluzione definita, Pronta per sviluppo, In sviluppo, Da verificare, Verificata. Alcune voci sono spente finché mancano i requisiti.'],
      ] },
      warnings: [
        ['«Seleziona prima la cartella dei sorgenti».', 'La proposta AI legge il codice: scegli la cartella in Fonti o dal riquadro in cima alle schede.'],
        ['«Nessun file sorgente leggibile».', 'La cartella non contiene file di estensioni supportate (java, sql, xml, js, ts, json, md, cs…) oppure sono tutti esclusi (.git, node_modules, target, bin, obj, vendor, dist).'],
        ['«Risposta AI incompleta: la scheda corrente non è stata modificata».', 'L’AI non ha dato soluzione e criteri: riprova, la tua scheda non è stata toccata.'],
        ['Errore 404 nella preparazione.', 'Il backend non espone ancora l’endpoint AI: va aggiornato; non dipende dall’Excel.'],
      ],
    }),
    chapter('Schede: preparazione AI in blocco', 'Molte attività alla volta, senza perdere il lavoro fatto', [
      'Ogni riga di dettaglio ha una scheda: ad esempio un intervento con 29 righe produce 29 schede distinte. Filtra per stato con i pulsanti in alto, che mostrano anche quante schede hai in ciascuno. Ogni scheda mostra i cinque passaggi (Requisito, Proposta AI, Scheda definita, File generati, Verificata) e il prossimo passo da fare.',
      'Gli applicativi dell’iniziativa sono quelli scelti nel Configuratore con «+ Aggiungi applicativo…» più quelli nominati nel campo Sistema, confrontati con codice, nome e alias (ogni nome separato da virgola si cerca da solo, prima il nome esatto). Se un’iniziativa ha il Sistema vuoto ma un applicativo scelto, l’applicativo è comunque quello. Se non ne trova, la fase Fonti scrive il nome del contratto e del lotto in cui ha cercato e quali applicativi esistono: aggiungi il sistema come alias dell’applicativo corretto, oppure crealo, in Configuratore → Risorse e configurazione → Applicativi. Gli applicativi sono cercati sia nel catalogo scelto per la stima sia nell’ambiente attivo.',
      'Nel riquadro delle cartelle premi «Seleziona cartella sorgenti» (o «Aggiungi o aggiorna una cartella» se ne hai già salvate) e scegli la cartella del repository. La copia resta in questo browser e non va riselezionata a ogni visita; per aggiornarla o integrarla scegli di nuovo la cartella. Proposte e schede salvate si consultano anche senza cartella.',
      'Per molte attività usa la selezione in blocco: spunta le attività (oppure «Seleziona le visibili» o «Solo senza proposta») e premi «Prepara con AI le N attività selezionate». Ogni attività richiede comunque una richiesta AI propria, perché la proposta dipende dal suo requisito: viene condivisa solo la lettura dei sorgenti, che avviene una volta per cartella. Le richieste partono una alla volta, con avanzamento e «Ferma dopo questa».',
      'Il blocco salva solo la proposta AI: file, soluzione e criteri che hai già scritto non vengono toccati. Le attività con proposta sono saltate, salvo «Rigenera anche…», che la sostituisce. Se una richiesta fallisce le altre proseguono e puoi «Riprovare» quelle con errore; dopo tre errori consecutivi il blocco si ferma per non consumare la quota AI. Salva lo sviluppo al termine.',
      'Con le attività selezionate, «Inserisci bozza nelle N schede selezionate» copia soluzione, criteri e file citati dalla proposta AI nei campi modificabili. Salta le schede senza proposta, già compilate, con bozza già inserita, con file generati o in stato «In sviluppo», «Da verificare» o «Verificata»; l’elenco dei saltati indica il motivo. «Sostituisci anche le schede già compilate» consente di sovrascrivere il testo scritto a mano, ma non tocca mai le schede verificate, in sviluppo o con file generati.',
      'Le schede aggiornate restano «Da analizzare»: l’inserimento non le dichiara pronte né verificate. «Annulla l’inserimento» ripristina le schede com’erano, lasciando intatte quelle che hai ritoccato nel frattempo. Salva lo sviluppo per conservare il risultato.',
      'Inizia da una sola attività con “Prepara scheda con AI”: usa la descrizione e un campione di sorgenti (fino a 60 file letti e otto estratti inviati). Non è una scansione completa e non esegue compilazioni o test. Configura prima il servizio AI personale dal Profilo.',
      'Leggi soluzione, criteri, file e righe citati. I riferimenti sono controllati rispetto agli estratti inviati: confermano dove si trovano nel campione, non la correttezza della soluzione. Un file ipotizzato non è un file letto.',
      '“Inserisci bozza nella scheda” sostituisce file, soluzione e criteri correnti dopo conferma; non salva e non approva. Completa i dettagli, poi salva lo sviluppo: la proposta AI viene conservata anche se non la inserisci.',
      'Compila file coinvolti, soluzione e criteri prima di “Pronta per sviluppo”. Imposta “Verificata” solo con evidenze di test o verifica: l’app non esegue quei test.',
    ], 'Un errore 404 nella preparazione indica che il backend non espone ancora l’endpoint AI: non dipende dall’Excel.'),
    chapter('Fase 3 · Progetto di avvio (facoltativa)', 'Preparare la struttura e le decisioni', [
      'Usala soprattutto per un nuovo servizio o una Logic App. Apri «Prepara progetto · Visual Studio Code» e compila «Nome progetto» (ad esempio servizio-invio-prenotazione), «Tipo progetto» e «Obiettivo tecnico».',
      'Apri «Decisioni da concordare con il team». Per ognuna delle 10 decisioni compila i tre campi «Scelta o ipotesi da discutere», «Fonte e versione» e «Referente»: è «Documentata» solo con tutti e tre, altrimenti resta «Aperta». Non scegliere una tecnologia senza conferma.',
      'Premi «Genera progetto di avvio ZIP». Scarichi un archivio con README.md, il workspace .code-workspace, progetto.json, SCHEDE_SVILUPPO.md, docs/DECISIONI.md, docs/ARCHITETTURA.md, docs/TEST_PLAN.md, tests/piano-test.json e le cartelle contracts, fixtures e src da completare.',
      'Salva lo sviluppo per conservare la configurazione del progetto: lo ZIP non la salva.',
    ], 'Lo ZIP non contiene i sorgenti locali né un workflow distribuibile; il piano di test è una checklist non eseguita.', {
      fields: { caption: 'Le 10 decisioni da documentare', rows: [
        ['Tecnologia e runtime', 'Linguaggio, framework, versione, runtime di destinazione.'],
        ['Contratto di ingresso', 'Cosa riceve il servizio e in che formato.'],
        ['Contratto di uscita', 'Cosa restituisce o pubblica.'],
        ['Regole dati e mapping', 'Come si trasformano e validano i dati.'],
        ['Modalità di risposta', 'Sincrona o asincrona, tempi, codici di esito.'],
        ['Idempotenza e duplicati', 'Cosa succede se la stessa richiesta arriva due volte.'],
        ['Errori e ritentativi', 'Come si gestiscono i guasti e quante volte si riprova.'],
        ['Accesso e ambienti', 'Credenziali, reti e ambienti coinvolti (senza scrivere segreti qui).'],
        ['Repository e consegna', 'Dove va il codice, branch e modalità di consegna.'],
        ['Build e test', 'Come si compila e quali test dimostrano il risultato.'],
      ] },
      warnings: [
        ['«Compila GOTO e titolo prima di generare il progetto».', 'Il GOTO o il titolo dell’iniziativa mancano: completali nel Configuratore.'],
        ['«Inserisci nome del progetto e obiettivo tecnico».', 'Entrambi i campi sono obbligatori per generare lo ZIP.'],
        ['«Aggiungi o importa almeno un’attività».', 'Senza attività non c’è nulla da impacchettare.'],
      ],
    }),
    chapter('Fase 4 · Codice (facoltativa)', 'Far generare file reali per un applicativo', [
      'La generazione si fa dentro ogni scheda: apri «Generazione codice / workflow · target applicativo». Serve una scheda con soluzione e criteri compilati. La fase Codice mostra solo il riepilogo: per ogni attività «N file generati», «Pronta da generare» o «Scheda incompleta», con «Apri le schede».',
      'Compila il target (tabella sotto) e premi «Genera codice / workflow per questa attività». Il pulsante resta spento finché applicativo, componente e stack non sono compilati.',
      'Per modificare file esistenti elenca in «Originali da modificare» i percorsi relativi (massimo 8 file, ciascuno entro 120.000 byte e 60.000 caratteri). Lascia vuoto per soli file nuovi.',
      'Leggi ogni file generato (marcato «Nuovo» o «Modificato») e il relativo originale. Se piace premi «Conserva artefatti nella scheda»: la scheda passa a «Da verificare». Se esisteva già un risultato, l’app chiede se sostituirlo.',
      'Premi «Scarica file sorgenti generati ZIP»: ottieni codice-attivita-da-verificare.zip con proposed/ (i file nuovi), original/ (gli originali), manifest.json e un README che dichiara il codice non verificato.',
      'Applica i file nel repository con Visual Studio Code, confrontandoli con il checkout reale prima di usarli. Un target alla volta per attività.',
    ], 'Generato non significa compilato, distribuibile o collaudato. L’app non scrive nel repository, non esegue SQL, build o deploy. Se mancano decisioni, l’AI può rispondere «Decisioni necessarie prima di generare» senza produrre file.', {
      fields: { caption: 'Il target della generazione', rows: [
        ['Applicativo destinatario', 'Scegli tra gli applicativi associati al sistema («Seleziona applicativo»).'],
        ['Componente / modulo', 'Il modulo da modificare o creare.'],
        ['Stack e runtime (es. Java 8, Logic App Standard)', 'La tecnologia di destinazione: determina il tipo di file prodotti.'],
        ['Database e versione (oppure Non applicabile)', 'Serve se l’intervento tocca la base dati.'],
        ['Contratti, vincoli e convenzioni di implementazione', 'Regole che l’AI deve rispettare (naming, formati, standard del team).'],
        ['Originali da modificare', 'Percorsi relativi dei file esistenti da cambiare, uno per riga.'],
      ] },
      warnings: [
        ['«Seleziona al massimo 8 file originali».', 'Dividi l’intervento in più attività.'],
        ['«non trovato o ambiguo» accanto al percorso di un originale.', 'Il percorso non esiste nella cartella scelta o ne esistono due uguali: correggi il percorso, oppure lascia vuoto per file nuovi.'],
        ['«troppo grande» oppure «supera 60.000 caratteri» accanto a un originale.', 'Suddividi l’intervento in parti più piccole.'],
      ],
    }),
    chapter('Fase 5 · Consegna', 'Preparare il pacchetto per chi scrive il codice', [
      'Apri «Richiesta di modifica codice». Scegli lo «Strumento previsto» (Visual Studio Code, Codex o Altro), scrivi il «Branch suggerito» (ad esempio feature/<codice>), le «Note di approvazione» e i comandi in «Compilazione e test» (ad esempio npm run build, dotnet test).',
      'Controlla la riga di stato: «Interventi approvati inclusi: N» e se il repository è collegato (cartella selezionata oppure profilo tecnico dell’applicativo).',
      'Premi «Genera ZIP richiesta modifica codice». Scarichi Richiesta_Modifica_Codice_{GOTO}.zip con README_MODIFICA_CODICE.md, richiesta_modifica_codice.json, piano_sviluppo.md, RAZIONALI_E_VINCOLI.md (se ci sono), elenco_file_repository.txt, schede_sviluppo.json e SCHEDE_SVILUPPO.md. Lo ZIP riporta le schede mostrate in pagina, anche non ancora salvate.',
      '«Esporta piano di sviluppo (MD)» scarica piano_sviluppo_{GOTO}.md; «Genera documento sviluppo (AI)» produce sviluppo_iniziativa_{GOTO}.md da verificare prima dell’uso.',
      'Salva lo sviluppo: il primo controllo della Consegna è proprio «Sviluppo salvato».',
    ], 'Le note di approvazione e lo strumento previsto non concorrono al completamento della fase: contano solo i quattro controlli.', {
      fields: { caption: 'I quattro controlli della Consegna', rows: [
        ['Sviluppo salvato', 'Non ci sono modifiche in sospeso e hai salvato almeno una volta.'],
        ['Interventi approvati nell’offerta', 'Almeno un intervento approvato nel Configuratore.'],
        ['Branch indicato', 'Il campo «Branch suggerito» non è vuoto.'],
        ['Comandi di build e test indicati', 'Il campo «Compilazione e test» non è vuoto.'],
      ] },
      warnings: [
        ['«Nessun intervento approvato: apri il Configuratore e approva almeno un intervento».', 'Seleziona e approva le voci nel Configuratore, salva la valutazione e riapri l’iniziativa.'],
        ['«Seleziona la cartella dei sorgenti oppure scegli un applicativo con profilo tecnico».', 'Torna alla fase Fonti e collega il repository.'],
      ],
    }),
    chapter('Fase 6 · Verifica', 'Registrare le evidenze', [
      'Dopo aver scritto e provato il codice in Visual Studio Code, apri la scheda dell’attività dalla fase Schede (il pulsante «Apri la scheda» nella fase Verifica ti porta all’elenco delle schede).',
      'Nel campo «Evidenze di verifica (test, comando, esito, commit)» scrivi cosa hai eseguito: il comando di build o di test, l’esito e il commit.',
      'Imposta «Stato di verifica» su «Verificata»: la voce è disponibile solo se ci sono evidenze. Salva con «Salva sviluppo».',
      'Torna alla fase Verifica: l’avanzamento mostra quante attività sono verificate su quante. Quando tutte sono verificate la pillola nell’elenco diventa «Verificato».',
    ], 'L’app non esegue i test: «Verificata» è una dichiarazione tua, accompagnata dalle evidenze. Il worker automatico di compilazione e test non è ancora disponibile.'),
    chapter('Colleghi, chat e salvataggio', 'Lavorare in più persone senza sovrascriversi', [
      'Aprendo un’iniziativa compare il riquadro «Collaborazione sull’iniziativa»: i colleghi collegati, un avviso giallo se qualcuno lavora sulla stessa iniziativa e la chat. La presenza si aggiorna ogni 15 secondi e si spegne dopo 45 secondi senza segnali.',
      'Nella chat Invio spedisce, Maiusc+Invio va a capo, massimo 2.000 caratteri. Il messaggio non inviato resta nella casella; i messaggi non si modificano né si cancellano; «Mostra messaggi precedenti» carica la cronologia. Non scrivere password o dati riservati.',
      '«Salva sviluppo» scrive schede, proposte AI, progetto e consegna in un archivio dedicato e conferma solo dopo la risposta del server («Sviluppo salvato e confermato dal server (revisione N)»).',
      'Se un collega ha salvato dopo la tua apertura ricevi un conflitto e la pagina resta aperta con le tue modifiche. Non ricaricare: copia ciò che serve, riapri l’iniziativa e riconcilia.',
      'Se l’offerta è stata rivista nel Configuratore, in cima compare un avviso con le attività nuove, rimosse o con descrizione cambiata. Le schede restano legate alla riga e non si aggiornano da sole: controllale.',
    ], 'La presenza e la chat avvisano ma non bloccano: due persone possono comunque salvare. Salvare lo sviluppo non modifica la valutazione e salvare l’offerta non modifica lo sviluppo.', {
      warnings: [
        ['«Un collega ha salvato lo sviluppo di questa iniziativa dopo la tua apertura».', 'Il tuo lavoro è ancora in pagina: copia o esporta ciò che serve, riapri l’iniziativa e riconcilia.'],
        ['«Il server non ha confermato schede, progetto e consegna».', 'Non chiudere la pagina e riprova a salvare.'],
        ['«Collegamento perso: i dati non sono aggiornati».', 'La presenza e la chat si riprovano da sole ogni 15 secondi.'],
        ['«Chiudere senza salvare?».', 'Conferma solo se vuoi perdere le modifiche non salvate.'],
      ],
    }),
  ] },
  catalogoofferto: { title: 'Voci di catalogo offerti', summary: 'Carica da Excel i prezzi offerti dopo l’aggiudicazione: diventano il catalogo usato dalle iniziative del tuo contratto.', chapters: [
    chapter('Caricare i prezzi offerti', 'Dal modello Excel al catalogo del lotto', [
      'La pagina ha una scheda per ogni lotto del contratto su cui lavori. In cima vedi il riepilogo: voci del catalogo di gara, voci del catalogo offerto (oppure «Non caricato») e ultimo aggiornamento.',
      'Il caricamento da Excel è chiuso finché non lo apri: premi «Carica catalogo» (se il catalogo offerto non c’è ancora) oppure «Aggiorna catalogo» (se c’è già). Si apre un riquadro con tre passi; «Chiudi» lo richiude senza salvare.',
      'Passo 1, «Prepara il file Excel». Se hai già il foglio del catalogo con i prezzi offerti («ID di catalogo», «Nome Driver», «P. OFFERTO REALIZZAZIONE», «PREZZO OFFERTO MODIFICA», «Descrizione semplice/medio/complesso») caricalo così com’è: le altre colonne vengono ignorate.',
      'Dopo il caricamento trovi sotto la tabella «Catalogo offerto caricato» con tutte le voci, nell’ordine ID, Ambito, Voce, Descrizione Driver, Descrizione Semplice, Descrizione Medio, Descrizione Complesso, poi i prezzi Realizzazione e Modifica. Descrizioni e prezzi si correggono direttamente nelle celle (ID, Ambito e Voce sono quelli di gara e non cambiano); le celle modificate sono gialle e «Salva le modifiche» le salva insieme, con gli stessi controlli dell’import. «Annulla le modifiche» torna ai valori salvati.',
      'Altrimenti premi «Scarica il modello Excel»: contiene già ID, ambito e nome di ogni voce. Nel foglio «CatalogoOfferto» scrivi il prezzo offerto nelle celle gialle e, se vuoi, le descrizioni nelle colonne «Descrizione Driver», «Descrizione Semplice», «Descrizione Medio» e «Descrizione Complesso»; il foglio «BaseAsta» mostra base d’asta e descrizione di gara per confronto.',
      'Non cambiare ID, intestazioni, nomi dei fogli e righe. Se in gara una voce ha prezzo 0 lascia la cella vuota, altrimenti il prezzo offerto è obbligatorio. Scrivi importi senza il simbolo €.',
      'Passo 2: «Scegli il file Excel» e «Controlla il file»: vedi errori riga per riga oppure il confronto tra prezzo di gara, offerto e sconto. Solo dopo «Salva il catalogo offerto» il catalogo viene usato; un file con errori non viene salvato.',
      'Se un lotto non compare, non è collegato al codice del tuo contratto: chiedilo al SuperAdmin.',
    ], 'Il catalogo di gara non viene mai modificato. «Rimuovi il catalogo offerto» riporta il lotto ai prezzi di gara.'),
    chapter('Che effetto ha sulle iniziative', 'Nuove voci e iniziative già salvate', [
      'Le nuove iniziative e le voci senza un prezzo salvato usano i prezzi offerti.',
      'Le iniziative già salvate conservano i loro prezzi unitari: non cambiano da sole. Chi lavora nel Configuratore trova «Riallinea ai prezzi offerti», che mostra prima i totali e chiede conferma.',
    ]),
  ] },
  configuratore: { title: 'Configuratore Iniziative', summary: 'Trasforma requisiti, analisi e interventi in una proposta tecnica ed economica con storico e supporto AI.' },
};

export function homeManualChapters(pageIds) {
  return [chapter('Orientarsi nell’app', 'Scegli la sezione in base all’attività', [
    'Seleziona prima il contratto/ambiente nella Home: le pagine operative mostreranno i dati del contesto attivo.',
    'Apri una funzione dalla relativa scheda. In ogni sezione trovi il pulsante Manuale d’uso per le istruzioni specifiche.',
    'Se una funzione non compare, verifica i permessi con l’amministratore. La guida non modifica le abilitazioni.',
  ]), ...pageIds.filter(id => PAGE_MANUALS[id]).map(id => chapter(PAGE_MANUALS[id].title, 'In breve', [PAGE_MANUALS[id].summary]))];
}
