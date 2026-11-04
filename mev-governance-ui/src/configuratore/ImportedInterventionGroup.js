import React from 'react';

export function importedMappingValues(mapping, items) {
  const row = items.find(item => mapping.sourceRowId ? item.sourceRowId === mapping.sourceRowId : item.detail === mapping);
  const quantity = row?.qty ?? mapping.qty ?? 1;
  const price = row ? row.unit : mapping.unit ?? (mapping.qty ? (mapping.total ?? 0) / mapping.qty : null);
  return { quantity, price, total: price == null ? null : Number(quantity) * Number(price) };
}

export default function ImportedInterventionGroup({ intervention, items, children }) {
  const values = (intervention.mappings || []).map(mapping => importedMappingValues(mapping, items));
  const total = values.every(value => value.total != null && Number.isFinite(value.total)) ? values.reduce((sum, value) => sum + value.total, 0) : null;
  return <details className="imported-intervention-group">
    <summary><div className="imported-intervention-identity"><span>ID_INTERVENTO {intervention.id}</span><strong>{intervention.titolo || 'Intervento senza titolo'}</strong>{intervention.descrizione && <p>{intervention.descrizione}</p>}</div>
      <div className="imported-intervention-total"><small>{values.length} componenti · Totale</small><strong>{total == null ? 'Non disponibile' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(total)}</strong><small>Apri il dettaglio</small></div>
    </summary>
    {children}
  </details>;
}
