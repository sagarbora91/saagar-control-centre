import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCro } from './lib/fix-s12-cro-vm.mjs';

const QUAL = { t1: 7, t2: 10, t3: 4, t4: 0, t8: 10, t10: 7 };

function savedAudit(over = {}) {
  const tasks = {};
  for (const [k, v] of Object.entries(QUAL)) tasks[k] = { pts: v, remarks: '' };
  tasks.t5 = { billsCount: 40, npsCollected: 20, responseRate: 50, npsScore: 85, remarks: '', pts: 10 };
  tasks.t6 = { reviewsCount: 1, remarks: '', reviewList: [{ cid: 'c1', name: 'Asha', mobile: '9876543210', requested: true, received: true }], pts: 10 };
  tasks.t7 = { activityCount: 4, remarks: '', pts: 8 };
  tasks.t9 = { groomingPct: 80, remarks: '', pts: 8 };
  return { id: 'a1', date: '2026-11-04', store: 'Titan World, Latur', cro: 'Ravi', sm: 'Meena', total: 69, grade: 'Satisfactory', tasks, submittedAt: '2026-11-04T10:00:00.000Z', ...over };
}

const j = v => JSON.parse(JSON.stringify(v));

function setup(audit, extra = {}) {
  const m = loadCro({ storage: { cro_audits_v3: [audit], ...extra } });
  m.run('initTData()');
  return m;
}

test('F-CRO-1: opening a saved audit shows its own figures, not zeros', () => {
  const m = setup(savedAudit());
  m.run("loadAuditForEdit('a1')");
  assert.deepEqual(m.boxes(), { bills: 40, coll: 20, score: 85, rev: 1, mktg: 4, groom: 80 });
  const t = m.run('tData');
  assert.equal(t.t5.billsCount, 40);
  assert.equal(t.t5.npsCollected, 20);
  assert.equal(t.t5.npsScore, 85);
  assert.equal(t.t7.activityCount, 4);
  assert.equal(t.t9.groomingPct, 80);
  // qualitative headers refreshed
  for (const [k, v] of Object.entries(QUAL)) assert.equal(m.el('tp-' + k).textContent, v + '/10', k);
});

test('F-CRO-1: an unchanged save keeps the id, the total and the figures', () => {
  const orig = savedAudit();
  const m = setup(orig);
  m.run("loadAuditForEdit('a1')");
  m.run('submitAudit()');
  const [a] = m.audits();
  assert.equal(m.audits().length, 1);
  assert.equal(a.id, 'a1');
  assert.ok(a.editedAt);
  for (const k of ['t5', 't7', 't9']) {
    for (const f of Object.keys(orig.tasks[k])) if (f !== 'pts' && f !== 'remarks') assert.equal(a.tasks[k][f], orig.tasks[k][f], k + '.' + f);
  }
  assert.equal(a.tasks.t5.npsScore, 85);
  assert.equal(a.tasks.t7.activityCount, 4);
  assert.equal(a.total, 69 + 0, 'total unchanged');
});

test('F-CRO-1: a QMS feed value does not overwrite the saved bills', () => {
  const feed = { '2026-11-04': { ravi: { qmsSales: 1 } } };
  const m = setup(savedAudit(), { saagar_cro_audit_feed: feed });
  m.run("loadAuditForEdit('a1')");
  assert.equal(m.el('nps-bills').value, 40);
  assert.equal(m.run('tData').t5.billsCount, 40);
});

test('F-CRO-1: an empty review list with a typed count keeps the count', () => {
  const a = savedAudit();
  a.tasks.t6 = { reviewsCount: 3, remarks: '', reviewList: [], pts: 10 };
  const m = setup(a);
  m.run("loadAuditForEdit('a1')");
  assert.equal(m.el('rev-cnt').value, 3);
  assert.equal(m.run('tData').t6.reviewsCount, 3);
  m.run('submitAudit()');
  assert.equal(m.audits()[0].tasks.t6.reviewsCount, 3);
});

test('F-CRO-1: a ticked buyer that QMS no longer lists keeps the review count', () => {
  const m = setup(savedAudit()); // no retail_queue_management_v1 at all
  m.run("loadAuditForEdit('a1')");
  assert.equal(m.run('tData').t6.reviewsCount, 1);
  m.run('submitAudit()');
  assert.equal(m.audits()[0].tasks.t6.reviewsCount, 1);
  assert.equal(m.audits()[0].tasks.t6.reviewList.length, 1);
});

test('E14: History flags are read-only and match the stated rules', () => {
  const m = setup(savedAudit());
  const zero = savedAudit({ editedAt: '2026-11-05T00:00:00Z' });
  zero.tasks.t5 = { billsCount: 5, npsCollected: 0, npsScore: 0, responseRate: 0, pts: 0 };
  zero.tasks.t7 = { activityCount: 0, pts: 0 };
  assert.deepEqual(j(m.run('croAuditIssues')(zero)), ['edit-zeroed']);
  const noEdit = JSON.parse(JSON.stringify(zero)); delete noEdit.editedAt;
  assert.deepEqual(j(m.run('croAuditIssues')(noEdit)), []);
  const neg = savedAudit(); neg.tasks.t5.npsCollected = -4;
  assert.deepEqual(j(m.run('croAuditIssues')(neg)), ['negative']);
  assert.deepEqual(j(m.run('croAuditIssues')(savedAudit())), []);
  assert.equal(m.run('croIssueNote')(savedAudit()), '');
  assert.match(m.run('croIssueNote')(neg), /negative figure/);
});

test('N2: an audit being edited does not count itself in the month pre-counts', () => {
  const a = savedAudit({ id: 'a1', date: '2026-11-04' });
  const b = savedAudit({ id: 'a2', date: '2026-11-05', cro: 'Other' });
  const m = loadCro({ asOf: '2026-11-12', storage: { cro_audits_v3: [a, b] } });
  m.run('initTData()');
  assert.equal(m.run('(loadPreData(), monthPre.surveys)'), 40);
  m.run("editingId='a1'");
  assert.equal(m.run('(loadPreData(), monthPre.surveys)'), 20);
  m.run('editingId=null');
  assert.equal(m.run('(loadPreData(), monthPre.surveys)'), 40);
});

test('F-CRO-1 (audit add): a list with no Received tick keeps the typed review count', () => {
  const a = savedAudit();
  a.tasks.t6 = { reviewsCount: 3, remarks: '', reviewList: [{ cid: 'c1', name: 'Asha', mobile: '9876543210', requested: true, received: false }], pts: 10 };
  const m = setup(a);
  m.run("loadAuditForEdit('a1')");
  assert.equal(m.run('tData').t6.reviewsCount, 3);
  m.run('submitAudit()');
  assert.equal(m.audits()[0].tasks.t6.reviewsCount, 3);
});
