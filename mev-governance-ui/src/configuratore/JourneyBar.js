import React from 'react';

const STATUS_LABEL = { complete: 'Completa', partial: 'In corso', empty: 'Da fare', waiting: 'In attesa' };

export default function JourneyBar({ journey, current, onSelect, showGuide, onToggleGuide }) {
  const active = journey.phases.find(phase => phase.id === current);
  return <section className="dev-journey" aria-label="Percorso di sviluppo">
    <div className="dev-journey-top">
      <div className="dev-next-box" role="status">
        {journey.next ? <>
          <span className="dev-eyebrow">Prossimo passo · fase {journey.next.label}</span>
          <p>{journey.next.text}</p>
          {journey.next.phase !== current && <button type="button" className="dev-btn dev-btn-primary" onClick={() => onSelect(journey.next.phase)}>Vai a {journey.next.label} →</button>}
        </> : <>
          <span className="dev-eyebrow">Percorso completo</span>
          <p>Tutte le fasi obbligatorie sono complete. Controlla le evidenze di verifica prima di chiudere l’iniziativa.</p>
        </>}
      </div>
      <div className="dev-overall" aria-label={`Avanzamento complessivo ${journey.overall} per cento`}>
        <strong>{journey.overall}%</strong><span>avanzamento</span>
        <span className="dev-bar" aria-hidden="true"><i style={{ width: `${journey.overall}%` }} /></span>
      </div>
    </div>
    <ol className="dev-steps">
      {journey.phases.map((phase, index) => <li key={phase.id}>
        <button type="button" className={`dev-step dev-step-${phase.status}${phase.id === current ? ' is-current' : ''}`} aria-current={phase.id === current ? 'step' : undefined} onClick={() => onSelect(phase.id)}>
          <span className="dev-step-badge" aria-hidden="true">{phase.status === 'complete' ? '✓' : index + 1}</span>
          <span className="dev-step-text"><strong>{phase.label}{phase.optional && <em> · facoltativa</em>}</strong>
            <small>{phase.summary}</small>
            <span className="dev-bar" aria-hidden="true"><i style={{ width: `${Math.round(phase.fraction * 100)}%` }} /></span>
            <span className="dev-sr-only">{STATUS_LABEL[phase.status]}</span></span>
        </button>
      </li>)}
    </ol>
    <button type="button" className="dev-guide-toggle" aria-expanded={showGuide} onClick={onToggleGuide}>{showGuide ? 'Nascondi' : 'Mostra'} le regole della fase «{active.label}»</button>
    {showGuide && <div className="dev-guide" role="region" aria-label={`Regole della fase ${active.label}`}>
      <p className="dev-guide-purpose">{active.purpose}</p>
      <div className="dev-guide-cols">
        <div><h4>Cosa serve</h4><ul>{active.needs.map(text => <li key={text}>{text}</li>)}</ul></div>
        <div><h4>Cosa produce</h4><ul>{active.produces.map(text => <li key={text}>{text}</li>)}</ul></div>
        <div><h4>Regole</h4><ul>{active.rules.map(text => <li key={text}>{text}</li>)}</ul></div>
      </div>
      {active.id === 'consegna' && <ul className="dev-checks">{active.checks.map(([label, ok]) => <li key={label} className={ok ? 'is-ok' : ''}>{ok ? '✓' : '○'} {label}</li>)}</ul>}
    </div>}
  </section>;
}
