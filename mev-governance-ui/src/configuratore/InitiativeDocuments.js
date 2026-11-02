import React, { useEffect, useState } from 'react';
import { workspaceDocument, workspaceRequest } from '../services/mevService';

export const documentReference = document => `document:${document.id} · ${document.fileName} · SHA256:${document.sha256}`;

export default function InitiativeDocuments({ code, canEdit, onUseSource, onUseExtract, evidence = [] }) {
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extractions, setExtractions] = useState({});
  const extract = async (document, generate) => {
    setBusy(true); setError('');
    try {
      const result = await workspaceRequest(`${encodeURIComponent(code)}/documents/${document.id}/extraction`, generate ? {} : undefined);
      setExtractions(previous => ({ ...previous, [document.id]: result }));
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
    {canEdit && <label className="workspace-upload">{busy ? 'Caricamento in corso…' : 'Carica documento (massimo 10 MB)'}<input aria-label="Carica documento iniziativa" type="file" disabled={busy} onChange={upload} /></label>}
    {error && <p role="alert">{error}</p>}
    {!documents.length && !error && <p>Nessun documento caricato.</p>}
    {documents.map(document => <article key={document.id}>
      <strong>{document.fileName}</strong>
      <p>{(document.size / 1024).toFixed(1)} KB · {document.author} · {new Date(document.createdAt).toLocaleString('it-IT')}</p>
      <code style={{ overflowWrap: 'anywhere' }}>{documentReference(document)}</code>
      <div><button type="button" onClick={() => download(document)}>Scarica originale</button>
      {canEdit && <button type="button" onClick={() => onUseSource(documentReference(document))}>Collega alle fonti dell’analisi</button>}</div>
      <div><button type="button" disabled={busy} onClick={() => extract(document, false)}>Consulta estratto salvato</button>
      {canEdit && <button type="button" disabled={busy} onClick={() => extract(document, true)}>Estrai testo</button>}</div>
      {extractions[document.id] && <div>
        <p role="status">{extractions[document.id].message}</p>
        <details><summary>Anteprima del testo · {extractions[document.id].passages.length} riferimenti</summary>
          {extractions[document.id].passages.map((passage, index) => <div key={index}><strong>{passage.location}</strong><pre style={{ whiteSpace: 'pre-wrap', maxHeight: 180, overflow: 'auto' }}>{passage.text}</pre></div>)}
        </details>
        {canEdit && extractions[document.id].passages.length > 0 && <button type="button" onClick={() => onUseExtract?.(document, extractions[document.id])}>Usa estratto nel contesto AI</button>}
      </div>}
      {evidence.some(item => item.documentId === document.id) && <p>Estratto incluso nella bozza dell’analisi · <button type="button" disabled={!canEdit} onClick={() => onUseExtract?.(document, null)}>Rimuovi dal contesto AI</button></p>}
    </article>)}
  </details>;
}
