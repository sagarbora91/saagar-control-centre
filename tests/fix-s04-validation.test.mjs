// S04 U03-F05, F06, F07, F09, F12.
import assert from 'node:assert/strict';
import test from 'node:test';
import { fn, constLine, run, plain } from './lib/fix-s04-qms.mjs';

// ---------- F05 advance ----------
function closeCtx(advance) {
  const toasts = [], saves = [];
  const c = { id: 'k1', status: 'Attending', queueNo: 'Q-001', name: 'A', assignedCroId: 'c1' };
  const vals = { closeOutcome: 'Service', fuReq: 'No', jobCardNo: 'J1', serviceType: 'Repair', deliveryDate: '2026-12-01', advance, followExpectedValue: '', followDate: '' };
  return {
    toasts, saves, c, state: { settings: { requireJobForService: true }, customers: [c], followups: [] }, role: 'SM',
    $: (id) => ({ value: vals[id] ?? '' }), guardWrite: () => true, customerById: () => c,
    qmsValidateOutcome: () => ({ ok: true }), uid: () => 'u1', tryFillFromWaiting: () => {},
    save: (a) => { saves.push(a); return true; }, closeModal: () => {}, toast: (m, t) => toasts.push({ m, t }),
    addAudit: () => {}, renderAll: () => {}, confirm: () => true, alert: () => {},
  };
}
test('S04-F05 negative advance is refused; blank, 0, 500, 500.5 accepted; 1e999 refused', () => {
  const src = fn('confirmCloseLead');
  assert.match(src, /Advance must be zero or more\./);
  function tryClose(adv) {
    const ctx = closeCtx(adv);
    try { run(ctx, src + '\nthis.go=confirmCloseLead;'); ctx.go('k1'); } catch (e) { ctx.err = e; }
    return ctx;
  }
  for (const bad of ['-900', '1e999', 'abc']) {
    const c = tryClose(bad);
    assert.notEqual(c.c.status, 'Closed', bad);
    assert.equal(c.c.advance, undefined, bad);
    assert.ok(c.toasts.some((t) => t.m === 'Advance must be zero or more.' && t.t === 'error'), bad);
    assert.equal(c.saves.length, 0, bad);
  }
  for (const [raw, want] of [['', 0], ['0', 0], ['500', 500], ['500.5', 500.5]]) {
    const c = tryClose(raw);
    assert.equal(c.err, undefined, raw + ' ' + (c.err && c.err.message));
    assert.equal(c.c.advance, want, raw);
  }
});

// ---------- F06 settings ----------
const SETTINGS_CODE = [constLine('QMS_SETTING_KINDS'), 'const DEFAULT_SETTINGS={storeName:"Saagar Traders",queuePrefix:"Q",waitAlertMins:10};', ...['qmsCleanSetting', 'qmsRepairSettings', 'updateSetting', 'fmtQueueNo'].map(fn)].join('\n')
  + '\nthis.api={qmsCleanSetting,qmsRepairSettings,updateSetting,fmtQueueNo};';
function settingsCtx(settings) {
  const saves = [], toasts = []; let renders = 0;
  const ctx = { state: { settings }, saves, toasts, guardPast: () => true, requireSM: () => true, save: (a, d) => { saves.push({ a, d }); return true; }, toast: (m, t) => toasts.push({ m, t }), renderAll: () => { renders++; } };
  run(ctx, SETTINGS_CODE);
  ctx.renders = () => renders;
  return ctx;
}
test('S04-F06 invalid settings are refused and leave the stored value alone', () => {
  const cases = [['waitAlertMins', '-5'], ['waitAlertMins', '2.5'], ['waitAlertMins', '99999'], ['waitAlertMins', 'abc'], ['waitAlertMins', '0'], ['waitAlertMins', ''],
    ['queuePrefix', ''], ['queuePrefix', '   '], ['queuePrefix', 'A-B'], ['queuePrefix', 'TOOLONG1'], ['storeName', ''], ['ownerWhatsApp', '12345'],
    ['ownerWhatsApp', '1234567890'], ['ownerWhatsApp', '5876543210'], ['ownerWhatsApp', '919876543'], ['nonsense', 'x']];
  for (const [k, v] of cases) {
    const c = settingsCtx({ waitAlertMins: 10, queuePrefix: 'Q', storeName: 'S', ownerWhatsApp: '' });
    const before = plain(c.state.settings);
    assert.equal(c.api.updateSetting(k, v), false, k + '=' + v);
    assert.deepEqual(plain(c.state.settings), before, k + '=' + v);
    assert.equal(c.saves.length, 0);
    assert.equal(c.toasts.length, 1);
    assert.equal(c.toasts[0].t, 'error');
    assert.ok(c.renders() >= 1);
  }
});
test('S04-F06 valid settings are cleaned and saved', () => {
  const c = settingsCtx({ waitAlertMins: 10, queuePrefix: 'Q', storeName: 'S', ownerWhatsApp: '' });
  assert.equal(c.api.updateSetting('waitAlertMins', '15'), true); assert.strictEqual(c.state.settings.waitAlertMins, 15);
  assert.equal(c.api.updateSetting('waitAlertMins', 15), true); assert.strictEqual(c.state.settings.waitAlertMins, 15);
  c.api.updateSetting('queuePrefix', ' Q2 '); assert.equal(c.state.settings.queuePrefix, 'Q2');
  c.api.updateSetting('ownerWhatsApp', '+91 98765 43210'); assert.equal(c.state.settings.ownerWhatsApp, '9876543210');
  c.api.updateSetting('ownerWhatsApp', ''); assert.equal(c.state.settings.ownerWhatsApp, '');
  // G8 (one Indian mobile rule): 0 + 10 digits and dashes are accepted; the 10 digits must start with 6 to 9.
  for (const [raw, want] of [['09876543210', '9876543210'], ['98765-43210', '9876543210'], ['919876543210', '9876543210'], ['6000000000', '6000000000']]) {
    const g = settingsCtx({ waitAlertMins: 10, queuePrefix: 'Q', storeName: 'S', ownerWhatsApp: '' });
    assert.equal(g.api.updateSetting('ownerWhatsApp', raw), true, raw); assert.equal(g.state.settings.ownerWhatsApp, want, raw);
  }
  c.api.updateSetting('autoAllocate', true); assert.strictEqual(c.state.settings.autoAllocate, true);
  c.api.updateSetting('autoAllocate', 'yes'); assert.strictEqual(c.state.settings.autoAllocate, false);
  assert.deepEqual(c.saves.map((s) => s.a), Array(7).fill('settings.update'));
});
test('S04-F06 load-time repair fixes impossible values only', () => {
  const a = settingsCtx({ waitAlertMins: -5, queuePrefix: '', storeName: ' ' });
  a.api.qmsRepairSettings();
  assert.deepEqual(plain(a.state.settings), { waitAlertMins: 10, queuePrefix: 'Q', storeName: 'Saagar Traders' });
  const b = settingsCtx({ waitAlertMins: 480, queuePrefix: 'TW', storeName: 'X' });
  b.api.qmsRepairSettings();
  assert.deepEqual(plain(b.state.settings), { waitAlertMins: 480, queuePrefix: 'TW', storeName: 'X' });
  const c = settingsCtx({ waitAlertMins: '', queuePrefix: 'Q', storeName: 'X' });
  c.api.qmsRepairSettings(); assert.equal(c.state.settings.waitAlertMins, 10);
});
test('S04-F06 updateSetting keeps its save contract', () => {
  assert.match(fn('updateSetting'), /return save\('settings\.update',\s*\{ key, value \}\)/);
});

// ---------- F07 remove CRO ----------
test('S04-F07 removing a CRO with an open lead warns by queue number', () => {
  function mk(withLead, ok) {
    const confirms = [], toasts = [], saves = [];
    const rot = { items: [{ croId: 'c3', order: 1 }, { croId: 'c4', order: 2 }], currentCroId: 'c3', priorityCroId: null };
    const ctx = {
      confirms, toasts, saves, rot, state: { customers: withLead ? [{ id: 'l1', queueNo: 'Q-007', assignedCroId: 'c3', status: 'Attending' }] : [], cros: [{ id: 'c3', name: 'Rohan' }] },
      guardWrite: () => true, requireSM: () => true, currentRotation: () => rot, activeRotationItems: (r) => r.items,
      todaysCustomers: () => ctx.state.customers, croName: (id) => (ctx.state.cros.find((c) => c.id === id) || {}).name || '-',
      confirm: (m) => { confirms.push(m); return ok; }, toast: (m, t) => toasts.push({ m, t }), save: (a, d) => { saves.push({ a, d }); return true; },
    };
    run(ctx, [fn('openLeadOf'), fn('removeCroToday'), 'this.go=removeCroToday;'].join('\n'));
    return ctx;
  }
  let c = mk(true, true); c.go('c3');
  assert.match(c.confirms[0], /Q-007/);
  assert.equal(c.rot.items.some((i) => i.croId === 'c3'), false);
  assert.equal(c.toasts.length, 1); assert.match(c.toasts[0].m, /Q-007/); assert.equal(c.toasts[0].t, 'warn');
  c = mk(true, false); c.go('c3');
  assert.equal(c.rot.items.length, 2); assert.equal(c.saves.length, 0);
  c = mk(false, true); c.go('c3');
  assert.equal(c.confirms[0], "Remove this CRO from today's rotation?");
  assert.equal(c.toasts.length, 0);
});

// ---------- F09 duplicate CRO ----------
test('S04-F09 duplicate CRO names are refused on add and edit', () => {
  function mk(vals) {
    const toasts = [], saves = [];
    const state = { cros: [{ id: 'a', name: 'Rohan Patil', active: false }, { id: 'b', name: 'Meera', active: true }] };
    const ctx = { state, toasts, saves, guardPast: () => true, requireSM: () => true, $: (id) => ({ value: vals[id] ?? '' }), uid: () => 'new1', save: (a) => { saves.push(a); return true; }, closeModal: () => {}, toast: (m, t) => toasts.push({ m, t }) };
    run(ctx, ['const kk=n=>String(n??"").trim().toLowerCase();', fn('qmsCroNameTaken'), fn('saveNewCro'), fn('confirmEditCro'), 'this.add=saveNewCro;this.edit=confirmEditCro;'].join('\n'));
    return ctx;
  }
  let c = mk({ newCroName: 'rohan patil', newCroCode: '' }); c.add();
  assert.equal(c.state.cros.length, 2); assert.equal(c.toasts[0].t, 'error'); assert.match(c.toasts[0].m, /already exists/);
  c = mk({ newCroName: 'Newbie', newCroCode: 'X' }); c.add(); assert.equal(c.state.cros.length, 3);
  c = mk({ editCroName: 'meera', editCroCode: '' }); c.edit('a');
  assert.equal(c.state.cros[0].name, 'Rohan Patil'); assert.equal(c.saves.length, 0);
  c = mk({ editCroName: 'MEERA', editCroCode: '9' }); c.edit('b');
  assert.equal(c.state.cros[1].name, 'MEERA'); assert.equal(c.saves.length, 1);
});

// ---------- F12 allocate ----------
test('S04-F12 declining Allocate anyway says what happens and is audited', () => {
  function mk(answer) {
    const audits = [], confirms = [];
    const c = { id: 'k1', queueNo: 'Q-002', status: 'New' };
    const rot = { currentCroId: 'c1', items: [{ croId: 'c1', status: 'Busy', active: true }] };
    const ctx = {
      c, audits, confirms, isPast: () => false, customerById: () => c, currentRotation: () => rot, rotationItem: (r, id) => r.items.find((i) => i.croId === id),
      isOffFloor: () => false, croBusy: () => true, croName: () => 'Asha', allocateCustomer: () => {},
      confirm: (m) => { confirms.push(m); return answer; }, addAudit: (a, d, s) => audits.push({ a, d, s }),
    };
    run(ctx, fn('manualAllocate') + '\nthis.go=manualAllocate;');
    ctx.go('k1', 'c1');
    return ctx;
  }
  let x = mk(false);
  assert.match(x.confirms[0], /busy/); assert.match(x.confirms[0], /Cancel = save the walk-in as Waiting/);
  assert.equal(x.c.status, 'Waiting'); assert.equal(x.c.assignedCroId, undefined);
  assert.equal(x.audits.length, 1); assert.equal(x.audits[0].a, 'customer.allocate.declined'); assert.equal(x.audits[0].s, true);
  x = mk(true);
  assert.equal(x.c.status, 'Allocated'); assert.equal(x.c.assignedCroId, 'c1'); assert.equal(x.audits[0].a, 'customer.allocate.manual');
});
