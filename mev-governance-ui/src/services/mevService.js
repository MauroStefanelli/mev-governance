const API_BASE_URL = process.env.REACT_APP_API_URL || "http://localhost:5000";

const authHeaders = () => ({
  "Content-Type": "application/json",
  "Authorization": `Bearer ${localStorage.getItem("jwt") || ""}`
});

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
  const response = await fetch(`${API_BASE_URL}/api/mev`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero MEV");
  return response.json();
};

export async function updateMev(id, payload) {
  const response = await fetch(`${API_BASE_URL}/api/mev/${id}`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify(payload)
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel salvataggio");
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
  const response = await fetch(`${API_BASE_URL}/api/mev/upload`, {
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
  const response = await fetch(`${API_BASE_URL}/api/mev/align`, {
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
  const response = await fetch(`${API_BASE_URL}/api/contratti`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero contratti");
  return response.json();
};

export const getContrattiPubblico = async () => {
  const response = await fetch(`${API_BASE_URL}/api/contratti/pubblico`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero contratti");
  return response.json();
};

export const getConsumoTow = async () => {
  const response = await fetch(`${API_BASE_URL}/api/contratti/consumo-tow`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore nel recupero ConsumoTOW");
  return response.json();
};

export const getLastAlign = async () => {
  const response = await fetch(`${API_BASE_URL}/api/mev/last-align`, {
    headers: authHeaders()
  });
  if (response.status === 401) throw new Error("401");
  if (!response.ok) throw new Error("Errore recupero data allineamento");
  return response.json();
};

export const alignContratti = async () => {
  const response = await fetch(`${API_BASE_URL}/api/contratti/align`, {
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
  const response = await fetch(`${API_BASE_URL}/api/auth/me/password`, {
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
  const response = await fetch(url, { headers: authHeaders() });
  if (!response.ok) throw new Error("Errore recupero editor logins");
  return response.json();
};

export const getUsers = async () => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore recupero utenti");
  return response.json();
};

export const createUser = async (payload) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users`, {
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
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${id}/toggle`, {
    method: "PUT",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore toggle utente");
  return response.json();
};

export const toggleEmailUser = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${id}/toggleemail`, {
    method: "PUT",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore toggle email utente");
  return response.json();
};

export const resetPassword = async (id, newPassword) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${id}/password`, {
    method: "PUT",
    headers: authHeaders(),
    body: JSON.stringify({ newPassword })
  });
  if (!response.ok) throw new Error("Errore reset password");
  return response.json();
};


export const getUserAccessLog = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${id}/access-log`, {
    headers: authHeaders()
  });

  console.log("URL:", `${API_BASE_URL}/api/auth/users/${id}/access-log`);
  console.log("STATUS:", response.status);

  const text = await response.text();
  console.log("RESPONSE:", text);

  if (!response.ok) throw new Error(`Errore storico (${response.status})`);

  return JSON.parse(text);
};
/*
export const getUserAccessLog = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${id}/access-log`, {
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore recupero storico accessi");
  return response.json();
};
*/
export const deleteUser = async (id) => {
  const response = await fetch(`${API_BASE_URL}/api/auth/users/${id}`, {
    method: "DELETE",
    headers: authHeaders()
  });
  if (!response.ok) throw new Error("Errore eliminazione utente");
  return response.json();
};

export const getUserAccessLogSafe = async (username) => {
  const url = `${API_BASE_URL}/api/auth/editor-logins`;

  const response = await fetch(url, {
    headers: authHeaders()
  });

  if (response.status === 401) throw new Error("401");

  if (!response.ok) {
    const text = await response.text();
    console.error("Errore API editor-logins:", text);
    throw new Error("Errore recupero storico accessi");
  }

  const allLogs = await response.json();

  // ✅ filtra per utente
  const userLogs = allLogs.filter(l => 
    l.username?.toLowerCase() === username?.toLowerCase()
  );

  // ✅ normalizza struttura per la tua modale
  return userLogs.map((log, idx) => ({
    id: log.id || idx,
    loginAt: log.loginAt || log.login || log.accessTime,
    logoutAt: log.logoutAt || log.logout || log.exitTime || null
  }));
};