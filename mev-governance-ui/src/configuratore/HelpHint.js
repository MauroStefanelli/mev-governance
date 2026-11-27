import React, { useEffect, useId, useRef, useState } from 'react';
import './helpHint.css';

// Il tasto «?» accanto a una macro funzionalita': un cerchio blu che, cliccato, apre un riquadro breve con «cosa fare qui, adesso» e, volendo, il capitolo completo del manuale.
// Il testo e' scritto apposta per quel contesto (vedi helpTopics.js): non e' un estratto del manuale.
export const OPEN_MANUAL_EVENT = 'mev:open-manual';
// Chiede al manuale di aprirsi su un capitolo (per titolo, o per l'inizio del titolo). Lo ascolta ogni UserManual montato: apre quello che ha un capitolo con quel titolo.
export const openManualAt = chapterTitle => window.dispatchEvent(new CustomEvent(OPEN_MANUAL_EVENT, { detail: { chapterTitle } }));

export default function HelpHint({ topic, label, align = 'start', className = '' }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const panelId = useId();
  const closeRef = useRef(null);
  // Esc e un click fuori chiudono; il focus torna sul cerchio, cosi' chi usa la tastiera non si perde.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); rootRef.current?.querySelector('button.hh-button')?.focus(); } };
    const onDown = event => { if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false); };
    document.addEventListener('keydown', onKey, true); document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown); };
  }, [open]);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  if (!topic) return null;
  const name = label || topic.title;
  return <span className={`hh ${className}`} ref={rootRef} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation(); }}>
    <button type="button" className="hh-button" aria-label={`Come si usa: ${name}`} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="true" onClick={() => setOpen(value => !value)}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="currentColor" /><path d="M9.2 9.3a2.9 2.9 0 1 1 4.4 2.5c-.9.6-1.6 1.1-1.6 2.3" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" fill="none" /><circle cx="12" cy="17.6" r="1.3" fill="#fff" /></svg>
    </button>
    {open && <div className={`hh-panel hh-${align}`} id={panelId} role="dialog" aria-label={`Come si usa: ${name}`}>
      <div className="hh-head"><strong>{topic.title}</strong><button type="button" className="hh-close" ref={closeRef} aria-label="Chiudi l’aiuto" onClick={() => { setOpen(false); rootRef.current?.querySelector('button.hh-button')?.focus(); }}>✕</button></div>
      <p className="hh-lead">{topic.lead}</p>
      <ol className="hh-steps">{topic.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
      {topic.tip && <p className="hh-tip"><b>Attenzione:</b> {topic.tip}</p>}
      {topic.chapter && <button type="button" className="hh-more" onClick={() => { setOpen(false); openManualAt(topic.chapter); }}>Apri il capitolo completo del manuale →</button>}
    </div>}
  </span>;
}
