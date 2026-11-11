import React, { useEffect, useState } from 'react';
import { workspaceDocument, workspaceRequest } from '../services/mevService';
import DocumentReader from './DocumentReader';

export const documentReference = document => `document:${document.id} · ${document.fileName} · SHA256:${document.sha256}`;

export default function InitiativeDocuments({ code, canEdit, onUseSource, onUseExtract, evidence = [] }) {
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extractions, setExtractions] = useState({});
  const [selected, setSelected] = useState({});
  const removeDocument = async document => {
    if (!window.confirm(`Eliminare l’allegato “${document.fileName}” dall’elenco attivo? Le fonti delle revisioni già salvate restano conservate.`)) return;
    setBusy(true); setError('');
    try {
      await workspaceDocument(code, { id: document.id, remove: true });
      setDocuments(previous => previous.filter(d => d.id !== document.id));
      onUseExtract?.(document, null);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const extract = async (document, generate) => {
    setBusy(true); setError('');
    try {
      const result = await workspaceRequest(`${encodeURIComponent(code)}/documents/${document.id}/extraction`, generate ? {} : undefined);
      setExtractions(previous => ({ ...previous, [document.id]: result }));
      setSelected(previous => ({ ...previous, [document.id]: result.passages.map((p, index) => evidence.some(e => e.documentId === document.id && e.location === p.location && e.text === p.text) ? index : null).filter(index => index !== null) }));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  useEffect(() => {
    let alive = true;
    setDocuments([]); setError('');
    workspaceDocument(code).then(rows => { if (alive) setDocuments(rows); }).catch(e => { if (alive) setError(e.message); });
    return () => { alive = false; };
  }, [code]);
  const upload = async e => {
    const file = e.target.files?.[0]; e.target.value = '';
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('Dimensione massima: 10 MB.'); return; }
    setBusy(true); setError('');
    try {
      await workspaceDocument(code, { file });
      setDocuments(await workspaceDocument(code));
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const download = async document => {
    setError('');
    try {
      const blob = await workspaceDocument(code, { id: document.id });
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a'); link.href = url; link.download = document.fileName; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
  };
  return <details className="workspace-documents" open>
    <summary>Documentazione ricevuta · {documents.length} allegati</summary>
    <p>Originali condivisi per questa iniziativa. Ogni caricamento conserva un file distinto, con autore, data e impronta SHA-256.</p>
    <p>Contesto documentale AI: {evidence.reduce((sum, p) => sum + p.text.length, 0).toLocaleString('it-IT')} / 48.000 caratteri. Solo le sezioni aggiunte esplicitamente saranno inviate all’AI.</p>
    {canEdit && <label className="workspace-upload">{busy ? 'Caricamento in corso…' : 'Carica documento (massimo 10 MB)'}<input aria-label="Carica documento iniziativa" type="file" disabled={busy} onChange={upload} /></label>}
    {error && <p role="alert">{error}</p>}
    {!documents.length && !error && <p>Nessun documento caricato.</p>}
    {documents.map(document => <article key={document.id}>
      <strong>{document.fileName}</strong>
      <p>{(document.size / 1024).toFixed(1)} KB · {document.author} · {new Date(document.createdAt).toLocaleString('it-IT')}</p>
      <details className="document-provenance"><summary>Identificativo e impronta originale</summary><code style={{ overflowWrap: 'anywhere' }}>{documentReference(document)}</code></details>
      <div><button type="button" onClick={() => download(document)}>Scarica originale</button>
      {canEdit && <button type="button" onClick={() => onUseSource(documentReference(document))}>Collega alle fonti dell’analisi</button>}</div>
      <div><button type="button" disabled={busy} onClick={() => extract(document, false)}>Consulta estratto salvato</button>
      {canEdit && <button type="button" disabled={busy} onClick={() => extract(document, true)}>Estrai testo</button>}
      {canEdit && <button className="document-remove" type="button" disabled={busy} onClick={() => removeDocument(document)}>Elimina allegato</button>}</div>
      {extractions[document.id] && <div>
        {extractions[document.id].extractorVersion !== '3' && canEdit && <p>Estratto precedente: premi “Estrai testo” per leggere fino a 500.000 caratteri senza ricaricare il file.</p>}
        <DocumentReader document={document} extraction={extractions[document.id]} selected={selected[document.id] || []}
          canEdit={canEdit} onSelect={indices => setSelected(previous => ({ ...previous, [document.id]: indices }))} />
        {canEdit && extractions[document.id].passages.length > 0 && <>
          <button type="button" onClick={() => onUseExtract?.(document, { ...extractions[document.id], passages: extractions[document.id].passages.filter((_, index) => (selected[document.id] || []).includes(index)) })}>Usa sezioni selezionate ({(selected[document.id] || []).length}) nel contesto AI</button>
          <button type="button" onClick={() => onUseExtract?.(document, extractions[document.id])}>Usa estratto nel contesto AI</button>
        </>}
      </div>}
      {evidence.some(item => item.documentId === document.id) && <p>Estratto incluso nella bozza dell’analisi · <button type="button" disabled={!canEdit} onClick={() => onUseExtract?.(document, null)}>Rimuovi dal contesto AI</button></p>}
    </article>)}
  </details>;
}
