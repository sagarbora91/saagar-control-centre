/* ETP report-engine bridge, tablet side: the parent facade (www/etp-bridge-facade.js), roles, staging and compare.
   Synthetic data only. The throwaway test key is generated in memory by the pack builder (non-extractable) and never written.
   The test public key reaches the verifier ONLY through the Node-only create() seam. Owner decisions given in chat, 2026-11-12
   (Q2 not yet granted, Q3 no calculation changes, Q4 one source, Q5 HEMW blocked, Q7 Owner or Store Manager with Owner reauthentication). */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';
import { DEFAULT_VERIFY_OPTIONS, PROFILES, buildCaseSet, buildPackDraft, generateTestKeyPair } from '../scripts/lib/etp-bridge-pack-builder.mjs';
import { BANNED_BROWSER_TOKENS, readWww, verifierApi } from './lib/etp-bridge-test-support.mjs';

const require = createRequire(import.meta.url);
const compareApi = require('../www/etp-bridge-compare.js');
const facadeApi = require('../www/etp-bridge-facade.js');
const gatewayApi = require('../www/etp-module-gateway.js');
const lifecycle = require('../www/etp-store-lifecycle-policy.js');
const profileAuthority = require('../www/etp-profile-authority.js');
const tenderApi = require('../www/etp-tender-dictionary.js');
const core = require('../www/etp-core-contract.js');
const foundationStatus = require('../www/etp-foundation-status.js');
const queryContract = require('../www/etp-query-contract.js');
const importHistoryApi = require('../www/etp-import-history.js');
const FACADE_SOURCE = readWww('etp-bridge-facade.js');
const COMPARE_SOURCE = readWww('etp-bridge-compare.js');
const SHELL = fs.readFileSync(new URL('../www/index.html', import.meta.url), 'utf8');

const NOW = Date.parse('2026-09-01T10:00:00Z');
const keyPair = await generateTestKeyPair();
const verifier = verifierApi.create({ trustedKeys: [keyPair.anchor], crypto: webcrypto });
const shippedVerifier = verifierApi.create({});
const monthRows = PROFILES.month().rows;
const monthDraft = await buildPackDraft({ keyPair, profile: 'month' });
const monthBytes = monthDraft.bytes;
const SCOPE = { storeCode: 'WLMHW', financialYear: '2026-27', periodStart: '2026-08-01', periodEnd: '2026-08-31' };
const SCOPE_KEY = 'WLMHW|2026-27|2026-08-01..2026-08-31';
const REPORT_IDS = ['R003', 'R013', 'R022', 'R025'];
const GEN = `etp_${'a'.repeat(32)}`;
const OTHER_GEN = `etp_${'b'.repeat(32)}`;
const REAUTH_REASON = 'check an engine report pack against Retail ETP imports';
const clone = (value) => JSON.parse(JSON.stringify(value));
const allEmitted = new Set();
const collectCodes = (result) => {
  if (result && typeof result.code === 'string') allEmitted.add(result.code);
  if (result && Array.isArray(result.reasonCodes)) for (const code of result.reasonCodes) allEmitted.add(code);
  if (result && result.reports) for (const report of Object.values(result.reports)) for (const code of [...(report.reasonCodes || []), ...(report.flags || [])]) allEmitted.add(code);
  return result;
};

/* ---- test doubles ---------------------------------------------------------------------------------------------- */
function arrayBufferOf(bytes) { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength); }
function fileOf(bytes) {
  const counts = { size: 0, arrayBuffer: 0 };
  const file = { get size() { counts.size += 1; return bytes.length; }, arrayBuffer: async () => { counts.arrayBuffer += 1; return arrayBufferOf(bytes); } };
  return { file, counts };
}
function makeRoot({ owner = true, role = 'Store Manager', canOpen = true, reauth = async () => true, auditThrows = false, auditMissing = false } = {}) {
  const state = { isOwner: owner, role, canOpen, reauth, override: false, snapshot: null, reads: 0, canOpenCalls: [], reauthCalls: [], audit: [], touched: [] };
  const root = {
    SaagarOwnerSession: { read: () => { state.reads += 1; return state.override ? state.snapshot : Object.freeze({ version: 1, isOwner: state.isOwner, role: state.role, isManager: state.isOwner || state.role === 'Store Manager' }); } },
    roleCanOpen: (id) => { state.canOpenCalls.push(id); return typeof state.canOpen === 'function' ? state.canOpen(id) : state.canOpen; },
    SaagarReauth: (...args) => { state.reauthCalls.push(args); return state.reauth(...args); }
  };
  if (!auditMissing) root.auditLog = (action, detail) => { if (auditThrows) throw new Error('audit down'); state.audit.push([action, clone(detail)]); };
  for (const name of ['localStorage', 'sessionStorage', 'indexedDB', 'Capacitor', 'location', 'postMessage', 'parent', 'document']) {
    Object.defineProperty(root, name, { get() { state.touched.push(name); throw new Error(`the bridge must not touch ${name}`); }, enumerable: true });
  }
  return { root, state };
}
/* A fake gateway: serves pages of the given rows, field-projected, with one-use cursor tokens. */
function fakeGateway(rows, options = {}) {
  const calls = [], tokens = new Map();
  let counter = 0;
  const gateway = {
    readVerified: async (scope, request) => {
      calls.push({ scope: clone(scope), request: clone(request) });
      if (options.fail) { const failed = options.fail(request, calls.length); if (failed) return failed; }
      const all = options.rows ? options.rows(request) : rows[request.reportId];
      const index = request.cursor === null ? 0 : tokens.get(request.cursor);
      if (index === undefined) return { ok: false, code: 'ETP_READ_CURSOR_INVALID', stage: 'READ' };
      const size = options.pageSize || request.limit, slice = all.slice(index, index + size);
      const hasMore = options.alwaysMore === true ? true : index + slice.length < all.length;
      let next = null;
      if (hasMore) { counter += 1; next = options.repeatCursor ? 'cur_repeat' : `cur_${counter}`; tokens.set(next, options.alwaysMore ? 0 : index + slice.length); }
      const generationId = options.generation ? options.generation(calls.length, request) : GEN;
      return { ok: true, page: { scopeKey: SCOPE_KEY, generationId, reportId: request.reportId, rows: slice.map((row) => Object.fromEntries(request.fields.map((field) => [field, row[field]]))), hasMore, nextCursor: next } };
    },
    readFacade: { loadSummary: async () => (options.summary ? options.summary(rows) : { ok: true, summaries: Object.fromEntries(REPORT_IDS.map((id) => [id, { rowCount: (options.rows ? rows[id] : rows[id]).length }])) }) }
  };
  return { gateway, calls };
}
function makeFacade({ v = verifier, bundle = makeRoot(), gw = fakeGateway(monthRows), now = () => NOW, profile = profileAuthority, life = lifecycle, tender = tenderApi, cmp = compareApi } = {}) {
  const raw = facadeApi.create({ verifier: v, compare: cmp, gateway: gw.gateway, lifecycle: life, profileAuthority: profile, tenderDictionary: tender, root: bundle.root, now, random: (bytes) => webcrypto.getRandomValues(bytes) });
  const facade = {};
  for (const name of ['status', 'stage', 'compare', 'discard']) facade[name] = async (...args) => collectCodes(await raw[name](...args));
  return { facade, raw, bundle, gw, root: bundle.root, state: bundle.state };
}
const stageOwner = async (options) => {
  const made = makeFacade(options);
  const { file, counts } = fileOf(monthBytes);
  const staged = await made.facade.stage({ file });
  return { ...made, file, counts, staged };
};
const pending = () => new Promise(() => {});
const sanitizerSource = SHELL.slice(SHELL.indexOf('function auditSanitize(value, key, depth){'), SHELL.indexOf('function auditSanitizeEntry(e){'));
const auditSanitize = vm.runInNewContext(`${sanitizerSource}\nauditSanitize;`);

test('shipped configuration: the gate is closed, so every entry point refuses before any file access, session read or PIN prompt', async () => {
  for (const ownerMode of [true, false]) {
    const bundle = makeRoot({ owner: ownerMode });
    const made = makeFacade({ v: shippedVerifier, bundle });
    const status = await made.facade.status();
    assert.deepEqual(status, { ok: true, gate: 'CLOSED', access: ownerMode ? 'OWNER' : 'REAUTH', maxBytes: 33554432 });
    const { file, counts } = fileOf(monthBytes);
    const readsBefore = bundle.state.reads;
    const staged = await made.facade.stage({ file });
    assert.deepEqual({ ok: staged.ok, code: staged.code, stage: staged.stage }, { ok: false, code: 'ETP_BRIDGE_TRUST_GATE_CLOSED', stage: 'GATE' });
    assert.equal(counts.size + counts.arrayBuffer, 0, 'no file access');
    assert.equal(bundle.state.reads, readsBefore, 'the session is not even read');
    assert.equal(bundle.state.reauthCalls.length, 0, 'no PIN keypad');
    assert.deepEqual(bundle.state.touched, [], 'no storage, location, message or document access');
    assert.equal(bundle.state.audit.length, 2);
    assert.deepEqual(bundle.state.audit.map((entry) => entry[0]), ['etp.bridge.import.attempt', 'etp.bridge.import.refused']);
    assert.deepEqual(bundle.state.audit[0][1], { stage: 'AUTHORIZE', gateOpen: false });
    assert.deepEqual(bundle.state.audit[1][1], { code: 'ETP_BRIDGE_TRUST_GATE_CLOSED', stage: 'GATE' });
    const compared = await made.facade.compare({ stageToken: 'bridge_' + 'a'.repeat(32) + '_1' });
    assert.equal(compared.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
    assert.deepEqual(await made.facade.discard({ stageToken: 'bridge_' + 'a'.repeat(32) + '_1' }), { ok: true, state: 'DISCARDED' });
  }
});

test('a malformed trust list also closes the gate with its own code, still before any file access', async () => {
  const broken = verifierApi.create({ trustedKeys: [{ keyId: '0'.repeat(16), publicKeyHex: 'zz' }] });
  const made = makeFacade({ v: broken });
  const { file, counts } = fileOf(monthBytes);
  const staged = await made.facade.stage({ file });
  assert.equal(staged.code, 'ETP_BRIDGE_TRUST_ANCHOR_INVALID');
  assert.equal(counts.size + counts.arrayBuffer, 0);
  assert.equal((await made.facade.status()).gate, 'CLOSED');
});

test('the facade object is frozen with exactly six keys and no publish, confirm, run, rows, trust or verify surface', () => {
  const made = makeFacade();
  assert.deepEqual(Object.keys(made.raw).sort(), ['CODES', 'VERSION', 'compare', 'discard', 'stage', 'status']);
  assert.ok(Object.isFrozen(made.raw) && Object.isFrozen(made.raw.CODES));
  for (const name of ['run', 'confirm', 'publish', 'list', 'rows', 'trust', 'verify', 'create', 'import', 'export', 'save']) assert.equal(name in made.raw, false, name);
  assert.deepEqual([...made.raw.CODES], ['ETP_BRIDGE_UNAVAILABLE', 'ETP_BRIDGE_REQUEST_INVALID', 'ETP_BRIDGE_SESSION_INVALID', 'ETP_BRIDGE_ROLE_REFUSED', 'ETP_BRIDGE_REAUTH_DENIED',
    'ETP_BRIDGE_FILE_INVALID', 'ETP_BRIDGE_BUSY', 'ETP_BRIDGE_STAGE_INVALID', 'ETP_BRIDGE_COMPARE_FAILED']);
  assert.deepEqual(Object.keys(facadeApi).sort(), ['CODES', 'MAX_BYTES', 'MAX_PAGES', 'REAUTH_REASON', 'SLOT_MS', 'VERSION', 'create']);
});

test('a missing dependency makes every call return ETP_BRIDGE_UNAVAILABLE, never a decision', async () => {
  for (const patch of [{ v: null }, { life: null }, { profile: null }, { tender: null }, { gw: { gateway: {} } }]) {
    const made = makeFacade(patch);
    const { file, counts } = fileOf(monthBytes);
    assert.equal((await made.facade.stage({ file })).code, 'ETP_BRIDGE_UNAVAILABLE');
    assert.equal((await made.facade.status()).code, 'ETP_BRIDGE_UNAVAILABLE');
    assert.equal((await made.facade.compare({ stageToken: 'bridge_' + 'a'.repeat(32) + '_1' })).code, 'ETP_BRIDGE_UNAVAILABLE');
    assert.equal(counts.size + counts.arrayBuffer, 0);
  }
});

test('request shape: exactly the key file; caller-supplied role or actor fields are refused and nothing is prompted or read', async () => {
  const made = makeFacade({ bundle: makeRoot({ owner: false }) });
  const { file, counts } = fileOf(monthBytes);
  const bad = [undefined, null, 5, 'x', [], [file], {}, { file: null }, { file: 'x' }, { file: 5 }, { file, role: 'OWNER' }, { file, actor: 'Owner' }, { file, isOwner: true }, { file, reason: 'x' },
    Object.assign(Object.create({ file }), {}), Object.assign(Object.create(null), { file, extra: 1 })];
  for (const [index, request] of bad.entries()) {
    const result = await made.facade.stage(request);
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ETP_BRIDGE_REQUEST_INVALID', `request ${index}`);
  }
  assert.equal(made.state.reauthCalls.length, 0);
  assert.equal(counts.size + counts.arrayBuffer, 0);
  for (const request of [undefined, {}, { stageToken: 5 }, { stageToken: 'x' }, { stageToken: 'bridge_' + 'a'.repeat(32) + '_1', extra: 1 }]) {
    assert.equal((await made.facade.compare(request)).code, 'ETP_BRIDGE_REQUEST_INVALID');
    assert.equal((await made.facade.discard(request)).code, 'ETP_BRIDGE_REQUEST_INVALID');
  }
});

test('roles: Owner passes with no prompt; Store Manager needs ETP access and Owner reauthentication; every other role is refused without a keypad', async () => {
  const owner = await stageOwner({ bundle: makeRoot({ owner: true, role: 'Cashier' }) });
  assert.equal(owner.staged.ok, true, 'the Owner is allowed whatever the staff role label says');
  assert.equal(owner.state.reauthCalls.length, 0);
  assert.equal((await owner.facade.status()).access, 'OWNER');
  assert.equal(owner.staged.pack.keyId, keyPair.anchor.keyId);
  assert.equal(owner.state.audit.find((entry) => entry[0] === 'etp.bridge.import.staged')[1].role, 'OWNER');

  const manager = await stageOwner({ bundle: makeRoot({ owner: false, role: 'Store Manager', canOpen: true }) });
  assert.equal(manager.staged.ok, true);
  assert.deepEqual(manager.state.reauthCalls, [[REAUTH_REASON]], 'one prompt, with the fixed reason');
  assert.deepEqual(manager.state.canOpenCalls.every((id) => id === 'etp'), true);
  assert.equal((await manager.facade.status()).access, 'REAUTH');

  const noAccess = await stageOwner({ bundle: makeRoot({ owner: false, role: 'Store Manager', canOpen: false }) });
  assert.equal(noAccess.staged.code, 'ETP_BRIDGE_ROLE_REFUSED');
  assert.equal(noAccess.state.reauthCalls.length, 0);
  assert.equal((await noAccess.facade.status()).access, 'DENIED');

  for (const role of ['Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others', 'store manager', 'Store Manager ', 'Owner', 'Admin', '']) {
    const refused = await stageOwner({ bundle: makeRoot({ owner: false, role, canOpen: true }) });
    assert.equal(refused.staged.code, 'ETP_BRIDGE_ROLE_REFUSED', JSON.stringify(role));
    assert.equal(refused.state.reauthCalls.length, 0, 'no keypad for a role that can never succeed');
    assert.equal(refused.counts.size + refused.counts.arrayBuffer, 0, 'no file access before authorisation');
  }
});

test('Store Manager reauthentication must resolve exactly true: false, strings, numbers, undefined, rejection, a throw or a missing function all refuse', async () => {
  const outcomes = [async () => false, async () => 'true', async () => 1, async () => undefined, async () => null, async () => ({ ok: true }), () => { throw new Error('keypad crashed'); }, () => Promise.reject(new Error('no'))];
  for (const reauth of outcomes) {
    const result = await stageOwner({ bundle: makeRoot({ owner: false, role: 'Store Manager', reauth }) });
    assert.equal(result.staged.code, 'ETP_BRIDGE_REAUTH_DENIED', reauth.toString());
    assert.equal(result.counts.size + result.counts.arrayBuffer, 0, 'the file is never read after a denial');
  }
  const bundle = makeRoot({ owner: false, role: 'Store Manager' });
  delete bundle.root.SaagarReauth;
  const missing = await makeFacade({ bundle }).facade.stage({ file: fileOf(monthBytes).file });
  assert.equal(missing.code, 'ETP_BRIDGE_REAUTH_DENIED');
  const yes = await stageOwner({ bundle: makeRoot({ owner: false, role: 'Store Manager', reauth: async () => true }) });
  assert.equal(yes.staged.ok, true);
});

test('a keypad that never answers keeps the job busy: a second stage is refused without a second prompt or a file read', async () => {
  const bundle = makeRoot({ owner: false, role: 'Store Manager', reauth: pending });
  const made = makeFacade({ bundle });
  const first = fileOf(monthBytes), second = fileOf(monthBytes);
  const waiting = made.facade.stage({ file: first.file });
  await new Promise((resolve) => setImmediate(resolve));
  const busy = await made.facade.stage({ file: second.file });
  assert.equal(busy.code, 'ETP_BRIDGE_BUSY');
  assert.equal(bundle.state.reauthCalls.length, 1);
  assert.equal(second.counts.size + second.counts.arrayBuffer, 0);
  assert.equal(first.counts.size + first.counts.arrayBuffer, 0);
  assert.equal((await made.facade.compare({ stageToken: 'bridge_' + 'a'.repeat(32) + '_1' })).code, 'ETP_BRIDGE_BUSY');
  void waiting;
});

test('a role change while the keypad is open refuses the stage', async () => {
  const bundle = makeRoot({ owner: false, role: 'Store Manager', reauth: async () => { bundle.state.canOpen = false; return true; } });
  const result = await makeFacade({ bundle }).facade.stage({ file: fileOf(monthBytes).file });
  assert.equal(result.code, 'ETP_BRIDGE_ROLE_REFUSED');
});

test('the Owner session must be a complete own-property snapshot; anything else is ETP_BRIDGE_SESSION_INVALID', async () => {
  const snapshots = [null, undefined, 5, 'owner', [], {}, { version: 2, isOwner: true, role: 'Store Manager' }, { version: 1, isOwner: 'true', role: 'Store Manager' }, { version: 1, isOwner: true },
    { version: 1, role: 'Store Manager' }, { version: 1, isOwner: true, role: 7 }, Object.create({ version: 1, isOwner: true, role: 'Store Manager' })];
  for (const snapshot of snapshots) {
    const bundle = makeRoot();
    bundle.state.override = true; bundle.state.snapshot = snapshot;
    const result = await makeFacade({ bundle }).facade.stage({ file: fileOf(monthBytes).file });
    assert.equal(result.code, 'ETP_BRIDGE_SESSION_INVALID', JSON.stringify(snapshot));
    assert.equal(bundle.state.reauthCalls.length, 0);
  }
  const noSession = makeRoot(); delete noSession.root.SaagarOwnerSession;
  assert.equal((await makeFacade({ bundle: noSession }).facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_SESSION_INVALID');
  const throwing = makeRoot(); throwing.root.SaagarOwnerSession = { read() { throw new Error('boom'); } };
  assert.equal((await makeFacade({ bundle: throwing }).facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_SESSION_INVALID');
  assert.equal((await makeFacade({ bundle: throwing }).facade.status()).access, 'DENIED');
});

test('Object.prototype pollution cannot grant a role, supply a file or satisfy a snapshot', async () => {
  const polluted = { isOwner: true, role: 'Store Manager', version: 1, file: monthBytes, stageToken: 'bridge_' + 'a'.repeat(32) + '_1', size: 10, ok: true, code: 'ETP_BRIDGE_X', then: undefined };
  const names = Object.keys(polluted);
  try {
    for (const name of names) Object.defineProperty(Object.prototype, name, { value: polluted[name], configurable: true, writable: true, enumerable: false });
    const bundle = makeRoot({ owner: false, role: 'Cashier' });
    bundle.state.override = true; bundle.state.snapshot = Object.freeze({});
    const made = makeFacade({ bundle });
    assert.equal((await made.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_SESSION_INVALID');
    bundle.state.override = false;
    assert.equal((await made.facade.stage({})).code, 'ETP_BRIDGE_REQUEST_INVALID');
    assert.equal((await made.facade.compare({})).code, 'ETP_BRIDGE_REQUEST_INVALID');
    assert.equal((await made.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_ROLE_REFUSED');
    assert.equal(bundle.state.reauthCalls.length, 0);
  } finally { for (const name of names) delete Object.prototype[name]; }
  assert.equal({}.isOwner, undefined);
});

test('hostile File stubs: size is read once, bytes are read once, a lying or odd size is refused, and nothing throws', async () => {
  const good = fileOf(monthBytes);
  assert.equal((await makeFacade().facade.stage({ file: good.file })).ok, true);
  assert.deepEqual(good.counts, { size: 1, arrayBuffer: 1 }, 'one size read, one arrayBuffer call');
  const make = (overrides) => ({ arrayBuffer: async () => arrayBufferOf(monthBytes), size: monthBytes.length, ...overrides });
  const sizes = [0, -1, 1.5, NaN, Infinity, '5', null, undefined, {}, 33554433, 2 ** 53];
  for (const size of sizes) {
    const result = await makeFacade().facade.stage({ file: make({ size }) });
    assert.equal(result.ok, false, String(size));
    assert.ok(['ETP_BRIDGE_FILE_INVALID', 'ETP_BRIDGE_FILE_TOO_LARGE'].includes(result.code), `${String(size)} gives ${result.code}`);
  }
  assert.equal((await makeFacade().facade.stage({ file: make({ size: 33554433 }) })).code, 'ETP_BRIDGE_FILE_TOO_LARGE');
  assert.equal((await makeFacade().facade.stage({ file: make({ size: 0 }) })).code, 'ETP_BRIDGE_FILE_INVALID');
  const throwingSize = { get size() { throw new Error('boom'); }, arrayBuffer: async () => arrayBufferOf(monthBytes) };
  assert.equal((await makeFacade().facade.stage({ file: throwingSize })).code, 'ETP_BRIDGE_FILE_INVALID');
  for (const file of [{ size: 5 }, { size: 5, arrayBuffer: 'x' }, { size: 5, arrayBuffer: async () => { throw new Error('read failed'); } }, { size: 5, arrayBuffer() { throw new Error('read failed'); } },
    { size: 5, arrayBuffer: async () => 'bytes' }, { size: 5, arrayBuffer: async () => new Uint8Array(5) }, { size: 5, arrayBuffer: async () => null }, { size: 5, arrayBuffer: async () => new SharedArrayBuffer(5) },
    { size: 5, arrayBuffer: async () => new ArrayBuffer(6) }, { size: monthBytes.length, arrayBuffer: async () => new ArrayBuffer(monthBytes.length - 1) }]) {
    const result = await makeFacade().facade.stage({ file });
    assert.equal(result.code, 'ETP_BRIDGE_FILE_INVALID', JSON.stringify(Object.keys(file)));
  }
  const lyingBig = { size: 100, arrayBuffer: async () => new ArrayBuffer(33554433) };
  assert.equal((await makeFacade().facade.stage({ file: lyingBig })).code, 'ETP_BRIDGE_FILE_TOO_LARGE');
  const hang = makeFacade();
  const hung = hang.facade.stage({ file: { size: 5, arrayBuffer: pending } });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await hang.facade.stage({ file: good.file })).code, 'ETP_BRIDGE_BUSY');
  void hung;
});

test('a valid pack is staged: a frozen summary with a token, no rows, and the audit trail has attempt then staged with safe keys only', async () => {
  const made = await stageOwner();
  const staged = made.staged;
  assert.equal(staged.ok, true);
  assert.equal(staged.state, 'STAGED');
  assert.match(staged.stageToken, /^bridge_[a-f0-9]{32}_\d+$/);
  assert.deepEqual(staged.pack.rows, { R003: 6, R013: 6, R022: 6, R025: 6 });
  assert.equal(staged.pack.scopeKey, SCOPE_KEY);
  assert.equal(staged.pack.exportId8.length, 8);
  assert.equal(staged.pack.engineGeneration, 1);
  assert.equal(staged.pack.figureCount, 1);
  assert.deepEqual(staged.pack.checks, { signature: 'OK', hashes: 'OK', totals: 'OK', store: 'OK', period: 'OK', dictionary: 'OK' });
  assert.equal(staged.appliedToCalculations, false);
  assert.equal(staged.publishes, false);
  const json = JSON.stringify(staged);
  for (const secret of ['0000201', 'CRO-0001', 'SYNTHETIC_ONLY', monthDraft.manifest.exportId]) assert.ok(!json.includes(secret), `no pack content: ${secret}`);
  assert.ok(!/"rows":\[/.test(json), 'row counts only, no rows');
  const frozen = (value) => { assert.ok(Object.isFrozen(value)); for (const item of Object.values(value)) if (item && typeof item === 'object') frozen(item); };
  frozen(staged);
  assert.throws(() => { staged.pack.rows.R003 = 1; });
  assert.deepEqual(made.state.audit.map((entry) => entry[0]), ['etp.bridge.import.attempt', 'etp.bridge.import.staged']);
  assert.deepEqual(made.state.audit[1][1], { role: 'OWNER', store: 'WLMHW', periodStart: '2026-08-01', periodEnd: '2026-08-31', reportCount: 4, keyId: keyPair.anchor.keyId });
  assert.equal(made.counts.arrayBuffer, 1);
});

test('parity: for every synthetic pack the facade gives the verifier\'s own refusal, and the shipped verifier refuses every one at the gate', async () => {
  const set = await buildCaseSet({});
  const cases = set.cases.filter((entry) => !entry.id.startsWith('large'));
  assert.ok(cases.length > 100);
  const trustedVerifier = verifierApi.create({ trustedKeys: [set.anchor], crypto: webcrypto });
  let accepted = 0;
  for (const entry of cases) {
    const today = entry.verifyOptions.today, now = () => Date.parse(`${today}T06:30:00Z`);
    const made = makeFacade({ v: trustedVerifier, now });
    const result = await made.facade.stage({ file: fileOf(entry.bytes).file });
    if (entry.expect.withTestKey === 'ACCEPTED') { assert.equal(result.ok, true, `${entry.id}: ${result.code}`); accepted += 1; }
    else if (entry.bytes.length === 0) { assert.equal(result.code, 'ETP_BRIDGE_FILE_INVALID', 'an empty file is refused before the verifier'); }
    else { assert.equal(result.ok, false, entry.id); assert.equal(result.code, entry.expect.withTestKey, entry.id); assert.equal(result.stage, 'VERIFY', entry.id); }
    const shipped = await makeFacade({ v: shippedVerifier, now }).facade.stage({ file: fileOf(entry.bytes).file });
    assert.equal(shipped.code, entry.expect.shipped, `${entry.id} on the shipped configuration`);
  }
  assert.ok(accepted >= 10);
});

test('refusal details are limited to fixed names: no pack text, no field values, only the report id, a check name and a line number', async () => {
  const set = await buildCaseSet({});
  const trustedVerifier = verifierApi.create({ trustedKeys: [set.anchor], crypto: webcrypto });
  for (const entry of set.cases.filter((item) => item.expect.withTestKey !== 'ACCEPTED' && !item.id.startsWith('large'))) {
    const made = makeFacade({ v: trustedVerifier, now: () => Date.parse(`${entry.verifyOptions.today}T06:30:00Z`) });
    const result = await made.facade.stage({ file: fileOf(entry.bytes).file });
    assert.deepEqual(Object.keys(result).filter((key) => !['ok', 'code', 'stage', 'check', 'report', 'field', 'line'].includes(key)), [], entry.id);
    if (result.report !== undefined) assert.ok(REPORT_IDS.includes(result.report));
    if (result.field !== undefined) assert.match(result.field, /^[A-Za-z0-9_.]{1,80}$/);
    const text = JSON.stringify(result) + JSON.stringify(made.state.audit);
    assert.ok(!/SYNTHETIC_ONLY|CRO-0001|0000123|0000201/.test(text), `${entry.id}: no pack text in a refusal`);
    const refusals = made.state.audit.filter((item) => item[0] === 'etp.bridge.import.refused');
    assert.equal(refusals.length, 1, `${entry.id}: exactly one refusal entry`);
    assert.equal(refusals[0][1].code, result.code);
  }
});

test('store rules at the facade: only the exact code WLMHW; HEMW and the service store AW330 are refused even if a verifier were to accept them', async () => {
  const real = await verifier.verify(monthBytes, DEFAULT_VERIFY_OPTIONS);
  assert.equal(real.ok, true);
  const withStore = (storeCode) => ({ gate: verifier.gate, verify: async () => ({ ...real, scope: { ...real.scope, storeCode, scopeKey: `${storeCode}|2026-27|2026-08-01..2026-08-31` } }) });
  const expectations = { HEMW: 'ETP_BRIDGE_STORE_HEMW_BLOCKED', AW330: 'ETP_BRIDGE_STORE_REFUSED', wlmhw: 'ETP_BRIDGE_STORE_REFUSED', 'WLMHW ': 'ETP_BRIDGE_STORE_REFUSED', 'WLMHW​': 'ETP_BRIDGE_STORE_REFUSED', '': 'ETP_BRIDGE_STORE_REFUSED', hemw: 'ETP_BRIDGE_STORE_REFUSED' };
  for (const [store, code] of Object.entries(expectations)) {
    const made = makeFacade({ v: withStore(store) });
    const result = await made.facade.stage({ file: fileOf(monthBytes).file });
    assert.equal(result.code, code, JSON.stringify(store));
    assert.equal(result.stage, 'STORE');
  }
  const deny = makeFacade({ profile: { PROFILE_VERSION: profileAuthority.PROFILE_VERSION, PARSER_VERSION: profileAuthority.PARSER_VERSION, authorize: () => ({ ok: false, code: 'ETP_HEMW_PROFILE_AUTHORIZATION_REQUIRED' }) } });
  assert.equal((await deny.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_HEMW_PROFILE_AUTHORIZATION_REQUIRED');
  const notReady = makeFacade({ profile: { PROFILE_VERSION: profileAuthority.PROFILE_VERSION, PARSER_VERSION: profileAuthority.PARSER_VERSION, authorize: () => ({ ok: true, productionReady: false }) } });
  assert.equal((await notReady.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_STORE_REFUSED');
  const throwsProfile = makeFacade({ profile: { PROFILE_VERSION: profileAuthority.PROFILE_VERSION, PARSER_VERSION: profileAuthority.PARSER_VERSION, authorize: () => { throw new Error('x'); } } });
  assert.equal((await throwsProfile.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_STORE_REFUSED');
  let asked = null;
  const spyProfile = { PROFILE_VERSION: profileAuthority.PROFILE_VERSION, PARSER_VERSION: profileAuthority.PARSER_VERSION, authorize: (request) => { asked = request; return profileAuthority.authorize(request); } };
  assert.equal((await makeFacade({ profile: spyProfile }).facade.stage({ file: fileOf(monthBytes).file })).ok, true);
  assert.deepEqual(asked, { storeCode: 'WLMHW', purpose: 'PRODUCTION', profileVersion: 'retail-etp-core-v1', parserVersion: 'retail-etp-parser-v1' }, 'the PRODUCTION purpose, never AGGREGATE_EVIDENCE');
  const badScope = makeFacade({ life: { validateScope: () => ({ ok: true, scope: {}, key: 'WLMHW|2026-27|2026-08-01..2026-08-30' }) } });
  assert.equal((await badScope.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_PERIOD_INVALID');
  const invalidScope = makeFacade({ life: { validateScope: () => ({ ok: false, errors: ['X'] }) } });
  assert.equal((await invalidScope.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_PERIOD_INVALID');
});

test('one slot, one token: a new stage replaces the old token; discard is idempotent and only clears its own token; the slot expires after ten minutes', async () => {
  let clock = NOW;
  const made = makeFacade({ now: () => clock });
  const first = await made.facade.stage({ file: fileOf(monthBytes).file });
  const second = await made.facade.stage({ file: fileOf(monthBytes).file });
  assert.equal(first.ok && second.ok, true);
  assert.notEqual(first.stageToken, second.stageToken);
  assert.equal((await made.facade.compare({ stageToken: first.stageToken })).code, 'ETP_BRIDGE_STAGE_INVALID', 'the old token is dead');
  assert.deepEqual(await made.facade.discard({ stageToken: first.stageToken }), { ok: true, state: 'DISCARDED' });
  assert.equal((await made.facade.compare({ stageToken: second.stageToken })).ok, true, 'discarding another token did not clear the slot');
  assert.deepEqual(await made.facade.discard({ stageToken: second.stageToken }), { ok: true, state: 'DISCARDED' });
  assert.deepEqual(await made.facade.discard({ stageToken: second.stageToken }), { ok: true, state: 'DISCARDED' }, 'idempotent');
  assert.equal((await made.facade.compare({ stageToken: second.stageToken })).code, 'ETP_BRIDGE_STAGE_INVALID');
  const third = await made.facade.stage({ file: fileOf(monthBytes).file });
  clock += 599999;
  assert.equal((await made.facade.compare({ stageToken: third.stageToken })).ok, true, 'still valid just inside ten minutes');
  clock += 2;
  assert.equal((await made.facade.compare({ stageToken: third.stageToken })).code, 'ETP_BRIDGE_STAGE_INVALID', 'expired');
  const fourth = await made.facade.stage({ file: fileOf(monthBytes).file });
  const failedFifth = await made.facade.stage({ file: { size: 5, arrayBuffer: async () => new ArrayBuffer(5) } });
  assert.equal(failedFifth.ok, false);
  assert.equal((await made.facade.compare({ stageToken: fourth.stageToken })).code, 'ETP_BRIDGE_STAGE_INVALID', 'a new pick that fails does not leave the old pack behind');
});

test('compare: the staged pack matches the XLSX side; the result is a frozen display projection with no row values, and nothing is applied or published', async () => {
  const made = await stageOwner();
  const result = await made.facade.compare({ stageToken: made.staged.stageToken });
  assert.equal(result.ok, true);
  assert.equal(result.state, 'COMPARED');
  assert.equal(result.outcome, 'MATCH');
  assert.deepEqual(result.reasonCodes, []);
  assert.deepEqual(result.baseline, { generation8: 'aaaaaaaa' });
  assert.equal(result.appliedToCalculations, false);
  assert.equal(result.publishes, false);
  assert.deepEqual(Object.keys(result.reports), REPORT_IDS);
  assert.deepEqual(result.reports.R022.measures[0], { key: 'rowCount', pack: '6', tablet: '6' });
  const net = result.reports.R025.measures.find((m) => m.key === 'net_amount');
  assert.deepEqual(net, { key: 'net_amount', pack: '81247.50', tablet: '81247.50' }, 'signed totals, 2-place strings');
  assert.equal(result.reports.R013.measures.find((m) => m.key === 'quantity').pack, '7.000', '3-place quantity');
  assert.equal(result.figures.length, 1);
  assert.equal(result.figures[0].figureId, 'R022.INVOICE_COUNT');
  assert.equal(result.figures[0].status, 'BUSINESS_RULE_DIFFERENCE');
  assert.equal(result.figures[0].label, 'business-rule difference');
  assert.deepEqual([result.figures[0].pack, result.figures[0].tablet], ['4', '5']);
  assert.equal(result.counts.businessRuleDifferences, 1);
  assert.equal(result.outcome, 'MATCH', 'a business-rule difference is shown, never applied, and never changes the outcome');
  const json = JSON.stringify(result);
  for (const secret of ['0000201', '0000206', 'CRO-0001', 'CRO-0002', 'SYNTHETIC_ONLY']) assert.ok(!json.includes(secret), `no row value leaves the parent: ${secret}`);
  const walk = (value) => { assert.ok(typeof value !== 'function'); assert.ok(typeof value !== 'object' || value === null || Object.isFrozen(value)); if (value && typeof value === 'object') Object.values(value).forEach(walk); };
  walk(result);
  assert.deepEqual(made.state.audit.slice(-2).map((entry) => entry[0]), ['etp.bridge.compare.run', 'etp.bridge.compare.result']);
  assert.deepEqual(made.state.audit.slice(-1)[0][1], { outcome: 'MATCH', matchCount: 4, diffCount: 0 });
  assert.deepEqual(made.state.audit.slice(-2)[0][1], { store: 'WLMHW', periodStart: '2026-08-01', periodEnd: '2026-08-31', reportCount: 4 });
  const request = made.gw.calls[0].request;
  assert.deepEqual(Object.keys(request), ['reportId', 'fields', 'cursor', 'limit']);
  assert.equal(request.limit, 200);
  assert.deepEqual(made.gw.calls[0].scope, SCOPE);
});

test('compare reads the same columns the gateway projects, report by report (derived from the exported PROJECTIONS)', async () => {
  const made = await stageOwner();
  await made.facade.compare({ stageToken: made.staged.stageToken });
  for (const id of REPORT_IDS) {
    const call = made.gw.calls.find((entry) => entry.request.reportId === id);
    const projection = id === 'R022' ? ['invoice_date', 'invoice_number', ...gatewayApi.PROJECTIONS[id]] : ['invoice_date', ...gatewayApi.PROJECTIONS[id]];
    assert.deepEqual(call.request.fields, projection, id);
  }
});

test('compare shows differences by report and day with exact values; other reports stay MATCH', async () => {
  const changed = clone(monthRows);
  const target = changed.R025.findIndex((row) => row.invoice_number === '0000202');
  assert.ok(target >= 0);
  changed.R025[target].net_amount = '31998.51';
  const made = await stageOwner({ gw: fakeGateway(changed) });
  const result = await made.facade.compare({ stageToken: made.staged.stageToken });
  assert.equal(result.outcome, 'DIFFERENCES');
  assert.equal(result.counts.reportsDifferent, 1);
  assert.equal(result.reports.R025.status, 'DIFFERENCES');
  assert.equal(result.reports.R013.status, 'MATCH');
  assert.equal(result.reports.R025.daysDiffering, 1);
  assert.deepEqual(result.reports.R025.differences.filter((item) => item.key === 'net_amount'), [{ date: '2026-08-10', key: 'net_amount', pack: '36498.50', tablet: '36498.51' }]);
  assert.equal(result.reports.R025.rows.differing, 1);
  assert.deepEqual(made.state.audit.slice(-1)[0][1], { outcome: 'DIFFERENCES', matchCount: 3, diffCount: 1 });
  assert.equal(result.figures[0].status, 'BUSINESS_RULE_DIFFERENCE', 'R022 rows still match, so the figure is still a rule difference');
  const rowsDiffer = clone(monthRows); rowsDiffer.R022[0].net_value = '1.00';
  const second = await stageOwner({ gw: fakeGateway(rowsDiffer) });
  assert.equal((await second.facade.compare({ stageToken: second.staged.stageToken })).figures[0].status, 'ROW_DIFFERENCE_PRESENT');
});

test('a month with a day on one side only, in both directions, is listed by day', async () => {
  const extra = clone(monthRows);
  extra.R003.push({ invoice_date: '2026-08-28', transaction_type_raw: 'INV', net_amount: '10.00', scheme_discount: '0.00', user_discount: '0.00' });
  const forward = await stageOwner({ gw: fakeGateway(extra) });
  const result = await forward.facade.compare({ stageToken: forward.staged.stageToken });
  assert.equal(result.reports.R003.status, 'DIFFERENCES');
  assert.ok(result.reports.R003.differences.some((item) => item.date === '2026-08-28' && item.key === 'rowCount' && item.pack === '0' && item.tablet === '1'));
  const fewer = clone(monthRows); fewer.R003.pop();
  const backward = await stageOwner({ gw: fakeGateway(fewer) });
  const other = await backward.facade.compare({ stageToken: backward.staged.stageToken });
  assert.equal(other.reports.R003.status, 'DIFFERENCES');
  assert.ok(other.reports.R003.differences.some((item) => item.key === 'rowCount' && item.pack === '1' && item.tablet === '0'));
});

test('no XLSX generation, a fenced restore and an unavailable baseline: never a MATCH, and existing safe codes pass through', async () => {
  const none = await stageOwner({ gw: fakeGateway(monthRows, { fail: () => ({ ok: false, code: 'ETP_RECEIPT_NOT_FOUND', stage: 'VERIFY' }) }) });
  const noBaseline = await none.facade.compare({ stageToken: none.staged.stageToken });
  assert.equal(noBaseline.ok, true);
  assert.equal(noBaseline.outcome, 'CANNOT_COMPARE');
  assert.deepEqual(noBaseline.reasonCodes, ['ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION']);
  assert.equal(noBaseline.baseline.generation8, null);
  assert.ok(Object.values(noBaseline.reports).every((report) => report.status === 'CANNOT_COMPARE' && report.measures.length === 0));
  const unavailable = await stageOwner({ gw: fakeGateway(monthRows, { fail: () => ({ ok: false, code: 'ETP_VERIFIED_GENERATION_UNAVAILABLE', stage: 'VERIFY' }) }) });
  assert.equal((await unavailable.facade.compare({ stageToken: unavailable.staged.stageToken })).outcome, 'CANNOT_COMPARE');
  for (const code of ['ETP_REIMPORT_REQUIRED', 'ETP_ACCESS_DENIED', 'ETP_STATUS_UNAVAILABLE', 'ETP_GATEWAY_RESPONSE_INVALID']) {
    const made = await stageOwner({ gw: fakeGateway(monthRows, { fail: () => ({ ok: false, code, stage: 'READ' }) }) });
    const result = await made.facade.compare({ stageToken: made.staged.stageToken });
    assert.deepEqual({ ok: result.ok, code: result.code }, { ok: false, code }, code);
    assert.equal(made.state.audit.filter((entry) => entry[0] === 'etp.bridge.compare.result').length, 0, 'no result entry for a failure');
  }
  for (const failure of [{ ok: false, code: 'not a code' }, { ok: false }, null, undefined, { ok: true }, { ok: true, page: { rows: 'x' } }]) {
    const made = await stageOwner({ gw: fakeGateway(monthRows, { fail: () => failure || { ok: false } }) });
    const result = await made.facade.compare({ stageToken: made.staged.stageToken });
    assert.equal(result.ok, false);
    assert.equal(result.code, 'ETP_BRIDGE_COMPARE_FAILED');
  }
});

test('an incomplete baseline is never a MATCH: too many pages, a repeated cursor, a generation change in the middle, or a short read', async () => {
  const many = Array.from({ length: 220 }, () => monthRows.R003[0]);
  const long = await stageOwner({ gw: fakeGateway(monthRows, { alwaysMore: true, pageSize: 1 }) });
  const endless = await long.facade.compare({ stageToken: long.staged.stageToken });
  assert.equal(endless.outcome, 'CANNOT_COMPARE');
  assert.ok(endless.reasonCodes.includes('ETP_BRIDGE_COMPARE_TABLET_READ_INCOMPLETE'));
  assert.ok(long.gw.calls.length <= 250, 'at most 250 pages are read');
  const repeat = await stageOwner({ gw: fakeGateway({ ...monthRows, R003: many }, { repeatCursor: true, pageSize: 100, summary: () => ({ ok: false }) }) });
  const repeated = await repeat.facade.compare({ stageToken: repeat.staged.stageToken });
  assert.equal(repeated.outcome, 'CANNOT_COMPARE');
  assert.ok(repeated.reasonCodes.includes('ETP_BRIDGE_COMPARE_TABLET_READ_INCOMPLETE'));
  const switching = await stageOwner({ gw: fakeGateway(monthRows, { generation: (call) => (call === 1 ? GEN : OTHER_GEN) }) });
  const switched = await switching.facade.compare({ stageToken: switching.staged.stageToken });
  assert.equal(switched.outcome, 'CANNOT_COMPARE');
  assert.ok(switched.reasonCodes.includes('ETP_BRIDGE_COMPARE_TABLET_READ_INCOMPLETE'));
  const shortRead = await stageOwner({ gw: fakeGateway(monthRows, { summary: () => ({ ok: true, summaries: Object.fromEntries(REPORT_IDS.map((id) => [id, { rowCount: 7 }])) }) }) });
  const short = await shortRead.facade.compare({ stageToken: shortRead.staged.stageToken });
  assert.equal(short.outcome, 'CANNOT_COMPARE');
  assert.deepEqual(short.reports.R003.reasonCodes, ['ETP_BRIDGE_COMPARE_TABLET_COUNT_MISMATCH']);
  const noSummary = await stageOwner({ gw: fakeGateway(monthRows, { summary: () => { throw new Error('summary failed'); } }) });
  assert.equal((await noSummary.facade.compare({ stageToken: noSummary.staged.stageToken })).outcome, 'MATCH', 'the row-count cross-check is optional; the compare itself still reads every page');
});

test('the same pack compared twice gives the same result; staging the same file twice gives equal summaries apart from the token', async () => {
  const made = await stageOwner();
  const first = await made.facade.compare({ stageToken: made.staged.stageToken });
  const second = await made.facade.compare({ stageToken: made.staged.stageToken });
  assert.deepEqual(first, second);
  const again = await made.facade.stage({ file: fileOf(monthBytes).file });
  const { stageToken: tokenA, ...restA } = made.staged, { stageToken: tokenB, ...restB } = again;
  assert.notEqual(tokenA, tokenB);
  assert.deepEqual(restA, restB);
});

test('role or gate change between stage and compare: the slot is discarded, the call is refused, and no second PIN is shown', async () => {
  const owner = await stageOwner();
  owner.state.isOwner = false; owner.state.role = 'Cashier';
  assert.equal((await owner.facade.compare({ stageToken: owner.staged.stageToken })).code, 'ETP_BRIDGE_ROLE_REFUSED');
  owner.state.isOwner = true;
  assert.equal((await owner.facade.compare({ stageToken: owner.staged.stageToken })).code, 'ETP_BRIDGE_STAGE_INVALID', 'discarded, not suspended');

  const manager = await stageOwner({ bundle: makeRoot({ owner: false, role: 'Store Manager', canOpen: true }) });
  assert.equal(manager.state.reauthCalls.length, 1);
  assert.equal((await manager.facade.compare({ stageToken: manager.staged.stageToken })).ok, true);
  assert.equal(manager.state.reauthCalls.length, 1, 'compare does not ask for a second PIN');
  manager.state.canOpen = false;
  assert.equal((await manager.facade.compare({ stageToken: manager.staged.stageToken })).code, 'ETP_BRIDGE_ROLE_REFUSED');
  assert.equal(manager.state.reauthCalls.length, 1);

  const switched = await stageOwner({ bundle: makeRoot({ owner: false, role: 'Store Manager', canOpen: true }) });
  switched.state.isOwner = true;
  assert.equal((await switched.facade.compare({ stageToken: switched.staged.stageToken })).code, 'ETP_BRIDGE_ROLE_REFUSED', 'a different role than at stage time');

  const noSession = await stageOwner();
  noSession.state.override = true; noSession.state.snapshot = {};
  assert.equal((await noSession.facade.compare({ stageToken: noSession.staged.stageToken })).code, 'ETP_BRIDGE_SESSION_INVALID');

  let open = true;
  const gateFlip = { gate: () => (open ? verifier.gate() : shippedVerifier.gate()), verify: verifier.verify };
  const closing = await stageOwner({ v: gateFlip });
  open = false;
  assert.equal((await closing.facade.compare({ stageToken: closing.staged.stageToken })).code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  open = true;
  assert.equal((await closing.facade.compare({ stageToken: closing.staged.stageToken })).code, 'ETP_BRIDGE_STAGE_INVALID', 'a closed gate discarded the pack');
});

test('busy and stale: one job at a time, and an answer for a pack that was discarded while it was being compared is dropped', async () => {
  let release = null;
  const gate = new Promise((resolve) => { release = resolve; });
  const slow = fakeGateway(monthRows);
  const inner = slow.gateway.readVerified;
  slow.gateway.readVerified = async (...args) => { await gate; return inner(...args); };
  const made = await stageOwner({ gw: slow });
  const running = made.facade.compare({ stageToken: made.staged.stageToken });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await made.facade.compare({ stageToken: made.staged.stageToken })).code, 'ETP_BRIDGE_BUSY');
  assert.equal((await made.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_BUSY');
  assert.deepEqual(await made.facade.discard({ stageToken: made.staged.stageToken }), { ok: true, state: 'DISCARDED' });
  release();
  assert.equal((await running).code, 'ETP_BRIDGE_STAGE_INVALID', 'a stale answer is never delivered');
  const after = await made.facade.stage({ file: fileOf(monthBytes).file });
  assert.equal(after.ok, true, 'the busy flag was released');
});

test('audit: only safe keys, nothing from an unverified pack, and a missing or throwing auditLog never changes a decision', async () => {
  const set = await buildCaseSet({});
  const trustedVerifier = verifierApi.create({ trustedKeys: [set.anchor], crypto: webcrypto });
  const emitted = [];
  const runs = [await stageOwner(), await stageOwner({ bundle: makeRoot({ owner: false, role: 'Store Manager', reauth: async () => false }) }), await stageOwner({ bundle: makeRoot({ owner: false, role: 'Cashier' }) }),
    await stageOwner({ v: shippedVerifier })];
  const compared = runs[0]; await compared.facade.compare({ stageToken: compared.staged.stageToken });
  for (const entry of set.cases.slice(0, 40)) {
    const made = makeFacade({ v: trustedVerifier, now: () => Date.parse(`${entry.verifyOptions.today}T06:30:00Z`) });
    await made.facade.stage({ file: fileOf(entry.bytes).file });
    runs.push(made);
  }
  for (const made of runs) for (const [action, detail] of made.state.audit) emitted.push([action, detail]);
  assert.ok(emitted.length > 80);
  const allowedKeys = new Set(['code', 'stage', 'outcome', 'role', 'gateOpen', 'store', 'periodStart', 'periodEnd', 'reportCount', 'matchCount', 'diffCount', 'keyId']);
  const allowedActions = new Set(['etp.bridge.import.attempt', 'etp.bridge.import.refused', 'etp.bridge.import.staged', 'etp.bridge.compare.run', 'etp.bridge.compare.result']);
  for (const [action, detail] of emitted) {
    assert.ok(allowedActions.has(action), action);
    for (const key of Object.keys(detail)) assert.ok(allowedKeys.has(key), `${action}: ${key}`);
    assert.equal(JSON.stringify(auditSanitize(detail, 'detail', 0)), JSON.stringify(detail), `${action}: the shell sanitiser keeps every key and value: ${JSON.stringify(detail)}`);
    const text = JSON.stringify(detail);
    assert.ok(!/SYNTHETIC|CRO-|exportId|manifestSha|\.scc-etp|\.xlsx|net_|\d{10,}/i.test(text), text);
    assert.ok(!/\b[0-9a-f]{32}\b/.test(text), text);
  }
  const refusedBeforeAuth = emitted.filter(([action, detail]) => action === 'etp.bridge.import.refused' && (detail.stage === 'GATE' || detail.stage === 'REQUEST'));
  assert.ok(refusedBeforeAuth.every(([, detail]) => detail.role === undefined && detail.store === undefined), 'nothing authenticated is logged before the pack is verified');
  assert.ok(emitted.some(([action]) => action === 'etp.bridge.import.staged'));
  for (const variant of [{ auditThrows: true }, { auditMissing: true }]) {
    const made = await stageOwner({ bundle: makeRoot(variant) });
    assert.equal(made.staged.ok, true, JSON.stringify(variant));
    assert.equal((await made.facade.compare({ stageToken: made.staged.stageToken })).outcome, 'MATCH');
    const closed = await makeFacade({ v: shippedVerifier, bundle: makeRoot(variant) }).facade.stage({ file: fileOf(monthBytes).file });
    assert.equal(closed.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  }
});

test('no storage, native, registry, history or confirm call: a real gateway sees zero writes, zero runtime runs and an unchanged registry', async () => {
  const fixture = realGatewayFixture();
  const registryBefore = JSON.stringify(fixture.registry);
  const made = await stageOwner({ gw: { gateway: fixture.gateway } });
  assert.equal(made.staged.ok, true);
  const result = await made.facade.compare({ stageToken: made.staged.stageToken });
  assert.equal(result.outcome, 'MATCH', JSON.stringify(result.reasonCodes));
  assert.equal(result.baseline.generation8, 'aaaaaaaa');
  assert.equal(fixture.counts.setItem, 0, 'no storage write');
  assert.equal(fixture.counts.run + fixture.counts.confirm, 0, 'no import, no confirm');
  assert.equal(JSON.stringify(fixture.registry), registryBefore, 'the receipt registry is unchanged');
  assert.ok(fixture.counts.readVerified >= 4, 'the rows were read through the gateway');
  assert.deepEqual(made.state.touched, []);
  await made.facade.discard({ stageToken: made.staged.stageToken });
  assert.equal(fixture.counts.setItem, 0);
});

test('XLSX non-interference: staging and comparing a pack changes nothing about the XLSX import path', async () => {
  const fixture = realGatewayFixture();
  const importRequest = () => ({ scope: SCOPE, files: REPORT_IDS.map((selectedReportId) => ({ selectedReportId, file: {} })), coverageConfirmed: true });
  const before = await fixture.gateway.run(importRequest());
  assert.equal(before.ok, true);
  assert.equal(before.state, 'AWAITING_CONFIRMATION');
  const confirmedBefore = await fixture.gateway.confirm({ confirmationToken: before.confirmationToken });
  const made = await stageOwner({ gw: { gateway: fixture.gateway } });
  await made.facade.compare({ stageToken: made.staged.stageToken });
  const after = await fixture.gateway.run(importRequest());
  const confirmedAfter = await fixture.gateway.confirm({ confirmationToken: after.confirmationToken });
  const { confirmationToken: tokenA, ...restBefore } = before, { confirmationToken: tokenB, ...restAfter } = after;
  assert.deepEqual(restBefore, restAfter);
  assert.deepEqual(confirmedBefore, confirmedAfter);
  assert.deepEqual(Object.keys(fixture.gateway.importFacade).sort(), ['confirm', 'run'], 'the gateway keeps its exact key lists');
  assert.equal(fixture.counts.run, 2);
  assert.equal(fixture.counts.confirm, 2);
  assert.equal(fixture.counts.setItem, 0);
});

test('active generation only: a restore fence, a missing receipt, an empty store and another generation\'s rows never produce a MATCH', async () => {
  const fenced = realGatewayFixture({ restoreFence: true });
  const one = await stageOwner({ gw: { gateway: fenced.gateway } });
  const fencedResult = await one.facade.compare({ stageToken: one.staged.stageToken });
  assert.deepEqual({ ok: fencedResult.ok, code: fencedResult.code }, { ok: false, code: 'ETP_REIMPORT_REQUIRED' });
  const empty = realGatewayFixture({ noReceipt: true });
  const two = await stageOwner({ gw: { gateway: empty.gateway } });
  const emptyResult = await two.facade.compare({ stageToken: two.staged.stageToken });
  assert.equal(emptyResult.outcome, 'CANNOT_COMPARE');
  assert.deepEqual(emptyResult.reasonCodes, ['ETP_BRIDGE_COMPARE_NO_TABLET_GENERATION']);
  const unready = realGatewayFixture({ nativeState: 'EMPTY' });
  const three = await stageOwner({ gw: { gateway: unready.gateway } });
  assert.equal((await three.facade.compare({ stageToken: three.staged.stageToken })).outcome, 'CANNOT_COMPARE');
  const wrong = realGatewayFixture({ servedGeneration: OTHER_GEN });
  const four = await stageOwner({ gw: { gateway: wrong.gateway } });
  const wrongResult = await four.facade.compare({ stageToken: four.staged.stageToken });
  assert.equal(wrongResult.ok, false, 'rows of another generation are refused by the gateway');
  const denied = realGatewayFixture({ authorize: () => false });
  const five = await stageOwner({ gw: { gateway: denied.gateway } });
  assert.equal((await five.facade.compare({ stageToken: five.staged.stageToken })).code, 'ETP_ACCESS_DENIED');
  const other = realGatewayFixture({ otherScopeOnly: true });
  const six = await stageOwner({ gw: { gateway: other.gateway } });
  assert.equal((await six.facade.compare({ stageToken: six.staged.stageToken })).outcome, 'CANNOT_COMPARE', 'a receipt for another period is not this pack\'s baseline');
});

test('paging through the real gateway: more than 200 rows per report, one-use cursors, exact totals', async () => {
  const random = (seed) => { let a = seed; return () => { a = (a * 1664525 + 1013904223) % 4294967296; return a / 4294967296; }; };
  const next = random(7), big = { R003: [], R013: [], R022: [], R025: [] };
  for (let i = 0; i < 450; i += 1) {
    const day = `2026-08-${String(1 + (i % 28)).padStart(2, '0')}`, no = String(5000 + i).padStart(7, '0'), cents = 100000 + Math.floor(next() * 90000);
    const net = `${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, '0')}`;
    big.R003.push({ invoice_date: day, transaction_type_raw: 'INV', net_amount: net, scheme_discount: '0.00', user_discount: '0.00' });
    big.R013.push({ invoice_date: day, invoice_number: no, transaction_type_raw: 'INV', quantity: '1.000', net_amount: net, cro_number: 'CRO-0001' });
    big.R022.push({ invoice_date: day, invoice_number: no, transaction_type_raw: 'INV', invoice_quantity: '1.000', net_value: net, cash_amount: net, card_amount: '0.00', bhim_upi_amount: '0.00', phonepe_amount: '0.00',
      paytm_amount: '0.00', razorpay_amount: '0.00', bharatpe_amount: '0.00', cheque_amount: '0.00', others_amount: '0.00', payment_type24_amount: '0.00' });
    big.R025.push({ invoice_date: day, invoice_number: no, transaction_type_raw: 'INV', quantity: '1.000', net_amount: net, brand: 'SYNTHETIC_ONLY', cluster: 'SYNTHETIC_ONLY', gender: 'SYNTHETIC_ONLY', scheme_discount: '0.00', user_discount: '0.00', tax_amount: '0.00' });
  }
  const draft = await buildPackDraft({ keyPair, profile: 'month', seed: 'big', hooks: { rows: (d) => { d.rows = clone(big); } } });
  const fixture = realGatewayFixture({ rows: big });
  const made = makeFacade({ gw: { gateway: fixture.gateway } });
  const staged = await made.facade.stage({ file: fileOf(draft.bytes).file });
  assert.equal(staged.ok, true, staged.code);
  const result = await made.facade.compare({ stageToken: staged.stageToken });
  assert.equal(result.outcome, 'MATCH', JSON.stringify(result.reasonCodes));
  assert.equal(result.reports.R025.rows.matched, 450);
  assert.ok(fixture.counts.readVerified >= 12, 'three pages for each of the four reports (and the summary)');
  const skewed = clone(big); skewed.R013[449].net_amount = '0.01';
  const second = realGatewayFixture({ rows: skewed });
  const again = makeFacade({ gw: { gateway: second.gateway } });
  const stagedAgain = await again.facade.stage({ file: fileOf(draft.bytes).file });
  const differing = await again.facade.compare({ stageToken: stagedAgain.stageToken });
  assert.equal(differing.outcome, 'DIFFERENCES');
  assert.equal(differing.reports.R013.rows.differing, 1, 'the last row of the last page is checked too');
});

test('browser load in a vm context with no module: only frozen instances exist, no factory or trust option is reachable, and a test-key pack is still refused', async () => {
  const hostEvents = { size: 0, arrayBuffer: 0, reauth: 0 };
  const sandbox = { crypto: webcrypto, TextDecoder, Date, Uint8Array, ArrayBuffer, Promise,
    SaagarOwnerSession: { read: () => ({ version: 1, isOwner: true, role: 'Store Manager', isManager: true }) }, roleCanOpen: () => true,
    SaagarReauth: async () => { hostEvents.reauth += 1; return true; }, auditLog: () => {} };
  const context = vm.createContext(sandbox);
  for (const name of ['etp-store-lifecycle-policy.js', 'etp-profile-authority.js', 'etp-tender-dictionary.js']) vm.runInContext(readWww(name), context, { filename: name });
  vm.runInContext('globalThis.SaagarEtpModuleGateway = Object.freeze({ readVerified: async function () { return { ok: false, code: "ETP_RECEIPT_NOT_FOUND" }; }, readFacade: Object.freeze({ loadSummary: async function () { return { ok: false }; } }) });', context);
  for (const name of ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js', 'etp-bridge-compare.js', 'etp-bridge-facade.js']) vm.runInContext(readWww(name), context, { filename: name });
  assert.equal(typeof context.module, 'undefined');
  const globals = { SaagarEtpBridgeTrust: ['CONTRACT', 'GATE_ID', 'VERSION', 'gate', 'keys'], SaagarEtpBridgePackVerifier: ['CODES', 'CONTRACT', 'GATE_ID', 'MESSAGES', 'VERSION', 'gate', 'verify'],
    SaagarEtpBridgeCompare: ['CODES', 'COLUMNS', 'CONTRACT', 'FIGURES', 'INFORMATIONAL', 'LABEL_RULE_DIFFERENCE', 'MAX_DAYS_LISTED', 'MAX_ROWS', 'MEASURES', 'REPORT_IDS', 'VERSION', 'compare', 'formatUnits'],
    SaagarEtpBridgeFacade: ['CODES', 'VERSION', 'compare', 'discard', 'stage', 'status'] };
  for (const [name, keys] of Object.entries(globals)) {
    const descriptor = Object.getOwnPropertyDescriptor(context, name);
    assert.ok(descriptor && descriptor.writable === false && descriptor.configurable === false, name);
    assert.ok(Object.isFrozen(descriptor.value), name);
    assert.deepEqual(Object.keys(descriptor.value).sort(), keys, name);
    assert.throws(() => vm.runInContext(`Object.defineProperty(globalThis, ${JSON.stringify(name)}, { value: {} })`, context), { name: 'TypeError' });
  }
  const functionPaths = [];
  const seen = new Set();
  const walk = (value, path) => {
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) return;
    seen.add(value);
    if (typeof value === 'function') functionPaths.push(path);
    for (const key of Object.getOwnPropertyNames(value)) { if (['prototype', 'length', 'name', 'caller', 'arguments'].includes(key)) continue; walk(value[key], `${path}.${key}`); }
  };
  for (const name of Object.keys(globals)) walk(context[name], name);
  assert.deepEqual(functionPaths.sort(), ['SaagarEtpBridgeCompare.compare', 'SaagarEtpBridgeCompare.formatUnits', 'SaagarEtpBridgeFacade.compare', 'SaagarEtpBridgeFacade.discard', 'SaagarEtpBridgeFacade.stage',
    'SaagarEtpBridgeFacade.status', 'SaagarEtpBridgePackVerifier.gate', 'SaagarEtpBridgePackVerifier.verify', 'SaagarEtpBridgeTrust.gate'], 'every reachable function; none is a factory or accepts a key');
  assert.equal(Object.keys(context.SaagarEtpBridgeTrust.keys).length, 0);
  assert.throws(() => context.SaagarEtpBridgeTrust.keys.push(keyPair.anchor), { name: 'TypeError' });
  assert.throws(() => { context.SaagarEtpBridgeTrust.keys = [keyPair.anchor]; }, { name: 'TypeError' });
  assert.deepEqual({ ...context.SaagarEtpBridgePackVerifier.gate() }, { id: 'GATE-ETP-BRIDGE-TRUST', open: false, state: 'CLOSED', code: 'ETP_BRIDGE_TRUST_GATE_CLOSED' });
  const hostile = { tenderDictionaryVersionId: 'retail-etp-tender-v1', today: '2026-09-01', trustedKeys: [keyPair.anchor], keys: [keyPair.anchor], anchor: keyPair.anchor, publicKeyHex: keyPair.anchor.publicKeyHex, crypto: webcrypto };
  const direct = await context.SaagarEtpBridgePackVerifier.verify(monthBytes, hostile);
  assert.equal(direct.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  const { file, counts } = fileOf(monthBytes);
  const status = await context.SaagarEtpBridgeFacade.status();
  assert.deepEqual({ ...status }, { ok: true, gate: 'CLOSED', access: 'OWNER', maxBytes: 33554432 });
  const staged = await context.SaagarEtpBridgeFacade.stage({ file });
  assert.equal(staged.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  assert.equal(counts.size + counts.arrayBuffer + hostEvents.reauth, 0);
  assert.equal((await context.SaagarEtpBridgeFacade.stage({ file, trustedKeys: [keyPair.anchor] })).code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  void hostEvents;
});

test('browser load: a missing or tampered dependency global makes the facade unavailable instead of trusting it', async () => {
  const load = (prepare) => {
    const context = vm.createContext({ crypto: webcrypto, TextDecoder, Date, SaagarOwnerSession: { read: () => ({ version: 1, isOwner: true, role: 'Store Manager' }) }, roleCanOpen: () => true });
    for (const name of ['etp-store-lifecycle-policy.js', 'etp-profile-authority.js', 'etp-tender-dictionary.js']) vm.runInContext(readWww(name), context);
    vm.runInContext('globalThis.SaagarEtpModuleGateway = Object.freeze({ readVerified: async function () { return { ok: false }; }, readFacade: Object.freeze({}) });', context);
    if (prepare) prepare(context);
    for (const name of ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js', 'etp-bridge-compare.js', 'etp-bridge-facade.js']) vm.runInContext(readWww(name), context);
    return context;
  };
  const healthy = load();
  assert.equal((await healthy.SaagarEtpBridgeFacade.status()).ok, true);
  const hostileCompare = load((context) => { context.SaagarEtpBridgeCompare = { compare: () => ({ ok: true }), COLUMNS: {}, MEASURES: {}, formatUnits: () => '' }; });
  assert.equal((await hostileCompare.SaagarEtpBridgeFacade.status()).code, 'ETP_BRIDGE_UNAVAILABLE', 'a writable stand-in for the compare module is not accepted');
  const noGateway = load((context) => { vm.runInContext('delete globalThis.SaagarEtpModuleGateway;', context); });
  assert.equal((await noGateway.SaagarEtpBridgeFacade.status()).code, 'ETP_BRIDGE_UNAVAILABLE');
  const hostileFacade = load((context) => { context.SaagarEtpBridgeFacade = { status: () => 'mine' }; });
  assert.equal(hostileFacade.SaagarEtpBridgeFacade.status(), 'mine', 'an existing definition is left in place and never reused as a gate');
  const hostileTrust = load((context) => { vm.runInContext('globalThis.SaagarEtpBridgeTrust = { VERSION: 1, GATE_ID: "GATE-ETP-BRIDGE-TRUST", CONTRACT: "SCC_ETP_BRIDGE_V1", keys: [], gate: function () {} };', context); });
  const status = await hostileTrust.SaagarEtpBridgeFacade.status();
  assert.equal(status.gate, 'CLOSED', 'a hostile writable trust global keeps the gate closed');
});

test('a module frame reaches the facade only through the shell bridge getter, which returns the frozen facade and nothing else of the bridge', () => {
  const bridgeSource = readWww('shared/module-bridge.js');
  const parentWindow = { SaagarEtpBridgeFacade: Object.freeze({ marker: 'facade' }), SaagarEtpBridgePackVerifier: Object.freeze({ marker: 'verifier' }), SaagarEtpBridgeTrust: Object.freeze({ marker: 'trust' }),
    SaagarEtpBridgeCompare: Object.freeze({ marker: 'compare' }), SaagarEtpModuleGateway: Object.freeze({ importFacade: { run() {}, confirm() {} }, readFacade: {} }) };
  const frame = { parent: null };
  frame.parent = parentWindow;
  const context = vm.createContext(frame);
  context.window = context;
  vm.runInContext(bridgeSource, context);
  const bridge = context.SaagarModuleBridge;
  assert.equal(bridge.etpBridgeGateway.marker, 'facade');
  const values = Object.keys(bridge).map((name) => { try { return bridge[name]; } catch (_) { return undefined; } });
  const markers = values.filter((value) => value && typeof value === 'object' && 'marker' in value).map((value) => value.marker);
  assert.deepEqual(markers, ['facade'], 'no getter returns the verifier, the trust object or the compare module');
  assert.ok(!('etpBridgeVerifier' in bridge) && !('etpBridgeTrust' in bridge) && !('etpBridgeCompare' in bridge));
  assert.equal(bridge.etpImportGateway.run.name, 'run');
  const facadeOnly = makeFacade();
  assert.deepEqual(Object.keys(facadeOnly.raw).sort(), ['CODES', 'VERSION', 'compare', 'discard', 'stage', 'status']);
});

test('without the gateway getter a frame cannot make the facade work: it still enforces the gate, the role and the session itself', async () => {
  const frameCall = makeFacade({ v: shippedVerifier, bundle: makeRoot({ owner: false, role: 'Cashier' }) });
  assert.equal((await frameCall.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  const trustedCashier = makeFacade({ bundle: makeRoot({ owner: false, role: 'Cashier' }) });
  assert.equal((await trustedCashier.facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_ROLE_REFUSED');
});

test('the shell defines no global named module, so the verifier\'s Node-only factory can never be exported to page script', () => {
  assert.doesNotMatch(SHELL, /(?:^|[;{}\s])(?:var|let|const|function|class)\s+module\b/);
  assert.doesNotMatch(SHELL, /\b(?:window|globalThis|self|top|parent)\.module\s*=/);
  assert.doesNotMatch(SHELL, /\bmodule\s*=\s*\{\s*exports/);
});

test('the four tags are synchronous, in order, directly after the operations consumer, and the shell stays below its byte limit', () => {
  const tags = ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js', 'etp-bridge-compare.js', 'etp-bridge-facade.js'].map((name) => `<script src="${name}"></script>\n`).join('');
  assert.ok(SHELL.includes(`<script src="etp-operations-consumer.js"></script>\n${tags}`));
  assert.doesNotMatch(SHELL, /<script (?:defer|async)[^>]*etp-bridge/);
  assert.ok(Buffer.byteLength(SHELL) < 580636, `index.html is ${Buffer.byteLength(SHELL)} bytes`);
  assert.equal(SHELL.split('etp-bridge-').length - 1, 4, 'nothing else in the shell names a bridge file');
  const chain = readWww('etp-chain-loader.js');
  assert.ok(!chain.includes('etp-bridge'), 'the on-demand chain is untouched');
  assert.equal(readWww('etp-module-gateway.js').includes('SaagarEtpBridge'), false, 'the gateway is byte-unchanged and does not know the bridge');
});

test('source scan: the four files hold no timer, listener, message, console, network, storage, script-loader or publish surface', () => {
  const facadeBanned = BANNED_BROWSER_TOKENS.filter((pattern) => !pattern.test('SaagarReauth SaagarOwnerSession'));
  for (const name of ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js', 'etp-bridge-compare.js', 'etp-bridge-facade.js']) {
    const source = readWww(name);
    for (const pattern of facadeBanned) assert.doesNotMatch(source, pattern, `${name}: ${pattern}`);
    assert.doesNotMatch(source, /Saagar(?:EtpOperational|EtpE[3-7]|EtpCro|EtpTarget|EtpIncentive)/, name);
    assert.ok(!source.includes('\r') && !source.startsWith('﻿'), `${name}: LF endings and no BOM`);
  }
  assert.doesNotMatch(FACADE_SOURCE, /importFacade|SaagarEtpImportRuntime|SaagarEtpControlRegistry|SaagarEtpImportHistory|SaagarEtpCoreContract|SaagarEtpStore\b|SaagarEtpNative|beginStage|appendStageChunk|finishStage|publishStage|saveReceipt|createReceipt|\.confirm\s*\(|\.run\s*\(|\.append\s*\(|\.setItem|\.removeItem/);
  assert.doesNotMatch(FACADE_SOURCE + COMPARE_SOURCE, /trustedKeys|createForTest|publicKeyHex|privateKey|generateKey|exportKey|testKey/);
  assert.doesNotMatch(FACADE_SOURCE, /incentive|payroll|sourceKind|saagar_etp_bridge/i);
  assert.match(FACADE_SOURCE, /root\.SaagarEtpModuleGateway/);
});

test('every code the facade emitted in this file is a code of the verifier, the compare module, the facade, or a safe gateway code', () => {
  const known = new Set([...verifierApi.CODES, ...compareApi.CODES, ...facadeApi.CODES]);
  const gatewayCodes = new Set(['ETP_REIMPORT_REQUIRED', 'ETP_ACCESS_DENIED', 'ETP_STATUS_UNAVAILABLE', 'ETP_GATEWAY_RESPONSE_INVALID', 'ETP_HEMW_PROFILE_AUTHORIZATION_REQUIRED']);
  assert.ok(allEmitted.size > 25);
  for (const code of allEmitted) {
    assert.match(code, /^ETP_[A-Z0-9_]{1,80}$/);
    assert.ok(known.has(code) || gatewayCodes.has(code), code);
  }
  for (const code of facadeApi.CODES) assert.ok(allEmitted.has(code) || code === 'ETP_BRIDGE_SESSION_INVALID', `the facade code ${code} is exercised`);
});

test('the facade never logs: no console call happens during a full stage and compare', async () => {
  const names = ['log', 'info', 'warn', 'error', 'debug', 'trace'], originals = {}, hits = [];
  for (const name of names) { originals[name] = console[name]; console[name] = (...args) => { hits.push(name); }; }
  try {
    const made = await stageOwner();
    await made.facade.compare({ stageToken: made.staged.stageToken });
    await stageOwner({ v: shippedVerifier });
  } finally { for (const name of names) console[name] = originals[name]; }
  assert.deepEqual(hits, []);
});

test('a module frame is another realm: its request object, File and ArrayBuffer work, and its objects are never trusted for anything else', async () => {
  const frame = vm.createContext({});
  const frameBytes = vm.runInContext('new Uint8Array(0)', frame).constructor;
  const bytes = new frameBytes(monthBytes.length);
  bytes.set(monthBytes);
  frame.bytes = bytes;
  const request = vm.runInContext('({ file: { size: bytes.length, arrayBuffer: async function () { return bytes.buffer.slice(0); } } })', frame);
  assert.notEqual(Object.getPrototypeOf(request), Object.prototype, 'the request really comes from another realm');
  const made = makeFacade();
  const staged = await made.facade.stage(request);
  assert.equal(staged.ok, true, staged.code);
  assert.equal((await made.facade.compare(vm.runInContext('({ stageToken: "' + staged.stageToken + '" })', frame))).outcome, 'MATCH');
  assert.deepEqual(await made.facade.discard(vm.runInContext('({ stageToken: "' + staged.stageToken + '" })', frame)), { ok: true, state: 'DISCARDED' });
  const polluted = vm.runInContext('({ file: { size: bytes.length, arrayBuffer: async function () { return bytes.buffer.slice(0); } }, role: "Owner" })', frame);
  assert.equal((await made.facade.stage(polluted)).code, 'ETP_BRIDGE_REQUEST_INVALID', 'extra keys are refused for a foreign object too');
  assert.equal((await made.facade.stage(vm.runInContext('[1]', frame))).code, 'ETP_BRIDGE_REQUEST_INVALID');
});

test('the Owner session is checked field by field on its own properties: an inherited isOwner or role is not accepted', async () => {
  for (const snapshot of [Object.assign(Object.create({ isOwner: true }), { version: 1, role: 'Store Manager' }), Object.assign(Object.create({ role: 'Store Manager' }), { version: 1, isOwner: false }),
    Object.assign(Object.create({ version: 1 }), { isOwner: true, role: 'Store Manager' })]) {
    const bundle = makeRoot();
    bundle.state.override = true; bundle.state.snapshot = snapshot;
    assert.equal((await makeFacade({ bundle }).facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_SESSION_INVALID');
    assert.equal((await makeFacade({ bundle }).facade.status()).access, 'DENIED');
  }
});

test('a gate that closes while the keypad is open refuses the stage, the file is never read, and the refusal names the role', async () => {
  let open = true;
  const flip = { gate: () => (open ? verifier.gate() : shippedVerifier.gate()), verify: verifier.verify };
  const bundle = makeRoot({ owner: false, role: 'Store Manager', reauth: async () => { open = false; return true; } });
  const { file, counts } = fileOf(monthBytes);
  const result = await makeFacade({ v: flip, bundle }).facade.stage({ file });
  assert.equal(result.code, 'ETP_BRIDGE_TRUST_GATE_CLOSED');
  assert.equal(counts.size + counts.arrayBuffer, 0);
  const refusals = bundle.state.audit.filter((entry) => entry[0] === 'etp.bridge.import.refused');
  assert.deepEqual(refusals.map((entry) => entry[1]), [{ code: 'ETP_BRIDGE_TRUST_GATE_CLOSED', stage: 'GATE', role: 'STORE_MANAGER' }]);
  const denied = makeRoot({ owner: false, role: 'Store Manager', reauth: async () => false });
  await makeFacade({ bundle: denied }).facade.stage({ file: fileOf(monthBytes).file });
  assert.deepEqual(denied.state.audit.filter((entry) => entry[0] === 'etp.bridge.import.refused').map((entry) => entry[1]), [{ code: 'ETP_BRIDGE_REAUTH_DENIED', stage: 'AUTHORIZE', role: 'STORE_MANAGER' }]);
});

test('the scope must come back from the lifecycle policy as ok:true with the same key; either alone is not enough', async () => {
  const life = { validateScope: () => ({ ok: false, key: SCOPE_KEY, scope: SCOPE }) };
  assert.equal((await makeFacade({ life }).facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_PERIOD_INVALID');
  const throwing = { validateScope: () => { throw new Error('x'); } };
  assert.equal((await makeFacade({ life: throwing }).facade.stage({ file: fileOf(monthBytes).file })).code, 'ETP_BRIDGE_PERIOD_INVALID');
});

test('the staged pack expires at exactly ten minutes', async () => {
  let clock = NOW;
  const made = makeFacade({ now: () => clock });
  const staged = await made.facade.stage({ file: fileOf(monthBytes).file });
  clock = NOW + 600000;
  assert.equal((await made.facade.compare({ stageToken: staged.stageToken })).code, 'ETP_BRIDGE_STAGE_INVALID');
  const again = await made.facade.stage({ file: fileOf(monthBytes).file });
  clock = NOW + 600000 + 599999;
  assert.equal((await made.facade.compare({ stageToken: again.stageToken })).ok, true);
  assert.equal(facadeApi.SLOT_MS, 600000);
  const brokenClock = makeFacade({ now: () => { throw new Error('clock'); } });
  assert.equal((await brokenClock.facade.stage({ file: fileOf(monthBytes).file })).ok, false, 'no clock, no staging');
});

test('the compare module is called with zero samples, plain data and only the verified pack facts', async () => {
  let seen = null;
  const spy = { ...compareApi, compare: (input) => { seen = JSON.parse(JSON.stringify(input)); return compareApi.compare(input); } };
  const made = await stageOwner({ cmp: spy });
  await made.facade.compare({ stageToken: made.staged.stageToken });
  assert.deepEqual(seen.options, { sampleLimitPerReport: 0 });
  assert.equal(seen.pack.verified, true);
  assert.equal(seen.pack.storeCode, 'WLMHW');
  assert.equal(seen.scope.scopeKey, SCOPE_KEY);
  assert.deepEqual(seen.tablet.expectedRowCounts, { R003: 6, R013: 6, R022: 6, R025: 6 });
  assert.equal(seen.tablet.complete, true);
  assert.match(seen.tablet.generationId, /^etp_[a-f0-9]{32}$/);
  assert.deepEqual(Object.keys(seen.pack.engineTotals.R025), ['rowCount', 'sums']);
  assert.equal(seen.pack.engineTotals.R025.sums.net_amount, '90247.50', 'the engine totals are the PLAIN sums, not the signed ones');
  assert.equal(seen.pack.rows.R003.length, 6);
});

test('the display lists at most twenty differences per report and still reports the true number of differing days', async () => {
  const days = Array.from({ length: 25 }, (_, i) => `2026-08-${String(1 + i).padStart(2, '0')}`);
  const packRows = days.map((date) => ({ invoice_date: date, transaction_type_raw: 'INV', net_amount: '10.00', scheme_discount: '0.00', user_discount: '0.00' }));
  const tabletRows = packRows.map((row) => ({ ...row, net_amount: '10.01' }));
  const draft = await buildPackDraft({ keyPair, profile: 'month', seed: 'days', hooks: { rows: (d) => { d.rows.R003 = clone(packRows); } } });
  const made = makeFacade({ gw: fakeGateway({ ...monthRows, R003: tabletRows }) });
  const staged = await made.facade.stage({ file: fileOf(draft.bytes).file });
  assert.equal(staged.ok, true, staged.code);
  const result = await made.facade.compare({ stageToken: staged.stageToken });
  assert.equal(result.reports.R003.daysDiffering, 25);
  assert.equal(result.reports.R003.differences.length, 20);
  assert.deepEqual(result.reports.R003.differences[0], { date: '2026-08-01', key: 'net_amount', pack: '10.00', tablet: '10.01' });
});

/* ---- a real gateway over fake runtime pages ----------------------------------------------------------------------- */
function receiptFor(generationId) {
  const life = lifecycle.create(SCOPE, generationId).lifecycle;
  const authorityBinding = profileAuthority.authorize({ storeCode: 'WLMHW', purpose: 'PRODUCTION', profileVersion: profileAuthority.PROFILE_VERSION, parserVersion: profileAuthority.PARSER_VERSION }).binding;
  const accepted = Object.freeze({ ...life, state: 'ACCEPTED', candidateGenerationId: null, activeGenerationId: generationId, activeManifestIdentity: 'manifest-safe', manifest: { authority: authorityBinding, tenderDictionary: tenderApi.BUILD_IDENTITY } });
  return {
    contractVersion: core.ETP_CORE_VERSION, scopeKey: SCOPE_KEY, storeCode: 'WLMHW', activeGenerationId: generationId, profileVersion: core.ETP_CORE_VERSION, parserVersion: profileAuthority.PARSER_VERSION,
    profileAuthority: authorityBinding, tenderDictionary: tenderApi.BUILD_IDENTITY, ruleVersion: core.RECON_RULE.ruleVersion, reconciliationStatus: 'PASS',
    enrichments: { R003: { status: 'FAIL', differenceCount: 2 }, R013: { status: 'PASS', differenceCount: 0 }, paymentType25: { status: 'QUARANTINED', rowCount: 9, persisted: false } },
    coverage: Object.fromEntries(core.REPORTS.map((id) => [id, { status: 'COMPLETE', periodStart: SCOPE.periodStart, declaredPeriodEnd: SCOPE.periodEnd, evidenceId: 'f'.repeat(64), zeroActivityConfirmed: false }])),
    publishedAt: '2026-09-01', lifecycle: accepted
  };
}
function realGatewayFixture({ rows = monthRows, restoreFence = false, noReceipt = false, nativeState = 'ACCEPTED', servedGeneration = GEN, authorize = () => true, otherScopeOnly = false } = {}) {
  const counts = { setItem: 0, run: 0, confirm: 0, readVerified: 0 };
  const registry = noReceipt ? { scopes: {} } : { scopes: { [otherScopeOnly ? 'WLMHW|2026-27|2026-07-01..2026-07-31' : SCOPE_KEY]: { current: receiptFor(GEN), history: [receiptFor(OTHER_GEN)] } } };
  const storage = { getItem: (key) => (key === gatewayApi.REGISTRY_KEY ? JSON.stringify(registry) : null), setItem: () => { counts.setItem += 1; } };
  const runtime = {
    async run() { counts.run += 1; const life = lifecycle.create(SCOPE, OTHER_GEN).lifecycle; return { ok: true, changed: false, awaitingConfirmation: true, lifecycle: { ...life, state: 'AWAITING_CONFIRMATION' } }; },
    async confirm(life) { counts.confirm += 1; return { ok: true, changed: true, lifecycle: { ...life, state: 'ACCEPTED', candidateGenerationId: null, activeGenerationId: life.candidateGenerationId } }; },
    async readVerified(_scope, request) {
      counts.readVerified += 1;
      const all = rows[request.reportId], start = request.cursor ? request.cursor.chunkIndex * 200 : 0, slice = all.slice(start, start + 200), hasMore = start + 200 < all.length;
      return { ok: true, page: { scopeKey: SCOPE_KEY, generationId: servedGeneration, reportId: request.reportId, rows: slice.map((row) => Object.fromEntries(request.fields.map((field) => [field, row[field]]))), hasMore,
        nextCursor: hasMore ? { chunkIndex: (request.cursor ? request.cursor.chunkIndex : 0) + 1, rowOffset: 0 } : null } };
    }
  };
  let token = 0;
  const made = gatewayApi.create({ runtime, lifecyclePolicy: lifecycle, core, foundationStatus, queryContract, profileAuthority, importHistoryApi, tenderDictionaryApi: tenderApi, storage,
    statusReader: async () => ({ ok: true, status: { state: nativeState, activeGenerationId: GEN, restoreFence } }), authorize, tokenFactory: () => { token += 1; return token.toString(16).padStart(32, '0'); } });
  assert.equal(made.ok, true);
  return { gateway: made.gateway, counts, registry };
}
