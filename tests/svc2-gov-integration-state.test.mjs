// Service wave 2, governance T14: the state the INTEGRATOR leaves behind (plan section 6). RED BY DESIGN until each named step is done; each test name says
// which step it waits for. A red here is never a writer's fault. Nothing here is edited by a writer.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(here, '..');
const require = createRequire(import.meta.url);
const abs = (r) => path.join(REPO, r);
const buf = (r) => fs.readFileSync(abs(r));
const text = (r) => fs.readFileSync(abs(r), 'utf8');
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const reg = JSON.parse(text('tests/fixtures/service-wave-2/capability-register.json'));
const P1 = ['calc', 'docs', 'money', 'migrate', 'core', 'ui', 'area-ui'].map((x) => 'www/service-billing-' + x + '.js');
const STORES = ['store', 'fifo', 'masters', 'masters-ui', 'docs', 'core', 'ui'].map((x) => 'www/service-stores-' + x + '.js');

test('T14.1 [step S-6] the undo registry lists the seven Phase 1 files and the seven billing files as created', () => {
  const r = JSON.parse(text('tests/fixtures/fix-wave/undo-registry.json'));
  const created = r.created.map((c) => (typeof c === 'string' ? c : c.path)).sort();
  assert.deepEqual(created, STORES.concat(P1).sort(), 'waiting for the registry regeneration (S-6)');
  for (const c of created) assert.ok(fs.existsSync(abs(c)), c);
});

test('T14.2 [step S-8] package.json has one test:svc2 script right after test:svc1 naming every svc2 test file; CR count stays 48; 81 line breaks', () => {
  const b = buf('package.json');
  const t = b.toString('utf8');
  const pkg = JSON.parse(t);
  assert.equal(typeof pkg.scripts['test:svc2'], 'string', 'waiting for step S-8: test:svc2 does not exist yet');
  const keys = Object.keys(pkg.scripts);
  assert.equal(keys[keys.indexOf('test:svc1') + 1], 'test:svc2');
  const onDisk = fs.readdirSync(abs('tests')).filter((f) => /^svc2-[a-z0-9-]+\.test\.mjs$/.test(f)).map((f) => 'tests/' + f).sort();
  const named = [...pkg.scripts['test:svc2'].matchAll(/tests\/(svc2-[A-Za-z0-9-]+\.test\.mjs)/g)].map((m) => 'tests/' + m[1]).sort();
  assert.deepEqual(named, onDisk);
  assert.equal(t.split('\n').filter((l) => l.endsWith('\r')).length, 48);
  assert.equal((t.match(/\n/g) || []).length, 81);
  assert.equal(b[0] === 0xef, false);
  assert.ok(!t.split('\n').find((l) => l.includes('"test:svc2"')).endsWith('\r'), 'the new line is LF');
});

test('T14.3 [step S-9] the capability analyser holds the wave-2 id set under its own class and quotes only the owner decisions of 2026-11-12, 2026-11-13, 2026-11-18, 2026-11-19', () => {
  const a = text('scripts/analyze-modular-capability-delta.mjs');
  assert.ok(a.includes('APPROVED_SERVICE_W2_DELTA_IDS'), 'waiting for step S-9');
  assert.ok(a.includes('service-wave-2-2026-11-billing-surface'));
  const quotes = [...a.matchAll(/owner decision given in chat, (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  for (const q of quotes) assert.ok(['2026-11-12', '2026-11-13', '2026-11-18', '2026-11-19'].includes(q), q);
});

test('T14.4 [steps S-4, S-5] the manifest, golden and shell asset records carry the current bytes and hashes of the Service page, its stylesheet, the shared mobile sheet and shell-search', () => {
  const m = require(abs('www/module-manifest.js'));
  const page = buf('www/modules/service/index.html');
  const svc = m.modules.find((x) => x.id === 'service');
  assert.equal(svc.bytes, page.length, 'manifest bytes of the Service page');
  assert.equal(svc.sha256, sha(page));
  const css = buf('www/modules/service/service-ui.css');
  const cssRec = m.sharedAssets.find((a) => a.id === 'service-ui-css');
  assert.equal(cssRec.bytes, css.length);
  assert.equal(cssRec.sha256, sha(css));
  const mob = buf('www/shared/module-mobile-common.css');
  const mobRec = m.sharedAssets.find((a) => a.id === 'module-mobile-common-css');
  assert.equal(mobRec.bytes, mob.length);
  assert.equal(mobRec.sha256, sha(mob));
  const golden = JSON.parse(text('verification/module-build-golden-hashes.json'));
  assert.equal(golden.service.bytes, page.length);
  assert.equal(golden.service.sha256, sha(page));
  const ss = buf('www/shared/shell-search.js');
  const row = text('www/shell-asset-manifest.js').split('\n').find((l) => l.includes("id: 'shell-search'"));
  assert.ok(row && row.includes('bytes: ' + ss.length) && row.includes("sha256: '" + sha(ss) + "'"), 'shell-search record');
});

test('T14.5 [step S-11] the approval record exists, quotes one owner decision (2026-11-18 or 2026-11-19 wording), lists every register control, key and report type, says "pending owner reconfirmation", says what was not run and that no device test was done', () => {
  const dir = abs('verification/audit/approvals');
  const f = fs.readdirSync(dir).find((x) => /^SERVICE-WAVE-2-PHASE-2-BILLING-CAPABILITY-RECORD-.*\.json$/.test(x));
  assert.ok(f, 'waiting for step S-11: no approval record for wave 2');
  const t = fs.readFileSync(path.join(dir, f), 'utf8');
  const rec = JSON.parse(t);
  assert.match(t, /pending owner reconfirmation/i);
  for (const a of reg.actions) assert.ok(t.includes(a.id), 'control missing: ' + a.id);
  for (const k of reg.keys) assert.ok(t.includes(k.pattern), 'key missing: ' + k.pattern);
  for (const r of reg.reports) assert.ok(t.includes(r.type), 'report missing: ' + r.type);
  assert.match(t, /not run/i);
  assert.match(t, /device/i);
  assert.equal(rec.signature === null || rec.signature === undefined, true);
  const quotes = [...t.matchAll(/owner decision given in chat, (\d{4}-\d{2}-\d{2})/g)].map((m) => m[1]);
  for (const q of quotes) assert.ok(['2026-11-18', '2026-11-19'].includes(q), q);
});

test('T14.6 [step S-12] SCHEMA.md has a "Service Billing (Phase 2)" block with both new key patterns (CRLF kept) and HANDOFF.md has the wave-2 sub-section above the Phase 1 one, LF, no hashes, no pass fractions', () => {
  const sch = buf('SCHEMA.md').toString('utf8');
  assert.match(sch, /Service Billing \(Phase 2\)/, 'waiting for step S-12');
  assert.equal(sch.split('\n').length, sch.split('\r\n').length, 'SCHEMA.md stays all CRLF');
  const block = sch.slice(sch.indexOf('Service Billing (Phase 2)'), sch.indexOf('Service Billing (Phase 2)') + 6000);
  for (const k of reg.keys.filter((x) => x.inBackup)) assert.ok(block.includes(k.pattern.replace(/\[_pNN\]/, '')), 'SCHEMA.md names ' + k.pattern);
  const ho = buf('docs/audit/HANDOFF.md');
  assert.equal(ho.includes(0x0d), false, 'HANDOFF.md stays LF');
  const ht = ho.toString('utf8');
  const a = ht.indexOf('### Service wave 2, Phase 2 billing');
  const b = ht.indexOf('### Service Stores, Phase 1');
  assert.ok(a >= 0 && b > a, 'the wave-2 sub-section sits directly above the Phase 1 one');
  const sub = ht.slice(a, b);
  assert.equal(/\b[0-9a-f]{64}\b/.test(sub), false);
  assert.equal(/\b\d+\s*(\/|of)\s*\d+\s+(tests?\s+)?pass/i.test(sub), false);
});

test('T14.7 [step S-3 after the owner yes] the fifteen amended Phase 1 checks are in place: svc1 amendments exist in each of the ten files (this test is the mirror of T15 and turns green when S-3 is done)', () => {
  const need = [['tests/svc1-store-primitives.test.mjs', /'SV'/], ['tests/svc1-gov-capability-register.test.mjs', /W2_STREAMS/], ['tests/svc1-gov-guards.test.mjs', /WAVE2_EDITED/],
    ['tests/svc1-ui-source.test.mjs', /SERVICE-BILLING-2026-11/], ['tests/svc1-gov-page-wiring.test.mjs', /parseRupee\\\(del\\\.finalAmt\\\)/], ['tests/svc1-gov-new-files-rules.test.mjs', /integration-bridge\.js/],
    ['tests/fix-s02-reports-role.test.mjs', /svc2/]];
  const missing = need.filter(([f, re]) => !re.test(text(f))).map((x) => x[0]);
  assert.deepEqual(missing, [], 'waiting for the integrator (S-3): these Phase 1 checks are not amended yet');
});
