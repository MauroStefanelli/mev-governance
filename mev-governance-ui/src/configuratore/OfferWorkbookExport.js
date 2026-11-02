import React, { useState } from 'react';
import { resolveCatalogEntry, catalogUnitPrice } from './catalogReconciliation';
import { exportOfferWorkbook } from '../services/mevService';

export function offerWorkbookDetails(items, catalog) {
  return items.map(item => {
    const entry = resolveCatalogEntry(item, catalog);
    const price = catalogUnitPrice(item, catalog);
    if (!entry || price == null) throw new Error(`Voce ${item.id}: associazione o prezzo del contratto mancante.`);
    return { interventionId: String(item.interventionId || ''), component: item.detail?.componentApplication || '',
      technology: item.detail?.technology || '', unit: item.detail?.unitName || '', description: item.detail?.detailDescription || item.reason || '',
      catalogId: String(entry.id), ambit: entry.ambito || '', driver: entry.nome, type: item.type, complexity: item.complexity,
      quantity: Number(item.qty), unitPrice: price };
  });
}

export default function OfferWorkbookExport({ initiative, items, interventions, catalog, lot, prices, discount, contingency }) {
  const [template, setTemplate] = useState(null);
  const [quantities, setQuantities] = useState({});
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const ids = [...new Set(items.map(it => String(it.interventionId || '')))];
  const rows = ids.map(id => interventions.find(i => String(i.id) === id) || { id, titolo: items.find(it => String(it.interventionId || '') === id)?.interventionTitle || initiative.title });
  const generate = async () => {
    setError(''); setBusy(true);
    try {
      if (discount || contingency) throw new Error('Il template non contiene campi sconto/contingency: azzerali o concorda un modello che li rappresenti prima di esportare.');
      const details = offerWorkbookDetails(items, catalog);
      const payload = { code: initiative.code, title: initiative.title, lot, details, towPrices: prices,
        interventions: rows.map(i => {
          const q = quantities[i.id];
          if (!q || [1, 2, 3, 4].some(n => q[n] === '' || q[n] == null || !Number.isFinite(Number(q[n]))))
            throw new Error(`Conferma tutte le quantità TOW per ${i.id}, indicando 0 se non previste.`);
          return { id: String(i.id), title: i.titolo || '', description: i.descrizione || '', activity: i.attivita || '', system: i.sistema || initiative.system || '', requirements: i.requisiti || initiative.requirements || '', phase: i.fase || '', notes: i.note || '', tow1: Number(q[1]), tow2: Number(q[2]), tow3: Number(q[3]), tow4: Number(q[4]) };
        }) };
      const blob = await exportOfferWorkbook(template, payload);
      const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = `Tabella Offerta - ${initiative.code}.xlsx`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  return <section className="initiative-workspace" aria-label="Generazione Tabella di offerta">
    <h3>Tabella di offerta · Excel HLD</h3>
    <p>Seleziona il modello originale con i due fogli. I dati dell’esempio saranno sostituiti; listino e prezzi di dettaglio provengono dal catalogo selezionato. TOW .5 sarà collegata al dettaglio tramite formula.</p>
    <label>Modello Excel originale<input type="file" accept=".xlsx" onChange={e => setTemplate(e.target.files?.[0] || null)} /></label>
    <p>Conferma le quantità TOW per intervento. Indica 0 per le attività non previste.</p>
    {rows.map(i => <fieldset key={i.id}><legend>{i.id} · {i.titolo}</legend>{[1, 2, 3, 4].map(n => <label key={n} style={{ display: 'inline-block', margin: 8 }}>TOW 0{lot}.{n}<input aria-label={`${i.id} TOW ${n}`} type="number" min="0" step="0.001" value={quantities[i.id]?.[n] ?? ''} onChange={e => setQuantities(previous => ({ ...previous, [i.id]: { ...previous[i.id], [n]: e.target.value } }))} /></label>)}</fieldset>)}
    {error && <p role="alert">{error}</p>}
    <button type="button" disabled={!template || !items.length || !initiative.code || busy} onClick={generate}>{busy ? 'Generazione…' : 'Genera Tabella di offerta XLSX'}</button>
  </section>;
}
