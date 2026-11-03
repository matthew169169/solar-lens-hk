// These are the original supplied places, independent of network availability.
export const originalPlaceIds = ['haeco', 'fairviewpark', 'honglokyuen', 'lamma', 'saikung', 'taipo', 'tmt', 'yl', 'cheungchau', 'ymt', 'sheko'];
export function isOriginalStudy(project) {
  return !!project && originalPlaceIds.some(id => project.datasetId === id || project.id === `dataset-${id}`);
}
export function shouldStoreStudy(project) {
  return !!project && (isOriginalStudy(project) || project.saveMode === 'saved');
}
export function planLibraryCleanup(projects, current) {
  const records = new Map(projects.map(project => [project.id, project]));
  if (current?.images?.some(Boolean)) {
    const saved=records.get(current.id);
    if(!saved||(Date.parse(current.updatedAt)||0)>=(Date.parse(saved.updatedAt)||0))records.set(current.id,current);
  }
  const kept = [], removed = [];
  for (const project of records.values()) (shouldStoreStudy(project) ? kept : removed).push(project);
  return { kept, removed, current: shouldStoreStudy(current) ? current : null };
}
