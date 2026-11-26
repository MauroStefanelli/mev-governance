import React from 'react';
import { PHASES } from './estimatorImport';
import './estimatorImportReport.css';

const hours = value => (Math.round((Number(value) || 0) * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 });
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Cosa e' entrato dall'Estimatore Catalogo, cosa e' stato lasciato fuori e perche', e le ore uomo per fase. Il riepilogo e' CALCOLATO dal file letto: nessun numero e' scritto a mano.
// Le ore sono solo informative: non cambiano prezzi, quantita' ne' totali dell'offerta.
export default function EstimatorImportReport({ report, onClose }) {
  const s = report.summary;
  const warnings = [];
  if (s.withoutActivities.length) warnings.push(`${plural(s.withoutActivities.length, 'intervento senza attività', 'interventi senza attività')} in «DettaglioInterventi»: ${s.withoutActivities.slice(0, 6).join(', ')}${s.withoutActivities.length > 6 ? '…' : ''}. Sono importati lo stesso, senza righe.`);
  if (s.orphanActivities.length) warnings.push(`${plural(s.orphanActivities.length, 'attività', 'attività')} in «DettaglioInterventi» con un ID che non c’è in «INIZIATIVA»: ${s.orphanActivities.slice(0, 6).join(', ')}${s.orphanActivities.length > 6 ? '…' : ''}.`);
  return <section className="eir" role="status" aria-label="Riepilogo dell’import dall’Estimatore Catalogo">
    <header className="eir-head">
      <div><p className="eir-eyebrow">Importato da Estimatore Catalogo</p>
        <h4>{report.code ? `GOTO ${report.code}` : 'Codice non indicato nel file'}{report.title ? ` · ${report.title}` : ''}</h4>
        <p className="eir-file">{report.fileName} · letto il foglio «{report.sheet}»</p></div>
      <button type="button" className="eir-close" onClick={onClose} aria-label="Chiudi il riepilogo dell’import">✕</button>
    </header>
    <ul className="eir-numbers" aria-label="Numeri dell’import">
      <li><strong>{s.interventions}</strong><span>{s.interventions === 1 ? 'intervento' : 'interventi'}</span></li>
      <li><strong>{s.activities}</strong><span>{s.activities === 1 ? 'attività' : 'attività'}</span></li>
      <li className={s.placeholders ? '' : 'is-zero'}><strong>{s.placeholders}</strong><span>segnaposto vuoti saltati</span></li>
      <li className={s.notes ? '' : 'is-zero'}><strong>{s.notes}</strong><span>righe di note saltate</span></li>
    </ul>
    {report.hasHours
      ? <div className="eir-hours" role="group" aria-label="Ore uomo per fase">
        <h5>Ore uomo per fase <small>(solo informative: non cambiano prezzi né totali)</small></h5>
        <ul>{PHASES.map(phase => <li key={phase} className={s.hours[phase] ? '' : 'is-zero'}><span>{phase}</span><strong>{hours(s.hours[phase])}</strong></li>)}<li className="eir-total"><span>Totale</span><strong>{hours(s.totalHours)}</strong></li></ul>
        {report.rate ? <p className="eir-rate">Tariffa media del file: {report.rate.toLocaleString('it-IT')} €/ora. Le ore di ogni intervento si vedono nel suo riquadro.</p> : <p className="eir-rate">Le ore di ogni intervento si vedono nel suo riquadro.</p>}
      </div>
      : <p className="eir-none">Questo file non ha le colonne delle ore uomo (Analisi, Sviluppo, Collaudo, Produzione): importate solo interventi e attività.</p>}
    {warnings.length > 0 && <ul className="eir-warnings" role="alert">{warnings.map((text, i) => <li key={i}>{text}</li>)}</ul>}
    {(report.skipped.placeholders.length > 0 || report.skipped.notes.length > 0) && <details className="eir-skipped">
      <summary>Cosa è stato lasciato fuori</summary>
      {report.skipped.placeholders.length > 0 && <p><b>Segnaposto vuoti</b> (nessun titolo, attività, ore né righe di dettaglio): {report.skipped.placeholders.slice(0, 8).join(', ')}{report.skipped.placeholders.length > 8 ? ` e altri ${report.skipped.placeholders.length - 8}` : ''}.</p>}
      {report.skipped.notes.length > 0 && <p><b>Note in fondo al foglio</b> (listino TOW, ambito, esclusioni): non sono interventi. {report.skipped.notes.slice(0, 8).join(', ')}{report.skipped.notes.length > 8 ? '…' : ''}.</p>}
    </details>}
  </section>;
}
