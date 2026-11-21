// S09: U09-F01 (Staff Master reachable, manager-only writers), U14-05 (Leave side).
// U09-L05 / U09-L06 (entitlement and cap input checks) are not built in this wave: they are not on the plan's kept list (G2).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { loadLeave, LEAVE_FILE, OWNER, MANAGER, CASHIER, seedData } from './lib/fix-s09-leave-sandbox.mjs';

const html = fs.readFileSync(LEAVE_FILE, 'utf8');
const stored = (L, key) => { const v = L.storage.getItem(key); return v === null ? null : JSON.parse(v); };

test('F01: header Staff Master button is no longer hidden by the st-v5-hide-css rule', () => {
  assert.ok(html.includes('<style id="st-v5-hide-css">.btn-teal:not(#hdrStaffBtn){display:none !important}</style>'));
  assert.match(html, /<button data-action="open-staff-master" class="btn btn-teal"\s+id="hdrStaffBtn"/);
});

test('F01: Staff Master writers are refused for a non-manager role', () => {
  const L = loadLeave({ session: CASHIER, storage: { leavedesk_v3: seedData() } });
  L.getNode('wo2').checked = true;
  L.run('saveWeekOffFromUI()');
  assert.equal(L.storage.getItem('leavedesk_weekoff_v1'), null);
  assert.match(L.toasts.at(-1).msg, /Only the Owner or a Store Manager/);

  L.getNode('capWLMHW').value = '5';
  L.run('saveStoreCapsFromUI()');
  assert.equal(L.storage.getItem('leavedesk_caps_v1'), null);

  L.getNode('bkFrom').value = '2027-01-04'; L.getNode('bkTo').value = '2027-01-05';
  L.run('addBlackout()');
  assert.equal(L.storage.getItem('leavedesk_blackouts_v1'), null);

  L.getNode('entDef0').value = '20';
  L.run('saveEntDefaults()');
  assert.equal(L.storage.getItem('leavedesk_entitlements_v1'), null);

  L.getNode('empName').value = 'New Person';
  L.run('addEmployee()');
  assert.equal(L.run('data.employees.length'), 2);
  L.run('removeEmployee(0)');
  assert.equal(L.run('data.employees.length'), 2);
  L.run('saveEntOverride(0)');
  assert.equal(L.storage.getItem('leavedesk_entitlements_v1'), null);
  L.run('removeBlackout("x")');
  assert.ok(L.toasts.every(t => t.type === 'error'));
});

test('F01: the same writers work for a Store Manager', () => {
  const L = loadLeave({ session: MANAGER, storage: { leavedesk_v3: seedData() } });
  L.getNode('wo2').checked = true;
  L.run('saveWeekOffFromUI()');
  assert.deepEqual(stored(L, 'leavedesk_weekoff_v1'), { days: [2] });
  L.getNode('capWLMHW').value = '5';
  L.run('saveStoreCapsFromUI()');
  assert.equal(stored(L, 'leavedesk_caps_v1').WLMHW, 5);
  L.getNode('bkFrom').value = '2027-01-04'; L.getNode('bkTo').value = '2027-01-05';
  L.run('addBlackout()');
  assert.equal(stored(L, 'leavedesk_blackouts_v1').entries.length, 1);
  L.getNode('entDef0').value = '20';
  L.run('saveEntDefaults()');
  assert.equal(stored(L, 'leavedesk_entitlements_v1').defaults['Casual Leave'], 20);
  L.getNode('empName').value = 'New Person';
  L.run('addEmployee()');
  assert.equal(L.run('data.employees.length'), 3);
});

test('F01: a broken session (no parent shell) is refused', () => {
  const L = loadLeave({ storage: { leavedesk_v3: seedData() } });
  L.getNode('wo2').checked = true;
  L.run('saveWeekOffFromUI()');
  assert.equal(L.storage.getItem('leavedesk_weekoff_v1'), null);
});

test('U14-05: inactive Employee Master staff are hidden from Add Leave and refused on submit', () => {
  const L = loadLeave({
    session: OWNER,
    storage: {
      saagar_employee_master_v1: [{ employeeId: 'E9', name: 'Audit Newhire', active: false }],
      leavedesk_v3: seedData({ employees: [
        { id: 'n1', name: 'Audit Newhire', empId: 'E9' },
        { id: 'a1', name: 'Active Person', empId: 'E10' }
      ] })
    }
  });
  L.run('populateLeaveSelect()');
  const optNames = L.getNode('leaveName').children.map(c => c.textContent);
  assert.ok(!optNames.some(t => t.includes('Audit Newhire')));
  assert.ok(optNames.some(t => t.includes('Active Person')));
  // not matched in the master: still listed
  const L2 = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData({ employees: [{ id: 'z', name: 'Manual Person', empId: '' }] }) } });
  L2.run('populateLeaveSelect()');
  assert.equal(L2.getNode('leaveName').children.length, 1);
  // the bridge's own flag on the Leave row (interface E: active === false) also hides the person, even with no master row
  const L3 = loadLeave({ session: OWNER, storage: { leavedesk_v3: seedData({ employees: [{ id: 'f1', name: 'Flagged Person', empId: 'E11', active: false }, { id: 'f2', name: 'Open Person', empId: 'E12' }] }) } });
  L3.run('populateLeaveSelect()');
  const opt3 = L3.getNode('leaveName').children.map(c => c.textContent);
  assert.ok(!opt3.some(t => t.includes('Flagged Person')));
  assert.ok(opt3.some(t => t.includes('Open Person')));
  // submit for the inactive id adds nothing
  L.getNode('leaveName').value = 'n1'; L.getNode('leaveApprover').value = 'Boss';
  L.getNode('leaveFrom').value = '2030-01-07'; L.getNode('leaveTo').value = '2030-01-07';
  L.getNode('leaveType').value = 'full_day'; L.getNode('leaveCategory').value = 'Casual Leave';
  L.run('submitLeave()');
  assert.equal(Object.keys(L.run('data.leaves')).length, 0);
  assert.match(L.toasts.at(-1).msg, /inactive/);
});
