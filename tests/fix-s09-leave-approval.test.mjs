// S09: U09-F02 (who decided, who may decide), U12-F-PLN-1 (festival warning), U09-L01 (row buttons).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLeave, OWNER, MANAGER, CASHIER, seedData } from './lib/fix-s09-leave-sandbox.mjs';

const KEY = '2030-11-12';
function seed(extra = {}, name = 'Karan Mehta') {
  return seedData({
    leaves: { [KEY]: [{ id: 'L1', name, type: 'full_day', category: 'Casual Leave', reason: '', approvedBy: 'Audit Owner', status: 'pending' }] },
    ...extra
  });
}
const leave = L => L.run(`data.leaves['${KEY}'][0]`);

test('F02: decidedBy is the real actor (named staff, role, owner name)', () => {
  let L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed(), saagar_active_staff_v1: { name: 'Asha Rao' } } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'approved');
  assert.equal(leave(L).decidedBy, 'Asha Rao');
  assert.equal(leave(L).approvedBy, 'Audit Owner');

  L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed() } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).decidedBy, 'Store Manager');

  L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seed(), st_v5_owner_name: 'Sagar' } });
  L.run(`decideLeave('${KEY}','L1','rejected')`);
  assert.equal(leave(L).status, 'rejected');
  assert.equal(leave(L).decidedBy, 'Sagar');
});

test('F02: the runtime session actor name is used when the shell provides it', () => {
  const L = loadLeave({
    session: MANAGER, storage: { leavedesk_v3: seed() },
    parentExtras: { activeStaff: () => ({ name: 'Runtime Person' }) }
  });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).decidedBy, 'Runtime Person');
});

test('F02: a non-manager role and a broken session cannot decide', () => {
  let L = loadLeave({ session: CASHIER, storage: { leavedesk_v3: seed() } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'pending');
  assert.match(L.toasts.at(-1).msg, /Only the Owner or a Store Manager/);

  L = loadLeave({ storage: { leavedesk_v3: seed() } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'pending');
});

test('F02: a Store Manager cannot decide their own leave; the Owner can', () => {
  let L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed({}, 'Asha Rao'), saagar_active_staff_v1: { name: 'Asha Rao' } } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'pending');
  assert.match(L.toasts.at(-1).msg, /your own leave/);

  L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seed({}, 'Sagar'), st_v5_owner_name: 'Sagar' } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'approved');
  assert.equal(leave(L).decidedBy, 'Sagar');
});

test('F02: Approve and Reject buttons are not drawn for a non-manager role', () => {
  const find = L => L.created.filter(e => e.dataset && (e.dataset.action === 'approve-pending-leave' || e.dataset.action === 'reject-pending-leave'));
  let L = loadLeave({ session: CASHIER, storage: { leavedesk_v3: seed() } });
  L.run('renderApprovals()');
  assert.equal(find(L).length, 0);
  assert.match(L.getNode('approvalsSub').textContent, /view only/);
  L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed() } });
  L.run('renderApprovals()');
  assert.equal(find(L).length, 2);
});

test('PLN-1: approvals list and the approval toast warn about a festival blackout, never block', () => {
  const cal = { version: 1, festivals: [
    { id: 'f1', name: 'Diwali', start: '2030-11-08', end: '2030-11-16', blackout: true },
    { id: 'f2', name: 'Quiet Fair', start: '2030-11-08', end: '2030-11-16', blackout: false }
  ] };
  const L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed(), saagar_festival_calendar_v1: cal } });
  L.run('renderApprovals()');
  const meta = L.created.find(e => typeof e.textContent === 'string' && e.textContent.includes('Approver:'));
  assert.ok(meta, 'meta line drawn');
  assert.match(meta.textContent, /Festival leave-freeze: Diwali/);
  assert.doesNotMatch(meta.textContent, /Quiet Fair/);
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'approved');
  assert.match(L.toasts.at(-1).msg, /Diwali/);
});

test('PLN-1: a leave outside the window has no note; a corrupt calendar does not throw', () => {
  let L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed(), saagar_festival_calendar_v1: { festivals: [{ name: 'Holi', start: '2030-03-01', end: '2030-03-02', blackout: true }] } } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.doesNotMatch(L.toasts.at(-1).msg, /Festival/);
  L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed(), saagar_festival_calendar_v1: '{not json' } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'approved');
});

test('F10 (approval side): approving beyond the balance adds a warning but still approves', () => {
  const rows = [];
  for (let i = 0; i < 13; i++) rows.push({ id: 'p' + i, name: 'Karan Mehta', type: 'full_day', category: 'Casual Leave', approvedBy: 'X', status: 'approved' });
  const leaves = { [KEY]: [{ id: 'L1', name: 'Karan Mehta', type: 'full_day', category: 'Casual Leave', approvedBy: 'X', status: 'pending' }] };
  rows.forEach((r, i) => { leaves['2030-10-' + String(i + 1).padStart(2, '0')] = [r]; });
  const L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seedData({ leaves }) } });
  L.run(`decideLeave('${KEY}','L1','approved')`);
  assert.equal(leave(L).status, 'approved');
  assert.match(L.toasts.at(-1).msg, /now over the Casual Leave balance/);
});

test('L01: row click ignores buttons but opens the detail from elsewhere on the row', () => {
  const L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seed() } });
  L.run('window.__detail = 0; openStaffDetail = function () { window.__detail++; };');
  L.run(`openDayModal('${KEY}')`);
  const row = L.created.find(e => e.className === 'leave-row' && typeof e.onclick === 'function');
  assert.ok(row, 'leave row with a click handler');
  row.onclick({ target: { closest: sel => (sel === 'button' ? {} : null) } });
  assert.equal(L.run('window.__detail'), 0);
  row.onclick({ target: { closest: () => null } });
  assert.equal(L.run('window.__detail'), 1);
});
