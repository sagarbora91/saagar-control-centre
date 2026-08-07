import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'www/shared/mah4-runtime.js'), 'utf8');
const shell = fs.readFileSync(path.join(root, 'www/index.html'), 'utf8');
const moduleIds = ['stock','service','qms','dsr','expense','grooming','cro_audit','payroll','leave','tax','planning'];

test('Stage B runtime is one synchronous offline immutable browser global', () => {
  assert.doesNotMatch(source, /\b(?:import|export)\b|https?:\/\//);
  assert.match(source, /Object\.freeze\(\{channel:CHANNEL,version:VERSION,createHost:createHost,bootModule:bootModule\}\)/);
  new vm.Script(source);
});

test('Stage B runtime loads in the shell and all eleven modules', () => {
  assert.equal((shell.match(/shared\/mah4-runtime\.js/g) || []).length, 1);
  assert.doesNotMatch(shell, /id==='planning'/);
  for (const id of moduleIds) {
    const html = fs.readFileSync(path.join(root, `www/modules/${id}/index.html`), 'utf8');
    assert.equal((html.match(/shared\/mah4-runtime\.js/g) || []).length, 1, id);
    assert.match(html, new RegExp(`SaagarMah4Runtime\\.bootModule\\(\\{moduleId:'${id}'\\}\\)`), id);
  }
});

test('Stage B control path is exact-origin, correlated and timeout bounded', () => {
  assert.match(source, /event\.source===source&&event\.origin===origin/);
  assert.match(source, /READY_MS=5000,DISPOSE_MS=1500/);
  assert.match(source, /m\.replyTo===initId/);
  assert.match(source, /m\.replyTo===disposeId/);
  assert.match(source, /crypto\.getRandomValues/);
  assert.doesNotMatch(source, /postMessage\([^\n]*['"]\*['"]\)/);
});

test('Stage B lifecycle cleanup is reverse-order and idempotent', () => {
  assert.match(source, /for\(var i=entries\.length-1;i>=0;i--\)/);
  assert.match(source, /if\(done\)return done/);
  assert.match(source, /root\.clearTimeout/);
  assert.match(source, /root\.clearInterval/);
  assert.match(source, /removeEventListener/);
  assert.match(source, /observer\.disconnect/);
});

test('ST_ERROR follows the Stage A phase and fail-closed policy', () => {
  assert.match(source, /type:'ST_ERROR'/);
  assert.match(source, /state==='INIT_SENT'\?\['load','init','ready'\]/);
  assert.match(source, /state==='READY'\?\['runtime'\]/);
  assert.match(source, /state==='DISPOSING'\?\['dispose'\]/);
  assert.match(source, /state==='INIT_SENT'\|\|!m\.payload\.recoverable/);
  assert.match(source, /module-error:/);
});

test('production deadlines are fixed while deterministic test clocks are injectable', () => {
  assert.match(source, /READY_MS=5000,DISPOSE_MS=1500/);
  assert.match(source, /scheduler=config\.scheduler\|\|root/);
  assert.match(source, /scheduler\.setTimeout/);
  assert.match(source, /scheduler\.clearTimeout/);
});

test('API-23-compatible classic runtime executes CSPRNG identities and exact deadlines', () => {
  const attrs = new Map();
  const sandbox = {
    Uint8Array,
    Object,
    Array,
    Error,
    crypto: { getRandomValues(bytes) { for (let index = 0; index < bytes.length; index += 1) bytes[index] = index + 1; return bytes; } },
    location: { origin: 'http://127.0.0.1:8766' },
    document: { documentElement: { setAttribute(name, value) { attrs.set(name, value); } } },
    addEventListener() {}, clearTimeout() {}, clearInterval() {}
  };
  sandbox.window = sandbox;
  sandbox.parent = sandbox;
  vm.runInNewContext(source, sandbox);
  const jobs = [];
  const scheduler = { setTimeout(fn, ms) { const job = { fn, ms }; jobs.push(job); return job; }, clearTimeout() {} };
  const sent = [];
  const frame = { contentWindow: { postMessage(message, origin) { sent.push({ message, origin }); } } };
  let closed;
  const host = sandbox.SaagarMah4Runtime.createHost({ moduleId: 'planning', frame, scheduler, onClosed(result) { closed = result; } });
  assert.match(host.instanceId, /^instance\.[a-f0-9]{32}$/);
  host.loaded({ language: 'en', date: '2026-08-07', uiMode: 'mobile' });
  assert.equal(jobs[0].ms, 5000);
  jobs[0].fn();
  assert.equal(closed.code, 'ready-timeout');
  assert.equal(attrs.get('data-mah4-host'), 'FORCED_CLOSED:planning:ready-timeout');
  assert.equal(sent[0].origin, 'http://127.0.0.1:8766');
});

test('audit runtime is correlated metadata-only and raw legacy transport is retired', () => {
  assert.match(source, /type:'ST_AUDIT'/);
  assert.match(source, /storageKeyHash:hash/);
  assert.doesNotMatch(source, /before:before|after:after|detail:\{module/);
  assert.doesNotMatch(shell, /e\.data\.type === 'ST_AUDIT'/);
  const sqlite = fs.readFileSync(path.join(root, 'www/sqlite-store.js'), 'utf8');
  assert.doesNotMatch(sqlite, /e\.data\.type !== 'ST_AUDIT'|e\.data\.after|detail\.key/);
  for (const id of moduleIds) {
    const html = fs.readFileSync(path.join(root, `www/modules/${id}/index.html`), 'utf8');
    assert.doesNotMatch(html, /type:'ST_AUDIT'.*before:before|detail:\{module:.*key:key/, id);
  }
});

test('metadata audit hashes repeated storage keys with canonical SHA-256 and queues before INIT', async () => {
  const posted = [];
  let messageListener;
  const parentWindow = { postMessage(message, origin) { posted.push({ message, origin }); } };
  const sandbox = {
    Uint8Array, Object, Array, Error, Math, Number, String, encodeURIComponent, unescape,
    crypto: { getRandomValues(bytes) { bytes.fill(7); return bytes; }, subtle: crypto.webcrypto.subtle },
    location: { origin: 'https://localhost' }, parent: parentWindow,
    document: { documentElement: { setAttribute() {} } },
    addEventListener(type, listener) { if (type === 'message') messageListener = listener; },
    clearTimeout() {}, clearInterval() {}
  };
  sandbox.window = sandbox;
  vm.runInNewContext(source, sandbox);
  const moduleRuntime = sandbox.SaagarMah4Runtime.bootModule({ moduleId: 'planning' });
  const firstAudit = moduleRuntime.audit('module.storage.set', 'customer-key', null, 'value');
  const secondAudit = moduleRuntime.audit('module.storage.remove', 'second-key', 'value', null);
  assert.equal(posted.length, 0);
  messageListener({ source: parentWindow, origin: 'https://localhost', data: {
    type: 'ST_INIT', channel: 'saagar.module', version: 1, moduleId: 'planning',
    instanceId: 'instance.0123456789abcdef0123456789abcdef', messageId: 'init.0123456789abcdef0123456789abcdef',
    payload: { language: 'en', date: '2026-08-07', uiMode: 'mobile', capabilities: ['lifecycle-v1'] }
  } });
  await Promise.all([firstAudit, secondAudit]);
  const audits = posted.filter(item => item.message.type === 'ST_AUDIT').map(item => item.message.payload);
  assert.equal(audits.length, 2);
  assert.equal(audits[0].storageKeyHash, crypto.createHash('sha256').update('customer-key').digest('hex'));
  assert.equal(audits[1].storageKeyHash, crypto.createHash('sha256').update('second-key').digest('hex'));
  assert.deepEqual(Object.keys(audits[0]).sort(), ['action','afterBytes','beforeBytes','storageKeyHash']);
});
