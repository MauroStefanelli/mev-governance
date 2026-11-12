import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { mergeConfiguratoreContracts } from '../../services/mevService';
import { ACTION_LABEL, contractHealth, suggestedKeeper, summarizePlan } from '../../configuratore/contractMergeModel';

// Eliminates a contract after moving what is useful into the one that stays. The user picks which to keep, sees exactly what would move
// (nothing is written yet), and only then confirms. The server does it in one transaction: all of it, or nothing.
export default function ContractMergeDialog({ contract, contracts, onClose, onDone }) {
  const others = contracts.filter(c => c.contractId !== contract.contractId && !c.builtin);
  const [target, setTarget] = useState(() => (others.length ? suggestedKeeper(contract, others[0]) === contract ? others[0].contractId : others.reduce((best, c) => suggestedKeeper(best, c) === best ? best : c, others[0]).contractId : ''));
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const dialog = useRef(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const el = dialog.current; if (!el) return undefined;
    if (typeof el.showModal === 'function' && !el.open) el.showModal();
    const previous = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { try { el.close(); } catch { /* already closed */ } document.body.style.overflow = previous; };
  }, []);

  useEffect(() => {
    if (!target) { setPlan(null); return; }
    let live = true; setPlan(null); setError(''); setConfirmed(false); setBusy(true);
    mergeConfiguratoreContracts(contract.contractId, target, { preview: true })
      .then(result => { if (live && alive.current) setPlan(result); })
      .catch(e => { if (live && alive.current) setError(e.message); })
      .finally(() => { if (live && alive.current) setBusy(false); });
    return () => { live = false; };
  }, [contract.contractId, target]);

  const keeper = others.find(c => c.contractId === target);
  const summary = plan ? summarizePlan(plan) : null;
  const health = contractHealth(contract); const keeperHealth = keeper ? contractHealth(keeper) : null;
  const confirm = async () => {
    setBusy(true); setError('');
    try { const result = await mergeConfiguratoreContracts(contract.contractId, target); if (alive.current) onDone(result); }
    catch (e) { if (alive.current) { setError(e.message); setBusy(false); } }
  };
  const label = c => c.name || c.contractId;

  return createPortal(<dialog ref={dialog} className="ca-merge" aria-labelledby="ca-merge-title" onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClose={() => { if (!busy) onClose(); }}>
    <header><h2 id="ca-merge-title">Elimina «{label(contract)}»</h2><button type="button" aria-label="Chiudi" disabled={busy} onClick={onClose}>✕</button></header>
    <div className="ca-merge-body">
      <p>Prima di eliminare il contratto, i dati utili che contiene possono passare a un altro contratto. Scegli quale contratto <b>resta</b>: vedrai cosa verrebbe spostato e solo dopo potrai confermare. Nulla cambia finché non confermi.</p>
      {!health.complete && <p className="ca-merge-warn" role="status"><b>Questo contratto è incompleto:</b> {health.problems.join('; ')}.</p>}
      {!others.length ? <p className="ca-merge-error" role="alert">Non c’è un altro contratto in cui spostare i dati. Puoi eliminare solo contratti quando ne resta almeno un altro.</p> : <>
        <label className="ca-merge-field">Il contratto che resta
          <select value={target} onChange={event => setTarget(event.target.value)} disabled={busy}>
            {others.map(c => <option key={c.contractId} value={c.contractId}>{label(c)}</option>)}
          </select></label>
        {keeper && keeperHealth && <p className={keeperHealth.complete ? 'ca-merge-ok' : 'ca-merge-warn'} role="status">{keeperHealth.complete ? 'Il contratto che resta è completo.' : `Il contratto che resta è incompleto: ${keeperHealth.problems.join('; ')}.`}</p>}
        {busy && !plan && <p role="status">Controllo cosa verrebbe spostato…</p>}
        {summary && <section aria-label="Cosa succede" className="ca-merge-plan">
          <h3>{summary.headline}</h3>
          {summary.blockers.length > 0 && <ul className="ca-merge-blockers">{summary.blockers.map(b => <li key={b}>{b}</li>)}</ul>}
          {summary.canRemove && summary.lines.length > 0 && <ul className="ca-merge-lines">{summary.lines.map((line, i) => <li key={i} className={`is-${line.action}`}><b>{line.title}</b> <span className="ca-merge-tag">{ACTION_LABEL[line.action] || line.action}</span><p>{line.text}</p></li>)}</ul>}
          {summary.notes.map(n => <p key={n} className="ca-merge-note">{n}</p>)}
          {summary.canRemove && <p className="ca-merge-note">Verranno eliminati definitivamente il contratto «{label(contract)}» e i suoi lotti. Le valutazioni già salvate nel Configuratore non vengono eliminate.</p>}
        </section>}
        {error && <p className="ca-merge-error" role="alert">{error}</p>}
        {summary?.canRemove && <label className="ca-merge-confirm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={busy} /> Ho letto cosa succede e voglio procedere: l’eliminazione non si può annullare.</label>}
      </>}
    </div>
    <footer>
      <button type="button" className="ca-merge-btn" onClick={onClose} disabled={busy}>Annulla</button>
      {others.length > 0 && <button type="button" className="ca-merge-btn ca-merge-danger" disabled={busy || !summary?.canRemove || !confirmed} onClick={confirm}>{busy && plan ? 'Spostamento in corso…' : summary && summary.changes ? 'Sposta i dati ed elimina il contratto' : 'Elimina il contratto'}</button>}
    </footer>
  </dialog>, document.body);
}
