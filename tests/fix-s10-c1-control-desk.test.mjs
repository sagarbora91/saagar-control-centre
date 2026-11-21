import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const rd = p => fs.readFileSync(fileURLToPath(new URL('../www/' + p, import.meta.url)), 'utf8');
const POLICY = rd('c1-operations-policy.js');
const DESK = rd('c1-control-desk.js');

// Opens the real Control Desk for one module against a memory localStorage and returns its body HTML.
function deskHtml(mod, store) {
  const ls = new Map(Object.entries(store).map(([k, v]) => [k, JSON.stringify(v)]));
  const nodes = {};
  const node = id => nodes[id] || (nodes[id] = { id, innerHTML: '', style: {}, appendChild() {}, setAttribute() {} });
  const document = {
    readyState: 'complete', documentElement: { getAttribute: () => mod }, body: { appendChild() {} },
    createElement: () => ({ style: {}, appendChild() {}, setAttribute() {}, addEventListener() {}, querySelector: () => ({}) }),
    getElementById: id => node(id), querySelectorAll: () => [], addEventListener() {},
  };
  const localStorage = { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => ls.set(k, String(v)), removeItem: k => ls.delete(k) };
  const window = {};
  const ctx = vm.createContext({ window, document, localStorage, Date, JSON, Math, Number, Object, Array, String, console });
  ctx.globalThis = ctx;
  vm.runInContext(POLICY, ctx);
  ctx.window.SaagarC1OperationsPolicy = ctx.SaagarC1OperationsPolicy;
  vm.runInContext(DESK, ctx);
  ctx.window.SaagarC1Desk.render();
  return node('c1-desk-body').innerHTML;
}
function card(html, label) {
  const i = html.indexOf('<strong>' + label + '</strong>');
  assert.ok(i >= 0, 'card ' + label + ' present');
  return html.slice(i, html.indexOf('</div></div>', i));
}

test('S10-2 payroll control counts only employees who are not retired', () => {
  const html = deskHtml('payroll', { payroll_suite_v1_2026: { meta: { month: 'November' }, rows: [
    { name: 'A', net: 100 }, { name: 'B', net: 100, active: true }, { name: 'C', net: 0, active: false } ] } });
  assert.match(card(html, 'Employees'), /c1-val [^"]*">2</);
});

test('S10-2 retired rows do not trip the named / negative-net checks', () => {
  const html = deskHtml('payroll', { payroll_suite_v1_2026: { meta: { month: 'November' }, rows: [
    { name: 'A', net: 100 }, { name: '', net: -5, active: false } ] } });
  assert.match(card(html, 'Pre-lock checklist'), />4\/4</);
});

test('S12 U12-N1 Festival plans shows the number of festivals in the calendar object', () => {
  const f = v => deskHtml('planning', { saagar_festival_calendar_v1: v });
  assert.match(card(f({ version: 1, festivals: [{}, {}, {}] }), 'Festival plans'), />3</);
  assert.match(card(f({ version: 1, festivals: [] }), 'Festival plans'), />0</);
  assert.match(card(f([{}, {}, {}, {}]), 'Festival plans'), />4</);
});
