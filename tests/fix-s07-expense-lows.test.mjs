// S07 low defects: U06-F08 (petty over float), F09 (vendor hide rule), F10 (NotFoundError re-render), F11 (module half), F13 (short mobile).
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadExpense, moduleText } from './lib/fix-s07-expense-harness.mjs';

const OWNER = { isOwner: true, isManager: true, role: 'Store Manager' };

function pettyWorld(float, confirmResult) {
  const x = loadExpense({ shell: OWNER, storage: float === undefined ? {} : { gm_petty: { float, history: [] } }, confirmResult });
  x.run('renderPetty=function(){}');
  x.set('pt_c', 'Miscellaneous'); x.set('pt_d', 'auto');
  return x;
}

test('F08 petty above the float asks first; refusing posts nothing, agreeing posts once', () => {
  const no = pettyWorld(1000, false);
  no.set('pt_a', 5000);
  no.run('pettyOut()');
  assert.equal(no.confirms.length, 1);
  assert.match(no.confirms[0], /petty float left/);
  assert.match(no.confirms[0], /1,000/);
  assert.equal(no.ledger().length, 0);

  const yes = pettyWorld(1000, true);
  yes.set('pt_a', 5000);
  yes.run('pettyOut()');
  assert.equal(yes.ledger().length, 1);
});

test('F08 within the float, or with no float set, there is no question', () => {
  const within = pettyWorld(1000, true);
  within.set('pt_a', 400);
  within.run('pettyOut()');
  assert.equal(within.confirms.length, 0);
  assert.equal(within.ledger().length, 1);

  const none = pettyWorld(0, true);
  none.set('pt_a', 400);
  none.run('pettyOut()');
  assert.equal(none.confirms.length, 0);
  assert.equal(none.ledger().length, 1);
});

test('F09 the hide rule covers the vendor name, the orphan GSTIN box and the Add button', () => {
  const t = moduleText();
  const m = /<style id="st-v5-hide-css">([^<]*)<\/style>/.exec(t);
  assert.ok(m, 'style tag present');
  for (const part of ['#vn', '#vgst', '[onclick="addVendor()"]']) assert.ok(m[1].includes(part), part);
  const x = loadExpense({ storage: { gm_vendors: [{ name: 'ACME' }] } });
  x.run('renderVendors()');
  assert.ok(x.get('vendorsC').innerHTML.includes('setVendGstin('), 'per-row GSTIN box still rendered');
  x.run('renderVendors=function(){}');
  x.set('vn', 'NEWCO'); x.set('vgst', '27AAAAA0000A1Z5');
  x.run('addVendor()');
  assert.ok(x.json('gm_vendors').some((v) => v.name === 'NEWCO' && v.gstin === '27AAAAA0000A1Z5'));
});

test('F10 editing a budget cell, a GST rate or a vendor GSTIN re-renders after the event, not inside it', async () => {
  const x = loadExpense({ shell: OWNER, storage: { gm_role: 'owner', gm_vendors: [{ name: 'ACME' }] } });
  x.run("window.__n={b:0,c:0,v:0}; renderBudget=function(){window.__n.b++}; renderClose=function(){window.__n.c++}; renderVendors=function(){window.__n.v++}; window.__gstCats=['Retail Sale'];");
  x.run("setBudget('Rent','5000')");
  x.run("saveGstCat({getAttribute:function(){return '0';},value:'5'})");
  x.run("setVendGstin(0,'27AAAAA0000A1Z5')");
  assert.deepEqual(JSON.parse(JSON.stringify(x.run('window.__n'))), { b: 0, c: 0, v: 0 }, 'nothing re-rendered synchronously');
  await x.tick(20);
  assert.deepEqual(JSON.parse(JSON.stringify(x.run('window.__n'))), { b: 1, c: 1, v: 1 });
  assert.equal(x.json('gm_gst_rates')['Retail Sale'], 5);
  assert.equal(x.json('gm_vendors')[0].gstin, '27AAAAA0000A1Z5');
  const month = x.today().slice(0, 7);
  assert.equal(x.json('gm_budgets')[month].Rent, 5000);
});

test('F11 module half: the month heading keeps the month in its own node', () => {
  const x = loadExpense({ shell: OWNER, storage: { gm_expenses: [{ id: 'i1', date: '2026-01-05', type: 'income', amount: 100, mode: 'Cash', category: 'Retail Sale', firm: 'GM' }] } });
  x.run("CM='2026-01'; renderClose();");
  assert.ok(x.get('closeC').innerHTML.includes('Per-firm P&L — <span>2026-01</span>'));
});

test('F13 a short Udhaar mobile is refused with a message; blank, 10 digits and +91 forms are saved', () => {
  const run = (mob) => {
    const x = loadExpense({ shell: OWNER });
    x.run('renderUdhaar=function(){}');
    x.set('ud_name', 'Ram'); x.set('ud_amt', '100'); x.set('ud_mob', mob);
    x.run('addReceivable()');
    return { x, list: x.json('saagar_udhaar_ledger_v1', { receivables: [] }).receivables };
  };
  const short = run('98765');
  assert.equal(short.list.length, 0);
  assert.match(short.x.toastText(), /10 digits/);
  assert.equal(run('').list[0].mobile, '');
  assert.equal(run('9876543210').list[0].mobile, '9876543210');
  assert.equal(run('+91 98765 43210').list[0].mobile, '9876543210');
});
