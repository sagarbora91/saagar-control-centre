/* Fix wave S05 (DSR): staff list, CSV safety, Delete All. U04-F6, F7, U14-05, F8, F13. */
import assert from 'node:assert/strict';
import test from 'node:test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(repoDir, 'www', 'modules', 'dsr', 'index.html'), 'utf8');

function slice(marker) {
  const i = SRC.indexOf(marker);
  assert.notEqual(i, -1, marker + ' must exist in the DSR module');
  const re = /\n(?:function |async function |let |const |\/\*)/g;
  re.lastIndex = i + marker.length;
  const m = re.exec(SRC);
  return SRC.slice(i, m ? m.index : SRC.length);
}
function load(markers, fakes) {
  const ctx = vm.createContext(Object.assign({}, fakes));
  vm.runInContext(markers.map(slice).join('\n'), ctx);
  return ctx;
}
function fakeStorage(init) {
  const m = new Map(Object.entries(init || {}));
  return {
    m,
    get length() { return m.size; },
    key: (i) => Array.from(m.keys())[i] ?? null,
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
const STAFF_FNS = ['function readSavedStaff(', 'function readMasterNames(', 'function removableStaffKeys(', 'function getStaffList(', 'function saveStaffList(', 'function removeStaff(', 'function loginStaff(', 'function addStaff('];
function staffEnv(staff, master, over) {
  const ls = fakeStorage({ saagar_dsr_staff: JSON.stringify(staff), saagar_employee_master_v1: JSON.stringify(master) });
  const toasts = [];
  const els = { 'staff-name-inp': { value: '', classList: { add() {}, remove() {} } }, 'staff-role-sel': { value: 'cro' }, 'login-err': {}, 'new-staff-inp': { value: '' } };
  const fakes = Object.assign({
    localStorage: ls, toasts, SK_STAFF: 'saagar_dsr_staff',
    el: (id) => els[id] || (els[id] = { value: '', classList: { add() {}, remove() {} } }),
    toast: (m, t) => toasts.push({ m, t }), esc: (s) => String(s),
    confirm: () => true, renderSMSettings() {}, stAsOfDate: () => '2026-11-12', enterStaffPanel() {},
    st: {},
  }, over || {});
  return { c: load(STAFF_FNS, fakes), ls, toasts, els };
}
const MASTER = [{ name: 'Rohan', active: false }, { name: 'Meera', active: true }];

test('inactive master staff are not listed', () => {
  const e = staffEnv(['Asha', 'Rohan'], MASTER);
  assert.deepEqual(Array.from(e.c.getStaffList()), ['Asha', 'Meera']);
});

test('removing a typed name persists and never copies master names', () => {
  const e = staffEnv(['Asha', 'Rohan'], MASTER);
  e.c.removeStaff('Asha');
  assert.deepEqual(JSON.parse(e.ls.getItem('saagar_dsr_staff')), ['Rohan']);
  assert.ok(!e.ls.getItem('saagar_dsr_staff').includes('Meera'));
});

test('a master name cannot be removed here', () => {
  const e = staffEnv(['Asha'], MASTER);
  const before = e.ls.getItem('saagar_dsr_staff');
  e.c.removeStaff('Meera');
  assert.equal(e.ls.getItem('saagar_dsr_staff'), before);
  assert.match(e.toasts.at(-1).m, /Settings &gt; People/);
  assert.equal(e.c.removableStaffKeys().meera, undefined);
  assert.equal(e.c.removableStaffKeys().asha, 1);
});

test('login does not copy master names into the DSR list', () => {
  const e = staffEnv(['Asha', 'Rohan'], MASTER);
  e.els['staff-name-inp'].value = 'Zed';
  e.c.loginStaff();
  assert.deepEqual(JSON.parse(e.ls.getItem('saagar_dsr_staff')), ['Asha', 'Rohan', 'Zed']);
  /* an active master name logging in adds nothing */
  const e2 = staffEnv(['Asha'], MASTER);
  e2.els['staff-name-inp'].value = 'Meera';
  e2.c.loginStaff();
  assert.deepEqual(JSON.parse(e2.ls.getItem('saagar_dsr_staff')), ['Asha']);
});

test('addStaff writes only typed names and escapes the toast', () => {
  const e = staffEnv(['Asha'], MASTER, { esc: (s) => String(s).replace(/</g, '&lt;') });
  e.els['new-staff-inp'].value = '<b>Q';
  e.c.addStaff();
  assert.deepEqual(JSON.parse(e.ls.getItem('saagar_dsr_staff')), ['Asha', '<b>Q']);
  assert.ok(e.toasts.at(-1).m.includes('&lt;b>Q'));
  e.els['new-staff-inp'].value = 'meera';
  e.c.addStaff();
  assert.equal(e.toasts.at(-1).m, 'Name already exists');
});

test('csvCell neutralises formulas and leaves numbers alone', () => {
  const c = load(['function csvCell('], {});
  assert.equal(c.csvCell('=HYPERLINK("http://x.test","y")'), '"\'=HYPERLINK(""http://x.test"",""y"")"');
  assert.equal(c.csvCell('+1+1'), '"\'+1+1"');
  assert.equal(c.csvCell('-2+3'), '"\'-2+3"');
  assert.equal(c.csvCell('@SUM(A1)'), '"\'@SUM(A1)"');
  assert.equal(c.csvCell(' =1+1'), '"\' =1+1"');
  assert.equal(c.csvCell(-5), '"-5"');
  assert.equal(c.csvCell('-5'), '"-5"');
  assert.equal(c.csvCell('+919876543210'), '"+919876543210"');
  assert.equal(c.csvCell('Asha'), '"Asha"');
  assert.equal(c.csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(c.csvCell(null), '""');
});

/* ---- Delete All ---- */
function delEnv(opts) {
  const o = opts || {};
  const init = { 'saagar_dsr_2026-11-10_Asha': '{}', 'saagar_dsr_2026-11-11_Asha': '{}', 'saagar_dsr_2026-11-12_Meera': '{}', saagar_dsr_staff: '["Asha"]', saagar_dsr_settings: '{}', other_key: '1' };
  const ls = fakeStorage(init);
  const toasts = [];
  let reauth = 0, bulk = 0, cleared = [];
  const fakes = {
    localStorage: ls, toasts,
    DSR_REC_KEY_RE: /^saagar_dsr_\d{4}-\d{2}-\d{2}_/,
    el: () => ({ value: o.confirmText === undefined ? 'DELETE' : o.confirmText }),
    toast: (m, t) => toasts.push({ m, t }),
    stReauth: async () => { reauth++; return o.pin !== false; },
    closeModal() {}, renderSMSubmissions() {},
    _recSaveTimer: o.timer === undefined ? null : o.timer, _recCache: { key: 'k', rec: {} },
    clearTimeout: (id) => cleared.push(id),
    setTimeout,
    window: { parent: null },
  };
  fakes.window.parent = o.bulk ? { SaagarStore: { bulkAsync: async (fn) => { bulk++; await fn(); if (o.flushFails) throw new Error('flush'); } } } : fakes.window;
  const c = load(['let _deleteAllBusy', 'async function doDeleteAll('], fakes);
  return { c, ls, toasts, reauth: () => reauth, bulk: () => bulk, cleared, fakes };
}

test('Delete All needs the Owner PIN', async () => {
  const e = delEnv({ pin: false });
  await e.c.doDeleteAll();
  assert.equal(e.reauth(), 1);
  assert.equal(e.ls.length, 6);
  assert.equal(e.toasts.length, 0);
});

test('Delete All removes only dated records and keeps the staff list', async () => {
  const e = delEnv();
  await e.c.doDeleteAll();
  assert.equal(e.reauth(), 1);
  assert.ok(e.ls.getItem('saagar_dsr_staff'));
  assert.ok(e.ls.getItem('saagar_dsr_settings'));
  assert.ok(e.ls.getItem('other_key'));
  assert.equal(e.ls.length, 3);
  assert.equal(e.toasts.at(-1).m, '3 records deleted');
});

test('Delete All uses the store bulk path when the shell offers it', async () => {
  const e = delEnv({ bulk: true });
  await e.c.doDeleteAll();
  assert.equal(e.bulk(), 1);
  assert.equal(e.ls.length, 3);
});

test('Delete All reports a failed final save honestly (audit S05)', async () => {
  const e = delEnv({ bulk: true, flushFails: true });
  await e.c.doDeleteAll();
  assert.equal(e.ls.length, 3);
  assert.equal(e.toasts.at(-1).t, 'err');
  assert.match(e.toasts.at(-1).m, /^3 records deleted, but saving the change to the device failed$/);
});

test('Delete All needs the typed word and cancels a pending debounced save', async () => {
  const wrong = delEnv({ confirmText: 'delete' });
  await wrong.c.doDeleteAll();
  assert.equal(wrong.reauth(), 0);
  assert.equal(wrong.ls.length, 6);
  const e = delEnv({ timer: 77 });
  await e.c.doDeleteAll();
  assert.deepEqual(e.cleared, [77]);
  assert.equal(e.c._recSaveTimer, null);
});

test('Settings explains where staff are managed and keeps the add box hidden', () => {
  assert.ok(slice('function renderSMSettings(').includes('managed in Settings &gt; People'));
  assert.ok(SRC.includes('#lform-sm .lf-group{display:none !important}'));
  assert.ok(slice('function addStaff(').includes('readSavedStaff()'));
  assert.ok(slice('function confirmDeleteAll(').includes('Owner PIN'));
});
