const defaults = { tilt: '0', moduleArea: '2.2', threshold: '.35', gsd: '.10' };
export function normalizeSettings(input = {}, fallback = defaults) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid measurement settings.');
  const result = { ...defaults, ...fallback };
  for (const [key, min, max] of [['tilt', 0, 80], ['moduleArea', .1, 20], ['threshold', .1, .95]]) {
    if (input[key] === undefined) continue;
    if (key === 'tilt' && input[key] === '') { result[key] = ''; continue; }
    const value = Number(input[key]);
    if (input[key] === '' || input[key] === null || !Number.isFinite(value) || value < min || value > max) throw new Error(`Invalid ${key} setting.`);
    result[key] = String(value);
  }
  if (input.gsd !== undefined) {
    const gsd = Number(input.gsd);
    if (![.06, .1, .15].includes(gsd)) throw new Error('Invalid working resolution.');
    result.gsd = gsd === .1 ? '.10' : gsd === .06 ? '.06' : '.15';
  }
  return result;
}

export function validateProject(data) {
  if (!data || data.version !== 1 || !Array.isArray(data.images) || data.images.length !== 2) throw new Error('This is not a Solar Lens project file.');
  if (data.id != null && (typeof data.id !== 'string' || !data.id.length || data.id.length > 160)) throw new Error('Invalid project identifier.');
  if (data.settings) normalizeSettings(data.settings);
  let vertices = 0;
  for (const image of data.images.filter(Boolean)) {
    const m = image.meta;
    if (!m || !Number.isSafeInteger(m.width) || !Number.isSafeInteger(m.height) || m.width <= 0 || m.height <= 0 || m.width > 500000 || m.height > 500000 || !Array.isArray(image.features) || image.features.length > 50000) throw new Error('Invalid image metadata or too many solar areas.');
    if (typeof image.name !== 'string' || image.name.length > 1000 || (image.date != null && typeof image.date !== 'string')) throw new Error('Invalid photo name or date.');
    if (image.analyzed != null && typeof image.analyzed !== 'boolean') throw new Error('Invalid detection status.');
    if (m.metric != null && typeof m.metric !== 'boolean') throw new Error('Invalid image units.');
    if (image.previewSize && (!Number.isSafeInteger(image.previewSize.width) || !Number.isSafeInteger(image.previewSize.height) || image.previewSize.width < 1 || image.previewSize.height < 1)) throw new Error('Invalid preview dimensions.');
    if (m.affine && (!Array.isArray(m.affine) || m.affine.length !== 6 || m.affine.some(v => !Number.isFinite(v)))) throw new Error('Invalid map transform.');
    if (m.affine && m.metric && Math.abs(m.affine[0] * m.affine[4] - m.affine[1] * m.affine[3]) < 1e-15) throw new Error('Image scale cannot be zero.');
    if (m.crs && !/^EPSG:\d+$/.test(m.crs)) throw new Error('Invalid coordinate system.');
    if (typeof image.preview !== 'string' || (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image.preview) && !/^demo\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(image.preview))) throw new Error('Invalid project preview.');
    const ids = new Set();
    for (const feature of image.features) {
      if (typeof feature.id !== 'string' || !feature.id.length || feature.id.length > 100 || ids.has(feature.id)) throw new Error('Missing or duplicate solar-area identifier.');
      ids.add(feature.id);
      if (!Array.isArray(feature.rings) || !feature.rings.length) throw new Error('Invalid panel outline.');
      for (const ring of feature.rings) {
        if (!Array.isArray(ring) || ring.length < 4 || ring.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v) || Math.abs(v) > 1e7))) throw new Error('Invalid panel outline.');
        vertices += ring.length;
        if (vertices > 2000000) throw new Error('Project outlines exceed the supported size.');
        if (Math.abs(ring[0][0] - ring.at(-1)[0]) > 1e-6 || Math.abs(ring[0][1] - ring.at(-1)[1]) > 1e-6) throw new Error('Panel outlines must have closed rings.');
      }
      if (feature.count != null && (!Number.isSafeInteger(feature.count) || feature.count < 0)) throw new Error('Invalid panel count.');
      if (feature.tilt != null && (!Number.isFinite(feature.tilt) || feature.tilt < 0 || feature.tilt > 80)) throw new Error('Invalid panel tilt.');
      if (feature.moduleArea != null && (!Number.isFinite(feature.moduleArea) || feature.moduleArea < .1 || feature.moduleArea > 20)) throw new Error('Invalid module size.');
      if (feature.note != null && (typeof feature.note !== 'string' || feature.note.length > 1000)) throw new Error('Invalid review note.');
      if (feature.method != null && (typeof feature.method !== 'string' || feature.method.length > 1000)) throw new Error('Invalid detection method.');
      for (const flag of ['reviewed', 'excluded']) if (feature[flag] != null && typeof feature[flag] !== 'boolean') throw new Error('Invalid review status.');
    }
  }
  return data;
}

export function restoreImages(images) {
  // JSON files cannot supply runtime readers, cleanup functions or DOM objects.
  return images.map(image => image ? {
    name: image.name, sizeBytes: image.sizeBytes, sampleFingerprint: image.sampleFingerprint,
    previewSize: image.previewSize, date: image.date || '', meta: { ...image.meta, original: false },
    preview: image.preview, features: image.features, analyzed: !!image.analyzed, run: image.run,
  } : null);
}

export function mergeLibrary(existing, incoming) {
  if (!incoming || incoming.kind !== 'solar-lens-library' || incoming.version !== 1 || !Array.isArray(incoming.projects) || incoming.projects.length > 1000) throw new Error('This is not a Solar Lens library backup.');
  for (const project of incoming.projects) { validateProject(project); if (!project.id) throw new Error('A backup study is missing its identifier.'); }
  const records = new Map(existing.map(project => [project.id, project]));
  for (const project of incoming.projects) {
    const current = records.get(project.id);
    if (!current || (Date.parse(project.updatedAt) || 0) >= (Date.parse(current.updatedAt) || 0)) records.set(project.id, project);
  }
  return [...records.values()];
}

export function isOriginalReattachment(previous, uploaded) {
  return !!previous && !previous.read && previous.name === uploaded.name && previous.meta.width === uploaded.meta.width && previous.meta.height === uploaded.meta.height && (previous.sizeBytes == null || previous.sizeBytes === uploaded.sizeBytes) && (!previous.sampleFingerprint || previous.sampleFingerprint === uploaded.sampleFingerprint);
}
