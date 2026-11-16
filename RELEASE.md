# Rilasciare su DEV: Render e QNAP

Lo stesso `git push origin develop` alimenta **due** ambienti DEV. Si aggiornano in modi diversi.

## Cosa succede da solo
Il push su `develop` avvia GitHub Actions, che in circa 15 minuti pubblica le immagini `:dev` (amd64 e arm64) su `ghcr.io`. **Nessuno dei due ambienti si aggiorna da solo da quel momento**: Render ha `autoDeploy: false` e il NAS non controlla le novita'.

## Dopo ogni rilascio

| Passo | Dove | Quando serve |
|---|---|---|
| 1. Aspetta che finisca la build | GitHub → Actions, esecuzione verde | sempre |
| 2. Manual Deploy del **backend** | Render → `mev-governance-backend-dev` → *Manual Deploy → Deploy latest commit* | solo se e' cambiato il backend (`mev-governance-backend/`) |
| 3. Manual Deploy del **frontend** | Render → `mev-governance-frontend-dev` → *Manual Deploy* | solo se e' cambiato il frontend (`mev-governance-ui/`) |
| 4. Aggiorna il **NAS** | Container Station → Applications → `mev` → *Ricrea* (vedi "Aggiornare il NAS" qui sotto) | sempre, dopo i passi 1-3 se vuoi gli stessi numeri di versione |
| 5. Controlla la versione | in alto nell'app, `DEV_REL_nnn`, su Render e sul NAS | sempre |

Il **backend va aggiornato prima del frontend** quando cambiano entrambi.

## Aggiornare il NAS (passi precisi)

**Cosa vuol dire "Recreate".** In Container Station un'applicazione e' definita da un testo (il YAML) che hai incollato la prima volta. *Ricrea* (Recreate) significa: "ferma i container di questa applicazione, riscaricane le immagini e riaccendili". I **dati restano**: il database sta nella cartella `PG_DIR` e i file caricati in `DATA_DIR`, fuori dai container. Si ricreano solo i container.

**Prima di cominciare**
1. Aspetta che su GitHub → Actions la build dell'ultimo rilascio sia **verde** (circa 15 minuti dal push). Prima di allora il NAS scaricherebbe ancora la versione vecchia.
2. Genera il file da incollare, sul tuo computer, nella cartella del progetto: `python3 scripts/qnap_render_compose.py`. Crea `docker-compose.qnap.rendered.yml`. Serve **sempre la prima volta dopo il rilascio `DEV_REL_070` e ogni volta che e' cambiato il compose o il `.env`**; negli altri casi puoi riusare il testo gia' incollato, ma rigenerarlo e' innocuo e ti evita di non sapere quale versione hai sul NAS.

**Passi in Container Station** (le voci sono quelle della documentazione QNAP: *Applications*, *Ricrea*, *Aggiorna*)
1. Menu a sinistra: **Applications**.
2. Nell'elenco clicca sull'applicazione **`mev`** per aprirla.
3. In alto nel pannello clicca **Ricrea** (accanto a *Modifica*). Si apre la finestra **Ricrea applicazione**.
4. Nel campo YAML **cancella tutto** e incolla il contenuto di `docker-compose.qnap.rendered.yml` (aprilo con un editor di testo, seleziona tutto, copia).
5. Premi la verifica del YAML, poi **Aggiorna**.
6. Aspetta qualche minuto: Container Station scarica le immagini nuove (`pull_policy: always`) e riavvia i container, uno dopo l'altro.
7. Controlla: nella scheda dell'applicazione i container `mev-postgres`, `mev-backend`, `mev-pdf-parser`, `mev-frontend` sono **in esecuzione** (`mev-db-import` risulta "Exited (0)": e' normale). Apri l'app e guarda in alto il numero `DEV_REL_...`: deve essere quello nuovo.
8. **Cancella `docker-compose.qnap.rendered.yml` dal computer**: contiene le password.

**Se dopo il passo 7 la versione e' ancora quella vecchia**
- In Container Station apri **Images**, elimina le immagini `ghcr.io/maurostefanelli/mev-governance-backend`, `...mev-governance-frontend` e `...mev-pdf-parser` (solo queste tre, **non** `postgres`), poi ripeti i passi 2-6.
- Se la scheda dell'applicazione non mostra *Ricrea*, in alternativa **rimuovi** l'applicazione `mev` (i dati restano nelle cartelle del NAS) e **creala di nuovo** con *Create Application* incollando lo stesso file. Non ho verificato che le due strade diano esattamente lo stesso risultato.

**Cosa NON fare:** non eliminare le cartelle `PG_DIR` e `DATA_DIR`; non cambiare `POSTGRES_PASSWORD` nel `.env` (e' scritta dentro il database); non usare `IMPORT_MODE=replace` salvo che tu voglia ricopiare i dati da Render cancellando quelli del NAS.

**Da SSH (alternativa)**, nella cartella con `docker-compose.qnap.yml` e `.env`: `docker compose -f docker-compose.qnap.yml pull && docker compose -f docker-compose.qnap.yml up -d`.

## I due database sono separati
- **Render DEV** usa Supabase, schema `dev`.
- **NAS** usa il suo Postgres, copiato da Render **una volta sola**.

Un rilascio aggiorna il **codice**, non i **dati**: quello che inserisci su Render non compare sul NAS e viceversa. Per riallineare il NAS ai dati di Render c'e' `IMPORT_MODE=replace` (vedi `docs/QNAP.md`), che **cancella** i dati del NAS.

### Le migrazioni dello schema
Quando una versione aggiunge tabelle o colonne, il backend le crea da solo al primo avvio, su **ciascun** database: Render alla prima partenza dopo il suo deploy, il NAS al primo *Recreate* con la nuova immagine. Non serve nessun comando. L'ordine non conta, perche' i due database sono indipendenti.

## Se Render e NAS mostrano versioni diverse
E' normale per qualche minuto o ore: si aggiornano a mano, in momenti diversi. Se dopo il *Recreate* il NAS mostra ancora la versione vecchia: guarda in Container Station → Images se `mev-governance-frontend:dev` e' stata riscaricata; se no, eliminala da li' e ricrea.

---

# Come rilasciare DEV → PROD su Render

## Architettura attuale

| Branch git | Ambiente Render | URL |
|---|---|---|
| `develop` | DEV | `https://mev-governance-frontend-dev.onrender.com` |
| `develop` | PROD | `https://mev-governance-frontend.onrender.com` |

Entrambi gli ambienti leggono lo stesso branch `develop`.
La differenza è nel file di configurazione (`render.yaml` vs `render.dev.yaml`)
e nelle variabili d'ambiente (schema DB `public` per PROD, `dev` per DEV).

---

## Flusso di lavoro consigliato

```
sviluppo → commit su develop → auto-deploy su DEV → test → ok
→ git merge develop main → push main → auto-deploy su PROD
```

---

## Setup una-tantum (da fare una sola volta)

### 1. Crea il branch `main` se non esiste

```bash
cd /Users/MSTEFANE/Documents/GitHub/mev-governance
git checkout -b main
git push origin main
```

### 2. Aggiorna `render.yaml` per puntare a `main`

Nel file `render.yaml` (quello usato da PROD) cambia `branch: develop` in `branch: main`
su tutti e tre i servizi:

```yaml
- type: web
  name: mev-governance-backend
  branch: main        # ← era develop

- type: web
  name: mev-governance-frontend
  branch: main        # ← era develop

- type: web
  name: mev-pdf-parser
  branch: main        # ← era develop
```

### 3. Su Render Dashboard — configura i servizi PROD

Per ogni servizio PROD (`mev-governance-backend`, `mev-governance-frontend`, `mev-pdf-parser`):

- **Settings → Branch**: cambia da `develop` a `main`
- **Auto-Deploy**: lascia attivo (si rideploya ad ogni push su `main`)

Variabili d'ambiente da verificare su `mev-governance-backend` (PROD):

| Chiave | Valore atteso |
|---|---|
| `DB_SCHEMA` | non impostato (usa `public` di default) |
| `DATABASE_DIRECT_URL` | URI del DB di produzione (schema `public`) |
| `CORS_ORIGINS` | `https://mev-governance-frontend.onrender.com` |
| `ASPNETCORE_ENVIRONMENT` | `Production` |

---

## Come rilasciare (da ripetere ad ogni release)

### Passo 1 — Testa su DEV

Verifica che tutto funzioni su:
`https://mev-governance-frontend-dev.onrender.com`

### Passo 2 — Merge develop → main

```bash
cd /Users/MSTEFANE/Documents/GitHub/mev-governance

# Assicurati di essere su develop e aggiornato
git checkout develop
git pull origin develop

# Passa a main e fai il merge
git checkout main
git pull origin main
git merge develop --no-ff -m "release: merge develop → main vX.Y"
git push origin main
```

### Passo 3 — Deploy automatico

Il push su `main` triggera automaticamente il redeploy su Render PROD
per tutti e tre i servizi. Puoi monitorare l'avanzamento su:
`https://dashboard.render.com`

### Passo 4 — Torna su develop per continuare lo sviluppo

```bash
git checkout develop
```

---

## Note importanti

- **I dati non vengono toccati**: PROD usa lo schema `public` su Supabase,
  DEV usa lo schema `dev`. Sono completamente separati.
- **Le migrazioni DB** vengono applicate automaticamente al primo avvio
  del backend tramite `db.Database.Migrate()` in `Program.cs`.
- **Non fare push direttamente su `main`**: usa sempre `develop` per lo
  sviluppo e poi merge su `main` solo quando sei pronto per il rilascio.
- **Il branch `develop` rimane quello di default** per il lavoro quotidiano.
  Il branch `main` è solo per i rilasci in PROD.
