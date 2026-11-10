const allowed = /\.(java|sql|xml|xsd|wsdl|bpel|jca|proxy|biz|pipeline|xq|xqy|xsl|xslt|js|ts|json|md|cs)$/i;
// One cache per selected folder: each file is read and hashed once, then reused by every activity.
export const createSourceCache = () => new Map();
async function readOnce(file, cache) {
  if (cache?.has(file)) return cache.get(file);
  const pending = (async () => {
    const text = await file.text();
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
    return { text, lines: text.split(/\r?\n/), sha256: [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, '0')).join('') };
  })();
  cache?.set(file, pending);
  return pending;
}

export async function activitySourceContext(files, activity, cache) {
  const terms = [...new Set(String(activity || '').toLowerCase().match(/[a-z0-9_-]{4,}/g) || [])];
  const candidates = files.filter(file => allowed.test(file.name) && file.size <= 500000
    && !/(^|\/)(\.git|node_modules|target|bin|obj|vendor|dist)(\/|$)/i.test(file.webkitRelativePath || file.name));
  const ranked = candidates.map(file => ({ file, score: terms.filter(t => (file.webkitRelativePath || file.name).toLowerCase().includes(t)).length }))
    .sort((a, b) => b.score - a.score).slice(0, 60);
  const read = [];
  for (const { file } of ranked) {
    const { lines, sha256 } = await readOnce(file, cache);
    let anchor = lines.findIndex(line => terms.some(term => line.toLowerCase().includes(term)));
    if (anchor < 0) anchor = 0;
    const start = Math.max(0, anchor - 8);
    const excerpt = lines.slice(start, start + 80).join('\n').slice(0, 4000);
    read.push({ path: file.webkitRelativePath || file.name, startLine: start + 1, endLine: start + excerpt.split('\n').length,
      sha256, text: excerpt, score: terms.filter(term => excerpt.toLowerCase().includes(term)).length });
  }
  const selected = read.sort((a, b) => b.score - a.score).slice(0, 8);
  return { files: selected, coverage: { selectedFiles: files.length, eligibleFiles: candidates.length, sampledFiles: read.length,
    sentFiles: selected.length, notice: 'Campione limitato: massimo 60 file letti e 8 estratti inviati, non analisi completa del repository. Nessuna compilazione o test eseguito.' } };
}
