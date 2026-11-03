import proj4 from 'proj4';
import { rasterBands } from './raster-bands.js';
import { previewWindow, previewDimensions } from './scan-plan.js';

const previewReaders = new WeakMap();

export async function fingerprintSample(file) {
  if (!globalThis.crypto?.subtle) return null;
  const first = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  const last = new Uint8Array(await file.slice(Math.max(65536, file.size - 65536)).arrayBuffer());
  const size = new TextEncoder().encode(String(file.size));
  const bytes = new Uint8Array(first.length + last.length + size.length);
  bytes.set(first); bytes.set(last, first.length); bytes.set(size, first.length + last.length);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export function canvas(width, height) {
  const c = document.createElement('canvas'); c.width = width; c.height = height; return c;
}
export function imageDataCanvas(data, w, h) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const rgba = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) { rgba[i * 4] = data[i * 3]; rgba[i * 4 + 1] = data[i * 3 + 1]; rgba[i * 4 + 2] = data[i * 3 + 2]; rgba[i * 4 + 3] = 255; }
  ctx.putImageData(new ImageData(rgba, w, h), 0, 0); return c;
}
function crsDefinition(code) {
  if (proj4.defs(`EPSG:${code}`)) return `EPSG:${code}`;
  if (code >= 32601 && code <= 32660) proj4.defs(`EPSG:${code}`, `+proj=utm +zone=${code - 32600} +datum=WGS84 +units=m +no_defs`);
  if (code >= 32701 && code <= 32760) proj4.defs(`EPSG:${code}`, `+proj=utm +zone=${code - 32700} +south +datum=WGS84 +units=m +no_defs`);
  return `EPSG:${code}`;
}
export async function openImage(file, { onProgress = () => {} } = {}) {
  onProgress(.02);
  let previewing = true;
  const isTiff = /\.tiff?$/i.test(file.name) || file.type.includes('tiff');
  let read, meta, dispose;
  if (isTiff) {
    const { fromBlob } = await import('geotiff');
    const tiff = await fromBlob(file, { cache: false });
    const im = await tiff.getImage();
    const fd = im.getFileDirectory(), keys = im.getGeoKeys();
    let affine = null;
    const transform = fd.ModelTransformation, scale = fd.ModelPixelScale, tie = fd.ModelTiepoint;
    if (transform) affine = [transform[0], transform[1], transform[3], transform[4], transform[5], transform[7]];
    else if (scale && tie) affine = [scale[0], 0, tie[3] - tie[0] * scale[0], 0, -scale[1], tie[4] + tie[1] * scale[1]];
    if (affine && keys?.GTRasterTypeGeoKey === 2) { affine[2] -= (affine[0] + affine[1]) / 2; affine[5] -= (affine[3] + affine[4]) / 2; }
    const code = keys?.ProjectedCSTypeGeoKey || keys?.GeographicTypeGeoKey;
    const crs = code && code !== 32767 ? crsDefinition(code) : null;
    const metric = !!(crs && (code === 2326 || code === 3857 || (code >= 32601 && code <= 32760) || keys?.ProjLinearUnitsGeoKey === 9001));
    meta = { width: im.getWidth(), height: im.getHeight(), affine, crs, metric, georefSource: affine && crs ? 'embedded GeoTIFF' : 'missing', original: true };
    read = async (window, width, height) => {
      const c = canvas(width, height), ctx = c.getContext('2d');
      const bands = rasterBands(window, width, height);
      for (const [index, band] of bands.entries()) {
        const rgb = await im.readRGB({ window: band.window, width: band.width, height: band.height, resampleMethod: 'bilinear', interleave: true });
        // readRGB can return RGBA on some TIFF versions; select RGB explicitly.
        const channels = rgb.length / (band.width * band.height);
        if (channels === 3) ctx.drawImage(imageDataCanvas(rgb, band.width, band.height), 0, band.y);
        else {
          const rgba = new Uint8ClampedArray(band.width * band.height * 4);
          for (let i = 0; i < band.width * band.height; i++) { for (let j = 0; j < 3; j++) rgba[i * 4 + j] = rgb[i * channels + j]; rgba[i * 4 + 3] = 255; }
          ctx.putImageData(new ImageData(rgba, band.width, band.height), 0, band.y);
        }
        if (bands.length > 1) await new Promise(resolve => setTimeout(resolve, 0));
        if (previewing) onProgress(.1 + .88 * (index + 1) / bands.length);
      }
      return c;
    };
  } else {
    const bitmap = await createImageBitmap(file);
    dispose = () => bitmap.close();
    meta = { width: bitmap.width, height: bitmap.height, affine: null, crs: null, metric: false, georefSource: 'missing', original: true };
    read = async (window, width, height) => {
      const c = canvas(width, height); c.getContext('2d').drawImage(bitmap, window[0], window[1], window[2] - window[0], window[3] - window[1], 0, 0, width, height); return c;
    };
  }
  try {
    const { width, height } = previewDimensions(meta.width, meta.height);
    const preview = await read([0, 0, meta.width, meta.height], width, height);
    previewing = false; onProgress(1);
    return { name: file.name, sizeBytes: file.size, sampleFingerprint: await fingerprintSample(file), previewSize: { width, height }, date: (file.name.match(/(?:19|20)\d{2}/) || [''])[0], meta, read, dispose, preview: preview.toDataURL('image/jpeg', .88), features: [], analyzed: false };
  } catch (error) { dispose?.(); throw error; }
}

export async function prepareDetectionImage(image) {
  if (image.read) return { ...image, sourceScale: 1, detectionSource: 'original photograph' };
  // Saved studies remain scannable without substituting any other photograph.
  let cached = previewReaders.get(image);
  if (!cached || cached.source !== image.preview) {
    const promise = (async () => {
      const response = await fetch(new URL(image.preview, document.baseURI));
      if (!response.ok) throw new Error('The current photo preview could not load. Reattach its original file.');
      const bitmap = await createImageBitmap(await response.blob());
      return { bitmap, width: bitmap.width, height: bitmap.height };
    })();
    cached = { source: image.preview, promise };
    previewReaders.set(image, cached);
    promise.catch(() => { if (previewReaders.get(image) === cached) previewReaders.delete(image); });
  }
  const preview = await cached.promise;
  return { ...image, sourceScale: Math.max(image.meta.width / preview.width, image.meta.height / preview.height, 1), detectionSource: 'reduced preview', read: async (window, width, height) => {
    const w = previewWindow(window, image.meta, preview), result = canvas(width, height);
    result.getContext('2d').drawImage(preview.bitmap, w[0], w[1], w[2] - w[0], w[3] - w[1], 0, 0, width, height);
    return result;
  } };
}

export function releaseImage(image) {
  image?.dispose?.();
  const cached = image && previewReaders.get(image);
  if (cached) { previewReaders.delete(image); cached.promise.then(p => p.bitmap.close()).catch(() => {}); }
}
