import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run } from '../scripts/audit/audits/a3.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(new URL('../www/modules/service/index.html', import.meta.url), 'utf8');
const staticMarkup = html.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '');
const originalActions = new Set(['watch-photo-camera','watch-photo-upload','watch-photo-after-camera','watch-photo-after-upload']);
const expected = [
  'a1','a2','a3','a4','add-follow-up','add-line','back','btn-back-dash','btn-exp-closed','btn-exp-open','btn-export-csv',
  'cancel-a9e64f4c9d','cancel-aadf0c90d2','cancel-c9f1a87e38','close-3e40663b41','close-7dc14e8101','confirm-change',
  'dn1','dn10','dn100','dn2','dn20','dn200','dn2000','dn5','dn50','dn500','f-adv','f-advpaid','f-an','f-cm','f-cn','f-dr','f-fa','f-gst','f-oc','f-pr-brand','f-pr-txt','f-rb','f-st','f-tn','f-wb','f-wm',
  'grd-51545d0b9c','grd-66e051f54c','grd-cb4b3bd3e9','grd-e7b7abb167','grd-f88467462a','gst-tax-invoice-service-non-franchise-only',
  'input-1809abffd8322b','input-30f40f7ee5a0dc','input-32822de32cc548','input-36b8fedf362878','input-766563d07f1b41','input-9c978046be8be9','input-abf0257db60e00','input-adc7f33a4568ef','input-d0e03c6a4cba2f','input-f1115dcc6346a9',
  'mark-as-delivered-amp-close-case','mv-53a842e403','mv-66406844cd','mv-7cdae40d2d','mv-9b177db3af','mv-a6e178bc43','new-service-order',
  'pm-60116ece91','pm-9cb4b6f988','pm-c9d1dd5a73','pm-ec372dbb96','print-177e54a8c5','print-55e02303ef','print-8132c138b0','proforma-invoice','read-full-privacy-notice-rights',
  'save-order-179d14e8b0','save-order-235acec870','save-order-df9e5c6aa8','send-whatsapp','st-v5-home-fab','svc-search','svc-search-clear',
  'watch-photo-after-camera','watch-photo-after-upload','watch-photo-camera','watch-photo-upload','wiz-back','wiz-next','wp-after-remove','wp-mand-cb','wp-remove'
].sort();

test('Service freezes the exact unique safe identity set for all 91 static actions', () => {
  const actions = [...staticMarkup.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1]).sort();
  assert.deepEqual(actions, expected);
  assert.equal(new Set(actions).size, 91);
  actions.forEach(action => {
    assert.match(action, /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/);
    assert.doesNotMatch(action, /(?:wlmhw|hemw|titanworld|helios|\d{4}-\d{2}-\d{2}|\d{10}|@)/i);
  });
});

test('Service adds exactly 87 annotations without changing existing control semantics', () => {
  const restored = html.replace(/ data-action="([^"]+)"/g, (attribute, action) => originalActions.has(action) ? attribute : '');
  assert.equal(crypto.createHash('sha256').update(restored).digest('hex'), '0dae5120fe2db5e1a0db0b37eccb44d2c4f5e68ea3b4a430302ffb56fa47c5ed');
});

test('Service generated controls use exact deterministic identities without case or customer data', () => {
  const generated = [...html.matchAll(/\bdata-action="([^"]+)"/g)].map(match => match[1])
    .filter(action => !expected.includes(action)).sort();
  assert.deepEqual(generated, [
    'approve-estimate','delete-case','delete-estimate-row','edit-case','estimate-description','estimate-quantity',
    'estimate-unit-price','exception-open-case','filter-stage','list-transition','open-follow-ups','page-next',
    'page-previous','page-select','print-case','print-proforma','workboard-copy-status','workboard-open-case',
    'workboard-open-readiness','workboard-transition'
  ]);
  generated.forEach(action => assert.doesNotMatch(action, /\$\{|\d{4}-\d{2}-\d{2}|\d{10}|@/));
});

test('Service remains an exact conflict-free A3 action surface', async () => {
  const result = await run(buildContext(root));
  const check = result.checks.find(item => item.id === 'A3-02');
  const actions = check.metric.inventory.filter(item => item.category === 'visible-action' && item.surface === 'service');
  assert.equal(check.result, 'pass');
  assert.equal(check.metric.conflictingIds, 0);
  assert.equal(actions.length, 91);
  assert.equal(new Set(actions.map(item => item.capabilityId)).size, 91);
});
