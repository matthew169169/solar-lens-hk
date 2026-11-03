import clipping from 'polygon-clipping';
import { canvas } from './imagery.js';
import { polygonArea, pixelAreaM2 } from './geometry.js';
import { scanWorkload } from './scan-plan.js';

let worker, ready, nextId = 0, generation = 0;
const pending = new Map();
function call(message, transfer = []) {
  if (!worker) {
    const current = new Worker(new URL('./inference.worker.js', import.meta.url), { type: 'module' });
    worker = current;
    current.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; pending.delete(data.id); data.error ? p.reject(new Error(data.error)) : p.resolve(data.result); };
    current.onerror = () => { if (worker !== current) return; for (const p of pending.values()) p.reject(new Error('Browser inference failed. Reload and try a smaller image.')); pending.clear(); current.terminate(); worker = null; ready = null; };
  }
  return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); try { worker.postMessage({ ...message, id }, transfer); } catch (e) { pending.delete(id); reject(e); } });
}
export function cancelDetection() {
  generation++;
  if (worker) worker.terminate(); worker = null; ready = null;
  for (const p of pending.values()) p.reject(new Error('Detection cancelled.')); pending.clear();
}
export async function detect(image, options, onProgress) {
  const started = performance.now();
  const runGeneration = generation;
  const checkCancelled = () => { if (generation !== runGeneration) throw new Error('Detection cancelled.'); };
  if (!image.read) throw new Error('The current photograph is not readable. Reattach its original file.');
  onProgress(0, 'Loading solar detector…');
  if (!ready) {
    const loading = call({ type: 'load', base: new URL(import.meta.env.BASE_URL, location.href).href });
    ready = loading;
    loading.catch(() => { if (ready === loading) ready = null; });
  }
  await ready;
  checkCancelled();
  const { width, height } = image.meta;
  const areaFactor = pixelAreaM2(image.meta);
  const { scale, nativeGsd, tiles: total } = scanWorkload(image.meta, options, image.sourceScale || 1);
  // Limit downsampling to the requested working GSD; never invent detail by upsampling.
  const stride = 512 * scale, margin = 64 * scale;
  const nx = Math.ceil(width / stride), ny = Math.ceil(height / stride);
  const polys = [];
  const padded = canvas(640, 640), ctx = padded.getContext('2d', { willReadFrequently: true });
  let done = 0;
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
    checkCancelled();
    const corex = cx * stride, corey = cy * stride;
    const x0 = Math.max(0, corex - margin), y0 = Math.max(0, corey - margin);
    const x1 = Math.min(width, x0 + 640 * scale), y1 = Math.min(height, y0 + 640 * scale);
    const w = Math.min(640, Math.max(1, Math.round((x1 - x0) / scale))), h = Math.min(640, Math.max(1, Math.round((y1 - y0) / scale)));
    const tile = await image.read([x0, y0, x1, y1], w, h);
    checkCancelled();
    ctx.fillStyle = 'rgb(114,114,114)'; ctx.fillRect(0, 0, 640, 640); ctx.drawImage(tile, 0, 0);
    tile.width = 0; tile.height = 0;
    const pixels = ctx.getImageData(0, 0, 640, 640).data.buffer;
    const result = await call({ type: 'infer', pixels, threshold: Number(options.threshold) }, [pixels]);
    const xmax = Math.min(width, corex + stride), ymax = Math.min(height, corey + stride);
    const core = [[[corex, corey], [xmax, corey], [xmax, ymax], [corex, ymax], [corex, corey]]];
    for (const poly of result.polygons) {
      const transformed = poly.map(r => r.map(([x, y]) => [x0 + x / w * (x1 - x0), y0 + y / h * (y1 - y0)]));
      const clipped = clipping.intersection(transformed, core);
      for (const p of clipped) if (polygonArea(p) > 0) polys.push(p);
    }
    onProgress(++done / total, `Scanning ${image.name} · tile ${done} of ${total}`);
    // Let uploads, cancellation and progress paint between tile reads.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  onProgress(.99, 'Merging tile boundaries and removing overlaps…');
  checkCancelled();
  let merged = [];
  // Bound the number of arguments and the size of each union operation.
  for (let i = 0; i < polys.length; i += 150) {
    checkCancelled();
    merged = clipping.union(merged, ...polys.slice(i, i + 150));
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  checkCancelled();
  padded.width = 0; padded.height = 0;
  const minPixels = areaFactor ? .3 / areaFactor : 12;
  const features = merged.filter(r => polygonArea(r) >= minPixels).map((rings, i) => ({ id: `A${String(i + 1).padStart(3, '0')}`, rings, score: null, count: null, reviewed: false, excluded: false, method: 'YOLOv8s solar segmentation, tiled mask union' }));
  return { features, run: { model: 'finloop/yolov8s-seg-solar-panels', image: image.name, source: image.detectionSource || 'original photograph', confidenceThreshold: Number(options.threshold), workingGsdM: nativeGsd ? nativeGsd * scale : null, tiles: total, elapsedSeconds: +(performance.now() / 1000 - started / 1000).toFixed(2), timestamp: new Date().toISOString(), reviewRequired: true } };
}
