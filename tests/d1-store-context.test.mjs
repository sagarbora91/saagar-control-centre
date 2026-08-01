import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';
import fs from 'node:fs';

const require = createRequire(import.meta.url);
const context = require('../www/store-context.js');
const shell = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');

const branches = [
  { code: 'WLMHW', storeKey: 'titanworld', name: 'Titan World Latur', channel: 'Titan World', active: true },
  { code: 'HEMW', storeKey: 'helios', name: 'Helios Latur', channel: 'Helios', active: true },
  { code: 'OLD', name: 'Closed branch', active: false }
];

test('D1 store selection defaults safely and rejects inactive or unknown branches', () => {
  assert.equal(context.resolveSelection('', branches).code, context.ALL_STORE_CODE);
  assert.equal(context.resolveSelection('OLD', branches).code, context.ALL_STORE_CODE);
  assert.equal(context.resolveSelection('missing', branches).valid, false);
  assert.equal(context.resolveSelection('HEMW', branches).name, 'Helios');
});

test('D1 store matching accepts canonical code, internal key, and display name aliases', () => {
  assert.equal(context.classifyRecord({ store: 'WLMHW' }, 'WLMHW', branches), 'match');
  assert.equal(context.classifyRecord({ storeKey: 'titanworld' }, 'WLMHW', branches), 'match');
  assert.equal(context.classifyRecord({ branch: 'Titan World' }, 'WLMHW', branches), 'match');
  assert.equal(context.classifyRecord({ store: 'HEMW' }, 'WLMHW', branches), 'other-store');
  assert.equal(context.classifyRecord({ store: 'Mystery kiosk' }, 'WLMHW', branches), 'unknown-store');
});

test('single-store scope keeps legacy-only datasets visible and labels them organisation-wide', () => {
  const result = context.scopeRecords([{ amount: 10 }, { amount: 20 }], 'WLMHW', branches);
  assert.equal(result.mode, 'organisation-wide');
  assert.equal(result.items.length, 2);
  assert.equal(result.unassigned, 2);
});

test('single-store scope becomes strict once tags exist and reports excluded legacy records', () => {
  const result = context.scopeRecords([
    { store: 'WLMHW', amount: 10 },
    { store: 'HEMW', amount: 20 },
    { amount: 30 },
    { store: 'Unknown', amount: 40 }
  ], 'WLMHW', branches);
  assert.equal(result.mode, 'scoped');
  assert.deepEqual(result.items.map(row => row.amount), [10]);
  assert.equal(result.unassigned, 1);
  assert.equal(result.otherStore, 1);
  assert.equal(result.unknownStore, 1);
});

test('shell exposes persistent store context and role-filtered Home and Today surfaces', () => {
  assert.match(shell, /<script src="store-context\.js"><\/script>/);
  assert.match(shell, /const CURRENT_STORE_KEY = 'saagar_current_store_v1'/);
  assert.match(shell, /id="homeStoreSelect"/);
  assert.match(shell, /id="globalStoreContext"/);
  assert.match(shell, /function moduleVisibleForRole\(id\)/);
  assert.match(shell, /computeStockDay\(t\)/);
});
