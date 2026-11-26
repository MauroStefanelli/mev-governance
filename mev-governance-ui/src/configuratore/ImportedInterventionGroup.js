import React from 'react';
import { euro } from '../utils';

export function importedMappingValues(mapping, items) {
  const row = items.find(item => mapping.sourceRowId ? item.sourceRowId === mapping.sourceRowId : item.detail === mapping);
  const quantity = row?.qty ?? mapping.qty ?? 1;
  const price = row ? row.unit : mapping.unit ?? (mapping.qty ? (mapping.total ?? 0) / mapping.qty : null);
  return { quantity, price, total: price == null ? null : Number(quantity) * Number(price) };
}

const PHASES = ['Analisi', 'Sviluppo', 'Collaudo', 'Produzione'];
const hoursText = value => (Math.round((Number(value) || 0) * 100) / 100).toLocaleString('it-IT', { maximumFractionDigits: 2 });

// Le ore uomo che l'Estimatore Catalogo indica per questo intervento: solo informative, non entrano in prezzi e totali.
export function InterventionHours({ hours }) {
  if (!hours) return null;
  const total = PHASES.reduce((sum, phase) => sum + (Number(hours[phase]) || 0), 0);
  return <p className="imported-intervention-hours" aria-label="Ore uomo dell’intervento"><b>Ore uomo</b>{PHASES.map(phase => <span key={phase} className={hours[phase] ? '' : 'is-zero'}>{phase} <strong>{hoursText(hours[phase])}</strong></span>)}<span className="imported-intervention-hours-total">Totale <strong>{hoursText(total)}</strong></span></p>;
}

export default function ImportedInterventionGroup({ intervention, items, children }) {
  const values = (intervention.mappings || []).map(mapping => importedMappingValues(mapping, items));
  const total = values.every(value => value.total != null && Number.isFinite(value.total)) ? values.reduce((sum, value) => sum + value.total, 0) : null;
  return <details className="imported-intervention-group">
    <summary><div className="imported-intervention-identity"><span>ID_INTERVENTO {intervention.id}</span><strong>{intervention.titolo || 'Intervento senza titolo'}</strong>{intervention.descrizione && <p>{intervention.descrizione}</p>}<InterventionHours hours={intervention.hours} /></div>
      <div className="imported-intervention-total"><small>{values.length} componenti · Totale</small><strong>{total == null ? 'Non disponibile' : euro.format(total)}</strong><small>Apri il dettaglio</small></div>
    </summary>
    {children}
  </details>;
}
