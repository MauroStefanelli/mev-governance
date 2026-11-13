import React from 'react';
import { formatSize } from './rationaleAttachments';
import './sourceLibrary.css';

const mb = bytes => (bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1).replace('.', ',')} MB` : formatSize(bytes));
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// The saved folders of the user, with what can be done to them. `library` comes from useSourceLibrary.
export default function SourceLibraryPanel({ library, compact = false }) {
  const { folders, ready, persistent, usage, error, busy, pending, report } = library;
  if (!ready) return <p className="srclib-hint" role="status">Controllo le cartelle salvate…</p>;
  return <section className={`srclib${compact ? ' is-compact' : ''}`} aria-label="Cartelle dei sorgenti salvate">
    <div className="srclib-head"><b>Sorgenti salvati su questo computer</b>
      <button type="button" disabled={Boolean(busy)} onClick={library.add}>{folders.length ? 'Aggiungi o aggiorna una cartella' : 'Seleziona cartella sorgenti'}</button></div>
    {!folders.length && <p className="srclib-hint">Scegli la cartella una volta sola: l’app ne conserva una copia in questo browser e la ritrovi alla prossima visita, senza riselezionarla. La copia non lascia il tuo computer: all’AI arrivano solo gli estratti utili alla domanda.</p>}
    {folders.length > 0 && <ul className="srclib-list">{folders.map(folder => <li key={folder.id} className={folder.active === false ? 'is-off' : ''}>
      <label><input type="checkbox" checked={folder.active !== false} onChange={event => library.toggle(folder.id, event.target.checked)} /> <b>{folder.name}</b></label>
      <small>{plural(folder.files.length, 'file', 'file')} · {mb(folder.bytes || 0)} · salvata il {new Date(folder.savedAt).toLocaleDateString('it-IT')}{folder.updatedAt && folder.updatedAt !== folder.savedAt ? `, aggiornata il ${new Date(folder.updatedAt).toLocaleDateString('it-IT')}` : ''}
        {folder.skipped?.length ? ` · ${plural(folder.skipped.length, 'file escluso', 'file esclusi')} per credenziali` : ''}</small>
      <button type="button" aria-label={`Rimuovi la cartella ${folder.name} dal computer`} disabled={Boolean(busy)} onClick={() => { if (window.confirm(`Rimuovere «${folder.name}» da questo browser? I file sul tuo disco non vengono toccati.`)) library.remove(folder.id); }}>Rimuovi</button>
    </li>)}</ul>}
    {busy && <p className="srclib-hint" role="status">{busy}</p>}
    {error && <p className="srclib-error" role="alert">{error}</p>}
    {!persistent && <p className="srclib-warn" role="status">Questo browser non permette di conservare i file (finestra privata o archivio bloccato): le cartelle restano solo finché la pagina è aperta e andranno riselezionate.</p>}
    {usage?.quota > 0 && folders.length > 0 && <small className="srclib-hint">Spazio usato dal sito nel browser: {mb(usage.usage)} su circa {mb(usage.quota)}.</small>}
    {pending && <div className="srclib-pending" role="group" aria-label="Cartella già salvata">
      <p>La cartella <b>{pending.target.name}</b> è già salvata. Rispetto a quella che hai scelto: <b>{plural(pending.diff.added.length, 'file nuovo', 'file nuovi')}</b>, <b>{plural(pending.diff.changed.length, 'modificato', 'modificati')}</b>, {plural(pending.diff.same.length, 'invariato', 'invariati')}, <b>{plural(pending.diff.removed.length, 'non più presente', 'non più presenti')}</b>. Vengono letti solo i file nuovi e modificati.</p>
      <span className="srclib-actions">
        <button type="button" className="srclib-primary" onClick={() => library.resolvePending('replace')}>Aggiorna (la copia diventa uguale alla cartella scelta)</button>
        <button type="button" onClick={() => library.resolvePending('merge')}>Integra (aggiungi e aggiorna, non togliere nulla)</button>
        <button type="button" onClick={() => library.resolvePending('new')}>Tieni entrambe (salva come cartella separata)</button>
        <button type="button" onClick={library.cancelPending}>Annulla</button></span>
    </div>}
    {report && <div className="srclib-report" role="status"><p><b>{report.name}</b> salvata: {plural(report.added, 'file nuovo', 'file nuovi')}, {plural(report.changed, 'aggiornato', 'aggiornati')}{report.removed ? `, ${plural(report.removed, 'tolto', 'tolti')}` : ''}{report.kept ? `, ${plural(report.kept, 'mantenuto', 'mantenuti')} anche se non nella selezione` : ''}.
      {report.ignored ? ` Esclusi ${report.ignored} file che non sono codice o stanno in cartelle di costruzione.` : ''}{report.tooBig ? ` ${plural(report.tooBig, 'file oltre 500 KB non salvato', 'file oltre 500 KB non salvati')}.` : ''}</p>
      {report.skipped.length > 0 && <details><summary>{plural(report.skipped.length, 'file non salvato', 'file non salvati')} perché contiene una credenziale</summary>
        <ul>{report.skipped.map(item => <li key={item.path}><code>{item.path}</code> <small>riga {item.line}: {item.reason}</small></li>)}</ul></details>}
      <button type="button" onClick={library.dismissReport}>Chiudi</button></div>}
  </section>;
}
