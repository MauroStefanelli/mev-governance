import React, { useState, useEffect, useRef } from "react";
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
  const [archExpanded, setArchExpanded]   = useState(null); // contractId espanso per assoc. codice MEV
  const [archMsg, setArchMsg]             = useState({ type: "", text: "" });
  const [showNewForm, setShowNewForm]     = useState(false); // mostra/nascondi form nuovo contratto
  // Form nuovo contratto configuratore
  const [ncName, setNcName]               = useState("");
  const [ncRulesFile, setNcRulesFile]     = useState(null); // PDF capitolato
  const [ncLots, setNcLots]               = useState(2);
  const [ncLotNames, setNcLotNames]       = useState({}); // { "1": "Lotto 1", ... }
  const [ncSaving, setNcSaving]           = useState(false);
  // Codici contratto per lotto (in modifica)
  const [lotCodes, setLotCodes]           = useState({}); // { "contractId|lotto": codiceContratto }
  const [savingLot, setSavingLot]         = useState({}); // { "contractId|lotto": bool }
  // Selezione ambiente MEV per riga lotto
  const [lotEnvSel, setLotEnvSel]         = useState({}); // { "contractId|lotto": ambienteId (string) }
  // Toggle attivo/disattivato lotto
  const [togglingLot, setTogglingLot]     = useState({}); // { "contractId|lotto": bool }

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
            envSel[key] = env ? String(env.id) : "";
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
      const count = Math.max(1, Math.min(6, ncLots));
      const lots = Array.from({ length: count }, (_, i) => ({
        lotId: String(i + 1),
        name: (ncLotNames[String(i + 1)] || `Lotto ${i + 1}`).trim(),
        active: true,
      }));
      await upsertConfiguratoreContract({
        contractId,
        name: ncName.trim(),
        rulesFile: ncRulesFile ? ncRulesFile.name : "",
        lots,
      });
      setNcName(""); setNcLots(2); setNcLotNames({}); setNcRulesFile(null);
      setShowNewForm(false);
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore creazione contratto: " + (e.message || "") });
    } finally {
      setNcSaving(false);
    }
  };

  const handleToggleLot = async (contractId, lotId, currentActive) => {
    const key = `${contractId}|${lotId}`;
    const contract = archContracts.find(c => c.contractId === contractId);
    const activeLots = (contract?.lots || []).filter(l => l.active !== false);
    if (currentActive && activeLots.length <= 1) {
      setArchMsg({ type: "error", text: "Deve rimanere almeno un Lotto attivo." });
      return;
    }
    setTogglingLot(prev => ({ ...prev, [key]: true }));
    try {
      await updateConfiguratoreLot(contractId, lotId, { active: !currentActive });
      setArchMsg({ type: "ok", text: `Lotto ${lotId} ${currentActive ? "disattivato" : "riattivato"}.` });
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore toggle lotto: " + (e.message || "") });
    } finally {
      setTogglingLot(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleDeleteLot = async (contractId, lotId) => {
    const contract = archContracts.find(c => c.contractId === contractId);
    if ((contract?.lots || []).length <= 1) {
      setArchMsg({ type: "error", text: "Non puoi eliminare l'unico Lotto del contratto." });
      return;
    }
    if (!window.confirm(`Eliminare il Lotto ${lotId} dal contratto?`)) return;
    try {
      await updateConfiguratoreLot(contractId, lotId, { deleted: true, active: false });
      setArchMsg({ type: "ok", text: `Lotto ${lotId} eliminato.` });
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore eliminazione lotto: " + (e.message || "") });
    }
  };

  const handleSaveLotCode = async (contractId, lotId) => {
    const key = `${contractId}|${lotId}`;
    const codice = (lotCodes[key] || "").trim();
    const env = ambienti.find(a => a.id === parseInt(lotEnvSel[key], 10));
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

      {/* ── Archivio configurazioni (Configuratore Offerta) ── */}
      <div style={{ ...card, padding: "28px 28px 24px" }}>

        {/* Header sezione */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20, marginBottom: 24 }}>
          <div>
            <p style={{ margin: 0, color: "#008b72", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 900 }}>Archivio configurazioni</p>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: "#102a47", margin: "4px 0 0" }}>Seleziona o configura un contratto</h1>
            <p style={{ color: "#667482", margin: "6px 0 0", fontSize: 14 }}>Cataloghi, prezzi e regole vengono mantenuti separati per ciascun Lotto.</p>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button onClick={loadArch} disabled={archLoading} style={{ padding: "9px 15px", background: "#fff", color: "#102a47", border: "1px solid #d8e0e8", borderRadius: 7, fontWeight: 700, cursor: archLoading ? "wait" : "pointer", fontSize: 14 }}>
              {archLoading ? "..." : "Ricarica"}
            </button>
            <button onClick={() => setShowNewForm(f => !f)} style={{ padding: "9px 15px", background: "#f4df00", color: "#102a47", border: "none", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>
              {showNewForm ? "Annulla" : "Nuovo contratto"}
            </button>
          </div>
        </div>

        {archMsg.text && (
          <div style={{ marginBottom: 16, padding: "9px 14px", borderRadius: 7, fontSize: 13, background: archMsg.type === "ok" ? "#dff4ed" : "#fce8e6", color: archMsg.type === "ok" ? "#006b57" : "#c5221f", fontWeight: 600 }}>
            {archMsg.text}
          </div>
        )}

        {/* ── Form nuovo contratto ── */}
        {showNewForm && (
          <div style={{ borderTop: "1px solid #d8e0e8", paddingTop: 24, marginBottom: 24 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#102a47", marginBottom: 16 }}>Nuovo contratto</h2>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 2fr 1fr", gap: 16, marginBottom: 16 }}>
              <label style={{ fontWeight: 750, fontSize: 14, color: "#334456" }}>
                Nome del contratto
                <input value={ncName} onChange={e => setNcName(e.target.value)} placeholder="es. Poste T&T 2027"
                  style={{ display: "block", width: "100%", marginTop: 6, border: "1px solid #bdc9d4", borderRadius: 7, padding: "10px 12px", fontSize: 14, fontFamily: "inherit" }} />
              </label>
              <label style={{ fontWeight: 750, fontSize: 14, color: "#334456" }}>
                Capitolato tecnico PDF
                <input type="file" accept=".pdf,application/pdf" onChange={e => setNcRulesFile(e.target.files[0] || null)}
                  style={{ display: "block", width: "100%", marginTop: 6, border: "1px solid #bdc9d4", borderRadius: 7, padding: "10px 12px", fontSize: 14, fontFamily: "inherit" }} />
              </label>
              <label style={{ fontWeight: 750, fontSize: 14, color: "#334456" }}>
                Numero di Lotti
                <input type="number" min="1" max="6" value={ncLots}
                  onChange={e => { const n = Math.max(1, Math.min(6, parseInt(e.target.value) || 1)); setNcLots(n); }}
                  style={{ display: "block", width: "100%", marginTop: 6, border: "1px solid #bdc9d4", borderRadius: 7, padding: "10px 12px", fontSize: 14, fontFamily: "inherit" }} />
              </label>
            </div>
            {/* Nomi lotti */}
            <div style={{ display: "grid", gap: 12, marginBottom: 20 }}>
              {Array.from({ length: Math.max(1, Math.min(6, ncLots)) }, (_, i) => String(i + 1)).map(id => (
                <div key={id} style={{ padding: 16, background: "#f3f6f8", borderRadius: 8 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#102a47", marginBottom: 8 }}>Lotto {id}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.2fr 2fr 2fr .8fr", gap: 12 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, color: "#334456" }}>
                      Nome Lotto
                      <input value={ncLotNames[id] || ""} onChange={e => setNcLotNames(prev => ({ ...prev, [id]: e.target.value }))}
                        placeholder={`Lotto ${id}`}
                        style={{ display: "block", width: "100%", marginTop: 4, border: "1px solid #bdc9d4", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowNewForm(false)} style={{ padding: "9px 18px", background: "#fff", color: "#102a47", border: "1px solid #d8e0e8", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Annulla</button>
              <button onClick={handleCreateArchContract} disabled={ncSaving || !ncName.trim()}
                style={{ padding: "9px 20px", background: "#f4df00", color: "#102a47", border: "none", borderRadius: 7, fontWeight: 700, cursor: ncSaving ? "wait" : "pointer", fontSize: 14, opacity: ncSaving ? 0.7 : 1 }}>
                {ncSaving ? "Creazione..." : "Importa e salva contratto"}
              </button>
            </div>
          </div>
        )}

        {/* ── Lista contratti ── */}
        {archLoading && archContracts.length === 0
          ? <div style={{ color: "#667482", fontSize: 14 }}>Caricamento contratti...</div>
          : archContracts.length === 0
            ? <div style={{ color: "#667482", fontSize: 14 }}>Nessun contratto nell'archivio. Clicca "Nuovo contratto" per aggiungerne uno.</div>
            : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 14 }}>
                {archContracts.map(c => {
                  const activeLots = (c.lots || []).filter(l => l.active !== false);
                  return (
                    <article key={c.contractId} style={{ border: "1px solid #d8e0e8", borderRadius: 9, padding: 18, display: "grid", gap: 12, background: "#fff" }}>
                      {/* Intestazione contratto */}
                      <div>
                        <p style={{ margin: 0, color: "#008b72", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.1em", fontWeight: 900 }}>
                          {c.builtin ? "Configurazione iniziale" : "Configurazione locale"}
                        </p>
                        <h2 style={{ fontSize: 17, fontWeight: 800, color: "#102a47", margin: "3px 0 0" }}>{c.name || c.contractId}</h2>
                        <p style={{ color: "#667482", margin: "3px 0 0", fontSize: 13 }}>{c.rulesFile || "Capitolato non indicato"}</p>
                      </div>

                      {/* Lotti */}
                      <div style={{ display: "grid", gap: 7 }}>
                        {(c.lots || []).map(l => {
                          const key = `${c.contractId}|${l.lotId}`;
                          const active = l.active !== false;
                          return (
                            <div key={l.lotId} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto auto", gap: 7, alignItems: "center", padding: "9px 10px", background: "#f3f6f8", borderRadius: 7, borderLeft: `4px solid ${active ? "#008b72" : "#9aa7b3"}`, opacity: active ? 1 : 0.75 }}>
                              <div>
                                <strong style={{ display: "block", fontSize: 13, color: "#102a47" }}>Lotto {l.lotId}</strong>
                                <span style={{ display: "block", color: "#667482", fontSize: 12 }}>{l.name}</span>
                              </div>
                              <span style={{ padding: "3px 7px", borderRadius: 999, background: "#fff", fontSize: 11, fontWeight: 800, color: active ? "#006b57" : "#667482" }}>
                                {active ? "Attivo" : "Disattivato"}
                              </span>
                              <button onClick={() => handleToggleLot(c.contractId, l.lotId, active)} disabled={togglingLot[key]}
                                style={{ padding: "5px 8px", background: "#fff", color: "#102a47", border: "1px solid #d8e0e8", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                {togglingLot[key] ? "..." : active ? "Disattiva" : "Riattiva"}
                              </button>
                              <button onClick={() => handleDeleteLot(c.contractId, l.lotId)}
                                style={{ padding: "5px 8px", background: "#fff", color: "#a93838", border: "1px solid #e7c6c6", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                                Elimina
                              </button>
                            </div>
                          );
                        })}
                      </div>

                      {/* Azioni contratto */}
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          onClick={() => setArchExpanded(archExpanded === c.contractId ? null : c.contractId)}
                          style={{ padding: "8px 14px", background: activeLots.length ? "#f4df00" : "#f3f6f8", color: "#102a47", border: "1px solid #d8e0e8", borderRadius: 7, fontWeight: 700, cursor: activeLots.length ? "pointer" : "not-allowed", fontSize: 13, opacity: activeLots.length ? 1 : 0.5 }}
                          disabled={!activeLots.length}
                          title={activeLots.length ? "Associa Codice Contratto MEV ai lotti" : "Nessun lotto attivo"}
                        >
                          {archExpanded === c.contractId ? "Chiudi configurazione" : "Usa contratto"}
                        </button>
                        {!c.builtin && (
                          <button onClick={() => handleDeleteArchContract(c.contractId)}
                            style={{ padding: "8px 14px", background: "#fff", color: "#102a47", border: "1px solid #d8e0e8", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 13 }}>
                            Elimina contratto
                          </button>
                        )}
                      </div>

                      {/* Associazione Codice Contratto MEV (espandibile con "Usa contratto") */}
                      {archExpanded === c.contractId && (
                        <div style={{ borderTop: "1px solid #d8e0e8", paddingTop: 12, display: "grid", gap: 10 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: "#334456", marginBottom: 4 }}>Associa Codice Contratto MEV per Lotto</div>
                          {(c.lots || []).filter(l => l.active !== false).map(l => {
                            const key = `${c.contractId}|${l.lotId}`;
                            return (
                              <div key={l.lotId} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                <span style={{ width: 70, fontSize: 13, fontWeight: 700, color: "#102a47" }}>Lotto {l.lotId}</span>
                                <span style={{ width: 130, fontSize: 12, color: "#667482" }}>{l.name}</span>
                                <select value={lotEnvSel[key] || ""}
                                  onChange={e => {
                                    const env = ambienti.find(a => a.id === parseInt(e.target.value, 10));
                                    setLotEnvSel(prev => ({ ...prev, [key]: e.target.value }));
                                    setLotCodes(prev => ({ ...prev, [key]: env ? env.codiceContratto : "" }));
                                  }}
                                  style={{ padding: "6px 8px", border: "1px solid #bdc9d4", borderRadius: 6, fontSize: 12, maxWidth: 210, fontFamily: "inherit" }}>
                                  <option value="">-- scegli contratto MEV --</option>
                                  {ambienti.map(a => (
                                    <option key={a.id} value={a.id}>{a.codiceContratto} — {a.descrizione}</option>
                                  ))}
                                </select>
                                <input value={lotCodes[key] || ""} onChange={e => setLotCodes(prev => ({ ...prev, [key]: e.target.value }))}
                                  placeholder="Codice contratto"
                                  style={{ padding: "6px 8px", border: "1px solid #bdc9d4", borderRadius: 6, fontSize: 12, width: 140, fontFamily: "inherit" }} />
                                <button onClick={() => handleSaveLotCode(c.contractId, l.lotId)} disabled={savingLot[key]}
                                  style={{ padding: "6px 14px", background: "#1c4e80", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: savingLot[key] ? "wait" : "pointer", opacity: savingLot[key] ? 0.7 : 1 }}>
                                  {savingLot[key] ? "..." : "Salva"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
      </div>

      {/* Crea nuovo contratto MEV */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 12 }}>Crea nuovo Contratto MEV</div>
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

      {/* Lista contratti MEV */}
      <div style={card}>
        <div style={{ fontSize: 14, fontWeight: 700, color: "#333", marginBottom: 12 }}>Contratti MEV Esistenti</div>
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
