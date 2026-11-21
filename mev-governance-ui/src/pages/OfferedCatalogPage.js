import React, { useEffect, useState } from 'react';
import { offeredCatalogLots } from '../services/mevService';
import OfferedCatalogPanel from '../components/contracts/OfferedCatalogPanel';
import './contractArchive.css';

// «Voci di catalogo offerti» per l'Admin: l'Admin non apre l'Archivio contrattuale (e' del SuperAdmin), ma gestisce qui i prezzi offerti dei lotti del SUO contratto.
export default function OfferedCatalogPage() {
  const [lots, setLots] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { offeredCatalogLots().then(setLots).catch(e => { setError(e.message); setLots([]); }); }, []);
  return <div className="contract-archive ca-admin-shell">
    <header><p className="ca-eyebrow">CONTRATTO</p><h1>Voci di catalogo offerti</h1>
      <p className="ca-caption">I prezzi offerti dopo l’aggiudicazione, voce per voce. Qui gestisci i lotti del contratto su cui stai lavorando; il catalogo di gara non viene modificato.</p></header>
    {error && <p role="alert" className="ca-error">{error}</p>}
    {lots === null ? <p role="status">Caricamento…</p> : lots.length === 0 && !error
      ? <p className="ca-empty">Nessun lotto del tuo contratto è collegato all’Archivio contrattuale. Chiedi al SuperAdmin di collegare il lotto al contratto.</p>
      : lots.map(lot => <div key={lot.contractId + '|' + lot.lotId} style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 16 }}>{lot.contractName} · Lotto {lot.lotId}{lot.lotName ? ` — ${lot.lotName}` : ''}</h2>
        <OfferedCatalogPanel contractId={lot.contractId} lotId={lot.lotId} />
      </div>)}
  </div>;
}
