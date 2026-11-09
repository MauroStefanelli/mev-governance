import React, { useState } from 'react';
import { developmentActivities } from './developmentActivityModel';
import { activitySourceContext } from './activitySourceContext';
import { prepareActivityDevelopment } from '../services/mevService';

export default function DevelopmentActivities({ items, plans, onChange, applications, onSelectFiles, sourceFiles = [] }) {
  const [filter, setFilter] = useState('Tutte');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [proposals, setProposals] = useState({});
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
      setProposals(previous => ({ ...previous, [key]: { ...result, evidence, coverage: source.coverage, excerpts: source.files } }));
    } catch (e) { setError(e.message); } finally { setBusy(''); }
  };
  const activities = developmentActivities(items);
  const states = ['Da analizzare', 'Soluzione definita', 'Pronta per sviluppo', 'In sviluppo', 'Da verificare', 'Verificata'];
  const update = (key, patch) => onChange(previous => {
    const current = previous[key] || {};
    const changed = { ...current, ...patch };
    if (!patch.status && current.status === 'Verificata') changed.status = 'Da verificare';
    return { ...previous, [key]: changed };
  });
  return <section className="initiative-workspace" aria-label="Schede di sviluppo per attività">
    <header className="workspace-heading"><div><span className="workspace-eyebrow">Consegna · Visual Studio Code</span><h3>Schede di sviluppo · {activities.length} attività</h3></div><span className="workspace-version">{activities.filter(a => plans[a.key]?.status === 'Verificata').length} verificate</span></header>
    <p>Una scheda per ogni riga di dettaglio, anche quando più attività usano la stessa voce di catalogo. Salvare una valutazione o una revisione conserva le schede.</p>
    <div className="development-repositories"><strong>Applicativi collegati al sistema dell’iniziativa</strong>
      {applications.length ? applications.map(app => <p key={app.id || app.code || app.name}><b>{app.name}</b> · <code>{app.codeUrl || 'Percorso sorgenti non configurato'}</code></p>) : <p>Nessun applicativo corrispondente trovato: verificare Sistema e Applicativi e tecnologie.</p>}
      <p>Un percorso configurato è un riferimento: il browser non può leggere automaticamente cartelle locali. Seleziona i file per renderli disponibili alla sessione; i nomi elencati non attestano che ogni file sia stato analizzato.</p>
      <button type="button" onClick={onSelectFiles}>Seleziona cartella sorgenti per questa sessione</button>
    </div>
    <label>Stato attività<select value={filter} onChange={e => setFilter(e.target.value)}><option>Tutte</option>{states.map(state => <option key={state}>{state}</option>)}</select></label>
    <p>{sourceFiles.length} file selezionati nella sessione. La preparazione AI analizza un campione e non genera ancora patch.</p>
    {error && <p role="alert">{error}</p>}
    {activities.filter(a => filter === 'Tutte' || (plans[a.key]?.status || 'Da analizzare') === filter).map(({ key, item, number }) => {
      const plan = plans[key] || {};
      return <details className="development-activity" key={key}>
        <summary><span className="workspace-version">Attività {number}</span><strong>{item.interventionId} · {item.detail?.componentApplication || item.detail?.name || item.id}</strong><span>{plan.status || 'Da analizzare'}</span></summary>
        <p className="development-requirement">{item.detail?.detailDescription || item.reason}</p>
        <button type="button" disabled={!!busy || !sourceFiles.length} onClick={() => prepare(key, item)}>{busy === key ? 'Analisi degli estratti…' : 'Prepara scheda con AI'}</button>
        {proposals[key] && <div className="development-ai-proposal"><strong>Proposta AI · da controllare</strong><p>{proposals[key].coverage.notice}</p>
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
        <div className="workspace-fields">{[['files', 'File coinvolti (uno per riga, percorso relativo)'], ['solution', 'Soluzione tecnica'], ['acceptance', 'Criteri di accettazione'], ['verification', 'Evidenze di verifica (test, comando, esito, commit)']].map(([field, label]) => <label key={field}>{label}<textarea rows={4} value={plan[field] || ''} onChange={e => update(key, { [field]: e.target.value })} /></label>)}</div>
        <label>Stato di verifica<select aria-label={`Stato attività ${number}`} value={plan.status || 'Da analizzare'} onChange={e => update(key, { status: e.target.value })}>{states.map(state => <option key={state} disabled={(state === 'Verificata' && !plan.verification?.trim()) || (state === 'Pronta per sviluppo' && (!plan.files?.trim() || !plan.solution?.trim() || !plan.acceptance?.trim()))}>{state}</option>)}</select></label>
        <p>“Verificata” è una dichiarazione dell’analista accompagnata da evidenze; il configuratore non esegue compilazioni o test del repository.</p>
      </details>;
    })}
  </section>;
}
