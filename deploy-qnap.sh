#!/bin/bash
set -e

QNAP_IP="${1:?Usa: ./deploy-qnap.sh <IP_QNAP> [utente]}"
QNAP_USER="${2:-admin}"
REMOTE_DIR="/share/homes/${QNAP_USER}/mev-governance"
ARCHIVE="mev-deploy.tar.gz"

echo "=== 1/3 Pacchetto sorgenti ==="
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

echo "=== 2/3 Copio su QNAP ==="
ssh "${QNAP_USER}@${QNAP_IP}" "mkdir -p ${REMOTE_DIR}"
scp "$ARCHIVE" "${QNAP_USER}@${QNAP_IP}:${REMOTE_DIR}/"

echo "=== 3/3 Build e avvio su QNAP ==="
ssh "${QNAP_USER}@${QNAP_IP}" "
  cd ${REMOTE_DIR}
  tar xzf ${ARCHIVE}

  # Trova docker se non è nel PATH
  DOCKER=\$(command -v docker 2>/dev/null)
  if [ -z \"\$DOCKER\" ]; then
    for p in /share/*/.qpkg/container-station/bin/docker; do
      [ -x \"\$p\" ] && DOCKER=\"\$p\" && break
    done
  fi
  if [ -z \"\$DOCKER\" ]; then
    echo 'ERRORE: docker non trovato. Installare Container Station.'
    exit 1
  fi
  echo \"docker trovato: \$DOCKER\"
  DOCKER_DIR=\$(dirname \$DOCKER)
  export PATH=\$DOCKER_DIR:\$PATH
  export DOCKER_CONFIG=/tmp/.docker

  echo '--- Build pdf-parser (Python) ---'
  \$DOCKER build --no-cache -t mev-pdf-parser:latest -f ./mev-pdf-parser/Dockerfile .

  echo '--- Build backend (ARM64 ~10-15 min) ---'
  \$DOCKER build --no-cache -t mev-backend:latest ./mev-governance-backend

  echo '--- Build frontend ---'
  \$DOCKER build -t mev-frontend:latest ./mev-governance-ui

  echo '--- Fermo container esistenti ---'
  \$DOCKER compose down --remove-orphans 2>/dev/null || true

  echo '--- Avvio container ---'
  \$DOCKER compose up -d --remove-orphans
"

rm -f "$ARCHIVE"
echo "=== Fatto! App su http://${QNAP_IP}:8082 ==="
