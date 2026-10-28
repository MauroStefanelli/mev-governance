import React, { useState, useEffect } from "react";
import { getDbConfig, setDbConfig, testDbConnection, restartBackend, getAppSettings, setAppSettings, resetData } from "../services/mevService";

const fieldStyle = {
  display: "flex", flexDirection: "column", gap: "4px"
};

const labelStyle = {
  fontSize: "12px", fontWeight: 600, color: "#555", textTransform: "uppercase", letterSpacing: "0.3px"
};

const inputStyle = {
  padding: "8px 10px", borderRadius: "6px", border: "1px solid #dadce0",
  fontSize: "13px", outline: "none", transition: "border 0.15s",
  background: "#fff"
};

const radioStyle = {
  display: "flex", alignItems: "center", gap: "8px",
  padding: "10px 16px", borderRadius: "8px", border: "1px solid #dadce0",
  cursor: "pointer", fontSize: "13px", background: "#fff"
};

// ── Tab: Configurazione Database ─────────────────────────────────────────────
function DbConfigTab() {
  const [provider, setProvider] = useState("sqlite");
  const [sqlitePath, setSqlitePath] = useState("/data/mev.db");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [sslMode, setSslMode] = useState("disable");
  const [passwordSet, setPasswordSet] = useState(false);
  const [isRender, setIsRender] = useState(false);
  const [readonlyEnv, setReadonlyEnv] = useState(false);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [confirmRestart, setConfirmRestart] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("success");
  const [error, setError] = useState(null);

  useEffect(() => {
    getDbConfig()
      .then(cfg => {
        setProvider(cfg.provider || "sqlite");
        setSqlitePath(cfg.sqlitePath || "/data/mev.db");
        setHost(cfg.host || "");
        setPort(cfg.port ? String(cfg.port) : "5432");
        setDatabase(cfg.database || "");
        setUsername(cfg.username || "");
        setSslMode(cfg.sslMode || "disable");
        setPasswordSet(cfg.passwordSet || false);
        setIsRender(cfg.isRender || false);
        setReadonlyEnv(cfg.readonlyEnv || false);
      })
      .catch(() => {});
  }, []);

  const buildBody = () => ({
    provider,
    sqlitePath: provider === "sqlite" ? sqlitePath : null,
    host: provider === "postgresql" ? host : null,
    port: provider === "postgresql" ? parseInt(port, 10) || 5432 : null,
    database: provider === "postgresql" ? database : null,
    username: provider === "postgresql" ? username : null,
    password: provider === "postgresql" ? password : null,
    sslMode: provider === "postgresql" ? sslMode : "disable",
    readonlyEnv: readonlyEnv,
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setMessage(null); setError(null);
    try {
      const result = await setDbConfig(buildBody());
      if (password) setPasswordSet(true);
      setMessageType("success");
      setMessage(result.message || "Configurazione salvata");
    } catch (e) {
      setError(e.message || "Errore salvataggio");
    } finally { setSaving(false); }
  };

  const handleTest = async () => {
    setTesting(true); setMessage(null); setError(null);
    try {
      const result = await testDbConnection(buildBody());
      setMessageType(result.success ? "success" : "error");
      setMessage(result.message || (result.success ? "Connessione riuscita" : "Connessione fallita"));
    } catch (e) {
      setMessageType("error");
      setMessage(e.message || "Errore test connessione");
    } finally { setTesting(false); }
  };

  const handleRestart = async () => {
    if (!confirmRestart) { setConfirmRestart(true); return; }
    setRestarting(true); setMessage(null); setError(null);
    try {
      const result = await restartBackend();
      setMessageType("success");
      setMessage(result.message || "Riavvio in corso...");
      setConfirmRestart(false);
      setTimeout(() => window.location.reload(), 3000);
    } catch (e) {
      setMessageType("error");
      setMessage(e.message || "Errore riavvio");
      setConfirmRestart(false);
    } finally { setRestarting(false); }
  };

  return (
    <div>
      {isRender && (
        <div style={{
          padding: "12px 16px", borderRadius: "8px", marginBottom: "20px",
          background: "#fff8e1", color: "#e65100", fontSize: "13px",
          border: "1px solid #ffcc80", lineHeight: "1.6"
        }}>
          <strong>Ambiente Render (cloud)</strong> — La configurazione salvata qui
          sovrascrive la variabile d'ambiente <code>DATABASE_DIRECT_URL</code>
          ma <strong>non persiste tra i deploy</strong>. Per una config permanente
          su Render, aggiorna <code>DATABASE_DIRECT_URL</code> dal pannello Render.
        </div>
      )}
      {!isRender && (
        <div style={{
          padding: "12px 16px", borderRadius: "8px", marginBottom: "20px",
          background: "#e8f5e9", color: "#2e7d32", fontSize: "13px",
          border: "1px solid #c8e6c9", lineHeight: "1.6"
        }}>
          <strong>Ambiente locale (QNAP)</strong> — La configurazione viene salvata
          in modo persistente su file. Puoi connetterti a PostgreSQL sul QNAP
          o su Supabase.
        </div>
      )}

      {message && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
          background: messageType === "success" ? "#e8f5e9" : "#fce4ec",
          color: messageType === "success" ? "#2e7d32" : "#c62828",
          fontSize: "13px",
          border: messageType === "success" ? "1px solid #c8e6c9" : "1px solid #f8bbd0"
        }}>{message}</div>
      )}

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
          background: "#fce4ec", color: "#c62828", fontSize: "13px", border: "1px solid #f8bbd0"
        }}>{error}</div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={{ display: "flex", gap: "12px" }}>
          <div onClick={() => setProvider("sqlite")}
            style={{ ...radioStyle, flex: 1, borderColor: provider === "sqlite" ? "#1a73e8" : "#dadce0", background: provider === "sqlite" ? "#f0f6ff" : "#fff" }}>
            <input type="radio" checked={provider === "sqlite"} onChange={() => {}} readOnly />
            <span style={{ fontWeight: provider === "sqlite" ? 600 : 400 }}>SQLite</span>
            <span style={{ fontSize: "11px", color: "#888" }}>(locale)</span>
          </div>
          <div onClick={() => setProvider("postgresql")}
            style={{ ...radioStyle, flex: 1, borderColor: provider === "postgresql" ? "#1a73e8" : "#dadce0", background: provider === "postgresql" ? "#f0f6ff" : "#fff" }}>
            <input type="radio" checked={provider === "postgresql"} onChange={() => {}} readOnly />
            <span style={{ fontWeight: provider === "postgresql" ? 600 : 400 }}>PostgreSQL</span>
            <span style={{ fontSize: "11px", color: "#888" }}>(QNAP / Supabase / Render)</span>
          </div>
        </div>

        {provider === "sqlite" && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Percorso file database</label>
            <input style={inputStyle} value={sqlitePath} onChange={e => setSqlitePath(e.target.value)} />
          </div>
        )}

        {provider === "postgresql" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: "12px" }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Host</label>
                <input style={inputStyle} value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.x, db.supabase.co, ..." />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Porta</label>
                <input style={inputStyle} value={port} onChange={e => setPort(e.target.value)} />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Nome database</label>
              <input style={inputStyle} value={database} onChange={e => setDatabase(e.target.value)} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Utente</label>
              <input style={inputStyle} value={username} onChange={e => setUsername(e.target.value)} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Modalità SSL</label>
              <div style={{ display: "flex", gap: "8px" }}>
                {[
                  { value: "disable", label: "Disabilitato", desc: "Nessun SSL (QNAP locale)" },
                  { value: "prefer",  label: "Automatico",   desc: "SSL se disponibile" },
                  { value: "require", label: "Richiesto",    desc: "Obbligatorio (Supabase/Render)" },
                ].map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setSslMode(opt.value)}
                    style={{
                      flex: 1, padding: "8px 12px", borderRadius: "7px",
                      border: `1px solid ${sslMode === opt.value ? "#1a73e8" : "#dadce0"}`,
                      background: sslMode === opt.value ? "#f0f6ff" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    <div style={{ fontSize: "12px", fontWeight: 600, color: sslMode === opt.value ? "#1a73e8" : "#333" }}>{opt.label}</div>
                    <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>{opt.desc}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>
                Password {passwordSet ? <span style={{ fontWeight: 400, color: "#888", textTransform: "none" }}>(lasciare vuoto per non cambiare)</span> : ""}
              </label>
              <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={passwordSet ? "••••••••" : "Password"} />
            </div>
          </>
        )}

        <div style={{ display: "flex", gap: "12px", alignItems: "center", paddingTop: "8px", flexWrap: "wrap" }}>
          <button type="submit" disabled={saving} style={{
            background: "#1a73e8", color: "white", border: "none", padding: "10px 24px",
            borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
            opacity: saving ? 0.6 : 1
          }}>
            {saving ? "Salvataggio..." : "Salva configurazione"}
          </button>
          <button type="button" onClick={handleTest} disabled={testing} style={{
            background: testing ? "#e0e0e0" : "#f5f5f5", color: "#333", border: "1px solid #dadce0",
            padding: "10px 24px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
            cursor: "pointer", opacity: testing ? 0.6 : 1
          }}>
            {testing ? "Test in corso..." : "Test connessione"}
          </button>
          <span style={{ fontSize: "12px", color: "#999" }}>
            Il backend va riavviato per applicare le modifiche
          </span>
          <button type="button" onClick={handleRestart} disabled={restarting} style={{
            background: confirmRestart ? "#d32f2f" : restarting ? "#e0e0e0" : "#f5f5f5",
            color: confirmRestart ? "white" : "#333",
            border: confirmRestart ? "none" : "1px solid #dadce0",
            padding: "10px 24px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
            cursor: "pointer", opacity: restarting ? 0.6 : 1,
            marginLeft: "auto"
          }}>
            {restarting ? "Riavvio..." : confirmRestart ? "Conferma riavvio?" : "Riavvia Backend"}
          </button>
        </div>
      </form>
    </div>
  );
}

// ── Tab: Impostazioni Applicazione ────────────────────────────────────────────
function AppSettingsTab() {
  const [logoutMinutes, setLogoutMinutes] = useState(60);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);
  const [messageType, setMessageType] = useState("success");

  // reset: 0=nessuno, 1=prima conferma, 2=seconda conferma
  const [resetStep, setResetStep] = useState(0);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    getAppSettings()
      .then(s => setLogoutMinutes(s.logoutMinutes ?? 60))
      .catch(() => {});
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true); setMessage(null);
    try {
      const result = await setAppSettings({ logoutMinutes: parseInt(logoutMinutes, 10) || 60 });
      setMessageType("success");
      setMessage(result.message || "Impostazioni salvate");
    } catch (err) {
      setMessageType("error");
      setMessage(err.message || "Errore salvataggio");
    } finally { setSaving(false); }
  };

  const handleReset = async () => {
    if (resetStep === 0) { setResetStep(1); return; }
    if (resetStep === 1) { setResetStep(2); return; }
    // step 2: esegui
    setResetting(true); setMessage(null);
    try {
      const result = await resetData();
      setMessageType("success");
      setMessage(result.message || "Dati eliminati con successo");
    } catch (err) {
      setMessageType("error");
      setMessage(err.message || "Errore durante il reset");
    } finally {
      setResetting(false);
      setResetStep(0);
    }
  };

  const resetLabels = [
    "Azzera dati DB",
    "Sei sicuro? Questa operazione è irreversibile",
    "Conferma eliminazione definitiva",
  ];

  return (
    <div>
      {message && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
          background: messageType === "success" ? "#e8f5e9" : "#fce4ec",
          color: messageType === "success" ? "#2e7d32" : "#c62828",
          fontSize: "13px",
          border: messageType === "success" ? "1px solid #c8e6c9" : "1px solid #f8bbd0"
        }}>{message}</div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
        <div style={fieldStyle}>
          <label style={labelStyle}>Minuti per il logout automatico</label>
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <input
              type="number"
              min="1"
              max="480"
              value={logoutMinutes}
              onChange={e => setLogoutMinutes(e.target.value)}
              style={{ ...inputStyle, width: "100px" }}
            />
            <span style={{ fontSize: "12px", color: "#888" }}>
              Minuti di inattività prima del logout automatico (default: 60)
            </span>
          </div>
        </div>

        <div style={{ paddingTop: "8px" }}>
          <button type="submit" disabled={saving} style={{
            background: "#1a73e8", color: "white", border: "none", padding: "10px 24px",
            borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
            opacity: saving ? 0.6 : 1
          }}>
            {saving ? "Salvataggio..." : "Salva impostazioni"}
          </button>
        </div>
      </form>

      {/* Separatore */}
      <div style={{ borderTop: "1px solid #e2e8f0", margin: "28px 0" }} />

      {/* Sezione reset */}
      <div>
        <div style={{ fontSize: "13px", fontWeight: 700, color: "#1a1a1a", marginBottom: "6px" }}>
          Reset dati operativi
        </div>
        <div style={{ fontSize: "12px", color: "#888", marginBottom: "16px", lineHeight: "1.6" }}>
          Elimina tutti i dati operativi (MEV, Contratti, Buoni Consegna, Consumi TOW).<br />
          Vengono preservati: utenti, storico accessi, configurazione DB e impostazioni.
        </div>

        {resetStep > 0 && (
          <div style={{
            padding: "12px 16px", borderRadius: "8px", marginBottom: "14px",
            background: "#fff3e0", color: "#e65100", fontSize: "13px",
            border: "1px solid #ffcc80", lineHeight: "1.5"
          }}>
            {resetStep === 1 && <>
              <strong>Attenzione:</strong> tutti i dati operativi verranno eliminati definitivamente e non potranno essere recuperati.
              Clicca di nuovo per confermare.
            </>}
            {resetStep === 2 && <>
              <strong>Ultima conferma:</strong> stai per eliminare tutti i dati. Questa operazione è irreversibile.
              Clicca di nuovo per procedere.
            </>}
          </div>
        )}

        <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
          <button
            type="button"
            onClick={handleReset}
            disabled={resetting}
            style={{
              background: resetStep === 0 ? "#f5f5f5" : resetStep === 1 ? "#fff3e0" : "#d32f2f",
              color: resetStep === 2 ? "white" : resetStep === 1 ? "#e65100" : "#333",
              border: resetStep === 2 ? "none" : `1px solid ${resetStep === 1 ? "#ffcc80" : "#dadce0"}`,
              padding: "10px 24px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
              cursor: resetting ? "not-allowed" : "pointer",
              opacity: resetting ? 0.6 : 1,
              transition: "background 0.2s, color 0.2s",
            }}
          >
            {resetting ? "Eliminazione in corso..." : resetLabels[resetStep]}
          </button>
          {resetStep > 0 && (
            <button
              type="button"
              onClick={() => setResetStep(0)}
              style={{
                background: "transparent", color: "#888", border: "none",
                fontSize: "12px", cursor: "pointer", textDecoration: "underline"
              }}
            >
              Annulla
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pagina principale con tab ─────────────────────────────────────────────────
export default function DbConfigPage() {
  const [activeTab, setActiveTab] = useState("dbconfig");

  const tabs = [
    { id: "appsettings", label: "Impostazioni Applicazione" },
    { id: "dbconfig",    label: "Configurazione Database" },
  ];

  return (
    <div style={{
      maxWidth: "640px", margin: "40px auto", background: "#fff",
      borderRadius: "12px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", overflow: "hidden"
    }}>
      {/* Tab bar */}
      <div style={{ display: "flex", borderBottom: "2px solid #e2e8f0" }}>
        {tabs.map(t => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            style={{
              flex: 1,
              padding: "14px 20px",
              fontSize: "13px",
              fontWeight: activeTab === t.id ? 700 : 400,
              color: activeTab === t.id ? "#1a73e8" : "#555",
              background: "white",
              border: "none",
              borderBottom: activeTab === t.id ? "2px solid #1a73e8" : "2px solid transparent",
              marginBottom: "-2px",
              cursor: "pointer",
              transition: "color 0.15s",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Contenuto tab */}
      <div style={{ padding: "28px 32px" }}>
        {activeTab === "appsettings" && <AppSettingsTab />}
        {activeTab === "dbconfig"    && <DbConfigTab />}
      </div>
    </div>
  );
}
