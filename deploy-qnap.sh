#!/bin/bash
set -e

QNAP_IP="${1:?Usa: ./deploy-qnap.sh <IP_QNAP> [utente] [--backend|--frontend|--parser|--fast]}"
QNAP_USER="${2:-admin}"
MODE="${3:-full}"   # full | --fast | --backend | --frontend | --parser
REMOTE_DIR="/share/homes/${QNAP_USER}/mev-governance"
ARCHIVE="mev-deploy.tar.gz"

# ── Modalità ────────────────────────────────────────────────────────────────
# full        rebuild tutto (default)
# --fast      copia sorgenti + riavvia container SENZA rebuild (solo config/compose)
# --backend   rebuild solo backend .NET
# --frontend  rebuild solo frontend React
# --parser    rebuild solo pdf-parser Python

echo "=== Modalità: ${MODE} ==="

echo "=== Pacchetto sorgenti ==="
tar czf "$ARCHIVE" \
  --exclude='node_modules' \
  --exclude='.git' \
  --exclude='bin' \
  --exclude='obj' \
  --exclude='._*' \
  --exclude='.DS_Store' \
  docker-compose.yml \
  mev-governance-backend/ \
  mev-governance-ui/Dockerfile \
  mev-governance-ui/nginx.conf \
  mev-governance-ui/package.json \
  mev-governance-ui/package-lock.json \
  mev-governance-ui/public/ \
  mev-governance-ui/src/ \
  mev-pdf-parser/

SSH="ssh -o PubkeyAuthentication=no -o StrictHostKeyChecking=no"
SCP="scp -o PubkeyAuthentication=no -o StrictHostKeyChecking=no"

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

  if [ \"\$MODE\" = 'full' ]; then
    echo '--- Build pdf-parser ---'
    \$DOCKER build --no-cache -t mev-pdf-parser:latest -f ./mev-pdf-parser/Dockerfile .
    echo '--- Build backend (ARM64 ~10-15 min) ---'
    \$DOCKER build --no-cache -t mev-backend:latest ./mev-governance-backend
    echo '--- Build frontend ---'
    \$DOCKER build --no-cache -t mev-frontend:latest ./mev-governance-ui

  elif [ \"\$MODE\" = '--backend' ]; then
    echo '--- Build solo backend ---'
    \$DOCKER build --no-cache -t mev-backend:latest ./mev-governance-backend

  elif [ \"\$MODE\" = '--frontend' ]; then
    echo '--- Build solo frontend ---'
    \$DOCKER build --no-cache -t mev-frontend:latest ./mev-governance-ui

  elif [ \"\$MODE\" = '--parser' ]; then
    echo '--- Build solo pdf-parser ---'
    \$DOCKER build --no-cache -t mev-pdf-parser:latest -f ./mev-pdf-parser/Dockerfile .

  elif [ \"\$MODE\" = '--fast' ]; then
    echo '--- Modalità fast: nessun rebuild, solo riavvio ---'
  fi

  echo '--- Fermo container esistenti ---'
  \$DOCKER compose down --remove-orphans 2>/dev/null || true

  echo '--- Avvio container ---'
  \$DOCKER compose up -d --remove-orphans
"

rm -f "$ARCHIVE"
echo "=== Fatto! App su http://${QNAP_IP}:8082 ==="
