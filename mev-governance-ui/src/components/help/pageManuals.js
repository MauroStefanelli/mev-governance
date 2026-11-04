const chapter = (title, subtitle, steps, note) => ({ title, subtitle, steps, note });
const accessNote = 'Le azioni visibili dipendono dal ruolo e dai permessi assegnati. Verifica il contratto/ambiente nella barra superiore: i dati operativi sono riferiti al contesto attivo.';
const tableChapter = chapter('Filtri e consultazione', 'Restringere i dati senza modificarli', [
  'Apri i filtri nelle intestazioni e seleziona i valori desiderati. Le opzioni si aggiornano considerando le selezioni negli altri filtri.',
  'Scorri orizzontalmente per raggiungere tutte le colonne. Usa “Colonne fisse” per scegliere quali mantenere visibili; la scelta è memorizzata separatamente per MEV e MEV-CAP.',
  '“Reset filtri” ripristina la vista completa. I totali si aggiornano sulle iniziative filtrate: controlla il perimetro prima di confrontare gli importi.',
], 'Su schermi stretti la parte fissa può ridursi automaticamente a ID/GoTo, senza sovrascrivere la preferenza scelta.');
const alignChapter = chapter('Importazione ed esportazione', 'Excel ufficiale e dati presenti nell’app', [
  '“Carica Excel”, quando disponibile, carica il file sul server: non equivale ancora all’importazione dei dati in tabella.',
  '“Allinea Dati” esegue l’allineamento con il file ufficiale. Leggi la conferma e attendi l’esito prima di iniziare altre modifiche.',
  '“Esporta Excel” produce il file delle righe attualmente filtrate. Controlla prima filtri e numero di iniziative.',
], 'L’allineamento è un’operazione diversa dal salvataggio delle modifiche manuali. Le azioni sono disponibili solo agli utenti autorizzati.');

export const PAGE_MANUALS = {
  mev: { title: 'MEV', summary: 'Consulta le iniziative, filtra importi e ordini e aggiorna i campi di pianificazione disponibili.', chapters: [
    chapter('Quadro economico', 'Iniziative e valori nel contratto attivo', ['Controlla GOTO, applicativo, anno e stato per identificare l’iniziativa.', 'Leggi i totali Fornitura, ODA e SUBCO in alto: sommano i valori delle righe filtrate. Imp. Subco rappresenta l’importo della subfornitura.', 'Clicca una riga per consultare il dettaglio. I pulsanti Note aprono il testo associato.'], accessNote),
    tableChapter,
    chapter('Pianificazione e salvataggio', 'Aggiornare i campi senza perdere le modifiche', ['Modifica i campi abilitati della riga, ad esempio P Anno, P Release, P Importo, P Note e Note CAP.', 'Premi “Salva” sulla riga modificata e controlla l’indicazione di conferma. La sola digitazione non è un salvataggio.', 'Verifica l’iniziativa e l’importo prima di passare ad altre pagine o riallineare i dati.']), alignChapter,
  ] },
  mevcap: { title: 'MEV-CAP', summary: 'Gestisci i dettagli delle iniziative, i responsabili, le associazioni e le quantità TOW.', chapters: [
    chapter('Panoramica', 'La vista operativa delle iniziative', ['Seleziona i filtri per restringere il portafoglio e consulta i totali.', 'Il Totale Fornitura considera le iniziative filtrate approvate; Totale ODA e SUBCO seguono le righe filtrate secondo le etichette della pagina.', 'Clicca una riga per aprire la scheda di modifica dell’iniziativa.'], accessNote), tableChapter,
    chapter('Scheda iniziativa', 'Dati operativi e TOW', ['Nella scheda verifica responsabili, stato, release, tipo contratto e riferimenti ODA/RDA.', 'Controlla le società Mandataria/Mandante e Subco e le relative associazioni. Compila le quantità TOW e i campi economici previsti.', 'Premi “Salva modifiche” e attendi l’esito; “Annulla” chiude la scheda senza confermare.', '“Nuovo GoTo” apre la creazione di una nuova iniziativa. Compila i campi obbligatori e verifica il contratto attivo.'], 'Il ricalcolo dai TOW dipende dalla disponibilità di prezzi affidabili per l’ambiente. Una voce a catalogo può richiedere un importo anziché una quantità.'), alignChapter,
  ] },
  contratti: { title: 'Contratti', summary: 'Consulta contratti e pianificazione delle release nell’ambiente selezionato.', chapters: [
    chapter('Consultare i contratti', 'Identificare il perimetro contrattuale', ['Verifica l’ambiente attivo e individua il contratto nell’elenco.', 'Apri i dettagli disponibili e controlla riferimenti, importi e dati collegati prima di aggiornare le informazioni.', 'I dati contrattuali e le associazioni guidano le viste operative: usa codici coerenti con quelli delle iniziative.'], accessNote),
    chapter('Pianificazione Release', 'Organizzare le attività nel tempo', ['Apri la pianificazione release del contratto interessato.', 'Consulta o aggiorna i campi modificabili della release e conferma con “Salva”.', 'Verifica la coerenza tra release pianificate e assegnazione delle iniziative. La pianificazione non sostituisce l’aggiornamento dei dati delle singole MEV.']),
  ] },
  contratti_interni: { title: 'Ordini', summary: 'Consulta ordini, buoni di consegna e iniziative collegate.', chapters: [
    chapter('Ordini e buoni di consegna', 'Ritrovare documenti e collegamenti', ['Verifica il contratto attivo prima di consultare gli ordini.', 'Apri i gruppi e i dettagli disponibili per vedere buoni di consegna, riferimenti e iniziative associate.', 'Confronta anno/release e importi con le MEV collegate; un riferimento documentale diverso può indicare un’associazione da controllare.'], accessNote),
    chapter('Controllo operativo', 'Usare correttamente le informazioni', ['Usa i filtri o la ricerca disponibili per individuare l’ordine interessato.', 'Controlla il livello del dato: ordine, buono di consegna e singola MEV non sono la stessa entità.', 'Per le funzioni di acquisizione o gestione documentale usa gli strumenti abilitati, senza duplicare lo stesso documento.']),
  ] },
  reportavanzamenti: { title: 'Report Avanzamenti', summary: 'Monitora le attività per release e aggiorna gli avanzamenti autorizzati.', chapters: [
    chapter('Selezionare la release', 'Definire il perimetro del report', ['Controlla il contratto attivo e seleziona la release nella parte superiore.', 'Consulta la panoramica delle attività; usa i filtri disponibili per restringere i risultati.', 'Clicca un’attività per aprire il dettaglio: l’anagrafica MEV è distinta dai campi di avanzamento.'], accessNote),
    chapter('Aggiornare e controllare', 'Dati MEV e avanzamento', ['Nel dettaglio verifica quali sezioni sono indicate come modificabili e quali come sola lettura.', 'Aggiorna solo i campi autorizzati e usa i comandi di salvataggio della scheda.', 'Dopo il salvataggio controlla l’attività nel report e la release selezionata.']),
    chapter('Release e importazione', 'Gestire dati senza confondere i perimetri', ['Gli utenti autorizzati possono creare o rinominare una release tramite i comandi dedicati.', 'Se importi dati di avanzamento, verifica il file e la release rilevata prima di confermare.', 'Leggi attentamente le conferme di eliminazione: rimuovere avanzamenti di una release ed eliminare la release dal calendario sono operazioni distinte.']),
  ] },
  chart: { title: 'Grafici', summary: 'Esplora la distribuzione delle iniziative per release, applicativo e anno.', chapters: [
    chapter('Leggere i grafici', 'Una sintesi dei dati MEV', ['Verifica il contratto attivo e il perimetro rappresentato.', 'Consulta grafici, categorie e legende per confrontare release, applicativi e anni.', 'Per verificare una singola iniziativa o modificarne i dati apri MEV o MEV-CAP. I grafici sono una sintesi e non sostituiscono il dettaglio operativo.'], accessNote),
  ] },
  team: { title: 'Gestione Team', summary: 'Consulta e gestisci le risorse del team nel contratto attivo.', chapters: [
    chapter('Risorse del team', 'Anagrafica e aggiornamenti', ['Controlla l’ambiente e consulta l’elenco delle risorse.', 'Gli utenti autorizzati possono aggiungere un membro o aprirne la scheda per modificarlo.', 'Compila i dati richiesti, salva e verifica la risorsa nell’elenco.', 'Per eliminare una risorsa usa il comando dedicato e leggi la conferma prima di procedere.'], accessNote),
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
    chapter('Contratto MEV e utenti', 'Accessi al contesto operativo', ['Seleziona un contratto MEV oppure crealo con il comando dedicato.', 'Consulta gli utenti associati e assegna i ruoli previsti dal sistema.', 'Verifica che ciascun utente abbia solo i ruoli necessari nel contratto corretto; il ruolo operativo può cambiare tra ambienti.'], accessNote),
  ] },
  admin: { title: 'Amministrazione utenti', summary: 'Gestisci account, ruoli e abilitazioni alle funzioni.', chapters: [
    chapter('Account e autorizzazioni', 'Gestire gli utenti dell’app', ['Consulta gli utenti e apri la scheda interessata oppure crea un nuovo account.', 'Verifica dati anagrafici, stato dell’account e abilitazioni prima di salvare.', 'Distingui ruolo dell’account, accessi al contratto e permessi alle pagine: servono congiuntamente a determinare ciò che l’utente vede e può fare.'], accessNote),
  ] },
  dbconfig: { title: 'Configurazione database', summary: 'Consulta e gestisci la configurazione di connessione prevista dall’app.', chapters: [
    chapter('Impostazioni applicazione', 'Parametri operativi dell’app', ['Apri la scheda Impostazioni Applicazione per consultare i parametri disponibili.', 'Verifica il significato dei campi e salva solo modifiche concordate con chi gestisce l’ambiente.', 'Le impostazioni di applicazione sono diverse dalla configurazione della connessione database.']),
    chapter('Configurazione', 'Verificare la destinazione dei dati', ['Controlla l’ambiente prima di consultare o aggiornare la configurazione.', 'Usa solo i campi e i comandi presenti nella pagina e attendi la conferma di verifica o salvataggio.', 'Non condividere password o stringhe di connessione nei documenti operativi o nei messaggi di assistenza.'], accessNote),
  ] },
  configuratore: { title: 'Configuratore Offerta TOW', summary: 'Trasforma requisiti, analisi e interventi in una proposta tecnica ed economica con storico e supporto AI.' },
};

export function homeManualChapters(pageIds) {
  return [chapter('Orientarsi nell’app', 'Scegli la sezione in base all’attività', [
    'Seleziona prima il contratto/ambiente nella Home: le pagine operative mostreranno i dati del contesto attivo.',
    'Apri una funzione dalla relativa scheda. In ogni sezione trovi il pulsante Manuale d’uso per le istruzioni specifiche.',
    'Se una funzione non compare, verifica i permessi con l’amministratore. La guida non modifica le abilitazioni.',
  ]), ...pageIds.filter(id => PAGE_MANUALS[id]).map(id => chapter(PAGE_MANUALS[id].title, 'In breve', [PAGE_MANUALS[id].summary]))];
}
