# Workspace iniziative — primo incremento

Implementazione locale nel branch `codex/configuratore-catalog-reconciliation`.

## Percorso disponibile

Inserire il GOTO nel Configuratore: il pannello Workspace carica le revisioni condivise nell'ambiente corrente. Compilare analisi, fonti e decisioni, indicare modifiche/motivazione e salvare una revisione. Ogni revisione include uno snapshot della stima corrente e del riferimento al catalogo.

- Admin/Developer/SuperAdmin: analisi, decisioni, nuove revisioni.
- Bid Manager/SuperAdmin: approvazione della revisione salvata, con autore/data server.
- Una modifica successiva crea una nuova revisione in analisi; non riscrive l'approvazione precedente.
- Decisioni approvate non riscrivibili/rimovibili nei successivi snapshot; aggiungere una nuova decisione per documentare un cambiamento.
- Versione attesa e vincolo univoco ambiente/GOTO/versione impediscono la sovrascrittura concorrente. HTTP 409 conserva la bozza locale. Aggiornare lo storico, confrontare e usare la revisione appropriata come base prima di riportare le proprie modifiche.
- Confronto fra due revisioni, esportazione ANALISI Markdown e ricerca di precedenti con stesso sistema/famiglia. La ricerca non è semantica.
- Il contesto AI contiene analisi, precedenti con GOTO/versione/autore e istruzioni per citare fonti, distinguere ipotesi/fatti e proporre conferme. Le proposte AI non sono applicate automaticamente. Le citazioni del modello richiedono comunque verifica umana.

## Persistenza e rilascio

Endpoint autenticati `/api/configuratore/workspaces/{goto}/revisions` e `/related`. Tabella append-only applicativa `InitiativeRevisions`, creata nel pre-patch PostgreSQL dello schema configurato. Nessun endpoint di modifica/eliminazione delle revisioni. Il modello è registrato in AppDbContext. Per questa versione la creazione tabella usa il pre-patch esistente, non una migration EF.

Per rendere disponibile il workspace servono **backend e frontend DEV aggiornati**. Il codice non è stato pubblicato durante questa attività. Nessun collegamento VPN è configurato.

## Verifiche

```sh
dotnet build mev-governance-backend/mev-governance-backend.csproj -c Release
dotnet run --project tests/Mev.AuthorizationRegression/Mev.AuthorizationRegression.csproj -- --workspace-only
```

Da `mev-governance-ui`:

```sh
CI=true npm test -- --watchAll=false --runInBand --testPathPattern='src/configuratore|src/release.test.js'
npm run build
```

11 controlli workspace backend e 18 test frontend superati. Build completate con warning. La suite generale AuthorizationRegression fallisce sul controllo preesistente `JWT uses selected contract roles`: da investigare separatamente prima di considerare l'intero ambiente validato. Il test workspace usa SQLite: il vincolo PostgreSQL di concorrenza e il pre-patch richiedono anche prova in DEV reale.

## Capacità da implementare nei prossimi incrementi

- Archivio iniziative unificato e ripristino atomico dello snapshot completo nella stima; oggi “Usa come bozza” recupera l'analisi, non modifica le righe economiche correnti.
- Allegati persistenti con hash, estrazione documentale e riferimenti verificabili; oggi le fonti sono riferimenti testuali.
- Conversazione AI persistente per iniziativa e ricerca semantica/indicizzazione dei contenuti verificati.
- Connettori Git in sola lettura con cronologia e commit; oggi si registrano URL/branch/commit come evidenze, non si interrogano repository remoti.
- Compilazione dell'Estimatore HLD a partire dal template originale, con verifica delle formule e sovrapposizioni. Importazione/export esistenti rimangono disponibili; questo incremento non introduce un generatore HLD completo.
- Connettività VPN e connettori DB/Kafka/OpenShift/log/API con credenziali e permessi per ambiente.
- Presence/live updates: la collaborazione corrente è asincrona con controllo dei conflitti, non co-editing in tempo reale.
- Gestione permessi di ingresso al Configuratore nelle impostazioni pagine/ruoli dell'app, da verificare con gli utenti reali Admin e Bid Manager.
