#!/bin/bash
set -e

QNAP_IP="${1:?Usa: ./deploy-qnap.sh <IP_QNAP> [utente] [--backend|--frontend|--parser|--fast] [--env prod|dev]}"
QNAP_USER="${2:-admin}"
MODE="${3:-full}"     # full | --fast | --backend | --frontend | --parser
ENV="${4:-prod}"      # prod | dev

# ── Configurazione per ambiente ───────────────────────────────────────────────
if [ "$ENV" = "dev" ]; then
  REMOTE_DIR="/share/homes/${QNAP_USER}/mev-governance"
  COMPOSE_FILE="docker-compose.dev.yml"
  TAG_BACKEND="dev"
  TAG_FRONTEND_QNAP="qnap-dev"
  TAG_PARSER="dev"
  echo "=== Ambiente: SVILUPPO (dev) ==="
else
  REMOTE_DIR="/share/homes/${QNAP_USER}/mev-governance"
  COMPOSE_FILE="docker-compose.yml"
  TAG_BACKEND="latest"
  TAG_FRONTEND_QNAP="qnap"
  TAG_PARSER="latest"
  echo "=== Ambiente: PRODUZIONE (prod) ==="
fi

echo "=== Modalità: ${MODE} ==="

ARCHIVE="mev-deploy.tar.gz"

echo "=== Pacchetto sorgenti ==="
tar czf "$ARCHIVE" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='bin' \
  --exclude='obj' \
  --exclude='._*' \
  --exclude='.DS_Store' \
  docker-compose.yml \
  docker-compose.dev.yml \
  mev-governance-backend/ \
  mev-governance-ui/Dockerfile \
  mev-governance-ui/nginx.conf \
  mev-governance-ui/package.json \
  mev-governance-ui/package-lock.json \
  mev-governance-ui/public/ \
  mev-governance-ui/src/ \
  mev-pdf-parser/

SSH="sshpass -p ${SSHPASS:-} ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=no"
SCP="sshpass -p ${SSHPASS:-} scp -o PubkeyAuthentication=no -o StrictHostKeyChecking=no"

echo "=== Copio su QNAP ==="
$SSH "${QNAP_USER}@${QNAP_IP}" "mkdir -p ${REMOTE_DIR}"
$SCP "$ARCHIVE" "${QNAP_USER}@${QNAP_IP}:${REMOTE_DIR}/"

echo "=== Deploy su QNAP ==="
$SSH "${QNAP_USER}@${QNAP_IP}" "
  cd ${REMOTE_DIR}
  tar xzf ${ARCHIVE}

  # Trova docker
  DOCKER=\$(command -v docker 2>/dev/null)
  if [ -z \"\$DOCKER\" ]; then
    for p in /share/*/.qpkg/container-station/bin/docker; do
      [ -x \"\$p\" ] && DOCKER=\"\$p\" && break
    done
  fi
  if [ -z \"\$DOCKER\" ]; then
    echo 'ERRORE: docker non trovato.'
    exit 1
  fi
  DOCKER_DIR=\$(dirname \$DOCKER)
  export PATH=\$DOCKER_DIR:\$PATH
  export DOCKER_CONFIG=/tmp/.docker

  MODE='${MODE}'
  COMPOSE_FILE='${COMPOSE_FILE}'
  TAG_BACKEND='${TAG_BACKEND}'
  TAG_FRONTEND_QNAP='${TAG_FRONTEND_QNAP}'
  TAG_PARSER='${TAG_PARSER}'

  if [ \"\$MODE\" = 'full' ]; then
    echo '--- Build pdf-parser ---'
    \$DOCKER build --no-cache -t mev-pdf-parser:\$TAG_PARSER -f ./mev-pdf-parser/Dockerfile .
    echo '--- Build backend ---'
    \$DOCKER build --no-cache -t mev-backend:\$TAG_BACKEND ./mev-governance-backend
    echo '--- Build frontend ---'
    \$DOCKER build --no-cache -t mev-frontend:\$TAG_FRONTEND_QNAP ./mev-governance-ui

  elif [ \"\$MODE\" = '--backend' ]; then
    echo '--- Build solo backend ---'
    \$DOCKER build --no-cache -t mev-backend:\$TAG_BACKEND ./mev-governance-backend

  elif [ \"\$MODE\" = '--frontend' ]; then
    echo '--- Build solo frontend ---'
    \$DOCKER build --no-cache -t mev-frontend:\$TAG_FRONTEND_QNAP ./mev-governance-ui

  elif [ \"\$MODE\" = '--parser' ]; then
    echo '--- Build solo pdf-parser ---'
    \$DOCKER build --no-cache -t mev-pdf-parser:\$TAG_PARSER -f ./mev-pdf-parser/Dockerfile .

  elif [ \"\$MODE\" = '--fast' ]; then
    echo '--- Modalità fast: nessun rebuild, solo riavvio ---'
  fi

  echo '--- Fermo container ---'
  \$DOCKER compose -f \$COMPOSE_FILE down --remove-orphans 2>/dev/null || true

  echo '--- Avvio container ---'
  \$DOCKER compose -f \$COMPOSE_FILE up -d --remove-orphans
"

rm -f "$ARCHIVE"

if [ "$ENV" = "dev" ]; then
  echo "=== Fatto! App DEV su http://${QNAP_IP}:3001 (backend: ${QNAP_IP}:4001) ==="
else
  echo "=== Fatto! App PROD su http://${QNAP_IP}:3000 (backend: ${QNAP_IP}:4000) ==="
fi
