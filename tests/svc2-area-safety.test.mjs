// Billing area: privacy, escaping, the user context on every read, fail-closed behaviour, the kit contract (P5 U78 to U82 as they apply to the area).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS, SAMPLE, sampleDay, flush } from './lib/svc2-area-kit.mjs';

const SENT = { name: 'SENTINEL-CUSTOMER-NAME', mob: '9990001112', addr: 'SENTINEL-ADDRESS-LANE', mail: 'sentinel@example.invalid', phone: '0212-555-0100' };
const LEAK = { custName: SENT.name, custMobile: SENT.mob, custAddr: SENT.addr, custEmail: SENT.mail, mobile: SENT.mob, phone: SENT.phone, customerName: SENT.name, email: SENT.mail, address: SENT.addr };

function dirty(row) { return Object.assign({}, row, LEAK); }

function dirtyOpts() {
  return {
    day: dirty(sampleDay()),
    held: { ok: true, totalPaise: 1000, count: 1, rows: [dirty({ jobId: 'WS-2026-001', netPaise: 1000, receipts: [dirty({ no: 'SAR/26-27/0001' })], oldestDocDate: '2026-11-01', ageDays: 17, jobState: 'OPEN' })] },
    unbilled: { ok: true, total: 1, rows: [dirty({ jobId: 'WS-2026-001', jobStatus: 'OPEN', pieces: 1, costPaise: 500, oldestDocDate: '2026-11-17' })] },
    bills: { ok: true, total: 1, rows: [dirty(SAMPLE.bill('SV/2026-27/0001'))] },
    billViews: { 'SV/2026-27/0001': dirty(SAMPLE.billView('SV/2026-27/0001')) },
    receipts: { ok: true, total: 1, rows: [dirty(SAMPLE.receipt('SAR/26-27/0001'))] },
    counter: { ok: true, totalPaise: 100, count: 1, rows: [dirty({ no: 'CSL/26-27/0001', docDate: '2026-11-18', amountPaise: 100, state: 'NO_RECEIPT', receiptNo: '' })] },
    legacy: { ok: true, available: true, totalPaise: 100, rows: [dirty({ jobId: 'WS-2026-001', typedPaise: 100, state: 'OPEN' })] },
    plan: { ok: true, plan: { invoices: [dirty({ jobId: 'WS-2025-001', legacyNo: 'SV/2025-26/0001', invoiceDate: '2026-02-01', totalPaise: 100 })], skipped: [] } }
  };
}

test('Y01 no customer name, mobile number, address or e-mail from any facade row reaches any screen: every tab, the bill detail and the old-advance dialog', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: dirtyOpts() });
  a.mount();
  await a.show();
  let all = a.rootHtml();
  for (const tab of ['svb-tab-advances', 'svb-tab-unbilled', 'svb-tab-bills', 'svb-tab-receipts', 'svb-tab-old', 'svb-tab-settings']) {
    await a.click(tab);
    all += a.rootHtml();
  }
  await a.click('svb-tab-bills');
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  all += a.layerHtml();
  await a.click('svb-bv-close');
  await a.click('svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  all += a.layerHtml();
  assert.ok(all.length > 5000);
  for (const v of Object.values(SENT)) assert.equal(all.includes(v), false, v);
  for (const k of Object.keys(LEAK)) assert.equal(all.toLowerCase().includes(k.toLowerCase() + '"'), false, k);
  assert.equal(/mobile|phone|custName|custMobile|custAddr/i.test(all.replace(/data-svs-field="[^"]*"/g, '')), false);
});

test('Y02 nothing person-like is sent to the facade: every call argument is a query, a session, a number or a typed business field', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: dirtyOpts() });
  a.mount();
  await a.show();
  for (const tab of ['svb-tab-advances', 'svb-tab-unbilled', 'svb-tab-bills', 'svb-tab-receipts', 'svb-tab-old']) await a.click(tab);
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  await a.click('svb-old-confirm-save');
  await a.click('svb-tab-settings');
  await a.click('svb-set-save');
  const text = JSON.stringify(a.billing.calls);
  for (const v of Object.values(SENT)) assert.equal(text.includes(v), false, v);
  assert.equal(/custName|custMobile|custAddr|custEmail|mobile|phone/.test(text), false);
});

test('Y03 hostile text in job labels, CCPT numbers, receipt references, bill names and numbers is escaped everywhere; no element is created from it', async () => {
  const bad1 = '<img src=x onerror=alert(1)>';
  const bad2 = '"><script>x()</script>';
  const bad3 = 'a`b${c}';
  const opts = {
    held: { ok: true, totalPaise: 1000, count: 1, rows: [{ jobId: 'WS-2026-001', label: bad1, netPaise: 1000, receipts: [bad2], oldestDocDate: '2026-11-01', ageDays: 17, jobState: 'OPEN' }] },
    unbilled: { ok: true, total: 1, rows: [{ jobId: 'WS-2026-001', label: bad2, jobStatus: 'OPEN', pieces: 1, costPaise: 5, oldestDocDate: '2026-11-17' }] },
    bills: { ok: true, total: 1, rows: [SAMPLE.bill('SV/2026-27/0001', { label: bad1, ccptInvoiceNo: bad2 })] },
    billViews: { 'SV/2026-27/0001': SAMPLE.billView('SV/2026-27/0001', { ccptInvoiceNo: bad2, discount: { totalPaise: 100, reason: bad1 }, bill: { supply: { recipientGstin: bad3 }, lines: [{ name: bad1, code: bad2, hsnSac: bad3, qty: 1, rateBp: 1800, taxablePaise: 1, cgstPaise: 0, sgstPaise: 0, igstPaise: 0, totalPaise: 1 }], totals: { totalPaise: 1 } } }) },
    receipts: { ok: true, total: 1, rows: [SAMPLE.receipt('SAR/26-27/0001', { payRef: bad3, jobId: bad1 })] },
    legacy: { ok: true, available: true, totalPaise: 100, rows: [{ jobId: bad1, typedPaise: 100, state: 'OPEN' }] },
    plan: { ok: true, plan: { invoices: [{ jobId: bad2, legacyNo: bad1, invoiceDate: bad3, totalPaise: 100 }], skipped: [] } }
  };
  const a = setup({ session: SESSIONS.owner, billingOpts: opts });
  a.mount();
  await a.show();
  for (const tab of ['svb-tab-advances', 'svb-tab-unbilled', 'svb-tab-bills', 'svb-tab-receipts', 'svb-tab-old']) {
    await a.click(tab);
    assert.equal(a.h.el.root.querySelectorAll('img').length, 0, tab);
    assert.equal(a.h.el.root.querySelectorAll('script').length, 0, tab);
  }
  await a.click('svb-tab-bills');
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  assert.equal(a.layer().querySelectorAll('img').length, 0);
  assert.equal(a.layer().querySelectorAll('script').length, 0);
  assert.ok(a.layerText().includes(bad1), 'the text is shown as text');
  assert.ok(a.layerText().includes(bad3));
  assert.equal(/<img|<script/.test(a.layerHtml()), false);
  assert.equal(a.area.internals.esc(bad1), '&lt;img src=x onerror=alert(1)&gt;');
  assert.equal(a.area.internals.esc(bad2), '&quot;&gt;&lt;script&gt;x()&lt;/script&gt;');
  assert.equal(a.area.internals.esc(bad3), 'a&#96;b${c}');
  assert.equal(a.area.internals.esc(null), '');
  assert.equal(a.area.internals.esc(0), '0');
});

test('Y04 every facade read made for a screen carries the user context with a readable session (money audit item 4); status is the only call without one', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: dirtyOpts() });
  a.mount();
  await a.show();
  for (const tab of ['svb-tab-advances', 'svb-tab-unbilled', 'svb-tab-bills', 'svb-tab-receipts', 'svb-tab-old']) await a.click(tab);
  await a.click('svb-tab-bills');
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  await a.click('svb-bv-close');
  const reads = a.billing.calls.filter((c) => c.name !== 'status');
  assert.ok(reads.length >= 9);
  for (const c of reads) {
    const ctx = c.args[c.args.length - 1];
    assert.ok(ctx && ctx.session && ctx.session.ok === true && ctx.session.tier === 'owner', c.name);
    assert.equal(ctx.stepUp, null, c.name + ': a read never carries a PIN stamp');
  }
  const names = Array.from(new Set(reads.map((c) => c.name))).sort();
  assert.deepEqual(names, ['advancesHeld', 'daySummary', 'getBill', 'legacyAdvances', 'listBills', 'listReceipts', 'planMigration', 'unbilledIssues', 'unreceiptedCounterSales']);
});

test('Y05 a Store Manager context is passed as a manager (never as the Owner); the facade is the authority and its refusal is shown', async () => {
  const a = setup({ session: SESSIONS.manager, billingOpts: dirtyOpts() });
  a.mount();
  await a.show();
  await a.click('svb-tab-advances');
  assert.equal(a.billing.last('advancesHeld').args[1].session.tier, 'manager');
  assert.equal(a.billing.last('advancesHeld').args[1].session.isOwner, false);
  a.billing.forced.listBills = { ok: false, code: 'NOT_ALLOWED' };
  await a.click('svb-tab-bills');
  assert.match(a.rootText(), /Your role cannot do this\. Ask the Store Manager or the Owner\./);
});

test('Y06 fail closed: a facade that throws, rejects or answers nonsense shows a plain message with the code; nothing throws out and the tabs stay', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.mount();
  await a.show();
  a.billing.forced.listBills = () => { throw new Error('boom'); };
  await a.click('svb-tab-bills');
  assert.match(a.rootText(), /Something went wrong\. Nothing was changed\. Code: SVB_BAD_REPLY\./);
  a.billing.forced.advancesHeld = () => Promise.reject(new Error('rejected'));
  await a.click('svb-tab-advances');
  assert.match(a.rootText(), /Something went wrong\. Nothing was changed\. Code: SVB_BAD_REPLY\./);
  a.billing.forced.unbilledIssues = 'nonsense';
  await a.click('svb-tab-unbilled');
  assert.match(a.rootText(), /Something went wrong\./);
  a.billing.forced.listReceipts = { ok: false, code: 'SOME_NEW_CODE' };
  await a.click('svb-tab-receipts');
  assert.match(a.rootText(), /Something went wrong\. Nothing was changed\. Code: SOME_NEW_CODE\./);
  assert.ok(a.find('svb-tab-today'));
});

test('Y07 a read answer that arrives after unmount changes nothing and throws nothing', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.mount();
  await a.show();
  let release;
  a.billing.forced.advancesHeld = () => new Promise((res) => { release = () => res({ ok: true, rows: [], totalPaise: 0, count: 0 }); });
  await a.click('svb-tab-advances');
  a.area.unmount();
  release();
  await flush();
  assert.equal(a.layer(), null);
});

test('Y08 the main UI is optional for lists; its dialogs are needed for the bill detail and the old-advance dialog; with a kit its money text and its error text are used', async () => {
  const a = setup({ session: SESSIONS.owner, ui: null, billingOpts: { held: SAMPLE.held, bills: { ok: true, total: 1, rows: [SAMPLE.bill('SV/2026-27/0001')] }, billViews: { 'SV/2026-27/0001': SAMPLE.billView('SV/2026-27/0001') } } });
  a.mount();
  await a.show();
  await a.click('svb-tab-advances');
  assert.ok(a.rootText().includes('Rs 1,300.00'));
  await a.click('svb-tab-bills');
  const r = await a.area.internals.dispatch('svb-bill-view', 'SV/2026-27/0001');
  assert.equal(r.code, 'SVB_CORE_MISSING');
  assert.ok(a.calls.toast.includes('Billing is not available in this build. Nothing was changed.'));
  assert.equal(a.billing.count('getBill'), 0);
  const b = setup({ session: SESSIONS.owner, ui: 'fake', kit: { money: (p) => 'INR ' + p, errText: (r2) => 'KIT SAYS ' + r2.code }, billingOpts: { held: SAMPLE.held } });
  b.mount();
  await b.show();
  await b.click('svb-tab-advances');
  assert.ok(b.rootText().includes('INR 130000'));
  b.billing.forced.listBills = { ok: false, code: 'CCPT_NUMBER_USED' };
  await b.click('svb-tab-bills');
  assert.ok(b.rootText().includes('KIT SAYS CCPT_NUMBER_USED'));
  b.billing.forced.listReceipts = { ok: false, code: 'NOT_ALLOWED' };
  await b.click('svb-tab-receipts');
  assert.ok(b.rootText().includes('Your role cannot do this.'), 'the area own text wins for the codes it owns');
});

test('Y09 print uses the print right: the kit failure is shown; a missing report engine says printing is not available; nothing is printed twice', async () => {
  const a = setup({ session: SESSIONS.owner, ui: 'fake', kit: { print: () => Promise.resolve({ ok: false, code: 'SVB_PRINT_UNAVAILABLE' }) } });
  a.mount();
  await a.show();
  await a.click('svb-today-print');
  assert.ok(a.calls.toast.includes('Printing is not available in this build.'));
  const b = setup({ session: SESSIONS.owner, ui: 'fake', kit: { print: () => { throw new Error('print broke'); } } });
  b.mount();
  await b.show();
  await b.click('svb-today-print');
  assert.match(b.calls.toast.join(' '), /Something went wrong\. Nothing was changed\. Code: SVB_BAD_REPLY\./);
});

test('Y10 a click on an id this file does not own, or a disabled control, does nothing; the dispatcher refuses an unknown id', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.mount();
  await a.show();
  const before = a.billing.calls.length;
  const r = await a.area.internals.dispatch('svb-job-bill-open', '');
  assert.equal(r.ok, false);
  assert.equal(a.billing.calls.length, before);
  assert.equal(typeof a.area.click, 'function');
});

test('Y11 the area reads the role fresh: a session switched to staff after the screen was drawn is refused on the next press, before any facade call', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { held: SAMPLE.held } });
  a.mount();
  await a.show();
  await a.click('svb-tab-advances');
  assert.ok(a.find('svb-adv-refund', 'WS-2026-001'));
  a.h.session = SESSIONS.tech;
  const r = await a.area.internals.dispatch('svb-adv-refund', 'WS-2026-001');
  assert.equal(r.code, 'SVB_ROLE_DENIED');
  assert.deepEqual(a.calls.openJob, []);
  a.h.session = SESSIONS.none;
  const p = await a.area.internals.dispatch('svb-today-print', '');
  assert.equal(p.ok, false);
  assert.deepEqual(a.calls.print, []);
});
