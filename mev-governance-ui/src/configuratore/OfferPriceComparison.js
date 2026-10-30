import React, { useState } from 'react';
import { reconcileCatalog } from './catalogReconciliation';
const money = value => value == null ? 'Non disponibile' : new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(value);
export default function CatalogReconciliation({ items, catalog, contractName, lot, builtin, onApply, onAssign }) {
  const [choices, setChoices] = useState({});
  const result = reconcileCatalog(items, catalog);
  const originalCodes = [...new Set(result.lines.map(l => l.original?.catalogId).filter(Boolean))];
  if (!result.lines.length) return null;
  return <section aria-label="Confronto prezzi Excel e catalogo" style={{ background: '#fff', padding: 16, border: '1px solid #cbd5e1', borderRadius: 8, margin: '16px 0' }}>
    <h2 style={{ fontSize: 18, marginTop: 0 }}>Confronto Excel e Voci Catalogo</h2>
    <p>Contratto: <strong>{contractName || 'Non selezionato'}</strong> · Lotto {lot}{builtin ? ' · Catalogo predefinito: verificare il contratto di sistema' : ''}</p>
    <p>{result.lines.length} righe importate · Totale originale: <strong>{money(result.originalTotal)}</strong> · Totale ai prezzi di catalogo, con quantità correnti: <strong>{money(result.catalogTotal)}</strong></p>
    {!!result.missing && <p role="alert">{result.missing} righe senza prezzo di catalogo valido: il confronto complessivo non è disponibile. Le righe sono conservate.</p>}
    <p>I prezzi originali restano conservati. Il confronto riguarda il dettaglio a catalogo (TOW .5), non le altre TOW. Applica un prezzo solo dopo aver verificato il contratto.</p>
    {onAssign && !builtin && <details><summary>Associare i codici Excel alle Voci Catalogo del contratto</summary>
      <p>L'associazione vale per le righe di questa offerta con lo stesso codice originale. I prezzi in uso restano invariati finché non scegli «Usa catalogo».</p>
      {originalCodes.map(code => <div key={code} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, margin: '8px 0' }}>
        <label>ID Excel {code} <select aria-label={`Voce contratto per ID Excel ${code}`} value={choices[code] || ''} onChange={e => setChoices(prev => ({ ...prev, [code]: e.target.value }))}>
          <option value="">Seleziona la voce del contratto</option>
          {catalog.map(c => <option key={c.id} value={c.id}>{c.nome} · {c.id}</option>)}
        </select></label>
        <button type="button" disabled={!catalog.some(c => String(c.id) === choices[code])} onClick={() => onAssign(code, choices[code])}>Associa righe ID Excel {code}</button>
      </div>)}
    </details>}
    <div style={{ overflowX: 'auto', maxHeight: 380 }}><table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead><tr>{['Intervento / attività', 'Voce catalogo', 'Tipo / complessità', 'Quantità', 'Prezzo Excel', 'Prezzo catalogo', 'Differenza unitaria', 'Prezzo in uso', 'Azione'].map(h => <th key={h} style={{ textAlign: 'left', padding: 8 }}>{h}</th>)}</tr></thead>
      <tbody>{result.lines.map(({ item, price, original, difference }, index) => <tr key={item.key ?? index} style={{ borderTop: '1px solid #e2e8f0' }}>
        <td style={{ padding: 8, minWidth: 230 }}><strong>{item.interventionId}</strong><div>{item.detail?.componentApplication}</div><div>{item.detail?.detailDescription || item.reason}</div></td>
        <td>{item.id}</td><td>{item.type} / {item.complexity}</td><td>{item.qty}</td>
        <td>{money(original?.unit)}</td><td>{money(price)}</td><td>{money(difference)}</td><td>{money(item.unit)}</td>
        <td><button type="button" disabled={price == null || builtin} onClick={() => onApply(item.key, price)} aria-label={`Applica prezzo catalogo riga ${index + 1}`}>Usa catalogo</button></td>
      </tr>)}</tbody>
    </table></div>
  </section>;
}
