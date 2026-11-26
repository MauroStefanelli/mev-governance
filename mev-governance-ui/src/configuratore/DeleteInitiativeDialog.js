import React, { useEffect, useRef, useState } from 'react';
import './deleteInitiative.css';

// Chi puo' eliminare un'iniziativa salvata: gli stessi che possono modificarla. Il backend lo controlla comunque.
export const DELETE_ROLES = ['Admin', 'Developer', 'SuperAdmin'];
export const canDeleteInitiatives = roles => (roles || []).some(role => DELETE_ROLES.includes(role));

export const initiativeLabel = (record, evaluation) => {
  const initiative = evaluation?.initiative || {};
  return { code: initiative.code || '', title: initiative.title || record?.title || 'Senza titolo' };
};

// Finestra di conferma: dice quale iniziativa si elimina, cosa sparisce e cosa resta. Non elimina nulla finche' non si preme «Elimina»; se l'eliminazione
// fallisce resta aperta e mostra il motivo (l'iniziativa e' ancora li').
export default function DeleteInitiativeDialog({ initiative, onConfirm, onCancel }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cancelRef = useRef(null);
  useEffect(() => { cancelRef.current?.focus(); }, []);
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape' && !busy) onCancel?.(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [busy, onCancel]);
  if (!initiative) return null;
  const confirm = async () => {
    setBusy(true); setError('');
    try { await onConfirm(); } catch (e) { setError(e?.message || 'Eliminazione non riuscita.'); setBusy(false); }
  };
  return <div className="di-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onCancel?.(); }}>
    <div className="di" role="alertdialog" aria-modal="true" aria-labelledby="di-title" aria-describedby="di-text">
      <h2 id="di-title">Eliminare questa iniziativa?</h2>
      <p className="di-name"><b>{initiative.code || 'Senza GOTO'}</b> · {initiative.title}</p>
      <div id="di-text" className="di-text">
        <p><b>Sparisce</b>: la valutazione salvata (interventi, prezzi, TOW) e lo sviluppo salvato di questa iniziativa (schede, progetto, consegna).</p>
        <p><b>Resta</b>: le revisioni condivise, i razionali, i documenti e la conoscenza storica, che servono alle iniziative simili.</p>
        <p className="di-warn">L’operazione non si può annullare.</p>
      </div>
      {error && <p role="alert" className="di-error">{error}</p>}
      <div className="di-actions">
        <button type="button" ref={cancelRef} className="di-cancel" disabled={busy} onClick={onCancel}>Annulla</button>
        <button type="button" className="di-delete" disabled={busy} onClick={confirm}>{busy ? 'Elimino…' : 'Elimina definitivamente'}</button>
      </div>
    </div>
  </div>;
}
