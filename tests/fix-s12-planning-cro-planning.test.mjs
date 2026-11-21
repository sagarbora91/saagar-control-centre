import assert from 'node:assert/strict';
import test from 'node:test';
import { loadPlanning, plnHtml } from './lib/fix-s12-cro-vm.mjs';

function fill(p, v) { for (const [id, x] of Object.entries(v)) p.el(id).value = x; }
const BASE = { f_id: '', f_name: 'V Fest', f_start: '2026-11-10', f_end: '2026-11-14', f_note: '' };

test('F-PLN-2: a negative target is refused and nothing is saved', () => {
  const p = loadPlanning();
  fill(p, { ...BASE, f_tt: '1000', f_th: '-500' });
  p.run('saveFestival()');
  assert.equal(p.festivals().length, 0);
  assert.match(p.toasts.at(-1), /Targets cannot be negative/);
  const q = loadPlanning();
  fill(q, { ...BASE, f_tt: '-1', f_th: '' });
  q.run('saveFestival()');
  assert.equal(q.festivals().length, 0);
});

test('F-PLN-2: zero and blank targets still save as 0', () => {
  const p = loadPlanning();
  fill(p, { ...BASE, f_tt: '', f_th: '0' });
  p.run('saveFestival()');
  const [f] = p.festivals();
  assert.deepEqual(f.targets, { titanworld: 0, helios: 0 });
});

test('F-PLN-1: a saved blackout festival keeps the shape the Leave module reads', () => {
  const p = loadPlanning();
  fill(p, { ...BASE, f_tt: '1000', f_th: '500' });
  p.el('f_black').checked = true;
  p.run('saveFestival()');
  const [f] = p.festivals();
  assert.equal(f.blackout, true);
  assert.match(f.start, /^\d{4}-\d{2}-\d{2}$/);
  assert.match(f.end, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(JSON.parse(p.ls.getItem('saagar_festival_calendar_v1')).version, 1);
  // the label promise is not changed in this wave (Leave delivers the warning)
  assert.match(plnHtml(), /Leave blackout — warn before approving staff leave in this window/);
});

test('F-PLN-2: a negative target saved earlier is not shown or added up', () => {
  const stored = { version: 1, festivals: [{ id: 'f1', name: 'Old', start: '2030-01-01', end: '2030-01-02', targets: { titanworld: 1000, helios: -500 }, checklist: [] }] };
  const p = loadPlanning({ storage: { saagar_festival_calendar_v1: stored } });
  p.run('render()');
  const html = p.el('list').innerHTML;
  assert.match(html, /₹1,000/);
  assert.doesNotMatch(html, /-500|₹-/);
  assert.match(html, /TW ₹1,000 · HE ₹0/);
  assert.match(html, /A negative target was saved earlier/);
  // editFestival still loads the raw value so the manager sees what to correct
  p.run("editFestival('f1')");
  assert.equal(p.el('f_th').value, -500);
});

test('Planning keeps exactly its three static buttons', () => {
  const html = plnHtml().replace(/<script[\s\S]*?<\/script>/g, '');
  assert.equal((html.match(/<button\b/g) || []).length, 3);
});
