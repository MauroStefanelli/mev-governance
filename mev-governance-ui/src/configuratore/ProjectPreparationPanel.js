import React, { useState } from 'react';
import { PROJECT_DECISIONS, decisionComplete, buildProjectPackage } from './projectPackage';

export default function ProjectPreparation({ initiative, preparation, onChange, items, plans, applications, workspaceContext, branch, knowledge = [] }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const edit = patch => onChange(previous => ({ ...previous, ...patch }));
  const updateDecision = (id, patch) => onChange(previous => ({ ...previous, decisions: { ...previous.decisions, [id]: { ...previous.decisions?.[id], ...patch } } }));
  const download = async () => {
    setBusy(true); setError(''); setNotice('');
    try {
      const result = await buildProjectPackage({ initiative, preparation, items, plans, applications, workspaceContext, branch, knowledge });
      const blob = await result.zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = result.name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Pacchetto preparato: ${result.manifest.activities.length} attività, ${result.manifest.openDecisions.length} decisioni aperte. Salva una revisione per conservare la configurazione nell’app.`);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const complete = PROJECT_DECISIONS.filter(([id]) => decisionComplete(preparation.decisions?.[id])).length;
  return <section className="initiative-workspace project-preparation" aria-label="Preparazione progetto di sviluppo">
    <header className="workspace-heading"><div><span className="workspace-eyebrow">Dall’iniziativa al progetto</span><h3>Prepara progetto · Visual Studio Code</h3></div><span className="workspace-version">{complete}/{PROJECT_DECISIONS.length} decisioni documentate</span></header>
    <p>Prepara per questa iniziativa struttura, schede, decisioni aperte e piano di test. Il pacchetto si adatta alle attività correnti e non genera codice operativo né effettua deploy.</p>
    <div className="workspace-fields">
      <label>Nome progetto<input value={preparation.name || ''} placeholder="Es. servizio-invio-prenotazione" onChange={e => edit({ name: e.target.value })} /></label>
      <label>Tipo progetto<select value={preparation.kind || 'Da definire'} onChange={e => edit({ kind: e.target.value })}>{['Da definire', 'Modifica progetto esistente', 'Nuovo servizio', 'Azure Logic App — runtime da definire', 'Azure Logic App Standard', 'Azure Logic App Consumption', 'Altro'].map(kind => <option key={kind}>{kind}</option>)}</select></label>
      <label>Obiettivo tecnico<textarea rows={3} value={preparation.objective || ''} placeholder="Descrivi il risultato atteso e i confini del progetto" onChange={e => edit({ objective: e.target.value })} /></label>
    </div>
    <details><summary>Decisioni da concordare con il team · {PROJECT_DECISIONS.length - complete} da completare</summary>
      {PROJECT_DECISIONS.map(([id, title, hint]) => <fieldset key={id}><legend>{title} · {decisionComplete(preparation.decisions?.[id]) ? 'Documentata' : 'Aperta'}</legend><p>{hint}</p>
        <div className="workspace-fields">{[['choice', 'Scelta o ipotesi da discutere'], ['source', 'Fonte e versione'], ['owner', 'Referente']].map(([field, label]) => <label key={field}>{label}<textarea rows={2} value={preparation.decisions?.[id]?.[field] || ''} onChange={e => updateDecision(id, { [field]: e.target.value })} /></label>)}</div>
      </fieldset>)}
    </details>
    <p>Include README, workspace VS Code, architettura, registro decisioni, schede attività, cartelle src/contracts/fixtures e piano dei test. I riferimenti ai sorgenti sono conservati; i file locali non vengono copiati. Le decisioni mancanti restano esplicitamente aperte.</p>
    {error && <p role="alert">{error}</p>}{notice && <p role="status">{notice}</p>}
    <button type="button" disabled={busy || !items.length} onClick={download}>{busy ? 'Preparazione pacchetto…' : 'Genera progetto di avvio ZIP'}</button>
  </section>;
}
