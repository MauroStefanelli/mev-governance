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
  sviluppo: { title: 'Sviluppo iniziative', summary: 'Trasforma una valutazione del Configuratore in schede per attività, progetto di avvio, file generati e richiesta di modifica codice.', chapters: [
    chapter('Il percorso in sei fasi', 'Fonti, Schede, Progetto, Codice, Consegna, Verifica', [
      'La barra in alto mostra le sei fasi e, per ciascuna, avanzamento e stato: ✓ completa, numero blu in corso, grigio da fare. Clicca una fase per aprirla, oppure usa i pulsanti «← / →» in fondo alla pagina.',
      'Il riquadro «Prossimo passo» indica la prima cosa da fare e porta alla fase giusta con un clic. L’avanzamento complessivo considera solo le fasi obbligatorie (Schede, Consegna, Verifica): Progetto e Codice sono facoltative e la cartella dei sorgenti, che va riselezionata a ogni sessione, non lo abbassa.',
      '«Mostra le regole della fase» spiega a cosa serve la fase, cosa serve per completarla, cosa produce e quali regole vigono. Nella fase Consegna elenca anche i quattro controlli da soddisfare.',
      'Le fasi non sono bloccate: puoi lavorare in ordine diverso. La sequenza consigliata è Fonti → Schede → (Progetto) → (Codice) → Consegna → Verifica.',
    ], 'Una scheda è «definita» solo con file, soluzione e criteri di accettazione. Una proposta AI non la rende definita finché non la inserisci tu.'),
    chapter('Parti da qui', 'Dalla valutazione salvata allo sviluppo', [
      'Salva prima la valutazione nel Configuratore (Revisione → “Salva valutazione”, oppure “Salva e vai a Sviluppo →”). Lo Sviluppo mostra solo le iniziative già valutate nell’ambiente attivo.',
      'Cerca l’iniziativa per GOTO, titolo o sistema e aprila: nell’elenco vedi per ciascuna quante schede sono definite e verificate. Il GOTO e il titolo restano visibili nell’intestazione fissa.',
      'Offerta, importi e catalogo restano nel Configuratore: qui lavori su schede, progetto e consegna. Per cambiare l’offerta torna al Configuratore.',
    ], 'Se le schede erano state salvate nel Configuratore prima di questa applicazione, vengono caricate come punto di partenza: premi “Salva sviluppo” per renderle definitive.'),
    chapter('Salvataggio e collaborazione', 'Conservare il lavoro senza sovrascrivere i colleghi', [
      '“Salva sviluppo” scrive schede, proposte AI, progetto e dati di consegna in un archivio dedicato e mostra la conferma solo dopo il riscontro del server. “Salva e chiudi” chiude solo se il salvataggio riesce.',
      'Se un collega ha salvato lo sviluppo della stessa iniziativa dopo la tua apertura, ricevi un conflitto e la pagina resta aperta con le tue modifiche. Non ricaricare: copia ciò che serve, riapri l’iniziativa e riconcilia.',
      'Se l’offerta viene rivista nel Configuratore, le schede restano legate alla riga originale. Se descrizione o numero di attività cambiano, lo Sviluppo lo segnala: controlla le schede delle righe modificate.',
    ], 'Salvare lo sviluppo non modifica la valutazione dell’offerta e salvare l’offerta non modifica lo sviluppo.'),
    chapter('Schede per attività e AI', 'Una scheda per ogni riga importata', [
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
    chapter('Progetto di avvio', 'Struttura e decisioni da concordare', [
      'In “Prepara progetto · Visual Studio Code” inserisci nome, tipo e obiettivo. Compila le decisioni su runtime, interfacce, mapping, errori, duplicati, accessi e test con scelta, fonte e referente. Le voci mancanti restano aperte: non scegliere una tecnologia senza conferma.',
      '“Genera progetto di avvio ZIP” produce README, workspace VS Code, schede attività, architettura, registro decisioni e piano test, con cartelle src, contracts e fixtures da completare. Il piano test è una checklist non eseguita.',
      'Lo ZIP non contiene i sorgenti locali né un workflow distribuibile. Salva lo sviluppo per conservare la configurazione.',
    ]),
    chapter('Generazione di file reali', 'Codice o workflow per un applicativo', [
      'Nella scheda attività apri “Generazione codice / workflow · target applicativo”. Scegli l’applicativo, indica modulo, stack/runtime e DB/versione (o Non applicabile), quindi contratti e convenzioni. Un solo target alla volta.',
      'Per modificare file esistenti elenca i percorsi relativi degli originali completi presenti nella cartella selezionata (massimo otto); lascia vuoto per soli file nuovi. La scheda deve avere soluzione e criteri.',
      'Consulta ogni file e il relativo originale, poi “Conserva artefatti nella scheda” e scarica lo ZIP sorgenti (proposed/, original/, manifest e test suggeriti). Una nuova generazione sostituisce gli artefatti solo dopo conferma.',
      'Confronta i file con il checkout effettivo prima di applicarli. L’AI può segnalare decisioni mancanti senza generare file.',
    ], 'Generato non significa compilato, distribuibile o collaudato. L’app non scrive nel repository, non esegue SQL, build o deploy.'),
    chapter('Consegna e verifica', 'Dalla richiesta al codice verificato', [
      'In “Richiesta di modifica codice” scegli lo strumento (Visual Studio Code, Codex o altro), il branch, le note di approvazione e i test attesi. Collega la cartella sorgenti oppure usa il profilo tecnico di un applicativo.',
      '“Genera ZIP richiesta modifica codice” include README_MODIFICA_CODICE.md, richiesta_modifica_codice.json, piano_sviluppo.md, SCHEDE_SVILUPPO.md, schede_sviluppo.json ed elenco_file_repository.txt. Lo ZIP riporta le schede mostrate nella pagina, anche non ancora salvate. “Esporta piano di sviluppo (MD)” e “Genera documento sviluppo (AI)” producono documenti Markdown.',
      'Apri il progetto reale in Visual Studio Code sul branch concordato e lavora su un’attività alla volta, verificando i file citati sul checkout effettivo. Visual Studio Code è un editor: la modifica la scrive lo sviluppatore o un assistente con accesso ai sorgenti.',
      'Esegui build e test del modulo con gli strumenti del progetto (per NPSO WLS, OSB, BPEL e microservizi possono differire). Riporta comandi, esiti e commit nella scheda, imposta “Verificata” solo con evidenze e salva lo sviluppo.',
    ], 'Il worker automatico di compilazione e test non è ancora disponibile: la prontezza al rilascio si dimostra con le verifiche del repository e dell’ambiente destinatario.'),
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
