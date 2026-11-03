import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { summary as uncachedSummary, geojson } from '../src/geometry.js';
import { summary as cachedSummary } from '../src/measurement-cache.js';
import { libraryGeojson } from '../src/library.js';

const manifest = JSON.parse(readFileSync(new URL('../public/demo/manifest.json', import.meta.url)));
const settings = { tilt: '0', moduleArea: '2.2', gsd: '.10' };
const projects = manifest.pairs.map(p => ({ ...JSON.parse(readFileSync(new URL('../public/' + p.path, import.meta.url))), id: p.id, settings }));
const images = projects.flatMap(p => p.images);
function time(passes, fn) {
  const start = performance.now();
  for (let i = 0; i < passes; i++) fn();
  return +(performance.now() - start).toFixed(2);
}
// Both paths include their first cold pass. Remaining passes model revisiting
// unchanged views. This measures calculations, not drawing, I/O or inference.
const result = {
  images: images.length,
  regions: images.reduce((n, im) => n + im.features.length, 0),
  summary_12_passes_ms: {
    uncached: time(12, () => images.forEach(im => uncachedSummary(im, settings))),
    cached: time(12, () => images.forEach(im => cachedSummary(im, settings))),
  },
  geography_6_passes_ms: {
    uncached: time(6, () => projects.forEach(p => geojson(p.images, settings))),
    cached: time(6, () => libraryGeojson(projects, settings)),
  },
};
console.log(JSON.stringify(result, null, 2));
