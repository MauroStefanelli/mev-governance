import React, { useState, useEffect } from "react";
import MevPage from "./pages/MevPage";
import LoginPage from "./pages/LoginPage";
import AdminPage from "./pages/AdminPage";
import ChartPage from "./pages/ChartPage";
import ContrattiPage from "./pages/ContrattiPage";
import ContrattiInterniPage from "./pages/ContrattiInterniPage";
import { getMevList, getLastAlign } from "./services/mevService";

function App() {
  const [token, setToken]           = useState(localStorage.getItem("jwt") || "");
  const [username, setUsername]     = useState(localStorage.getItem("XUSER") || "");
  const [fullName, setFullName]     = useState(localStorage.getItem("fullName") || "");
  const [role, setRole]             = useState(localStorage.getItem("role") || "");
  const [page, setPage]             = useState("mev");
  const [rows, setRows]             = useState([]); // eslint-disable-line no-unused-vars
  const [filteredRows, setFilteredRows] = useState([]);
  const [lastAlign, setLastAlign]   = useState(null);

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

  if (!token) return <LoginPage onLogin={handleLogin} />;

  const navItems = [
    { id: "mev",               label: "MEV" },
    { id: "contratti",         label: "Contratti" },
    { id: "chart",             label: "Grafici" },
    ...(role === "Admin" ? [
      { id: "contratti_interni", label: "Ordini" },
      { id: "admin",             label: "Utenti" },
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
            src="https://www.posteitaliane.it/assets/img/logo-poste.svg"
            alt="Poste Italiane"
            style={{ height: "28px", width: "auto", filter: "brightness(0) invert(1)" }}
            onError={(e) => { e.currentTarget.style.display = "none"; }}
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

        {/* Utente + logout */}
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "white", fontSize: "13px", fontWeight: 600 }}>{fullName || username}</div>
            <div style={{ color: "rgba(255,255,255,0.65)", fontSize: "11px" }}>{role}</div>
          </div>
          <button
            onClick={handleLogout}
            style={{
              background: "rgba(255,255,255,0.12)",
              color: "white",
              border: "1px solid rgba(255,255,255,0.3)",
              cursor: "pointer",
              padding: "6px 14px",
              borderRadius: "6px",
              fontSize: "12px",
              fontWeight: 500,
            }}
          >
            Esci
          </button>
        </div>
      </header>

      <main style={{ padding: "0" }}>
        {page === "mev"               && <MevPage onUnauthorized={handleLogout} onRowsChange={setRows} onFilteredRowsChange={setFilteredRows} onAligned={() => getLastAlign().then(d => setLastAlign(d.lastAlignAt)).catch(() => {})} />}
        {page === "contratti"         && <ContrattiPage onUnauthorized={handleLogout} />}
        {page === "chart"             && <ChartPage rows={filteredRows} />}
        {page === "contratti_interni" && role === "Admin" && <ContrattiInterniPage onUnauthorized={handleLogout} />}
        {page === "admin"             && role === "Admin" && <AdminPage />}
      </main>
    </div>
  );
}

export default App;
