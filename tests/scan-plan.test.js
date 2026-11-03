import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planScan, commitScan, previewWindow } from '../src/scan-plan.js';

test('current scan keeps the selected first photo and never substitutes the second', () => {
  const images = [{ name: 'my-current-roof.jpg' }, { name: 'other-location.jpg' }];
  const pending = planScan(images, 0);
  assert.equal(pending.length, 1);
  assert.equal(pending[0].image, images[0]);
  commitScan(images, pending, [{ features: [{ id: 'current' }], run: { image: images[0].name } }]);
  assert.equal(images[0].features[0].id, 'current');
  assert.equal(images[1].features, undefined);
  assert.equal(images[0].name, 'my-current-roof.jpg');
});
test('single-photo and both-photo scans use only supplied image identities', () => {
  const current = { name: 'new-scenario.tif' };
  assert.equal(planScan([current, null], 0)[0].image, current);
  assert.equal(planScan([current, null], 1, 'both')[0].image, current);
  assert.throws(() => planScan([current, null], 1));
});
test('stale results cannot overwrite a replacement photograph or partially update a pair', () => {
  const images = [{ name: 'old.jpg', features: ['keep'] }, { name: 'new.jpg', features: ['keep'] }];
  const pending = planScan(images, 0, 'both');
  images[1] = { name: 'replacement.jpg', features: ['keep'] };
  assert.throws(() => commitScan(images, pending, [{ features: ['bad'] }, { features: ['bad'] }]));
  assert.deepEqual(images[0].features, ['keep']);
  assert.deepEqual(images[1].features, ['keep']);
});
test('saved preview windows retain the current original-coordinate footprint', () => {
  assert.deepEqual(previewWindow([1000, 500, 2000, 1500], { width: 10000, height: 5000 }, { width: 1000, height: 500 }), [100, 50, 200, 150]);
});
