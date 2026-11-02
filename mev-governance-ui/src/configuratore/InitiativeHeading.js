import React from 'react';

export default function InitiativeHeading({ initiative, contractId, lot, catalogCount, children }) {
  return <header className="tow-sticky-heading" aria-label="Iniziativa corrente">
    <div className="tow-heading-top"><div>
      <h2>Configuratore Offerta TOW</h2>
      <div className="tow-heading-badges"><span>Contratto {contractId}</span><span>Lotto {lot}</span><span>Catalogo · {catalogCount} voci</span></div>
    </div>{children}</div>
    <div className="tow-heading-initiative" aria-live="polite">
      <div><span className="workspace-eyebrow">Codice GOTO</span><strong>{initiative.code || 'Nuova iniziativa'}</strong></div>
      <div><span className="workspace-eyebrow">Titolo iniziativa</span><strong>{initiative.title || 'Compila i dati dell’iniziativa'}</strong></div>
    </div>
  </header>;
}
