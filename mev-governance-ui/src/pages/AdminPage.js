import { useEffect, useState, useCallback, useMemo } from "react";

import { 
  getUsers, 
  createUser, 
  toggleUser, 
  toggleEmailUser,
  toggleAiKey,
  resetPassword, 
  deleteUser, 
  getUserAccessLog,
  updateUserRole,
  updateUser,
  setUserRoles,
  setUserTheme,
  resetAll,
  getClientPages,
  setClientPages,
  getClientContratti,
  setClientContratti,
  getConsumoTow,
  getAppRolePermissions,
  putAppRolePermissions,
} from "../services/mevService";


const roleColors = {
  Admin: { background: "#fff7ed", color: "#c2410c" },
  Editor: { background: "#eff6ff", color: "#1d4ed8" },
  Client: { background: "#faf5ff", color: "#7e22ce" },
  SuperAdmin: { background: "#fef2f2", color: "#b91c1c" },
  Developer: { background: "#f0fdf4", color: "#15803d" },
  "Bid Manager": { background: "#fefce8", color: "#854d0e" },
};

const actionStyle = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "32px",
  padding: "6px 11px",
  fontSize: "11px",
  fontWeight: 650,
  lineHeight: 1.4,
  cursor: "pointer",
  border: "1px solid transparent",
  borderRadius: "999px",
  whiteSpace: "nowrap",
};

const adminStyles = `
  .mev-admin, .mev-admin * { box-sizing: border-box; }
  .mev-admin { min-width: 0; -webkit-font-smoothing: antialiased; }
  .mev-admin button, .mev-admin input, .mev-admin select { font-family: inherit; }
  .mev-admin button, .mev-admin input, .mev-admin select {
    transition: background-color .18s ease, box-shadow .18s ease, border-color .18s ease, transform .18s ease;
  }
  .mev-admin button:not(:disabled):hover { filter: brightness(.97); box-shadow: 0 4px 10px rgba(15,23,42,.10); transform: translateY(-1px); }
  .mev-admin button:not(:disabled):active { transform: translateY(0); }
  .mev-admin button:disabled, .mev-admin select:disabled { opacity: .6; }
  .mev-admin input:focus-visible, .mev-admin select:focus-visible, .mev-admin button:focus-visible {
    outline: 2px solid #3b82f6; outline-offset: 3px; box-shadow: 0 0 0 5px #3b82f615;
  }
  .mev-admin input::placeholder { color: #94a0b2; }
  .mev-admin input[type="checkbox"] { width: 15px; height: 15px; margin: 0; flex-shrink: 0; accent-color: #4f46e5; cursor: pointer; }
  .mev-admin select option { background: #fff; color: #243247; }
  .mev-admin-hero { position: relative; display: flex; align-items: center; justify-content: space-between; gap: 24px; overflow: hidden; padding: 32px 36px; margin-bottom: 28px; border-radius: 22px; background: #15243b; color: #fff; box-shadow: 0 12px 28px #14233a12; }
  .mev-admin-hero::after { content: ""; position: absolute; width: 300px; height: 300px; border: 1px solid #ffffff0d; border-radius: 50%; top: -120px; right: -40px; pointer-events: none; }
  .mev-admin-eyebrow { display: flex; align-items: center; gap: 9px; color: #aabbd4; font-size: 10px; font-weight: 700; letter-spacing: .16em; }
  .mev-admin-eyebrow span { width: 6px; height: 6px; border-radius: 50%; background: #7daaff; box-shadow: 0 0 0 4px #7daaff15; }
  .mev-admin-hero h3 { margin: 10px 0 6px; font-size: clamp(26px, 3vw, 34px); line-height: 1.2; letter-spacing: -1px; font-weight: 700; }
  .mev-admin-hero p { margin: 0; font-size: 13px; color: #afbed3; }
  .mev-admin-hero-icon { display: grid; place-items: center; width: 76px; height: 76px; flex-shrink: 0; border: 1px solid #ffffff18; border-radius: 22px; background: #ffffff06; color: #b4cfff; }
  .mev-admin-create-card { background: #fff !important; padding: 0 !important; border: 1px solid #e1e7f0 !important; border-radius: 18px !important; box-shadow: 0 4px 18px #23385504 !important; }
  .mev-admin-section-heading { display: flex; align-items: center; gap: 13px; padding: 22px 26px; }
  .mev-admin-section-icon { display: grid; place-items: center; width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; background: #edf3ff; color: #3569d4; font-size: 25px; font-weight: 400; }
  .mev-admin-section-heading h4, .mev-admin-directory-heading h4 { margin: 0; font-size: 16px; letter-spacing: -.3px; color: #1c2c44; font-weight: 700; }
  .mev-admin-section-heading p, .mev-admin-directory-heading p { margin: 4px 0 0; font-size: 12px; color: #7b879a; }
  .mev-admin-create { padding: 22px 26px 26px; background: #f9fbfe; border-top: 1px solid #edf0f6; border-radius: 0 0 18px 18px; }
  .mev-admin-create > div { flex: 1 1 150px; min-width: 0; }
  .mev-admin-create input, .mev-admin-create select { width: 100% !important; min-width: 0; min-height: 42px; border-color: #dfe5ee !important; border-radius: 10px !important; box-shadow: 0 2px 3px #16274403; }
  .mev-admin-create > button { min-height: 42px !important; padding-inline: 24px !important; }
  .mev-admin-directory { border: 1px solid #e1e7f0; border-radius: 18px; background: #fff; box-shadow: 0 4px 18px #23385504; overflow: hidden; }
  .mev-admin-directory-heading { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 24px 26px; }
  .mev-admin-section-tag { padding: 6px 10px; border-radius: 6px; background: #f2f5fa; color: #708099; font-size: 9px; font-weight: 700; letter-spacing: .09em; white-space: nowrap; }
  .mev-admin-table-wrap { width: 100%; overflow-x: auto; background: #fff; scrollbar-width: thin; scrollbar-color: #c5cfde #f4f6fa; }
  .mev-admin-users th, .mev-admin-users td { border: 0; text-align: left; }
  .mev-admin-users th { padding: 13px 16px; background: #f4f7fb; color: #77849a; font-size: 10px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; border-block: 1px solid #e9eef5; }
  .mev-admin-users td { padding: 22px 16px; vertical-align: top; border-bottom: 1px solid #edf1f6; overflow-wrap: anywhere; }
  .mev-admin-users tbody tr:nth-child(odd) { background: #fff; }
  .mev-admin-users tbody tr:nth-child(even) { background: #fafbfe; }
  .mev-admin-users tbody tr:hover { background: #f0f5ff; }
  .mev-admin-users tbody tr { transition: background-color .18s ease; }
  .mev-admin-users tbody tr:last-child td { border-bottom: 0; }
  .mev-admin-users th:nth-child(1) { width: 250px; }
  .mev-admin-users th:nth-child(2) { width: 200px; }
  .mev-admin-users th:nth-child(3) { width: 95px; text-align: center; }
  .mev-admin-users th:nth-child(4) { width: 85px; }
  .mev-admin-users th:nth-child(5) { width: 200px; }
  .mev-admin-users th:nth-child(6) { width: 205px; }
  .mev-admin-users th:nth-child(7) { width: 185px; }
  .mev-admin-users th:first-child { padding-left: 26px; }
  .mev-admin-users td:first-child { padding-left: 26px; }
  .mev-admin-person-mark { float: left; display: grid; place-items: center; width: 34px; height: 38px; border-radius: 11px; margin-right: 11px; color: #657d9f; background: #eaf0f8; border: 1px solid #e0e8f2; }
  .mev-admin-identity > div:last-child { overflow: hidden; }
  .mev-admin-identity strong { display: block; color: #263b58; font-size: 13px; font-weight: 700; margin: 0 0 3px; }
  .mev-admin-fullname { font-size: 12px; color: #64748b; }
  .mev-admin-email { font-size: 11px; color: #8390a5; margin-top: 7px; }
  .mev-admin-extra-roles { gap: 5px !important; }
  .mev-admin-extra-roles label { font-size: 10px; border-color: #e3e8f1 !important; border-radius: 6px !important; padding: 4px 6px !important; }
  .mev-admin-extra-roles label:has(input:checked) { background: #eef2ff !important; border-color: #c7d2fe !important; color: #4338ca; }
  .mev-admin-extra-roles input { width: 12px !important; height: 12px !important; }
  .mev-admin-password { flex-wrap: wrap; }
  .mev-admin-password input { flex: 1 1 115px; width: 115px !important; min-height: 36px; }
  .mev-admin-password > button:last-child { flex-basis: 100%; margin-top: 2px; background: #f1f5fc !important; border-color: #dde6f5 !important; color: #48648f !important; border-radius: 8px !important; }
  .mev-admin-actions { display: grid !important; grid-template-columns: 1fr 1fr; gap: 6px !important; }
  .mev-admin-actions button { width: 100%; font-size: 10px !important; min-height: 30px !important; padding: 5px 8px !important; border-radius: 7px !important; }
  .mev-admin-actions button[title="Modifica dati utente"] { grid-column: 1; grid-row: 1; }
  .mev-admin-activity { color: #61718a; font-size: 11px; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mev-admin-activity > span { display: block; font-size: 8px; letter-spacing: .07em; font-weight: 700; color: #94a0b2; margin-bottom: 3px; }
  .mev-admin-activity > div + span { margin-top: 12px; }
  .mev-admin-danger { margin-top: 24px !important; border-radius: 16px !important; background: #fffafa !important; border-color: #f0d9dc !important; padding: 22px 26px !important; }
  .mev-admin-danger > div { flex: 1 1 460px; }
  .mev-admin-danger > div > div:first-child { text-transform: none !important; font-size: 14px !important; letter-spacing: -.2px !important; margin-bottom: 6px !important; }
  .mev-admin-danger > button { border-color: #edb9be !important; border-width: 1px !important; border-radius: 9px !important; min-height: 40px; }
  .mev-admin-overlay > div { border-radius: 22px !important; border-color: #e5eaf2 !important; box-shadow: 0 32px 100px #09132540 !important; }
  .mev-admin-overlay h4 { color: #1d2f4b !important; font-size: 21px; letter-spacing: -.5px; }
  .mev-admin-overlay input[type="text"] { min-height: 44px; background: #fafbfd !important; border-color: #dde4ee !important; }
  .mev-admin-overlay button { min-height: 36px; }
  .mev-admin-overlay label:has(input:checked) { box-shadow: 0 2px 6px #4f46e50a; }
  @media (max-width: 640px) {
    .mev-admin-hero { padding: 26px 22px; border-radius: 17px; }
    .mev-admin-hero-icon { display: none; }
    .mev-admin-section-heading, .mev-admin-directory-heading { padding: 20px; }
    .mev-admin-section-tag { display: none; }
    .mev-admin-create { padding: 20px; }
    .mev-admin-create > div { flex-basis: 100%; }
    .mev-admin-create > button { width: 100%; }
    .mev-admin-danger > button { width: 100%; }
  }
  @media (prefers-reduced-motion: reduce) {
    .mev-admin *, .mev-admin-users tbody tr { transition: none !important; }
    .mev-admin button:not(:disabled):hover { transform: none; }
  }
`;

function EyeIcon({ visible }) {
  return visible ? (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/>
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  ) : (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
      <circle cx="12" cy="12" r="3"/>
    </svg>
  );
}

function AdminPage({ currentRole, currentUserId, onThemeChange }) {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", fullName: "", email: "", password: "", role: "Editor" });
  const [newPasswords, setNewPasswords] = useState({});
  const [showFormPassword, setShowFormPassword] = useState(false);
  const [showRowPassword, setShowRowPassword] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [accessLogModal, setAccessLogModal] = useState(null); // { userId, username, fullName, logs: [] }
  const [accessLogLoading, setAccessLogLoading] = useState(false);
  const [savingRole, setSavingRole] = useState({}); // { [userId]: true/false }
  const [resetting, setResetting] = useState(false);
  const [permessiModal, setPermessiModal] = useState(null); // { user }
  const [editModal, setEditModal] = useState(null); // { id, username, fullName, email }
  const [editSaving, setEditSaving] = useState(false);
  const [savingTheme, setSavingTheme] = useState({}); // { [userId]: true/false }
  const [savingAiKey, setSavingAiKey] = useState({}); // { [userId]: true/false }
  const [adminTab, setAdminTab] = useState("utenti"); // "utenti" | "funzioni"

  const formatDateTime = (iso) => {

    if (!iso) {
      return (
        <span style={{ color: "#bbb", fontSize: "11px" }}>
          —
        </span>
      );
    }

    // Il backend restituisce UTC senza "Z": lo aggiungiamo per la corretta conversione
    const normalized = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
    return new Date(normalized).toLocaleString("it-IT", { 
      timeZone: "Europe/Rome",
      day: "2-digit", 
      month: "2-digit", 
      year: "numeric",
      hour: "2-digit", 
      minute: "2-digit", 
      second: "2-digit",
      hour12: false
    });
  };

  const loadUsers = async () => {
    try {
      const data = await getUsers();
      setUsers(data);
    } catch {
      setError("Errore nel caricamento utenti");
    }
  };

  useEffect(() => { loadUsers(); }, []);

  const notify = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(""), 3000);
  };

  const handleCreate = async (e) => {
    e.preventDefault();
    setError("");
    try {
      await createUser(form);
      setForm({ username: "", fullName: "", email: "", password: "", role: "Editor" });
      setShowFormPassword(false);
      notify("Utente creato");
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggle = async (id) => {
    try {
      const result = await toggleUser(id);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, isActive: result.isActive } : u));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggleEmail = async (id) => {
    try {
      const result = await toggleEmailUser(id);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, sendEmail: result.sendEmail } : u));
    } catch (err) {
      setError(err.message);
    }
  };

  const handleChangeRole = async (id, newRole) => {
    setSavingRole((prev) => ({ ...prev, [id]: true }));
    setError("");
    try {
      const result = await updateUserRole(id, newRole);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, role: result.role } : u));
      notify(`Ruolo aggiornato: ${result.role}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSavingRole((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleToggleExtraRole = async (id, roleToToggle) => {
    setSavingRole((prev) => ({ ...prev, [id]: true }));
    setError("");
    const user = users.find(u => u.id === id);
    const current = user?.roles || [];
    const next = current.includes(roleToToggle)
      ? current.filter(r => r !== roleToToggle)
      : [...current, roleToToggle];
    try {
      const result = await setUserRoles(id, next);
      setUsers((prev) => prev.map((u) => u.id === id ? { ...u, roles: result.roles || [] } : u));
      notify(`Ruoli aggiornati: ${(result.roles || []).length > 0 ? result.roles.join(", ") : "(nessuno extra)"}`);
    } catch (err) {
      setError(err.message === "401" ? "Sessione scaduta" : (err.message || "Errore aggiornamento ruoli"));
    } finally {
      setSavingRole((prev) => ({ ...prev, [id]: false }));
    }
  };

  const handleResetPassword = async (id) => {
    const pwd = newPasswords[id];
    if (!pwd || pwd.length < 4) { setError("Password troppo corta (min 4 caratteri)"); return; }
    try {
      await resetPassword(id, pwd);
      setNewPasswords((prev) => ({ ...prev, [id]: "" }));
      setShowRowPassword((prev) => ({ ...prev, [id]: false }));
      notify("Password aggiornata");
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id, username) => {
    if (!window.confirm(`Eliminare l'utente ${username}?`)) return;
    try {
      await deleteUser(id);
      loadUsers();
      notify("Utente eliminato");
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleRowPassword = (id) => {
    setShowRowPassword((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenAccessLog = async (u) => {
    setAccessLogModal({ userId: u.id, username: u.username, fullName: u.fullName, logs: [] });
    setAccessLogLoading(true);
    try {
      const logs = await getUserAccessLog(u.id);      
      setAccessLogModal(prev => prev ? { ...prev, logs } : null);
    } catch (err) {
      setError(err.message);
      setAccessLogModal(null);
    } finally {
      setAccessLogLoading(false);
    }
  };

  const handleSetTheme = async (id, theme) => {
    setSavingTheme(prev => ({ ...prev, [id]: true }));
    setError("");
    try {
      const result = await setUserTheme(id, theme);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, theme: result.theme } : u));
      notify(`Tema aggiornato: ${result.theme === "dark" ? "Scuro" : "Chiaro"}`);
      // Se si sta cambiando il tema dell'utente attualmente loggato, aggiorna l'app in tempo reale
      if (id === currentUserId && onThemeChange) onThemeChange(result.theme);
    } catch (err) {
      setError(err.message || "Errore aggiornamento tema");
    } finally {
      setSavingTheme(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleToggleAiKey = async (id) => {
    setSavingAiKey(prev => ({ ...prev, [id]: true }));
    setError("");
    try {
      const result = await toggleAiKey(id);
      setUsers(prev => prev.map(u => u.id === id ? { ...u, aiKeyEnabled: result.aiKeyEnabled } : u));
      notify(`API Key ${result.aiKeyEnabled ? "abilitata" : "disabilitata"}`);
    } catch (err) {
      setError(err.message || "Errore toggle API Key");
    } finally {
      setSavingAiKey(prev => ({ ...prev, [id]: false }));
    }
  };

  const handleSaveEdit = async () => {
    if (!editModal) return;
    setEditSaving(true);
    setError("");
    try {
      const result = await updateUser(editModal.id, {
        username: editModal.username,
        fullName: editModal.fullName,
        email: editModal.email,
      });
      setUsers((prev) => prev.map((u) => u.id === editModal.id ? { ...u, username: result.username, fullName: result.fullName, email: result.email } : u));
      setEditModal(null);
      notify("Utente aggiornato");
    } catch (err) {
      setError(err.message || "Errore salvataggio utente");
    } finally {
      setEditSaving(false);
    }
  };

  const handleResetAll = async () => {
    if (!window.confirm(
      "ATTENZIONE: questa operazione è irreversibile.\n\n" +
      "Verranno eliminati:\n" +
      "  • tutte le righe MEV\n" +
      "  • tutti i dati ConsumoTow (contratti + TOW + buoni consegna)\n" +
      "I contatori ID verranno azzerati.\n\n" +
      "RTI & SUBCO, Ordini e Verbali NON verranno toccati.\n\n" +
      "Continuare?"
    )) return;
    setResetting(true);
    setError("");
    try {
      const result = await resetAll();
      notify(result.message || "Reset completato");
    } catch (err) {
      setError(err.message || "Errore durante il reset");
    } finally {
      setResetting(false);
    }
  };

  const btnStyle = {
    display: "inline-flex", alignItems: "center", justifyContent: "center",
    padding: "8px", minWidth: "36px", minHeight: "36px", border: "1px solid #dbe3ee", borderRadius: "10px",
    background: "#fff", cursor: "pointer", color: "#526079", flexShrink: 0
  };

  return (
    <div className="mev-admin" style={{ padding: "clamp(16px, 3vw, 36px)", maxWidth: "1920px", margin: "0 auto", background: "#f4f6fa", color: "#243247", fontFamily: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", minHeight: "100%", lineHeight: 1.5 }}>
      <style>{adminStyles}</style>
      <header className="mev-admin-hero">
        <div>
          <div className="mev-admin-eyebrow"><span /> AMMINISTRAZIONE</div>
          <h3>Gestione Utenti e Funzioni</h3>
          <p>Persone, ruoli, accessi e permessi applicativi.</p>
        </div>
        <div className="mev-admin-hero-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
            <circle cx="9" cy="7" r="4" />
          </svg>
        </div>
      </header>

      {/* ── Tab bar ── */}
      <div style={{ display: "flex", gap: 4, background: "#EAF0F5", border: "1px solid #E3E8EF", borderRadius: 11, padding: 4, marginBottom: 24, width: "fit-content" }}>
        {[
          { id: "utenti",   label: "Utenti e Ruoli" },
          { id: "funzioni", label: "Funzioni e Permessi App" },
        ].map(t => (
          <button key={t.id} type="button" onClick={() => setAdminTab(t.id)}
            style={{ border: "1px solid transparent", cursor: "pointer", padding: "10px 22px", borderRadius: 8,
              fontSize: 13, fontWeight: 600, fontFamily: "inherit",
              background: adminTab === t.id ? "#fff" : "transparent",
              color: adminTab === t.id ? "#263D63" : "#68758A",
              boxShadow: adminTab === t.id ? "0 2px 5px rgba(24,39,63,0.07)" : "none" }}>
            {t.label}
          </button>
        ))}
      </div>

      {adminTab === "funzioni" && <AppPermissionsPanel />}
      {adminTab === "utenti" && (<>

      {error && (
        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderLeft: "4px solid #e11d48", color: "#9f1239", padding: "14px 18px", borderRadius: "12px", marginBottom: "16px", fontSize: "14px", fontWeight: 500, overflowWrap: "anywhere" }}>
          {error} <button onClick={() => setError("")} style={{ float: "right", border: "none", background: "none", cursor: "pointer", fontWeight: "bold" }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderLeft: "4px solid #059669", color: "#065f46", padding: "14px 18px", borderRadius: "12px", marginBottom: "16px", fontSize: "14px", fontWeight: 500 }}>
          {success}
        </div>
      )}

      {/* Form nuovo utente */}
      <div className="mev-admin-create-card" style={{ background: "#f8faff", border: "1px solid #dce5f2", borderRadius: "18px", padding: "24px", marginBottom: "24px", boxShadow: "0 4px 20px rgba(30, 50, 80, 0.03)" }}>
        <div className="mev-admin-section-heading">
          <span className="mev-admin-section-icon" aria-hidden="true">＋</span>
          <div><h4>Nuovo Utente</h4><p>Crea un account e assegna il ruolo di accesso.</p></div>
        </div>
        <form className="mev-admin-create" onSubmit={handleCreate} style={{ display: "flex", gap: "16px", flexWrap: "wrap", alignItems: "flex-end" }}>
          {[
            { label: "Username", key: "username", required: true },
            { label: "Nome Completo", key: "fullName", required: true },
            { label: "Email", key: "email" },
          ].map(({ label, key, required }) => (
            <div key={key}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "7px", fontWeight: 600, color: "#526079" }}>{label}</label>
              <input
                type="text"
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                required={required}
                style={{ padding: "10px 12px", border: "1px solid #cfd9e6", borderRadius: "9px", fontSize: "13px", background: "#fff", color: "#243247", width: "160px" }}
              />
            </div>
          ))}

          {/* Campo password con toggle visibilità */}
          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "7px", fontWeight: 600, color: "#526079" }}>Password</label>
            <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
              <input
                type={showFormPassword ? "text" : "password"}
                value={form.password}
                onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                required
                style={{ padding: "10px 12px", border: "1px solid #cfd9e6", borderRadius: "9px", fontSize: "13px", background: "#fff", color: "#243247", width: "150px" }}
              />
              <button type="button" onClick={() => setShowFormPassword((v) => !v)} style={btnStyle} title={showFormPassword ? "Nascondi" : "Mostra"}>
                <EyeIcon visible={showFormPassword} />
              </button>
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontSize: "12px", marginBottom: "7px", fontWeight: 600, color: "#526079" }}>Ruolo</label>
            <select
              value={form.role}
              onChange={(e) => setForm((p) => ({ ...p, role: e.target.value }))}
              style={{ padding: "10px 12px", border: "1px solid #cfd9e6", borderRadius: "9px", fontSize: "13px", background: "#fff", color: "#243247", width: "120px" }}
            >
              <option value="Editor">Editor</option>
              <option value="Admin">Admin</option>
              <option value="Client">Client</option>
              <option value="Developer">Developer</option>
              <option value="SuperAdmin">SuperAdmin</option>
            </select>
          </div>
          <button type="submit" style={{ padding: "10px 22px", minHeight: "40px", background: "#2563eb", color: "white", border: "1px solid #2563eb", borderRadius: "10px", cursor: "pointer", fontWeight: 600, boxShadow: "0 3px 8px rgba(37,99,235,0.16)" }}>
            Aggiungi
          </button>
        </form>
      </div>

      {/* Tabella utenti */}
      <section className="mev-admin-directory">
      <div className="mev-admin-directory-heading"><div><h4>Elenco utenti</h4><p>Gestisci profili, autorizzazioni e attività degli account.</p></div><span className="mev-admin-section-tag">GESTIONE ACCESSI</span></div>
      <div className="mev-admin-table-wrap">
      <table className="mev-admin-users" border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", border: "none", tableLayout: "fixed", minWidth: "1220px" }}>
        <thead style={{ background: "#f0f0f0" }}>
          <tr>
            <th>Utente</th>
            <th>Ruolo</th>
            <th>Stato</th>
            <th style={{ textAlign: "center" }}>Invia Email</th>
            <th>Modifica Password</th>
            <th>Azioni</th>
            <th style={{ whiteSpace: "nowrap" }}>Ultima attività</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ color: u.isActive ? "inherit" : "#758197" }}>
              <td className="mev-admin-identity">
                <div className="mev-admin-person-mark" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><circle cx="12" cy="8" r="3.5" /><path d="M5 21v-2a7 7 0 0 1 14 0v2" /></svg>
                </div>
                <div><strong>{u.username}</strong><div className="mev-admin-fullname">{u.fullName}</div><div className="mev-admin-email">{u.email}</div></div>
              </td>
              <td>
                <select
                  value={u.role}
                  disabled={savingRole[u.id]}
                  onChange={(e) => handleChangeRole(u.id, e.target.value)}
                  style={{
                    padding: "7px 10px", border: "1px solid currentColor", borderRadius: "999px", maxWidth: "100%",
                    fontSize: "12px", cursor: savingRole[u.id] ? "wait" : "pointer",
                    ...roleColors[u.role],
                    fontWeight: 600,
                    opacity: savingRole[u.id] ? 0.6 : 1,
                  }}
                >
                  <option value="Editor">Editor</option>
                  <option value="Admin">Admin</option>
                  <option value="Client">Client</option>
                  <option value="SuperAdmin">SuperAdmin</option>
                  <option value="Developer">Developer</option>
                  <option value="Bid Manager">Bid Manager</option>
                </select>
                <div className="mev-admin-extra-roles" style={{ marginTop: "10px", display: "flex", flexWrap: "wrap", gap: "6px", fontSize: "11px", color: "#526079" }}>
                  {["Developer", "Admin", "Editor", "Client", "Bid Manager"].filter(r => r !== u.role).map(r => (
                    <label key={r} style={{ display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", padding: "4px 7px", borderRadius: "7px", border: "1px solid #dce3ec", background: "#fff", fontWeight: 500 }}>
                      <input
                        type="checkbox"
                        checked={(u.roles || []).includes(r)}
                        onChange={() => handleToggleExtraRole(u.id, r)}
                      />
                      {r}
                    </label>
                  ))}
                </div>
              </td>
              <td style={{ textAlign: "center" }}>
                <span style={{
                  display: "inline-flex", padding: "5px 9px", borderRadius: "999px", fontSize: "11px", fontWeight: 650,
                  background: u.isActive ? "#dcfce7" : "#fee2e2",
                  color: u.isActive ? "#166534" : "#991b1b"
                }}>
                  {u.isActive ? "Attivo" : "Disattivo"}
                </span>
              </td>
              <td style={{ textAlign: "center" }}>
                <button
                  onClick={() => handleToggleEmail(u.id)}
                  title={u.sendEmail ? "Clicca per disabilitare l'invio email" : "Clicca per abilitare l'invio email"}
                  style={{
                    padding: "6px 14px", fontSize: "12px", cursor: "pointer", border: "1px solid transparent", borderRadius: "999px",
                    background: u.sendEmail ? "#dcfce7" : "#fee2e2",
                    color: u.sendEmail ? "#166534" : "#991b1b",
                    fontWeight: 600
                  }}
                >
                  {u.sendEmail ? "Sì" : "No"}
                </button>
              </td>
              <td>
                <div className="mev-admin-password" style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                  <input
                    type={showRowPassword[u.id] ? "text" : "password"}
                    placeholder="Nuova password"
                    value={newPasswords[u.id] || ""}
                    onChange={(e) => setNewPasswords((p) => ({ ...p, [u.id]: e.target.value }))}
                    style={{ padding: "9px 10px", border: "1px solid #cfd9e6", borderRadius: "9px", fontSize: "12px", width: "130px", minWidth: 0, background: "#fff", color: "#243247" }}
                  />
                  <button type="button" onClick={() => toggleRowPassword(u.id)} style={btnStyle} title={showRowPassword[u.id] ? "Nascondi" : "Mostra"}>
                    <EyeIcon visible={showRowPassword[u.id]} />
                  </button>
                  <button onClick={() => handleResetPassword(u.id)} style={{ ...actionStyle, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}>
                    Salva
                  </button>
                </div>
              </td>
              <td style={{ textAlign: "center" }}>
                <div className="mev-admin-actions" style={{ display: "flex", flexWrap: "wrap", gap: "7px", justifyContent: "flex-start" }}>
                  <button
                    onClick={() => handleToggle(u.id)}
                    style={{ ...actionStyle, background: u.isActive ? "#fef9c3" : "#dcfce7", color: u.isActive ? "#854d0e" : "#166534", borderColor: u.isActive ? "#fde68a" : "#bbf7d0" }}
                  >
                    {u.isActive ? "Disattiva" : "Attiva"}
                  </button>
                  <button
                    onClick={() => handleOpenAccessLog(u)}
                    style={{ ...actionStyle, background: "#f1f5f9", color: "#475569", borderColor: "#dbe3ed" }}
                    title="Storico accessi"
                  >
                    Storico
                  </button>
                  {u.role === "Client" && (
                    <button
                      onClick={() => setPermessiModal({ user: u })}
                      style={{ ...actionStyle, background: "#f3e8ff", color: "#7e22ce", borderColor: "#e9d5ff" }}
                      title="Gestisci permessi pagine e contratti"
                    >
                      Permessi
                    </button>
                  )}
                  <button
                    disabled={!!savingAiKey[u.id]}
                    onClick={() => handleToggleAiKey(u.id)}
                    style={{
                      ...actionStyle,
                      background: u.aiKeyEnabled ? "#f0fdf4" : "#fafafa",
                      color:      u.aiKeyEnabled ? "#15803d" : "#64748b",
                      borderColor: u.aiKeyEnabled ? "#86efac" : "#cbd5e1",
                      opacity: savingAiKey[u.id] ? 0.6 : 1,
                      fontWeight: 600,
                    }}
                    title={u.aiKeyEnabled ? "API Key abilitata — clicca per disabilitare" : "API Key disabilitata — clicca per abilitare"}
                  >
                    API Key: {u.aiKeyEnabled ? "Sì" : "No"}
                  </button>
                  <button
                    onClick={() => setEditModal({ id: u.id, username: u.username, fullName: u.fullName || "", email: u.email || "" })}
                    style={{ ...actionStyle, background: "#eff6ff", color: "#1d4ed8", borderColor: "#bfdbfe" }}
                    title="Modifica dati utente"
                  >
                    Modifica
                  </button>
                  {currentRole === "SuperAdmin" && (
                    <button
                      disabled={!!savingTheme[u.id]}
                      onClick={() => handleSetTheme(u.id, u.theme === "dark" ? "light" : "dark")}
                      style={{
                        ...actionStyle,
                        background: u.theme === "dark" ? "#1e293b" : "#f8fafc",
                        color:      u.theme === "dark" ? "#e2e8f0" : "#475569",
                        borderColor: u.theme === "dark" ? "#334155" : "#cbd5e1",
                        opacity: savingTheme[u.id] ? 0.6 : 1,
                      }}
                      title={u.theme === "dark" ? "Tema: Scuro — clicca per impostare Chiaro" : "Tema: Chiaro — clicca per impostare Scuro"}
                    >
                      {u.theme === "dark" ? "🌙 Scuro" : "☀️ Chiaro"}
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(u.id, u.username)}
                    style={{ ...actionStyle, background: "#fff1f2", color: "#be123c", borderColor: "#fecdd3" }}
                  >
                    Elimina
                  </button>
                </div>
              </td>
              <td className="mev-admin-activity">
                <span>ULTIMO ACCESSO</span>
                <div>{formatDateTime(u.lastLogin)}</div>
                <span>ULTIMA USCITA</span>
                <div>{formatDateTime(u.lastLogout)}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      </section>

      {/* ── Reset dati ── */}
      <div className="mev-admin-danger" style={{
        marginTop: "32px",
        border: "1px solid #fecaca",
        borderRadius: "10px",
        padding: "22px 24px",
        background: "#fffafa",
        flexWrap: "wrap",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "16px",
      }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#dc2626", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "4px" }}>
            Reset dati
          </div>
          <div style={{ fontSize: "12px", color: "#64748b", lineHeight: 1.5 }}>
            <strong style={{ color: "#b91c1c" }}>Attenzione: operazione irreversibile.</strong>{" "}
            Elimina tutte le righe <strong>MEV</strong> e tutti i dati <strong>ConsumoTow</strong> (contratti + TOW) per questo ambiente e azzera i contatori ID.
            RTI &amp; SUBCO, Ordini e Verbali non vengono toccati.
          </div>
        </div>
        <button
          onClick={handleResetAll}
          disabled={resetting}
          style={{
            flexShrink: 0,
            padding: "8px 20px",
            borderRadius: "8px",
            border: "1.5px solid #dc2626",
            background: resetting ? "#fef2f2" : "#fff",
            color: resetting ? "#fca5a5" : "#dc2626",
            fontSize: "12px",
            fontWeight: 700,
            cursor: resetting ? "default" : "pointer",
            whiteSpace: "nowrap",
            transition: "background 0.15s",
          }}
          onMouseEnter={e => { if (!resetting) e.currentTarget.style.background = "#fef2f2"; }}
          onMouseLeave={e => { if (!resetting) e.currentTarget.style.background = "#fff"; }}
        >
          {resetting ? "Reset in corso..." : "🗑 Reset MEV + ConsumoTow"}
        </button>
      </div>

      {/* ── Modale storico accessi ── */}
      {accessLogModal && (
        <div className="mev-admin-overlay" style={{
          position: "fixed", inset: 0, padding: "20px", overflowY: "auto", backdropFilter: "blur(5px)", background: "rgba(15,23,42,0.52)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        }}
          onClick={(e) => { if (e.target === e.currentTarget) setAccessLogModal(null); }}
        >
          <div style={{
            background: "white", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "24px 28px",
            width: "600px", maxWidth: "95vw", maxHeight: "80vh",
            boxShadow: "0 24px 80px rgba(15,23,42,0.24)", display: "flex", flexDirection: "column",
          }}>
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
              <div>
                <div style={{ fontSize: "15px", fontWeight: 700, color: "#1a73e8" }}>
                  Storico Accessi
                </div>
                <div style={{ fontSize: "12px", color: "#666", marginTop: "2px" }}>
                  {accessLogModal.fullName || accessLogModal.username} ({accessLogModal.username})
                </div>
              </div>
              <button
                onClick={() => setAccessLogModal(null)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: "20px", color: "#888" }}
              >×</button>
            </div>

            {/* Corpo */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {accessLogLoading ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#888" }}>Caricamento...</div>
              ) : accessLogModal.logs.length === 0 ? (
                <div style={{ textAlign: "center", padding: "32px", color: "#888", fontSize: "13px" }}>
                  Nessun accesso registrato.
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ background: "#f8f9fa" }}>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#444", borderBottom: "2px solid #dadce0", whiteSpace: "nowrap" }}>#</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#444", borderBottom: "2px solid #dadce0", whiteSpace: "nowrap" }}>Accesso</th>
                      <th style={{ padding: "8px 12px", textAlign: "left", fontWeight: 600, color: "#444", borderBottom: "2px solid #dadce0", whiteSpace: "nowrap" }}>Uscita</th>
                      <th style={{ padding: "8px 12px", textAlign: "right", fontWeight: 600, color: "#444", borderBottom: "2px solid #dadce0", whiteSpace: "nowrap" }}>Durata</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accessLogModal.logs.map((log, idx) => {
                      const parseDate = (iso) => {
                        if (!iso) return null;
                        const n = iso.endsWith("Z") || iso.includes("+") ? iso : iso + "Z";
                        return new Date(n);
                      };
                      const loginDate  = parseDate(log.loginAt);
                      const logoutDate = parseDate(log.logoutAt);
                      const durataSec  = loginDate && logoutDate ? Math.round((logoutDate - loginDate) / 1000) : null;
                      const durataStr  = durataSec != null
                        ? durataSec < 60
                          ? `${durataSec}s`
                          : durataSec < 3600
                            ? `${Math.floor(durataSec / 60)}m ${durataSec % 60}s`
                            : `${Math.floor(durataSec / 3600)}h ${Math.floor((durataSec % 3600) / 60)}m`
                        : "—";
                      const fmtOpts = { timeZone: "Europe/Rome", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false };
                      return (
                        <tr key={log.id} style={{ background: idx % 2 === 0 ? "white" : "#fafafa", borderBottom: "1px solid #f0f0f0" }}>
                          <td style={{ padding: "6px 12px", color: "#999", fontSize: "11px" }}>{accessLogModal.logs.length - idx}</td>
                          <td style={{ padding: "6px 12px", color: "#333", whiteSpace: "nowrap" }}>{loginDate ? loginDate.toLocaleString("it-IT", fmtOpts) : <span style={{ color: "#bbb" }}>—</span>}</td>
                          <td style={{ padding: "6px 12px", color: log.logoutAt ? "#333" : "#bbb", whiteSpace: "nowrap" }}>
                            {logoutDate ? logoutDate.toLocaleString("it-IT", fmtOpts) : <span style={{ color: "#bbb" }}>—</span>}
                          </td>
                          <td style={{ padding: "6px 12px", textAlign: "right", color: "#555", whiteSpace: "nowrap" }}>{durataStr}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ marginTop: "16px", textAlign: "right" }}>
              <button
                onClick={() => setAccessLogModal(null)}
                style={{ padding: "10px 20px", borderRadius: "10px", border: "1px solid #dadce0", background: "#f1f3f4", color: "#444", cursor: "pointer", fontSize: "13px" }}
              >Chiudi</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modale Permessi Client ── */}
      {permessiModal && (
        <PermessiClientModal
          user={permessiModal.user}
          onClose={() => setPermessiModal(null)}
        />
      )}

      {/* ── Modale Modifica Utente ── */}
      {editModal && (
        <div
          className="mev-admin-overlay"
          style={{ position: "fixed", inset: 0, padding: "20px", overflowY: "auto", backdropFilter: "blur(5px)", background: "rgba(15,23,42,0.52)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget) setEditModal(null); }}
        >
          <div style={{ background: "white", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "clamp(20px, 4vw, 32px)", width: "460px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(15,23,42,0.24)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
              <h4 style={{ margin: 0, color: "#1a73e8" }}>Modifica Utente</h4>
              <button onClick={() => setEditModal(null)} style={{ border: "none", background: "none", fontSize: "18px", cursor: "pointer", color: "#888" }}>×</button>
            </div>
            {[
              { label: "Username", key: "username" },
              { label: "Nome Completo", key: "fullName" },
              { label: "Email", key: "email" },
            ].map(({ label, key }) => (
              <div key={key} style={{ marginBottom: "14px" }}>
                <label style={{ display: "block", fontSize: "12px", marginBottom: "7px", fontWeight: 600, color: "#526079", fontWeight: 600, color: "#555" }}>{label}</label>
                <input
                  type="text"
                  value={editModal[key]}
                  onChange={(e) => setEditModal((p) => ({ ...p, [key]: e.target.value }))}
                  style={{ width: "100%", padding: "11px 13px", border: "1px solid #cfd9e6", borderRadius: "10px", fontSize: "14px", boxSizing: "border-box", color: "#243247", background: "#fff" }}
                />
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", marginTop: "24px", paddingTop: "20px", borderTop: "1px solid #e8edf4" }}>
              <button
                onClick={() => setEditModal(null)}
                style={{ padding: "10px 18px", borderRadius: "10px", border: "1px solid #ccc", background: "#f1f3f4", cursor: "pointer", fontSize: "13px" }}
              >Annulla</button>
              <button
                onClick={handleSaveEdit}
                disabled={editSaving}
                style={{ padding: "10px 22px", borderRadius: "10px", border: "none", background: "#1a73e8", color: "white", cursor: editSaving ? "wait" : "pointer", fontSize: "13px", fontWeight: 600 }}
              >{editSaving ? "Salvataggio..." : "Salva"}</button>
            </div>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

// ── Modale permessi per utente Client ─────────────────────────────────────────
const ALL_PAGES = [
  { id: "mev",               label: "MEV" },
  { id: "mevcap",            label: "MEV-CAP" },
  { id: "contratti",         label: "Contratti" },
  { id: "contratti_interni", label: "Ordini" },
  { id: "chart",             label: "Grafici" },
  { id: "tools",             label: "Gestione Ordini" },
  { id: "consumotow",        label: "TOW Contratti" },
  { id: "superadmin",        label: "Gestione Contratti" },
];

function PermessiClientModal({ user, onClose }) {
  const [pages, setPages] = useState([]);
  const [contratti, setContratti] = useState([]); // [{ ambienteId, towContratto }]
  const [availContratti, setAvailContratti] = useState([]); // nomi contratti disponibili
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getClientPages(user.id).then(setPages).catch(() => {});
    getClientContratti(user.id).then(setContratti).catch(() => {});
    getConsumoTow().then(data => {
      const nomi = [...new Set(data.map(r => r.towContratto).filter(Boolean))];
      setAvailContratti(nomi);
    }).catch(() => {});
  }, [user.id]);

  const ambienteId = parseInt(localStorage.getItem("ambienteId") || "0", 10);

  const togglePage = (id) =>
    setPages(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);

  const toggleContratto = (nome) =>
    setContratti(prev => {
      const exists = prev.some(r => r.ambienteId === ambienteId && r.towContratto === nome);
      if (exists) return prev.filter(r => !(r.ambienteId === ambienteId && r.towContratto === nome));
      return [...prev, { ambienteId, towContratto: nome }];
    });

  const isContrattoChecked = (nome) =>
    contratti.some(r => r.ambienteId === ambienteId && r.towContratto === nome);

  const handleSave = async () => {
    setSaving(true); setError("");
    try {
      await setClientPages(user.id, pages);
      const towNomi = contratti
        .filter(r => r.ambienteId === ambienteId)
        .map(r => r.towContratto);
      await setClientContratti(user.id, ambienteId, towNomi);
      onClose();
    } catch (e) {
      setError(e.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mev-admin-overlay" style={{ position: "fixed", inset: 0, padding: "20px", overflowY: "auto", backdropFilter: "blur(5px)", background: "rgba(15,23,42,0.52)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ background: "#fff", borderRadius: "20px", border: "1px solid #e2e8f0", padding: "clamp(20px, 4vw, 32px)", width: "540px", maxWidth: "100%", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 24px 80px rgba(15,23,42,0.24)" }}>
        <div style={{ fontSize: "16px", fontWeight: 700, marginBottom: "4px", color: "#1a1a1a" }}>
          Permessi — {user.fullName || user.username}
        </div>
        <div style={{ fontSize: "12px", color: "#64748b", marginBottom: "20px" }}>Ruolo Client</div>

        {error && <div style={{ background: "#fef2f2", color: "#dc2626", border: "1px solid #fecaca", borderRadius: "6px", padding: "8px 12px", marginBottom: "14px", fontSize: "12px" }}>{error}</div>}

        {/* Pagine visibili */}
        <div style={{ marginBottom: "20px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>Pagine visibili</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
            {ALL_PAGES.map(p => (
              <label key={p.id} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer",
                background: pages.includes(p.id) ? "#eff6ff" : "#f8f9fa",
                border: `1px solid ${pages.includes(p.id) ? "#93c5fd" : "#e2e8f0"}`,
                borderRadius: "9px", padding: "9px 12px", userSelect: "none" }}>
                <input type="checkbox" checked={pages.includes(p.id)} onChange={() => togglePage(p.id)} />
                {p.label}
              </label>
            ))}
          </div>
        </div>

        {/* Contratti visibili */}
        <div style={{ marginBottom: "24px" }}>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "#374151", textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: "10px" }}>
            Contratti visibili (ambiente corrente)
          </div>
          {availContratti.length === 0
            ? <div style={{ fontSize: "12px", color: "#94a3b8" }}>Nessun contratto disponibile in questo ambiente.</div>
            : <div style={{ display: "flex", flexWrap: "wrap", gap: "8px" }}>
                {availContratti.map(nome => (
                  <label key={nome} style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "13px", cursor: "pointer",
                    background: isContrattoChecked(nome) ? "#f0fdf4" : "#f8f9fa",
                    border: `1px solid ${isContrattoChecked(nome) ? "#86efac" : "#e2e8f0"}`,
                    borderRadius: "9px", padding: "9px 12px", userSelect: "none" }}>
                    <input type="checkbox" checked={isContrattoChecked(nome)} onChange={() => toggleContratto(nome)} />
                    {nome}
                  </label>
                ))}
              </div>
          }
        </div>

        <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
          <button onClick={onClose} style={{ padding: "10px 20px", borderRadius: "10px", border: "1px solid #dadce0", background: "#f1f3f4", cursor: "pointer", fontSize: "13px" }}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: "10px 20px", borderRadius: "10px", border: "none", background: saving ? "#a78bfa" : "#7c3aed", color: "#fff", cursor: saving ? "not-allowed" : "pointer", fontSize: "13px", fontWeight: 600 }}>
            {saving ? "Salvataggio..." : "Salva Permessi"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Pannello configurazione permessi per app per ruolo ─────────────────────────

const KNOWN_APPS = [
  { id: "mev",               label: "MEV" },
  { id: "mevcap",            label: "MEV-CAP" },
  { id: "contratti",         label: "Contratti TOW" },
  { id: "contratti_interni", label: "Contratti Interni" },
  { id: "chart",             label: "Grafici" },
  { id: "reportavanzamenti", label: "Report Avanzamenti" },
  { id: "ordini",            label: "Ordini Consegna" },
  { id: "consumotow",        label: "Consumo TOW" },
  { id: "tools",             label: "Tools" },
  { id: "gara",              label: "Gare" },
  { id: "configuratore",     label: "Configuratore" },
];
const KNOWN_ROLES = ["Admin", "Editor", "Client", "Developer", "Bid Manager"];

const ROLE_COLORS = {
  Admin:         { bg: "#fff7ed", fg: "#c2410c", border: "#fed7aa" },
  Editor:        { bg: "#eff6ff", fg: "#1d4ed8", border: "#bfdbfe" },
  Client:        { bg: "#faf5ff", fg: "#7e22ce", border: "#e9d5ff" },
  Developer:     { bg: "#f0fdf4", fg: "#15803d", border: "#bbf7d0" },
  "Bid Manager": { bg: "#fefce8", fg: "#854d0e", border: "#fde68a" },
};

function AppPermissionsPanel() {
  // matrix[appId][role] = { canView, canEdit }
  const [matrix, setMatrix]   = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [saved, setSaved]     = useState(false);
  const [err, setErr]         = useState("");

  useEffect(() => {
    getAppRolePermissions().then(rows => {
      const m = {};
      for (const app of KNOWN_APPS) {
        m[app.id] = {};
        for (const role of KNOWN_ROLES) {
          const r = rows.find(x => x.appId === app.id && x.role === role);
          m[app.id][role] = { canView: r?.canView ?? true, canEdit: r?.canEdit ?? true };
        }
      }
      setMatrix(m);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const toggle = useCallback((appId, role, field) => {
    setMatrix(prev => {
      const cur = prev[appId]?.[role] ?? { canView: true, canEdit: true };
      let next = { ...cur, [field]: !cur[field] };
      // canEdit implica canView
      if (field === "canEdit" && next.canEdit) next.canView = true;
      // se canView=false, canEdit deve essere false
      if (field === "canView" && !next.canView) next.canEdit = false;
      return { ...prev, [appId]: { ...prev[appId], [role]: next } };
    });
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true); setErr(""); setSaved(false);
    const perms = [];
    for (const app of KNOWN_APPS)
      for (const role of KNOWN_ROLES) {
        const p = matrix[app.id]?.[role] ?? { canView: true, canEdit: true };
        perms.push({ appId: app.id, role, canView: p.canView, canEdit: p.canEdit });
      }
    try {
      await putAppRolePermissions(perms);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e) {
      setErr(e.message || "Errore salvataggio.");
    } finally {
      setSaving(false);
    }
  }, [matrix]);

  if (loading) return (
    <div style={{ padding: 40, color: "#68758A", fontSize: 14 }}>Caricamento permessi…</div>
  );

  return (
    <div style={{ background: "#fff", border: "1px solid #E3E8EF", borderRadius: 16, padding: 28, boxShadow: "0 2px 12px rgba(30,50,80,0.04)" }}>
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: "1.4px", color: "#718097", marginBottom: 8 }}>PERMESSI APPLICATIVI</div>
        <h4 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#243247" }}>Configurazione accessi per sotto-applicazione</h4>
        <p style={{ margin: "6px 0 0", color: "#68758A", fontSize: 13 }}>
          Definisci quale ruolo può <strong>visualizzare</strong> (accedere ai dati) e <strong>modificare</strong> (salvare dati) in ogni app.
          SuperAdmin ha sempre accesso completo e non è configurabile. Disattivare "Visualizza" disattiva anche "Modifica".
        </p>
      </div>

      {err && (
        <div style={{ background: "#fff1f2", border: "1px solid #fecdd3", borderLeft: "4px solid #e11d48", color: "#9f1239", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          {err}
        </div>
      )}
      {saved && (
        <div style={{ background: "#ecfdf5", border: "1px solid #a7f3d0", borderLeft: "4px solid #059669", color: "#065f46", padding: "12px 16px", borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          Permessi salvati con successo.
        </div>
      )}

      {/* Tabella matrice */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: "10px 14px", color: "#526079", fontWeight: 700, fontSize: 12, borderBottom: "2px solid #E3E8EF", background: "#F8FAFC", minWidth: 160 }}>
                App / Funzione
              </th>
              {KNOWN_ROLES.map(role => {
                const c = ROLE_COLORS[role] || { bg: "#f8f9fa", fg: "#526079", border: "#e2e8f0" };
                return (
                  <th key={role} colSpan={2} style={{ textAlign: "center", padding: "8px 10px", borderBottom: "2px solid #E3E8EF", background: "#F8FAFC" }}>
                    <span style={{ display: "inline-block", padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 700, background: c.bg, color: c.fg, border: `1px solid ${c.border}` }}>
                      {role}
                    </span>
                  </th>
                );
              })}
            </tr>
            <tr>
              <th style={{ padding: "4px 14px 10px", background: "#F8FAFC" }} />
              {KNOWN_ROLES.map(role => (
                <>
                  <th key={`${role}-v`} style={{ padding: "4px 8px 10px", background: "#F8FAFC", textAlign: "center", color: "#526DAB", fontSize: 11, fontWeight: 600 }}>Vista</th>
                  <th key={`${role}-e`} style={{ padding: "4px 8px 10px", background: "#F8FAFC", textAlign: "center", color: "#C48A39", fontSize: 11, fontWeight: 600 }}>Modifica</th>
                </>
              ))}
            </tr>
          </thead>
          <tbody>
            {KNOWN_APPS.map((app, idx) => (
              <tr key={app.id} style={{ background: idx % 2 === 0 ? "#FAFBFD" : "#fff" }}>
                <td style={{ padding: "12px 14px", fontWeight: 600, color: "#243247", borderBottom: "1px solid #EDF0F5" }}>
                  {app.label}
                </td>
                {KNOWN_ROLES.map(role => {
                  const p = matrix[app.id]?.[role] ?? { canView: true, canEdit: true };
                  return (
                    <>
                      <td key={`${role}-v`} style={{ textAlign: "center", padding: "12px 8px", borderBottom: "1px solid #EDF0F5" }}>
                        <input type="checkbox" checked={p.canView}
                          onChange={() => toggle(app.id, role, "canView")}
                          style={{ width: 16, height: 16, accentColor: "#526DAB", cursor: "pointer" }} />
                      </td>
                      <td key={`${role}-e`} style={{ textAlign: "center", padding: "12px 8px", borderBottom: "1px solid #EDF0F5" }}>
                        <input type="checkbox" checked={p.canEdit} disabled={!p.canView}
                          onChange={() => toggle(app.id, role, "canEdit")}
                          style={{ width: 16, height: 16, accentColor: "#C48A39", cursor: p.canView ? "pointer" : "default",
                            opacity: p.canView ? 1 : 0.35 }} />
                      </td>
                    </>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
        <button type="button" onClick={handleSave} disabled={saving}
          style={{ padding: "11px 28px", background: saving ? "#7ca8d8" : "#1A6EBD", color: "#fff", border: "none",
            borderRadius: 10, fontWeight: 700, fontSize: 14, cursor: saving ? "wait" : "pointer",
            boxShadow: "0 2px 8px rgba(26,110,189,0.2)" }}>
          {saving ? "Salvataggio…" : "Salva permessi"}
        </button>
      </div>
    </div>
  );
}

export default AdminPage;
