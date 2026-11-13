// Service Stores UI (wave 1, group ui): job panel, Owner PIN pattern, dialogs, keyboard, context changes, lifecycle.
import test from 'node:test';
import assert from 'node:assert/strict';
import { setup, makeCore, samplePart, SESS, flush, fire } from './lib/svc1-ui-harness.mjs';

const P = (o) => JSON.parse(JSON.stringify(o));
const has = (str, re) => assert.ok(re.test(String(str)), 'expected ' + re + ' in: ' + String(str).slice(0, 240));
const hasNot = (str, re) => assert.ok(!re.test(String(str)), 'did not expect ' + re + ' in: ' + String(str).slice(0, 240));
async function job(session, extra) {
  const a = setup(Object.assign({ session }, extra || {}));
  a.mount();
  a.ui.refreshJob();
  await flush();
  return a;
}
const JOB = 'WS-2026-001';
const sortedKeys = (o) => Object.keys(o).sort();

test('J1 job panel state table: each state shows exactly the text and buttons of the table', async () => {
  // no job number yet
  let a = await job(SESS.manager);
  a.h.currentJob = '';
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /Save this service order first\. Parts can be issued once it has a job number\./);
  assert.deepEqual(a.actionsIn(a.jobHtml()), []);
  // unknown job
  a.h.currentJob = 'WS-9';
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /That job number was not found\./);
  assert.deepEqual(a.actionsIn(a.jobHtml()), []);
  // open job, manager: list + Issue + Register old part
  a.h.currentJob = JOB;
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /Parts from stores/);
  has(a.jobHtml(), /Issued from stock to this order/);
  has(a.jobHtml(), /No parts issued to this order yet\./);
  assert.deepEqual(a.actionsIn(a.jobHtml()), ['svs-job-issue-open', 'svs-job-register-old']);
  has(a.jobHtml(), /A faulty part taken off the watch goes to Old parts, not back to stock\./);
  // past view
  a.h.past = true;
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /You are viewing a past date\. Stock cannot be changed\./);
  assert.deepEqual(a.actionsIn(a.jobHtml()), []);
  a.h.past = false;
  // closed
  a.h.jobs[JOB].status = 'closed';
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /This order is closed\. Parts cannot be issued or returned\./);
  assert.deepEqual(a.actionsIn(a.jobHtml()), ['svs-job-register-old']);
  // invoiced
  a.h.jobs[JOB].invoiceNo = 'SV/2026-27/0001';
  a.h.jobs[JOB].locked = true;
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /A tax invoice is issued for this order/);
  hasNot(a.jobHtml(), /svs-job-issue-open/);
  a.h.jobs[JOB].status = 'open'; a.h.jobs[JOB].invoiceNo = ''; a.h.jobs[JOB].locked = false;
  // staff: read only, note
  const s = await job(SESS.staff);
  has(s.jobHtml(), /Parts are issued by the Store Manager\./);
  assert.deepEqual(s.actionsIn(s.jobHtml()), []);
  // none: nothing at all
  const n = await job(SESS.none);
  assert.equal(n.jobHtml(), '');
  // integrity failed
  const bad = makeCore();
  bad.state.status.integrity = { ok: false, code: 'SVCS_FIFO_MISMATCH', lastEntryAt: '' };
  const i = await job(SESS.owner, { core: bad });
  has(i.jobHtml(), /The stock ledger failed its check\. Posting is stopped\. Tell the Owner\./);
  assert.deepEqual(i.actionsIn(i.jobHtml()), []);
  // owner open
  const o = await job(SESS.owner);
  assert.deepEqual(o.actionsIn(o.jobHtml()), ['svs-job-issue-open', 'svs-job-register-old']);
  // closed job with parts still out: list visible, Return not offered
  const c = makeCore();
  c.state.jobs[JOB] = [{ partCode: 'DIL-0005', qty: 2, returned: 0, movementId: 'MOV-1', docNo: 'ISS/26-27/0001' }];
  const cl = await job(SESS.manager, { core: c });
  has(cl.jobHtml(), /DIL-0005/);
  assert.ok(cl.find('svs-job-return-open', 'DIL-0005'));
  cl.h.jobs[JOB].status = 'closed';
  cl.ui.refreshJob(); await flush();
  assert.equal(cl.find('svs-job-return-open', 'DIL-0005'), null);
});

test('J2 issue part: search, pick, quantity, one core call with exactly the agreed keys, then the panel re-reads the job', async () => {
  const a = await job(SESS.manager);
  await a.click('svs-job-issue-open');
  has(a.jobHtml(), /id="svs-job-form"/);
  await a.type('partSearch', 'dil');
  assert.ok(a.find('svs-job-pick-part', '|DIL-0005'));
  has(a.jobHtml(), /On hand/);
  await a.click('svs-job-pick-part', '|DIL-0005');
  has(a.jobHtml(), /DIL-0005<\/b> Part DIL-0005/);
  has(a.jobHtml(), /On hand <span class="svs-num">12<\/span>/);
  has(a.jobHtml(), /Selling price <span class="svs-num">Rs 150\.00<\/span>\. Add it to the estimate yourself\./);
  await a.type('qty', '2');
  await a.type('note', 'Replaced crown');
  await a.click('svs-job-issue-save');
  assert.equal(a.h.core.count('issueToJob'), 1);
  const c = a.h.core.last('issueToJob');
  assert.deepEqual(sortedKeys(c.args[0]), ['billing', 'jobId', 'lines', 'note']);
  assert.deepEqual(P(c.args[0]), { jobId: JOB, billing: 'CHARGEABLE', lines: [{ partCode: 'DIL-0005', qty: 2, allowNegative: false }], note: 'Replaced crown' });
  assert.equal(typeof c.args[0].lines[0].qty, 'number');
  assert.match(c.args[1].clientRef, /^svs-/);
  assert.equal(a.h.calls.reauth.length, 0);
  assert.match(a.h.calls.toast.slice(-1)[0], /^Issued 2 x DIL-0005 to WS-2026-001\.$/);
  hasNot(a.jobHtml(), /id="svs-job-form"/);
  has(a.jobHtml(), /DIL-0005/);
  has(a.jobHtml(), /With job<\/span> <span class="svs-num">2<\/span>/);
  assert.ok(a.find('svs-job-return-open', 'DIL-0005'));
});

test('J3 billing follows the job: a no-charge warranty order defaults to Warranty', async () => {
  const a = await job(SESS.manager);
  a.h.jobs[JOB].paymentStatus = 'no_charge_warranty';
  await a.click('svs-job-issue-open');
  assert.equal(a.field('billing').value, 'WARRANTY');
  await a.type('partSearch', 'dil');
  await a.click('svs-job-pick-part', '|DIL-0005');
  await a.click('svs-job-issue-save');
  assert.equal(a.h.core.last('issueToJob').args[0].billing, 'WARRANTY');
});

test('J4 refusals show the layer text in the form and the toast; the form stays open with the typed values', async () => {
  const a = await job(SESS.manager);
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'dil');
  await a.click('svs-job-pick-part', '|DIL-0005');
  await a.type('qty', '3');
  await a.type('note', 'keep me');
  for (const [code, text] of [['PART_UNKNOWN', /This part code is not in the parts master\./], ['PART_INACTIVE', /This part is switched off/], ['SVCS_WRITE_FAILED', /Could not confirm the save\./], ['JOB_CLOSED', /This job is closed\./]]) {
    a.h.core.forced.issueToJob = { ok: false, code };
    await a.click('svs-job-issue-save');
    has(a.jobHtml(), text);
    has(a.h.calls.toast.slice(-1)[0], text);
    assert.equal(a.field('qty').value, '3');
    assert.equal(a.field('note').value, 'keep me');
    has(a.jobHtml(), /role="alert">[A-Z]/);
  }
  // quantity rules before any core call
  delete a.h.core.forced.issueToJob;
  const before = a.h.core.count('issueToJob');
  await a.type('qty', '0');
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Enter a whole number from 1 to 100000\./);
  await a.type('qty', '1.5');
  await a.click('svs-job-issue-save');
  assert.equal(a.h.core.count('issueToJob'), before);
  // no part picked
  await a.click('svs-job-issue-cancel');
  await a.click('svs-job-issue-open');
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Pick a part from the list\./);
});

test('J5 not enough stock: a Manager gets the text with the number; the Owner may issue anyway with a note and the PIN', async () => {
  const m = await job(SESS.manager);
  await m.click('svs-job-issue-open');
  await m.type('partSearch', 'clp');
  await m.click('svs-job-pick-part', '|CLP-0009');
  await m.type('qty', '5');
  await m.click('svs-job-issue-save');
  has(m.jobHtml(), /Not enough stock\. On hand: 1\./);
  has(m.jobHtml(), /Only the Owner can issue beyond stock\./);
  assert.equal(m.find('svs-job-issue-override'), null);
  const r = await m.ui.internals.dispatch('svs-job-issue-override');
  assert.equal(r.code, 'SVS_OWNER_ONLY');
  assert.equal(m.h.calls.reauth.length, 0);

  const o = await job(SESS.owner);
  await o.click('svs-job-issue-open');
  await o.type('partSearch', 'clp');
  await o.click('svs-job-pick-part', '|CLP-0009');
  await o.type('qty', '5');
  await o.click('svs-job-issue-save');
  has(o.jobHtml(), /Not enough stock\. On hand: 1\./);
  assert.ok(o.find('svs-job-issue-override'));
  // note of 3+ characters is required before the PIN
  await o.click('svs-job-issue-override');
  has(o.jobHtml(), /Type a note of at least 3 characters/);
  assert.equal(o.h.calls.reauth.length, 0);
  await o.type('note', 'Customer waiting');
  o.h.reauthResult = false;
  const issueCalls = o.h.core.count('issueToJob');
  await o.click('svs-job-issue-override');
  assert.equal(o.h.calls.reauth.length, 1);
  assert.equal(o.h.calls.reauth[0], 'Issue beyond stock: 5 of CLP-0009 to WS-2026-001. On hand 1. Stock will go negative.');
  assert.equal(o.h.core.count('issueToJob'), issueCalls);
  has(o.jobHtml(), /Owner approval was not given/);
  o.h.reauthResult = true;
  await o.click('svs-job-issue-override');
  const c = o.h.core.last('issueToJob');
  assert.equal(c.args[0].lines[0].allowNegative, true);
  assert.equal(c.args[0].note, 'Customer waiting');
  assert.equal(c.args[1].stepUp.ok, true);
  hasNot(o.jobHtml(), /id="svs-job-form"/);
});

test('J6 return: part fixed, quantity limited to what is still out, three reasons, exact payload, no Return when nothing is out', async () => {
  const core = makeCore();
  core.state.jobs[JOB] = [
    { partCode: 'DIL-0005', qty: 2, returned: 0, movementId: 'MOV-1', docNo: 'ISS/26-27/0001' },
    { partCode: 'DIL-0005', qty: 3, returned: 0, movementId: 'MOV-2', docNo: 'ISS/26-27/0002' },
    { partCode: 'CLP-0009', qty: 1, returned: 1, movementId: 'MOV-3', docNo: 'ISS/26-27/0003' }
  ];
  const a = await job(SESS.manager, { core });
  assert.equal(a.find('svs-job-return-open', 'CLP-0009'), null);
  await a.click('svs-job-return-open', 'DIL-0005');
  has(a.jobHtml(), /Return from issue/);
  has(a.jobHtml(), /Not used/);
  has(a.jobHtml(), /Issued by mistake/);
  has(a.jobHtml(), /Job cancelled/);
  await a.type('qty', '3');
  await a.click('svs-job-return-save');
  has(a.jobHtml(), /Enter a whole number from 1 to 2\./);
  assert.equal(core.count('returnFromJob'), 0);
  await a.setSelect('issueMovementId', 'MOV-2');
  await a.click('svs-job-return-save');
  assert.equal(core.count('returnFromJob'), 1);
  const c = core.last('returnFromJob');
  assert.deepEqual(P(c.args[0]), { jobId: JOB, lines: [{ issueMovementId: 'MOV-2', qty: 3, returnReason: 'UNUSED' }], note: '' });
  assert.match(a.h.calls.toast.slice(-1)[0], /^Returned 3 x DIL-0005 from WS-2026-001\.$/);
  has(a.jobHtml(), /With job<\/span> <span class="svs-num">2<\/span>/);
  // over-return is stopped by the core too
  await a.click('svs-job-return-open', 'DIL-0005');
  core.forced.returnFromJob = { ok: false, code: 'RETURN_EXCEEDS_ISSUE' };
  await a.click('svs-job-return-save');
  has(a.jobHtml(), /More is being returned than was issued\./);
  await a.click('svs-job-return-cancel');
  hasNot(a.jobHtml(), /id="svs-job-form"/);
});

test('J7 privacy: whatever the host returns for the job, no core call carries a customer key or value', async () => {
  const jobs = { [JOB]: { id: JOB, status: 'open', label: 'WS-2026-001 Titan Edge', invoiceNo: '', locked: false, paymentStatus: 'cash', custName: 'Ramesh Kumar', custMobile: '9876543210', custAddr: 'Latur' } };
  const a = await job(SESS.manager, { jobs });
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'dil');
  await a.click('svs-job-pick-part', '|DIL-0005');
  await a.click('svs-job-issue-save');
  await a.click('svs-job-register-old');
  await a.type('partText', 'Old glass');
  await a.click('svs-old-save');
  const all = JSON.stringify(a.h.core.calls);
  assert.doesNotMatch(all, /custName|custMobile|custAddr|Ramesh|9876543210|Latur/);
  assert.doesNotMatch(a.jobHtml() + a.layerHtml() + a.rootHtml(), /Ramesh|9876543210/);
});

test('J8 register old part from the job panel opens the dialog with the job number filled', async () => {
  const a = await job(SESS.manager);
  await a.click('svs-job-register-old');
  assert.equal(a.field('jobId').value, JOB);
  has(a.layerHtml(), /Register old part/);
  await a.type('partText', 'Cracked glass');
  await a.click('svs-old-save');
  assert.equal(a.h.core.last('registerOldPart').args[0].jobId, JOB);
  assert.equal(a.layerHtml(), '');
});

const OWNER_ACTIONS = {
  opening: async (a) => {
    const core = a.h.core;
    await a.click('svs-tab-opening');
    const e = a.h.el.root.querySelectorAll('[data-svs-field="o-qty"]')[0];
    const c = a.h.el.root.querySelectorAll('[data-svs-field="o-cost"]')[0];
    e.value = '2'; fire(a.doc, e, 'input');
    c.value = '10'; fire(a.doc, c, 'input');
    await a.click('svs-open-post');
    return { go: () => a.click('svs-open-confirm'), writes: () => core.count('proposeOpening') + core.count('approveOpening') };
  },
  adjustment: async (a) => {
    const core = a.h.core;
    await a.click('svs-tab-adjust');
    return { go: () => a.ui.internals.dispatch('svs-adj-approve', 'DOC-000001').then(() => flush()), writes: () => core.count('approveAdjustment') };
  },
  receipt: async (a) => {
    const core = a.h.core;
    await a.click('svs-tab-receive');
    await a.click('svs-grn-reverse', 'GRN/26-27/0001');
    await a.type('reason', 'Entered on the wrong invoice');
    return { go: () => a.click('svs-grn-reverse-confirm', 'GRN/26-27/0001'), writes: () => core.count('reverseDoc') };
  },
  scrap: async (a) => {
    const core = a.h.core;
    await a.click('svs-tab-oldparts');
    await a.click('svs-old-signoff');
    return { go: () => a.click('svs-old-signoff-confirm'), writes: () => core.count('signOffScrap') };
  }
};
function ownerCore() {
  const core = makeCore({ parts: [samplePart('A1', { openingSet: false, onHand: 0 })] });
  core.state.adjustments.push({ proposalId: 'DOC-000001', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: 'x', note: 'n', lines: [{ partCode: 'A1', qtyDelta: -1, reason: 'LOST' }], valuePaise: 100, needsOwner: true, reasonClass: 'WRITEOFF' });
  core.state.receipts.push({ no: 'GRN/26-27/0001', supplierName: 'Titan', supplierInvoiceNo: 'I1', supplierInvoiceDate: '2026-11-10', date: '2026-11-12', lines: [], pieces: 1, totalPaise: 100, status: 'POSTED' });
  core.state.oldParts.push({ no: 'OLD/26-27/0001', at: '2026-11-13T05:00:00.000Z', jobId: '', partText: 'Glass', qty: 1, state: 'SCRAP_PENDING', scrapMonth: '2026-10' });
  return core;
}

for (const name of Object.keys(OWNER_ACTIONS)) {
  test('J9 Owner PIN order for ' + name + ': PIN first, denied or rejected means no core write, a downgrade after the PIN means no core write', async () => {
    // 1. PIN refused
    let a = setup({ session: SESS.owner, core: ownerCore() }); a.mount(); await a.show();
    let step = await OWNER_ACTIONS[name](a);
    a.h.reauthResult = false;
    await step.go(); await flush();
    assert.equal(a.h.calls.reauth.length, 1, name + ' asks once');
    assert.equal(step.writes(), 0, name + ' PIN false');
    assert.ok(a.h.calls.reauth[0].length <= 180);
    // 2. the PIN promise rejects: counts as denied
    a = setup({ session: SESS.owner, core: ownerCore() }); a.mount(); await a.show();
    step = await OWNER_ACTIONS[name](a);
    a.h.reauthResult = () => Promise.reject(new Error('keypad closed'));
    await step.go(); await flush();
    assert.equal(step.writes(), 0, name + ' PIN rejected');
    // 3. a truthy value that is not exactly true is not approval
    a = setup({ session: SESS.owner, core: ownerCore() }); a.mount(); await a.show();
    step = await OWNER_ACTIONS[name](a);
    a.h.reauthResult = () => Promise.resolve('yes');
    await step.go(); await flush();
    assert.equal(step.writes(), 0, name + ' PIN yes');
    // 4. the session drops to Store Manager while the keypad is open
    a = setup({ session: SESS.owner, core: ownerCore() }); a.mount(); await a.show();
    step = await OWNER_ACTIONS[name](a);
    a.h.reauthResult = () => { a.h.session = SESS.manager; return Promise.resolve(true); };
    await step.go(); await flush();
    assert.equal(a.h.calls.reauth.length, 1);
    assert.equal(step.writes(), 0, name + ' downgraded');
    has(a.layerHtml() + a.rootHtml(), /Only the Owner can do this\./);
    // 5. happy path: exactly one PIN, a fresh stamp in the context
    a = setup({ session: SESS.owner, core: ownerCore() }); a.mount(); await a.show();
    step = await OWNER_ACTIONS[name](a);
    await step.go(); await flush();
    assert.equal(a.h.calls.reauth.length, 1);
    assert.ok(step.writes() >= 1, name + ' wrote');
    const stamped = a.h.core.calls.filter((c) => /^(proposeOpening|approveOpening|approveAdjustment|reverseDoc|signOffScrap)$/.test(c.name)).pop();
    assert.equal(stamped.args[stamped.args.length - 1].stepUp.ok, true);
    assert.equal(stamped.args[stamped.args.length - 1].session.tier, 'owner');
    assert.equal(typeof stamped.args[stamped.args.length - 1].stepUp.at, 'number');
  });
}

test('J10 a Store Manager who has the PIN is still refused the Owner-only actions, and the keypad is never shown', async () => {
  const a = setup({ session: SESS.manager, core: ownerCore() }); a.mount(); await a.show();
  const refused = [
    ['svs-adj-approve', 'DOC-000001'], ['svs-grn-reverse', 'GRN/26-27/0001'], ['svs-grn-reverse-confirm', 'GRN/26-27/0001'], ['svs-old-signoff', ''],
    ['svs-old-signoff-confirm', ''], ['svs-open-post', ''], ['svs-open-confirm', ''], ['svs-open-approve', 'DOC-1'], ['svs-settings-save', ''], ['svs-wm-ack', ''],
    ['svs-adj-reverse', 'ADJ/26-27/0001'], ['svs-job-issue-override', '']
  ];
  for (const [act, key] of refused) {
    const r = await a.ui.internals.dispatch(act, key);
    await flush();
    assert.equal(r.ok, false, act);
    assert.match(r.code, /^SVS_(OWNER_ONLY|BAD_REPLY|ROLE_DENIED)$/, act);
  }
  assert.equal(a.h.calls.reauth.length, 0);
  assert.equal(a.h.core.names().filter((n) => /^(approve|reverse|signOff|setConfig|acknowledge)/.test(n)).length, 0);
  // staff cannot do store actions at all
  const s = setup({ session: SESS.staff, core: ownerCore() }); s.mount(); await s.show();
  for (const act of ['svs-grn-new', 'svs-cs-save', 'svs-adj-new', 'svs-old-new', 'svs-job-issue-open', 'svs-open-propose']) {
    const r = await s.ui.internals.dispatch(act, '');
    assert.equal(r.ok, false, act);
  }
  assert.equal(s.layerHtml(), '');
  assert.equal(s.h.core.names().filter((n) => !/^(status|settings|listParts|reorderList)$/.test(n)).length, 0, 'staff made no other core call');
});

test('J11 PIN labels stay within 180 characters for 24-character codes and large amounts, and carry the code and number', async () => {
  const core = makeCore({ parts: [samplePart('ABCDEFGHIJKLMNOPQRSTUVWX', { openingSet: false, onHand: 0 })] });
  core.state.adjustments.push({ proposalId: 'DOC-000999', no: '', state: 'PROPOSED', at: '2026-11-13T05:00:00.000Z', proposedBy: 'x', note: 'n', lines: [{ partCode: 'ABCDEFGHIJKLMNOPQRSTUVWX', qtyDelta: -99999, reason: 'WRITE_OFF' }], valuePaise: 999999999999, needsOwner: true, reasonClass: 'WRITEOFF' });
  const a = setup({ session: SESS.owner, core }); a.mount(); await a.show();
  await a.click('svs-tab-adjust');
  await a.click('svs-adj-approve', 'DOC-000999');
  const label = a.h.calls.reauth[0];
  assert.ok(label.length <= 180, String(label.length));
  assert.match(label, /ABCDEFGHIJKLMNOPQRSTUVWX/);
  assert.match(label, /99999/);
  assert.match(label, /Rs 9,99,99,99,999\.99/);
});

test('J12 dialogs: focus goes to the first field and back to the opener; Tab stays inside; the overlay closes only an untouched dialog', async () => {
  const a = setup({ session: SESS.manager }); a.mount(); await a.show();
  await a.click('svs-tab-receive');
  const opener = a.find('svs-grn-new');
  opener.focus();
  await a.click('svs-grn-new');
  assert.equal(a.doc.activeElement.getAttribute('data-svs-field'), 'supplierInvoiceNo');
  has(a.layerHtml(), /aria-modal="true"/);
  // Tab from the last control wraps to the first
  const items = a.layer().querySelectorAll('[data-svcs-action],[data-svs-field]');
  items[items.length - 1].focus();
  const ev = await a.key(items[items.length - 1], 'Tab');
  assert.equal(ev.defaultPrevented, true);
  assert.equal(a.doc.activeElement, items[0]);
  const ev2 = await a.key(items[0], 'Tab', { shiftKey: true });
  assert.equal(ev2.defaultPrevented, true);
  assert.equal(a.doc.activeElement, items[items.length - 1]);
  // overlay click on an untouched dialog closes and returns focus
  const overlay = a.layer().querySelectorAll('[data-svs-overlay]')[0];
  fire(a.doc, overlay, 'click');
  await flush();
  assert.equal(a.layerHtml(), '');
  assert.equal(a.doc.activeElement, opener);
  // typed data: overlay click does nothing
  await a.click('svs-grn-new');
  await a.type('supplierInvoiceNo', 'X1');
  fire(a.doc, a.layer().querySelectorAll('[data-svs-overlay]')[0], 'click');
  await flush();
  has(a.layerHtml(), /New goods receipt/);
});

test('J13 Escape: closes the open dialog or cancels the job form and goes no further; with nothing open it is left alone', async () => {
  const a = setup({ session: SESS.manager }); a.mount(); await a.show();
  a.ui.refreshJob(); await flush();
  // nothing open: not stopped
  let ev = fire(a.doc, a.h.el.root, 'keydown', { key: 'Escape' });
  assert.equal(ev.stopped, false);
  assert.equal(ev.defaultPrevented, false);
  // empty dialog
  await a.click('svs-tab-receive');
  await a.click('svs-grn-new');
  ev = fire(a.doc, a.layer(), 'keydown', { key: 'Escape' });
  await flush();
  assert.equal(ev.stopped, true);
  assert.equal(ev.defaultPrevented, true);
  assert.equal(a.layerHtml(), '');
  // dirty dialog: asks first
  await a.click('svs-grn-new');
  await a.type('supplierInvoiceNo', 'Z9');
  ev = fire(a.doc, a.layer(), 'keydown', { key: 'Escape' });
  await flush();
  assert.equal(ev.stopped, true);
  has(a.layerHtml(), /Discard what you typed\?/);
  assert.ok(a.find('svs-dialog-keep'));
  await a.click('svs-dialog-keep');
  hasNot(a.layerHtml(), /Discard what you typed\?/);
  assert.equal(a.field('supplierInvoiceNo').value, 'Z9');
  ev = fire(a.doc, a.layer(), 'keydown', { key: 'Escape' });
  await flush();
  await a.click('svs-dialog-discard');
  assert.equal(a.layerHtml(), '');
  // job form
  await a.click('svs-job-issue-open');
  has(a.jobHtml(), /id="svs-job-form"/);
  ev = fire(a.doc, a.h.el.jobHost, 'keydown', { key: 'Escape' });
  await flush();
  assert.equal(ev.stopped, true);
  hasNot(a.jobHtml(), /id="svs-job-form"/);
  // and again with nothing open
  ev = fire(a.doc, a.h.el.jobHost, 'keydown', { key: 'Escape' });
  assert.equal(ev.stopped, false);
  // keyCode form
  await a.click('svs-grn-new');
  ev = fire(a.doc, a.layer(), 'keydown', { keyCode: 27 });
  assert.equal(ev.stopped, true);
});

test('J14 keyboard: Enter on a part search picks the exact code, Enter in quantity presses Issue, arrows move tabs and results', async () => {
  const a = await job(SESS.manager);
  await a.click('svs-job-issue-open');
  const search = a.field('partSearch');
  search.value = 'dil-0005'; fire(a.doc, search, 'input'); await flush();
  let ev = await a.key(search, 'Enter');
  assert.equal(ev.defaultPrevented, true);
  has(a.jobHtml(), /DIL-0005<\/b> Part DIL-0005/);
  const qty = a.field('qty');
  qty.value = '1';
  await a.key(qty, 'Enter');
  assert.equal(a.h.core.count('issueToJob'), 1);
  // arrows between results
  await a.click('svs-job-issue-open');
  const s2 = a.field('partSearch');
  s2.value = 'ZZ'; fire(a.doc, s2, 'input'); await flush();
  s2.value = 'part'; fire(a.doc, s2, 'input'); await flush();
  const rows = a.h.el.jobHost.querySelectorAll('.svs-pick-row');
  assert.ok(rows.length >= 2);
  await a.key(rows[0], 'ArrowDown');
  assert.equal(a.doc.activeElement, rows[1]);
  // leading zeros are kept: 00123 is not 123
  a.h.core.state.parts.push(samplePart('00123'), samplePart('123'));
  s2.value = '00123'; fire(a.doc, s2, 'input'); await flush();
  await a.key(s2, 'Enter');
  has(a.jobHtml(), /<b class="svs-code">00123<\/b>/);
  // tabs: Right arrow moves to the next tab
  await a.show();
  await a.click('svs-tab-stock');
  const tabs = a.h.el.root.querySelectorAll('[role="tab"]');
  await a.key(tabs[0], 'ArrowRight');
  has(a.rootHtml(), /aria-selected="true" tabindex="0" data-svcs-action="svs-tab-receive"/);
  await a.key(a.h.el.root.querySelectorAll('[role="tab"]')[1], 'ArrowLeft');
  has(a.rootHtml(), /aria-selected="true" tabindex="0" data-svcs-action="svs-tab-stock"/);
});

test('J15 onContextChange: idle makes no core call; a role change reloads; a vanished right closes the dialog', async () => {
  const a = setup({ session: SESS.manager }); a.mount(); await a.show();
  // leave the Stores view: no work at all
  a.h.el.view.attrs.class = 'view';
  a.h.el.formView.attrs.class = 'view';
  const n = a.h.core.calls.length;
  a.ui.onContextChange(); await flush();
  assert.equal(a.h.core.calls.length, n, 'idle cost');
  // Stores active again; role drops to staff
  a.h.el.view.attrs.class = 'view active';
  a.h.el.formView.attrs.class = 'view active';
  a.ui.onContextChange(); await flush();
  assert.ok(a.h.core.calls.length > n);
  // dialog open, then the role drops
  await a.click('svs-tab-receive');
  await a.click('svs-grn-new');
  a.h.session = SESS.staff;
  a.ui.onContextChange(); await flush();
  assert.equal(a.layerHtml(), '');
  assert.equal(a.h.calls.toast.slice(-1)[0], 'Your access changed. Nothing was saved.');
  assert.deepEqual(a.actionsIn(a.rootHtml()).filter((x) => x.startsWith('svs-tab-')), ['svs-tab-stock', 'svs-tab-reorder']);
  // the job panel follows the role
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /Parts are issued by the Store Manager\./);
  // past view switched on while a dialog is open
  const b = setup({ session: SESS.owner }); b.mount(); await b.show();
  await b.click('svs-tab-adjust');
  await b.click('svs-adj-new');
  b.h.past = true;
  b.ui.onContextChange(); await flush();
  assert.equal(b.layerHtml(), '');
});

test('J16 a core that throws or answers nonsense shows a real message, never stays busy', async () => {
  const a = await job(SESS.manager);
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'dil');
  await a.click('svs-job-pick-part', '|DIL-0005');
  a.h.core.forced.issueToJob = () => { throw new Error('disk exploded'); };
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Something went wrong\. Nothing was changed\. Code: SVS_INTERNAL\. disk exploded/);
  assert.equal(a.ui.internals.state().busy, false);
  a.h.core.forced.issueToJob = () => Promise.reject(new Error('async boom'));
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /async boom/);
  a.h.core.forced.issueToJob = () => 'junk';
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Code: SVS_BAD_REPLY/);
  a.h.core.forced.issueToJob = () => ({ ok: false });
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Code: SVS_BAD_REPLY/);
  a.h.core.forced.issueToJob = () => ({ ok: false, code: 'BRAND_NEW_CODE' });
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /Code: BRAND_NEW_CODE\./);
  delete a.h.core.forced.issueToJob;
  await a.click('svs-job-issue-save');
  assert.equal(a.h.core.count('issueToJob'), 6);
  assert.equal(a.ui.internals.state().busy, false);
  // a throwing host callback does not break the screen
  a.h.host.job = () => { throw new Error('host broke'); };
  a.ui.refreshJob(); await flush();
  has(a.jobHtml(), /That job number was not found\./);
});

test('J17 jobHasParts: false without a core, true when the core fails or cannot answer, the real answer otherwise', async () => {
  const c = makeCore();
  c.state.jobs[JOB] = [{ partCode: 'DIL-0005', qty: 2, returned: 2, movementId: 'MOV-1', docNo: 'x' }];
  const a = setup({ core: c }); a.mount();
  assert.equal(a.ui.jobHasParts(JOB), false);
  c.state.jobs[JOB][0].returned = 1;
  assert.equal(a.ui.jobHasParts(JOB), true);
  c.forced.jobHasParts = { ok: false, code: 'READ_FAILED' };
  assert.equal(a.ui.jobHasParts(JOB), true);
  c.forced.jobHasParts = () => { throw new Error('x'); };
  assert.equal(a.ui.jobHasParts(JOB), true);
  c.forced.jobHasParts = () => Promise.resolve({ ok: true, has: false });
  assert.equal(a.ui.jobHasParts(JOB), true);
  c.forced.jobHasParts = { ok: true, has: 'no' };
  assert.equal(a.ui.jobHasParts(JOB), true);
  delete c.forced.jobHasParts;
  c.jobHasParts = undefined;
  assert.equal(a.ui.jobHasParts(JOB), true);
  a.h.core = null;
  assert.equal(a.ui.jobHasParts(JOB), false);
});

test('J18 listeners: delegated on the UI containers only, balanced by unmount, no timers; the numbers are pinned as measured', async () => {
  const a = setup({ session: SESS.owner }); a.mount();
  await a.show();
  await a.click('svs-tab-receive');
  await a.click('svs-grn-new'); // creates the dialog layer and its listeners
  await a.click('svs-dialog-close');
  const rootL = a.h.el.root.listeners.map((l) => l.type).sort();
  const jobL = a.h.el.jobHost.listeners.map((l) => l.type).sort();
  const layerL = a.layer().listeners.map((l) => l.type).sort();
  assert.deepEqual(rootL, ['change', 'click', 'input', 'keydown']);
  assert.deepEqual(jobL, ['change', 'click', 'input', 'keydown']);
  assert.deepEqual(layerL, ['change', 'click', 'input', 'keydown']);
  const docL = a.doc.listeners.map((l) => l.type + (l.capture ? ':capture' : ''));
  assert.deepEqual(docL, ['keydown:capture']);
  const btn = a.h.el.header.querySelectorAll('[data-svcs-action="svs-open-stores"]')[0];
  assert.deepEqual(btn.listeners.map((l) => l.type), ['click']);
  assert.equal(a.ui.internals.state().binds.length, 4 + 4 + 4 + 1 + 1);
  // remount does not stack listeners; unmount removes every one of them
  a.mount();
  assert.equal(a.h.el.root.listeners.length, 4);
  assert.equal(a.doc.listeners.length, 1);
  a.ui.unmount();
  assert.equal(a.h.el.root.listeners.length, 0);
  assert.equal(a.h.el.jobHost.listeners.length, 0);
  assert.equal(a.doc.listeners.length, 0);
  assert.equal(btn.listeners.length, 0);
  assert.equal(a.doc.body.childNodes.some((c) => c.id === 'svs-layer'), false);
});

test('J19 the Stores view never writes to the page: no storage, no case field, no message', async () => {
  const a = setup({ session: SESS.owner }); a.mount(); await a.show();
  for (const tab of ['receive', 'counter', 'adjust', 'oldparts', 'reorder', 'opening', 'settings', 'stock']) await a.click('svs-tab-' + tab);
  assert.equal(a.sandbox.localStorage, undefined);
  assert.equal(a.sandbox.postMessage, undefined);
  assert.equal(Object.keys(a.h.el.formView.attrs).filter((k) => /^data-(?!svs)/.test(k)).length, 0);
  const html = a.doc.rawHtml.join('|');
  assert.doesNotMatch(html, /\sonclick=|\sonchange=|\soninput=|data-action=/);
});

test('J2P-DEF-2 Owner override for a part never received: a cost field is offered and its cost reaches the core', async () => {
  const a = await job(SESS.owner);
  await a.click('svs-job-issue-open');
  await a.type('partSearch', 'gls');
  await a.click('svs-job-pick-part', '|GLS-0001');
  await a.type('qty', '1');
  await a.click('svs-job-issue-save');
  has(a.jobHtml(), /svs-job-issue-override/);
  assert.ok(a.field('overrideCost'), 'the Owner sees a cost field with the override');
  has(a.jobHtml(), /Needed only when this part was never received/);
  await a.type('note', 'Customer waiting');
  // a bad cost is refused before the PIN
  await a.type('overrideCost', '0');
  await a.click('svs-job-issue-override');
  assert.equal(a.h.calls.reauth.length, 0);
  has(a.jobHtml(), /Enter a unit cost above zero/);
  await a.type('overrideCost', '50');
  await a.click('svs-job-issue-override');
  assert.equal(a.h.calls.reauth.length, 1);
  const c = a.h.core.last('issueToJob');
  assert.deepEqual(P(c.args[0].lines), [{ partCode: 'GLS-0001', qty: 1, allowNegative: true, unitCostPaise: 5000 }]);
  assert.equal(c.args[1].stepUp.ok, true);
  // blank cost: no unitCostPaise key, the latest receipt cost is used by the core
  const b = await job(SESS.owner);
  await b.click('svs-job-issue-open');
  await b.type('partSearch', 'gls');
  await b.click('svs-job-pick-part', '|GLS-0001');
  await b.click('svs-job-issue-save');
  await b.type('note', 'Customer waiting');
  await b.click('svs-job-issue-override');
  assert.deepEqual(P(b.h.core.last('issueToJob').args[0].lines), [{ partCode: 'GLS-0001', qty: 1, allowNegative: true }]);
  // a Manager never sees the cost field
  const m = await job(SESS.manager);
  await m.click('svs-job-issue-open');
  await m.type('partSearch', 'gls');
  await m.click('svs-job-pick-part', '|GLS-0001');
  await m.click('svs-job-issue-save');
  assert.equal(m.field('overrideCost'), null);
});
