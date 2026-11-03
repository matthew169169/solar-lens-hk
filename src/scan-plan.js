// Snapshot the exact images selected by the user. Detection never chooses a demo.
export function planScan(images, active, scope = 'current') {
  const indices = scope === 'both' ? [0, 1] : [active];
  const pending = indices.filter(index => images[index]).map(index => ({ index, image: images[index] }));
  if (!pending.length) throw new Error('Upload or select a photograph to scan.');
  return pending;
}

export function commitScan(images, pending, results) {
  if (pending.length !== results.length || pending.some(({ index, image }) => images[index] !== image)) throw new Error('The selected photograph changed. Results were not applied.');
  pending.forEach(({ image }, i) => { image.features = results[i].features; image.run = results[i].run; image.analyzed = true; });
}

export function previewWindow(window, original, preview) {
  return [window[0] * preview.width / original.width, window[1] * preview.height / original.height, window[2] * preview.width / original.width, window[3] * preview.height / original.height];
}

export function previewDimensions(width, height, limit = 1400) {
  const scale = Math.min(1, limit / width, limit / height);
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

export function comparisonQuality(images) {
  const year = im => Number(String(im?.date || '').match(/(?:19|20)\d{2}/)?.[0]);
  const older = year(images[0]), newer = year(images[1]);
  const a = images[0]?.run?.workingGsdM, b = images[1]?.run?.workingGsdM;
  return {
    reversed: !!(older && newer && older > newer),
    mixedResolution: !!(a > 0 && b > 0 && Math.max(a, b) / Math.min(a, b) > 1.25),
  };
}

export function scanWorkload(meta, settings, sourceScale = 1) {
  const a = meta.affine;
  const area = a && meta.metric ? Math.abs(a[0] * a[4] - a[1] * a[3]) : null;
  const nativeGsd = area > 0 ? Math.sqrt(area) : null;
  const scale = Math.max(sourceScale, nativeGsd ? Number(settings.gsd) / nativeGsd : 1, 1);
  return { scale, nativeGsd, tiles: Math.ceil(meta.width / (512 * scale)) * Math.ceil(meta.height / (512 * scale)), workingGsdM: nativeGsd ? nativeGsd * scale : null };
}
