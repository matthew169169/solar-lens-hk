import { cachedGeojson as geojson } from './measurement-cache.js';

export const projectSettings = (project, fallback) => project.settings || fallback;

export function libraryGeojson(projects, fallback) {
  const combined = { type: 'FeatureCollection', features: [], skipped_unlocated_ids: [], generated_at: new Date().toISOString() };
  for (const project of projects) {
    const data = geojson(project.images, projectSettings(project, fallback));
    combined.note = data.note;
    combined.features.push(...data.features.map(f => ({ ...f, properties: { ...f.properties, study_id: project.id, study: project.title } })));
    combined.skipped_unlocated_ids.push(...data.skipped_unlocated_ids.map(id => `${project.id}:${id}`));
  }
  return combined;
}
