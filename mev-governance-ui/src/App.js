import React, { useState, useEffect } from "react";
import MevPage from "./pages/MevPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import ChartPage from "./pages/ChartPage";
import ContrattiPage from "./pages/ContrattiPage";
import ContrattiInterniPage from "./pages/ContrattiInterniPage";
import { getMevList, getLastAlign, changeMyPassword } from "./services/mevService";

function App() {
  const [token, setToken]           = useState(localStorage.getItem("jwt") || "");
  const [username, setUsername]     = useState(localStorage.getItem("XUSER") || "");
  const [fullName, setFullName]     = useState(localStorage.getItem("fullName") || "");
  const [role, setRole]             = useState(localStorage.getItem("role") || "");
  const [page, setPage]             = useState("mev");
  const [rows, setRows]             = useState([]); // eslint-disable-line no-unused-vars
  const [filteredRows, setFilteredRows] = useState([]);
  const [lastAlign, setLastAlign]   = useState(null);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [pwdOld, setPwdOld]         = useState("");
  const [pwdNew, setPwdNew]         = useState("");
  const [pwdNew2, setPwdNew2]       = useState("");
  const [pwdError, setPwdError]     = useState("");
  const [pwdSaving, setPwdSaving]   = useState(false);

  useEffect(() => {
    if (token) {
      getMevList().then(setRows).catch(() => {});
      getLastAlign().then(d => setLastAlign(d.lastAlignAt)).catch(() => {});
    }
  }, [token]);

  const handleLogin = (data) => {
    setToken(data.token);
    setUsername(data.username);
    setFullName(data.fullName);
    setRole(data.role);
    setPage("mev");
  };

  const handleLogout = () => {
    ["jwt", "XUSER", "fullName", "role"].forEach((k) => localStorage.removeItem(k));
    setToken(""); setUsername(""); setFullName(""); setRole("");
    setRows([]); setFilteredRows([]); setPage("mev"); setLastAlign(null);
  };

  const handleChangePassword = async () => {
    setPwdError("");
    if (!pwdOld || !pwdNew || !pwdNew2) { setPwdError("Compila tutti i campi"); return; }
    if (pwdNew !== pwdNew2) { setPwdError("Le nuove password non coincidono"); return; }
    if (pwdNew.length < 6)  { setPwdError("La nuova password deve avere almeno 6 caratteri"); return; }
    setPwdSaving(true);
    try {
      await changeMyPassword(pwdOld, pwdNew);
      setShowPwdModal(false); setPwdOld(""); setPwdNew(""); setPwdNew2(""); setPwdError("");
      alert("Password aggiornata con successo");
    } catch (e) {
      setPwdError(e.message || "Errore durante il cambio password");
    } finally {
      setPwdSaving(false);
    }
  };

  if (!token) return <LoginPage onLogin={handleLogin} />;

  const navItems = [
    { id: "mev",               label: "MEV" },
    { id: "contratti",         label: "Contratti" },
    { id: "contratti_interni", label: "Ordini" },
    { id: "chart",             label: "Grafici" },
    ...(role === "Admin" ? [
      { id: "admin", label: "Utenti" },
    ] : []),
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f8f9fa" }}>
      <header style={{
        background: "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)",
        boxShadow: "0 2px 8px rgba(0,0,0,0.18)",
        padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: "56px", position: "sticky", top: 0, zIndex: 100,
      }}>
        {/* Logo + titolo */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <img
            src="/logo_poste.svg"
            alt="Poste Italiane"
            style={{ height: "40px", width: "auto" }}
          />
          <span style={{ color: "white", fontWeight: 700, fontSize: "17px", letterSpacing: "0.3px" }}>
            MEV Governance
          </span>
          {lastAlign && (
            <span style={{
              color: "rgba(255,255,255,0.75)", fontSize: "11px", fontWeight: 400,
              borderLeft: "1px solid rgba(255,255,255,0.3)", paddingLeft: "12px", marginLeft: "4px"
            }}>
              Aggiornato: {new Date(lastAlign).toLocaleString("it-IT", {
                day: "2-digit", month: "2-digit", year: "numeric",
                hour: "2-digit", minute: "2-digit"
              })}
            </span>
          )}
        </div>

        {/* Nav */}
        <nav style={{ display: "flex", alignItems: "center", gap: "4px" }}>
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setPage(id)}
              style={{
                background: page === id ? "rgba(255,255,255,0.22)" : "transparent",
                color: "white",
                border: page === id ? "1px solid rgba(255,255,255,0.4)" : "1px solid transparent",
                cursor: "pointer",
                padding: "6px 16px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: page === id ? 600 : 400,
                transition: "background 0.15s",
              }}
              onMouseEnter={(e) => { if (page !== id) e.currentTarget.style.background = "rgba(255,255,255,0.1)"; }}
              onMouseLeave={(e) => { if (page !== id) e.currentTarget.style.background = "transparent"; }}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Utente + cambio password + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "white", fontSize: "13px", fontWeight: 600 }}>{fullName || username}</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "11px" }}>{role}</div>
          </div>
          <button
            onClick={() => { setShowPwdModal(true); setPwdOld(""); setPwdNew(""); setPwdNew2(""); setPwdError(""); }}
            title="Cambia password"
            style={{
              background: "rgba(255,255,255,0.12)", color: "white",
              border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer",
              padding: "6px 10px", borderRadius: "6px", fontSize: "14px",
            }}
          >🔑</button>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.12)", color: "white",
              border: "1px solid rgba(255,255,255,0.3)", cursor: "pointer",
              padding: "6px 14px", borderRadius: "6px", fontSize: "12px", fontWeight: 500,
            }}
          >Esci</button>
        </div>
      </header>

      {/* ── Modale cambio password ── */}
      {showPwdModal && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "white", borderRadius: "12px", padding: "28px 32px",
            width: "360px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a73e8", marginBottom: "20px" }}>
              Cambia Password
            </div>
            {[
              { label: "Password attuale", val: pwdOld, set: setPwdOld },
              { label: "Nuova password",   val: pwdNew, set: setPwdNew },
              { label: "Conferma nuova",   val: pwdNew2, set: setPwdNew2 },
            ].map(({ label, val, set }) => (
              <div key={label} style={{ marginBottom: "14px" }}>
                <div style={{ fontSize: "12px", color: "#555", marginBottom: "4px" }}>{label}</div>
                <input
                  type="password" value={val}
                  onChange={e => set(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleChangePassword()}
                  style={{
                    width: "100%", padding: "8px 10px", border: "1px solid #dadce0",
                    borderRadius: "6px", fontSize: "13px", boxSizing: "border-box",
                  }}
                />
              </div>
            ))}
            {pwdError && (
              <div style={{ fontSize: "12px", color: "#ea4335", marginBottom: "12px" }}>{pwdError}</div>
            )}
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setShowPwdModal(false)}
                style={{
                  padding: "8px 18px", borderRadius: "6px", border: "1px solid #dadce0",
                  background: "#f1f3f4", color: "#444", cursor: "pointer", fontSize: "13px",
                }}
              >Annulla</button>
              <button
                onClick={handleChangePassword}
                disabled={pwdSaving}
                style={{
                  padding: "8px 18px", borderRadius: "6px", border: "none",
                  background: "#1a73e8", color: "white", cursor: "pointer",
                  fontSize: "13px", fontWeight: 600, opacity: pwdSaving ? 0.7 : 1,
                }}
              >{pwdSaving ? "Salvataggio..." : "Salva"}</button>
            </div>
          </div>
        </div>
      )}

      <main style={{ padding: "0" }}>
        {page === "mev"               && <MevPage onUnauthorized={handleLogout} onRowsChange={setRows} onFilteredRowsChange={setFilteredRows} onAligned={() => getLastAlign().then(d => setLastAlign(d.lastAlignAt)).catch(() => {})} />}
        {page === "contratti"         && <ContrattiPage onUnauthorized={handleLogout} />}
        {page === "chart"             && <ChartPage rows={filteredRows} />}
        {page === "contratti_interni" && <ContrattiInterniPage onUnauthorized={handleLogout} />}
        {page === "admin"             && role === "Admin" && <AdminPage />}
      </main>
    </div>
  );
}

export default App;
