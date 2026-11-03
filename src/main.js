import './style.css';
import { layout } from './layout.js';
import { calibrate } from './calibration.js';
import { projectSettings, libraryGeojson } from './library.js';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import clipping from 'polygon-clipping';
import { openImage } from './imagery.js';
import { detect, cancelDetection } from './detector.js';
import { summary, measure, centroid, polygonArea, geojson, compareCoverage, csvCell, pixelAreaM2, location } from './geometry.js';

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
Object.assign(state, { projectId: crypto.randomUUID(), projects: [], loading: [false, false], areaSearch: '', areaSort: 'id', page: 0, studySearch: '', studySource: 'all', studySort: 'name', sync: true, mapPeriod: '1' });
let leaflet, saveTimer, toastTimer;
const $ = s => document.querySelector(s);
const root = $('#app');

root.innerHTML = layout(icon);

function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 5000); }
function error(message) { $('#error').textContent = message; $('#error').hidden = !message; }
function serialize() {
  return { version: 1, id: state.projectId, title: state.title, datasetId: state.datasetId || null, updatedAt: new Date().toISOString(), settings: { ...state.settings }, images: state.images.map(im => im ? { name: im.name, sizeBytes: im.sizeBytes, date: im.date, meta: { ...im.meta, original: false }, preview: im.preview, features: structuredClone(im.features), analyzed: im.analyzed, run: im.run } : null) };
}
async function database() {
  return new Promise((resolve, reject) => { const req = indexedDB.open('solar-lens-hk', 2); req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains('projects')) req.result.createObjectStore('projects'); if (!req.result.objectStoreNames.contains('saved')) req.result.createObjectStore('saved', { keyPath: 'id' }); }; req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error); });
}
const pendingSaves = new Map();
function save() {
  const payload = serialize();
  state.projects = [...state.projects.filter(p => p.id !== payload.id), payload];
  pendingSaves.set(payload.id, payload);
  clearTimeout(saveTimer); $('#save-status').textContent = 'Saving…';
  saveTimer = setTimeout(async () => {
    const writes = [...pendingSaves.values()]; pendingSaves.clear();
    try { const db = await database(); const tx = db.transaction(['projects', 'saved'], 'readwrite'); tx.objectStore('projects').put(payload, 'current'); for (const item of writes) if (item.images.some(Boolean)) tx.objectStore('saved').put(item); tx.oncomplete = () => { $('#save-status').textContent = 'Saved on this device'; db.close(); }; tx.onerror = () => { $('#save-status').textContent = 'Export to save a copy'; db.close(); }; }
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
    for (const f of im.features) { if (f.tilt != null && (!Number.isFinite(f.tilt) || f.tilt < 0 || f.tilt > 80)) throw new Error('Invalid panel tilt.'); if (f.moduleArea != null && (!Number.isFinite(f.moduleArea) || f.moduleArea < .1 || f.moduleArea > 20)) throw new Error('Invalid module size.'); f.note = String(f.note || '').slice(0,1000); }
  }
  return data;
}
function resetReviewFilters() { state.filter='all';state.areaSearch='';state.page=0;$('#review-filter').value='all';$('#area-search').value=''; }
function restore(data) {
  resetReviewFilters();
  validateProject(data); state.images = data.images; state.projectId = data.id || crypto.randomUUID(); state.datasetId = data.datasetId || null; state.page = 0; state.title = String(data.title || 'Solar comparison');
  if (data.settings) {
    const s = data.settings;
    state.settings = { tilt: s.tilt === '' ? '' : String(Math.min(80, Math.max(0, Number(s.tilt) || 0))), moduleArea: String(Math.min(20, Math.max(.1, Number(s.moduleArea) || 2.2))), threshold: String(Math.min(.95, Math.max(.1, Number(s.threshold) || .35))), gsd: ['.06', '.10', '.15'].includes(s.gsd) ? s.gsd : '.10' };
  }
  state.views = [null, null]; state.selected = null; state.tool = 'select'; state.drawing = []; syncInputs(); render();
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
  <article class="metric-card"><div class="metric-top"><span>${now?.estimated === false && now?.arrays ? 'Counted panels' : 'Estimated panels'}</span>${icon('grid')}</div><div class="metric-value">${displayCount(now)}</div><div class="metric-compare"><span class="metric-change">${esc(change)}</span><span>Older: ${displayCount(old)}</span></div></article>
  <article class="metric-card"><div class="metric-top"><span>Panel footprint</span>${icon('layers')}</div><div class="metric-value">${number(now?.plan, 1)} <small>m²</small></div><div class="metric-compare"><span class="metric-change">${esc(areaChange)}</span><span>Older: ${number(old?.plan, 1)} m²</span></div></article>
  <article class="metric-card"><div class="metric-top"><span>Panel surface area</span>${icon('sun')}</div><div class="metric-value">${number(now?.face, 1)} <small>m²</small></div><div class="metric-compare"><span>${state.settings.tilt === '' ? 'Tilt needed to calculate' : `Study tilt: ${esc(state.settings.tilt)}° · area overrides apply`}</span><span>Older: ${number(old?.face, 1)} m²</span></div></article>
  <article class="metric-card dark"><div class="metric-top"><span>Solar areas mapped</span>${icon('pin')}</div><div class="metric-value">${number(now?.arrays)}</div><div class="metric-compare"><span><i class="live-dot"></i> ${number(now?.reviewed || 0)} reviewed</span><span>Newer photo</span></div></article>`;
  $('#workspace-status').textContent = state.busy ? 'DETECTION RUNNING' : state.images.some(i => i?.analyzed) ? 'AI CANDIDATES · REVIEW REQUIRED' : 'READY FOR YOUR PHOTOS';
  $('#sync-views').disabled = !coverage.ok;
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
    const date = im?.date || '';
    return `<article class="image-card" data-drop="${index}"><div class="image-heading"><span class="period-badge ${index ? 'newer' : ''}">${index ? 'NEWER' : 'OLDER'}</span><input aria-label="${index ? 'Newer' : 'Older'} photo date" class="date-input" data-date="${index}" value="${esc(date)}" placeholder="Photo date / year" /><label class="replace-button" title="${im ? 'Replace photograph' : 'Upload photograph'}">${icon('upload')} ${im ? 'Replace' : 'Upload'}<input type="file" data-upload="${index}" accept=".tif,.tiff,.jpg,.jpeg,.png,.webp" hidden ${state.busy ? 'disabled' : ''} /></label>${im ? `<button class="remove-image" data-remove="${index}" aria-label="Remove ${index ? 'newer' : 'older'} photograph">${icon('close')}</button>` : ''}</div>
    <div class="image-stage ${state.tool === 'draw' && state.active === index ? 'drawing' : ''}" data-stage="${index}">${im ? `<svg data-svg="${index}" viewBox="${viewBox(index).join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="${index ? 'Newer' : 'Older'} aerial photograph with solar area outlines"><image href="${esc(im.preview)}" width="${im.meta.width}" height="${im.meta.height}"/><g data-detail="${index}"></g><g class="outlines" style="display:${state.overlay ? 'block' : 'none'}">${im.features.map(f => `<path data-feature="${esc(f.id)}" data-image="${index}" d="${drawPath(f.rings)}" class="solar-outline ${f.excluded ? 'excluded' : ''} ${f.reviewed ? 'reviewed' : ''} ${state.selected === f.id && state.active === index ? 'selected' : ''}" vector-effect="non-scaling-stroke"><title>${esc(f.id)}${f.excluded ? ' · excluded' : ''}</title></path>`).join('')}</g><polyline data-draft="${index}" fill="#e5b76533" stroke="#f2c67b" stroke-width="2" vector-effect="non-scaling-stroke" /></svg><span class="image-filename">${esc(im.name)}</span><div class="zoom-tools"><button data-zoom="${index},.65" aria-label="Zoom in ${index ? 'newer' : 'older'} photo">+</button><button data-zoom="${index},1.5" aria-label="Zoom out ${index ? 'newer' : 'older'} photo">−</button></div>` : `<label class="upload-zone">${icon('upload')}<strong>Add ${index ? 'newer' : 'older'} photograph</strong><span>GeoTIFF, JPG, PNG or WebP</span><small>Full-resolution files stay on your device</small><input type="file" data-upload="${index}" accept=".tif,.tiff,.jpg,.jpeg,.png,.webp" hidden /></label>`}</div>
    ${state.loading[index] !== false ? `<div class="image-loading"><span class="spinner"></span><span data-loading="${index}">Reading photo · ${Math.round(state.loading[index]*100)}%</span></div>` : ''}<div class="image-footer"><span>${im ? `${number(im.meta.width)} × ${number(im.meta.height)} px` : 'GeoTIFF preserves scale & coordinates'}</span>${im ? `<button class="geo-status ${im.meta.affine && im.meta.crs ? 'valid' : 'missing'}" data-georef="${index}">${icon('pin')}${im.meta.affine && im.meta.crs ? esc(im.meta.georefSource || im.meta.crs) : pixelAreaM2(im.meta) ? 'Scale set · add location' : 'Set scale & location'}</button>` : '<span>Local processing</span>'}</div></article>`;
  }).join('');
  bindImages();
}
function selectedFeature() { return state.images[state.active]?.features.find(f => f.id === state.selected); }
function renderInventory() {
  const image = state.images[state.active];
  $('#period-tabs').querySelectorAll('button').forEach(b => b.classList.toggle('active', Number(b.dataset.period) === state.active));
  const features = image?.features || [];
  let filtered = features.filter(f => state.filter === 'all' ? !f.excluded : state.filter === 'excluded' ? f.excluded : !f.excluded && (state.filter === 'reviewed' ? f.reviewed : !f.reviewed));
  filtered = filtered.filter(f => !state.areaSearch || f.id.toLowerCase().includes(state.areaSearch.toLowerCase()));
  if (state.areaSort === 'area') filtered.sort((a,b) => polygonArea(b.rings)-polygonArea(a.rings));
  state.page = Math.max(0, Math.min(state.page, Math.ceil(filtered.length / 50)-1));
  $('#inventory-count').textContent = image?.analyzed ? `${filtered.length} areas · ${features.filter(f => f.reviewed && !f.excluded).length} reviewed` : 'Detection not run';
  $('#draw-area').classList.toggle('active', state.tool === 'draw');
  if (!filtered.length) { $('#inventory').innerHTML = `<div class="empty-inventory">${icon('scan')}<h3>${image?.analyzed ? 'No areas in this view' : 'Your findings will appear here'}</h3><p>${image?.analyzed ? 'Check for missed panels and draw any visible solar areas manually.' : 'Upload both dates and run detection, or explore a supplied study.'}</p></div>`; return; }
  $('#inventory').innerHTML = `<div class="table-scroll"><table><thead><tr><th>Solar area</th><th>Panels</th><th>Plan area</th><th>Face area</th><th>Location</th><th>Status</th><th></th></tr></thead><tbody>${filtered.slice(state.page*50, (state.page+1)*50).map(f => {
    const m = measure(f, image.meta, state.settings);
    return `<tr data-row="${esc(f.id)}" class="${f.excluded ? 'row-excluded' : ''}"><td><span class="area-dot"></span><strong>${esc(f.id)}</strong><small>${f.method?.startsWith('Manual') ? 'Manually traced' : 'Solar region'}</small></td><td>${m.estimated && m.count != null ? '≈ ' : ''}${number(m.count)}</td><td>${number(m.plan, 1)} <small>m²</small></td><td>${number(m.face, 1)} <small>m²</small></td><td class="location-cell">${m.position ? `${m.position[1].toFixed(5)}° N<br>${m.position[0].toFixed(5)}° E` : 'Unlocated'}</td><td><span class="status-pill ${f.excluded ? 'excluded' : f.reviewed ? 'reviewed' : ''}">${f.excluded ? 'Excluded' : f.reviewed ? 'Reviewed' : 'Needs review'}</span></td><td><button class="review-button" data-review="${esc(f.id)}">Review ${icon('arrow')}</button></td></tr>`;
  }).join('')}</tbody></table></div><div class="pagination"><span>${state.page*50+1}–${Math.min((state.page+1)*50,filtered.length)} of ${filtered.length}</span><button class="button small" id="previous-page" ${state.page===0?'disabled':''}>Previous</button><button class="button small" id="next-page" ${(state.page+1)*50>=filtered.length?'disabled':''}>Next</button></div>`;
  $('#previous-page').onclick=()=>{state.page--;renderInventory();}; $('#next-page').onclick=()=>{state.page++;renderInventory();};
  document.querySelectorAll('[data-review]').forEach(b => b.onclick = () => review(b.dataset.review));
}
function render() { renderMetrics(); renderImages(); renderInventory(); if (state.tab === 'map') renderMap(state.mapPeriod).catch(e=>error(e.message)); }
function setTab(tab) {
  const titles = { overview: ['Comparison','A clearer view of change.','Turn two photographs into a measurable picture of solar growth.'], studies:['Data library','Your whole study, connected.','All supplied photographs and your own comparisons, in one searchable place.'], map:['Panel locations','See the bigger picture.','Explore mapped outlines and their measurements across Hong Kong.'], method:['How it works','From photo to finding.','Understand the workflow and the assumptions behind every result.'] };
  const title=titles[tab]; $('#page-label').textContent=title[0]; $('#page-title').textContent=title[1]; $('#page-description').textContent=title[2]; $('.heading-actions').hidden=tab!=='overview';
  state.tab = tab; document.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab)); for (const name of ['overview', 'studies', 'map', 'method']) $(`#${name}-page`).hidden = name !== tab; if (tab === 'map') setTimeout(()=>renderMap(state.mapPeriod).catch(e=>error(e.message)), 0); if (tab === 'studies') renderStudies(); }
function svgPoint(svg, event) { const p = svg.createSVGPoint(); p.x = event.clientX; p.y = event.clientY; const q = p.matrixTransform(svg.getScreenCTM().inverse()); return [q.x, q.y]; }
function refreshView(index) {
  if (state.sync && compareCoverage(state.images[0]?.meta,state.images[1]?.meta).ok) { const other=1-index, m=state.images[index].meta, o=state.images[other].meta; const v=viewBox(index); state.views[other]=[v[0]/m.width*o.width,v[1]/m.height*o.height,v[2]/m.width*o.width,v[3]/m.height*o.height]; const otherSvg=$(`[data-svg="${other}"]`); if(otherSvg)otherSvg.setAttribute('viewBox',state.views[other].join(' ')); updateDetail(other); }
 const svg = $(`[data-svg="${index}"]`); if (svg) svg.setAttribute('viewBox', viewBox(index).join(' ')); updateDetail(index); }
function zoom(index, factor, anchor) {
  const im = state.images[index]; if (!im) return;
  const [x, y, w, h] = viewBox(index), newW = Math.min(im.meta.width * 1.2, Math.max(im.meta.width / 80, w * factor)), newH = newW * im.meta.height / im.meta.width;
  const p = anchor || [x + w / 2, y + h / 2];
  state.views[index] = [Math.max(-im.meta.width * .1, Math.min(im.meta.width - newW * .8, p[0] - (p[0] - x) / w * newW)), Math.max(-im.meta.height * .1, Math.min(im.meta.height - newH * .8, p[1] - (p[1] - y) / h * newH)), newW, newH]; refreshView(index);
}
let detailTimers = [null,null], detailVersion = [0, 0];
function updateDetail(index) {
  clearTimeout(detailTimers[index]); const im = state.images[index]; if (!im?.read || !im.meta.original) return;
  const version = ++detailVersion[index];
  detailTimers[index] = setTimeout(async () => {
    const [x, y, w, h] = viewBox(index); if (w > im.meta.width * .7) return;
    const box = [Math.max(0, Math.floor(x)), Math.max(0, Math.floor(y)), Math.min(im.meta.width, Math.ceil(x + w)), Math.min(im.meta.height, Math.ceil(y + h))];
    if (box[2] <= box[0] || box[3] <= box[1]) return;
    try {
      const pw = Math.min(1400, Math.max(1, box[2] - box[0])), ph = Math.max(1, Math.round(pw * (box[3] - box[1]) / (box[2] - box[0])));
      const c = await im.read(box, pw, ph);
      if (version !== detailVersion[index] || state.images[index] !== im) return;
      const g = $(`[data-detail="${index}"]`); if (g) g.innerHTML = `<image href="${c.toDataURL('image/jpeg', .92)}" x="${box[0]}" y="${box[1]}" width="${box[2] - box[0]}" height="${box[3] - box[1]}"/>`;
      if ($('#review-dialog').open && state.active===index && $('#review-native') && g) $('#review-native').innerHTML=g.innerHTML;
    } catch { /* The navigation preview remains available if a detail decode fails. */ }
  }, 220);
}
const uploadVersions = [0,0];
async function loadUpload(file,index) {
  if (!file || state.busy) return;
  if(state.sampleLoading)return toast('Wait for the sample photos to load.');
  studyVersion++; const token=++uploadVersions[index]; state.loading[index]=0; error('');renderImages();
  try {
    const im=await openImage(file,{onProgress:p=>{if(token===uploadVersions[index]){state.loading[index]=p;const label=$(`[data-loading="${index}"]`);if(label)label.textContent=`Reading photo · ${Math.round(p*100)}%`;}}});
    if(token!==uploadVersions[index])return;
    const existing=state.images[index];
    const reattach=existing&&existing.name===im.name&&existing.meta.width===im.meta.width&&existing.meta.height===im.meta.height;
    if(reattach){im.features=existing.features;im.analyzed=existing.analyzed;im.run=existing.run;im.date=existing.date;if(!im.meta.affine&&existing.meta.affine)im.meta={...existing.meta,original:true};}
    state.images[index]=im;state.views[index]=null;state.active=index;state.selected=null;state.page=0;
    toast(reattach?'Original reattached. Your review work is preserved.':'Photo ready. Check the date, scale and location, then run detection.');
  } catch(e){if(token===uploadVersions[index])error(`Could not read the photograph: ${e.message}`);}
  finally{if(token===uploadVersions[index]){state.loading[index]=false;render();save();}}
}
function bindImages() {
  document.querySelectorAll('[data-upload]').forEach(input=>input.onchange=()=>loadUpload(input.files[0],Number(input.dataset.upload)));
  document.querySelectorAll('[data-drop]').forEach(card=>{
    card.ondragover=e=>{e.preventDefault();if(!state.busy)card.classList.add('drag-over');};card.ondragleave=()=>card.classList.remove('drag-over');
    card.ondrop=e=>{e.preventDefault();card.classList.remove('drag-over');loadUpload(e.dataTransfer.files[0],Number(card.dataset.drop));};
  });
  document.querySelectorAll('[data-remove]').forEach(button=>button.onclick=()=>{if(state.busy)return;const i=Number(button.dataset.remove);uploadVersions[i]++;state.loading[i]=false;state.images[i]=null;state.views[i]=null;render();save();});
  document.querySelectorAll('[data-date]').forEach(input => input.onchange = () => { const im = state.images[Number(input.dataset.date)]; if (im) { im.date = input.value.slice(0, 80); renderMetrics(); save(); } });
  document.querySelectorAll('[data-georef]').forEach(button => button.onclick = () => openGeoref(Number(button.dataset.georef)));
  document.querySelectorAll('[data-zoom]').forEach(b => b.onclick = () => { const [i, factor] = b.dataset.zoom.split(','); zoom(Number(i), Number(factor)); });
  document.querySelectorAll('[data-feature]').forEach(path => path.addEventListener('click', e => { if (state.tool === 'draw') return; e.stopPropagation(); if (path.closest('svg').dataset.moved === 'true') return; state.active = Number(path.dataset.image); review(path.dataset.feature); }));
  document.querySelectorAll('[data-svg]').forEach(svg => {
    const index = Number(svg.dataset.svg); let drag = null, moved = false;
    svg.addEventListener('wheel', e => { e.preventDefault(); zoom(index, e.deltaY > 0 ? 1.15 : .85, svgPoint(svg, e)); }, { passive: false });
    svg.addEventListener('pointerdown', e => { if (state.tool === 'draw') return; svg.dataset.moved='false'; drag = { x: e.clientX, y: e.clientY, view: [...viewBox(index)] }; moved = false; });
    svg.addEventListener('pointermove', e => { if (!drag) return; const r = svg.getBoundingClientRect(); const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) { moved = true; svg.setPointerCapture(e.pointerId); } const units = Math.max(drag.view[2] / r.width, drag.view[3] / r.height); state.views[index] = [drag.view[0] - dx * units, drag.view[1] - dy * units, drag.view[2], drag.view[3]]; svg.setAttribute('viewBox', viewBox(index).join(' ')); });
    svg.addEventListener('pointercancel', () => { drag = null; });
    svg.addEventListener('pointerup', () => { drag = null; svg.dataset.moved=String(moved); if (moved) refreshView(index); });
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
  const v=viewBox(state.active), im=state.images[state.active];
  $('#review-detail').innerHTML = `<div class="review-preview"><svg viewBox="${v.join(' ')}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Selected solar area close-up"><image href="${esc(im.preview)}" width="${im.meta.width}" height="${im.meta.height}"/><g id="review-native"></g><path d="${drawPath(f.rings)}" fill="#d8c06b33" stroke="#eed879" stroke-width="2" vector-effect="non-scaling-stroke" fill-rule="evenodd"/></svg></div><div class="review-metrics"><div><small>Plan footprint</small><strong>${number(m.plan, 2)} m²</strong></div><div><small>Panel face area</small><strong>${number(m.face, 2)} m²</strong></div><div><small>${m.estimated ? 'Estimated panels' : 'Manual count'}</small><strong>${m.estimated && m.count != null ? '≈ ' : ''}${number(m.count)}</strong></div></div><p class="small-note">${m.position ? `${m.position[1].toFixed(6)}° N, ${m.position[0].toFixed(6)}° E` : 'Coordinates unavailable. Set image georeferencing to locate this area.'}</p>`;
  $('#area-tilt').value=f.tilt??'';$('#area-module').value=f.moduleArea??'';$('#area-note').value=f.note||'';
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
  const anchor=location(m,[0,0]);
  $('#geo-crs').value = ['EPSG:2326','EPSG:3857'].includes(m.crs) ? m.crs : anchor ? 'WGS84' : 'scale'; syncGeoFields(); $('#geo-east').value = a?.[2] ?? ''; $('#geo-north').value = a?.[5] ?? ''; $('#geo-lat').value=anchor?.[1]??'';$('#geo-lon').value=anchor?.[0]??''; $('#geo-gsd').value = pixelAreaM2(m) ? Math.sqrt(pixelAreaM2(m)) : '';
  $('#georef-dialog').showModal();
}
let mapVersion=0;
async function renderMap(period = state.mapPeriod) {
  const version=++mapVersion;
  state.mapPeriod=period;
  if (!leaflet) { leaflet = L.map('map', { preferCanvas: true }).setView([22.34, 114.12], 11); L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 20 }).addTo(leaflet); }
  const data = $('#map-scope').value==='all' ? libraryGeojson(await getStudies(),state.settings) : geojson(state.images,state.settings);
  if(version!==mapVersion)return;
  leaflet.eachLayer(layer => { if (!(layer instanceof L.TileLayer)) leaflet.removeLayer(layer); }); const selected = data.features.filter(f => period === 'both' || f.properties.period === (period === '0' ? 'older' : 'newer'));
  const group = L.geoJSON({ type: 'FeatureCollection', features: selected }, { style: f => ({ color: f.properties.period === 'older' ? '#ca9c53' : '#238a66', weight: 2, fillOpacity: .35 }), onEachFeature: (f, layer) => { const p = f.properties; layer.bindPopup(`<strong>${esc(p.study||state.title)} · ${esc(p.id)} · ${esc(p.period)}</strong><br>${esc(p.image)}<br>${number(p.plan_area_m2, 1)} m² footprint<br>${p.count_method === 'area-based estimate' ? '≈ ' : ''}${number(p.count)} panels<br>${esc(p.count_method)}`); } }).addTo(leaflet);
  if (selected.length) leaflet.fitBounds(group.getBounds(), { padding: [40, 40], maxZoom: 19 });
  $('#map-note').textContent = `${selected.length} solar areas displayed. ${data.skipped_unlocated_ids.length ? `${data.skipped_unlocated_ids.length} unlocated areas omitted; set coordinates to include them.` : 'Map outlines inherit the photographs’ coordinate accuracy.'} Basemap tiles require internet.`;
  leaflet.invalidateSize();
}
async function runDetection() {
  if (state.busy || state.loading.some(v=>v!==false)) return toast('Wait for your photographs to finish loading.');
  const pending = state.images.map((im, index) => ({ im, index })).filter(({ im }) => im?.read && im.meta.original);
  if (!pending.length) { toast('Upload original photographs to run detection. Supplied studies have saved AI results.'); return; }
  state.busy = true; renderMetrics(); $('#run-detection').disabled = true; $('#new-study').disabled = true; $('#site-select').disabled = true; $('#progress').hidden = false; error('');
  try {
    const results = [], options = { ...state.settings };
    for (let i = 0; i < pending.length; i++) {
      const { im, index } = pending[i];
      const result = await detect(im, options, (p, text) => { $('#progress-value').value = (i + p) / pending.length; $('#progress-percent').textContent=Math.round((i+p)/pending.length*100)+'%'; $('#progress-text').textContent = text; });
      results.push({ index, result });
    }
    for (const { index, result } of results) { const im = state.images[index]; im.features = result.features; im.run = result.run; im.analyzed = true; }
    render(); save(); toast('Detection complete. Review outlines and inspect for missed panels.');
  } catch (e) { error(e.message === 'Detection cancelled.' ? 'Detection cancelled. Previous results were preserved.' : `Detection could not finish: ${e.message}`); }
  finally { state.busy = false; renderMetrics(); $('#run-detection').disabled = false; $('#new-study').disabled = false; $('#site-select').disabled = false; $('#progress').hidden = true; }
}

document.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => setTab(b.dataset.tab));
document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => $(`#${b.dataset.close}`).close());
$('#study-title').onchange = e => { state.title = e.target.value.slice(0, 160); save(); };
$('#run-detection').onclick = runDetection;
$('#live-sample').onclick = async () => {
  if (state.busy || state.loading.some(v=>v!==false)) return;
  state.sampleLoading=true;state.loading=[0,0];
  const button = $('#live-sample'); button.disabled = true; error('');
  try {
    toast('Loading two real HAECO roof crops for live browser detection…');
    const images = await Promise.all(['2017', '2025'].map(async year => {
      const response = await fetch(new URL(`demo/sample-${year}.tif`, document.baseURI));
      if (!response.ok) throw new Error('Live sample could not be loaded.');
      return openImage(new File([await response.blob()], `HAECO-${year}-sample.tif`, { type: 'image/tiff' }));
    }));
    images[0].meta.georefSource = 'registered older crop · approximate';
    resetReviewFilters();state.images = images; state.projectId=crypto.randomUUID();state.datasetId=null;state.title = 'HAECO · live detection sample'; state.views = [null, null]; state.selected = null; state.tool = 'select'; state.drawing = [];
    state.sampleLoading=false;state.loading=[false,false];syncInputs(); setTab('overview'); render(); await runDetection();
  } catch (e) { error(e.message); }
  finally { state.sampleLoading=false;state.loading=[false,false];button.disabled = false;render(); }
};
$('#cancel').onclick = cancelDetection;
$('#overlay-toggle').onclick = () => { state.overlay = !state.overlay; renderImages(); };
$('#fit-view').onclick = () => { state.views = [null, null]; renderImages(); };
$('#period-tabs').querySelectorAll('button').forEach(b => b.onclick = () => { state.active = Number(b.dataset.period); state.page=0; state.tool = 'select'; state.drawing = []; renderInventory(); renderImages(); });
$('#map-period').querySelectorAll('button').forEach(b => b.onclick = () => { $('#map-period').querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); renderMap(b.dataset.mapPeriod).catch(e=>error(e.message)); });
$('#review-filter').onchange = e => { state.filter = e.target.value; state.page=0; renderInventory(); };
$('#draw-area').onclick = () => { if (!state.images[state.active]) return toast('Upload a photograph first.'); if (state.busy) return; state.tool = state.tool === 'draw' ? 'select' : 'draw'; state.drawing = []; renderImages(); renderInventory(); if (state.tool === 'draw') toast('Click each corner in the active photo. Double-click or press Enter to finish. Escape cancels.'); };
document.addEventListener('keydown', e => { if (state.tool === 'draw' && e.key === 'Enter') { e.preventDefault(); finishDrawing(); } if (e.key === 'Escape') { state.tool = 'select'; state.drawing = []; renderImages(); renderInventory(); } });
$('#confirm-area').onclick = () => { const f = selectedFeature(); if (!f) return; const raw = $('#verified-count').value; const count = raw === '' ? null : Number(raw); if (count != null && (!Number.isSafeInteger(count) || count < 0)) return toast('Enter a whole-number panel count of zero or more.'); const tilt=$('#area-tilt').value, module=$('#area-module').value; if(tilt!==''&&(!Number.isFinite(Number(tilt))||Number(tilt)<0||Number(tilt)>80))return toast('Tilt must be between 0 and 80 degrees.'); if(module!==''&&(!Number.isFinite(Number(module))||Number(module)<.1||Number(module)>20))return toast('Module area must be between 0.1 and 20 m².'); f.tilt=tilt===''?null:Number(tilt);f.moduleArea=module===''?null:Number(module);f.note=$('#area-note').value.slice(0,1000);f.count = count; f.reviewed = true; $('#review-dialog').close(); render(); save(); };
$('#exclude-area').onclick = () => { const f = selectedFeature(); if (!f) return; f.excluded = !f.excluded; $('#review-dialog').close(); render(); save(); };
function syncGeoFields(){const mode=$('#geo-crs').value;$('#grid-fields').hidden=mode==='scale'||mode==='WGS84';$('#latlon-fields').hidden=mode!=='WGS84';}
$('#geo-crs').onchange=syncGeoFields;
$('#geo-save').onclick=()=>{try{state.images[geoIndex].meta=calibrate(state.images[geoIndex].meta,{mode:$('#geo-crs').value,gsd:$('#geo-gsd').value,east:$('#geo-east').value,north:$('#geo-north').value,lat:$('#geo-lat').value,lon:$('#geo-lon').value});$('#georef-dialog').close();render();save();}catch(e){toast(e.message);}};

for (const [id, key, min, max] of [['tilt', 'tilt', 0, 80], ['module-area', 'moduleArea', .1, 20], ['threshold', 'threshold', .1, .95]]) {
  $(`#${id}`).onchange = e => { const raw = e.target.value; if (key === 'tilt' && raw === '') state.settings[key] = ''; else if (raw === '' || !Number.isFinite(Number(raw)) || Number(raw) < min || Number(raw) > max) { e.target.value = state.settings[key]; return toast(`Enter a value from ${min} to ${max}.`); } else state.settings[key] = raw; renderMetrics(); renderInventory(); save(); };
}
$('#gsd').onchange = e => { state.settings.gsd = e.target.value; save(); };
$('#export-open').onclick = () => $('#export-dialog').showModal();
$('#export-project').onclick = () => { download(JSON.stringify(serialize()), 'solar-lens-project.json'); toast('Project saved. Keep original photos for future detection runs.'); };
$('#export-geojson').onclick = () => { const data = geojson(state.images, state.settings); if (!data.features.length) return toast('No georeferenced results available to export.'); download(JSON.stringify(data), 'solar-lens-outlines.geojson', 'application/geo+json'); if (data.skipped_unlocated_ids.length) toast(`${data.skipped_unlocated_ids.length} unlocated areas were omitted.`); };
$('#export-csv').onclick = () => {
  const rows = [['period', 'image', 'date', 'area_id', 'included', 'reviewed', 'panel_count', 'count_method', 'plan_area_m2', 'face_area_m2', 'assumed_tilt_deg', 'module_face_area_m2', 'latitude', 'longitude', 'method', 'review_note']];
  state.images.forEach((im, index) => im?.analyzed && im.features.forEach(f => { const m = measure(f, im.meta, state.settings); rows.push([index ? 'newer' : 'older', im.name, im.date, f.id, !f.excluded, !!f.reviewed, m.count, m.estimated ? 'area-based estimate' : 'manual count', m.plan, m.face, m.tilt, m.moduleArea, m.position?.[1], m.position?.[0], f.method, f.note || '']); }));
  if (rows.length === 1) return toast('Run detection or draw an area before exporting.'); download(rows.map(r => r.map(csvCell).join(',')).join('\r\n'), 'solar-lens-measurements.csv', 'text/csv;charset=utf-8');
};
$('#import-project').onclick = () => { if (!state.busy && !state.loading.some(v=>v!==false)) $('#project-file').click(); };
$('#project-file').onchange = async e => { const f = e.target.files[0]; if (!f || state.busy || state.loading.some(v=>v!==false)) return; studyVersion++;try { if (f.size > 80e6) throw new Error('Project file is too large (maximum 80 MB).'); restore(JSON.parse(await f.text())); save(); toast('Project restored. Upload original photos to rerun detection.'); } catch (e) { error(`Could not open project: ${e.message}`); } e.target.value = ''; };
$('#new-study').onclick = () => { if (state.busy || state.sampleLoading) return; state.images = [null, null]; state.projectId=crypto.randomUUID();state.datasetId=null;resetReviewFilters();studyVersion++;uploadVersions[0]++;uploadVersions[1]++;state.loading=[false,false];state.page=0;state.images=[null,null];state.title = 'Untitled comparison'; state.views = [null, null]; state.selected = null; state.tool = 'select'; state.drawing = []; $('#site-select').value = ''; syncInputs(); render(); save(); setTab('overview'); toast('New comparison ready. Previous work is saved in your data library.'); };
let studyVersion=0;
async function loadDemo(id) {
  if(state.busy||state.loading.some(v=>v!==false))return toast('Finish the current operation before changing studies.');
  const version=++studyVersion;error('');
  try{
    const saved=state.projects.find(p=>p.id===id||p.datasetId===id);
    const item=state.manifest.find(p=>p.id===id);
    let data;
    if(saved)data=structuredClone(saved);
    else{if(!item)return;const res=await fetch(new URL(item.path,document.baseURI));if(!res.ok)throw new Error('Could not load this study. Try again.');data={...await res.json(),id:`dataset-${id}`,datasetId:id,version:1,settings:{...state.settings}};}
    if(version!==studyVersion)return;
    restore(data);save();$('#site-select').value=data.datasetId||'';setTab('overview');
    toast(saved?'Reopened your saved comparison.':'Study loaded. AI candidates need review.');
  }catch(e){error(e.message);}
}
$('#site-select').onchange=e=>loadDemo(e.target.value);
let studyCache;
async function getStudies(){
  if(!studyCache)studyCache=Promise.all(state.manifest.map(async p=>{const res=await fetch(new URL(p.path,document.baseURI));if(!res.ok)throw new Error(`Could not load ${p.title}. Check your connection and try again.`);return {...await res.json(),id:p.id,datasetId:p.id,source:'supplied'};})).catch(e=>{studyCache=null;throw e;});
  const originals=await studyCache;
  const records=originals.map(p=>{const saved=state.projects.find(x=>x.datasetId===p.id);return saved?{...saved,id:p.id,source:'supplied',edited:true}:p;});
  const suppliedIds=new Set(originals.map(p=>p.id));
  for(const p of state.projects)if(!suppliedIds.has(p.datasetId)&&p.images?.some(Boolean))records.push({...p,source:'mine'});
  return records;
}
function filteredStudies(studies){
  const search=state.studySearch.trim().toLowerCase();
  let result=studies.filter(p=>(state.studySource==='all'||(state.studySource==='mine'?p.source==='mine':p.source==='supplied'))&&(!search||[p.title,...p.images.filter(Boolean).flatMap(i=>[i.name,i.date])].join(' ').toLowerCase().includes(search)));
  const metric=p=>{const a=summary(p.images[0],projectSettings(p,state.settings)),b=summary(p.images[1],projectSettings(p,state.settings));return state.studySort==='change'?(b?.plan??0)-(a?.plan??0):(b?.plan??0);};
  result.sort(state.studySort==='name'?(a,b)=>a.title.localeCompare(b.title):(a,b)=>metric(b)-metric(a));return result;
}
let libraryVersion=0;
async function renderStudies(){
  const version=++libraryVersion;
  $('#library-count').textContent='Loading studies…';
  try{
    const all=await getStudies();if(version!==libraryVersion)return;const studies=filteredStudies(all);
    $('#library-count').textContent=`${studies.length} studies · ${studies.reduce((n,p)=>n+p.images.filter(Boolean).length,0)} photographs`;
    const totals=[0,1].map(i=>{const measured=studies.map(p=>summary(p.images[i],projectSettings(p,state.settings)));const sum=key=>!measured.length||measured.some(m=>m?.[key]==null)?null:measured.reduce((n,m)=>n+m[key],0);return {count:sum('count'),plan:sum('plan')};});
    $('#study-totals').innerHTML=[['Older panels',totals[0].count,'','Area-based or reviewed count'],['Newer panels',totals[1].count,'','Area-based or reviewed count'],['Older footprint',totals[0].plan,'m²','Included solar area'],['Newer footprint',totals[1].plan,'m²','Included solar area']].map(([name,value,unit,note])=>`<article class="metric-card"><div class="metric-top">${esc(name)}</div><div class="metric-value">${unit||value==null?'':'≈ '}${number(value,unit?1:0)} <small>${unit}</small></div><div class="metric-compare">${note}</div></article>`).join('');
    $('#study-cards').innerHTML=studies.length?studies.map(p=>{
      const a=summary(p.images[0],projectSettings(p,state.settings)),b=summary(p.images[1],projectSettings(p,state.settings)),preview=p.images[1]?.preview||p.images[0]?.preview,max=Math.max(a?.plan||0,b?.plan||0,1);
      return `<article class="study-card"><div class="study-thumbnail">${preview?`<img src="${esc(preview)}" alt="${esc(p.title)} aerial preview" loading="lazy"/>`:''}<span class="pill">${p.source==='mine'?'MY UPLOADS':p.edited?'SUPPLIED · YOUR REVIEW':'SUPPLIED STUDY'}</span></div><div class="study-card-body"><h3>${esc(p.title)}</h3><div class="study-dates">${esc(p.images[0]?.date||'No older photo')} → ${esc(p.images[1]?.date||'No newer photo')}</div><div class="study-comparison"><div><small>OLDER · PANELS</small><strong>${displayCount(a)}</strong><span>${number(a?.plan,1)} m² footprint</span></div><div><small>NEWER · PANELS</small><strong>${displayCount(b)}</strong><span>${number(b?.plan,1)} m² footprint</span></div></div><div class="study-chart" title="Relative older and newer footprint"><i style="width:${(a?.plan||0)/max*50}%"></i><b style="width:${(b?.plan||0)/max*50}%"></b></div><div class="study-card-footer"><span>${number(b?.reviewed||0)} newer areas reviewed</span><button data-open-study="${esc(p.id)}">Open study ${icon('arrow')}</button></div></div></article>`;
    }).join(''):`<div class="empty-inventory"><h3>No studies match this view</h3><p>Change the search or source filter, or create your first comparison.</p></div>`;
    $('#all-studies-table').innerHTML=`<div class="table-scroll"><table><thead><tr><th>Study / dates</th><th>Older panels</th><th>Newer panels</th><th>Older footprint</th><th>Newer footprint</th><th>Older surface</th><th>Newer surface</th></tr></thead><tbody>${studies.map(p=>{const a=summary(p.images[0],projectSettings(p,state.settings)),b=summary(p.images[1],projectSettings(p,state.settings));return `<tr><td><strong>${esc(p.title)}</strong><small>${esc(p.images[0]?.date||'—')} → ${esc(p.images[1]?.date||'—')}</small></td><td>${displayCount(a)}</td><td>${displayCount(b)}</td><td>${number(a?.plan,1)} m²</td><td>${number(b?.plan,1)} m²</td><td>${number(a?.face,1)} m²</td><td>${number(b?.face,1)} m²</td></tr>`;}).join('')}</tbody></table></div>`;
    document.querySelectorAll('[data-open-study]').forEach(b=>b.onclick=async()=>{await loadDemo(b.dataset.openStudy);setTab('overview');});
  }catch(e){$('#library-count').textContent='Data unavailable';$('#study-cards').textContent=e.message;}
}
$('#export-all').onclick=async()=>{
 try{const studies=filteredStudies(await getStudies());if(!studies.length)return toast('No studies to export.');const rows=[['site','period','date','candidate_regions','panel_count','count_contains_estimates','plan_area_m2','face_area_m2','global_tilt_deg','global_module_area_m2','reviewed_regions']];for(const p of studies)for(const [i,im]of p.images.entries()){const m=summary(im,projectSettings(p,state.settings));rows.push([p.title,i?'newer':'older',im?.date,m?.arrays,m?.count,m?.estimated,m?.plan,m?.face,projectSettings(p,state.settings).tilt,projectSettings(p,state.settings).moduleArea,m?.reviewed]);}download(rows.map(r=>r.map(csvCell).join(',')).join('\r\n'),'solar-lens-library-summary.csv','text/csv;charset=utf-8');}catch(e){error(e.message);}
};
$('#export-all-geojson').onclick=async()=>{try{const studies=filteredStudies(await getStudies());const data=libraryGeojson(studies,state.settings);if(!data.features.length)return toast('No located outlines are available.');download(JSON.stringify(data),'solar-lens-library-outlines.geojson','application/geo+json');toast(`${data.features.length} located outlines exported. ${data.skipped_unlocated_ids.length} unlocated areas omitted.`);}catch(e){error(e.message);}};
$('#area-search').oninput=e=>{state.areaSearch=e.target.value;state.page=0;renderInventory();};
$('#area-sort').onchange=e=>{state.areaSort=e.target.value;state.page=0;renderInventory();};
$('#study-search').oninput=e=>{state.studySearch=e.target.value;renderStudies();};
$('#study-source').onchange=e=>{state.studySource=e.target.value;renderStudies();};
$('#study-sort').onchange=e=>{state.studySort=e.target.value;renderStudies();};
$('#map-scope').onchange=()=>renderMap(state.mapPeriod).catch(e=>error(e.message));
$('#sync-views').onchange=e=>{state.sync=e.target.checked;};
document.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{if(b.dataset.step==='export')$('#export-dialog').showModal();else{const target=b.dataset.step==='images'?'images-section':b.dataset.step==='settings'?'settings-section':'review-section';if(target==='settings-section')$('#settings-section').open=true;$('#'+target).scrollIntoView({behavior:'smooth',block:'start'});}});
async function initialize(){
 render();
 try{const response=await fetch(new URL('demo/manifest.json',document.baseURI));if(!response.ok)throw new Error();const data=await response.json();state.manifest=data.pairs||[];$('#site-select').innerHTML=`<option value="">Choose a supplied study</option>${state.manifest.map(p=>`<option value="${esc(p.id)}">${esc(p.title)} · ${p.olderYear}–${p.newerYear}</option>`).join('')}`;}catch{$('#site-select').innerHTML='<option value="">Study list unavailable</option>';error('Supplied studies could not load. Check your connection or upload your own photographs.');}
 try{const db=await database();const read=store=>new Promise((resolve,reject)=>{const req=db.transaction(store).objectStore(store);const r=store==='saved'?req.getAll():req.get('current');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});const [current,saved]=await Promise.all([read('projects'),read('saved')]);db.close();state.projects=(saved||[]).filter(p=>{try{validateProject(p);return true;}catch{return false;}});if(current){restore(current);state.projects=[...state.projects.filter(p=>p.id!==state.projectId),serialize()];return;}}catch{/* File export remains available if browser storage is disabled. */}
 const first=state.manifest.find(p=>p.id==='haeco')||state.manifest[0];if(first){$('#site-select').value=first.id;await loadDemo(first.id);}
}
initialize();
