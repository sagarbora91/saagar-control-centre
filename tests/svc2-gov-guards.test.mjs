// Service wave 2, governance T1: byte budget of www/index.html, the wave-2 G0 frozen table, the module manifest, and the seven-file set.
// Port of P7 T1 (PLAN-service-wave-2.md 2.1, 4, 5; PLAN-AMENDMENTS). Checks that need the integrator are in svc2-gov-integration-state.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import {
  WORKSPACE, PHASE1, BILLING, FORBIDDEN_NOTE, abs, exists, readBuf, readText, sha256, listFiles, loadJson, fixtureBuf, phase1Buf,
  workspaceExists, bytesIssues, gitChangedSinceG0, g0Buffer
} from './lib/svc2-gov-common.mjs';

const require = createRequire(import.meta.url);
const frozen = loadJson('g0-frozen.json');
const G0 = loadJson('g0-baseline.json');
const LIMIT = 580636;

// Files in the wave-2 frozen table that a later step may edit (PLAN section 4 T1(b), section 6 step S-9). Nothing else.
// The Expense page is NOT here: the default of owner question 3 is the marker row, so no Expense edit (plan 2.19).
const INTEGRATOR_MAY_EDIT = Object.freeze(['scripts/analyze-modular-capability-delta.mjs']);

test('T1.1 www/index.html is unchanged: 579,823 bytes, the G0 sha, LF only, no BOM, strictly below 580,636', () => {
  const buf = readBuf('www/index.html');
  assert.equal(G0.indexHtml.bytes, 579823);
  assert.equal(buf.length, 579823, 'index.html must stay exactly 579,823 bytes (no shell edit in wave 2)');
  assert.ok(buf.length < LIMIT);
  assert.equal(sha256(buf), G0.indexHtml.sha256);
  assert.equal(sha256(buf), 'fb5377aefbae7c54a7bb520cdf04cebacbc3a586f78c65a25d3d21bb8119a444');
  assert.equal(buf.includes(0x0d), false, 'LF only');
  assert.equal(buf[0] === 0xef && buf[1] === 0xbb, false, 'no BOM');
  const text = buf.toString('utf8');
  assert.equal(text.split('saagar_svcs_').length - 1, 1, 'the prefix literal occurs once in the shell (Phase 1 line)');
  assert.equal(text.includes('service-billing'), false, 'the shell never names a billing file');
});

test('T1.2 the wave-2 frozen table is the tool copy of the workspace record and every file still has its recorded hash', () => {
  assert.equal(typeof frozen.files, 'object');
  assert.equal(frozen.count, Object.keys(frozen.files).length);
  assert.equal(frozen.count, 766);
  assert.equal(Object.prototype.hasOwnProperty.call(frozen.files, FORBIDDEN_NOTE), false, 'the Phase 5 note is listed by path only, never hashed');
  assert.equal(frozen.phase5NotePath, FORBIDDEN_NOTE);
  for (const k of Object.keys(frozen.files)) {
    assert.equal(/audit-secrets|^E:[\\/]ETP/i.test(k), false, 'forbidden path in the table: ' + k);
    assert.match(frozen.files[k].sha256, /^[0-9a-f]{64}$/, k);
  }
  if (workspaceExists()) {
    const rec = path.join(WORKSPACE, 'g0', 'frozen-g0.json');
    if (fs.existsSync(rec)) assert.equal(sha256(fixtureBuf('g0-frozen.json')), sha256(fs.readFileSync(rec)), 'g0-frozen.json must be a byte copy of g0\\frozen-g0.json');
  }
  const bad = [];
  for (const [rel, rec] of Object.entries(frozen.files)) {
    if (INTEGRATOR_MAY_EDIT.includes(rel)) continue;
    const p = abs(rel);
    if (!fs.existsSync(p)) { bad.push(rel + ' (missing)'); continue; }
    const buf = fs.readFileSync(p);
    if (sha256(buf) !== rec.sha256 || buf.length !== rec.bytes) bad.push(rel);
  }
  assert.deepEqual(bad, [], 'files changed since G0: ' + bad.slice(0, 20).join(', '));
});

test('T1.2b the exemption list is exactly the analyser; a changed analyser holds the wave-2 id list name; the Expense page is NOT exempt', () => {
  assert.deepEqual([...INTEGRATOR_MAY_EDIT], ['scripts/analyze-modular-capability-delta.mjs']);
  const rec = frozen.files[INTEGRATOR_MAY_EDIT[0]];
  assert.ok(rec, 'the analyser is in the frozen table');
  const buf = readBuf(INTEGRATOR_MAY_EDIT[0]);
  if (sha256(buf) !== rec.sha256) assert.match(buf.toString('utf8'), /APPROVED_SERVICE_W2_DELTA_IDS/, 'an edited analyser must hold the wave-2 delta id list');
  const expense = frozen.files['www/modules/expense/index.html'];
  assert.ok(expense, 'the Expense page is frozen');
  assert.equal(expense.bytes, G0.expensePage.bytes);
  assert.equal(sha256(readBuf('www/modules/expense/index.html')), expense.sha256, 'the Expense page is unchanged (owner question 3 default: marker row, no Expense edit)');
  assert.equal(readBuf('www/modules/expense/index.html').length, 177168);
});

test('T1.2c the files the plan lets writers edit are NOT in the frozen table, and the table does not list any file twice or outside www, scripts, verification', () => {
  const editable = new Set(frozen.editableNotFrozen);
  for (const must of ['www/modules/service/index.html', 'www/modules/service/service-ui.css', 'www/service-stores-store.js', 'www/service-stores-docs.js', 'www/service-stores-core.js', 'www/service-stores-ui.js',
    'www/saagar-report.js', 'www/shared/shell-search.js', 'www/integration-bridge.js', 'www/shared/module-mobile-common.css']) assert.ok(editable.has(must), must + ' is editable');
  for (const e of editable) assert.equal(Object.prototype.hasOwnProperty.call(frozen.files, e), false, e + ' must not be in the frozen table');
  for (const k of Object.keys(frozen.files)) assert.match(k, /^(www|scripts|verification)\//, k);
  for (const mustFrozen of ['www/index.html', 'www/app-i18n.js', 'www/storage-core.js', 'www/demo-seed.js', 'www/modules/expense/index.html', 'scripts/analyze-modular-capability-delta.mjs']) {
    assert.ok(frozen.files[mustFrozen], mustFrozen + ' is frozen');
  }
});

// Plan 2.19 names the existing files a writer may edit, and section 6 lets the integrator move the two manifests. The G0 record also lists three
// Phase 1 files as not frozen that nobody may edit in this wave; they are held here to their pre-wave bytes (A-GOV audit 2026-11-19).
const PLAN_EDITABLE = Object.freeze(['www/modules/service/index.html', 'www/modules/service/service-ui.css', 'www/service-stores-store.js', 'www/service-stores-docs.js',
  'www/service-stores-core.js', 'www/service-stores-ui.js', 'www/saagar-report.js', 'www/shared/shell-search.js', 'www/integration-bridge.js',
  'www/shared/module-mobile-common.css', 'www/module-manifest.js', 'www/shell-asset-manifest.js']);
test('T1.2d every file the G0 record leaves unfrozen but the plan lets nobody edit is byte-identical to its pre-wave copy', () => {
  const extra = frozen.editableNotFrozen.filter((f) => !PLAN_EDITABLE.includes(f)).sort();
  assert.deepEqual(extra, ['www/service-stores-fifo.js', 'www/service-stores-masters-ui.js', 'www/service-stores-masters.js']);
  for (const f of extra) {
    const pre = g0Buffer(f);
    assert.ok(pre, 'the pre-wave copy of ' + f + ' is readable');
    assert.equal(sha256(readBuf(f)), sha256(pre), f + ' changed, but plan 2.19 gives it to nobody');
  }
  for (const f of PLAN_EDITABLE) assert.ok(frozen.editableNotFrozen.includes(f), f + ' is editable in the G0 record');
});

test('T1.3 app-i18n.js, storage-core.js, the five mutation anchors and capture-mutations.mjs are untouched', () => {
  const names = ['www/app-i18n.js', 'www/storage-core.js', 'www/etp-reconciliation-policy.js', 'www/reauth-policy.js', 'www/portable-backup.js', 'www/export-control.js', 'scripts/audit/capture-mutations.mjs'];
  for (const rel of names) {
    const rec = frozen.files[rel];
    assert.ok(rec, rel + ' is in the frozen table');
    assert.equal(sha256(readBuf(rel)), rec.sha256, rel);
  }
  assert.equal(frozen.files['www/app-i18n.js'].sha256, G0.appI18n.sha256);
});

test('T1.4 the Phase 1 fixtures are not regenerated: the Phase 1 register and the Phase 1 frozen table keep their G0 sha', () => {
  assert.equal(sha256(phase1Buf('capability-register.json')), G0.phase1Fixtures.capabilityRegisterSha256);
  assert.equal(sha256(phase1Buf('g0-frozen.json')), G0.phase1Fixtures.g0FrozenSha256);
  // the plan quotes 'e5fe036c...' for the register; the file at G0 hashes differently, so the pin is the tool-measured sha above
  const moved = gitChangedSinceG0(['tests/fixtures/service-wave-1']);
  if (moved !== null) assert.deepEqual(moved, [], 'no Phase 1 fixture differs from the G0 commit');
});

test('T1.5 module-manifest.js still lists 12 modules and 66 shared assets and none of the 14 Service files', () => {
  const m = require(abs('www/module-manifest.js'));
  assert.equal(m.modules.length, 12);
  assert.equal(m.sharedAssets.length, 66);
  const text = readText('www/module-manifest.js');
  for (const f of PHASE1.concat(BILLING)) assert.equal(text.includes(path.basename(f.file)), false, f.file + ' must not be in the module manifest');
  assert.equal(text.includes('service-billing'), false);
  assert.equal(text.includes('service-stores-'), false);
  assert.equal(readText('www/shell-asset-manifest.js').includes('service-billing'), false);
});

test('T1.6 www holds exactly the seven service-stores files and exactly the seven service-billing files, and no other new file', () => {
  assert.deepEqual(listFiles('www', (r) => /service-stores/i.test(r)).sort(), PHASE1.map((f) => f.file).sort(), 'no extra service-stores asset');
  const found = listFiles('www', (r) => /service-billing/i.test(r)).sort();
  assert.deepEqual(found, BILLING.map((f) => f.file).sort(), 'www must hold exactly the seven agreed service-billing files (waiting on writers when one is missing)');
  const known = new Set(Object.keys(frozen.files).concat(frozen.editableNotFrozen, BILLING.map((f) => f.file)));
  const stray = listFiles('www').filter((r) => !known.has(r));
  assert.deepEqual(stray, [], 'files in www that are neither frozen, nor editable, nor one of the seven billing files');
});

test('T1.7 each of the seven billing files is LF only, has no BOM, no tab, ASCII only and ends with one newline', () => {
  const missing = BILLING.filter((f) => !exists(f.file)).map((f) => f.file);
  assert.deepEqual(missing, [], 'waiting on writers (files not there yet)');
  const bad = [];
  for (const f of BILLING) {
    const issues = bytesIssues(f.file);
    const buf = readBuf(f.file);
    if (buf.some((b) => b > 0x7f)) issues.push('non-ASCII byte');
    if (buf.includes(0x09)) issues.push('tab');
    if (issues.length) bad.push(f.file + ': ' + issues.join(', '));
  }
  assert.deepEqual(bad, []);
});

test('T1.8 the Service stylesheet and the shared mobile sheet only grow by appended blocks; the Service sheet block has its own marker', () => {
  const css = readText('www/modules/service/service-ui.css');
  assert.equal(css.split('D3-SERVICE-CSS-2026-07-30').length - 1, 1, 'the D3 css marker stays exactly once');
  assert.equal(readBuf('www/modules/service/service-ui.css').includes(0x0d), false);
  const g0 = G0.serviceCss;
  const buf = readBuf('www/modules/service/service-ui.css');
  assert.ok(buf.length >= g0.bytes, 'the stylesheet cannot shrink');
  assert.equal(sha256(buf.subarray(0, g0.bytes)), g0.sha256, 'the G0 bytes are an exact prefix (append only)');
  const tail = buf.subarray(g0.bytes).toString('utf8');
  assert.equal(css.split('/* SERVICE-STORES-2026-11 */').length - 1, 1, 'the Phase 1 marker (already in G0) appears once in the whole sheet');
  assert.equal(tail.includes('SERVICE-STORES-2026-11'), false, 'the appended text never repeats the Phase 1 marker');
  if (tail.length) assert.equal(/^\s*\/\* SERVICE-BILLING-2026-11 \*\//.test(tail), true, 'the appended block starts with the Phase 2 marker');
  assert.ok(tail.split('/* SERVICE-BILLING-2026-11 */').length - 1 <= 1, 'the Phase 2 marker appears at most once');
  const m = readBuf('www/shared/module-mobile-common.css');
  assert.ok(m.length >= G0.mobileSheet.bytes);
  assert.equal(sha256(m.subarray(0, G0.mobileSheet.bytes)), G0.mobileSheet.sha256, 'the shared sheet G0 bytes are an exact prefix');
});
