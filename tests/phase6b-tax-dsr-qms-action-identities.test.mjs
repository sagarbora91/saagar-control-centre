import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildContext } from '../scripts/audit/lib.mjs';
import { run as auditA3 } from '../scripts/audit/audits/a3.mjs';
import { restoreInlineLegacySource } from './lib/phase6c-legacy-source.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cases = Object.freeze([
  Object.freeze({
    module: 'tax', baseline: 'cdeded3d0d5189128d630b03bcdbe9038645c44adadd1f039d01dced59adcb47',
    added: Object.freeze(['tax-financial-year-select','tax-firm-select','tax-action-center-open','tax-firms-open','tax-compliance-master-open','tax-compliance-csv-export','tax-evidence-zip-export','tax-compliance-print','tax-firm-type-select','tax-firm-save','tax-obligation-every-month-toggle','tax-obligation-details-toggle','tax-obligation-controls-toggle','tax-obligation-save']),
    exact: Object.freeze(['tax-financial-year-select','tax-firm-select','tax-action-center-open','tax-firms-open','tax-compliance-master-open','tax-compliance-csv-export','tax-evidence-zip-export','tax-compliance-print','firm-modal-close','tax-firm-type-select','tax-firm-save','firm-form-reset','master-modal-close','tax-obligation-every-month-toggle','tax-obligation-details-toggle','tax-obligation-controls-toggle','tax-obligation-save','master-form-reset','action-center-close'])
  }),
  Object.freeze({
    module: 'dsr', baseline: 'abf88c7794f0d4b8130c9b8182baceab8cae911e4942371c44b390fb21829ee6',
    added: Object.freeze(['dsr-login-role-staff','dsr-login-role-manager','dsr-staff-login','dsr-manager-login','dsr-staff-logout','dsr-staff-tab-daystart','dsr-staff-tab-opening','dsr-staff-tab-inout','dsr-staff-tab-sales','dsr-staff-tab-nonpurchase','dsr-staff-tab-visitors','dsr-staff-tab-tasks','dsr-staff-tab-marketing','dsr-staff-tab-cleaning','dsr-staff-tab-closing','dsr-manager-logout','dsr-manager-tab-submissions','dsr-manager-tab-audit','dsr-manager-tab-dashboard','dsr-manager-tab-settings']),
    exact: Object.freeze(['dsr-login-role-staff','dsr-login-role-manager','dsr-staff-login','dsr-manager-login','dsr-staff-logout','dsr-staff-tab-daystart','dsr-staff-tab-opening','dsr-staff-tab-inout','dsr-staff-tab-sales','dsr-staff-tab-nonpurchase','dsr-staff-tab-visitors','dsr-staff-tab-tasks','dsr-staff-tab-marketing','dsr-staff-tab-cleaning','dsr-staff-tab-closing','dsr-manager-logout','dsr-manager-tab-submissions','dsr-manager-tab-audit','dsr-manager-tab-dashboard','dsr-manager-tab-settings'])
  }),
  Object.freeze({
    module: 'qms', baseline: '2b9f99c75c2323ccf88da03e520cd5327142457ad5740742a090e74eecd41dfb',
    added: Object.freeze(['qms-view-dashboard','qms-view-rotation','qms-view-entry','qms-view-preclaim','qms-view-live','qms-view-followups','qms-view-reports','qms-view-settings','qms-role-switch-sidebar','qms-backup-sidebar','qms-role-switch-topbar','qms-modal-close','qms-restore-file-select']),
    exact: Object.freeze(['qms-view-dashboard','qms-view-rotation','qms-view-entry','qms-view-preclaim','qms-view-live','qms-view-followups','qms-view-reports','qms-view-settings','qms-role-switch-sidebar','qms-backup-sidebar','qms-role-switch-topbar','qms-modal-close','qms-restore-file-select'])
  })
]);

function staticMarkup(source) {
  return source.replace(/<(script|style|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,
    value => value.replace(/[^\r\n]/g, ' '));
}

function visibleStaticActions(source) {
  const actions = [];
  for (const match of staticMarkup(source).matchAll(/<(button|a|summary|input|select|form)\b([^>]*)>/gi)) {
    const attrs = match[2];
    const visible = /\bon(?:click|change|submit|input)\s*=|\bhref\s*=|\btype\s*=\s*['"]?(?:submit|reset|image)/i.test(attrs);
    if (!visible) continue;
    const identity = /\bdata-action\s*=\s*"([^"]+)"/i.exec(attrs);
    assert.ok(identity, `static A3 control has no data-action near offset ${match.index}`);
    actions.push(identity[1]);
  }
  return actions;
}

function sha256(value) {
  return crypto.createHash('sha256').update(value.replace(/\r\n/g, '\n')).digest('hex');
}

for (const fixture of cases) test(`${fixture.module} has exact identity-only static A3 annotations`, () => {
  const file = path.join(root, 'www', 'modules', fixture.module, 'index.html');
  const source = fs.readFileSync(file, 'utf8');
  const actions = visibleStaticActions(source);
  assert.deepEqual(actions, fixture.exact);
  assert.equal(new Set(actions).size, actions.length, 'data-action identities must be unique');

  let withoutAnnotations = source
    .replace(/ data-action="([^"]+)"/g, (attribute, action) => fixture.exact.includes(action) ? attribute : '')
    .replace(/ data-action-key="[^"]+"/g, '');
  for (const action of fixture.added) {
    const attribute = ` data-action="${action}"`;
    assert.equal(withoutAnnotations.split(attribute).length - 1, 1, action);
    withoutAnnotations = withoutAnnotations.replace(attribute, '');
  }
  assert.equal(sha256(restoreInlineLegacySource(fixture.module, withoutAnnotations)), fixture.baseline,
    'module source changed beyond the approved identity-only annotations');
});

test('A3 reports zero capability identity conflicts after Tax, DSR and QMS annotations', async () => {
  const result = await auditA3(buildContext(root));
  const capability = result.checks.find(check => check.id === 'A3-02');
  assert.ok(capability);
  assert.equal(capability.metric.conflictingIds, 0);
});
