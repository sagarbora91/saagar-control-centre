// U13-F01, U13-F02, U13-050 (new file): the demo E3 stand-in asks for the Owner PIN, applies the same
// refusals as the production engine and keeps returning the loaded day.
import assert from 'node:assert/strict';
import test from 'node:test';
import { all, e3Click, host, loadDemo, loadWww, text, tick } from './lib/fix-s13-pres-dom.mjs';

const demo = loadDemo();
const OWNER = { actorRole: 'Owner', role: 'Owner', actorId: 'DEMO-OWNER' };
const S = { storeCode: 'WLMHW', businessDate: '2026-08-24' };

function fresh(reauth = async () => true) { return demo.createE3({ reauth }); }

test('empty correction and disposition are refused with the production codes', async () => {
  const f = fresh();
  assert.deepEqual(await f.correct(S, { ...OWNER, reason: '' }, { invoiceId: '', croId: '' }), { ok: false, code: 'INVOICE_UNKNOWN' });
  assert.deepEqual(await f.correct(S, { ...OWNER, reason: 'x' }, { invoiceId: 'NOPE-1', croId: 'DEMO-CRO-01' }), { ok: false, code: 'INVOICE_UNKNOWN' });
  assert.equal((await f.correct(S, { ...OWNER, reason: '' }, { invoiceId: 'DEMO-INV-1002', croId: 'DEMO-CRO-01' })).code, 'REASON_REQUIRED');
  const ok = await f.correct(S, { ...OWNER, reason: 'Wrong CRO on bill' }, { invoiceId: 'DEMO-INV-1002', croId: 'DEMO-CRO-01' });
  assert.equal(ok.ok, true);
  assert.equal(ok.day.unassignedQueue.includes('DEMO-INV-1002'), false);
  assert.equal(ok.day.audit[ok.day.audit.length - 1].event, 'ATTRIBUTION_CORRECTED');

  assert.deepEqual(await f.dispose(S, { ...OWNER, reason: '' }, { invoiceId: null, code: '' }), { ok: false, code: 'MANAGER_DISPOSITION_INVALID' });
  assert.equal((await f.dispose(S, { ...OWNER, reason: 'ok' }, { code: '' })).code, 'MANAGER_DISPOSITION_INVALID');
  assert.equal((await f.dispose(S, { ...OWNER, reason: '' }, { code: 'ACCEPT' })).code, 'MANAGER_DISPOSITION_INVALID');
  const d = await f.dispose(S, { ...OWNER, reason: 'Accepted by owner' }, { invoiceId: 'DEMO-INV-1001', code: 'ACCEPT' });
  assert.equal(d.ok, true);
  assert.equal(d.day.dispositions.length, 1);
});

test('every privileged action asks for the PIN with a production label; load does not', async () => {
  const labels = [];
  const f = fresh(async (label) => { labels.push(label); return true; });
  await f.load(S);
  assert.deepEqual(labels, []);
  await f.correct(S, { ...OWNER, reason: 'r' }, { invoiceId: 'DEMO-INV-1002', croId: 'DEMO-CRO-01' });
  await f.dispose(S, { ...OWNER, reason: 'r' }, { code: 'ACCEPT' });
  await f.lock(S, OWNER);
  assert.deepEqual(labels, ['ETP CORRECT', 'ETP DISPOSE', 'ETP LOCK']);
});

test('a refused or failing PIN changes nothing; a throwing reauth counts as denied', async () => {
  for (const reauth of [async () => false, async () => { throw new Error('boom'); }, () => { throw new Error('sync boom'); }, undefined]) {
    const f = demo.createE3({ reauth });
    assert.deepEqual(await f.lock(S, OWNER), { ok: false, code: 'ETP_OPERATIONAL_CONTEXT_UNAVAILABLE' });
    assert.deepEqual(await f.correct(S, OWNER, { invoiceId: 'DEMO-INV-1002', croId: 'DEMO-CRO-01' }), { ok: false, code: 'ETP_OPERATIONAL_CONTEXT_UNAVAILABLE' });
    const day = (await f.load(S)).day;
    assert.equal(day.state, 'VARIANCE');
    assert.equal(day.audit.length, 1);
  }
});

test('lock needs a disposition first, then locks once; a locked day refuses edits', async () => {
  const f = fresh();
  assert.equal((await f.lock(S, OWNER)).code, 'MANAGER_DISPOSITION_REQUIRED');
  assert.equal((await f.load(S)).day.state, 'VARIANCE');
  assert.equal((await f.dispose(S, { ...OWNER, reason: 'Accepted' }, { code: 'ACCEPT' })).ok, true);
  const locked = await f.lock(S, OWNER);
  assert.equal(locked.ok, true);
  assert.equal(locked.day.state, 'LOCKED');
  assert.equal(locked.day.audit[locked.day.audit.length - 1].event, 'STATE_TRANSITION');
  assert.equal((await f.lock(S, OWNER)).code, 'DAY_LOCKED');
  assert.equal((await f.correct(S, { ...OWNER, reason: 'r' }, { invoiceId: 'DEMO-INV-1002', croId: 'DEMO-CRO-01' })).code, 'DAY_LOCKED');
  assert.equal((await f.startRestatementCycle(S, OWNER, null)).code, 'DEMO_RESTATEMENT_UNAVAILABLE');
});

test('instances are independent and the default instance is module level', async () => {
  const a = fresh(), b = fresh();
  await a.dispose(S, { ...OWNER, reason: 'r' }, { code: 'ACCEPT' });
  assert.equal((await b.load(S)).day.dispositions.length, 0);
  assert.equal(typeof demo.createE6, 'function');
  assert.equal(typeof demo.createE5, 'function');
});

test('every ok result carries a day the real E3 presentation accepts', async () => {
  const f = fresh();
  const results = [
    await f.load(S),
    await f.correct(S, { ...OWNER, reason: 'r' }, { invoiceId: 'DEMO-INV-1002', croId: 'DEMO-CRO-01' }),
    await f.dispose(S, { ...OWNER, reason: 'r' }, { code: 'ACCEPT' }),
    await f.lock(S, OWNER)
  ];
  for (const r of results) {
    assert.equal(r.ok, true);
    const d = r.day;
    for (const k of ['declarations', 'outcomes', 'unassignedQueue', 'dispositions', 'audit']) assert.ok(Array.isArray(d[k]), k);
    for (const k of ['storeId', 'businessDate', 'state']) assert.equal(typeof d[k], 'string', k);
  }
});

test('real E3 presentation: empty Apply correction and Record disposition are blocked, not recorded', async () => {
  const e3p = loadWww('etp-e3-presentation.js');
  const root = host();
  const made = e3p.create({ host: root, facade: fresh(), getScope: () => S, getActor: () => OWNER });
  assert.equal(made.ok, true);
  await made.controller.refresh();
  assert.match(text(root), /State: VARIANCE/);

  await e3Click(root, 'correct', { invoiceId: '', croId: '', reason: '' });
  assert.match(text(root), /Action blocked: INVOICE_UNKNOWN/);
  assert.doesNotMatch(text(root), /Correction recorded\./);

  await e3Click(root, 'dispose', { invoiceId: '', code: '', reason: '' });
  assert.match(text(root), /Action blocked: MANAGER_DISPOSITION_INVALID/);
  assert.doesNotMatch(text(root), /Disposition recorded\./);
});

test('real E3 presentation: the loaded day stays on screen after an action (U13-050) and Lock waits for a disposition', async () => {
  const e3p = loadWww('etp-e3-presentation.js');
  const root = host();
  const made = e3p.create({ host: root, facade: fresh(), getScope: () => S, getActor: () => OWNER });
  await made.controller.refresh();

  await e3Click(root, 'lock', {});
  assert.match(text(root), /Action blocked: MANAGER_DISPOSITION_REQUIRED/);
  assert.doesNotMatch(text(root), /Day locked\./);

  await e3Click(root, 'dispose', { invoiceId: '', code: 'ACCEPT', reason: 'Accepted by owner' });
  const body = text(root);
  assert.match(body, /Disposition recorded\./);
  assert.match(body, /State: VARIANCE/);
  assert.match(body, /DEMO-INV-1001/);
  assert.doesNotMatch(body, /No governed day is loaded/);

  await e3Click(root, 'lock', {});
  assert.match(text(root), /Day locked\./);
  assert.match(text(root), /State: LOCKED/);
  assert.ok(all(root).length > 10);
  await tick();
});

test('composeRetail hands the shell root to the PIN gate (SaagarReauth on the root)', async () => {
  const labels = [];
  let bridge = null;
  const rootObj = {
    SaagarReauth: async (label) => { labels.push(label); return true; },
    SaagarEtpOperationalMount: { mount: (o) => { bridge = o.bridge; return { ok: true, controller: { refresh: async () => ({ ok: true }) } }; } },
    SaagarEtpE3Presentation: {}, SaagarEtpE4Presentation: {}, SaagarEtpE5Presentation: {}, SaagarEtpE6Presentation: {}
  };
  const scope = demo.scope;
  const out = await demo.composeRetail({ root: rootObj, roots: {}, getScope: () => ({ storeCode: scope.storeCode, financialYear: scope.financialYear, periodStart: scope.periodStart, periodEnd: scope.periodEnd }) });
  assert.equal(out.ok, true);
  assert.equal((await bridge.e3.lock(S, OWNER)).code, 'MANAGER_DISPOSITION_REQUIRED');
  assert.deepEqual(labels, ['ETP LOCK']);
});
