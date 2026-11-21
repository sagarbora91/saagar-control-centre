// Service wave 2, W-REP: the four list reports (day summary, advances held, parts issued not billed, revenue) and their CSV.
// P6 section 14 tests 40 to 58. Expected values are typed by hand from the fixtures (paise), not copied from the code's output.
import test from 'node:test';
import assert from 'node:assert/strict';
import { REPORT_SOURCE } from './lib/fix-s02-load.mjs';
import * as F from './lib/svc2-reports-fixtures.mjs';

const { plain, tableOf, tables, notes, empties, hdr, kv, kpi } = F;
const build = (type, data, role = 'owner', extra = {}) => plain(F.load(role).R._buildModel(type, Object.assign({ svcData: data }, F.ARGS[type] || {}, extra)));
const failCode = (m) => { const e = m.blocks.find((b) => b.t === 'empty'); const x = e && /\[RPT_([A-Z_]+)\]/.exec(e.text); return x ? x[1] : ''; };
const csvOf = (type, data, role = 'owner', extra = {}) => { const h = F.load(role); return h.R._blocksToCsv(h.R._buildModel(type, Object.assign({ svcData: data }, F.ARGS[type] || {}, extra))).text; };
const money = (n) => '\u20b9' + n;

// ---------------------------------------------------------------- day summary
test('T40 day summary: per-mode and per-kind sums, net, net cash; every foot is the sum of its printed rows', () => {
  const m = build('serviceDaySummary', F.dayData());
  assert.equal(hdr(m).title, 'SERVICE DAY SUMMARY');
  assert.equal(hdr(m).customerCopy, undefined);
  assert.equal(kpi(m, 'Receipts').value, money('2,460.00'));
  assert.equal(kpi(m, 'Refunds').value, money('50.00'));
  assert.deepEqual(kpi(m, 'Net money'), { label: 'Net money', value: money('2,410.00'), hero: true });
  assert.equal(kpi(m, 'Net cash').value, money('570.00'));
  assert.equal(kpi(m, 'Bills issued').value, '1');
  const [byMode, refunds, net, bills, notesT, list] = tables(m);
  assert.deepEqual(byMode.head[0], ['Mode', 'Advance', 'Balance', 'Counter', 'Total']);
  assert.deepEqual(byMode.body, [['Cash', money('500.00'), money('0.00'), money('120.00'), money('620.00')], ['UPI', money('0.00'), money('1,840.00'), money('0.00'), money('1,840.00')]]);
  assert.deepEqual(byMode.foot[0], ['TOTAL', money('500.00'), money('1,840.00'), money('120.00'), money('2,460.00')]);
  assert.deepEqual(byMode.raw.map((r) => r.slice(1)), [[50000, 0, 12000, 62000], [0, 184000, 0, 184000]]);
  assert.deepEqual(byMode.money, [1, 2, 3, 4]);
  assert.deepEqual(refunds.body, [['Cash', '1', money('50.00')]]);
  assert.deepEqual(refunds.numCols, [1]);
  assert.deepEqual(net.body, [['Cash', money('620.00'), money('50.00'), money('570.00')], ['UPI', money('1,840.00'), money('0.00'), money('1,840.00')]]);
  assert.deepEqual(net.foot[0], ['TOTAL', money('2,460.00'), money('50.00'), money('2,410.00')]);
  assert.deepEqual(list.body.map((r) => r[0]), ['SAR/26-27/0001', 'SRC/26-27/0001', 'SRC/26-27/0002', 'SRF/26-27/0001']);
  assert.deepEqual(list.foot[0], ['TOTAL', '', '', '', money('2,460.00'), money('50.00')]);
  assert.deepEqual(list.raw.map((r) => [r[4], r[5]]), [[50000, 0], [184000, 0], [12000, 0], [0, 5000]]);
  for (const t of [byMode, net, bills, list]) assert.ok(t.raw.every((r) => r.every(Number.isInteger)));
  assert.ok(notes(m).includes('Net cash is service receipts in cash minus service refunds in cash. It does not include the opening cash or any retail or other cash.'));
  const adv = m.blocks.filter((b) => b.t === 'kv').pop().pairs;
  assert.deepEqual(adv, [['Advances held (count)', '2'], ['Advances held (amount)', money('750.00')]]);
  assert.deepEqual(m.blocks.find((b) => b.t === 'sign').boxes.map((b) => b.role), ['Counted by', 'Checked by (Store Manager)', 'Owner']);
  void notesT;
});

test('T41 day summary: the Cash row is flagged; mode order Cash, UPI, Card, Bank transfer, Cheque, then others alphabetical', () => {
  const rows = ['Zed Wallet', 'Cheque', 'Bank', 'Card', 'UPI', 'Cash', 'Alpha Pay'].map((mode, i) => ({ receiptNo: 'SRC/26-27/000' + (i + 1), receiptKind: 'BALANCE', mode, amountPaise: 1000 * (i + 1), jobId: 'SO-' + i }));
  const m = build('serviceDaySummary', F.dayData({ receipts: rows, refunds: [], invoices: [], creditNotes: [] }));
  const net = tableOf(m, 1);
  assert.deepEqual(net.body.map((r) => r[0]), ['Cash', 'UPI', 'Card', 'Bank transfer', 'Cheque', 'Alpha Pay', 'Zed Wallet']);
  assert.deepEqual(net.flagRows, [true, false, false, false, false, false, false]);
  assert.equal(kpi(m, 'Net cash').value, money('60.00'));
});

test('T42 day summary: a cancelled bill is listed and flagged but not in the foot or the Bills issued tile', () => {
  const m = build('serviceDaySummary', F.dayData());
  const bills = tables(m)[3];
  assert.deepEqual(bills.body.map((r) => [r[0], r[3]]), [['SV/2026-27/0001', 'Issued'], ['SV/2026-27/0002', 'Cancelled']]);
  assert.deepEqual(bills.flagRows, [false, true]);
  assert.deepEqual(bills.foot[0], ['TOTAL (1)', '', '', '', money('2,340.00')]);
  assert.deepEqual(bills.raw.map((r) => r[4]), [234000, 0]);
  assert.deepEqual(bills.body.map((r) => r[2]), ['Our tax invoice', 'Our summary (CCPT bill)']);
  assert.equal(kpi(m, 'Bills issued').value, '1');
  assert.deepEqual(tables(m)[4].body, [['SCN/2026-27/0001', 'SV/2026-27/0001', money('373.00')]]);
});

test('T43 day summary: an empty day says so; a date after today is RPT_PERIOD_INVALID; a bad date too', () => {
  const m = build('serviceDaySummary', F.dayData({ receipts: [], refunds: [], invoices: [], creditNotes: [], advancesHeld: { count: 0, totalPaise: 0 } }));
  assert.ok(empties(m).includes('No service money was recorded on this day.'));
  assert.equal(tables(m).length, 0);
  assert.equal(failCode(build('serviceDaySummary', F.dayData({ date: '2026-11-19' }))), 'PERIOD_INVALID');
  assert.equal(failCode(build('serviceDaySummary', F.dayData({ date: '2026-02-30' }))), 'PERIOD_INVALID');
  assert.equal(failCode(build('serviceDaySummary', F.dayData({ date: undefined }))), 'PERIOD_INVALID');
  assert.equal(failCode(build('serviceDaySummary', F.dayData({ receipts: [{ receiptNo: 'SRC/26-27/0001', receiptKind: 'BALANCE', mode: 'Cash', amountPaise: 0, jobId: '' }] }))), 'READ_FAILED');
  assert.equal(failCode(build('serviceDaySummary', F.dayData({ refunds: [{ voucherNo: 'SRF/26-27/0001', mode: 'Cash', amountPaise: -5, jobId: '' }] }))), 'READ_FAILED');
});

test('T43b day summary: bills or credit notes the bill layer cannot give are shown as "not available", never as zero', () => {
  const m = build('serviceDaySummary', F.dayData({ invoicesAvailable: false, invoices: undefined, creditNotesAvailable: false, creditNotes: undefined, advancesHeld: { available: false } }));
  assert.equal(failCode(m), '');
  assert.equal(kpi(m, 'Bills issued').value, 'Not available');
  assert.ok(empties(m).includes('Bills issued: not available.'));
  assert.ok(empties(m).includes('Credit notes issued: not available.'));
  assert.deepEqual(m.blocks.filter((b) => b.t === 'kv').pop().pairs, [['Advances held', 'Not available']]);
});

test('T44 day summary: technician is refused; manager and owner build it', () => {
  assert.throws(() => F.load('technician').R._buildModel('serviceDaySummary', F.opts('serviceDaySummary')), /not available for your role/);
  for (const r of ['manager', 'owner']) assert.equal(failCode(build('serviceDaySummary', F.dayData(), r)), '');
});

test('T45 day summary: no customer field reaches the model even when the data carries them', () => {
  const d = F.dayData({ billTo: { name: 'MARK-NAME', mobile: 'MARK-MOBILE' }, custName: 'MARK-NAME', mobile: 'MARK-MOBILE', email: 'MARK-MAIL' });
  d.receipts[0].custName = 'MARK-NAME'; d.receipts[0].mobile = 'MARK-MOBILE'; d.invoices[0].billTo = { name: 'MARK-NAME' };
  assert.ok(!/MARK-/.test(JSON.stringify(build('serviceDaySummary', d))));
});

// ---------------------------------------------------------------- advances held
test('T46 advances held: split by origin, age from asOf, 31 days flagged and 30 not, foot, legacy tag and note', () => {
  const m = build('serviceAdvancesHeld', F.advData());
  assert.equal(hdr(m).period, 'as at Wednesday, 18 November 2026');
  assert.deepEqual(m.blocks.find((b) => b.t === 'kpi').items.map((i) => [i.label, i.value]), [['Advances held', '2'], ['Total held', money('500.00')], ['Oldest (days)', '31'], ['Old advances to confirm', '1']]);
  const [held, legacy] = tables(m);
  assert.deepEqual(held.head[0], ['Receipt no', 'Date', 'Job', 'Watch', 'Mode', 'Amount', 'Age (days)', 'Job status']);
  assert.deepEqual(held.body[0], ['SAR/26-27/0002', '2026-10-18', 'SO-5', 'Zed Chrono 7', 'Cash', money('200.00'), '31', 'Open']);
  assert.deepEqual(held.body[1], ['SAR/26-27/0003', '2026-10-19', 'SO-6', 'Zed Sport 2', 'UPI', money('300.00'), '30', 'Open']);
  assert.deepEqual(held.flagRows, [true, false]);
  assert.deepEqual(held.foot[0], ['', '', '', 'TOTAL (2)', '', money('500.00'), '', '']);
  assert.deepEqual(held.raw.map((r) => r[5]), [20000, 30000]);
  assert.deepEqual(held.money, [5]);
  assert.deepEqual(held.numCols, [6]);
  assert.deepEqual(legacy.body, [['-', '2026-09-01', 'SO-9', 'Zed Classic', '-', money('100.00'), '78', 'Open']]);
  const sec = m.blocks.find((b) => b.t === 'section' && b.tag);
  assert.deepEqual(sec.tag, { txt: 'Not posted', cls: 'warn' });
  assert.ok(notes(m).includes('These advances were typed on jobs before receipts existed. They may already be in the cash book. Nothing was posted for them. The Owner confirms each one.'));
  assert.ok(notes(m).includes('Advances are money held for jobs not yet billed. They are a liability, not income.'));
  assert.ok(!/MARK|mobile|custName/i.test(JSON.stringify(m)));
});

test('T47 advances held: nothing held prints the empty text', () => {
  const m = build('serviceAdvancesHeld', F.advData({ rows: [] }));
  assert.ok(empties(m).includes('No advances are being held.'));
  assert.equal(tables(m).length, 0);
  assert.equal(kpi(m, 'Oldest (days)').value, '-');
  assert.equal(failCode(build('serviceAdvancesHeld', F.advData({ asOf: '2026-11-19' }))), 'PERIOD_INVALID');
  assert.equal(failCode(build('serviceAdvancesHeld', F.advData({ rows: [{ receiptNo: '', origin: 'RECEIPT', date: '2026-10-01', jobId: 'SO-1', amountPaise: 100 }] }))), 'READ_FAILED');
});

// ---------------------------------------------------------------- revenue
test('T48 revenue: cancelled excluded and counted, credit notes subtracted, every table ties to the same net', () => {
  const m = build('serviceRevenue', F.revData());
  assert.equal(m.orientation, 'landscape');
  assert.deepEqual(m.blocks.find((b) => b.t === 'kpi').items.map((i) => [i.label, i.value]), [['Bills', '2'], ['Credit notes', '1'], ['Net taxable', money('2,183.33')], ['Net GST', money('373.00')], ['Net billed', money('2,557.00')]]);
  const [day, kind, rate, who] = tables(m);
  assert.deepEqual(day.body, [
    ['2026-11-10', '1', '0', money('916.66'), money('1,100.00'), money('0.00'), money('0.00'), money('2,016.66'), money('323.00'), money('0.34'), money('2,340.00')],
    ['2026-11-12', '1', '1', money('0.00'), money('500.00'), money('0.00'), money('-333.33'), money('166.67'), money('50.00'), money('0.33'), money('217.00')]]);
  assert.deepEqual(day.foot[0], ['TOTAL', '2', '1', money('916.66'), money('1,600.00'), money('0.00'), money('-333.33'), money('2,183.33'), money('373.00'), money('0.67'), money('2,557.00')]);
  assert.deepEqual(day.raw.map((r) => r[10]), [234000, 21700]);
  assert.deepEqual(kind.body, [['Parts', money('916.66'), money('-333.33'), money('583.33'), money('85.00'), '26.72%'], ['Labour', money('1,600.00'), money('0.00'), money('1,600.00'), money('288.00'), '73.28%'],
    ['Other', money('0.00'), money('0.00'), money('0.00'), money('0.00'), '0.00%'], ['Total', money('2,516.66'), money('-333.33'), money('2,183.33'), money('373.00'), '100.00%']]);
  assert.deepEqual(rate.body, [['12%', money('666.66'), money('-333.33'), money('333.33'), money('20.00'), money('20.00'), money('0.00'), money('40.00')],
    ['18%', money('1,850.00'), money('0.00'), money('1,850.00'), money('166.50'), money('166.50'), money('0.00'), money('333.00')]]);
  assert.deepEqual(rate.foot[0], ['TOTAL', money('2,516.66'), money('-333.33'), money('2,183.33'), money('186.50'), money('186.50'), money('0.00'), money('373.00')]);
  assert.deepEqual(who.body, [['Service centre (CCPT)', '1', money('500.00'), money('90.00'), money('590.00')], ['Us (not billed in CCPT)', '1', money('1,683.33'), money('283.00'), money('1,967.00')]]);
  assert.deepEqual(who.foot[0], ['TOTAL', '2', money('2,183.33'), money('373.00'), money('2,557.00')]);
  assert.equal(kv(m, 'Net taxable'), money('2,183.33'));
  assert.equal(kv(m, 'Net round off'), money('0.67'));
  assert.equal(kv(m, 'Net billed'), money('2,557.00'));
  assert.ok(notes(m).includes('Cancelled bills are not counted (1).'));
  assert.ok(notes(m).includes('This report is built from the bill records, not from the cash book. For jobs billed in CCPT the GST shown is from our bill summaries; CCPT issues the tax invoice.'));
  assert.ok(!JSON.stringify(m).includes('-0.00'));
});

test('T49 revenue: the share of net taxable uses integer rounding; a net of zero prints a dash', () => {
  const doc = (no, kind, taxable) => ({ invoiceNo: no, date: '2026-11-10', status: 'ISSUED', billedIn: 'SAAGAR', roundOffPaise: 0, lines: [{ kind, rateBp: 0, taxablePaise: taxable, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }] });
  const m = build('serviceRevenue', F.revData({ invoices: [doc('SV/2026-27/0001', 'PART', 1), doc('SV/2026-27/0002', 'LABOUR', 2)], creditNotes: [] }));
  assert.deepEqual(tables(m)[1].body.map((r) => r[5]), ['33.33%', '66.67%', '0.00%', '100.00%']);
  const z = build('serviceRevenue', F.revData({ invoices: [doc('SV/2026-27/0001', 'PART', 100)],
    creditNotes: [{ noteNo: 'SCN/2026-27/0001', date: '2026-11-11', invoiceNo: 'SV/2026-27/0001', billedIn: 'SAAGAR', roundOffPaise: 0, lines: [{ kind: 'PART', rateBp: 0, taxablePaise: 100, cgstPaise: 0, sgstPaise: 0, igstPaise: 0 }] }] }));
  assert.deepEqual(tables(z)[1].body.map((r) => r[5]), ['-', '-', '-', '-']);
});

test('T50 revenue: rates ascending; other-state data shows IGST values', () => {
  const line = (rate, taxable, igst) => ({ kind: 'PART', rateBp: rate, taxablePaise: taxable, cgstPaise: 0, sgstPaise: 0, igstPaise: igst });
  const m = build('serviceRevenue', F.revData({ invoices: [{ invoiceNo: 'SV/2026-27/0001', date: '2026-11-10', status: 'ISSUED', billedIn: 'SAAGAR', roundOffPaise: 0, lines: [line(2800, 10000, 2800), line(500, 20000, 1000), line(1800, 30000, 5400), line(250, 40000, 1000)] }], creditNotes: [] }));
  const rate = tables(m)[2];
  assert.deepEqual(rate.body.map((r) => r[0]), ['2.5%', '5%', '18%', '28%']);
  assert.deepEqual(rate.body.map((r) => r[6]), [money('10.00'), money('10.00'), money('54.00'), money('28.00')]);
  assert.deepEqual(rate.body.map((r) => r[4]), [money('0.00'), money('0.00'), money('0.00'), money('0.00')]);
  assert.deepEqual(rate.foot[0].slice(6), [money('102.00'), money('102.00')]);
});

test('T51 revenue: manager and owner only; default period is the current month; invalid dates refuse; the data period is the printed period', () => {
  assert.throws(() => F.load('technician').R._buildModel('serviceRevenue', F.opts('serviceRevenue')), /not available for your role/);
  for (const r of ['manager', 'owner']) assert.equal(failCode(build('serviceRevenue', F.revData(), r)), '');
  const noRange = F.revData({ from: undefined, to: undefined });
  const m = F.load('owner').R._buildModel('serviceRevenue', { svcData: noRange });
  assert.equal(plain(m).blocks[0].period, 'Sunday, 01 November 2026 to Monday, 30 November 2026');
  assert.equal(failCode(build('serviceRevenue', F.revData(), 'owner', { from: '2026-13-01', to: '2026-11-30' })), 'PERIOD_INVALID');
  assert.equal(failCode(build('serviceRevenue', F.revData(), 'owner', { from: '2026-11-30', to: '2026-11-01' })), 'PERIOD_INVALID');
  const shown = build('serviceRevenue', F.revData({ from: '2026-10-01', to: '2026-10-31' }), 'owner', { from: '2026-11-01', to: '2026-11-30' });
  assert.equal(hdr(shown).period, 'Thursday, 01 October 2026 to Saturday, 31 October 2026');
  const none = build('serviceRevenue', F.revData({ invoices: [], creditNotes: [] }));
  assert.ok(empties(none).includes('No bills were issued in this period.'));
  assert.equal(failCode(build('serviceRevenue', F.revData({ invoices: [{ invoiceNo: 'X', date: '2026-11-10', status: 'ISSUED', billedIn: 'SAAGAR', roundOffPaise: 100, lines: [] }] }))), 'READ_FAILED');
});

// ---------------------------------------------------------------- parts issued, not billed
test('T52 unbilled list: oldest first, rows over 7 days flagged, foot totals, warranty rows in the second table', () => {
  const m = build('serviceUnbilledIssues', F.unbilledData(), 'manager');
  assert.equal(m.orientation, 'landscape');
  const [open, warr] = tables(m);
  assert.deepEqual(open.head[0], ['Sr', 'Job', 'Watch', 'Job status', 'Part code', 'Description', 'Open qty', 'Issued on', 'Age (days)', 'Cost value']);
  assert.deepEqual(open.body, [['1', 'SO-7', 'Zed Chrono 7', 'Open', 'P-0001', 'Crown assembly', '1', '2026-11-10', '8', money('100.00')],
    ['2', 'SO-8', 'Zed Sport 2', 'Open', 'P-0002', 'Battery 377', '2', '2026-11-17', '1', money('91.00')]]);
  assert.deepEqual(open.flagRows, [true, false]);
  assert.deepEqual(open.foot[0], ['', '', '', '', '', 'TOTAL (2)', '3', '', '', money('191.00')]);
  assert.deepEqual(open.raw.map((r) => r[9]), [10000, 9100]);
  assert.deepEqual(warr.body.map((r) => [r[1], r[4]]), [['SO-9', 'P-0003']]);
  assert.ok(notes(m).includes('Warranty claims are not tracked yet. These parts were issued at no charge.'));
  assert.ok(notes(m).includes('Every part issued to a job must end as a bill line, a warranty claim line or a return to stock.'));
  assert.ok(notes(m).includes('Costs are shown excluding GST.'));
  assert.deepEqual(m.blocks.find((b) => b.t === 'kpi').items.map((i) => [i.label, i.value]), [['Jobs affected', '2'], ['Part lines', '2'], ['Units open', '3'], ['Value at cost', money('191.00')]]);
});

test('T53 unbilled list: a technician sees no cost column and no value tile; a hostile showCost option changes nothing; the CSV has no cost column', () => {
  for (const extra of [{}, { showCost: true, cost: true }]) {
    const m = build('serviceUnbilledIssues', F.unbilledData(), 'technician', extra);
    const t = tableOf(m);
    assert.ok(!t.head[0].includes('Cost value'));
    assert.equal(t.head[0].length, 9);
    assert.equal(kpi(m, 'Value at cost'), undefined);
    assert.ok(!t.money);
    assert.ok(notes(m).includes('Cost and value are shown to the Store Manager and the Owner only.'));
    assert.ok(!/9100|91\.00|10000|100\.00|191/.test(JSON.stringify(m)));
  }
  const csv = csvOf('serviceUnbilledIssues', F.unbilledData(), 'technician');
  assert.ok(!/Cost value/.test(csv) && !/91\.00/.test(csv));
  assert.ok(/Cost value/.test(csvOf('serviceUnbilledIssues', F.unbilledData(), 'manager')));
});

test('T54 unbilled list: nothing open prints the empty text; rows with qtyOpen 0 are dropped', () => {
  const m = build('serviceUnbilledIssues', F.unbilledData({ rows: [F.unbilledData().rows[3]] }));
  assert.ok(empties(m).includes('Every part issued to a job has been billed, claimed or returned.'));
  assert.equal(tables(m).length, 0);
  assert.equal(kpi(m, 'Part lines').value, '0');
  assert.equal(failCode(build('serviceUnbilledIssues', F.unbilledData({ rows: [{ jobId: 'SO-1', partCode: 'P', qtyOpen: 1, issuedDate: '2026-11-30', outcome: 'OPEN' }] }))), 'READ_FAILED');
});

// ---------------------------------------------------------------- privacy, csv, failures
test('T55 privacy: the four list models, built from hostile data, carry none of the extra fields', () => {
  const hostile = (d) => {
    const mark = { email: 'MARK-MAIL', custName: 'MARK-NAME', custMobile: 'MARK-MOBILE', billTo: { name: 'MARK-NAME' }, photo: 'MARK-PHOTO', note: 'MARK-NOTE' };
    Object.assign(d, mark);
    ['rows', 'receipts', 'refunds', 'invoices', 'creditNotes'].forEach((k) => { if (Array.isArray(d[k])) d[k].forEach((r) => Object.assign(r, mark)); });
    return d;
  };
  for (const t of F.LIST_TYPES) {
    const m = build(t, hostile(F.GOOD()[t]), 'owner');
    assert.equal(failCode(m), '', t);
    assert.ok(!/MARK-/.test(JSON.stringify(m)), t);
  }
});

test('T56 CSV: each list type builds a CSV; amounts are plain numbers, no rupee sign, no plus; text is formula-guarded; negative amounts have no apostrophe', () => {
  for (const t of F.LIST_TYPES) {
    const csv = csvOf(t, F.GOOD()[t]);
    assert.ok(csv.startsWith('\ufeff'), t);
    assert.ok(!/\u20b9/.test(csv), t + ' rupee sign');
    assert.ok(!/"\+/.test(csv), t + ' plus');
  }
  const day = csvOf('serviceDaySummary', F.dayData());
  assert.ok(day.includes('"Cash","500.00","0.00","120.00","620.00"'));
  assert.ok(day.includes('"SRF/26-27/0001","Refund","SO-2","Cash","0.00","50.00"'));
  assert.ok(day.includes('"Cash","1","50.00"'));
  const rev = csvOf('serviceRevenue', F.revData());
  assert.ok(rev.includes('"-333.33"'));
  assert.ok(!rev.includes("'-333.33") && !rev.includes('"\'-'.concat('333')));
  assert.ok(rev.includes('"2026-11-10","1","0","916.66","1100.00","0.00","0.00","2016.66","323.00","0.34","2340.00"'));
  const unb = F.unbilledData(); unb.rows[0].desc = '=SUM(A1)';
  assert.ok(csvOf('serviceUnbilledIssues', unb, 'manager').includes('"\'=SUM(A1)"'));
  const adv = csvOf('serviceAdvancesHeld', F.advData());
  assert.ok(adv.includes('"SAR/26-27/0002","2026-10-18","SO-5","Zed Chrono 7","Cash","200.00","31","Open"'));
});

test('T57 only the four lists are CSV reports; the six papers are not', () => {
  const a = REPORT_SOURCE.indexOf('var CSV_REPORTS = {'), b = REPORT_SOURCE.indexOf('};', a);
  const body = REPORT_SOURCE.slice(a, b);
  for (const t of F.LIST_TYPES) assert.ok(new RegExp('\\b' + t + ': true').test(body), t);
  for (const t of F.CUSTOMER_TYPES) assert.ok(!body.includes(t), t);
  const base = ['payrollRegister', 'expenseMonthly', 'leaveRegister', 'stockRegister', 'svcStockList', 'svcPartLedger', 'svcReorderList', 'svcAdjustmentRegister', 'svcDefectiveRegister'];
  assert.equal((body.match(/: true/g) || []).length, base.length + 4);
});

test('T58 failure pass for the lists: no data, store failures, garbage', () => {
  const { R } = F.load('owner');
  for (const t of F.LIST_TYPES) {
    const base = F.ARGS[t] || {};
    assert.equal(failCode(plain(R._buildModel(t, Object.assign({}, base)))), 'NO_DATA', t);
    for (const code of ['CHAIN_BROKEN', 'STORE_CHAIN_BROKEN', 'SHARD_MISSING', 'WATERMARK_BEHIND', 'SEQ_GAP', 'SERIES_GAP', 'HEAD', 'HEAD_MISMATCH']) {
      const m = plain(R._buildModel(t, Object.assign({ svcData: { ok: false, code } }, base)));
      assert.equal(failCode(m), 'CHAIN_BROKEN', t + ' ' + code);
      assert.ok(!/[0-9]/.test(JSON.stringify(m).replace(/\\u[0-9a-f]{4}/gi, '')), t + ' no digit');
    }
    assert.equal(failCode(plain(R._buildModel(t, Object.assign({ svcData: { ok: false, code: 'WHATEVER' } }, base)))), 'READ_FAILED', t);
    assert.equal(failCode(plain(R._buildModel(t, Object.assign({ svcData: 'garbage' }, base)))), 'READ_FAILED', t);
    assert.equal(failCode(plain(R._buildModel(t, Object.assign({ svcData: { ok: true, kind: 'WRONG' } }, base)))), 'WRONG_DOC', t);
    assert.equal(failCode(plain(R._buildModel(t, Object.assign({ svcData: { ok: true, kind: F.GOOD()[t].kind, rows: 'x', receipts: 'x', invoices: 'x' } }, base)))) === '' ? 'built' : 'refused', 'refused', t);
    const m = plain(R._buildModel(t, Object.assign({ svcData: { ok: false, code: 'CHAIN_BROKEN' } }, base)));
    assert.equal(typeof R._modelRowCount(m), 'number');
    assert.equal(R._modelRowCount(m), 0);
  }
  // too many rows
  const many = Array.from({ length: 5001 }, (_, i) => ({ receiptNo: 'SRC/26-27/' + i, receiptKind: 'BALANCE', mode: 'Cash', amountPaise: 100, jobId: '' }));
  assert.equal(failCode(build('serviceDaySummary', F.dayData({ receipts: many }))), 'TOO_MANY_ROWS');
});

test('T58b (A-REP 2) advances held: when the old-advance list could not be read the count says "Not available", never a silent 0', () => {
  const m = build('serviceAdvancesHeld', F.advData({ legacyAvailable: false, rows: F.advData().rows.filter((r) => r.origin === 'RECEIPT') }));
  assert.equal(failCode(m), '');
  assert.equal(kpi(m, 'Old advances to confirm').value, 'Not available');
  assert.ok(notes(m).includes('Old advances to confirm: not available. The old advances could not be read.'));
  assert.equal(kpi(m, 'Total held').value, money('500.00'), 'Rs 200 + Rs 300, the receipt advances still print');
  const ok = build('serviceAdvancesHeld', F.advData({ legacyAvailable: true }));
  assert.equal(kpi(ok, 'Old advances to confirm').value, '1');
  assert.equal(kpi(build('serviceAdvancesHeld', F.advData()), 'Old advances to confirm').value, '1', 'field absent: as before');
});
