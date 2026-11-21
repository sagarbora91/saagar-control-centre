// Billing area on the REAL facade over the real stack (real store, FIFO, masters, Phase 1 core, calc, bill layer, money layer, migration)
// and the REAL main billing UI kit. The day is built by hand; every figure below is typed by hand, in paise, then shown as rupees.
//   J-1  labour 100.00 + 18 % = 118.00 (CGST 9.00, SGST 9.00): advance 50.00 Cash (SAR/26-27/0001), bill SV/2026-27/0001 (CCPT billed),
//        balance 68.00 UPI (SRC/26-27/0001).
//   J-2  advance 30.00 UPI (SAR/26-27/0002), no bill: held.      J-3  one P2 issued at cost 20.00, no bill.
//   J-5  old typed advance 25.00.   WS-OLD  a closed job with the old invoice number SV/2026-27/0007 (118.00 in the old figures).
// Day 2026-11-18: receipts Cash 50.00, UPI 98.00 (68.00 + 30.00), total 148.00; refunds 0; net cash 50.00; net all 148.00;
// advances taken 2 / 80.00; balances 1 / 68.00; counter 0 / 0.00; bills 1 / 118.00; credit notes 0 / 0.00; advances held now 1 / 30.00.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS, flush } from './lib/svc2-area-kit.mjs';
import { realEnv, good, ref, OWNER, MANAGER, DESK } from './lib/svc2-core-kit.mjs';

const figs = { gstPct: 18, listed: 100, adjustment: 0, taxable: 100, gst: 18, cgst: 9, sgst: 9, roundOff: 0, finalAmt: 118, total: 118 };

function world() {
  const e = realEnv();
  const c = e.core;
  good(c.setConfig({ billingRoles: ['Cashier'] }, e.pinCtx({ clientRef: ref('cfg') })));
  for (const id of ['J-1', 'J-2', 'J-3']) e.cases.add(id);
  e.cases.add('J-5', { typedAdvancePaise: 2500 });
  e.cases.add('WS-OLD', { status: 'closed', invoiceNo: 'SV/2026-27/0007' });
  e.cases.legacyInput = () => ({ ok: true, basis: 'LIVE_CASE', invoiceDate: '2026-05-02', figs, payMode: 'Cash', lineCount: 1, correctionCount: 0, snapshotSha: null });
  e.as(MANAGER);
  const est = good(c.saveEstimate({ jobId: 'J-1', lines: [{ kind: 'LABOUR', code: 'L1', qty: 1 }] }, e.ctx({ clientRef: ref('e1') })));
  good(c.recordApproval({ jobId: 'J-1', version: est.estimate.version, method: 'CALL', takenByName: 'Test Taker' }, e.ctx({ clientRef: ref('a1') })));
  good(c.saveEstimate({ jobId: 'J-3', lines: [{ kind: 'PART', code: 'P2', qty: 1 }] }, e.ctx({ clientRef: ref('e3') })));
  good(e.stores.issueToJob({ jobId: 'J-3', lines: [{ partCode: 'P2', qty: 1 }] }, { session: MANAGER, clientRef: ref('i3') }));
  e.as(DESK);
  good(c.takeReceipt({ jobId: 'J-1', kind: 'advance', amountPaise: 5000, payMode: 'Cash' }, e.ctx({ clientRef: ref('d1') })));
  good(c.issueBill({ jobId: 'J-1', labour: [{ code: 'L1', qty: 1, discountPaise: 0 }], mode: 'CCPT_BILLED', ccptInvoiceNo: 'CC-1001' }, e.ctx({ clientRef: ref('b1') })));
  good(c.takeReceipt({ jobId: 'J-1', kind: 'balance', amountPaise: 6800, payMode: 'UPI' }, e.ctx({ clientRef: ref('d2') })));
  good(c.takeReceipt({ jobId: 'J-2', kind: 'advance', amountPaise: 3000, payMode: 'UPI' }, e.ctx({ clientRef: ref('d3') })));
  return e;
}

async function open(e, who, tab) {
  e.as(who);
  const a = setup({ session: who, billing: e.core });
  a.h.session = () => e.cur.session;
  // the Owner PIN keypad: the facade takes the time of the PIN from its own provider, so the host marks it now
  a.host.reauth = (label) => { a.calls.reauth.push(label); e.pin(); return Promise.resolve(true); };
  a.mount();
  await a.show();
  if (tab) await a.click(tab);
  return a;
}

test('R01 Today on the real facade: every figure of the hand-built day, nothing "not available", the user context on the read', async () => {
  const e = world();
  const a = await open(e, OWNER);
  const t = a.rootText();
  for (const s of ['Rs 50.00', 'Rs 98.00', 'Rs 148.00', '2 / Rs 80.00', '1 / Rs 68.00', '1 / Rs 118.00', '1 / Rs 30.00']) assert.ok(t.includes(s), s);
  assert.ok(!t.includes('not available'), 'the bill layer answers both bill figures');
  assert.ok(t.includes('Ledger OK'));
  // the same day through the facade directly: bills 1 / 118.00, credit notes 0 / 0.00, net all 148.00
  const day = e.core.daySummary('2026-11-18', e.ctx());
  assert.deepEqual(day.invoicesIssued, { available: true, count: 1, paise: 11800, cancelled: 0 });
  assert.deepEqual(day.creditNotes, { available: true, count: 0, paise: 0 });
  assert.equal(day.netAll, 14800);
  assert.equal(day.netCash, 5000);
});

test('R02 Today on a past day: the held-now figure is the bill layer\'s own (now), the bill figures are that day\'s', async () => {
  const e = world();
  const a = await open(e, OWNER);
  await a.change('day-date', '2026-11-10');
  const t = a.rootText();
  assert.match(t, /Past date: read-only/);
  assert.ok(t.includes('0 / Rs 0.00'), 'no bills and no credit notes on 10 November');
  assert.ok(t.includes('1 / Rs 30.00'), 'the held-now block is labelled "now" and shows what is held today');
});

test('R03 Advances held, Not billed yet, Bills, Receipts and Old items on the real facade', async () => {
  const e = world();
  const a = await open(e, OWNER, 'svb-tab-advances');
  assert.ok(a.rootText().includes('Advances held: Rs 30.00 on 1 jobs.'));
  assert.ok(a.find('svb-adv-open-job', 'J-2'));
  assert.equal(a.find('svb-adv-open-job', 'J-1'), null, 'J-1 is billed: its advance is no longer held');
  await a.click('svb-tab-unbilled');
  let t = a.rootText();
  assert.ok(t.includes('1 jobs have parts issued and no bill.'));
  assert.ok(t.includes('Parts with job 1 pieces'));
  assert.ok(t.includes('FIFO cost Rs 20.00'));
  await a.click('svb-tab-bills');
  t = a.rootText();
  assert.ok(t.includes('SV/2026-27/0001'));
  assert.ok(t.includes('CCPT CC-1001'));
  assert.ok(t.includes('Rs 118.00'));
  assert.equal(a.findAll('svb-bill-view').length, 1);
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  const d = a.layerText();
  for (const s of ['Bill SV/2026-27/0001', 'J-1', 'Taxable value Rs 100.00', 'CGST Rs 9.00', 'SGST Rs 9.00', 'Bill total Rs 118.00', 'Advance set off Rs 50.00', 'Balance due Rs 68.00', 'CC-1001']) assert.ok(d.includes(s), s);
  await a.click('svb-bv-close');
  await a.click('svb-tab-receipts');
  t = a.rootText();
  for (const s of ['SAR/26-27/0001', 'SRC/26-27/0001', 'SAR/26-27/0002']) assert.ok(t.includes(s), s);
  assert.equal(a.findAll('svb-rcpt-reprint').length, 3);
  await a.click('svb-tab-old');
  t = a.rootText();
  assert.ok(t.includes('Rs 25.00'), 'the old typed advance');
  assert.ok(t.includes('1 old invoices are not in the billing records yet.'));
});

test('R04 Old items on the real facade: the Owner brings in the old invoice with the PIN; afterwards nothing is left; a Manager cannot', async () => {
  const e = world();
  const m = await open(e, MANAGER, 'svb-tab-old');
  assert.equal(m.find('svb-migrate-run'), null);
  assert.ok(m.rootText().includes('Only the Owner can bring in old invoices.'));
  const a = await open(e, OWNER, 'svb-tab-old');
  assert.ok(a.find('svb-migrate-run'));
  await a.click('svb-migrate-run');
  assert.equal(a.calls.reauth.length, 1);
  assert.ok(a.calls.toast.includes('Old invoices brought in: 1.'), JSON.stringify(a.calls.toast));
  assert.ok(a.rootText().includes('Every old invoice is already in the billing records.'));
  assert.equal(e.core.planMigration(e.ctx()).invoices.length, 0);
});

test('R05 Settings on the real facade: the Owner sets the limit and the role lists with the PIN; the facade holds exactly what was typed; a repeat says nothing changed', async () => {
  const e = world();
  const a = await open(e, OWNER, 'svb-tab-settings');
  await a.type('limit', '150.50');
  await a.change('br1', true); // CRO joins Cashier in the billing roles
  await a.click('svb-set-save');
  assert.equal(a.calls.reauth.length, 1);
  const cfg = e.core.status().config;
  assert.equal(cfg.discountLimitPaise, 15050);
  assert.deepEqual(cfg.billingRoles, ['Cashier', 'CRO']);
  assert.deepEqual(cfg.estimateRoles, ['Technician', 'Assistant Technician'], 'the estimate roles were not touched');
  assert.ok(a.calls.toast.includes('Billing settings saved.'), JSON.stringify(a.calls.toast));
  // saving the same values again is refused by the bill layer with its own code and the screen says so in plain words
  await a.click('svb-set-save');
  assert.ok(a.calls.toast.includes('Nothing was changed. These are already the settings.'), JSON.stringify(a.calls.toast));
  // the Manager has no Settings tab
  const m = await open(e, MANAGER);
  assert.equal(m.find('svb-tab-settings'), null);
});

test('R06 a technician and a cashier see nothing of the Billing area on the real facade (no tab, no amount)', async () => {
  const e = world();
  for (const who of [SESSIONS.desk, SESSIONS.tech]) {
    e.as(who);
    const a = setup({ session: who, billing: e.core });
    a.h.session = () => e.cur.session;
    a.mount();
    await a.show();
    assert.equal(a.allActions().filter((x) => x.startsWith('svb-tab-')).length, 0);
    assert.doesNotMatch(a.rootText(), /Rs \d/);
  }
});
