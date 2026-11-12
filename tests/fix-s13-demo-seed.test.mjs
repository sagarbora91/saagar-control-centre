// S13 seed fixes (new file). Runs the real www/demo-seed.js in a vm with a fixed clock.
import assert from 'node:assert/strict';
import test from 'node:test';
import { runSeed, stableDigest } from './lib/fix-s13-seed-harness.mjs';

// Recorded by running this same harness on the UNCHANGED seed (HEAD d6eab0b) before any edit.
// It covers ledger rows, queue customers, service cases, payroll rows and leaves with id-like keys removed.
const BASELINE_SHA256 = {
  big: '0115c8941ca6c032c20d0bc8da06e4c9b9070b1ecea9dd293b072b70b3cbf5e0',
  light: '32c382cda354ba84e178436f9c34e9a5743566781f55776c842d0b9f92a297ba'
};

const CRIT_M = ['Short / well-trimmed hair', 'Natural hair colour only', 'Hair gel applied — no oil', 'Sideburns do not cross the middle of the ear', 'Well-fitted — not too tight or too loose', 'Clean and properly ironed', 'No loose threads, missing buttons, or faded colour', 'Shirt sleeves as per standard — not rolled up', 'Name badge worn and clearly visible', 'Hand gloves worn during store hours', 'Shoes are black and polished — no tan or brown', 'Belt is black and clearly visible — no tan or brown', 'Watch: gold/silver or black/brown strap, simple dial', 'Max one ring per hand — gold or silver only', 'Nails clean, dry, and trimmed'];
const CRIT_F = ['Hair styled in a neat bun', 'Black rubber band and pins used to secure hair', 'Hair kept off the face — pins if needed', 'Natural hair colour only — no styling oil', 'Well-fitted — not too tight or too loose', 'Clean and properly ironed at all times', 'No loose threads, missing buttons, or faded colour', 'Name badge worn and clearly visible at all times', 'Shoes are black and polished — no tan or brown', 'Belt is black and clearly visible — no tan or brown', 'Only one pair of studs or small hoops', 'Watch: gold/silver or black/brown strap, simple dial', 'Nails clean, dry, and trimmed', 'Lipstick shade — nude only', 'Nail polish — nude shades only, no bright colours'];
const SNAPSHOT_FIELDS = ['totalDays', 'lateDeduction', 'absentDeduction', 'halfDayDeduction', 'noThumbDeduction', 'totalDeduction', 'extraDays', 'finalPresent', 'totalSalaryDays', 'otDays', 'grossPayable', 'basic', 'hra', 'washing', 'specAllow', 'pt', 'pfWages', 'pfEE', 'esicEE', 'pfEmpr', 'esicEmpr', 'netPayable', 'otAmount', 'totalCTC', 'advance', 'finalPay'];

const cases = [
  { label: 'light path (180 days)', key: 'light', opts: { days: 180 } },
  { label: 'big path (365 days)', key: 'big', opts: { days: 365, walk: 10 } }
];

function dupes(ids) {
  const seen = new Set(); const dup = new Set();
  for (const id of ids) { if (seen.has(id)) dup.add(id); seen.add(id); }
  return [...dup];
}
function denoTotal(o) { let t = 0; for (const k of Object.keys(o || {})) t += Number(k) * o[k]; return t; }

for (const c of cases) {
  test(`S13 seed: ${c.label}`, { timeout: 120_000 }, async (t) => {
    const run = await runSeed(c.opts);
    const emp = run.get('saagar_employee_master_v1');

    await t.test('U01-F3 stable employee ids', () => {
      assert.equal(emp.length, 15);
      const ids = emp.map((e) => e.id);
      assert.ok(ids.every((id) => /^emp_demo_\d{3}$/.test(id)), 'every employee has emp_demo_NNN');
      assert.equal(new Set(ids).size, 15);
      assert.equal(ids[0], 'emp_demo_001');
      assert.equal(ids[14], 'emp_demo_015');
      assert.equal(emp[0].employeeId, 'EMP001', 'employeeId unchanged');
    });

    await t.test('U06-F03 no repeated ids', () => {
      const lists = { gm_expenses: (run.get('gm_expenses') || []).map((x) => x.id) };
      lists.petty = (run.get('gm_expenses') || []).filter((x) => x.source === 'petty').map((x) => x.sourceRef);
      const queue = run.get('retail_queue_management_v1');
      lists.qms = (queue.customers || []).concat(run.archive || []).map((x) => x.id);
      lists.service = (run.get('saagar_wsf_v2') || []).map((x) => x.id);
      const leaves = run.get('leavedesk_v3').leaves || {};
      lists.leaves = Object.keys(leaves).flatMap((d) => leaves[d].map((x) => x.id));
      for (const [name, ids] of Object.entries(lists)) {
        assert.ok(ids.length > 0, `${name} not empty`);
        assert.deepEqual(dupes(ids).slice(0, 3), [], `${name} has repeated ids`);
      }
    });

    await t.test('nothing else in the random stream moved', () => {
      assert.equal(stableDigest(run), BASELINE_SHA256[c.key]);
    });

    await t.test('U05-F-05 master brands carry a store', () => {
      const master = run.get('saagar_master_brands');
      const lists = run.get('saagar_brands');
      assert.ok(master.length > 0);
      assert.ok(master.every((b) => b.store === 'titanworld' || b.store === 'helios'));
      for (const n of lists.helios) assert.equal(master.find((b) => b.name === n).store, 'helios');
      for (const n of lists.titanworld) assert.equal(master.find((b) => b.name === n).store, 'titanworld');
      assert.equal(master.filter((b) => b.store === 'helios').length, lists.helios.length);
      assert.equal(master.filter((b) => b.store === 'titanworld').length, lists.titanworld.length);
    });

    await t.test('U06-F01 seeded Expense role is cashier', () => {
      assert.equal(run.get('gm_role'), 'cashier');
    });

    await t.test('CR-F4 petty float covers the seeded petty rows', () => {
      const petty = run.get('gm_petty');
      const sum = (run.get('gm_expenses') || []).filter((x) => x.source === 'petty').reduce((s, x) => s + x.amount, 0);
      assert.ok(sum > 5000);
      assert.equal(petty.float - sum, 5000);
      assert.equal(petty.history[0].add, petty.float);
    });

    await t.test('CR-F4 each closed cash day banks the cash above a 5,000 float', () => {
      const stmts = run.get('tanishq_statements');
      const days = Object.keys(stmts).sort();
      assert.ok(days.length > 100);
      for (const d of days) {
        const s = stmts[d];
        const phys = denoTotal(s.physDeno), bank = denoTotal(s.bankDeno);
        assert.equal(phys - bank, 5000, `${d} carry-forward`);
        if (d !== days[0]) assert.equal(s.openingBalance, 5000, `${d} opening is the banked carry`);
        assert.equal(s.closed, true);
      }
      assert.ok(denoTotal(stmts[days[days.length - 1]].bankDeno) > 0);
    });

    await t.test('U08-F3 grooming history uses the live checklist labels', () => {
      const keys = [...run.storage.keys()].filter((k) => /^saagar_grooming_\d{4}-\d{2}-\d{2}$/.test(k));
      assert.ok(keys.length > 10);
      for (const k of keys) {
        for (const rec of run.get(k)) {
          const want = rec.gender === 'f' ? CRIT_F : CRIT_M;
          assert.deepEqual(rec.items.map((i) => i.label), want);
          assert.equal(rec.total, 15);
        }
      }
    });

    await t.test('F-CRO-9 seeded CRO audits follow the scoring formula', () => {
      const audits = run.get('cro_audits_v3');
      assert.ok(audits.length > 100);
      let bad = 0;
      for (const a of audits) {
        const t6 = Math.min(Math.round(a.tasks.t6.reviewsCount / 2 * 10), 10);
        const t7 = Math.min(Math.round(a.tasks.t7.activityCount / 5 * 10), 10);
        if (a.tasks.t6.pts !== t6 || a.tasks.t7.pts !== t7) bad++;
        const total = Object.keys(a.tasks).reduce((s, k) => s + (a.tasks[k].pts || 0), 0);
        assert.equal(a.total, total);
        const grade = total >= 90 ? 'Outstanding' : total >= 75 ? 'Good' : total >= 60 ? 'Satisfactory' : total >= 45 ? 'Below Exp.' : 'Poor';
        assert.equal(a.grade, grade);
      }
      assert.equal(bad, 0);
    });
  });
}

test('S13 seed: U10-F-11 locked-month snapshots carry the full calcGM field set (big path)', { timeout: 120_000 }, async () => {
  const run = await runSeed({ days: 365, walk: 10 });
  const payroll = run.get('payroll_suite_v1_2026');
  const runs = Object.values(payroll.runs);
  assert.equal(runs.length, 24);
  const curKey = payroll.meta.month + '-' + payroll.meta.year;
  assert.equal(payroll.runs[curKey], undefined, 'no fake run entry for the current month');
  for (const r of runs) {
    assert.equal(r.status, 'locked');
    const rows = Object.values(r.snapshot);
    assert.equal(rows.length, payroll.rows.length);
    for (const calc of rows) {
      for (const f of SNAPSHOT_FIELDS) assert.equal(typeof calc[f], 'number', `field ${f}`);
      assert.ok(calc.totalDays >= 28 && calc.totalDays <= 31);
      assert.equal(calc.finalPresent, calc.totalSalaryDays);
      assert.ok(Math.abs(calc.totalDeduction - (calc.totalDays - calc.totalSalaryDays)) < 0.01);
      assert.ok(Math.abs(calc.netPayable - (calc.grossPayable - calc.pt - calc.pfEE - calc.esicEE)) < 0.02);
      assert.ok(Math.abs(calc.finalPay - calc.netPayable) < 0.02, 'finalPay unchanged from the old seed');
      assert.ok(Math.abs(calc.totalCTC - (calc.grossPayable + calc.pfEmpr + calc.esicEmpr + calc.otAmount)) < 0.03);
    }
  }
});

test('S13 seed: U06-F03 two-year seed has no repeated QMS, ledger or leave ids', { timeout: 180_000 }, async () => {
  const run = await runSeed({ days: 730, walk: 25 });
  const queue = run.get('retail_queue_management_v1');
  const qms = (queue.customers || []).concat(run.archive || []).map((x) => x.id);
  assert.ok(qms.length > 10_000);
  assert.deepEqual(dupes(qms).slice(0, 3), [], 'QMS ids repeat');
  const exp = run.get('gm_expenses').map((x) => x.id);
  assert.deepEqual(dupes(exp).slice(0, 3), [], 'ledger ids repeat');
  const leaves = run.get('leavedesk_v3').leaves || {};
  assert.deepEqual(dupes(Object.keys(leaves).flatMap((d) => leaves[d].map((x) => x.id))), []);
  assert.deepEqual(dupes(run.get('saagar_wsf_v2').map((x) => x.id)), []);
});
