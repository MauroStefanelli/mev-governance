#!/bin/sh
# Avvio del frontend. Due modi di funzionare, scelti dalle variabili d'ambiente:
#
#  1) RENDER / uso classico (BACKEND_URL non impostata): il frontend e il backend stanno su indirizzi diversi e il browser chiama il backend
#     direttamente, all'indirizzo REACT_APP_API_URL. Comportamento invariato.
#
#  2) NAS / rete interna (BACKEND_URL impostata, es. http://backend:5000): il frontend fa anche da PROXY. Il browser chiama sempre lo STESSO
#     indirizzo da cui ha ricevuto la pagina (REACT_APP_API_URL resta vuoto) e nginx inoltra /api al backend. Cosi' funziona identico in HTTP e in HTTPS,
#     senza CORS e senza il blocco "contenuto misto" (pagina HTTPS che chiama un'API HTTP).
#     Se si montano /certs/server.crt e /certs/server.key l'HTTPS usa quelli; altrimenti ne genera uno autofirmato (il browser mostrera' un avviso).
#
#  HTTP_PORT (default 80) e HTTPS_PORT (default 8443) sono le porte DENTRO il container; sul NAS si scelgono le porte pubbliche nel compose.
set -e

HTML=/usr/share/nginx/html
CONF=/etc/nginx/conf.d/default.conf
HTTP_PORT="${HTTP_PORT:-80}"
HTTPS_PORT="${HTTPS_PORT:-8443}"

if [ -n "$BACKEND_URL" ]; then
  API_URL=""
else
  API_URL="${REACT_APP_API_URL}"
fi

cat > "$HTML/env-config.js" <<EOT
window._env_ = {
  REACT_APP_API_URL: "${API_URL}"
};
EOT

if [ -z "$BACKEND_URL" ]; then
  # Modo 1: nessun proxy, solo i file statici (come prima).
  cat > "$CONF" <<EOT
server {
    listen ${HTTP_PORT};

    location / {
        root ${HTML};
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOT
  exec nginx -g "daemon off;"
fi

# ---- Modo 2: proxy verso il backend, HTTP e HTTPS ----
BACKEND_URL="${BACKEND_URL%/}"
MAX_BODY="${MAX_BODY:-60m}"
# Il nome del backend (es. "backend") va risolto a OGNI richiesta e non una volta sola all'avvio: altrimenti, se il backend parte dopo il frontend o viene
# riavviato, nginx non parte piu' ("host not found in upstream"). Per questo si usa una variabile in proxy_pass e il resolver del container.
RESOLVER="${DNS_RESOLVER:-$(awk '/^nameserver/ {print $2; exit}' /etc/resolv.conf 2>/dev/null)}"
RESOLVER="${RESOLVER:-127.0.0.11}"
case "$RESOLVER" in *:*) RESOLVER="[$RESOLVER]" ;; esac

CERT_DIR=/certs
if [ ! -s "$CERT_DIR/server.crt" ] || [ ! -s "$CERT_DIR/server.key" ]; then
  CERT_DIR=/etc/nginx/selfsigned
  if [ ! -s "$CERT_DIR/server.crt" ]; then
    mkdir -p "$CERT_DIR"
    HOSTNAME_FOR_CERT="${PUBLIC_HOST:-localhost}"
    # subjectAltName con IP o nome: senza, i browser moderni rifiutano il certificato anche dopo l'eccezione.
    case "$HOSTNAME_FOR_CERT" in
      *[!0-9.]*) SAN="DNS:${HOSTNAME_FOR_CERT},DNS:localhost,IP:127.0.0.1" ;;
      *)         SAN="IP:${HOSTNAME_FOR_CERT},DNS:localhost,IP:127.0.0.1" ;;
    esac
    openssl req -x509 -nodes -newkey rsa:2048 -days 825 -keyout "$CERT_DIR/server.key" -out "$CERT_DIR/server.crt" \
      -subj "/CN=${HOSTNAME_FOR_CERT}/O=MEV Governance" -addext "subjectAltName=${SAN}" >/dev/null 2>&1
    echo "[frontend] certificato HTTPS autofirmato generato per ${HOSTNAME_FOR_CERT}"
  fi
else
  echo "[frontend] uso il certificato HTTPS montato in /certs"
fi

cat > "$CONF" <<EOT
map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }

server {
    listen ${HTTP_PORT};
    listen ${HTTPS_PORT} ssl;
    ssl_certificate     ${CERT_DIR}/server.crt;
    ssl_certificate_key ${CERT_DIR}/server.key;
    ssl_protocols       TLSv1.2 TLSv1.3;

    client_max_body_size ${MAX_BODY};
    gzip on;
    gzip_types text/css application/javascript application/json image/svg+xml;

    resolver ${RESOLVER} valid=10s ipv6=off;
    set \$backend "${BACKEND_URL}";

    location /api/ {
        # Con una variabile in proxy_pass nginx non ricostruisce da solo l'indirizzo: si passa l'URI originale cosi' com'e' (percorso, query e codifiche
        # intatte). "rewrite ... break" con la query gia' dentro \$request_uri la duplicherebbe: per questo si usa \$request_uri direttamente.
        proxy_pass \$backend\$request_uri;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection \$connection_upgrade;
        proxy_connect_timeout 15s;
        proxy_send_timeout 300s;
        proxy_read_timeout 300s;
    }

    location = /env-config.js {
        root ${HTML};
        add_header Cache-Control "no-store";
    }

    location / {
        root ${HTML};
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
EOT

nginx -t
exec nginx -g "daemon off;"
