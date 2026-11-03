import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { History, changeFeatures } from '../src/history.js';
import { summary, cachedGeojson } from '../src/measurement-cache.js';
import { validateProject, normalizeSettings, restoreImages, mergeLibrary, isOriginalReattachment } from '../src/project-data.js';
import { createSaveQueue } from '../src/persistence.js';
import { previewDimensions, scanWorkload, comparisonQuality } from '../src/scan-plan.js';
import { fingerprintSample } from '../src/imagery.js';

const settings = { tilt: '0', moduleArea: '2', gsd: '.10' };
const feature = () => ({ id: 'A001', rings: [[[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]], count: null, reviewed: false, excluded: false });
const image = () => ({ name: 'roof.jpg', date: '2025', meta: { width: 100, height: 100, metric: true, crs: 'EPSG:2326', affine: [.1, 0, 807500, 0, -.1, 818600] }, features: [feature()], preview: 'demo/roof.jpg', analyzed: true });
const project = () => ({ id: 'study-one', version: 1, title: 'My study', settings, updatedAt: '2026-11-03T01:00:00Z', images: [image(), null] });

test('bulk edits are immutable and keep their original geometry', () => {
  const im = image(), before = im.features;
  const after = changeFeatures(im, ['A001'], { excluded: true });
  assert.equal(before[0].excluded, false); assert.equal(after[0].excluded, true);
  assert.equal(after[0].rings, before[0].rings);
});
test('undo/redo restores values, drops a branched redo and respects history bounds', () => {
  const h = new History(2); let value = 0;
  const set = next => { const before = value; value = next; h.add({ undo: () => value = before, redo: () => value = next }); };
  set(1); set(2); set(3); assert.equal(h.past.length, 2);
  h.undo(); assert.equal(value, 2); h.redo(); assert.equal(value, 3);
  h.undo(); set(9); assert.equal(h.redo(), false); assert.equal(value, 9);
  h.clear(); assert.equal(h.undo(), false);
});
test('unchanged summaries are cached and edits, assumptions and calibration invalidate them', () => {
  const im = image(), first = summary(im, settings);
  assert.equal(summary(im, { ...settings }), first);
  im.features = changeFeatures(im, ['A001'], { count: 17 });
  assert.equal(summary(im, settings).count, 17);
  assert.notEqual(summary(im, settings), first);
  const tilted = summary(im, { ...settings, tilt: '60' });
  assert.ok(Math.abs(tilted.face - 4) < 1e-8);
  im.meta = { ...im.meta, affine: [.2, 0, 807500, 0, -.2, 818600] };
  assert.ok(Math.abs(summary(im, settings).plan - 8) < 1e-8);
});
test('cached geographic outlines retain period, scan provenance and current review values', () => {
  const im = image();
  const first = cachedGeojson([null, im], settings);
  assert.equal(first.features[0].properties.period, 'newer');
  const second = cachedGeojson([im, null], settings);
  assert.equal(second.features[0].geometry, first.features[0].geometry);
  assert.equal(second.features[0].properties.period, 'older');
  im.run = { source: 'reduced preview', workingGsdM: .5 };
  assert.equal(cachedGeojson([im], settings).features[0].properties.image_source, 'reduced preview');
  im.features = changeFeatures(im, ['A001'], { reviewed: true, count: 8 });
  assert.equal(cachedGeojson([im], settings).features[0].properties.count, 8);
});
test('all eleven supplied projects satisfy import validation', () => {
  const manifest = JSON.parse(fs.readFileSync(new URL('../public/demo/manifest.json', import.meta.url)));
  for (const item of manifest.pairs) {
    const data = JSON.parse(fs.readFileSync(new URL('../public/' + item.path, import.meta.url)));
    assert.doesNotThrow(() => validateProject({ ...data, version: 1 }));
  }
});
test('invalid IDs, flags, geometry and settings cannot break imported inventories', () => {
  const invalid = modify => { const p = project(); modify(p); assert.throws(() => validateProject(p)); };
  invalid(p => p.images[0].features[0].id = 123);
  invalid(p => p.images[0].features.push(feature()));
  invalid(p => p.images[0].features[0].reviewed = 'false');
  invalid(p => p.images[0].features[0].rings[0][4] = [3, 3]);
  invalid(p => p.settings = { tilt: 'unknown text' });
  invalid(p => p.images[0].meta.affine = [0, 0, 0, 0, 0, 0]);
  assert.equal(normalizeSettings({ gsd: 0.1, tilt: '' }).gsd, '.10');
});
test('restoration strips JSON runtime fields and never treats a preview as an original', () => {
  const im = { ...image(), read: 'invalid reader', dispose: 'invalid cleanup', meta: { ...image().meta, original: true } };
  const clean = restoreImages([im, null])[0];
  assert.equal(clean.read, undefined); assert.equal(clean.dispose, undefined); assert.equal(clean.meta.original, false);
});
test('backup merge preserves newer records and validates the whole backup before mutation', () => {
  const old = project(), newer = { ...project(), updatedAt: '2026-11-03T02:00:00Z', title: 'Newer' };
  assert.equal(mergeLibrary([newer], { kind: 'solar-lens-library', version: 1, projects: [old] })[0].title, 'Newer');
  assert.equal(mergeLibrary([old], { kind: 'solar-lens-library', version: 1, projects: [newer] })[0], newer);
  assert.throws(() => mergeLibrary([old], { kind: 'solar-lens-library', version: 1, projects: [newer, { version: 1 }] }));
  assert.equal(old.title, 'My study');
});
test('reattaching a matching original preserves reviews, while replacements do not', () => {
  const previous = { ...image(), sizeBytes: 123, sampleFingerprint: 'same' };
  const uploaded = { ...image(), sizeBytes: 123, sampleFingerprint: 'same' };
  assert.equal(isOriginalReattachment(previous, uploaded), true);
  assert.equal(isOriginalReattachment(previous, { ...uploaded, sampleFingerprint: 'changed' }), false);
  assert.equal(isOriginalReattachment({ ...previous, read: () => {} }, uploaded), false);
  assert.equal(isOriginalReattachment(previous, { ...uploaded, sizeBytes: 124 }), false);
});
test('sampled fingerprints are stable and change with modified bytes', async () => {
  assert.equal(await fingerprintSample(new Blob(['one'])), await fingerprintSample(new Blob(['one'])));
  assert.notEqual(await fingerprintSample(new Blob(['one'])), await fingerprintSample(new Blob(['two'])));
});
test('portrait previews and workload estimates never invent finer source detail', () => {
  assert.deepEqual(previewDimensions(500, 100000), { width: 7, height: 1400 });
  assert.deepEqual(previewDimensions(100, 100), { width: 100, height: 100 });
  const im = image();
  assert.equal(scanWorkload(im.meta, settings, 10).workingGsdM, 1);
  assert.equal(scanWorkload({ ...im.meta, width: 1280, height: 1280 }, settings).tiles, 9);
});
test('comparison checks distinguish reversed dates, mismatched detail and unknown metadata', () => {
  const a = { date: '2025-01-01', run: { workingGsdM: .1 } }, b = { date: '2017', run: { workingGsdM: .4 } };
  assert.deepEqual(comparisonQuality([a, b]), { reversed: true, mixedResolution: true });
  assert.deepEqual(comparisonQuality([b, { ...a, run: { workingGsdM: .4 } }]), { reversed: false, mixedResolution: false });
  assert.deepEqual(comparisonQuality([null, { date: '', run: {} }]), { reversed: false, mixedResolution: false });
});
test('save queue starts immediately and coalesces newer edits without stale overwrites', async () => {
  let release; const gate = new Promise(resolve => release = resolve); const writes = [];
  const queue = createSaveQueue(async current => { writes.push(current.value); if (writes.length === 1) await gate; });
  const completion = queue.enqueue({ id: 'one', value: 1 });
  await Promise.resolve(); assert.deepEqual(writes, [1]);
  queue.enqueue({ id: 'one', value: 2 }); queue.enqueue({ id: 'one', value: 3 }); release(); await completion;
  assert.deepEqual(writes, [1, 3]); assert.equal(queue.pending, 0);
});
test('failed saves remain retryable and library imports keep the explicit current project', async () => {
  let fail = true, currentId; const states = [];
  const queue = createSaveQueue(async current => { if (fail) throw new Error('quota'); currentId = current.id; }, status => states.push(status));
  await queue.enqueue({ id: 'one' }); assert.equal(queue.pending, 1); assert.equal(states.at(-1), 'error');
  fail = false; await queue.retry(); assert.equal(queue.pending, 0);
  await queue.enqueueAll([{ id: 'two' }, { id: 'three' }], { id: 'one' });
  assert.equal(currentId, 'one'); assert.equal(states.at(-1), 'saved');
});
