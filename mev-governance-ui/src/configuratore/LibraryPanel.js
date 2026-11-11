import React, { useCallback, useEffect, useRef, useState } from 'react';
import { libraryRequest, workspaceDocument } from '../services/mevService';
import { FOLDERS, MEMORY, fileKind, formatSize, planUpload, folderCounts, filterDocuments, indexStatus, isSearchable, describeResults, highlightParts, sourceLabel, eventLabel } from './libraryModel';
import { initiativeCode } from './rationaleKnowledge';
import { displayName, relativeTime } from './developmentCollaboration';
import './libraryPanel.css';

const stamp = value => value ? new Date(value).toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

function Highlight({ text, terms }) {
  return <>{highlightParts(text, terms).map((part, index) => part.hit ? <mark key={index}>{part.text}</mark> : <React.Fragment key={index}>{part.text}</React.Fragment>)}</>;
}

// Documentary workspace of the open initiative: folders, upload, search, versions, and questions answered from the documents.
// Enabled only when an initiative (GOTO or title) is open, exactly like the other initiative features.
export default function LibraryPanel({ initiative, canEdit = true }) {
  const code = initiativeCode(initiative);
  const [data, setData] = useState({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300 });
  const [loading, setLoading] = useState(false);
  const [folder, setFolder] = useState('');
  const [nameFilter, setNameFilter] = useState('');
  const [uploadFolder, setUploadFolder] = useState('');
  const [uploading, setUploading] = useState(null);
  const [report, setReport] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [dragging, setDragging] = useState(false);
  const [openId, setOpenId] = useState(null);
  const [history, setHistory] = useState({});
  const [search, setSearch] = useState({ q: '', author: '', from: '', to: '', category: '', versions: false });
  const [results, setResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState(null);
  const [asking, setAsking] = useState(false);
  const [reindexing, setReindexing] = useState(false);
  const versionTarget = useRef(null); const versionInput = useRef(null); const fileInput = useRef(null); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    if (!code) return;
    setLoading(true);
    try { const result = await libraryRequest(encodeURIComponent(code)); if (alive.current) { setData(result); setError(''); } }
    catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setLoading(false); }
  }, [code]);
  useEffect(() => {
    setData({ documents: [], folders: [], historical: 0, pendingIndex: 0, limit: 300 }); setReport([]); setResults(null); setAnswer(null); setOpenId(null); setHistory({}); setError(''); setNotice(''); setFolder('');
    load();
  }, [code, load]);

  const upload = async fileList => {
    const plan = planUpload(fileList);
    if (!plan.batches.length && !plan.refused.length) return;
    setError(''); setNotice(''); setReport(plan.refused);
    const total = plan.batches.reduce((n, batch) => n + batch.length, 0); let done = 0;
    setUploading({ done, total });
    for (const batch of plan.batches) {
      const form = new FormData(); batch.forEach(file => form.append('files', file)); if (uploadFolder) form.append('category', uploadFolder);
      try {
        const response = await libraryRequest(`${encodeURIComponent(code)}/upload`, { form });
        setReport(previous => [...previous, ...response.results]);
      } catch (e) { setReport(previous => [...previous, ...batch.map(file => ({ fileName: file.name, ok: false, message: e.message }))]); }
      done += batch.length; if (alive.current) setUploading({ done, total });
    }
    if (alive.current) { setUploading(null); await load(); }
  };
  const onDrop = event => { event.preventDefault(); setDragging(false); if (canEdit && !uploading) upload(event.dataTransfer.files); };
  const chooseFiles = event => { const files = [...event.target.files]; event.target.value = ''; upload(files); };

  const act = async (fn, success) => { setError(''); setNotice(''); try { await fn(); if (success) setNotice(success); await load(); } catch (e) { setError(e.message); } };
  const move = (document, category) => act(() => libraryRequest(`${encodeURIComponent(code)}/groups/${document.groupId}`, { method: 'PUT', body: { category } }), `Spostato in «${category}».`);
  const toggleAi = document => act(() => libraryRequest(`${encodeURIComponent(code)}/groups/${document.groupId}`, { method: 'PUT', body: { aiEnabled: !document.aiEnabled } }), document.aiEnabled ? 'Il documento non sarà più usato dall’AI.' : 'Il documento sarà usato dall’AI.');
  const remove = document => {
    if (!window.confirm(`Eliminare «${document.fileName}»${document.versions > 1 ? ` e le sue ${document.versions} versioni` : ''}? Non comparirà più nell’elenco né nelle risposte AI; gli originali restano conservati nello storico.`)) return;
    act(() => libraryRequest(`${encodeURIComponent(code)}/groups/${document.groupId}`, { method: 'DELETE' }), 'Documento eliminato.');
  };
  const download = async document => {
    setError('');
    try {
      const blob = await workspaceDocument(code, { id: document.id });
      const url = URL.createObjectURL(blob); const link = window.document.createElement('a'); link.href = url; link.download = document.fileName; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
  };
  const pickVersion = document => { versionTarget.current = document; versionInput.current?.click(); };
  const sendVersion = async event => {
    const file = event.target.files?.[0]; event.target.value = ''; const target = versionTarget.current;
    if (!file || !target) return;
    const form = new FormData(); form.append('file', file); form.append('expectedVersion', String(target.version));
    await act(() => libraryRequest(`${encodeURIComponent(code)}/groups/${target.groupId}/versions`, { form }), `Nuova versione di «${target.fileName}» caricata.`);
    setHistory(previous => { const { [target.groupId]: _drop, ...rest } = previous; return rest; });
  };
  const toggleHistory = async document => {
    if (openId === document.groupId) { setOpenId(null); return; }
    setOpenId(document.groupId);
    try { const result = await libraryRequest(`${encodeURIComponent(code)}/groups/${document.groupId}/history`); setHistory(previous => ({ ...previous, [document.groupId]: result })); }
    catch (e) { setError(e.message); }
  };

  const runSearch = async event => {
    event?.preventDefault();
    setSearching(true); setError('');
    try {
      const params = new URLSearchParams(); const { q, author, from, to, category, versions } = search;
      if (q.trim()) params.set('q', q.trim()); if (author.trim()) params.set('author', author.trim()); if (from) params.set('from', from); if (to) params.set('to', to); if (category) params.set('category', category); if (versions) params.set('versions', 'true');
      setResults(await libraryRequest(`${encodeURIComponent(code)}/search?${params}`));
    } catch (e) { setError(e.message); } finally { setSearching(false); }
  };
  const ask = async event => {
    event.preventDefault();
    if (!question.trim()) return;
    setAsking(true); setError(''); setAnswer(null);
    try { setAnswer(await libraryRequest(`${encodeURIComponent(code)}/ask`, { body: { question: question.trim() } })); }
    catch (e) { setError(e.message); } finally { setAsking(false); }
  };
  const reindex = async () => {
    setReindexing(true); setError('');
    try { let remaining = 1; let guard = 0; while (remaining > 0 && guard++ < 40) { remaining = (await libraryRequest(`${encodeURIComponent(code)}/reindex`, { method: 'POST', body: {} })).remaining; } await load(); setNotice('Indicizzazione completata.'); }
    catch (e) { setError(e.message); } finally { setReindexing(false); }
  };

  const counts = folderCounts(data.documents); const visible = filterDocuments(data.documents, { folder, text: nameFilter });
  const refused = report.filter(r => !r.ok);
  const idle = !code;

  return <section className={`lib${idle ? ' is-idle' : ''}`} aria-label="Workspace documentale dell’iniziativa" aria-disabled={idle}>
    <header className="lib-head">
      <div><span className="lib-eyebrow">Memoria condivisa</span><h3>Workspace documentale</h3>
        <p>L’archivio unico dei documenti dell’iniziativa: requisiti, email, analisi e materiali di contesto. Restano nel tempo, sono condivisi con il team e l’AI li usa per rispondere.</p></div>
      {!idle && <ul className="lib-stats" aria-label="Riepilogo"><li><b>{data.documents.length}</b>documenti</li><li><b>{data.documents.filter(d => d.isMemory).length}</b>memorie iniziali</li><li><b>{data.documents.filter(isSearchable).length}</b>ricercabili</li></ul>}
    </header>

    {idle ? <p className="lib-lock" role="status"><span aria-hidden="true">🔒</span> Apri o crea un’iniziativa (codice GOTO e titolo) per usare il workspace documentale.</p> : <>
      {canEdit && <div className={`lib-drop${dragging ? ' is-over' : ''}${uploading ? ' is-busy' : ''}`} onDragOver={event => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <div className="lib-drop-text"><strong>{uploading ? `Caricamento: ${uploading.done} di ${uploading.total}…` : 'Trascina qui i documenti'}</strong>
          <span>PDF, Word, Excel, PowerPoint, testo, CSV, ZIP, RAR, EML, MSG, XML, JSON, immagini… fino a 10 MB ciascuno. Puoi sceglierne più di uno.</span></div>
        <label className="lib-folder-pick">Cartella di destinazione
          <select value={uploadFolder} onChange={event => setUploadFolder(event.target.value)} disabled={!!uploading}>
            <option value="">Automatica (email → «Email e comunicazioni», altro → «Allegati ricevuti»)</option>
            {FOLDERS.map(name => <option key={name} value={name}>{name === MEMORY ? `${name} — base di contesto permanente` : name}</option>)}</select></label>
        <button type="button" className="lib-primary" disabled={!!uploading} onClick={() => fileInput.current?.click()}>Carica Documenti</button>
        <input ref={fileInput} type="file" multiple hidden aria-label="Carica documenti" onChange={chooseFiles} />
        <input ref={versionInput} type="file" hidden aria-label="Carica nuova versione" onChange={sendVersion} />
        {uploading && <span className="lib-bar" aria-hidden="true"><i style={{ width: `${Math.round(100 * uploading.done / Math.max(1, uploading.total))}%` }} /></span>}
      </div>}
      {!canEdit && <p className="lib-note">Hai accesso in sola consultazione: puoi cercare, leggere e scaricare i documenti.</p>}

      {report.length > 0 && <div className={`lib-report${refused.length ? ' has-errors' : ''}`} role="status">
        <b>{report.filter(r => r.ok).length} caricati{refused.length ? `, ${refused.length} non caricati` : ''}</b>
        <ul>{report.map((r, index) => <li key={index} className={r.ok ? 'ok' : 'ko'}><span aria-hidden="true">{r.ok ? '✓' : '✕'}</span><b>{r.fileName}</b>{!r.ok && <span> — {r.message}</span>}
          {!r.ok && r.canVersion && canEdit && <button type="button" onClick={() => { const target = data.documents.find(d => d.groupId === r.existingGroupId); if (target) pickVersion(target); }}>Carica come nuova versione</button>}</li>)}</ul>
        <button type="button" onClick={() => setReport([])}>Chiudi riepilogo</button></div>}
      {error && <p className="lib-error" role="alert">{error}</p>}
      {notice && <p className="lib-notice" role="status">{notice}</p>}
      {data.pendingIndex > 0 && canEdit && <p className="lib-pending">{data.pendingIndex} {data.pendingIndex === 1 ? 'documento è stato caricato' : 'documenti sono stati caricati'} prima di questa funzione e non {data.pendingIndex === 1 ? 'è' : 'sono'} ancora ricercabil{data.pendingIndex === 1 ? 'e' : 'i'}. <button type="button" disabled={reindexing} onClick={reindex}>{reindexing ? 'Indicizzazione…' : 'Indicizza ora'}</button></p>}

      <div className="lib-folders" role="tablist" aria-label="Cartelle documentali">
        <button type="button" role="tab" aria-selected={folder === ''} className={folder === '' ? 'is-active' : ''} onClick={() => setFolder('')}>Tutti<b>{data.documents.length}</b></button>
        {FOLDERS.map(name => <button type="button" role="tab" key={name} aria-selected={folder === name} className={`${folder === name ? 'is-active' : ''}${name === MEMORY ? ' is-memory' : ''}`} onClick={() => setFolder(name)}>{name}<b>{counts[name]}</b></button>)}
        <span className="lib-folder-extra" title="Ogni versione sostituita è conservata automaticamente e consultabile dalla storia del documento.">Versioni storiche<b>{data.historical}</b></span>
      </div>

      <div className="lib-list-head"><label className="lib-sr" htmlFor="lib-name">Filtra per nome</label><input id="lib-name" type="search" placeholder="Filtra per nome file…" value={nameFilter} onChange={event => setNameFilter(event.target.value)} />
        <button type="button" onClick={load} disabled={loading}>↻ Aggiorna</button></div>
      {loading && !data.documents.length && <p className="lib-empty" role="status">Caricamento…</p>}
      {!loading && !data.documents.length && <p className="lib-empty">Nessun documento. Inizia caricando la <b>memoria iniziale</b> (standard, template, linee guida) e poi i requisiti del cliente.</p>}
      {data.documents.length > 0 && !visible.length && <p className="lib-empty">Nessun documento corrisponde al filtro.</p>}
      <ul className="lib-docs">
        {visible.map(document => { const kind = fileKind(document.fileName); const status = indexStatus(document);
          return <li key={document.id} className="lib-doc">
            <div className="lib-doc-main">
              <span className={`lib-ext lib-ext-${kind.tone}`} aria-label={`Formato ${kind.label}`}>{(document.extension || '?').slice(0, 4)}</span>
              <div className="lib-doc-title"><strong>{document.fileName}</strong>
                <small>{formatSize(document.size)} · v{document.version} · {displayName({ username: document.author })} · {relativeTime(document.createdAt)} <span title={stamp(document.createdAt)}>({stamp(document.createdAt)})</span></small></div>
              <span className="lib-badges">
                {document.isMemory && <span className="lib-badge lib-badge-memory">Memoria iniziale</span>}
                <span className={`lib-badge lib-badge-${status.tone}`} title={status.hint}>{status.label}</span>
                <span className={`lib-badge ${document.aiEnabled ? 'lib-badge-ai' : 'lib-badge-muted'}`} title={document.aiEnabled ? 'L’AI può usare questo documento.' : 'Escluso dall’AI.'}>{document.aiEnabled ? 'Usato dall’AI' : 'Escluso dall’AI'}</span>
              </span>
            </div>
            <div className="lib-doc-actions">
              <button type="button" onClick={() => download(document)}>Scarica</button>
              {canEdit && <label className="lib-move"><span className="lib-sr">Cartella di {document.fileName}</span><select value={document.category} onChange={event => move(document, event.target.value)}>{FOLDERS.map(name => <option key={name} value={name}>{name}</option>)}</select></label>}
              {canEdit && <button type="button" onClick={() => pickVersion(document)}>Sostituisci / nuova versione</button>}
              {canEdit && <button type="button" onClick={() => toggleAi(document)}>{document.aiEnabled ? 'Escludi dall’AI' : 'Usa nell’AI'}</button>}
              <button type="button" aria-expanded={openId === document.groupId} onClick={() => toggleHistory(document)}>Storia{document.versions > 1 ? ` (${document.versions})` : ''}</button>
              {canEdit && document.canDelete && <button type="button" className="lib-danger" onClick={() => remove(document)}>Elimina</button>}
            </div>
            {openId === document.groupId && <div className="lib-history" aria-label={`Storia di ${document.fileName}`}>
              {!history[document.groupId] ? <p>Caricamento…</p> : <>
                <h4>Versioni</h4>
                <ol>{history[document.groupId].versions.map(version => <li key={version.id} className={version.isCurrent ? 'is-current' : ''}><b>v{version.version}</b> {version.fileName} · {formatSize(version.size)} · {displayName({ username: version.author })} · {stamp(version.createdAt)}
                  {version.isCurrent && <span className="lib-badge lib-badge-ai">corrente</span>} <button type="button" onClick={() => download({ ...document, id: version.id, fileName: version.fileName })}>Scarica</button></li>)}</ol>
                <h4>Storico modifiche</h4>
                <ol className="lib-events">{history[document.groupId].events.map(event => <li key={event.id}><b>{eventLabel(event.action)}</b> · {displayName({ username: event.actor })} · {stamp(event.at)}{event.detail ? <small> — {event.detail}</small> : null}</li>)}</ol></>}
            </div>}
          </li>; })}
      </ul>

      <div className="lib-tools">
        <form className="lib-search" onSubmit={runSearch} aria-label="Ricerca nei documenti">
          <h4>Cerca nei documenti</h4>
          <div className="lib-search-row"><label className="lib-sr" htmlFor="lib-q">Testo da cercare</label>
            <input id="lib-q" type="search" placeholder="Nome file o parole nel contenuto…" value={search.q} onChange={event => setSearch({ ...search, q: event.target.value })} />
            <button type="submit" className="lib-primary" disabled={searching}>{searching ? 'Cerco…' : 'Cerca'}</button></div>
          <div className="lib-filters">
            <label>Cartella<select value={search.category} onChange={event => setSearch({ ...search, category: event.target.value })}><option value="">Tutte</option>{FOLDERS.map(name => <option key={name} value={name}>{name}</option>)}</select></label>
            <label>Autore<input value={search.author} onChange={event => setSearch({ ...search, author: event.target.value })} placeholder="nome utente" /></label>
            <label>Dal<input type="date" value={search.from} onChange={event => setSearch({ ...search, from: event.target.value })} /></label>
            <label>Al<input type="date" value={search.to} onChange={event => setSearch({ ...search, to: event.target.value })} /></label>
            <label className="lib-check"><input type="checkbox" checked={search.versions} onChange={event => setSearch({ ...search, versions: event.target.checked })} /> Includi versioni precedenti</label></div>
          {results && <div className="lib-results" aria-live="polite">
            <p><b>{describeResults(results.results)}</b>{results.truncated ? ' · mostrati i più pertinenti: affina la ricerca' : ''}</p>
            {!results.results.length && <p className="lib-empty">Nessun risultato. Prova con altre parole: la ricerca ignora maiuscole e accenti e trova anche le forme al plurale.</p>}
            <ul>{results.results.map(result => <li key={result.document.id}>
              <strong>{result.document.fileName}</strong> <small>v{result.document.version} · {result.document.category} · {displayName({ username: result.document.author })} · {stamp(result.document.createdAt)}{result.nameMatch ? ' · trovato nel nome' : ''}</small>
              {result.snippets.map((snippet, index) => <p key={index} className="lib-snippet"><span>{snippet.location}</span><Highlight text={snippet.text} terms={results.terms} /></p>)}
              <button type="button" onClick={() => download(result.document)}>Scarica</button></li>)}</ul></div>}
        </form>

        <form className="lib-ask" onSubmit={ask} aria-label="Domanda ai documenti">
          <h4>Chiedi ai documenti</h4>
          <p className="lib-hint">L’AI risponde usando solo i passaggi dei documenti dell’iniziativa abilitati all’AI, e mostra le fonti. Non conosce nient’altro.</p>
          <label className="lib-sr" htmlFor="lib-question">Domanda sui documenti</label>
          <textarea id="lib-question" rows={3} value={question} disabled={asking || !canEdit} maxLength={2100} placeholder={canEdit ? 'Es. Quali dipendenze emergono dai requisiti? Quali impatti ha la modifica sul servizio di invio?' : 'Solo chi può modificare l’iniziativa può interrogare l’AI.'}
            onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
          <button type="submit" className="lib-primary" disabled={asking || !canEdit || !question.trim()}>{asking ? 'L’AI sta leggendo i documenti…' : 'Chiedi'}</button>
          {answer && <div className="lib-answer" aria-live="polite">
            <p className="lib-answer-text">{answer.answer}</p>
            {answer.noSources ? <p className="lib-hint">Nessuna fonte: l’AI non è stata interpellata.</p> : <>
              <h5>Fonti usate ({answer.sources.length})</h5>
              <ol className="lib-sources">{answer.sources.map(source => <li key={source.n}><b>[{source.n}] {sourceLabel(source)}</b><small>{source.category}</small><p>{source.text}</p></li>)}</ol>
              <p className="lib-hint">Verifica la risposta sulle fonti: l’AI può sbagliare{answer.model ? ` · modello ${answer.model}` : ''}.</p></>}
          </div>}
        </form>
      </div>
    </>}
  </section>;
}
