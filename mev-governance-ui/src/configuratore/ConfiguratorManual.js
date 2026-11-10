import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './configuratorManual.css';

const chapters = [
  { title: 'Parti da qui', subtitle: 'Il percorso dall’iniziativa all’offerta', steps: [
    'Apri una scheda dall’Archivio iniziative oppure premi “Nuova Iniziativa”. Compila Codice GOTO, titolo e sistema nel passaggio Iniziativa.',
    'Controlla contratto e lotto in “Risorse e configurazione”. Il GOTO e il titolo rimangono visibili nell’intestazione fissa durante il lavoro.',
    'Importa la Tabella di Offerta esistente oppure prepara l’analisi nel workspace. Prosegui attraverso Iniziativa → Interventi → Offerta → Revisione.',
  ], note: 'Il GOTO collega storico, allegati e conversazione nell’ambiente attivo. Per mantenere separati lavori distinti usa GOTO distinti.' },
  { title: 'Razionali e vincoli con l’AI', subtitle: 'Spiegare perché servono gli interventi', steps: [
    'Nel passo Iniziativa, sotto «Dati iniziativa», trovi «Razionali e vincoli con l’AI». Serve il codice GOTO o il titolo. Scrivi all’AI perché servono gli interventi, quali vincoli tecnici o di processo valgono, cosa è già stato deciso. Invio per inviare, Maiusc+Invio per andare a capo.',
    'L’AI risponde e può proporre voci di tre tipi: razionale (perché serve), vincolo (cosa limita) e decisione (cosa è stato scelto). Le voci proposte compaiono in «Da confermare»: puoi correggerne il testo, poi «Conferma» o «Scarta». L’AI non conferma mai da sola.',
    'Solo le voci confermate sono conoscenza: vengono date al parere AI sull’offerta, alla verifica AI di ogni riga, alle proposte di scheda, alla generazione dei file e agli ZIP di Sviluppo. Le proposte, le scartate e le revocate non vengono mai usate. Una voce collegata a un intervento vale per quell’intervento; una non collegata vale per l’intera iniziativa.',
    '«Aggiungi una voce a mano» crea subito una voce confermata, perché la decide una persona. «Revoca» toglie una voce confermata dall’uso futuro (chiede conferma); la voce resta nello storico.',
    '«Da altre iniziative» mostra le voci confermate in altre iniziative dello stesso ambiente e dello stesso sistema. «Riprendi in questa iniziativa» le copia come proposte, ricordando l’origine: devi confermarle tu, perché possono non valere qui. Così un nuovo intervento sullo stesso sistema parte dalle logiche già stabilite.',
    'La conversazione è unica per iniziativa e ambiente, conservata nel tempo e visibile ai colleghi che lavorano sull’iniziativa. I messaggi più vecchi si caricano con «Mostra messaggi precedenti». Se l’AI non risponde, il tuo messaggio resta salvato.',
  ], note: 'Le risposte dell’AI sono proposte da verificare, non fatti. Non scrivere password, chiavi o dati riservati: la cronologia è visibile ai colleghi dello stesso ambiente. Non cambiano prezzi né stime: orientano l’analisi e lo sviluppo.' },
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
    'In “Modifiche e motivazione della revisione” descrivi cosa è cambiato e perché. “Salva nuova revisione con stima corrente” conserva analisi, decisioni, fonti e snapshot economico. “Salva valutazione” e “Salva e Chiudi” aggiornano l’offerta e la revisione condivisa e confermano il salvataggio solo dopo il riscontro del server. Se viene segnalato un salvataggio parziale o un conflitto, non ricaricare: la pagina resta aperta per conservare il lavoro. Schede di sviluppo, progetto di avvio e richiesta di modifica codice non si modificano più qui: si trovano nell’applicazione Sviluppo iniziative della Home.',
    '“Aggiorna storico senza perdere la bozza” recupera le nuove revisioni. Confronta due versioni nello storico. “Riprendi analisi e stima” sostituisce la bozza dopo conferma ma conserva le versioni già salvate.',
    'Se un collega ha già salvato dalla tua stessa versione, ricevi un conflitto. Non ricaricare la pagina: conserva la tua bozza, aggiorna lo storico e riconcilia le modifiche prima di salvare.',
    'Admin, Developer e SuperAdmin lavorano sulle analisi. Bid Manager e SuperAdmin possono approvare la revisione salvata. Le decisioni approvate non si riscrivono: documenta un cambiamento con una nuova decisione.',
  ], note: 'La collaborazione è asincrona con controllo dei conflitti, non co-editing in tempo reale. “Salva valutazione” conserva l’offerta nell’archivio esistente; le revisioni workspace conservano anche lo storico delle analisi.' },
  { title: 'Offerta ed export HLD', subtitle: 'Valorizzare e produrre il workbook', steps: [
    'In Offerta verifica le righe a catalogo e le percentuali TOW .1, .3 e .4 associate al contratto. L’importo è valore catalogo × moltiplicatore della stima × percentuale / 100; la quantità equivalente è importo / prezzo unitario.',
    'TOW .2 e .6 sono manuali. Nell’export del modello a cinque TOW, .2 viene ripartita fra gli interventi in proporzione al valore catalogo. Una TOW .6 valorizzata non è rappresentabile da quel modello.',
    'In Revisione seleziona il modello XLSX originale con i due fogli e premi “Genera Tabella di offerta XLSX”. Non inserire le percentuali come quantità manuali nell’export.',
    'Il generatore sostituisce i dati di esempio, adatta le righe e collega il riepilogo al dettaglio tramite formule. Usa i prezzi del catalogo selezionato e il listino TOW scelto; prezzi mancanti o associazioni non risolte bloccano l’export con un messaggio.',
    'Il modello attuale non rappresenta sconto, contingency e TOW .6: se valorizzati, occorre un modello adeguato. Controlla il file scaricato in Excel prima della consegna, inclusi totali, stampa e formattazione.',
  ], note: 'L’export non modifica l’originale scelto. Sono disponibili anche le esportazioni JSON e CSV. Per passare allo sviluppo premi “Salva e vai a Sviluppo →” in Revisione.' },
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
