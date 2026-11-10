import JSZip from 'jszip';
import { developmentActivities, developmentMarkdown } from './developmentActivityModel';
import { appNorm, codeChangePrompt, implementationDocument, sourceFileAllowed, ignoredSourcePath, evaluationSystems, evaluationApplicationCodes, applicationContextFor } from './configuratoreCore';

export const downloadBlob = (name, blob) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url; link.download = name;
  document.body.appendChild(link); link.click();
  setTimeout(() => { URL.revokeObjectURL(url); link.remove(); }, 1000);
};

export const excelInterventions = list => (list || []).map(x => ({ id: x.id, title: x.titolo || x.title || '', sistema: x.sistema || '', componente: x.componente || '',
  description: x.descrizione || x.description || '', activity: x.attivita || x.activity || '', tow5: x.tow5 || 0 }));

export function approvedInterventions(evaluation, catalog) {
  const approvedSuggestions = (evaluation.suggestions || []).filter(s => s.selected && s.approved !== false);
  const rows = (evaluation.items || []).filter(item => item.selected || item.imported);
  return [...approvedSuggestions, ...rows].map((x, index) => ({ key: x.key || `s${index}`, id: x.id,
    name: catalog.find(c => String(c.id) === String(x.id))?.nome || x.name || x.id, type: x.type, complexity: x.complexity, quantity: x.qty,
    reason: x.reason || '', additionalInfo: x.additionalInfo || '', interventionId: x.interventionId || '' }));
}

const planRows = (items, plans) => developmentActivities(items).map(a => ({ key: a.key, interventionId: a.item.interventionId,
  description: a.item.detail?.detailDescription || a.item.reason, plan: plans[a.key] || {} }));

export function repositorySummary(files, techProfile, fallbackName) {
  const hasFiles = files.length > 0;
  const allPaths = hasFiles ? files.map(f => f.webkitRelativePath || f.name) : (techProfile?.filePaths || []);
  const sourcePaths = hasFiles ? files.filter(f => sourceFileAllowed(f.name) && !ignoredSourcePath(f.webkitRelativePath || f.name)).map(f => f.webkitRelativePath || f.name)
    : allPaths.filter(p => sourceFileAllowed(p) && !ignoredSourcePath(p));
  const folderName = hasFiles ? ((allPaths[0] || '').split('/')[0] || 'repository') : (techProfile?.name || fallbackName || 'repository');
  return { folderName, allPaths, sourcePaths, hasFiles };
}

export function implementationMarkdown({ loaded, delivery, approved, techProfile }) {
  return implementationDocument({ record: { payload: loaded.evaluation, lot_id: loaded.lot, contract_id: loaded.contractId, title: loaded.evaluation.initiative?.title },
    proposals: approved, branch: delivery.branch, approvalNotes: delivery.notes, tests: delivery.tests,
    excelInterventions: excelInterventions(loaded.evaluation.importedInterventions), techProfile: techProfile || null });
}

export function buildCodeChangeRequest({ loaded, plans, delivery, applications, approved, files, techProfile, contractName }) {
  const evaluation = loaded.evaluation; const initiative = evaluation.initiative || {};
  if (!approved.length) throw new Error('Nessun intervento approvato: apri il Configuratore e approva almeno un intervento.');
  if (!files.length && !techProfile) throw new Error('Seleziona la cartella dei sorgenti oppure scegli un applicativo con profilo tecnico.');
  const items = evaluation.items || [];
  const systems = evaluationSystems({ initiative, systems: [initiative.system], importedInterventions: evaluation.importedInterventions || [] });
  const context = applicationContextFor(initiative.system, applications, loaded.lot);
  const applicationCodes = evaluationApplicationCodes({ applicationContext: context });
  const repo = repositorySummary(files, techProfile, initiative.system);
  const request = { formatVersion: 4, developmentActivities: planRows(items, plans), generatedAt: new Date().toISOString(), source: 'Sviluppo MEV Governance',
    targetTool: delivery.tool, contractId: loaded.contractId, contractName: contractName || loaded.contractId, lot: String(loaded.lot), initiative, systems, applicationCodes,
    requirements: initiative.requirements || '', description: initiative.description || '', approvalNotes: delivery.notes, branch: delivery.branch,
    approvedInterventions: approved, excelInterventions: excelInterventions(evaluation.importedInterventions), techProfile: techProfile || null,
    repository: { folderName: repo.folderName, totalFiles: repo.allPaths.length, sourceFiles: repo.sourcePaths.length, filePaths: repo.allPaths, sourceFilePaths: repo.sourcePaths } };
  const zip = new JSZip();
  const activityList = developmentActivities(items);
  zip.file('README_MODIFICA_CODICE.md', codeChangePrompt(request));
  zip.file('richiesta_modifica_codice.json', JSON.stringify(request, null, 2));
  zip.file('piano_sviluppo.md', implementationMarkdown({ loaded, delivery, approved, techProfile }));
  zip.file('elenco_file_repository.txt', repo.allPaths.join('\n'));
  zip.file('schede_sviluppo.json', JSON.stringify({ goto: initiative.code, activities: planRows(items, plans) }, null, 2));
  zip.file('SCHEDE_SVILUPPO.md', developmentMarkdown(activityList, plans, context));
  zip.file('VERIFICA_SELEZIONE.txt', [`Codice iniziativa: ${initiative.code || ''}`, `Titolo: ${initiative.title || ''}`, `Sistema/applicazione: ${systems.join(', ')}`,
    `Applicativi AP: ${applicationCodes.join(', ')}`, `Repository selezionato: ${repo.folderName}`, `Interventi approvati: ${approved.length}`].join('\n'));
  return { zip, name: `Richiesta_Modifica_Codice_${String(initiative.code || 'iniziativa').replace(/[^a-z0-9_-]+/gi, '_')}.zip` };
}

export function developmentDocumentMarkdown(result, initiative) {
  const analysis = result?.analysis;
  if (!analysis) return result?.document || result?.markdown || JSON.stringify(result, null, 2);
  if (!Array.isArray(analysis.recommendations) || !analysis.recommendations.length)
    return `${analysis.summary ? `# Riepilogo\n${analysis.summary}\n\n` : ''}\n\nJSON analysis:\n${JSON.stringify(analysis, null, 2)}`;
  const list = (title, values) => Array.isArray(values) && values.length ? `**${title}**:\n${values.map(v => `- ${v}`).join('\n')}\n\n` : '';
  let doc = `# Documento di sviluppo - Iniziativa ${appNorm(initiative.code || initiative.title)}\n\n`;
  if (analysis.summary) doc += `## Riepilogo\n${analysis.summary}\n\n`;
  doc += '## Raccomandazioni\n';
  analysis.recommendations.forEach((r, index) => {
    doc += `\n### ${index + 1}. Intervention ${r.interventionId || ''} · Catalog ${r.catalogId || ''}\n`;
    if (r.reason) doc += `**Perché**: ${r.reason}\n\n`;
    doc += list('Attività', r.activities) + list('File candidati', r.files) + list('Rischi', r.risks) + list('Test consigliati', r.tests);
  });
  if (Array.isArray(analysis.warnings) && analysis.warnings.length) doc += `\n## Avvertenze\n${analysis.warnings.map(w => `- ${w}`).join('\n')}\n`;
  return doc;
}
