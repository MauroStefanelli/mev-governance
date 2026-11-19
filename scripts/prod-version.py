#!/usr/bin/env python3
"""
La versione mostrata in fondo alla pagina di PRODUZIONE (es. PROD_REL_002).

Il numero NON e' nel repository: lo scrive Render al momento della build, dalla variabile REACT_APP_RELEASE del servizio frontend di PROD
(Render > mev-governance-frontend > Environment). Per questo a ogni rilascio in PROD va incrementata a mano su Render, e questo script serve a non sbagliare:

    scripts/prod-version.py                 # mostra la versione che PROD mostra ADESSO e quella da impostare (la successiva)
    scripts/prod-version.py --wait PROD_REL_003   # dopo il deploy: aspetta che PROD mostri proprio quella (esce con errore se non succede)

Legge solo la pagina pubblica di PROD (nessun login, nessuna scrittura).
"""
import argparse
import re
import sys
import time
import urllib.request

FRONTEND = 'https://mev-governance-frontend.onrender.com'
LABEL = re.compile(r'PROD_REL_(\d+)')


def fetch(path, timeout=60):
    request = urllib.request.Request(f'{FRONTEND}{path}{"&" if "?" in path else "?"}x={int(time.time())}', headers={'Cache-Control': 'no-cache', 'User-Agent': 'mev-release-check'})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read().decode('utf-8', 'replace')


def shown_label(bundle):
    """L'etichetta che la pagina sceglie: prima quella scritta a runtime in env-config.js, poi quella messa nel build. Qui si legge quella del build."""
    labels = sorted({int(n) for n in LABEL.findall(bundle)})
    return f'PROD_REL_{labels[-1]:03d}' if labels else None


def next_label(label):
    match = LABEL.fullmatch(label or '')
    return f'PROD_REL_{int(match.group(1)) + 1:03d}' if match else None


def current():
    html = fetch('/')
    bundle_path = re.search(r'/static/js/main\.[a-z0-9]+\.js', html)
    if not bundle_path:
        raise RuntimeError('non trovo il file principale della pagina di PROD')
    bundle = fetch(bundle_path.group(0), timeout=120)
    return shown_label(bundle), bundle_path.group(0)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument('--wait', metavar='PROD_REL_NNN', help='aspetta (fino a 12 minuti) che PROD mostri questa versione')
    args = parser.parse_args()
    if args.wait:
        if not LABEL.fullmatch(args.wait):
            sys.exit(f'versione non valida: {args.wait} (atteso PROD_REL_003)')
        deadline = time.time() + 12 * 60
        while time.time() < deadline:
            try:
                label, bundle = current()
            except Exception as error:   # il servizio si sta riavviando: si riprova
                label, bundle = None, f'(non raggiungibile: {error})'
            print(f'[versione] PROD mostra {label} ({bundle})', flush=True)
            if label == args.wait:
                print(f'[versione] OK: PROD mostra {label}')
                return
            time.sleep(40)
        sys.exit(f'[versione] ERRORE: dopo 12 minuti PROD non mostra {args.wait}. Hai impostato REACT_APP_RELEASE={args.wait} su Render e fatto il deploy?')
    label, bundle = current()
    print(f'Versione mostrata ORA in PROD : {label or "(nessuna: mostra la versione di riserva)"}   ({bundle})')
    upcoming = next_label(label)
    if upcoming:
        print(f'Da impostare per il prossimo rilascio: {upcoming}')
        print(f'  1) Render > mev-governance-frontend (PROD) > Environment > REACT_APP_RELEASE = {upcoming}')
        print(f'  2) dopo il deploy: scripts/prod-version.py --wait {upcoming}')
    else:
        print('Nessun numero PROD_REL trovato: imposta REACT_APP_RELEASE=PROD_REL_001 su Render (frontend PROD).')


if __name__ == '__main__':
    main()
