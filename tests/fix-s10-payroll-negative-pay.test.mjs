import test from 'node:test';
import assert from 'node:assert/strict';
import { createPayroll, loadState, row } from './lib/fix-s10-payroll-harness.mjs';

const advRec = (over = {}) => ({ id: 5, voucherNo: 'GM/ADV/2026/001', empId: 'GM001', empName: 'Asha', amount: 90000, emi: 0, deductMonth: 'November', deductYear: 2026, ...over });
function form(p, v) {
  const map = { advEmp: '0', advAmt: '', advEmi: '', advMonth: 'November', advYear: '2026', advDate: '2026-11-05', advMode: 'Cash', advRef: '', advApprovedBy: 'Owner', advReason: '', ...v };
  Object.entries(map).forEach(([id, value]) => { p.el(id).value = String(value); });
}

test('F-02 a voucher larger than the month pay is refused when it is created', () => {
  const p = createPayroll(); loadState(p); form(p, { advAmt: 90000 });
  p.run('createAdvance()');
  assert.equal(p.run('state.advances.length'), 0);
  assert.match(p.toastText(), /Advance not created/);
  assert.match(p.toastText(), /can be paid/);
});

test('F-02 an EMI that fits is accepted even when the total is large', () => {
  const p = createPayroll(); loadState(p); form(p, { advAmt: 90000, advEmi: 5000 });
  p.run('createAdvance()');
  assert.equal(p.run('state.advances.length'), 1);
});

test('F-02 a normal voucher is still created', () => {
  const p = createPayroll(); loadState(p); form(p, { advAmt: 3000 });
  p.run('createAdvance()');
  assert.equal(p.run('state.advances.length'), 1);
  assert.equal(p.run('state.advances[0].voucherNo'), 'GM/ADV/2026/001');
});

test('F-02 for another month the cap is the monthly gross', () => {
  const p = createPayroll(); loadState(p);
  form(p, { advAmt: 25000, advMonth: 'December' }); p.run('createAdvance()');
  assert.equal(p.run('state.advances.length'), 0);
  form(p, { advAmt: 19000, advMonth: 'December' }); p.run('createAdvance()');
  assert.equal(p.run('state.advances.length'), 1);
});

test('F-02 a negative EMI is refused', () => {
  const p = createPayroll(); loadState(p); form(p, { advAmt: 1000, advEmi: -5 });
  p.run('createAdvance()');
  assert.equal(p.run('state.advances.length'), 0);
});

test('F-02 negative pay already in the data blocks the lock and the bank file', async () => {
  const p = createPayroll({ reauth: true }); loadState(p, { advances: [advRec()] });
  assert.ok(p.run('payTotals().rows[0].c.finalPay') < 0);
  const errs = p.run('runBlockingErrors().map(e=>({n:e.name,t:e.issues[0].t}))');
  assert.ok(errs.some(e => /Negative net pay/.test(e.t)), JSON.stringify(errs));
  p.el('apApproved').value = 'Owner';
  await p.run('lockRun()');
  assert.notEqual(p.run('(state.runs["November-2026"]||{}).status'), 'locked');
  p.run('reportBankCsv()');
  assert.equal(p.log.saved.length, 0, 'no bank file may be handed to the exporter');
  assert.match(p.toastText(), /Bank file NOT created/);
});

test('F-02 the slip list marks negative pay as an error', () => {
  const p = createPayroll(); loadState(p, { advances: [advRec()] });
  const recs = p.run('slipRecords().map(r=>({s:r.status,t:r.issues[0].t}))');
  assert.equal(recs[0].s, 'err'); assert.match(recs[0].t, /Negative net pay/);
});

test('CR-F2 bank CSV: plain account numbers, same amounts, same layout', async () => {
  const p = createPayroll(); loadState(p);
  p.run('reportBankCsv()');
  assert.equal(p.log.saved.length, 1);
  const csv = await p.log.saved[0].blob.text();
  const lines = csv.trim().split('\n');
  assert.equal(lines[0], 'Sr,Employee Name,Employee ID,Bank Name,Account No,IFSC,Net Amount');
  assert.match(lines[1], /^1,"Asha","GM001","ICICI",5010100000000,"HDFC0001000",\d+$/);
  assert.ok(!csv.includes("'"));
});

test('CR-F2 bank CSV: a formula-looking cell is neutralised, commas are quoted', async () => {
  const p = createPayroll(); loadState(p, { rows: [row({ name: '=HYPERLINK("x")', accountNo: '=1+1', empId: 'A,1' })] });
  p.run('reportBankCsv()');
  const csv = await p.log.saved[0].blob.text();
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), csv);
  assert.ok(csv.includes(`,"'=1+1",`), csv);
  assert.ok(csv.includes(`,"A,1",`), csv);
});

test('G7 a formula behind leading blanks is neutralised in the bank and member CSV text cells', async () => {
  const p = createPayroll(); loadState(p, { rows: [row({ name: ' =1+1', empId: '\n@SUM(A1)', bankName: '\t-2' })] });
  p.run('reportBankCsv()');
  const bank = await p.log.saved[0].blob.text();
  assert.ok(bank.includes(`,"' =1+1",`), bank);
  assert.ok(bank.includes(`"'\n@SUM(A1)"`), bank);
  assert.ok(bank.includes(`"'\t-2"`), bank);
  p.run('reportStatutoryMemberCsv()');
  const member = await p.log.saved[1].blob.text();
  assert.ok(member.includes(`,"' =1+1",`), member);
  assert.ok(member.includes(`"'\n@SUM(A1)"`), member);
});

test('CR-F2 member-wise statutory CSV: UAN and ESIC IP are plain', async () => {
  const p = createPayroll(); loadState(p, { rows: [row({ uan: '100123456789', esicIp: '3100000012' })] });
  p.run('reportStatutoryMemberCsv()');
  const csv = await p.log.saved[0].blob.text();
  assert.match(csv.split('\n')[1], /^1,100123456789,"Asha","GM001",.*,3100000012,/);
  assert.ok(!csv.includes("'"));
});
