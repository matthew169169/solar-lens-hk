import { fromBlob } from 'geotiff';
import proj4 from 'proj4';

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
export async function openImage(file) {
  const isTiff = /\.tiff?$/i.test(file.name) || file.type.includes('tiff');
  let read, meta;
  if (isTiff) {
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
      const rgb = await im.readRGB({ window: window.map(Math.round), width, height, resampleMethod: 'bilinear', interleave: true });
      // readRGB can return RGBA on some TIFF versions; select RGB explicitly.
      const channels = rgb.length / (width * height);
      if (channels === 3) return imageDataCanvas(rgb, width, height);
      const c = canvas(width, height), rgba = new Uint8ClampedArray(width * height * 4);
      for (let i = 0; i < width * height; i++) { for (let j = 0; j < 3; j++) rgba[i * 4 + j] = rgb[i * channels + j]; rgba[i * 4 + 3] = 255; }
      c.getContext('2d').putImageData(new ImageData(rgba, width, height), 0, 0); return c;
    };
  } else {
    const bitmap = await createImageBitmap(file);
    meta = { width: bitmap.width, height: bitmap.height, affine: null, crs: null, metric: false, georefSource: 'missing', original: true };
    read = async (window, width, height) => {
      const c = canvas(width, height); c.getContext('2d').drawImage(bitmap, window[0], window[1], window[2] - window[0], window[3] - window[1], 0, 0, width, height); return c;
    };
  }
  const width = Math.min(1400, meta.width), height = Math.max(1, Math.round(meta.height * width / meta.width));
  const preview = await read([0, 0, meta.width, meta.height], width, height);
  return { name: file.name, date: (file.name.match(/(?:19|20)\d{2}/) || [''])[0], meta, read, preview: preview.toDataURL('image/jpeg', .88), features: [], analyzed: false };
}
