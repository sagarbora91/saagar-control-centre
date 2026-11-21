// Service wave 1, governance T1: byte budget of www/index.html, the G0 frozen table, the module manifest, and the seven-file set.
// Port of P7 T1 (see PLAN-service-wave-1.md sections 2.1, 4, 5). Assertions that need the integrator are in svc1-gov-integration-state.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import {
  REPO, WORKSPACE, SEVEN, FORBIDDEN_NOTE, abs, exists, readBuf, readText, sha256, sizeOf, listFiles, loadJson, fixtureBuf,
  workspaceExists, bytesIssues
} from './lib/svc1-gov-common.mjs';

const require = createRequire(import.meta.url);
const register = loadJson('capability-register.json');
const frozen = loadJson('g0-frozen.json');
const G0 = register.g0Baseline;

const BEFORE = '  service: { exact: ["saagar_wsf_v2","saagar_wsf_settings_v1","saagar_invoice_seq_v1"], prefix: [] },';
const AFTER = '  service: { exact: ["saagar_wsf_v2","saagar_wsf_settings_v1","saagar_invoice_seq_v1"], prefix: ["saagar_svcs_"] },';
const LIMIT = 580636;

// Files in the G0 do-not-touch list that the integrator is allowed to edit (PLAN section 5, step 11). Nothing else.
const INTEGRATOR_MAY_EDIT = Object.freeze(['scripts/analyze-modular-capability-delta.mjs']);
const WAVE2_EDITED = Object.freeze(['www/integration-bridge.js']);

// Second pass (D3): the launch-lock re-check must not hide the Owner PIN keypad while a step-up is waiting (the 8 s backstop
// hid it and the step-up promise never settled, so every later Stores save said "Another save is in progress").
const D3_BEFORE = '    if(__llUnlocked){ llDismiss(); return; }\n    var on=false;';
const D3_AFTER = '    if(__raState)return;if(__llUnlocked){ llDismiss(); return; }\n    var on=false;';

test('T1.1 www/index.html grew by exactly 14 + 20 bytes: the service line of STORAGE_RULES and the D3 step-up guard, nothing else', () => {
  const buf = readBuf('www/index.html');
  assert.equal(G0.indexHtml.bytesAfterPrefixEdit, 579803, 'the prefix edit alone gives 579,803 bytes');
  assert.equal(buf.length, 579803 + 20, 'index.html must be 579,823 bytes');
  assert.ok(buf.length < LIMIT, 'index.html must stay below 580,636');
  assert.equal(buf.includes(0x0d), false, 'index.html must stay LF only');
  assert.equal(buf[0] === 0xef && buf[1] === 0xbb, false, 'no BOM');
  const text = buf.toString('utf8');
  assert.equal(text.split(AFTER).length - 1, 1, 'the new service line occurs exactly once');
  assert.equal(text.split(BEFORE).length - 1, 0, 'the old service line is gone');
  assert.equal(text.split(D3_AFTER).length - 1, 1, 'the D3 guard occurs exactly once');
  assert.equal(text.split(D3_BEFORE).length - 1, 0, 'the unguarded launch-lock line is gone');
  const reverted = text.replace(AFTER, BEFORE).replace(D3_AFTER, D3_BEFORE);
  assert.equal(Buffer.byteLength(reverted, 'utf8'), G0.indexHtml.bytes, 'undoing the one edit gives the G0 size');
  assert.equal(sha256(Buffer.from(reverted, 'utf8')), G0.indexHtml.sha256, 'undoing the one edit gives the exact G0 text');
  assert.equal(text.split('saagar_svcs_').length - 1, 1, 'the prefix literal occurs once in the shell');
});

test('T1.1b D3: a late launch-lock re-check leaves a waiting Owner PIN keypad on screen (and still hides the lock when no step-up waits)', () => {
  const text = readText('www/index.html');
  const fn = (name) => {
    const start = text.indexOf('function ' + name + '(');
    assert.ok(start >= 0, name);
    let depth = 0;
    for (let i = text.indexOf('{', start); i < text.length; i++) {
      if (text[i] === '{') depth++;
      else if (text[i] === '}' && --depth === 0) return text.slice(start, i + 1);
    }
    throw new Error('unclosed ' + name);
  };
  const src = ['llEl', 'llStopTimer', 'llDismiss', 'reEvalLaunchLock'].map(fn).join('\n');
  const run = (raState, unlocked) => {
    const el = { style: { display: 'flex' }, focus() {} };
    const box = {
      __raState: raState, __llUnlocked: unlocked, __llBuf: '', __llTimer: null, ADMIN_PIN_KEY: 'a', PIN_SALT_KEY: 's',
      safeGet: () => null, safeRemove: () => {}, auditLog: () => {}, hasAdminPin: () => true, launchLockEnabled: () => false,
      pinLockRemaining: () => 0, llCountdown: () => {}, clearInterval: () => {},
      document: { getElementById: (id) => (id === 'st-v5-launch-lock' ? el : null), activeElement: null }
    };
    vm.createContext(box);
    vm.runInContext(src + '\nreEvalLaunchLock();', box);
    return el.style.display;
  };
  assert.equal(run({ resolve() {}, attempt: 1 }, false), 'flex', 'lock off: the waiting keypad stays up');
  assert.equal(run({ resolve() {}, attempt: 1 }, true), 'flex', 'already unlocked: the waiting keypad stays up');
  assert.equal(run(null, false), 'none', 'no step-up waiting: the lock overlay is hidden as before');
  assert.equal(run(null, true), 'none', 'no step-up waiting, unlocked: hidden as before');
});

test('T1.2 the G0 frozen table is the tool copy of the G0 record and every file still has its recorded hash', () => {
  assert.equal(typeof frozen.files, 'object');
  assert.equal(frozen.count, Object.keys(frozen.files).length);
  assert.ok(frozen.count >= 600, 'the frozen table lists the 16 www files, 11 module pages, scripts and verification');
  assert.equal(Object.prototype.hasOwnProperty.call(frozen.files, FORBIDDEN_NOTE), false, 'the Phase 5 note is listed by path only, never hashed');
  assert.equal(frozen.phase5NotePath, FORBIDDEN_NOTE);
  for (const k of Object.keys(frozen.files)) {
    assert.equal(/audit-secrets|^E:[\\/]ETP/i.test(k), false, 'forbidden path in the table: ' + k);
    assert.match(frozen.files[k].sha256, /^[0-9a-f]{64}$/, k);
  }
  if (workspaceExists()) {
    const rec = path.join(WORKSPACE, 'g0', 'frozen-g0.json');
    if (fs.existsSync(rec)) {
      assert.equal(sha256(fixtureBuf('g0-frozen.json')), sha256(fs.readFileSync(rec)), 'g0-frozen.json must be a byte copy of g0\\frozen-g0.json');
    }
  }
  const bad = [];
  for (const [rel, rec] of Object.entries(frozen.files)) {
    if (INTEGRATOR_MAY_EDIT.includes(rel) || WAVE2_EDITED.includes(rel)) continue;
    const p = abs(rel);
    if (!fs.existsSync(p)) { bad.push(rel + ' (missing)'); continue; }
    const buf = fs.readFileSync(p);
    if (sha256(buf) !== rec.sha256 || buf.length !== rec.bytes) bad.push(rel);
  }
  assert.deepEqual(bad, [], 'files changed since G0: ' + bad.slice(0, 20).join(', '));
});

test('T1.2b the integrator exemption list is exactly the analyser, and a changed analyser carries the agreed id list name', () => {
  assert.deepEqual([...INTEGRATOR_MAY_EDIT], ['scripts/analyze-modular-capability-delta.mjs']);
  const rec = frozen.files[INTEGRATOR_MAY_EDIT[0]];
  assert.ok(rec, 'the analyser is in the frozen table');
  const buf = readBuf(INTEGRATOR_MAY_EDIT[0]);
  if (sha256(buf) !== rec.sha256) {
    assert.match(buf.toString('utf8'), /APPROVED_SERVICE_W1_DELTA_IDS/, 'an edited analyser must hold the service wave delta id list');
  }
});

test('T1.3 the app-i18n phrase table is untouched (OD-5 on hold)', () => {
  const rec = frozen.files['www/app-i18n.js'];
  assert.ok(rec);
  assert.equal(sha256(readBuf('www/app-i18n.js')), rec.sha256);
  assert.equal(rec.sha256, G0.appI18n.sha256);
});

test('T1.4 module-manifest.js still lists 12 modules and 66 shared assets and none of the seven new files', () => {
  const m = require(abs('www/module-manifest.js'));
  assert.equal(m.modules.length, 12);
  assert.equal(m.sharedAssets.length, 66);
  const text = readText('www/module-manifest.js');
  for (const f of SEVEN) assert.equal(text.includes(path.basename(f.file)), false, f.file + ' must not be in the module manifest');
  assert.equal(text.includes('service-stores-'), false);
});

test('T1.5 the wave adds exactly the seven www files and no other service-stores asset', () => {
  const found = listFiles('www', (r) => /service-stores/i.test(r)).sort();
  const want = SEVEN.map((f) => f.file).sort();
  assert.deepEqual(found, want, 'www must hold exactly the seven agreed service-stores files');
});

test('T1.6 each of the seven files is LF only, has no BOM, and ends with one newline', () => {
  const missing = SEVEN.filter((f) => !exists(f.file)).map((f) => f.file);
  assert.deepEqual(missing, [], 'waiting on writers (files not there yet)');
  const bad = [];
  for (const f of SEVEN) { const issues = bytesIssues(f.file); if (issues.length) bad.push(f.file + ': ' + issues.join(', ')); }
  assert.deepEqual(bad, []);
});

test('T1.7 the service page, its stylesheet and the report files may differ from G0 only in the agreed places', () => {
  // Gov cannot know the exact page hunks (the page group owns them); this pins what must NOT change.
  const css = readText('www/modules/service/service-ui.css');
  assert.equal(css.split('D3-SERVICE-CSS-2026-07-30').length - 1, 1, 'the D3 css marker stays exactly once');
  const g0css = Buffer.from(css, 'utf8');
  assert.equal(g0css.includes(0x0d), false);
  // The stylesheet only grows by an appended block: the G0 text is a prefix of the current text.
  const preWave = path.join(WORKSPACE, 'g0', 'pre-wave-service', 'www', 'modules', 'service', 'service-ui.css');
  if (fs.existsSync(preWave)) {
    const old = fs.readFileSync(preWave, 'utf8');
    assert.ok(css.startsWith(old), 'service-ui.css must only be appended to');
    const tail = css.slice(old.length);
    if (tail.length) {
      assert.match(tail, /^\s*\/\* SERVICE-STORES-2026-11 \*\//, 'the appended block starts with the agreed marker');
      assert.equal(tail.split('SERVICE-STORES-2026-11').length - 1, 1, 'the marker appears once');
    }
  } else {
    assert.equal(sizeOf('www/modules/service/service-ui.css') >= G0.serviceCss.bytes, true, 'the stylesheet cannot shrink');
  }
});
