import { useCallback, useEffect, useRef, useState } from 'react';
import { listFolders, savedFiles, saveSelection, removeFolder, setActive, inspectSelection, diffSelection, isPersistent, storageUsage, requestPersistence } from './sourceLibrary';
import { createSourceCache } from './activitySourceContext';

// Opens the browser's folder chooser. Resolves with the files, or with [] when the user cancels.
export const chooseFolder = () => new Promise(resolve => {
  const input = document.createElement('input'); input.type = 'file'; input.multiple = true; input.setAttribute('webkitdirectory', ''); input.setAttribute('directory', '');
  input.onchange = () => resolve([...(input.files || [])]); input.oncancel = () => resolve([]); input.click();
});

// The saved folders of this user as the app uses them: `files` (File-like objects, text read on demand), `cache` (one per set of folders) and the actions.
// A folder chosen in this session is saved straight away, so the next visit finds it. Everything stays in this browser.
export default function useSourceLibrary() {
  const [folders, setFolders] = useState([]); const [files, setFiles] = useState([]); const [ready, setReady] = useState(false);
  const [persistent, setPersistent] = useState(true); const [usage, setUsage] = useState(null); const [error, setError] = useState('');
  const [busy, setBusy] = useState(''); const [pending, setPending] = useState(null); const [report, setReport] = useState(null);
  const cache = useRef(createSourceCache()); const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const refresh = useCallback(async () => {
    try {
      const list = await listFolders(); const next = await savedFiles(list);
      if (!alive.current) return; cache.current = createSourceCache(); setFolders(list); setFiles(next); setPersistent(await isPersistent()); setUsage(await storageUsage());
    } catch (e) { if (alive.current) setError(e.message || 'Impossibile leggere le cartelle salvate.'); } finally { if (alive.current) setReady(true); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const run = async (label, work) => { setBusy(label); setError(''); try { return await work(); } catch (e) { setError(e.message || 'Operazione non riuscita.'); return null; } finally { if (alive.current) setBusy(''); } };

  // Choose a folder. If one with the same name is already saved, the user decides (update, integrate, keep both) after seeing what would change.
  const add = () => run('Scelta della cartella…', async () => {
    const chosen = await chooseFolder(); if (!chosen.length) return null;
    const selection = inspectSelection(chosen);
    if (!selection.entries.length) throw new Error('La cartella scelta non contiene file di codice leggibili (restano esclusi node_modules, target, bin, immagini e file oltre 500 KB).');
    const same = folders.find(folder => folder.name === selection.name);
    if (same) { setPending({ selection, target: same, diff: diffSelection(same, selection.entries) }); return null; }
    return commit({ selection, mode: 'new' });
  });
  const commit = ({ selection, mode, target }) => run('Salvataggio…', async () => {
    const result = await saveSelection({ selection, mode, target, onProgress: (done, total) => { if (alive.current) setBusy(`Salvo ${done} file su ${total}…`); } });
    requestPersistence(); setPending(null); setReport({ name: result.record.name, ...result.diff, skipped: result.skipped, ignored: selection.ignored, tooBig: selection.tooBig });
    await refresh(); return result;
  });
  const resolvePending = mode => pending && commit({ selection: pending.selection, mode, target: mode === 'new' ? undefined : pending.target });
  const remove = id => run('Rimozione…', async () => { await removeFolder(id); await refresh(); });
  const toggle = (id, active) => run('', async () => { await setActive(id, active); await refresh(); });
  return { folders, files, cache: cache.current, ready, persistent, usage, error, busy, pending, report, add, resolvePending, cancelPending: () => setPending(null), remove, toggle, dismissReport: () => setReport(null), refresh };
}
