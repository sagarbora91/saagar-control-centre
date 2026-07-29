import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const dat02 = require('../www/persistence-acceptance.js');

function sample(exportMs, frameGapMs, totalMs, ok = true) { return { exportMs, frameGapMs, totalMs, ok }; }

test('DAT-02 accepts five complete real-device samples within every p95 budget', () => {
  const result = dat02.evaluate([sample(80, 110, 1200), sample(90, 130, 1300), sample(100, 150, 1400), sample(110, 170, 1500), sample(120, 190, 1600)]);
  assert.equal(result.accepted, true);
  assert.deepEqual(result.metrics, { exportP95Ms: 120, frameGapP95Ms: 190, totalP95Ms: 1600 });
});

test('DAT-02 fails closed for incomplete, errored, or over-budget samples', () => {
  assert.equal(dat02.evaluate([sample(80, 100, 1000)]).accepted, false);
  assert.equal(dat02.evaluate([sample(80, 100, 1000), sample(80, 100, 1000), sample(80, 100, 1000), sample(80, 100, 1000), sample(80, 100, 1000, false)]).accepted, false);
  assert.equal(dat02.evaluate([sample(80, 100, 1000), sample(80, 100, 1000), sample(80, 100, 1000), sample(80, 100, 1000), sample(151, 100, 1000)]).accepted, false);
});