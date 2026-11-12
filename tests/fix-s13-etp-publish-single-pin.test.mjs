// U13-017 (new file): a signed-in Owner types the PIN once to publish. The runtime's authorizePublication
// stays the single authoritative gate; a Store Manager still goes through the gateway keypad first.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const www = path.join(here, '..', 'www');
const gatewaySource = fs.readFileSync(path.join(www, 'etp-module-gateway.js'), 'utf8');

function loadAuthorization() {
  const a = gatewaySource.indexOf('function browserAuthorization(rootValue) {');
  const b = gatewaySource.indexOf('function bootstrap() {', a);
  assert.ok(a > 0 && b > a);
  const record = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  return new Function('record', gatewaySource.slice(a, b) + '; return browserAuthorization;')(record);
}

function rootWith(snapshot, calls, answer = true) {
  return {
    SaagarOwnerSession: { read: () => snapshot },
    SaagarReauth: (reason) => { calls.push(reason); return Promise.resolve(answer); },
    roleCanOpen: () => true
  };
}

test('Owner CONFIRM is admitted without a second keypad; IMPORT and READ unchanged', async () => {
  const authorize = loadAuthorization()(null);
  const calls = [];
  const ownerRoot = rootWith({ version: 1, isOwner: true, role: 'Owner' }, calls);
  const auth = loadAuthorization()(ownerRoot);
  assert.equal(auth('CONFIRM'), true);
  assert.equal(auth('IMPORT'), true);
  assert.equal(auth('READ'), true);
  assert.equal(calls.length, 0, 'no PIN prompt from the gateway for the Owner');
  assert.equal(authorize('CONFIRM'), false);
});

test('Store Manager CONFIRM still asks for the Owner PIN once', async () => {
  const calls = [];
  const sm = rootWith({ version: 1, isOwner: false, role: 'Store Manager' }, calls, true);
  const auth = loadAuthorization()(sm);
  assert.equal(await auth('CONFIRM'), true);
  assert.equal(calls.length, 1);
  assert.match(calls[0], /publish verified Retail ETP reports/);
  const denied = loadAuthorization()(rootWith({ version: 1, isOwner: false, role: 'Store Manager' }, [], false));
  assert.equal(await denied('CONFIRM'), false);
  assert.equal(loadAuthorization()(rootWith({ version: 1, isOwner: false, role: 'CRO' }, [], true))('READ'), false);
  assert.equal(loadAuthorization()(rootWith({ version: 1, isOwner: false, role: 'Store Manager' }, [], true))('PUBLISH'), false);
});

test('the runtime publication PIN is still required on every confirm path', () => {
  const runtime = fs.readFileSync(path.join(www, 'etp-import-runtime.js'), 'utf8');
  const coordinator = fs.readFileSync(path.join(www, 'etp-import-coordinator.js'), 'utf8');
  assert.match(runtime, /authorizePublication:\s*async function/);
  assert.ok(runtime.includes("SaagarReauth('Publish verified Retail ETP reports')"));
  const calls = coordinator.split('authorizePublication').length - 1;
  assert.ok(calls >= 2, 'coordinator checks authorizePublication in run and confirm');
  assert.match(gatewaySource, /\(action === 'IMPORT' \|\| action === 'CONFIRM'\) && snapshot\.isOwner === true/);
});
