import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './configuratorManual.css';

const chapters = [
  { title: 'Parti da qui', subtitle: 'Il percorso dall’iniziativa all’offerta', steps: [
    'Apri una scheda dall’Archivio iniziative oppure premi “Nuova Iniziativa”. Compila Codice GOTO, titolo e sistema nel passaggio Iniziativa.',
    'Controlla contratto e lotto in “Risorse e configurazione”. Il GOTO e il titolo rimangono visibili nell’intestazione fissa durante il lavoro.',
    'Importa la Tabella di Offerta esistente oppure prepara l’analisi nel workspace. Prosegui attraverso Iniziativa → Interventi → Offerta → Revisione.',
  ], note: 'Il GOTO collega storico, allegati e conversazione nell’ambiente attivo. Per mantenere separati lavori distinti usa GOTO distinti.' },
  { title: 'Archivio e creazione', subtitle: 'Ritrovare e riprendere il lavoro', steps: [
    'Apri “Archivio iniziative”: le analisi condivise e le offerte salvate sono presentate in sezioni distinte. Clicca una scheda per aprirla.',
    'Una revisione condivisa conserva analisi e snapshot economico. La riapertura recupera i dati disponibili; un catalogo non più disponibile impedisce il ripristino dello snapshot.',
    '“Nuova Iniziativa” svuota il lavoro corrente dopo conferma se sono presenti dati. Salva prima le modifiche da conservare.',
  ] },
  { title: 'Contratto e listino', subtitle: 'Scegliere la fonte economica corretta', steps: [
    'In “Risorse e configurazione” scegli il catalogo del contratto di sistema e il lotto. “Poste TeT” è un catalogo incluso nell’app: è distinto dal contratto dell’Archivio.',
    'Quando la stima contiene righe, la selezione del catalogo è bloccata. Per un altro contratto avvia una nuova iniziativa.',
    'In Offerta o Revisione controlla il “Listino TOW per la stima”. Se il listino è su un diverso record contrattuale dell’Archivio, scegli esplicitamente il “Contratto di origine dei prezzi TOW”.',
    'Verifica che i prezzi unitari siano disponibili. Percentuali di impatto, pesi contrattuali e prezzi unitari sono dati diversi: non sono intercambiabili.',
  ], note: 'Il modello Excel non viene usato come ripiego per i prezzi. Se compare “Quantità n.d.”, l’importo percentuale può essere calcolato ma manca il prezzo per ottenere la quantità equivalente.' },
  { title: 'Importazione Excel', subtitle: 'Riepilogo interventi e DettaglioInterventi', steps: [
    'Usa “Importa Tabella di Offerta” nel passaggio Iniziativa. Il workbook deve contenere il foglio di riepilogo dell’iniziativa e il foglio “DettaglioInterventi” con le intestazioni originali.',
    'Il riepilogo identifica interventi, attività, sistema e requisiti. DettaglioInterventi contiene le singole componenti, voce catalogo, tipo, complessità, quantità e prezzi.',
    'L’importazione crea una revisione con nome del file e snapshot dei dati. Una nuova importazione sullo stesso GOTO aggiunge una revisione senza riscrivere analisi e decisioni già salvate.',
    'In “Mostra dettaglio importato” apri un ID_INTERVENTO per consultarne le componenti. Il totale nell’intestazione somma quantità × prezzo in uso delle componenti; un prezzo assente rende il totale non disponibile.',
  ], note: 'La verifica AI parte dopo l’importazione. Un errore AI non annulla i dati importati. Se il salvataggio della revisione fallisce, viene segnalato: salva dal workspace dopo aver controllato lo storico.' },
  { title: 'Catalogo e verifica AI', subtitle: 'Validare attività e importi, una riga alla volta', steps: [
    'In “Confronto Excel e Voci Catalogo” scegli la vista Interventi oppure Voce catalogo. Apri il gruppo e poi l’intervento o la voce per vedere le attività associate.',
    'La verifica AI è subito dopo Voce catalogo: leggi esito, motivazione, indicazione ed evidenze. “Coerente secondo AI” è un parere, non un’approvazione umana o una certificazione del codice.',
    'In “Possibili integrazioni” ogni proposta è una voce del catalogo che potrebbe servire all’intervento indicato. Leggi il nome, l’ambito e il motivo della proposta, poi verifica che l’attività non sia già coperta. Selezionala solo se pertinente. Il codice driver-… consultabile nei riferimenti tecnici identifica la voce nel sistema: non è un ID intervento o contratto e non richiede azioni.',
    'Dopo modifiche ai dati usati dal controllo, il risultato è marcato “Da aggiornare”. Premi “Verifica / aggiorna coerenza AI delle righe”. Errori e risposte non valide sono mostrati per riga.',
    'L’associazione indica quale voce del catalogo contrattuale rappresenta le attività del file. ID Excel è il codice nel workbook; ID Intervento raggruppa le attività; il contratto è il contesto economico scelto. Un codice driver-… è solo il riferimento tecnico della singola voce, non l’ID del contratto: non devi compilarlo.',
    'Esempio: 58 righe Excel con codice 242 e nome “Realizzazione stored procedure o equivalente” possono essere collegate alla voce “Realizzazione stored procedure, script SQL o equivalente”. Il sistema riconosce i codici o un nome univoco con ambito compatibile; la somiglianza non certifica la correttezza tecnica delle 58 attività. Controlla le attività e il parere AI.',
    'Se l’associazione attuale è corretta, non serve confermarla: è già usata per il confronto. Se manca o è errata, scegli la voce corretta, leggine descrizione e criteri e conferma. Il collegamento cambia per tutte le righe di questa offerta con lo stesso codice Excel, ma non modifica attività, quantità, tipo, complessità o prezzi. Se le righe richiedono voci diverse, non confermare un’associazione unica: correggi prima il dettaglio di origine.',
    '“Mostra dettagli e importi” rende visibili tipo/complessità, quantità e prezzi. “Usa catalogo” aggiorna il prezzo della singola riga. L’associazione da sola non aggiorna i prezzi.',
  ], note: 'Salva una valutazione o una revisione per conservare i pareri ricevuti. Nessuna risposta simulata dei test entra nelle iniziative reali.' },
  { title: 'Documenti e fonti', subtitle: 'Dall’originale al contesto selezionato', steps: [
    'Carica gli allegati in “Documentazione ricevuta” (massimo 10 MB per file). Ogni originale ha identificativo, autore, data e impronta SHA-256. Un nome uguale non sovrascrive l’allegato precedente.',
    'Premi “Estrai testo” per PDF testuali, DOCX, XLSX e formati di testo supportati. “Consulta estratto salvato” recupera il testo già estratto.',
    'Usa ricerca e navigazione del lettore. Seleziona le sezioni pertinenti e premi “Usa sezioni selezionate nel contesto AI”. I checkbox da soli non inviano il testo all’AI.',
    'Il contesto documentale ammette fino a 48.000 caratteri; l’estrazione fino a 500.000 per documento. Parti non lette, errori e formati non supportati sono segnalati. Immagini e PDF scansionati non hanno OCR in questa versione.',
    '“Collega alle fonti dell’analisi” aggiunge il riferimento testuale. “Elimina allegato” lo rimuove dall’elenco attivo e dalla selezione AI della tua bozza; le revisioni precedenti e gli originali citati restano conservati.',
  ], note: 'Caricare, estrarre e includere nel contesto AI sono tre operazioni distinte. Salva la revisione per conservare le fonti selezionate.' },
  { title: 'Analisi e conversazione', subtitle: 'L’AI propone, gli specialisti decidono', steps: [
    'Compila AS-IS, TO-BE, fatti verificati, ipotesi e punti da confermare con Poste. Collega le fonti alle conclusioni e documenta i riferimenti a repository e interrogazioni.',
    'Salva una revisione prima di inviare una domanda nel “Confronto AI condiviso”. La richiesta usa l’ultima revisione salvata e gli ultimi sei scambi, con la configurazione AI personale dell’utente.',
    'Domande e risposte sono condivise per GOTO e ambiente, con autore, data, modello e revisione. “Consulta contesto usato” mostra lo snapshot inviato. La cronologia completa rimane consultabile.',
    'Puoi portare una proposta AI nelle decisioni da valutare. Controlla testo e fonte, approva esplicitamente quando opportuno e salva una nuova revisione. La proposta non è approvata automaticamente.',
  ], note: 'Repository e query indicati manualmente non equivalgono ad accessi Git/VPN eseguiti. La ricerca di memoria correlata usa sistema o famiglia: non è una ricerca semantica sull’intero archivio.' },
  { title: 'Revisioni e collaborazione', subtitle: 'Salvare, confrontare e approvare', steps: [
    'In “Modifiche e motivazione della revisione” descrivi cosa è cambiato e perché. “Salva nuova revisione con stima corrente” conserva analisi, decisioni, fonti e snapshot economico.',
    '“Aggiorna storico senza perdere la bozza” recupera le nuove revisioni. Confronta due versioni nello storico. “Riprendi analisi e stima” sostituisce la bozza dopo conferma ma conserva le versioni già salvate.',
    'Se un collega ha già salvato dalla tua stessa versione, ricevi un conflitto. Non ricaricare la pagina: conserva la tua bozza, aggiorna lo storico e riconcilia le modifiche prima di salvare.',
    'Admin, Developer e SuperAdmin lavorano sulle analisi. Bid Manager e SuperAdmin possono approvare la revisione salvata. Le decisioni approvate non si riscrivono: documenta un cambiamento con una nuova decisione.',
  ], note: 'La collaborazione è asincrona con controllo dei conflitti, non co-editing in tempo reale. “Salva valutazione” conserva l’offerta nell’archivio esistente; le revisioni workspace conservano anche lo storico delle analisi.' },
  { title: 'Offerta ed export HLD', subtitle: 'Valorizzare e produrre il workbook', steps: [
    'In Revisione trovi una scheda di sviluppo per ogni attività. L’applicativo è ricavato dal sistema dell’iniziativa e dalle configurazioni salvate. Il percorso NPSO è un riferimento: seleziona la cartella per autorizzare la lettura dei file nella sessione browser.',
    'Compila file coinvolti, soluzione tecnica e criteri di accettazione per ogni attività. Per dichiararla verificata aggiungi evidenze di test o verifica. Il configuratore non esegue quei test e non genera automaticamente patch verificate. Le schede vengono salvate con valutazioni/revisioni e incluse nel pacchetto ZIP per Visual Studio Code.',
    'In Offerta verifica le righe a catalogo e le percentuali TOW .1, .3 e .4 associate al contratto. L’importo è valore catalogo × moltiplicatore della stima × percentuale / 100; la quantità equivalente è importo / prezzo unitario.',
    'TOW .2 e .6 sono manuali. Nell’export del modello a cinque TOW, .2 viene ripartita fra gli interventi in proporzione al valore catalogo. Una TOW .6 valorizzata non è rappresentabile da quel modello.',
    'In Revisione seleziona il modello XLSX originale con i due fogli e premi “Genera Tabella di offerta XLSX”. Non inserire le percentuali come quantità manuali nell’export.',
    'Il generatore sostituisce i dati di esempio, adatta le righe e collega il riepilogo al dettaglio tramite formule. Usa i prezzi del catalogo selezionato e il listino TOW scelto; prezzi mancanti o associazioni non risolte bloccano l’export con un messaggio.',
    'Il modello attuale non rappresenta sconto, contingency e TOW .6: se valorizzati, occorre un modello adeguato. Controlla il file scaricato in Excel prima della consegna, inclusi totali, stampa e formattazione.',
  ], note: 'L’export non modifica l’originale scelto. Sono disponibili anche le esportazioni JSON, CSV e i documenti Markdown previsti dal configuratore.' },
  { title: 'Dall’Excel al codice', subtitle: 'Percorso pratico · NPSO → Visual Studio Code',
    highlights: [
      { title: 'Nel configuratore', text: 'Importi le attività, prepari e rivedi le schede tecniche, conservi le evidenze ed esporti la richiesta di sviluppo.' },
      { title: 'In Visual Studio Code', text: 'Lavori sul repository reale con lo sviluppatore o un assistente di coding, produci le modifiche ed esegui build e test.' },
    ], steps: [
      'PRIMA DI INIZIARE — Verifica che frontend e backend DEV siano aggiornati e Live su Render. Configura il servizio AI personale dal Profilo. Il ruolo deve consentire l’analisi AI. Un errore 404 nella preparazione della scheda indica che l’endpoint backend non è disponibile: non è un problema del file Excel.',
      'IMPORTA E CONTROLLA — Apri l’iniziativa e importa la Tabella di Offerta. In “Mostra dettaglio importato” controlla ID intervento e numero delle attività: ad esempio un intervento con 29 righe deve produrre 29 schede distinte. Valida descrizioni, associazioni catalogo e pareri AI prima di procedere.',
      'DEFINISCI IL RISULTATO — Nel workspace completa AS-IS, TO-BE, regole, decisioni e punti aperti. Collega i documenti e seleziona gli estratti pertinenti. Salva una revisione. Il parere sulla voce di catalogo non dimostra che l’attività sia implementata nei sorgenti.',
      'SELEZIONA I SORGENTI — Vai in Revisione → Schede di sviluppo. Controlla l’applicativo NPSO e il percorso configurato. Premi “Seleziona cartella sorgenti per questa sessione” e scegli /Users/MSTEFANE/opencode/github-repositories/NPSO, oppure la cartella corretta sul tuo computer. Render non può leggere automaticamente un percorso sul Mac; dopo un ricaricamento devi riselezionare i file.',
      'INIZIA DA UNA SOLA ATTIVITÀ — Apri la scheda dell’Attività 1 e premi “Prepara scheda con AI”. La richiesta usa la descrizione dell’attività e un campione di sorgenti selezionati: fino a 60 file letti e otto estratti inviati. Non è una scansione completa del repository e non esegue compilazioni o test.',
      'CONTROLLA LA PROPOSTA — Leggi soluzione, criteri di accettazione, file e righe citati, ipotesi e punti aperti. I riferimenti vengono controllati rispetto agli estratti inviati: questo conferma dove sono nel campione, non la correttezza funzionale della soluzione. Un file ipotizzato non va considerato letto. Se il campione non è pertinente, seleziona una cartella più mirata e ripeti la preparazione.',
      'INSERISCI E COMPLETA LA BOZZA — Premi “Inserisci bozza nella scheda” soltanto dopo averla letta: la conferma sostituisce file, soluzione e criteri correnti. Aggiungi i dettagli mancanti e risolvi i dubbi con il team. La bozza non diventa automaticamente approvata o verificata.',
      'PASSA ALLE ALTRE ATTIVITÀ — Ripeti la verifica per le altre 28 righe, controllando dipendenze e file condivisi. Compila file coinvolti, soluzione e criteri prima di segnare “Pronta per sviluppo”. Registra lo stato e salva una valutazione o una revisione per conservare il lavoro; non lasciare le schede solo nella sessione aperta.',
      'PREPARA IL PROGETTO NELL’APP — In Revisione → “Prepara progetto · Visual Studio Code” inserisci nome, tipo e obiettivo. Compila le decisioni su runtime, interfacce, mapping, errori, duplicati, accessi e test con scelta, fonte e referente. Le voci mancanti restano aperte: non serve scegliere una tecnologia senza conferma. Salva una valutazione o una revisione per conservare questa configurazione per l’iniziativa.',
      'GENERA IL PACCHETTO DI AVVIO — Premi “Genera progetto di avvio ZIP”: per qualsiasi iniziativa produce README, workspace VS Code, schede attività, architettura, registro decisioni e piano test, con cartelle src, contracts e fixtures da completare. Il piano test è una checklist non eseguita: il generatore non inventa payload o test operativi. Lo ZIP non contiene i sorgenti locali né un workflow distribuibile.',
      'PREPARA LA CONSEGNA — Nella sezione sviluppo scegli Visual Studio Code, indica il branch di lavoro, le note e i test attesi. “Genera ZIP richiesta modifica codice” è il pacchetto di richiesta esistente, distinto dal progetto di avvio. Controlla che le attività incluse siano effettivamente quelle da consegnare: le righe importate sono incluse dal flusso corrente e l’importazione non equivale ad approvazione tecnica.',
      'VERIFICA LO ZIP — Il pacchetto contiene README_MODIFICA_CODICE.md, richiesta_modifica_codice.json, piano_sviluppo.md, SCHEDE_SVILUPPO.md, schede_sviluppo.json ed elenco_file_repository.txt. Le schede riportano quanto hai salvato; il pacchetto non contiene automaticamente tutto il repository o codice già modificato.',
      'IMPLEMENTA IN VISUAL STUDIO CODE — Apri la cartella reale del progetto e il branch concordato. Fornisci al tuo assistente di coding la richiesta e le schede, chiedendo di verificare i file citati sul checkout effettivo, preservare modifiche concorrenti e lavorare su un’attività alla volta. Visual Studio Code da solo è un editor: la modifica viene scritta dallo sviluppatore o da un assistente configurato con accesso ai sorgenti.',
      'VERIFICA E RESTITUISCI LE EVIDENZE — Controlla il diff, esegui i comandi di build e i test pertinenti al modulo, quindi verifica i criteri di accettazione. Per NPSO i moduli WLS, OSB, BPEL e microservizi possono richiedere strumenti e dipendenze differenti: usa quelli del progetto. Riporta nella scheda comandi, esiti e commit, poi imposta “Verificata” soltanto con evidenze e salva una nuova revisione.',
      'GENERA FILE REALI — Nella scheda attività apri “Generazione codice / workflow · target applicativo”. Scegli l’applicativo, indica modulo, stack/runtime e DB/versione (o Non applicabile), quindi contratti e convenzioni. Per modificare file esistenti elenca percorsi relativi degli originali completi presenti nella cartella selezionata (massimo otto); lascia vuoto per soli file nuovi. La scheda deve avere soluzione e criteri di accettazione. Genera, consulta ogni file e il relativo originale, quindi conserva gli artefatti nella scheda e scarica lo ZIP sorgenti. I percorsi e le impronte degli originali vengono controllati: un riferimento ipotizzato o un estratto parziale non basta per modificare un file.',
      'CONSERVA E VERIFICA — Lo ZIP sorgenti contiene proposed/, original/ per i file modificati, manifest e test suggeriti. Non è lo ZIP di avvio. Confronta i file con il checkout effettivo; verifica l’impronta base per update e l’assenza del percorso per create prima di applicare le modifiche. Un nuovo target o una nuova generazione sostituiscono gli artefatti correnti solo alla conferma: scarica e salva prima una revisione. L’AI può segnalare decisioni mancanti senza generare file. Generato non significa compilato, distribuibile o collaudato: build, test, validazione DB/cloud e deployment restano da eseguire con gli strumenti dell’applicativo.',
    ], note: 'La generazione produce ora contenuto sorgente reale per attività e target. Il sistema non applica modifiche, non esegue SQL, build o deploy. La prontezza al rilascio va dimostrata con le verifiche del repository e dell’ambiente destinatario. Il worker automatico di compilazione/test è ancora da implementare.' },
];

export function UserManual({ chapters, title, subtitle, triggerLabel = 'Manuale d’uso', triggerHint = 'Guida alla sezione', compact = false }) {
  const [open, setOpen] = useState(false);
  const [chapter, setChapter] = useState(0);
  const dialog = useRef(null);
  const content = useRef(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const element = dialog.current;
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [open]);
  const current = chapters[chapter];
  return <>
    <button type="button" className={`tow-manual-trigger${compact ? ' tow-manual-trigger-compact' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog">
      <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1zM12 5v15"/></svg>
      <span>{triggerLabel}{!compact && <small>{triggerHint}</small>}</span>
    </button>
    {open && createPortal(<dialog ref={dialog} className="tow-manual" aria-labelledby={titleId} onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header className="tow-manual-header"><div><span>GUIDA OPERATIVA</span><h2 id={titleId}>{title}</h2><p>{subtitle}</p></div><button type="button" autoFocus aria-label="Chiudi manuale" onClick={() => setOpen(false)}>✕</button></header>
      <div className="tow-manual-layout"><nav aria-label="Indice del manuale">{chapters.map((entry, index) => <button type="button" key={entry.title} aria-current={chapter === index ? 'page' : undefined} onClick={() => { setChapter(index); content.current?.scrollTo({ top: 0 }); }}><span>{String(index + 1).padStart(2, '0')}</span>{entry.title}</button>)}</nav>
        <article ref={content} className="tow-manual-content"><span className="tow-manual-section-number">Capitolo {chapter + 1} di {chapters.length}</span><h3>{current.title}</h3><p className="tow-manual-subtitle">{current.subtitle}</p>{current.highlights && <div className="tow-manual-highlights">{current.highlights.map(card => <section key={card.title}><strong>{card.title}</strong><p>{card.text}</p></section>)}</div>}<ol>{current.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>{current.note && <aside><strong>Da ricordare</strong><p>{current.note}</p></aside>}<footer><button type="button" disabled={chapter === 0} onClick={() => { setChapter(chapter - 1); content.current?.scrollTo({ top: 0 }); }}>← Precedente</button><button type="button" disabled={chapter === chapters.length - 1} onClick={() => { setChapter(chapter + 1); content.current?.scrollTo({ top: 0 }); }}>Successivo →</button></footer></article>
      </div>
    </dialog>, document.body)}
  </>;
}

export default function ConfiguratorManual() {
  return <UserManual chapters={chapters} title="Configuratore Offerta TOW" subtitle="Dall’iniziativa alla proposta tecnica ed economica." triggerHint="Guida al configuratore" />;
}
