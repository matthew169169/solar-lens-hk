import { summary as calculateSummary, geojson as calculateGeojson } from './geometry.js';

// Feature arrays and metadata are replaced on edits. Polygon rings stay immutable.
// Weak keys allow geometry and derived results to be collected with their images.
function memoizeImage(calculate) {
  const cache = new WeakMap();
  return (image, settings) => {
    if (!image) return calculate(image, settings);
    const key = `${settings.tilt}|${settings.moduleArea}|${image.analyzed}|${image.name}|${image.date}`;
    const previous = cache.get(image);
    if (previous?.features === image.features && previous.meta === image.meta && previous.run === image.run && previous.key === key) return previous.result;
    const result = calculate(image, settings);
    cache.set(image, { features: image.features, meta: image.meta, run: image.run, key, result });
    return result;
  };
}

export const summary = memoizeImage(calculateSummary);
const imageGeojson = memoizeImage((image, settings) => calculateGeojson([image], settings));
export function cachedGeojson(images, settings) {
  const result = { type: 'FeatureCollection', features: [], skipped_unlocated_ids: [], generated_at: new Date().toISOString() };
  images.forEach((image, index) => {
    if (!image) return;
    const data = imageGeojson(image, settings);
    result.note = data.note;
    result.features.push(...data.features.map(feature => ({ ...feature, properties: { ...feature.properties, period: index % 2 ? 'newer' : 'older' } })));
    result.skipped_unlocated_ids.push(...data.skipped_unlocated_ids);
  });
  return result;
}
