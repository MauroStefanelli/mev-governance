import React, { useState } from 'react';
import JSZip from 'jszip';
import { generateActivityCode } from '../services/mevService';

export async function codeOriginals(files, paths) {
  const requested = paths.split(/\r?\n/).map(p => p.trim()).filter(Boolean);
  if (requested.length > 8) throw new Error('Seleziona al massimo 8 file originali per una modifica mirata.');
  const originals = [];
  for (const path of requested) {
    const matches = files.filter(f => (f.webkitRelativePath || f.name) === path || (f.webkitRelativePath || f.name).endsWith(`/${path}`));
    if (matches.length !== 1) throw new Error(`Originale ${path}: non trovato o ambiguo nella cartella selezionata. Per file nuovi lascia vuoto l’elenco originali.`);
    if (matches[0].size > 120000) throw new Error(`Originale ${path} troppo grande per questa generazione mirata.`);
    const content = await matches[0].text();
    if (content.length > 60000) throw new Error(`Originale ${path} supera 60.000 caratteri. Suddividi l’intervento.`);
    originals.push({ path, content });
  }
  return originals;
}

export default function ActivityCodeGenerator({ item, plan, update, applications, sourceFiles }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState(null);
  const target = plan.codeTarget || {};
  const generated = plan.generatedCode;
  const setTarget = patch => update({ codeTarget: { ...target, ...patch } });
  const generate = async () => {
    setBusy(true); setError('');
    try {
      const originals = await codeOriginals(sourceFiles, target.originalPaths || '');
      const result = await generateActivityCode({ target: { application: target.application || '', component: target.component || '', stack: target.stack || '', database: target.database || 'Non applicabile', instructions: target.instructions || '' },
        activity: item.detail?.detailDescription || item.reason || '', solution: plan.solution || '', acceptance: plan.acceptance || '', originals });
      setPreview({ ...result, originals });
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  };
  const download = async () => {
    setError('');
    try {
      const zip = new JSZip();
      for (const file of generated.files) {
        zip.file(`proposed/${file.path}`, file.content);
        const original = generated.originals.find(o => o.path === file.path);
        if (original) zip.file(`original/${file.path}`, original.content);
      }
      zip.file('manifest.json', JSON.stringify({ ...generated, files: generated.files.map(({ content: _content, ...metadata }) => metadata), originals: generated.originals.map(o => o.path) }, null, 2));
      zip.file('README.md', '# Codice generato — NON VERIFICATO\n\nConfrontare original/ e proposed/ sul repository reale. Per update verificare baseSha256 prima di applicare le modifiche. Per create verificare che il percorso non esista già. Nessuna applicazione automatica.\n\n' + (generated.summary || '') + '\n\n## Test suggeriti, non eseguiti\n' + (generated.testInstructions || 'Da definire'));
      const blob = await zip.generateAsync({ type: 'blob' }); const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'codice-attivita-da-verificare.zip'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) { setError(e.message); }
  };
  const result = preview || generated;
  return <details className="activity-code-generator"><summary>Generazione codice / workflow · target applicativo</summary>
    <p>Un target per generazione: applicativo, componente, stack e database. Per attività multi-componente genera e conserva gli artefatti di un target alla volta. Compila soluzione e criteri nella scheda prima di procedere.</p>
    <div className="workspace-fields">
      <label>Applicativo destinatario<select value={target.application || ''} onChange={e => setTarget({ application: e.target.value })}><option value="">Seleziona applicativo</option>{applications.map(a => <option key={a.id || a.code || a.name} value={a.name}>{a.name}</option>)}</select></label>
      {[['component', 'Componente / modulo'], ['stack', 'Stack e runtime (es. Java 8, Logic App Standard)'], ['database', 'Database e versione (oppure Non applicabile)'], ['instructions', 'Contratti, vincoli e convenzioni di implementazione'], ['originalPaths', 'Originali da modificare (percorsi relativi, uno per riga; vuoto per soli file nuovi)']].map(([field, label]) => <label key={field}>{label}<textarea rows={2} value={target[field] || ''} onChange={e => setTarget({ [field]: e.target.value })} /></label>)}
    </div>
    <button type="button" disabled={busy || !target.application || !target.component?.trim() || !target.stack?.trim() || !plan.solution?.trim() || !plan.acceptance?.trim()} onClick={generate}>{busy ? 'Generazione file…' : 'Genera codice / workflow per questa attività'}</button>
    {error && <p role="alert">{error}</p>}
    {result?.status === 'blocked' && <div role="status"><strong>Decisioni necessarie prima di generare</strong><pre>{JSON.stringify(result.blockers, null, 2)}</pre></div>}
    {result?.files?.length > 0 && <div className="development-ai-proposal"><strong>File generati · build e test NON eseguiti</strong><p>{result.summary}</p>
      {result.files.map(file => <details key={file.path}><summary>{file.action === 'create' ? 'Nuovo' : 'Modificato'} · {file.path}</summary>
        {file.baseSha256 && <p>Originale SHA-256: {file.baseSha256}</p>}
        {result.originals?.find(o => o.path === file.path) && <details><summary>Originale completo</summary><pre className="generated-code-preview">{result.originals.find(o => o.path === file.path).content}</pre></details>}
        <pre className="generated-code-preview">{file.content}</pre>
      </details>)}
      <h4>Test suggeriti</h4><p style={{ whiteSpace: 'pre-wrap' }}>{result.testInstructions}</p>
      {preview && <button type="button" onClick={() => {
        if (generated && !window.confirm('Sostituire gli artefatti generati precedenti di questa attività? Salva una revisione o scaricali prima se devi conservarli.')) return;
        update({ generatedCode: { ...preview, codeTarget: target }, status: 'Da verificare' }); setPreview(null);
      }}>Conserva artefatti nella scheda</button>}
      {!preview && generated && <button type="button" onClick={download}>Scarica file sorgenti generati ZIP</button>}
      <p>Salva una revisione per conservare target e artefatti. L’app non ha scritto nel repository, compilato, eseguito SQL o distribuito risorse.</p>
    </div>}
  </details>;
}
