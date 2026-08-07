import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { inlineModuleScripts, loadModuleBundle } from './lib/module-bundle.mjs';

const require = createRequire(import.meta.url);
const policy = require('../www/service-workboard-policy.js');
const persistence = require('../www/service-persistence.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const repoDir = path.resolve(here, '..');
const indexSource = fs.readFileSync(path.join(repoDir, 'www', 'index.html'), 'utf8');
const serviceModule = loadModuleBundle().find(module => module.id === 'service');
const service = serviceModule?.html || '';

function functionSource(name, source = service) {
  const token = `function ${name}(`;
  const start = source.indexOf(token);
  assert.notEqual(start, -1, `${name} must exist in embedded Service`);
  assert.equal(start, source.lastIndexOf(token), `${name} must be unique in embedded Service`);
  const end = source.indexOf('\nfunction ', start + token.length);
  assert.notEqual(end, -1, `${name} must have a following function boundary`);
  return source.slice(start, end);
}

function fields(overrides = {}) {
  const values = {
    'svc-d3-actor': { value: 'Technician' },
    'svc-d3-reason': { value: '' },
    'svc-d3-condition': { checked: true },
    'svc-d3-payment': { value: 'estimate_approved' },
    'svc-d3-promised': { value: '2026-08-02' },
    'svc-d3-notification': { value: 'notified' },
    'svc-d3-transition-modal': {
      classList: { remove() {} },
      setAttribute() {}
    },
    ...overrides
  };
  return {
    values,
    document: {
      getElementById(id) {
        assert.ok(values[id], `missing DOM fixture ${id}`);
        return values[id];
      }
    }
  };
}

function transitionContext({
  record,
  targetStage,
  storage,
  reauth = () => false,
  overrides = {}
}) {
  const dom = fields(overrides);
  const toasts = [];
  let renders = 0;
  const context = {
    console,
    Date,
    JSON,
    Object,
    Array,
    String,
    localStorage: storage,
    document: dom.document,
    readOnlyGuard: () => false,
    renderDash: () => { renders += 1; },
    toast: message => toasts.push(String(message)),
    offerReadyNotify: () => assert.fail('notification offer must not run in this fixture'),
    window: {
      SaagarServiceWorkboardPolicy: policy,
      SaagarServicePersistence: persistence,
      SaagarReauth: reauth,
      __svcD3TransitionContext: { caseId: record.id, targetStage }
    }
  };
  context.window.parent = context.window;
  vm.createContext(context);
  vm.runInContext(
    `var DB = ${JSON.stringify([record])};
     const STORE_KEY = 'saagar_wsf_v2';
     function byId(id) { return DB.find(item => item && item.id === id); }
     ${functionSource('svcD3PolicyApi')}
     ${functionSource('svcD3PersistenceApi')}
     ${functionSource('svcD3RestorePersistedDb')}
     ${functionSource('svcD3CommitCases')}
     ${functionSource('svcD3Reauth')}
     ${functionSource('svcD3ConfirmTransition')}
     this.readDb = () => DB;`,
    context
  );
  return { context, toasts, renders: () => renders };
}

test('D3 Service bundle metadata, runtime ordering and UI controls are intact', () => {
  assert.ok(serviceModule);
  assert.equal(serviceModule.bytes, serviceModule.actualBytes);
  assert.equal(serviceModule.sha256, serviceModule.actualSha256);
  assert.equal(serviceModule.bytes, Buffer.byteLength(service, 'utf8'));
  assert.equal((service.match(/D3-SERVICE-RUNTIME-2026-07-30/g) || []).length, 1);
  assert.equal((service.match(/D3-SERVICE-HTML-2026-07-30/g) || []).length, 1);
  assert.equal((service.match(/D3-SERVICE-CSS-2026-07-30/g) || []).length, 1);
  assert.ok(
    service.indexOf('D3-SERVICE-CSS-2026-07-30') < service.indexOf('<script>'),
    'D3 CSS must remain in the document stylesheet, not an inline JavaScript string'
  );
  const policyAt = indexSource.indexOf('<script src="service-workboard-policy.js"></script>');
  const persistenceAt = indexSource.indexOf('<script src="service-persistence.js"></script>');
  const modulesAt = indexSource.indexOf('const MODULES');
  assert.ok(policyAt >= 0 && persistenceAt > policyAt && modulesAt > persistenceAt);
  assert.match(service, /id="f-stage" disabled/);
  assert.match(service, /Combined \/ untagged Service data/);
  assert.match(service, /@media\(max-width:720px\)/);
  inlineModuleScripts(service).forEach((source, index) => {
    assert.doesNotThrow(() => new vm.Script(source, { filename: `d3-service-.js` }));
  });
});
test('D3 list stage actions use numeric context and never interpolate a case id into a handler', () => {
  assert.match(service, /window\.__svcD3ListCaseIds = pageItems\.map/);
  assert.match(service, /pageItems\.map\(\(c, cardIndex\) =>/);
  assert.match(service, /onchange="svcD3ListTransition\(\$\{cardIndex\},this\.value\)"/);
  assert.doesNotMatch(service, /onchange="quickStage\('\\?\$\{c\.id\}/);
  assert.match(functionSource('svcD3ListTransition'), /__svcD3ListCaseIds/);
});
test('D3 workboard render excludes customer PII and escapes operational labels', () => {
  const host = { innerHTML: '' };
  const context = {
    window: {
      SaagarServiceWorkboardPolicy: policy,
      __svcD3BoardCaseIds: []
    },
    document: { getElementById: id => id === 'svc-d3-workboard' ? host : null },
    DB: [{
      id: 'WS-1"><img src=x onerror=alert(1)>',
      status: 'open',
      stage: 'repair',
      expDel: '2026-08-02',
      brand: '<b>Titan</b>',
      model: 'Edge',
      advisor: '<script>bad()</script>',
      custName: 'Private Customer',
      custMobile: '9876543210',
      diagnosis: 'Internal diagnosis',
      condNotes: 'Internal condition',
      watchPhoto: true
    }],
    todayStr: () => '2026-07-30',
    escapeHtml: value => String(value).replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]))
  };
  context.window.parent = context.window;
  vm.createContext(context);
  vm.runInContext(
    `${functionSource('svcD3PolicyApi')}
     ${functionSource('svcD3TransitionOptions')}
     ${functionSource('svcD3RenderWorkboard')}
     svcD3RenderWorkboard();`,
    context
  );
  assert.match(host.innerHTML, /Service Workboard/);
  assert.match(host.innerHTML, /WS-1&quot;&gt;&lt;img/);
  assert.match(host.innerHTML, /svcD3OpenCase\(0\)/);
  assert.doesNotMatch(host.innerHTML, /Private Customer|9876543210|Internal diagnosis|Internal condition/);
  assert.doesNotMatch(host.innerHTML, /<script>|<img/);
});

test('D3 ready transition commits exactly once with readiness and audit', () => {
  const operations = [];
  const storage = {
    getItem: () => null,
    setItem(key, value) { operations.push({ key, value }); }
  };
  const fixture = transitionContext({
    record: { id: 'WS-1', status: 'open', stage: 'repair', expDel: '2026-08-01' },
    targetStage: 'ready',
    storage
  });
  vm.runInContext('svcD3ConfirmTransition()', fixture.context);
  assert.equal(operations.length, 1);
  const saved = JSON.parse(operations[0].value)[0];
  assert.equal(saved.stage, 'ready');
  assert.equal(saved.d3Readiness.notificationStatus, 'notified');
  assert.equal(saved.d3Readiness.checkedBy, 'Technician');
  assert.equal(saved.d3Transitions.length, 1);
  assert.equal(saved.d3Transitions[0].from, 'repair');
  assert.equal(saved.d3Transitions[0].to, 'ready');
  assert.equal(saved.d3Transitions[0].override, false);
  assert.equal(fixture.context.window.__svcD3TransitionContext, null);
  assert.ok(fixture.toasts.some(message => message.includes('Ready for Pickup')));
});

test('D3 storage failure restores persisted cases and emits no success', () => {
  const persisted = [{ id: 'WS-1', status: 'open', stage: 'repair', expDel: '2026-08-01' }];
  let writes = 0;
  const storage = {
    getItem: () => JSON.stringify(persisted),
    setItem() { writes += 1; throw new Error('disk full'); }
  };
  const fixture = transitionContext({
    record: persisted[0],
    targetStage: 'ready',
    storage
  });
  vm.runInContext('svcD3ConfirmTransition()', fixture.context);
  assert.equal(writes, 1);
  assert.equal(fixture.context.readDb()[0].stage, 'repair');
  assert.notEqual(fixture.context.window.__svcD3TransitionContext, null);
  assert.ok(fixture.toasts.some(message => message.includes('restored')));
  assert.ok(fixture.toasts.every(message => !message.includes('Ready for Pickup')));
  assert.equal(fixture.renders(), 1);
});

test('D3 backward transition denies without reauth and audits an approved override', () => {
  const record = {
    id: 'WS-1',
    status: 'open',
    stage: 'ready',
    expDel: '2026-08-01',
    d3Readiness: {
      conditionConfirmed: true,
      paymentStatus: 'estimate_approved',
      promisedDate: '2026-08-01',
      notificationStatus: 'notified',
      checkedBy: 'Technician',
      checkedAt: '2026-07-30T10:00:00.000Z'
    }
  };
  let deniedWrites = 0;
  const denied = transitionContext({
    record,
    targetStage: 'repair',
    storage: { getItem: () => null, setItem: () => { deniedWrites += 1; } },
    reauth: () => false,
    overrides: { 'svc-d3-reason': { value: 'Customer reports repeat issue' } }
  });
  vm.runInContext('svcD3ConfirmTransition()', denied.context);
  assert.equal(deniedWrites, 0);
  assert.equal(denied.context.readDb()[0].stage, 'ready');
  assert.ok(denied.toasts.some(message => message.includes('approval denied')));

  const operations = [];
  let approvals = 0;
  const approved = transitionContext({
    record,
    targetStage: 'repair',
    storage: {
      getItem: () => null,
      setItem(key, value) { operations.push({ key, value }); }
    },
    reauth: () => { approvals += 1; return true; },
    overrides: { 'svc-d3-reason': { value: 'Customer reports repeat issue' } }
  });
  vm.runInContext('svcD3ConfirmTransition()', approved.context);
  assert.equal(approvals, 1);
  assert.equal(operations.length, 1);
  const saved = JSON.parse(operations[0].value)[0];
  assert.equal(saved.stage, 'repair');
  assert.equal(saved.d3ReadinessSupersededAt, saved.d3Transitions[0].at);
  assert.equal(saved.d3Transitions[0].override, true);
  assert.equal(saved.d3Transitions[0].reason, 'Customer reports repeat issue');
});

test('D3 delivery close gates readiness before reading or mutating delivery data', () => {
  const closeStart = service.indexOf('function closeCase(');
  const closeEnd = service.indexOf('\nfunction ', closeStart + 1);
  assert.ok(closeStart >= 0 && closeEnd > closeStart);
  const close = service.slice(closeStart, closeEnd);
  const guardAt = close.indexOf('D3 readiness gate before delivery close');
  const readinessAt = close.indexOf('readinessValid(d3Case)');
  const deliveryAt = close.indexOf('const del = readDelivery()');
  assert.ok(guardAt >= 0 && readinessAt > guardAt && deliveryAt > readinessAt);
});

test('D3 subtotal calculation clears a stale automatic subtotal after the last row', () => {
  const elements = {
    'f-st': { value: '500.00' },
    'f-gst': { value: '18' },
    'f-gstamt': { textContent: '' },
    'f-tot': { textContent: '' }
  };
  const context = {
    document: {
      querySelectorAll: () => [],
      getElementById: id => elements[id]
    },
    subTotalDirty: false,
    parseRupee: value => Number(String(value || '').replace(/,/g, '')) || 0
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource('calcTotal')}; calcTotal();`, context);
  assert.equal(elements['f-st'].value, '');
  assert.equal(elements['f-gstamt'].textContent, '0.00');
  assert.equal(elements['f-tot'].textContent, '0.00');
});

test('D3 warranty scheduling updates the existing automatic reminder without duplication', () => {
  const record = {
    diagnosis: 'Battery replaced',
    followUps: [{
      type: 'Warranty',
      dueDate: '2025-01-01',
      remarks: 'Old',
      auto: 'warranty'
    }]
  };
  const context = {
    Date,
    addMonthsIso: () => '2028-01-30',
    nowLocalDT: () => '2026-07-30T10:00'
  };
  vm.createContext(context);
  vm.runInContext(
    `${functionSource('scheduleWarrantyFollowUp')}
     this.run = scheduleWarrantyFollowUp;`,
    context
  );
  context.run(record, {}, '2026-07-30', 18);
  assert.equal(record.followUps.length, 1);
  assert.equal(record.followUps[0].dueDate, '2028-01-30');
  assert.match(record.followUps[0].remarks, /Warranty expiring/);
  assert.match(record.followUps[0].updatedAt, /^\d{4}-\d{2}-\d{2}T/);
});
