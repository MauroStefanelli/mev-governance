import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { historyImportRequest } from '../services/mevService';
import { parseManifest, readNotes, classifyNotes, bySystem, buildReport, filterAlreadyRead, runImport, pendingLabel, KIND_LABEL } from './historyImportModel';
import { readFileText, downloadText } from './ledgerModel';
import './historyImportPanel.css';

// Icon: a book with a spark ("knowledge gathered from past work"). Decorative: the button carries the accessible name.
export function KnowledgeIcon({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H19v15H6.5A2.5 2.5 0 0 0 4 20.5z" /><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H19v-5" /><path d="M13 7l.9 2.1L16 10l-2.1.9L13 13l-.9-2.1L10 10l2.1-.9z" />
  </svg>;
}

const stamp = value => value ? new Date(value).toLocaleString('it-IT', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

// Brings into the app the knowledge written in the past by AI assistants. The user picks the zipped folder and the list of paths;
// everything is read and checked in the browser; the AI reads one note at a time on the server; what comes out is only PROPOSALS
// that a person confirms or discards. Notes with credentials never leave the browser, and the report says which and why.
export default function HistoryImportPanel({ canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [zipFile, setZipFile] = useState(null);
  const [manifestFile, setManifestFile] = useState(null);
  const [preparing, setPreparing] = useState(null);
  const [plan, setPlan] = useState(null);
  const [run, setRun] = useState(null);
  const [pending, setPending] = useState(null);
  const [selected, setSelected] = useState([]);
  const [system, setSystem] = useState('');
  const [deciding, setDeciding] = useState(false);
  const [lastReport, setLastReport] = useState('');
  const [view, setView] = useState('review');
  const [browse, setBrowse] = useState({ status: 'confermata', system: '', kind: '', q: '' });
  const [library, setLibrary] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const trigger = useRef(null); const closeButton = useRef(null); const alive = useRef(true); const cancelled = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const loadSummary = useCallback(async () => { try { const r = await historyImportRequest('summary'); if (alive.current) setSummary(r); } catch { /* the panel reports it when opened */ } }, []);
  const loadPending = useCallback(async (filter = system) => {
    try { const r = await historyImportRequest(`pending${filter ? `?system=${encodeURIComponent(filter)}` : ''}`); if (alive.current) { setPending(r); setSelected([]); setError(''); } }
    catch (e) { if (alive.current) setError(e.message); }
  }, [system]);
  const loadLibrary = useCallback(async (filters, more = false, cursor = null) => {
    setLibraryLoading(true);
    try {
      const params = new URLSearchParams({ status: filters.status });
      ['system', 'kind', 'q'].forEach(k => { if (filters[k]) params.set(k, filters[k]); });
      if (cursor) params.set('before', String(cursor));
      const r = await historyImportRequest(`entries?${params}`);
      if (alive.current) { setLibrary(previous => more && previous ? { ...r, entries: [...previous.entries, ...r.entries] } : r); setError(''); }
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setLibraryLoading(false); }
  }, []);
  useEffect(() => { if (open && view === 'library') loadLibrary(browse); }, [open, view, browse, loadLibrary]);
  useEffect(() => { const timer = setTimeout(() => setBrowse(previous => previous.q === searchText.trim() ? previous : { ...previous, q: searchText.trim() }), 350); return () => clearTimeout(timer); }, [searchText]);
  useEffect(() => { loadSummary(); }, [loadSummary]);
  useEffect(() => { if (open) loadPending(); }, [open, system]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const onKey = event => { if (event.key === 'Escape' && !run?.busy) close(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open, run?.busy]); // eslint-disable-line react-hooks/exhaustive-deps
  const close = () => { setOpen(false); trigger.current?.focus(); };

  const prepare = async () => {
    setError(''); setNotice(''); setPlan(null); setRun(null); setPreparing({ done: 0, total: 0 });
    try {
      const manifest = parseManifest(await readFileText(manifestFile));
      if (!manifest.markdown.length) throw new Error('L’elenco non contiene nessun file .md.');
      const read = await readNotes(zipFile, manifest, { onProgress: (done, total) => alive.current && setPreparing({ done, total }) });
      const classified = await classifyNotes(read.found);
      const { fresh, already } = await filterAlreadyRead(classified.toRead, historyImportRequest);
      if (alive.current) setPlan({ manifest, read, classified, fresh, already, systems: bySystem(fresh) });
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setPreparing(null); }
  };

  const start = async () => {
    cancelled.current = false; setError(''); setNotice('');
    setRun({ busy: true, done: 0, total: plan.fresh.length, proposals: 0, result: null });
    const result = await runImport({ notes: plan.fresh, request: historyImportRequest, shouldCancel: () => cancelled.current,
      onProgress: (done, total, partial) => alive.current && setRun(previous => ({ ...previous, done, total, proposals: partial.proposals })) });
    if (!alive.current) return;
    const report = buildReport({ classified: plan.classified, missing: plan.read.missing, notInManifest: plan.read.notInManifest, stuck: plan.manifest.stuck, serverRefused: result.serverRefused, failed: result.failed, read: result.read });
    setLastReport(report);
    setRun({ busy: false, done: run?.total ?? plan.fresh.length, total: plan.fresh.length, proposals: result.proposals, result });
    await Promise.all([loadSummary(), loadPending()]);
  };
  const stop = () => { cancelled.current = true; };

  const decide = async decision => {
    if (!selected.length) return;
    setDeciding(true); setError('');
    try {
      const r = await historyImportRequest('decide', { body: { ids: selected, decision } });
      setNotice(decision === 'confermata' ? `${r.decided} voci confermate: da ora le altre iniziative dello stesso sistema le trovano.` : `${r.decided} voci scartate.`);
      await Promise.all([loadPending(), loadSummary()]);
    } catch (e) { setError(e.message); } finally { setDeciding(false); }
  };
  const toggle = id => setSelected(previous => previous.includes(id) ? previous.filter(x => x !== id) : [...previous, id]);
  const entries = pending?.entries || [];
  const allSelected = entries.length > 0 && entries.every(e => selected.includes(e.id));
  const count = summary?.pending ?? 0;

  return <>
    <button type="button" ref={trigger} className="hi-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} title="Importa la conoscenza già raccolta con assistenti AI: razionali e vincoli da confermare">
      <KnowledgeIcon /><span className="hi-trigger-text"><strong>Conoscenza storica AI</strong><small>{summary ? (count ? pendingLabel(count) : summary.filesRead ? `${summary.filesRead} note lette` : 'Importa dal tuo lavoro') : 'Importa dal tuo lavoro'}</small></span>
    </button>
    {open && createPortal(<div className="hi-overlay" onMouseDown={event => { if (event.target === event.currentTarget && !run?.busy) close(); }}>
      <aside className="hi" role="dialog" aria-modal="true" aria-label="Conoscenza storica AI">
        <header className="hi-head">
          <span className="hi-head-icon"><KnowledgeIcon size={26} /></span>
          <div><span className="hi-eyebrow">Memoria del lavoro</span><h2>Conoscenza storica AI</h2><p>Razionali e vincoli già scritti con gli assistenti, importati come proposte da confermare.</p></div>
          <button type="button" ref={closeButton} className="hi-close" onClick={close} disabled={run?.busy} aria-label="Chiudi la conoscenza storica">✕</button>
        </header>
        {error && <p className="hi-error" role="alert">{error}</p>}
        {notice && <p className="hi-notice" role="status">{notice}</p>}

        {canEdit && <section className="hi-card" aria-label="Importa">
          <h3>1. Scegli cosa importare</h3>
          <p className="hi-hint">Comprimi in uno zip la cartella <code>projects</code> del backup e scegli anche l’elenco dei file (<code>.txt</code>, un percorso per riga). Lo zip viene aperto qui, nel browser: <b>non viene caricato</b>. Partono solo le note Markdown che superano i controlli.</p>
          <div className="hi-files">
            <label className="hi-file"><span>Zip della cartella</span><input type="file" accept=".zip,application/zip" aria-label="Zip della cartella" disabled={run?.busy || !!preparing} onChange={e => { setZipFile(e.target.files?.[0] || null); setPlan(null); setRun(null); }} /><small>{zipFile ? `${zipFile.name} · ${(zipFile.size / 1048576).toFixed(1)} MB` : 'Nessun file scelto'}</small></label>
            <label className="hi-file"><span>Elenco dei file (.txt)</span><input type="file" accept=".txt,text/plain" aria-label="Elenco dei file" disabled={run?.busy || !!preparing} onChange={e => { setManifestFile(e.target.files?.[0] || null); setPlan(null); setRun(null); }} /><small>{manifestFile ? manifestFile.name : 'Nessun file scelto'}</small></label>
          </div>
          <button type="button" className="hi-btn hi-btn-primary" disabled={!zipFile || !manifestFile || !!preparing || run?.busy} onClick={prepare}>{preparing ? `Controllo… ${preparing.done}/${preparing.total || '…'}` : 'Controlla i file'}</button>
        </section>}

        {plan && !run && <section className="hi-card hi-plan" aria-label="Anteprima">
          <h3>2. Anteprima — nulla è stato ancora inviato all’AI</h3>
          <ul className="hi-facts">
            <li className="hi-fact hi-fact-ok"><b>{plan.fresh.length}</b><span>note da leggere</span></li>
            <li className="hi-fact hi-fact-warn"><b>{plan.classified.secrets.length}</b><span>scartate: credenziali</span></li>
            <li className="hi-fact"><b>{plan.classified.skipped.length + plan.already.length}</b><span>già lette o non pertinenti</span></li>
            <li className="hi-fact"><b>{plan.classified.noSystem.length + plan.classified.unusable.length + plan.read.missing.length}</b><span>non utilizzabili o assenti</span></li>
          </ul>
          {plan.systems.length > 0 && <p className="hi-systems">Per sistema: {plan.systems.map(s => <span className="hi-chip" key={s.system}>{s.system} · {s.count}</span>)}</p>}
          {plan.manifest.stuck.length > 0 && <p className="hi-warn" role="status">{plan.manifest.stuck.length} righe dell’elenco sono incollate tra loro e vengono ignorate.</p>}
          {plan.classified.secrets.length > 0 && <details className="hi-details"><summary>Le {plan.classified.secrets.length} note con credenziali (restano sul tuo computer)</summary>
            <ul>{plan.classified.secrets.map(n => <li key={n.path}><code>{n.fileName}</code> — {[...new Set(n.hits.map(h => h.rule))].join(', ')}</li>)}</ul></details>}
          <p className="hi-hint">L’AI legge ogni nota e propone solo ciò che dura nel tempo: perché, vincoli, decisioni. Ogni voce resta <b>da confermare</b> e riporta il file da cui viene.</p>
          <div className="hi-actions">
            <button type="button" className="hi-btn hi-btn-primary" disabled={!plan.fresh.length} onClick={start}>{plan.fresh.length ? `Leggi ${plan.fresh.length} note con l’AI` : 'Niente da leggere'}</button>
            <button type="button" className="hi-btn" onClick={() => downloadText(`rapporto-storico-ai-${new Date().toISOString().slice(0, 10)}.md`, buildReport({ classified: plan.classified, missing: plan.read.missing, notInManifest: plan.read.notInManifest, stuck: plan.manifest.stuck }))}>Scarica il rapporto</button>
            <button type="button" className="hi-btn" onClick={() => setPlan(null)}>Annulla</button>
          </div>
        </section>}

        {run && <section className="hi-card" aria-label="Avanzamento">
          <h3>{run.busy ? '3. Lettura in corso' : 'Lettura terminata'}</h3>
          <div className="hi-bar" role="progressbar" aria-valuemin={0} aria-valuemax={run.total} aria-valuenow={run.done} aria-label="Avanzamento della lettura"><span style={{ width: `${run.total ? Math.round(run.done / run.total * 100) : 0}%` }} /></div>
          <p className="hi-hint">{run.done} di {run.total} note · {run.proposals} proposte finora{run.busy ? '. Puoi fermare: le note già lette restano.' : ''}</p>
          {run.busy && <button type="button" className="hi-btn" onClick={stop}>Ferma dopo la nota in corso</button>}
          {!run.busy && run.result && <>
            {run.result.stoppedBecause === 'ai' && <p className="hi-error" role="alert">Mi sono fermato: l’AI non ha risposto per {run.result.failed.length} note di fila. Controlla la tua configurazione AI e rilancia: le note già lette vengono saltate.</p>}
            {run.result.stoppedBecause === 'permessi' && <p className="hi-error" role="alert">Mi sono fermato: non hai i permessi per importare.</p>}
            {run.result.stoppedBecause === 'annullato' && <p className="hi-warn" role="status">Lettura fermata: {run.result.notStarted.length} note non sono state lette. Rilancia per continuare.</p>}
            <ul className="hi-facts">
              <li className="hi-fact hi-fact-ok"><b>{run.result.read.length}</b><span>note con proposte</span></li>
              <li className="hi-fact"><b>{run.result.withoutEntries.length}</b><span>senza conoscenza duratura</span></li>
              <li className="hi-fact hi-fact-warn"><b>{run.result.serverRefused.length}</b><span>rifiutate dal server: credenziali</span></li>
              <li className="hi-fact hi-fact-warn"><b>{run.result.failed.length}</b><span>in errore</span></li>
            </ul>
            <div className="hi-actions">
              <button type="button" className="hi-btn hi-btn-primary" onClick={() => downloadText(`rapporto-storico-ai-${new Date().toISOString().slice(0, 10)}.md`, lastReport)}>Scarica il rapporto</button>
              <button type="button" className="hi-btn" onClick={() => { setRun(null); setPlan(null); }}>Chiudi il riepilogo</button>
            </div></>}
        </section>}

        <div className="hi-tabs" role="tablist" aria-label="Cosa vuoi vedere">
          <button type="button" role="tab" id="hi-tab-review" aria-selected={view === 'review'} aria-controls="hi-panel-review" className={`hi-tab${view === 'review' ? ' is-active' : ''}`} onClick={() => setView('review')}>Da confermare{summary ? <span className="hi-pill">{summary.pending}</span> : null}</button>
          <button type="button" role="tab" id="hi-tab-library" aria-selected={view === 'library'} aria-controls="hi-panel-library" className={`hi-tab${view === 'library' ? ' is-active' : ''}`} onClick={() => setView('library')}>Cosa è stato importato{summary ? <span className="hi-pill">{summary.confirmed}</span> : null}</button>
        </div>
        {view === 'review' && <section className="hi-card" id="hi-panel-review" role="tabpanel" aria-labelledby="hi-tab-review" aria-label="Voci da confermare">
          <h3>Voci da confermare {pending ? <span className="hi-pill">{pending.total}</span> : null}</h3>
          {pending && pending.bySystem.length > 0 && <div className="hi-filter" role="group" aria-label="Filtra per sistema">
            <button type="button" className={`hi-chip hi-chip-btn${system === '' ? ' is-active' : ''}`} aria-pressed={system === ''} onClick={() => setSystem('')}>Tutti · {pending.total}</button>
            {pending.bySystem.map(s => <button type="button" key={s.system} className={`hi-chip hi-chip-btn${system === s.system ? ' is-active' : ''}`} aria-pressed={system === s.system} onClick={() => setSystem(s.system)}>{s.system.toUpperCase()} · {s.count}</button>)}
          </div>}
          {pending && !entries.length && <p className="hi-empty">{pending.total ? 'Nessuna voce per questo sistema.' : 'Nessuna voce in attesa. Importa un backup per vederne qui.'}</p>}
          {entries.length > 0 && <>
            {canEdit && <div className="hi-actions">
              <label className="hi-check"><input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? [] : entries.map(e => e.id))} /> Seleziona tutte ({entries.length})</label>
              <button type="button" className="hi-btn hi-btn-primary" disabled={!selected.length || deciding} onClick={() => decide('confermata')}>Conferma {selected.length || ''}</button>
              <button type="button" className="hi-btn" disabled={!selected.length || deciding} onClick={() => decide('scartata')}>Scarta {selected.length || ''}</button>
            </div>}
            <ul className="hi-entries">{entries.map(e => <li key={e.id} className={`hi-entry${selected.includes(e.id) ? ' is-selected' : ''}`}>
              {canEdit && <input type="checkbox" checked={selected.includes(e.id)} onChange={() => toggle(e.id)} aria-label={`Seleziona: ${e.text.slice(0, 60)}`} />}
              <div><span className={`hi-kind hi-kind-${e.kind}`}>{KIND_LABEL[e.kind] || e.kind}</span> <span className="hi-sys">{(e.system || '').toUpperCase()}{e.goto && !e.goto.startsWith('storico-') ? ` · ${e.goto}` : ''}</span>
                <p>{e.text}</p><small>da <code>{(e.sourceFile || '').split('/').pop()}</code>{e.sourceAuthor ? ` · ${e.sourceAuthor}` : ''} · {stamp(e.createdAt)}</small></div>
            </li>)}</ul>
            {pending.hasMore && <p className="hi-hint">Ne mostro {entries.length} per volta: dopo averle decise compaiono le successive.</p>}</>}
        </section>}
        {view === 'library' && <section className="hi-card" id="hi-panel-library" role="tabpanel" aria-labelledby="hi-tab-library" aria-label="Cosa è stato importato">
          <div className="hi-states" role="group" aria-label="Stato delle voci">
            {[['confermata', 'Confermate'], ['scartata', 'Scartate'], ['proposta', 'Da confermare']].map(([id, label]) => <button type="button" key={id} className={`hi-chip hi-chip-btn${browse.status === id ? ' is-active' : ''}`} aria-pressed={browse.status === id} onClick={() => setBrowse(previous => ({ ...previous, status: id, system: '', kind: '' }))}>{label}</button>)}
          </div>
          <input type="search" className="hi-search" aria-label="Cerca tra le voci importate" placeholder="Cerca nel testo o nel nome della nota…" value={searchText} maxLength={200} onChange={e => setSearchText(e.target.value)} />
          {library && library.systems.length > 0 && <div className="hi-filter" role="group" aria-label="Filtra per sistema">
            <button type="button" className={`hi-chip hi-chip-btn${browse.system === '' ? ' is-active' : ''}`} aria-pressed={browse.system === ''} onClick={() => setBrowse(previous => ({ ...previous, system: '' }))}>Tutti i sistemi · {library.total}</button>
            {library.systems.map(g => <button type="button" key={g.system} className={`hi-chip hi-chip-btn${browse.system === g.system ? ' is-active' : ''}`} aria-pressed={browse.system === g.system} onClick={() => setBrowse(previous => ({ ...previous, system: g.system }))}>{g.system.toUpperCase()} · {g.count}</button>)}
          </div>}
          {library && library.kinds.length > 0 && <div className="hi-filter" role="group" aria-label="Filtra per tipo">
            <button type="button" className={`hi-chip hi-chip-btn${browse.kind === '' ? ' is-active' : ''}`} aria-pressed={browse.kind === ''} onClick={() => setBrowse(previous => ({ ...previous, kind: '' }))}>Tutti i tipi</button>
            {library.kinds.map(g => <button type="button" key={g.kind} className={`hi-chip hi-chip-btn${browse.kind === g.kind ? ' is-active' : ''}`} aria-pressed={browse.kind === g.kind} onClick={() => setBrowse(previous => ({ ...previous, kind: g.kind }))}>{KIND_LABEL[g.kind] || g.kind} · {g.count}</button>)}
          </div>}
          {library && <p className="hi-hint" role="status">{library.matching === library.total ? `${library.total} voci` : `${library.matching} voci su ${library.total}`}{browse.q ? ` per «${browse.q}»` : ''}.</p>}
          {libraryLoading && !library && <p className="hi-hint">Caricamento…</p>}
          {library && library.entries.length === 0 && <p className="hi-empty">{library.total === 0 ? (browse.status === 'confermata' ? 'Ancora nessuna voce confermata. Importa un backup e conferma le voci nella scheda «Da confermare».' : 'Nessuna voce in questo stato.') : 'Nessuna voce corrisponde ai filtri.'}</p>}
          {library && library.entries.length > 0 && <ul className="hi-entries">{library.entries.map(e => <li key={e.id} className="hi-entry">
            <div><span className={`hi-kind hi-kind-${e.kind}`}>{KIND_LABEL[e.kind] || e.kind}</span> <span className="hi-sys">{(e.system || '').toUpperCase()}{e.goto && !e.goto.startsWith('storico-') ? ` · ${e.goto}` : ''}</span>
              <p>{e.text}</p>
              <small>da <code>{(e.sourceFile || '').split('/').pop()}</code>{e.sourceAuthor ? ` · ${e.sourceAuthor}` : ''}{e.decidedAt ? ` · ${e.status === 'scartata' ? 'scartata' : 'confermata'} da ${e.decidedByFullName || e.decidedBy} il ${stamp(e.decidedAt)}` : ` · importata ${stamp(e.createdAt)}`}</small></div>
          </li>)}</ul>}
          {library?.hasMore && <button type="button" className="hi-btn" disabled={libraryLoading} onClick={() => loadLibrary(browse, true, library.entries[library.entries.length - 1].id)}>{libraryLoading ? 'Caricamento…' : 'Mostra altre'}</button>}
        </section>}
      </aside>
    </div>, document.body)}
  </>;
}
