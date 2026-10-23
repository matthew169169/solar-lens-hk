import { test } from 'node:test';
import assert from 'node:assert/strict';
import { polygonArea, measure, summary, location, compareCoverage, geojson, csvCell } from '../src/geometry.js';
const meta = { width: 100, height: 100, metric: true, crs: 'EPSG:2326', affine: [.1, 0, 807500, 0, -.1, 818600] };
const square = { id: 'A1', rings: [[[0, 0], [20, 0], [20, 10], [0, 10], [0, 0]]], count: null };
test('net polygon area excludes holes', () => {
  assert.equal(polygonArea([...square.rings, [[1, 1], [3, 1], [3, 3], [1, 3], [1, 1]]]), 196);
});
test('tilted face area, estimated module count and manual override', () => {
  const m = measure(square, meta, { tilt: 60, moduleArea: 2 });
  assert.ok(Math.abs(m.plan - 2) < 1e-8);
  assert.ok(Math.abs(m.face - 4) < 1e-8); assert.equal(m.count, 2); assert.equal(m.estimated, true);
  assert.equal(measure({ ...square, count: 7 }, meta, { tilt: '', moduleArea: 2 }).count, 7);
});
test('unknown scale or tilt never becomes measured zero', () => {
  assert.equal(measure(square, { ...meta, affine: null }, { tilt: 0, moduleArea: 2 }).plan, null);
  assert.equal(measure(square, meta, { tilt: '', moduleArea: 2 }).face, null);
  assert.equal(measure(square, meta, { tilt: '', moduleArea: 2 }).count, null);
  assert.equal(summary({ meta, analyzed: false }, {}), null);
});
test('only included candidates count; an analyzed empty image is zero', () => {
  const settings = { tilt: 0, moduleArea: 2 };
  assert.equal(summary({ meta, analyzed: true, features: [square, { ...square, excluded: true }] }, settings).count, 1);
  assert.equal(summary({ meta, analyzed: true, features: [] }, settings).plan, 0);
});
test('HK grid transforms correctly; disjoint areas are not comparable', () => {
  const p = location(meta, [4003.5, 1822.5]);
  assert.ok(p[0] > 113.89 && p[0] < 113.91); assert.ok(p[1] > 22.30 && p[1] < 22.31);
  assert.equal(compareCoverage(meta, meta).ok, true);
  assert.equal(compareCoverage(meta, { ...meta, affine: [.1, 0, 900000, 0, -.1, 900000] }).ok, false);
});
test('GeoJSON exports WGS84, net area and count provenance', () => {
  const out = geojson([{ meta, analyzed: true, features: [square], name: 'test.tif', date: '2025' }], { tilt: 0, moduleArea: 2 });
  assert.equal(out.features.length, 1); assert.equal(out.features[0].geometry.type, 'Polygon');
  assert.equal(out.features[0].properties.count_method, 'area-based estimate');
  assert.ok(out.features[0].geometry.coordinates[0][0][0] < 180);
});
test('CSV safely escapes formulas and embedded quotes', () => {
  assert.equal(csvCell('=SUM(A1)'), '"\'=SUM(A1)"'); assert.equal(csvCell('a"b'), '"a""b"');
});
