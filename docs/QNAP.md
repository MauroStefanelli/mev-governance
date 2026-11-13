# MEV Governance su NAS QNAP (Container Station)

Questa guida installa l'app sul QNAP TS-433 con gli **stessi dati di Render**. Il database non si sposta: resta su Supabase e il NAS ospita solo le tre parti dell'app (frontend, backend, lettore PDF).

> Cosa e' provato e cosa no. Il proxy del frontend, i certificati, il calcolo delle impronte senza HTTPS e lo script dei valori sono stati provati su un computer con nginx e Chrome veri. **Non sono stati provati sul QNAP**: ne' l'avvio dei container su ARM, ne' Container Station. Le immagini `:dev` esistono per `arm64`. I passi 5 e 6 servono proprio a verificarlo.

## Cosa serve

- QNAP TS-433 con **Container Station** (QTS 5.x). Il TS-433 ha un processore ARM a 64 bit e 4 GB di RAM: le immagini pubblicate sono `linux/arm64`.
- Il NAS deve poter raggiungere **Internet**: scarica le immagini da `ghcr.io` e si collega al database su Supabase.
- Tre valori presi da Render (servizio `mev-governance-backend-dev` → *Environment*):
  - `DATABASE_DIRECT_URL`
  - `ADMIN_PASSWORD` (vedi l'avviso sotto)
  - `DB_SCHEMA` (di solito `dev`)

> **Avviso sulla password admin.** A ogni avvio il backend imposta la password dell'utente `MSTEFANE` al valore di `ADMIN_PASSWORD`. Poiche' il database e' lo stesso di Render, **usa la stessa password che ha su Render**. Se ne metti un'altra, cambia anche quella di Render.

## Cosa dice la documentazione ufficiale QNAP (letta, non provata sul tuo NAS)

- **Il TS-433 e' adatto.** Scheda tecnica: processore ARM Cortex-A55 a 4 core a 64 bit, **4 GB di RAM non espandibili**, QTS 5.2.x. Container Station supporta Docker sulle architetture ARM a 64 bit e chiede almeno 1 GB di RAM per Docker.
- **Create Application accetta un Docker Compose YAML.** Si apre da *Applications → Create Application*: nome dell'applicazione (1-32 caratteri, lettere, numeri, `-` e `_`), poi si incolla il YAML. C'e' un pulsante di validazione che segnala gli errori di formato. Container Station 3 consente anche di ricaricare un'immagine o un YAML da file.
- **Il file `.env` non e' menzionato** nella parte del manuale dedicata alle applicazioni. Non so se Container Station sostituisce le variabili `${...}` del YAML: per non dipendere da questo ho aggiunto uno script che scrive tutti i valori nel YAML.
- **Dopo la creazione le impostazioni non si modificano.** Per cambiarle si usa *Recreate* (si modifica il YAML e l'applicazione viene ricreata). **Ricreare cancella i dati non salvati in cartelle montate**: per questo i file caricati stanno in `DATA_DIR`, una cartella del NAS.
- **Non ho verificato** i punti seguenti, perche' la documentazione non li dice o non e' accessibile: come Container Station tratta i percorsi `/share/...` nei volumi, se la cartella `/share/Container` esiste gia', e quanta RAM resta libera con QTS in funzione.

## Passi

### 1. Togliere i vecchi container (facoltativo ma consigliato)
In Container Station elimina `mev-frontend`, `mev-backend`, `mev-pdf-parser`, `mev-postgres`. Eliminare un container non cancella le cartelle sul NAS. **Non eliminare `/share/Public/mev-data`** finche' non sai se contiene qualcosa che ti serve. Il vecchio `mev-postgres` non serve piu': i dati ora sono su Supabase.

### 2. Creare le cartelle sul NAS
Da File Station crea `/share/Container/mev/data` (file caricati dall'app). Se la cartella `Container` non esiste, creala o scegli un'altra posizione e usala in `DATA_DIR`.

### 3. Preparare i valori (sul tuo computer)
Scarica il repository (ramo `develop`) e, nella sua cartella:
1. Copia `.env.qnap.example` in `.env` e compilalo:
   - `NAS_HOST`: l'indirizzo del NAS (es. `192.168.1.144`).
   - `DATABASE_DIRECT_URL`, `ADMIN_PASSWORD`, `DB_SCHEMA`: da Render (servizio `mev-governance-backend-dev` → *Environment*).
   - `JWT_KEY`: una stringa casuale lunga, per esempio da `openssl rand -base64 48`.
   - `DATA_DIR`: **percorso assoluto sul NAS**, es. `/share/Container/mev/data`.
2. Esegui `python3 scripts/qnap_render_compose.py`. Crea `docker-compose.qnap.rendered.yml` con tutti i valori scritti. Se manca un valore obbligatorio, lo dice. Gestisce anche le password con simboli (`$`, `#`, `:`, `"`), che altrimenti arriverebbero cambiate.

> Il file prodotto **contiene le password**. Usalo e poi cancellalo dal computer. E' escluso da git.

### 4. Creare l'applicazione
In Container Station: *Applications → Create Application*. Nome per esempio `mev`. Incolla il contenuto di `docker-compose.qnap.rendered.yml`, premi il pulsante di verifica del YAML, poi *Create*. Le immagini (circa 400 MB) vengono scaricate la prima volta da `ghcr.io`.

Alternativa da SSH, nella cartella con `.env` e `docker-compose.qnap.yml`: `docker compose -f docker-compose.qnap.yml up -d`.

### 5. Verificare che i container siano partiti
In Container Station apri l'applicazione e controlla i tre container. Da SSH:
```
docker ps
docker logs mev-backend --tail 40
docker logs mev-frontend --tail 10
```
Nel log del frontend deve comparire `certificato HTTPS autofirmato generato per ...`. Nel log del backend non devono esserci errori di connessione al database. **Se un container resta in riavvio, mandami le ultime righe del suo log.**

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

## Rete e sicurezza

- **Solo il frontend e' raggiungibile dalla rete** (porte `3001` e `3443`). Il backend e il lettore PDF stanno nella rete interna dei container.
- **Il database e' su Internet** (Supabase): proteggi `.env` e non condividerlo. Il file e' escluso da git.
- Le password non sono scritte nel compose.
- Il backend ha endpoint di emergenza (`/api/auth/emergency-*`) senza autenticazione, e questo vale anche su Render. Non esporre le porte del NAS su Internet finche' non sono stati chiusi.

## Memoria
Il backend limita la memoria a 400 MB (impostazione pensata per Render). Sul NAS si puo' alzare con `DOTNET_GCHeapHardLimit` in `.env` (valore in byte, es. `1073741824` per 1 GB), se il NAS ha RAM sufficiente. Controlla quanta ne ha e quanta ne usa Container Station.

## Se qualcosa non va
| Sintomo | Causa probabile |
|---|---|
| Lo script dice "Mancano dei valori nel file .env" | Manca un valore obbligatorio: compilalo e rilancia lo script |
| Dopo la modifica di un valore l'app non cambia | Le impostazioni di un'applicazione non si modificano: usa *Recreate* con il YAML nuovo |
| Il frontend si apre ma il login dice errore di rete | Il backend non e' partito: `docker logs mev-backend` |
| Il backend dice errore di connessione al database | `DATABASE_DIRECT_URL` errato, o il NAS non raggiunge Supabase |
| "Impossibile accedere" con la password giusta di Render | `ADMIN_PASSWORD` nel `.env` diversa da quella di Render |
| Il browser blocca l'HTTPS | Certificato autofirmato: accetta l'eccezione, o monta un certificato vero |
| Caricare un file molto grande fallisce | Limite del proxy: 60 MB (`MAX_BODY`) |
