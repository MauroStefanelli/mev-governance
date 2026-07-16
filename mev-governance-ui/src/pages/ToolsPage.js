import React, { useState, useEffect, useRef } from "react";
import * as XLSX from "xlsx";
import JSZip from "jszip";

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

const uploadVap = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/tools/upload-vap`, {
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

const debugPdf = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/tools/debug-pdf`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("jwt") || ""}` },
    body: form,
  });
  if (!res.ok) { const text = await res.text(); throw new Error(text); }
  return res.json();
};

const debugVap = async (file) => {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${API_BASE_URL}/api/tools/debug-vap`, {
    method: "POST",
    headers: { Authorization: `Bearer ${localStorage.getItem("jwt") || ""}` },
    body: form,
  });
  if (!res.ok) { const text = await res.text(); throw new Error(text); }
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

const getVerbali = async () => {
  const res = await fetch(`${API_BASE_URL}/api/tools/verbali`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Errore recupero verbali");
  return res.json();
};

const deleteVerbale = async (id) => {
  const res = await fetch(`${API_BASE_URL}/api/tools/verbali/${id}`, {
    method: "DELETE", headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Errore eliminazione verbale");
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
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState(null); // { type: "ok"|"err", text }
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState(null);
  const [confirmDel, setConfirmDel] = useState(null);
  const [debugText, setDebugText] = useState(null);
  const [debugging, setDebugging] = useState(false);
  const [showPdfPanel, setShowPdfPanel] = useState(false);
  const [confirmReplace, setConfirmReplace] = useState(null);
  const [uploadingVap, setUploadingVap] = useState(false);
  const [vapMsg, setVapMsg] = useState(null); // { type: "ok"|"err", text }
  const [verbali, setVerbali] = useState([]);
  const [showVerbaliPanel, setShowVerbaliPanel] = useState(false);
  const [deletingVerbale, setDeletingVerbale] = useState(null);
  const [debugVapResult, setDebugVapResult] = useState(null);
  const [debuggingVap, setDebuggingVap] = useState(false);
  const debugVapRef = useRef();
  const fileRef = useRef();
  const debugRef = useRef();
  const governanceRef = useRef();
  const vapRef = useRef();

  const [governanceBlob, setGovernanceBlob] = useState(null);
  const [exportingGovernance, setExportingGovernance] = useState(false);

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
    // Verbali: caricati separatamente — un errore qui non blocca gli ordini
    try {
      const vaps = await getVerbali();
      setVerbali(vaps);
    } catch { /* tabella VerbaliAvanzamento non ancora creata: ignora */ }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line

  // ── Debug PDF ────────────────────────────────────────────────
  const handleDebug = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setDebugging(true);
    setDebugText(null);
    try {
      const res = await debugPdf(file);
      setDebugText(res.testo);
    } catch (e) {
      setDebugText(`ERRORE: ${e.message}`);
    } finally {
      setDebugging(false);
      if (debugRef.current) debugRef.current.value = "";
    }
  };

  // ── Upload PDF ──────────────────────────────────────────────
  const doUpload = async (file) => {
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

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Se esiste già un PDF con lo stesso nome, chiedi conferma
    const exists = pdfGroups.includes(file.name);
    if (exists) {
      setConfirmReplace({ file });
      if (fileRef.current) fileRef.current.value = "";
      return;
    }
    await doUpload(file);
  };

  const handleReplaceConfirm = async () => {
    const { file } = confirmReplace;
    setConfirmReplace(null);
    setDeleting(file.name);
    try {
      await deleteByPdf(file.name);
    } catch (e) {
      setUploadMsg({ type: "err", text: `Errore eliminazione precedente: ${e.message}` });
      setDeleting(null);
      return;
    }
    setDeleting(null);
    await doUpload(file);
  };

  // ── Upload Verbale Avanzamento (VAP) ─────────────────────────
  const handleVap = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (vapRef.current) vapRef.current.value = "";
    setVapMsg(null);
    setUploadingVap(true);
    try {
      const res = await uploadVap(file);
      setVapMsg({
        type: "ok",
        text: `✔ "${res.nomePdf}" — ${res.meseAvanzamento} — ${res.righeAggiornate} righe aggiornate su ${res.righeElaborate} elaborate`,
      });
      await load();
    } catch (e) {
      setVapMsg({ type: "err", text: `Errore: ${e.message}` });
    } finally {
      setUploadingVap(false);
    }
  };

  const handleDeleteVerbale = async (id) => {
    setDeletingVerbale(id);
    try {
      await deleteVerbale(id);
      setVerbali(prev => prev.filter(v => v.id !== id));
    } catch (e) {
      alert(`Errore eliminazione verbale: ${e.message}`);
    } finally {
      setDeletingVerbale(null);
    }
  };

  const handleDebugVap = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (debugVapRef.current) debugVapRef.current.value = "";
    setDebuggingVap(true);
    setDebugVapResult(null);
    try {
      const res = await debugVap(file);
      setDebugVapResult(res);
    } catch (e) {
      setDebugVapResult({ error: e.message });
    } finally {
      setDebuggingVap(false);
    }
  };

  // ── Esporta in Governance (JSZip: aggiunge sheet senza toccare gli altri) ────
  const handleExportGovernance = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (governanceRef.current) governanceRef.current.value = "";
    setExportingGovernance(true);

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const today = new Date();
        const dd = String(today.getDate()).padStart(2, "0");
        const mm = String(today.getMonth() + 1).padStart(2, "0");
        const yyyy = today.getFullYear();
        const sheetName = `Ordini ${dd}-${mm}-${yyyy}`;

        // Apre il file xlsx come ZIP preservando tutto
        const zip = await JSZip.loadAsync(evt.target.result);

        // Legge workbook.xml per trovare il numero degli sheet esistenti
        const wbXml = await zip.file("xl/workbook.xml").async("string");

        // Trova l'indice del prossimo sheet
        const sheetMatches = [...wbXml.matchAll(/<sheet [^/]*/g)];
        const nextSheetId = sheetMatches.length + 1;
        const rId = `rId${nextSheetId + 10}`; // offset per evitare conflitti con rId esistenti

        // Rimuove sheet con lo stesso nome se esiste già
        const existingMatch = wbXml.match(new RegExp(`<sheet[^>]*name="${sheetName}"[^>]*/>`));
        let cleanWbXml = wbXml;
        if (existingMatch) {
          // Trova l'r:id del vecchio sheet e rimuovilo
          const oldRid = existingMatch[0].match(/r:id="([^"]+)"/)?.[1];
          cleanWbXml = wbXml.replace(existingMatch[0], "");
          if (oldRid) {
            const oldIdx = wbXml.match(new RegExp(`<sheet[^>]*r:id="${oldRid}"[^>]*/>`));
            const sheetNum = oldRid.replace(/\D/g, "");
            zip.remove(`xl/worksheets/sheet${sheetNum}.xml`);
          }
        }

        // Costruisce il nuovo sheet XML
        const headers = [
          "Numero Ordine", "Data", "Data Consegna", "Rif. Contratto",
          "Art.", "Codice", "Descrizione", "Tipo Att.",
          "Q.tà", "UM", "Prezzo Netto", "Importo",
          "Numero RdA", "Iniziativa", "AP", "Contratto",
          "Nome PDF", "Importato Il", "Importato Da"
        ];

        const escapeXml = (v) => String(v ?? "")
          .replace(/&/g, "&amp;").replace(/</g, "&lt;")
          .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");

        const colLetter = (n) => {
          let s = "";
          while (n > 0) { s = String.fromCharCode(((n - 1) % 26) + 65) + s; n = Math.floor((n - 1) / 26); }
          return s;
        };

        let rowsXml = "";
        // Header row
        rowsXml += `<row r="1">`;
        headers.forEach((h, ci) => {
          rowsXml += `<c r="${colLetter(ci + 1)}1" t="inlineStr"><is><t>${escapeXml(h)}</t></is></c>`;
        });
        rowsXml += `</row>`;

        // Data rows
        items.forEach((r, ri) => {
          const rowNum = ri + 2;
          const vals = [
            r.numeroOrdine, r.data, r.dataConsegna, r.rifContratto,
            r.art, r.codice, r.descrizione, r.tipoAtt,
            r.quantita, r.um, r.prezzoNetto, r.importo,
            r.numeroRda, r.iniziativa, r.ap, r.contratto,
            r.nomePdf,
            r.importatoIl ? new Date(r.importatoIl.endsWith("Z") ? r.importatoIl : r.importatoIl + "Z")
              .toLocaleString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "",
            r.importatoDA,
          ];
          rowsXml += `<row r="${rowNum}">`;
          vals.forEach((v, ci) => {
            rowsXml += `<c r="${colLetter(ci + 1)}${rowNum}" t="inlineStr"><is><t>${escapeXml(v)}</t></is></c>`;
          });
          rowsXml += `</row>`;
        });

        const sheetXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rowsXml}</sheetData>
</worksheet>`;

        // Aggiunge il nuovo sheet al ZIP
        const newSheetPath = `xl/worksheets/sheet${nextSheetId}.xml`;
        zip.file(newSheetPath, sheetXml);

        // Aggiorna workbook.xml aggiungendo il riferimento al nuovo sheet
        const sheetEntry = `<sheet name="${sheetName}" sheetId="${nextSheetId}" r:id="${rId}"/>`;
        const updatedWbXml = cleanWbXml.replace("</sheets>", `${sheetEntry}</sheets>`);
        zip.file("xl/workbook.xml", updatedWbXml);

        // Aggiorna workbook.xml.rels
        const relsPath = "xl/_rels/workbook.xml.rels";
        const relsXml = await zip.file(relsPath).async("string");
        const newRel = `<Relationship Id="${rId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${nextSheetId}.xml"/>`;
        const updatedRels = relsXml.replace("</Relationships>", `${newRel}</Relationships>`);
        zip.file(relsPath, updatedRels);

        // Aggiorna [Content_Types].xml
        const ctPath = "[Content_Types].xml";
        const ctXml = await zip.file(ctPath).async("string");
        const newCt = `<Override PartName="/xl/worksheets/sheet${nextSheetId}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
        const updatedCt = ctXml.replace("</Types>", `${newCt}</Types>`);
        zip.file(ctPath, updatedCt);

        // Genera il blob
        const blob = await zip.generateAsync({ type: "blob", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
        const baseName = file.name.replace(/\.(xlsx|xls)$/i, "");
        const suggestedName = `${baseName}_Ordini_${yyyy}${mm}${dd}.xlsx`;

        // Salva il blob nello stato: l'utente cliccherà il pulsante "Salva file"
        // come gesto diretto per aggirare la restrizione di showSaveFilePicker
        setGovernanceBlob({ blob, name: suggestedName });
      } catch (err) {
        alert(`Errore durante l'elaborazione: ${err.message}`);
      } finally {
        setExportingGovernance(false);
      }
    };
    reader.onerror = () => {
      alert("Errore nella lettura del file.");
      setExportingGovernance(false);
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Salva file Governance (chiamato come gesto diretto per showSaveFilePicker) ─
  const handleSaveGovernance = async () => {
    if (!governanceBlob) return;
    const { blob, name } = governanceBlob;
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: name,
          types: [{ description: "Excel", accept: { "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setGovernanceBlob(null);
      } catch (err) {
        if (err.name !== "AbortError") alert(`Errore salvataggio: ${err.message}`);
      }
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setGovernanceBlob(null);
    }
  };

  // ── Export Excel lato backend ────────────────────────────────
  const handleExport = async () => {
    try {
      const r = await fetch(`${API_BASE_URL}/api/tools/export`, { headers: authHeaders() });
      if (!r.ok) {
        const text = await r.text();
        alert(`Errore export: ${r.status} — ${text}`);
        return;
      }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `OrdiniConsegna_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      alert(`Errore durante l'export: ${e.message}`);
    }
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
    r.rifContratto?.toLowerCase().includes(q) ||
    r.iniziativa?.toLowerCase().includes(q)
  );
  const sortedData = [...filtered].sort((a, b) => {
    const ordine = (a.numeroOrdine || "").localeCompare(
      b.numeroOrdine || "",
      "it",
      { numeric: true }
    );

    if (ordine !== 0) return ordine;

    return (a.art || "").localeCompare(
      b.art || "",
      "it",
      { numeric: true }
    );
  });

  // Raggruppa per nomePdf per mostrare il badge del PDF
  const pdfGroups = [...new Set(items.map((i) => i.nomePdf))];

  // Totale ordinato (su righe filtrate)
  const totaleOrdinato = filtered.reduce((s, r) => {
    const n = parseFloat(String(r.importo || "0").replace(/\./g, "").replace(",", "."));
    return s + (isNaN(n) ? 0 : n);
  }, 0);

  const fmtEuro = (n) =>
    new Intl.NumberFormat("it-IT", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <div style={{ padding: "24px 28px", maxWidth: "100%" }}>

      {/* ── Titolo ── */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "20px" }}>
        <div>
          <div style={{ fontSize: "20px", fontWeight: 700, color: "#1a1a1a" }}>
            Tools — Ordini di Consegna e Verbali di Avanzamento
          </div>
          <div style={{ fontSize: "13px", color: "#666", marginTop: "4px" }}>
            Carica un PDF di Buono di Consegna e Verbali di Avanzamento per estrarre gli articoli e salvarli nel database.
          </div>
        </div>
        {items.length > 0 && (
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "flex-end",
            background: "linear-gradient(135deg, #1a73e8 0%, #1557b0 100%)",
            borderRadius: "10px", padding: "12px 22px",
            boxShadow: "0 2px 8px rgba(26,115,232,0.25)", flexShrink: 0, marginLeft: "24px",
          }}>
            <div style={{ fontSize: "14px", fontWeight: 700, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: "4px" }}>
              Totale Ordinato
            </div>
            <div style={{ fontSize: "22px", fontWeight: 800, color: "white", letterSpacing: "0.3px" }}>
              € {fmtEuro(totaleOrdinato)}
            </div>
            {search && (
              <div style={{ fontSize: "10px", color: "rgba(255,255,255,0.6)", marginTop: "2px" }}>
                su {filtered.length} righe filtrate
              </div>
            )}
          </div>
        )}
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
          {uploading ? "Importazione..." : "Carica PDF Ordine"}
          <input ref={fileRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleFile} />
        </label>

        {/* Carica Verbale Avanzamento */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "8px 18px", borderRadius: "7px", cursor: "pointer",
          background: uploadingVap ? "#b0bec5" : "#0f766e",
          color: "white", fontWeight: 600, fontSize: "13px",
          border: "none", boxShadow: "0 1px 4px rgba(15,118,110,0.3)",
          transition: "background 0.15s",
          pointerEvents: uploadingVap ? "none" : "auto",
        }}
          title="Carica un PDF Verbale di Avanzamento per aggiornare Q.tà Avanzata, Importo Fatturabile e Subappalto"
        >
          {uploadingVap ? "Elaborazione..." : "Carica Verbale"}
          <input ref={vapRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleVap} />
        </label>

        {/* Verbali Caricati */}
        <button
          onClick={() => setShowVerbaliPanel(true)}
          disabled={verbali.length === 0}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "7px",
            background: verbali.length === 0 ? "#f1f3f4" : "#f0fdf4",
            color: verbali.length === 0 ? "#aaa" : "#0f766e",
            border: `1px solid ${verbali.length === 0 ? "#dadce0" : "#6ee7b7"}`,
            fontWeight: 600, fontSize: "13px",
            cursor: verbali.length === 0 ? "default" : "pointer",
          }}
          title="Visualizza i verbali di avanzamento caricati"
        >
          Verbali caricati
          {verbali.length > 0 && (
            <span style={{
              background: "#0f766e", color: "white", borderRadius: "10px",
              padding: "1px 7px", fontSize: "11px", fontWeight: 700,
            }}>{verbali.length}</span>
          )}
        </button>

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

        {/* Esporta in Governance */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "8px 18px", borderRadius: "7px",
          background: items.length === 0 || exportingGovernance ? "#ede9fe" : "#6d28d9",
          color: items.length === 0 || exportingGovernance ? "#a78bfa" : "white",
          fontWeight: 600, fontSize: "13px", border: "none",
          boxShadow: items.length === 0 || exportingGovernance ? "none" : "0 1px 4px rgba(109,40,217,0.3)",
          cursor: items.length === 0 || exportingGovernance ? "default" : "pointer",
          pointerEvents: items.length === 0 || exportingGovernance ? "none" : "auto",
          transition: "background 0.15s",
        }}
          title="Seleziona un file Excel esistente: verrà aggiunto uno sheet Ordini con la data odierna"
        >
          {exportingGovernance ? "Elaborazione..." : "Esporta in Governance"}
          <input
            ref={governanceRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: "none" }}
            onChange={handleExportGovernance}
          />
        </label>

        {/* Debug PDF */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "8px 14px", borderRadius: "7px", cursor: "pointer",
          background: debugging ? "#b0bec5" : "#f1f3f4",
          color: "#444", fontWeight: 500, fontSize: "12px",
          border: "1px solid #dadce0",
          pointerEvents: debugging ? "none" : "auto",
        }}
          title="Carica un PDF per vedere il testo grezzo estratto (utile per debug parsing)"
        >
          {debugging ? "Analisi..." : "Debug testo PDF"}
          <input
            ref={debugRef}
            type="file"
            accept=".pdf"
            style={{ display: "none" }}
            onChange={handleDebug}
          />
        </label>

        {/* Debug VAP */}
        <label style={{
          display: "inline-flex", alignItems: "center", gap: "8px",
          padding: "8px 14px", borderRadius: "7px", cursor: "pointer",
          background: debuggingVap ? "#b0bec5" : "#f0fdf4",
          color: "#0f766e", fontWeight: 500, fontSize: "12px",
          border: "1px solid #6ee7b7",
          pointerEvents: debuggingVap ? "none" : "auto",
        }}
          title="Carica un Verbale per vedere cosa trova il parser e cosa matcha nel DB"
        >
          {debuggingVap ? "Analisi..." : "Debug VAP"}
          <input ref={debugVapRef} type="file" accept=".pdf" style={{ display: "none" }} onChange={handleDebugVap} />
        </label>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca Ordine, Contratto, RdA, Iniziativa..."
          style={{
            flex: 1, minWidth: "200px", maxWidth: "380px",
            padding: "8px 12px", border: "1px solid #dadce0",
            borderRadius: "7px", fontSize: "13px", outline: "none",
          }}
        />

        {/* Tasto PDF caricati */}
        <button
          onClick={() => setShowPdfPanel(true)}
          disabled={pdfGroups.length === 0}
          style={{
            display: "inline-flex", alignItems: "center", gap: "6px",
            padding: "8px 14px", borderRadius: "7px",
            background: pdfGroups.length === 0 ? "#f1f3f4" : "#fff8e1",
            color: pdfGroups.length === 0 ? "#aaa" : "#e65100",
            border: `1px solid ${pdfGroups.length === 0 ? "#dadce0" : "#ffcc80"}`,
            fontWeight: 600, fontSize: "13px", cursor: pdfGroups.length === 0 ? "default" : "pointer",
          }}
        >
          📄 PDF caricati
          {pdfGroups.length > 0 && (
            <span style={{
              background: "#e65100", color: "white", borderRadius: "10px",
              padding: "1px 7px", fontSize: "11px", fontWeight: 700,
            }}>{pdfGroups.length}</span>
          )}
        </button>

        <span style={{ fontSize: "12px", color: "#888", marginLeft: "auto" }}>
          {filtered.length} righe {search && `(filtrate su ${items.length})`}
        </span>
      </div>

      {/* ── Banner salvataggio Governance ── */}
      {governanceBlob && (
        <div style={{
          marginBottom: "16px", padding: "12px 18px", borderRadius: "8px",
          background: "#f3e8ff", border: "1px solid #c084fc",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: "12px",
        }}>
          <div style={{ fontSize: "13px", color: "#6d28d9", fontWeight: 500 }}>
            File pronto: <strong>{governanceBlob.name}</strong>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button
              onClick={handleSaveGovernance}
              style={{
                background: "#6d28d9", color: "white", border: "none",
                padding: "8px 18px", borderRadius: "6px", fontSize: "13px",
                fontWeight: 600, cursor: "pointer",
              }}
            >
              Salva file
            </button>
            <button
              onClick={() => setGovernanceBlob(null)}
              style={{
                background: "transparent", color: "#888", border: "none",
                fontSize: "18px", cursor: "pointer", lineHeight: 1,
              }}
            >×</button>
          </div>
        </div>
      )}

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
          <button onClick={() => setUploadMsg(null)}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px", color: "#888" }}>×</button>
        </div>
      )}

      {/* ── Messaggio VAP ── */}
      {vapMsg && (
        <div style={{
          marginBottom: "16px", padding: "10px 16px", borderRadius: "7px",
          fontSize: "13px", fontWeight: 500,
          background: vapMsg.type === "ok" ? "#e0f2f1" : "#fce8e6",
          color: vapMsg.type === "ok" ? "#0f766e" : "#c5221f",
          border: `1px solid ${vapMsg.type === "ok" ? "#99d6d0" : "#f5c6c4"}`,
          display: "flex", justifyContent: "space-between", alignItems: "center",
        }}>
          <span>{vapMsg.text}</span>
          <button onClick={() => setVapMsg(null)}
            style={{ border: "none", background: "none", cursor: "pointer", fontSize: "16px", color: "#888" }}>×</button>
        </div>
      )}

      {/* ── Pannello debug testo PDF ── */}
      {debugText !== null && (
        <div style={{ marginBottom: "16px" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#263238", color: "#80cbc4", padding: "8px 14px",
            borderRadius: "7px 7px 0 0", fontSize: "12px", fontWeight: 600,
          }}>
            <span>Testo grezzo estratto dal PDF ({debugText.length} caratteri)</span>
            <button onClick={() => setDebugText(null)}
              style={{ border: "none", background: "none", color: "#aaa", cursor: "pointer", fontSize: "16px" }}>×</button>
          </div>
          <pre style={{
            background: "#1e272c", color: "#e0e0e0", padding: "14px",
            borderRadius: "0 0 7px 7px", fontSize: "11px", lineHeight: 1.6,
            maxHeight: "400px", overflowY: "auto", whiteSpace: "pre-wrap",
            wordBreak: "break-word", margin: 0,
          }}>
            {debugText}
          </pre>
        </div>
      )}

      {/* ── Pannello debug VAP ── */}
      {debugVapResult !== null && (
        <div style={{ marginBottom: "16px", border: "1px solid #6ee7b7", borderRadius: "8px", overflow: "hidden" }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "center",
            background: "#0f766e", color: "white", padding: "8px 14px",
            fontSize: "12px", fontWeight: 600,
          }}>
            <span>Debug VAP — {debugVapResult.error ? "ERRORE" : `${debugVapResult.righe?.length || 0} righe trovate / Mese: ${debugVapResult.meseAvanzamento || "—"}`}</span>
            <button onClick={() => setDebugVapResult(null)}
              style={{ border: "none", background: "none", color: "white", cursor: "pointer", fontSize: "16px" }}>×</button>
          </div>
          {debugVapResult.error ? (
            <div style={{ padding: "12px 14px", color: "#c5221f", fontSize: "12px" }}>{debugVapResult.error}</div>
          ) : (debugVapResult.righe || []).length === 0 ? (
            <div style={{ padding: "12px 14px" }}>
              <div style={{ color: "#c5221f", fontSize: "12px", marginBottom: "10px" }}>
                Nessuna riga parsata. Testo grezzo estratto dal PDF (prime 80 righe non vuote):
              </div>
              <textarea
                readOnly
                value={(debugVapResult.righeGrezze || []).join("\n")}
                style={{
                  width: "100%", height: "300px", fontFamily: "monospace",
                  fontSize: "11px", border: "1px solid #ccc", borderRadius: "4px",
                  padding: "8px", boxSizing: "border-box", background: "#fafafa",
                  resize: "vertical",
                }}
              />
            </div>
          ) : (
            <table style={{ width: "100%", fontSize: "11px", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f0fdf4" }}>
                  {["ODA","POS (int)","QTA","Importo","Sub","Rec. in DB","Art in DB","Matched"].map(h => (
                    <th key={h} style={{ padding: "6px 10px", textAlign: "left", borderBottom: "1px solid #6ee7b7", whiteSpace: "nowrap" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(debugVapResult.righe || []).map((r, i) => (
                  <tr key={i} style={{ background: r.matched > 0 ? "#f0fdf4" : "#fff5f5", borderBottom: "1px solid #e0e0e0" }}>
                    <td style={{ padding: "5px 10px", fontFamily: "monospace" }}>{r.oda}</td>
                    <td style={{ padding: "5px 10px", textAlign: "center" }}>{r.pos} ({r.posInt})</td>
                    <td style={{ padding: "5px 10px" }}>{r.qta}</td>
                    <td style={{ padding: "5px 10px" }}>{r.importo}</td>
                    <td style={{ padding: "5px 10px", textAlign: "center" }}>{r.subappalto}</td>
                    <td style={{ padding: "5px 10px", textAlign: "center" }}>{r.recordInDb}</td>
                    <td style={{ padding: "5px 10px", fontFamily: "monospace", color: "#555" }}>{(r.artValuesInDb || []).join(", ")}</td>
                    <td style={{ padding: "5px 10px", textAlign: "center", fontWeight: 700, color: r.matched > 0 ? "#0f766e" : "#c5221f" }}>{r.matched}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Tabella ── */}
      {loading ? (
        <div style={{ padding: "40px", textAlign: "center", color: "#888" }}>
          Caricamento...
        </div>
      ) : filtered.length === 0 ? (
        <div
          style={{
            padding: "60px 40px",
            textAlign: "center",
            color: "#aaa",
            border: "2px dashed #e0e0e0",
            borderRadius: "10px",
          }}
        >
          {items.length === 0
            ? "Nessun ordine importato. Carica un PDF per iniziare."
            : "Nessun risultato per la ricerca corrente."}
        </div>
      ) : (
        <div
          style={{
            overflowX: "auto",
            overflowY: "auto",
            height: "600px",
            borderRadius: "10px",
            boxShadow: "0 1px 4px rgba(0,0,0,0.08)",
          }}
        >
          <table
            style={{
              width: "100%",
              borderCollapse: "separate",
              borderSpacing: 0,
              fontSize: "14px",
              background: "white",
            }}
          >
            <thead>
              <tr>
                {[
                  "N. Ordine",
                  "Data",
                  "Contratto",
                  "N. RdA",
                  "Iniziativa",
                  "Art.",
                  "TOW",
                  "Tipo",
                  "Q.tà",
                  "UM",
                  "Prezzo Netto",
                  "Importo",
                  "AP",
                  "Mese Avanzamento",
                  "Q.tà Avanzata",
                  "Importo Fatturabile",
                  "Subappalto",
                ].map((h) => (
                  <th
                    key={h}
                    style={{
                      position: "sticky",
                      top: 0,
                      zIndex: 100,
                      background: "#1a73e8",
                      color: "white",
                      padding: "10px 8px",
                      fontWeight: 600,
                      textAlign: "center",
                      whiteSpace: "nowrap",
                      borderBottom: "2px solid #1557b0",
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {sortedData.map((r, idx) => (
                <tr
                  key={r.id}
                  style={{
                    background: idx % 2 === 0 ? "white" : "#f8f9ff",
                    borderBottom: "1px solid #f0f0f0",
                  }}
                  onMouseEnter={(e) =>
                    (e.currentTarget.style.background = "#e8f0fe")
                  }
                  onMouseLeave={(e) =>
                  (e.currentTarget.style.background =
                    idx % 2 === 0 ? "white" : "#f8f9ff")
                  }
                >
                  <td style={{ ...tdStyle, textAlign: "center" }}>{r.numeroOrdine}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>{r.data}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>{r.contratto}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>{r.numeroRda}</td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "center",
                      fontWeight: 600,
                    }}
                  >
                    {r.iniziativa}
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>{r.art}</td>

                  <td
                    style={{
                      ...tdStyle,
                      fontFamily: "monospace", textAlign: "center",
                    }}
                  >
                    {r.codice}
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <span
                      style={{
                        background:
                          r.tipoAtt === "AP"
                            ? "#e8f5e9"
                            : r.tipoAtt === "AR"
                              ? "#e3f2fd"
                              : "#fff3e0",
                        color:
                          r.tipoAtt === "AP"
                            ? "#1e8e3e"
                            : r.tipoAtt === "AR"
                              ? "#1565c0"
                              : "#e65100",
                        padding: "2px 7px",
                        borderRadius: "12px",
                        fontWeight: 600,
                        fontSize: "11px",
                      }}
                    >
                      {r.tipoAtt}
                    </span>
                  </td>

                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    {r.quantita}
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>{r.um}</td>

                  <td style={{ ...tdStyle, textAlign: "right" }}>
                    € {fmt(r.prezzoNetto)}
                  </td>

                  <td
                    style={{
                      ...tdStyle,
                      textAlign: "right",
                      fontWeight: 600,
                    }}
                  >
                    € {fmt(r.importo)}
                  </td>

                  <td style={{ ...tdStyle, textAlign: "center" }}>{r.ap}</td>
                  <td style={{ ...tdStyle, textAlign: "center", color: r.meseAvanzamento ? "#0f766e" : "#ccc" }}>
                    {r.meseAvanzamento || "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", color: r.qtaAvanzata ? "#0f766e" : "#ccc" }}>
                    {r.qtaAvanzata || "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", fontWeight: r.importoFatturabile ? 600 : 400, color: r.importoFatturabile ? "#0f766e" : "#ccc" }}>
                    {r.importoFatturabile ? `€ ${fmt(r.importoFatturabile)}` : "—"}
                  </td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    {r.subappalto ? (
                      <span style={{
                        background: r.subappalto === "SI" ? "#fef3c7" : "#f0fdf4",
                        color: r.subappalto === "SI" ? "#92400e" : "#166534",
                        padding: "2px 8px", borderRadius: "10px", fontWeight: 600, fontSize: "11px",
                      }}>{r.subappalto}</span>
                    ) : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Modale PDF caricati ── */}
      {showPdfPanel && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "white", borderRadius: "12px", padding: "28px 32px",
            width: "520px", maxHeight: "70vh", display: "flex", flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#1a1a1a" }}>
                PDF caricati ({pdfGroups.length})
              </div>
              <button onClick={() => setShowPdfPanel(false)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: "20px", color: "#888" }}>×</button>
            </div>
            <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
              {pdfGroups.map((pdf) => {
                const count = items.filter((i) => i.nomePdf === pdf).length;
                const importo = items
                  .filter((i) => i.nomePdf === pdf)
                  .reduce((s, r) => {
                    const n = parseFloat(String(r.importo || "0").replace(/\./g, "").replace(",", "."));
                    return s + (isNaN(n) ? 0 : n);
                  }, 0);
                return (
                  <div key={pdf} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", borderRadius: "8px",
                    border: "1px solid #e2e8f0", background: "#f8fafc",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#1a1a1a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        📄 {pdf}
                      </div>
                      <div style={{ fontSize: "11px", color: "#888", marginTop: "2px" }}>
                        {count} righe — € {fmtEuro(importo)}
                      </div>
                    </div>
                    <button
                      onClick={() => { setShowPdfPanel(false); setConfirmDel(pdf); }}
                      disabled={deleting === pdf}
                      title={`Elimina tutte le righe di "${pdf}"`}
                      style={{
                        marginLeft: "12px", border: "1px solid #fecaca", background: "#fef2f2",
                        color: "#ea4335", borderRadius: "6px", padding: "5px 10px",
                        cursor: "pointer", fontSize: "12px", fontWeight: 600,
                      }}
                    >Elimina</button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ── Modale Verbali Caricati ── */}
      {showVerbaliPanel && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "white", borderRadius: "12px", padding: "28px 32px",
            width: "560px", maxHeight: "72vh", display: "flex", flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "#0f766e" }}>
                Verbali di Avanzamento caricati ({verbali.length})
              </div>
              <button onClick={() => setShowVerbaliPanel(false)}
                style={{ border: "none", background: "none", cursor: "pointer", fontSize: "20px", color: "#888" }}>×</button>
            </div>
            {verbali.length === 0 ? (
              <div style={{ color: "#888", fontSize: "13px", textAlign: "center", padding: "24px 0" }}>
                Nessun verbale caricato.
              </div>
            ) : (
              <div style={{ overflowY: "auto", display: "flex", flexDirection: "column", gap: "8px" }}>
                {verbali.map((v) => (
                  <div key={v.id} style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", borderRadius: "8px",
                    border: "1px solid #d1fae5", background: "#f0fdf4",
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: "13px", fontWeight: 600, color: "#0f766e", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {v.nomePdf}
                      </div>
                      <div style={{ fontSize: "11px", color: "#555", marginTop: "3px" }}>
                        <span style={{ fontWeight: 600 }}>{v.meseAvanzamento || "—"}</span>
                        {" · "}
                        {v.righeAggiornate}/{v.righeElaborate} righe aggiornate
                        {" · "}
                        {fmtDate(v.caricatoIl)} da <em>{v.caricatoDa}</em>
                      </div>
                    </div>
                    <button
                      onClick={() => handleDeleteVerbale(v.id)}
                      disabled={deletingVerbale === v.id}
                      title="Elimina questo verbale dal registro (non annulla i dati già aggiornati)"
                      style={{
                        marginLeft: "12px", border: "1px solid #fecaca", background: "#fef2f2",
                        color: "#ea4335", borderRadius: "6px", padding: "5px 10px",
                        cursor: "pointer", fontSize: "12px", fontWeight: 600,
                        opacity: deletingVerbale === v.id ? 0.5 : 1,
                      }}
                    >{deletingVerbale === v.id ? "..." : "Elimina"}</button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Modale conferma sostituzione PDF ── */}
      {confirmReplace && (
        <div style={{
          position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)",
          zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <div style={{
            background: "white", borderRadius: "12px", padding: "28px 32px",
            width: "420px", boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
          }}>
            <div style={{ fontSize: "16px", fontWeight: 700, color: "#e65100", marginBottom: "14px" }}>
              PDF già presente
            </div>
            <div style={{ fontSize: "13px", color: "#333", marginBottom: "20px", lineHeight: 1.6 }}>
              Il file <strong>"{confirmReplace.file.name}"</strong> è già stato caricato in precedenza.<br />
              I dati esistenti verranno <strong>eliminati</strong> e sostituiti con quelli del nuovo file.<br /><br />
              Vuoi procedere?
            </div>
            <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
              <button
                onClick={() => setConfirmReplace(null)}
                style={{
                  padding: "8px 18px", borderRadius: "6px", border: "1px solid #dadce0",
                  background: "#f1f3f4", color: "#444", cursor: "pointer", fontSize: "13px",
                }}
              >Annulla</button>
              <button
                onClick={handleReplaceConfirm}
                style={{
                  padding: "8px 18px", borderRadius: "6px", border: "none",
                  background: "#e65100", color: "white", cursor: "pointer",
                  fontSize: "13px", fontWeight: 600,
                }}
              >Sostituisci</button>
            </div>
          </div>
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
