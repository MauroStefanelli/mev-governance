import React, { useState, useEffect } from 'react';
import './contractArchive.css';
import ContractMembers from '../components/contracts/ContractMembers';
import {
  getConfiguratoreContracts,
  updateConfiguratoreLot,
  deleteConfiguratoreContract,
  importConfiguratoreContract,
  uploadConfiguratoreContractLot,
  getGare,
  importaGaraComContratto,
} from '../services/mevService';
import { CONTRACT_SUMMARIES } from '../configuratore/contractSummaries';

const euro = new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' });

// ── Stili allineati a ConfiguratorePage ───────────────────────────────────
const S = {
  page: { padding: 'clamp(12px,3vw,32px)', fontFamily: 'inherit', background: '#f4f7fb', color: '#172b4d', lineHeight: 1.5, minWidth: 0, maxWidth: 1440, margin: '0 auto', boxSizing: 'border-box', overflowWrap: 'anywhere' },
  card: { background: '#fff', border: '1px solid #dce5ef', borderRadius: 16, padding: 'clamp(14px,2vw,24px)', marginBottom: 20, minWidth: 0, boxSizing: 'border-box', boxShadow: '0 3px 14px rgba(24,48,78,0.04)' },
  sectionHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 },
  eyebrow: { margin: 0, color: '#1a73e8', fontSize: 11, textTransform: 'uppercase', letterSpacing: '.12em', fontWeight: 800 },
  h1: { fontSize: 'clamp(22px,3vw,30px)', lineHeight: 1.15, margin: '2px 0 0', color: '#172b4d', fontWeight: 750, letterSpacing: '-0.7px' },
  h2: { fontSize: 18, color: '#172b4d', margin: 0, fontWeight: 700 },
  muted: { color: '#52657d', margin: '.3rem 0 0', fontSize: 13 },
  // Bottoni
  btnPrimary: { minHeight: 44, padding: '10px 16px', borderRadius: 9, border: '1px solid #174ea6', background: '#174ea6', color: '#fff', fontWeight: 600, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  btnGhost: { minHeight: 44, padding: '10px 16px', borderRadius: 9, border: '1px solid #bac8da', background: '#fff', color: '#29415e', fontWeight: 500, fontSize: 13, fontFamily: 'inherit', cursor: 'pointer' },
  btnCompact: { minHeight: 36, padding: '6px 12px', fontSize: 12 },
  btnDanger: { minHeight: 36, padding: '6px 12px', borderRadius: 9, border: '1px solid #f1b9c0', background: '#fff1f2', color: '#a81832', fontSize: 12, fontFamily: 'inherit', cursor: 'pointer' },
  btnDisabled: { opacity: 0.45, cursor: 'not-allowed' },
  // Lista contratti
  contractList: { display: 'grid', alignItems: 'start', gridTemplateColumns: 'repeat(auto-fill,minmax(min(100%,440px),1fr))', gap: 16, marginTop: 0 },
  contractCard: { background: '#fff', border: '1px solid #dce5ef', borderRadius: 20, padding: 'clamp(16px,2vw,24px)', display: 'grid', gap: 20, boxShadow: '0 6px 24px rgba(24,48,78,0.05)', minWidth: 0 },
  // Lotti
  lotManager: { display: 'grid', gap: 12, minWidth: 0 },
  lotRow: { display: 'grid', gap: 14, minWidth: 0, padding: 16, background: '#f7faff', border: '1px solid #dae5f3', borderRadius: 14 },
  lotRowInactive: { borderColor: '#e2e8f0', background: '#f8f9fb' },
  lotStatus: { padding: '3px 9px', borderRadius: 999, background: '#fff', fontSize: 11, fontWeight: 700, border: '1px solid #dce5ef' },
  cardActions: { display: 'flex', gap: 10, flexWrap: 'wrap', borderTop: '1px solid #e7edf5', paddingTop: 18 },
  // Form
  contractForm: { marginTop: 0 },
  mainFields: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,200px),1fr))', gap: 16, marginBottom: 16 },
  lotSection: { padding: 16, background: '#f4f7fb', borderRadius: 10, marginBottom: 12, border: '1px solid #dce5ef' },
  lotGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 12, marginTop: 10 },
  labelStyle: { minWidth: 0, fontWeight: 500, fontSize: 13, color: '#40536d', display: 'flex', flexDirection: 'column', gap: 4 },
  inputStyle: { padding: '10px 12px', minHeight: 42, minWidth: 0, maxWidth: '100%', boxSizing: 'border-box', borderRadius: 9, border: '1px solid #bac8da', background: '#fff', color: '#172b4d', fontSize: 14, fontFamily: 'inherit', marginTop: 4 },
  hint: { marginTop: 14, background: '#f0f7ff', borderLeft: '4px solid #1a73e8', padding: '12px 14px', color: '#1e40af', fontSize: 13, borderRadius: '0 8px 8px 0' },
  panelActions: { display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10, marginTop: 20, paddingTop: 16, borderTop: '1px solid #dce5ef' },
  // Summary page
  summaryPage: { fontFamily: 'inherit', color: '#172b4d', lineHeight: 1.6, padding: 'clamp(12px,3vw,32px)', background: '#f4f7fb', minWidth: 0, maxWidth: 1440, margin: '0 auto', boxSizing: 'border-box', overflowWrap: 'anywhere' },
  lotTabs: { display: 'flex', flexWrap: 'wrap', maxWidth: '100%', boxSizing: 'border-box', background: '#fff', padding: 6, borderRadius: 14, width: 'fit-content', marginBottom: 20, border: '1px solid #dce5ef', gap: 4 },
  lotTab: { minHeight: 44, border: 0, background: 'transparent', padding: '9px 18px', borderRadius: 9, fontWeight: 600, color: '#52657d', cursor: 'pointer', fontFamily: 'inherit', fontSize: 13 },
  lotTabActive: { background: '#174ea6', color: '#fff', boxShadow: '0 3px 8px rgba(23,78,166,.16)' },
  summaryHero: { display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'center', padding: 'clamp(20px,3vw,32px)', background: 'linear-gradient(120deg,#102a47,#174ea6)', borderRadius: 20, color: '#fff', marginBottom: 24 },
  summaryHeroText: { margin: 0, maxWidth: 900, fontSize: 14, lineHeight: 1.6 },
  summaryStat: { minWidth: 140, padding: 16, borderRadius: 10, background: 'rgba(255,255,255,.13)', textAlign: 'center' },
  summaryGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,280px),1fr))', gap: 16, margin: '16px 0' },
  summaryCard: { minWidth: 0, background: '#fff', border: '1px solid #dce5ef', borderRadius: 12, padding: 20, boxShadow: '0 2px 8px rgba(24,48,78,0.04)' },
  summarySection: { minWidth: 0, background: '#fff', border: '1px solid #dce5ef', borderRadius: 12, padding: 20, margin: '16px 0', boxShadow: '0 2px 8px rgba(24,48,78,0.04)' },
  summaryNote: { margin: '14px 0 0', padding: '12px 14px', background: '#f0f7ff', borderLeft: '4px solid #1a73e8', fontSize: 13, color: '#1e40af', borderRadius: '0 8px 8px 0' },
  summaryAccordions: { display: 'grid', gap: 8 },
  summaryDetails: { border: '1px solid #dce5ef', borderRadius: 10, background: '#f8fafc' },
  checklistGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,260px),1fr))', gap: 8 },
  checklistItem: { display: 'flex', gap: 10, padding: '12px 14px', background: '#f0f7ff', borderRadius: 10, border: '1px solid #bfdbfe' },
  checklistMark: { display: 'grid', placeItems: 'center', flex: '0 0 26px', height: 26, borderRadius: '50%', background: '#1a73e8', color: '#fff', fontWeight: 900, fontSize: 14 },
  msgOk: { padding: '10px 14px', borderRadius: 9, fontSize: 13, background: '#dcfce7', color: '#166534', fontWeight: 600, marginBottom: 16, border: '1px solid #bbf7d0' },
  msgErr: { padding: '10px 14px', borderRadius: 9, fontSize: 13, background: '#fdecec', color: '#b00020', fontWeight: 600, marginBottom: 16, border: '1px solid #fecaca' },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 400, lineHeight: 1.6, fontVariantNumeric: 'tabular-nums' },
  thead: { background: '#edf2f8', color: '#40536d' },
};

function SummaryTable({ headers, rows }) {
  return (
    <div role="region" aria-label="Tabella di sintesi contrattuale" tabIndex={0} style={{ maxWidth: '100%', overflowX: 'auto', border: '1px solid #dce5ef', borderRadius: 10, marginBottom: 0 }}>
      <table style={S.table}>
        <thead>
          <tr>{headers.map(h => (
            <th scope="col" key={h} style={{ ...S.thead, textAlign: 'left', padding: '11px 12px', fontSize: 13 }}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} style={{ background: i % 2 === 1 ? '#f7f9fb' : '#fff' }}>
              {row.map((cell, j) => (
                <td key={j} style={{ padding: '10px 12px', borderBottom: '1px solid #eef2f5', fontSize: 14, verticalAlign: 'middle' }}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Modale dati lotto (Catalogo / Quadro TOW) ────────────────────────────────
function LotDataModal({ modal, onClose, onSaveTowImpact }) {
  const [impact, setImpact] = React.useState({});
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [error, setError] = React.useState('');
  const dialogRef = React.useRef(null);
  React.useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement;
    dialogRef.current?.showModal();
    return () => previous?.focus();
  }, [!!modal]); // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (modal?.type === 'tow') {
      // Inizializza % impatto dal DB (towImpact già salvato) o da 0
      const init = {};
      (modal.data || []).forEach(row => {
        const towKey = row[0]; // es. "TOW01.1"
        const suffix = towKey?.split('.')[1]; // "1","2",...
        if (suffix && ['1','3','4'].includes(suffix))
          init[suffix] = modal.towImpact?.[suffix] ?? '';
      });
      setImpact(init);
      setSaved(false); setError('');
    }
  }, [modal]);

  if (!modal) return null;

  const overlay = {
    position: 'fixed', inset: 0, background: 'rgba(16,42,71,.5)', zIndex: 1200,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 'clamp(8px,2vw,24px)', boxSizing: 'border-box',
  };
  const box = {
    background: '#fff', borderRadius: 16, boxShadow: '0 8px 40px rgba(16,42,71,.22)',
    maxWidth: 1000, minWidth: 0, width: '100%', maxHeight: '90dvh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
  };
  const head = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    gap: 16, padding: '18px clamp(16px,3vw,28px)', borderBottom: '1px solid #dce5ef',
  };
  const body = { overflowY: 'auto', padding: 'clamp(12px,3vw,28px)', minHeight: 0, flex: 1 };

  const hasImpactRows = modal.type === 'tow' && (modal.data || []).some(row => ['1','3','4'].includes(row[0]?.split?.('.')?.[1]));

  const handleSave = async () => {
    if (Object.values(impact).some(v => v !== '' && (!Number.isFinite(Number(v)) || Number(v) < 0 || Number(v) > 100))) { setError('Le percentuali devono essere comprese tra 0 e 100.'); return; }
    setSaving(true); setError('');
    try {
      await onSaveTowImpact(modal.contractId, modal.lotId, impact);
      setSaved(true);
    } catch (e) { setError(e.message || 'Impossibile salvare le percentuali.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={overlay} onClick={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <dialog ref={dialogRef} aria-label={modal.title} style={{ ...box, padding: 0, border: 0 }} onCancel={e => { e.preventDefault(); if (!saving) onClose(); }}>
        <div style={head}>
          <div>
            <p style={{ margin: 0, color: '#1a73e8', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.1em' }}>
              {modal.type === 'catalog' ? 'Voci di catalogo' : 'Quadro TOW'}
            </p>
            <h2 style={{ margin: '2px 0 0', fontSize: 18, color: '#172b4d', fontWeight: 700 }}>{modal.title}</h2>
          </div>
          <button aria-label="Chiudi dettaglio lotto" disabled={saving} onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 22, cursor: 'pointer', color: '#64748b', lineHeight: 1, padding: 8, minWidth: 44, minHeight: 44, borderRadius: 10 }}>×</button>
        </div>
        <div style={body}>
          {error && <p className="ca-error" role="alert">{error}</p>}
          {modal.type === 'catalog' && (
            <div role="region" aria-label="Dati del lotto" tabIndex={0} style={{ overflowX: 'auto', border: '1px solid #dce5ef', borderRadius: 12 }}>
              <table style={{ ...S.table, fontSize: 13, minWidth: 950 }}>
                <thead>
                  <tr>
                    {['ID', 'Ambito', 'Nome componente'].map(h => <th rowSpan={2} scope="col" key={h} style={{ ...S.thead, padding: '12px 14px', textAlign: 'left' }}>{h}</th>)}
                    {["Base d’asta REALIZZAZIONE", "Base d’asta MODIFICA"].map(h => <th colSpan={3} scope="colgroup" key={h} style={{ ...S.thead, padding: '12px 14px' }}>{h}</th>)}
                  </tr>
                  <tr>{['Realizzazione', 'Modifica'].flatMap(type => ['Semplice', 'Medio', 'Complesso'].map(f => <th scope="col" key={`${type}-${f}`} style={{ ...S.thead, padding: '12px 14px' }}>{f} (€)</th>))}</tr>
                </thead>
                <tbody>
                  {(modal.data || []).map((v, i) => {
                    const pr = v.prezzi || {};
                    const prices = { Realizzazione: pr.REALIZZAZIONE || pr.Realizzazione || pr.realizzazione || {}, Modifica: pr.MODIFICA || pr.Modifica || pr.modifica || {} };
                    return (
                      <tr key={i} style={{ background: i % 2 === 1 ? '#f7f9fb' : '#fff' }}>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5', fontWeight: 700, whiteSpace: 'nowrap' }}>{v.id}</td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5', color: '#475569' }}>{v.ambito}</td>
                        <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5' }}>{v.nome}</td>
                        {['Realizzazione', 'Modifica'].flatMap(type => ['Semplice', 'Medio', 'Complesso'].map(f => {
                          const value = prices[type][f] ?? prices[type][f.toLowerCase()] ?? v[`prezzo${type}${f}`];
                          return <td key={`${type}-${f}`} style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5', textAlign: 'right', whiteSpace: 'nowrap' }}>{value != null ? euro.format(value) : '–'}</td>;
                        }))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {(!modal.data || modal.data.length === 0) && (
                <p style={{ color: '#64748b', padding: 16 }}>Nessuna voce disponibile.</p>
              )}
            </div>
          )}
          {modal.type === 'tow' && (
            <>
              <div role="region" aria-label="Dati del lotto" tabIndex={0} style={{ overflowX: 'auto', border: '1px solid #dce5ef', borderRadius: 12 }}>
                <table style={{ ...S.table, fontSize: 13, minWidth: 560 }}>
                  <thead>
                    <tr>
                      {['TOW', 'Ambito', modal.valueKind === 'price' ? 'Prezzo unitario' : 'Quantità contrattuale', 'Peso %', '% Impatto (Configuratore)'].map(h => (
                        <th scope="col" key={h} style={{ ...S.thead, padding: '12px 14px', textAlign: 'left', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(modal.data || []).map((row, i) => {
                      const towKey = row[0];
                      const suffix = towKey?.split?.('.')?.[1];
                      const autoTow = ['1','3','4'].includes(suffix);
                      return (
                        <tr key={i} style={{ background: i % 2 === 1 ? '#f7f9fb' : '#fff' }}>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5', fontWeight: 700, whiteSpace: 'nowrap' }}>{row[0]}</td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5', color: '#475569' }}>{row[1]}</td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5' }}>{row[2]}</td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5', textAlign: 'right', fontWeight: 600 }}>{row[3]}</td>
                          <td style={{ padding: '12px 14px', borderBottom: '1px solid #eef2f5', textAlign: 'center' }}>
                            {autoTow ? (
                              <input
                                type="number" min={0} max={100} step={0.01}
                                value={impact[suffix] ?? ''}
                                onChange={e => setImpact(p => ({ ...p, [suffix]: e.target.value === '' ? '' : Number(e.target.value) }))}
                                placeholder="0"
                                aria-label={`Percentuale impatto ${towKey}`}
                                style={{ minHeight: 42, boxSizing: 'border-box', width: 88, border: '1px solid #bac8da', borderRadius: 7, padding: '5px 8px', fontSize: 13, textAlign: 'right', fontFamily: 'inherit' }}
                              />
                            ) : (
                              <span style={{ color: '#94a3b8', fontSize: 11 }}>–</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hasImpactRows && (
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    style={{ ...S.btnPrimary, opacity: saving ? 0.7 : 1 }}>
                    {saving ? 'Salvataggio…' : 'Salva % impatto'}
                  </button>
                  {saved && <span role="status" style={{ color: '#166534', fontWeight: 700, fontSize: 13 }}>Salvato — il Configuratore userà questi valori come default</span>}
                  <span style={{ color: '#64748b', fontSize: 12 }}>I valori si applicano ai TOW automatici (TOWxx.1, TOWxx.3, TOWxx.4) nel Configuratore Offerta.</span>
                </div>
              )}
            </>
          )}
        </div>
      </dialog>
    </div>
  );
}

// ── Pagina Sintesi Contratto ───────────────────────────────────────────────
function ContractSummaryView({ contract, lotId, onLotChange, onBack }) {
  const summary = CONTRACT_SUMMARIES[contract.contractId];
  const visibleLots = (contract.lots || []).filter(l => !l.deleted);
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
        <button style={S.btnGhost} onClick={onBack}>← Torna ai contratti</button>
      </div>

      {/* Tab lotti — visibili solo se il contratto ha più di un lotto */}
      {visibleLots.length > 1 && (
        <div aria-label="Selezione lotto" style={S.lotTabs}>
          {visibleLots.map(l => (
            <button aria-pressed={l.lotId === lotId} key={l.lotId}
              style={{ ...S.lotTab, ...(l.lotId === lotId ? S.lotTabActive : {}) }}
              onClick={() => onLotChange(l.lotId)}>
              Lotto {l.lotId}
            </button>
          ))}
        </div>
      )}

      {lotSummary && common ? (
        <div>
          {/* Hero */}
          <div style={S.summaryHero}>
            <div style={{ flex: '1 1 360px', minWidth: 0 }}>
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
                  <ul style={{ margin: 0, padding: '0 20px 15px 36px', columnWidth: 260, columnCount: 2 }}>
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
            <div style={{ flex: '1 1 360px', minWidth: 0 }}>
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
export default function ContractArchivePage({ ambienti = [], allUsers = [] }) {
  const archiveRef = React.useRef(null);
  const [search, setSearch] = useState('');
  const [contractOrder, setContractOrder] = useState(() => {
    try { const order = JSON.parse(localStorage.getItem('mev-contract-archive-order') || '[]'); return Array.isArray(order) ? order.filter(id => typeof id === 'string') : []; } catch { return []; }
  });
  const draggedContract = React.useRef(null);
  const [dragTarget, setDragTarget] = useState(null);
  const [orderNotice, setOrderNotice] = useState('');
  const [filter, setFilter] = useState('all');
  const [selectedId, setSelectedId] = useState(null);
  const [section, setSection] = useState('lots');
  const [memberEnv, setMemberEnv] = useState('');
  const [view, setView]               = useState('contracts');
  useEffect(() => {
    const archive = archiveRef.current;
    const summary = archive?.querySelector('.ca-fixed-summary');
    if (!summary) return;
    const navigation = archive.closest('.ca-admin-shell')?.querySelector('.ca-area-nav');
    const updateHeight = () => {
      archive.style.setProperty('--ca-summary-height', `${summary.getBoundingClientRect().height}px`);
      archive.style.setProperty('--ca-nav-height', `${navigation?.getBoundingClientRect().height || 0}px`);
    };
    updateHeight();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(updateHeight);
    observer.observe(summary);
    if (navigation) observer.observe(navigation);
    return () => observer.disconnect();
  }, [view]);
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

  // Modale importa da gara
  const [showGaraModal, setShowGaraModal] = useState(false);
  const [garaError, setGaraError] = useState('');
  const garaDialog = React.useRef(null);
  useEffect(() => {
    if (!showGaraModal) return;
    const previous = document.activeElement;
    garaDialog.current?.showModal();
    return () => previous?.focus();
  }, [showGaraModal]);
  const [gareList, setGareList]           = useState([]);
  const [gareLoading, setGareLoading]     = useState(false);
  const [garaSelected, setGaraSelected]   = useState(null);
  const [garaImporting, setGaraImporting] = useState(false);

  // Lotti — toggle / codice MEV
  const [deleting, setDeleting] = useState(false);
  const [togglingLot, setToggling]    = useState({});
  const [lotCodes, setLotCodes]       = useState({});
  const [lotEnvSel, setLotEnvSel]     = useState({});
  const [savingLot, setSavingLot]     = useState({});

  // Stato per aggiornamento file su lotto esistente
  // { "contractId|lotId": { catalogFile?, priceFile?, tow5Share?, uploading } }
  const [lotUpload, setLotUpload]     = useState({});

  // Modale visualizzazione catalogo / quadro TOW
  const [modal, setModal] = useState(null); // { type:'catalog'|'tow', title, data, contractId, lotId, towImpact }

  // Salva % impatto TOW nel payload del lotto
  const handleSaveTowImpact = async (contractId, lotId, impact) => {
    // Filtra valori vuoti
    const clean = {};
    Object.entries(impact).forEach(([k, v]) => { if (v !== '' && v !== null) clean[k] = Number(v); });
    await updateConfiguratoreLot(contractId, lotId, { towImpact: clean });
    // Aggiorna lo stato locale
    setContracts(prev => prev.map(c => {
      if (c.contractId !== contractId) return c;
      return { ...c, lots: (c.lots || []).map(l => l.lotId === lotId ? { ...l, towImpact: clean } : l) };
    }));
    // Aggiorna anche il modal con i nuovi valori
    setModal(m => m ? { ...m, towImpact: clean } : m);
  };

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
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore caricamento: ' + (e.message || '') });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadContracts(); }, []); // eslint-disable-line

  // Apre il modale e carica le gare disponibili
  const handleOpenGaraModal = async () => {
    setGaraSelected(null);
    setShowGaraModal(true);
    setGareLoading(true); setGaraError('');
    try {
      const records = await getGare();
      // Filtra solo gare che hanno almeno un lotto con capitolato analizzato
      const garaConLotti = records.filter(g => g.capitolato?.lotti?.length > 0);
      setGareList(garaConLotti);
    } catch (e) {
      setGaraError(e.message || 'Impossibile caricare le gare.');
      setGareList([]);
    } finally {
      setGareLoading(false);
    }
  };

  // Importa la gara selezionata come contratto completo (TOW + catalogo inclusi)
  const handleApplicaGara = async (gara) => {
    setGaraImporting(true);
    setMsg({ type: '', text: '' });
    try {
      const contractId   = 'contract-' + Date.now();
      const contractName = gara.capitolato?.titolo || gara.nome || 'Contratto da gara';
      const result = await importaGaraComContratto({ garaId: gara.id, contractId, contractName });
      const avvisi = result.warnings?.length ? ' Avvisi: ' + result.warnings.join('; ') : '';
      setMsg({ type: avvisi ? 'error' : 'ok', text: result.message + avvisi });
      setShowGaraModal(false);
      await loadContracts();
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore import da gara: ' + (e.message || '') });
    } finally {
      setGaraImporting(false);
    }
  };

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
    if (visible.length <= 1 || (contract.lots.filter(l => !l.deleted && l.active !== false).length <= 1 && contract.lots.find(l => l.lotId === lotId)?.active !== false)) {
      setMsg({ type: 'error', text: 'Non puoi eliminare l’ultimo lotto o l’ultimo lotto attivo.' });
      return;
    }
    if (!window.confirm('Eliminare il Lotto ' + lotId + ' dal contratto?')) return;
    setDeleting(true);
    try {
      await updateConfiguratoreLot(contractId, lotId, { deleted: true, active: false });
      updateLotLocal(contractId, lotId, { deleted: true, active: false });
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore eliminazione lotto: ' + (e.message || '') });
    } finally { setDeleting(false); }
  };

  const handleDeleteContract = async (contractId) => {
    if (!window.confirm('Eliminare questa configurazione contrattuale?')) return;
    setDeleting(true);
    try {
      await deleteConfiguratoreContract(contractId);
      setContracts(prev => prev.filter(c => c.contractId !== contractId));
      setMsg({ type: 'ok', text: 'Contratto eliminato.' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore eliminazione: ' + (e.message || '') });
    } finally { setDeleting(false); }
  };

  const handleSaveLotCode = async (contractId, lotId) => {
    const key = contractId + '|' + lotId;
    const env = ambienti.find(a => a.id === parseInt(lotEnvSel[key], 10));
    const finalCode = env ? env.codiceContratto : (lotCodes[key] || '').trim();
    setSavingLot(prev => ({ ...prev, [key]: true }));
    try {
      await updateConfiguratoreLot(contractId, lotId, { codiceContratto: finalCode });
      setMsg({ type: 'ok', text: 'Codice Contratto salvato per Lotto ' + lotId });
      updateLotLocal(contractId, lotId, { codiceContratto: finalCode });
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore salvataggio: ' + (e.message || '') });
    } finally {
      setSavingLot(prev => ({ ...prev, [key]: false }));
    }
  };

  const handleUploadLotFiles = async (contract, lot) => {
    const key = contract.contractId + '|' + lot.lotId;
    const up = lotUpload[key] || {};
    if (!up.priceFile && !up.catalogFile && !up.rulesFile) {
      setMsg({ type: 'error', text: 'Lotto ' + lot.lotId + ': carica almeno un file (catalogo, listino TOW o capitolato).' });
      return;
    }
    if (!Number.isFinite(Number(up.tow5Share ?? lot.tow5Share ?? 65)) || Number(up.tow5Share ?? lot.tow5Share ?? 65) < 0 || Number(up.tow5Share ?? lot.tow5Share ?? 65) > 100 || up.tow5Share === '') { setMsg({ type: 'error', text: 'La quota TOW .5 deve essere compresa tra 0 e 100.' }); return; }
    setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], uploading: true } }));
    setMsg({ type: '', text: '' });
    try {
      const result = await uploadConfiguratoreContractLot({
        contractId: contract.contractId,
        contractName: contract.name,
        lotId: lot.lotId,
        lotName: lot.name,
        tow5Share: up.tow5Share ?? lot.tow5Share ?? 65,
        catalogFile: up.catalogFile || null,
        priceFile: up.priceFile || null,
        rulesFile: up.rulesFile || null,
      });
      const warn = result.warnings?.length ? ' Avvisi: ' + result.warnings.join('; ') : '';
      setMsg({ type: warn ? 'error' : 'ok', text: result.message + warn });
      // Reset file selezionati per questo lotto
      setLotUpload(prev => { const n = { ...prev }; delete n[key]; return n; });
      // Ricarica contratti per aggiornare badge voci/prezzi
      await loadContracts();
    } catch (e) {
      setMsg({ type: 'error', text: 'Errore upload lotto: ' + (e.message || '') });
    } finally {
      setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], uploading: false } }));
    }
  };

  const handleShowSummaryLot = (contract, lotId) => {
    setSumCon(contract);
    setSumLot(lotId);
    setView('summary');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleImport = async (e) => {
    e.preventDefault();
    const count = Math.max(1, Math.min(6, ncLots));
    for (let i = 1; i <= count; i++) {
      const id = String(i);
      if (!ncLotFiles[id]?.priceFile && !ncRulesFile) {
        setMsg({ type: 'error', text: 'Lotto ' + id + ': carica il listino TOW oppure un capitolato da cui estrarre i prezzi.' });
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

  const orderedContracts = [...archContracts].sort((a, b) => {
    const rank = id => contractOrder.includes(id) ? contractOrder.indexOf(id) : contractOrder.length;
    return rank(a.contractId) - rank(b.contractId);
  });
  const moveContract = (source, target) => {
    if (!source || source === target) return;
    const ids = orderedContracts.map(c => c.contractId);
    if (!ids.includes(source) || !ids.includes(target)) return;
    const reordered = ids.filter(id => id !== source);
    reordered.splice(reordered.indexOf(target), 0, source);
    setSelectedId(selectedContract?.contractId || null);
    setContractOrder(reordered);
    try { localStorage.setItem('mev-contract-archive-order', JSON.stringify(reordered)); setOrderNotice('Ordine salvato in questo browser.'); }
    catch { setOrderNotice('Ordine aggiornato. Il browser non consente di salvarlo per le prossime visite.'); }
  };
  const filteredContracts = orderedContracts.filter(c => {
    const lots = (c.lots || []).filter(l => !l.deleted);
    const linked = lots.some(l => ambienti.some(a => a.codiceContratto === l.codiceContratto));
    return (filter !== 'unlinked' || !linked) &&
      [c.name, c.contractId, ...lots.flatMap(l => [l.name, l.codiceContratto])].join(' ').toLocaleLowerCase('it').includes(search.toLocaleLowerCase('it'));
  });
  const selectedContract = filteredContracts.find(c => c.contractId === selectedId) || filteredContracts[0];

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
    <>
    {/* ── Modale selezione gara ── */}
    {showGaraModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
        onClick={e => { if (e.target === e.currentTarget && !garaImporting) setShowGaraModal(false); }}>
        <dialog ref={garaDialog} aria-label="Importa un contratto da gara" onCancel={e => { e.preventDefault(); if (!garaImporting) setShowGaraModal(false); }} style={{ border: 0, background: '#fff', borderRadius: 16, padding: 28, width: '100%', maxWidth: 620, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 8px 40px rgba(0,0,0,0.18)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
            <div>
              <p style={S.eyebrow}>Risposte di Gara</p>
              <h2 style={S.h2}>Seleziona una gara da importare</h2>
              <p style={{ margin: '4px 0 0', color: '#52657d', fontSize: 13 }}>
                Importa un contratto completo con i lotti, i prezzi TOW e il catalogo disponibili nella gara.
              </p>
            </div>
            <button type="button" aria-label="Chiudi importazione gara" onClick={() => setShowGaraModal(false)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#52657d', lineHeight: 1, padding: 4 }} disabled={garaImporting}>✕</button>
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {(gareLoading || garaImporting) && <p style={{ color: '#52657d', textAlign: 'center', padding: 32 }}>{garaImporting ? 'Importazione in corso…' : 'Caricamento gare…'}</p>}
            {garaError && <div className="ca-error" role="alert">{garaError}<button onClick={handleOpenGaraModal}>Riprova</button></div>}
            {!garaError && !gareLoading && !garaImporting && gareList.length === 0 && (
              <div style={{ textAlign: 'center', padding: 40, color: '#52657d' }}>
                <p style={{ fontSize: 15, fontWeight: 600 }}>Nessuna gara disponibile</p>
                <p style={{ fontSize: 13 }}>Aggiungi e analizza una gara in <strong>Risposte di Gara</strong> prima di importarla.</p>
              </div>
            )}
            {!gareLoading && !garaImporting && gareList.map(g => {
              const lotti = g.capitolato?.lotti || [];
              return (
                <div key={g.id} style={{ border: '1px solid #dce5ef', borderRadius: 10, padding: '14px 16px', marginBottom: 10, cursor: garaImporting ? 'default' : 'pointer', transition: 'border-color 0.15s', background: garaSelected?.id === g.id ? '#edf4ff' : '#fafbfc', opacity: garaImporting ? 0.6 : 1 }}
                  onMouseEnter={e => { if (!garaImporting) e.currentTarget.style.borderColor = '#1a73e8'; }}
                  onMouseLeave={e => e.currentTarget.style.borderColor = '#dce5ef'}
                  role="button" tabIndex={0} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setGaraSelected(g); } }} onClick={() => { if (!garaImporting) setGaraSelected(g); }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                    <div>
                      <strong style={{ fontSize: 14, color: '#172b4d' }}>{g.nome}</strong>
                      {g.ente && <span style={{ display: 'block', fontSize: 12, color: '#52657d', marginTop: 2 }}>{g.ente}</span>}
                      {g.cig && <span style={{ display: 'block', fontSize: 11, color: '#52657d' }}>CIG: {g.cig}</span>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <span style={{ display: 'inline-block', background: '#eff6ff', color: '#1d4ed8', borderRadius: 6, padding: '2px 8px', fontSize: 12, fontWeight: 600 }}>
                        {lotti.length} lott{lotti.length === 1 ? 'o' : 'i'}
                      </span>
                      {g.capitolato?.importoBase > 0 && (
                        <span style={{ display: 'block', fontSize: 12, color: '#52657d', marginTop: 4 }}>
                          {euro.format(g.capitolato.importoBase)}
                        </span>
                      )}
                    </div>
                  </div>
                  {lotti.length > 0 && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {lotti.slice(0, 6).map((l, i) => {
                        const lotNum = String(i + 1);
                        const offerta = g.offertaLotti?.[lotNum];
                        const hasTow = offerta?.offertaEconomica?.righe?.length > 0;
                        const hasCat = offerta?.offertaCatalogo?.length > 0 || l.catalogo?.length > 0;
                        return (
                          <span key={i} style={{ background: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', borderRadius: 5, padding: '1px 7px', fontSize: 11 }}>
                            {l.nome || ('Lotto ' + (i + 1))}
                            {l.importoBase > 0 ? ' · ' + euro.format(l.importoBase) : ''}
                            {hasTow ? ' · TOW' : ''}
                            {hasCat ? ' · Catalogo' : ''}
                          </span>
                        );
                      })}
                    </div>
                  )}
                  <p style={{ margin: '6px 0 0', fontSize: 11, color: '#52657d' }}>
                    Seleziona per importare capitolato{g.offertaLotti ? ', prezzi TOW e catalogo offerta' : ' (aggiungi offerta Excel per importare anche i prezzi)'}.
                  </p>
                </div>
              );
            })}
          </div>
          <div style={S.panelActions}><button style={S.btnPrimary} disabled={!garaSelected || garaImporting || gareLoading} onClick={() => handleApplicaGara(garaSelected)}>{garaImporting ? 'Importazione…' : 'Importa gara selezionata'}</button></div>
        </dialog>
      </div>
    )}
    <div ref={archiveRef} className="contract-archive" style={S.page}>
      <div className="ca-fixed-summary">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, marginBottom: 24 }}>
        <div>
          <p style={S.eyebrow}>Archivio contrattuale</p>
          <h1 style={{ margin: '6px 0 0', fontSize: 'clamp(22px,3vw,30px)', letterSpacing: '-0.7px', fontWeight: 750 }}>Contratti e accessi</h1>
          <p style={{ margin: '4px 0 0', color: '#52657d', fontSize: 13 }}>
            Ogni contratto, i suoi lotti e le persone che possono accedervi. Tutto in un unico spazio.
          </p>
        </div>
        <button aria-expanded={showForm} style={S.btnPrimary} onClick={() => setShowForm(f => !f)}>
          {showForm ? 'Annulla' : '+ Nuovo contratto'}
        </button>
        <button type="button" style={{ ...S.btnGhost, border: '1px solid #1a73e8', color: '#1a73e8' }} onClick={handleOpenGaraModal}>
          Importa da Gara
        </button>
      </div>

      <div className="ca-archive-stats" aria-label="Riepilogo archivio" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,180px),1fr))', gap: 12, marginBottom: 28 }}>
        <div style={{ ...S.card, marginBottom: 0, padding: '18px 20px' }}>
          <span style={S.muted}>Contratti configurati</span>
          <strong style={{ display: 'block', fontSize: 30, letterSpacing: '-1px', color: '#174ea6' }}>{archLoading ? '…' : archContracts.length}</strong>
        </div>
        <div style={{ ...S.card, marginBottom: 0, padding: '18px 20px' }}>
          <span style={S.muted}>Lotti attivi</span>
          <strong style={{ display: 'block', fontSize: 30, letterSpacing: '-1px' }}>{archLoading ? '…' : archContracts.reduce((total, c) => total + (c.lots || []).filter(l => !l.deleted && l.active !== false).length, 0)}</strong>
        </div>
        <div style={{ ...S.card, marginBottom: 0, padding: '18px 20px' }}>
          <span style={S.muted}>Lotti disattivati</span>
          <strong style={{ display: 'block', fontSize: 30, letterSpacing: '-1px', color: '#52657d' }}>{archLoading ? '…' : archContracts.reduce((total, c) => total + (c.lots || []).filter(l => !l.deleted && l.active === false).length, 0)}</strong>
        </div>
      </div>

      </div>

      {/* Messaggio */}
      {archMsg.text && (
        <div role={archMsg.type === 'ok' ? 'status' : 'alert'} style={archMsg.type === 'ok' ? S.msgOk : S.msgErr}>{archMsg.text}</div>
      )}

      {/* ── Form nuovo contratto ── */}
      {showForm && (
        <div style={{ ...S.card, borderTop: '3px solid #1a73e8' }}>
          <form aria-busy={ncSaving} onSubmit={handleImport}>
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
                  <h3 style={{ margin: '0 0 10px', color: '#172b4d', fontSize: 14, fontWeight: 700 }}>Lotto {id}</h3>
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
                        <span style={{ fontSize: 11, color: '#1a73e8', display: 'block', marginTop: 2 }}>
                          {ncLotFiles[id].catalogFile.name}
                        </span>
                      )}
                    </label>
                    <label style={S.labelStyle}>
                      Listino TOW / economico <span style={{ color: '#52657d', fontWeight: 400 }}>(opzionale)</span>
                      <input type="file"
                        accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                        onChange={e => setNcLotFiles(p => ({ ...p, [id]: { ...p[id], priceFile: e.target.files[0] || null } }))}
                        style={{ ...S.inputStyle, borderColor: '#bac8da' }} />
                      {ncLotFiles[id]?.priceFile && (
                        <span style={{ fontSize: 11, color: '#1a73e8', display: 'block', marginTop: 2 }}>
                          {ncLotFiles[id].priceFile.name}
                        </span>
                      )}
                    </label>
                    <label style={S.labelStyle}>
                      TOW .5 %
                      <input type="number" min={0} max={100} step={0.01}
                        value={ncLotShares[id] ?? 65}
                        onChange={e => setNcLotShares(p => ({ ...p, [id]: e.target.value === '' ? '' : Number(e.target.value) }))}
                        style={S.inputStyle} />
                    </label>
                  </div>
                </div>
              ))}
            </div>

            <div style={S.hint}>
              <strong>Prezzi TOW:</strong> se non carichi un listino separato, i prezzi vengono estratti automaticamente dal capitolato tecnico caricato sopra (i valori TOW si trovano tipicamente verso la fine del documento). Puoi comunque caricare un Excel o PDF separato per sovrascriverli. Il catalogo PDF deve avere ID, ambito, nome componente, complessità e prezzi.
            </div>
            <div style={S.panelActions}>
              <button type="submit" style={{ ...S.btnPrimary, ...((ncSaving || !ncName.trim()) ? S.btnDisabled : {}) }} disabled={ncSaving || !ncName.trim()}>
                {ncSaving ? 'Elaborazione documenti…' : 'Importa e salva contratto'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Lista contratti ── */}
      {archLoading && archContracts.length === 0
        ? <div role="status" style={{ ...S.card, textAlign: 'center', padding: 40 }}><strong>Caricamento dell’archivio…</strong><p style={S.muted}>Recupero dei contratti e dei lotti configurati.</p></div>
        : archContracts.length === 0
          ? <div style={{ ...S.card, textAlign: 'center', padding: 40, border: '1px dashed #dce5ef' }}><h3 style={S.h2}>L’archivio è vuoto</h3><p style={S.muted}>Usa «Nuovo contratto» per aggiungere i dati, i lotti e i documenti economici.</p></div>
          : (
            <div className="ca-workspace">
              <aside className="ca-directory" aria-label="Elenco contratti">
                <div className="ca-directory-head"><strong>Archivio</strong><span>{filteredContracts.length} contratti</span></div>
                <label className="ca-search">Cerca contratto<input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Nome, lotto o codice MEV" /></label>
                <label className="ca-search">Mostra<select value={filter} onChange={e => setFilter(e.target.value)}><option value="all">Tutti i contratti</option><option value="unlinked">Da collegare a MEV</option></select></label>
                <p id="ca-order-hint" className="ca-order-hint">Trascina i contratti per riordinarli. Da tastiera: Alt + ↑ / ↓.</p>
                {orderNotice && <p role="status" className="ca-order-hint">{orderNotice}</p>}
                <div className="ca-contracts">
                  {filteredContracts.map(c => {
                    const lots = (c.lots || []).filter(l => !l.deleted);
                    return <button key={c.contractId} draggable aria-describedby="ca-order-hint" onDragStart={e => { draggedContract.current = c.contractId; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', c.contractId); }} onDragOver={e => { if (draggedContract.current) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragTarget(c.contractId); } }} onDrop={e => { e.preventDefault(); moveContract(draggedContract.current, c.contractId); draggedContract.current = null; setDragTarget(null); }} onDragEnd={() => { draggedContract.current = null; setDragTarget(null); }} onKeyDown={e => { if (e.altKey && ['ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); const index = filteredContracts.findIndex(item => item.contractId === c.contractId); const target = filteredContracts[index + (e.key === 'ArrowUp' ? -1 : 1)]; if (target) { if (e.key === 'ArrowUp') moveContract(c.contractId, target.contractId); else moveContract(target.contractId, c.contractId); } } }} className={'ca-contract-choice' + (dragTarget === c.contractId ? ' is-drop-target' : '') + (selectedContract?.contractId === c.contractId ? ' is-selected' : '')} aria-pressed={selectedContract?.contractId === c.contractId} onClick={() => { setSelectedId(c.contractId); setMemberEnv(''); }}>
                      <span className="ca-contract-icon ca-drag-handle" aria-hidden="true">⠿</span><span><strong>{c.name || c.contractId}</strong><small>{lots.length} lotti · {lots.filter(l => l.active !== false).length} attivi</small><small>{c.builtin ? 'Configurazione di sistema' : 'Configurazione personalizzata'}</small></span>
                    </button>;
                  })}
                  {!filteredContracts.length && <p className="ca-empty">Nessun contratto trovato. Prova un altro nome o rimuovi il filtro.</p>}
                </div>
              </aside>
              <div className="ca-detail">
              {(selectedContract ? [selectedContract] : []).map(c => {
                const visible = (c.lots || []).filter(l => !l.deleted);
                const active = visible.filter(l => l.active !== false);
                return (
                  <article key={c.contractId} className="ca-contract-detail" style={S.contractCard}>
                    {/* Intestazione */}
                    <div>
                      <p style={S.eyebrow}>{c.builtin ? 'Contratto di sistema' : 'Contratto personalizzato'}</p>
                      <h2 style={{ ...S.h2, marginTop: 6, fontSize: 21, lineHeight: 1.3, letterSpacing: '-0.3px' }}>{c.name || c.contractId}</h2>
                      <p style={{ ...S.muted, fontSize: 12 }}>Capitolato · {c.rulesFile || 'Non indicato'}</p>
                      <p style={{ ...S.muted, marginTop: 10 }}>{visible.length} lotti · {active.length} attivi</p>
                    </div>

                    <nav className="ca-section-nav" aria-label="Sezioni del contratto">
                      { [['lots', 'Lotti e prezzi'], ['documents', 'Documenti'], ['links', 'Collegamenti MEV'], ['users', 'Contratti e Accessi']].map(([id, label]) => <button key={id} aria-current={section === id ? 'page' : undefined} className={section === id ? 'is-active' : ''} onClick={() => setSection(id)}>{label}</button>) }
                    </nav>
                    {section === 'users' && (() => {
                      const linked = ambienti.filter(a => visible.some(l => l.codiceContratto === a.codiceContratto));
                      const environment = linked.find(a => String(a.id) === memberEnv) || linked[0];
                      return <section><h3>Accessi al contratto</h3><p className="ca-caption">I permessi appartengono al contratto MEV collegato al lotto. I lotti con lo stesso codice condividono gli utenti.</p>
                        {linked.length > 1 && <label className="ca-search">Contratto MEV<select value={environment?.id || ''} onChange={e => setMemberEnv(e.target.value)}>{linked.map(a => <option key={a.id} value={a.id}>{a.codiceContratto} · {a.descrizione}</option>)}</select></label>}
                        {visible.some(l => !ambienti.some(a => a.codiceContratto === l.codiceContratto)) && <p className="ca-notice">Alcuni lotti non sono collegati a un contratto MEV. Completa i collegamenti per gestirne gli accessi.</p>}
                        {environment ? <ContractMembers key={environment.id} ambiente={environment} allUsers={allUsers} /> : <div className="ca-empty"><h3>Collega prima un contratto MEV</h3><p>Associa un codice ai lotti per definire chi può accedere.</p><button onClick={() => setSection('links')}>Configura collegamenti</button></div>}
                      </section>;
                    })()}
                    {/* Lotti */}
                    {section === 'lots' && <div className="ca-lot-manager" style={S.lotManager}>
                      {visible.map(l => {
                        const isActive = l.active !== false;
                        const key = c.contractId + '|' + l.lotId;
                        return (
                          <div key={l.lotId} style={{ ...S.lotRow, ...(isActive ? {} : S.lotRowInactive) }}>
                            <div>
                              <strong style={{ display: 'block', fontSize: 13, color: '#172b4d' }}>Lotto {l.lotId}</strong>
                              <span style={{ display: 'block', color: '#52657d', fontSize: 12 }}>{l.name}</span>
                              {/* Badge riepilogo file analizzati */}
                              <div style={{ marginTop: 6, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                                {(() => {
                                  const towKeys = l.towPrices ? Object.keys(l.towPrices) : [];
                                  const summary = CONTRACT_SUMMARIES[c.contractId];
                                  const lotSum  = summary?.lots?.[l.lotId];
                                  const hasTowSummary = lotSum && Array.isArray(lotSum.tow) && lotSum.tow.length > 0;
                                  if (towKeys.length > 0) {
                                    return (
                                      <button
                                        onClick={() => setModal({
                                          type: 'tow',
                                          title: `Lotto ${l.lotId} – Prezzi TOW`,
                                          valueKind: 'price',
                                          contractId: c.contractId,
                                          lotId: l.lotId,
                                          towImpact: l.towImpact || {},
                                          data: towKeys.map(k => {
                                            const summaryRow = (lotSum?.tow || []).find(r => r[0] === k);
                                            return [k, summaryRow?.[1] || '', euro.format(l.towPrices[k]), summaryRow?.[3] || ''];
                                          }),
                                        })}
                                        style={{ minHeight: 36, fontSize: 12, color: '#166534', background: '#e8f6ef', padding: '6px 10px', borderRadius: 5, border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 700 }}>
                                        {towKeys.length} prezzi TOW
                                      </button>
                                    );
                                  } else if (hasTowSummary) {
                                    return (
                                      <button
                                        onClick={() => setModal({
                                          type: 'tow',
                                          title: `Lotto ${l.lotId} – Quadro TOW`,
                                          contractId: c.contractId,
                                          lotId: l.lotId,
                                          towImpact: l.towImpact || {},
                                          data: lotSum.tow,
                                        })}
                                        style={{ minHeight: 36, fontSize: 12, color: '#1e40af', background: '#eaf2ff', padding: '6px 10px', borderRadius: 5, border: '1px solid #bfdbfe', cursor: 'pointer', fontWeight: 700 }}>
                                        Quadro TOW
                                      </button>
                                    );
                                  } else {
                                    return (
                                      <span style={{ fontSize: 11, color: '#b00020', background: '#fdecec', padding: '2px 9px', borderRadius: 5, border: '1px solid #fecaca' }}>
                                        Listino TOW mancante
                                      </span>
                                    );
                                  }
                                })()}

                                {(() => {
                                  const cat = Array.isArray(l.catalog) ? l.catalog : [];
                                  if (cat.length > 0) {
                                    return (
                                      <button
                                        onClick={() => setModal({ type: 'catalog', title: `Lotto ${l.lotId} – ${l.name || ''} – Catalogo`, data: cat })}
                                        style={{ minHeight: 36, fontSize: 12, color: '#166534', background: '#e8f6ef', padding: '6px 10px', borderRadius: 5, border: '1px solid #bbf7d0', cursor: 'pointer', fontWeight: 700 }}>
                                        {cat.length} voci catalogo
                                      </button>
                                    );
                                  } else if (l.catalogFile) {
                                    return (
                                      <span style={{ fontSize: 11, color: '#52657d', background: '#f4f7fb', padding: '2px 9px', borderRadius: 5, border: '1px solid #dce5ef' }}>
                                        Catalogo: {l.catalogFile}
                                      </span>
                                    );
                                  } else {
                                    return (
                                      <span style={{ fontSize: 11, color: '#52657d', background: '#f4f7fb', padding: '2px 9px', borderRadius: 5, border: '1px solid #dce5ef' }}>
                                        Catalogo non caricato
                                      </span>
                                    );
                                  }
                                })()}
                              </div>
                            </div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingTop: 12, borderTop: '1px solid #e1e9f3' }}>
                            <span style={{ ...S.lotStatus, marginRight: 'auto', color: isActive ? '#166534' : '#52657d', background: isActive ? '#e8f6ef' : '#edf0f4' }}>
                              {isActive ? 'Attivo' : 'Disattivato'}
                            </span>
                            {(() => {
                              return (
                                <button
                                  style={{ ...S.btnGhost, ...S.btnCompact }}
                                  title={`Apri sintesi Lotto ${l.lotId}`}
                                  onClick={() => handleShowSummaryLot(c, l.lotId)}>
                                  Sintesi
                                </button>
                              );
                            })()}
                            <button
                              style={{ ...S.btnGhost, ...S.btnCompact }}
                              disabled={deleting || Object.values(togglingLot).some(Boolean)}
                              onClick={() => handleToggleLot(c.contractId, l.lotId, isActive)}>
                              {togglingLot[key] ? '...' : isActive ? 'Disattiva' : 'Riattiva'}
                            </button>
                            <button
                              style={S.btnDanger}
                              disabled={deleting || Object.values(togglingLot).some(Boolean)} onClick={() => handleDeleteLot(c.contractId, l.lotId)}>
                              Elimina
                            </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    }
                    {/* Aggiornamento file per lotto (collassabile) */}
                    {section === 'documents' && visible.map(l => {
                      const key = c.contractId + '|' + l.lotId;
                      const up = lotUpload[key] || {};
                      return (
                        <section key={'docs-' + l.lotId} className="ca-lot-documents">
                          <h3>Lotto {l.lotId} — {l.name}</h3>
                          <p className="ca-caption">Documenti e dati già importati</p>
                          <ul className="ca-saved-documents">
                            <li><strong>Capitolato</strong><span>{l.rulesFile || c.rulesFile || 'Nome del documento non disponibile'}</span></li>
                            <li><strong>Listino TOW</strong><span>{l.priceFile || (Object.keys(l.towPrices || {}).length ? 'Prezzi importati · file di origine non indicato' : 'Nessun listino importato')}</span><small>{Object.keys(l.towPrices || {}).length} prezzi disponibili</small></li>
                            <li><strong>Catalogo</strong><span>{l.catalogFile || ((l.catalog || []).length ? 'Catalogo importato · file di origine non indicato' : 'Nessun catalogo importato')}</span><small>{(l.catalog || []).length} voci disponibili</small></li>
                          </ul>
                        <details style={{ border: '1px solid #e2e8f0', borderRadius: 12, padding: '10px 14px', background: '#fbfcfe', minWidth: 0 }}>
                          <summary style={{ fontSize: 12, color: '#29415e', cursor: 'pointer', fontWeight: 700, userSelect: 'none', padding: '4px 2px' }}>
                            Carica documenti nuovi o sostitutivi
                          </summary>
                          <p className="ca-caption">Scegli nuovi file solo per aggiornare i documenti importati riepilogati sopra.</p>
                          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,160px),1fr))', gap: 8, alignItems: 'end', paddingBottom: 8 }}>
                            <label style={{ ...S.labelStyle, fontSize: 12 }}>
                              Listino TOW <span style={{ color: '#52657d', fontWeight: 400 }}>(opzionale)</span>
                              <span className="ca-file-picker"><input className="ca-file-input" aria-label={`Nuovo listino TOW lotto ${l.lotId}`} type="file"
                                accept=".xlsx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                                onChange={e => setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], priceFile: e.target.files[0] || null } }))}
 /><span>{up.priceFile?.name || 'Scegli nuovo file'}</span></span>
                              {up.priceFile && <span style={{ fontSize: 10, color: '#1a73e8' }}>{up.priceFile.name}</span>}
                              {!up.priceFile && <span style={{ fontSize: 10, color: '#52657d' }}>Se omesso, i prezzi TOW vengono riletti dal capitolato</span>}
                            </label>
                            <label style={{ ...S.labelStyle, fontSize: 12 }}>
                              Capitolato PDF <span style={{ color: '#52657d', fontWeight: 400 }}>(per rileggere i TOW)</span>
                              <span className="ca-file-picker"><input className="ca-file-input" aria-label={`Nuovo capitolato lotto ${l.lotId}`} type="file" accept=".pdf,application/pdf"
                                onChange={e => setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], rulesFile: e.target.files[0] || null } }))}
 /><span>{up.rulesFile?.name || 'Scegli nuovo file'}</span></span>
                              {up.rulesFile && <span style={{ fontSize: 10, color: '#1a73e8' }}>{up.rulesFile.name}</span>}
                            </label>
                            <label style={{ ...S.labelStyle, fontSize: 12 }}>
                              Catalogo PDF (opzionale)
                              <span className="ca-file-picker"><input className="ca-file-input" aria-label={`Nuovo catalogo lotto ${l.lotId}`} type="file" accept=".pdf,application/pdf"
                                onChange={e => setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], catalogFile: e.target.files[0] || null } }))}
 /><span>{up.catalogFile?.name || 'Scegli nuovo file'}</span></span>
                              {up.catalogFile && <span style={{ fontSize: 10, color: '#1a73e8' }}>{up.catalogFile.name}</span>}
                            </label>
                            <label style={{ ...S.labelStyle, fontSize: 12 }}>
                              TOW .5 %
                              <input type="number" min={0} max={100} step={0.01}
                                value={up.tow5Share ?? l.tow5Share ?? 65}
                                onChange={e => setLotUpload(prev => ({ ...prev, [key]: { ...prev[key], tow5Share: e.target.value === '' ? '' : Number(e.target.value) } }))}
                                style={{ ...S.inputStyle, fontSize: 12, padding: '6px 8px', marginTop: 4, width: 90 }} />
                            </label>
                            <button
                              onClick={() => handleUploadLotFiles(c, l)}
                              disabled={up.uploading || (!up.priceFile && !up.catalogFile && !up.rulesFile)}
                              style={{ ...S.btnPrimary, ...S.btnCompact, opacity: ((!up.priceFile && !up.catalogFile && !up.rulesFile) || up.uploading) ? 0.6 : 1, alignSelf: 'end' }}>
                              {up.uploading ? 'Analisi...' : 'Analizza e salva'}
                            </button>
                          </div>
                        </details>
                        </section>
                      );
                    })}

                    {/* Pannello associazione Codice MEV */}
                    {section === 'links' && (
                      <div style={{ border: '1px solid #cbdcf3', background: '#f5f9ff', borderRadius: 14, padding: 16, display: 'grid', gap: 16, minWidth: 0 }}>
                        <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 700, color: '#29415e' }}>
                          Associa Codice Contratto MEV per Lotto
                        </p>
                        {visible.map(l => {
                          const key = c.contractId + '|' + l.lotId;
                          return (
                            <div key={l.lotId} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <span style={{ width: 62, fontSize: 13, fontWeight: 700, color: '#172b4d' }}>Lotto {l.lotId}</span>
                              <span style={{ width: 110, fontSize: 12, color: '#52657d' }}>{l.name}</span>
                              <select aria-label={`Contratto MEV lotto ${l.lotId}`}
                                value={lotEnvSel[key] || ''}
                                onChange={e => {
                                  const env = ambienti.find(a => a.id === parseInt(e.target.value, 10));
                                  setLotEnvSel(p => ({ ...p, [key]: e.target.value }));
                                  setLotCodes(p => ({ ...p, [key]: env ? env.codiceContratto : '' }));
                                }}
                                style={{ padding: '8px 10px', border: '1px solid #bac8da', borderRadius: 8, fontSize: 12, width: '100%', maxWidth: 240, minWidth: 0, boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 38 }}>
                                <option value="">-- scegli contratto MEV --</option>
                                {ambienti.map(a => (
                                  <option key={a.id} value={a.id}>{a.codiceContratto} · {a.descrizione}</option>
                                ))}
                              </select>
                              <input
                                value={lotCodes[key] || ''}
                                aria-label={`Codice MEV lotto ${l.lotId}`} onChange={e => { setLotEnvSel(p => ({ ...p, [key]: '' })); setLotCodes(p => ({ ...p, [key]: e.target.value })); }}
                                placeholder="Codice contratto"
                                style={{ padding: '8px 10px', border: '1px solid #bac8da', borderRadius: 8, fontSize: 12, width: 160, maxWidth: '100%', boxSizing: 'border-box', fontFamily: 'inherit', minHeight: 38 }} />
                              <button
                                style={{ ...S.btnPrimary, ...S.btnCompact, opacity: savingLot[key] ? 0.7 : 1 }}
                                disabled={!!savingLot[key]}
                                onClick={() => handleSaveLotCode(c.contractId, l.lotId)}>
                                {savingLot[key] ? '...' : 'Salva'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {/* Azioni */}
                    <div style={S.cardActions}>
                      {!c.builtin && (
                        <button style={{ ...S.btnGhost, color: '#a81832', borderColor: '#f1b9c0' }} disabled={deleting || Object.values(togglingLot).some(Boolean)} onClick={() => handleDeleteContract(c.contractId)}>
                          Elimina contratto
                        </button>
                      )}
                    </div>

                  </article>
                );
              })}
              </div>
            </div>
          )
      }
    </div>
    <LotDataModal modal={modal} onClose={() => setModal(null)} onSaveTowImpact={handleSaveTowImpact} />
    </>
  );
}
