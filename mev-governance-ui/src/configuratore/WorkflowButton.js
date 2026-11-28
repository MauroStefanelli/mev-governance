import React, { useState } from 'react';
import WorkflowDialog from './WorkflowDialog';
import './workflowDialog.css';

// Il tasto ben visibile che apre il workflow. Mostra l'avanzamento sul tasto stesso, cosi' anche senza aprirlo si capisce a che punto si e'.
export default function WorkflowButton({ label = 'Percorso passo dopo passo', flow, title, subtitle, onGo, canGo = true, footer }) {
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="wf-open" onClick={() => setOpen(true)} aria-haspopup="dialog" title="Mostra i passi da seguire, in ordine, e a che punto sei">
      <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5" cy="6" r="2.2" /><circle cx="12" cy="12" r="2.2" /><circle cx="19" cy="18" r="2.2" /><path d="M6.6 7.6l3.8 3M13.6 13.6l3.8 3" /></svg>
      <span>{label}<small>{flow.complete ? 'Tutto fatto' : flow.next ? `Prossimo: ${flow.next.title}` : ''}</small></span>
      <span className="wf-open-pct" aria-label={`Avanzamento ${flow.percent} per cento`}>{flow.percent}%</span>
    </button>
    {open && <WorkflowDialog title={title} subtitle={subtitle} flow={flow} canGo={canGo} footer={footer} onClose={() => setOpen(false)} onGo={onGo ? step => { setOpen(false); onGo(step); } : undefined} />}
  </>;
}
