import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { developmentRequest } from '../services/mevService';
import { HEARTBEAT_MS, MAX_MESSAGE, displayName, initials, relativeTime, mergeMessages, lastMessageId, validateMessage, othersOnline } from './developmentCollaboration';

// Presence + chat of one initiative. Everything lives on the server; this component only polls and posts.
export default function CollaborationPanel({ code, onNotify }) {
  const [users, setUsers] = useState([]);
  const [messages, setMessages] = useState([]);
  const [lastWorked, setLastWorked] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [offline, setOffline] = useState(false);
  const [open, setOpen] = useState(true);
  const [unread, setUnread] = useState(0);
  const [, tick] = useState(0);
  const messagesRef = useRef([]); const listRef = useRef(null); const stick = useRef(true); const knownOthers = useRef(null); const initial = useRef(true);
  messagesRef.current = messages;

  const poll = useCallback(async () => {
    try {
      const result = await developmentRequest('presence', { goto: code, afterMessageId: lastMessageId(messagesRef.current) });
      setOffline(false); setUsers(result.users); setLastWorked(result.lastWorked);
      if (result.messages.length) {
        setMessages(previous => mergeMessages(previous, result.messages));
        if (!initial.current) setUnread(count => count + result.messages.filter(message => !message.mine).length);
      }
      // Warn when somebody else joins after this user opened the initiative.
      const names = othersOnline(result.users).map(user => user.username);
      if (knownOthers.current) names.filter(name => !knownOthers.current.has(name)).forEach(name => onNotify?.(`${displayName(result.users.find(user => user.username === name))} si è collegato a questa iniziativa.`));
      knownOthers.current = new Set(names);
    } catch (e) { setOffline(true); setError(e.message); }
  }, [code, onNotify]);

  // Load the latest messages, then keep the presence alive. Hidden tabs stop polling and resume on return.
  useEffect(() => {
    let alive = true; let timer = null; initial.current = true; knownOthers.current = null;
    setMessages([]); setUsers([]); setLastWorked(null); setUnread(0); setError('');
    (async () => {
      try {
        const history = await developmentRequest(`chat?goto=${encodeURIComponent(code)}&limit=100`);
        if (!alive) return;
        setMessages(history.messages); setHasMore(history.hasMore); messagesRef.current = history.messages;
      } catch (e) { if (alive) setError(e.message); }
      if (!alive) return;
      await poll(); initial.current = false;
      const schedule = () => { timer = setTimeout(async () => { if (!document.hidden) await poll(); tick(n => n + 1); if (alive) schedule(); }, HEARTBEAT_MS); };
      if (alive) schedule();
    })();
    const resume = () => { if (!document.hidden && alive) poll(); };
    document.addEventListener('visibilitychange', resume);
    const leave = () => { developmentRequest('leave', { goto: code }).catch(() => {}); };
    window.addEventListener('pagehide', leave);
    return () => { alive = false; clearTimeout(timer); document.removeEventListener('visibilitychange', resume); window.removeEventListener('pagehide', leave); leave(); };
  }, [code, poll]);

  // Follow new messages only when the user is already at the bottom.
  useLayoutEffect(() => { const list = listRef.current; if (list && stick.current) list.scrollTop = list.scrollHeight; }, [messages, open]);
  const onScroll = () => { const list = listRef.current; if (!list) return; stick.current = list.scrollHeight - list.scrollTop - list.clientHeight < 40; if (stick.current) setUnread(0); };

  const loadOlder = async () => {
    try {
      const result = await developmentRequest(`chat?goto=${encodeURIComponent(code)}&before=${messages[0].id}&limit=100`);
      const list = listRef.current; const before = list?.scrollHeight || 0; stick.current = false;
      setMessages(previous => mergeMessages(previous, result.messages)); setHasMore(result.hasMore);
      requestAnimationFrame(() => { if (list) list.scrollTop = list.scrollHeight - before; });
    } catch (e) { setError(e.message); }
  };

  const send = async event => {
    event.preventDefault();
    const check = validateMessage(text);
    if (!check.ok) { setError(check.reason); return; }
    setSending(true); setError('');
    try {
      const saved = await developmentRequest('chat', { goto: code, text: check.value });
      stick.current = true; setMessages(previous => mergeMessages(previous, [saved])); setText('');
    } catch (e) { setError(`Messaggio non inviato: ${e.message}`); } // the text stays in the box
    finally { setSending(false); }
  };

  const others = othersOnline(users);
  const me = users.find(user => user.isMe);
  return <aside className={`dev-collab${open ? ' is-open' : ''}`} aria-label="Collaborazione sull’iniziativa">
    <button type="button" className="dev-collab-toggle" aria-expanded={open} onClick={() => { setOpen(value => !value); setUnread(0); }}>
      <span className="dev-collab-people" aria-hidden="true">{[...others, ...(me ? [me] : [])].slice(0, 4).map(user => <i key={user.username} className={user.isMe ? 'is-me' : ''} title={displayName(user)}>{initials(user)}</i>)}</span>
      <span className="dev-collab-title"><strong>{others.length ? `${others.length} ${others.length === 1 ? 'collega collegato' : 'colleghi collegati'}` : 'Nessun altro collegato'}</strong>
        <small>{lastWorked ? `Ultimo lavoro: ${lastWorked.isMe ? 'tu' : displayName({ fullName: lastWorked.fullName, username: lastWorked.by })} · ${relativeTime(lastWorked.at)}` : 'Nessun salvataggio registrato'}</small></span>
      {unread > 0 && <span className="dev-collab-unread" aria-label={`${unread} messaggi non letti`}>{unread}</span>}
      <span className="dev-collab-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
    </button>
    {others.length > 0 && <p className="dev-collab-warning" role="status"><b>Attenzione:</b> {others.map(displayName).join(', ')} {others.length === 1 ? 'sta lavorando' : 'stanno lavorando'} su questa iniziativa. Le schede si salvano per intero: coordinatevi nella chat prima di salvare.</p>}
    {open && <div className="dev-collab-body">
      <div className="dev-collab-users" aria-label="Utenti collegati">
        {users.length === 0 && <span className="dev-hint">Connessione in corso…</span>}
        {users.map(user => <span key={user.username} className={`dev-collab-user${user.isMe ? ' is-me' : ''}`}><i aria-hidden="true">{initials(user)}</i>{displayName(user)}{user.isMe ? ' (tu)' : ''}</span>)}
      </div>
      {offline && <p className="dev-collab-offline" role="alert">Collegamento perso: i dati non sono aggiornati. Riprovo ogni {Math.round(HEARTBEAT_MS / 1000)} secondi. {error}</p>}
      <ol className="dev-chat" ref={listRef} onScroll={onScroll} aria-label="Cronologia chat" aria-live="polite">
        {hasMore && <li className="dev-chat-more"><button type="button" onClick={loadOlder}>Mostra messaggi precedenti</button></li>}
        {!messages.length && <li className="dev-chat-empty">Nessun messaggio. Scrivi per avvisare i colleghi su cosa stai facendo.</li>}
        {messages.map(message => <li key={message.id} className={`dev-chat-msg${message.mine ? ' is-mine' : ''}`}>
          <span className="dev-chat-meta"><b>{message.mine ? 'Tu' : displayName({ fullName: message.authorFullName, username: message.author })}</b><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString('it-IT')}>{relativeTime(message.createdAt)}</time></span>
          <span className="dev-chat-text">{message.text}</span></li>)}
      </ol>
      {!offline && error && <p className="dev-collab-error" role="alert">{error}</p>}
      <form className="dev-chat-form" onSubmit={send}>
        <label className="dev-sr-only" htmlFor="dev-chat-input">Messaggio per i colleghi</label>
        <textarea id="dev-chat-input" rows={2} value={text} maxLength={MAX_MESSAGE + 200} placeholder="Scrivi ai colleghi (Invio per inviare, Maiusc+Invio per andare a capo)"
          onChange={event => setText(event.target.value)} onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); event.currentTarget.form.requestSubmit(); } }} />
        <button type="submit" className="dev-btn dev-btn-primary" disabled={sending || !text.trim()}>{sending ? 'Invio…' : 'Invia'}</button>
      </form>
      <small className="dev-hint">La cronologia della chat è conservata per questa iniziativa e visibile a chi lavora sullo sviluppo nello stesso ambiente.</small>
    </div>}
  </aside>;
}
