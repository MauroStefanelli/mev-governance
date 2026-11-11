import React, { useId } from 'react';
import './sectionRow.css';

// A collapsible section whose closed row already tells the most important things: title, an optional status
// and a few facts. Opening it shows the content. The content is NOT mounted while closed unless keepMounted is set,
// so heavy sections do not load until the user asks for them; sections that hold work in progress stay mounted.
export default function SectionRow({ number, title, facts = [], status, tone = 'neutral', open, onToggle, keepMounted = false, children, id }) {
  const uid = useId();
  const bodyId = `${uid}-body`;
  return <section className={`secrow secrow-${tone}${open ? ' is-open' : ''}`} id={id} aria-label={title}>
    <h3 className="secrow-head">
      <button type="button" className="secrow-toggle" aria-expanded={open} aria-controls={bodyId} onClick={onToggle}>
        <span className="secrow-num" aria-hidden="true">{number}</span>
        <span className="secrow-title">{title}</span>
        <span className="secrow-facts">{facts.filter(Boolean).map((fact, index) => <span key={index} className="secrow-fact">{fact}</span>)}</span>
        {status && <span className={`secrow-status secrow-status-${tone}`}>{status}</span>}
        <span className="secrow-chevron" aria-hidden="true">{open ? '▾' : '▸'}</span>
      </button>
    </h3>
    <div id={bodyId} className="secrow-body" hidden={!open} role="region" aria-label={`${title} — contenuto`}>
      {(open || keepMounted) ? children : null}
    </div>
  </section>;
}
