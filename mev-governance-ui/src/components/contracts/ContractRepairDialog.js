import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { repairContractLinks } from '../../services/mevService';
import { orphanHeadline, orphanInitiatives, suggestedRepairTarget } from '../../configuratore/contractMergeModel';

// Reconnects revisions and saved evaluations that still name a catalog contract which no longer exists. Only the pointer to the catalog is
// rewritten: decisions, documents and the estimate inside each revision stay exactly as they were. Preview first, then one confirmation.
export default function ContractRepairDialog({ orphans, contracts, onClose, onDone }) {
  const candidates = contracts.filter(c => (c.lots || []).some(l => !l.deleted && l.active !== false));
  const [target, setTarget] = useState(() => suggestedRepairTarget(candidates));
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const dialog = useRef(null); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const el = dialog.current; if (!el) return undefined;
    if (typeof el.showModal === 'function' && !el.open) el.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { try { el.close(); } catch { /* already closed */ } document.body.style.overflow = previous; };
  }, []);
  useEffect(() => {
    if (!target) { setPlan(null); return undefined; }
    let live = true; setPlan(null); setError(''); setConfirmed(false); setBusy(true);
    repairContractLinks(target, { preview: true }).then(r => { if (live && alive.current) setPlan(r); }).catch(e => { if (live && alive.current) setError(e.message); }).finally(() => { if (live && alive.current) setBusy(false); });
    return () => { live = false; };
  }, [target]);

  const confirm = async () => {
    setBusy(true); setError('');
    try { const result = await repairContractLinks(target); if (alive.current) onDone(result); } catch (e) { if (alive.current) { setError(e.message); setBusy(false); } }
  };
  const total = (plan?.revisions || 0) + (plan?.evaluations || 0);
  const label = c => c.name || c.contractId;
  const initiatives = orphanInitiatives(plan?.orphans || orphans);

  return createPortal(<dialog ref={dialog} className="ca-merge" aria-labelledby="ca-repair-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClose={() => { if (!busy) onClose(); }}>
    <header><h2 id="ca-repair-title">Ripara i collegamenti ai contratti</h2><button type="button" aria-label="Chiudi" disabled={busy} onClick={onClose}>✕</button></header>
    <div className="ca-merge-body">
      <p>{orphanHeadline(orphans)} Il contenuto di ciascuna revisione (decisioni, documenti, stima) non viene toccato: cambia solo il contratto da cui prende il catalogo. Scegli quello giusto: nulla cambia finché non confermi.</p>
      {initiatives.length > 0 && <p className="ca-merge-note">Iniziative coinvolte: {initiatives.join(', ')}.</p>}
      {!candidates.length ? <p className="ca-merge-error" role="alert">Non c’è nessun contratto con un lotto attivo a cui ricollegare.</p> : <>
        <label className="ca-merge-field">Il contratto da cui prendere il catalogo
          <select value={target} onChange={event => setTarget(event.target.value)} disabled={busy}>{candidates.map(c => <option key={c.contractId} value={c.contractId}>{label(c)}{c.builtin ? ' (contratto di sistema)' : ''}</option>)}</select></label>
        {busy && !plan && <p role="status">Controllo cosa verrebbe ricollegato…</p>}
        {plan && <section aria-label="Cosa succede" className="ca-merge-plan">
          <h3>{plan.canRepair ? `${total} ${total === 1 ? 'elemento verrà ricollegato' : 'elementi verranno ricollegati'} a «${plan.toName}»` : 'Non si può ricollegare a questo contratto'}</h3>
          {!plan.canRepair && <ul className="ca-merge-blockers">{plan.blockers.map(b => <li key={b}>{b}</li>)}</ul>}
          {plan.canRepair && <ul className="ca-merge-lines">
            {plan.revisions > 0 && <li className="is-completa"><b>Revisioni dell’analisi</b> <span className="ca-merge-tag">{plan.revisions}</span><p>Il catalogo viene preso da «{plan.toName}». Decisioni, documenti e stima restano come sono.</p></li>}
            {plan.evaluations > 0 && <li className="is-completa"><b>Valutazioni salvate</b> <span className="ca-merge-tag">{plan.evaluations}</span><p>Vengono collegate allo stesso contratto.</p></li>}
          </ul>}
        </section>}
        {error && <p className="ca-merge-error" role="alert">{error}</p>}
        {plan?.canRepair && <label className="ca-merge-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} /> Ho letto cosa succede e voglio procedere.</label>}
      </>}
    </div>
    <footer>
      <button type="button" className="ca-merge-btn" onClick={onClose} disabled={busy}>Annulla</button>
      {candidates.length > 0 && <button type="button" className="ca-merge-btn ca-merge-danger" disabled={busy || !plan?.canRepair || !confirmed} onClick={confirm}>{busy && plan ? 'Ricollegamento in corso…' : 'Ricollega'}</button>}
    </footer>
  </dialog>, document.body);
}
