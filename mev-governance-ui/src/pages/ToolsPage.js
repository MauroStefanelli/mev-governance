import React, { useState, useEffect, useRef } from "react";

const API_BASE_URL = process.env.REACT_APP_API_URL || "";

const authHeaders = () => ({
  Authorization: `Bearer ${localStorage.getItem("jwt") || ""}`,
});

// ============================================================
// SERVICE CALLS
// ============================================================

const getOrdini = async () => {
  const res = await fetch(`${API_BASE_URL}/api/tools/ordini`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Errore recupero ordini");
  return res.json();
};

const uploadPdf = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/tools/upload-pdf`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("jwt") || ""}` },
    body: form,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }
  return res.json();
};

const deleteByPdf = async (nomePdf) => {
  const res = await fetch(
    `${API_BASE_URL}/api/tools/ordini/by-pdf/${encodeURIComponent(nomePdf)}`,
    { method: "DELETE", headers: authHeaders() }
  );
  if (!res.ok) throw new Error("Errore eliminazione");
  return res.json();
};

// ============================================================
// HELPERS UI
// ============================================================

const fmt = (v) => {
  if (v === null || v === undefined || v === "") return "";
  const n = parseFloat(String(v).replace(/\./g, "").replace(",", "."));
  if (isNaN(n)) return v;
  return new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
};

const fmtDate = (iso) => {
  if (!iso) return "";
  return new Date(iso.endsWith("Z") ? iso : iso + "Z").toLocaleString("it-IT", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
};

// ============================================================
// COMPONENTE PRINCIPALE
// ============================================================

export default function ToolsPage({ onUnauthorized }) {
  const [items, setItems]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null); // { type: "ok"|"err", text }
  const [search, setSearch]       = useState("");
  const [deleting, setDeleting]   = useState(null); // nomePdf in corso di eliminazione
  const [confirmDel, setConfirmDel] = useState(null); // nomePdf da confermare
  const fileRef = useRef();

  const load = async () => {
    setLoading(true);
    try {
      const data = await getOrdini();
      setItems(data);
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  // ── Upload PDF ──────────────────────────────────────────────
  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadMsg(null);
    setUploading(true);
    try {
      const res = await uploadPdf(file);
      setUploadMsg({
        type: "ok",
        text: `✔ "${res.nomePdf}" importato — Ordine ${res.numeroOrdine} — ${res.articoliSalvati} articoli salvati`,
      });
      await load();
    } catch (e) {
      setUploadMsg({ type: "err", text: `Errore: ${e.message}` });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Export Excel lato backend ────────────────────────────────
  const handleExport = () => {
    const a = document.createElement("a");
    a.href = `${API_BASE_URL}/api/tools/export`;
    a.setAttribute("download", "");
    // header Authorization via fetch + blob
    fetch(`${API_BASE_URL}/api/tools/export`, { headers: authHeaders() })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        a.download = `OrdiniConsegna_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => alert("Errore durante l'export"));
  };

  // ── Elimina tutte le righe di un PDF ────────────────────────
  const handleDeletePdf = async (nomePdf) => {
    setConfirmDel(null);
    setDeleting(nomePdf);
    try {
      await deleteByPdf(nomePdf);
      await load();
    } catch (e) {
      alert(`Errore eliminazione: ${e.message}`);
    } finally {
      setDeleting(null);
    }
  };

  // ── Filtraggio righe ─────────────────────────────────────────
  const q = search.toLowerCase();
  const filtered = items.filter((r) =>
    !q ||
    r.numeroOrdine?.toLowerCase().includes(q) ||
    r.codice?.toLowerCase().includes(q) ||
    r.descrizione?.toLowerCase().includes(q) ||
    r.numeroRda?.toLowerCase().includes(q) ||
    r.nomePdf?.toLowerCase().includes(q) ||
    r.rifContratto?.toLowerCase().includes(q)
  );

  // Raggruppa per nomePdf per mostrare il badge del PDF
  const pdfGroups = [...new Set(items.map((i) => i.nomePdf))];

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={{ padding: "24px 28px", maxWidth: "100%" }}>

      {/* ── Titolo ── */}
      <div style={{ marginBottom: "20px" }}>
        <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>
          Tools — Ordini di Consegna
        </div>
        <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
          Carica un PDF di Buono di Consegna per estrarre gli articoli e salvarli nel database.
          Accesso riservato agli Amministratori.
        </div>
      </div>

      {/* ── Barra azioni ── */}
      <div style={{
        display: "flex", alignItems: "center", gap: "12px",
        flexWrap: "wrap", marginBottom: "20px",
      }}>
        {/* Upload PDF */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "8px 18px", borderRadius: "7px", cursor: "pointer",
          background: uploading ? "#b0bec5" : "#1a73e8",
          color: "white", fontWeight: 600, fontSize: "13px",
          border: "none", boxShadow: "0 1px 4px rgba(26,115,232,0.3)",
          transition: "background 0.15s",
          pointerEvents: uploading ? "none" : "auto",
        }}>
          {uploading ? "Importazione..." : "Carica PDF"}
          <input
            ref={fileRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={handleFile}
          />
        </label>

        {/* Export Excel */}
        <button
          onClick={handleExport}
          disabled={items.length === 0}
          style={{
            display: "inline-flex", alignItems: "center", gap: "8px",
            padding: "8px 18px", borderRadius: "7px", cursor: items.length === 0 ? "default" : "pointer",
            background: items.length === 0 ? "#e8f5e9" : "#34a853",
            color: items.length === 0 ? "#aaa" : "white",
            fontWeight: 600, fontSize: "13px", border: "none",
            boxShadow: items.length === 0 ? "none" : "0 1px 4px rgba(52,168,83,0.3)",
            transition: "background 0.15s",
          }}
        >
          Esporta Excel
        </button>

        {/* Ricerca */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca ordine, codice, descrizione, RdA..."
          style={{
            flex: 1, minWidth: "200px", maxWidth: "380px",
            padding: "8px 12px", border: "1px solid #dadce0",
            borderRadius: "7px", fontSize: "13px", outline: "none",
          }}
        />

        <span style={{ fontSize: "12px", color: "#888", marginLeft: "auto" }}>
          {filtered.length} righe {search && `(filtrate su ${items.length})`}
        </span>
      </div>

      {/* ── Messaggio upload ── */}
      {uploadMsg && (
        <div style={{
          marginBottom: "16px", padding: "10px 16px", borderRadius: "7px",
          fontSize: "13px", fontWeight: 500,
          background: uploadMsg.type === "ok" ? "#e6f4ea" : "#fce8e6",
          color: uploadMsg.type === "ok" ? "#1e8e3e" : "#c5221f",
          border: `1px solid ${uploadMsg.type === "ok" ? "#a8d5b5" : "#f5c6c4"}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{uploadMsg.text}</span>
          <button
            onClick={() => setUploadMsg(null)}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px", color: "#888" }}
          >×</button>
        </div>
      )}

      {/* ── PDF caricati (badge) ── */}
      {pdfGroups.length > 0 && (
        <div style={{ marginBottom: "14px", display: "flex", gap: "8px", flexWrap: "wrap" }}>
          {pdfGroups.map((pdf) => {
            const count = items.filter((i) => i.nomePdf === pdf).length;
            return (
              <div key={pdf} style={{
                display: "inline-flex", alignItems: "center", gap: "6px",
                background: "#f1f3f4", border: "1px solid #dadce0",
                borderRadius: "20px", padding: "4px 10px 4px 12px", fontSize: "12px",
              }}>
                <span style={{ color: "#333" }}>
                  📄 {pdf} <span style={{ color: "#888" }}>({count})</span>
                </span>
                <button
                  onClick={() => setConfirmDel(pdf)}
                  disabled={deleting === pdf}
                  title={`Elimina tutte le righe di "${pdf}"`}
                  style={{
                    border: "none", background: "none", cursor: "pointer",
                    color: "#ea4335", fontSize: "14px", lineHeight: 1, padding: "0 2px",
                  }}
                >×</button>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Tabella ── */}
      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>Caricamento...</div>
      ) : filtered.length === 0 ? (
        <div style={{
          padding: "60px 40px", textAlign: "center", color: "#aaa",
          border: "2px dashed #e0e0e0", borderRadius: "10px",
        }}>
          {items.length === 0
            ? "Nessun ordine importato. Carica un PDF per iniziare."
            : "Nessun risultato per la ricerca corrente."}
        </div>
      ) : (
        <div style={{ overflowX: "auto", borderRadius: "10px", boxShadow: "0 1px 4px rgba(0,0,0,0.08)" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "12px", background: "white" }}>
            <thead>
              <tr style={{ background: "#1a73e8", color: "white" }}>
                {[
                  "N. Ordine", "Data", "D. Consegna", "Rif. Contr.",
                  "Art.", "Codice", "Descrizione", "Tipo",
                  "Q.tà", "UM", "Prezzo Netto", "Importo",
                  "N. RdA", "Iniziativa", "AP", "Contratto",
                  "PDF", "Importato"
                ].map((h) => (
                  <th key={h} style={{
                    padding: "10px 8px", fontWeight: 600, textAlign: "left",
                    whiteSpace: "nowrap", borderBottom: "2px solid #1557b0",
                  }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, idx) => (
                <tr
                  key={r.id}
                  style={{
                    background: idx % 2 === 0 ? "white" : "#f8f9ff",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "#e8f0fe")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = idx % 2 === 0 ? "white" : "#f8f9ff")}
                >
                  <td style={tdStyle}>{r.numeroOrdine}</td>
                  <td style={tdStyle}>{r.data}</td>
                  <td style={tdStyle}>{r.dataConsegna}</td>
                  <td style={tdStyle}>{r.rifContratto}</td>
                  <td style={tdStyle}>{r.art}</td>
                  <td style={{ ...tdStyle, fontFamily: "monospace" }}>{r.codice}</td>
                  <td style={{ ...tdStyle, maxWidth: "260px", whiteSpace: "normal", wordBreak: "break-word" }}>
                    {r.descrizione}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span style={{
                      background: r.tipoAtt === "AP" ? "#e8f5e9" : r.tipoAtt === "AR" ? "#e3f2fd" : "#fff3e0",
                      color: r.tipoAtt === "AP" ? "#1e8e3e" : r.tipoAtt === "AR" ? "#1565c0" : "#e65100",
                      padding: "2px 7px", borderRadius: "12px", fontWeight: 600, fontSize: "11px",
                    }}>{r.tipoAtt}</span>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{r.quantita}</td>
                  <td style={tdStyle}>{r.um}</td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>€ {fmt(r.prezzoNetto)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: 600 }}>€ {fmt(r.importo)}</td>
                  <td style={tdStyle}>{r.numeroRda}</td>
                  <td style={tdStyle}>{r.iniziativa}</td>
                  <td style={tdStyle}>{r.ap}</td>
                  <td style={tdStyle}>{r.contratto}</td>
                  <td style={{ ...tdStyle, fontSize: "11px", color: "#666", maxWidth: "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                    title={r.nomePdf}>
                    {r.nomePdf}
                  </td>
                  <td style={{ ...tdStyle, fontSize: "11px", color: "#888", whiteSpace: "nowrap" }}>
                    {fmtDate(r.importatoIl)}<br />
                    <span style={{ color: "#aaa" }}>{r.importatoDA}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modale conferma eliminazione ── */}
      {confirmDel && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "white", borderRadius: "12px", padding: "28px 32px",
            width: "400px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#ea4335", marginBottom: "14px" }}>
              Conferma eliminazione
            </div>
            <div style={{ fontSize: "13px", color: "#333", marginBottom: "20px", lineHeight: 1.5 }}>
              Vuoi eliminare tutte le righe importate dal file:<br />
              <strong>"{confirmDel}"</strong>?<br />
              L'operazione non può essere annullata.
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmDel(null)}
                style={{
                  padding: "8px 18px", borderRadius: "6px", border: "1px solid #dadce0",
                  background: "#f1f3f4", color: "#444", cursor: "pointer", fontSize: "13px",
                }}
              >Annulla</button>
              <button
                onClick={() => handleDeletePdf(confirmDel)}
                style={{
                  padding: "8px 18px", borderRadius: "6px", border: "none",
                  background: "#ea4335", color: "white", cursor: "pointer",
                  fontSize: "13px", fontWeight: 600,
                }}
              >Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const tdStyle = {
  padding: "8px 8px",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
};
