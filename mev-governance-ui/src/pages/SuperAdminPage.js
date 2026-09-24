import React, { useState, useEffect, useRef } from "react";
import {
  getAllAmbienti, createAmbiente,
  getUsers, getAmbientiUtenti, addUtenteAmbiente, removeUtenteAmbiente, updateUtenteAmbienteRuolo,
  getConfiguratoreContracts, updateConfiguratoreLot, deleteConfiguratoreContract,
  importConfiguratoreContract, uploadConfiguratoreContractLot
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
  const [ncLotFiles, setNcLotFiles]       = useState({}); // { "1": { catalogFile, priceFile }, ... }
  const [ncLotShares, setNcLotShares]     = useState({}); // { "1": 65, ... }
  const [ncSaving, setNcSaving]           = useState(false);
  // Codici contratto per lotto (in modifica)
  const [lotCodes, setLotCodes]           = useState({}); // { "contractId|lotto": codiceContratto }
  const [savingLot, setSavingLot]         = useState({}); // { "contractId|lotto": bool }
  // Selezione ambiente MEV per riga lotto
  const [lotEnvSel, setLotEnvSel]         = useState({}); // { "contractId|lotto": ambienteId (string) }
  // Toggle attivo/disattivato lotto
  const [togglingLot, setTogglingLot]     = useState({}); // { "contractId|lotto": bool }

  // Modale dettaglio contrattuale
  const [detailModal, setDetailModal]     = useState(null); // { contract, lotId } oppure null

  // Upload file su lotto esistente
  const [lotUpload, setLotUpload]         = useState({}); // { "contractId|lotId": { catalogFile, priceFile, tow5Share, uploading } }

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
    const count = Math.max(1, Math.min(6, ncLots));
    // Valida che tutti i lotti abbiano i file obbligatori
    for (let i = 1; i <= count; i++) {
      const id = String(i);
      if (!ncLotFiles[id]?.priceFile) {
        setArchMsg({ type: "error", text: `Lotto ${id}: file Listino TOW obbligatorio.` });
        return;
      }
    }
    setNcSaving(true);
    setArchMsg({ type: "", text: "" });
    try {
      const contractId = "contract-" + Date.now();
      const lots = Array.from({ length: count }, (_, i) => ({
        lotId: String(i + 1),
        name: (ncLotNames[String(i + 1)] || `Lotto ${i + 1}`).trim(),
        tow5Share: ncLotShares[String(i + 1)] ?? 65,
        catalogFile: ncLotFiles[String(i + 1)]?.catalogFile || null,
        priceFile:   ncLotFiles[String(i + 1)]?.priceFile,
      }));
      const result = await importConfiguratoreContract({
        contractId,
        name: ncName.trim(),
        rulesFile: ncRulesFile || null,
        lots,
      });
      const warnings = result.warnings?.length
        ? ` Avvisi: ${result.warnings.join("; ")}`
        : "";
      setArchMsg({ type: warnings ? "error" : "ok", text: `${result.message}${warnings}` });
      setNcName(""); setNcLots(2); setNcLotNames({}); setNcLotFiles({}); setNcLotShares({}); setNcRulesFile(null);
      setShowNewForm(false);
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore importazione contratto: " + (e.message || "") });
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

  const handleUploadLotFiles = async (contract, lot) => {
    const key = `${contract.contractId}|${lot.lotId}`;
    const up = lotUpload[key] || {};
    if (!up.catalogFile || !up.priceFile) {
      setArchMsg({ type: "error", text: `Lotto ${lot.lotId}: seleziona sia il Catalogo PDF che il Listino TOW.` });
      return;
    }
    setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], uploading: true } }));
    setArchMsg({ type: "", text: "" });
    try {
      const result = await uploadConfiguratoreContractLot({
        contractId: contract.contractId,
        contractName: contract.name,
        lotId: lot.lotId,
        lotName: lot.name,
        tow5Share: up.tow5Share ?? lot.tow5Share ?? 65,
        catalogFile: up.catalogFile,
        priceFile: up.priceFile,
      });
      const warn = result.warnings?.length ? ` Avvisi: ${result.warnings.join("; ")}` : "";
      setArchMsg({ type: warn ? "error" : "ok", text: `${result.message}${warn}` });
      setLotUpload(prev => { const n = { ...prev }; delete n[key]; return n; });
      await loadArch();
    } catch (e) {
      setArchMsg({ type: "error", text: "Errore upload lotto: " + (e.message || "") });
    } finally {
      setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], uploading: false } }));
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
                Capitolato tecnico PDF <span style={{ fontWeight: 400, color: "#9aa7b3" }}>(opzionale)</span>
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
            {/* Configurazione per ogni lotto */}
            <div style={{ display: "grid", gap: 14, marginBottom: 20 }}>
              {Array.from({ length: Math.max(1, Math.min(6, ncLots)) }, (_, i) => String(i + 1)).map(id => (
                <div key={id} style={{ padding: 16, background: "#f3f6f8", borderRadius: 8, borderLeft: "4px solid #008b72" }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: "#102a47", marginBottom: 12 }}>Lotto {id}</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1.5fr 2fr .7fr", gap: 12 }}>
                    <label style={{ fontWeight: 700, fontSize: 13, color: "#334456" }}>
                      Nome Lotto
                      <input value={ncLotNames[id] || ""} onChange={e => setNcLotNames(prev => ({ ...prev, [id]: e.target.value }))}
                        placeholder={`Lotto ${id}`}
                        style={{ display: "block", width: "100%", marginTop: 4, border: "1px solid #bdc9d4", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
                    </label>
                    <label style={{ fontWeight: 700, fontSize: 13, color: "#334456" }}>
                      Listino TOW (Excel o PDF) <span style={{ color: "#e53935" }}>*</span>
                      <input type="file" accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required
                        onChange={e => setNcLotFiles(prev => ({ ...prev, [id]: { ...prev[id], priceFile: e.target.files[0] || null } }))}
                        style={{ display: "block", width: "100%", marginTop: 4, border: `1px solid ${ncLotFiles[id]?.priceFile ? "#bdc9d4" : "#e8a09a"}`, borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
                      {ncLotFiles[id]?.priceFile && <span style={{ fontSize: 11, color: "#008b72", marginTop: 2, display: "block" }}>{ncLotFiles[id].priceFile.name}</span>}
                    </label>
                    <label style={{ fontWeight: 700, fontSize: 13, color: "#334456" }}>
                      TOW .5 %
                      <input type="number" min="0" max="100" step="0.01" value={ncLotShares[id] ?? 65}
                        onChange={e => setNcLotShares(prev => ({ ...prev, [id]: parseFloat(e.target.value) || 65 }))}
                        style={{ display: "block", width: "100%", marginTop: 4, border: "1px solid #bdc9d4", borderRadius: 6, padding: "8px 10px", fontSize: 13, fontFamily: "inherit" }} />
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: "#667482", marginBottom: 14 }}>
              I file PDF e Excel vengono analizzati dal server: il catalogo software e i prezzi TOW vengono estratti e salvati nel database.
              L'elaborazione può richiedere alcuni secondi per contratti con molte voci.
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <button onClick={() => setShowNewForm(false)} style={{ padding: "9px 18px", background: "#fff", color: "#102a47", border: "1px solid #d8e0e8", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 14 }}>Annulla</button>
              <button onClick={handleCreateArchContract} disabled={ncSaving || !ncName.trim()}
                style={{ padding: "9px 20px", background: "#f4df00", color: "#102a47", border: "none", borderRadius: 7, fontWeight: 700, cursor: ncSaving ? "wait" : "pointer", fontSize: 14, opacity: ncSaving ? 0.7 : 1 }}>
                {ncSaving ? "Elaborazione documenti..." : "Importa e salva contratto"}
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
                          const catalogCount = Array.isArray(l.catalog) ? l.catalog.length : (l.catalog ? Object.keys(l.catalog).length : 0);
                          const towCount = l.towPrices ? Object.keys(l.towPrices).length : 0;
                          const up = lotUpload[key] || {};
                          return (
                            <div key={l.lotId} style={{ padding: "9px 10px", background: "#f3f6f8", borderRadius: 7, borderLeft: `4px solid ${active ? "#008b72" : "#9aa7b3"}`, opacity: active ? 1 : 0.75 }}>
                              {/* Riga principale */}
                              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) auto auto auto", gap: 7, alignItems: "center" }}>
                                <div>
                                  <strong style={{ display: "block", fontSize: 13, color: "#102a47" }}>Lotto {l.lotId}</strong>
                                  <span style={{ display: "block", color: "#667482", fontSize: 12 }}>{l.name}</span>
                                  {/* Riepilogo file analizzati */}
                                  <div style={{ marginTop: 4, display: "flex", gap: 8, flexWrap: "wrap" }}>
                                    {l.priceFile
                                      ? <span style={{ fontSize: 11, color: towCount > 0 ? "#006b57" : "#9aa7b3", background: "#fff", padding: "1px 6px", borderRadius: 4, border: "1px solid #d8e0e8" }}>
                                          {towCount > 0 ? `${towCount} prezzi TOW` : "Listino: " + l.priceFile}
                                        </span>
                                      : <span style={{ fontSize: 11, color: "#e53935", background: "#fff", padding: "1px 6px", borderRadius: 4, border: "1px solid #f5c6c2" }}>Listino TOW mancante</span>
                                    }
                                    {l.catalogFile
                                      ? <span style={{ fontSize: 11, color: catalogCount > 0 ? "#006b57" : "#9aa7b3", background: "#fff", padding: "1px 6px", borderRadius: 4, border: "1px solid #d8e0e8" }}>
                                          {catalogCount > 0 ? `${catalogCount} voci catalogo` : "Catalogo: " + l.catalogFile}
                                        </span>
                                      : <span style={{ fontSize: 11, color: "#9aa7b3", background: "#fff", padding: "1px 6px", borderRadius: 4, border: "1px solid #d8e0e8" }}>Catalogo non caricato</span>
                                    }
                                  </div>
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
                              {/* Upload file su lotto esistente */}
                              <details style={{ marginTop: 8 }}>
                                <summary style={{ fontSize: 12, color: "#334456", cursor: "pointer", fontWeight: 600, userSelect: "none" }}>
                                  Carica / aggiorna file analisi lotto
                                </summary>
                                <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "2fr 2fr .6fr", gap: 8 }}>
                                  <label style={{ fontSize: 12, color: "#334456", fontWeight: 600 }}>
                                    Listino TOW (Excel o PDF) *
                                    <input type="file" accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                      onChange={e => setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], priceFile: e.target.files[0] || null } }))}
                                      style={{ display: "block", width: "100%", marginTop: 3, border: "1px solid #bdc9d4", borderRadius: 5, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />
                                    {up.priceFile && <span style={{ fontSize: 11, color: "#008b72" }}>{up.priceFile.name}</span>}
                                  </label>
                                  <label style={{ fontSize: 12, color: "#334456", fontWeight: 600 }}>
                                    Catalogo software PDF (opzionale)
                                    <input type="file" accept=".pdf,application/pdf"
                                      onChange={e => setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], catalogFile: e.target.files[0] || null } }))}
                                      style={{ display: "block", width: "100%", marginTop: 3, border: "1px solid #bdc9d4", borderRadius: 5, padding: "6px 8px", fontSize: 12, fontFamily: "inherit" }} />
                                    {up.catalogFile && <span style={{ fontSize: 11, color: "#008b72" }}>{up.catalogFile.name}</span>}
                                  </label>
                                  <div style={{ display: "flex", alignItems: "flex-end" }}>
                                    <button onClick={() => handleUploadLotFiles(c, l)} disabled={up.uploading || !up.priceFile}
                                      style={{ width: "100%", padding: "8px 0", background: "#1c4e80", color: "#fff", border: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: up.uploading ? "wait" : "pointer", opacity: (!up.priceFile || up.uploading) ? 0.6 : 1 }}>
                                      {up.uploading ? "..." : "Analizza"}
                                    </button>
                                  </div>
                                </div>
                              </details>
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
                        <button
                          onClick={() => setDetailModal({ contract: c, lotId: (c.lots || [])[0]?.lotId || "1" })}
                          style={{ padding: "8px 14px", background: "#fff", color: "#1c4e80", border: "1px solid #b0c4d8", borderRadius: 7, fontWeight: 700, cursor: "pointer", fontSize: 13 }}
                          title="Visualizza dettaglio contrattuale"
                        >
                          Dettaglio contrattuale
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

      {/* ── Modale Dettaglio Contrattuale ── */}
      {detailModal && (() => {
        const { contract: dc, lotId: dlotId } = detailModal;
        const SUMMARIES = window.CONTRACT_SUMMARIES || {};
        const summary = SUMMARIES[dc.contractId];
        const lotSummary = summary?.lots?.[dlotId];
        const common = summary?.common;
        const lot = (dc.lots || []).find(l => l.lotId === dlotId) || {};
        const catalog = Array.isArray(lot.catalog) ? lot.catalog : [];
        const towPrices = lot.towPrices && typeof lot.towPrices === "object" ? lot.towPrices : {};
        const euro = new Intl.NumberFormat("it-IT", { style: "currency", currency: "EUR" });
        const summaryTable = (heads, rows) => (
          <div style={{ overflowX: "auto", marginBottom: 12 }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead><tr>{heads.map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", background: "#f3f6f8", fontWeight: 700, color: "#334456", borderBottom: "2px solid #d8e0e8" }}>{h}</th>)}</tr></thead>
              <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={{ padding: "6px 10px", borderBottom: "1px solid #eef0f2", color: "#333" }}>{c}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        return (
          <div onClick={() => setDetailModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(10,20,35,0.55)", zIndex: 1000, display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "24px 16px", overflowY: "auto" }}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#fff", borderRadius: 12, width: "100%", maxWidth: 820, padding: "32px 32px 28px", position: "relative", boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }}>
              {/* Header */}
              <button onClick={() => setDetailModal(null)} style={{ position: "absolute", top: 16, right: 16, background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#667482" }}>✕</button>
              <p style={{ margin: "0 0 2px", color: "#008b72", fontSize: 11, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 900 }}>Dettaglio contrattuale</p>
              <h2 style={{ margin: "0 0 4px", fontSize: 20, fontWeight: 800, color: "#102a47" }}>{dc.name}</h2>
              <p style={{ margin: "0 0 20px", color: "#667482", fontSize: 14 }}>{summary?.subtitle || "Documenti, Lotti e configurazione economica"}</p>

              {/* Tab lotti */}
              <div style={{ display: "flex", gap: 6, marginBottom: 20, borderBottom: "2px solid #d8e0e8", paddingBottom: 0 }}>
                <button onClick={() => setDetailModal(null)} style={{ padding: "7px 14px", background: "none", border: "none", color: "#667482", fontSize: 13, cursor: "pointer", fontWeight: 600 }}>
                  ← Torna ai contratti
                </button>
                {(dc.lots || []).filter(l => l.active !== false).map(l => (
                  <button key={l.lotId}
                    onClick={() => setDetailModal({ contract: dc, lotId: l.lotId })}
                    style={{ padding: "7px 14px", background: "none", border: "none", borderBottom: dlotId === l.lotId ? "3px solid #1c4e80" : "3px solid transparent", color: dlotId === l.lotId ? "#1c4e80" : "#667482", fontSize: 13, fontWeight: dlotId === l.lotId ? 800 : 600, cursor: "pointer", marginBottom: -2 }}>
                    Lotto {l.lotId}
                  </button>
                ))}
                {summary && <span style={{ marginLeft: "auto", padding: "7px 0", fontSize: 12, color: "#008b72", fontWeight: 700, alignSelf: "center" }}>Sintesi allegata</span>}
              </div>

              {/* Contenuto lotto con sintesi completa SE disponibile */}
              {lotSummary && common ? (
                <div style={{ display: "grid", gap: 20 }}>
                  {/* Hero */}
                  <div style={{ display: "flex", gap: 20, alignItems: "flex-start", padding: 20, background: "#f3f6f8", borderRadius: 9 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 4px", color: "#008b72", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>Sintesi allegata</p>
                      <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 800, color: "#102a47" }}>{lotSummary.title}</h3>
                      <p style={{ margin: 0, color: "#334456", fontSize: 13, lineHeight: 1.6 }}>{lotSummary.conclusion}</p>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 80, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid #d8e0e8" }}>
                      <span style={{ display: "block", fontSize: 11, color: "#667482" }}>Garanzia</span>
                      <strong style={{ fontSize: 16, color: "#102a47" }}>12 mesi</strong>
                    </div>
                  </div>
                  {/* Dimensionamento + Copertura */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <section style={{ padding: 16, background: "#f3f6f8", borderRadius: 8 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Dimensionamento</h4>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>{lotSummary.dimensioning.map((x, i) => <li key={i} style={{ fontSize: 13, color: "#334456", marginBottom: 4 }}>{x}</li>)}</ul>
                    </section>
                    <section style={{ padding: 16, background: "#f3f6f8", borderRadius: 8 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Copertura del servizio</h4>
                      <ul style={{ margin: 0, paddingLeft: 18 }}>{common.coverage.map((x, i) => <li key={i} style={{ fontSize: 13, color: "#334456", marginBottom: 4 }}>{x}</li>)}</ul>
                    </section>
                  </div>
                  {/* Quadro TOW */}
                  <section>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Quadro TOW</h4>
                    {summaryTable(["TOW", "Ambito", "Quantità contrattuale", "Peso"], lotSummary.tow)}
                    <p style={{ fontSize: 12, color: "#667482", marginTop: 4 }}>{lotSummary.catalogNote}</p>
                  </section>
                  {/* Obblighi organizzativi */}
                  <section>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Obblighi organizzativi</h4>
                    {summaryTable(["Obbligo", "Vincolo"], common.obligations)}
                  </section>
                  {/* Deliverable */}
                  <section>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Deliverable per TOW</h4>
                    <div style={{ display: "grid", gap: 6 }}>
                      {Object.entries(lotSummary.deliverables).map(([tow, items]) => (
                        <details key={tow} style={{ border: "1px solid #d8e0e8", borderRadius: 7, padding: "8px 12px" }}>
                          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 13, color: "#102a47", display: "flex", justifyContent: "space-between" }}>
                            <strong>{tow}</strong><span style={{ color: "#667482", fontWeight: 400 }}>{items.length} deliverable</span>
                          </summary>
                          <ul style={{ margin: "8px 0 0", paddingLeft: 18 }}>{items.map((x, i) => <li key={i} style={{ fontSize: 13, color: "#334456", marginBottom: 3 }}>{x}</li>)}</ul>
                        </details>
                      ))}
                    </div>
                  </section>
                  {/* Ciclo + Qualità */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <section style={{ padding: 16, background: "#f3f6f8", borderRadius: 8 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Ciclo di esecuzione</h4>
                      <ol style={{ margin: 0, paddingLeft: 18 }}>{common.lifecycle.map((x, i) => <li key={i} style={{ fontSize: 13, color: "#334456", marginBottom: 4 }}>{x}</li>)}</ol>
                    </section>
                    <section style={{ padding: 16, background: "#f3f6f8", borderRadius: 8 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Qualità dei task</h4>
                      {summaryTable(["Indicatore", "Soglia"], common.quality)}
                    </section>
                  </div>
                  {/* SLA */}
                  <section>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>SLA del canone</h4>
                    {summaryTable(["Indicatore", "Obiettivo", "Peso"], common.service)}
                    {summaryTable(["Severità", "Tempi contrattuali"], common.severity)}
                    <p style={{ fontSize: 12, color: "#667482" }}><strong>Garanzia:</strong> {common.warranty}</p>
                  </section>
                  {/* Checklist */}
                  <section>
                    <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Checklist operativa</h4>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {common.checklist.map(([area, check], i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", background: "#f3f6f8", borderRadius: 6 }}>
                          <span style={{ color: "#008b72", fontWeight: 900, fontSize: 14, flexShrink: 0 }}>✓</span>
                          <p style={{ margin: 0, fontSize: 13 }}><strong>{area}</strong><br /><span style={{ color: "#667482" }}>{check}</span></p>
                        </div>
                      ))}
                    </div>
                  </section>
                  {/* Fonti */}
                  <section style={{ borderTop: "1px solid #d8e0e8", paddingTop: 12 }}>
                    <h4 style={{ margin: "0 0 6px", fontSize: 13, fontWeight: 700, color: "#334456" }}>Fonti contrattuali considerate</h4>
                    <p style={{ margin: 0, fontSize: 12, color: "#667482" }}>{(lotSummary.sources || []).join(" · ")}</p>
                  </section>
                </div>
              ) : (
                /* Sintesi generica per contratti importati */
                <div style={{ display: "grid", gap: 16 }}>
                  <div style={{ display: "flex", gap: 16, alignItems: "flex-start", padding: 18, background: "#f3f6f8", borderRadius: 9 }}>
                    <div style={{ flex: 1 }}>
                      <p style={{ margin: "0 0 2px", color: "#008b72", fontSize: 11, fontWeight: 900, textTransform: "uppercase" }}>Lotto {dlotId}</p>
                      <h3 style={{ margin: "0 0 6px", fontSize: 16, fontWeight: 800, color: "#102a47" }}>{lot.name || "—"}</h3>
                      <p style={{ margin: 0, color: "#667482", fontSize: 13 }}>Riepilogo ricavato dalla configurazione importata. Per questo contratto non è ancora disponibile una sintesi operativa estesa.</p>
                    </div>
                    <div style={{ textAlign: "center", minWidth: 80, padding: "12px 16px", background: "#fff", borderRadius: 8, border: "1px solid #d8e0e8" }}>
                      <span style={{ display: "block", fontSize: 11, color: "#667482" }}>Voci catalogo</span>
                      <strong style={{ fontSize: 16, color: "#102a47" }}>{catalog.length}</strong>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <section style={{ padding: 16, background: "#f3f6f8", borderRadius: 8 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Documenti</h4>
                      <p style={{ fontSize: 13, margin: "0 0 6px" }}><strong>Capitolato:</strong> {dc.rulesFile || "Non indicato"}</p>
                      <p style={{ fontSize: 13, margin: "0 0 6px" }}><strong>Catalogo:</strong> {lot.catalogFile || "Non caricato"}</p>
                      <p style={{ fontSize: 13, margin: 0 }}><strong>File economico:</strong> {lot.priceFile || "Non caricato"}</p>
                    </section>
                    <section style={{ padding: 16, background: "#f3f6f8", borderRadius: 8 }}>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Configurazione economica</h4>
                      <p style={{ fontSize: 13, margin: "0 0 10px" }}>TOW .5 configurato al <strong>{lot.tow5Share ?? "—"}%</strong>.</p>
                      {Object.keys(towPrices).length > 0
                        ? summaryTable(["TOW", "Valore unitario"], Object.entries(towPrices).map(([tow, price]) => [tow, euro.format(price)]))
                        : <p style={{ fontSize: 13, color: "#9aa7b3" }}>Nessun prezzo TOW disponibile.</p>
                      }
                    </section>
                  </div>
                  {catalog.length > 0 && (
                    <section>
                      <h4 style={{ margin: "0 0 10px", fontSize: 14, fontWeight: 800, color: "#102a47" }}>Voci di catalogo ({catalog.length})</h4>
                      <div style={{ maxHeight: 300, overflowY: "auto", border: "1px solid #d8e0e8", borderRadius: 7 }}>
                        {summaryTable(["ID", "Ambito", "Nome", "Realizzazione S/M/C", "Modifica S/M/C"],
                          catalog.map(e => [
                            e.id ?? e.Id ?? "",
                            e.ambito ?? "",
                            e.nome ?? "",
                            `${euro.format(e.prezzi?.Realizzazione?.Semplice ?? e.prezzi?.realizzazione?.Semplice ?? 0)} / ${euro.format(e.prezzi?.Realizzazione?.Medio ?? e.prezzi?.realizzazione?.Medio ?? 0)} / ${euro.format(e.prezzi?.Realizzazione?.Complesso ?? e.prezzi?.realizzazione?.Complesso ?? 0)}`,
                            `${euro.format(e.prezzi?.Modifica?.Semplice ?? e.prezzi?.modifica?.Semplice ?? 0)} / ${euro.format(e.prezzi?.Modifica?.Medio ?? e.prezzi?.modifica?.Medio ?? 0)} / ${euro.format(e.prezzi?.Modifica?.Complesso ?? e.prezzi?.modifica?.Complesso ?? 0)}`,
                          ])
                        )}
                      </div>
                    </section>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
