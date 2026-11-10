import React, { useMemo, useRef, useState } from 'react';
import { developmentActivities } from './developmentActivityModel';
import { activitySourceContext, createSourceCache } from './activitySourceContext';
import { prepareActivityDevelopment } from '../services/mevService';
import ActivityCodeGenerator from './ActivityCodeGenerator';
import { planInsertion, applyInsertion, undoInsertion, draftPatch } from './draftInsertion';
import { ACTIVITY_STATES, stateAllowed, isDefined, hasProposal, hasCode, isVerified, activityNextStep } from './developmentJourney';

export default function DevelopmentActivities({ items, plans, onChange, applications, onSelectFiles, sourceFiles = [], embedded = false }) {
  const [filter, setFilter] = useState('Tutte');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Proposals are persisted with the plan even before applying their fields.
  const proposals = Object.fromEntries(Object.entries(plans).filter(([, plan]) => plan.aiProposal || plan.aiDraft).map(([key, plan]) => [key, plan.aiProposal || plan.aiDraft]));
  // Files are read and hashed once per selected folder and shared by every activity.
  const cache = useMemo(() => createSourceCache(), [sourceFiles]); // eslint-disable-line react-hooks/exhaustive-deps
  const [selected, setSelected] = useState(() => new Set());
  const [batch, setBatch] = useState(null);
  const [regenerate, setRegenerate] = useState(false);
  const stop = useRef(false);
  const undoRef = useRef(() => ({ before: {}, after: {} }));
  const buildProposal = async item => {
    const description = item.detail?.detailDescription || item.reason || '';
    const source = await activitySourceContext(sourceFiles, description, cache);
    if (!source.files.length) throw new Error('Nessun file sorgente leggibile: seleziona la cartella dei sorgenti per questa sessione.');
    const result = await prepareActivityDevelopment({ activity: { interventionId: item.interventionId, description, technology: item.detail?.technology }, source });
    if (typeof result.analysis?.solution !== 'string' || typeof result.analysis?.acceptance !== 'string') throw new Error('Risposta AI incompleta: la scheda corrente non è stata modificata.');
    const evidence = (Array.isArray(result.analysis.evidence) ? result.analysis.evidence : []).filter(entry => {
      const file = source.files.find(f => f.path === entry.path);
      return file && Number.isInteger(entry.startLine) && Number.isInteger(entry.endLine) && entry.startLine >= file.startLine && entry.endLine <= file.endLine && entry.endLine >= entry.startLine;
    }).map(entry => ({ ...entry, sha256: source.files.find(f => f.path === entry.path).sha256 }));
    return { ...result, evidence, coverage: source.coverage, excerpts: source.files };
  };
  // Only the proposal is written: the editable fields of the sheet are never touched here.
  const store = (key, proposal) => onChange(previous => ({ ...previous, [key]: { ...previous[key], aiProposal: proposal } }));
  const prepare = async (key, item) => {
    setBusy(key); setError('');
    try { store(key, await buildProposal(item)); }
    catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const [overwrite, setOverwrite] = useState(false);
  const [insertion, setInsertion] = useState(null);
  const insert = () => {
    const { eligible, skipped } = planInsertion(activities, plans, selected, overwrite);
    if (!eligible.length) { setInsertion({ done: 0, skipped, undo: null }); return; }
    const replaced = eligible.filter(a => plans[a.key]?.files || plans[a.key]?.solution || plans[a.key]?.acceptance).length;
    if (!window.confirm(`Inserire la bozza AI in ${eligible.length} schede?${replaced ? ` In ${replaced} sostituirà file, soluzione e criteri già presenti.` : ''} Le schede restano “Da analizzare”, non vengono dichiarate verificate e puoi annullare subito dopo.${skipped.length ? ` ${skipped.length} selezionate saranno saltate.` : ''}`)) return;
    let result = null;
    onChange(previous => { result = applyInsertion(previous, eligible.map(a => a.key)); return result.next; });
    setInsertion({ done: eligible.length, skipped, undo: true, numbers: eligible.map(a => a.number) });
    undoRef.current = () => result;
  };
  const undo = () => {
    let kept = [];
    onChange(previous => { const { before, after } = undoRef.current(); const restored = undoInsertion(previous, before, after); kept = restored.kept; return restored.next; });
    setInsertion({ done: 0, skipped: [], undo: false, numbers: [], undone: true, kept });
  };
  const toggle = key => setSelected(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const MAX_CONSECUTIVE_FAILURES = 3;
  const runBatch = async list => {
    stop.current = false; setError('');
    const failures = []; let done = 0; let streak = 0; let halted = false;
    setBatch({ running: true, done: 0, total: list.length, current: list[0].number, failures: [] });
    for (const { key, item, number } of list) {
      if (stop.current) { halted = true; break; }
      setBatch(previous => ({ ...previous, current: number }));
      try { store(key, await buildProposal(item)); done += 1; streak = 0; }
      catch (e) { failures.push({ number, message: e.message }); streak += 1; if (streak >= MAX_CONSECUTIVE_FAILURES) { halted = true; break; } }
      const progress = { done, failures: [...failures] };
      setBatch(previous => ({ ...previous, ...progress }));
    }
    setBatch({ running: false, done, total: list.length, failures, halted, stopped: stop.current, pending: list.length - done - failures.length });
    if (done) setSelected(previous => { const next = new Set(previous); list.forEach(({ key }, index) => { if (!failures.some(f => f.number === list[index].number)) next.delete(key); }); return next; });
  };
  const activities = developmentActivities(items);
  const states = ACTIVITY_STATES;
  const [openKey, setOpenKey] = useState(null);
  const update = (key, patch) => onChange(previous => {
    const current = previous[key] || {};
    const changed = { ...current, ...patch };
    if (!patch.status && current.status === 'Verificata') changed.status = 'Da verificare';
    return { ...previous, [key]: changed };
  });
  const counts = Object.fromEntries(states.map(state => [state, activities.filter(a => (plans[a.key]?.status || 'Da analizzare') === state).length]));
  const visible = activities.filter(a => filter === 'Tutte' || (plans[a.key]?.status || 'Da analizzare') === filter);
  const chosen = activities.filter(a => selected.has(a.key));
  const toPrepare = regenerate ? chosen : chosen.filter(a => !hasProposal(plans[a.key]));
  const skipped = chosen.length - toPrepare.length;
  const stepsFor = plan => [
    ['Requisito', true], ['Proposta AI', hasProposal(plan)], ['Scheda definita', isDefined(plan)], ['File generati', hasCode(plan)], ['Verificata', isVerified(plan)],
  ];
  return <section className="initiative-workspace dev-activities" aria-label="Schede di sviluppo per attività">
    {!embedded && <header className="workspace-heading"><div><span className="workspace-eyebrow">Consegna · Visual Studio Code</span><h3>Schede di sviluppo · {activities.length} attività</h3></div><span className="workspace-version">{activities.filter(a => plans[a.key]?.status === 'Verificata').length} verificate</span></header>}
    {embedded && <h3 className="dev-sr-only">Schede di sviluppo · {activities.length} attività</h3>}
    <div className="development-repositories"><strong>Applicativi collegati al sistema dell’iniziativa</strong>
      {applications.length ? applications.map(app => <p key={app.id || app.code || app.name}><b>{app.name}</b> · <code>{app.codeUrl || 'Percorso sorgenti non configurato'}</code></p>) : <p>Nessun applicativo corrispondente trovato: verificare Sistema e Applicativi e tecnologie.</p>}
      <p>Il percorso configurato non conserva il permesso del browser di leggere i file locali. Riseleziona la cartella solo per nuove analisi o modifiche ai sorgenti. Proposte AI, estratti già usati e schede salvate restano consultabili senza riselezionarla.</p>
      <button type="button" onClick={onSelectFiles}>Seleziona cartella sorgenti per questa sessione</button>
      <span className="dev-files-count">{sourceFiles.length} file selezionati nella sessione</span>
    </div>
    <p className="dev-hint">Una scheda per ogni riga di dettaglio. “Prepara scheda con AI” aggiunge la proposta ai dati da salvare; “Inserisci bozza” ne copia i contenuti nei campi modificabili. Salva lo sviluppo per conservare entrambi.</p>
    <div className="dev-filter" role="group" aria-label="Stato attività">
      {['Tutte', ...states].map(state => <button type="button" key={state} className={filter === state ? 'is-active' : ''} aria-pressed={filter === state} onClick={() => setFilter(state)}>{state}<b>{state === 'Tutte' ? activities.length : counts[state]}</b></button>)}
    </div>
    {error && <p role="alert">{error}</p>}
    <div className="dev-batch" aria-label="Preparazione AI di più attività">
      <div className="dev-batch-select">
        <button type="button" onClick={() => setSelected(new Set(visible.map(a => a.key)))} disabled={!visible.length || batch?.running}>Seleziona le {visible.length} visibili</button>
        <button type="button" onClick={() => setSelected(new Set(visible.filter(a => !hasProposal(plans[a.key])).map(a => a.key)))} disabled={!visible.length || batch?.running}>Solo senza proposta</button>
        <button type="button" onClick={() => setSelected(new Set())} disabled={!selected.size || batch?.running}>Deseleziona</button>
        <span className="dev-batch-count"><b>{selected.size}</b> selezionate</span>
      </div>
      <label className="dev-batch-option"><input type="checkbox" checked={regenerate} onChange={e => setRegenerate(e.target.checked)} disabled={batch?.running} /> Rigenera anche le attività che hanno già una proposta (la sostituisce)</label>
      <div className="dev-batch-run">
        <button type="button" className="dev-btn-primary" disabled={!toPrepare.length || !sourceFiles.length || !!busy || batch?.running} onClick={() => {
          if (!window.confirm(`Preparare con l’AI ${toPrepare.length} attività? Verranno fatte ${toPrepare.length} richieste AI, una alla volta. Le schede già compilate non vengono modificate: viene salvata solo la proposta.${skipped ? ` ${skipped} attività selezionate con proposta già presente saranno saltate.` : ''}`)) return;
          runBatch(toPrepare);
        }}>{batch?.running ? 'Preparazione in corso…' : `Prepara con AI le ${toPrepare.length} attività selezionate`}</button>
        {batch?.running && <button type="button" onClick={() => { stop.current = true; }}>Ferma dopo questa</button>}
        {!sourceFiles.length && <span className="dev-hint">Seleziona prima la cartella dei sorgenti.</span>}
        {sourceFiles.length > 0 && !selected.size && <span className="dev-hint">Spunta le attività nell’elenco per prepararle in blocco.</span>}
      </div>
      <div className="dev-batch-run dev-batch-insert">
        <button type="button" disabled={!selected.size || batch?.running} onClick={insert}>Inserisci bozza nelle {planInsertion(activities, plans, selected, overwrite).eligible.length} schede selezionate</button>
        <label className="dev-batch-option"><input type="checkbox" checked={overwrite} onChange={e => { setOverwrite(e.target.checked); setInsertion(null); }} disabled={batch?.running} /> Sostituisci anche le schede già compilate</label>
      </div>
      {insertion?.undone && <div className="dev-batch-progress" role="status"><p>Inserimento annullato. {insertion.kept.length ? 'Le schede modificate dopo l’inserimento sono state lasciate come le hai scritte.' : ''}</p></div>}
      {insertion && !insertion.undone && <div className="dev-batch-progress" role="status" aria-live="polite">
        <p><b>{insertion.done} {insertion.done === 1 ? 'scheda aggiornata' : 'schede aggiornate'}</b>{insertion.done ? ` (attività ${insertion.numbers.join(', ')}). Salva lo sviluppo per conservarle.` : '. Nessuna scheda aggiornata.'}{insertion.skipped.length ? ` ${insertion.skipped.length} saltate.` : ''}</p>
        {insertion.skipped.length > 0 && <ul className="dev-batch-errors">{insertion.skipped.map(entry => <li key={entry.key}><b>Attività {entry.number}</b>: {entry.reason}</li>)}</ul>}
        {insertion.undo && <button type="button" onClick={undo}>Annulla l’inserimento</button>}
      </div>}
      {batch && <div className="dev-batch-progress" role="status" aria-live="polite">
        {batch.running ? <><span className="dev-bar" aria-hidden="true"><i style={{ width: `${Math.round(100 * (batch.done + batch.failures.length) / batch.total)}%` }} /></span>
          <p>Attività {batch.current}: {batch.done + batch.failures.length} di {batch.total} elaborate · {batch.done} riuscite{batch.failures.length ? ` · ${batch.failures.length} con errore` : ''}</p></>
          : <p><b>{batch.done} su {batch.total} proposte preparate.</b>{batch.failures.length ? ` ${batch.failures.length} con errore.` : ''}{batch.pending > 0 ? ` ${batch.pending} non elaborate${batch.halted && !batch.stopped ? ' (interrotto dopo errori consecutivi)' : ' (fermato)'}.` : ''} Salva lo sviluppo per conservarle.</p>}
        {!batch.running && batch.failures.length > 0 && <ul className="dev-batch-errors">{batch.failures.map(f => <li key={f.number}><b>Attività {f.number}</b>: {f.message}</li>)}</ul>}
        {!batch.running && batch.failures.length > 0 && <button type="button" onClick={() => runBatch(activities.filter(a => batch.failures.some(f => f.number === a.number)))}>Riprova le {batch.failures.length} con errore</button>}
      </div>}
    </div>
    {!visible.length && <p className="dev-empty">Nessuna attività in questo stato.</p>}
    {visible.map(({ key, item, number }) => {
      const plan = plans[key] || {};
      const next = activityNextStep(plan);
      const status = plan.status || 'Da analizzare';
      return <details className="development-activity" key={key} open={openKey === key} onToggle={e => { if (e.currentTarget.open) setOpenKey(key); else if (openKey === key) setOpenKey(null); }}>
        <summary>
          <label className="dev-pick" onClick={e => e.stopPropagation()}><input type="checkbox" aria-label={`Seleziona attività ${number}`} checked={selected.has(key)} disabled={batch?.running} onChange={() => toggle(key)} /></label>
          <span className="dev-activity-number">Attività {number}</span>
          <span className="dev-activity-title"><strong>{item.interventionId} · {item.detail?.componentApplication || item.detail?.name || item.id}</strong>
            <small>{String(item.detail?.detailDescription || item.reason || '').slice(0, 140)}</small></span>
          <span className="dev-activity-steps" aria-label="Avanzamento della scheda">{stepsFor(plan).map(([label, done]) => <i key={label} className={done ? 'is-done' : ''} title={`${label}: ${done ? 'fatto' : 'da fare'}`} />)}</span>
          <span className={`dev-state dev-state-${states.indexOf(status)}`}>{status}</span>
        </summary>
        <div className="dev-activity-body">
          <ol className="dev-mini-journey" aria-label="Sequenza dell’attività">{stepsFor(plan).map(([label, done]) => <li key={label} className={done ? 'is-done' : ''}>{label}</li>)}</ol>
          <p className="dev-next"><b>Prossimo passo.</b> {next.text}</p>
          <h4>Requisito</h4>
          <p className="development-requirement">{item.detail?.detailDescription || item.reason}</p>
          <div className="dev-ai-row">
            <button type="button" disabled={!!busy || !sourceFiles.length} onClick={() => prepare(key, item)}>{busy === key ? 'Analisi degli estratti…' : 'Prepara scheda con AI'}</button>
            {!sourceFiles.length && <span className="dev-hint">Seleziona prima la cartella dei sorgenti.</span>}
          </div>
        {proposals[key] && <div className="development-ai-proposal"><strong>Proposta AI · da controllare</strong><p>Proposta disponibile nella scheda: salva lo sviluppo prima di ricaricare.</p><p>{proposals[key].coverage.notice}</p>
          <h4>Soluzione</h4><p style={{ whiteSpace: 'pre-wrap' }}>{proposals[key].analysis.solution}</p><h4>Criteri di accettazione</h4><p style={{ whiteSpace: 'pre-wrap' }}>{proposals[key].analysis.acceptance}</p>
          <h4>File e righe citati negli estratti</h4>{!proposals[key].evidence.length && <p>Nessuna citazione valida ai file ricevuti. Non considerare i file ipotizzati come verificati.</p>}
          {proposals[key].evidence.map((entry, index) => <p key={index}><code>{entry.path}:{entry.startLine}–{entry.endLine}</code> · {typeof entry.reason === 'string' ? entry.reason : ''}</p>)}
          <h4>Ipotesi sui file, da verificare</h4><pre style={{ whiteSpace: 'pre-wrap' }}>{JSON.stringify(proposals[key].analysis.hypothesizedFiles || [], null, 2)}</pre>
          <h4>Punti aperti</h4><p>{typeof proposals[key].analysis.openQuestions === 'string' ? proposals[key].analysis.openQuestions : JSON.stringify(proposals[key].analysis.openQuestions || '')}</p>
          <button type="button" onClick={() => {
            if (!window.confirm('Inserire la bozza AI nella scheda? I campi file, soluzione e criteri correnti saranno sostituiti; non verrà dichiarata verificata.')) return;
            update(key, draftPatch(plan, proposals[key]));
          }}>Inserisci bozza nella scheda</button>
        </div>}
        <h4>Scheda tecnica</h4>
        <div className="workspace-fields">{[['files', 'File coinvolti (uno per riga, percorso relativo)'], ['solution', 'Soluzione tecnica'], ['acceptance', 'Criteri di accettazione'], ['verification', 'Evidenze di verifica (test, comando, esito, commit)']].map(([field, label]) => <label key={field}>{label}<textarea rows={4} value={plan[field] || ''} onChange={e => update(key, { [field]: e.target.value })} /></label>)}</div>
        <label className="dev-status-field">Stato di verifica<select aria-label={`Stato attività ${number}`} value={status} onChange={e => update(key, { status: e.target.value })}>{states.map(state => <option key={state} disabled={!stateAllowed(state, plan)}>{state}</option>)}</select></label>
        <p className="dev-hint">“Pronta per sviluppo” richiede file, soluzione e criteri. “Verificata” è una dichiarazione dell’analista accompagnata da evidenze: l’app non esegue compilazioni o test del repository.</p>
        <ActivityCodeGenerator item={item} plan={plan} update={patch => update(key, patch)} applications={applications} sourceFiles={sourceFiles} />
        </div>
      </details>;
    })}
  </section>;
}
