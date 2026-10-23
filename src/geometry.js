import proj4 from 'proj4';

proj4.defs('EPSG:2326', '+proj=tmerc +lat_0=22.3121333333333 +lon_0=114.178555555556 +k=1 +x_0=836694.05 +y_0=819069.8 +ellps=intl +towgs84=-162.619,-276.959,-161.764,0.067753,-2.243649,-1.158827,-1.094246 +units=m +no_defs');

export function ringArea(ring) {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) a += ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
  return Math.abs(a) / 2;
}
export function polygonArea(rings) {
  return Math.max(0, ringArea(rings[0] || []) - rings.slice(1).reduce((s, r) => s + ringArea(r), 0));
}
export function centroid(rings) {
  const ring = rings[0];
  let x = 0, y = 0, sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const c = ring[j][0] * ring[i][1] - ring[i][0] * ring[j][1];
    x += (ring[j][0] + ring[i][0]) * c; y += (ring[j][1] + ring[i][1]) * c; sum += c;
  }
  if (Math.abs(sum) < 1e-8) return ring[0];
  return [x / (3 * sum), y / (3 * sum)];
}
export function pixelToWorld(meta, point) {
  if (!meta.affine) return null;
  const [a, b, c, d, e, f] = meta.affine;
  return [a * point[0] + b * point[1] + c, d * point[0] + e * point[1] + f];
}
export function location(meta, point) {
  const p = pixelToWorld(meta, point);
  if (!p || !meta.crs) return null;
  try { return proj4(meta.crs, 'EPSG:4326', p); } catch { return null; }
}
export function pixelAreaM2(meta) {
  if (!meta.affine || !meta.metric) return null;
  const [a, b, , d, e] = meta.affine;
  return Math.abs(a * e - b * d);
}
export function measure(feature, meta, settings) {
  const factor = pixelAreaM2(meta);
  const position = location(meta, centroid(feature.rings));
  const mercatorCorrection = meta.crs === 'EPSG:3857' && position ? Math.cos(position[1] * Math.PI / 180) ** 2 : 1;
  const plan = factor == null ? null : polygonArea(feature.rings) * factor * mercatorCorrection;
  const tilt = settings.tilt === '' || settings.tilt == null ? null : Number(settings.tilt);
  const face = plan == null || tilt == null ? null : plan / Math.cos(tilt * Math.PI / 180);
  const known = Number.isInteger(feature.count) && feature.count >= 0;
  const moduleArea = Number(settings.moduleArea);
  const estimate = face != null && moduleArea > 0 ? Math.max(0, Math.round(face / moduleArea)) : null;
  return { plan, face, count: known ? feature.count : estimate, estimated: !known, position };
}
export function summary(image, settings) {
  if (!image || !image.analyzed) return null;
  const active = image.features.filter(f => !f.excluded);
  const measured = active.map(f => measure(f, image.meta, settings));
  return {
    arrays: active.length,
    count: measured.some(m => m.count == null) ? null : measured.reduce((s, m) => s + m.count, 0),
    estimated: measured.some(m => m.estimated),
    plan: pixelAreaM2(image.meta) == null ? null : measured.reduce((s, m) => s + m.plan, 0),
    face: pixelAreaM2(image.meta) == null || settings.tilt === '' ? null : measured.reduce((s, m) => s + m.face, 0),
    reviewed: active.filter(f => f.reviewed).length,
  };
}
export function compareCoverage(a, b) {
  if (!a || !b) return { ok: false, message: 'Load both photographs to compare.' };
  if (!a.affine || !b.affine || !a.crs || !b.crs) return { ok: false, message: 'Georeference both photos to verify matching coverage.' };
  const bounds = meta => {
    const corners = [[0, 0], [meta.width, 0], [meta.width, meta.height], [0, meta.height]].map(p => location(meta, p));
    if (corners.some(p => !p)) return null;
    return [Math.min(...corners.map(p => p[0])), Math.min(...corners.map(p => p[1])), Math.max(...corners.map(p => p[0])), Math.max(...corners.map(p => p[1]))];
  };
  const x = bounds(a), y = bounds(b);
  if (!x || !y) return { ok: false, message: 'Unsupported coordinate system: comparison is unverified.' };
  const overlap = Math.max(0, Math.min(x[2], y[2]) - Math.max(x[0], y[0])) * Math.max(0, Math.min(x[3], y[3]) - Math.max(x[1], y[1]));
  const area = p => (p[2] - p[0]) * (p[3] - p[1]);
  const ratio = overlap / Math.max(area(x), area(y));
  return ratio > 0.98 ? { ok: true, message: 'Matching geographic coverage. Check local roof alignment before interpreting change.' } : { ok: false, message: 'Coverage differs. Compare identical boundaries for valid changes.' };
}
export function geojson(images, settings) {
  const missing = [];
  const features = [];
  images.forEach((image, index) => {
    if (!image?.analyzed) return;
    image.features.filter(f => !f.excluded).forEach(f => {
      const m = measure(f, image.meta, settings);
      const rings = f.rings.map(r => r.map(p => location(image.meta, p)));
      if (rings.some(r => r.some(p => !p))) { missing.push(f.id); return; }
      features.push({ type: 'Feature', geometry: { type: 'Polygon', coordinates: rings }, properties: {
        id: f.id, period: index % 2 ? 'newer' : 'older', image: image.name, date: image.date,
        count: m.count, count_method: m.estimated ? 'area-based estimate' : 'manual count',
        plan_area_m2: m.plan, face_area_m2: m.face,
        assumed_tilt_deg: settings.tilt === '' ? null : Number(settings.tilt), module_face_area_m2: Number(settings.moduleArea),
        reviewed: f.reviewed, confidence: f.score ?? null, method: f.method || 'AI segmentation',
      } });
    });
  });
  return { type: 'FeatureCollection', features, skipped_unlocated_ids: missing, generated_at: new Date().toISOString(), note: 'AI candidates require review. Counts are estimates unless manually entered. Areas depend on image scale and assumed tilt.' };
}
export function csvCell(value) {
  let s = value == null ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
