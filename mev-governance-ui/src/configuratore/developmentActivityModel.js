import { resolveCatalogEntry } from './catalogReconciliation';
import { appNorm } from './configuratoreCore';
import { catalogEntryInScope } from './suggestionScope';

export const activityKey = (item, index) => String(item.sourceRowId || item.key || `activity-${index + 1}`);
export const developmentActivities = items => items.map((item, index) => ({ key: activityKey(item, index), item, number: index + 1 }));

export function importedGapSuggestions(interventions, catalog) {
  return interventions.flatMap(intervention => {
    const requirement = [intervention.titolo, intervention.descrizione, intervention.attivita, intervention.requisiti].filter(Boolean).join(' ');
    const covered = new Set((intervention.mappings || []).map(mapping => resolveCatalogEntry({ id: mapping.catalogId, name: mapping.name, ambit: mapping.ambit }, catalog)?.id).filter(id => id != null).map(String));
    return catalog.filter(entry => {
      const name = String(entry.nome || '').trim();
      return name.length >= 15 && !covered.has(String(entry.id)) && catalogEntryInScope(entry, requirement) && appNorm(requirement).includes(appNorm(name));
    }).map(entry => ({ id: entry.id, selected: false, type: /modific|adegua|evoluz/i.test(requirement) ? 'MODIFICA' : 'REALIZZAZIONE', complexity: 'Medio', qty: 1,
      interventionId: intervention.id, interventionTitle: intervention.titolo,
      reason: `Il testo dell’intervento ${intervention.id} cita esplicitamente «${entry.nome}», senza una riga già associata alla stessa voce. Verificare se è coperta da altre attività prima di aggiungerla. Evidenza importata: ${requirement.slice(0, 700)}` }));
  });
}

export function developmentMarkdown(activities, plans, applications) {
  return '# Schede sviluppo · Visual Studio Code\n\nRiferimenti applicativi (non attestano lettura dei sorgenti):\n'
    + applications.map(app => `- ${app.name}: ${app.codeUrl || 'Percorso non configurato'}`).join('\n') + '\n\n'
    + activities.map(({ key, item, number }) => { const plan = plans[key] || {}; return `## Attività ${number} · ${item.interventionId || 'Senza intervento'}\n${item.detail?.detailDescription || item.reason || ''}\n\n- Stato: ${plan.status || 'Da analizzare'}\n- File coinvolti:\n${plan.files || 'Da individuare'}\n\n### Soluzione\n${plan.solution || 'Da definire'}\n\n### Criteri di accettazione\n${plan.acceptance || 'Da definire'}\n\n### Evidenze di verifica\n${plan.verification || 'Nessuna verifica registrata'}\n`; }).join('\n');
}
