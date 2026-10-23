// GeoTIFF.js allocates the native window before resampling. Split reads into
// native-pixel-bounded bands, including the navigation preview of a giant TIFF.
export function rasterBands(window, outputWidth, outputHeight, limit = 4_000_000) {
  const [left, top, right, bottom] = window.map(Math.round);
  const nativeWidth = right - left, nativeHeight = bottom - top;
  if (nativeWidth <= 0 || nativeHeight <= 0 || outputWidth <= 0 || outputHeight <= 0) throw new Error('Invalid raster read dimensions.');
  if (nativeWidth * nativeHeight <= limit) return [{ window: [left, top, right, bottom], width: outputWidth, height: outputHeight, y: 0 }];
  const ratio = nativeHeight / outputHeight;
  const height = Math.max(1, Math.floor((limit / nativeWidth - 1) / ratio));
  if (Math.ceil(ratio) * nativeWidth > limit) throw new Error('This image is too large for a browser preview. Crop it or provide an overview-enabled GeoTIFF.');
  const bands = [];
  for (let y = 0; y < outputHeight; y += height) {
    const yEnd = Math.min(outputHeight, y + height);
    const y0 = top + Math.round(y * ratio), y1 = top + Math.round(yEnd * ratio);
    bands.push({ window: [left, y0, right, y1], width: outputWidth, height: yEnd - y, y });
  }
  return bands;
}
