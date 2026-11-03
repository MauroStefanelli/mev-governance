# Configuratore Offerta TOW — logica di lavoro condivisa

## Obiettivo

Il centro del lavoro è l'iniziativa, identificata dal GOTO nell'ambiente attivo. Analisi, documenti, decisioni e stima economica devono essere ricostruibili nel tempo da tutti gli utenti autorizzati. L'AI supporta gli analisti; le scelte tecniche ed economiche rimangono responsabilità delle persone.

## 1. Aprire o creare un'iniziativa

Dall'Archivio iniziative si seleziona una scheda con un clic. Per un nuovo lavoro si usa “Nuova iniziativa” e si compilano GOTO, titolo e sistema. Il workspace legge il GOTO e recupera lo storico condiviso dell'ambiente. Il contratto e il lotto identificano il catalogo della stima: non si devono usare i prezzi del catalogo incluso nell'app come sostituti impliciti del contratto reale.

L'archivio distingue le valutazioni economiche già esistenti dalle analisi condivise. Una revisione workspace contiene anche uno snapshot della stima, consultabile e ripristinabile. I documenti caricati sono persistenti indipendentemente dal salvataggio della revisione; salvare comunque l'analisi per renderla ritrovabile nell'archivio.

## 2. Acquisire documentazione e leggere le fonti

Caricare i documenti ricevuti nella sezione “Documentazione ricevuta” (massimo 10 MB per file). Ogni caricamento conserva un originale distinto con identificativo, autore, data e impronta SHA-256. Un nome uguale non sostituisce un documento precedente.

“Estrai testo” legge PDF testuali, DOCX, XLSX e formati testuali supportati. “Consulta estratto salvato” riapre quanto già letto. L'anteprima presenta sezioni con pagina, paragrafo o riga, ricerca e navigazione a gruppi. Il limite di estrazione è 500.000 caratteri per documento: l'eventuale lettura parziale è sempre segnalata. Immagini e PDF scansionati non sono letti tramite OCR in questa versione. Le formule Excel sono riportate come formule e non ricalcolate dall'estrattore.

L'estrazione non è un'analisi verificata: confrontare i passaggi importanti con l'originale. “Elimina allegato” lo rimuove dall'elenco attivo condiviso e ne esclude l'estratto dalla bozza corrente di chi lo rimuove. È una rimozione logica: gli originali e le citazioni già salvate restano disponibili per la tracciabilità storica. Le bozze già aperte da altri utenti non vengono modificate in tempo reale; le fonti testuali citate nell'analisi non vengono cancellate automaticamente.

## 3. Preparare il contesto AI

Caricare o estrarre un documento **non** significa inviarlo automaticamente all'AI. Selezionare le sezioni pertinenti e premere “Usa sezioni selezionate nel contesto AI”. La ricerca filtra la vista ma non cancella le selezioni precedenti. Il contatore indica il testo documentale incluso; il limite complessivo è 48.000 caratteri. Per un documento lungo scegliere le parti relative alla domanda, evitando di inviare indiscriminatamente tutto il testo.

Salvare una revisione conserva la selezione dei passaggi insieme all'analisi e alla stima. Le richieste AI del configuratore includono il contesto del workspace e i precedenti recuperati per stesso sistema o famiglia. Questa ricerca è per corrispondenza, non una ricerca semantica su tutto l'archivio. I riferimenti documentali includono identificativo, posizione e impronta. Citazioni e conclusioni dell'AI devono essere verificate dagli analisti.

## 4. Analizzare e decidere

Distinguere AS-IS, TO-BE, fatti verificati, ipotesi e domande aperte da confermare con Poste. Registrare le fonti. Una decisione ha un testo e un riferimento: l'approvazione è esplicita e attribuita all'utente dal server. Una decisione approvata non si riscrive o cancella in una revisione successiva: si aggiunge una nuova decisione che documenti il cambiamento.

L'AI propone e argomenta. Le proposte non vengono applicate automaticamente. URL di repository, commit e risultati di interrogazioni registrati manualmente non equivalgono a connessioni Git o VPN eseguite dal sistema.

## 5. Collaborare e versionare

“Salva nuova revisione con stima corrente” crea una versione con autore, data, motivazione, analisi e snapshot economico. Prima di salvare descrivere cosa è cambiato e perché. Gli altri utenti ritrovano la revisione aprendo lo stesso GOTO nell'ambiente autorizzato.

Se due utenti modificano dalla stessa versione, il primo salvataggio riesce e il secondo riceve un conflitto. La bozza locale del secondo utente rimane disponibile: aggiornare lo storico, confrontare le revisioni e riconciliare le modifiche prima di salvare nuovamente. Non è co-editing in tempo reale. Non ricaricare la pagina finché il lavoro locale da conservare non è stato recuperato.

Il confronto mostra le differenze tra due versioni. “Riprendi analisi e stima” porta uno snapshot nella bozza corrente, previa conferma; non cancella lo storico. Se il catalogo originale non è più disponibile il ripristino si interrompe per evitare valorizzazioni scorrette.

## 6. Ruoli e approvazioni

- **Admin / Developer / SuperAdmin**: analisi, caricamento e rimozione allegati, selezione fonti, decisioni e revisioni.
- **Bid Manager / SuperAdmin**: approvazione della revisione salvata; il Bid Manager consulta documenti e storico senza riscrivere l'analisi.
- L'accesso alla pagina dipende anche dalle autorizzazioni dell'app e dell'ambiente.

Un nuovo lavoro dopo l'approvazione crea una revisione “In analisi”: non altera la revisione approvata precedente.

## 7. Produzione dell'offerta e prossime capacità

Il catalogo contrattuale valorizza le righe economiche. I valori Excel originali restano distinti per il confronto. L'esportazione ANALISI Markdown conserva analisi e decisioni; importazione ed esportazioni economiche già presenti restano parte del flusso.

Restano da completare ricerca semantica, connettori Git in sola lettura, compilazione HLD validata sul template autorevole e accessi VPN. Non considerare queste capacità già disponibili. L'obiettivo finale è collegare requisito → evidenza → decisione → intervento → stima → documento finale, mantenendo persone e revisioni responsabili di ogni passaggio.

## 8. Confronto AI condiviso

Prima di porre una domanda salvare la revisione corrente. In “Confronto AI condiviso” scrivere la domanda e usare “Invia e salva lo scambio”. Il server legge l'ultima revisione salvata e gli ultimi sei scambi della stessa iniziativa; non usa automaticamente i documenti non selezionati. Le risposte conservano autore della domanda, data, modello e revisione di riferimento. La cronologia completa è consultabile da tutti gli utenti autorizzati; “Consulta contesto usato” mostra lo snapshot effettivamente inviato.

Una risposta può essere trasferita nelle decisioni da valutare: questo crea una bozza, non un'approvazione. Verificare il testo e le fonti, poi approvare esplicitamente e salvare una nuova revisione. La conversazione usa la configurazione AI personale dell'utente che invia la domanda. Il Bid Manager può consultarla ma non inviare richieste di analisi. In caso di errore la domanda resta nel campo per consentire un nuovo tentativo. Le risposte generate non sono fatti verificati e le fonti citate devono essere controllate.

## 9. Generare la Tabella di offerta Excel

Nel passaggio Revisione, selezionare il modello XLSX originale (due fogli: riepilogo iniziativa e DettaglioInterventi). Confermare le quantità TOW .1–.4 per ciascun intervento, indicando zero dove non previste. Questa prima versione richiede la conferma manuale delle quantità: non le ripartisce automaticamente e non modifica la stima salvata.

Il generatore sostituisce i dati di esempio, ridimensiona interventi e tabella dei dettagli, usa i prezzi delle voci del catalogo selezionato e collega i totali con formule. Il listino .1–.4 deve essere disponibile nel contratto; non si riusano i prezzi del template. Associazioni mancanti, dettagli senza ID intervento e sconto/contingency non rappresentabili nel modello bloccano l'esportazione. Il file scaricato va verificato in Excel prima della consegna, inclusi formattazione di stampa e arrotondamenti. Il modello originale non viene modificato né salvato sul server.

## 10. Verifica AI del dettaglio importato

L'importazione avvia un controllo AI delle singole righe di DettaglioInterventi. Nel Confronto Excel e Voci Catalogo, la colonna “Verifica AI attività / catalogo” mostra giudizio, motivazione, indicazioni, evidenze, modello e data. La verifica confronta l'attività tecnica con l'intervento di appartenenza, la voce di catalogo associata, ambito/tecnologia, tipo e criteri di complessità disponibili. Non certifica il requisito né analizza codice non fornito; evidenze insufficienti richiedono conferma umana.

I pareri non modificano righe o prezzi. Se i dati usati cambiano, il parere risulta da aggiornare. Il pulsante di verifica permette di controllare anche offerte già importate. Gli esiti vengono conservati salvando la valutazione o una revisione workspace. Errori AI e risposte mancanti sono espliciti e non annullano l'importazione. La richiesta utilizza la configurazione AI personale e viene elaborata in gruppi di massimo cinque righe.
