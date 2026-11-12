import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { extractFunction, sandbox, service, serviceCss } from './lib/fix-s08-source.mjs';

const TODAY = '2026-11-12';
const iso = (days) => {
  const d = new Date(TODAY + 'T00:00:00'); d.setDate(d.getDate() + days);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
};

function reminderEnv(extra = '') {
  return sandbox({}, `
    function todayStr(){ return '${TODAY}'; }
    ${extractFunction('pad2')}
    ${extractFunction('followUpDue')}
    ${extra}
  `);
}

test('U07-F08: followUpDue honours done, the 30-day window and closed cases', () => {
  const ctx = reminderEnv();
  const w = (days, done) => ({ status: 'closed', followUps: [{ auto: 'warranty', dueDate: iso(days), done: !!done }] });
  assert.equal(ctx.followUpDue(w(20)), true);
  assert.equal(ctx.followUpDue(w(20, true)), false);
  assert.equal(ctx.followUpDue(w(40)), false);
  const o = (due, done) => ({ status: 'open', followUps: [{ type: 'Call', dueDate: due, done: !!done }] });
  assert.equal(ctx.followUpDue(o(iso(-3))), true);
  assert.equal(ctx.followUpDue(o(iso(-3), true)), false);
  assert.equal(ctx.followUpDue(o(iso(5))), false);
  assert.equal(ctx.followUpDue(null), false);
});

function addEnv(c) {
  const vals = { 'fu-type': 'Call', 'fu-dt': '2026-11-12T10:00', 'fu-remarks': 'ok', 'fu-outcome': 'Resolved', 'fu-due': '', 'fu-by': 'Asha' };
  const log = { saves: 0 };
  const ctx = sandbox({
    __vals: vals, __log: log, document: { getElementById: id => ({ get value() { return vals[id] || ''; }, set value(v) { vals[id] = v; } }) }
  }, `
    var _fuCaseId = 'A', DB = [${JSON.stringify(c)}];
    function readOnlyGuard(){ return false; }
    function byId(id){ return DB.find(function(x){ return x.id === id; }); }
    function toast(){}
    function saveDB(){ __log.saves++; }
    function renderFollowUps(){}
    function renderDash(){}
    function nowLocalDT(){ return '2026-11-12T10:00'; }
    ${extractFunction('svcClearReminders')}
    ${extractFunction('addFollowUp')}
  `);
  return { ctx, vals, db: () => vm.runInContext('DB[0]', ctx) };
}

test('U07-F08: a Resolved call clears open reminders; Pending leaves them; Home count goes 1 to 0', () => {
  const c = { id: 'A', status: 'closed', followUps: [{ auto: 'warranty', dueDate: iso(10), by: 'auto' }] };
  const home = (x) => (x.followUps || []).filter(f => f.auto === 'warranty' && f.dueDate && f.dueDate <= iso(30) && !f.done).length;
  const e = addEnv(c);
  assert.equal(home(e.db()), 1);
  e.ctx.addFollowUp();
  const after = JSON.parse(JSON.stringify(e.db()));
  assert.equal(after.followUps[0].done, true);
  assert.ok(after.followUps[0].doneAt);
  assert.ok(after.followUps[0].doneBy);
  assert.equal(home(after), 0);

  const p = addEnv(c);
  p.vals['fu-outcome'] = 'Pending';
  p.ctx.addFollowUp();
  assert.ok(!p.db().followUps[0].done);
});

test('U07-F08: the follow-up chip counts the same cases the filter lists', () => {
  assert.ok(service.includes("(dashFilter === 'open' ? openCases : DB).filter(followUpDue).length"));
});

test('U07-LOW-055: Service labels that are module-local carry data-i18n-ui (no phrase rows, no new controls)', () => {
  const labels = [...service.matchAll(/<div class="stat-label"[^>]*>/g)].map(m => m[0]);
  assert.equal(labels.length, 6);
  for (const l of labels) assert.ok(l.includes('data-i18n-ui'), l);
  const wb = extractFunction('svcD3RenderWorkboard');
  assert.ok(wb.includes('<span data-i18n-ui>Promised</span>'));
  assert.ok(wb.includes('<span data-i18n-ui>Promised date missing</span>'));
  assert.ok(wb.includes('<span data-i18n-ui>Owner</span>'));
  assert.ok(wb.includes('<span data-i18n-ui>Owner unassigned</span>'));
  assert.ok(!wb.includes("'Promised ' +"));
  assert.ok(!wb.includes("'Owner ' +"));
  for (const cls of ['d3-title', 'd3-context', 'd3-empty']) assert.ok(new RegExp('class="' + cls + '"[^>]*data-i18n-ui').test(wb), cls);
  assert.ok(/<strong data-i18n-ui>Exceptions requiring review<\/strong>/.test(wb));
  assert.ok(/d3-lane-head"><span data-i18n-ui>/.test(wb));
  assert.ok(/<span data-i18n-ui>Controlled stages, readiness and exceptions<\/span>/.test(wb));
  // data-i18n-ui is never added to something that carries a data-action
  assert.ok(!/data-action="[^"]*"[^>]*data-i18n-ui|data-i18n-ui[^>]*data-action=/.test(wb + service.slice(0, 6000)));
});

test('U07-LOW-TARGETS: tablet touch-target block is appended to service-ui.css', () => {
  const at = serviceCss.indexOf('@media (pointer: coarse) and (min-width: 900px)');
  assert.ok(at > -1);
  const block = serviceCss.slice(at);
  assert.ok(block.includes('min-height: 36px'));
  assert.ok(block.includes('S08 fix U07-LOW-TARGETS') || serviceCss.slice(at - 120, at).includes('S08 fix U07-LOW-TARGETS'));
  assert.ok(serviceCss.trimEnd().endsWith('}'));
});
