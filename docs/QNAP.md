# MEV Governance su NAS QNAP (Container Station)

Questa guida installa l'app sul QNAP TS-433 con gli **stessi dati di Render**. Il database non si sposta: resta su Supabase e il NAS ospita solo le tre parti dell'app (frontend, backend, lettore PDF).

> Cosa e' provato e cosa no. Il proxy del frontend, i certificati e il calcolo delle impronte senza HTTPS sono stati provati su un computer con nginx e Chrome veri. **Non sono stati provati sul QNAP**: ne' l'avvio dei container su ARM, ne' Container Station. Le immagini `:dev` esistono per `arm64`. I passi 5 e 6 qui sotto servono proprio a verificarlo.

## Cosa serve

- QNAP TS-433 con **Container Station** (QTS 5.x). Il TS-433 ha un processore ARM a 64 bit: le immagini pubblicate sono `linux/arm64`.
- Il NAS deve poter raggiungere **Internet**: scarica le immagini da `ghcr.io` e si collega al database su Supabase.
- Tre valori presi da Render (servizio `mev-governance-backend-dev` → *Environment*):
  - `DATABASE_DIRECT_URL`
  - `ADMIN_PASSWORD` (vedi l'avviso sotto)
  - `DB_SCHEMA` (di solito `dev`)

> **Avviso sulla password admin.** A ogni avvio il backend imposta la password dell'utente `MSTEFANE` al valore di `ADMIN_PASSWORD`. Poiche' il database e' lo stesso di Render, **usa la stessa password che ha su Render**. Se ne metti un'altra, cambia anche quella di Render.

## Passi

### 1. Fermare e togliere i vecchi container (facoltativo ma consigliato)
In Container Station elimina `mev-frontend`, `mev-backend`, `mev-pdf-parser`, `mev-postgres`. Eliminare un container non cancella le cartelle sul NAS. **Non eliminare `/share/Public/mev-data`** finche' non sai se contiene qualcosa che ti serve (per esempio file caricati). Il vecchio `mev-postgres` non serve piu': i dati ora sono su Supabase.

### 2. Preparare la cartella
Crea una cartella sul NAS, per esempio `/share/Container/mev`, e copiaci:
- `docker-compose.qnap.yml`
- `.env.qnap.example` (da rinominare in `.env`, vedi sotto)

Dal repository: `https://github.com/MauroStefanelli/mev-governance` (ramo `develop`).

### 3. Compilare `.env`
Copia `.env.qnap.example` in `.env` e compila:
- `NAS_HOST`: l'indirizzo del NAS (es. `192.168.1.144`).
- `DATABASE_DIRECT_URL`, `ADMIN_PASSWORD`, `DB_SCHEMA`: da Render.
- `JWT_KEY`: una stringa casuale lunga. Generala con `openssl rand -base64 48` (su Mac o Linux). Cambiarla in futuro fa uscire tutti gli utenti.
- `DATA_DIR`: percorso assoluto di una cartella del NAS per i file caricati, es. `/share/Container/mev/data`.

Il compose si rifiuta di partire, dicendo cosa manca, se `DATABASE_DIRECT_URL`, `JWT_KEY` o `ADMIN_PASSWORD` sono vuoti.

### 4. Avviare
In Container Station → *Applications* → *Create* → incolla il contenuto di `docker-compose.qnap.yml` e indica il file `.env`. Oppure, da SSH nella cartella:

```
docker compose -f docker-compose.qnap.yml up -d
```

Le immagini (circa 400 MB in totale) vengono scaricate la prima volta.

### 5. Verificare che i container siano partiti
```
docker compose -f docker-compose.qnap.yml ps
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
Ogni push sul ramo `develop` pubblica automaticamente le nuove immagini (circa 15 minuti). Per aggiornare il NAS:

```
docker compose -f docker-compose.qnap.yml pull
docker compose -f docker-compose.qnap.yml up -d
```

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
| Il compose dice "compilare ... nel file .env" | Manca un valore obbligatorio |
| Il frontend si apre ma il login dice errore di rete | Il backend non e' partito: `docker logs mev-backend` |
| Il backend dice errore di connessione al database | `DATABASE_DIRECT_URL` errato, o il NAS non raggiunge Supabase |
| "Impossibile accedere" con la password giusta di Render | `ADMIN_PASSWORD` nel `.env` diversa da quella di Render |
| Il browser blocca l'HTTPS | Certificato autofirmato: accetta l'eccezione, o monta un certificato vero |
| Caricare un file molto grande fallisce | Limite del proxy: 60 MB (`MAX_BODY`) |
