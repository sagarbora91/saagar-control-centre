// Service wave 2, W-UI: privacy, escaping, contract, storage, listener counts (P5 U78 to U82).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { setup, SESSIONS, El, REAL_CORE_EXISTS } from './lib/svc2-ui-harness.mjs';

const EVIL = ['<img src=x onerror=alert(1)>', '"><script>x()</script>', 'a`b${c}d'];
const OWNER_CTX = () => ({ session: SESSIONS.owner, stepUp: { ok: true, at: 1 }, clientRef: 'seed-' + Math.random() });

function allElements(a) {
  const out = [];
  const walk = (n) => { for (const c of n.childNodes) if (c instanceof El) { out.push(c); walk(c); } };
  walk(a.doc.body);
  return out;
}

async function fullFlow(a) {
  await a.ready();
  await a.click('svb-job-estimate-open');
  await a.click('svb-est-add-part');
  await a.type('search', 'DEMO-P1', 0);
  await a.click('svb-est-pick', '0|DEMO-P1');
  await a.click('svb-est-save');
  await a.click('svb-job-approval-open');
  await a.check('tick', true);
  await a.click('svb-appr-save');
  await a.click('svb-rcpt-cancel').catch(() => {});
  await a.ui.internals.dispatch('svb-dialog-close');
  await a.click('svb-job-advance-open');
  await a.type('amount', '100');
  await a.type('note', EVIL[2]);
  await a.click('svb-rcpt-save');
  await a.click('svb-rcpt-done');
  await a.click('svb-job-bill-open');
  await a.type('ccpt', EVIL[0]);
  await a.click('svb-bill-review');
  await a.click('svb-bill-save');
  await a.click('svb-bill-done');
  await a.click('svb-job-balance-open');
  await a.type('amount', '100');
  await a.click('svb-rcpt-save');
  await a.click('svb-rcpt-done');
  await a.click('svb-job-cancel-open');
  await a.type('reason', EVIL[1]);
  await a.click('svb-cbill-confirm');
}

test('U78 privacy: the case carries customer fields; no call to the billing layer and no rendered HTML holds them; the host job view has no customer key', async () => {
  const c = { id: 'WS-2026-001', status: 'open', invoiceNo: '', paymentStatus: 'cash', stub: false, label: 'WS-2026-001 Titan Edge', voided: false, typedAdvancePaise: 0, custName: 'Invented Person', custMobile: '9000000001', custAddr: '1 Invented Lane' };
  const a = setup({ cases: { 'WS-2026-001': c } });
  const keys = ['id', 'status', 'invoiceNo', 'paymentStatus', 'stub', 'label', 'voided', 'typedAdvancePaise'];
  a.h.host.job = (id) => { const r = a.h.cases[id]; return r ? Object.fromEntries(keys.map((k) => [k, r[k]])) : null; };
  assert.deepEqual(Object.keys(a.h.host.job('WS-2026-001')), keys);
  await fullFlow(a);
  const calls = JSON.stringify(a.billing.calls);
  const html = a.doc.rawHtml.join('\n');
  for (const needle of ['custName', 'custMobile', 'custAddr', 'Invented Person', '9000000001', '1 Invented Lane']) {
    assert.equal(calls.includes(needle), false, 'call: ' + needle);
    assert.equal(html.includes(needle), false, 'html: ' + needle);
  }
  assert.ok(a.billing.count('issueBill') === 1 && a.billing.count('cancelBill') === 1, 'the flow ran: ' + a.billing.names().join(','));
});

test('U79 escaping: hostile text in CCPT numbers, notes, reasons and job labels never becomes markup', async () => {
  const cases = { 'WS-2026-001': { id: 'WS-2026-001', status: 'open', invoiceNo: '', paymentStatus: 'cash', stub: false, label: EVIL[0], voided: false, typedAdvancePaise: 0 } };
  const a = setup({ cases });
  await fullFlow(a);
  await a.ready();
  const bill = a.billing.state.jobs['WS-2026-001'].bills[0];
  bill.ccptInvoiceNo = EVIL[1];
  bill.status = 'ISSUED';
  await a.ui.refreshJob();
  const surfaces = [a.jobHtml(), a.closeHtml(), a.layerHtml(), a.doc.rawHtml.join('\n')];
  for (const h of surfaces) {
    assert.equal(/<img/i.test(h), false);
    assert.equal(/<script/i.test(h), false);
  }
  for (const el of allElements(a)) {
    assert.equal(Object.keys(el.attrs).some((k) => /^on/.test(k)), false, 'inline handler on ' + el.tag);
  }
  assert.ok(a.jobHtml().includes('&lt;') || a.jobHtml().includes('&quot;') || a.doc.rawHtml.join('').includes('&lt;img'), 'the text is shown, escaped');
});

test('U80 contract: every facade method the UI names exists in the real billing core file; the sync questions are answered by value', () => {
  assert.equal(REAL_CORE_EXISTS, true, 'service-billing-core.js is expected beside the UI');
  const src = fs.readFileSync(new URL('../www/service-billing-core.js', import.meta.url), 'utf8');
  const a = setup({});
  for (const name of Object.keys(a.ui.internals.BX)) assert.ok(new RegExp('\\b' + name + ': ' + name + '\\b').test(src), name + ' is not exported by the core');
  for (const sync of ['jobHasRecords', 'closeCheck', 'taxRoute', 'jobBilled', 'jobNoCharge', 'activeInvoiceNo']) {
    const body = src.slice(src.indexOf('function ' + sync + '('), src.indexOf('function ' + sync + '(') + 400);
    assert.equal(/Promise|\.then\(/.test(body), false, sync + ' must return a value');
  }
});

test('U81 no storage: the whole flow runs in a sandbox without localStorage, sessionStorage or indexedDB', async () => {
  const a = setup({});
  for (const k of ['localStorage', 'sessionStorage', 'indexedDB']) assert.equal(k in a.sandbox, false, k);
  await fullFlow(a);
  assert.ok(a.billing.count('takeReceipt') === 2);
});

test('U82 listeners and timers: the counts after mount are the ones declared in the report', async () => {
  const a = setup({});
  await a.ready();
  const els = allElements(a).concat([a.doc.body]);
  let n = a.doc.listeners.length;
  for (const el of els) n += el.listeners.length;
  assert.equal(a.doc.listeners.length, 1, 'one Escape listener on the document (capture)');
  assert.equal(a.doc.listeners[0].capture, true);
  assert.equal(n, 12, 'declared: 4 job card + 1 delivery strip + 5 layer + 1 Billing button + 1 Escape (the viewport resize listener needs a real window)');
  assert.equal(/setTimeout|setInterval|requestAnimationFrame/.test(fs.readFileSync(new URL('../www/service-billing-ui.js', import.meta.url), 'utf8')), false, 'no timers');
  a.ui.unmount();
  let left = a.doc.listeners.length;
  for (const el of els) left += el.listeners.length;
  assert.equal(left, 0, 'unmount removes every listener');
  assert.equal(a.layer(), null, 'and the dialog layer');
  assert.equal(a.ui.mount(a.h.host), true, 'mounting again works');
});
