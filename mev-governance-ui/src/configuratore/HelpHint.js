import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './helpHint.css';

// Il tasto «?» accanto a una macro funzionalita': un cerchio blu che, cliccato, apre un riquadro breve con «cosa fare qui, adesso» e, volendo, il capitolo completo del manuale.
// Il testo e' scritto apposta per quel contesto (vedi helpTopics.js): non e' un estratto del manuale.
export const OPEN_MANUAL_EVENT = 'mev:open-manual';
// Chiede al manuale di aprirsi su un capitolo (per titolo, o per l'inizio del titolo). Lo ascolta ogni UserManual montato: apre quello che ha un capitolo con quel titolo.
export const openManualAt = chapterTitle => window.dispatchEvent(new CustomEvent(OPEN_MANUAL_EVENT, { detail: { chapterTitle } }));

const MARGIN = 12; const GAP = 10; const WIDTH = 380;
// Dove mettere il riquadro: sotto il tasto se c'e' spazio, altrimenti sopra, altrimenti dove ce n'e' di piu' (con scorrimento interno); sempre dentro lo schermo, mai tagliato.
// Il riquadro e' disegnato su <body> e posizionato con coordinate della finestra: nessun contenitore della pagina (le righe delle sezioni hanno overflow: hidden) puo' tagliarlo.
export function placePanel(anchor, panelHeight, viewport) {
  const width = Math.min(WIDTH, viewport.width - 2 * MARGIN);
  if (viewport.width <= 760) return { mode: 'sheet', width: viewport.width - 2 * MARGIN, left: MARGIN, bottom: MARGIN, maxHeight: Math.round(viewport.height * 0.8) };            // telefono: foglio in basso
  const left = Math.max(MARGIN, Math.min(anchor.left + anchor.width / 2 - 24, viewport.width - width - MARGIN));
  const below = viewport.height - anchor.bottom - GAP - MARGIN; const above = anchor.top - GAP - MARGIN;
  const fitsBelow = panelHeight <= below; const fitsAbove = panelHeight <= above;
  const placeBelow = fitsBelow || (!fitsAbove && below >= above);
  const room = placeBelow ? below : above; const height = Math.min(panelHeight, Math.max(room, 160));
  const top = placeBelow ? anchor.bottom + GAP : Math.max(MARGIN, anchor.top - GAP - height);
  return { mode: 'popover', width, left, top, maxHeight: Math.round(height), below: placeBelow, arrow: Math.max(14, Math.min(anchor.left + anchor.width / 2 - left - 6, width - 30)) };
}

export default function HelpHint({ topic, label, className = '' }) {
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState(null);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  const panelId = useId();
  const close = useCallback((focusBack = false) => { setOpen(false); if (focusBack) buttonRef.current?.focus(); }, []);

  const reposition = useCallback(() => {
    if (!buttonRef.current || !panelRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect(); const viewport = { width: window.innerWidth, height: window.innerHeight };
    // L'altezza VERA del contenuto si misura con la larghezza che il riquadro avra' davvero e senza nessun limite di altezza: altrimenti un limite lasciato da un posizionamento
    // precedente, o una larghezza diversa, falserebbero la misura e il riquadro verrebbe accorciato inutilmente.
    const node = panelRef.current; const width = viewport.width <= 760 ? viewport.width - 2 * MARGIN : Math.min(WIDTH, viewport.width - 2 * MARGIN);
    const saved = { width: node.style.width, maxHeight: node.style.maxHeight, height: node.style.height };
    node.style.width = `${width}px`; node.style.maxHeight = 'none'; node.style.height = 'auto';
    const natural = node.scrollHeight + 2;                                                 // + i 2 px del bordo: senza, il riquadro scorrerebbe di 2 px per nulla
    node.style.width = saved.width; node.style.maxHeight = saved.maxHeight; node.style.height = saved.height;
    setPlace(placePanel({ left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width }, natural, viewport));
  }, []);
  // Prima del disegno: il riquadro si misura e si posiziona subito, senza lampeggiare in un posto sbagliato.
  useLayoutEffect(() => { if (open) reposition(); else setPlace(null); }, [open, reposition]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape') { event.stopPropagation(); close(true); } };
    const onDown = event => { if (!panelRef.current?.contains(event.target) && !buttonRef.current?.contains(event.target)) close(false); };
    const onMove = () => reposition();
    document.addEventListener('keydown', onKey, true); document.addEventListener('mousedown', onDown);
    window.addEventListener('resize', onMove); window.addEventListener('scroll', onMove, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onDown); window.removeEventListener('resize', onMove); window.removeEventListener('scroll', onMove, true); };
  }, [open, close, reposition]);
  useEffect(() => { if (open && place) closeRef.current?.focus({ preventScroll: true }); }, [open, !!place]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!topic) return null;
  const name = label || topic.title;
  const style = place ? (place.mode === 'sheet'
    ? { left: place.left, bottom: place.bottom, width: place.width, maxHeight: place.maxHeight }
    : { left: place.left, top: place.top, width: place.width, maxHeight: place.maxHeight }) : { left: 0, top: 0, visibility: 'hidden' };
  return <span className={`hh ${className}`} onClick={event => event.stopPropagation()} onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') event.stopPropagation(); }}>
    <button type="button" className="hh-button" ref={buttonRef} aria-label={`Come si usa: ${name}`} aria-expanded={open} aria-controls={open ? panelId : undefined} aria-haspopup="dialog" onClick={() => setOpen(value => !value)}>
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="11" fill="currentColor" /><path d="M9.2 9.3a2.9 2.9 0 1 1 4.4 2.5c-.9.6-1.6 1.1-1.6 2.3" stroke="#fff" strokeWidth="2.1" strokeLinecap="round" fill="none" /><circle cx="12" cy="17.6" r="1.3" fill="#fff" /></svg>
    </button>
    {open && createPortal(<div className={`hh-panel hh-${place?.mode || 'popover'}${place?.mode === 'popover' ? (place.below ? ' hh-below' : ' hh-above') : ''}`} id={panelId} ref={panelRef} role="dialog" aria-label={`Come si usa: ${name}`} style={{ ...style, '--hh-arrow': place?.arrow != null ? `${place.arrow}px` : '24px' }}
      onClick={event => event.stopPropagation()}>
      <div className="hh-scroll">
        <div className="hh-head"><strong>{topic.title}</strong><button type="button" className="hh-close" ref={closeRef} aria-label="Chiudi l’aiuto" onClick={() => close(true)}>✕</button></div>
        <p className="hh-lead">{topic.lead}</p>
        <ol className="hh-steps">{topic.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
        {topic.tip && <p className="hh-tip"><b>Attenzione:</b> {topic.tip}</p>}
      </div>
      {topic.chapter && <button type="button" className="hh-more" onClick={() => { close(false); openManualAt(topic.chapter); }}>Apri il capitolo completo del manuale →</button>}
    </div>, document.body)}
  </span>;
}
