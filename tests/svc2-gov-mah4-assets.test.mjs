// Service wave 2, governance T10: the seven billing files in the MAH-4 message and lifecycle inventory.
// No file may send or receive a shell message. Only the Service page may load them. Listener and timer counts are pinned in the wave-2 register.
// The dynamic loader numbers stay 7 / 39 / 41. The aggregate postMessage counts stay as measured at G0 (g0-baseline.json).
import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { REPO, BILLING, abs, exists, readText, loadJson } from './lib/svc2-gov-common.mjs';

const require = createRequire(import.meta.url);
const reg = loadJson('capability-register.json');
const G0 = loadJson('g0-baseline.json');
const ZERO = Object.freeze({ timeouts: 0, clearTimeouts: 0, intervals: 0, clearIntervals: 0, mutationObservers: 0, observerDisconnects: 0, eventListeners: 0, removedEventListeners: 0, resizeListeners: 0 });
let mah4Promise = null;
const mah4 = () => (mah4Promise = mah4Promise || import(pathToFileURL(path.join(REPO, 'scripts', 'lib', 'mah4-contract-source.mjs')).href));

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

for (const f of BILLING) {
  test(`T10.1 [${f.key}] sends and receives no shell message, and only the Service page loads it`, async () => {
    assert.ok(exists(f.file), 'waiting on writers: ' + f.file);
    const m = await mah4();
    const info = m.inspectJavaScript(readText(f.file));
    assert.deepEqual(info.producerCounts, {}, f.file + ' must not produce any ST_ message');
    assert.deepEqual(info.consumerCounts, {}, f.file + ' must not consume any ST_ message');
    assert.equal(info.postMessageCalls, 0, 'no postMessage call');
    assert.deepEqual(await loadersOf(f.file), ['service']);
  });

  test(`T10.2 [${f.key}] listener and timer counts equal the budget pinned in the register`, async () => {
    assert.ok(exists(f.file), 'waiting on writers: ' + f.file);
    const m = await mah4();
    const got = m.lifecycleCounts(readText(f.file));
    const budget = reg.lifecycleBudget[f.file];
    assert.notEqual(budget, undefined, 'the register has a lifecycle row for ' + f.file + ' (run the register tool)');
    assert.deepEqual(got, budget === 'zero' ? ZERO : budget, `${f.file} lifecycle changed; if intended, run the register tool`);
    if (f.pure) assert.deepEqual(got, ZERO, 'a pure file has no listener and no timer');
    assert.ok(got.removedEventListeners >= got.eventListeners, 'every listener has a removal path');
    assert.equal(got.intervals + got.mutationObservers, 0, 'no interval and no observer in this wave');
  });
}

test('T10.3 the MAH-4 inventory and profile still build with the billing files in the tree; none is a message asset; loader numbers stay 7 / 39 / 41; postMessage counts equal G0', async () => {
  const missing = BILLING.filter((f) => !exists(f.file)).map((f) => f.file);
  assert.deepEqual(missing, [], 'waiting on writers');
  const m = await mah4();
  const inv = m.createMah4Inventory(REPO);
  const paths = (inv.directEntryMessageAssets || []).concat(inv.dynamicMessageAssets || []).map((a) => a.path);
  for (const f of BILLING) assert.equal(paths.includes(f.file), false, f.file + ' must not appear among the message assets');
  const prof = m.createMah4Profile(REPO);
  const d = prof.scriptDiscovery.dynamicLocal;
  assert.deepEqual([d.loaderGroupCount, d.scriptRouteCount, d.scriptLiteralReferenceCount], [7, 39, 41]);
  assert.deepEqual(G0.mah4.dynamicLocal, { loaderGroupCount: 7, scriptRouteCount: 39, scriptLiteralReferenceCount: 41 });
  const p = prof.protocol;
  assert.deepEqual({ aggregateSyntactic: p.aggregateSyntacticPostMessageCalls, aggregateConfigured: p.aggregateConfiguredPostMessageCalls, aggregateWildcard: p.aggregateWildcardPostMessageCalls, aggregateAccepted: p.aggregateAcceptedConfiguredPostMessageCalls }, G0.mah4.postMessage,
    'postMessage counts as measured at G0 (the plan text says 47/47/1/46, the working tree measures 46/46/1/45; the historical 47 is guarded by mah4-message-lifecycle-baseline)');
});

test('T10.4 the billing files are not in the module manifest: 12 modules, 66 shared assets', () => {
  const manifest = require(abs('www/module-manifest.js'));
  assert.equal(manifest.modules.length, 12);
  assert.equal(manifest.sharedAssets.length, 66);
  for (const a of manifest.sharedAssets) assert.equal(/service-(billing|stores)/.test(a.file), false, a.file);
});
