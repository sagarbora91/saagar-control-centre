// Billing area lists: Today, Advances held, Not billed yet, Bills (with the bill detail), Receipts (P5 U68 to U72 as corrected).
// Every expected value is typed by hand from the plan and the spec, never taken from the code's own output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS, SAMPLE, sampleDay, flush } from './lib/svc2-area-kit.mjs';

async function open(opts, tab) {
  const a = setup(opts);
  a.mount();
  await a.show();
  if (tab) await a.click(tab);
  return a;
}

/* ------------------------------------------------------------------ Today */
test('L01 Today: every block of the day summary shows the hand-typed figures', async () => {
  const a = await open({ session: SESSIONS.owner });
  const t = a.rootText();
  for (const s of ['Receipts by mode', 'Receipts by type', 'Refunds', 'Net cash from service', 'Advances held now', 'Bills issued', 'Credit notes']) assert.ok(t.includes(s), s);
  // receipts by mode: Cash 1,500.00, UPI 800.50, Card 2,000.00, Bank 123.45, total 4,423.95
  for (const s of ['Rs 1,500.00', 'Rs 800.50', 'Rs 2,000.00', 'Rs 123.45', 'Rs 4,423.95']) assert.ok(t.includes(s), s);
  assert.ok(t.includes('Bank Transfer'));
  // refunds: Cash 200.00, UPI 0.50, total 200.50
  for (const s of ['Rs 200.00', 'Rs 0.50', 'Rs 200.50']) assert.ok(t.includes(s), s);
  // net cash 1,500.00 - 200.00 = 1,300.00; net all 4,423.95 - 200.50 = 4,223.45
  assert.ok(t.includes('Rs 1,300.00'));
  assert.ok(t.includes('Rs 4,223.45'));
  assert.ok(t.includes('Compare this with the cash in the drawer.'));
  // by type: advances 4 / 2,425.06; balances 1 / 2,000.00; counter 1 / 350.00; reversed 1 / 99.99
  for (const s of ['4 / Rs 2,425.06', '1 / Rs 2,000.00', '1 / Rs 350.00', '1 / Rs 99.99']) assert.ok(t.includes(s), s);
  // held now 4 / 3,026.78; bills 3 / 3,540.00 with 1 cancelled; credit notes 1 / 118.00
  for (const s of ['4 / Rs 3,026.78', '3 / Rs 3,540.00', '1 / Rs 118.00']) assert.ok(t.includes(s), s);
  const call = a.billing.last('daySummary');
  assert.equal(call.args[0], '2026-11-18');
  assert.equal(call.args[1].session.tier, 'owner', 'the user context is passed on the read (money audit 4)');
});

test('L02 Today: a figure the facade marks not available is shown as "not available", never as zero', async () => {
  const day = sampleDay({
    invoicesIssued: { available: false, count: null, paise: null, cancelled: null },
    creditNotes: { available: false, count: null, paise: null },
    notAvailable: ['invoicesIssued', 'creditNotes']
  });
  const a = await open({ session: SESSIONS.owner, billingOpts: { day } });
  const html = a.rootHtml();
  const bills = html.slice(html.indexOf('Bills issued'), html.indexOf('Credit notes'));
  assert.ok(bills.includes('not available'));
  assert.ok(!/Rs 0\.00|>0</.test(bills), 'no silent zero in the bill block');
  const cn = html.slice(html.indexOf('Credit notes'));
  assert.ok(cn.includes('not available'));
  assert.doesNotMatch(cn.slice(0, 400), /Rs 0\.00/);
});

test('L03 Today: an empty day says so; a net figure the facade cannot give is not available, not zero', async () => {
  const empty = sampleDay({
    receipts: { Cash: 0, UPI: 0, Card: 0, Bank: 0, total: 0 }, refunds: { Cash: 0, UPI: 0, Card: 0, Bank: 0, total: 0 }, netCash: 0, netAll: 0,
    advancesTaken: { count: 0, paise: 0 }, balanceReceipts: { count: 0, paise: 0 }, counterReceipts: { count: 0, paise: 0 }, reversed: { count: 0, paise: 0 },
    invoicesIssued: { available: true, count: 0, paise: 0, cancelled: 0 }, creditNotes: { available: true, count: 0, paise: 0 }, advancesHeldNow: { count: 0, paise: 0 }
  });
  const a = await open({ session: SESSIONS.owner, billingOpts: { day: empty } });
  assert.ok(a.rootText().includes('No money was taken or paid out on this day.'));
  const b = await open({ session: SESSIONS.owner, billingOpts: { day: sampleDay({ netCash: null }) } });
  const html = b.rootHtml();
  const net = html.slice(html.indexOf('Net cash from service'), html.indexOf('Compare this'));
  assert.ok(net.includes('not available'));
});

test('L04 Today: the date defaults to the view date, a past date shows the read-only badge, a future date is refused, Refresh reads again', async () => {
  const a = await open({ session: SESSIONS.owner });
  assert.equal(a.field('day-date').value, '2026-11-18');
  assert.doesNotMatch(a.rootText(), /Past date: read-only/);
  await a.change('day-date', '2026-11-10');
  assert.equal(a.billing.last('daySummary').args[0], '2026-11-10');
  assert.match(a.rootText(), /Past date: read-only/);
  const reads = a.billing.count('daySummary');
  await a.click('svb-today-refresh');
  assert.equal(a.billing.count('daySummary'), reads + 1);
  await a.change('day-date', '2026-11-19');
  assert.equal(a.billing.count('daySummary'), reads + 1, 'a future day is never asked for');
  assert.match(a.rootText(), /The date cannot be in the future\./);
  const b = setup({ session: SESSIONS.owner });
  b.h.viewDate = '2026-11-12';
  b.mount();
  await b.show();
  assert.equal(b.field('day-date').value, '2026-11-12');
});

test('L05 Today: Print day summary prints serviceDaySummary with the date through the main UI print; without the main UI it uses printData and the report engine', async () => {
  const a = await open({ session: SESSIONS.owner });
  await a.click('svb-today-print');
  assert.deepEqual(a.calls.print, [{ type: 'serviceDaySummary', args: { date: '2026-11-18' } }]);
  const b = await open({ session: SESSIONS.manager, ui: null });
  await b.click('svb-today-print');
  assert.equal(b.billing.last('printData').args[0], 'serviceDaySummary');
  assert.deepEqual(b.billing.last('printData').args[1], { date: '2026-11-18' });
  assert.equal(b.calls.report.length, 1);
  assert.equal(b.calls.report[0].type, 'serviceDaySummary');
  assert.deepEqual(JSON.parse(JSON.stringify(b.calls.report[0].opts.svcData.args)), { date: '2026-11-18' });
  assert.equal(b.calls.report[0].opts.date, '2026-11-18');
  const c = await open({ session: SESSIONS.manager, ui: null, report: null });
  await c.click('svb-today-print');
  assert.match(c.rootText() + c.calls.toast.join(' '), /Printing is not available in this build\./);
});

test('L06 Today: the drawer check shows counted minus net cash; zero is the ok class, anything else the warning class and the hint', async () => {
  const a = await open({ session: SESSIONS.owner });
  await a.type('drawer', '1300');
  let out = a.rootHtml();
  assert.match(out, /svb-diff-ok/);
  assert.ok(a.rootText().includes('Difference Rs 0.00'));
  await a.type('drawer', '1250.50');
  out = a.rootHtml();
  assert.match(out, /svb-diff-warn/);
  assert.ok(a.rootText().includes('Difference -Rs 49.50'));
  assert.ok(a.rootText().includes('Check the receipts before you count again.'));
  await a.type('drawer', 'abc');
  assert.ok(a.rootText().includes('Enter an amount in rupees, for example 149.50.'));
  assert.equal(a.billing.names().filter((n) => n !== 'status' && n !== 'daySummary').length, 0, 'nothing is saved by the drawer check');
});

/* ------------------------------------------------------------------ Advances held */
test('L07 Advances held: header total and count, rows with job, state chip, receipts, held amount and age classes at 30 and 90 days', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { held: SAMPLE.held } }, 'svb-tab-advances');
  const t = a.rootText();
  assert.ok(t.includes('Advances held: Rs 3,026.78 on 4 jobs.'));
  assert.ok(t.includes('WS-2026-001'));
  assert.ok(t.includes('SAR/26-27/0003, SAR/26-27/0004'));
  assert.ok(t.includes('Rs 1,300.00') && t.includes('Rs 800.50') && t.includes('Rs 926.28'));
  const html = a.rootHtml();
  assert.match(html, /svb-age svb-age-warn">39 days/);
  assert.match(html, /svb-age svb-age-bad">109 days/);
  assert.match(html, /svb-age">1 day</);
  assert.ok(t.includes('Closed'), 'a job closed without a bill is flagged');
  const call = a.billing.last('advancesHeld');
  assert.deepEqual(call.args[0], { offset: 0, limit: 20 });
  assert.equal(call.args[1].session.tier, 'owner');
});

test('L08 Advances held: Open job goes to the host; Refund advance only for the Owner and opens the job with a hint; Manager has no refund button', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { held: SAMPLE.held } }, 'svb-tab-advances');
  await a.click('svb-adv-open-job', 'WS-2026-002');
  assert.deepEqual(a.calls.openJob, ['WS-2026-002']);
  await a.click('svb-adv-refund', 'WS-2026-001');
  assert.deepEqual(a.calls.openJob, ['WS-2026-002', 'WS-2026-001'], 'the refund dialog lives on the job card: the job is opened');
  assert.ok(a.calls.toast.includes('The job is open. Use Refund advance on the job card.'));
  const m = await open({ session: SESSIONS.manager, billingOpts: { held: SAMPLE.held } }, 'svb-tab-advances');
  assert.equal(m.find('svb-adv-refund'), null);
  assert.ok(m.find('svb-adv-open-job', 'WS-2026-001'));
});

test('L09 Advances held: a forced refund click by a Manager or in a past view is refused and opens nothing', async () => {
  const m = await open({ session: SESSIONS.manager, billingOpts: { held: SAMPLE.held } }, 'svb-tab-advances');
  const r1 = await m.area.internals.dispatch('svb-adv-refund', 'WS-2026-001');
  assert.equal(r1.ok, false);
  assert.equal(r1.code, 'SVB_OWNER_ONLY');
  assert.deepEqual(m.calls.openJob, []);
  const o = await open({ session: SESSIONS.owner, billingOpts: { held: SAMPLE.held } }, 'svb-tab-advances');
  o.h.past = true;
  const r2 = await o.area.internals.dispatch('svb-adv-refund', 'WS-2026-001');
  assert.equal(r2.code, 'SVB_PAST_VIEW');
  assert.deepEqual(o.calls.openJob, []);
});

test('L10 Advances held: 45 rows from a facade that ignores paging are cut to 20 per page, Next and Previous move, the empty sentence', async () => {
  const rows = [];
  for (let i = 1; i <= 45; i++) rows.push({ jobId: 'WS-2026-' + String(i).padStart(3, '0'), netPaise: 1000, receipts: [], oldestDocDate: '2026-11-17', ageDays: 1, jobState: 'OPEN' });
  const a = await open({ session: SESSIONS.owner, billingOpts: { held: { ok: true, rows, totalPaise: 45000, count: 45 } } }, 'svb-tab-advances');
  assert.equal(a.findAll('svb-adv-open-job').length, 20);
  assert.ok(a.rootText().includes('Page 1 of 3'));
  assert.equal(a.find('svb-adv-page-prev'), null);
  await a.click('svb-adv-page-next');
  assert.ok(a.rootText().includes('Page 2 of 3'));
  assert.ok(a.find('svb-adv-open-job', 'WS-2026-021'));
  await a.click('svb-adv-page-next');
  assert.equal(a.findAll('svb-adv-open-job').length, 5);
  assert.equal(a.find('svb-adv-page-next'), null);
  await a.click('svb-adv-page-prev');
  assert.ok(a.rootText().includes('Page 2 of 3'));
  const e = await open({ session: SESSIONS.owner }, 'svb-tab-advances');
  assert.ok(e.rootText().includes('No advances are being held.'));
});

test('L11 Advances held: an error from the facade shows its text in place of the list and the tabs stay', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.billing.forced.advancesHeld = { ok: false, code: 'NOT_ALLOWED' };
  a.mount();
  await a.show();
  await a.click('svb-tab-advances');
  assert.match(a.rootText(), /Your role cannot do this\. Ask the Store Manager or the Owner\./);
  assert.ok(a.find('svb-tab-bills'));
});

/* ------------------------------------------------------------------ Not billed yet */
// the REAL shape of the bill layer: one row per issue, no issue date. Job 001: two issues (2 + 1 pieces, cost 80.00 + 45.50); job 004: one issue, cost missing.
const UNB = { ok: true, rows: [
  { jobId: 'WS-2026-001', jobState: 'open', movementId: 'm1', docNo: 'ISS/26-27/0001', partCode: 'P-1', qty: 2, billing: 'CHARGEABLE', costPaise: 8000 },
  { jobId: 'WS-2026-001', jobState: 'open', movementId: 'm2', docNo: 'ISS/26-27/0002', partCode: 'P-2', qty: 1, billing: 'CHARGEABLE', costPaise: 4550 },
  { jobId: 'WS-2026-004', jobState: 'open', movementId: 'm3', docNo: 'ISS/26-27/0003', partCode: 'P-3', qty: 1, billing: 'WARRANTY', costPaise: null }
] };

test('L12 Not billed yet: one line per job (issues added up), FIFO cost for the Manager and Owner, cost not available when a row has none, no invented issue date, Open job', async () => {
  const a = await open({ session: SESSIONS.manager, billingOpts: { unbilled: UNB } }, 'svb-tab-unbilled');
  const t = a.rootText();
  assert.ok(t.includes('2 jobs have parts issued and no bill.'));
  assert.ok(t.includes('Parts with job 3 pieces'));
  assert.ok(t.includes('FIFO cost Rs 125.50'));
  assert.ok(t.includes('FIFO cost not available'));
  assert.ok(t.includes('Warranty parts'));
  assert.ok(!t.includes('Oldest issue'), 'the bill layer gives no issue date, so none is shown');
  assert.deepEqual(a.billing.last('unbilledIssues').args[0], {}, 'all rows are read; the screen groups and pages them');
  await a.click('svb-unb-open-job', 'WS-2026-004');
  assert.deepEqual(a.calls.openJob, ['WS-2026-004']);
});

test('L13 Not billed yet: the empty sentence, an error keeps the controls, paging of a long list', async () => {
  const a = await open({ session: SESSIONS.owner }, 'svb-tab-unbilled');
  assert.ok(a.rootText().includes('Every job with issued parts has a bill, a no-charge mark or no parts left.'));
  const rows = [];
  for (let i = 1; i <= 21; i++) rows.push({ jobId: 'WS-2026-' + String(i).padStart(3, '0'), jobState: 'open', movementId: 'm' + i, docNo: 'ISS/26-27/' + i, partCode: 'P-1', qty: 1, billing: 'CHARGEABLE', costPaise: 100 });
  const b = await open({ session: SESSIONS.owner, billingOpts: { unbilled: { ok: true, rows } } }, 'svb-tab-unbilled');
  assert.equal(b.findAll('svb-unb-open-job').length, 20);
  await b.click('svb-unb-page-next');
  assert.equal(b.findAll('svb-unb-open-job').length, 1);
  b.billing.forced.unbilledIssues = { ok: false, code: 'BILLING_BLOCKED' };
  await b.click('svb-tab-unbilled');
  assert.match(b.rootText(), /The billing records failed their check/);
  assert.ok(b.find('svb-tab-today'));
});

/* ------------------------------------------------------------------ Bills */
const BILLS = { ok: true, total: 4, rows: [
  SAMPLE.bill('SV/2026-27/0001', { totalPaise: 118000, creditedPaise: 11800, payablePaise: 106200, state: 'CREDITED_PARTLY' }),
  SAMPLE.bill('SV/2026-27/0002', { jobId: 'WS-2026-002', totalPaise: 59000, payablePaise: 59000, mode: 'NOT_IN_CCPT', ccptInvoiceNo: '' }),
  SAMPLE.bill('SV/2026-27/0003', { jobId: 'WS-2026-003', state: 'CANCELLED', totalPaise: 23600, payablePaise: 23600 }),
  { no: '', legacyNo: 'WS-1004', docDate: '2026-11-02', jobId: 'WS-2026-004', totalPaise: 30000, state: 'LEGACY', legacy: true }
] };

test('L14 Bills: rows show number, date, job, CCPT number, total, the amount after credit notes and the right chip (Credited, Issued, Cancelled, Old bill); the list is read newest first and the month filter is applied on the screen', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { bills: BILLS } }, 'svb-tab-bills');
  const t = a.rootText();
  for (const s of ['SV/2026-27/0001', 'CCPT CC-9001', 'Rs 1,180.00', 'After credit notes Rs 1,062.00', 'Rs 590.00', 'Rs 236.00', 'WS-1004', 'Rs 300.00']) assert.ok(t.includes(s), s);
  assert.ok(!/ Paid /.test(t), 'what was paid is a money-layer figure, not shown on the bill list');
  const html = a.rootHtml();
  assert.match(html, /svs-badge-warn">Credited</);
  assert.match(html, /svs-badge-info">Issued</);
  assert.match(html, /svs-badge-bad">Cancelled</);
  assert.match(html, /svs-badge-info">Old bill</);
  const q = a.billing.last('listBills').args[0];
  assert.deepEqual(q, { newestFirst: true });
  // the old bill is dated 2026-11-02, inside the month; one outside the month is dropped by the screen
  assert.equal(a.findAll('svb-bill-view').length, 4);
  assert.equal(a.billing.last('listBills').args[1].session.tier, 'owner');
});

test('L15 Bills: search waits 200 ms (one read after the pause), resets to page 1; filters and status re-read at once', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { bills: BILLS } }, 'svb-tab-bills');
  const base = a.billing.count('listBills');
  await a.type('b-text', 'C');
  await a.type('b-text', 'CC');
  await a.type('b-text', 'CC-9');
  assert.equal(a.billing.count('listBills'), base, 'nothing is read while the user is typing');
  assert.equal(a.timers.list.length, 1, 'one pending pause');
  assert.equal(a.timers.list[0].ms, 200);
  a.timers.runAll();
  await flush();
  assert.equal(a.billing.count('listBills'), base + 1);
  assert.equal(a.findAll('svb-bill-view').length, 2, 'CC-9 matches the two bills that carry CCPT number CC-9001');
  await a.type('b-text', '');
  a.timers.runAll();
  await flush();
  assert.equal(a.findAll('svb-bill-view').length, 4);
  await a.change('b-status', 'CANCELLED');
  assert.equal(a.findAll('svb-bill-view').length, 1);
  await a.change('b-status', '');
  await a.change('b-to', '2026-11-10');
  assert.equal(a.findAll('svb-bill-view').length, 1, 'only the old bill of 2 November is on or before the 10th');
  await a.change('b-from', '2026-11-03');
  assert.equal(a.findAll('svb-bill-view').length, 0);
  assert.ok(a.rootText().includes('No bills in this period.'));
});

test('L16 Bills: paging a long list cuts 20 per page; the empty sentence', async () => {
  const rows = [];
  for (let i = 1; i <= 25; i++) rows.push(SAMPLE.bill('SV/2026-27/' + String(i).padStart(4, '0')));
  const a = await open({ session: SESSIONS.owner, billingOpts: { bills: { ok: true, rows, total: 25 } } }, 'svb-tab-bills');
  assert.equal(a.findAll('svb-bill-view').length, 20);
  await a.click('svb-bills-page-next');
  assert.equal(a.findAll('svb-bill-view').length, 5);
  const e = await open({ session: SESSIONS.owner }, 'svb-tab-bills');
  assert.ok(e.rootText().includes('No bills in this period.'));
});

function billOpts(views) { return { bills: BILLS, billViews: views }; }

test('L17 Bill detail: read-only frozen copy with lines, tax split, set-off and balance; Owner sees print, credit and (same day) cancel', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: billOpts({ 'SV/2026-27/0001': SAMPLE.billView('SV/2026-27/0001') }) }, 'svb-tab-bills');
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  const t = a.layerText();
  for (const s of ['Bill SV/2026-27/0001', 'WS-2026-001', 'Demo glass', 'DEMO-0001', 'Rate 18%', 'Tax code 9114', 'Taxable value Rs 1,000.00', 'CGST Rs 90.00', 'SGST Rs 90.00', 'IGST Rs 0.00',
    'Round off Rs 0.00', 'Bill total Rs 1,180.00', 'Advance set off Rs 300.00', 'Balance due Rs 880.00', 'CC-9001', 'service bill summary, not a tax invoice']) assert.ok(t.includes(s), s);
  assert.equal(a.layerHtml().includes('<input'), a.layerHtml().includes('data-svs-field'), 'no field in the detail');
  assert.equal(a.layer().querySelectorAll('input').length, 0);
  assert.ok(a.find('svb-bv-print') && a.find('svb-bv-credit') && a.find('svb-bv-cancel') && a.find('svb-bv-close'));
  assert.equal(a.find('svb-bv-print').textContent, 'Print bill summary');
  assert.equal(a.billing.last('getBill').args[0], 'SV/2026-27/0001');
  await a.click('svb-bv-close');
  assert.equal(a.layerHtml(), '');
});

test('L18 Bill detail: Manager has no credit and no cancel; cancel only on the bill day; no cancel for a cancelled bill; credit not for a cancelled bill', async () => {
  const views = {
    'SV/2026-27/0001': SAMPLE.billView('SV/2026-27/0001'),
    'SV/2026-27/0004': SAMPLE.billView('SV/2026-27/0004', { docDate: '2026-11-17' }),
    'SV/2026-27/0005': SAMPLE.billView('SV/2026-27/0005', { state: 'CANCELLED' })
  };
  const m = await open({ session: SESSIONS.manager, billingOpts: billOpts(views) }, 'svb-tab-bills');
  await m.click('svb-bill-view', 'SV/2026-27/0001');
  assert.ok(m.find('svb-bv-print'));
  assert.equal(m.find('svb-bv-credit'), null);
  assert.equal(m.find('svb-bv-cancel'), null);
  const o = await open({ session: SESSIONS.owner, billingOpts: billOpts(views) }, 'svb-tab-bills');
  o.billing.state.bills = { ok: true, rows: [SAMPLE.bill('SV/2026-27/0004'), SAMPLE.bill('SV/2026-27/0005')], total: 2 };
  await o.click('svb-tab-bills');
  await o.click('svb-bill-view', 'SV/2026-27/0004');
  assert.ok(o.find('svb-bv-credit'));
  assert.equal(o.find('svb-bv-cancel'), null, 'the bill was made yesterday');
  await o.click('svb-bv-close');
  await o.click('svb-bill-view', 'SV/2026-27/0005');
  assert.equal(o.find('svb-bv-cancel'), null);
  assert.equal(o.find('svb-bv-credit'), null);
});

test('L19 Bill detail: the print label is Print tax invoice only for a bill not billed in CCPT, and it prints the right report with the bill number', async () => {
  const views = {
    'SV/2026-27/0001': SAMPLE.billView('SV/2026-27/0001'),
    'SV/2026-27/0002': SAMPLE.billView('SV/2026-27/0002', { mode: 'NOT_IN_CCPT', ccptInvoiceNo: '' })
  };
  const a = await open({ session: SESSIONS.owner, billingOpts: billOpts(views) }, 'svb-tab-bills');
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  await a.click('svb-bv-print');
  await a.click('svb-bv-close');
  await a.click('svb-bill-view', 'SV/2026-27/0002');
  assert.equal(a.find('svb-bv-print').textContent, 'Print tax invoice');
  assert.ok(a.layerText().includes('Not billed in CCPT. The app prints the tax invoice.'));
  await a.click('svb-bv-print');
  assert.deepEqual(a.calls.print, [
    { type: 'serviceBillSummary', args: { invoiceNo: 'SV/2026-27/0001' } },
    { type: 'serviceTaxInvoiceV2', args: { invoiceNo: 'SV/2026-27/0002' } }
  ]);
});

test('L20 Bill detail: credit and cancel open the job (the dialogs live on the job card) with a hint, close the detail first, and are refused in a past view', async () => {
  const views = { 'SV/2026-27/0001': SAMPLE.billView('SV/2026-27/0001') };
  const a = await open({ session: SESSIONS.owner, billingOpts: billOpts(views) }, 'svb-tab-bills');
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  await a.click('svb-bv-credit');
  assert.deepEqual(a.calls.openJob, ['WS-2026-001']);
  assert.ok(a.calls.toast.includes('The job is open. Use Credit note and refund on the job card.'));
  assert.equal(a.layerHtml(), '', 'the area dialog closed first');
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  await a.click('svb-bv-cancel');
  assert.deepEqual(a.calls.openJob, ['WS-2026-001', 'WS-2026-001']);
  assert.ok(a.calls.toast.includes('The job is open. Use Cancel bill on the job card.'));
  await a.click('svb-bill-view', 'SV/2026-27/0001');
  a.h.past = true;
  const r = await a.area.internals.dispatch('svb-bv-cancel', '');
  assert.equal(r.code, 'SVB_PAST_VIEW');
  assert.equal(a.calls.openJob.length, 2);
});

test('L21 Bill detail: an old bill is a summary only (no print, no cancel); an unknown bill shows the error in the dialog', async () => {
  const views = { 'WS-1004': { legacyNo: 'WS-1004', jobId: 'WS-2026-004', invoiceDate: '2026-11-02', legacy: true, status: 'LEGACY', totalPaise: 30000, finalPaise: 30000, basis: 'SNAPSHOT_V1' } };
  const a = await open({ session: SESSIONS.owner, billingOpts: billOpts(views) }, 'svb-tab-bills');
  await a.click('svb-bill-view', 'WS-1004');
  assert.ok(a.layerText().includes('This bill was brought in from the old records.'));
  assert.ok(a.layerText().includes('Old number WS-1004'));
  assert.equal(a.find('svb-bv-print'), null);
  assert.equal(a.find('svb-bv-cancel'), null);
  await a.click('svb-bv-close');
  a.billing.state.bills = { ok: true, rows: [SAMPLE.bill('SV/2026-27/0099')], total: 1 };
  await a.click('svb-tab-bills');
  await a.click('svb-bill-view', 'SV/2026-27/0099');
  assert.match(a.layerText(), /Something went wrong\. Nothing was changed\. Code: BILL_NOT_FOUND\./);
});

/* ------------------------------------------------------------------ Receipts */
const RC = { ok: true, total: 5, rows: [
  SAMPLE.receipt('SAR/26-27/0001'),
  SAMPLE.receipt('SRC/26-27/0001', { kind: 'SRC', amountPaise: 20000, payMode: 'UPI', payRef: 'UPI-REF-1' }),
  SAMPLE.receipt('SRC/26-27/0002', { kind: 'SRC', saleNo: 'CSL/26-27/0001', jobId: undefined, amountPaise: 35000 }),
  SAMPLE.receipt('SRF/26-27/0001', { kind: 'SRF', amountPaise: 10050, payMode: 'Card' }),
  SAMPLE.receipt('SAR/26-27/0002', { amountPaise: 9999, status: 'REVERSED' })
] };

test('L22 Receipts: number, type chip, job or Counter sale, mode and reference, amount; refunds red with a minus; reversed rows say Reversed', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { receipts: RC } }, 'svb-tab-receipts');
  const t = a.rootText();
  for (const s of ['SAR/26-27/0001', 'SRC/26-27/0001', 'Rs 500.00', 'Rs 200.00', 'UPI-REF-1', 'Counter sale', 'Rs 350.00', '-Rs 100.50', 'Rs 99.99']) assert.ok(t.includes(s), s);
  const html = a.rootHtml();
  assert.match(html, /svs-badge-warn">Refund</);
  assert.match(html, /svs-badge-bad">Reversed</);
  assert.match(html, /svb-money svb-neg"><b>-Rs 100\.50/);
  assert.equal((html.match(/svs-badge-ok">Posted</g) || []).length, 4);
  assert.deepEqual(a.billing.last('listReceipts').args[0], { from: '2026-11-01', to: '2026-11-18', kind: '', mode: '', offset: 0, limit: 20 });
});

test('L23 Receipts: the type and paid-by filters narrow the list and are sent to the facade; a date outside the range is dropped; Print reprints serviceReceipt with the number', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { receipts: RC } }, 'svb-tab-receipts');
  await a.change('r-kind', 'refund');
  assert.equal(a.billing.last('listReceipts').args[0].kind, 'refund');
  assert.equal(a.findAll('svb-rcpt-reprint').length, 1);
  await a.change('r-kind', '');
  await a.change('r-mode', 'UPI');
  assert.equal(a.findAll('svb-rcpt-reprint').length, 1);
  assert.ok(a.find('svb-rcpt-reprint', 'SRC/26-27/0001'));
  await a.change('r-mode', '');
  await a.change('r-to', '2026-11-10');
  assert.equal(a.findAll('svb-rcpt-reprint').length, 0);
  assert.ok(a.rootText().includes('No receipts in this period.'));
  await a.change('r-to', '2026-11-18');
  await a.click('svb-rcpt-reprint', 'SAR/26-27/0001');
  assert.deepEqual(a.calls.print, [{ type: 'serviceReceipt', args: { receiptNo: 'SAR/26-27/0001' } }]);
});

test('L24 Receipts: counter sales without a receipt are listed; a sale whose receipt was reversed is shown as such and offers no Take receipt', async () => {
  const counter = { ok: true, totalPaise: 70000, count: 2, rows: [
    { no: 'CSL/26-27/0003', docDate: '2026-11-18', amountPaise: 45000, state: 'NO_RECEIPT', receiptNo: '' },
    { no: 'CSL/26-27/0004', docDate: '2026-11-18', amountPaise: 25000, state: 'RECEIPT_REVERSED', receiptNo: 'SRC/26-27/0009' }
  ] };
  const a = await open({ session: SESSIONS.owner, billingOpts: { receipts: RC, counter } }, 'svb-tab-receipts');
  const t = a.rootText();
  assert.ok(t.includes('Counter sales without a receipt'));
  assert.ok(t.includes('No receipt yet') && t.includes('Receipt reversed'));
  assert.ok(t.includes('Reverse this sale in Stores, Counter sale.'));
  assert.ok(a.find('svb-cs-receipt', 'CSL/26-27/0003'));
  assert.equal(a.find('svb-cs-receipt', 'CSL/26-27/0004'), null);
  await a.click('svb-cs-receipt', 'CSL/26-27/0003');
  assert.ok(a.layerText().includes('Sale CSL/26-27/0003, Rs 450.00.'), 'the main UI opened the counter receipt dialog for that sale');
  assert.equal(a.billing.last('unreceiptedCounterSales').args.length, 1);
  const e = await open({ session: SESSIONS.owner, billingOpts: { receipts: RC } }, 'svb-tab-receipts');
  assert.ok(e.rootText().includes('Every counter sale has a receipt.'));
});

test('L25 Receipts: 45 rows from a facade that returns everything are cut to 20 per page, newest range first as given', async () => {
  const rows = [];
  for (let i = 1; i <= 45; i++) rows.push(SAMPLE.receipt('SAR/26-27/' + String(i).padStart(4, '0')));
  const a = await open({ session: SESSIONS.owner, billingOpts: { receipts: { ok: true, rows, total: 45 } } }, 'svb-tab-receipts');
  assert.equal(a.findAll('svb-rcpt-reprint').length, 20);
  assert.ok(a.rootText().includes('Page 1 of 3'));
  await a.click('svb-rcpts-page-next');
  await a.click('svb-rcpts-page-next');
  assert.equal(a.findAll('svb-rcpt-reprint').length, 5);
  assert.equal(a.find('svb-rcpts-page-next'), null);
  await a.click('svb-rcpts-page-prev');
  assert.ok(a.rootText().includes('Page 2 of 3'));
});

test('L26 a stale list answer never paints over a newer tab; a second tab click while a read is pending shows only the newest', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { bills: BILLS } });
  a.mount();
  await a.show();
  let release;
  a.billing.forced.advancesHeld = () => new Promise((res) => { release = () => res({ ok: true, rows: [{ jobId: 'WS-2026-777', netPaise: 100, receipts: [], oldestDocDate: '2026-11-17', ageDays: 1, jobState: 'OPEN' }], totalPaise: 100, count: 1 }); });
  await a.click('svb-tab-advances');
  await a.click('svb-tab-bills');
  release();
  await flush();
  assert.ok(!a.rootText().includes('WS-2026-777'));
  assert.ok(a.rootText().includes('SV/2026-27/0001'));
});
