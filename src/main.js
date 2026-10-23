import './style.css';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import clipping from 'polygon-clipping';
import { openImage } from './imagery.js';
import { detect, cancelDetection } from './detector.js';
import { summary, measure, centroid, polygonArea, geojson, compareCoverage, csvCell, pixelAreaM2 } from './geometry.js';

const icons = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v6h16v-6"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M4 17v4h16v-4"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8l10-5Zm-9 9 9 5 9-5M3 16l9 5 9-5"/>',
  scan: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10m-5-5v10"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  leaf: '<path d="M20 3C7 1 1 9 6 16s14 1 14-13ZM5 21l10-11"/>',
};
const icon = (name, cls = '') => `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const number = (v, digits = 0) => v == null || !Number.isFinite(v) ? '—' : new Intl.NumberFormat('en', { maximumFractionDigits: digits }).format(v);
const state = { title: 'Hong Kong solar survey', images: [null, null], settings: { tilt: '0', moduleArea: '2.2', threshold: '.35', gsd: '.10' }, tab: 'overview', active: 1, selected: null, overlay: true, tool: 'select', drawing: [], busy: false, progress: 0, status: '', views: [null, null], manifest: [], filter: 'all' };
let leaflet, saveTimer, toastTimer;
const $ = s => document.querySelector(s);
const root = $('#app');

root.innerHTML = `
<aside class="sidebar">
  <a class="brand" href="./" aria-label="Solar Lens home"><span class="brand-mark">${icon('sun')}</span><span>solar<span class="brand-light">lens</span><small>HONG KONG</small></span></a>
  <div class="nav-label">WORKSPACE</div>
  <nav aria-label="Main navigation"><button class="nav-button active" data-tab="overview">${icon('grid')} Comparison <span class="nav-count">01</span></button><button class="nav-button" data-tab="studies">${icon('layers')} All study sites</button><button class="nav-button" data-tab="map">${icon('map')} Panel locations</button><button class="nav-button" data-tab="method">${icon('info')} Method & accuracy</button></nav>
  <div class="side-divider"></div>
  <div class="nav-label">YOUR STUDY</div>
  <label class="side-label" for="site-select">Explore supplied photographs</label><select id="site-select" aria-label="Choose study site"><option value="">Loading study sites…</option></select>
  <button class="side-action" id="new-study">${icon('plus')} New comparison</button>
  <button class="side-action" id="import-project">${icon('upload')} Open saved project</button>
  <input type="file" id="project-file" accept="application/json,.json" hidden />
  <div class="side-bottom"><span class="live-dot"></span> Photos stay on this device<p>Detection runs in your browser.<br>No API key. No photo uploads.</p><span class="side-version">SOLAR LENS HK / v1.0</span></div>
</aside>
<div class="shell">
  <header class="topbar"><div class="breadcrumb">Workspace <span>/</span> <strong>Solar monitoring</strong></div><div class="top-actions"><span class="save-status" id="save-status">Saved on this device</span><button class="button small" id="export-open">${icon('download')} Export results</button><span class="avatar">HK</span></div></header>
  <main>
    <section class="page-heading"><div><div class="eyebrow"><span></span> A NEW PERSPECTIVE ON CLEAN ENERGY</div><h1>See the change.</h1><p>Compare the past. Measure the present. Map Hong Kong’s solar growth.</p></div><button class="button primary" id="run-detection">${icon('scan')} Detect & compare</button></section>
    <section class="study-bar"><div class="study-title">${icon('layers')}<input id="study-title" value="Hong Kong solar survey" aria-label="Study name" /></div><button class="live-sample" id="live-sample">${icon('scan')} Try live detection</button><div class="study-meta" id="study-meta">Load two photographs to begin</div></section>
    <div id="progress" class="progress-panel" hidden><div><span class="spinner"></span><span id="progress-text">Preparing detector…</span><button id="cancel" class="text-button">Cancel</button></div><progress id="progress-value" max="1" value="0"></progress></div>
    <div id="error" class="error-panel" role="alert" hidden></div>
    <section id="overview-page">
      <div class="metric-grid" id="metrics"></div>
      <div class="section-heading"><div><h2>Then & now <span class="pill">AERIAL COMPARISON</span></h2><p id="coverage-note">Use photographs of the same area for a meaningful comparison.</p></div><div class="view-tools"><button class="icon-button" id="overlay-toggle" title="Toggle detection outlines" aria-label="Toggle detection outlines">${icon('layers')}</button><button class="button small" id="fit-view">Fit view</button></div></div>
      <div class="comparison-grid" id="image-panels"></div>
      <div class="comparison-caption"><span><i class="key green"></i> Detected solar area <i class="key gold"></i> Selected area</span><span>Scroll to zoom · drag to pan · click an outline to review</span></div>
      <section class="settings-card"><div class="settings-intro">${icon('scan')}<div><h3>Measurement settings</h3><p>Make assumptions visible. Refine them as you review.</p></div></div><label>Panel tilt <span>degrees from horizontal</span><input id="tilt" type="number" min="0" max="80" step="1" value="0" placeholder="Unknown" /></label><label>Module face area <span>m² per individual panel</span><input id="module-area" type="number" min="0.1" max="20" step="0.01" value="2.2" /></label><label>Detection confidence <span>lower finds more candidates</span><input id="threshold" type="number" min="0.1" max="0.95" step="0.05" value=".35" /></label><label>Working resolution <span>metres per pixel</span><select id="gsd"><option value=".06">0.06 m · detailed</option><option value=".10" selected>0.10 m · balanced</option><option value=".15">0.15 m · faster</option></select></label></section>
      <div class="assumption-note" id="assumptions"></div>
      <section class="inventory-card"><div class="inventory-heading"><div><h2>Solar area inventory</h2><p>Review candidates, correct counts, and remove false detections.</p></div><div class="segmented" id="period-tabs"><button data-period="0">Older photo</button><button data-period="1" class="active">Newer photo</button></div></div><div class="inventory-toolbar"><div class="toolbar-left"><select id="review-filter" aria-label="Filter detections"><option value="all">All areas</option><option value="unreviewed">Needs review</option><option value="reviewed">Reviewed</option><option value="excluded">Excluded</option></select><span id="inventory-count"></span></div><button class="button small" id="draw-area">${icon('plus')} Draw missed area</button></div><div id="inventory"></div></section>
    </section>
    <section id="studies-page" hidden><div class="section-heading"><div><h2>The supplied study, in one place.</h2><p>11 places · 22 photographs · 4.95 km² newer coverage · mixed image years</p></div><button class="button small" id="export-all">${icon('download')} Export all sites</button></div><div class="assumption-note">These are unreviewed AI candidate measurements from the supplied files. Individual counts use the current tilt and module-area assumptions. They are not a verified inventory of all Hong Kong. Edits in the comparison workspace are exported with that workspace; this table retains the original supplied study results.</div><div id="study-totals" class="metric-grid"></div><section class="inventory-card"><div id="all-studies-table"></div></section></section>
    <section id="map-page" hidden><div class="section-heading"><div><h2>Where the panels are</h2><p>Georeferenced outlines, coloured by period. Click an area to inspect its measurements.</p></div><div class="segmented" id="map-period"><button data-map-period="0">Older</button><button data-map-period="1" class="active">Newer</button><button data-map-period="both">Both</button></div></div><div id="map" class="map"></div><div id="map-note" class="assumption-note"></div></section>
    <section id="method-page" hidden class="method-page"><div class="method-hero">${icon('leaf')}<h2>Useful measurements.<br>Honest uncertainty.</h2><p>Solar Lens turns aerial photographs into a reviewable solar inventory. AI proposes areas. You verify the findings.</p></div><div class="method-grid"><article><span>01</span><h3>Detect solar-covered pixels</h3><p>A pretrained YOLOv8s segmentation model scans overlapping image tiles. Masks are cropped to non-overlapping tile cores and merged, so overlaps are not counted twice. Each connected solar region is an “area”, not necessarily a complete installation.</p></article><article><span>02</span><h3>Count individual panels</h3><p>The model detects solar areas, not reliable individual module boundaries. Initial panel counts are estimates: tilted face area divided by the module area you specify, rounded per area. Enter a visible module count in the inventory to replace an estimate. Reviewed does not automatically mean an exact count.</p></article><article><span>03</span><h3>Measure two kinds of area</h3><p>Plan area uses segmentation outlines and the GeoTIFF pixel-to-map transform. Face area = plan area ÷ cos(tilt). Tilt starts at an explicitly assumed 0°. Clear the tilt field if it is unknown: face area and estimated counts become unavailable. Image scale, masks and tilt all affect accuracy.</p></article><article><span>04</span><h3>Keep locations meaningful</h3><p>EPSG:2326 (Hong Kong 1980 Grid), WGS84, Web Mercator and WGS84 UTM zones are supported. Plain images need scale and map alignment before metric measurements or location export. Geographic pixels in degrees are not treated as square metres. A map coordinate is not proof of survey accuracy.</p></article></div><div class="method-callout"><h3>Before using a change total</h3><p>Use identical geographic coverage and actual photo dates. Check roof alignment, shadows and occlusion. Inspect areas with no detections, especially in older images. Replacements, removals and obscured panels may affect the result. The pretrained model has not been calibrated for a guaranteed Hong Kong accuracy.</p><p>The supplied images span filenames from 2016–2017 and 2025–2026. Dates are editable and are not verified acquisition dates. The 2017 HAECO and Lamma originals lack geographic metadata; any recovered registration is documented with the dataset.</p></div><div class="method-links"><a href="https://huggingface.co/finloop/yolov8s-seg-solar-panels" target="_blank" rel="noreferrer">Model & attribution ↗</a><a href="https://www.landsd.gov.hk/en/spatial-data/open-data.html/1000" target="_blank" rel="noreferrer">Hong Kong geospatial data ↗</a><a href="https://github.com/matthew169169/solar-lens-hk" target="_blank" rel="noreferrer">Project on GitHub ↗</a></div></section>
    <footer><span>solar<strong>lens</strong> <span class="footer-separator">/</span> Small details. A bigger picture.</span><span>HONG KONG · AERIAL SOLAR OBSERVATORY</span></footer>
  </main>
</div>
<dialog id="export-dialog"><div class="dialog-heading"><h2>Take your findings further.</h2><button class="icon-button" data-close="export-dialog" aria-label="Close">${icon('close')}</button></div><p>Exports preserve review status and measurement assumptions.</p><button class="export-option" id="export-csv">${icon('grid')}<span><strong>Measurements spreadsheet</strong><small>CSV · both periods, counts, areas and coordinates</small></span>${icon('download')}</button><button class="export-option" id="export-geojson">${icon('map')}<span><strong>Geographic outlines</strong><small>GeoJSON · WGS84 polygons for QGIS and maps</small></span>${icon('download')}</button><button class="export-option" id="export-project">${icon('layers')}<span><strong>Save the whole project</strong><small>JSON · outlines, previews, dates and settings</small></span>${icon('download')}</button><p class="small-note">Original full-resolution files stay on your device. Reattach them to rerun detection after reopening a project.</p></dialog>
<dialog id="review-dialog"><div class="dialog-heading"><h2 id="review-title">Review solar area</h2><button class="icon-button" data-close="review-dialog" aria-label="Close">${icon('close')}</button></div><div id="review-detail"></div><label class="field-label">Verified individual panel count<input id="verified-count" type="number" min="0" step="1" placeholder="Leave blank to use the area-based estimate" /></label><p class="small-note">Count physical modules, not cell divisions. A manual count replaces the estimate for this area.</p><div class="review-actions"><button class="button danger" id="exclude-area">Exclude detection</button><button class="button primary" id="confirm-area">${icon('check')} Save reviewed area</button></div></dialog>
<dialog id="georef-dialog"><div class="dialog-heading"><h2>Set image coordinates</h2><button class="icon-button" data-close="georef-dialog" aria-label="Close">${icon('close')}</button></div><p>Use known map coordinates of the upper-left image corner. This sets a north-up, square-pixel transform. Rotated or oblique photographs need external orthorectification.</p><label class="field-label">Coordinate system<select id="geo-crs"><option value="EPSG:2326">Hong Kong 1980 Grid (EPSG:2326)</option><option value="EPSG:3857">Web Mercator (EPSG:3857)</option></select></label><div class="two-fields"><label class="field-label">Upper-left easting (m)<input id="geo-east" type="number" step="any" /></label><label class="field-label">Upper-left northing (m)<input id="geo-north" type="number" step="any" /></label></div><label class="field-label">Pixel spacing (m / pixel)<input id="geo-gsd" type="number" min="0.001" step="any" /></label><button class="button primary" id="geo-save">Apply coordinates</button><p class="small-note">Enter measured metadata only. Assigning an arbitrary scale or origin produces invalid measurements.</p></dialog>
<div id="toast" role="status" hidden></div>`;

function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
function error(message) { $('#error').textContent = message; $('#error').hidden = !message; }
function serialize() {
  return { version: 1, title: state.title, settings: state.settings, images: state.images.map(im => im ? { name: im.name, date: im.date, meta: { ...im.meta, original: false }, preview: im.preview, features: im.features, analyzed: im.analyzed, run: im.run } : null) };
}
async function database() {
  return new Promise((resolve, reject) => { const req = indexedDB.open('solar-lens-hk', 1); req.onupgradeneeded = () => req.result.createObjectStore('projects'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
function save() {
  clearTimeout(saveTimer); $('#save-status').textContent = 'Saving…';
  saveTimer = setTimeout(async () => {
    try { const db = await database(); const tx = db.transaction('projects', 'readwrite'); tx.objectStore('projects').put(serialize(), 'current'); tx.oncomplete = () => { $('#save-status').textContent = 'Saved on this device'; db.close(); }; tx.onerror = () => { $('#save-status').textContent = 'Export to save a copy'; db.close(); }; }
    catch { $('#save-status').textContent = 'Export to save a copy'; }
  }, 350);
}
function validateProject(data) {
  if (data.version !== 1 || !Array.isArray(data.images) || data.images.length !== 2) throw new Error('This is not a Solar Lens project file.');
  for (const im of data.images.filter(Boolean)) {
    if (!im.meta || !(im.meta.width > 0) || !(im.meta.height > 0) || im.meta.width > 500000 || im.meta.height > 500000 || !Array.isArray(im.features) || im.features.length > 50000) throw new Error('Invalid image metadata or too many areas.');
    if (im.meta.affine && (!Array.isArray(im.meta.affine) || im.meta.affine.length !== 6 || im.meta.affine.some(v => !Number.isFinite(v)))) throw new Error('Invalid map transform.');
    if (im.meta.crs && !/^EPSG:\d+$/.test(im.meta.crs)) throw new Error('Invalid coordinate-system identifier.');
    if (!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(im.preview) && !/^demo\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/i.test(im.preview)) throw new Error('Invalid project preview.');
    for (const f of im.features) if (!Array.isArray(f.rings) || !f.rings.length || f.rings.some(r => !Array.isArray(r) || r.length < 4 || r.some(p => !Array.isArray(p) || p.length !== 2 || p.some(v => !Number.isFinite(v))))) throw new Error('Invalid panel outline.');
    for (const f of im.features) if (f.count != null && (!Number.isSafeInteger(f.count) || f.count < 0)) throw new Error('Invalid panel count.');
  }
  return data;
}
function restore(data) {
  validateProject(data); state.images = data.images; state.title = String(data.title || 'Solar comparison');
  if (data.settings) {
    const s = data.settings;
    state.settings = { tilt: s.tilt === '' ? '' : String(Math.min(80, Math.max(0, Number(s.tilt) || 0))), moduleArea: String(Math.min(20, Math.max(.1, Number(s.moduleArea) || 2.2))), threshold: String(Math.min(.95, Math.max(.1, Number(s.threshold) || .35))), gsd: ['.06', '.10', '.15'].includes(s.gsd) ? s.gsd : '.10' };
  }
  state.views = [null, null]; state.selected = null; syncInputs(); render();
}
function syncInputs() { $('#study-title').value = state.title; $('#tilt').value = state.settings.tilt; $('#module-area').value = state.settings.moduleArea; $('#threshold').value = state.settings.threshold; $('#gsd').value = state.settings.gsd; }
function download(data, name, type = 'application/json') { const url = URL.createObjectURL(new Blob([data], { type })); const a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 3000); }
function displayCount(s) { return !s ? '—' : `${s.estimated && s.count != null ? '≈ ' : ''}${number(s.count)}`; }
function delta(a, b, digits = 0) { if (a == null || b == null) return 'Awaiting both results'; const v = b - a; return `${v >= 0 ? '+' : '−'}${number(Math.abs(v), digits)} since older photo`; }
function renderMetrics() {
  const old = summary(state.images[0], state.settings), now = summary(state.images[1], state.settings);
  const coverage = compareCoverage(state.images[0]?.meta, state.images[1]?.meta);
  const change = coverage.ok ? delta(old?.count, now?.count) : 'Match coverage to compare';
  const areaChange = coverage.ok ? delta(old?.plan, now?.plan, 1) : 'Match coverage to compare';
  $('#metrics').innerHTML = `
  <article class="metric-card"><div class="metric-top"><span>${now?.estimated === false ? 'Individual panels' : 'Estimated panels'}</span>${icon('grid')}</div><div class="metric-value">${displayCount(now)}</div><div class="metric-compare"><span class="metric-change">${esc(change)}</span><span>Older: ${displayCount(old)}</span></div></article>
  <article class="metric-card"><div class="metric-top"><span>Panel footprint</span>${icon('layers')}</div><div class="metric-value">${number(now?.plan, 1)} <small>m²</small></div><div class="metric-compare"><span class="metric-change">${esc(areaChange)}</span><span>Plan view</span></div></article>
  <article class="metric-card"><div class="metric-top"><span>Panel surface area</span>${icon('sun')}</div><div class="metric-value">${number(now?.face, 1)} <small>m²</small></div><div class="metric-compare"><span>${state.settings.tilt === '' ? 'Tilt needed to calculate' : `Assumed tilt: ${esc(state.settings.tilt)}°`}</span><span>Panel face</span></div></article>
  <article class="metric-card dark"><div class="metric-top"><span>Solar areas mapped</span>${icon('pin')}</div><div class="metric-value">${number(now?.arrays)}</div><div class="metric-compare"><span><i class="live-dot"></i> ${number(now?.reviewed || 0)} reviewed</span><span>Newer photo</span></div></article>`;
  $('#coverage-note').textContent = coverage.message;
  $('#coverage-note').classList.toggle('coverage-warning', !coverage.ok && state.images.every(Boolean));
  const active = state.images.filter(Boolean);
  $('#study-meta').textContent = active.length ? `${active.map(i => i.date || 'Undated').join(' → ')}  ·  ${active.length} photograph${active.length > 1 ? 's' : ''}` : 'Load two photographs to begin';
  $('#assumptions').innerHTML = `${icon('info')}<span>${state.settings.tilt === '' ? 'Tilt unknown: face area and estimated panel counts are unavailable.' : `Counts marked ≈ use an assumed ${esc(state.settings.tilt)}° tilt and ${esc(state.settings.moduleArea)} m² per panel.`} AI outlines need review. Enter verified counts below to replace estimates.</span>`;
}
function drawPath(rings) { return rings.map(r => `M${r.map(p => p.map(n => Number(n.toFixed(2))).join(',')).join('L')}Z`).join(''); }
function viewBox(index) { const im = state.images[index]; return state.views[index] || [0, 0, im.meta.width, im.meta.height]; }
function renderImages() {
  $('#image-panels').innerHTML = state.images.map((im, index) => {
    const date = im?.date || (index ? 'Present' : 'Past');
    return `<article class="image-card"><div class="image-heading"><span class="period-badge ${index ? 'newer' : ''}">${index ? 'NEWER' : 'OLDER'}</span><input aria-label="${index ? 'Newer' : 'Older'} photo date" class="date-input" data-date="${index}" value="${esc(date)}" placeholder="Photo date" /><label class="replace-button" title="${im ? 'Replace photograph' : 'Upload photograph'}">${icon('upload')} ${im ? 'Replace' : 'Upload'}<input type="file" data-upload="${index}" accept=".tif,.tiff,.jpg,.jpeg,.png,.webp" hidden ${state.busy ? 'disabled' : ''} /></label></div>
    <div class="image-stage ${state.tool === 'draw' && state.active === index ? 'drawing' : ''}" data-stage="${index}">${im ? `<svg data-svg="${index}" viewBox="${viewBox(index).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${index ? 'Newer' : 'Older'} aerial photograph with solar area outlines"><image href="${esc(im.preview)}" width="${im.meta.width}" height="${im.meta.height}"/><g data-detail="${index}"></g><g class="outlines" style="display:${state.overlay ? 'block' : 'none'}">${im.features.map(f => `<path data-feature="${esc(f.id)}" data-image="${index}" d="${drawPath(f.rings)}" class="solar-outline ${f.excluded ? 'excluded' : ''} ${f.reviewed ? 'reviewed' : ''} ${state.selected === f.id && state.active === index ? 'selected' : ''}" vector-effect="non-scaling-stroke"><title>${esc(f.id)}${f.excluded ? ' · excluded' : ''}</title></path>`).join('')}</g><polyline data-draft="${index}" fill="#e5b76533" stroke="#f2c67b" stroke-width="2" vector-effect="non-scaling-stroke" /></svg><span class="image-filename">${esc(im.name)}</span><div class="zoom-tools"><button data-zoom="${index},.65" aria-label="Zoom in ${index ? 'newer' : 'older'} photo">+</button><button data-zoom="${index},1.5" aria-label="Zoom out ${index ? 'newer' : 'older'} photo">−</button></div>` : `<label class="upload-zone">${icon('upload')}<strong>Add ${index ? 'newer' : 'older'} photograph</strong><span>GeoTIFF, JPG, PNG or WebP</span><small>Full-resolution files stay on your device</small><input type="file" data-upload="${index}" accept=".tif,.tiff,.jpg,.jpeg,.png,.webp" hidden /></label>`}</div>
    <div class="image-footer"><span>${im ? `${number(im.meta.width)} × ${number(im.meta.height)} px` : 'GeoTIFF preserves scale & coordinates'}</span>${im ? `<button class="geo-status ${im.meta.affine && im.meta.crs ? 'valid' : 'missing'}" data-georef="${index}">${icon('pin')}${im.meta.affine && im.meta.crs ? esc(im.meta.georefSource || im.meta.crs) : 'Set coordinates'}</button>` : '<span>Local processing</span>'}</div></article>`;
  }).join('');
  bindImages();
}
function selectedFeature() { return state.images[state.active]?.features.find(f => f.id === state.selected); }
function renderInventory() {
  const image = state.images[state.active];
  $('#period-tabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', Number(b.dataset.period) === state.active));
  const features = image?.features || [];
  const filtered = features.filter(f => state.filter === 'all' ? !f.excluded : state.filter === 'excluded' ? f.excluded : !f.excluded && (state.filter === 'reviewed' ? f.reviewed : !f.reviewed));
  $('#inventory-count').textContent = image?.analyzed ? `${filtered.length} areas · ${features.filter(f => f.reviewed && !f.excluded).length} reviewed` : 'Detection not run';
  $('#draw-area').classList.toggle('active', state.tool === 'draw');
  if (!filtered.length) { $('#inventory').innerHTML = `<div class="empty-inventory">${icon('scan')}<h3>${image?.analyzed ? 'No areas in this view' : 'Your findings will appear here'}</h3><p>${image?.analyzed ? 'Check for missed panels and draw any visible solar areas manually.' : 'Upload both dates and run detection, or explore a supplied study.'}</p></div>`; return; }
  $('#inventory').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Solar area</th><th>Panels</th><th>Plan area</th><th>Face area</th><th>Location</th><th>Status</th><th></th></tr></thead><tbody>${filtered.slice(0, 500).map(f => {
    const m = measure(f, image.meta, state.settings);
    return `<tr data-row="${esc(f.id)}" class="${f.excluded ? 'row-excluded' : ''}"><td><span class="area-dot"></span><strong>${esc(f.id)}</strong><small>${f.method?.startsWith('Manual') ? 'Manually traced' : 'Solar region'}</small></td><td>${m.estimated && m.count != null ? '≈ ' : ''}${number(m.count)}</td><td>${number(m.plan, 1)} <small>m²</small></td><td>${number(m.face, 1)} <small>m²</small></td><td class="location-cell">${m.position ? `${m.position[1].toFixed(5)}° N<br>${m.position[0].toFixed(5)}° E` : 'Unlocated'}</td><td><span class="status-pill ${f.excluded ? 'excluded' : f.reviewed ? 'reviewed' : ''}">${f.excluded ? 'Excluded' : f.reviewed ? 'Reviewed' : 'Needs review'}</span></td><td><button class="review-button" data-review="${esc(f.id)}">Review ${icon('arrow')}</button></td></tr>`;
  }).join('')}</tbody></table></div>${filtered.length > 500 ? '<p class="small-note">Showing the first 500 areas. The export includes every area.</p>' : ''}`;
  document.querySelectorAll('[data-review]').forEach(b => b.onclick = () => review(b.dataset.review));
}
function render() { renderMetrics(); renderImages(); renderInventory(); if (state.tab === 'map') renderMap(); }
function setTab(tab) { state.tab = tab; document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab)); for (const name of ['overview', 'studies', 'map', 'method']) $(`#${name}-page`).hidden = name !== tab; if (tab === 'map') setTimeout(renderMap, 0); if (tab === 'studies') renderStudies(); }
function svgPoint(svg, event) { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }
function refreshView(index) { const svg = $(`[data-svg="${index}"]`); if (svg) svg.setAttribute('viewBox', viewBox(index).join(' ')); updateDetail(index); }
function zoom(index, factor, anchor) {
  const im = state.images[index]; if (!im) return;
  const [x, y, w, h] = viewBox(index), newW = Math.min(im.meta.width * 1.2, Math.max(im.meta.width / 80, w * factor)), newH = newW * im.meta.height / im.meta.width;
  const p = anchor || [x + w / 2, y + h / 2];
  state.views[index] = [Math.max(-im.meta.width * .1, Math.min(im.meta.width - newW * .8, p[0] - (p[0] - x) / w * newW)), Math.max(-im.meta.height * .1, Math.min(im.meta.height - newH * .8, p[1] - (p[1] - y) / h * newH)), newW, newH]; refreshView(index);
}
let detailTimer, detailVersion = [0, 0];
function updateDetail(index) {
  clearTimeout(detailTimer); const im = state.images[index]; if (!im?.read || !im.meta.original) return;
  const version = ++detailVersion[index];
  detailTimer = setTimeout(async () => {
    const [x, y, w, h] = viewBox(index); if (w > im.meta.width * .7) return;
    const box = [Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), Math.min(im.meta.width, Math.ceil(x + w)), Math.min(im.meta.height, Math.ceil(y + h))];
    if (box[2] <= box[0] || box[3] <= box[1]) return;
    try {
      const pw = Math.min(1400, Math.max(1, box[2] - box[0])), ph = Math.max(1, Math.round(pw * (box[3] - box[1]) / (box[2] - box[0])));
      const c = await im.read(box, pw, ph);
      if (version !== detailVersion[index] || state.images[index] !== im) return;
      const g = $(`[data-detail="${index}"]`); if (g) g.innerHTML = `<image href="${c.toDataURL('image/jpeg', .92)}" x="${box[0]}" y="${box[1]}" width="${box[2] - box[0]}" height="${box[3] - box[1]}"/>`;
    } catch { /* The navigation preview remains available if a detail decode fails. */ }
  }, 220);
}
function bindImages() {
  document.querySelectorAll('[data-upload]').forEach(input => input.onchange = async () => {
    const file = input.files[0]; if (!file || state.busy) return;
    const index = Number(input.dataset.upload); error(''); toast(`Reading ${file.name}…`);
    try {
      const im = await openImage(file), existing = state.images[index];
      const reattach = existing && existing.name === im.name && existing.meta.width === im.meta.width && existing.meta.height === im.meta.height;
      if (reattach) {
        im.features = existing.features; im.analyzed = existing.analyzed; im.run = existing.run; im.date = existing.date;
        if (!im.meta.affine && existing.meta.registration?.accepted) im.meta = { ...existing.meta, original: true };
      }
      state.images[index] = im; state.views[index] = null; state.active = index; state.selected = null; render(); save(); toast(reattach ? 'Original reattached. Outlines and counts preserved; native detail is now available.' : 'Photograph loaded. Check its date and coordinates.');
    }
    catch (e) { error(`Could not read the photograph: ${e.message}`); }
  });
  document.querySelectorAll('[data-date]').forEach(input => input.onchange = () => { const im = state.images[Number(input.dataset.date)]; if (im) { im.date = input.value.slice(0, 80); renderMetrics(); save(); } });
  document.querySelectorAll('[data-georef]').forEach(button => button.onclick = () => openGeoref(Number(button.dataset.georef)));
  document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { const [i, factor] = b.dataset.zoom.split(','); zoom(Number(i), Number(factor)); });
  document.querySelectorAll('[data-feature]').forEach(path => path.addEventListener('click', e => { if (state.tool === 'draw') return; e.stopPropagation(); if (path.dataset.moved === 'true') return; state.active = Number(path.dataset.image); review(path.dataset.feature); }));
  document.querySelectorAll('[data-svg]').forEach(svg => {
    const index = Number(svg.dataset.svg); let drag = null, moved = false;
    svg.addEventListener('wheel', e => { e.preventDefault(); zoom(index, e.deltaY > 0 ? 1.15 : .85, svgPoint(svg, e)); }, { passive: false });
    svg.addEventListener('pointerdown', e => { if (state.tool === 'draw') return; drag = { x: e.clientX, y: e.clientY, view: [...viewBox(index)] }; moved = false; svg.setPointerCapture(e.pointerId); });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(); const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) moved = true; const units = Math.max(drag.view[2] / r.width, drag.view[3] / r.height); state.views[index] = [drag.view[0] - dx * units, drag.view[1] - dy * units, drag.view[2], drag.view[3]]; svg.setAttribute('viewBox', viewBox(index).join(' ')); });
    svg.addEventListener('pointerup', () => { drag = null; if (moved) updateDetail(index); });
    svg.addEventListener('click', e => { if (state.tool !== 'draw' || state.active !== index) return; const p = svgPoint(svg, e), im = state.images[index]; if (p[0] < 0 || p[1] < 0 || p[0] > im.meta.width || p[1] > im.meta.height) return; if (e.detail > 1) return; state.drawing.push(p); $(`[data-draft="${index}"]`).setAttribute('points', state.drawing.map(p => p.join(',')).join(' ')); });
    svg.addEventListener('dblclick', e => { if (state.tool === 'draw') { e.preventDefault(); finishDrawing(); } });
  });
}
function focusFeature(index, feature) {
  const im = state.images[index], points = feature.rings[0];
  let minx = Math.min(...points.map(p => p[0])), maxx = Math.max(...points.map(p => p[0])), miny = Math.min(...points.map(p => p[1])), maxy = Math.max(...points.map(p => p[1]));
  const w = Math.min(im.meta.width, Math.max(maxx - minx, (maxy - miny) * im.meta.width / im.meta.height, im.meta.width / 60) * 2);
  const h = w * im.meta.height / im.meta.width;
  state.views[index] = [(minx + maxx - w) / 2, (miny + maxy - h) / 2, w, h];
}
function review(id) {
  state.selected = id; const f = selectedFeature(); if (!f) return;
  focusFeature(state.active, f); renderImages();
  const m = measure(f, state.images[state.active].meta, state.settings);
  $('#review-title').textContent = `${f.id} · ${state.active ? 'Newer' : 'Older'} photograph`;
  $('#review-detail').innerHTML = `<div class="review-metrics"><div><small>Plan footprint</small><strong>${number(m.plan, 2)} m²</strong></div><div><small>Panel face area</small><strong>${number(m.face, 2)} m²</strong></div><div><small>${m.estimated ? 'Estimated panels' : 'Manual count'}</small><strong>${m.estimated && m.count != null ? '≈ ' : ''}${number(m.count)}</strong></div></div><p class="small-note">${m.position ? `${m.position[1].toFixed(6)}° N, ${m.position[0].toFixed(6)}° E` : 'Coordinates unavailable. Set image georeferencing to locate this area.'}</p>`;
  $('#verified-count').value = f.count ?? ''; $('#exclude-area').textContent = f.excluded ? 'Restore detection' : 'Exclude detection';
  if (!$('#review-dialog').open) $('#review-dialog').showModal(); updateDetail(state.active);
}
function finishDrawing() {
  if (state.drawing.length < 3) return toast('Mark at least three corners.');
  const im = state.images[state.active];
  const ring = [[...state.drawing, state.drawing[0]]];
  if (polygonArea(ring) < 1) return toast('Draw a non-zero area with corners in order.');
  let additions;
  try { additions = clipping.difference(ring, ...im.features.filter(f => !f.excluded).map(f => f.rings)); }
  catch { return toast('The outline is invalid. Press Escape and draw its corners in order.'); }
  if (!additions.length) return toast('That area is already covered. Exclude an existing outline before tracing its replacement.');
  let firstId;
  additions.forEach((rings, i) => {
    const id = `M${Date.now().toString(36).slice(-6).toUpperCase()}${i || ''}`; firstId ||= id;
    im.features.push({ id, rings, count: null, reviewed: true, excluded: false, score: null, method: 'Manual outline, overlap removed' });
  });
  im.analyzed = true; state.tool = 'select'; state.drawing = []; render(); save(); review(firstId);
}
let geoIndex = 0;
function openGeoref(index) {
  if (state.busy) return;
  geoIndex = index; const m = state.images[index].meta, a = m.affine;
  $('#geo-crs').value = m.crs === 'EPSG:3857' ? m.crs : 'EPSG:2326'; $('#geo-east').value = a?.[2] ?? ''; $('#geo-north').value = a?.[5] ?? ''; $('#geo-gsd').value = pixelAreaM2(m) ? Math.sqrt(pixelAreaM2(m)) : '';
  $('#georef-dialog').showModal();
}
function renderMap(period = '1') {
  if (!leaflet) { leaflet = L.map('map', { preferCanvas: true }).setView([22.34, 114.12], 11); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 20 }).addTo(leaflet); }
  leaflet.eachLayer(layer => { if (!(layer instanceof L.TileLayer)) leaflet.removeLayer(layer); });
  const data = geojson(state.images, state.settings); const selected = data.features.filter(f => period === 'both' || f.properties.period === (period === '0' ? 'older' : 'newer'));
  const group = L.geoJSON({ type: 'FeatureCollection', features: selected }, { style: f => ({ color: f.properties.period === 'older' ? '#ca9c53' : '#238a66', weight: 2, fillOpacity: .35 }), onEachFeature: (f, layer) => { const p = f.properties; layer.bindPopup(`<strong>${esc(p.id)} · ${esc(p.period)}</strong><br>${esc(p.image)}<br>${number(p.plan_area_m2, 1)} m² footprint<br>${p.count_method === 'area-based estimate' ? '≈ ' : ''}${number(p.count)} panels<br>${esc(p.count_method)}`); } }).addTo(leaflet);
  if (selected.length) leaflet.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 19 });
  $('#map-note').textContent = `${selected.length} solar areas displayed. ${data.skipped_unlocated_ids.length ? `${data.skipped_unlocated_ids.length} unlocated areas omitted; set coordinates to include them.` : 'Map outlines inherit the photographs’ coordinate accuracy.'} Basemap tiles require internet.`;
  leaflet.invalidateSize();
}
async function runDetection() {
  if (state.busy) return;
  const pending = state.images.map((im, index) => ({ im, index })).filter(({ im }) => im?.read && im.meta.original);
  if (!pending.length) { toast('Upload original photographs to run detection. Supplied studies have saved AI results.'); return; }
  state.busy = true; $('#run-detection').disabled = true; $('#new-study').disabled = true; $('#site-select').disabled = true; $('#progress').hidden = false; error('');
  try {
    const results = [], options = { ...state.settings };
    for (let i = 0; i < pending.length; i++) {
      const { im, index } = pending[i];
      const result = await detect(im, options, (p, text) => { $('#progress-value').value = (i + p) / pending.length; $('#progress-text').textContent = text; });
      results.push({ index, result });
    }
    for (const { index, result } of results) { const im = state.images[index]; im.features = result.features; im.run = result.run; im.analyzed = true; }
    render(); save(); toast('Detection complete. Review outlines and inspect for missed panels.');
  } catch (e) { error(e.message === 'Detection cancelled.' ? 'Detection cancelled. Previous results were preserved.' : `Detection could not finish: ${e.message}`); }
  finally { state.busy = false; $('#run-detection').disabled = false; $('#new-study').disabled = false; $('#site-select').disabled = false; $('#progress').hidden = true; }
}

document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(`#${b.dataset.close}`).close());
$('#study-title').onchange = e => { state.title = e.target.value.slice(0, 160); save(); };
$('#run-detection').onclick = runDetection;
$('#live-sample').onclick = async () => {
  if (state.busy) return;
  const button = $('#live-sample'); button.disabled = true; error('');
  try {
    toast('Loading two real HAECO roof crops for live browser detection…');
    const images = await Promise.all(['2017', '2025'].map(async year => {
      const response = await fetch(new URL(`demo/sample-${year}.tif`, document.baseURI));
      if (!response.ok) throw new Error('Live sample could not be loaded.');
      return openImage(new File([await response.blob()], `HAECO-${year}-sample.tif`, { type: 'image/tiff' }));
    }));
    images[0].meta.georefSource = 'registered older crop · approximate';
    state.images = images; state.title = 'HAECO · live detection sample'; state.views = [null, null]; state.selected = null; state.tool = 'select'; state.drawing = [];
    syncInputs(); setTab('overview'); render(); await runDetection();
  } catch (e) { error(e.message); }
  finally { button.disabled = false; }
};
$('#cancel').onclick = cancelDetection;
$('#overlay-toggle').onclick = () => { state.overlay = !state.overlay; renderImages(); };
$('#fit-view').onclick = () => { state.views = [null, null]; renderImages(); };
$('#period-tabs').querySelectorAll('button').forEach(b => b.onclick = () => { state.active = Number(b.dataset.period); state.tool = 'select'; state.drawing = []; renderInventory(); renderImages(); });
$('#map-period').querySelectorAll('button').forEach(b => b.onclick = () => { $('#map-period').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderMap(b.dataset.mapPeriod); });
$('#review-filter').onchange = e => { state.filter = e.target.value; renderInventory(); };
$('#draw-area').onclick = () => { if (!state.images[state.active]) return toast('Upload a photograph first.'); if (state.busy) return; state.tool = state.tool === 'draw' ? 'select' : 'draw'; state.drawing = []; renderImages(); renderInventory(); if (state.tool === 'draw') toast('Click each corner in the active photo. Double-click or press Enter to finish. Escape cancels.'); };
document.addEventListener('keydown', e => { if (state.tool === 'draw' && e.key === 'Enter') { e.preventDefault(); finishDrawing(); } if (e.key === 'Escape') { state.tool = 'select'; state.drawing = []; renderImages(); renderInventory(); } });
$('#confirm-area').onclick = () => { const f = selectedFeature(); if (!f) return; const raw = $('#verified-count').value; const count = raw === '' ? null : Number(raw); if (count != null && (!Number.isSafeInteger(count) || count < 0)) return toast('Enter a whole-number panel count of zero or more.'); f.count = count; f.reviewed = true; $('#review-dialog').close(); render(); save(); };
$('#exclude-area').onclick = () => { const f = selectedFeature(); if (!f) return; f.excluded = !f.excluded; $('#review-dialog').close(); render(); save(); };
$('#geo-save').onclick = () => { const raw = [$('#geo-east').value, $('#geo-north').value, $('#geo-gsd').value]; const [e, n, g] = raw.map(Number); if (raw.some(s => s === '') || ![e, n, g].every(Number.isFinite) || g <= 0) return toast('Enter valid easting, northing and positive pixel spacing.'); const m = state.images[geoIndex].meta; m.affine = [g, 0, e, 0, -g, n]; m.crs = $('#geo-crs').value; m.metric = true; m.georefSource = 'user-supplied alignment'; $('#georef-dialog').close(); render(); save(); };
for (const [id, key, min, max] of [['tilt', 'tilt', 0, 80], ['module-area', 'moduleArea', .1, 20], ['threshold', 'threshold', .1, .95]]) {
  $(`#${id}`).onchange = e => { const raw = e.target.value; if (key === 'tilt' && raw === '') state.settings[key] = ''; else if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < min || Number(raw) > max) { e.target.value = state.settings[key]; return toast(`Enter a value from ${min} to ${max}.`); } else state.settings[key] = raw; renderMetrics(); renderInventory(); save(); };
}
$('#gsd').onchange = e => { state.settings.gsd = e.target.value; save(); };
$('#export-open').onclick = () => $('#export-dialog').showModal();
$('#export-project').onclick = () => { download(JSON.stringify(serialize()), 'solar-lens-project.json'); toast('Project saved. Keep original photos for future detection runs.'); };
$('#export-geojson').onclick = () => { const data = geojson(state.images, state.settings); if (!data.features.length) return toast('No georeferenced results available to export.'); download(JSON.stringify(data), 'solar-lens-outlines.geojson', 'application/geo+json'); if (data.skipped_unlocated_ids.length) toast(`${data.skipped_unlocated_ids.length} unlocated areas were omitted.`); };
$('#export-csv').onclick = () => {
  const rows = [['period', 'image', 'date', 'area_id', 'included', 'reviewed', 'panel_count', 'count_method', 'plan_area_m2', 'face_area_m2', 'assumed_tilt_deg', 'module_face_area_m2', 'latitude', 'longitude', 'method']];
  state.images.forEach((im, index) => im?.analyzed && im.features.forEach(f => { const m = measure(f, im.meta, state.settings); rows.push([index ? 'newer' : 'older', im.name, im.date, f.id, !f.excluded, !!f.reviewed, m.count, m.estimated ? 'area-based estimate' : 'manual count', m.plan, m.face, state.settings.tilt, state.settings.moduleArea, m.position?.[1], m.position?.[0], f.method]); }));
  if (rows.length === 1) return toast('Run detection or draw an area before exporting.'); download(rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'solar-lens-measurements.csv', 'text/csv;charset=utf-8');
};
$('#import-project').onclick = () => { if (!state.busy) $('#project-file').click(); };
$('#project-file').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (f.size > 80e6) throw new Error('Project file is too large (maximum 80 MB).'); restore(JSON.parse(await f.text())); save(); toast('Project restored. Upload original photos to rerun detection.'); } catch (e) { error(`Could not open project: ${e.message}`); } e.target.value = ''; };
$('#new-study').onclick = () => { if (state.busy) return; state.images = [null, null]; state.title = 'Untitled comparison'; state.views = [null, null]; state.selected = null; state.tool = 'select'; state.drawing = []; $('#site-select').value = ''; syncInputs(); render(); save(); setTab('overview'); toast('New comparison ready. Your previous study can be reopened from the supplied sites.'); };
async function loadDemo(id) {
  const item = state.manifest.find(p => p.id === id); if (!item) return;
  error(''); try {
    const res = await fetch(new URL(item.path, document.baseURI)); if (!res.ok) throw new Error('Study data is unavailable.');
    const data = await res.json(); restore({ ...data, title: data.title || item.title, version: 1, settings: state.settings }); save(); toast('Loaded real AI results from the supplied photos. Review required.');
  } catch (e) { error(e.message); }
}
$('#site-select').onchange = e => loadDemo(e.target.value);
let studyCache;
async function getStudies() {
  if (!studyCache) studyCache = Promise.all(state.manifest.map(async p => {
    const res = await fetch(new URL(p.path, document.baseURI));
    if (!res.ok) throw new Error(`Study data is unavailable for ${p.title}.`);
    return { ...await res.json(), id: p.id };
  })).catch(e => { studyCache = null; throw e; });
  return studyCache;
}
async function renderStudies() {
  $('#all-studies-table').innerHTML = '<p class="small-note" style="padding:25px">Loading the supplied study results…</p>';
  try {
    const studies = await getStudies();
    const totals = [0, 1].map(i => {
      const s = studies.map(p => summary(p.images[i], state.settings));
      return { count: s.some(x => x?.count == null) ? null : s.reduce((a, x) => a + x.count, 0), plan: s.some(x => x?.plan == null) ? null : s.reduce((a, x) => a + x.plan, 0), face: s.some(x => x?.face == null) ? null : s.reduce((a, x) => a + x.face, 0) };
    });
    $('#study-totals').innerHTML = [
      ['Older panels · estimated', totals[0].count, '', '2016–2017 photo filenames'],
      ['Newer panels · estimated', totals[1].count, '', '2025–2026 photo filenames'],
      ['Older panel footprint', totals[0].plan, 'm²', 'Net unreviewed candidate area'],
      ['Newer panel footprint', totals[1].plan, 'm²', 'Net unreviewed candidate area'],
    ].map(([title, value, unit, note]) => `<article class="metric-card"><div class="metric-top">${esc(title)}</div><div class="metric-value">${unit ? '' : '≈ '}${number(value, unit ? 1 : 0)} <small>${unit}</small></div><div class="metric-compare">${esc(note)}</div></article>`).join('');
    $('#all-studies-table').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Place / dates</th><th>Older panels ≈</th><th>Newer panels ≈</th><th>Older footprint</th><th>Newer footprint</th><th>Older face area</th><th>Newer face area</th><th></th></tr></thead><tbody>${studies.map(p => {
      const a = summary(p.images[0], state.settings), b = summary(p.images[1], state.settings);
      return `<tr><td><strong>${esc(p.title)}</strong><small>${esc(p.images[0].date)} → ${esc(p.images[1].date)}</small></td><td>${number(a?.count)}</td><td>${number(b?.count)}</td><td>${number(a?.plan, 1)} m²</td><td>${number(b?.plan, 1)} m²</td><td>${number(a?.face, 1)} m²</td><td>${number(b?.face, 1)} m²</td><td><button class="review-button" data-open-study="${esc(p.id)}">Explore ${icon('arrow')}</button></td></tr>`;
    }).join('')}</tbody></table></div><div class="assumption-note" style="padding:16px">Assumed tilt: ${state.settings.tilt === '' ? 'unknown' : esc(state.settings.tilt) + '°'} · module face area: ${esc(state.settings.moduleArea)} m². Counts are rounded per region. Missing scale or tilt leaves the relevant total unavailable.</div>`;
    document.querySelectorAll('[data-open-study]').forEach(b => b.onclick = async () => { if (state.busy) return; $('#site-select').value = b.dataset.openStudy; await loadDemo(b.dataset.openStudy); setTab('overview'); });
  } catch (e) { $('#all-studies-table').textContent = e.message; }
}
$('#export-all').onclick = async () => {
  try {
    const studies = await getStudies();
    const rows = [['site', 'period', 'date', 'candidate_regions', 'estimated_panels', 'plan_area_m2', 'face_area_m2', 'assumed_tilt_deg', 'module_face_area_m2', 'review_status']];
    for (const p of studies) for (const [i, im] of p.images.entries()) {
      const s = summary(im, state.settings); rows.push([p.title, i ? 'newer' : 'older', im.date, s.arrays, s.count, s.plan, s.face, state.settings.tilt, state.settings.moduleArea, 'unreviewed AI candidates']);
    }
    download(rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'solar-lens-all-sites-summary.csv', 'text/csv;charset=utf-8');
  } catch (e) { error(e.message); }
};
async function initialize() {
  render();
  try { const res = await fetch(new URL('demo/manifest.json', document.baseURI)); if (res.ok) { const data = await res.json(); state.manifest = data.pairs || []; $('#site-select').innerHTML = `<option value="">Choose a study site</option>${state.manifest.map(p => `<option value="${esc(p.id)}">${esc(p.title)} · ${esc(p.olderYear)}–${esc(p.newerYear)}</option>`).join('')}`; } } catch { $('#site-select').innerHTML = '<option value="">Upload your photographs</option>'; }
  try {
    const db = await database(); const data = await new Promise((resolve, reject) => { const req = db.transaction('projects').objectStore('projects').get('current'); req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); }); db.close();
    if (data) { restore(data); toast('Restored your last comparison from this device.'); return; }
  } catch { /* Private browsing may disable IndexedDB; file export still works. */ }
  const first = state.manifest.find(p => p.id === 'haeco') || state.manifest[0]; if (first) { $('#site-select').value = first.id; await loadDemo(first.id); }
}
initialize();
