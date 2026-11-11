import { createPortal } from 'react-dom';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ledgerRequest } from '../services/mevService';
import { parseInitiativeLedger, STATUSES } from './initiativeLedgerParser';
import { toImportRows, sha256Hex, checkLedgerFile, previewSummary, hasWork, outcomeOf, statusLabel, statusTone, buildUpdate, filterLabel, eventKind, downloadText, readFileText, EDITABLE } from './ledgerModel';
import { relativeTime } from './developmentCollaboration';
import './ledgerPanel.css';

const stamp = value => value ? new Date(value).toLocaleString('it-IT', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
const dateIt = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };

// Icon for the header: a clock with a counter-clockwise arrow ("history"). Decorative: the button carries the accessible name.
export function LedgerIcon({ size = 22 }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" /><polyline points="3 3.5 3.6 7.2 7.3 6.6" /><polyline points="12 7.5 12 12 15.3 14" />
  </svg>;
}

// The history of the initiatives of the environment: a trigger with an icon, and a side panel that lists them, filters them,
// shows what changed and when, and imports/exports the Markdown file. It reads and writes only through the server.
export default function LedgerPanel({ canEdit = true, onOpenInitiative }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [filters, setFilters] = useState({ status: '', system: '', pm: '', release: '', q: '' });
  const [archived, setArchived] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [draft, setDraft] = useState({});
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState({ kind: 'nota', text: '' });
  const [importState, setImportState] = useState(null);
  const [creating, setCreating] = useState(null);
  const fileInput = useRef(null); const closeButton = useRef(null); const trigger = useRef(null); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams(); Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); }); if (archived) params.set('archived', 'true');
      const result = await ledgerRequest(`?${params}`);
      if (alive.current) { setData(result); setError(''); }
    } catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setLoading(false); }
  }, [filters, archived]);

  // The list is loaded when the panel opens and whenever a filter changes; typing in the search waits a moment.
  useEffect(() => {
    if (!open) return undefined;
    const timer = setTimeout(load, filters.q ? 280 : 0);
    return () => clearTimeout(timer);
  }, [open, load, filters.q]);

  // The count shown next to the icon is loaded once, without opening the panel. A failure here is silent: the panel reports it when opened.
  useEffect(() => { ledgerRequest('').then(result => { if (alive.current) setData(result); }).catch(() => {}); }, []);

  useEffect(() => {
    if (!open) return undefined;
    closeButton.current?.focus();
    const onKey = event => { if (event.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const close = () => { setOpen(false); setSelected(null); setDetail(null); setImportState(null); setCreating(null); trigger.current?.focus(); };

  const openDetail = async (id, { keepNotice = false } = {}) => {
    setSelected(id); setDetail(null); setError(''); if (!keepNotice) setNotice('');
    try {
      const result = await ledgerRequest(String(id));
      if (!alive.current) return;
      if (!result?.initiative) { setSelected(null); setError('Iniziativa non trovata: potrebbe essere stata archiviata o rimossa.'); return; }
      setDetail({ ...result, events: result.events || [] }); setDraft({});
    } catch (e) { if (alive.current) { setSelected(null); setError(e.message); } }
  };
  const act = async (work, success) => { setError(''); setNotice(''); try { const result = await work(); if (success) setNotice(success); return result; } catch (e) { setError(e.message); return null; } };

  const save = async () => {
    const body = buildUpdate(detail.initiative, draft);
    if (!body) { setNotice('Nessuna modifica da salvare.'); return; }
    setSaving(true);
    const result = await act(() => ledgerRequest(String(detail.initiative.id), { method: 'PUT', body }), 'Modifica salvata e registrata nella cronologia.');
    setSaving(false);
    if (result) { await openDetail(detail.initiative.id, { keepNotice: true }); await load(); }
  };
  const addNote = async () => {
    if (!note.text.trim()) { setError('Scrivi cosa è successo.'); return; }
    const result = await act(() => ledgerRequest(`${detail.initiative.id}/events`, { body: { kind: note.kind, text: note.text.trim() } }), note.kind === 'attivita' ? 'Attività registrata.' : 'Nota aggiunta.');
    if (result) { setNote({ kind: note.kind, text: '' }); await openDetail(detail.initiative.id, { keepNotice: true }); }
  };
  const archive = async value => {
    if (value && !window.confirm('Archiviare l’iniziativa? Non comparirà più nell’elenco, ma la cronologia resta e si può ripristinare.')) return;
    const result = await act(() => ledgerRequest(`${detail.initiative.id}/archive`, { body: { archived: value } }), value ? 'Iniziativa archiviata.' : 'Iniziativa ripristinata.');
    if (result) { await openDetail(detail.initiative.id, { keepNotice: true }); await load(); }
  };
  const create = async event => {
    event.preventDefault();
    const result = await act(() => ledgerRequest('', { body: creating }), 'Iniziativa creata.');
    if (result) { setCreating(null); await load(); openDetail(result.initiative.id, { keepNotice: true }); }
  };

  // ---- file import: read → parse here → preview on the server → confirm ----
  const chooseFile = async event => {
    const file = event.target.files?.[0]; event.target.value = '';
    if (!file) return;
    setError(''); setNotice('');
    const problem = checkLedgerFile(file);
    if (problem) { setError(problem); return; }
    setImportState({ busy: true, fileName: file.name });
    try {
      const text = await readFileText(file);
      const parsed = parseInitiativeLedger(text);
      if (parsed.errors.length) { setImportState({ fileName: file.name, parsed, errors: parsed.errors }); return; }
      const request = { rows: toImportRows(parsed.rows), fileName: file.name, sha256: await sha256Hex(text), sourceDate: parsed.meta.updatedAt };
      const preview = await ledgerRequest('import/preview', { body: request });
      if (alive.current) setImportState({ fileName: file.name, parsed, request, preview });
    } catch (e) { if (alive.current) { setImportState(null); setError(e.message); } }
  };
  const confirmImport = async () => {
    setImportState(previous => ({ ...previous, busy: true }));
    try {
      const result = await ledgerRequest('import', { body: importState.request });
      setImportState(null);
      setNotice(`Importazione completata: ${previewSummary(result)}.`);
      await load();
    } catch (e) { setImportState(previous => ({ ...previous, busy: false })); setError(e.message); }
  };
  const exportFile = async () => {
    const result = await act(() => ledgerRequest('export'));
    if (result) { downloadText(result.fileName, result.markdown); setNotice(`File scaricato: ${result.count} iniziative, nello stesso formato che puoi reimportare.`); }
  };

  const counts = data?.counts || {};
  const initiatives = useMemo(() => data?.initiatives || [], [data]);
  const dirty = detail && !!buildUpdate(detail.initiative, draft);
  const grouped = useMemo(() => STATUSES.map(status => ({ status, rows: initiatives.filter(row => row.status === status.id) })).filter(group => group.rows.length), [initiatives]);
  const set = patch => setFilters(previous => ({ ...previous, ...patch }));

  return <>
    <button type="button" ref={trigger} className="ledger-trigger" onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open} title="Storico delle iniziative: stato, release, PM e cronologia delle modifiche">
      <LedgerIcon /><span className="ledger-trigger-text"><strong>Storico iniziative</strong><small>{data ? (data.total ? `${data.total} iniziative` : 'Nessuna ancora') : 'Apri lo storico'}</small></span>
    </button>
    {open && createPortal(<div className="ledger-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
      <aside className="ledger" role="dialog" aria-modal="true" aria-label="Storico delle iniziative">
        <header className="ledger-head">
          <span className="ledger-head-icon"><LedgerIcon size={26} /></span>
          <div><span className="ledger-eyebrow">Memoria del lavoro</span><h2>Storico delle iniziative</h2>
            <p>{data ? filterLabel(filters, data.total, data.shown) : 'Caricamento…'}{data?.lastImport ? ` · ultimo file ${data.lastImport.fileName}${data.lastImport.sourceDate ? ` del ${dateIt(data.lastImport.sourceDate)}` : ''}` : ''}</p></div>
          <button type="button" ref={closeButton} className="ledger-close" onClick={close} aria-label="Chiudi lo storico">✕</button>
        </header>

        <div className="ledger-toolbar">
          {canEdit && <><button type="button" className="ledger-btn ledger-btn-primary" onClick={() => fileInput.current?.click()} disabled={!!importState?.busy}>Importa file .md</button>
            <input ref={fileInput} type="file" accept=".md,.markdown,.txt,text/markdown,text/plain" hidden aria-label="Importa file dello stato delle iniziative" onChange={chooseFile} />
            <button type="button" className="ledger-btn" onClick={() => setCreating({ goto: '', title: '', system: '', pmPoste: '', status: 'in-analisi' })}>+ Nuova iniziativa</button></>}
          <button type="button" className="ledger-btn" onClick={exportFile} disabled={!data?.total}>Scarica .md aggiornato</button>
          <button type="button" className="ledger-btn" onClick={load} disabled={loading}>↻ Aggiorna</button>
          <label className="ledger-check"><input type="checkbox" checked={archived} onChange={event => setArchived(event.target.checked)} /> Mostra archiviate</label>
        </div>
        {error && <p className="ledger-error" role="alert">{error}</p>}
        {notice && <p className="ledger-notice" role="status">{notice}</p>}

        {importState && <section className="ledger-import" aria-label="Importazione del file">
          <h3>Importazione · {importState.fileName}</h3>
          {importState.busy && !importState.preview && !importState.errors && <p>Lettura del file…</p>}
          {importState.errors && <><p className="ledger-error">Il file non può essere importato:</p><ul>{importState.errors.map((e, i) => <li key={i}>{e}</li>)}</ul></>}
          {importState.parsed?.warnings?.length > 0 && <div className="ledger-warn"><b>Da controllare ({importState.parsed.warnings.length})</b><ul>{importState.parsed.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>}
          {importState.preview && <>
            <p className="ledger-import-sum"><b>{previewSummary(importState.preview)}</b> · aggiornamento al {dateIt(importState.parsed.meta.updatedAt) || 'data non indicata'}{importState.parsed.meta.pmCap ? ` · PM CAP ${importState.parsed.meta.pmCap}` : ''}</p>
            <p className="ledger-hint">Nulla è stato ancora salvato. Un valore vuoto nel file non cancella mai un dato già noto; le iniziative non presenti nel file restano dov’erano.</p>
            <ul className="ledger-plan">{importState.preview.items.filter(item => item.outcome !== 'invariata').map(item => { const outcome = outcomeOf(item.outcome);
              return <li key={item.index} className={`ledger-plan-${outcome.tone}`}><span className={`ledger-chip ledger-chip-${outcome.tone}`} title={outcome.hint}>{outcome.label}</span>
                <b>{item.goto || 'TBD'}</b> {item.title}{item.system ? <small> · {item.system}</small> : null}
                {item.summary && <small className="ledger-plan-sum">{item.summary}{item.stale ? ' (file più vecchio: solo campi vuoti)' : ''}</small>}
                {item.reason && <small className="ledger-plan-sum">{item.reason}</small>}</li>; })}</ul>
            {importState.preview.unchanged > 0 && <p className="ledger-hint">{importState.preview.unchanged} {importState.preview.unchanged === 1 ? 'iniziativa è invariata' : 'iniziative sono invariate'} e non vengono elencate.</p>}
          </>}
          <div className="ledger-actions">
            <button type="button" className="ledger-btn ledger-btn-primary" onClick={confirmImport} disabled={!hasWork(importState.preview) || importState.busy}>{importState.busy ? 'Importazione…' : hasWork(importState.preview) ? 'Conferma importazione' : 'Niente da importare'}</button>
            <button type="button" className="ledger-btn" onClick={() => setImportState(null)} disabled={importState.busy}>Annulla</button></div>
        </section>}

        {creating && <form className="ledger-create" onSubmit={create} aria-label="Nuova iniziativa">
          <h3>Nuova iniziativa</h3>
          <div className="ledger-grid">
            <label>GOTO<input value={creating.goto} placeholder="vuoto se non ancora assegnato" onChange={event => setCreating({ ...creating, goto: event.target.value })} /></label>
            <label>Titolo<input value={creating.title} onChange={event => setCreating({ ...creating, title: event.target.value })} required /></label>
            <label>Sistema<input value={creating.system} onChange={event => setCreating({ ...creating, system: event.target.value })} required /></label>
            <label>PM Poste<input value={creating.pmPoste} onChange={event => setCreating({ ...creating, pmPoste: event.target.value })} /></label>
            <label>Stato<select value={creating.status} onChange={event => setCreating({ ...creating, status: event.target.value })}>{STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label></div>
          <div className="ledger-actions"><button type="submit" className="ledger-btn ledger-btn-primary">Crea</button><button type="button" className="ledger-btn" onClick={() => setCreating(null)}>Annulla</button></div></form>}

        {!selected && <>
          {data && data.total > 0 && <ul className="ledger-stats" aria-label="Iniziative per stato">{STATUSES.map(status => <li key={status.id}><button type="button" className={`ledger-stat ledger-stat-${status.tone}${filters.status === status.id ? ' is-active' : ''}`} aria-pressed={filters.status === status.id}
            aria-label={`${status.label}: ${counts[status.id] || 0}`} onClick={() => set({ status: filters.status === status.id ? '' : status.id })}><b>{counts[status.id] || 0}</b><span>{status.label}</span></button></li>)}</ul>}
          <div className="ledger-filters" role="search">
            <label className="ledger-sr" htmlFor="ledger-q">Cerca nello storico</label>
            <input id="ledger-q" type="search" placeholder="Cerca per GOTO, titolo, sistema, PM, note…" value={filters.q} onChange={event => set({ q: event.target.value })} />
            <label>Sistema<select value={filters.system} onChange={event => set({ system: event.target.value })}><option value="">Tutti</option>{(data?.systems || []).map(name => <option key={name}>{name}</option>)}</select></label>
            <label>PM Poste<select value={filters.pm} onChange={event => set({ pm: event.target.value })}><option value="">Tutti</option>{(data?.pms || []).map(name => <option key={name}>{name}</option>)}</select></label>
            <label>Release<select value={filters.release} onChange={event => set({ release: event.target.value })}><option value="">Tutte</option>{(data?.releases || []).map(name => <option key={name}>{name}</option>)}</select></label>
            {Object.values(filters).some(Boolean) && <button type="button" className="ledger-btn" onClick={() => setFilters({ status: '', system: '', pm: '', release: '', q: '' })}>Azzera filtri</button>}
          </div>
          {loading && !data && <p className="ledger-empty" role="status">Caricamento dello storico…</p>}
          {data && data.total === 0 && !loading && <div className="ledger-empty"><b>Lo storico è vuoto.</b><span>{canEdit ? 'Importa il file dello stato delle iniziative (.md) oppure crea la prima iniziativa.' : 'Chi ha i permessi di modifica può importare il file.'}</span></div>}
          {data && data.total > 0 && !initiatives.length && <p className="ledger-empty">Nessuna iniziativa corrisponde ai filtri.</p>}
          <div className="ledger-list">{grouped.map(({ status, rows }) => <section key={status.id} aria-label={status.label}>
            <h3 className="ledger-group"><span className={`ledger-dot ledger-dot-${status.tone}`} aria-hidden="true" />{status.label}<b>{rows.length}</b></h3>
            <ul>{rows.map(row => <li key={row.id}><button type="button" className="ledger-row" onClick={() => openDetail(row.id)}>
              <span className="ledger-row-goto">{row.goto || 'TBD'}</span>
              <span className="ledger-row-main"><strong>{row.title}</strong><small>{row.system}{row.pmPoste ? ` · PM ${row.pmPoste}` : ''}</small></span>
              <span className="ledger-row-meta">{row.release || row.plannedRelease ? <span className="ledger-pill">{row.release || `prev. ${row.plannedRelease}`}</span> : null}{row.collaudoDate ? <small>collaudo {dateIt(row.collaudoDate)}</small> : null}</span>
              <span className="ledger-row-go" aria-hidden="true">›</span></button></li>)}</ul></section>)}</div>
        </>}

        {selected && <section className="ledger-detail" aria-label="Dettaglio dell’iniziativa">
          <button type="button" className="ledger-back" onClick={() => { if (dirty && !window.confirm('Tornare all’elenco? Le modifiche non salvate andranno perse.')) return; setSelected(null); setDetail(null); }}>← Tutte le iniziative</button>
          {!detail && !error && <p className="ledger-empty" role="status">Caricamento…</p>}
          {detail && <>
            <div className="ledger-detail-head"><span className="ledger-row-goto">{detail.initiative.goto || 'TBD'}</span><div><h3>{detail.initiative.title}</h3><p>{detail.initiative.system}{detail.initiative.pmPoste ? ` · PM ${detail.initiative.pmPoste}` : ''}</p></div>
              <span className={`ledger-chip ledger-chip-${statusTone(detail.initiative.status)}`}>{statusLabel(detail.initiative.status)}</span></div>
            {detail.initiative.archived && <p className="ledger-warn">Questa iniziativa è archiviata.</p>}
            {detail.initiative.gotoPlaceholder && <p className="ledger-hint">Il GOTO non è ancora assegnato. Quando Poste lo comunica, scrivilo qui sotto: l’iniziativa resta la stessa e la cronologia si conserva.</p>}
            <div className="ledger-grid">
              {EDITABLE.map(([key, label]) => key === 'status'
                ? <label key={key}>{label}<select value={draft.status ?? detail.initiative.status} disabled={!canEdit} onChange={event => setDraft({ ...draft, status: event.target.value })}>{STATUSES.map(status => <option key={status.id} value={status.id}>{status.label}</option>)}</select></label>
                : ['notes', 'released', 'missing'].includes(key)
                  ? <label key={key} className="ledger-wide">{label}<textarea rows={3} value={draft[key] ?? detail.initiative[key] ?? ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>
                  : <label key={key}>{label}<input value={draft[key] ?? detail.initiative[key] ?? ''} disabled={!canEdit} onChange={event => setDraft({ ...draft, [key]: event.target.value })} /></label>)}
              {detail.initiative.gotoPlaceholder && <label>GOTO assegnato<input value={draft.goto ?? ''} disabled={!canEdit} placeholder="es. 147001" onChange={event => setDraft({ ...draft, goto: event.target.value })} /></label>}
            </div>
            {(detail.initiative.collaudoDate || detail.initiative.amounts?.length > 0) && <dl className="ledger-facts">
              {detail.initiative.collaudoDate && <><dt>Rilascio al collaudo</dt><dd>{dateIt(detail.initiative.collaudoDate)}</dd></>}
              {detail.initiative.amounts?.length > 0 && <><dt>Importi citati nelle note</dt><dd>{detail.initiative.amounts.map(a => a.text).join(' · ')}</dd></>}</dl>}
            <div className="ledger-actions">
              {canEdit && <button type="button" className="ledger-btn ledger-btn-primary" onClick={save} disabled={saving || !dirty}>{saving ? 'Salvataggio…' : 'Salva modifiche'}</button>}
              {dirty && <span className="ledger-dirty" role="status">Modifiche non salvate</span>}
              {onOpenInitiative && <button type="button" className="ledger-btn" onClick={() => { onOpenInitiative(detail.initiative); close(); }}>Apri nel Configuratore</button>}
              {canEdit && <button type="button" className="ledger-btn" onClick={() => archive(!detail.initiative.archived)}>{detail.initiative.archived ? 'Ripristina' : 'Archivia'}</button>}</div>
            <p className="ledger-meta">Revisione {detail.initiative.revision} · creata {stamp(detail.initiative.createdAt)} da {detail.initiative.createdBy}{detail.initiative.sourceFile ? ` · da file ${detail.initiative.sourceFile}` : ''} · ultimo aggiornamento {relativeTime(detail.initiative.updatedAt)} ({detail.initiative.updatedBy})</p>

            <h4 className="ledger-sub">Cronologia</h4>
            {canEdit && <form className="ledger-note" onSubmit={event => { event.preventDefault(); addNote(); }}>
              <label className="ledger-sr" htmlFor="ledger-note">Aggiungi alla cronologia</label>
              <select aria-label="Tipo di voce" value={note.kind} onChange={event => setNote({ ...note, kind: event.target.value })}><option value="nota">Nota</option><option value="attivita">Attività svolta</option></select>
              <input id="ledger-note" value={note.text} maxLength={2000} placeholder="Es. Stima consegnata a Poste il 12/11" onChange={event => setNote({ ...note, text: event.target.value })} />
              <button type="submit" className="ledger-btn" disabled={!note.text.trim()}>Aggiungi</button></form>}
            <ol className="ledger-timeline">{detail.events.map(event => { const kind = eventKind(event.kind);
              return <li key={event.id}><span className={`ledger-chip ledger-chip-${kind.tone}`}>{kind.label}</span><p>{event.summary}</p>
                {Array.isArray(event.changes) && event.changes.length > 0 && <ul className="ledger-changes">{event.changes.map((change, i) => <li key={i}><b>{change.label}</b>: <s>{change.from ?? '—'}</s> → {change.to ?? '—'}</li>)}</ul>}
                <small>{event.actorFullName || event.actor} · {stamp(event.at)}</small></li>; })}</ol>
          </>}
        </section>}
      </aside>
    </div>, document.body)}
  </>;
}
