export const CONTRACT_SUMMARIES={
  'poste-tet-2025':{
    title:'Sintesi operativa del contratto',
    subtitle:'Obblighi di fornitura, TOW, deliverable, team e livelli di servizio',
    lots:{
      '1':{
        title:'Lotto 1 – Sistemi Postali di Tracciatura',
        conclusion:'Ogni Buono di Consegna deve essere collegato al TOW corretto, a un team coerente, ai deliverable previsti, agli SLA applicabili, al verbale di accettazione e alla garanzia. Capitolato, documenti di gara e offerta tecnica aggiudicata costituiscono un unico quadro contrattuale.',
        dimensioning:['TOW01.1–TOW01.4: 77 risorse e 27.275 giorni/persona','TOW01.5: valorizzazione a catalogo e skill mix del team','TOW01.6: 16 risorse e 1.440 giorni/persona'],
        tow:[
          ['TOW01.1','Requisiti e progettazione','510','46,44%'],
          ['TOW01.2','Soluzioni fuori catalogo','95','20,45%'],
          ['TOW01.3','Test e collaudo','510','14,78%'],
          ['TOW01.4','Certificazione, produzione, post-avvio e formazione','510','12,67%'],
          ['TOW01.5','Realizzazione/modifica da catalogo','Incluso nei task','Catalogo'],
          ['TOW01.6','Manutenzione e supporto','24 canoni','5,66%']
        ],
        catalogNote:'Per le modifiche, il valore è calcolato rispetto alla voce media: semplice 10%, media 30%, complessa 50%.',
        deliverables:{
          'TOW01.1':['Analisi funzionale','Manuale utente','Architettura applicativa e tecnologica','Scheda tecnica','Master Plan e organigramma','Documentazione OTE e sicurezza'],
          'TOW01.2 / TOW01.5':['Codice sorgente e specifiche tecniche','Provisioning, storage, dati e migrazione','Piano e report di unit test','Script di automazione','Manuali e release notes','Change request e system test report'],
          'TOW01.3':['Strategia, piano e report di test','Verbale di collaudo','Kit di installazione e user test','Manuali, formazione e troubleshooting','Rapporto finale'],
          'TOW01.4':['Test case e manuali aggiornati','Provisioning e scheda tecnica','User test e formazione','Manuale operativo','Elenco change request'],
          'TOW01.6':['Report correttiva e SLA','Release notes e documentazione aggiornata','Configurazioni e knowledge base','Report operativi']
        },
        sources:['Capitolato tecnico All. 1.1','Catalogo SW Lotto 1 – All. 3.1','Accordo Quadro e lettera d’invito','Offerta tecnica aggiudicata','Disciplina economica e penali']
      },
      '2':{
        title:'Lotto 2 – Sistemi di Logistica Integrata',
        conclusion:'Ogni Buono di Consegna deve essere collegato al TOW corretto, a un team coerente, ai deliverable previsti, agli SLA applicabili, al verbale di accettazione e alla garanzia. Capitolato, documenti di gara e offerta tecnica aggiudicata costituiscono un unico quadro contrattuale.',
        dimensioning:['TOW02.1–TOW02.4: 85 risorse e 30.130 giorni/persona','TOW02.5: valorizzazione a catalogo e skill mix previsto','TOW02.6: 17 risorse e 1.272 giorni/persona'],
        tow:[
          ['TOW02.1','Requisiti e progettazione','410','32,26%'],
          ['TOW02.2','Soluzioni fuori catalogo','140','25,88%'],
          ['TOW02.3','Test e collaudo','410','27,42%'],
          ['TOW02.4','Certificazione, produzione, post-avvio e formazione','410','9,68%'],
          ['TOW02.5','Realizzazione/modifica da catalogo','Incluso nei task','Catalogo'],
          ['TOW02.6','Manutenzione e supporto','24 canoni','4,77%']
        ],
        catalogNote:'Il TOW02.5 usa il Catalogo SW Lotto 2 e richiede, quando pertinenti, competenze SAP: Architect Microsoft SAP, SAP ABAP Programmer, Sistemista Microsoft SAP e DBA Microsoft SAP. Per le modifiche: semplice 10%, media 30%, complessa 50% della voce media.',
        deliverables:{
          'TOW02.1':['Analisi funzionale','Manuale utente','Architettura applicativa e tecnologica','Scheda tecnica','Master Plan e organigramma','Documentazione OTE e sicurezza'],
          'TOW02.2 / TOW02.5':['Codice sorgente e specifiche tecniche','Provisioning, storage, dati e migrazione','Piano e report di unit test','Script di automazione','Manuali e release notes','Change request e system test report'],
          'TOW02.3':['Strategia, piano e report di test','Verbale di collaudo','Kit di installazione e user test','Manuali, formazione e troubleshooting','Rapporto finale'],
          'TOW02.4':['Test case e manuali aggiornati','Provisioning e scheda tecnica','User test e formazione','Manuale operativo','Elenco change request'],
          'TOW02.6':['Report correttiva e SLA','Release notes e documentazione aggiornata','Configurazioni e knowledge base','Report operativi']
        },
        sources:['Capitolato tecnico All. 1.1','Catalogo SW Lotto 2 – All. 3.2','Accordo Quadro e lettera d’invito','Offerta tecnica aggiudicata','Disciplina economica e penali']
      }
    },
    common:{
      obligations:[
        ['Team completo','Entro 30 giorni solari dalla stipula'],
        ['Consolidamento','Entro 45 giorni, con Verbale di rispondenza'],
        ['Passaggio di consegne','Entro 60 giorni dalla costituzione del team'],
        ['Affiancamento uscente','Fino a 30 giorni verso il fornitore subentrante'],
        ['Sostituzione risorse','Entro 15 giorni solari, con profilo equivalente o superiore e senza costi aggiuntivi'],
        ['Stabilità team','Sostituzioni massime: Master/Senior 10%, Expert/Junior 20%, Canone 10%']
      ],
      coverage:['Task: lunedì–venerdì 8:30–17:30, con possibili attività fuori orario e nel fine settimana','Help Desk di II livello: lunedì–venerdì 8:00–18:00; sabato 8:00–13:00','Manutenzione correttiva: H24, 7 giorni su 7','Attività fuori orario stimate in 48 giornate/anno, non intese come limite'],
      lifecycle:['Emissione del Buono di Consegna/Ordine con TOW, perimetro, obiettivi, dimensione e durata','Definizione e approvazione del Master Plan','Attivazione di un team coerente con profili e seniority richiesti','Uso di template e strumenti Poste e deposito di tutti gli artefatti','Consegna e accettazione del 100% dei deliverable','Verbale di accettazione e avvio della garanzia'],
      quality:[['Completamento attività','100% del Master Plan'],['Rischio del codice','≤ 3'],['Anomalie bloccanti','< 2%'],['Anomalie non bloccanti','< 5%'],['Complessità ciclomatica','≤ 20 per modulo'],['Deliverable conformi alla prima versione','≥ 90%']],
      service:[
        ['Ripristini nei tempi','≥ 95%','30%'],
        ['Risoluzioni nei tempi','≥ 95%','30%'],
        ['Malfunzionamenti trimestrali','VH 1; HG ≤ 2; MD ≤ 3; LW ≤ 5','40%']
      ],
      severity:[
        ['Very High','Ripristino 45 min (8–22 lun–sab), 1,5 h negli altri orari; risoluzione 4 h'],
        ['High','Ripristino 1,5 h (8–19 lun–sab), 3 h negli altri orari; risoluzione 8 h'],
        ['Medium','Risoluzione 24 h'],
        ['Low / adattativa','Risoluzione 72 h']
      ],
      warranty:'Garanzia di 12 mesi dall’accettazione. Le anomalie causate dal rilascio e rilevate nei primi 3 mesi sono incluse nel TOW .4, se correttamente stimato.',
      checklist:[
        ['Inquadramento','Lotto, applicativo, TOW, perimetro e obiettivi corretti'],
        ['Stima','Catalogo, complessità, quantità e attività fuori catalogo motivate'],
        ['Pianificazione','Master Plan, dipendenze, finestre operative e milestone'],
        ['Team','Profili, seniority, copertura e limiti di sostituzione'],
        ['Sicurezza e qualità','OTE, standard Poste, rischio codice e soglie anomalie'],
        ['Deliverable','Elenco completo, template, repository e criteri di accettazione'],
        ['SLA','Severità, ripristino, risoluzione, report e pesi applicabili'],
        ['Accettazione','Collaudo concluso e verbale formalizzato'],
        ['Garanzia','Data di avvio, durata e gestione difetti'],
        ['Economico','TOW, unità, prezzi, quantità e penali coerenti']
      ]
    }
  }
};
