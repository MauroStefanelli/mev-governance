import React from 'react';
import ReviewBrain from './ReviewBrain';
import './reviewLauncher.css';

// Il punto d'ingresso della «Verifica AI delle righe»: una scheda che dice a che punto e' la verifica (con numeri veri, presi dai giudizi delle righe)
// e offre l'azione giusta per quello stato. Il pulsante cambia nome: la prima volta «Verifica con l'AI», dopo un'interruzione «Riprendi la verifica»,
// se alcune righe sono cambiate «Aggiorna le N righe modificate», a verifica finita «Rifai la verifica».
// `status` viene da reviewStatus (reviewPlan.js): total, verified, failed, outdated, missing, remaining, state, percent.
export function launcherCopy(status, busy) {
  if (busy) return { tone: 'busy', headline: 'L’AI sta verificando le righe…', detail: 'Segui l’avanzamento nella finestra.', action: 'Verifica in corso…', hint: '' };
  const { total, verified, remaining, outdated, failed, missing } = status;
  if (!total) return { tone: 'idle', headline: 'Nessuna riga da verificare', detail: 'Importa una Tabella di Offerta con il dettaglio delle attività.', action: '', hint: '' };
  if (status.state === 'complete') return { tone: 'ok', headline: `Tutte le ${total} righe sono verificate`, detail: 'Il giudizio di ogni riga è nella colonna «Verifica AI attività / catalogo».', action: 'Rifai la verifica', hint: 'Rifà tutte le righe con l’AI.', secondary: true };
  if (status.state === 'none') return { tone: 'todo', headline: `${total} ${total === 1 ? 'riga da verificare' : 'righe da verificare'}`, detail: 'L’AI controlla che attività, tipo e complessità siano coerenti con la voce di catalogo.', action: 'Verifica con l’AI', hint: 'Ci vuole circa un minuto ogni 5 righe.' };
  const parts = [];
  if (outdated) parts.push(`${outdated} ${outdated === 1 ? 'modificata dopo la verifica' : 'modificate dopo la verifica'}`);
  if (failed) parts.push(`${failed} non ${failed === 1 ? 'riuscita' : 'riuscite'}`);
  if (missing) parts.push(`${missing} ${missing === 1 ? 'mai verificata' : 'mai verificate'}`);
  const onlyOutdated = outdated === remaining;
  return { tone: 'partial', headline: `${verified} di ${total} righe verificate`, detail: `Mancano ${remaining}: ${parts.join(', ')}.`,
    action: onlyOutdated ? `Aggiorna ${remaining === 1 ? 'la riga modificata' : `le ${remaining} righe modificate`}` : `Riprendi la verifica (${remaining} ${remaining === 1 ? 'riga' : 'righe'})`,
    hint: `Le ${verified} già verificate non vengono rifatte.`, secondary: false, restart: true };
}

export default function ReviewLauncher({ status, busy, onStart, onRestart }) {
  const copy = launcherCopy(status, busy);
  return <section className={`rl rl-${copy.tone}`} aria-label="Verifica AI delle righe">
    <ReviewBrain percent={status.percent} pulse={!!busy} tone={copy.tone === 'ok' ? 'ok' : 'work'} size={112} label={`Righe verificate: ${status.percent}%`} />
    <div className="rl-text">
      <p className="rl-eyebrow">Verifica AI delle righe</p>
      <h3>{copy.headline}</h3>
      <p className="rl-detail" role="status">{copy.detail}</p>
      {status.total > 0 && <div className="rl-meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={status.percent} aria-label="Righe verificate"><span style={{ width: `${status.percent}%` }} /></div>}
    </div>
    <div className="rl-actions">
      {copy.action && <button type="button" className={`rl-btn${copy.secondary ? '' : ' rl-btn-primary'}`} disabled={busy} onClick={() => onStart({ force: !!copy.secondary })}>{!copy.secondary && !busy && <span className="rl-btn-icon" aria-hidden="true">✦</span>}{copy.action}</button>}
      {copy.restart && !busy && <button type="button" className="rl-btn rl-btn-link" onClick={() => onRestart()}>Verifica tutto da capo</button>}
      {copy.hint && <small>{copy.hint}</small>}
    </div>
    <p className="rl-foot">Giudizio AI da confermare dall’analista. Non modifica interventi, complessità o prezzi.</p>
  </section>;
}
