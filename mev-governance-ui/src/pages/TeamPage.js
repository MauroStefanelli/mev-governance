import { useEffect, useState, useCallback } from "react";
import * as XLSX from "xlsx";
import { getTeam, createTeamMember, updateTeamMember, deleteTeamMember, importTeam } from "../services/mevService";

// ── Stili condivisi ────────────────────────────────────────────────────────────
const TH = {
  padding: "9px 8px", textAlign: "left", fontWeight: 600, fontSize: "12px",
  color: "#444", whiteSpace: "nowrap", borderBottom: "2px solid #dadce0",
  background: "#f8f9fa", position: "sticky", top: 0, zIndex: 2,
};
const TD = {
  padding: "7px 8px", fontSize: "13px", color: "#333",
  borderBottom: "1px solid #f0f0f0", verticalAlign: "middle",
};
const btn = (variant = "primary") => ({
  padding: "5px 12px", borderRadius: "6px", fontSize: "12px", fontWeight: 600,
  cursor: "pointer", border: "none",
  background: variant === "primary" ? "#1a73e8" : variant === "danger" ? "#ea4335" : variant === "success" ? "#34a853" : "#f1f3f4",
  color: variant === "ghost" ? "#555" : "white",
});

const EMPTY_FORM = {
  risorsa: "", ambito: "", specialita: "", posteApplication: "",
  note: "", risorsaGrade: "", grade: "", cdc: "", practice: "",
  adrc: "", cor: "", corpId: "", email: "",
};

const COLS = [
  { key: "risorsa",          label: "Risorsa",             required: true },
  { key: "ambito",           label: "Ambito" },
  { key: "specialita",       label: "Specialità" },
  { key: "posteApplication", label: "Poste Application" },
  { key: "note",             label: "Note" },
  { key: "risorsaGrade",     label: "Risorse GRADE" },
  { key: "grade",            label: "GRADE" },
  { key: "cdc",              label: "CDC" },
  { key: "practice",         label: "Practice" },
  { key: "adrc",             label: "ADRC" },
  { key: "cor",              label: "COR" },
  { key: "corpId",           label: "Corp ID" },
  { key: "email",            label: "E-mail" },
];

// Mappa nomi colonne Excel (foglio TEAM) → chiavi del form
const EXCEL_COL_MAP = {
  "risorse":             "risorsa",
  "risorsa":             "risorsa",
  "ambito":              "ambito",
  "specialità":          "specialita",
  "specialita":          "specialita",
  "poste application":   "posteApplication",
  "note":                "note",
  "risorse grade":       "risorsaGrade",
  "risorse_grade":       "risorsaGrade",
  "grade":               "grade",
  "cdc":                 "cdc",
  "practice":            "practice",
  "adrc":                "adrc",
  "cor":                 "cor",
  "corp id":             "corpId",
  "corp_id":             "corpId",
  "corpid":              "corpId",
  "e-mail address":      "email",
  "email address":       "email",
  "email":               "email",
  "e-mail":              "email",
};

function normalize(s) {
  return String(s ?? "").trim().toLowerCase();
}

// ── Modale add/edit ────────────────────────────────────────────────────────────
function MemberModal({ initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.risorsa.trim()) { alert("Il campo Risorsa è obbligatorio"); return; }
    setSaving(true);
    try { await onSave(form); onClose(); }
    catch (e) { alert(`Errore: ${e.message}`); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: "#fff", borderRadius: "12px", padding: "24px 28px", width: "min(700px, 96vw)", maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
          <h3 style={{ margin: 0, fontSize: "16px", fontWeight: 700, color: "#1a1a2e" }}>
            {initial ? "Modifica membro" : "Nuovo membro"}
          </h3>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: "20px", cursor: "pointer", color: "#666" }}>×</button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {COLS.map(col => (
            <div key={col.key} style={{ width: col.key === "note" ? "100%" : "calc(33% - 8px)", minWidth: "150px" }}>
              <label style={{ display: "block", fontSize: "11px", fontWeight: 600, color: "#555", marginBottom: "3px", textTransform: "uppercase", letterSpacing: "0.4px" }}>
                {col.label}{col.required && <span style={{ color: "#ea4335" }}> *</span>}
              </label>
              {col.key === "note" ? (
                <textarea value={form[col.key] ?? ""} onChange={e => set(col.key, e.target.value)} rows={2}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "13px", resize: "vertical", boxSizing: "border-box" }} />
              ) : (
                <input value={form[col.key] ?? ""} onChange={e => set(col.key, e.target.value)}
                  style={{ width: "100%", padding: "6px 8px", border: "1px solid #dadce0", borderRadius: "4px", fontSize: "13px", boxSizing: "border-box" }} />
              )}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "20px" }}>
          <button onClick={onClose} style={btn("ghost")}>Annulla</button>
          <button onClick={handleSave} disabled={saving} style={btn("primary")}>{saving ? "Salvataggio…" : "Salva"}</button>
        </div>
      </div>
    </div>
  );
}

// ── Componente principale ──────────────────────────────────────────────────────
export default function TeamPage({ onUnauthorized, ambienteId }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState(null); // null | { mode: "create" } | { mode: "edit", row }
  const [confirmDelete, setConfirmDelete] = useState(null); // row da eliminare
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getTeam();
      setRows(data);
    } catch (e) {
      if (e.message === "401") onUnauthorized?.();
    } finally {
      setLoading(false);
    }
  }, [ambienteId]); // eslint-disable-line

  useEffect(() => { load(); }, [load]);

  // ── Filtro ricerca ─────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return COLS.some(c => String(r[c.key] ?? "").toLowerCase().includes(q));
  });

  // ── Save (create / update) ─────────────────────────────────────────────────
  const handleSave = async (form) => {
    if (modal.mode === "create") {
      const created = await createTeamMember(form);
      setRows(prev => [...prev, created].sort((a, b) => a.risorsa.localeCompare(b.risorsa)));
    } else {
      const updated = await updateTeamMember(modal.row.id, form);
      setRows(prev => prev.map(r => r.id === modal.row.id ? updated : r));
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async (row) => {
    try {
      await deleteTeamMember(row.id);
      setRows(prev => prev.filter(r => r.id !== row.id));
    } catch (e) {
      alert(`Errore eliminazione: ${e.message}`);
    }
    setConfirmDelete(null);
  };

  // ── Import da Excel ────────────────────────────────────────────────────────
  const handleImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setImporting(true);
    setImportResult(null);

    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(ev.target.result, { type: "array" });
        // Cerca il foglio che inizia con "TEAM" (es. "TEAM LAVORO", "TEAM", ecc.)
        const sheetName = wb.SheetNames.find(n => n.trim().toUpperCase().startsWith("TEAM"));
        if (!sheetName) {
          alert(`Foglio con nome che inizia per "TEAM" non trovato.\nFogli presenti: ${wb.SheetNames.join(", ")}`);
          setImporting(false);
          return;
        }
        const ws = wb.Sheets[sheetName];

        // Prova prima sheet_to_json standard (prima riga = header)
        let jsonRows = XLSX.utils.sheet_to_json(ws, { defval: "" });

        // Se nessuna riga ha una chiave mappabile, prova a cercare la riga header
        // scorrendo le prime 10 righe del foglio (gestisce tabelle con titolo sopra)
        const hasMappable = (rows) => rows.some(row =>
          Object.keys(row).some(k => EXCEL_COL_MAP[normalize(k)])
        );

        if (jsonRows.length === 0 || !hasMappable(jsonRows)) {
          const rawRows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
          let headerIdx = -1;
          for (let i = 0; i < Math.min(10, rawRows.length); i++) {
            const row = rawRows[i];
            if (row.some(cell => EXCEL_COL_MAP[normalize(cell)])) {
              headerIdx = i;
              break;
            }
          }
          if (headerIdx >= 0) {
            const headers = rawRows[headerIdx];
            jsonRows = rawRows.slice(headerIdx + 1).map(row => {
              const obj = {};
              headers.forEach((h, i) => { obj[h] = row[i] ?? ""; });
              return obj;
            });
          }
        }

        const mapped = jsonRows.map(row => {
          const out = { ...EMPTY_FORM };
          for (const [excelKey, val] of Object.entries(row)) {
            const mapped = EXCEL_COL_MAP[normalize(excelKey)];
            if (mapped) out[mapped] = String(val ?? "").trim();
          }
          return out;
        }).filter(r => r.risorsa.trim() !== ""); // salta righe senza Risorsa

        if (mapped.length === 0) {
          alert("Nessuna riga valida trovata nel foglio TEAM (campo Risorsa obbligatorio).");
          setImporting(false);
          return;
        }

        console.log("[TeamImport] righe mappate:", mapped.length, mapped.slice(0, 3));
        const result = await importTeam(mapped);
        setImportResult(`Importati ${result.imported} membri.`);
        await load();
      } catch (err) {
        alert(`Errore importazione: ${err.message}`);
      } finally {
        setImporting(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  if (loading) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "200px", color: "#666", fontSize: "15px" }}>
      Caricamento Team…
    </div>
  );

  return (
    <div style={{ padding: "20px 24px", maxWidth: "1600px", margin: "0 auto" }}>

      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "12px", marginBottom: "18px" }}>
        <div>
          <h2 style={{ margin: 0, fontSize: "20px", fontWeight: 700, color: "#1a1a2e" }}>Gestione Team</h2>
          <div style={{ fontSize: "13px", color: "#888", marginTop: "3px" }}>{rows.length} membri totali</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
          {importResult && (
            <span style={{ fontSize: "12px", color: "#34a853", fontWeight: 600 }}>{importResult}</span>
          )}
          <input type="text" placeholder="Cerca…" value={search} onChange={e => setSearch(e.target.value)}
            style={{ padding: "7px 12px", border: "1px solid #dadce0", borderRadius: "6px", fontSize: "13px", width: "200px" }} />
          <label style={{ ...btn("ghost"), padding: "6px 14px", display: "inline-flex", alignItems: "center", gap: "6px", cursor: "pointer", border: "1px solid #dadce0", borderRadius: "6px", fontSize: "12px", fontWeight: 600, color: "#555" }}>
            {importing ? "Importazione…" : "Importa da Excel"}
            <input type="file" accept=".xlsx,.xls" onChange={handleImport} style={{ display: "none" }} disabled={importing} />
          </label>
          <button onClick={() => setModal({ mode: "create" })} style={btn("primary")}>+ Nuovo membro</button>
        </div>
      </div>

      {/* ── Tabella ── */}
      <div style={{ overflowX: "auto", border: "1px solid #e8eaed", borderRadius: "8px" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", tableLayout: "auto" }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: "36px", textAlign: "center" }}>#</th>
              {COLS.map(c => <th key={c.key} style={TH}>{c.label}</th>)}
              <th style={{ ...TH, textAlign: "center", width: "100px" }}>Azioni</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={COLS.length + 2} style={{ ...TD, textAlign: "center", color: "#aaa", padding: "32px" }}>
                {search ? "Nessun risultato." : "Nessun membro. Clicca '+ Nuovo membro' o importa da Excel."}
              </td></tr>
            ) : filtered.map((r, idx) => (
              <tr key={r.id}
                style={{ background: idx % 2 === 0 ? "white" : "#fafafa", transition: "background 0.1s" }}
                onMouseEnter={e => e.currentTarget.style.background = "#f0f4ff"}
                onMouseLeave={e => e.currentTarget.style.background = idx % 2 === 0 ? "white" : "#fafafa"}>
                <td style={{ ...TD, textAlign: "center", fontSize: "11px", color: "#aaa" }}>{idx + 1}</td>
                {COLS.map(c => (
                  <td key={c.key} style={{ ...TD, maxWidth: c.key === "note" ? "220px" : "160px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: c.key === "note" ? "normal" : "nowrap" }}>
                    {c.key === "email" && r[c.key]
                      ? <a href={`mailto:${r[c.key]}`} style={{ color: "#1a73e8" }}>{r[c.key]}</a>
                      : (r[c.key] ?? "")
                    }
                  </td>
                ))}
                <td style={{ ...TD, textAlign: "center", whiteSpace: "nowrap" }}>
                  <button onClick={() => setModal({ mode: "edit", row: r })} style={{ ...btn("ghost"), marginRight: "6px", padding: "4px 10px", border: "1px solid #dadce0" }}>Modifica</button>
                  <button onClick={() => setConfirmDelete(r)} style={{ ...btn("danger"), padding: "4px 10px" }}>Elimina</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Modale add/edit ── */}
      {modal && (
        <MemberModal
          initial={modal.mode === "edit" ? { ...modal.row } : null}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* ── Conferma eliminazione ── */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ background: "#fff", borderRadius: "10px", padding: "24px 28px", width: "min(400px, 92vw)", boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <h3 style={{ margin: "0 0 12px", fontSize: "15px", fontWeight: 700 }}>Conferma eliminazione</h3>
            <p style={{ margin: "0 0 20px", color: "#555", fontSize: "13px" }}>
              Eliminare <strong>{confirmDelete.risorsa}</strong>? L'operazione non è reversibile.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button onClick={() => setConfirmDelete(null)} style={btn("ghost")}>Annulla</button>
              <button onClick={() => handleDelete(confirmDelete)} style={btn("danger")}>Elimina</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
