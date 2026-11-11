import React from 'react';
import { countByKind, confirmedEntries, KINDS, KIND_ORDER } from './rationaleKnowledge';
import './knowledgeOverview.css';

// A single view of everything the team knows about the initiative, with a way into each section.
// It only reads what the other sections already hold: it never keeps data of its own.
export default function KnowledgeOverview({ initiative, rationale = [], solution, interventions = [], mappingCount = 0, tow5Total = 0, library, onOpen }) {
  const confirmed = confirmedEntries(rationale);
  const counts = countByKind(rationale);
  const proposed = rationale.filter(entry => entry.status === 'proposta').length;
  const hasInitiative = !!(initiative?.code || initiative?.title);
  const cards = [
    { id: 'documenti', title: 'Documenti', value: library || (hasInitiative ? '—' : 'Bloccato'), hint: 'Memoria condivisa: requisiti, email, analisi e materiali. L’AI li usa per rispondere.' },
    { id: 'razionali', title: 'Razionali e vincoli', value: confirmed.length ? `${confirmed.length} confermati` : 'Nessuno confermato', hint: confirmed.length ? `${counts.razionale} razionali · ${counts.vincolo} vincoli · ${counts.decisione} decisioni${proposed ? ` · ${proposed} da confermare` : ''}` : proposed ? `${proposed} proposte da confermare` : 'Spiega all’AI perché servono gli interventi.' },
    { id: 'soluzione', title: 'Soluzione', value: solution?.total ? `${solution.filled} di ${solution.total} interventi` : 'Nessun intervento', hint: solution?.dirty ? 'Ci sono modifiche non salvate.' : 'La soluzione proposta per ogni intervento, scaricabile per Visual Studio Code.' },
    { id: 'conoscenza', title: 'Offerta importata', value: interventions.length ? `${interventions.length} interventi` : 'Nessun import', hint: interventions.length ? `${mappingCount} valorizzazioni di catalogo` : 'Importa la Tabella di Offerta.' },
  ];
  return <div className="know" aria-label="Riepilogo della conoscenza dell’iniziativa">
    <p className="know-intro">Tutto ciò che il team sa di questa iniziativa, in un colpo d’occhio. Premi una scheda per aprire la sezione dove si modifica.</p>
    <ul className="know-cards">{cards.map(card => <li key={card.id} className="know-card">
      <button type="button" disabled={!hasInitiative && card.id !== 'conoscenza'} onClick={() => onOpen?.(card.id)}>
        <span className="know-card-title">{card.title}</span><strong>{card.value}</strong><small>{card.hint}</small></button></li>)}</ul>
    {confirmed.length > 0 && <div className="know-rationale" aria-label="Voci confermate">
      <h4>Cosa è stato confermato</h4>
      {KIND_ORDER.map(kind => { const rows = confirmed.filter(entry => entry.kind === kind); return rows.length ? <div key={kind}><h5>{KINDS[kind].plural}</h5>
        <ul>{rows.map(entry => <li key={entry.id}>{entry.text}{entry.interventionId ? <small> · intervento {entry.interventionId}</small> : null}</li>)}</ul></div> : null; })}
    </div>}
    {tow5Total > 0 && <p className="know-meta">Offerta importata: TOW .5 {new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(tow5Total)}.</p>}
  </div>;
}
