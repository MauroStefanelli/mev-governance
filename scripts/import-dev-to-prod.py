#!/usr/bin/env python3
"""
Importa in un altro database (di norma PRODUZIONE) i dati del Configuratore Iniziative e di Sviluppo iniziative che stanno in DEV.

    SOURCE_DATABASE_URL=...  TARGET_DATABASE_URL=...  scripts/import-dev-to-prod.py            # PROVA: fa tutto e poi annulla (ROLLBACK)
    SOURCE_DATABASE_URL=...  TARGET_DATABASE_URL=...  scripts/import-dev-to-prod.py --commit    # scrive davvero

Garanzie (verificate dai controlli dello script, non solo dichiarate):
  * L'ORIGINE (DEV) si legge soltanto: ogni lettura e' dentro BEGIN READ ONLY.
  * Sul DESTINAZIONE si fa UNA SOLA transazione. Si usano solo INSERT (COPY) e la regolazione delle sequenze degli id delle tabelle importate:
    nessun UPDATE e nessun DELETE su righe esistenti. Se qualsiasi controllo fallisce, la transazione si annulla e non cambia niente.
  * Prima di scrivere: le tabelle da riempire devono essere VUOTE e nessuna chiave dei record da importare deve esistere gia'.
  * Prima e dopo si calcola l'impronta di OGNI altra tabella (e delle righe gia' presenti in PC_DataRecords): devono restare identiche.
  * Dopo il commit si rilegge la destinazione e si confronta, byte per byte, con quello che si voleva scrivere.
  * Le tabelle importate sono bloccate in scrittura per la durata della transazione (lock_timeout 10 s: se non si riesce, si rinuncia).

Cosa si importa e cosa no: vedi le costanti qui sotto. Gli identificativi degli applicativi (application-<numero>) usati nelle iniziative vengono tradotti
dall'id di DEV a quello dello STESSO applicativo (per nome) nella destinazione; se un id non ha corrispondenza, lo script si ferma.
"""
import argparse
import os
import re
import subprocess
import sys
import tempfile

PGBIN = os.environ.get('PGBIN') or '/opt/homebrew/opt/postgresql@17/bin'
SRC_URL = os.environ.get('SOURCE_DATABASE_URL', '')
DST_URL = os.environ.get('TARGET_DATABASE_URL', '')
SRC_SCHEMA = os.environ.get('SOURCE_SCHEMA', 'dev')
DST_SCHEMA = os.environ.get('TARGET_SCHEMA', 'public')

# Iniziative di prova: non si importano (ne' le loro revisioni, documenti, eventi, messaggi).
TEST_GOTOS = ('test-workspace-001', 'xxxxxx')
# Chi era collegato: si importano solo le presenze delle iniziative vere (le altre sono codici digitati a meta', tipo «123» o «123422»).
PRESENCE_GOTOS = ('142033', '145226', '146023', 'tbd')
# Record di PC_DataRecords del Configuratore e di Sviluppo. NON si importano: contract, contract_lot, shared_applications (esistono gia' in PRODUZIONE e restano come sono),
# release_calendar e release_progress (sono di Report Avanzamenti), gara (e' delle Gare).
PC_ENTITY_TYPES = ('code_change_request', 'implementation_plan', 'implementation_report', 'initiative_evaluation', 'initiative_solution', 'technical_analysis', 'tow_percentages')
PC_EXCLUDED_KEYS = ('4490015980|2|initiative|testworkspace001', '4490015980|2|initiative|xxxxxx', 'poste-tet-2025|2|initiative|tbd')


def lit(values):
    return 'ARRAY[' + ','.join("'" + v.replace("'", "''") + "'" for v in values) + ']::text[]'


NOT_TEST = f'lower("Goto") <> ALL({lit(TEST_GOTOS)})'
# (tabella, colonna chiave per l'ordinamento, filtro sull'origine, verifica i soli id importati nella destinazione)
TABLES = [
    ('PC_DataRecords', 'record_key', f'entity_type = ANY({lit(PC_ENTITY_TYPES)}) AND record_key <> ALL({lit(PC_EXCLUDED_KEYS)})'),
    ('InitiativeRevisions', '"Id"', NOT_TEST),
    ('InitiativeDocuments', '"Id"', NOT_TEST),
    ('InitiativeDocumentEvents', '"Id"', NOT_TEST),
    ('InitiativeConversations', '"Id"', NOT_TEST),
    ('DevelopmentPresences', '"Id"', f'lower("Goto") = ANY({lit(PRESENCE_GOTOS)})'),
    ('DevelopmentMessages', '"Id"', NOT_TEST),
    ('RationaleMessages', '"Id"', NOT_TEST),
    ('RationaleEntries', '"Id"', 'true'),
    ('KnowledgeImportFiles', '"Id"', 'true'),
    ('LedgerInitiatives', '"Id"', 'true'),
    ('LedgerEvents', '"Id"', 'true'),
    ('LedgerImports', '"Id"', 'true'),
    ('OfferWorkbookTemplates', '"Id"', 'true'),
]
DEDICATED = [t for t, _, _ in TABLES if t != 'PC_DataRecords']   # tabelle che nella destinazione devono essere vuote
APP_ID = re.compile(rb'application-\d+')

# Le due verifiche fatte DENTRO la transazione. Le graffe che servono a Python sono {S}, {imported}, {keys}.
SQL_BEFORE = """DO $g$ DECLARE r record; h text; n bigint; BEGIN
  FOR r IN SELECT table_name FROM information_schema.tables
           WHERE table_schema = '{S}' AND table_type = 'BASE TABLE' AND table_name <> ALL({imported}) LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM "{S}".%I x', '|', '', r.table_name) INTO n, h;
    INSERT INTO _before VALUES (r.table_name, n, h);
  END LOOP;
  SELECT count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) INTO n, h FROM "{S}"."PC_DataRecords" x;
  INSERT INTO _before VALUES ('PC_DataRecords', n, h);
END $g$;
"""
SQL_AFTER = """DO $g$ DECLARE r record; h text; n bigint; bh text; bn bigint; BEGIN
  FOR r IN SELECT * FROM _before WHERE t <> 'PC_DataRecords' LOOP
    EXECUTE format('SELECT count(*), md5(coalesce(string_agg(x::text, %L ORDER BY x::text), %L)) FROM "{S}".%I x', '|', '', r.t) INTO n, h;
    IF n <> r.n OR h <> r.h THEN RAISE EXCEPTION 'la tabella % e'' cambiata, e non doveva: annullo', r.t; END IF;
  END LOOP;
  SELECT count(*), md5(coalesce(string_agg(x::text, '|' ORDER BY x::text), '')) INTO n, h FROM "{S}"."PC_DataRecords" x WHERE record_key <> ALL({keys});
  SELECT b.n, b.h INTO bn, bh FROM _before b WHERE b.t = 'PC_DataRecords';
  IF n <> bn OR h <> bh THEN
    RAISE EXCEPTION 'le righe gia'' presenti in PC_DataRecords sono cambiate: annullo';
  END IF;
END $g$;
"""


def log(msg):
    print(f'[import] {msg}', flush=True)


def die(msg, code=1):
    print(f'[import] ERRORE: {msg}', file=sys.stderr, flush=True)
    sys.exit(code)


def env_for(url):
    env = dict(os.environ)
    local = re.search(r'@(localhost|127\.0\.0\.1)[:/]', url) is not None
    env['PGSSLMODE'] = 'disable' if local else os.environ.get('PGSSLMODE', 'require')
    env['PGCONNECT_TIMEOUT'] = '20'
    env['PGTZ'] = 'UTC'          # lo stesso fuso su entrambe le parti: gli istanti si confrontano tali e quali
    return env


def scrub(text):
    return re.sub(r'(postgres(?:ql)?://[^:/@\s]+:)[^@\s]+@', r'\1***@', text)


def psql(url, args, input_bytes=None):
    proc = subprocess.run([f'{PGBIN}/psql', url, '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', *args], input=input_bytes, capture_output=True, env=env_for(url), timeout=600)
    if proc.returncode != 0:
        die(scrub(proc.stderr.decode('utf-8', 'replace')).strip()[-600:] or 'psql non riuscito')
    return proc.stdout


def query(url, sql, read_only=True):
    args = ['-c', 'BEGIN READ ONLY', '-c', sql, '-c', 'ROLLBACK'] if read_only else ['-c', sql]
    out = psql(url, args).decode('utf-8', 'replace')
    return [line for line in out.split('\n') if line not in ('', 'BEGIN', 'ROLLBACK')]


def columns(url, schema, table):
    return query(url, f"select column_name from information_schema.columns where table_schema='{schema}' and table_name='{table}' order by ordinal_position")


def copy_out(url, schema, table, cols, where, order):
    column_list = ','.join(f'"{c}"' for c in cols)
    sql = f'COPY (SELECT {column_list} FROM "{schema}"."{table}" WHERE {where} ORDER BY {order}) TO STDOUT'
    return _strip_tx(psql(url, ['-c', 'BEGIN READ ONLY', '-c', sql, '-c', 'ROLLBACK']))


def _strip_tx(raw):
    # psql stampa «BEGIN» prima dei dati e «ROLLBACK» dopo: si tolgono, e basta (i dati di COPY non contengono righe uguali a queste: ogni riga ha almeno una tabulazione o un valore)
    if raw.startswith(b'BEGIN\n'):
        raw = raw[len(b'BEGIN\n'):]
    if raw.endswith(b'ROLLBACK\n'):
        raw = raw[:-len(b'ROLLBACK\n')]
    return raw


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--commit', action='store_true', help='scrive davvero. Senza questa opzione tutto viene annullato alla fine (prova a secco).')
    args = parser.parse_args()
    if not SRC_URL or not DST_URL:
        die('servono SOURCE_DATABASE_URL (DEV) e TARGET_DATABASE_URL (destinazione)')
    if SRC_URL == DST_URL and SRC_SCHEMA == DST_SCHEMA:
        die('origine e destinazione sono la stessa cosa')
    for t, _, _ in TABLES:
        if columns(SRC_URL, SRC_SCHEMA, t) != columns(DST_URL, DST_SCHEMA, t):
            die(f'la tabella {t} non ha le stesse colonne (nello stesso ordine) in origine e destinazione: mi fermo')
    log(f'origine: schema {SRC_SCHEMA} | destinazione: schema {DST_SCHEMA} | modalita: {"SCRITTURA" if args.commit else "prova a secco (annulla alla fine)"}')

    # --- traduzione degli id degli applicativi (per nome) ---
    def apps(url, schema):
        rows = query(url, f"select jsonb_array_elements(payload->'applications')->>'id' || E'\\t' || (jsonb_array_elements(payload->'applications')->>'name') from \"{schema}\".\"PC_DataRecords\" where record_key like '%|shared_applications' and entity_type='shared_applications'")
        out = {}
        for r in rows:
            i, _, n = r.partition('\t')
            if i and i != 'null':
                out[i] = n.strip().lower()
        return out
    dev_apps, dst_apps = apps(SRC_URL, SRC_SCHEMA), apps(DST_URL, DST_SCHEMA)
    by_name = {n: i for i, n in dst_apps.items()}
    mapping = {i.encode(): by_name[n].encode() for i, n in dev_apps.items() if n in by_name}
    log('applicativi tradotti per nome: ' + ', '.join(f'{n}' for i, n in dev_apps.items() if n in by_name))

    # --- estrazione dall'origine e traduzione ---
    payloads, expected, keys = {}, {}, []
    for table, order, where in TABLES:
        cols = columns(SRC_URL, SRC_SCHEMA, table)
        raw = copy_out(SRC_URL, SRC_SCHEMA, table, cols, where, order)
        for old, new in mapping.items():
            raw = raw.replace(old, new)
        leftover = {m for m in APP_ID.findall(raw) if m.decode() not in dst_apps}
        if leftover:
            die(f'{table}: restano identificativi di applicativi che nella destinazione non esistono: {sorted(x.decode() for x in leftover)}')
        payloads[table] = (cols, raw)
        expected[table] = raw.count(b'\n')
        log(f'  {table:26} {expected[table]:5} righe, {len(raw):>9} byte')
    pc_cols, pc_raw = payloads['PC_DataRecords']
    ck = pc_cols.index('record_key')
    keys = [line.split('\t')[ck] for line in pc_raw.decode('utf-8').split('\n') if line]
    if len(keys) != len(set(keys)):
        die('nei record da importare ci sono chiavi doppie')

    # --- script SQL: una sola transazione ---
    S = DST_SCHEMA
    imported_tables = [t for t, _, _ in TABLES]
    sql = bytearray()

    def add(text):
        sql.extend(text.encode('utf-8'))
    add('\\set ON_ERROR_STOP on\nBEGIN;\nSET LOCAL lock_timeout = \'10s\';\nSET LOCAL statement_timeout = \'300s\';\n')
    add('LOCK TABLE ' + ', '.join(f'"{S}"."{t}"' for t in DEDICATED) + ' IN SHARE ROW EXCLUSIVE MODE;\n')
    for t in DEDICATED:
        add(f'DO $g$ BEGIN IF (SELECT count(*) FROM "{S}"."{t}") > 0 THEN RAISE EXCEPTION \'la tabella {t} non e'' vuota: non importo\'; END IF; END $g$;\n')
    add(f'DO $g$ BEGIN IF EXISTS (SELECT 1 FROM "{S}"."PC_DataRecords" WHERE record_key = ANY({lit(keys)})) THEN RAISE EXCEPTION \'una chiave da importare esiste gia\'\' in PC_DataRecords: non importo\'; END IF; END $g$;\n')
    # impronta di tutto cio' che NON si importa
    add('CREATE TEMP TABLE _before (t text PRIMARY KEY, n bigint, h text) ON COMMIT DROP;\n')
    add(SQL_BEFORE.format(S=S, imported=lit(imported_tables)))
    for table, _, _ in TABLES:
        cols, raw = payloads[table]
        if not raw:
            continue
        add(f'COPY "{S}"."{table}" (' + ','.join(f'"{c}"' for c in cols) + ') FROM STDIN;\n')
        sql.extend(raw)
        add('\\.\n')
    # Gli id automatici (sequenze) ripartono dopo il piu' alto importato, cosi' le prossime righe create dall'app non collidono con quelle importate.
    # Solo per le tabelle che HANNO una sequenza (InitiativeDocuments ha un Id UUID, InitiativeConversations nessuna): il resto si salta.
    for t in DEDICATED:
        if expected[t]:
            add(f'DO $g$ DECLARE seq text := pg_get_serial_sequence(\'"{S}"."{t}"\', \'Id\'); BEGIN IF seq IS NOT NULL THEN PERFORM setval(seq, (SELECT max("Id") FROM "{S}"."{t}"), true); END IF; END $g$;\n')
    # controlli finali, ancora dentro la transazione
    for t in imported_tables:
        want = expected[t]
        cond = f'record_key = ANY({lit(keys)})' if t == 'PC_DataRecords' else 'true'
        add(f'DO $g$ BEGIN IF (SELECT count(*) FROM "{S}"."{t}" WHERE {cond}) <> {want} THEN RAISE EXCEPTION \'{t}: righe attese {want}\'; END IF; END $g$;\n')
    add(SQL_AFTER.format(S=S, keys=lit(keys)))
    add('COMMIT;\n' if args.commit else 'ROLLBACK;\n')
    with tempfile.NamedTemporaryFile('wb', suffix='.sql', delete=False) as f:
        f.write(bytes(sql))
        path = f.name
    try:
        log(f'scrivo nella destinazione ({len(sql)} byte di istruzioni)...')
        out = psql(DST_URL, ['-f', path]).decode('utf-8', 'replace').strip()
    finally:
        os.remove(path)
    log('transazione ' + ('CONFERMATA (COMMIT).' if args.commit else 'annullata come previsto (prova a secco): nella destinazione non e\' cambiato niente.'))
    if not args.commit:
        return

    # --- verifica a posteriori, byte per byte ---
    bad = 0
    for table, order, where in TABLES:
        cols, raw = payloads[table]
        cond = f'record_key = ANY({lit(keys)})' if table == 'PC_DataRecords' else 'true'
        got = copy_out(DST_URL, DST_SCHEMA, table, cols, cond, order)
        ok = got == raw
        bad += 0 if ok else 1
        log(f'  verifica {table:26} {"IDENTICA" if ok else "DIVERSA"} ({expected[table]} righe)')
    if bad:
        die(f'{bad} tabelle non coincidono con quello che volevo scrivere: NON usare questa importazione, ripristina dal backup', 2)
    log('FATTO: tutte le tabelle importate coincidono, riga per riga, con l\'origine.')


if __name__ == '__main__':
    main()
