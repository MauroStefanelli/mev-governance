import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rationaleRequest } from '../services/mevService';
import { KINDS, KIND_ORDER, MAX_QUESTION, MAX_ENTRY, kindLabel, validateText, initiativeCode, mergeById, groupEntries, countByKind, notYetTaken } from './rationaleKnowledge';
import { displayName, relativeTime } from './developmentCollaboration';
import { sourceExcerptsFor, chosenFilesSummary, pasteItem, checkAttachments, attachmentSummary, createSourceCache, formatSize, MAX_PASTE, CONNECTION_FIELDS, loadConnection, saveConnection, connectionWarnings } from './rationaleAttachments';
import './rationalePanel.css';

// Chat with the AI about why interventions are needed + the confirmed knowledge distilled from it.
// The AI only proposes: a person confirms. Confirmed entries feed the offer review and Sviluppo.
const CODE_QUESTION_EXAMPLES = ['In quale punto del codice viene emesso il codice di errore ITEM_V_28 e con quale condizione?', 'Quali condizioni impediscono la stampa dell’etichetta H7?', 'Dove si decide se una LDV può essere inserita in una HU?'];

export default function RationalePanel({ initiative, interventions = [], onKnowledge }) {
  const code = initiativeCode(initiative);
  const [messages, setMessages] = useState([]);
  const [entries, setEntries] = useState([]);
  const [related, setRelated] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [questions, setQuestions] = useState([]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [adding, setAdding] = useState(null);
  const [editing, setEditing] = useState({});
  const [tab, setTab] = useState('proposals');
  const [open, setOpen] = useState(false);
  const [sourceFiles, setSourceFiles] = useState([]);
  const [sourceName, setSourceName] = useState('');
  const [pasted, setPasted] = useState([]);
  const [pasting, setPasting] = useState(null);
  const [attachNotice, setAttachNotice] = useState('');
  const [codeTerms, setCodeTerms] = useState('');
  const [reading, setReading] = useState('');
  const [chosen, setChosen] = useState(null);
  const [connection, setConnection] = useState(() => loadConnection());
  const [connectionOpen, setConnectionOpen] = useState(false);
  const sourceCache = useRef(createSourceCache());
  const listRef = useRef(null); const inputRef = useRef(null); const stick = useRef(true);

  const report = useCallback(list => onKnowledge?.(list), [onKnowledge]);
  useEffect(() => {
    let alive = true;
    setMessages([]); setEntries([]); setRelated([]); setQuestions([]); setError(''); setNotice(''); setAdding(null); setEditing({});
    if (!code) return undefined;
    setLoading(true);
    (async () => {
      try {
        const data = await rationaleRequest(`?goto=${encodeURIComponent(code)}&limit=100`);
        if (!alive) return;
        setMessages(data.messages); setHasMore(data.hasMore); setEntries(data.entries); report(data.entries);
        if (data.entries.some(entry => entry.status === 'proposta')) setTab('proposals'); else if (data.entries.some(entry => entry.status === 'confermata')) setTab('confirmed');
      } catch (e) { if (alive) setError(e.message); } finally { if (alive) setLoading(false); }
      if (initiative.system && alive) rationaleRequest(`related?system=${encodeURIComponent(initiative.system)}&goto=${encodeURIComponent(code)}`).then(list => { if (alive) setRelated(list); }).catch(() => {});
    })();
    return () => { alive = false; };
  }, [code, initiative.system, report]);

  useLayoutEffect(() => { const list = listRef.current; if (list && stick.current) list.scrollTop = list.scrollHeight; }, [messages, busy]);
  const onScroll = () => { const list = listRef.current; if (list) stick.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40; };

  const apply = updater => setEntries(previous => { const next = updater(previous); report(next); return next; });
  const ask = async question => {
    const check = validateText(question, MAX_QUESTION);
    if (!check.ok) { setError(check.reason); return; }
    if (!code) { setError('Compila prima il codice GOTO o il titolo dell’iniziativa.'); return; }
    setBusy(true); setError(''); setNotice(''); stick.current = true;
    try {
      setAttachNotice('');
      const excerpts = sourceFiles.length ? await sourceExcerptsFor(check.value, sourceFiles, sourceCache.current, { extraTerms: codeTerms, onProgress: (done, total) => setReading(total > 200 ? `Leggo la cartella: ${done} file su ${total}…` : '') }) : { items: [], coverage: null, terms: [] };
      setReading('');
      setChosen(sourceFiles.length ? chosenFilesSummary(excerpts.items, excerpts.terms) : null);
      const { kept, dropped } = checkAttachments([...excerpts.items, ...pasted]);
      const result = await rationaleRequest('messages', { goto: code, question: check.value, title: initiative.title, system: initiative.system, description: initiative.description,
        interventions: interventions.slice(0, 40).map(item => ({ id: item.id, title: item.titolo || item.title || '' })), attachments: kept });
      const serverSide = result.attachments || { sent: kept.map(a => ({ kind: a.kind, name: a.name })), dropped: [], notes: [] };
      const summary = attachmentSummary({ sent: serverSide.sent, dropped: [...dropped, ...serverSide.dropped], notes: serverSide.notes });
      setAttachNotice([summary.text, excerpts.coverage ? excerpts.coverage.notice : '', ...summary.notes].filter(Boolean).join(' · '));
      setPasted([]);
      setMessages(previous => mergeById(previous, [result.question, result.answer])); setText(''); setQuestions(result.questions || []);
      if (result.proposals.length) { apply(previous => mergeById(previous, result.proposals)); setTab('proposals'); setOpen(true); setNotice(`${result.proposals.length} ${result.proposals.length === 1 ? 'nuova voce proposta' : 'nuove voci proposte'} dall’AI: confermale o scartale.`); }
    } catch (e) {
      if (e.saved) { setMessages(previous => mergeById(previous, [e.saved])); setText(''); }
      setError(e.message);
    } finally { setBusy(false); setReading(''); }
  };

  const decide = async (entry, decision) => {
    setError('');
    try {
      const text = decision === 'confermata' && editing[entry.id] !== undefined ? editing[entry.id] : undefined;
      if (text !== undefined) { const check = validateText(text, MAX_ENTRY); if (!check.ok) { setError(check.reason); return; } }
      const saved = await rationaleRequest(`entries/${entry.id}/decision`, { decision, text });
      apply(previous => mergeById(previous, [saved])); setEditing(({ [entry.id]: _drop, ...rest }) => rest);
      if (decision === 'confermata') setTab('confirmed');
    } catch (e) { setError(e.message); }
  };
  const addEntry = async event => {
    event.preventDefault();
    const check = validateText(adding.text, MAX_ENTRY);
    if (!check.ok) { setError(check.reason); return; }
    setError('');
    try {
      const saved = await rationaleRequest('entries', { goto: code, kind: adding.kind, text: check.value, interventionId: adding.interventionId || null, system: initiative.system });
      apply(previous => mergeById(previous, [saved])); setAdding(null); setTab('confirmed');
    } catch (e) { setError(e.message); }
  };
  const inherit = async entry => {
    setError('');
    try { const saved = await rationaleRequest(`entries/${entry.id}/inherit`, { goto: code, system: initiative.system }); apply(previous => mergeById(previous, [saved])); setTab('proposals'); setNotice('Voce ripresa: confermala se vale anche per questa iniziativa.'); }
    catch (e) { setError(e.message); }
  };
  const loadOlder = async () => {
    try {
      const data = await rationaleRequest(`?goto=${encodeURIComponent(code)}&before=${messages[0].id}&limit=100`);
      const list = listRef.current; const before = list?.scrollHeight || 0; stick.current = false;
      setMessages(previous => mergeById(previous, data.messages)); setHasMore(data.hasMore);
      requestAnimationFrame(() => { if (list) list.scrollTop = list.scrollHeight - before; });
    } catch (e) { setError(e.message); }
  };

  const pickFolder = () => {
    const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', '');
    input.onchange = () => { const files = [...input.files]; if (!files.length) return; sourceCache.current = createSourceCache(); setSourceFiles(files); setSourceName((files[0].webkitRelativePath || '').split('/')[0] || 'cartella'); };
    input.click();
  };
  const clearFolder = () => { setSourceFiles([]); setSourceName(''); setChosen(null); sourceCache.current = createSourceCache(); };
  const addPasted = event => {
    event.preventDefault();
    const text = String(pasting?.text || '').trim(); if (!text) return;
    if (text.length > MAX_PASTE) { setError(`Il testo incollato supera ${MAX_PASTE} caratteri: incolla solo le righe che servono.`); return; }
    const item = pasteItem(pasting.name, text); const { dropped } = checkAttachments([item]);
    // A refused text is erased from the box at once: a credential must not stay on screen (or in a screenshot) after the app has said it will not use it.
    if (dropped.length) { setPasting(previous => ({ ...previous, text: '' })); setError(`Non posso allegare «${item.name}»: contiene ${dropped[0].reason}${dropped[0].line ? ` alla riga ${dropped[0].line}` : ''}. Il testo è stato cancellato dalla casella: rimuovi la credenziale e incolla di nuovo.`); return; }
    setError(''); setPasted(previous => [...previous, item]); setPasting(null);
  };
  const changeConnection = (id, value) => { const next = { ...connection, [id]: value }; setConnection(next); saveConnection(next); };

  const groups = groupEntries(entries); const counts = countByKind(entries); const suggestions = notYetTaken(related, entries);
  const who = entry => entry.byAi ? 'Proposto dall’AI' : `Aggiunto da ${displayName({ fullName: entry.createdByFullName, username: entry.createdBy })}`;
  const card = (entry, actions) => <li key={entry.id} className={`rat-entry rat-${entry.kind}`}>
    <span className="rat-kind">{kindLabel(entry.kind)}{entry.interventionId ? ` · ${entry.interventionId}` : ''}</span>
    {actions === 'proposal' ? <textarea aria-label={`Testo della voce ${entry.id}`} rows={3} value={editing[entry.id] ?? entry.text} onChange={event => setEditing(previous => ({ ...previous, [entry.id]: event.target.value }))} />
      : <p className="rat-text">{entry.text}</p>}
    <span className="rat-meta">{who(entry)} · {relativeTime(entry.createdAt)}{entry.sourceEntryId ? ' · ripresa da un’altra iniziativa' : ''}
      {entry.decidedAt ? ` · ${entry.status === 'confermata' ? 'confermata' : entry.status === 'revocata' ? 'revocata' : 'scartata'} da ${displayName({ fullName: entry.decidedByFullName, username: entry.decidedBy })}` : ''}</span>
    {actions === 'proposal' && <span className="rat-actions"><button type="button" className="rat-primary" onClick={() => decide(entry, 'confermata')}>Conferma</button><button type="button" onClick={() => decide(entry, 'scartata')}>Scarta</button></span>}
    {actions === 'confirmed' && <span className="rat-actions"><button type="button" onClick={() => { if (window.confirm('Revocare questa voce? Non sarà più usata per offerta, sviluppo e altre iniziative.')) decide(entry, 'revocata'); }}>Revoca</button></span>}
  </li>;

  return <section className="rat" aria-label="Razionali e vincoli con l’AI">
    <header className="rat-head">
      <div><span className="rat-eyebrow">Conoscenza dell’iniziativa</span><h3>Razionali e vincoli con l’AI</h3>
        <p>Racconta all’AI perché servono gli interventi e quali vincoli valgono. Ciò che confermi guida l’offerta, lo Sviluppo e le iniziative future sullo stesso sistema.</p></div>
      <ul className="rat-counts" aria-label="Voci confermate">{KIND_ORDER.map(kind => <li key={kind}><b>{counts[kind]}</b>{KINDS[kind].plural}</li>)}</ul>
    </header>
    <ol className="rat-flow" aria-label="Come funziona"><li><b>1</b>Spiega all’AI</li><li><b>2</b>L’AI propone voci</li><li><b>3</b>Tu confermi</li><li><b>4</b>Le usano offerta e Sviluppo</li></ol>
    {!code && <p className="rat-empty">Compila il codice GOTO o il titolo dell’iniziativa per aprire la conversazione.</p>}
    {code && <div className="rat-stack">
      <div className="rat-chat">
        <div className={`rat-desk${messages.length || loading || busy ? ' has-messages' : ''}`} onClick={event => { if (!event.target.closest('button, input, textarea, select, label, summary, details, a, time')) inputRef.current?.focus(); }}>
          <ol className="rat-messages" ref={listRef} onScroll={onScroll} aria-label="Cronologia della conversazione" aria-live="polite">
            {hasMore && <li className="rat-more"><button type="button" onClick={loadOlder}>Mostra messaggi precedenti</button></li>}
            {loading && <li className="rat-loading" role="status">Caricamento…</li>}
            {messages.map(message => <li key={message.id} className={`rat-msg ${message.role === 'assistant' ? 'is-ai' : message.mine ? 'is-mine' : ''}`}>
              <span className="rat-msg-meta"><b>{message.role === 'assistant' ? 'Assistente AI' : message.mine ? 'Tu' : displayName({ fullName: message.authorFullName, username: message.author })}</b>
                <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString('it-IT')}>{relativeTime(message.createdAt)}</time></span>
              <span className="rat-msg-text">{message.text}</span></li>)}
            {busy && <li className="rat-msg is-ai rat-typing" role="status"><span className="rat-msg-text">{reading || 'L’AI sta ragionando…'}</span></li>}
          </ol>
          <div className="rat-attach" aria-label="Allegati alla domanda">
            <button type="button" onClick={pickFolder}>{sourceFiles.length ? 'Cambia cartella sorgenti' : 'Seleziona cartella sorgenti'}</button>
            <button type="button" onClick={() => setPasting({ name: '', text: '' })}>Incolla dati (es. risultato di una query)</button>
            <button type="button" aria-expanded={connectionOpen} onClick={() => setConnectionOpen(value => !value)}>Collegamento a un ambiente Poste</button>
            {sourceFiles.length > 0 && <span className="rat-chip" title="La cartella resta sul tuo computer: all’AI arrivano solo gli estratti pertinenti alla domanda.">📁 {sourceName} · {sourceFiles.length} file <button type="button" aria-label="Scollega la cartella sorgenti" onClick={clearFolder}>×</button></span>}
            {pasted.map((item, index) => <span className="rat-chip" key={index}>📋 {item.name} · {formatSize(item.text.length)} <button type="button" aria-label={`Rimuovi l’allegato ${item.name}`} onClick={() => setPasted(previous => previous.filter((_, i) => i !== index))}>×</button></span>)}
          </div>
          {sourceFiles.length > 0 && <label className="rat-codeterms">Cerca nel codice <small>(facoltativo: sigle, nomi di classe o di file da guardare, separati da spazio)</small>
            <input value={codeTerms} maxLength={200} placeholder="es. H7 PrintRules LdvIta" onChange={event => setCodeTerms(event.target.value)} /></label>}
          {sourceFiles.length > 0 && <div className="rat-howto"><b>Cosa chiedere.</b> Una domanda sola e precisa su una regola del codice, con i nomi che il codice usa. Esempi (premi per metterlo nella casella, poi modificalo):
            <span className="rat-examples">{CODE_QUESTION_EXAMPLES.map(example => <button type="button" key={example} onClick={() => { setText(example); inputRef.current?.focus(); }}>{example}</button>)}</span>
            <small>La domanda va nella casella grande in basso; «Cerca nel codice» serve solo per aggiungere sigle o nomi di classe che il codice usa e la domanda non contiene.</small></div>}
          {chosen && chosen.rows.length > 0 && <details className="rat-chosen"><summary>File inviati all’AI nell’ultima domanda ({chosen.rows.length})</summary>
            <ul>{chosen.rows.map(row => <li key={row.path}><code>{row.path}</code> <small>{row.lines}{row.because.length ? ` · contiene o ha nel nome: ${row.because.join(', ')}` : ' · mostrato per dare la struttura'}</small></li>)}</ul>
            <small>Parole cercate: {chosen.terms.join(', ') || '—'}. Se la regola che ti serve non c’è, aggiungi una sigla o il nome di una classe in «Cerca nel codice» e rifai la domanda.</small></details>}
          {sourceFiles.length === 0 && pasted.length === 0 && <p className="rat-attach-hint">Vuoi che l’AI guardi il codice? Seleziona la cartella dei sorgenti: per ogni domanda l’app sceglie i file pertinenti e ne invia solo alcuni estratti. La cartella va riselezionata a ogni sessione.</p>}
          {pasting && <form className="rat-paste" onSubmit={addPasted} aria-label="Incolla dati">
            <label>Cos’è <input value={pasting.name} maxLength={80} placeholder="es. SELECT sulle prenotazioni di ieri" onChange={event => setPasting({ ...pasting, name: event.target.value })} /></label>
            <label>Testo<textarea rows={5} value={pasting.text} maxLength={MAX_PASTE + 200} placeholder="Incolla qui le righe che servono. Non incollare password, token o chiavi." onChange={event => setPasting({ ...pasting, text: event.target.value })} /></label>
            <span className="rat-actions"><button type="submit" className="rat-primary" disabled={!pasting.text.trim()}>Allega alla prossima domanda</button><button type="button" onClick={() => setPasting(null)}>Annulla</button></span>
          </form>}
          {connectionOpen && <section className="rat-connection" aria-label="Collegamento a un ambiente Poste">
            <p><b>Come lavorare con i dati di un ambiente Poste.</b> L’applicazione è in Internet e non può aprire la tua VPN né raggiungere i database di Poste: la VPN la apri tu, dal tuo computer. Da lì esegui la query e <b>incolli qui il risultato</b> (pulsante «Incolla dati»), così l’AI lo usa nella conversazione. Questi appunti restano solo nel tuo browser.</p>
            <div className="rat-connection-grid">{CONNECTION_FIELDS.map(field => <label key={field.id}>{field.label}<input value={connection[field.id] || ''} maxLength={200} placeholder={field.placeholder} onChange={event => changeConnection(field.id, event.target.value)} /></label>)}</div>
            {connectionWarnings(connection).length > 0 && <p className="rat-error" role="alert">Negli appunti sembra esserci {connectionWarnings(connection).map(w => `${w.rule} (${w.field})`).join(', ')}: non scrivere credenziali, qui servono solo indicazioni su come arrivare all’ambiente.</p>}
          </section>}
          <form className="rat-form rat-compose" onSubmit={event => { event.preventDefault(); ask(text); }}>
            <label className="rat-sr" htmlFor="rat-input">Messaggio per l’AI</label>
            <textarea id="rat-input" ref={inputRef} value={text} disabled={busy} maxLength={MAX_QUESTION + 200} placeholder="Scrivi qui il tuo messaggio per l’AI…"
              onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
            <span className="rat-compose-bar"><small>Invio per inviare · Maiusc+Invio per andare a capo</small>
              <button type="submit" className="rat-primary" disabled={busy || !text.trim()}>{busy ? 'Invio…' : 'Invia all’AI'}</button></span>
          </form>
        </div>
        {attachNotice && <p className="rat-notice" role="status">{attachNotice}</p>}
        {questions.length > 0 && <div className="rat-questions"><b>L’AI chiede di chiarire:</b><ul>{questions.map(question => <li key={question}>{question}</li>)}</ul></div>}
        <small className="rat-hint">Le risposte dell’AI sono proposte da verificare. La conversazione è conservata e visibile ai colleghi dello stesso ambiente: non scrivere password o dati riservati. Gli allegati non vengono salvati.</small>
      </div>
      <div className="rat-know">
        <button type="button" className="rat-know-toggle" aria-expanded={open} aria-controls="rat-know-body" onClick={() => setOpen(value => !value)}>
          <span className="rat-know-title">Conoscenza dell’iniziativa</span>
          <span className="rat-know-counts" aria-label="Quante voci in ciascun elenco">
            <span className={groups.proposals.length ? 'is-attention' : ''}>Da confermare <b>{groups.proposals.length}</b></span><span>Confermate <b>{groups.confirmed.length}</b></span><span>Da altre iniziative <b>{suggestions.length}</b></span><span>Scartate <b>{groups.discarded.length}</b></span></span>
          <span className="rat-know-chevron" aria-hidden="true">{open ? '▲' : '▼'}</span>
        </button>
        {open && <div className="rat-know-body" id="rat-know-body" role="region" aria-label="Elenchi della conoscenza">
        <div className="rat-tabs" role="tablist" aria-label="Conoscenza">
          {[['proposals', `Da confermare`, groups.proposals.length], ['confirmed', 'Confermate', groups.confirmed.length], ['suggested', 'Da altre iniziative', suggestions.length], ['discarded', 'Scartate', groups.discarded.length]].map(([id, label, count]) =>
            <button type="button" role="tab" key={id} aria-selected={tab === id} className={tab === id ? 'is-active' : ''} onClick={() => setTab(id)}>{label}<b>{count}</b></button>)}
        </div>
        {notice && <p className="rat-notice" role="status">{notice}</p>}
        <ul className="rat-list" role="tabpanel">
          {tab === 'proposals' && (groups.proposals.length ? groups.proposals.map(entry => card(entry, 'proposal')) : <li className="rat-empty">Nessuna voce da confermare. Quando l’AI ne propone, le trovi qui.</li>)}
          {tab === 'confirmed' && (groups.confirmed.length ? KIND_ORDER.flatMap(kind => groups.confirmed.filter(entry => entry.kind === kind).map(entry => card(entry, 'confirmed'))) : <li className="rat-empty">Nessuna voce confermata. Solo queste vengono usate da offerta e Sviluppo.</li>)}
          {tab === 'suggested' && (suggestions.length ? suggestions.map(entry => <li key={entry.id} className={`rat-entry rat-${entry.kind}`}>
            <span className="rat-kind">{kindLabel(entry.kind)} · iniziativa {entry.gotoLabel || entry.goto}</span><p className="rat-text">{entry.text}</p>
            <span className="rat-actions"><button type="button" onClick={() => inherit(entry)}>Riprendi in questa iniziativa</button></span></li>)
            : <li className="rat-empty">{initiative.system ? `Nessuna voce confermata di altre iniziative su «${initiative.system}».` : 'Indica il sistema dell’iniziativa per vedere ciò che è stato confermato altrove.'}</li>)}
          {tab === 'discarded' && (groups.discarded.length ? groups.discarded.map(entry => card(entry, 'none')) : <li className="rat-empty">Nessuna voce scartata o revocata.</li>)}
        </ul>
        {adding ? <form className="rat-add" onSubmit={addEntry}>
          <label>Tipo<select value={adding.kind} onChange={event => setAdding({ ...adding, kind: event.target.value })}>{KIND_ORDER.map(kind => <option key={kind} value={kind}>{KINDS[kind].label} — {KINDS[kind].hint}</option>)}</select></label>
          <label>Intervento (facoltativo)<select value={adding.interventionId} onChange={event => setAdding({ ...adding, interventionId: event.target.value })}><option value="">Tutta l’iniziativa</option>{interventions.map(item => <option key={item.id} value={item.id}>{item.id}{item.titolo ? ` · ${item.titolo}` : ''}</option>)}</select></label>
          <label>Testo<textarea rows={3} value={adding.text} maxLength={MAX_ENTRY + 100} onChange={event => setAdding({ ...adding, text: event.target.value })} /></label>
          <span className="rat-actions"><button type="submit" className="rat-primary">Aggiungi come confermata</button><button type="button" onClick={() => setAdding(null)}>Annulla</button></span>
        </form> : <button type="button" className="rat-add-btn" disabled={!code} onClick={() => setAdding({ kind: 'razionale', interventionId: '', text: '' })}>+ Aggiungi una voce a mano</button>}
      </div>}
      </div>
    </div>}
    {error && <p className="rat-error" role="alert">{error}</p>}
  </section>;
}
