import clipping from 'polygon-clipping';
import { canvas } from './imagery.js';
import { polygonArea, pixelAreaM2 } from './geometry.js';

let worker, ready, nextId = 0;
const pending = new Map();
function call(message, transfer = []) {
  if (!worker) {
    worker = new Worker(new URL('./inference.worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = ({ data }) => { const p = pending.get(data.id); if (!p) return; pending.delete(data.id); data.error ? p.reject(new Error(data.error)) : p.resolve(data.result); };
    worker.onerror = () => { for (const p of pending.values()) p.reject(new Error('Browser inference failed. Reload and try a smaller image.')); pending.clear(); worker.terminate(); worker = null; ready = null; };
  }
  return new Promise((resolve, reject) => { const id = ++nextId; pending.set(id, { resolve, reject }); worker.postMessage({ ...message, id }, transfer); });
}
export function cancelDetection() {
  if (worker) worker.terminate(); worker = null; ready = null;
  for (const p of pending.values()) p.reject(new Error('Detection cancelled.')); pending.clear();
}
export async function detect(image, options, onProgress) {
  if (!image.meta.original || !image.read) throw new Error('Re-upload the original photograph to run detection on a saved project.');
  onProgress(0, 'Loading solar detector…');
  if (!ready) ready = call({ type: 'load', base: new URL(import.meta.env.BASE_URL, location.href).href }).catch(e => { ready = null; throw e; });
  await ready;
  const { width, height } = image.meta;
  const areaFactor = pixelAreaM2(image.meta);
  const nativeGsd = areaFactor ? Math.sqrt(areaFactor) : null;
  // Limit downsampling to the requested working GSD; never invent detail by upsampling.
  const scale = nativeGsd ? Math.max(1, Number(options.gsd) / nativeGsd) : 1;
  const stride = 512 * scale, margin = 64 * scale;
  const nx = Math.ceil(width / stride), ny = Math.ceil(height / stride), total = nx * ny;
  const polys = [], scores = [];
  let done = 0;
  for (let cy = 0; cy < ny; cy++) for (let cx = 0; cx < nx; cx++) {
    const corex = cx * stride, corey = cy * stride;
    const x0 = Math.max(0, corex - margin), y0 = Math.max(0, corey - margin);
    const x1 = Math.min(width, x0 + 640 * scale), y1 = Math.min(height, y0 + 640 * scale);
    const w = Math.min(640, Math.max(1, Math.round((x1 - x0) / scale))), h = Math.min(640, Math.max(1, Math.round((y1 - y0) / scale)));
    const tile = await image.read([x0, y0, x1, y1], w, h);
    const padded = canvas(640, 640), ctx = padded.getContext('2d');
    ctx.fillStyle = 'rgb(114,114,114)'; ctx.fillRect(0, 0, 640, 640); ctx.drawImage(tile, 0, 0);
    const pixels = ctx.getImageData(0, 0, 640, 640).data.buffer;
    const result = await call({ type: 'infer', pixels, threshold: Number(options.threshold) }, [pixels]);
    const xmax = Math.min(width, corex + stride), ymax = Math.min(height, corey + stride);
    const core = [[[corex, corey], [xmax, corey], [xmax, ymax], [corex, ymax], [corex, corey]]];
    for (const poly of result.polygons) {
      const transformed = poly.map(r => r.map(([x, y]) => [x0 + x / w * (x1 - x0), y0 + y / h * (y1 - y0)]));
      const clipped = clipping.intersection(transformed, core);
      for (const p of clipped) if (polygonArea(p) > 0) { polys.push(p); scores.push(result.score); }
    }
    onProgress(++done / total, `Scanning ${image.name} · tile ${done} of ${total}`);
    // Let uploads, cancellation and progress paint between tile reads.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  onProgress(.99, 'Merging tile boundaries and removing overlaps…');
  let merged = [];
  // Bound the number of arguments and the size of each union operation.
  for (let i = 0; i < polys.length; i += 150) merged = clipping.union(merged, ...polys.slice(i, i + 150));
  const minPixels = areaFactor ? .3 / areaFactor : 12;
  const features = merged.filter(r => polygonArea(r) >= minPixels).map((rings, i) => ({ id: `A${String(i + 1).padStart(3, '0')}`, rings, score: null, count: null, reviewed: false, excluded: false, method: 'YOLOv8s solar segmentation, tiled mask union' }));
  return { features, run: { model: 'finloop/yolov8s-seg-solar-panels', confidenceThreshold: Number(options.threshold), workingGsdM: nativeGsd ? nativeGsd * scale : null, tiles: total, timestamp: new Date().toISOString(), reviewRequired: true } };
}
