import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(rootDir, 'www/auto-backup.js'), 'utf8');

function memoryStorage(initial = {}) {
  const values = new Map(Object.entries(initial).map(([k, v]) => [k, String(v)]));
  return {
    values,
    getItem(k) { return values.has(String(k)) ? values.get(String(k)) : null; },
    setItem(k, v) { values.set(String(k), String(v)); },
    removeItem(k) { values.delete(String(k)); },
    key(i) { return [...values.keys()][i] ?? null; },
    get length() { return values.size; }
  };
}

const SEAL_HEADER = [83, 66, 67, 67, 49, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];

function make(options = {}) {
  const state = { now: options.now || '2026-08-02T10:00:00.000Z', authoritative: options.authoritative !== false };
  const files = new Map(Object.entries(options.files || {}));
  const writes = [];
  const deletes = [];
  const timers = [];
  let clock = 0;
  const localStorage = memoryStorage(options.storage || {});
  const NativeDate = Date;
  class FixedDate extends NativeDate {
    constructor(...args) { super(...(args.length ? args : [state.now])); }
    static now() { return new NativeDate(state.now).getTime() + clock; }
  }
  const Filesystem = {
    readdir() { return Promise.resolve({ files: [...files.keys()].map(p => p.replace(/^SaagarBCC-Backups\//, '')) }); },
    writeFile(req) { writes.push(req.path); files.set(req.path, Buffer.from(req.data, 'base64')); return Promise.resolve(); },
    readFile(req) { if (!files.has(req.path)) return Promise.reject(new Error('not found')); return Promise.resolve({ data: files.get(req.path).toString('base64') }); },
    deleteFile(req) { deletes.push(req.path); files.delete(req.path); return Promise.resolve(); }
  };
  if (options.stat !== false) {
    Filesystem.stat = req => files.has(req.path)
      ? Promise.resolve({ size: options.statSize ? options.statSize(req.path, files.get(req.path)) : files.get(req.path).length })
      : Promise.reject(new Error('not found'));
  }
  const store = { ready() { return state.authoritative; } };
  if (options.authoritativeMethod !== false) store.authoritative = () => state.authoritative;
  if (options.seal !== false) store.seal = bytes => Promise.resolve(Uint8Array.from([...SEAL_HEADER, ...bytes]));
  if (options.seal !== false) store.unseal = bytes => Promise.resolve(bytes.slice(SEAL_HEADER.length));
  const ctx = {
    localStorage,
    document: { readyState: options.readyState || 'loading', addEventListener() {} },
    TextEncoder, TextDecoder, Uint8Array, Date: FixedDate, Math, JSON, Promise, Event, Object, Array, String, Number, Error,
    setTimeout(fn, ms) { timers.push({ fn, at: clock + ms, once: true }); return timers.length; },
    clearTimeout() {},
    setInterval(fn, ms) { timers.push({ fn, at: clock + ms, every: ms }); return timers.length; },
    clearInterval() {},
    btoa(v) { return Buffer.from(v, 'binary').toString('base64'); },
    atob(v) { return Buffer.from(v, 'base64').toString('binary'); },
    unescape, escape, encodeURIComponent, decodeURIComponent,
    console: { log() {}, warn() {}, error() {} },
    dispatchEvent() {}, addEventListener() {},
    Capacitor: { isNativePlatform() { return true; }, Plugins: { Filesystem } },
    SaagarStore: store
  };
  ctx.window = ctx;
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(source, ctx, { filename: 'auto-backup.js' });
  function advance(ms) {
    const target = clock + ms;
    for (;;) {
      const due = timers.filter(t => t.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      clock = Math.max(clock, due.at);
      if (due.once) timers.splice(timers.indexOf(due), 1); else due.at += due.every;
      due.fn();
    }
    clock = target;
    return new Promise(resolve => setImmediate(() => setImmediate(resolve)));
  }
  const api = ctx.SaagarBackup;
  return { ctx, state, files, writes, deletes, localStorage, advance, api };
}

function appKeys(n, extra = {}) {
  const o = {};
  for (let i = 0; i < n; i++) o['app_key_' + i] = JSON.stringify({ i, pad: 'x'.repeat(40) });
  return Object.assign(o, extra);
}
function decode(buf) {
  const b = Buffer.from(buf);
  const body = b.slice(0, 5).toString() === 'SBCC1' ? b.slice(SEAL_HEADER.length) : b;
  return JSON.parse(body.toString('utf8'));
}
const DIR = 'SaagarBCC-Backups/';
const GOOD = Buffer.concat([Buffer.from(SEAL_HEADER), Buffer.from('{"localStorage":{"k":"1"}}')]);
// The last good figures live in the existing log key (no new storage key, plan G5).
const lastGood = (keys, bytes, date = '2026-08-01') => JSON.stringify([{ at: date + 'T10:00:00.000Z', date, mode: 'file-sealed', keys, ok: true, good: { keys, bytes, date } }]);

test('X2-F02 waits for storage, then writes daily first with all keys', async () => {
  const t = make({ authoritative: false, readyState: 'complete' });
  await t.advance(6000);
  await t.advance(60000);
  assert.equal(t.writes.length, 0);
  Object.entries(appKeys(25)).forEach(([k, v]) => t.localStorage.setItem(k, v));
  t.state.authoritative = true;
  await t.advance(2000);
  await t.advance(7000);
  assert.ok(t.writes.length >= 4, 'writes: ' + t.writes.join(','));
  assert.equal(t.writes[0], DIR + 'backup-2026-08-02.json');
  assert.equal(t.writes[1], DIR + 'latest.json');
  assert.ok(t.writes.some(w => /weekly-/.test(w)) && t.writes.some(w => /monthly-/.test(w)));
  assert.equal(Object.keys(decode(t.files.get(DIR + 'latest.json')).localStorage).length >= 25, true);
  assert.equal(t.api.status().waitingForStorage, false);
});

test('X2-F02 waiting is visible in status while storage is closed', async () => {
  const t = make({ authoritative: false, readyState: 'complete' });
  await t.advance(40000);
  const s = t.api.status();
  assert.equal(s.waitingForStorage, true);
  assert.match(s.notice, /waiting/i);
  const r = await t.api.now();
  assert.equal(r.waiting, true);
  assert.equal(t.writes.length, 0);
});

test('S03a-1b empty snapshot never overwrites a good backup', async () => {
  const t = make({
    storage: { bcc_autobackup_log: lastGood(40, 90000), bcc_autobackup_last: '2026-08-01' },
    files: { [DIR + 'latest.json']: GOOD, [DIR + 'weekly-2026-W31.json']: GOOD, [DIR + 'monthly-2026-08.json']: GOOD }
  });
  const r = await t.api.now();
  assert.equal(r.ok, false);
  assert.equal(r.refused, 'empty');
  assert.equal(t.writes.length, 0);
  assert.equal(t.deletes.length, 0);
  assert.deepEqual([...t.files.get(DIR + 'latest.json')], [...GOOD]);
  const s = t.api.status();
  assert.equal(s.lastRefusal.code, 'empty');
  assert.equal(s.failureEscalated, true);
  assert.ok(s.notice.length > 0);
  assert.equal(t.localStorage.getItem('bcc_autobackup_last'), '2026-08-01');
  assert.equal((await t.api.now({ acceptSmaller: true })).refused, 'empty', 'acceptSmaller does not allow an empty snapshot');
});

test('S03a-1 fresh install with 0 keys is not a failure', async () => {
  const t = make();
  const r = await t.api.now();
  assert.equal(r.skipped, true);
  assert.equal(t.writes.length, 0);
  assert.equal(t.api.status().consecutiveFailures, 0);
});

test('S03a-1c suspect (under half) goes to the daily file only, then is accepted next day', async () => {
  const t = make({
    storage: Object.assign(appKeys(30), { bcc_autobackup_log: lastGood(100, 90000) }),
    files: { [DIR + 'latest.json']: GOOD, [DIR + 'weekly-2026-W31.json']: GOOD, [DIR + 'monthly-2026-08.json']: GOOD }
  });
  const r1 = await t.api.now();
  assert.equal(r1.suspect, true);
  assert.deepEqual(t.writes, [DIR + 'backup-2026-08-02.json']);
  assert.equal(t.deletes.length, 0);
  assert.deepEqual([...t.files.get(DIR + 'latest.json')], [...GOOD]);
  assert.equal(t.api.status().lastGood.keys, 100);
  assert.equal(t.localStorage.getItem('bcc_autobackup_last'), null);
  assert.ok(t.api.status().notice.length > 0);
  // later calendar day, still small: accepted as genuine and becomes the new last good
  t.state.now = '2026-08-03T10:00:00.000Z';
  t.writes.length = 0;
  const r2 = await t.api.now();
  assert.equal(r2.ok, true);
  assert.equal(r2.suspect, undefined);
  assert.ok(t.writes.includes(DIR + 'latest.json'));
  assert.equal(t.api.status().lastGood.keys, 30);
  assert.equal(t.api.status().notice, '');
});

test('S03a-1 acceptSmaller bypasses the suspect step', async () => {
  const t = make({ storage: Object.assign(appKeys(30), { bcc_autobackup_log: lastGood(100, 90000) }) });
  const r = await t.api.now({ acceptSmaller: true });
  assert.equal(r.ok, true);
  assert.ok(t.writes.includes(DIR + 'latest.json'));
  assert.equal(t.api.status().lastGood.keys, 30);
});

test('S03a-1 a small but recovering store on day two is a normal run (no suspect)', async () => {
  const t = make({ storage: Object.assign(appKeys(30), { bcc_autobackup_log: lastGood(100, 90000) }) });
  assert.equal((await t.api.now()).suspect, true);
  Object.entries(appKeys(90)).forEach(([k, v]) => t.localStorage.setItem(k, v));
  t.state.now = '2026-08-03T10:00:00.000Z';
  const r = await t.api.now();
  assert.equal(r.ok, true);
  assert.equal(t.api.status().suspect, null);
});

test('S03a-1 last good and suspect figures survive log trimming and add no storage key', async () => {
  const t = make({ storage: Object.assign(appKeys(30), { bcc_autobackup_log: lastGood(100, 90000) }) });
  assert.equal((await t.api.now()).suspect, true);
  const before = t.api.status();
  assert.equal(before.lastGood.keys, 100);
  assert.equal(before.suspect.keys, 30);
  for (let i = 0; i < 40; i++) assert.equal((await t.api.now()).suspect, true);   // same day: stays suspect, 40 more log rows
  const s = t.api.status();
  assert.ok(s.recent.length <= 30);
  assert.equal(s.lastGood.keys, 100, 'the newest good figures are never trimmed away');
  assert.equal(s.suspect.keys, 30);
  assert.equal(s.suspect.date, '2026-08-02');
  assert.deepEqual([...t.localStorage.values.keys()].filter(k => k.indexOf('bcc_autobackup_') === 0).sort(), ['bcc_autobackup_log']);
});

test('S03a low: a key with an empty name does not block the snapshot', async () => {
  const t = make({ storage: appKeys(25, { '': 'v' }) });
  t.localStorage.key = function (i) { const k = [...this.values.keys()][i]; return k === '' ? null : (k ?? null); };
  const r = await t.api.now();
  assert.equal(r.ok, true);
  assert.equal(decode(t.files.get(DIR + 'latest.json')).localStorage[''], 'v');
});

test('S03a-1 genuine bulk delete (DSR Delete All): two daily runs end with a new good backup', async () => {
  const t = make({ storage: appKeys(60) });
  assert.equal((await t.api.now()).ok, true);                      // day 1: normal, last good = 60 keys
  assert.equal(t.api.status().lastGood.keys, 60);
  for (let i = 0; i < 45; i++) t.localStorage.removeItem('app_key_' + i);   // bulk delete leaves 15 keys
  t.state.now = '2026-08-03T10:00:00.000Z';
  t.writes.length = 0;
  const day2 = await t.api.now();
  assert.equal(day2.suspect, true);
  assert.deepEqual(t.writes, [DIR + 'backup-2026-08-03.json']);
  assert.equal(Object.keys(decode(t.files.get(DIR + 'latest.json')).localStorage).filter(k => k.indexOf('app_key_') === 0).length, 60);
  t.state.now = '2026-08-04T10:00:00.000Z';
  t.writes.length = 0;
  const day3 = await t.api.now();
  assert.equal(day3.ok, true);
  assert.ok(t.writes.includes(DIR + 'latest.json'));
  assert.equal(Object.keys(decode(t.files.get(DIR + 'latest.json')).localStorage).filter(k => k.indexOf('app_key_') === 0).length, 15);
  assert.equal(t.api.status().lastGood.keys, 15);
});

test('U02-F05 PIN hashes and admin flag are not in the backup', async () => {
  const t = make({
    seal: false,
    storage: appKeys(25, { st_v2_admin_pin_hash: 'h', st_v2_admin_mode: '1', saagar_staff_pins_v1: '{}' })
  });
  await t.api.now();
  const body = decode(t.files.get(DIR + 'backup-2026-08-02.json')).localStorage;
  assert.equal('st_v2_admin_pin_hash' in body, false);
  assert.equal('st_v2_admin_mode' in body, false);
  assert.equal('saagar_staff_pins_v1' in body, false);
  assert.equal(Object.keys(body).filter(k => k.indexOf('app_key_') === 0).length, 25);
});

test('size check: a mismatching daily file stops before latest is touched', async () => {
  const t = make({
    storage: appKeys(25),
    files: { [DIR + 'latest.json']: GOOD },
    statSize: () => 5
  });
  const r = await t.api.now();
  assert.equal(r.ok, false);
  assert.deepEqual(t.writes, [DIR + 'backup-2026-08-02.json']);
  assert.deepEqual([...t.files.get(DIR + 'latest.json')], [...GOOD]);
});

test('S03a-3 readLatest skips empty files and falls through to older daily, weekly, monthly', async () => {
  const empty = Buffer.from('{"localStorage":{}}');
  const good = Buffer.from(JSON.stringify({ localStorage: { a: '1' } }));
  const t = make({
    seal: false,
    files: {
      [DIR + 'latest.json']: empty,
      [DIR + 'backup-2026-08-02.json']: empty,
      [DIR + 'backup-2026-08-01.json']: good
    }
  });
  assert.equal(JSON.parse(await t.api.readLatest()).localStorage.a, '1');

  const allEmpty = make({ seal: false, files: { [DIR + 'latest.json']: empty, [DIR + 'backup-2026-08-02.json']: empty } });
  await assert.rejects(allEmpty.api.readLatest(), e => e.code === 'EMPTY_BACKUP');

  const weekly = make({ seal: false, files: { [DIR + 'latest.json']: empty, [DIR + 'weekly-2026-W31.json']: good } });
  assert.equal(JSON.parse(await weekly.api.readLatest()).localStorage.a, '1');
  const monthly = make({ seal: false, files: { [DIR + 'latest.json']: empty, [DIR + 'monthly-2026-07.json']: good } });
  assert.equal(JSON.parse(await monthly.api.readLatest()).localStorage.a, '1');
});

test('S03a-4 build time is recorded in the success log', async () => {
  const t = make({ storage: appKeys(25) });
  await t.api.now();
  assert.equal(typeof t.api.status().recent[0].buildMs, 'number');
});

test('S03a-2 ES5 only and one NATIVE_BATCH_OPS', () => {
  assert.doesNotMatch(source, /=>|\blet\s+\w+\s*[=;]|\bconst\s+\w+\s*=|`/);
  const core = fs.readFileSync(path.join(rootDir, 'www/storage-core.js'), 'utf8');
  assert.equal((core.match(/var NATIVE_BATCH_OPS = 32;/g) || []).length, 1);
  assert.doesNotMatch(core, /removeMany/);
});
