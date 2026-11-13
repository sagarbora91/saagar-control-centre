// Service wave 1, governance T11: the seven files in the MAH-4 message and lifecycle inventory.
// No file may send or receive a shell message. Only the Service page may load them. The listener and timer budget of each file
// is pinned in the capability register (measured by the MAH-4 counter, PLAN C-GOV-4). The dynamic loader numbers stay 7 / 39 / 41.
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO, SEVEN, abs, exists, readText, loadJson } from './lib/svc1-gov-common.mjs';

const require = createRequire(import.meta.url);
const reg = loadJson('capability-register.json');
const ZERO = Object.freeze({ timeouts: 0, clearTimeouts: 0, intervals: 0, clearIntervals: 0, mutationObservers: 0, observerDisconnects: 0, eventListeners: 0, removedEventListeners: 0, resizeListeners: 0 });

let mah4Promise = null;
const mah4 = () => (mah4Promise = mah4Promise || import(pathToFileURL(path.join(REPO, 'scripts', 'lib', 'mah4-contract-source.mjs')).href));

// every unit that names the file in a <script src>: the shell and the twelve module pages
async function loadersOf(file) {
  const m = await mah4();
  const manifest = require(abs('www/module-manifest.js'));
  const units = [{ id: 'shell', rel: 'index.html' }].concat(manifest.modules.map((x) => ({ id: x.id, rel: String(x.src).replace(/\\/g, '/').replace(/^\.?\//, '') })));
  const out = [];
  for (const u of units) {
    const html = readText('www/' + u.rel);
    for (const ref of m.scriptSources(html)) if (m.resolveLocalScript(u.rel, ref) === file.replace(/^www\//, '')) out.push(u.id);
  }
  return out.sort();
}

for (const f of SEVEN) {
  test(`T11.1 [${f.key}] sends and receives no shell message, and only the Service page loads it`, async () => {
    assert.ok(exists(f.file), 'waiting on writers: ' + f.file);
    const m = await mah4();
    const info = m.inspectJavaScript(readText(f.file));
    assert.deepEqual(info.producerCounts, {}, f.file + ' must not produce any ST_ message');
    assert.deepEqual(info.consumerCounts, {}, f.file + ' must not consume any ST_ message');
    assert.equal(info.postMessageCalls, 0, 'no postMessage call');
    assert.deepEqual(await loadersOf(f.file), ['service']);
  });

  test(`T11.2 [${f.key}] listener and timer counts equal the budget pinned in the register`, async () => {
    assert.ok(exists(f.file), 'waiting on writers: ' + f.file);
    const m = await mah4();
    const got = m.lifecycleCounts(readText(f.file));
    const budget = reg.lifecycleBudget[f.file];
    assert.notEqual(budget, undefined, 'the register has a lifecycle row for ' + f.file);
    assert.notEqual(budget, null, 'not pinned yet: put this measured object in capability-register.json -> ' + JSON.stringify(got));
    const want = budget === 'zero' ? ZERO : budget;
    assert.deepEqual(got, want, `${f.file} lifecycle changed; if intended, re-pin the measured counts in the register`);
    if (f.pure) assert.deepEqual(got, ZERO, 'a pure file has no listener and no timer');
    assert.ok(got.removedEventListeners >= got.eventListeners, 'every listener has a removal path');
    assert.equal(got.timeouts + got.intervals + got.mutationObservers, 0, 'no timer and no observer in this wave (declare any exception in the writer report)');
  });
}

test('T11.3 the MAH-4 inventory and profile still build with the seven files in the tree, and the dynamic loader numbers stay 7 / 39 / 41', async () => {
  const missing = SEVEN.filter((f) => !exists(f.file)).map((f) => f.file);
  assert.deepEqual(missing, [], 'waiting on writers');
  const m = await mah4();
  const inv = m.createMah4Inventory(REPO);
  const paths = (inv.directEntryMessageAssets || []).map((a) => a.path);
  for (const f of SEVEN) assert.equal(paths.includes(f.file), false, f.file + ' must not appear among the message assets');
  const d = m.createMah4Profile(REPO).scriptDiscovery.dynamicLocal;
  assert.deepEqual([d.loaderGroupCount, d.scriptRouteCount, d.scriptLiteralReferenceCount], [7, 39, 41], 'MAH-4 dynamic loader counts: static <script src> tags do not move them');
  assert.deepEqual([d.loaderGroupCount, d.scriptRouteCount, d.scriptLiteralReferenceCount], [
    reg.g0Baseline.mah4DynamicLocal.loaderGroupCount, reg.g0Baseline.mah4DynamicLocal.scriptRouteCount, reg.g0Baseline.mah4DynamicLocal.scriptLiteralReferenceCount]);
});

test('T11.4 the seven files are not in the module manifest, so the manifest identity step stays at 12 modules and 66 shared assets', () => {
  const manifest = require(abs('www/module-manifest.js'));
  assert.equal(manifest.modules.length, 12);
  assert.equal(manifest.sharedAssets.length, 66);
  for (const a of manifest.sharedAssets) assert.equal(/service-stores/.test(a.file), false, a.file);
});
