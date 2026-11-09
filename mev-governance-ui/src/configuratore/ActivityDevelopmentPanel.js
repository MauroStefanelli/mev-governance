import React, { useState } from 'react';
import { developmentActivities } from './developmentActivityModel';

export default function DevelopmentActivities({ items, plans, onChange, applications, onSelectFiles }) {
  const [filter, setFilter] = useState('Tutte');
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
    {activities.filter(a => filter === 'Tutte' || (plans[a.key]?.status || 'Da analizzare') === filter).map(({ key, item, number }) => {
      const plan = plans[key] || {};
      return <details className="development-activity" key={key}>
        <summary><span className="workspace-version">Attività {number}</span><strong>{item.interventionId} · {item.detail?.componentApplication || item.detail?.name || item.id}</strong><span>{plan.status || 'Da analizzare'}</span></summary>
        <p className="development-requirement">{item.detail?.detailDescription || item.reason}</p>
        <div className="workspace-fields">{[['files', 'File coinvolti (uno per riga, percorso relativo)'], ['solution', 'Soluzione tecnica'], ['acceptance', 'Criteri di accettazione'], ['verification', 'Evidenze di verifica (test, comando, esito, commit)']].map(([field, label]) => <label key={field}>{label}<textarea rows={4} value={plan[field] || ''} onChange={e => update(key, { [field]: e.target.value })} /></label>)}</div>
        <label>Stato di verifica<select aria-label={`Stato attività ${number}`} value={plan.status || 'Da analizzare'} onChange={e => update(key, { status: e.target.value })}>{states.map(state => <option key={state} disabled={(state === 'Verificata' && !plan.verification?.trim()) || (state === 'Pronta per sviluppo' && (!plan.files?.trim() || !plan.solution?.trim() || !plan.acceptance?.trim()))}>{state}</option>)}</select></label>
        <p>“Verificata” è una dichiarazione dell’analista accompagnata da evidenze; il configuratore non esegue compilazioni o test del repository.</p>
      </details>;
    })}
  </section>;
}
