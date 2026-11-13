// Service wave 1, governance: checks that can only be true AFTER the integrator has done steps 3 to 15 of PLAN section 5.
// Run this file at integration steps 7, 9, 14, 15 and 16, NOT at step 4 (the writer-rule tests). Every test here is red by design until then:
//   registry `created` list (step 7), the test:svc1 script (step 9), the analyser delta ids (step 11), identities (steps 5 and 6),
//   the approval record (step 14), SCHEMA.md and HANDOFF.md (step 15).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { REPO, WORKSPACE, SEVEN, abs, exists, readBuf, readText, sha256, workspaceExists, loadJson, listFiles } from './lib/svc1-gov-common.mjs';

const require = createRequire(import.meta.url);
const reg = loadJson('capability-register.json');
const QUOTE_OK = new Set(['owner decision given in chat, 2026-11-12', 'owner decision given in chat, 2026-11-13']);
const APPROVAL = 'verification/audit/approvals/SERVICE-WAVE-1-PHASE-1-STORES-CAPABILITY-RECORD-2026-11-13.json';

function quotesIn(text) { return [...text.matchAll(/owner decision given in chat, \d{4}-\d{2}-\d{2}/g)].map((m) => m[0]); }

test('I1 [step 7] the fix-wave undo registry lists exactly the seven new www files as created, keeps its freeze, and each exists', () => {
  const r = JSON.parse(readText('tests/fixtures/fix-wave/undo-registry.json'));
  const created = r.created.map((c) => (typeof c === 'string' ? c : c.path)).sort();
  assert.deepEqual(created, SEVEN.map((f) => f.file).sort());
  for (const c of created) assert.ok(exists(c), c);
  assert.deepEqual(r.preWaveFreeze, { fileCount: 172, totalBytes: 8684924, treeSha256: '1b60b5f1392951f30450a3f77493f8e7b37a62d61c8b2e2d227cfa5759c2450b' });
  assert.deepEqual(r.ownerApprovedAuditAnchorChanges, ['www/storage-core.js'], 'the fix-wave owner approved anchor change is kept');
  if (workspaceExists()) {
    const g0 = path.join(WORKSPACE, 'g0', 'pre-wave-service', 'tests', 'fixtures', 'fix-wave', 'undo-registry.json');
    if (fs.existsSync(g0)) {
      const old = JSON.parse(fs.readFileSync(g0, 'utf8'));
      assert.deepEqual(r.preWaveFreeze, old.preWaveFreeze);
      for (const k of Object.keys(old.files)) assert.ok(Object.prototype.hasOwnProperty.call(r.files, k), 'fix-wave file entry kept: ' + k);
    }
  }
});

test('I2 [step 9] package.json has one test:svc1 script right after test:fix-wave, naming every tests/svc1-*.test.mjs; CR count unchanged', () => {
  const buf = readBuf('package.json');
  const text = buf.toString('utf8');
  const pkg = JSON.parse(text);
  assert.equal(typeof pkg.scripts['test:svc1'], 'string', 'test:svc1 exists');
  const keys = Object.keys(pkg.scripts);
  assert.equal(keys[keys.indexOf('test:fix-wave') + 1], 'test:svc1', 'test:svc1 sits right after test:fix-wave');
  const onDisk = listFiles('tests', (r) => /^tests\/svc1-[^/]+\.test\.mjs$/.test(r)).map((r) => r.replace(/^tests\//, 'tests/')).sort();
  const named = [...pkg.scripts['test:svc1'].matchAll(/tests\/(svc1-[A-Za-z0-9-]+\.test\.mjs)/g)].map((m) => 'tests/' + m[1]).sort();
  assert.deepEqual(named, onDisk, 'every svc1 test file is named in the script and the script names nothing else');
  assert.equal(new Set(named).size, named.length);
  for (const g of ['guards', 'new-files-rules', 'page-wiring', 'capability-register', 'stepup-source', 'role-matrix', 'no-customer-data', 'backup-inclusion', 'phrases', 'mah4-assets', 'integration-state']) {
    assert.ok(named.includes(`tests/svc1-gov-${g}.test.mjs`), 'gov file in the script: ' + g);
  }
  const crLines = text.split('\n').filter((l) => l.endsWith('\r')).length;
  assert.equal(crLines, 48, 'the CRLF line count of package.json is unchanged (48)');
  const svcLine = text.split('\n').find((l) => l.includes('"test:svc1"'));
  assert.ok(svcLine && !svcLine.endsWith('\r'), 'the new script line is LF');
  assert.equal(buf[0] === 0xef, false, 'no BOM');
  assert.equal((text.match(/\n/g) || []).length, 80, 'one line added to the 79 line breaks of G0');
});

test('I3 [step 11] the capability analyser holds the service wave delta ids under the agreed class and its reasons quote only the two allowed owner decisions', () => {
  const t = readText('scripts/analyze-modular-capability-delta.mjs');
  assert.match(t, /APPROVED_SERVICE_W1_DELTA_IDS/);
  assert.match(t, /service-wave-1-2026-11-stores-surface/);
  assert.deepEqual(quotesIn(t).filter((q) => !QUOTE_OK.has(q)), [], 'only the two allowed quotes');
  // failure-posture ids carry no hash suffix ('<surface>:failure:posture'); other ids end in a 20-hex hash
  const ids = [...new Set([...t.matchAll(/script-service-stores-[a-z-]+:(?:failure:posture|[a-z]+:[0-9a-f]{20})/g)].map((m) => m[0]))];
  assert.equal(ids.length, 8, '7 failure rows and 1 persisted row');
  const surfaces = new Set(ids.map((i) => i.split(':')[0]));
  for (const s of surfaces) assert.ok(SEVEN.some((f) => 'script-' + path.basename(f.file, '.js') === s), s + ' is one of the seven files');
  const failure = ids.filter((i) => i.endsWith(':failure:posture')).map((i) => i.split(':')[0]).sort();
  assert.deepEqual(failure, SEVEN.map((f) => 'script-' + path.basename(f.file, '.js')).sort(), 'one failure-posture row per new file');
  const persisted = ids.filter((i) => i.split(':')[1] === 'persist');
  assert.equal(persisted.length, 1, 'exactly one persisted-outcome row: the store adapter');
  assert.equal(persisted[0].split(':')[0], 'script-service-stores-store');
});

test('I4 [steps 5, 6] the manifest, golden and shell asset records carry the current bytes and hashes of the Service page, its stylesheet and shell-search', () => {
  const m = require(abs('www/module-manifest.js'));
  const svc = m.modules.find((x) => x.id === 'service');
  const page = readBuf('www/modules/service/index.html');
  assert.equal(svc.bytes, page.length);
  assert.equal(svc.sha256, sha256(page));
  const css = readBuf('www/modules/service/service-ui.css');
  const cssRec = m.sharedAssets.find((a) => a.id === 'service-ui-css');
  assert.equal(cssRec.bytes, css.length);
  assert.equal(cssRec.sha256, sha256(css));
  const golden = JSON.parse(readText('verification/module-build-golden-hashes.json'));
  assert.equal(golden.service.bytes, page.length);
  assert.equal(golden.service.sha256, sha256(page));
  const sh = readText('www/shell-asset-manifest.js');
  const ss = readBuf('www/shared/shell-search.js');
  const row = sh.split('\n').find((l) => l.includes("id: 'shell-search'"));
  assert.ok(row && row.includes(`bytes: ${ss.length}`) && row.includes(`sha256: '${sha256(ss)}'`), 'shell-search record in shell-asset-manifest.js');
});

test('I5 [step 14] the approval record exists, quotes only the two allowed decisions, lists every register control, and says plainly what was not run', () => {
  assert.ok(exists(APPROVAL), 'approval record: ' + APPROVAL);
  const text = readText(APPROVAL);
  const rec = JSON.parse(text);
  assert.deepEqual(quotesIn(text).filter((q) => !QUOTE_OK.has(q)), []);
  assert.ok(quotesIn(text).length >= 1);
  assert.match(text, /pending owner reconfirmation/i);
  for (const a of reg.actions) assert.ok(text.includes(a.id), 'control missing from the approval record: ' + a.id);
  for (const k of reg.keys) assert.ok(text.includes(k.pattern), 'key missing from the approval record: ' + k.pattern);
  for (const r of reg.reports) assert.ok(text.includes(r.type), 'report missing: ' + r.type);
  assert.match(text, /not run/i, 'says plainly what was not run');
  assert.match(text, /device/i, 'says plainly that no device test was done');
  assert.equal(rec.signature === null || rec.signature === undefined, true, 'a transcription of chat decisions carries no signature');
  assert.equal(/\bsigned\b/i.test(JSON.stringify(rec.state || '')), false);
});

test('I6 [step 15] SCHEMA.md has a Service Stores (Phase 1) block with every key pattern (CRLF kept); HANDOFF.md has a short LF sub-section without hashes', () => {
  const sch = readBuf('SCHEMA.md').toString('utf8');
  assert.match(sch, /Service Stores \(Phase 1\)/);
  assert.equal(sch.split('\n').length, sch.split('\r\n').length, 'SCHEMA.md stays all CRLF');
  const i = sch.indexOf('Service Stores (Phase 1)');
  const block = sch.slice(i, i + 6000);
  for (const k of reg.keys.filter((x) => x.inBackup)) assert.ok(block.includes(k.pattern.replace(/\[_pNN\]/, '')), 'SCHEMA.md names ' + k.pattern);
  assert.ok(block.includes('st_v2_svcs_watermark_v1'), 'the device-local watermark is described');
  const ho = readBuf('docs/audit/HANDOFF.md');
  assert.equal(ho.includes(0x0d), false, 'HANDOFF.md stays LF');
  const ht = ho.toString('utf8');
  const j = ht.indexOf('Service Stores');
  assert.ok(j >= 0, 'HANDOFF.md has a Service Stores sub-section');
  const sub = ht.slice(j, j + 3000);
  assert.equal(/\b[0-9a-f]{64}\b/.test(sub), false, 'no hashes in the sub-section');
  assert.equal(/\b\d+\s*\/\s*\d+\s+(tests?\s+)?pass/i.test(sub), false, 'no fraction pass counts in the sub-section');
});

test('I7 [step 3] the group phrase fragments are merged into PHRASES.json (unique, sorted, English only)', { skip: workspaceExists() ? false : 'workspace folder not found' }, () => {
  const l10n = path.join(WORKSPACE, 'l10n');
  const merged = JSON.parse(fs.readFileSync(path.join(l10n, 'PHRASES.json'), 'utf8')).rows.map((r) => r[0]);
  const set = new Set(merged);
  assert.equal(set.size, merged.length);
  for (const f of fs.readdirSync(l10n).filter((x) => /^PHRASES-.+\.json$/.test(x))) {
    for (const r of JSON.parse(fs.readFileSync(path.join(l10n, f), 'utf8')).rows) assert.ok(set.has(r[0]), `${f}: "${r[0]}" is not in PHRASES.json`);
  }
  assert.deepEqual([...merged].sort(), merged, 'sorted by the integrator');
});

test('I8 [step 17] nothing outside the allowed paths changed: new files only under www (the seven), tests/svc1-*, tests/lib/svc1-*, tests/fixtures/service-wave-1', () => {
  const snap = workspaceExists() ? path.join(WORKSPACE, 'g0', 'snapshot-full.json') : '';
  if (!snap || !fs.existsSync(snap)) return;
  const base = JSON.parse(fs.readFileSync(snap, 'utf8'));
  const files = base.files || base;
  const known = new Set(Array.isArray(files) ? files.map((f) => f.path) : Object.keys(files));
  const added = [];
  for (const top of ['www', 'tests', 'scripts', 'verification', 'config', 'docs']) {
    if (!fs.existsSync(path.join(REPO, top))) continue;
    for (const rel of listFiles(top)) if (!known.has(rel)) added.push(rel);
  }
  const allowed = [/^www\/service-stores-[a-z-]+\.js$/, /^tests\/svc1-[a-z0-9-]+\.test\.mjs$/, /^tests\/lib\/svc1-[a-z0-9-]+\.mjs$/, /^tests\/fixtures\/service-wave-1\//,
    /^verification\/audit\/approvals\/SERVICE-WAVE-1-/];
  const stray = added.filter((r) => !allowed.some((re) => re.test(r)) && !/PHASE-5-FIREBASE-API23|AGENTS\.md|CLAUDE\.md|\.tmp-etp/.test(r));
  assert.deepEqual(stray, [], 'files added outside the agreed paths');
});
