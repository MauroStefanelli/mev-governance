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
