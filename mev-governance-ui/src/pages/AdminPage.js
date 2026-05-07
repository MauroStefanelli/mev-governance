import { useEffect, useState } from "react";
import { getUsers, createUser, toggleUser, resetPassword, deleteUser } from "../services/mevService";

function AdminPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ username: "", fullName: "", email: "", password: "" });
  const [newPasswords, setNewPasswords] = useState({});
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

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
      setForm({ username: "", fullName: "", email: "", password: "" });
      notify("Utente creato");
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleToggle = async (id) => {
    try {
      await toggleUser(id);
      loadUsers();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleResetPassword = async (id) => {
    const pwd = newPasswords[id];
    if (!pwd || pwd.length < 4) { setError("Password troppo corta (min 4 caratteri)"); return; }
    try {
      await resetPassword(id, pwd);
      setNewPasswords((prev) => ({ ...prev, [id]: "" }));
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

  return (
    <div style={{ padding: "20px", maxWidth: "900px" }}>
      <h3>Gestione Utenti</h3>

      {error && (
        <div style={{ background: "#fff0f0", border: "1px solid #ffcccc", color: "#cc0000", padding: "8px 12px", borderRadius: "4px", marginBottom: "12px", fontSize: "13px" }}>
          {error} <button onClick={() => setError("")} style={{ float: "right", border: "none", background: "none", cursor: "pointer", fontWeight: "bold" }}>×</button>
        </div>
      )}
      {success && (
        <div style={{ background: "#d4edda", border: "1px solid #c3e6cb", color: "#155724", padding: "8px 12px", borderRadius: "4px", marginBottom: "12px", fontSize: "13px" }}>
          {success}
        </div>
      )}

      {/* Form nuovo utente */}
      <div style={{ background: "#f8f9fa", border: "1px solid #ddd", borderRadius: "6px", padding: "20px", marginBottom: "24px" }}>
        <h4 style={{ marginTop: 0 }}>Nuovo Utente</h4>
        <form onSubmit={handleCreate} style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "flex-end" }}>
          {[
            { label: "Username", key: "username", required: true },
            { label: "Nome Completo", key: "fullName", required: true },
            { label: "Email", key: "email" },
            { label: "Password", key: "password", type: "password", required: true }
          ].map(({ label, key, type = "text", required }) => (
            <div key={key}>
              <label style={{ display: "block", fontSize: "12px", marginBottom: "4px" }}>{label}</label>
              <input
                type={type}
                value={form[key]}
                onChange={(e) => setForm((p) => ({ ...p, [key]: e.target.value }))}
                required={required}
                style={{ padding: "6px 8px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "13px", width: "160px" }}
              />
            </div>
          ))}
          <button type="submit" style={{ padding: "6px 16px", background: "#1a73e8", color: "white", border: "none", borderRadius: "4px", cursor: "pointer", fontWeight: "bold" }}>
            Aggiungi
          </button>
        </form>
      </div>

      {/* Tabella utenti */}
      <table border="1" cellPadding="8" style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
        <thead style={{ background: "#f0f0f0" }}>
          <tr>
            <th>Username</th>
            <th>Nome</th>
            <th>Email</th>
            <th>Ruolo</th>
            <th>Stato</th>
            <th>Reset Password</th>
            <th>Azioni</th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id} style={{ background: u.isActive ? "white" : "#f8f8f8", color: u.isActive ? "inherit" : "#999" }}>
              <td><strong>{u.username}</strong></td>
              <td>{u.fullName}</td>
              <td>{u.email}</td>
              <td>{u.role}</td>
              <td style={{ textAlign: "center" }}>
                <span style={{
                  padding: "2px 8px", borderRadius: "12px", fontSize: "12px",
                  background: u.isActive ? "#d4edda" : "#f8d7da",
                  color: u.isActive ? "#155724" : "#721c24"
                }}>
                  {u.isActive ? "Attivo" : "Disattivo"}
                </span>
              </td>
              <td>
                {u.role !== "Admin" && (
                  <div style={{ display: "flex", gap: "6px" }}>
                    <input
                      type="password"
                      placeholder="Nuova password"
                      value={newPasswords[u.id] || ""}
                      onChange={(e) => setNewPasswords((p) => ({ ...p, [u.id]: e.target.value }))}
                      style={{ padding: "4px 6px", border: "1px solid #ccc", borderRadius: "4px", fontSize: "12px", width: "130px" }}
                    />
                    <button onClick={() => handleResetPassword(u.id)} style={{ padding: "4px 10px", fontSize: "12px", cursor: "pointer" }}>
                      Reset
                    </button>
                  </div>
                )}
              </td>
              <td style={{ textAlign: "center" }}>
                {u.role !== "Admin" && (
                  <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                    <button
                      onClick={() => handleToggle(u.id)}
                      style={{ padding: "4px 10px", fontSize: "12px", cursor: "pointer", background: u.isActive ? "#ffc107" : "#28a745", color: u.isActive ? "#000" : "#fff", border: "none", borderRadius: "4px" }}
                    >
                      {u.isActive ? "Disattiva" : "Attiva"}
                    </button>
                    <button
                      onClick={() => handleDelete(u.id, u.username)}
                      style={{ padding: "4px 10px", fontSize: "12px", cursor: "pointer", background: "#dc3545", color: "white", border: "none", borderRadius: "4px" }}
                    >
                      Elimina
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default AdminPage;
