#!/bin/sh
# Inietta le variabili d'ambiente a runtime nel file env-config.js
# In questo modo REACT_APP_API_URL viene letta dal container al momento dell'avvio
# e non deve essere conosciuta al momento del build Docker.

cat <<EOF > /usr/share/nginx/html/env-config.js
window._env_ = {
  REACT_APP_API_URL: "${REACT_APP_API_URL}"
};
EOF

exec nginx -g "daemon off;"
