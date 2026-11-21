/* ETP report-engine bridge: the four bridge files load on demand (Wave 7, R-2, owner decision given in chat, 2026-11-12).
   The world is built from the real files: the real loader, the real four bridge files, the real module-bridge getter.
   Nothing here touches a key, a pack or the network; every pack-related answer comes from the real closed gate. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { webcrypto } from 'node:crypto';
import { readWww } from './lib/etp-bridge-test-support.mjs';

const FILES = ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js', 'etp-bridge-compare.js', 'etp-bridge-facade.js'];
const GLOBALS = ['SaagarEtpBridgeTrust', 'SaagarEtpBridgePackVerifier', 'SaagarEtpBridgeCompare', 'SaagarEtpBridgeFacade'];
const CLOSED = { ok: true, gate: 'CLOSED', access: 'OWNER', maxBytes: 33554432 };
const OFF = { ok: false, code: 'ETP_BRIDGE_UNAVAILABLE' };
const LOADER = readWww('etp-chain-loader.js');
const SHELL = readWww('index.html');
const settle = () => new Promise((resolve) => setImmediate(resolve));
const plain = (value) => ({ ...value });

/* options.injector false: the shell injector does not exist. failName: that file fails once. hold: the first injection waits until release().
   Timers are fake so that no real 20 s timer is ever started; fire() runs the pending timeout callback. */
function world(options = {}) {
  const log = [];
  const events = { size: 0, arrayBuffer: 0, reauth: 0 };
  const state = { failed: false, timer: null, release: null };
  const sandbox = {
    crypto: webcrypto, TextDecoder, Date, Uint8Array, ArrayBuffer,
    SaagarOwnerSession: { read: () => ({ version: 1, isOwner: true, role: 'Store Manager', isManager: true }) },
    roleCanOpen: () => true,
    SaagarReauth: async () => { events.reauth += 1; return true; },
    auditLog: () => {},
    document: { querySelector: () => (options.staticTag ? {} : null) },
    setTimeout: (fn) => { state.timer = fn; return 1; },
    clearTimeout: () => {}
  };
  const context = vm.createContext(sandbox);
  context.window = context;
  for (const name of ['etp-store-lifecycle-policy.js', 'etp-profile-authority.js', 'etp-tender-dictionary.js']) vm.runInContext(readWww(name), context, { filename: name });
  vm.runInContext('globalThis.SaagarEtpModuleGateway = Object.freeze({ readVerified: async function () { return { ok: false, code: "ETP_RECEIPT_NOT_FOUND" }; }, readFacade: Object.freeze({ loadSummary: async function () { return { ok: false }; } }) });', context);
  if (options.prepare) options.prepare(context);
  if (options.injector !== false) {
    context.__SaagarPdfLibs = {
      injectEtp: (name) => {
        log.push(name);
        const gate = options.hold && log.length === 1 ? new Promise((resolve) => { state.release = resolve; }) : settle();
        return gate.then(() => {
          if (name === options.failName && !state.failed) { state.failed = true; throw new Error(`Failed to load ${name}`); }
          if (options.replace && options.replace[name]) { options.replace[name](context); return; }
          vm.runInContext(readWww(name), context, { filename: name });
        });
      }
    };
  }
  vm.runInContext(LOADER, context, { filename: 'etp-chain-loader.js' });
  const file = { name: 'pack.scc-etp', get size() { events.size += 1; return 10; }, arrayBuffer() { events.arrayBuffer += 1; return Promise.resolve(new ArrayBuffer(10)); } };
  return { context, log, events, state, file, loader: context.SaagarEtpChainLoader, fire: () => state.timer(), release: () => state.release() };
}

function frameFor(parent) {
  const frame = { parent };
  const context = vm.createContext(frame);
  context.window = context;
  vm.runInContext(readWww('shared/module-bridge.js'), context, { filename: 'module-bridge.js' });
  return context.SaagarModuleBridge;
}

test('shell start: the loader is present, no bridge file is fetched, no bridge global exists, and the stand-in is frozen with exactly four functions', () => {
  const w = world();
  assert.deepEqual(w.log, []);
  for (const name of GLOBALS) assert.equal(Object.prototype.hasOwnProperty.call(w.context, name), false, `${name} is not defined at start`);
  assert.deepEqual(plain(w.loader.status()), { total: 25, loaded: 0, state: 'idle' });
  assert.equal(Object.isFrozen(w.loader.bridge), true);
  assert.deepEqual(Object.keys(w.loader.bridge).sort(), ['compare', 'discard', 'stage', 'status']);
  assert.equal(SHELL.includes('etp-bridge-'), false, 'the shell has no bridge tag');
});

test('first call loads the four files once, in order; later calls load nothing; two first calls share one run; the chain is not touched', async () => {
  const w = world();
  const [a, b] = await Promise.all([w.loader.bridge.status(), w.loader.bridge.status()]);
  assert.deepEqual(plain(a), CLOSED);
  assert.deepEqual(plain(b), CLOSED);
  assert.deepEqual(w.log, FILES);
  assert.deepEqual(plain(await w.loader.bridge.status()), CLOSED);
  assert.deepEqual(w.log, FILES, 'a loaded group is never injected again');
  assert.deepEqual(plain(w.loader.status()), { total: 25, loaded: 0, state: 'idle' }, 'the operational chain cursor is untouched');
  for (const name of GLOBALS) {
    const descriptor = Object.getOwnPropertyDescriptor(w.context, name);
    assert.ok(descriptor && descriptor.writable === false && descriptor.configurable === false, `${name} stays write-once`);
  }
});

test('closed before the load: with no injector every call answers ETP_BRIDGE_UNAVAILABLE and nothing is read, sized or asked', async () => {
  const w = world({ injector: false });
  assert.deepEqual(plain(await w.loader.bridge.status()), OFF);
  assert.deepEqual(plain(await w.loader.bridge.stage({ file: w.file })), OFF);
  assert.deepEqual(plain(await w.loader.bridge.compare({ stageToken: 'x' })), OFF);
  assert.deepEqual(w.log, []);
  assert.deepEqual(w.events, { size: 0, arrayBuffer: 0, reauth: 0 });
  assert.equal(Object.prototype.hasOwnProperty.call(w.context, 'SaagarEtpBridgeFacade'), false);
});

test('a file that fails to load keeps the bridge closed with the code the ETP module already words; the next call resumes at that file', async () => {
  const w = world({ failName: 'etp-bridge-compare.js' });
  assert.deepEqual(plain(await w.loader.bridge.status()), OFF);
  assert.deepEqual(w.log, FILES.slice(0, 3));
  const staged = await w.loader.bridge.stage({ file: w.file });
  assert.deepEqual(w.log, [...FILES.slice(0, 3), 'etp-bridge-compare.js', 'etp-bridge-facade.js'], 'only the failed file and the rest are requested on the next call');
  assert.equal(staged.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  assert.deepEqual(w.events, { size: 0, arrayBuffer: 0, reauth: 0 });
  assert.deepEqual(plain(await w.loader.bridge.status()), CLOSED);
  /* the module's own wording for this code */
  const module = readWww('modules/etp/index.html');
  assert.ok(module.includes("UNAVAILABLE = 'ETP_BRIDGE_UNAVAILABLE'"), 'the module knows the code');
  assert.ok(module.includes("msg('m_unavailable', ['UNAVAILABLE'],"), 'the module words it as its existing gateway-unavailable message');
});

test('a load that never finishes times out closed; a later call joins the same run and nothing is injected twice', async () => {
  const w = world({ hold: true });
  const first = w.loader.bridge.status();
  await settle();
  assert.deepEqual(w.log, [FILES[0]]);
  w.fire();
  assert.deepEqual(plain(await first), OFF);
  const joined = w.loader.bridge.status();
  await settle();
  assert.deepEqual(w.log, [FILES[0]], 'the pending file is not requested a second time');
  w.release();
  await settle();
  w.fire();
  void joined;
  assert.deepEqual(plain(await w.loader.bridge.status()), CLOSED);
  assert.deepEqual(w.log, FILES);
});

test('write-once: a pre-defined name stops the load, whatever its shape; a locked, frozen facade that wins a race, or sits behind a static tag, IS accepted (documented residual, owner decision pending)', async () => {
  const hostileTrust = world({ prepare: (context) => { context.SaagarEtpBridgeTrust = { VERSION: 1, keys: [], gate: () => {} }; } });
  assert.deepEqual(plain(await hostileTrust.loader.bridge.status()), OFF);
  assert.deepEqual(hostileTrust.log, [], 'a taken first name means nothing is injected at all');

  const hostileFacade = world({ prepare: (context) => { context.SaagarEtpBridgeFacade = { status: () => 'mine', stage() {}, compare() {}, discard() {} }; } });
  assert.deepEqual(plain(await hostileFacade.loader.bridge.status()), OFF);
  assert.deepEqual(hostileFacade.log, FILES.slice(0, 3), 'the group stops before the taken facade name');

  const impostor = "Object.defineProperty(globalThis, 'SaagarEtpBridgeFacade', { value: Object.freeze({ status: function () { return 'locked-impostor'; }, stage: function () {}, compare: function () {}, discard: function () {} }), writable: false, configurable: false, enumerable: true });";
  const lockedBeforeLoad = world({ prepare: (context) => vm.runInContext(impostor, context) });
  assert.deepEqual(plain(await lockedBeforeLoad.loader.bridge.status()), OFF, 'a locked frozen facade defined BEFORE the first load is refused by the loader (name taken)');
  assert.deepEqual(lockedBeforeLoad.log, FILES.slice(0, 3));

  /* RESIDUAL 1 (not a defence): a script that wins the race and defines a locked frozen facade while the facade file is being injected is accepted. */
  const race = world({ replace: { 'etp-bridge-facade.js': (context) => vm.runInContext(impostor, context) } });
  assert.equal(await race.loader.bridge.status(), 'locked-impostor', 'the stand-in cannot tell a locked frozen impostor from the real facade');
  /* RESIDUAL 2: when the first bridge file is a static tag, the group counts as loaded and a locked frozen facade is accepted the same way. */
  const behindStaticTag = world({ staticTag: true, prepare: (context) => vm.runInContext(impostor, context) });
  assert.equal(await behindStaticTag.loader.bridge.status(), 'locked-impostor');
  assert.deepEqual(behindStaticTag.log, []);
});

test('a static bridge tag (old trees, tests) marks the group loaded and injects nothing', async () => {
  const w = world({ staticTag: true });
  assert.deepEqual(plain(await w.loader.bridge.status()), OFF, 'no facade exists in this world, so the answer is closed');
  assert.deepEqual(w.log, [], 'nothing is injected when the first file is already a static tag');
});

test('discard before the load answers DISCARDED without loading anything; after the load it reaches the real discard', async () => {
  const w = world();
  assert.deepEqual(plain(await w.loader.bridge.discard({ stageToken: 'x' })), { ok: true, state: 'DISCARDED' });
  assert.deepEqual(w.log, []);
  assert.deepEqual(plain(await w.loader.bridge.status()), CLOSED);
  const real = Object.getOwnPropertyDescriptor(w.context, 'SaagarEtpBridgeFacade').value;
  const answer = await w.loader.bridge.discard({ stageToken: 'x' });
  assert.deepEqual(plain(answer), plain(await real.discard({ stageToken: 'x' })));
});

test('after the load the closed gate still answers before any file is read: the facade guarantee survives the hop', async () => {
  const w = world();
  const staged = await w.loader.bridge.stage({ file: w.file });
  assert.equal(staged.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  assert.deepEqual(w.events, { size: 0, arrayBuffer: 0, reauth: 0 });
  const compared = await w.loader.bridge.compare({ stageToken: 'x' });
  assert.equal(compared.ok, false);
  assert.deepEqual(w.log, FILES);
});

test('module getter: the stand-in when the loader exists (before and after load), the facade when there is no loader, nothing otherwise; never the verifier, trust or compare', async () => {
  const w = world();
  const before = frameFor(w.context);
  assert.equal(before.etpBridgeGateway, w.loader.bridge);
  await w.loader.bridge.status();
  assert.equal(before.etpBridgeGateway, w.loader.bridge, 'the getter is evaluated on every call and still returns the stand-in');
  const parentWindow = { SaagarEtpBridgeFacade: Object.freeze({ marker: 'facade' }), SaagarEtpBridgePackVerifier: Object.freeze({ marker: 'verifier' }), SaagarEtpBridgeTrust: Object.freeze({ marker: 'trust' }), SaagarEtpBridgeCompare: Object.freeze({ marker: 'compare' }) };
  const noLoader = frameFor(parentWindow);
  assert.equal(noLoader.etpBridgeGateway.marker, 'facade');
  assert.equal(frameFor({}).etpBridgeGateway, undefined);
  const markers = Object.keys(noLoader).map((name) => { try { return noLoader[name]; } catch (_) { return undefined; } })
    .filter((value) => value && typeof value === 'object' && 'marker' in value).map((value) => value.marker);
  assert.deepEqual(markers, ['facade']);
});

test('source scan: no banned token in the loader, one-line bridge list, the chain scrape still sees exactly the 25 chain names, and none of the ledger-moving words', () => {
  assert.doesNotMatch(LOADER, /createElement|document\.write|\beval\b|new Function|import\s*\(|innerHTML|postMessage|\?\.|\?\?|localStorage|Capacitor|addEventListener|setInterval/);
  assert.doesNotMatch(LOADER, /fallback|throw|toast|SaagarReauth|SaagarOwnerSession|isSuperAdmin|ownerOnly|ST_ACCESS_CONTEXT|SaagarAccess|accessContext|canAccess|hasPermission|requireRole|roleAllows/i);
  const scraped = [...LOADER.matchAll(/^\s*'(etp-[a-z0-9-]+\.js)',?$/gm)].map((match) => match[1]);
  assert.equal(scraped.length, 25);
  assert.equal(scraped.some((name) => name.startsWith('etp-bridge-')), false, 'no bridge name is on a line of its own');
  assert.equal(LOADER.split('\n').filter((row) => row.includes('etp-bridge-')).length, 1);
  for (const name of FILES) assert.equal(LOADER.split(`'${name}'`).length - 1, 1, `${name} is quoted exactly once`);
});

test('size: the shell stays strictly below its byte limit', () => {
  assert.ok(Buffer.byteLength(fs.readFileSync(new URL('../www/index.html', import.meta.url))) < 580636);
});
