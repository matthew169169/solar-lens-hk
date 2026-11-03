// Writes start immediately instead of waiting for a debounce that can lose edits
// on reload. While one transaction runs, only the latest record per study waits.
export function createSaveQueue(write, onStatus = () => {}) {
  let running = null, latest, revision = 0;
  const pending = new Map();
  async function drain() {
    try {
      while (pending.size) {
        const batch = [...pending.values()], current = latest, version = revision;
        await write(current, batch);
        for (const item of batch) if (pending.get(item.id) === item) pending.delete(item.id);
        if (version === revision) onStatus('saved');
      }
    } catch (error) { onStatus('error', error); }
    finally { running = null; }
  }
  function enqueueAll(projects, current) {
    latest = current; revision++; for (const project of projects) pending.set(project.id, project); onStatus('saving');
    if (!running) running = Promise.resolve().then(drain);
    return running;
  }
  return {
    enqueue(project) { return enqueueAll([project], project); },
    enqueueAll,
    retry() { if (!running && pending.size) { onStatus('saving'); running = Promise.resolve().then(drain); } return running || Promise.resolve(); },
    get pending() { return pending.size; },
  };
}
