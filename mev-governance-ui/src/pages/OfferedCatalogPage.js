import React, { useEffect, useState } from 'react';
import { offeredCatalogLots } from '../services/mevService';
import OfferedCatalogPanel from '../components/contracts/OfferedCatalogPanel';
import './contractArchive.css';
import '../components/contracts/offeredCatalog.css';
import HelpHint from "../configuratore/HelpHint";
import { HELP } from "../configuratore/helpTopics";

// «Voci di catalogo offerti» per l'Admin: l'Admin non apre l'Archivio contrattuale (e' del SuperAdmin), ma gestisce qui i prezzi offerti dei lotti del SUO contratto.
export default function OfferedCatalogPage() {
  const [lots, setLots] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { offeredCatalogLots().then(setLots).catch(e => { setError(e.message); setLots([]); }); }, []);
  return <div className="contract-archive ca-admin-shell">
    <header className="oc-pagehead"><h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>Voci di catalogo offerti<HelpHint topic={HELP.catalogoOfferto} label="Voci di catalogo offerti" /></h1>
      <p>I prezzi offerti dopo l’aggiudicazione, voce per voce, per i lotti del contratto su cui lavori. Il catalogo di gara non viene modificato.</p></header>
    {error && <p role="alert" className="oc-msg is-bad" style={{ margin: '0 0 16px' }}>{error}</p>}
    {lots === null ? <p role="status">Caricamento…</p> : lots.length === 0 && !error
      ? <div className="oc-empty" style={{ margin: 0 }}><h4>Nessun lotto collegato</h4><p>Nessun lotto del tuo contratto è collegato all’Archivio contrattuale. Chiedi al SuperAdmin di collegare il lotto al contratto.</p></div>
      : lots.map(lot => <OfferedCatalogPanel key={lot.contractId + '|' + lot.lotId} contractId={lot.contractId} lotId={lot.lotId} />)}
  </div>;
}
