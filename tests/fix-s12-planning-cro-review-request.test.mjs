import assert from 'node:assert/strict';
import test from 'node:test';
import { loadCro, croHtml } from './lib/fix-s12-cro-vm.mjs';

function setup(answer) {
  const calls = [];
  const qms = { customers: [{ id: 'c1', name: 'Asha', mobile: '9876543210', status: 'Closed', outcome: 'Purchase', closedAt: '2026-11-04T10:00:00Z' }] };
  const m = loadCro({
    storage: { retail_queue_management_v1: qms },
    runtime: {
      whatsAppLink: async (url, scope, purpose) => { calls.push({ url, scope, purpose }); return typeof answer === 'function' ? answer() : answer; }
    }
  });
  m.run('initTData()');
  m.setForm({ date: '2026-11-04' });
  m.run("tData.t6={reviewsCount:0,remarks:'',reviewList:[{cid:'c1',name:'Asha',mobile:'98765 43210',requested:false,received:false},{cid:'c2',name:'Bad',mobile:'123',requested:false,received:false}]}");
  return { m, calls };
}
const requested = (m, i) => m.run(`tData.t6.reviewList[${i}].requested`);

test('F-CRO-5: Requested is ticked only when the shell reports the link opened', async () => {
  const { m, calls } = setup(true);
  await m.run("croReviewSend('c1')");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].scope, 'cro-review-request');
  assert.equal(calls[0].purpose, 'promotional-review-solicitation');
  assert.match(calls[0].url, /^https:\/\/wa\.me\/919876543210\?text=/);
  assert.equal(requested(m, 0), true);
});

test('F-CRO-5: a refused or failed send marks nothing', async () => {
  for (const answer of [false, undefined, 'yes', null]) {
    const { m, calls } = setup(answer);
    await m.run("croReviewSend('c1')");
    assert.equal(calls.length, 1);
    assert.equal(requested(m, 0), false, 'answer ' + String(answer));
  }
  const { m } = setup(() => { throw new Error('boom'); });
  await assert.rejects(() => m.run("croReviewSend('c1')")); // whatsAppLink itself never throws; a throwing stub must not tick
  assert.equal(requested(m, 0), false);
});

test('F-CRO-5: an invalid mobile posts nothing and ticks nothing', async () => {
  const { m, calls } = setup(true);
  await m.run("croReviewSend('c2')");
  assert.equal(calls.length, 0);
  assert.equal(requested(m, 1), false);
  assert.match(m.toasts.at(-1), /No valid mobile/);
});

test('F-CRO-5: outside the shell frame nothing is sent', async () => {
  const { m, calls } = setup(true);
  m.ctx.parent = m.ctx;
  await m.run("croReviewSend('c1')");
  assert.equal(calls.length, 0);
  assert.equal(requested(m, 0), false);
  assert.match(m.toasts.at(-1), /only inside Saagar Control Centre/);
});

test('F-CRO-5: the module no longer posts ST_WA_LINK or keeps a request map', () => {
  const html = croHtml();
  assert.doesNotMatch(html, /ST_WA_LINK/);
  assert.doesNotMatch(html, /ST_WA_LINK_RESULT|croWaPending/);
  assert.match(html, /async function croReviewSend\(cid\)/);
  assert.match(html, /SaagarModuleRuntime\.whatsAppLink\(/);
  assert.match(html, /if\(sent!==true\) return;/);
});
