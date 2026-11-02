import React, { useEffect, useState } from 'react';
import { workspaceDocument } from '../services/mevService';

export const documentReference = document => `document:${document.id} · ${document.fileName} · SHA256:${document.sha256}`;

export default function InitiativeDocuments({ code, canEdit, onUseSource }) {
  const [documents, setDocuments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
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
    </article>)}
  </details>;
}
