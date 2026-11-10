import React, { useState } from 'react';
import { developmentActivities } from './developmentActivityModel';
import { activitySourceContext } from './activitySourceContext';
import { prepareActivityDevelopment } from '../services/mevService';
import ActivityCodeGenerator from './ActivityCodeGenerator';
import { ACTIVITY_STATES, stateAllowed, isDefined, hasProposal, hasCode, isVerified, activityNextStep } from './developmentJourney';

export default function DevelopmentActivities({ items, plans, onChange, applications, onSelectFiles, sourceFiles = [], embedded = false }) {
  const [filter, setFilter] = useState('Tutte');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  // Proposals are persisted with the plan even before applying their fields.
  const proposals = Object.fromEntries(Object.entries(plans).filter(([, plan]) => plan.aiProposal || plan.aiDraft).map(([key, plan]) => [key, plan.aiProposal || plan.aiDraft]));
  const prepare = async (key, item) => {
    setBusy(key); setError('');
    try {
      const description = item.detail?.detailDescription || item.reason || '';
      const source = await activitySourceContext(sourceFiles, description);
      if (!source.files.length) throw new Error('Nessun file sorgente leggibile: seleziona la cartella NPSO per questa sessione.');
      const result = await prepareActivityDevelopment({ activity: { interventionId: item.interventionId, description, technology: item.detail?.technology }, source });
      if (typeof result.analysis?.solution !== 'string' || typeof result.analysis?.acceptance !== 'string') throw new Error('Risposta AI incompleta: la scheda corrente non è stata modificata.');
      const evidence = (Array.isArray(result.analysis.evidence) ? result.analysis.evidence : []).filter(entry => {
        const file = source.files.find(f => f.path === entry.path);
        return file && Number.isInteger(entry.startLine) && Number.isInteger(entry.endLine) && entry.startLine >= file.startLine && entry.endLine <= file.endLine && entry.endLine >= entry.startLine;
      }).map(entry => ({ ...entry, sha256: source.files.find(f => f.path === entry.path).sha256 }));
      onChange(previous => ({ ...previous, [key]: { ...previous[key], aiProposal: { ...result, evidence, coverage: source.coverage, excerpts: source.files } } }));
    } catch (e) { setError(e.message); } finally { setBusy(''); }
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
    {!visible.length && <p className="dev-empty">Nessuna attività in questo stato.</p>}
    {visible.map(({ key, item, number }) => {
      const plan = plans[key] || {};
      const next = activityNextStep(plan);
      const status = plan.status || 'Da analizzare';
      return <details className="development-activity" key={key} open={openKey === key} onToggle={e => { if (e.currentTarget.open) setOpenKey(key); else if (openKey === key) setOpenKey(null); }}>
        <summary>
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
            update(key, { files: [...new Set(proposals[key].evidence.map(e => e.path))].join('\n'), solution: proposals[key].analysis.solution,
              acceptance: proposals[key].analysis.acceptance, status: 'Da analizzare', aiDraft: proposals[key] });
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
