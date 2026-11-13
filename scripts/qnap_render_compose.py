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
PATH_VARIABLES = ('DATA_DIR', 'CERTS_DIR')   # percorsi sul NAS: devono essere assoluti, un percorso relativo non ha senso incollando il YAML nella pagina


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
    template = open(TEMPLATE, encoding='utf-8').read()
    rendered, problems = expand(template, env)
    if problems:
        raise SystemExit('Mancano dei valori nel file .env:\n  - ' + '\n  - '.join(problems))
    # protegge i valori delicati: riscrive "CHIAVE: valore" con il valore tra apici per le variabili che possono contenere caratteri speciali
    for name in ('DATABASE_DIRECT_URL', 'JWT_KEY', 'ADMIN_PASSWORD'):
        pattern = re.compile(rf'^(\s+{name}: )(.*)$', re.M)
        rendered = pattern.sub(lambda m: m.group(1) + quote(env[name]), rendered)
    # il file da incollare non deve contenere altro che il compose: si toglie l'intestazione di commento (spiega come usare il modello, non questo file)
    lines = rendered.splitlines()
    first = next((i for i, line in enumerate(lines) if line.startswith('services:')), 0)
    rendered = '# MEV Governance - QNAP (generato da scripts/qnap_render_compose.py; contiene password: non condividere)\n' + '\n'.join(lines[first:]) + '\n'
    with open(OUTPUT, 'w', encoding='utf-8') as handle:
        handle.write(rendered)
    os.chmod(OUTPUT, 0o600)
    print(f'Scritto {os.path.relpath(OUTPUT, ROOT)} ({len(rendered.splitlines())} righe).')
    print('Incollalo in Container Station: Applications -> Create Application. Poi cancellalo dal computer: contiene le password.')
    print(f'Cartelle sul NAS da creare prima: {env["DATA_DIR"]}   (e, solo se hai un certificato vero, {env["CERTS_DIR"]})')


if __name__ == '__main__':
    main()
