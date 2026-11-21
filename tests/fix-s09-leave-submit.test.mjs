// S09: U09-F09 (range limit), U09-F10 + U09-L03 (balance incl. pending, FY split), U09-F11 (stale day),
// U09-L04 (print totals), and the festival soft confirm at submit.
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadLeave, OWNER, seedData } from './lib/fix-s09-leave-sandbox.mjs';

const row = (id, name, type, status, category = 'Casual Leave') => ({ id, name, type, category, reason: '', approvedBy: 'Boss', status });
function form(L, { from, to, type = 'full_day', category = 'Casual Leave', emp = 'e1' }) {
  L.getNode('leaveName').value = emp; L.getNode('leaveApprover').value = 'Boss';
  L.getNode('leaveFrom').value = from; L.getNode('leaveTo').value = to;
  L.getNode('leaveType').value = type; L.getNode('leaveCategory').value = category;
  L.getNode('leaveReason').value = '';
}
const total = L => L.run('Object.values(data.leaves).reduce((s, a) => s + a.length, 0)');

test('F09: more than 366 days is refused before any dialog', () => {
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  form(L, { from: '2030-01-07', to: '2032-01-07' });
  L.run('submitLeave()');
  assert.equal(total(L), 0);
  assert.match(L.toasts.at(-1).msg, /too long/);
  assert.equal(L.confirms.length, 0);
});

test('F09: the live warning shows for an over-long range', () => {
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  form(L, { from: '2030-01-07', to: '2032-01-07' });
  L.run('onLeaveFormChange()');
  assert.match(L.getNode('addLeaveWarning').textContent, /Range too long/);
});

test('F09: over 31 days asks first; 5 days does not', () => {
  let L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() }, confirmAnswers: [false] });
  form(L, { from: '2030-01-07', to: '2030-02-15', category: 'Other' });
  L.run('submitLeave()');
  assert.equal(total(L), 0);
  assert.equal(L.confirms.filter(c => c.includes('separate pending leave records')).length, 1);

  L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() }, confirmAnswers: [true] });
  form(L, { from: '2030-01-07', to: '2030-02-15', category: 'Other' });
  L.run('submitLeave()');
  assert.equal(total(L), 30);   // 40 calendar days, Sat/Sun skipped

  L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  form(L, { from: '2030-01-07', to: '2030-01-11', category: 'Other' });
  L.run('submitLeave()');
  assert.equal(total(L), 5);
  assert.equal(L.confirms.filter(c => c.includes('separate pending')).length, 0);
});

function seedBalance(approvedHalf = true) {
  const leaves = {};
  ['2030-05-01', '2030-05-02', '2030-05-03'].forEach((k, i) => { leaves[k] = [row('a' + i, 'Karan Mehta', 'full_day', 'approved')]; });
  if (approvedHalf) leaves['2030-05-06'] = [row('ah', 'Karan Mehta', 'half_day_am', 'approved')];
  for (let i = 0; i < 8; i++) leaves['2030-06-' + String(3 + i).padStart(2, '0')] = [row('p' + i, 'Karan Mehta', 'full_day', 'pending')];
  return seedData({ leaves });
}

test('F10: pending days are included in the hint and the confirm', () => {
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedBalance() }, confirmAnswers: [false] });
  form(L, { from: '2030-09-02', to: '2030-09-03' });
  L.run('renderBalanceHint()');
  const hint = L.getNode('leaveBalanceHint').textContent;
  assert.match(hint, /\(\+8 pending\)/);
  assert.match(hint, /EXCEEDS balance/);
  const before = total(L);
  L.run('submitLeave()');
  assert.equal(total(L), before);
  assert.ok(L.confirms.some(c => c.includes('EXCEEDS')));
  assert.ok(L.confirms.some(c => c.includes('8 more are waiting for approval')));
});

test('F10: a request that stays inside the balance asks nothing', () => {
  const leaves = { '2030-05-01': [row('a0', 'Karan Mehta', 'full_day', 'approved')], '2030-06-03': [row('p0', 'Karan Mehta', 'full_day', 'pending')] };
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData({ leaves }) } });
  form(L, { from: '2030-09-02', to: '2030-09-02' });
  L.run('renderBalanceHint()');
  assert.doesNotMatch(L.getNode('leaveBalanceHint').textContent, /EXCEEDS/);
  L.run('submitLeave()');
  assert.equal(L.confirms.length, 0);
  assert.equal(total(L), 3);
});

test('L03: a request across two financial years is charged to each year', () => {
  const eleven = {};
  for (let i = 1; i <= 11; i++) eleven['2026-05-' + String(i).padStart(2, '0')] = [row('x' + i, 'Karan Mehta', 'full_day', 'approved')];
  let L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData({ leaves: eleven }) } });
  form(L, { from: '2027-03-29', to: '2027-04-02' });
  L.run('renderBalanceHint()');
  const hint = L.getNode('leaveBalanceHint').textContent;
  assert.match(hint, /FY 2026.27/);
  assert.match(hint, /FY 2027.28/);
  const [first, second] = hint.split(' · ');
  assert.match(first, /EXCEEDS/);
  assert.doesNotMatch(second, /EXCEEDS/);

  const eight = {};
  for (let i = 1; i <= 8; i++) eight['2026-05-' + String(i).padStart(2, '0')] = [row('y' + i, 'Karan Mehta', 'full_day', 'approved')];
  L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData({ leaves: eight }) } });
  form(L, { from: '2027-03-29', to: '2027-04-02' });
  L.run('renderBalanceHint()');
  assert.doesNotMatch(L.getNode('leaveBalanceHint').textContent, /EXCEEDS/);
});

test('F11: closing the day modal forgets the day; the header Add Leave stays visible on a full day', () => {
  const day = '2030-11-25';
  const leaves = { [day]: [row('d1', 'A One', 'full_day', 'approved'), row('d2', 'B Two', 'full_day', 'approved'), row('d3', 'C Three', 'full_day', 'approved')] };
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData({ leaves }) } });
  L.run(`openDayModal('${day}')`);
  assert.equal(L.run('currentDayKey'), day);
  L.run('applyReadOnlyUI()');
  assert.equal(L.getNode('hdrAddLeave').style.display, '');
  L.run("closeOverlay('dayOverlay')");
  assert.equal(L.run('currentDayKey'), null);
});

test('F11: submitting does not pop the day modal open when it is closed', () => {
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData() } });
  L.run("window.__odm = 0; openDayModal = function () { window.__odm++; }; currentDayKey = '2030-11-25';");
  form(L, { from: '2030-12-02', to: '2030-12-02', category: 'Other' });
  L.run('submitLeave()');
  assert.equal(total(L), 1);
  assert.equal(L.run('window.__odm'), 0);
  L.getNode('dayOverlay').classList.add('active');
  form(L, { from: '2030-12-03', to: '2030-12-03', category: 'Other' });
  L.run('submitLeave()');
  assert.equal(L.run('window.__odm'), 1);
});

test('L04: printed counts are approved days, pending and rejected; no "Total leaves"', () => {
  const leaves = {
    '2030-11-04': [row('p1', 'A One', 'full_day', 'approved')],
    '2030-11-05': [row('p2', 'B Two', 'half_day_am', 'approved')],
    '2030-11-06': [row('p3', 'C Three', 'full_day', 'pending')],
    '2030-11-07': [row('p4', 'D Four', 'full_day', 'rejected')]
  };
  const L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData({ leaves }) } });
  L.run('currentMonth = 10; currentYear = 2030;');
  L.run('printCalendar()');
  const msg = L.messages.find(m => m && m.type === 'ST_PRINT');
  assert.ok(msg, 'print message sent');
  assert.match(msg.html, /Approved leave days: 1\.5/);
  assert.match(msg.html, /Pending: 1/);
  assert.match(msg.html, /Rejected: 1/);
  assert.doesNotMatch(msg.html, /Total leaves/);
  assert.match(msg.html, /Total approved leave days: 1\.5/);
});

test('Festival: a blackout festival adds a soft confirm at submit, a non-blackout one does not', () => {
  const cal = { version: 1, festivals: [
    { name: 'Diwali', start: '2030-11-08', end: '2030-11-16', blackout: true },
    { name: 'Quiet Fair', start: '2030-12-02', end: '2030-12-05', blackout: false }
  ] };
  let L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData(), saagar_festival_calendar_v1: cal }, confirmAnswers: [false] });
  form(L, { from: '2030-11-12', to: '2030-11-12', category: 'Other' });
  L.run('submitLeave()');
  assert.equal(total(L), 0);
  assert.ok(L.confirms.some(c => c.includes('Diwali')));

  L = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData(), saagar_festival_calendar_v1: cal } });
  form(L, { from: '2030-12-03', to: '2030-12-03', category: 'Other' });
  L.run('submitLeave()');
  assert.equal(total(L), 1);
  assert.equal(L.confirms.length, 0);
});
