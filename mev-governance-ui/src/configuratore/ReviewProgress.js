import React, { useEffect, useRef } from 'react';
import ReviewBrain from './ReviewBrain';
import { percentDone, summarize, STATUS_LABEL, STATUS_TONE, STATUS_ORDER } from './reviewSummary';
import './reviewBrain.css';

const PHASE = {
  running: { title: 'L’AI sta ragionando sulle righe', tone: 'work' },
  done: { title: 'Verifica completata', tone: 'ok' },
  stopped: { title: 'Verifica interrotta', tone: 'bad' },
};
const VERDICT = {
  ok: { text: 'Tutte le righe verificate sono coerenti con il catalogo.', tone: 'ok' },
  warn: { text: 'Alcune righe vanno controllate.', tone: 'warn' },
  bad: { text: 'Ci sono righe con una possibile incoerenza.', tone: 'bad' },
  partial: { text: 'Alcune righe non sono state ancora verificate.', tone: 'warn' },
  empty: { text: 'Nessuna riga da mostrare.', tone: 'muted' },
};

// La finestra della «Verifica AI delle righe»: mentre l'AI lavora mostra il cervello che si colora con la percentuale VERA (righe verificate su righe da verificare) e,
// riga dopo riga, cosa sta emergendo; alla fine mostra i dati piu' importanti. Si chiude solo con «Chiudi» (o «Interrompi» mentre lavora): nulla si perde.
// `entries` = una voce per riga { rowId, interventionId, activity, catalogName, review }.
export default function ReviewProgress({ open, phase, done, total, entries, error, onClose, onStop }) {
  const closeRef = useRef(null);
  useEffect(() => { if (open && phase !== 'running') closeRef.current?.focus(); }, [open, phase]);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = event => { if (event.key === 'Escape' && phase !== 'running') onClose?.(); };
    document.addEventListener('keydown', onKey); return () => document.removeEventListener('keydown', onKey);
  }, [open, phase, onClose]);
  if (!open) return null;
  const meta = PHASE[phase] || PHASE.running;
  const percent = phase === 'done' ? 100 : percentDone(done, total);
  const live = summarize(entries);
  const running = phase === 'running';
  const verdict = VERDICT[live.verdict] || VERDICT.empty;
  const arrived = (entries || []).filter(entry => entry.review);
  return <div className="rp-backdrop">
    <div className={`rp rp-${meta.tone}`} role={phase === 'stopped' ? 'alertdialog' : 'dialog'} aria-modal="true" aria-labelledby="rp-title" aria-describedby="rp-status">
      <header className="rp-head">
        <ReviewBrain percent={percent} pulse={running} tone={meta.tone} size={running ? 176 : 140} label={`Avanzamento della verifica: ${percent}%`} />
        <div className="rp-headtext">
          <h2 id="rp-title">{meta.title}</h2>
          <p id="rp-status" role="status" aria-live="polite">
            {running && `${done} di ${total} righe verificate (${percent}%)`}
            {phase === 'done' && `${live.reviewed} di ${live.total} righe verificate`}
            {phase === 'stopped' && `${done} di ${total} righe verificate prima dell’interruzione`}
          </p>
          {running && <div className="rp-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent} aria-label="Avanzamento della verifica"><span style={{ width: `${percent}%` }} /></div>}
          {running && <p className="rp-hint">Ci vuole circa un minuto ogni 5 righe. Non chiudere la pagina: le righe verificate restano salvate man mano.</p>}
        </div>
      </header>

      {phase === 'stopped' && <p role="alert" className="rp-error">{error || 'La verifica non è stata completata.'}<br /><span>Le righe già verificate sono state conservate. Puoi riprovare con «Verifica / aggiorna coerenza AI delle righe».</span></p>}

      {(live.reviewed > 0 || !running) && <section className="rp-body" aria-label="Dati emersi dal ragionamento">
        {phase !== 'running' && <p className={`rp-verdict rp-v-${verdict.tone}`}><strong>{verdict.text}</strong></p>}
        <div className="rp-stats" role="group" aria-label="Righe per stato">
          {STATUS_ORDER.map(status => <div key={status} className={`rp-stat rp-t-${STATUS_TONE[status]}${live.counts[status] ? '' : ' is-zero'}`}><strong>{live.counts[status]}</strong><span>{STATUS_LABEL[status]}</span></div>)}
          {live.counts.waiting > 0 && <div className="rp-stat rp-t-muted"><strong>{live.counts.waiting}</strong><span>In attesa</span></div>}
        </div>
        {live.reviewed > 0 && <div className="rp-meter" aria-label={`${live.percentCoherent}% delle righe verificate è coerente`}>
          <div className="rp-meter-bar">{STATUS_ORDER.map(status => live.counts[status] ? <i key={status} className={`rp-t-${STATUS_TONE[status]}`} style={{ flexGrow: live.counts[status] }} title={`${STATUS_LABEL[status]}: ${live.counts[status]}`} /> : null)}</div>
          <p>{live.percentCoherent}% delle righe verificate è coerente con il catalogo{live.interventionsToCheck ? ` · ${live.interventionsToCheck} interventi con righe da controllare` : ''}</p>
        </div>}

        {live.hotspots.length > 0 && !running && <div className="rp-block"><h3>Voci di catalogo da guardare per prime</h3>
          <ul className="rp-hot">{live.hotspots.map(spot => <li key={spot.name}><strong>{spot.name}</strong><span>{spot.count} {spot.count === 1 ? 'riga' : 'righe'} da controllare{spot.bad ? `, ${spot.bad} con possibile incoerenza` : ''}</span></li>)}</ul></div>}

        {live.attention.length > 0 && <div className="rp-block"><h3>{running ? 'Cosa sta emergendo' : 'Righe da controllare'}</h3>
          <ul className="rp-rows">{live.attention.map(row => <li key={row.rowId} className={`rp-t-${STATUS_TONE[row.status]}`}>
            <span className="rp-chip">{STATUS_LABEL[row.status]}</span>
            <div><strong>{row.interventionId ? `Intervento ${row.interventionId}` : 'Riga'}{row.catalog ? ` · ${row.catalog}` : ''}</strong>
              {row.activity && <small>{row.activity}</small>}
              <p>{row.reason}</p>
              {row.suggestion && <p className="rp-suggest"><b>Cosa fare:</b> {row.suggestion}</p>}</div></li>)}</ul>
          {live.toCheck > live.attention.length && <p className="rp-more">…e altre {live.toCheck - live.attention.length} righe: le trovi tutte nella colonna «Verifica AI attività / catalogo».</p>}</div>}
        {!running && arrived.length > 0 && live.toCheck === 0 && live.counts.error === 0 && <p className="rp-note">Nessuna riga richiede un intervento. Il giudizio resta un supporto da confermare dall’analista.</p>}
        {live.models.length > 0 && !running && <p className="rp-model">Modello: {live.models.join(', ')}</p>}
      </section>}

      <footer className="rp-foot">
        {running ? <button type="button" className="rp-btn" onClick={onStop}>Interrompi la verifica</button>
          : <button type="button" ref={closeRef} className="rp-btn rp-btn-primary" onClick={onClose}>Chiudi</button>}
        <p>Giudizio AI da confermare dall’analista. Non modifica interventi, complessità o prezzi.</p>
      </footer>
    </div>
  </div>;
}
