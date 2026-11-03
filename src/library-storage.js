import { isOriginalStudy, shouldStoreStudy } from './library-policy.js';

export function openDatabase() {
  return new Promise((resolve, reject) => {
    let blocked = false;
    const request = indexedDB.open('solar-lens-hk', 3);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects');
      if (!db.objectStoreNames.contains('saved')) db.createObjectStore('saved', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('removed')) db.createObjectStore('removed', { keyPath: 'id' });
    };
    request.onsuccess = () => blocked ? request.result.close() : resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => { blocked = true; reject(new Error('Close other Solar Lens tabs, then reload to update the library.')); };
  });
}
function transaction(db, stores, change) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Library update was interrupted.'));
    try { change(tx); } catch (error) { tx.abort(); reject(error); }
  });
}
export function readRecords(db, store, key) {
  return new Promise((resolve, reject) => {
    const source = db.transaction(store).objectStore(store);
    const request = key === undefined ? source.getAll() : source.get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export function writeRecords(db, current, records) {
  return transaction(db, ['projects', 'saved'], tx => {
    if (shouldStoreStudy(current)) tx.objectStore('projects').put(current, 'current');
    for (const project of records) if (shouldStoreStudy(project) && project.images.some(Boolean)) tx.objectStore('saved').put(project);
  });
}
export async function archiveRecords(db, projects) {
  if (projects.some(isOriginalStudy)) throw new Error('Original supplied places cannot be removed.');
  const ids = new Set(projects.map(p => p.id));
  const removed = projects.map(project => ({ id: project.id, project, removedAt: new Date().toISOString() }));
  await transaction(db, ['projects', 'saved', 'removed'], tx => {
    for (const record of removed) {
      tx.objectStore('removed').put(record);
      tx.objectStore('saved').delete(record.id);
    }
    const request = tx.objectStore('projects').get('current');
    request.onsuccess = () => { if (request.result && (ids.has(request.result.id) || !shouldStoreStudy(request.result))) tx.objectStore('projects').delete('current'); };
  });
  return removed;
}
export function restoreRecord(db, project) {
  if (!shouldStoreStudy(project)) throw new Error('Choose Save before restoring a place to the library.');
  return transaction(db, ['saved', 'removed'], tx => {
    tx.objectStore('saved').put(project);
    tx.objectStore('removed').delete(project.id);
  });
}
export function forgetRemoved(db, ids) {
  return transaction(db, ['removed'], tx => ids.forEach(id => tx.objectStore('removed').delete(id)));
}
