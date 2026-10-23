import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rasterBands } from '../src/raster-bands.js';
test('the largest supplied TIFF preview never requests a whole-image native buffer', () => {
  const bands = rasterBands([0, 0, 18750, 15000], 1400, 1120);
  assert.ok(bands.length > 1);
  let nativeY = 0, outputY = 0;
  for (const band of bands) {
    assert.equal(band.window[1], nativeY); assert.equal(band.y, outputY);
    assert.ok((band.window[2] - band.window[0]) * (band.window[3] - band.window[1]) <= 4_000_000);
    nativeY = band.window[3]; outputY += band.height;
  }
  assert.equal(nativeY, 15000); assert.equal(outputY, 1120);
});
test('small detection windows stay a single read and retain their offsets', () => {
  assert.deepEqual(rasterBands([123, 456, 1723, 2056], 640, 640), [{ window: [123, 456, 1723, 2056], width: 640, height: 640, y: 0 }]);
});
test('impractical preview geometry fails before allocating a huge native array', () => {
  assert.throws(() => rasterBands([0, 0, 500000, 500000], 1400, 1400), /too large/);
  assert.throws(() => rasterBands([2, 0, 1, 10], 10, 10), /Invalid/);
});
