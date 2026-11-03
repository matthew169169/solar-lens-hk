import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calibrate } from '../src/calibration.js';
import { location, measure, summary } from '../src/geometry.js';
import { libraryGeojson } from '../src/library.js';

const image = { width: 200, height: 200 };
const area = { id: 'A001', rings: [[[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]], count: null };
const settings = { tilt: '0', moduleArea: '2' };

test('scale-only calibration measures area without inventing coordinates', () => {
  const meta = calibrate(image, { mode: 'scale', gsd: '.1' });
  assert.ok(Math.abs(measure(area, meta, settings).plan - 2) < 1e-9);
  assert.equal(location(meta, [0, 0]), null);
  assert.throws(() => calibrate(image, { mode: 'scale', gsd: '' }));
  assert.throws(() => calibrate(image, { mode: 'EPSG:2326', gsd: '.1', east: '', north: '' }));
});

test('latitude/longitude calibration survives JSON serialization', () => {
  const meta = JSON.parse(JSON.stringify(calibrate(image, { mode: 'WGS84', gsd: '.1', lat: '22.3', lon: '114.1' })));
  const anchor = location(meta, [0, 0]);
  assert.ok(Math.abs(anchor[0] - 114.1) < 1e-7 && Math.abs(anchor[1] - 22.3) < 1e-7);
  assert.ok(location(meta, [100, 100])[1] < anchor[1]);
  assert.throws(() => calibrate(image, { mode: 'WGS84', gsd: '.1', lat: '91', lon: '114' }));
});

test('UTM codes restored without prior calibration work in both hemispheres', () => {
  assert.ok(Math.abs(location({ affine: [1, 0, 500000, 0, -1, 0], crs: 'EPSG:32630' }, [0, 0])[0] + 3) < 1e-7);
  assert.ok(Math.abs(location({ affine: [1, 0, 500000, 0, -1, 10000000], crs: 'EPSG:32731' }, [0, 0])[0] - 3) < 1e-7);
});

test('per-area assumptions override study settings and mixed tilts sum correctly', () => {
  const meta = calibrate(image, { mode: 'scale', gsd: '.1' });
  const tilted = { ...area, tilt: 60, moduleArea: 1, note: 'verified installation' };
  const m = measure(tilted, meta, settings);
  assert.ok(Math.abs(m.face - 4) < 1e-9);
  assert.equal(m.count, 4);
  const total = summary({ meta, analyzed: true, features: [area, tilted] }, settings);
  assert.ok(Math.abs(total.face - 6) < 1e-9);
  assert.equal(total.count, 5);
});

test('library exports preserve each study assumptions, period and identity', () => {
  const meta = calibrate(image, { mode: 'EPSG:2326', gsd: '.1', east: '807500', north: '818600' });
  const im = { name: 'roof.jpg', date: '2025', analyzed: true, meta, features: [area] };
  const out = libraryGeojson([
    { id: 'one', title: 'Roof one', images: [null, im], settings },
    { id: 'two', title: 'Roof two', images: [im, null], settings: { tilt: '60', moduleArea: '1' } },
  ], settings);
  assert.equal(out.features[0].properties.period, 'newer');
  assert.equal(out.features[1].properties.period, 'older');
  assert.equal(out.features[1].properties.study, 'Roof two');
  assert.equal(out.features[1].properties.count, 4);
  assert.equal(out.features[0].properties.count, 1);
});
