// L'applicativo scelto e il "Sistema" dell'iniziativa, e cosa se ne dice all'AI.
//
// Il campo Sistema dell'iniziativa nasce dall'Excel importato. Chi sceglie un applicativo dal menu (es. ILP) si aspetta che l'iniziativa riguardi quel sistema:
// prima il campo restava vuoto e l'AI rispondeva "il sistema non mi arriva". Qui si decide come i due si uniscono, e cosa dell'applicativo (la scheda tecnica
// salvata in Risorse e configurazione) viene mandato all'AI nelle conversazioni.
import { appNorm } from './configuratoreCore';

// I nomi del campo Sistema come elenco: «IPERSUITE, IPER» -> ['IPERSUITE', 'IPER'].
export const systemNames = value => String(value || '').split(/[,;\n]+/).map(item => item.trim()).filter(Boolean);

// Aggiunge il nome di un applicativo al campo Sistema, senza duplicati (anche se scritto con maiuscole o accenti diversi) e senza perdere cio' che c'era.
export function addAppToSystem(system, appName) {
  const names = systemNames(system); const name = String(appName || '').trim();
  if (!name || names.some(existing => appNorm(existing) === appNorm(name))) return names.join(', ');
  return [...names, name].join(', ');
}

// Toglie il nome di un applicativo dal campo Sistema SOLO se nessun altro applicativo ancora scelto ha lo stesso nome. Gli altri nomi (per esempio quelli arrivati dall'Excel)
// restano: l'utente li ha o li ha importati, l'app non li cancella al posto suo.
export function removeAppFromSystem(system, appName, remainingAppNames = []) {
  const name = appNorm(appName);
  if (remainingAppNames.some(other => appNorm(other) === name)) return systemNames(system).join(', ');
  return systemNames(system).filter(existing => appNorm(existing) !== name).join(', ');
}

const list = value => (Array.isArray(value) ? value : []).map(item => String(item).trim()).filter(Boolean);
const clip = (items, max) => list(items).slice(0, max);

// La scheda dell'applicativo per l'AI: solo cio' che serve a orientarsi (che cosa e', di quali parti e' fatto, con quali tecnologie), con limiti di dimensione.
// Mai codice, mai percorsi locali, mai la nota libera dell'utente (puo' contenere di tutto). Il numero di componenti e' quello del profilo tecnico: serve per dire
// all'utente (e all'AI) quanti sono e quali ha gia' fornito.
export const MAX_APPLICATIONS = 4;
export function applicationBrief(app) {
  const profile = app?.techProfile || {};
  const components = clip(profile.components, 40);
  return {
    name: String(app?.name || '').trim().slice(0, 80), code: String(app?.code || '').trim().slice(0, 40),
    aliases: clip(app?.systemAliases, 8),
    technologies: [...new Set([...list(app?.languages), ...list(profile.technologies), ...list(profile.frameworks)])].slice(0, 20),
    databases: [...new Set([...list(app?.databases), ...list(profile.databases)])].slice(0, 12),
    integrations: clip(profile.integrations, 12), interfaces: clip(profile.interfaces, 8), infrastructure: clip(profile.infrastructure, 10),
    components, totalComponents: list(profile.components).length,
    totalFiles: Number(profile.totalFiles) || 0, summary: String(profile.summary || '').slice(0, 400),
  };
}

// Le schede degli applicativi scelti dall'utente per questa iniziativa, nell'ordine in cui sono stati scelti. Un identificativo che non esiste piu' si ignora.
export function applicationBriefs(applications, selectedIds) {
  const chosen = (selectedIds || []).map(id => (applications || []).find(app => String(app.id) === String(id))).filter(Boolean);
  return chosen.slice(0, MAX_APPLICATIONS).map(applicationBrief);
}

// Un componente del profilo tecnico e' (di solito) una cartella del repository, con un prefisso dell'applicativo: «ILP_BACKEND_hu-transport-app» e' la cartella «hu-transport-app».
// Un file appartiene al componente se UNA CARTELLA del suo percorso ha esattamente quel nome (il nome intero, oppure la parte dopo l'ultimo «_»). Non si cercano parole sparse nel percorso:
// il pacchetto Java «it/poste/item» comparirebbe in file di componenti diversi e verrebbe attribuito a quello sbagliato.
const folderName = text => String(text || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function componentNames(component) {
  const full = folderName(component); const last = full.includes('_') ? full.slice(full.lastIndexOf('_') + 1) : full;
  return [...new Set([full, last].filter(name => name.length >= 3))];
}

// Per ogni componente del profilo: quanti dei file salvati stanno in una cartella con il suo nome. Se un file e' dentro piu' cartelle di componenti (una dentro l'altra)
// va a quello piu' interno. «files: 0» significa «nessun file riconosciuto con questo nome di cartella», non «sicuramente non letto»: la cartella puo' avere un altro nome.
export function componentCoverage(brief, filePaths) {
  const components = brief.components || []; const total = brief.totalComponents || components.length;
  const specs = components.map(component => ({ component, names: new Set(componentNames(component)) }));
  const counts = new Map(specs.map(spec => [spec.component, 0]));
  for (const path of filePaths || []) {
    const segments = String(path || '').split('/').slice(0, -1).map(folderName);   // le cartelle, non il nome del file
    let best = null; let bestDepth = -1;
    segments.forEach((segment, depth) => { for (const spec of specs) if (spec.names.has(segment) && depth >= bestDepth) { best = spec; bestDepth = depth; } });
    if (best) counts.set(best.component, counts.get(best.component) + 1);
  }
  const rows = specs.map(spec => ({ component: spec.component, files: counts.get(spec.component) }));
  return { rows, read: rows.filter(row => row.files > 0), missing: rows.filter(row => row.files === 0), total, shown: components.length };
}
