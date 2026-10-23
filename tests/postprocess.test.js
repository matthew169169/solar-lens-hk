import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decode, iou } from '../src/postprocess.js';
import { polygonArea } from '../src/geometry.js';
test('IoU handles duplicates and disjoint boxes', () => {
  const a = { x1: 0, y1: 0, x2: 10, y2: 10 };
  assert.equal(iou(a, a), 1); assert.equal(iou(a, { x1: 20, y1: 20, x2: 30, y2: 30 }), 0);
});
test('YOLO masks reject low scores and NMS suppresses duplicates', () => {
  const n = 16, d = new Float32Array(6 * n);
  for (let i = 0; i < n; i++) { d[i] = 320; d[n + i] = 320; d[2 * n + i] = 320; d[3 * n + i] = 320; d[4 * n + i] = i < 2 ? .9 : .1; d[5 * n + i] = 2; }
  const outputs = [{ dims: [1, 6, n], data: d }, { dims: [1, 1, 8, 8], data: new Float32Array(64).fill(1) }];
  const r = decode(outputs, .35); assert.equal(r.rawInstances, 1); assert.equal(r.polygons.length, 1); assert.ok(polygonArea(r.polygons[0]) > 90000);
  assert.equal(decode(outputs, .95).polygons.length, 0);
});
test('Unsupported model outputs fail clearly', () => { assert.throws(() => decode([]), /Expected YOLO/); });
