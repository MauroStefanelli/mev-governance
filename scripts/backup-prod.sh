#!/usr/bin/env bash
# Copia di sicurezza dello schema di PRODUZIONE, da fare PRIMA di rilasciare su main.
#
#   PROD_DATABASE_URL='postgresql://...'  scripts/backup-prod.sh [cartella]
#
# - LEGGE soltanto. Ogni interrogazione di controllo e' dentro BEGIN READ ONLY (la transazione rifiuta qualunque scrittura) e pg_dump per sua natura non scrive.
#   Non si usa l'impostazione di sessione default_transaction_read_only: i pooler (Supabase) la ignorano, e la sola lettura sarebbe solo apparente.
# - Scarica lo schema dell'app (DB_SCHEMA, di norma 'public'), mai gli schemi di Supabase (auth, storage, realtime...).
# - Poi VERIFICA la copia: il file si legge, contiene le tabelle e, in un Postgres temporaneo locale, si ripristina con le stesse righe di PROD.
# - Scrive in una cartella fuori dal repository (di default ~/mev-backup-prod), con data e ora nel nome. Il file contiene i dati reali (hash delle password
#   compresi): non committarlo, non inviarlo, tienilo in un posto protetto.
#
# Opzioni (variabili d'ambiente):
#   DB_SCHEMA=public         schema da copiare
#   SKIP_RESTORE_TEST=1      salta la prova di ripristino (non consigliato)
#   PGBIN=/opt/homebrew/opt/postgresql@17/bin   cartella degli strumenti postgres (pg_dump, pg_restore, psql, initdb, pg_ctl)
set -u -o pipefail

SCHEMA="${DB_SCHEMA:-public}"
OUT="${1:-$HOME/mev-backup-prod}"
STAMP="$(date +%Y%m%d-%H%M%S)"
FILE="$OUT/mev-prod-$SCHEMA-$STAMP.dump"
log() { printf '[backup] %s\n' "$*"; }
die() { printf '[backup] ERRORE: %s\n' "$*" >&2; cleanup; exit 1; }
TMPDIR_RESTORE=""; PGPORT_TMP=55499
cleanup() { [ -n "$TMPDIR_RESTORE" ] && { "$PGBIN/pg_ctl" -D "$TMPDIR_RESTORE" stop >/dev/null 2>&1; rm -rf "$TMPDIR_RESTORE"; }; }
trap cleanup EXIT

[ -n "${PROD_DATABASE_URL:-}" ] || die "manca PROD_DATABASE_URL (la stringa di connessione del database di PRODUZIONE, da Render: servizio mev-governance-backend, Environment, DATABASE_DIRECT_URL)"
[ -n "${PGBIN:-}" ] || { for c in /opt/homebrew/opt/postgresql@17/bin /opt/homebrew/opt/postgresql@16/bin /usr/lib/postgresql/17/bin /usr/lib/postgresql/16/bin; do [ -x "$c/pg_dump" ] && PGBIN="$c" && break; done; }
PGBIN="${PGBIN:-$(dirname "$(command -v pg_dump 2>/dev/null)")}"
for t in pg_dump pg_restore psql; do [ -x "$PGBIN/$t" ] || die "non trovo $t in '$PGBIN' (imposta PGBIN)"; done

# Il nome dello schema finisce in un comando: solo lettere, cifre e _
case "$SCHEMA" in ''|*[!A-Za-z0-9_]*) die "DB_SCHEMA non valido: '$SCHEMA'" ;; esac

export PGSSLMODE="${PGSSLMODE:-require}" PGCONNECT_TIMEOUT=20
# Esegue una SELECT su PROD dentro una transazione di SOLA LETTURA: se per errore contenesse una scrittura, il server la rifiuta.
ro() { "$PGBIN/psql" "$PROD_DATABASE_URL" -At -F ' ' -v ON_ERROR_STOP=1 -c "begin read only; $1; rollback;" 2>>/tmp/backup.err | grep -v -x -e BEGIN -e ROLLBACK; return "${PIPESTATUS[0]}"; }
scrub() { sed -E 's#(postgres(ql)?://[^:/@ ]+:)[^@ ]+@#\1***@#g'; }

log "controllo la connessione e la sola lettura..."
: >/tmp/backup.err
# Prova che la protezione funziona davvero: dentro la transazione di sola lettura una scrittura DEVE essere rifiutata.
PROBE=$("$PGBIN/psql" "$PROD_DATABASE_URL" -At -c "begin read only; create temp table zz_probe_ro(x int); rollback;" 2>&1 || true)
case "$PROBE" in *"read-only transaction"*) : ;; *) scrub <<<"$PROBE" | tail -3; die "non ho potuto dimostrare la sola lettura (una scrittura di prova non e' stata rifiutata, o la connessione non funziona): mi fermo" ;; esac
TABLES=$(ro "select count(*) from information_schema.tables where table_schema='$SCHEMA' and table_type='BASE TABLE'") || { scrub </tmp/backup.err | tail -3; die "non riesco a leggere PROD"; }
case "$TABLES" in ''|*[!0-9]*) die "non riesco a leggere lo schema '$SCHEMA'" ;; esac
[ "$TABLES" -gt 0 ] || die "lo schema '$SCHEMA' non ha tabelle: controlla DB_SCHEMA e la stringa di connessione (e' davvero il database di PRODUZIONE?)"
USERS=$(ro "select count(*) from \"$SCHEMA\".\"Users\"" 2>/dev/null || echo "?")
log "PROD: schema '$SCHEMA' con $TABLES tabelle, $USERS utenti (sola lettura confermata)"

mkdir -p "$OUT" && chmod 700 "$OUT" || die "non riesco a creare '$OUT'"
log "scarico lo schema in $FILE ..."
if ! "$PGBIN/pg_dump" "$PROD_DATABASE_URL" --format=custom --schema="$SCHEMA" --no-owner --no-privileges --no-comments -f "$FILE" 2>/tmp/backup.err; then
  scrub </tmp/backup.err | tail -5; rm -f "$FILE"; die "pg_dump non riuscito (rete? password? versione di pg_dump piu' vecchia del server?)"
fi
chmod 600 "$FILE"
SIZE=$(wc -c <"$FILE" | tr -d ' ')
[ "$SIZE" -gt 5000 ] || { rm -f "$FILE"; die "il file e' troppo piccolo ($SIZE byte): copia scartata"; }
log "scaricati $SIZE byte"

log "controllo che il file si legga..."
"$PGBIN/pg_restore" --list "$FILE" >/tmp/backup.list 2>/tmp/backup.err || { scrub </tmp/backup.err | tail -3; die "il file non e' un dump valido"; }
LISTED=$(grep -c " TABLE DATA " /tmp/backup.list || true)
log "il file contiene i dati di $LISTED tabelle (PROD ne ha $TABLES)"
[ "$LISTED" -ge "$TABLES" ] || die "il file contiene meno tabelle di PROD ($LISTED su $TABLES): copia non affidabile"

# Impronta di PROD e del file: serve a dimostrare, dopo, che la copia e' quella
if command -v shasum >/dev/null 2>&1; then SUM=$(shasum -a 256 "$FILE" | cut -d' ' -f1); else SUM=$(sha256sum "$FILE" | cut -d' ' -f1); fi
COUNTS="$OUT/mev-prod-$SCHEMA-$STAMP.righe.txt"
ro "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='$SCHEMA' and table_type='BASE TABLE' order by 1" >"$COUNTS" || { scrub </tmp/backup.err | tail -3; die "non riesco a contare le righe di PROD"; }
chmod 600 "$COUNTS"; printf '%s  %s\n' "$SUM" "$(basename "$FILE")" >"$FILE.sha256"

if [ "${SKIP_RESTORE_TEST:-0}" = "1" ]; then
  log "prova di ripristino SALTATA (SKIP_RESTORE_TEST=1): la copia non e' dimostrata ripristinabile"
else
  for t in initdb pg_ctl; do [ -x "$PGBIN/$t" ] || die "per la prova di ripristino serve $t in '$PGBIN' (oppure SKIP_RESTORE_TEST=1)"; done
  log "prova di ripristino in un Postgres TEMPORANEO locale (porta $PGPORT_TMP)..."
  TMPDIR_RESTORE="$(mktemp -d /tmp/mev-restore-test.XXXXXX)"
  "$PGBIN/initdb" -D "$TMPDIR_RESTORE" -U postgres --auth=trust >/dev/null 2>&1 || die "initdb non riuscito"
  "$PGBIN/pg_ctl" -D "$TMPDIR_RESTORE" -o "-p $PGPORT_TMP -k $TMPDIR_RESTORE" -l "$TMPDIR_RESTORE/log" start >/dev/null 2>&1 || die "non riesco ad avviare il Postgres temporaneo"
  sleep 2
  L="postgresql://postgres@localhost:$PGPORT_TMP"
  export PGSSLMODE=disable    # il Postgres temporaneo e' locale e non usa SSL (PROD si, ed e' gia' stato letto)
  "$PGBIN/psql" "$L/postgres" -q -c "create database restoretest" || die "database temporaneo non creato"
  "$PGBIN/psql" "$L/restoretest" -q -c "create schema if not exists \"$SCHEMA\"" >/dev/null 2>&1
  "$PGBIN/pg_restore" --no-owner --no-privileges --dbname="$L/restoretest" "$FILE" >/tmp/backup.restore 2>&1 || true
  BAD=$(grep -ci "error" /tmp/backup.restore || true)
  RESTORED="$OUT/.verifica-$STAMP.txt"
  "$PGBIN/psql" "$L/restoretest" -At -F ' ' -c "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from %I.%I', table_schema, table_name), false, true, '')))[1]::text from information_schema.tables where table_schema='$SCHEMA' and table_type='BASE TABLE' order by 1" >"$RESTORED" 2>/dev/null
  if diff -q "$COUNTS" "$RESTORED" >/dev/null; then
    log "ripristino PROVATO: tutte le $(wc -l <"$COUNTS" | tr -d ' ') tabelle tornano con lo stesso numero di righe di PROD"
  else
    echo "--- righe diverse (PROD | ripristino):"; diff "$COUNTS" "$RESTORED" | head -20
    rm -f "$RESTORED"; die "il ripristino NON coincide con PROD: non fidarti di questa copia"
  fi
  [ "$BAD" -eq 0 ] || log "attenzione: il ripristino ha segnalato $BAD messaggi di errore (in genere ruoli Supabase che qui non esistono); le righe coincidono"
  rm -f "$RESTORED"
fi

log "FATTO."
log "  copia:        $FILE"
log "  impronta:     $FILE.sha256"
log "  righe PROD:   $COUNTS"
log "Per ripristinare (solo se serve, e solo dopo aver chiesto): pg_restore --clean --if-exists --no-owner --no-privileges --schema=$SCHEMA --dbname=<DB> '$FILE'"
