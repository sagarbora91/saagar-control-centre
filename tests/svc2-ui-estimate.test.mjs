// Service wave 2, W-UI: the estimate builder and the customer approval form (P5 U31 to U41, as corrected by the plan:
// estimates carry no discount and no PIN; methods are WHATSAPP, CALL, IN_PERSON, SIGNED, OTHER; the approval window is 7 days).
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, SESSIONS, flush } from './lib/svc2-ui-harness.mjs';

const text = (html) => html.replace(/<[^>]+>/g, ' ').replace(/&#39;/g, "'").replace(/\s+/g, ' ').trim();
const plain = (v) => JSON.parse(JSON.stringify(v));
const DESK_CFG = { status: { config: { discountLimitPaise: 0, billingRoles: ['Cashier'], estimateRoles: ['Technician'] } } };

async function openEst(opts) {
  const a = setup(opts || {});
  await a.ready();
  await a.click('svb-job-estimate-open');
  return a;
}
async function addPart(a, i, code) {
  await a.click('svb-est-add-part');
  await a.type('search', code, i);
  await a.click('svb-est-pick', i + '|' + code);
}
async function addLabour(a, i, code) {
  await a.click('svb-est-add-labour');
  await a.type('search', code, i);
  await a.click('svb-est-pick', i + '|' + code);
}

test('U31 add part, labour and other lines; Add other line is absent for desk; a picked part fills code, name, tax code, rate, price; Enter on an exact code picks; inactive items are not offered', async () => {
  const a = await openEst({ session: SESSIONS.owner });
  assert.ok(a.layerHtml().includes('svb-est-add-other'));
  await addPart(a, 0, 'DEMO-P1');
  const t = text(a.layerHtml());
  assert.match(t, /Demo glass/);
  assert.match(t, /HSN 9114 \/ 18%/);
  assert.match(t, /Unit price \(Rs\): Rs 1,180\.00/);
  await a.click('svb-est-add-labour');
  await a.type('search', 'DEMO-L1', 1);
  const box = a.layerHtml();
  assert.ok(box.includes('data-svs-key="1|DEMO-L1"'));
  await a.key(a.field('search', 1), 'Enter');
  assert.match(text(a.layerHtml()), /Demo service SAC 998719 \/ 18%/);
  await a.click('svb-est-add-part');
  await a.type('search', 'DEMO-P', 2);
  const html = a.layerHtml();
  assert.equal(html.includes('DEMO-P5'), false, 'an inactive item is never offered');
  assert.ok(html.includes('DEMO-P1') && html.includes('DEMO-P2'));
  await a.click('svb-est-add-other');
  assert.ok(a.field('hsn', 3) && a.field('rate', 3) && a.field('basis', 3) && a.field('price', 3) && a.field('name', 3));
  const d = await openEst({ session: SESSIONS.desk, billingOpts: DESK_CFG });
  assert.equal(d.layerHtml().includes('svb-est-add-other'), false);
  await d.ui.internals.dispatch('svb-est-add-other');
  assert.equal(d.field('hsn', 0), null, 'a forced click adds no other line either');
});

test('U32 a master item with tax details missing is listed disabled with its hint; Open Stores only for Store Manager and Owner; it cannot be picked by any route', async () => {
  const a = await openEst({ session: SESSIONS.manager });
  await a.click('svb-est-add-part');
  await a.type('search', 'DEMO-P4', 0);
  const html = a.layerHtml();
  assert.match(html, /<button[^>]*svb-est-pick[^>]*disabled[^>]*>/);
  assert.match(text(html), /Tax details missing/);
  assert.match(text(html), /Ask the Store Manager or the Owner to add the tax code and rate in Stores, Parts and labour\./);
  assert.ok(html.includes('svb-job-stores-open'));
  const r = await a.ui.internals.dispatch('svb-est-pick', '0|DEMO-P4');
  assert.equal(r.ok, false);
  assert.equal(r.code, 'SVB_TAX_MISSING');
  await a.click('svb-job-stores-open');
  assert.equal(a.h.calls.showStores, 1);
  const d = await openEst({ session: SESSIONS.desk, billingOpts: DESK_CFG });
  await d.click('svb-est-add-labour');
  await d.type('search', 'DEMO-L2', 0);
  assert.equal(d.layerHtml().includes('svb-job-stores-open'), false, 'desk gets no Open Stores button');
  const r2 = await d.ui.internals.dispatch('svb-est-pick', '0|DEMO-L2');
  assert.equal(r2.code, 'SVB_TAX_MISSING');
});

test('U33 every message of 6.1 shows for its case and sets aria-invalid', async () => {
  const a = await openEst({ session: SESSIONS.owner });
  await a.click('svb-est-save');
  assert.match(text(a.layerHtml()), /Add at least one line\./);
  assert.equal(a.billing.count('saveEstimate'), 0);
  await a.click('svb-est-add-part');
  await a.click('svb-est-save');
  let h = a.layerHtml();
  assert.match(h, /Pick an item from the list\./);
  assert.match(h, /aria-invalid="true"/);
  await a.type('search', 'DEMO-P1', 0);
  await a.click('svb-est-pick', '0|DEMO-P1');
  await a.type('qty', '0', 0);
  await a.click('svb-est-save');
  assert.match(text(a.layerHtml()), /Enter a whole number from 1 to 100000\./);
  await a.type('qty', '100001', 0);
  await a.click('svb-est-save');
  assert.match(text(a.layerHtml()), /Enter a whole number from 1 to 100000\./);
  await a.type('qty', '1', 0);
  await a.click('svb-est-add-part');
  await a.type('search', 'DEMO-P1', 1);
  await a.click('svb-est-pick', '1|DEMO-P1');
  await a.click('svb-est-save');
  assert.match(text(a.layerHtml()), /This part is already on another line\. Combine the quantities\./);
  await a.click('svb-est-line-remove', '1');
  await a.click('svb-est-add-other');
  await a.click('svb-est-save');
  h = text(a.layerHtml());
  assert.match(h, /This field is required\./);
  assert.match(h, /Enter 4, 6 or 8 digits\./);
  assert.match(h, /Enter a rate from 0 to 100\./);
  assert.match(h, /Choose how the price was quoted\./);
  await a.type('name', 'Odd job', 1);
  await a.type('hsn', '998719', 1);
  await a.type('rate', '101', 1);
  await a.setSelect('basis', 'EXCL', 1);
  await a.type('price', '0', 1);
  await a.click('svb-est-save');
  h = text(a.layerHtml());
  assert.match(h, /Enter a rate from 0 to 100\./);
  assert.match(h, /Enter a price above zero\./);
  assert.equal(a.billing.count('saveEstimate'), 0, 'nothing reaches the billing layer while fields are bad');
  for (let i = 0; i < 40; i++) await a.click('svb-est-add-other');
  const r = await a.ui.internals.dispatch('svb-est-add-other');
  assert.equal(r.code, 'SVB_TOO_MANY_LINES');
  assert.match(text(a.layerHtml()), /An estimate can have at most 40 lines\./);
});

test('U34 the price-basis select shows only when the master basis is unknown, and always for an other line; its value goes into the payload', async () => {
  const a = await openEst({ session: SESSIONS.owner });
  await addPart(a, 0, 'DEMO-P1');
  assert.equal(a.field('basis', 0), null, 'master states its basis: no select');
  await addPart(a, 1, 'DEMO-P3');
  assert.ok(a.field('basis', 1), 'unknown master basis: select shown');
  await a.click('svb-est-save');
  assert.match(text(a.layerHtml()), /Choose how the price was quoted\./);
  await a.setSelect('basis', 'INCL', 1);
  await a.click('svb-est-add-other');
  await a.type('name', 'Odd job', 2);
  await a.type('hsn', '998719', 2);
  await a.type('rate', '18', 2);
  await a.setSelect('basis', 'EXCL', 2);
  await a.type('price', '100', 2);
  await a.click('svb-est-save');
  const p = a.billing.last('saveEstimate').args[0];
  assert.deepEqual(plain(p.lines[0]), { kind: 'PART', code: 'DEMO-P1', qty: 1 });
  assert.deepEqual(plain(p.lines[1]), { kind: 'PART', code: 'DEMO-P3', qty: 1, priceBasis: 'INCL' });
  assert.deepEqual(plain(p.lines[2]), { kind: 'OTHER', name: 'Odd job', qty: 1, unitPricePaise: 10000, priceBasis: 'EXCL', hsnSac: '998719', rateBp: 1800 });
});

test('U35 the live footer shows calc figures from integer paise, the CGST/SGST/IGST note, and a round-off below one rupee', async () => {
  const a = await openEst({ session: SESSIONS.owner });
  await addPart(a, 0, 'DEMO-P1');
  await addLabour(a, 1, 'DEMO-L1');
  let t = text(a.layerHtml());
  assert.match(t, /Taxable value Rs 1,300\.00 CGST \+ SGST Rs 234\.00 Round-off Rs 0\.00 Estimate total Rs 1,534\.00/);
  assert.match(t, /GST is shown for a customer in Maharashtra\. A GST-registered customer from another state gets IGST on the bill\. The total stays the same\./);
  await a.type('qty', '3', 1);
  t = text(a.layerHtml());
  assert.match(t, /Estimate total Rs 2,242\.00/);
  const ro = Array.from(t.matchAll(/Round-off (-?Rs [\d,.]+|Rs -[\d,.]+)/g)).map((m) => m[1]);
  for (const r of ro) assert.ok(Math.abs(parseFloat(r.replace(/[^\d.-]/g, ''))) < 1, r);
});

test('U36 an estimate has no discount field and never asks for the Owner PIN, for any role', async () => {
  for (const [sess, extra] of [[SESSIONS.owner, {}], [SESSIONS.manager, {}], [SESSIONS.desk, { billingOpts: DESK_CFG }]]) {
    const a = await openEst(Object.assign({ session: sess }, extra));
    await addPart(a, 0, 'DEMO-P1');
    assert.equal(a.field('discount', 0), null);
    assert.equal(/Discount \(Rs\)|Reason for the discount/.test(text(a.layerHtml())), false);
    await a.click('svb-est-save');
    assert.equal(a.h.calls.reauth.length, 0);
    assert.equal(a.billing.count('saveEstimate'), 1);
    assert.equal(a.billing.last('saveEstimate').args[1].stepUp, null);
  }
});

test('U37 the save payload keys are exactly jobId, lines, note, reason; money is integer paise; no customer text', async () => {
  const a = await openEst({ session: SESSIONS.owner });
  await addPart(a, 0, 'DEMO-P2');
  await a.type('qty', '2', 0);
  await a.type('note', 'invented note text', undefined);
  await a.click('svb-est-save');
  const c = a.billing.last('saveEstimate');
  assert.deepEqual(Object.keys(c.args[0]).sort(), ['jobId', 'lines', 'note', 'reason']);
  assert.deepEqual(plain(c.args[0].lines), [{ kind: 'PART', code: 'DEMO-P2', qty: 2 }]);
  assert.equal(c.args[0].jobId, 'WS-2026-001');
  assert.deepEqual(Object.keys(c.args[1]).sort(), ['clientRef', 'session', 'stepUp']);
  assert.match(c.args[1].clientRef, /^svb-/);
  assert.equal(/cust|mobile|phone|address/i.test(JSON.stringify(c.args[0])), false);
});

test('U38 the result view offers approval when needed; a covering approval closes with the toast', async () => {
  const a = await openEst({ session: SESSIONS.owner });
  await addPart(a, 0, 'DEMO-P1');
  await a.click('svb-est-save');
  assert.match(text(a.layerHtml()), /Saved\. The customer must approve this estimate\./);
  assert.ok(a.layerHtml().includes('svb-job-approval-open'));
  assert.match(a.h.calls.toast.pop(), /^Estimate version 1 saved: Rs 1,180\.00\.$/);
  await a.click('svb-job-approval-open');
  assert.ok(a.layerHtml().includes('svb-appr-save'), 'Record approval now opens the form');
  const b = setup({ session: SESSIONS.owner });
  b.seedApproved();
  await b.ready();
  await b.click('svb-job-estimate-open');
  await b.click('svb-est-line-remove', '1');
  await b.type('reason', 'smaller job', undefined);
  await b.click('svb-est-save');
  assert.equal(b.billing.last('saveEstimate').args[0].reason, 'smaller job');
  assert.equal(b.layerHtml().includes('svb-job-approval-open'), false, 'the old approval still covers a lower total');
});

test('U39 approval form: defaults, the five methods, future and old dates, time, the tick box, read-only amount', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.seedEstimate();
  await a.ready();
  await a.click('svb-job-approval-open');
  assert.equal(a.field('method').value, 'IN_PERSON');
  assert.equal(a.field('takenBy').value, 'Test Owner');
  assert.equal(a.field('date').value, '2026-11-13');
  assert.equal(a.field('time').value, '11:00');
  assert.match(text(a.layerHtml()), /Estimate version 1, total Rs 1,534\.00/);
  assert.equal(a.field('amount'), null, 'the approved amount is read-only text, not a field');
  const methods = Array.from(a.field('method').descendants().filter((e) => e.tag === 'option')).map((e) => e.getAttribute('value'));
  assert.deepEqual(methods, ['IN_PERSON', 'CALL', 'WHATSAPP', 'SIGNED', 'OTHER']);
  await a.click('svb-appr-save');
  assert.match(text(a.layerHtml()), /Tick the box to confirm the customer agreed\./);
  await a.check('tick', true);
  await a.type('date', '2026-11-14');
  await a.click('svb-appr-save');
  assert.match(text(a.layerHtml()), /The date cannot be in the future\./);
  await a.type('date', '2026-11-05');
  await a.click('svb-appr-save');
  assert.match(text(a.layerHtml()), /Enter a date within the last 7 days\./);
  await a.type('date', '2026-11-13');
  await a.type('time', '25:99');
  await a.click('svb-appr-save');
  assert.match(text(a.layerHtml()), /Enter a valid time\./);
  await a.type('time', '23:00');
  await a.click('svb-appr-save');
  assert.match(text(a.layerHtml()), /The date cannot be in the future\./, 'a time later than now today is in the future');
  await a.type('time', '09:15');
  await a.type('takenBy', '   ');
  await a.click('svb-appr-save');
  assert.match(text(a.layerHtml()), /This field is required\./);
  assert.equal(a.billing.count('recordApproval'), 0);
  await a.type('takenBy', 'Asha');
  await a.setSelect('method', 'OTHER');
  await a.click('svb-appr-save');
  assert.match(text(a.layerHtml()), /This field is required\./, 'OTHER needs evidence');
});

test('U40 approval payload keys; the old job-sheet field is written once with rupees; a failure there is shown and does not undo the approval', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.seedEstimate();
  await a.ready();
  await a.click('svb-job-approval-open');
  await a.check('tick', true);
  await a.setSelect('method', 'WHATSAPP');
  await a.type('time', '09:15');
  await a.click('svb-appr-save');
  const c = a.billing.last('recordApproval');
  assert.deepEqual(Object.keys(c.args[0]).sort(), ['amountPaise', 'approvedAt', 'evidence', 'jobId', 'method', 'note', 'takenByName', 'version']);
  assert.equal(c.args[0].method, 'WHATSAPP');
  assert.equal(c.args[0].amountPaise, 153400);
  assert.equal(c.args[0].approvedAt, '2026-11-13T03:45:00.000Z');
  assert.equal(c.args[0].version, 1);
  assert.equal(a.h.calls.legacyApproval.length, 1);
  assert.deepEqual(a.h.calls.legacyApproval[0], { id: 'WS-2026-001', rec: { at: '2026-11-13T03:45:00.000Z', via: 'whatsapp', by: 'Test Owner', amount: 1534 } });
  assert.equal(typeof a.h.calls.legacyApproval[0].rec.amount, 'number');
  const b = setup({ session: SESSIONS.owner });
  b.h.legacyFails = true;
  b.seedEstimate();
  await b.ready();
  await b.click('svb-job-approval-open');
  await b.check('tick', true);
  await b.click('svb-appr-save');
  assert.equal(b.billing.count('recordApproval'), 1);
  assert.ok(b.h.calls.toast.some((m) => /old job sheet field could not be updated/.test(m)));
  assert.match(text(b.layerHtml()), /Approval recorded for version 1/);
  assert.equal(b.billing.state.jobs['WS-2026-001'].approval.version, 1, 'the approval itself stays saved');
});

test('U41 after the total goes up the card says a new approval is needed and shows the old approval as the previous one', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.seedApproved();
  a.billing.saveEstimate({ jobId: 'WS-2026-001', lines: [{ kind: 'PART', code: 'DEMO-P1', qty: 3 }], note: '', reason: 'bigger' }, { session: SESSIONS.owner, clientRef: 'x1' });
  await a.ready();
  const t = text(a.jobHtml());
  assert.match(t, /New approval needed/);
  assert.match(t, /The estimate went up\. The customer must approve again\./);
  assert.match(t, /Approved 2026-11-13 09:30 by Seed \(Phone call\) for Rs 1,534\.00\./);
  assert.ok(a.jobHtml().includes('svb-job-approval-open'));
  assert.equal(a.jobHtml().includes('svb-job-bill-open'), false, 'no bill button until the new approval');
});

test('U40b Stage E round 4 (R-flows-1): a date and time left as offered send no time (the bill layer takes now, to the second); three quick taps make one call', async () => {
  const a = setup({ session: SESSIONS.owner });
  a.seedEstimate();
  await a.ready();
  await a.click('svb-job-approval-open');
  await a.check('tick', true);
  const p1 = a.ui.internals.dispatch('svb-appr-save');
  const p2 = a.ui.internals.dispatch('svb-appr-save');
  const p3 = a.ui.internals.dispatch('svb-appr-save');
  await Promise.all([p1, p2, p3]);
  await flush();
  assert.equal(a.billing.count('recordApproval'), 1, 'one call for three taps');
  const c = a.billing.last('recordApproval');
  assert.equal('approvedAt' in c.args[0], false, 'the offered minute is never sent: it could be earlier than the estimate seconds');
});
