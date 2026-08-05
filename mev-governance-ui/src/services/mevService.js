const API_BASE_URL = (window._env_ && window._env_.REACT_APP_API_URL) || process.env.REACT_APP_API_URL || "";

const authHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${localStorage.getItem("jwt") || ""}`
});

// ── Refresh automatico JWT ────────────────────────────────────────────────────
// Tenta di rinnovare il JWT usando il refreshToken salvato in localStorage.
// Ritorna true se il rinnovo è riuscito, false altrimenti.
export const tryRefreshToken = async () => {
  const refreshToken = localStorage.getItem("refreshToken");
  if (!refreshToken) return false;
  try {
    const res = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refreshToken,
        currentToken: localStorage.getItem("jwt") || null
      }),
    });
    if (!res.ok) return false;
    const data = await res.json();
    localStorage.setItem("jwt", data.token);
    localStorage.setItem("refreshToken", data.refreshToken);
    return true;
  } catch {
    return false;
  }
};

// Wrapper fetch che tenta il refresh automatico se riceve 401.
// Se anche il refresh fallisce (es. backend in cold-start su Render),
// riprova fino a 3 volte con backoff prima di fare logout.
const fetchWithRefresh = async (url, options = {}) => {
  let res = await fetch(url, options);
  if (res.status === 401) {
    // Tenta il refresh con retry (backend Render free può essere in cold-start)
    let refreshed = false;
    for (let attempt = 0; attempt < 3 && !refreshed; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000 * attempt)); // 3s, 6s
      refreshed = await tryRefreshToken();
    }
    if (refreshed) {
      // Riprova con il nuovo JWT
      const newOptions = {
        ...options,
        headers: {
          ...(options.headers || {}),
          "Authorization": `Bearer ${localStorage.getItem("jwt") || ""}`,
        },
      };
      res = await fetch(url, newOptions);
    } else {
      // Refresh fallito dopo retry: sessione scaduta → notifica l'app per il logout
      window.dispatchEvent(new CustomEvent("auth:expired"));
    }
  }
  return res;
};

export const login = async (username, password) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const getMevList = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/mev`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero MEV");
  return response.json();
};

export async function updateMev(id, payload) {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/mev/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel salvataggio");
  return response.json();
}

export async function createMev(payload) {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/mev`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  if (response.status === 401) throw new Error("401");
  if (response.status === 409) {
    const text = await response.text();
    throw new Error(text);
  }
  if (!response.ok) throw new Error("Errore nella creazione MEV");
  return response.json();
}

export async function getMevOptions() {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/mev/options`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero opzioni");
  return response.json();
}

export const exportMev = async (rows, filters = {}) => {
  const XLSX = await import("xlsx");

  const now = new Date();
  const datePart = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;

  // Costruisce la parte del nome con i filtri attivi
  const filterLabels = {
    goTo:           filters.goTo,
    applicativo:    filters.applicativo,
    stato:          filters.stato,
    annoCompetenza: filters.annoCompetenza,
    pAnno:          filters.pAnno,
    pRelease:       filters.pRelease,
  };
  const filterPart = Object.values(filterLabels)
    .filter((v) => v && v !== "")
    .join(" - ");

  const fileName = filterPart
    ? `Logistica Mev Governance ${datePart} - ${filterPart}.xlsx`
    : `Logistica Mev Governance ${datePart}.xlsx`;

  const data = rows.map((r) => ({
    "ID":                r.excelId,
    "GoTo":              r.goTo,
    "Applicativo":       r.applicativo,
    "Descrizione":       r.descrizione,
    "Anno Competenza":   r.annoCompetenza,
    "Stato":             r.stato,
    "Importo Fornitura": r.importoExcel,
    "RDA":               r.rda ?? "",
    "Cap":               r.capgemini ?? "",
    "IET":               r.iet ?? "",
    "Subco":             r.subco ?? "",
    "P Anno":            r.pAnno,
    "P Release":         r.pRelease,
    "P Importo":         r.pImporto,
    "P Note":            r.pNote ?? "",
  }));

  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "MEV");
  XLSX.writeFile(wb, fileName);
};

export const uploadExcel = async (file) => {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/mev/upload`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${localStorage.getItem("jwt") || ""}`
    },
    body: formData
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const alignMevData = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/mev/align`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({})
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const getContratti = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero contratti");
  return response.json();
};

export const getContrattiPubblico = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti/pubblico`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero contratti");
  return response.json();
};

export const getConsumoTow = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti/consumo-tow`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero ConsumoTOW");
  return response.json();
};

export const getLastAlign = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/mev/last-align`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore recupero data allineamento");
  return response.json();
};

export const alignContratti = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti/align`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({})
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const changeMyPassword = async (oldPassword, newPassword) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/me/password`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ oldPassword, newPassword })
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

// ---- Admin: gestione utenti ----

export const logout = async () => {
  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: "POST",
      headers: authHeaders()
    });
  } catch {
    // fire-and-forget: ignora errori di rete al logout
  }
};

export const getEditorLogins = async (since) => {
  const url = since
    ? `${API_BASE_URL}/api/auth/editor-logins?since=${encodeURIComponent(since)}`
    : `${API_BASE_URL}/api/auth/editor-logins`;
  const response = await fetchWithRefresh(url, { headers: authHeaders() });
  if (!response.ok) throw new Error("Errore recupero editor logins");
  return response.json();
};

export const getUsers = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users`, {
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore recupero utenti");
  return response.json();
};

export const createUser = async (payload) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const toggleUser = async (id) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users/${id}/toggle`, {
    method: "PUT",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore toggle utente");
  return response.json();
};

export const toggleEmailUser = async (id) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users/${id}/toggleemail`, {
    method: "PUT",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore toggle email utente");
  return response.json();
};

export const resetPassword = async (id, newPassword) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users/${id}/password`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ newPassword })
  });
  if (!response.ok) throw new Error("Errore reset password");
  return response.json();
};

export const getUserAccessLog = async (id) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users/${id}/access-log`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error(`Errore storico (${response.status})`);

  const logs = await response.json();
  return (logs || []).map((log, idx) => ({
    id: log.id || idx,
    loginAt: log.loginAt || log.login || log.accessTime || log.timestamp || null,
    logoutAt: log.logoutAt || log.logout || log.logoutTime || null,
  }));
};

export const deleteUser = async (id) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users/${id}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore eliminazione utente");
  return response.json();
};

export const updateUserRole = async (id, role) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/users/${id}/role`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ role })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const getUserAccessLogSafe = async (username) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/editor-logins`, {
    headers: authHeaders()
  });

  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore recupero storico accessi");

  const allLogs = await response.json();

  console.log("LOG REALI:", allLogs);

  // ✅ filtro utente (robusto)
  const userLogs = allLogs.filter(l => {
    const user =
      l.username ||
      l.userName ||
      l.user ||
      l.email ||
      "";

    return user.toLowerCase() === username.toLowerCase();
  });

  // ✅ mapping diretto se hai login/logout
  return userLogs.map((log, idx) => ({
    id: log.id || idx,
    loginAt:
      log.loginAt ||
      log.login ||
      log.accessTime ||
      log.timestamp ||
      null,
    logoutAt:
      log.logoutAt ||
      log.logout ||
      log.logoutTime ||
      null
  }));
};

export const getDbConfig = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/db-config`, {
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore lettura configurazione DB");
  return response.json();
};

export const setDbConfig = async (config) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/db-config`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(config)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const testDbConnection = async (config) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/test-db`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(config)
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const restartBackend = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/restart`, {
    method: "POST",
    headers: authHeaders()
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const getAppSettings = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/app`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore recupero impostazioni");
  return response.json();
};

export const setAppSettings = async (data) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/app`, {
    method: "PUT",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore salvataggio impostazioni");
  return response.json();
};

export const resetData = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/reset-data`, {
    method: "POST",
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore durante il reset dei dati");
  return response.json();
};

// ── TOW Impatto: % impatto per contratto (condivise tra tutti gli utenti) ─────

export const getTowImpatto = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/tow-impatto`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) return {};
  return response.json();
};

export const setTowImpatto = async (data) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/settings/tow-impatto`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore salvataggio impatto TOW");
  return response.json();
};

export const updateConsumoTow = async (id, data) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti/consumo-tow/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(data)
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const createConsumoTow = async (towContratto, valoriUnitari, qta) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti/consumo-tow`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ towContratto, valoriUnitari, qta })
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

// Crea un contratto figlio (non-BASE): il backend calcola i valori unitari
// applicando la % di sconto ai valori del contratto BASE
export const createConsumoTowFiglio = async (towContratto, sconto, qta, isCatalogo = {}) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti/consumo-tow/figlio`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ towContratto, sconto, qta, isCatalogo })
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const deleteConsumoTowContratto = async (nome) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/contratti/consumo-tow/contratto/${encodeURIComponent(nome)}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

// ── Ambienti ─────────────────────────────────────────────────────────────────

export const getMyAmbienti = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/my-ambienti`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore recupero ambienti");
  return response.json();
};

export const switchAmbiente = async (ambienteId) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/auth/switch-ambiente`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ ambienteId })
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json(); // { token, ambienteId }
};

// ── SuperAdmin: gestione ambienti ────────────────────────────────────────────

export const getAllAmbienti = async () => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/ambienti`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore recupero ambienti");
  return response.json();
};

export const createAmbiente = async (codiceContratto, descrizione) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/ambienti`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ codiceContratto, descrizione })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const getAmbientiUtenti = async (ambienteId) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/ambienti/${ambienteId}/utenti`, {
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore recupero utenti ambiente");
  return response.json();
};

export const addUtenteAmbiente = async (ambienteId, userId, ruolo) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/ambienti/${ambienteId}/utenti`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({ userId, ruolo })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json();
};

export const removeUtenteAmbiente = async (ambienteId, userId) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/ambienti/${ambienteId}/utenti/${userId}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore rimozione utente da ambiente");
  return response.json();
};

export const updateDescrizioneAmbiente = async (ambienteId, descrizione) => {
  const response = await fetchWithRefresh(`${API_BASE_URL}/api/ambienti/${ambienteId}/descrizione`, {
    method: "PATCH",
    headers: authHeaders(),
    body: JSON.stringify({ descrizione })
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) {
    const text = await response.text();
    throw new Error(text);
  }
  return response.json(); // { id, codiceContratto, descrizione }
};

// ---- Contratti Budget e Righe Societarie (ConsumoTow) ----

export const getContrattiBudget = async () => {
  const response = await fetch(API_BASE_URL + '/api/contratti/budget', { headers: authHeaders() });
  if (response.status === 401) throw new Error('401');
  if (!response.ok) throw new Error('Errore nel recupero budget contratti');
  return response.json();
};

export const saveContrattoBudget = async (payload) => {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? API_BASE_URL + '/api/contratti/budget/' + payload.id : API_BASE_URL + '/api/contratti/budget';
  const response = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
  if (response.status === 401) throw new Error('401');
  if (!response.ok) throw new Error('Errore nel salvataggio budget contratto');
  return response.json();
};

export const deleteContrattoBudget = async (id) => {
  const response = await fetch(API_BASE_URL + '/api/contratti/budget/' + id, { method: 'DELETE', headers: authHeaders() });
  if (response.status === 401) throw new Error('401');
  if (!response.ok) throw new Error('Errore eliminazione budget contratto');
};

export const getConsumoTowRighe = async () => {
  const response = await fetch(API_BASE_URL + '/api/contratti/consumo-tow-righe', { headers: authHeaders() });
  if (response.status === 401) throw new Error('401');
  if (!response.ok) throw new Error('Errore nel recupero righe ConsumoTOW');
  return response.json();
};

export const saveConsumoTowRiga = async (payload) => {
  const method = payload.id ? 'PUT' : 'POST';
  const url = payload.id ? API_BASE_URL + '/api/contratti/consumo-tow-righe/' + payload.id : API_BASE_URL + '/api/contratti/consumo-tow-righe';
  const response = await fetch(url, { method, headers: authHeaders(), body: JSON.stringify(payload) });
  if (response.status === 401) throw new Error('401');
  if (!response.ok) throw new Error('Errore nel salvataggio riga ConsumoTOW');
  return response.json();
};

export const deleteConsumoTowRiga = async (id) => {
  const response = await fetch(API_BASE_URL + '/api/contratti/consumo-tow-righe/' + id, { method: 'DELETE', headers: authHeaders() });
  if (response.status === 401) throw new Error('401');
  if (!response.ok) throw new Error('Errore eliminazione riga ConsumoTOW');
};

// ── RTI & SUBCO (righe ripartizione importi per società) ─────────────────────

export const getRtiSocieta = async () => {
  const r = await fetchWithRefresh(`${API_BASE_URL}/api/rti-societa`, { headers: authHeaders() });
  if (r.status === 401) throw new Error('401');
  if (!r.ok) throw new Error('Errore caricamento RTI');
  return r.json();
};

export const createRtiSocieta = async (dto) => {
  const r = await fetchWithRefresh(`${API_BASE_URL}/api/rti-societa`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(dto),
  });
  if (r.status === 401) throw new Error('401');
  if (!r.ok) throw new Error('Errore creazione riga RTI');
  return r.json();
};

export const updateRtiSocieta = async (id, dto) => {
  const r = await fetchWithRefresh(`${API_BASE_URL}/api/rti-societa/${id}`, {
    method: 'PUT', headers: authHeaders(), body: JSON.stringify(dto),
  });
  if (r.status === 401) throw new Error('401');
  if (!r.ok) throw new Error('Errore aggiornamento riga RTI');
  return r.json();
};

export const deleteRtiSocieta = async (id) => {
  const r = await fetchWithRefresh(`${API_BASE_URL}/api/rti-societa/${id}`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (r.status === 401) throw new Error('401');
  if (!r.ok) throw new Error('Errore eliminazione riga RTI');
};

export const bulkImportRtiSocieta = async (righe) => {
  const r = await fetchWithRefresh(`${API_BASE_URL}/api/rti-societa/bulk`, {
    method: 'POST', headers: authHeaders(), body: JSON.stringify(righe),
  });
  if (r.status === 401) throw new Error('401');
  if (!r.ok) throw new Error('Errore import RTI');
  return r.json();
};

// ── Reset MEV + ConsumoTow ────────────────────────────────────────────────────
export const resetMevAndConsumoTow = async () => {
  const r = await fetchWithRefresh(`${API_BASE_URL}/api/mev/reset-all`, {
    method: 'DELETE', headers: authHeaders(),
  });
  if (r.status === 401) throw new Error('401');
  if (!r.ok) {
    const msg = await r.text().catch(() => 'Errore sconosciuto');
    throw new Error(msg);
  }
  return r.json();
};
