import React, { useState, useEffect } from "react";
import {
  getAllAmbienti, createAmbiente,
  getUsers, getAmbientiUtenti, addUtenteAmbiente, removeUtenteAmbiente, updateUtenteAmbienteRuolo,
  getConfiguratoreContracts, upsertConfiguratoreContract, updateConfiguratoreLot, deleteConfiguratoreContract
} from "../services/mevService";

export default function SuperAdminPage() {
  const [ambienti, setAmbienti]       = useState([]);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState("");

  // Nuovo ambiente
  const [newCodice, setNewCodice]     = useState("");
  const [newDesc, setNewDesc]         = useState("");
  const [creating, setCreating]       = useState(false);

  // ── Archivio configurazioni (Configuratore Offerta) ──
  const [archContracts, setArchContracts] = useState([]);
  const [archLoading, setArchLoading]     = useState(false);
  const [archExpanded, setArchExpanded]   = useState(null); // contractId espanso
  const [archMsg, setArchMsg]             = useState({ type: "", text: "" });
  // Form nuovo contratto configuratore
  const [ncName, setNcName]               = useState("");
  const [ncLots, setNcLots]               = useState(2);
  const [ncSaving, setNcSaving]           = useState(false);
  // Codici contratto per lotto (in modifica)
  const [lotCodes, setLotCodes]           = useState({}); // { "contractId|lotto": codiceContratto }
  const [savingLot, setSavingLot]         = useState({}); // { "contractId|lotto": bool }
  // Selezione ambiente MEV per riga lotto
  const [lotEnvSel, setLotEnvSel]         = useState({}); // { "contractId|lotto": ambienteId }

  // Utenti di un ambiente selezionato
  const [selectedAmbiente, setSelectedAmbiente] = useState(null);
  const [utentiAmbiente, setUtentiAmbiente]     = useState([]);
  const [allUsers, setAllUsers]                 = useState([]);
  const [addUserId, setAddUserId]               = useState("");
  const [addRuolo, setAddRuolo]                 = useState("Editor");
  const [addingUtente, setAddingUtente]         = useState(false);
  const [editingRuolo, setEditingRuolo]         = useState({}); // { [userId]: ruolo } — righe in modifica

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

  // ── Archivio configurazioni ──
  const loadArch = async () => {
    setArchLoading(true);
    try {
      const contracts = await getConfiguratoreContracts();
      setArchContracts(contracts);
      // Inizializza i codici da associare
      const codes = {};
      const envSel = {};
      contracts.forEach(c => {
        (c.lots || []).forEach(l => {
          const key = `${c.contractId}|${l.lotId}`;
          codes[key] = l.codiceContratto || "";
          if (l.codiceContratto) {
            const env = ambienti.find(a => a.codiceContratto === l.codiceContratto);
            envSel[key] = env ? env.id : "";
          }
        });
      });
      setLotCodes(codes);
      setLotEnvSel(envSel);
      setArchMsg({ type: "", text: "" });
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore caricamento archivio configurazioni: " + (e.message || "") });
    } finally {
      setArchLoading(false);
    }
  };

  useEffect(() => { if (ambienti.length > 0) loadArch(); }, [ambienti.length]); // eslint-disable-line

  const handleCreateArchContract = async () => {
    if (!ncName.trim()) return;
    setNcSaving(true);
    try {
      const contractId = "contract-" + Date.now();
      const lots = Array.from({ length: Math.max(1, Math.min(6, ncLots)) }, (_, i) => ({
        lotId: String(i + 1),
        name: `Lotto ${i + 1}`,
      }));
      await upsertConfiguratoreContract({ contractId, name: ncName.trim(), lots });
      setNcName(""); setNcLots(2);
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore creazione contratto: " + (e.message || "") });
    } finally {
      setNcSaving(false);
    }
  };

  const handleSaveLotCode = async (contractId, lotId) => {
    const key = `${contractId}|${lotId}`;
    const codice = (lotCodes[key] || "").trim();
    const env = ambienti.find(a => a.id === lotEnvSel[key]);
    const finalCode = env ? env.codiceContratto : codice;
    setSavingLot(prev => ({ ...prev, [key]: true }));
    try {
      await updateConfiguratoreLot(contractId, lotId, { codiceContratto: finalCode });
      setArchMsg({ type: "ok", text: `Codice Contratto salvato per ${contractId} · Lotto ${lotId}` });
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore salvataggio: " + (e.message || "") });
    } finally {
      setSavingLot(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleDeleteArchContract = async (contractId) => {
    if (!window.confirm(`Eliminare il contratto "${contractId}" dall'archivio?`)) return;
    try {
      await deleteConfiguratoreContract(contractId);
      setArchMsg({ type: "ok", text: `Contratto ${contractId} eliminato` });
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore eliminazione: " + (e.message || "") });
    }
  };

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

  const handleUpdateRuolo = async (userId, ruolo) => {
    if (!selectedAmbiente) return;
    try {
      await updateUtenteAmbienteRuolo(selectedAmbiente.id, userId, ruolo);
      const u = await getAmbientiUtenti(selectedAmbiente.id);
      setUtentiAmbiente(u);
      setEditingRuolo(prev => { const n = { ...prev }; delete n[userId]; return n; });
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

      {/* ── Archivio configurazioni (Configuratore Offerta) ── */}
      <div style={card}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#333" }}>Archivio configurazioni</div>
          <button
            onClick={loadArch}
            disabled={archLoading}
            style={{
              padding: "5px 12px", background: "#f1f3f4", color: "#444",
              border: "1px solid #dadce0", borderRadius: 6, fontSize: 12,
              cursor: archLoading ? "wait" : "pointer",
            }}
          >
            {archLoading ? "Ricaricamento..." : "Ricarica"}
          </button>
        </div>
        <div style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
          Contratti e lotti del Configuratore Offerta (salvati su PC_DataRecords). Associa a ogni lotto il Codice Contratto MEV.
        </div>

        {archMsg.text && (
          <div style={{
            marginBottom: 12, padding: "8px 12px", borderRadius: 6, fontSize: 12,
            background: archMsg.type === "ok" ? "#e6f4ea" : "#fce8e6",
            color: archMsg.type === "ok" ? "#137333" : "#c5221f",
          }}>
            {archMsg.text}
          </div>
        )}

        {/* Nuovo contratto configuratore */}
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>Nome nuovo contratto</div>
            <input
              value={ncName}
              onChange={e => setNcName(e.target.value)}
              placeholder="es. Poste TET 2025"
              style={{ padding: "7px 10px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 13, width: 200 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 11, color: "#666", marginBottom: 4 }}>N. Lotti (1-6)</div>
            <input
              type="number"
              min="1"
              max="6"
              value={ncLots}
              onChange={e => setNcLots(Math.max(1, Math.min(6, parseInt(e.target.value) || 1)))}
              style={{ padding: "7px 10px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 13, width: 70 }}
            />
          </div>
          <button
            onClick={handleCreateArchContract}
            disabled={ncSaving || !ncName.trim()}
            style={{
              padding: "7px 20px", background: "#1a73e8", color: "white",
              border: "none", borderRadius: 6, fontSize: 13, fontWeight: 600,
              cursor: ncSaving ? "wait" : "pointer", opacity: ncSaving ? 0.7 : 1,
            }}
          >
            {ncSaving ? "Creazione..." : "Crea Contratto"}
          </button>
        </div>

        {/* Lista contratti configuratore */}
        {archLoading && archContracts.length === 0
          ? <div style={{ color: "#888", fontSize: 13 }}>Caricamento contratti...</div>
          : archContracts.length === 0
            ? <div style={{ color: "#888", fontSize: 13 }}>Nessun contratto nell'archivio. Creane uno sopra.</div>
            : (
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={th}>Contratto</th>
                    <th style={th}>Lotti</th>
                    <th style={th}>Codice Contratto per Lotto</th>
                    <th style={th}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {archContracts.map(c => (
                    <React.Fragment key={c.contractId}>
                      <tr>
                        <td style={{ ...td, fontWeight: 600 }}>
                          <button
                            onClick={() => setArchExpanded(archExpanded === c.contractId ? null : c.contractId)}
                            style={{
                              background: "none", border: "none", cursor: "pointer",
                              color: "#1a73e8", fontSize: 13, fontWeight: 600, padding: 0,
                            }}
                          >
                            {archExpanded === c.contractId ? "▾ " : "▸ "}{c.name || c.contractId}
                          </button>
                          <div style={{ fontSize: 11, color: "#888" }}>{c.contractId}</div>
                        </td>
                        <td style={td}>{c.lots.length}</td>
                        <td style={td}>
                          {c.lots.filter(l => l.codiceContratto).length > 0
                            ? c.lots.filter(l => l.codiceContratto).map((l, i) => (
                                <span key={l.lotId} style={{ fontSize: 12, color: "#137333" }}>
                                  Lotto {l.lotId}: {l.codiceContratto}{i < c.lots.filter(x => x.codiceContratto).length - 1 ? ", " : ""}
                                </span>
                              ))
                            : <span style={{ fontSize: 12, color: "#bbb" }}>—</span>}
                        </td>
                        <td style={td}>
                          <button
                            onClick={() => handleDeleteArchContract(c.contractId)}
                            style={{
                              padding: "3px 10px", background: "#fce8e6", color: "#c5221f",
                              border: "1px solid #f5c6c2", borderRadius: 6, fontSize: 12, cursor: "pointer",
                            }}
                          >
                            Elimina
                          </button>
                        </td>
                      </tr>
                      {archExpanded === c.contractId && (
                        <tr>
                          <td colSpan={4} style={{ ...td, background: "#fafbff", padding: "12px 16px" }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 8 }}>Associazione Codice Contratto per Lotto</div>
                            {c.lots.map(l => {
                              const key = `${c.contractId}|${l.lotId}`;
                              return (
                                <div key={l.lotId} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
                                  <div style={{ width: 120, fontSize: 13, color: "#333", fontWeight: 600 }}>Lotto {l.lotId}</div>
                                  <div style={{ width: 160, fontSize: 12, color: "#666" }}>{l.name}</div>
                                  <select
                                    value={lotEnvSel[key] || ""}
                                    onChange={e => {
                                      const env = ambienti.find(a => a.id === parseInt(e.target.value, 10));
                                      setLotEnvSel(prev => ({ ...prev, [key]: e.target.value }));
                                      setLotCodes(prev => ({ ...prev, [key]: env ? env.codiceContratto : "" }));
                                    }}
                                    style={{ padding: "5px 8px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 12, maxWidth: 200 }}
                                  >
                                    <option value="">-- scegli contratto MEV --</option>
                                    {ambienti.map(a => (
                                      <option key={a.id} value={a.id}>{a.codiceContratto} — {a.descrizione}</option>
                                    ))}
                                  </select>
                                  <input
                                    value={lotCodes[key] || ""}
                                    onChange={e => setLotCodes(prev => ({ ...prev, [key]: e.target.value }))}
                                    placeholder="Codice Contratto"
                                    style={{ padding: "5px 8px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 12, width: 140 }}
                                  />
                                  <button
                                    onClick={() => handleSaveLotCode(c.contractId, l.lotId)}
                                    disabled={savingLot[key]}
                                    style={{
                                      padding: "5px 14px", background: "#1a73e8", color: "white",
                                      border: "none", borderRadius: 6, fontSize: 12, fontWeight: 600,
                                      cursor: savingLot[key] ? "wait" : "pointer", opacity: savingLot[key] ? 0.7 : 1,
                                    }}
                                  >
                                    {savingLot[key] ? "Salvataggio..." : "Salva"}
                                  </button>
                                </div>
                              );
                            })}
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            )}
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
                <option>Client</option>
                <option>Developer</option>
                <option>SuperAdmin</option>
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
                    <th style={th}>Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {utentiAmbiente.map(ua => {
                    const isEditing = editingRuolo[ua.userId] !== undefined;
                    const ruoloColor = ua.ruolo === "Admin" ? { bg: "#e8f0fe", fg: "#1a73e8" }
                      : ua.ruolo === "Client" ? { bg: "#eff6ff", fg: "#2563eb" }
                      : { bg: "#f1f3f4", fg: "#555" };
                    return (
                      <tr key={ua.id}>
                        <td style={{ ...td, fontWeight: 600 }}>{ua.username}</td>
                        <td style={td}>{ua.fullName}</td>
                        <td style={td}>{ua.email}</td>
                        <td style={td}>
                          {isEditing ? (
                            <select
                              value={editingRuolo[ua.userId]}
                              onChange={e => setEditingRuolo(prev => ({ ...prev, [ua.userId]: e.target.value }))}
                              style={{ padding: "4px 8px", border: "1px solid #dadce0", borderRadius: 6, fontSize: 12 }}
                            >
                              <option>Admin</option>
                              <option>Editor</option>
                              <option>Client</option>
                              <option>Developer</option>
                              <option>SuperAdmin</option>
                            </select>
                          ) : (
                            <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: ruoloColor.bg, color: ruoloColor.fg }}>
                              {ua.ruolo}
                            </span>
                          )}
                        </td>
                        <td style={{ ...td, display: "flex", gap: 6 }}>
                          {isEditing ? (
                            <>
                              <button
                                onClick={() => handleUpdateRuolo(ua.userId, editingRuolo[ua.userId])}
                                style={{ padding: "3px 10px", background: "#e6f4ea", color: "#137333", border: "1px solid #a8d5b5", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                              >Salva</button>
                              <button
                                onClick={() => setEditingRuolo(prev => { const n = { ...prev }; delete n[ua.userId]; return n; })}
                                style={{ padding: "3px 10px", background: "#f1f3f4", color: "#555", border: "1px solid #dadce0", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                              >Annulla</button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditingRuolo(prev => ({ ...prev, [ua.userId]: ua.ruolo }))}
                                style={{ padding: "3px 10px", background: "#e8f0fe", color: "#1a73e8", border: "1px solid #c5d8fb", borderRadius: 6, fontSize: 12, cursor: "pointer", fontWeight: 600 }}
                              >Modifica</button>
                              <button
                                onClick={() => handleRemoveUtente(ua.userId)}
                                style={{ padding: "3px 10px", background: "#fce8e6", color: "#c5221f", border: "1px solid #f5c6c2", borderRadius: 6, fontSize: 12, cursor: "pointer" }}
                              >Rimuovi</button>
                            </>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
        </div>
      )}
    </div>
  );
}
