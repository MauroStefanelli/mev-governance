import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { STATE_LABEL } from './workflowModel';
import './workflowDialog.css';

// Il workflow come GRAFICO: gli step in sequenza, collegati da una linea, ognuno con il suo stato; il prossimo e' evidenziato e ha il tasto «Vai qui».
// La finestra non decide nulla: mostra `flow` (calcolato dai dati veri della pagina da workflowModel) e, per «Vai qui», chiama `onGo(step)`.
const ICON = {
  done: <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>,
  blocked: <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></svg>,
};

export default function WorkflowDialog({ title, subtitle, flow, onClose, onGo, canGo = true, footer }) {
  const titleId = useId(); const closeRef = useRef(null); const dialogRef = useRef(null); const currentRef = useRef(null);
  useEffect(() => {
    const previous = document.activeElement; const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; closeRef.current?.focus();
    currentRef.current?.scrollIntoView?.({ block: 'center' });                                    // il prossimo passo si vede subito, anche con il flusso lungo
    const onKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      else if (event.key === 'Tab' && dialogRef.current) {
        const focusable = [...dialogRef.current.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])')]; if (!focusable.length) return;
        const first = focusable[0]; const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.body.style.overflow = overflow; previous?.focus?.(); };
  }, [onClose]);
  const { steps, next, percent, requiredDone, requiredTotal, complete } = flow;
  return createPortal(<div className="wf-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="wf" role="dialog" aria-modal="true" aria-labelledby={titleId} ref={dialogRef}>
      <header className="wf-head">
        <div><span className="wf-eyebrow">Percorso passo dopo passo</span><h2 id={titleId}>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>
        <button type="button" ref={closeRef} className="wf-close" onClick={onClose} aria-label="Chiudi il percorso">✕</button>
      </header>
      <div className="wf-progress" role="group" aria-label="Avanzamento">
        <div className="wf-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label={`Avanzamento: ${percent} per cento`}><i style={{ width: `${percent}%` }} /></div>
        <p className="wf-summary"><strong>{percent}%</strong> · {requiredDone} di {requiredTotal} passi obbligatori fatti</p>
        <p className={`wf-next${complete ? ' is-complete' : ''}`} role="status">{complete ? <>Tutti i passi obbligatori sono fatti.{next ? <> Ultimo passo: <b>{next.title}</b>.</> : null}</> : next ? <>Prossimo passo: <b>{next.title}</b>{next.blockedBy ? <> — prima: {next.blockedBy}</> : null}</> : ''}</p>
      </div>
      <ol className="wf-flow" aria-label="I passi">
        {steps.map((step, index) => <li key={step.id} className={`wf-step wf-${step.state}${step.isNext ? ' is-next' : ''}`} ref={step.isNext ? currentRef : null} aria-current={step.isNext ? 'step' : undefined}>
          <span className="wf-rail" aria-hidden="true"><span className="wf-node">{ICON[step.state] || <b>{index + 1}</b>}</span>{index < steps.length - 1 && <span className="wf-line" />}</span>
          <div className="wf-card">
            <div className="wf-cardhead">
              <span className="wf-num">Passo {index + 1}</span>
              <h3>{step.title}</h3>
              <span className={`wf-tag wf-tag-${step.state}`}>{STATE_LABEL[step.state]}</span>
            </div>
            <p className="wf-where">{step.where}</p>
            {step.detail && <p className="wf-detail"><span aria-hidden="true">●</span> {step.detail}</p>}
            {(step.isNext || step.state === 'current' || step.state === 'blocked' || step.state === 'todo' || step.state === 'optional') && <>
              <p className="wf-what">{step.what}</p>
              <p className="wf-why">{step.why}</p>
              {step.blockedBy && <p className="wf-blocked"><b>Prima:</b> {step.blockedBy}</p>}
            </>}
            {canGo && onGo && !step.done && <div className="wf-actions"><button type="button" className={step.isNext && !step.blockedBy ? 'wf-go wf-go-primary' : 'wf-go'} onClick={() => onGo(step)}>{step.isNext && !step.blockedBy ? 'Vai qui →' : 'Apri questo passo'}</button></div>}
            {step.done && canGo && onGo && <div className="wf-actions"><button type="button" className="wf-go wf-go-quiet" onClick={() => onGo(step)}>Rivedi</button></div>}
          </div>
        </li>)}
      </ol>
      {footer && <footer className="wf-foot">{footer}</footer>}
    </div>
  </div>, document.body);
}
