import test from 'node:test';
import assert from 'node:assert/strict';
import { makeBridge } from './lib/fix-s03-bridge-harness.mjs';

const TODAY = '2026-11-12';
const payrollRows = (rows, month = 'August') => ({ meta: { month, year: 2026 }, rows });
const busEvents = (b, type) => (b.get('saagar_bus') || []).filter((e) => e.type === type);

/* ---------- U14-02 / U10-F05 / CR-F1: tax payable ---------- */
test('U14-02: payroll figures are filed under the Payroll sheet month, wrong old entry repaired', () => {
  const b = makeBridge({
    payroll_suite_v1_2026: payrollRows([
      { name: 'A', pf: 1000, esic: 100, pt: 200 }, { name: 'B', pf: 500, esic: 50, pt: 200 }, { name: 'C', pf: 200, esic: 0, pt: 200 }]),
    saagar_tax_payable: { '2026-11': { month: '2026-11', pf: 1700, esic: 150, pt: 600, sources: ['payroll(2026-Aug)'] } }
  });
  b.run();
  const t = b.get('saagar_tax_payable');
  assert.equal(t['2026-08'].pf, 1700);
  assert.equal(t['2026-08'].esic, 150);
  assert.equal(t['2026-08'].pt, 600);
  assert.match(t['2026-08'].sources[0], /^payroll\(2026-Aug\)/);
  assert.equal(t['2026-11'], undefined);
  assert.ok(t._note);
});

test('U14-02: sheet month equal to today keeps the figures under today', () => {
  const b = makeBridge({ payroll_suite_v1_2026: payrollRows([{ name: 'A', pf: 1000, esic: 100, pt: 200 }], 'November') });
  b.run();
  const t = b.get('saagar_tax_payable');
  assert.equal(t['2026-11'].pf, 1000);
  assert.match(t['2026-11'].sources[0], /^payroll\(2026-Nov\)/);
});

test('U14-02: today keeps only the GST estimate when the sheet is another month', () => {
  const b = makeBridge({
    payroll_suite_v1_2026: payrollRows([{ name: 'A', pf: 1000, esic: 100, pt: 200 }]),
    gm_tax_feed: { '2026-11': { gstEstimate: 900 } }
  });
  b.run();
  const t = b.get('saagar_tax_payable');
  assert.equal(t['2026-11'].gstEstimate, 900);
  assert.equal(t['2026-11'].pf, 0);
  assert.equal(t['2026-08'].pf, 1000);
});

test('U10-F05: retired payroll rows are not counted', () => {
  const b = makeBridge({
    payroll_suite_v1_2026: payrollRows([
      { name: 'A', pf: 1000, esic: 100, pt: 200 }, { name: 'Gone', pf: 1320, esic: 0, pt: 200, active: false }])
  });
  b.run();
  const t = b.get('saagar_tax_payable')['2026-08'];
  assert.equal(t.pf, 1000);
  assert.equal(t.pt, 200);
});

test('CR-F1: employer share is added when rows carry pfER/esicER, and labelled', () => {
  const b = makeBridge({
    payroll_suite_v1_2026: payrollRows([
      { name: 'A', pf: 1000, pfER: 1083, esic: 100, esicER: 400, pt: 200 }, { name: 'Gone', pf: 50, pfER: 60, esic: 5, esicER: 6, pt: 0, active: false }])
  });
  b.run();
  const t = b.get('saagar_tax_payable')['2026-08'];
  assert.equal(t.pf, 2083);
  assert.equal(t.esic, 500);
  assert.equal(t.pfEmployee, 1000);
  assert.equal(t.pfEmployer, 1083);
  assert.equal(t.esicEmployee, 100);
  assert.equal(t.esicEmployer, 400);
  assert.match(t.sources[0], /employee\+employer$/);
});

test('CR-F1: rows without employer fields say employee share only', () => {
  const b = makeBridge({ payroll_suite_v1_2026: payrollRows([{ name: 'A', pf: 1000, esic: 100, pt: 200 }]) });
  b.run();
  const t = b.get('saagar_tax_payable')['2026-08'];
  assert.equal(t.pf, 1000);
  assert.match(t.sources[0], /employee share only$/);
  assert.equal(t.pfEmployer, undefined);
});

/* ---------- U14-03 / U09-F04 / U09-F03: attendance feed ---------- */
function dsr(day, name, extra = {}) {
  return [`saagar_dsr_${day}_${name.replace(/ /g, '_')}`, Object.assign({ date: day, staffName: name, submitted: true, sales: [], nonpurch: [] }, extra)];
}

test('U14-03/U09-F04/U09-F03: feed is rebuilt from source records', () => {
  const init = {};
  ['03', '04', '05', '06', '09', '10', '11'].forEach((d) => { const [k, v] = dsr(`2026-11-${d}`, 'Lakshay Verma'); init[k] = v; });
  const [k8, v8] = dsr('2026-11-08', 'Lakshay Verma', { submitted: false }); init[k8] = v8;
  init.leavedesk_v3 = {
    employees: [],
    leaves: {
      '2026-11-02': [{ staffName: 'Sandeep Gaikwad', type: 'full_day', status: 'approved' }],
      '2026-11-11': [{ staffName: 'Arjun Pawar', type: 'half_day' }],
      '2026-11-10': [{ staffName: 'Pending Person', type: 'full_day', status: 'pending' }, { staffName: 'Rejected Person', type: 'full_day', status: 'rejected' }],
      '2026-12-14': [{ staffName: 'Future Person', type: 'full_day', status: 'approved' }]
    }
  };
  const b = makeBridge(init);
  b.run();
  let f = b.get('saagar_payroll_attendance_feed');
  assert.equal(f['2026-11']['lakshay verma'].present, 7);
  assert.equal(f['2026-11']['lakshay verma'].dsrDays, 7);
  assert.equal(f['2026-11']['sandeep gaikwad'].leave, 1);
  assert.equal(f['2026-11']['arjun pawar'].half, 1);
  assert.equal(f['2026-11']['pending person'], undefined);
  assert.equal(f['2026-11']['rejected person'], undefined);
  assert.equal(f['2026-12']['future person'].leave, 1);
  /* idle cycles write nothing */
  const before = b.writes.saagar_payroll_attendance_feed;
  b.run(); b.run();
  assert.equal(b.writes.saagar_payroll_attendance_feed, before);
  assert.deepEqual(b.get('saagar_payroll_attendance_feed'), f);
  /* removed leave disappears */
  const lv = b.get('leavedesk_v3'); delete lv.leaves['2026-11-02']; b.set('leavedesk_v3', lv);
  b.run();
  f = b.get('saagar_payroll_attendance_feed');
  assert.equal(f['2026-11']['sandeep gaikwad'], undefined);
});

/* ---------- U14-05: deactivated staff ---------- */
test('U14-05: inactive staff leave cros and DSR list, are flagged in Leave; reactivation restores', () => {
  const b = makeBridge({
    saagar_employee_master_v1: [{ name: 'A' }, { name: 'B', active: false }],
    saagar_dsr_staff: ['A', 'B', 'Local Only'],
    saagar_cros: ['A', 'B'],
    leavedesk_v3: { employees: [{ name: 'A' }, { name: 'B' }], leaves: {} }
  });
  b.run();
  assert.deepEqual(b.get('saagar_cros'), ['A']);
  assert.deepEqual(b.get('saagar_dsr_staff'), ['A', 'Local Only']);
  const emps = b.get('leavedesk_v3').employees;
  assert.equal(emps.find((e) => e.name === 'B').active, false);
  assert.equal('active' in emps.find((e) => e.name === 'A'), false);
  const m = b.get('saagar_employee_master_v1'); m.find((e) => e.name === 'B').active = true; b.set('saagar_employee_master_v1', m);
  b.run();
  assert.deepEqual(b.get('saagar_cros'), ['A', 'B']);
  assert.ok(b.get('saagar_dsr_staff').includes('B'));
  assert.equal('active' in b.get('leavedesk_v3').employees.find((e) => e.name === 'B'), false);
});

test('U14-05: Leave blob is not rewritten while Leave is the open module', () => {
  const b = makeBridge({
    saagar_employee_master_v1: [{ name: 'A' }, { name: 'B', active: false }],
    leavedesk_v3: { employees: [{ name: 'A' }, { name: 'B' }], leaves: {} }
  });
  b.setModule('leave');
  b.run();
  assert.equal(b.writes.leavedesk_v3, undefined);
  assert.equal('active' in b.get('leavedesk_v3').employees[1], false);
  b.setModule(null);
  b.run();
  assert.equal(b.get('leavedesk_v3').employees[1].active, false);
});

/* ---------- U07-F11: deleted closed service case ---------- */
const wscCase = (over = {}) => Object.assign({ id: 'WS-2026-2430', status: 'closed', closedAt: '2026-11-12T05:00:00Z', custName: 'Ravi',
  delivery: { finalAmt: 777, payMode: 'Cash', collectDate: TODAY } }, over);
const tomb = (over = {}) => Object.assign({ id: 'WS-2026-2430', at: '2026-11-12T06:00:01.000Z', by: 'Owner', was: 'closed', ownerPin: true,
  reason: 'wrong entry', finalAmt: 777, payMode: 'Cash', collectDate: TODAY, ledgerRef: 'wsc_WS-2026-2430' }, over);
const svcSeed = (over = {}) => Object.assign({ saagar_wsf_v2: [wscCase()], gm_expenses: [], tanishq_statements: { [TODAY]: { date: TODAY, closed: false } } }, over);

test('U07-F11: delivery event id is close specific and the row has a unique id', () => {
  const b = makeBridge(svcSeed());
  b.run();
  const led = b.get('gm_expenses');
  assert.equal(led.length, 1);
  assert.equal(led[0].sourceRef, 'wsc_WS-2026-2430');
  assert.equal(led[0].amount, 777);
  assert.equal(led[0].id, 'e_wsc_WS-2026-2430');
  assert.ok(busEvents(b, 'SERVICE_DELIVERED')[0].id.includes('@2026-11-12T05:00:00Z'));
});

test('U07-F11: a closed-and-PIN tombstone voids the row; a later case with the same id posts again', () => {
  const b = makeBridge(svcSeed());
  b.run();
  b.set('saagar_wsf_settings_v1', { deleted: [tomb()] });
  b.set('saagar_wsf_v2', []);
  b.run();
  let led = b.get('gm_expenses');
  assert.equal(led[0].void, true);
  assert.match(led[0].voidReason, /^Service case WS-2026-2430 was deleted/);
  assert.equal(led[0].editLog[led[0].editLog.length - 1].by, 'bridge');
  /* same id reused later (clock moves on) */
  b.setNow('2026-11-12T07:00:00.000Z');
  b.set('saagar_wsf_v2', [wscCase({ closedAt: '2026-11-12T06:50:00Z', delivery: { finalAmt: 1500, payMode: 'UPI', collectDate: TODAY } })]);
  b.run();
  led = b.get('gm_expenses');
  assert.equal(led.length, 2);
  assert.equal(led[0].void, true);
  assert.equal(led[1].amount, 1500);
  assert.equal(led[1].mode, 'UPI');
  assert.equal(led[1].id, 'e_wsc_WS-2026-2430_2');
  assert.notEqual(led[1].void, true);
  b.run();
  assert.notEqual(b.get('gm_expenses')[1].void, true);
});

test('U07-F11: tombstones without closed+PIN do not void', () => {
  [{ was: 'open' }, { ownerPin: false }].forEach((over) => {
    const b = makeBridge(svcSeed());
    b.run();
    b.set('saagar_wsf_settings_v1', { deleted: [tomb(over)] });
    b.set('saagar_wsf_v2', []);
    b.run();
    assert.notEqual(b.get('gm_expenses')[0].void, true);
  });
});

test('U07-F11: tombstone ledgerRef is honoured', () => {
  const b = makeBridge(svcSeed());
  b.run();
  b.set('saagar_wsf_settings_v1', { deleted: [tomb({ id: 'something-else', ledgerRef: 'wsc_WS-2026-2430' })] });
  b.set('saagar_wsf_v2', []);
  b.run();
  assert.equal(b.get('gm_expenses')[0].void, true);
});

test('U07-F11: row on a closed day is not voided and one high Expense exception is raised', () => {
  const b = makeBridge({
    gm_expenses: [{ id: 'e_wsc_X', type: 'income', date: '2026-11-10', amount: 500, mode: 'Cash', source: 'wsc', sourceRef: 'wsc_X', void: false, createdAt: '2026-11-10T05:00:00Z', editLog: [] }],
    tanishq_statements: { '2026-11-10': { date: '2026-11-10', closed: true } },
    saagar_wsf_settings_v1: { deleted: [tomb({ id: 'X', ledgerRef: 'wsc_X' })] }
  });
  b.run();
  assert.notEqual(b.get('gm_expenses')[0].void, true);
  const items = b.get('saagar_exceptions').items.filter((i) => i.area === 'Expense' && i.sev === 'high');
  assert.equal(items.length, 1);
  assert.match(items[0].msg, /closed or tax-locked/);
  assert.doesNotMatch(items[0].msg, /mismatch|open lead/i);
});

test('U07-F11: a tax-locked month is not voided either', () => {
  const b = makeBridge({
    gm_expenses: [{ id: 'e_wsc_X', type: 'income', date: '2026-10-20', amount: 500, mode: 'Cash', source: 'wsc', sourceRef: 'wsc_X', void: false, createdAt: '2026-10-20T05:00:00Z', editLog: [] }],
    gm_tax_feed: { '2026-10': { gstEstimate: 10 } },
    saagar_wsf_settings_v1: { deleted: [tomb({ id: 'X', ledgerRef: 'wsc_X' })] }
  });
  b.run();
  assert.notEqual(b.get('gm_expenses')[0].void, true);
  assert.equal(b.get('saagar_exceptions').items.filter((i) => i.area === 'Expense' && i.sev === 'high').length, 1);
});

test('U07-F11: a failed ledger write leaves the event unconsumed and the next cycle posts it', () => {
  const b = makeBridge(svcSeed());
  b.failNext('gm_expenses');
  b.run();
  assert.equal(b.get('gm_expenses').length, 0);
  assert.ok(!busEvents(b, 'SERVICE_DELIVERED')[0].consumed.expense);
  b.run();
  assert.equal(b.get('gm_expenses').length, 1);
  assert.equal(busEvents(b, 'SERVICE_DELIVERED')[0].consumed.expense, true);
});

test('U07-F11 (audit): a held old-format delivery event of a since-deleted case is not posted', () => {
  const b = makeBridge({
    saagar_bus: [{ id: 'SERVICE_DELIVERED:WS-2026-2430', type: 'SERVICE_DELIVERED', at: '2026-11-12T05:30:00.000Z', src: 'wsc', consumed: {}, rd: TODAY,
      payload: { cid: 'WS-2026-2430', date: TODAY, amount: 777, mode: 'Cash' } }],
    saagar_wsf_v2: [], gm_expenses: [], tanishq_statements: { [TODAY]: { date: TODAY, closed: false } },
    saagar_wsf_settings_v1: { deleted: [tomb()] }
  });
  b.run();
  assert.equal(b.get('gm_expenses').length, 0);
  assert.equal(busEvents(b, 'SERVICE_DELIVERED')[0].consumed.expense, true);
});

/* ---------- U14-01: QMS stub ---------- */
const qmsSeed = (over = {}) => Object.assign({
  retail_queue_management_v1: { cros: [{ id: 'c1', name: 'Asha' }], customers: [{ id: 'q1', name: 'Ravi', mobile: '9876543210', outcome: 'service', status: 'Closed',
    assignedCroId: 'c1', entryTime: '2026-11-12T04:00:00Z', closedAt: '2026-11-12T05:00:00Z' }] },
  saagar_wsf_v2: []
}, over);

test('U14-01: no stub is written while Service is open; it is written once Service is closed', () => {
  const b = makeBridge(qmsSeed());
  b.setModule('service');
  b.run();
  assert.deepEqual(b.get('saagar_wsf_v2'), []);
  assert.ok(!busEvents(b, 'SERVICE_CLOSED')[0].consumed.wsc);
  b.setModule(null);
  b.run();
  const w = b.get('saagar_wsf_v2');
  assert.equal(w.length, 1);
  assert.equal(w[0].id, 'wsc_q1');
  assert.equal(w[0]._bridgeStub, true);
  assert.equal(busEvents(b, 'SERVICE_CLOSED')[0].consumed.wsc, true);
  b.run();
  assert.equal(b.get('saagar_wsf_v2').length, 1);
});

test('U14-01: a failed stub write leaves the event unconsumed', () => {
  const b = makeBridge(qmsSeed());
  b.failNext('saagar_wsf_v2');
  b.run();
  assert.deepEqual(b.get('saagar_wsf_v2'), []);
  assert.ok(!busEvents(b, 'SERVICE_CLOSED')[0].consumed.wsc);
  b.run();
  assert.equal(b.get('saagar_wsf_v2').length, 1);
});

/* ---------- U06-F06 guard ---------- */
test('U06-F06: a closed case with zero final amount is never posted as income', () => {
  const b = makeBridge(svcSeed({ saagar_wsf_v2: [wscCase({ id: 'VER-Z', estTotal: 999, delivery: { finalAmt: 0, payMode: 'Cash', collectDate: TODAY } })] }));
  b.run();
  assert.equal(busEvents(b, 'SERVICE_DELIVERED').length, 0);
  assert.equal(b.get('gm_expenses').length, 0);
});

/* ---------- U14-06: CRO audit DSR sales ---------- */
test('U14-06: DSR sales count ignores zero-rupee and service rows', () => {
  const [k, v] = dsr(TODAY, 'Asha', { sales: [
    { amount: 1000, type: 'sale' }, { amount: 2000 }, { amount: 3000 }, { amount: 4000 }, { amount: 5000 },
    { amount: 0, type: 'service', source: 'qms' }], nonpurch: [{}, {}] });
  const b = makeBridge({ [k]: v });
  b.run();
  const s = b.get('saagar_cro_audit_feed')[TODAY].asha;
  assert.equal(s.dsrSalesCount, 5);
  assert.equal(s.dsrSalesAmt, 15000);
  assert.equal(s.dsrServiceJobs, 1);
  assert.equal(s.dsrNonPurch, 2);
});

test('U14-06: a pre-existing feed with the old count is corrected on the first cycle', () => {
  const [k, v] = dsr('2026-11-10', 'Asha', { sales: [{ amount: 100 }, { amount: 0, type: 'service' }] });
  const b = makeBridge({ [k]: v, saagar_cro_audit_feed: { '2026-11-10': { asha: { cro: 'Asha', date: '2026-11-10', dsrSubmitted: true, dsrSalesCount: 6, dsrSalesAmt: 100 } } } });
  b.run();
  const f = b.get('saagar_cro_audit_feed');
  assert.equal(f['2026-11-10'].asha.dsrSalesCount, 1);
  assert.equal(f._salesV2, true);
});

/* ---------- U14-07 / U14-08: exceptions ---------- */
test('U14-07: held delivery income shows in exceptions and clears after the day is reopened', () => {
  const b = makeBridge(svcSeed({ tanishq_statements: { [TODAY]: { date: TODAY, closed: true } } }));
  b.run();
  assert.equal(b.get('gm_expenses').length, 0);
  let it = b.get('saagar_exceptions').items.filter((i) => /waiting to be posted/.test(i.msg));
  assert.equal(it.length, 1);
  assert.equal(it[0].area, 'Cash');
  assert.doesNotMatch(it[0].msg, /mismatch|open lead/i);
  b.set('tanishq_statements', { [TODAY]: { date: TODAY, closed: false } });
  b.run();
  assert.equal(b.get('gm_expenses').length, 1);
  it = b.get('saagar_exceptions').items.filter((i) => /waiting to be posted/.test(i.msg));
  assert.equal(it.length, 0);
});

test('U14-08: active staff missing from Payroll are listed; inactive ones are not', () => {
  const b = makeBridge({
    saagar_employee_master_v1: [{ name: 'A' }, { name: 'B' }, { name: 'Cee' }, { name: 'Dee', active: false }],
    payroll_suite_v1_2026: payrollRows([{ name: 'A' }, { name: 'B' }])
  });
  b.run();
  const it = b.get('saagar_exceptions').items.filter((i) => i.area === 'Payroll');
  assert.equal(it.length, 1);
  assert.equal(it[0].sev, 'low');
  assert.match(it[0].msg, /Cee/);
  assert.doesNotMatch(it[0].msg, /Dee/);
  assert.doesNotMatch(it[0].msg, /mismatch|open lead/i);
});

test('U14-08: no item when every active person has a Payroll row', () => {
  const b = makeBridge({
    saagar_employee_master_v1: [{ name: 'A' }, { name: 'B' }],
    payroll_suite_v1_2026: payrollRows([{ name: 'A' }, { name: 'B' }])
  });
  b.run();
  assert.equal(b.get('saagar_exceptions').items.filter((i) => i.area === 'Payroll').length, 0);
});

/* ---------- S03-N02: nothing before the store is open ---------- */
test('S03-N02: no cycle and no timer work before the store is authoritative', () => {
  let auth = false; let cb = null;
  const store = { authoritative: () => auth, ready: () => auth, whenReady(f) { cb = f; } };
  const b = makeBridge({ saagar_employee_master_v1: [{ name: 'A' }] }, { readyState: 'complete', extra: { SaagarStore: store } });
  assert.equal(b.get('saagar_bridge_log'), null);
  b.run();
  assert.equal(b.get('saagar_bridge_log'), null);
  assert.equal(b.get('saagar_cros'), null);
  auth = true;
  cb();
  assert.deepEqual(b.get('saagar_cros'), ['A']);
  assert.match(b.get('saagar_bridge_log').map((x) => x.m).join('|'), /integration bridge v2 \(event bus\) ready/);
});

test('S03-N02: a store without authoritative() falls back to ready()', () => {
  let rdy = false; let cb = null;
  const store = { ready: () => rdy, whenReady(f) { cb = f; } };
  const b = makeBridge({ saagar_employee_master_v1: [{ name: 'A' }] }, { readyState: 'complete', extra: { SaagarStore: store } });
  b.run();
  assert.equal(b.get('saagar_cros'), null);
  rdy = true; cb();
  assert.deepEqual(b.get('saagar_cros'), ['A']);
});
