# MEV Governance su NAS QNAP (Container Station)

Questa guida installa l'app sul QNAP TS-433 con una **copia dei dati di Render**. Il NAS ospita tutto: frontend, backend, lettore PDF e un database Postgres. I dati vengono copiati da Render **una volta sola**, al primo avvio.

> **Dopo la copia i due database sono indipendenti.** Quello del NAS non si aggiorna da solo con i dati di Render, e quello che modifichi sul NAS non torna su Render. Per rifare la copia da zero (perdendo quanto fatto sul NAS) si usa `IMPORT_MODE=replace`, vedi sotto.

> Cosa e' provato e cosa no. Il proxy del frontend, i certificati, il calcolo delle impronte senza HTTPS e lo script dei valori sono stati provati su un computer con nginx e Chrome veri. **Non sono stati provati sul QNAP**: ne' l'avvio dei container su ARM, ne' Container Station. Le immagini `:dev` esistono per `arm64`. I passi 5 e 6 servono proprio a verificarlo.

## Cosa serve

- QNAP TS-433 con **Container Station** (QTS 5.x). Il TS-433 ha un processore ARM a 64 bit e 4 GB di RAM: le immagini pubblicate sono `linux/arm64`.
- Il NAS deve poter raggiungere **Internet**: scarica le immagini da `ghcr.io` e `docker.io`, e **al primo avvio** si collega al database di Render per copiarlo.
- Due valori presi da Render (servizio `mev-governance-backend-dev` → *Environment*):
  - `DATABASE_DIRECT_URL` (nel `.env` si chiama `SOURCE_DATABASE_URL`)
  - `ADMIN_PASSWORD` (vedi l'avviso sotto)

> **Avviso sulla password admin.** A ogni avvio il backend imposta la password dell'utente `MSTEFANE` al valore di `ADMIN_PASSWORD`. Poiche' il database e' lo stesso di Render, **usa la stessa password che ha su Render**. Se ne metti un'altra, cambia anche quella di Render.

## Cosa dice la documentazione ufficiale QNAP (letta, non provata sul tuo NAS)

- **Il TS-433 e' adatto.** Scheda tecnica: processore ARM Cortex-A55 a 4 core a 64 bit, **4 GB di RAM non espandibili**, QTS 5.2.x. Container Station supporta Docker sulle architetture ARM a 64 bit e chiede almeno 1 GB di RAM per Docker.
- **Create Application accetta un Docker Compose YAML.** Si apre da *Applications → Create Application*: nome dell'applicazione (1-32 caratteri, lettere, numeri, `-` e `_`), poi si incolla il YAML. C'e' un pulsante di validazione che segnala gli errori di formato. Container Station 3 consente anche di ricaricare un'immagine o un YAML da file.
- **Il file `.env` non e' menzionato** nella parte del manuale dedicata alle applicazioni. Non so se Container Station sostituisce le variabili `${...}` del YAML: per non dipendere da questo ho aggiunto uno script che scrive tutti i valori nel YAML.
- **Dopo la creazione le impostazioni non si modificano.** Per cambiarle si usa *Recreate* (si modifica il YAML e l'applicazione viene ricreata). **Ricreare cancella i dati non salvati in cartelle montate**: per questo i file caricati stanno in `DATA_DIR`, una cartella del NAS.
- **Non ho verificato sul NAS** i punti seguenti, perche' la documentazione non li dice o non e' accessibile: come Container Station tratta i percorsi `/share/...` nei volumi, se la cartella `/share/Container` esiste gia', e quanta RAM resta libera con QTS in funzione.

## Passi

### 1. Togliere i vecchi container (facoltativo ma consigliato)
In Container Station elimina `mev-frontend`, `mev-backend`, `mev-pdf-parser`, `mev-postgres`. Eliminare un container non cancella le cartelle sul NAS. **Non eliminare `/share/Public/mev-data`** finche' non sai se contiene qualcosa che ti serve. Il vecchio `mev-postgres` non serve piu': i dati ora sono su Supabase.

### 2. Creare le cartelle sul NAS
Da File Station crea due cartelle: `/share/Container/mev/data` (file caricati dall'app) e `/share/Container/mev/pgdata` (i dati del database; **deve essere vuota** al primo avvio). Se la cartella `Container` non esiste, creala o scegli un'altra posizione e usala in `DATA_DIR` e `PG_DIR`.

### 3. Preparare i valori (sul tuo computer)
Scarica il repository (ramo `develop`) e, nella sua cartella:
1. Copia `.env.qnap.example` in `.env` e compilalo:
   - `NAS_HOST`: l'indirizzo del NAS (es. `192.168.1.144`).
   - `SOURCE_DATABASE_URL` e `ADMIN_PASSWORD`: da Render (servizio `mev-governance-backend-dev` → *Environment*, voci `DATABASE_DIRECT_URL` e `ADMIN_PASSWORD`).
   - `POSTGRES_PASSWORD`: la password del database del NAS. La inventi tu, o la generi con `openssl rand -base64 24`. **Dopo il primo avvio non cambiarla**: e' scritta nei dati del database.
   - `DB_SCHEMA`: `dev`, salvo che su Render sia diverso.
   - `JWT_KEY`: una stringa casuale lunga, per esempio da `openssl rand -base64 48`.
   - `DATA_DIR` e `PG_DIR`: **percorsi assoluti sul NAS**, es. `/share/Container/mev/data` e `/share/Container/mev/pgdata`.
2. Esegui `python3 scripts/qnap_render_compose.py`. Crea `docker-compose.qnap.rendered.yml` con tutti i valori scritti. Se manca un valore obbligatorio, lo dice. Gestisce anche le password con simboli (`$`, `#`, `:`, `"`), che altrimenti arriverebbero cambiate.

> Il file prodotto **contiene le password**. Usalo e poi cancellalo dal computer. E' escluso da git.

### 4. Creare l'applicazione
In Container Station: *Applications → Create Application* (se esiste gia' un'applicazione `mev` di un tentativo precedente, eliminala prima). Nome per esempio `mev`. Incolla il contenuto di `docker-compose.qnap.rendered.yml`, premi il pulsante di verifica del YAML, poi *Create*. Le immagini (circa 500 MB) vengono scaricate la prima volta da `ghcr.io` e `docker.io`.

Alternativa da SSH, nella cartella con `.env` e `docker-compose.qnap.yml`: `docker compose -f docker-compose.qnap.yml up -d`.

### 5. Verificare che i container siano partiti
**Al primo avvio i container partono uno dopo l'altro**: prima `mev-postgres`, poi `mev-db-import` (che copia i dati e poi **si ferma, con stato "Exited (0)": è normale**), poi backend e frontend. La copia di circa 15 MB richiede meno di un minuto. In Container Station apri l'applicazione e controlla i container. Da SSH:
```
docker ps -a
docker logs mev-db-import
docker logs mev-backend --tail 40
docker logs mev-frontend --tail 10
```
Nel log di `mev-db-import` deve comparire `fatto: schema 'dev' copiato (31 tabelle, 8 utenti)` (i numeri dipendono dai tuoi dati). Nel log del frontend deve comparire `certificato HTTPS autofirmato generato per ...`. Nel log del backend non devono esserci errori di connessione al database. **Se un container resta in riavvio, mandami le ultime righe del suo log.**

### 6. Aprire l'app
- `http://192.168.1.144:3001`
- `https://192.168.1.144:3443` (il browser avvisa che il certificato non e' fidato: e' autofirmato; prosegui)

Accedi con `MSTEFANE` e la password di Render. Controlla in alto il numero di versione (`DEV_REL_...`).

## HTTP e HTTPS

Funzionano entrambi sullo stesso frontend. Il browser chiama sempre lo stesso indirizzo da cui ha ricevuto la pagina e il frontend inoltra `/api` al backend: niente CORS e niente blocco "contenuto misto".

Su **HTTP** alcune funzioni del browser non esistono (`crypto.subtle`, `crypto.randomUUID`): l'app ora le sostituisce con un calcolo equivalente, e il risultato e' identico a quello su HTTPS. Altre funzioni dell'app potrebbero comportarsi diversamente su HTTP: se noti qualcosa, usa HTTPS e dimmelo.

**Certificato HTTPS vero** (senza l'avviso del browser): metti `server.crt` e `server.key` in `CERTS_DIR` (di default `./mev-certs`). In QTS puoi esportare un certificato da *Pannello di controllo → Sicurezza → Certificato e chiave privata*. Il certificato deve includere l'indirizzo o il nome con cui apri l'app.

## Aggiornare
Ogni push sul ramo `develop` pubblica automaticamente le nuove immagini (circa 15 minuti). Per aggiornare il NAS, da SSH nella cartella del compose:

```
docker compose -f docker-compose.qnap.yml pull
docker compose -f docker-compose.qnap.yml up -d
```

Da Container Station: apri l'applicazione e usa l'azione di ricreazione (*Recreate*) con lo stesso YAML: scarica le immagini nuove se la modalita' di aggiornamento lo prevede. Non ho verificato come Container Station tratti le immagini gia' presenti con lo stesso tag; se dopo l'aggiornamento il numero di versione non cambia, elimina le immagini `ghcr.io/maurostefanelli/mev-*` dalla scheda *Images* e ricrea l'applicazione.

## Il database sul NAS

- **Quando copia.** `mev-db-import` gira a ogni avvio dell'applicazione, ma con `IMPORT_MODE=once` (il valore normale) copia **solo se il database del NAS e' ancora vuoto**. Un riavvio, un aggiornamento o *Recreate* non toccano mai i dati.
- **Se la copia fallisce** (rete, password, Render spento), il database del NAS resta com'era e il backend non parte: il log di `mev-db-import` dice il perche'. Correggi il `.env`, rigenera il file e ricrea l'applicazione.
- **Rifare la copia da zero:** metti `IMPORT_MODE=replace` nel `.env`, rigenera il file, ricrea l'applicazione, e **rimetti `once` subito dopo**. Il log avvisa che i dati del NAS vengono cancellati. Tutto cio' che e' stato fatto sul NAS dopo la prima copia si perde.
- **Non usare `replace` come impostazione normale:** a ogni riavvio cancellerebbe i dati del NAS.
- **Cosa viene copiato:** solo lo schema dell'app (`dev`), con tabelle, righe, contatori degli identificativi, funzioni e trigger. Non vengono copiati gli schemi interni di Supabase (utenti di login di Supabase, file, ecc.), che l'app non usa.
- **Backup del database del NAS.** I dati stanno in `PG_DIR`. Per una copia di sicurezza: `docker exec mev-postgres pg_dump -U mev -d mev --schema=dev -Fc > mev-backup.dump`. Il NAS non fa copie automatiche per te: includi `PG_DIR` nei backup del NAS (ma copiare i file di un database acceso puo' dare una copia inutilizzabile: meglio il comando sopra).
- **Versione di Postgres.** `postgres:17-alpine`, la stessa versione di Supabase. La cartella dei dati e' legata alla versione: **non cambiarla** nel compose senza una migrazione.

## Collegare DBeaver al database del NAS

Il database ascolta sulla porta **5433** del NAS. Per default (`PG_BIND=127.0.0.1` nel `.env`) e' chiuso alla rete: ci si arriva solo dal NAS stesso. Nel tuo `.env` l'ho gia' aperto sulla rete locale (`PG_BIND=192.168.1.144`), quindi da un computer nella stessa rete funziona cosi':

1. In DBeaver: **Database → Nuova connessione → PostgreSQL**.
2. Compila:
   - **Host**: `192.168.1.144`
   - **Porta**: `5433`
   - **Database**: `mev`
   - **Nome utente**: `mev`
   - **Password**: il valore di `POSTGRES_PASSWORD` nel tuo `.env`
3. Scheda **PostgreSQL** (nella stessa finestra): attiva **"Mostra tutti i database"** solo se ti serve; non serve per l'app.
4. **Test connessione**. Alla prima volta DBeaver scarica il driver: accetta.
5. Le tabelle sono sotto **mev → Schemas → dev → Tables**. Lo schema `public` e' quasi vuoto: i dati dell'app stanno in `dev`.

**Se non riesci a collegarti:**
| Messaggio | Causa |
|---|---|
| "Connection refused" o "timeout" | Il container `mev-postgres` non e' acceso, o `PG_BIND` e' `127.0.0.1` (la porta e' chiusa alla rete), o un firewall del NAS blocca la porta 5433 |
| "password authentication failed" | La password non e' quella di `POSTGRES_PASSWORD`. Attenzione: dopo il primo avvio cambiare la password nel `.env` non cambia quella dentro il database |
| "database mev does not exist" | Il nome del database e' `mev`, non `postgres` |
| Vedi poche tabelle | Apri lo schema `dev`, non `public` |

**Avvisi di sicurezza**
- Con `PG_BIND=192.168.1.144` **chiunque nella tua rete locale** che conosca la password puo' leggere e **modificare** tutti i dati, aggirando l'app e i suoi controlli di accesso. L'utente `mev` e' amministratore del database.
- **Non** aprire la porta 5433 su Internet (non inoltrarla dal router).
- Quando non ti serve, richiudila: metti `PG_BIND=127.0.0.1` nel `.env`, rigenera il file con `python3 scripts/qnap_render_compose.py` e ricrea l'applicazione.
- **Modifiche dirette.** Se cambi i dati con DBeaver, l'app le vede subito, ma e' facile rovinare qualcosa. Per sola lettura crea un utente che puo' solo leggere: da DBeaver, nello schema `dev`, `CREATE ROLE lettore LOGIN PASSWORD '...'; GRANT USAGE ON SCHEMA dev TO lettore; GRANT SELECT ON ALL TABLES IN SCHEMA dev TO lettore;`, e collegati con quello.
- Alternativa senza aprire la porta alla rete: `PG_BIND=127.0.0.1` e un **tunnel SSH** (in DBeaver, scheda *SSH*: host `192.168.1.144`, utente del NAS; poi come Host del database usa `127.0.0.1` e porta `5433`). Richiede SSH attivo sul NAS.

## Rete e sicurezza

- **Solo il frontend e' raggiungibile dalla rete** (porte `3001` e `3443`). Il backend e il lettore PDF stanno nella rete interna dei container.
- **La porta del database (5433) e' aperta solo se lo decidi** con `PG_BIND` (vedi sopra). Il backend e il lettore PDF non hanno porte pubblicate. Proteggi `.env` e il file generato: contengono le password. Sono esclusi da git.
- Le password non sono scritte nel compose.
- Il backend ha endpoint di emergenza (`/api/auth/emergency-*`) senza autenticazione, e questo vale anche su Render. Non esporre le porte del NAS su Internet finche' non sono stati chiusi.

## Memoria
Il TS-433 ha **4 GB di RAM non espandibili**, condivisi con QTS e con le altre app del NAS. Qui girano backend .NET, lettore PDF (Python) e frontend (nginx). Il backend e' limitato a 400 MB (`DOTNET_GCHeapHardLimit`, pensato per Render): **lascialo cosi'**, non alzarlo se non vedi errori di memoria. Se il NAS rallenta o un container viene riavviato da solo, controlla l'uso della RAM in Container Station e ferma le app QNAP che non usi. Non ho misurato quanta RAM consumano i tre container: e' la prima cosa da guardare dopo l'avvio.

## Se qualcosa non va
| Sintomo | Causa probabile |
|---|---|
| Lo script dice "Mancano dei valori nel file .env" | Manca un valore obbligatorio: compilalo e rilancia lo script |
| Dopo la modifica di un valore l'app non cambia | Le impostazioni di un'applicazione non si modificano: usa *Recreate* con il YAML nuovo |
| Il frontend si apre ma il login dice errore di rete | Il backend non e' partito: `docker logs mev-backend` |
| `mev-db-import` dice "non riesco a leggere l'origine" | `SOURCE_DATABASE_URL` errato, o il NAS non raggiunge Render/Supabase |
| `mev-db-import` dice "il database del NAS NON e' stato modificato" | La copia e' fallita a meta': nulla e' cambiato. Leggi le righe sopra il messaggio e riprova |
| `mev-postgres` si ferma subito | La cartella `PG_DIR` non e' vuota o non ha i permessi giusti: guarda `docker logs mev-postgres` |
| Il backend non parte e `mev-db-import` risulta "Exited (1)" | La copia non e' riuscita: vedi il suo log |
| "Impossibile accedere" con la password giusta di Render | `ADMIN_PASSWORD` nel `.env` diversa da quella di Render |
| Il browser blocca l'HTTPS | Certificato autofirmato: accetta l'eccezione, o monta un certificato vero |
| Caricare un file molto grande fallisce | Limite del proxy: 60 MB (`MAX_BODY`) |
