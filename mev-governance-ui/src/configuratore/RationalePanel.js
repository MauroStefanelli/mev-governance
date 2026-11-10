import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { rationaleRequest } from '../services/mevService';
import { KINDS, KIND_ORDER, MAX_QUESTION, MAX_ENTRY, kindLabel, validateText, initiativeCode, mergeById, groupEntries, countByKind, notYetTaken } from './rationaleKnowledge';
import { displayName, relativeTime } from './developmentCollaboration';
import './rationalePanel.css';

// Chat with the AI about why interventions are needed + the confirmed knowledge distilled from it.
// The AI only proposes: a person confirms. Confirmed entries feed the offer review and Sviluppo.
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
      const result = await rationaleRequest('messages', { goto: code, question: check.value, title: initiative.title, system: initiative.system, description: initiative.description,
        interventions: interventions.slice(0, 40).map(item => ({ id: item.id, title: item.titolo || item.title || '' })) });
      setMessages(previous => mergeById(previous, [result.question, result.answer])); setText(''); setQuestions(result.questions || []);
      if (result.proposals.length) { apply(previous => mergeById(previous, result.proposals)); setTab('proposals'); setNotice(`${result.proposals.length} ${result.proposals.length === 1 ? 'nuova voce proposta' : 'nuove voci proposte'} dall’AI: confermale o scartale.`); }
    } catch (e) {
      if (e.saved) { setMessages(previous => mergeById(previous, [e.saved])); setText(''); }
      setError(e.message);
    } finally { setBusy(false); }
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
    {code && <div className="rat-grid">
      <div className="rat-chat">
        <h4>Conversazione</h4>
        <div className={`rat-desk${messages.length || loading || busy ? ' has-messages' : ''}`} onClick={event => { if (!event.target.closest('button, textarea, time')) inputRef.current?.focus(); }}>
          <ol className="rat-messages" ref={listRef} onScroll={onScroll} aria-label="Cronologia della conversazione" aria-live="polite">
            {hasMore && <li className="rat-more"><button type="button" onClick={loadOlder}>Mostra messaggi precedenti</button></li>}
            {loading && <li className="rat-loading" role="status">Caricamento…</li>}
            {messages.map(message => <li key={message.id} className={`rat-msg ${message.role === 'assistant' ? 'is-ai' : message.mine ? 'is-mine' : ''}`}>
              <span className="rat-msg-meta"><b>{message.role === 'assistant' ? 'Assistente AI' : message.mine ? 'Tu' : displayName({ fullName: message.authorFullName, username: message.author })}</b>
                <time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString('it-IT')}>{relativeTime(message.createdAt)}</time></span>
              <span className="rat-msg-text">{message.text}</span></li>)}
            {busy && <li className="rat-msg is-ai rat-typing" role="status"><span className="rat-msg-text">L’AI sta ragionando…</span></li>}
          </ol>
          <form className="rat-form rat-compose" onSubmit={event => { event.preventDefault(); ask(text); }}>
            <label className="rat-sr" htmlFor="rat-input">Messaggio per l’AI</label>
            <textarea id="rat-input" ref={inputRef} value={text} disabled={busy} maxLength={MAX_QUESTION + 200} placeholder="Scrivi qui il tuo messaggio per l’AI…"
              onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
            <span className="rat-compose-bar"><small>Invio per inviare · Maiusc+Invio per andare a capo</small>
              <button type="submit" className="rat-primary" disabled={busy || !text.trim()}>{busy ? 'Invio…' : 'Invia all’AI'}</button></span>
          </form>
        </div>
        {questions.length > 0 && <div className="rat-questions"><b>L’AI chiede di chiarire:</b><ul>{questions.map(question => <li key={question}>{question}</li>)}</ul></div>}
        <small className="rat-hint">Le risposte dell’AI sono proposte da verificare. La conversazione è conservata e visibile ai colleghi dello stesso ambiente: non scrivere password o dati riservati.</small>
      </div>
      <div className="rat-know">
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
      </div>
    </div>}
    {error && <p className="rat-error" role="alert">{error}</p>}
  </section>;
}
