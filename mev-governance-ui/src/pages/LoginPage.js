import { useState } from "react";
import { login } from "../services/mevService";

function LoginPage({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data = await login(username, password);
      localStorage.setItem("jwt", data.token);
      localStorage.setItem("XUSER", data.username);
      localStorage.setItem("fullName", data.fullName);
      localStorage.setItem("role", data.role);
      onLogin(data);
    } catch (err) {
      setError("Credenziali non valide");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: "100vh",
      background: "#f4f6f8"
    }}>
      <div style={{
        background: "white",
        padding: "40px",
        borderRadius: "8px",
        boxShadow: "0 2px 12px rgba(0,0,0,0.12)",
        width: "340px"
      }}>
        <h2 style={{ marginBottom: "8px", textAlign: "center" }}>MEV Governance</h2>
        <p style={{ textAlign: "center", color: "#666", marginBottom: "28px", fontSize: "14px" }}>
          Accedi con le tue credenziali
        </p>

        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "bold" }}>
              Username
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              autoFocus
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>

          <div style={{ marginBottom: "24px" }}>
            <label style={{ display: "block", marginBottom: "6px", fontSize: "13px", fontWeight: "bold" }}>
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              style={{
                width: "100%",
                padding: "8px 10px",
                border: "1px solid #ccc",
                borderRadius: "4px",
                fontSize: "14px",
                boxSizing: "border-box"
              }}
            />
          </div>

          {error && (
            <div style={{
              background: "#fff0f0",
              border: "1px solid #ffcccc",
              color: "#cc0000",
              padding: "8px 12px",
              borderRadius: "4px",
              marginBottom: "16px",
              fontSize: "13px"
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              padding: "10px",
              background: loading ? "#aaa" : "#1a73e8",
              color: "white",
              border: "none",
              borderRadius: "4px",
              fontSize: "14px",
              fontWeight: "bold",
              cursor: loading ? "not-allowed" : "pointer"
            }}
          >
            {loading ? "Accesso in corso..." : "Accedi"}
          </button>
        </form>
      </div>
    </div>
  );
}

export default LoginPage;
