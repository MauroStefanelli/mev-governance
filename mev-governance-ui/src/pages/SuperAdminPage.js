import React, { useState, useEffect } from "react";
import {
  getAllAmbienti, createAmbiente,
  getUsers, getAmbientiUtenti, addUtenteAmbiente, removeUtenteAmbiente
} from "../services/mevService";

export default function SuperAdminPage() {
  const [ambienti, setAmbienti]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  // Nuovo ambiente
  const [newCodice, setNewCodice]     = useState("");
  const [newDesc, setNewDesc]         = useState("");
  const [creating, setCreating]       = useState(false);

  // Utenti di un ambiente selezionato
  const [selectedAmbiente, setSelectedAmbiente] = useState(null);
  const [utentiAmbiente, setUtentiAmbiente]     = useState([]);
  const [allUsers, setAllUsers]                 = useState([]);
  const [addUserId, setAddUserId]               = useState("");
  const [addRuolo, setAddRuolo]                 = useState("Editor");
  const [addingUtente, setAddingUtente]         = useState(false);

  const load = async () => {
    setLoading(true);
    setError("");
    try {
      const [a, u] = await Promise.all([getAllAmbienti(), getUsers()]);
      setAmbienti(a);
      setAllUsers(u);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const loadUtenti = async (amb) => {
    setSelectedAmbiente(amb);
    try {
      const u = await getAmbientiUtenti(amb.id);
      setUtentiAmbiente(u);
    } catch (e) {
      setUtentiAmbiente([]);
    }
  };

  const handleCreateAmbiente = async () => {
    if (!newCodice.trim()) return;
    setCreating(true);
    try {
      await createAmbiente(newCodice.trim(), newDesc.trim());
      setNewCodice(""); setNewDesc("");
      await load();
    } catch (e) {
      alert("Errore creazione ambiente: " + e.message);
    } finally {
      setCreating(false);
    }
  };

  const handleAddUtente = async () => {
    if (!addUserId || !selectedAmbiente) return;
    setAddingUtente(true);
    try {
      await addUtenteAmbiente(selectedAmbiente.id, parseInt(addUserId), addRuolo);
      const u = await getAmbientiUtenti(selectedAmbiente.id);
      setUtentiAmbiente(u);
      setAddUserId("");
    } catch (e) {
      alert("Errore: " + e.message);
    } finally {
      setAddingUtente(false);
    }
  };

  const handleRemoveUtente = async (userId) => {
    if (!selectedAmbiente) return;
    try {
      await removeUtenteAmbiente(selectedAmbiente.id, userId);
      const u = await getAmbientiUtenti(selectedAmbiente.id);
      setUtentiAmbiente(u);
    } catch (e) {
      alert("Errore: " + e.message);
    }
  };

  const card = { background: "white", borderRadius: 10, padding: "20px 24px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", marginBottom: 20 };
  const th = { padding: "8px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#555", borderBottom: "2px solid #e8eaf6" };
  const td = { padding: "8px 12px", fontSize: 13, color: "#333", borderBottom: "1px solid #f1f3f4", verticalAlign: "middle" };

  if (loading) return <div style={{ padding: 32, color: "#666" }}>Caricamento...</div>;
  if (error)   return <div style={{ padding: 32, color: "#ea4335" }}>{error}</div>;

  return (
    <div style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px" }}>
      <h2 style={{ fontSize: 20, fontWeight: 700, color: "#1a73e8", marginBottom: 20 }}>Gestione Contratti</h2>

      {/* Crea nuovo contratto */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 12 }}>Crea nuovo Contratto</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Codice Contratto *</div>
            <input
              value={newCodice}
              onChange={e => setNewCodice(e.target.value)}
              placeholder="es. 4490015981"
              style={{ padding: "7px 10px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 13, width: 180 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Descrizione</div>
            <input
              value={newDesc}
              onChange={e => setNewDesc(e.target.value)}
              placeholder="es. Nuovo Progetto"
              style={{ padding: "7px 10px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 13, width: 240 }}
            />
          </div>
          <button
            onClick={handleCreateAmbiente}
            disabled={creating || !newCodice.trim()}
            style={{
              padding: "7px 20px", background: "#1a73e8", color: "white",
              border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: creating ? "wait" : "pointer", opacity: creating ? 0.7 : 1,
            }}
          >
            {creating ? "Creazione..." : "Crea"}
          </button>
        </div>
      </div>

      {/* Lista contratti */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 12 }}>Contratti Esistenti</div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={th}>ID</th>
              <th style={th}>Codice Contratto</th>
              <th style={th}>Descrizione</th>
              <th style={th}>Stato</th>
              <th style={th}>Creato il</th>
              <th style={th}>Utenti</th>
            </tr>
          </thead>
          <tbody>
            {ambienti.map(a => (
              <tr key={a.id}>
                <td style={td}>{a.id}</td>
                <td style={{ ...td, fontWeight: 600 }}>{a.codiceContratto}</td>
                <td style={td}>{a.descrizione}</td>
                <td style={td}>
                  <span style={{
                    padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                    background: a.isActive ? "#e6f4ea" : "#fce8e6",
                    color: a.isActive ? "#137333" : "#c5221f",
                  }}>
                    {a.isActive ? "Attivo" : "Disattivato"}
                  </span>
                </td>
                <td style={td}>{new Date(a.createdAt).toLocaleDateString("it-IT")}</td>
                <td style={td}>
                  <button
                    onClick={() => loadUtenti(a)}
                    style={{
                      padding: "4px 12px", background: "#e8f0fe", color: "#1a73e8",
                      border: "1px solid #c5d8fb", borderRadius: 6, fontSize: 12,
                      cursor: "pointer", fontWeight: 600,
                    }}
                  >
                    Gestisci
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Gestione utenti di un ambiente */}
      {selectedAmbiente && (
        <div style={card}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 4 }}>
            Utenti — <span style={{ color: "#1a73e8" }}>{selectedAmbiente.codiceContratto}</span>
          </div>
          <div style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>{selectedAmbiente.descrizione}</div>

          {/* Aggiungi utente */}
          <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Utente</div>
              <select
                value={addUserId}
                onChange={e => setAddUserId(e.target.value)}
                style={{ padding: "7px 10px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 13 }}
              >
                <option value="">-- seleziona --</option>
                {allUsers
                  .filter(u => !utentiAmbiente.some(ua => ua.userId === u.id))
                  .map(u => (
                    <option key={u.id} value={u.id}>{u.username} — {u.fullName}</option>
                  ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Ruolo</div>
              <select
                value={addRuolo}
                onChange={e => setAddRuolo(e.target.value)}
                style={{ padding: "7px 10px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 13 }}
              >
                <option>Admin</option>
                <option>Editor</option>
              </select>
            </div>
            <button
              onClick={handleAddUtente}
              disabled={addingUtente || !addUserId}
              style={{
                padding: "7px 20px", background: "#1a73e8", color: "white",
                border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
                cursor: addingUtente ? "wait" : "pointer", opacity: addingUtente ? 0.7 : 1,
              }}
            >
              Aggiungi
            </button>
          </div>

          {/* Lista utenti */}
          {utentiAmbiente.length === 0
            ? <div style={{ color: "#888", fontSize: 13 }}>Nessun utente associato a questo ambiente.</div>
            : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Username</th>
                    <th style={th}>Nome</th>
                    <th style={th}>Email</th>
                    <th style={th}>Ruolo Ambiente</th>
                    <th style={th}></th>
                  </tr>
                </thead>
                <tbody>
                  {utentiAmbiente.map(ua => (
                    <tr key={ua.id}>
                      <td style={{ ...td, fontWeight: 600 }}>{ua.username}</td>
                      <td style={td}>{ua.fullName}</td>
                      <td style={td}>{ua.email}</td>
                      <td style={td}>
                        <span style={{
                          padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600,
                          background: ua.ruolo === "Admin" ? "#e8f0fe" : "#f1f3f4",
                          color: ua.ruolo === "Admin" ? "#1a73e8" : "#555",
                        }}>
                          {ua.ruolo}
                        </span>
                      </td>
                      <td style={td}>
                        <button
                          onClick={() => handleRemoveUtente(ua.userId)}
                          style={{
                            padding: "3px 10px", background: "#fce8e6", color: "#c5221f",
                            border: "1px solid #f5c6c2", borderRadius: 6, fontSize: 12,
                            cursor: "pointer",
                          }}
                        >
                          Rimuovi
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}
