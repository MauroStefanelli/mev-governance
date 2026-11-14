#!/bin/sh
# Copia UNA VOLTA lo schema dell'app dal database di origine (Supabase/Render) al Postgres del NAS.
#
# Gira in un container "db-import" (immagine postgres, che ha pg_dump/pg_restore/psql) prima del backend. Non lascia mai il database di destinazione a meta':
# il ripristino avviene dentro UNA transazione (pg_restore --single-transaction): o c'e' tutto, o non c'e' niente e si puo' riprovare.
#
# Variabili:
#   SOURCE_DATABASE_URL   database di origine (quello di Render).                                           [obbligatoria se si importa]
#   TARGET_HOST/PORT/DB/USER + PGPASSWORD   database di destinazione (il Postgres del NAS).                 [obbligatorie]
#   DB_SCHEMA             schema da copiare (default dev). Si copia SOLO questo schema, non gli schemi di sistema di Supabase.
#   IMPORT_MODE           once (default)  copia solo se la destinazione non ha ancora i dati dello schema;
#                         skip            non copia mai (il DB del NAS e' gia' quello giusto);
#                         replace         CANCELLA lo schema sul NAS e lo ricopia da zero (perde le modifiche fatte sul NAS dopo la prima copia).
#   IMPORT_TIMEOUT        secondi massimi per ogni passo di rete (default 600)
#
# Esce con 0 se il database di destinazione e' pronto (copiato ora, gia' presente o saltato), diverso da 0 se no: in quel caso il backend non parte.
set -u

SCHEMA="${DB_SCHEMA:-dev}"
MODE="${IMPORT_MODE:-once}"
TIMEOUT="${IMPORT_TIMEOUT:-600}"
T_HOST="${TARGET_HOST:-postgres}"; T_PORT="${TARGET_PORT:-5432}"; T_DB="${TARGET_DB:-mev}"; T_USER="${TARGET_USER:-mev}"
DUMP="${DUMP_FILE:-/tmp/source.dump}"

log() { echo "[db-import] $*"; }
die() { log "ERRORE: $*"; exit 1; }
# Nasconde l'URL di origine (contiene la password) da qualunque messaggio di errore
scrub() { sed -e "s#${SOURCE_DATABASE_URL:-__nessuna_url__}#<origine>#g"; }

case "$SCHEMA" in *[!a-zA-Z0-9_]*|"") die "DB_SCHEMA non valido: '$SCHEMA' (solo lettere, numeri e _)";; esac
case "$MODE" in once|skip|replace) ;; *) die "IMPORT_MODE deve essere once, skip o replace (trovato '$MODE')";; esac

tpsql() { PGSSLMODE=disable psql -h "$T_HOST" -p "$T_PORT" -U "$T_USER" -d "$T_DB" -v ON_ERROR_STOP=1 -At "$@"; }

log "attendo il database del NAS ($T_HOST:$T_PORT)..."
i=0
until PGSSLMODE=disable pg_isready -q -h "$T_HOST" -p "$T_PORT" -U "$T_USER" -d "$T_DB"; do
  i=$((i + 1)); [ "$i" -gt 60 ] && die "il database del NAS non risponde dopo 60 tentativi"
  sleep 2
done

TABLES=$(tpsql -c "select count(*) from information_schema.tables where table_schema='$SCHEMA' and table_type='BASE TABLE'" 2>&1) || die "non riesco a leggere il database del NAS: $TABLES"
# Si controlla PRIMA se la tabella esiste: scrivere count(*) su una tabella inesistente e' un errore anche dentro un CASE.
HAS_USERS=$(tpsql -c "select count(*) from information_schema.tables where table_schema='$SCHEMA' and table_name='Users'" 2>&1) || die "non riesco a leggere il database del NAS: $HAS_USERS"
if [ "$HAS_USERS" -gt 0 ]; then
  USERS=$(tpsql -c "select count(*) from \"$SCHEMA\".\"Users\"" 2>&1) || die "non riesco a leggere il database del NAS: $USERS"
else
  USERS=0
fi
log "database del NAS: schema '$SCHEMA' con $TABLES tabelle e $USERS utenti"

if [ "$MODE" = "skip" ]; then log "IMPORT_MODE=skip: non copio nulla."; exit 0; fi

if [ "$MODE" = "once" ] && [ "$TABLES" -gt 0 ] && [ "$USERS" -gt 0 ]; then
  log "i dati ci sono gia': non li tocco (per ricopiare da zero: IMPORT_MODE=replace)."
  exit 0
fi

[ -n "${SOURCE_DATABASE_URL:-}" ] || die "SOURCE_DATABASE_URL e' vuota: non so da dove copiare."
SRC_SSL="${SOURCE_SSLMODE:-require}"   # vale SOLO per l'origine: il Postgres del NAS e' sulla rete interna e non usa SSL

log "controllo l'origine..."
SRC=$(PGSSLMODE="$SRC_SSL" PGCONNECT_TIMEOUT=20 timeout "$TIMEOUT" psql "$SOURCE_DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "select count(*) from information_schema.tables where table_schema='$SCHEMA' and table_type='BASE TABLE'" 2>&1 | scrub) || true
case "$SRC" in
  ''|*[!0-9]*) die "non riesco a leggere l'origine: $SRC" ;;
esac
[ "$SRC" -gt 0 ] || die "nell'origine lo schema '$SCHEMA' non ha tabelle: controlla DB_SCHEMA e SOURCE_DATABASE_URL."
log "origine: schema '$SCHEMA' con $SRC tabelle"

log "scarico lo schema '$SCHEMA' dall'origine..."
rm -f "$DUMP"
# --no-owner/--no-privileges: i ruoli di Supabase non esistono sul NAS. --schema: solo i dati dell'app, mai auth/storage/realtime di Supabase.
if ! PGSSLMODE="$SRC_SSL" PGCONNECT_TIMEOUT=20 timeout "$TIMEOUT" pg_dump "$SOURCE_DATABASE_URL" --format=custom --schema="$SCHEMA" --no-owner --no-privileges --no-comments -f "$DUMP" 2>/tmp/dump.err; then
  scrub < /tmp/dump.err | tail -5; rm -f "$DUMP"; die "scaricamento dall'origine non riuscito (rete? password? versione di pg_dump?)"
fi
SIZE=$(wc -c < "$DUMP" | tr -d ' ')
[ "$SIZE" -gt 1000 ] || die "il file scaricato e' troppo piccolo ($SIZE byte)"
log "scaricati $SIZE byte"

if [ "$TABLES" -gt 0 ] && [ "$USERS" -gt 0 ]; then
  log "ATTENZIONE - IMPORT_MODE=replace: lo schema '$SCHEMA' sul NAS ha $TABLES tabelle e $USERS utenti: vengono CANCELLATI e sostituiti con quelli dell'origine."
elif [ "$TABLES" -gt 0 ]; then
  log "lo schema '$SCHEMA' sul NAS ha $TABLES tabelle ma nessun utente (e' vuoto o incompleto): lo ricreo."
fi

# Le regole di sicurezza di Supabase (row level security) citano i suoi ruoli. Sul NAS non esistono: si creano VUOTI, senza login e senza permessi, cosi' la struttura
# si ripristina identica. Non danno accesso a nessuno: l'app si collega come proprietario delle tabelle, che quelle regole non limitano.
for ROLE in anon authenticated service_role; do
  tpsql -c "do \$\$ begin if not exists (select 1 from pg_roles where rolname='$ROLE') then create role $ROLE nologin; end if; end \$\$" >/dev/null 2>/tmp/role.err \
    || { cat /tmp/role.err; die "non riesco a creare il ruolo vuoto '$ROLE' sul database del NAS"; }
done

log "ripristino sul NAS (in una sola transazione: se qualcosa fallisce non resta niente a meta')..."
# --clean --if-exists dentro la stessa transazione: cancella e ricrea lo schema solo se il ripristino va a buon fine
if ! PGSSLMODE=disable PGPASSWORD="${PGPASSWORD:-}" pg_restore -h "$T_HOST" -p "$T_PORT" -U "$T_USER" -d "$T_DB" --single-transaction --exit-on-error --no-owner --no-privileges --clean --if-exists "$DUMP" 2>/tmp/restore.err; then
  tail -8 /tmp/restore.err; rm -f "$DUMP"; die "ripristino non riuscito: il database del NAS NON e' stato modificato."
fi
rm -f "$DUMP"

TABLES2=$(tpsql -c "select count(*) from information_schema.tables where table_schema='$SCHEMA' and table_type='BASE TABLE'") || die "non riesco a verificare il risultato"
USERS2=$(tpsql -c "select count(*) from \"$SCHEMA\".\"Users\"" 2>/dev/null) || USERS2=0
[ "$TABLES2" = "$SRC" ] || die "dopo il ripristino le tabelle sono $TABLES2, nell'origine $SRC"
log "fatto: schema '$SCHEMA' copiato ($TABLES2 tabelle, $USERS2 utenti)."
exit 0
