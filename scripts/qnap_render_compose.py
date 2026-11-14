#!/usr/bin/env python3
"""Prepara il compose per Container Station del QNAP: legge il file .env, sostituisce tutte le variabili e scrive un YAML completo, pronto da incollare.

Perche': nella pagina "Create Application" di Container Station si incolla il YAML e non c'e' un file .env accanto. Non e' documentato che le variabili ${...}
vengano sostituite, quindi non ci si affida a questo: il YAML che si incolla ha gia' tutti i valori scritti.

Uso (da questa cartella, su Mac o Linux; serve solo python3):
    python3 scripts/qnap_render_compose.py            # legge .env, scrive docker-compose.qnap.rendered.yml
    python3 scripts/qnap_render_compose.py altro.env  # un altro file di valori

Il file prodotto CONTIENE le password: e' escluso da git, va incollato in Container Station e poi cancellato dal computer.
"""
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TEMPLATE = os.path.join(ROOT, 'docker-compose.qnap.yml')
OUTPUT = os.path.join(ROOT, 'docker-compose.qnap.rendered.yml')
PATH_VARIABLES = ('DATA_DIR', 'CERTS_DIR', 'PG_DIR')   # percorsi sul NAS: devono essere assoluti, un percorso relativo non ha senso incollando il YAML nella pagina


def read_env(path):
    values = {}
    with open(path, encoding='utf-8') as handle:
        for number, raw in enumerate(handle, 1):
            line = raw.strip()
            if not line or line.startswith('#'):
                continue
            if '=' not in line:
                raise SystemExit(f'{path}, riga {number}: manca il segno "=": {line[:40]}')
            name, value = line.split('=', 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in '"\'':
                value = value[1:-1]
            values[name.strip()] = value
    return values


def expand(text, env):
    problems = []

    def replace(match):
        name, operator, argument = match.group(1), match.group(2), match.group(3)
        value = env.get(name, '')
        if operator == ':-':
            return compose_escape(value) if value != '' else argument
        if operator == ':?':
            if value == '':
                problems.append(f'{name}: {argument}')
                return ''
            return compose_escape(value)
        return compose_escape(value)

    result = re.sub(r'\$\{([A-Za-z_][A-Za-z0-9_]*)(?:(:-|:\?)([^}]*))?\}', replace, text)
    return result, problems


def compose_escape(value):
    """Docker Compose interpreta il simbolo $ anche dentro il file (${X}, $X): per ottenere un $ letterale va scritto $$.
    Senza questo, una password come Pa$$w0rd arriverebbe al backend come Pa$w0rd e il login fallirebbe."""
    return value.replace('$', '$$')


def quote(value):
    """Un valore sicuro per YAML: tra apici doppi, con \\ e " protetti, e con $ raddoppiati per Compose. Le password con # : { } restano intatte."""
    return '"' + compose_escape(value).replace('\\', '\\\\').replace('"', '\\"') + '"'


SECRET_KEYS = ('DATABASE_DIRECT_URL', 'SOURCE_DATABASE_URL', 'JWT_KEY', 'ADMIN_PASSWORD', 'POSTGRES_PASSWORD', 'PGPASSWORD')


def quote_expanded(text):
    """Mette tra apici doppi un valore YAML gia' espanso (con i $ gia' raddoppiati da compose_escape). Se e' gia' tra apici non fa nulla."""
    if len(text) >= 2 and text[0] == '"' and text[-1] == '"':
        return text
    return '"' + text.replace('\\', '\\\\').replace('"', '\\"') + '"'


IMPORT_SCRIPT = os.path.join(ROOT, 'scripts', 'qnap-db-import.sh')


def embed_import_script(rendered):
    """Nel YAML incollato in Container Station non c'e' nessuna cartella `scripts/` da montare: lo script di copia del database viaggia dentro il YAML.
    Si sostituisce il montaggio del file con il comando inline. Ogni `$` dello script diventa `$$` (altrimenti Compose lo leggerebbe come variabile)."""
    script = open(IMPORT_SCRIPT, encoding='utf-8').read()
    mount = re.compile(r"^\s+volumes:\n\s+- \./scripts/qnap-db-import\.sh:/import\.sh:ro\n", re.M)
    command = re.compile(r'^(\s+)command: \["sh", "/import\.sh"\]$', re.M)
    if not mount.search(rendered) or not command.search(rendered):
        raise SystemExit('Nel compose non trovo il servizio db-import come me lo aspetto: non so dove inserire lo script di copia.')
    rendered = mount.sub('', rendered, count=1)
    def inline(match):
        indent = match.group(1)
        body = script.replace('$', '$$').rstrip('\n')
        block = '\n'.join((indent + '    ' + line) if line else '' for line in body.split('\n'))
        return f'{indent}command:\n{indent}  - sh\n{indent}  - -c\n{indent}  - |\n{block}'
    return command.sub(inline, rendered, count=1)


def main():
    env_path = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '.env')
    if not os.path.exists(env_path):
        raise SystemExit(f'Non trovo {env_path}. Copia .env.qnap.example in .env e compilalo.')
    env = read_env(env_path)
    for name in PATH_VARIABLES:
        value = env.get(name, '')
        if value and not value.startswith('/'):
            raise SystemExit(f'{name} deve essere un percorso assoluto sul NAS (es. /share/Container/mev/data), non "{value}".')
    # i percorsi hanno un valore assoluto di riserva, cosi' il YAML incollato funziona anche se non sono stati compilati
    env.setdefault('DATA_DIR', '/share/Container/mev/data')
    env.setdefault('CERTS_DIR', '/share/Container/mev/certs')
    env.setdefault('PG_DIR', '/share/Container/mev/pgdata')
    template = open(TEMPLATE, encoding='utf-8').read()
    rendered, problems = expand(template, env)
    if problems:
        raise SystemExit('Mancano dei valori nel file .env:\n  - ' + '\n  - '.join(problems))
    # protegge i valori delicati: riscrive "CHIAVE: valore" con il valore tra apici per le variabili che possono contenere caratteri speciali
    rendered = embed_import_script(rendered)
    # Ogni valore delicato (password, chiavi, indirizzi con password) va tra apici: una password con ":" o "#" romperebbe il YAML.
    # Qui il valore e' GIA' espanso (nel template e' composto, per es. "postgresql://utente:${POSTGRES_PASSWORD}@postgres:5432/db"), quindi si quota quello che c'e' scritto.
    for name in SECRET_KEYS:
        rendered = re.sub(rf'^(\s+{name}: )(.*)$', lambda m: m.group(1) + quote_expanded(m.group(2)), rendered, flags=re.M)
    # il file da incollare non deve contenere altro che il compose: si toglie l'intestazione di commento (spiega come usare il modello, non questo file)
    lines = rendered.splitlines()
    first = next((i for i, line in enumerate(lines) if line.startswith('services:')), 0)
    rendered = '# MEV Governance - QNAP (generato da scripts/qnap_render_compose.py; contiene password: non condividere)\n' + '\n'.join(lines[first:]) + '\n'
    with open(OUTPUT, 'w', encoding='utf-8') as handle:
        handle.write(rendered)
    os.chmod(OUTPUT, 0o600)
    print(f'Scritto {os.path.relpath(OUTPUT, ROOT)} ({len(rendered.splitlines())} righe).')
    print('Incollalo in Container Station: Applications -> Create Application. Poi cancellalo dal computer: contiene le password.')
    print(f'Cartelle sul NAS da creare prima (File Station): {env["DATA_DIR"]}  e  {env["PG_DIR"]}   (e, solo se hai un certificato vero, {env["CERTS_DIR"]})')


if __name__ == '__main__':
    main()
