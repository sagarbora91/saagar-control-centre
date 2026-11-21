// U13-F03, U13-053 coverage, U13-054 (new file): the demo E6 and E5 stand-ins refuse like production
// and explain themselves; every model they return still passes the real presentation validators.
import assert from 'node:assert/strict';
import test from 'node:test';
import { host, loadDemo, loadWww, text } from './lib/fix-s13-pres-dom.mjs';

const demo = loadDemo();
const e6p = loadWww('etp-e6-presentation.js');
const e5p = loadWww('etp-e5-presentation.js');
const req = (input) => ({ scope: demo.scope, input });
const EVID = { evidenceReference: 'EV-1' };

function fresh(reauth = async () => true) { return demo.createE6({ reauth }); }
const summary = (inst) => inst.model().summary;

test('close with empty input is refused and the exception stays open', async () => {
  const e = fresh();
  assert.equal((await e.facade.close(req({}))).code, 'ETP_EXCEPTION_EVIDENCE_REQUIRED');
  assert.deepEqual(summary(e), { open: 1, acknowledged: 0, closed: 0, overdue: 0 });
  assert.equal((await e.facade.close(req({ ...EVID }))).code, 'ETP_EXCEPTION_CLOSURE_INCOMPLETE');
  assert.equal((await e.facade.close(req({ ...EVID, note: 'done', closureReason: 'MADE_UP' }))).code, 'ETP_EXCEPTION_CLOSURE_INCOMPLETE');
  assert.equal((await e.facade.close(req({ ...EVID, closureReason: 'CORRECTED_AND_VERIFIED' }))).code, 'ETP_EXCEPTION_CLOSURE_INCOMPLETE');
  assert.equal(summary(e).open, 1);
});

test('acknowledge needs a reference and only works from OPEN', async () => {
  const e = fresh();
  assert.equal((await e.facade.acknowledge(req({}))).code, 'ETP_EXCEPTION_EVIDENCE_REQUIRED');
  assert.equal((await e.facade.acknowledge(req(EVID))).ok, true);
  assert.deepEqual(summary(e), { open: 0, acknowledged: 1, closed: 0, overdue: 0 });
  assert.equal((await e.facade.acknowledge(req(EVID))).code, 'ETP_EXCEPTION_TRANSITION_INVALID');
});

test('reassign and add-evidence (U13-053) validate their input', async () => {
  const e = fresh();
  assert.equal((await e.facade.reassign(req({ ...EVID, ownerId: '' }))).code, 'ETP_EXCEPTION_REASSIGNMENT_INVALID');
  assert.equal((await e.facade.reassign(req({ ...EVID, ownerId: 'bad owner!' }))).code, 'ETP_EXCEPTION_REASSIGNMENT_INVALID');
  assert.equal(e.model().exceptions[0].ownerId, 'DEMO-MANAGER-01');
  assert.equal((await e.facade.reassign(req({ ...EVID, ownerId: 'DEMO-MANAGER-02' }))).ok, true);
  assert.equal(e.model().exceptions[0].ownerId, 'DEMO-MANAGER-02');

  assert.equal((await e.facade.addEvidence(req({ ...EVID }))).code, 'ETP_EXCEPTION_EVIDENCE_REQUIRED');
  assert.equal((await e.facade.addEvidence(req({ note: 'n' }))).code, 'ETP_EXCEPTION_EVIDENCE_REQUIRED');
  assert.equal((await e.facade.addEvidence(req({ ...EVID, note: 'Receipt seen' }))).ok, true);
  assert.equal(e.model().exceptions[0].evidenceHistory.length, 1);
});

test('a complete close closes it for good', async () => {
  const e = fresh();
  const r = await e.facade.close(req({ ...EVID, note: 'Source re-imported and matched', closureReason: 'SOURCE_REIMPORT_COMPLETED' }));
  assert.equal(r.ok, true);
  assert.deepEqual(summary(e), { open: 0, acknowledged: 0, closed: 1, overdue: 0 });
  assert.equal(e.model().exceptions[0].closureReason, 'Source re-imported and matched');
  for (const name of ['acknowledge', 'reassign', 'addEvidence', 'close']) {
    assert.equal((await e.facade[name](req({ ...EVID, ownerId: 'DEMO-MANAGER-02', note: 'n', closureReason: 'CORRECTED_AND_VERIFIED' }))).code, 'ETP_EXCEPTION_CLOSED_IMMUTABLE', name);
  }
});

test('a refused PIN blocks every E6 action and changes nothing', async () => {
  for (const reauth of [async () => false, async () => { throw new Error('x'); }]) {
    const e = fresh(reauth);
    for (const name of ['acknowledge', 'reassign', 'addEvidence', 'close']) {
      assert.deepEqual(await e.facade[name](req({ ...EVID, ownerId: 'DEMO-MANAGER-02', note: 'n', closureReason: 'CORRECTED_AND_VERIFIED' })), { ok: false, code: 'ETP_OPERATIONAL_CONTEXT_UNAVAILABLE' }, name);
    }
    assert.deepEqual(summary(e), { open: 1, acknowledged: 0, closed: 0, overdue: 0 });
  }
});

test('PIN labels are the production-style E6 labels', async () => {
  const labels = [];
  const e = fresh(async (l) => { labels.push(l); return true; });
  await e.facade.acknowledge(req(EVID));
  await e.facade.reassign(req({ ...EVID, ownerId: 'DEMO-MANAGER-02' }));
  await e.facade.addEvidence(req({ ...EVID, note: 'n' }));
  await e.facade.close(req({ ...EVID, note: 'n', closureReason: 'CORRECTED_AND_VERIFIED' }));
  assert.deepEqual(labels, ['ETP E6 ACKNOWLEDGE', 'ETP E6 REASSIGN', 'ETP E6 EVIDENCE', 'ETP E6 CLOSE']);
});

test('every E6 model passes the real presentation validator after each step', async () => {
  const e = fresh();
  assert.ok(e6p.cleanModel(e.model()));
  await e.facade.acknowledge(req(EVID));
  assert.ok(e6p.cleanModel(e.model()));
  await e.facade.reassign(req({ ...EVID, ownerId: 'DEMO-MANAGER-02' }));
  assert.ok(e6p.cleanModel(e.model()));
  await e.facade.addEvidence(req({ ...EVID, note: 'n' }));
  assert.ok(e6p.cleanModel(e.model()));
  await e.facade.close(req({ ...EVID, note: 'n', closureReason: 'CORRECTED_AND_VERIFIED' }));
  const m = e6p.cleanModel(e.model());
  assert.ok(m);
  assert.equal(m.summary.closed, 1);
});

test('real E6 presentation shows the refusal for a Close with nothing typed', async () => {
  const e = fresh();
  const root = host();
  const mounted = e6p.mount(root, e.facade, { getScope: () => demo.scope, getActor: () => ({ actorId: 'DEMO-OWNER', role: 'Owner', actorRole: 'Owner' }), getActionInput: () => ({}) });
  assert.equal(mounted.ok, true);
  await mounted.refresh();
  const id = e.model().exceptions[0].id;
  const out = await mounted.close(id);
  assert.equal(out.ok, false);
  const body = text(root);
  assert.match(body, /E6 action unavailable/);
  assert.match(body, /ETP_EXCEPTION_EVIDENCE_REQUIRED/);
  assert.ok(body.includes('Exception summary | 1 | Open | 0 | Acknowledged | 0 | Closed'));
});

test('default models are callable with no arguments', () => {
  assert.equal(demo.models.e6().summary.open, 1);
  assert.equal(demo.models.e6().exceptions.length, 1);
});

test('E5 Calculate, Finalize and Clawback answer with a visible demo refusal (U13-054)', async () => {
  const e5 = demo.createE5();
  assert.equal((await e5.calculate(req({}))).code, 'DEMO_E5_PERIOD_ALREADY_FINALIZED');
  assert.equal((await e5.publish(req({}))).code, 'DEMO_E5_PERIOD_ALREADY_FINALIZED');
  assert.equal((await e5.clawback(req({}))).code, 'DEMO_E5_CLAWBACK_ALREADY_PENDING');
  assert.equal((await e5.attachPayroll(req({}))).code, 'DEMO_E5_PAYROLL_ALREADY_ATTACHED');
  assert.equal(demo.models.e5().actions.calculate, true);
  assert.deepEqual(demo.models.e5().totals, { incentive: 13490000, clawback: -250000, payroll: 13240000 });
  assert.equal(demo.models.e5().calculations[0].incentive, 4512500);
  assert.equal(demo.models.e5().calculations[1].incentive, 8977500);
});

test('real E5 presentation shows the notice after Calculate', async () => {
  const root = host();
  const mounted = e5p.mount(root, demo.createE5(), { getScope: () => demo.scope, getActor: () => ({ actorId: 'DEMO-OWNER', role: 'Owner' }), getActionInput: (name) => ({ operation: name, finalOperationId: 'DEMO-E5-FINAL-01' }) });
  assert.equal(mounted.ok, true);
  await mounted.refresh();
  const out = await mounted.calculate();
  assert.equal(out.ok, false);
  assert.equal(out.code, 'DEMO_E5_PERIOD_ALREADY_FINALIZED');
  const body = text(root);
  assert.match(body, /E5 action unavailable/);
  assert.match(body, /DEMO_E5_PERIOD_ALREADY_FINALIZED/);
});

test('through composeRetail the bridge e6 and e5 are the gated and refusing stand-ins', async () => {
  const labels = [];
  let bridge = null;
  const rootObj = {
    SaagarReauth: async (l) => { labels.push(l); return true; },
    SaagarEtpOperationalMount: { mount: (o) => { bridge = o.bridge; return { ok: true, controller: { refresh: async () => ({ ok: true }) } }; } },
    SaagarEtpE3Presentation: {}, SaagarEtpE4Presentation: {}, SaagarEtpE5Presentation: {}, SaagarEtpE6Presentation: {}
  };
  const sc = demo.scope;
  const out = await demo.composeRetail({ root: rootObj, roots: {}, getScope: () => ({ storeCode: sc.storeCode, financialYear: sc.financialYear, periodStart: sc.periodStart, periodEnd: sc.periodEnd }) });
  assert.equal(out.ok, true);
  assert.equal((await bridge.e5.calculate(req({}))).code, 'DEMO_E5_PERIOD_ALREADY_FINALIZED');
  assert.equal((await bridge.e6.close(req({}))).code, 'ETP_EXCEPTION_EVIDENCE_REQUIRED');
  assert.deepEqual(labels, ['ETP E6 CLOSE']);
});
