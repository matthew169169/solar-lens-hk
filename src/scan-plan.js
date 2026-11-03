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
