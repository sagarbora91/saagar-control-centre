// S09: U09-F06, U09-F07, U09-F08 (import/export/clear) and U09-X01 (AM+PM pairs, rejected rows).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLeave, OWNER, seedData } from './lib/fix-s09-leave-sandbox.mjs';

const rec = (id, name, type, extra = {}) => ({ id, name, type, category: 'Casual Leave', reason: '', approvedBy: 'Boss', leaveFrom: '', leaveTo: '', ...extra });
const doImport = (L, obj) => L.run(`importJSON({ target: { files: [{ text: ${JSON.stringify(JSON.stringify(obj))} }], value: 'x' } })`);
const stored = (L, key) => { const v = L.storage.getItem(key); return v === null ? null : JSON.parse(v); };
const count = L => L.run('Object.values(data.leaves).reduce((s, a) => s + a.length, 0)');

test('F06: an app backup (it carries weekOff) restores every dated record, whatever the weekly-off days', () => {
  // Audit reproduction (verify v2 F06-08): weekly-off changed to Tuesday after Tuesday rows existed, a Saturday row added,
  // Export, Clear All (device back to Sat/Sun), Import. Every record must come back: 2 valid, 0 skipped.
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });   // device default is Sat/Sun
  doImport(L, {
    leaves: { '2026-11-28': [rec('s1', 'Karan Mehta', 'full_day')], '2026-12-01': [rec('t1', 'Karan Mehta', 'full_day')] },
    agendas: {}, weekOff: { days: [2] }
  });
  assert.equal(L.run("(data.leaves['2026-11-28'] || []).length"), 1, 'Saturday kept (device default would drop it)');
  assert.equal(L.run("(data.leaves['2026-12-01'] || []).length"), 1, 'Tuesday kept (it was real leave when recorded)');
  assert.deepEqual(stored(L, 'leavedesk_weekoff_v1'), { days: [2] });
  assert.match(L.confirms[0], /2 valid leave record/);
  assert.match(L.confirms[0], /0 record\(s\) skipped/);
});

test('U14-05: the inactive flag on a Leave staff row survives import', () => {
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  doImport(L, { leaves: {}, agendas: {}, employees: [{ id: 'x9', name: 'Old Hand', empId: 'E9', active: false }, { id: 'x8', name: 'New Hand', empId: 'E8', active: true }] });
  const emps = L.run('data.employees');
  assert.equal(emps.find(e => e.name === 'Old Hand').active, false);
  assert.equal(emps.find(e => e.name === 'New Hand').active, undefined);
});

test('F06: a backup with no weekOff keeps judging against the device setting', () => {
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  doImport(L, { leaves: { '2026-11-28': [rec('s1', 'Karan Mehta', 'full_day')] }, agendas: {} });
  assert.equal(count(L), 0);
  assert.match(L.confirms[0], /weekly-off/);
});

test('F07: employees travel with the backup and merge by name', () => {
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  doImport(L, {
    leaves: {}, agendas: {},
    employees: [
      { id: 'x1', name: 'karan mehta', empId: 'E1' },
      { id: 'x2', name: 'Priya Shah', empId: 'E5', department: 'CRO', employeeId: 'EMP-5', store: 'titan' },
      { id: 'x3', name: '', empId: 'E6' },
      { id: 'x4', name: 'Ravi Jain', empId: 'E7' }
    ]
  });
  const emps = L.run('data.employees');
  assert.equal(emps.length, 4);
  assert.equal(emps.find(e => e.name === 'Karan Mehta').id, 'e1', 'existing row untouched');
  assert.equal(emps.find(e => e.name === 'Priya Shah').employeeId, 'EMP-5');
  assert.match(L.toasts.at(-1).msg, /2 staff/);
  assert.match(L.confirms[0], /3 staff member/);
  assert.match(L.toasts.at(-1).msg, /Skipped: 1/);
});

test('F08: export carries caps and blackouts; clear removes them and lists 7 items', async () => {
  const L = loadLeave({
    session: OWNER,
    storage: {
      leavedesk_v3: seedData(),
      leavedesk_caps_v1: { WLMHW: 5, HEMW: 1 },
      leavedesk_blackouts_v1: { v: 1, entries: [{ id: 'bk1', from: '2027-01-04', to: '2027-01-06', store: '', kind: 'blackout', hard: false, label: 'Sale' }] }
    }
  });
  L.run('exportJSON()');
  const msg = L.messages.find(m => m && m.type === 'ST_SHARE');
  assert.ok(msg, 'share message sent');
  const payload = JSON.parse(await msg.file.text());
  assert.deepEqual(payload.caps, { WLMHW: 5, HEMW: 1 });
  assert.equal(payload.blackouts.entries.length, 1);

  L.run('openClearConfirm()');
  assert.equal(L.getNode('clearWarningList').children.length, 7);
  L.getNode('clearConfirmInput').value = 'DELETE';
  L.run('executeClearData()');
  assert.equal(L.storage.getItem('leavedesk_caps_v1'), null);
  assert.equal(L.storage.getItem('leavedesk_blackouts_v1'), null);

  // import the exported file into the cleared sandbox: caps and blackouts return
  doImport(L, payload);
  assert.deepEqual(stored(L, 'leavedesk_caps_v1'), { WLMHW: 5, HEMW: 1 });
  assert.equal(stored(L, 'leavedesk_blackouts_v1').entries.length, 1);
});

test('F08: an older backup without caps or blackouts leaves the device settings alone', () => {
  const L = loadLeave({
    session: OWNER,
    storage: {
      leavedesk_v3: seedData(),
      leavedesk_caps_v1: { WLMHW: 5, HEMW: 1 },
      leavedesk_blackouts_v1: { v: 1, entries: [{ id: 'bk1', from: '2027-01-04', to: '2027-01-06', store: '', kind: 'blackout', hard: false, label: 'Sale' }] }
    }
  });
  doImport(L, { leaves: {}, agendas: {} });
  assert.deepEqual(stored(L, 'leavedesk_caps_v1'), { WLMHW: 5, HEMW: 1 });
  assert.equal(stored(L, 'leavedesk_blackouts_v1').entries.length, 1);
});

test('X01: AM+PM half-days restore together, rejected audit rows restore, a second full day is still skipped', () => {
  const day = '2026-11-25';   // Wednesday
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  doImport(L, {
    leaves: {
      [day]: [
        rec('a1', 'Karan Mehta', 'half_day_am'),
        rec('a2', 'Karan Mehta', 'half_day_pm'),
        rec('a3', 'Karan Mehta', 'full_day'),
        rec('r1', 'Zed One', 'full_day', { status: 'rejected' }),
        rec('r2', 'Zed Two', 'full_day', { status: 'rejected' }),
        rec('r3', 'Zed Three', 'full_day', { status: 'rejected' })
      ],
      '2026-11-26': [rec('b1', 'Asha Rao', 'full_day'), rec('b2', 'Ravi Jain', 'full_day'), rec('b3', 'Priya Shah', 'full_day'), rec('b4', 'Rejected Late', 'full_day', { status: 'rejected' })]
    },
    agendas: {}
  });
  const d = L.run(`data.leaves['${day}'].map(l => l.id)`);
  assert.ok(d.includes('a1') && d.includes('a2'), 'AM and PM both imported');
  assert.ok(!d.includes('a3'), 'full day for a person who already has half days is skipped');
  assert.ok(['r1', 'r2', 'r3'].every(x => d.includes(x)), 'rejected rows imported');
  assert.ok(L.run("data.leaves['2026-11-26'].some(l => l.id === 'b4')"), 'rejected row on a full day imported');
});
