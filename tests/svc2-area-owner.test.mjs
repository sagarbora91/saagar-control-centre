// Billing area, Owner steps: old items (old advances, migration dry run and run) and the Settings tab (P5 U73, U74 as corrected).
// The PIN is always asked through host.reauth; a Store Manager is refused before the keypad; nothing is written without it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS, flush } from './lib/svc2-area-kit.mjs';

const ADV = { ok: true, available: true, totalPaise: 170000, rows: [
  { jobId: 'WS-2026-001', label: 'WS-2026-001 Titan Edge', typedPaise: 120000, typedText: '1,200', state: 'OPEN' },
  { jobId: 'WS-2026-005', label: 'WS-2026-005 Sonata', typedPaise: 50000, typedText: '500', state: 'OPEN' }
] };

function plan(n, skipped) {
  const invoices = [];
  for (let i = 1; i <= n; i++) invoices.push({ jobId: 'WS-2025-' + String(i).padStart(3, '0'), legacyNo: 'SV/2025-26/' + String(i).padStart(4, '0'), invoiceDate: '2026-02-' + String(i % 27 + 1).padStart(2, '0'), totalPaise: 100000 + i, basis: 'SNAPSHOT_V1', warn: [] });
  return { ok: true, plan: { invoices, skipped: skipped || [] } };
}
async function open(opts, tab) {
  const a = setup(opts);
  a.mount();
  await a.show();
  if (tab) await a.click(tab);
  return a;
}

/* ------------------------------------------------------------------ old advances */
test('O01 Old items: the Owner sees the list with two confirm buttons per job; the Store Manager sees the list and the Owner-only line', async () => {
  const o = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  const t = o.rootText();
  assert.ok(t.includes('Old advances to confirm'));
  assert.ok(t.includes('Typed on the job Rs 1,200.00') && t.includes('Typed on the job Rs 500.00'));
  assert.ok(o.find('svb-old-confirm', 'WS-2026-001|IN_BOOK'));
  assert.ok(o.find('svb-old-confirm', 'WS-2026-001|POST_NOW'));
  assert.equal(o.findAll('svb-old-confirm').length, 4);
  assert.equal(o.find('svb-old-confirm', 'WS-2026-001|IN_BOOK').textContent, 'Confirm, already in cash book');
  assert.equal(o.find('svb-old-confirm', 'WS-2026-001|POST_NOW').textContent, 'Confirm and post to cash book today');
  const m = await open({ session: SESSIONS.manager, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  assert.equal(m.findAll('svb-old-confirm').length, 0);
  assert.ok(m.rootText().includes('Only the Owner can confirm old advances.'));
  assert.ok(m.rootText().includes('Rs 1,200.00'));
  assert.equal(o.billing.last('legacyAdvances').args[0].session.tier, 'owner');
});

test('O02 Old items: nothing to confirm shows the empty sentence; a list the facade marks not available says so, not zero', async () => {
  const a = await open({ session: SESSIONS.owner }, 'svb-tab-old');
  assert.ok(a.rootText().includes('There are no old items to confirm.'));
  const b = await open({ session: SESSIONS.owner, billingOpts: { legacy: { ok: true, rows: [], totalPaise: 0, available: false } } }, 'svb-tab-old');
  const html = b.rootHtml();
  assert.ok(html.slice(html.indexOf('Old advances to confirm')).includes('not available'));
  assert.ok(!b.rootText().includes('There are no old items to confirm.'));
});

test('O03 Confirm old advance (already in cash book): dialog text, exact keypad label, payload, same-day receipt shown as done, list refreshed', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  const t = a.layerText();
  assert.ok(t.includes('Confirm old advance'));
  assert.ok(t.includes('This turns the amount typed on the job into a receipt. It will not be posted again to the cash book.'));
  assert.ok(t.includes('Rs 1,200.00'));
  assert.equal(a.field('payMode'), null, 'no payment mode for an amount already in the book');
  await a.type('note', 'checked against the cash book');
  await a.click('svb-old-confirm-save');
  assert.deepEqual(a.calls.reauth, ['Confirm old advance of Rs 1,200.00 on job WS-2026-001: already in cash book.']);
  const c = a.billing.last('decideLegacyAdvance');
  assert.deepEqual(c.args[0], { jobId: 'WS-2026-001', decision: 'IN_BOOK', amountPaise: 120000, payMode: 'Cash', note: 'checked against the cash book' });
  assert.equal(c.args[1].session.isOwner, true);
  assert.equal(c.args[1].stepUp.ok, true);
  assert.equal(typeof c.args[1].stepUp.at, 'number');
  assert.match(c.args[1].clientRef, /^svb-/);
  assert.equal(a.layerHtml(), '');
  assert.ok(a.calls.toast.includes('Old advance confirmed.'));
  assert.ok(!a.rootText().includes('WS-2026-001'), 'the confirmed job left the list');
  assert.ok(a.rootText().includes('WS-2026-005'));
});

test('O04 Confirm old advance (post now): the dialog asks how it was paid, says it will be posted today, and sends that mode', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-005|POST_NOW');
  assert.ok(a.layerText().includes('It will be posted to the cash book today as an advance.'));
  assert.ok(a.field('payMode'));
  await a.change('payMode', 'UPI');
  await a.click('svb-old-confirm-save');
  assert.equal(a.calls.reauth[0], 'Confirm old advance of Rs 500.00 on job WS-2026-005: post to cash book today.');
  assert.deepEqual(a.billing.last('decideLegacyAdvance').args[0], { jobId: 'WS-2026-005', decision: 'POST_NOW', amountPaise: 50000, payMode: 'UPI', note: '' });
});

test('O05 Confirm old advance: PIN not given keeps the dialog and the typed note, shows the refusal, and the facade is not called', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  await a.type('note', 'keep me');
  a.h.reauthResult = false;
  await a.click('svb-old-confirm-save');
  assert.equal(a.billing.count('decideLegacyAdvance'), 0);
  assert.ok(a.layerText().includes('Owner approval was not given. Nothing was changed.'));
  assert.equal(a.field('note').value, 'keep me');
  a.h.reauthResult = () => Promise.reject(new Error('keypad closed'));
  await a.click('svb-old-confirm-save');
  assert.equal(a.billing.count('decideLegacyAdvance'), 0);
  assert.ok(a.calls.toast.filter((x) => x === 'Owner approval was not given. Nothing was changed.').length >= 2);
  a.h.reauthResult = 'yes';
  await a.click('svb-old-confirm-save');
  assert.equal(a.billing.count('decideLegacyAdvance'), 0, 'only exactly true counts as a PIN');
  await a.click('svb-old-confirm-cancel');
  assert.equal(a.layerHtml(), '');
});

test('O06 Confirm old advance: Owner mode lost while the keypad was open refuses with the Owner-only text and no facade call', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  a.h.reauthResult = () => { a.h.session = SESSIONS.manager; return Promise.resolve(true); };
  await a.click('svb-old-confirm-save');
  assert.equal(a.billing.count('decideLegacyAdvance'), 0);
  assert.ok(a.layerText().includes('Only the Owner can do this. Unlock Owner mode in the app header, then try again.'));
});

test('O07 Confirm old advance: a refusal from the facade keeps the dialog; the retry reuses the same clientRef; a second dialog gets a new one', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  a.billing.forced.decideLegacyAdvance = { ok: false, code: 'NOT_ALLOWED' };
  await a.click('svb-old-confirm-save');
  assert.match(a.layerText(), /Your role cannot do this\./);
  delete a.billing.forced.decideLegacyAdvance;
  await a.click('svb-old-confirm-save');
  const refs = a.billing.calls.filter((c) => c.name === 'decideLegacyAdvance').map((c) => c.args[1].clientRef);
  assert.equal(refs.length, 2);
  assert.equal(refs[0], refs[1]);
  const b = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  await b.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  await b.click('svb-old-confirm-save');
  await b.click('svb-old-confirm', 'WS-2026-005|IN_BOOK');
  await b.click('svb-old-confirm-save');
  const r2 = b.billing.calls.filter((c) => c.name === 'decideLegacyAdvance').map((c) => c.args[1].clientRef);
  assert.notEqual(r2[0], r2[1]);
});

test('O08 Confirm old advance: a double tap sends one facade call and one keypad; the second press says another save is in progress', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  let release;
  a.h.reauthResult = () => new Promise((res) => { release = () => res(true); });
  const first = a.click('svb-old-confirm-save');
  await flush();
  assert.match(a.layerHtml(), /aria-busy="true"/);
  assert.match(a.layerText(), /Saving\.\.\./);
  assert.equal(a.find('svb-old-confirm-save').disabled, true, 'the button is disabled while saving');
  await a.click('svb-old-confirm-save');
  await a.area.internals.dispatch('svb-old-confirm-save', '');
  assert.equal(a.calls.reauth.length, 1);
  assert.ok(a.calls.toast.includes('Another save is in progress. Wait a moment.'));
  release();
  await first;
  await flush();
  assert.equal(a.billing.count('decideLegacyAdvance'), 1);
});

test('O09 Confirm old advance: forced clicks by a Manager, in a past view and on a failed ledger are refused before the keypad; the dialog never opens', async () => {
  const m = await open({ session: SESSIONS.manager, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  const r1 = await m.area.internals.dispatch('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  assert.equal(r1.code, 'SVB_OWNER_ONLY');
  assert.equal(m.layer(), null);
  assert.deepEqual(m.calls.reauth, []);
  const p = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  p.h.past = true;
  const r2 = await p.area.internals.dispatch('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  assert.equal(r2.code, 'SVB_PAST_VIEW');
  p.h.past = false;
  await p.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  p.h.past = true;
  const r3 = await p.area.internals.dispatch('svb-old-confirm-save', '');
  assert.equal(r3.code, 'SVB_PAST_VIEW');
  assert.deepEqual(p.calls.reauth, []);
  const b = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV, status: { integrity: { ok: false, code: 'SVCS_CHAIN_BROKEN' } } } }, 'svb-tab-old');
  assert.equal(b.findAll('svb-old-confirm').length, 0);
  const r4 = await b.area.internals.dispatch('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  assert.equal(r4.code, 'SVB_INTEGRITY');
});

test('O10 Confirm old advance: a key that is not a job and a choice, or a job that is no longer on the list, opens nothing', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { legacy: ADV } }, 'svb-tab-old');
  const r1 = await a.area.internals.dispatch('svb-old-confirm', 'WS-2026-001|MAYBE');
  assert.equal(r1.ok, false);
  const r2 = await a.area.internals.dispatch('svb-old-confirm', 'WS-2026-999|IN_BOOK');
  assert.equal(r2.code, 'SVB_NOTHING_TO_DO');
  assert.equal(a.layer(), null);
});

/* ------------------------------------------------------------------ migration */
test('O11 Migration dry run: counts, a row per old invoice with number, date, job and total, skipped count; nothing is written by looking', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { plan: plan(3, [{ jobId: 'WS-2025-099', code: 'SNAPSHOT_UNBUILDABLE' }]) } }, 'svb-tab-old');
  const t = a.rootText();
  assert.ok(t.includes('3 old invoices are not in the billing records yet.'));
  assert.ok(t.includes('Bringing them in posts nothing to the cash book and changes nothing on the jobs.'));
  for (const s of ['SV/2025-26/0001', 'SV/2025-26/0003', 'WS-2025-002', 'Rs 1,000.01', 'Rs 1,000.03', '2026-02-02']) assert.ok(t.includes(s), s);
  assert.ok(t.includes('Skipped: 1'));
  assert.ok(a.find('svb-migrate-run') && a.find('svb-migrate-check'));
  assert.equal(a.billing.count('runMigration'), 0);
  assert.equal(a.calls.reauth.length, 0);
  assert.equal(a.billing.last('planMigration').args[0].session.tier, 'owner');
});

test('O12 Migration dry run: a long list shows 20 rows and "and N more"; a flat plan answer (no plan key) works too', async () => {
  const flat = plan(25).plan;
  const a = await open({ session: SESSIONS.owner, billingOpts: { plan: Object.assign({ ok: true }, flat) } }, 'svb-tab-old');
  assert.equal(a.rootText().match(/SV\/2025-26\/\d{4}/g).length, 20);
  assert.ok(a.rootText().includes('and 5 more'));
  assert.ok(a.rootText().includes('25 old invoices are not in the billing records yet.'));
});

test('O13 Migration run: the Owner presses Bring in these records, gives the PIN (exact label), the plan goes to runMigration with the stamp, the list then says everything is in', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { plan: plan(3) } }, 'svb-tab-old');
  await a.click('svb-migrate-run');
  assert.deepEqual(a.calls.reauth, ['Bring 3 old invoices into the billing records. Nothing is posted to the cash book.']);
  const c = a.billing.last('runMigration');
  assert.equal(c.args[0].invoices.length, 3);
  assert.equal(c.args[1].session.isOwner, true);
  assert.equal(c.args[1].stepUp.ok, true);
  assert.ok(a.calls.toast.includes('Old invoices brought in: 3.'));
  assert.ok(a.rootText().includes('Every old invoice is already in the billing records.'));
  assert.equal(a.find('svb-migrate-run'), null, 'a re-run is not offered when nothing is pending');
  assert.equal(a.billing.count('runMigration'), 1);
});

test('O14 Migration run: PIN not given writes nothing; a Store Manager sees the dry run, no run button and the Owner-only line; forced clicks are refused first', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { plan: plan(2) } }, 'svb-tab-old');
  a.h.reauthResult = false;
  await a.click('svb-migrate-run');
  assert.equal(a.billing.count('runMigration'), 0);
  assert.ok(a.calls.toast.includes('Owner approval was not given. Nothing was changed.'));
  const m = await open({ session: SESSIONS.manager, billingOpts: { plan: plan(2) } }, 'svb-tab-old');
  assert.equal(m.find('svb-migrate-run'), null);
  assert.ok(m.rootText().includes('Only the Owner can bring in old invoices.'));
  assert.ok(m.rootText().includes('SV/2025-26/0001'));
  const r = await m.area.internals.dispatch('svb-migrate-run', '');
  assert.equal(r.code, 'SVB_OWNER_ONLY');
  assert.deepEqual(m.calls.reauth, []);
  assert.equal(m.billing.count('runMigration'), 0);
  const p = await open({ session: SESSIONS.owner, billingOpts: { plan: plan(2) } }, 'svb-tab-old');
  p.h.past = true;
  assert.equal((await p.area.internals.dispatch('svb-migrate-run', '')).code, 'SVB_PAST_VIEW');
  assert.equal(p.billing.count('runMigration'), 0);
});

test('O15 Migration run: a double tap gives one keypad and one run; a facade refusal is shown and the list stays; nothing pending shows the empty sentence with Check again', async () => {
  const a = await open({ session: SESSIONS.owner, billingOpts: { plan: plan(2) } }, 'svb-tab-old');
  let release;
  a.h.reauthResult = () => new Promise((res) => { release = () => res(true); });
  const first = a.click('svb-migrate-run');
  await flush();
  await a.click('svb-migrate-run');
  assert.equal(a.calls.reauth.length, 1);
  release();
  await first;
  await flush();
  assert.equal(a.billing.count('runMigration'), 1);
  const b = await open({ session: SESSIONS.owner, billingOpts: { plan: plan(2) } }, 'svb-tab-old');
  b.billing.forced.runMigration = { ok: false, code: 'BILLING_BLOCKED' };
  await b.click('svb-migrate-run');
  assert.match(b.rootText(), /The billing records failed their check/);
  assert.ok(b.find('svb-migrate-run'));
  const c = await open({ session: SESSIONS.owner }, 'svb-tab-old');
  assert.ok(c.rootText().includes('Every old invoice is already in the billing records.'));
  const reads = c.billing.count('planMigration');
  await c.click('svb-migrate-check');
  assert.equal(c.billing.count('planMigration'), reads + 1);
});

/* ------------------------------------------------------------------ settings tab */
async function openSettings(extra) {
  return open(Object.assign({ session: SESSIONS.owner }, extra || {}), 'svb-tab-settings');
}
const ROLES = ['Cashier', 'CRO', 'Greeter', 'Technician', 'Assistant Technician', 'Trainee', 'Others'];

test('T01 Settings tab (Owner only): the limit field with its hint, seven role boxes in each group, ticks follow the saved lists, no Store Manager box', async () => {
  const a = await openSettings({ billingOpts: { status: { config: { discountLimitPaise: 25000, billingRoles: ['Cashier', 'Technician'], estimateRoles: ['Technician', 'Assistant Technician'] } } } });
  const t = a.rootText();
  for (const s of ['Billing settings', 'These settings apply to estimates, bills and receipts.', 'Store Manager discount limit (Rs)',
    'A discount above this needs the Owner and the PIN. Zero means every discount needs the Owner.', 'Roles that can take money and make bills',
    'Store Manager and Owner can always do this. Staff roles that are not ticked cannot.', 'Roles that can build estimates and record approvals', 'Save billing settings']) assert.ok(t.includes(s), s);
  assert.equal(a.field('limit').value, '250.00');
  for (let i = 0; i < 7; i++) {
    assert.ok(a.field('br' + i) && a.field('er' + i));
    const billOn = ['Cashier', 'Technician'].includes(ROLES[i]);
    const estOn = ['Technician', 'Assistant Technician'].includes(ROLES[i]);
    assert.equal(a.field('br' + i).checked, billOn, 'bill ' + ROLES[i]);
    assert.equal(a.field('er' + i).checked, estOn, 'estimate ' + ROLES[i]);
  }
  assert.equal(a.rootHtml().match(/type="checkbox"/g).length, 14);
  assert.ok(!/Store Manager<\/label>/.test(a.rootHtml()));
});

test('T02 Settings: Save asks the Owner PIN with the exact label and sends exactly {discountLimitPaise, billingRoles, estimateRoles} in the fixed role order; success toast, the saved values come back', async () => {
  const a = await openSettings();
  assert.equal(a.field('limit').value, '0.00');
  await a.type('limit', '250');
  await a.change('br3', true);
  await a.change('br0', true);
  await a.change('er5', true);
  const statusBefore = a.billing.count('status');
  await a.click('svb-set-save');
  assert.deepEqual(a.calls.reauth, ['Change billing settings: discount limit Rs 250.00, 2 billing roles.']);
  const c = a.billing.last('setConfig');
  assert.deepEqual(c.args[0], { discountLimitPaise: 25000, billingRoles: ['Cashier', 'Technician'], estimateRoles: ['Technician', 'Assistant Technician', 'Trainee'] });
  assert.equal(c.args[1].session.isOwner, true);
  assert.equal(c.args[1].stepUp.ok, true);
  assert.ok(a.calls.toast.includes('Billing settings saved.'));
  assert.equal(a.field('limit').value, '250.00');
  assert.equal(a.field('br0').checked, true);
  assert.equal(a.billing.count('status'), statusBefore + 1, 'the settings were read again after the save');
  assert.deepEqual(a.billing.names().filter((n) => !['status', 'daySummary'].includes(n)), ['setConfig'], 'only setConfig was written; the Stores limits are untouched');
});

test('T03 Settings: a limit that is not rupees, or above Rs 10,00,000, is refused under the field with no keypad and no call; zero is allowed', async () => {
  const a = await openSettings();
  for (const bad of ['abc', '12.345', '-5', '1000000.01', '']) {
    await a.type('limit', bad);
    await a.click('svb-set-save');
    assert.ok(a.rootText().includes('Enter an amount in rupees, for example 149.50.'), bad);
    assert.match(a.rootHtml(), /aria-invalid="true"/);
  }
  assert.deepEqual(a.calls.reauth, []);
  assert.equal(a.billing.count('setConfig'), 0);
  await a.type('limit', '0');
  await a.click('svb-set-save');
  assert.deepEqual(a.billing.last('setConfig').args[0].discountLimitPaise, 0);
  await a.type('limit', '1000000');
  await a.click('svb-set-save');
  assert.equal(a.billing.last('setConfig').args[0].discountLimitPaise, 100000000);
});

test('T04 Settings: PIN not given or lost Owner mode changes nothing; a facade refusal shows its text and keeps the typed values', async () => {
  const a = await openSettings();
  await a.type('limit', '99');
  a.h.reauthResult = false;
  await a.click('svb-set-save');
  assert.equal(a.billing.count('setConfig'), 0);
  assert.ok(a.calls.toast.includes('Owner approval was not given. Nothing was changed.'));
  assert.equal(a.field('limit').value, '99');
  a.h.reauthResult = () => { a.h.session = SESSIONS.manager; return Promise.resolve(true); };
  await a.click('svb-set-save');
  assert.equal(a.billing.count('setConfig'), 0);
  assert.ok(a.calls.toast.includes('Only the Owner can do this. Unlock Owner mode in the app header, then try again.'));
  const b = await openSettings();
  b.billing.forced.setConfig = { ok: false, code: 'NOT_ALLOWED' };
  await b.type('limit', '99');
  await b.click('svb-set-save');
  assert.match(b.rootText(), /Your role cannot do this\./);
  assert.equal(b.field('limit').value, '99');
});

test('T05 Settings: the Store Manager has no Settings tab; a forced save by the Manager, in a past view or on a failed ledger is refused before the keypad', async () => {
  const m = await open({ session: SESSIONS.manager }, null);
  assert.equal(m.find('svb-tab-settings'), null);
  const r1 = await m.area.internals.dispatch('svb-set-save', '');
  assert.equal(r1.code, 'SVB_OWNER_ONLY');
  const t = await open({ session: SESSIONS.tech }, null);
  assert.equal((await t.area.internals.dispatch('svb-set-save', '')).code, 'SVB_ROLE_DENIED');
  const p = await openSettings();
  p.h.past = true;
  assert.equal((await p.area.internals.dispatch('svb-set-save', '')).code, 'SVB_PAST_VIEW');
  const b = await openSettings({ billingOpts: { status: { integrity: { ok: false, code: 'SVCS_CHAIN_BROKEN' } } } });
  assert.equal((await b.area.internals.dispatch('svb-set-save', '')).code, 'SVB_INTEGRITY');
  assert.deepEqual([m, t, p, b].map((x) => x.calls.reauth.length), [0, 0, 0, 0]);
  assert.deepEqual([m, t, p, b].map((x) => x.billing.count('setConfig')), [0, 0, 0, 0]);
});

test('T06 Settings: a double tap on Save gives one keypad and one write; a past-view Settings tab still shows the saved values (read-only)', async () => {
  const a = await openSettings();
  let release;
  a.h.reauthResult = () => new Promise((res) => { release = () => res(true); });
  await a.type('limit', '75');
  const first = a.click('svb-set-save');
  await flush();
  await a.click('svb-set-save');
  assert.equal(a.calls.reauth.length, 1);
  release();
  await first;
  await flush();
  assert.equal(a.billing.count('setConfig'), 1);
  const p = await open({ session: SESSIONS.owner, billingOpts: { status: { config: { discountLimitPaise: 5000, billingRoles: ['CRO'], estimateRoles: [] } } } }, null);
  p.h.past = true;
  await p.click('svb-tab-settings');
  assert.equal(p.field('limit').value, '50.00');
  assert.equal(p.field('br1').checked, true);
  assert.equal(p.find('svb-set-save').disabled, true);
});

test('T07 Settings: typed values survive a re-render of the tab (a context change) until the tab is left; leaving and coming back reloads the saved values', async () => {
  const a = await openSettings();
  await a.type('limit', '123.45');
  await a.change('br2', true);
  a.area.onContextChange();
  await flush();
  assert.equal(a.field('limit').value, '123.45');
  assert.equal(a.field('br2').checked, true);
  await a.click('svb-tab-bills');
  await a.click('svb-tab-settings');
  assert.equal(a.field('limit').value, '0.00');
  assert.equal(a.field('br2').checked, false);
});

test('O11b Stage E round 2 (B): the Old items screen names each skipped job and says why in plain words', async () => {
  const p = plan(2, [{ jobId: 'WS-DUP-001', code: 'DUPLICATE_LEGACY_NUMBER', legacyNo: 'SV/2025-26/0009' }, { jobId: 'WS-DUP-002', code: 'DUPLICATE_LEGACY_NUMBER', legacyNo: 'SV/2025-26/0009' }]);
  p.plan.skippedWhy = [
    { jobId: 'WS-DUP-001', legacyNo: 'SV/2025-26/0009', code: 'DUPLICATE_LEGACY_NUMBER', why: 'Another old job carries the same invoice number.' },
    { jobId: 'WS-DUP-002', legacyNo: 'SV/2025-26/0009', code: 'DUPLICATE_LEGACY_NUMBER', why: 'Another old job carries the same invoice number.' }
  ];
  const a = await open({ session: SESSIONS.owner, billingOpts: { plan: p } }, 'svb-tab-old');
  const t = a.rootText();
  assert.ok(t.includes('Skipped: 2'));
  assert.ok(t.includes('Job WS-DUP-001 (old invoice SV/2025-26/0009): Another old job carries the same invoice number.'), t);
  assert.ok(t.includes('Job WS-DUP-002 (old invoice SV/2025-26/0009): Another old job carries the same invoice number.'));
  // an older facade without reasons: the job is still named
  const b = await open({ session: SESSIONS.owner, billingOpts: { plan: plan(0, [{ jobId: 'WS-2025-099', code: 'SNAPSHOT_UNBUILDABLE' }]) } }, 'svb-tab-old');
  assert.ok(b.rootText().includes('Job WS-2025-099 (old invoice -): Left out by the bring-in checks.'));
});
