import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { summary } from '../src/geometry.js';
test('all eleven real study pairs and their preview assets are complete', () => {
  const manifest = JSON.parse(fs.readFileSync('public/demo/manifest.json'));
  assert.equal(manifest.pairs.length, 11);
  for (const pair of manifest.pairs) {
    const data = JSON.parse(fs.readFileSync('public/' + pair.path));
    assert.equal(data.images.length, 2);
    for (const image of data.images) {
      assert.ok(fs.existsSync('public/' + image.preview));
      assert.equal(image.analyzed, true); assert.equal(image.run.reviewRequired, true);
      assert.ok(image.features.length < 50000);
      for (const f of image.features) {
        assert.equal(f.count, null); assert.equal(f.reviewed, false);
        for (const ring of f.rings) {
          assert.ok(ring.length >= 4); assert.deepEqual(ring[0], ring.at(-1));
          for (const [x, y] of ring) { assert.ok(Number.isFinite(x) && Number.isFinite(y)); assert.ok(x >= -.1 && y >= -.1 && x <= image.meta.width + .1 && y <= image.meta.height + .1); }
        }
      }
      const measured = summary(image, { tilt: '0', moduleArea: '2.2' });
      assert.ok(measured.plan == null || measured.plan >= 0 && measured.plan <= 451000);
    }
  }
});
test('packaged model checksum matches and fits a 25 MiB asset limit', () => {
  const manifest = JSON.parse(fs.readFileSync('public/models/manifest.json'));
  const data = fs.readFileSync('public/models/solar.onnx');
  assert.equal(crypto.createHash('sha256').update(data).digest('hex'), manifest.sha256);
  assert.ok(data.byteLength < 25 * 1024 ** 2);
  assert.deepEqual(manifest.input_shape, [1, 3, 640, 640]);
});
