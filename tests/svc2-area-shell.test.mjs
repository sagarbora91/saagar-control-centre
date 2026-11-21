// Billing area: shell, tabs by role, closed states, past view, unmount (P5 U67, U77 as corrected: no observer, no nav-button test here).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS } from './lib/svc2-area-kit.mjs';

const TAB_IDS = ['svb-tab-today', 'svb-tab-advances', 'svb-tab-unbilled', 'svb-tab-bills', 'svb-tab-receipts', 'svb-tab-old', 'svb-tab-settings'];

function tabActions(a) { return a.actionsIn(a.rootHtml()).filter((x) => x.startsWith('svb-tab-')); }

test('S01 Owner sees all seven tabs, Store Manager six (no Settings), in a tablist; Today is the default', async () => {
  const o = setup({ session: SESSIONS.owner });
  o.mount();
  await o.show();
  assert.deepEqual(tabActions(o), TAB_IDS);
  assert.match(o.rootHtml(), /role="tablist"/);
  assert.equal(o.rootHtml().match(/aria-selected="true"/g).length, 1);
  assert.match(o.rootText(), /Billing/);
  assert.match(o.rootText(), /Money for service jobs/);
  const m = setup({ session: SESSIONS.manager });
  m.mount();
  await m.show();
  assert.deepEqual(tabActions(m), TAB_IDS.slice(0, 6));
  assert.equal(m.find('svb-tab-settings'), null);
  // the Today tab is open: the day summary was read for the view date
  assert.equal(o.billing.last('daySummary').args[0], '2026-11-18');
});

test('S02 staff, a role that only says Store Manager, a billing-role cashier and no session see no tab and no amount', async () => {
  for (const key of ['desk', 'tech', 'fakeManager']) {
    const a = setup({ session: SESSIONS[key] });
    a.mount();
    await a.show();
    assert.deepEqual(tabActions(a), [], key);
    assert.match(a.rootText(), /The Billing area is for the Store Manager and the Owner\./, key);
    assert.deepEqual(a.billing.names().filter((n) => n !== 'status'), [], key);
  }
  const n = setup({ session: SESSIONS.none });
  n.mount();
  await n.show();
  assert.match(n.rootText(), /Your session could not be read\. Billing is closed\./);
  assert.deepEqual(n.billing.names().filter((x) => x !== 'status'), []);
});

test('S03 billing missing: the closed text, nothing else; a facade that cannot answer shows the error and Check again', async () => {
  const a = setup({ billing: null });
  a.mount();
  await a.show();
  assert.match(a.rootText(), /Billing is not available in this build\. Nothing was changed\./);
  assert.deepEqual(tabActions(a), []);
  const b = setup();
  b.billing.forced.status = { ok: false, code: 'BILLING_BLOCKED' };
  b.mount();
  await b.show();
  assert.match(b.rootText(), /The billing records failed their check\. Posting is stopped\. Tell the Owner\./);
  assert.ok(b.find('svb-area-retry'));
  b.billing.forced.status = undefined;
  delete b.billing.forced.status;
  await b.click('svb-area-retry');
  assert.deepEqual(tabActions(b).length, 7);
});

test('S04 not ready yet: the starting text and Check again, no tabs', async () => {
  const a = setup({ billingOpts: { status: { ready: false } } });
  a.mount();
  await a.show();
  assert.match(a.rootText(), /Billing is starting\./);
  assert.ok(a.find('svb-area-retry'));
  assert.deepEqual(tabActions(a), []);
});

test('S05 ledger failed: red banner with the code, Ledger check failed chip, lists still shown, no write button anywhere', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { status: { integrity: { ok: false, code: 'SVCS_CHAIN_BROKEN' } },
    held: { ok: true, rows: [{ jobId: 'WS-2026-001', netPaise: 100, receipts: [], oldestDocDate: '2026-11-01', ageDays: 17, jobState: 'OPEN' }], totalPaise: 100, count: 1 } } });
  a.mount();
  await a.show();
  assert.match(a.rootText(), /Ledger check failed SVCS_CHAIN_BROKEN/);
  assert.match(a.rootText(), /The billing records failed their check\. Posting is stopped\. Tell the Owner\./);
  await a.click('svb-tab-advances');
  assert.equal(a.find('svb-adv-refund'), null);
  assert.ok(a.find('svb-adv-open-job'));
  await a.click('svb-tab-settings');
  assert.equal(a.find('svb-set-save').disabled, true);
});

test('S06 healthy ledger: Ledger OK chip; a past view shows the read-only banner and chip and hides every write button', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { held: { ok: true, rows: [{ jobId: 'WS-2026-001', netPaise: 100, receipts: [], oldestDocDate: '2026-11-01', ageDays: 17, jobState: 'OPEN' }], totalPaise: 100, count: 1 } } });
  a.mount();
  await a.show();
  assert.match(a.rootText(), /Ledger OK/);
  assert.doesNotMatch(a.rootText(), /Past date: read-only/);
  await a.click('svb-tab-advances');
  assert.ok(a.find('svb-adv-refund'));
  a.h.past = true;
  a.area.onContextChange();
  await (await import('./lib/svc2-area-kit.mjs')).flush();
  assert.match(a.rootText(), /Past date: read-only/);
  assert.match(a.rootText(), /You are viewing a past date\. Billing cannot be changed\./);
  assert.equal(a.find('svb-adv-refund'), null);
  assert.ok(a.find('svb-adv-open-job'), 'reading and opening a job keep working in a past view');
});

test('S07 a session change closes an open dialog the new role may not have, with the access-changed toast, and re-renders the tabs', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { legacy: { ok: true, rows: [{ jobId: 'WS-2026-001', typedPaise: 120000, typedText: '1,200', state: 'OPEN' }], totalPaise: 120000, available: true } } });
  a.mount();
  await a.show();
  await a.click('svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  assert.ok(a.layer() && a.layerHtml().includes('svb-old-confirm-save'));
  a.h.session = SESSIONS.manager;
  a.area.onContextChange();
  const { flush } = await import('./lib/svc2-area-kit.mjs');
  await flush();
  assert.equal(a.layerHtml(), '');
  assert.ok(a.calls.toast.includes('Your access changed. Nothing was saved.'));
  assert.deepEqual(tabActions(a), TAB_IDS.slice(0, 6));
});

test('S08 a tab click switches the body and marks the tab selected; arrow keys move between tabs', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.mount();
  await a.show();
  await a.click('svb-tab-bills');
  const sel = a.rootHtml().match(/aria-selected="true"[^>]*data-svcs-action="([^"]+)"/);
  assert.equal(sel[1], 'svb-tab-bills');
  assert.ok(a.billing.count('listBills') >= 1);
  const tab = a.find('svb-tab-bills');
  const { fire, flush } = await import('./lib/svc2-area-kit.mjs');
  fire(a.doc, tab, 'keydown', { key: 'ArrowRight' });
  await flush();
  assert.match(a.rootHtml(), /aria-selected="true"[^>]*data-svcs-action="svb-tab-receipts"/);
});

test('S09 unmount removes every listener it added and closes its dialog; mounting again works; a second mount does not double the listeners', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { legacy: { ok: true, rows: [{ jobId: 'WS-2026-001', typedPaise: 120000, state: 'OPEN' }], totalPaise: 120000, available: true } } });
  a.mountUi();
  const before = a.listenerCount();
  a.mountArea();
  await a.show();
  await a.click('svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  assert.ok(a.layer());
  const during = a.listenerCount();
  assert.ok(during > before);
  a.area.unmount();
  assert.equal(a.listenerCount(), before);
  assert.equal(a.layer(), null);
  a.mountArea();
  const once = a.listenerCount();
  a.mountArea();
  assert.equal(a.listenerCount(), once, 'a second mount replaces, it does not add');
  await a.show();
  assert.deepEqual(tabActions(a), TAB_IDS);
});

test('S10 Escape closes only an open billing dialog (stopping the event); with none open it does nothing', async () => {
  const a = setup({ session: SESSIONS.owner, billingOpts: { legacy: { ok: true, rows: [{ jobId: 'WS-2026-001', typedPaise: 120000, state: 'OPEN' }], totalPaise: 120000, available: true } } });
  a.mount();
  await a.show();
  const { fire, flush } = await import('./lib/svc2-area-kit.mjs');
  const idle = fire(a.doc, a.doc.body, 'keydown', { key: 'Escape' });
  assert.equal(idle.stopped, false);
  await a.click('svb-tab-old');
  await a.click('svb-old-confirm', 'WS-2026-001|IN_BOOK');
  const ev = fire(a.doc, a.doc.body, 'keydown', { key: 'Escape' });
  await flush();
  assert.equal(ev.stopped, true);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(a.layerHtml(), '');
});

test('S11 the shell re-reads the facade on every show; a stale answer from an older render never paints', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.mount();
  let release;
  a.billing.forced.status = () => new Promise((res) => { release = () => res({ ok: true, ready: true, fy: 'FY2026-27', config: { discountLimitPaise: 0, billingRoles: [], estimateRoles: [] }, integrity: { ok: true } }); });
  const first = a.show();
  const firstRelease = release;
  a.billing.forced.status = undefined;
  delete a.billing.forced.status;
  await a.show();
  const html = a.rootHtml();
  firstRelease();
  await first;
  assert.equal(a.rootHtml(), html);
});
