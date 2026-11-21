import React from 'react';
import './saveProgress.css';

// Le fasi vere del salvataggio, nell'ordine in cui accadono (vedi saveInitiativeSnapshot). Una fase ha tre stati: fatta, in corso, da fare.
export const SAVE_STEPS = [
  { id: 'history', label: 'Controllo lo storico condiviso', detail: 'Verifico che nessun collega abbia salvato nel frattempo.' },
  { id: 'offer', label: 'Salvo l’offerta', detail: 'Interventi, prezzi, TOW e schede.' },
  { id: 'revision', label: 'Aggiorno lo storico', detail: 'Nuova revisione dell’analisi condivisa.' },
];

export const stepState = (current, id) => {
  const at = SAVE_STEPS.findIndex(step => step.id === current); const index = SAVE_STEPS.findIndex(step => step.id === id);
  if (current === 'done') return 'done';
  if (at < 0) return 'todo';
  return index < at ? 'done' : index === at ? 'doing' : 'todo';
};

// «Salva e Chiudi» puo' richiedere diversi secondi: questa finestra dice che il salvataggio e' in corso, a che punto e', e come e' finito.
// Resta aperta finche' il salvataggio non finisce: se riesce si chiude da sola dopo un attimo, se fallisce resta e mostra il motivo (la pagina dietro NON si chiude).
export default function SaveProgress({ phase, step, message, onDismiss, title = 'Salvataggio in corso' }) {
  if (!phase || phase === 'idle') return null;
  const doing = phase === 'saving'; const ok = phase === 'done'; const failed = phase === 'failed';
  return <div className="save-progress-backdrop">
    <div className={`save-progress save-progress-${phase}`} role={failed ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="save-progress-title" aria-live="polite">
      <div className="save-progress-icon" aria-hidden="true">
        {doing && <span className="save-progress-spinner" />}
        {ok && <svg viewBox="0 0 52 52" width="56" height="56"><circle className="save-progress-ring" cx="26" cy="26" r="23" fill="none" /><path className="save-progress-tick" fill="none" d="M15 27l8 8 15-17" /></svg>}
        {failed && <svg viewBox="0 0 52 52" width="56" height="56"><circle className="save-progress-ring save-progress-ring-bad" cx="26" cy="26" r="23" fill="none" /><path className="save-progress-cross" fill="none" d="M18 18l16 16M34 18L18 34" /></svg>}
      </div>
      <h2 id="save-progress-title">{doing ? title : ok ? 'Salvataggio completato' : 'Salvataggio non riuscito'}</h2>
      {doing && <>
        <p className="save-progress-sub">Non chiudere la pagina: ci vuole qualche secondo.</p>
        <ol className="save-progress-steps">{SAVE_STEPS.map(entry => { const state = stepState(step, entry.id); return <li key={entry.id} className={`is-${state}`} aria-current={state === 'doing' ? 'step' : undefined}>
          <span className="save-progress-mark" aria-hidden="true">{state === 'done' ? '✓' : ''}</span>
          <span><strong>{entry.label}</strong><small>{entry.detail}</small></span></li>; })}</ol>
        <div className="save-progress-bar" aria-hidden="true"><span /></div>
      </>}
      {ok && <p className="save-progress-sub">{message || 'Tutto salvato. Chiudo l’iniziativa…'}</p>}
      {failed && <><p className="save-progress-error">{message || 'Il salvataggio non è riuscito.'}</p>
        <p className="save-progress-sub">L’iniziativa resta aperta: il tuo lavoro non è stato chiuso né perso.</p>
        <button type="button" className="save-progress-button" onClick={onDismiss} autoFocus>Ho capito</button></>}
    </div>
  </div>;
}
