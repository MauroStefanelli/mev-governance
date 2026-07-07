import React, { useState, useEffect } from "react";
import { getDbConfig, setDbConfig, testDbConnection, restartBackend } from "../services/mevService";

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

export default function DbConfigPage() {
  const [provider, setProvider] = useState("sqlite");
  const [sqlitePath, setSqlitePath] = useState("/data/mev.db");
  const [host, setHost] = useState("");
  const [port, setPort] = useState("5432");
  const [database, setDatabase] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
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
        setPasswordSet(cfg.passwordSet || false);
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
  });

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      const result = await setDbConfig(buildBody());
      if (password) setPasswordSet(true);
      setMessageType("success");
      setMessage(result.message || "Configurazione salvata");
    } catch (e) {
      setError(e.message || "Errore salvataggio");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    setMessage(null);
    setError(null);
    try {
      const result = await testDbConnection(buildBody());
      if (result.success) {
        setMessageType("success");
        setMessage(result.message || "Connessione riuscita");
      } else {
        setMessageType("error");
        setMessage(result.message || "Connessione fallita");
      }
    } catch (e) {
      setMessageType("error");
      setMessage(e.message || "Errore test connessione");
    } finally {
      setTesting(false);
    }
  };

  const handleRestart = async () => {
    if (!confirmRestart) {
      setConfirmRestart(true);
      return;
    }
    setRestarting(true);
    setMessage(null);
    setError(null);
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
    } finally {
      setRestarting(false);
    }
  };

  return (
    <div style={{
      maxWidth: "600px", margin: "40px auto", background: "#fff",
      borderRadius: "12px", padding: "28px 32px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
    }}>
      <h2 style={{ margin: "0 0 24px 0", fontSize: "18px", color: "#1a1a1a" }}>
        Configurazione Database
      </h2>

      {/* Banner: configurazione da variabile d'ambiente */}
      {readonlyEnv && (
        <div style={{
          padding: "12px 16px", borderRadius: "8px", marginBottom: "20px",
          background: "#e8f0fe", color: "#1a73e8", fontSize: "13px",
          border: "1px solid #c5d9fb", lineHeight: "1.5"
        }}>
          <strong>Database configurato tramite variabile d'ambiente</strong><br />
          I dati mostrati sono in sola lettura. Per modificare la connessione,
          aggiorna la variabile <code>DATABASE_DIRECT_URL</code> su Render.
        </div>
      )}

      {message && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
          background: messageType === "success" ? "#e8f5e9" : "#fce4ec",
          color: messageType === "success" ? "#2e7d32" : "#c62828",
          fontSize: "13px",
          border: messageType === "success" ? "1px solid #c8e6c9" : "1px solid #f8bbd0"
        }}>
          {message}
        </div>
      )}

      {error && (
        <div style={{
          padding: "10px 14px", borderRadius: "8px", marginBottom: "16px",
          background: "#fce4ec", color: "#c62828", fontSize: "13px", border: "1px solid #f8bbd0"
        }}>
          {error}
        </div>
      )}

      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "20px" }}>

        <div style={{ display: "flex", gap: "12px" }}>
          <div
            onClick={() => !readonlyEnv && setProvider("sqlite")}
            style={{ ...radioStyle, flex: 1, borderColor: provider === "sqlite" ? "#1a73e8" : "#dadce0", background: provider === "sqlite" ? "#f0f6ff" : "#fff", opacity: readonlyEnv ? 0.6 : 1, cursor: readonlyEnv ? "default" : "pointer" }}
          >
            <input type="radio" checked={provider === "sqlite"} onChange={() => {}} readOnly />
            <span style={{ fontWeight: provider === "sqlite" ? 600 : 400 }}>SQLite</span>
            <span style={{ fontSize: "11px", color: "#888" }}>(locale)</span>
          </div>
          <div
            onClick={() => !readonlyEnv && setProvider("postgresql")}
            style={{ ...radioStyle, flex: 1, borderColor: provider === "postgresql" ? "#1a73e8" : "#dadce0", background: provider === "postgresql" ? "#f0f6ff" : "#fff", opacity: readonlyEnv ? 0.6 : 1, cursor: readonlyEnv ? "default" : "pointer" }}
          >
            <input type="radio" checked={provider === "postgresql"} onChange={() => {}} readOnly />
            <span style={{ fontWeight: provider === "postgresql" ? 600 : 400 }}>PostgreSQL</span>
            <span style={{ fontSize: "11px", color: "#888" }}>(remoto)</span>
          </div>
        </div>

        {provider === "sqlite" && (
          <div style={fieldStyle}>
            <label style={labelStyle}>Percorso file database</label>
            <input style={{ ...inputStyle, background: readonlyEnv ? "#f8f9fa" : "#fff" }} value={sqlitePath} onChange={e => setSqlitePath(e.target.value)} readOnly={readonlyEnv} />
          </div>
        )}

        {provider === "postgresql" && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 100px", gap: "12px" }}>
              <div style={fieldStyle}>
                <label style={labelStyle}>Host</label>
                <input style={{ ...inputStyle, background: readonlyEnv ? "#f8f9fa" : "#fff" }} value={host} onChange={e => setHost(e.target.value)} placeholder="192.168.1.x o dominio" readOnly={readonlyEnv} />
              </div>
              <div style={fieldStyle}>
                <label style={labelStyle}>Porta</label>
                <input style={{ ...inputStyle, background: readonlyEnv ? "#f8f9fa" : "#fff" }} value={port} onChange={e => setPort(e.target.value)} readOnly={readonlyEnv} />
              </div>
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Nome database</label>
              <input style={{ ...inputStyle, background: readonlyEnv ? "#f8f9fa" : "#fff" }} value={database} onChange={e => setDatabase(e.target.value)} readOnly={readonlyEnv} />
            </div>
            <div style={fieldStyle}>
              <label style={labelStyle}>Utente</label>
              <input style={{ ...inputStyle, background: readonlyEnv ? "#f8f9fa" : "#fff" }} value={username} onChange={e => setUsername(e.target.value)} readOnly={readonlyEnv} />
            </div>
            {!readonlyEnv && (
              <div style={fieldStyle}>
                <label style={labelStyle}>
                  Password {passwordSet ? <span style={{ fontWeight: 400, color: "#888", textTransform: "none" }}>(lasciare vuoto per non cambiare)</span> : ""}
                </label>
                <input style={inputStyle} type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={passwordSet ? "••••••••" : "Password"} />
              </div>
            )}
            {readonlyEnv && (
              <div style={fieldStyle}>
                <label style={labelStyle}>Password</label>
                <input style={{ ...inputStyle, background: "#f8f9fa" }} type="password" value="••••••••" readOnly />
              </div>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: "12px", alignItems: "center", paddingTop: "8px", flexWrap: "wrap" }}>
          {!readonlyEnv && (
            <button type="submit" disabled={saving} style={{
              background: "#1a73e8", color: "white", border: "none", padding: "10px 24px",
              borderRadius: "8px", fontSize: "13px", fontWeight: 600, cursor: "pointer",
              opacity: saving ? 0.6 : 1
            }}>
              {saving ? "Salvataggio..." : "Salva configurazione"}
            </button>
          )}
          <button type="button" onClick={handleTest} disabled={testing} style={{
            background: testing ? "#e0e0e0" : "#f5f5f5", color: "#333", border: "1px solid #dadce0",
            padding: "10px 24px", borderRadius: "8px", fontSize: "13px", fontWeight: 600,
            cursor: "pointer", opacity: testing ? 0.6 : 1
          }}>
            {testing ? "Test in corso..." : "Test connessione"}
          </button>
          {!readonlyEnv && (
            <span style={{ fontSize: "12px", color: "#999" }}>
              Il backend va riavviato per applicare le modifiche
            </span>
          )}
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
