const chapter = (title, subtitle, steps, note, extra = {}) => ({ title, subtitle, steps, note, ...extra });
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
    chapter('Eliminare o unire un contratto', 'Spostare i dati utili prima di cancellare un duplicato', [
      'Un contratto può comparire due volte, ad esempio perché è stato importato a mano con i PDF e poi di nuovo dalla gara. Sotto il titolo dell’Archivio compare «Possibile duplicato» quando due contratti hanno gli stessi lotti e lo stesso catalogo; sul contratto compare «Dati incompleti» se un lotto attivo non ha prezzi TOW o catalogo.',
      'Apri il contratto che vuoi togliere e premi «Elimina contratto…». Non cancella subito: si apre una finestra in cui scegli quale contratto resta (di solito quello completo, già proposto) e vedi, riga per riga, cosa verrebbe spostato. Tra i contratti che possono restare c’è anche quello di sistema, indicato «(contratto di sistema)»: può ricevere i dati, anche se lui non si può eliminare.',
      'Per ogni lotto la finestra dice se viene «aggiunto» (non esiste nel contratto che resta), «completato» (si riempie solo ciò che manca: listino TOW, catalogo, percentuali di impatto, nome dei file, codice contratto) o «resta com’è» (il contratto che resta ha già tutto). I dati del contratto che resta non vengono mai sovrascritti né svuotati.',
      'Anche gli applicativi condivisi del contratto da eliminare passano all’altro, confrontati per codice e nome: quelli già presenti non si duplicano. Le valutazioni del Configuratore che avevano usato come catalogo il contratto da eliminare vengono ricollegate a quello che resta; il resto della valutazione non cambia.',
      'Spunta «Ho letto cosa succede e voglio procedere» e premi «Sposta i dati ed elimina il contratto» (oppure «Elimina il contratto» se non c’è nulla da spostare). L’operazione è unica: o riesce tutta oppure non cambia niente, anche in caso di errore.',
    ], 'L’eliminazione non si può annullare. Il pulsante resta spento se il contratto non si può togliere: è il contratto di sistema «Poste TeT (built-in)» (quello si può solo ricevere dati, mai eliminare), non esiste un altro contratto che resti, oppure sotto il contratto sono salvati dati che l’unione non sa spostare (la finestra li nomina: spostali o eliminali prima).', {
      fields: { caption: 'Il contratto «Poste TeT (built-in)»', rows: [
        ['Che cos’è', 'Un contratto di esempio incluso nell’app, con un catalogo e prezzi TOW di fabbrica. Non è un dato inserito da te.'],
        ['Quando compare', 'Nel Configuratore, quando non è selezionato un contratto vero o come alternativa agli altri contratti.'],
        ['Posso eliminarlo?', 'No: nell’Archivio è marcato «Contratto di sistema» e non ha il pulsante di eliminazione.'],
        ['Serve per le mie iniziative?', 'No. Per le iniziative reali scegli il contratto importato e collegato al codice MEV del tuo ambiente.'],
      ] },
    }),
    chapter('Contratto MEV e utenti', 'Accessi al contesto operativo', ['Seleziona un contratto MEV oppure crealo con il comando dedicato.', 'Consulta gli utenti associati e assegna i ruoli previsti dal sistema.', 'Verifica che ciascun utente abbia solo i ruoli necessari nel contratto corretto; il ruolo operativo può cambiare tra ambienti.'], accessNote),
  ] },
  admin: { title: 'Amministrazione utenti', summary: 'Gestisci account, ruoli e abilitazioni alle funzioni.', chapters: [
    chapter('Account e autorizzazioni', 'Gestire gli utenti dell’app', ['Consulta gli utenti e apri la scheda interessata oppure crea un nuovo account.', 'Verifica dati anagrafici, stato dell’account e abilitazioni prima di salvare.', 'Distingui ruolo dell’account, accessi al contratto e permessi alle pagine: servono congiuntamente a determinare ciò che l’utente vede e può fare.'], accessNote),
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
      'Guarda «Applicativi associati al sistema …». Il sistema dell’iniziativa è confrontato con codice, nome e alias degli applicativi configurati. Se nessuno corrisponde, l’app elenca dove ha cercato: aggiungi il sistema come alias dell’applicativo giusto in Configuratore → «Risorse e configurazione» → «Applicativi e tecnologie».',
      'Premi «Seleziona cartella sorgenti» (poi «Cambia cartella») e scegli la cartella del repository. I file restano nel tuo browser: non vengono caricati sul server.',
      'Verifica il messaggio sotto il pulsante: indica quanti file hai selezionato e quanti sorgenti sono presi in considerazione, oppure «Nessuna cartella: uso il profilo tecnico dell’applicativo». Senza cartella e senza profilo le proposte AI e la generazione di file non sono disponibili.',
    ], 'Il browser non conserva il permesso di leggere la cartella: dopo un ricaricamento va riselezionata, ma solo per nuove analisi. Proposte e schede salvate si consultano senza cartella.', {
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
      'Se hai selezionato la cartella, premi «Prepara scheda con AI»: l’AI legge un campione di sorgenti e scrive una proposta. Controlla soluzione, criteri e i «File e righe citati negli estratti». I riferimenti confermano dove si trovano nel campione, non che la soluzione sia corretta.',
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
      'Il sistema dell’iniziativa (ad esempio «BEP») viene confrontato con codice, nome e alias degli applicativi configurati nel Configuratore. Se non ne trova, la fase Fonti indica dove ha cercato e quali applicativi esistono: aggiungi il sistema come alias dell’applicativo corretto, oppure crealo, in Configuratore → Risorse e configurazione → Applicativi. Gli applicativi sono cercati sia nel catalogo scelto per la stima sia nell’ambiente attivo.',
      'Premi “Seleziona cartella sorgenti per questa sessione” e scegli la cartella del repository. Il browser non conserva il permesso: va riselezionata dopo un ricaricamento, solo per nuove analisi o generazioni. Proposte e schede salvate si consultano senza cartella.',
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
  configuratore: { title: 'Configuratore Iniziative', summary: 'Trasforma requisiti, analisi e interventi in una proposta tecnica ed economica con storico e supporto AI.' },
};

export function homeManualChapters(pageIds) {
  return [chapter('Orientarsi nell’app', 'Scegli la sezione in base all’attività', [
    'Seleziona prima il contratto/ambiente nella Home: le pagine operative mostreranno i dati del contesto attivo.',
    'Apri una funzione dalla relativa scheda. In ogni sezione trovi il pulsante Manuale d’uso per le istruzioni specifiche.',
    'Se una funzione non compare, verifica i permessi con l’amministratore. La guida non modifica le abilitazioni.',
  ]), ...pageIds.filter(id => PAGE_MANUALS[id]).map(id => chapter(PAGE_MANUALS[id].title, 'In breve', [PAGE_MANUALS[id].summary]))];
}
