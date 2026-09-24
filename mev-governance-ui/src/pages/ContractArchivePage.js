import React, { useState, useEffect } from 'react';
import {
  getConfiguratoreContracts,
  updateConfiguratoreLot,
  deleteConfiguratoreContract,
  importConfiguratoreContract,
} from '../services/mevService';
import { CONTRACT_SUMMARIES } from '../configuratore/contractSummaries';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

// ── Stili inline che replicano il CSS dell'app standalone ──────────────────
const S = {
  page: { background: '#fff', border: '1px solid #d8e0e8', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,.07)', padding: 28 },
  sectionHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, marginBottom: 24 },
  eyebrow: { margin: 0, color: '#008b72', fontSize: 12, textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 900 },
  h1: { fontSize: 28, lineHeight: 1.15, margin: '2px 0 0', color: '#102a47' },
  h2: { fontSize: 20, color: '#102a47', margin: 0 },
  muted: { color: '#667482', margin: '.35rem 0 0' },
  btnPrimary: { background: '#f4df00', color: '#102a47', border: 'none', borderRadius: 7, padding: '10px 15px', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnGhost: { background: '#fff', color: '#102a47', border: '1px solid #d8e0e8', borderRadius: 7, padding: '10px 15px', fontWeight: 700, cursor: 'pointer', font: 'inherit' },
  btnCompact: { padding: '6px 9px', fontSize: 12 },
  btnDanger: { color: '#c5221f', borderColor: '#e7c6c6' },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  contractList: { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 14, marginTop: 0 },
  contractCard: { border: '1px solid #d8e0e8', borderRadius: 9, padding: 18, display: 'grid', gap: 12 },
  lotManager: { display: 'grid', gap: 7 },
  lotRow: { display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto auto auto', gap: 7, alignItems: 'center', padding: '9px 10px', background: '#eef2f5', borderRadius: 7, borderLeft: '4px solid #008b72' },
  lotRowInactive: { borderLeft: '4px solid #9aa7b3', opacity: 0.7 },
  lotStatus: { padding: '3px 7px', borderRadius: 999, background: '#fff', fontSize: 11, fontWeight: 800 },
  cardActions: { display: 'flex', gap: 8, flexWrap: 'wrap' },
  // Form
  contractForm: { marginTop: 22, paddingTop: 24, borderTop: '1px solid #d8e0e8' },
  mainFields: { display: 'grid', gridTemplateColumns: '2fr 2fr 1fr', gap: 16, marginBottom: 16 },
  lotSection: { padding: 18, background: '#eef2f5', borderRadius: 8, marginBottom: 14 },
  lotGrid: { display: 'grid', gridTemplateColumns: '1.2fr 2fr 2fr .8fr', gap: 12, marginTop: 10 },
  labelStyle: { fontWeight: 700, fontSize: 14, color: '#334456', display: 'block' },
  inputStyle: { width: '100%', marginTop: 6, border: '1px solid #bdc9d4', borderRadius: 7, background: '#fff', padding: '11px 12px', font: 'inherit', outline: 'none', boxSizing: 'border-box' },
  hint: { marginTop: 18, background: '#eef7f5', borderLeft: '4px solid #008b72', padding: '13px 15px', color: '#31534d', fontSize: 14 },
  panelActions: { display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 24, paddingTop: 20, borderTop: '1px solid #d8e0e8' },
  // Summary page
  summaryPage: { background: '#fff', border: '1px solid #d8e0e8', borderRadius: 10, boxShadow: '0 2px 8px rgba(0,0,0,.07)', padding: 28 },
  lotTabs: { display: 'flex', background: '#eef2f5', padding: 4, borderRadius: 8, width: 'max-content', marginBottom: 20 },
  lotTab: { border: 0, background: 'transparent', padding: '9px 17px', borderRadius: 6, fontWeight: 800, color: '#667482', cursor: 'pointer', font: 'inherit' },
  lotTabActive: { background: '#102a47', color: '#fff' },
  summaryHero: { display: 'grid', gridTemplateColumns: '1fr auto', gap: 28, alignItems: 'center', padding: 24, background: 'linear-gradient(135deg,#102a47,#1c4e80)', borderRadius: 10, color: '#fff', marginBottom: 18 },
  summaryHeroText: { margin: 0, maxWidth: 900 },
  summaryStat: { minWidth: 150, padding: 15, borderRadius: 8, background: 'rgba(255,255,255,.12)', textAlign: 'center' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 16, margin: '16px 0' },
  summaryCard: { border: '1px solid #d8e0e8', borderRadius: 9, padding: 20 },
  summarySection: { border: '1px solid #d8e0e8', borderRadius: 9, padding: 20, margin: '16px 0' },
  summaryNote: { margin: '14px 0 0', padding: '12px 14px', background: '#eef7f5', borderLeft: '4px solid #008b72', fontSize: 14 },
  summaryAccordions: { display: 'grid', gap: 8 },
  summaryDetails: { border: '1px solid #d8e0e8', borderRadius: 7, background: '#f9fbfd' },
  checklistGrid: { display: 'grid', gridTemplateColumns: 'repeat(2,minmax(0,1fr))', gap: 9 },
  checklistItem: { display: 'flex', gap: 10, padding: '11px 12px', background: '#eef2f5', borderRadius: 7 },
  checklistMark: { display: 'grid', placeItems: 'center', flex: '0 0 24px', height: 24, borderRadius: '50%', background: '#008b72', color: '#fff', fontWeight: 900, fontSize: 14 },
  msgOk: { padding: '9px 14px', borderRadius: 7, fontSize: 13, background: '#dff4ed', color: '#006b57', fontWeight: 600, marginBottom: 16 },
  msgErr: { padding: '9px 14px', borderRadius: 7, fontSize: 13, background: '#fce8e6', color: '#c5221f', fontWeight: 600, marginBottom: 16 },
};

function SummaryTable({ headers, rows }) {
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #d8e0e8', borderRadius: 8, marginBottom: 0 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 400 }}>
        <thead>
          <tr>{headers.map(h => (
            <th key={h} style={{ background: '#102a47', color: '#fff', textAlign: 'left', padding: '11px 12px', fontSize: 13 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? '#f7f9fb' : '#fff' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '10px 12px', borderBottom: '1px solid #d8e0e8', fontSize: 14, verticalAlign: 'middle' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Pagina Sintesi Contratto ───────────────────────────────────────────────
function ContractSummaryView({ contract, lotId, onLotChange, onBack }) {
  const summary = CONTRACT_SUMMARIES[contract.contractId];
  const visibleLots = (contract.lots || []).filter(l => !l.deleted && l.active !== false);
  const lot = (contract.lots || []).find(l => l.lotId === lotId) || {};
  const lotSummary = summary?.lots?.[lotId];
  const common = summary?.common;
  const catalog = Array.isArray(lot.catalog) ? lot.catalog : [];
  const towPrices = lot.towPrices && typeof lot.towPrices === 'object' ? lot.towPrices : {};

  return (
    <div style={S.summaryPage}>
      {/* Header */}
      <div style={S.sectionHead}>
        <div>
          <p style={S.eyebrow}>Dettaglio contrattuale</p>
          <h1 style={S.h1}>{contract.name}</h1>
          <p style={S.muted}>{summary?.subtitle || 'Documenti, Lotti e configurazione economica'}</p>
        </div>
        <button style={S.btnGhost} onClick={onBack}>Torna ai contratti</button>
      </div>

      {/* Tab lotti */}
      <div style={S.lotTabs}>
        {visibleLots.map(l => (
          <button key={l.lotId}
            style={{ ...S.lotTab, ...(l.lotId === lotId ? S.lotTabActive : {}) }}
            onClick={() => onLotChange(l.lotId)}>
            Lotto {l.lotId}
          </button>
        ))}
      </div>

      {lotSummary && common ? (
        <div>
          {/* Hero */}
          <div style={S.summaryHero}>
            <div>
              <p style={{ ...S.eyebrow, color: 'rgba(255,255,255,.7)' }}>Sintesi allegata</p>
              <h2 style={{ fontSize: 24, color: '#fff', margin: '3px 0 10px' }}>{lotSummary.title}</h2>
              <p style={S.summaryHeroText}>{lotSummary.conclusion}</p>
            </div>
            <div style={S.summaryStat}>
              <span style={{ display: 'block', fontSize: 12, opacity: .8 }}>Garanzia</span>
              <strong style={{ display: 'block', fontSize: 24, marginTop: 3 }}>12 mesi</strong>
            </div>
          </div>

          {/* Dimensionamento + Copertura */}
          <div style={S.summaryGrid}>
            <div style={S.summaryCard}>
              <h3 style={{ margin: '0 0 12px', color: '#102a47' }}>Dimensionamento</h3>
              <ul style={{ paddingLeft: 20, margin: 0 }}>{lotSummary.dimensioning.map((x, i) => <li key={i} style={{ margin: '7px 0' }}>{x}</li>)}</ul>
            </div>
            <div style={S.summaryCard}>
              <h3 style={{ margin: '0 0 12px', color: '#102a47' }}>Copertura del servizio</h3>
              <ul style={{ paddingLeft: 20, margin: 0 }}>{common.coverage.map((x, i) => <li key={i} style={{ margin: '7px 0' }}>{x}</li>)}</ul>
            </div>
          </div>

          {/* Quadro TOW */}
          <div style={S.summarySection}>
            <h2 style={{ margin: '0 0 12px', color: '#102a47' }}>Quadro TOW</h2>
            <SummaryTable headers={['TOW', 'Ambito', 'Quantità contrattuale', 'Peso']} rows={lotSummary.tow} />
            <p style={S.summaryNote}>{lotSummary.catalogNote}</p>
          </div>

          {/* Obblighi organizzativi */}
          <div style={S.summarySection}>
            <h2 style={{ margin: '0 0 12px', color: '#102a47' }}>Obblighi organizzativi</h2>
            <SummaryTable headers={['Obbligo', 'Vincolo']} rows={common.obligations} />
          </div>

          {/* Deliverable */}
          <div style={S.summarySection}>
            <h2 style={{ margin: '0 0 12px', color: '#102a47' }}>Deliverable per TOW</h2>
            <div style={S.summaryAccordions}>
              {Object.entries(lotSummary.deliverables).map(([tow, items]) => (
                <details key={tow} style={S.summaryDetails}>
                  <summary style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '13px 15px', cursor: 'pointer', color: '#102a47' }}>
                    <strong>{tow}</strong>
                    <span style={{ color: '#667482', fontSize: 13 }}>{items.length} deliverable</span>
                  </summary>
                  <ul style={{ margin: 0, padding: '0 20px 15px 36px', columns: 2 }}>
                    {items.map((x, i) => <li key={i} style={{ margin: '5px 0' }}>{x}</li>)}
                  </ul>
                </details>
              ))}
            </div>
          </div>

          {/* Ciclo + Qualità */}
          <div style={S.summaryGrid}>
            <div style={S.summaryCard}>
              <h3 style={{ margin: '0 0 12px', color: '#102a47' }}>Ciclo di esecuzione</h3>
              <ol style={{ paddingLeft: 20, margin: 0 }}>{common.lifecycle.map((x, i) => <li key={i} style={{ margin: '7px 0' }}>{x}</li>)}</ol>
            </div>
            <div style={S.summaryCard}>
              <h3 style={{ margin: '0 0 12px', color: '#102a47' }}>Qualità dei task</h3>
              <SummaryTable headers={['Indicatore', 'Soglia']} rows={common.quality} />
            </div>
          </div>

          {/* SLA */}
          <div style={S.summarySection}>
            <h2 style={{ margin: '0 0 12px', color: '#102a47' }}>SLA del canone</h2>
            <SummaryTable headers={['Indicatore', 'Obiettivo', 'Peso']} rows={common.service} />
            <div style={{ marginTop: 12 }}>
              <SummaryTable headers={['Severità', 'Tempi contrattuali']} rows={common.severity} />
            </div>
            <p style={S.summaryNote}><strong>Garanzia:</strong> {common.warranty}</p>
          </div>

          {/* Checklist */}
          <div style={S.summarySection}>
            <h2 style={{ margin: '0 0 12px', color: '#102a47' }}>Checklist operativa</h2>
            <div style={S.checklistGrid}>
              {common.checklist.map(([area, check], i) => (
                <div key={i} style={S.checklistItem}>
                  <span style={S.checklistMark}>&#10003;</span>
                  <p style={{ margin: 0, fontSize: 14 }}><strong>{area}</strong><br />{check}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Fonti */}
          <div style={{ ...S.summarySection, borderTop: '1px solid #d8e0e8', marginTop: 16 }}>
            <h2 style={{ margin: '0 0 6px', color: '#102a47', fontSize: 16 }}>Fonti contrattuali considerate</h2>
            <p style={{ margin: 0, color: '#667482' }}>{(lotSummary.sources || []).join(' · ')}</p>
          </div>
        </div>
      ) : (
        /* Sintesi generica per contratti importati */
        <div>
          <div style={S.summaryHero}>
            <div>
              <p style={{ ...S.eyebrow, color: 'rgba(255,255,255,.7)' }}>Lotto {lotId}</p>
              <h2 style={{ fontSize: 22, color: '#fff', margin: '3px 0 10px' }}>{lot.name || '—'}</h2>
              <p style={S.summaryHeroText}>Riepilogo ricavato dalla configurazione importata. Per questo contratto non è ancora disponibile una sintesi operativa estesa.</p>
            </div>
            <div style={S.summaryStat}>
              <span style={{ display: 'block', fontSize: 12, opacity: .8 }}>Voci di catalogo</span>
              <strong style={{ display: 'block', fontSize: 24, marginTop: 3 }}>{catalog.length}</strong>
            </div>
          </div>
          <div style={S.summaryGrid}>
            <div style={S.summaryCard}>
              <h3 style={{ margin: '0 0 12px', color: '#102a47' }}>Documenti</h3>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}><strong>Capitolato:</strong> {contract.rulesFile || 'Non indicato'}</p>
              <p style={{ margin: '0 0 6px', fontSize: 14 }}><strong>Catalogo:</strong> {lot.catalogFile || 'Non caricato'}</p>
              <p style={{ margin: 0, fontSize: 14 }}><strong>File economico:</strong> {lot.priceFile || 'Non caricato'}</p>
            </div>
            <div style={S.summaryCard}>
              <h3 style={{ margin: '0 0 12px', color: '#102a47' }}>Configurazione economica</h3>
              <p style={{ margin: '0 0 10px', fontSize: 14 }}>TOW .5 configurato al <strong>{lot.tow5Share ?? '—'}%</strong>.</p>
              {Object.keys(towPrices).length > 0
                ? <SummaryTable headers={['TOW', 'Valore unitario']}
                    rows={Object.entries(towPrices).map(([tow, price]) => [tow, euro.format(price)])} />
                : <p style={{ color: '#667482', fontSize: 14 }}>Nessun prezzo TOW disponibile.</p>
              }
            </div>
          </div>
          {catalog.length > 0 && (
            <div style={S.summarySection}>
              <h2 style={{ margin: '0 0 12px', color: '#102a47' }}>Voci di catalogo ({catalog.length})</h2>
              <SummaryTable
                headers={['ID', 'Ambito', 'Nome', 'Realizzazione S/M/C', 'Modifica S/M/C']}
                rows={catalog.map(e => {
                  const pR = e.prezzi?.Realizzazione || e.prezzi?.realizzazione || {};
                  const pM = e.prezzi?.Modifica || e.prezzi?.modifica || {};
                  return [
                    e.id ?? e.Id ?? '',
                    e.ambito ?? '',
                    e.nome ?? '',
                    [pR.Semplice, pR.Medio, pR.Complesso].map(v => euro.format(v || 0)).join(' / '),
                    [pM.Semplice, pM.Medio, pM.Complesso].map(v => euro.format(v || 0)).join(' / '),
                  ];
                })}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Componente principale ──────────────────────────────────────────────────
export default function ContractArchivePage({ ambienti = [] }) {
  const [view, setView]               = useState('contracts');
  const [summaryContract, setSumCon]  = useState(null);
  const [summaryLotId, setSumLot]     = useState('1');

  const [archContracts, setContracts] = useState([]);
  const [archLoading, setLoading]     = useState(false);
  const [archMsg, setMsg]             = useState({ type: '', text: '' });

  // Form nuovo contratto
  const [showForm, setShowForm]       = useState(false);
  const [ncName, setNcName]           = useState('');
  const [ncRulesFile, setNcRules]     = useState(null);
  const [ncLots, setNcLots]           = useState(2);
  const [ncLotNames, setNcLotNames]   = useState({});
  const [ncLotFiles, setNcLotFiles]   = useState({});
  const [ncLotShares, setNcLotShares] = useState({});
  const [ncSaving, setNcSaving]       = useState(false);

  // Lotti — toggle / codice MEV
  const [togglingLot, setToggling]    = useState({});
  const [expandedCon, setExpanded]    = useState(null);
  const [lotCodes, setLotCodes]       = useState({});
  const [lotEnvSel, setLotEnvSel]     = useState({});
  const [savingLot, setSavingLot]     = useState({});

  const loadContracts = async () => {
    setLoading(true);
    try {
      const cs = await getConfiguratoreContracts();
      setContracts(cs);
      const codes = {};
      const envSel = {};
      cs.forEach(c => {
        (c.lots || []).forEach(l => {
          const key = c.contractId + '|' + l.lotId;
          codes[key] = l.codiceContratto || '';
          if (l.codiceContratto) {
            const env = ambienti.find(a => a.codiceContratto === l.codiceContratto);
            envSel[key] = env ? String(env.id) : '';
          }
        });
      });
      setLotCodes(codes);
      setLotEnvSel(envSel);
      setMsg({ type: '', text: '' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore caricamento: ' + (e.message || '') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContracts(); }, []); // eslint-disable-line

  // ── Helpers: aggiornamento ottimistico locale (come l'app standalone) ─────
  const updateLotLocal = (contractId, lotId, patch) => {
    setContracts(prev => prev.map(c => {
      if (c.contractId !== contractId) return c;
      return { ...c, lots: (c.lots || []).map(l => l.lotId === lotId ? { ...l, ...patch } : l) };
    }));
  };

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleToggleLot = async (contractId, lotId, currentActive) => {
    const key = contractId + '|' + lotId;
    const contract = archContracts.find(c => c.contractId === contractId);
    const activeLots = (contract?.lots || []).filter(l => l.active !== false && !l.deleted);
    if (currentActive && activeLots.length <= 1) {
      setMsg({ type: 'error', text: 'Deve rimanere almeno un Lotto attivo.' });
      return;
    }
    // Aggiornamento ottimistico immediato
    updateLotLocal(contractId, lotId, { active: !currentActive });
    setToggling(prev => ({ ...prev, [key]: true }));
    try {
      await updateConfiguratoreLot(contractId, lotId, { active: !currentActive });
    } catch (e) {
      // Rollback in caso di errore
      updateLotLocal(contractId, lotId, { active: currentActive });
      setMsg({ type: 'error', text: 'Errore: ' + (e.message || '') });
    } finally {
      setToggling(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleDeleteLot = async (contractId, lotId) => {
    const contract = archContracts.find(c => c.contractId === contractId);
    const visible = (contract?.lots || []).filter(l => !l.deleted);
    if (visible.length <= 1) {
      setMsg({ type: 'error', text: 'Non puoi eliminare l\'unico Lotto.' });
      return;
    }
    if (!window.confirm('Eliminare il Lotto ' + lotId + ' dal contratto?')) return;
    // Aggiornamento ottimistico immediato
    updateLotLocal(contractId, lotId, { deleted: true, active: false });
    try {
      await updateConfiguratoreLot(contractId, lotId, { deleted: true, active: false });
    } catch (e) {
      // Rollback
      updateLotLocal(contractId, lotId, { deleted: false, active: true });
      setMsg({ type: 'error', text: 'Errore eliminazione lotto: ' + (e.message || '') });
    }
  };

  const handleDeleteContract = async (contractId) => {
    if (!window.confirm('Eliminare questa configurazione contrattuale?')) return;
    try {
      await deleteConfiguratoreContract(contractId);
      setContracts(prev => prev.filter(c => c.contractId !== contractId));
      setMsg({ type: 'ok', text: 'Contratto eliminato.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore eliminazione: ' + (e.message || '') });
    }
  };

  const handleSaveLotCode = async (contractId, lotId) => {
    const key = contractId + '|' + lotId;
    const env = ambienti.find(a => a.id === parseInt(lotEnvSel[key], 10));
    const finalCode = env ? env.codiceContratto : (lotCodes[key] || '').trim();
    setSavingLot(prev => ({ ...prev, [key]: true }));
    try {
      await updateConfiguratoreLot(contractId, lotId, { codiceContratto: finalCode });
      setMsg({ type: 'ok', text: 'Codice Contratto salvato per Lotto ' + lotId });
      await loadContracts();
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore salvataggio: ' + (e.message || '') });
    } finally {
      setSavingLot(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleShowSummary = (contract) => {
    const visibleLots = (contract.lots || []).filter(l => !l.deleted);
    if (!visibleLots.length) return;
    setSumCon(contract);
    setSumLot(visibleLots[0].lotId);
    setView('summary');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImport = async (e) => {
    e.preventDefault();
    const count = Math.max(1, Math.min(6, ncLots));
    for (let i = 1; i <= count; i++) {
      const id = String(i);
      if (!ncLotFiles[id]?.priceFile) {
        setMsg({ type: 'error', text: 'Lotto ' + id + ': file Listino TOW obbligatorio.' });
        return;
      }
    }
    setNcSaving(true);
    setMsg({ type: '', text: '' });
    try {
      const contractId = 'contract-' + Date.now();
      const lots = Array.from({ length: count }, (_, i) => ({
        lotId: String(i + 1),
        name: (ncLotNames[String(i + 1)] || 'Lotto ' + String(i + 1)).trim(),
        tow5Share: ncLotShares[String(i + 1)] ?? 65,
        catalogFile: ncLotFiles[String(i + 1)]?.catalogFile || null,
        priceFile: ncLotFiles[String(i + 1)]?.priceFile,
      }));
      const result = await importConfiguratoreContract({
        contractId, name: ncName.trim(), rulesFile: ncRulesFile || null, lots,
      });
      const warnings = result.warnings?.length ? ' Avvisi: ' + result.warnings.join('; ') : '';
      setMsg({ type: warnings ? 'error' : 'ok', text: result.message + warnings });
      setNcName(''); setNcLots(2); setNcLotNames({}); setNcLotFiles({}); setNcLotShares({}); setNcRules(null);
      setShowForm(false);
      await loadContracts();
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore importazione: ' + (e.message || '') });
    } finally {
      setNcSaving(false);
    }
  };

  // ── View: SINTESI ─────────────────────────────────────────────────────────
  if (view === 'summary' && summaryContract) {
    return (
      <ContractSummaryView
        contract={summaryContract}
        lotId={summaryLotId}
        onLotChange={setSumLot}
        onBack={() => { setView('contracts'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
      />
    );
  }

  // ── View: LISTA CONTRATTI ─────────────────────────────────────────────────
  const lotCount = Math.max(1, Math.min(6, ncLots));

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.sectionHead}>
        <div>
          <p style={S.eyebrow}>Archivio configurazioni</p>
          <h1 style={S.h1}>Seleziona o configura un contratto</h1>
          <p style={S.muted}>Cataloghi, prezzi e regole vengono mantenuti separati per ciascun Lotto.</p>
        </div>
        <button style={S.btnPrimary} onClick={() => setShowForm(f => !f)}>
          {showForm ? 'Annulla' : 'Nuovo contratto'}
        </button>
      </div>

      {/* Messaggio */}
      {archMsg.text && (
        <div style={archMsg.type === 'ok' ? S.msgOk : S.msgErr}>{archMsg.text}</div>
      )}

      {/* ── Form nuovo contratto ── */}
      {showForm && (
        <div style={S.contractForm}>
          <form onSubmit={handleImport}>
            <div style={S.sectionHead}>
              <div>
                <p style={S.eyebrow}>Nuova configurazione</p>
                <h2 style={S.h2}>Dati e documenti del contratto</h2>
              </div>
              <button type="button" style={S.btnGhost} onClick={() => setShowForm(false)}>Annulla</button>
            </div>

            {/* Campi principali */}
            <div style={S.mainFields}>
              <label style={S.labelStyle}>
                Nome del contratto
                <input required value={ncName} onChange={e => setNcName(e.target.value)}
                  placeholder="es. Contratto Logistica 2027" style={S.inputStyle} />
              </label>
              <label style={S.labelStyle}>
                Capitolato tecnico PDF
                <input type="file" accept=".pdf,application/pdf"
                  onChange={e => setNcRules(e.target.files[0] || null)} style={S.inputStyle} />
              </label>
              <label style={S.labelStyle}>
                Numero di Lotti
                <input type="number" required min={1} max={6} value={ncLots}
                  onChange={e => setNcLots(Math.max(1, Math.min(6, parseInt(e.target.value) || 1)))}
                  style={S.inputStyle} />
              </label>
            </div>

            {/* Lotti */}
            <div>
              {Array.from({ length: lotCount }, (_, i) => String(i + 1)).map(id => (
                <div key={id} style={S.lotSection}>
                  <h3 style={{ margin: '0 0 12px', color: '#102a47' }}>Lotto {id}</h3>
                  <div style={S.lotGrid}>
                    <label style={S.labelStyle}>
                      Nome del Lotto
                      <input value={ncLotNames[id] || ''}
                        onChange={e => setNcLotNames(p => ({ ...p, [id]: e.target.value }))}
                        placeholder={'Lotto ' + id} style={S.inputStyle} />
                    </label>
                    <label style={S.labelStyle}>
                      Catalogo software PDF
                      <input type="file" accept=".pdf,application/pdf"
                        onChange={e => setNcLotFiles(p => ({ ...p, [id]: { ...p[id], catalogFile: e.target.files[0] || null } }))}
                        style={S.inputStyle} />
                      {ncLotFiles[id]?.catalogFile && (
                        <span style={{ fontSize: 11, color: '#008b72', display: 'block', marginTop: 3 }}>
                          {ncLotFiles[id].catalogFile.name}
                        </span>
                      )}
                    </label>
                    <label style={S.labelStyle}>
                      Listino TOW / economico
                      <input required type="file"
                        accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={e => setNcLotFiles(p => ({ ...p, [id]: { ...p[id], priceFile: e.target.files[0] || null } }))}
                        style={{ ...S.inputStyle, borderColor: ncLotFiles[id]?.priceFile ? '#bdc9d4' : '#e8a09a' }} />
                      {ncLotFiles[id]?.priceFile && (
                        <span style={{ fontSize: 11, color: '#008b72', display: 'block', marginTop: 3 }}>
                          {ncLotFiles[id].priceFile.name}
                        </span>
                      )}
                    </label>
                    <label style={S.labelStyle}>
                      TOW .5 %
                      <input type="number" min={0} max={100} step={0.01}
                        value={ncLotShares[id] ?? 65}
                        onChange={e => setNcLotShares(p => ({ ...p, [id]: parseFloat(e.target.value) || 65 }))}
                        style={S.inputStyle} />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div style={S.hint}>
              <strong>File economico:</strong> usa un Excel contenente il listino TOW. Il catalogo PDF deve avere ID, ambito, nome componente, complessità e prezzi.
            </div>
            <div style={S.panelActions}>
              <button type="submit" style={S.btnPrimary} disabled={ncSaving || !ncName.trim()}>
                {ncSaving ? 'Elaborazione documenti…' : 'Importa e salva contratto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Lista contratti ── */}
      {archLoading && archContracts.length === 0
        ? <p style={{ color: '#667482' }}>Caricamento contratti...</p>
        : archContracts.length === 0
          ? <p style={{ color: '#667482' }}>Nessun contratto nell'archivio.</p>
          : (
            <div style={S.contractList}>
              {archContracts.map(c => {
                const visible = (c.lots || []).filter(l => !l.deleted);
                const active = visible.filter(l => l.active !== false);
                const isExpanded = expandedCon === c.contractId;
                return (
                  <article key={c.contractId} style={S.contractCard}>
                    {/* Intestazione */}
                    <div>
                      <p style={S.eyebrow}>{c.builtin ? 'Configurazione iniziale' : 'Configurazione locale'}</p>
                      <h2 style={{ ...S.h2, marginTop: 2 }}>{c.name || c.contractId}</h2>
                      <p style={S.muted}>{c.rulesFile || 'Capitolato non indicato'}</p>
                    </div>

                    {/* Lotti */}
                    <div style={S.lotManager}>
                      {visible.map(l => {
                        const isActive = l.active !== false;
                        const key = c.contractId + '|' + l.lotId;
                        return (
                          <div key={l.lotId} style={{ ...S.lotRow, ...(isActive ? {} : S.lotRowInactive) }}>
                            <div>
                              <strong style={{ display: 'block', fontSize: 13, color: '#102a47' }}>Lotto {l.lotId}</strong>
                              <span style={{ display: 'block', color: '#667482', fontSize: 12 }}>{l.name}</span>
                            </div>
                            <span style={{ ...S.lotStatus, color: isActive ? '#006b57' : '#667482' }}>
                              {isActive ? 'Attivo' : 'Disattivato'}
                            </span>
                            <button
                              style={{ ...S.btnGhost, ...S.btnCompact }}
                              disabled={!!togglingLot[key]}
                              onClick={() => handleToggleLot(c.contractId, l.lotId, isActive)}>
                              {togglingLot[key] ? '...' : isActive ? 'Disattiva' : 'Riattiva'}
                            </button>
                            <button
                              style={{ ...S.btnGhost, ...S.btnCompact, ...S.btnDanger }}
                              onClick={() => handleDeleteLot(c.contractId, l.lotId)}>
                              Elimina
                            </button>
                          </div>
                        );
                      })}
                    </div>

                    {/* Azioni */}
                    <div style={S.cardActions}>
                      <button
                        style={{ ...S.btnPrimary, ...(active.length === 0 ? S.btnDisabled : {}) }}
                        disabled={active.length === 0}
                        onClick={() => setExpanded(isExpanded ? null : c.contractId)}>
                        {isExpanded ? 'Chiudi' : 'Usa contratto'}
                      </button>
                      <button
                        style={{ ...S.btnGhost, ...(visible.length === 0 ? S.btnDisabled : {}) }}
                        disabled={visible.length === 0}
                        onClick={() => handleShowSummary(c)}>
                        Sintesi contratto
                      </button>
                      {!c.builtin && (
                        <button style={S.btnGhost} onClick={() => handleDeleteContract(c.contractId)}>
                          Elimina contratto
                        </button>
                      )}
                    </div>

                    {/* Pannello associazione Codice MEV */}
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #d8e0e8', paddingTop: 12, display: 'grid', gap: 10 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#334456' }}>
                          Associa Codice Contratto MEV per Lotto
                        </p>
                        {active.map(l => {
                          const key = c.contractId + '|' + l.lotId;
                          return (
                            <div key={l.lotId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ width: 60, fontSize: 13, fontWeight: 700, color: '#102a47' }}>Lotto {l.lotId}</span>
                              <span style={{ width: 120, fontSize: 12, color: '#667482' }}>{l.name}</span>
                              <select
                                value={lotEnvSel[key] || ''}
                                onChange={e => {
                                  const env = ambienti.find(a => a.id === parseInt(e.target.value, 10));
                                  setLotEnvSel(p => ({ ...p, [key]: e.target.value }));
                                  setLotCodes(p => ({ ...p, [key]: env ? env.codiceContratto : '' }));
                                }}
                                style={{ padding: '6px 8px', border: '1px solid #bdc9d4', borderRadius: 6, fontSize: 12, maxWidth: 220, font: 'inherit' }}>
                                <option value="">-- scegli contratto MEV --</option>
                                {ambienti.map(a => (
                                  <option key={a.id} value={a.id}>{a.codiceContratto} — {a.descrizione}</option>
                                ))}
                              </select>
                              <input
                                value={lotCodes[key] || ''}
                                onChange={e => setLotCodes(p => ({ ...p, [key]: e.target.value }))}
                                placeholder="Codice contratto"
                                style={{ padding: '6px 8px', border: '1px solid #bdc9d4', borderRadius: 6, fontSize: 12, width: 150, font: 'inherit' }} />
                              <button
                                style={{ ...S.btnGhost, ...S.btnCompact, background: '#1c4e80', color: '#fff', border: 'none', opacity: savingLot[key] ? 0.7 : 1 }}
                                disabled={!!savingLot[key]}
                                onClick={() => handleSaveLotCode(c.contractId, l.lotId)}>
                                {savingLot[key] ? '...' : 'Salva'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )
      }
    </div>
  );
}
