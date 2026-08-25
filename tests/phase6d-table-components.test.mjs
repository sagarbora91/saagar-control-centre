import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const api = require('../www/shared/module-table-runtime.js');
const css = fs.readFileSync(new URL('../www/shared/module-table.css', import.meta.url), 'utf8');
const runtime = fs.readFileSync(new URL('../www/shared/module-table-runtime.js', import.meta.url), 'utf8');

class ClassList {
  constructor() { this.values = []; }
  add(value) { if (!this.values.includes(value)) this.values.push(value); }
  contains(value) { return this.values.includes(value); }
}
class Element {
  constructor(tagName, parentNode = null) { this.tagName = tagName.toUpperCase(); this.nodeType = 1; this.parentNode = parentNode; this.attributes = {}; this.classList = new ClassList(); this.children = []; this.textContent = ''; }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  hasAttribute(name) { return Object.prototype.hasOwnProperty.call(this.attributes, name); }
  getAttribute(name) { return this.hasAttribute(name) ? this.attributes[name] : null; }
  appendChild(child) { this.children.push(child); child.parentNode = this; return child; }
}
const document = { createElement: tag => new Element(tag) };
function optedTable() { const root = new Element('section'); root.setAttribute('data-saagar-ui', ''); return new Element('table', root); }

test('table CSS is opt-in, tier-explicit and API-23 fallback safe', () => {
  const selectorLines = css.replace(/\/\*[\s\S]*?\*\//g, '').split(/\r?\n/)
    .map(line => line.trim()).filter(line => line.endsWith('{') || line.endsWith(','));
  for (const line of selectorLines) {
    if (line.startsWith('@')) continue;
    assert.match(line, /^\[data-saagar-ui\]/, line);
  }
  for (const tier of ['mobile', 'compact', 'tablet']) assert.match(css, new RegExp(`data-saagar-width-resolved="${tier}"`));
  assert.match(css, /display:-webkit-flex;\s*display:flex/);
  assert.match(css, /clip:rect\(0 0 0 0\)/);
  assert.match(css, /overflow-x:auto[\s\S]*-webkit-overflow-scrolling:touch/);
  assert.doesNotMatch(css, /:is\(|:where\(|:has\(|display\s*:\s*grid/);
});

test('card, priority and grid strategies are explicit and exclusive', () => {
  for (const strategy of ['cards', 'priority']) assert.equal(api.applyStrategy(optedTable(), strategy).classList.contains(`saagar-table--${strategy}`), true);
  const grid = optedTable();
  api.applyStrategy(grid, 'grid', { reason: 'movement comparison' });
  assert.equal(grid.getAttribute('data-saagar-grid-reason'), 'movement comparison');
  assert.throws(() => api.applyStrategy(optedTable(), 'grid'), /documented reason/);
  assert.throws(() => api.applyStrategy(new Element('table'), 'cards'), /data-saagar-ui/);
  const mixed = optedTable();
  api.applyStrategy(mixed, 'cards');
  assert.throws(() => api.applyStrategy(mixed, 'priority'), /mutually exclusive/);
  assert.throws(() => api.applyStrategy(optedTable(), 'unknown'), /unsupported/);
});

test('priority visibility contract covers all four priority levels and print restoration', () => {
  assert.match(css, /mobile[^{}]*[\s\S]*?priority="2"[\s\S]*?priority="3"[\s\S]*?priority="4"[^{]*\{display:none;\}/);
  assert.match(css, /compact[^{}]*[\s\S]*?priority="3"[\s\S]*?priority="4"[^{]*\{display:none;\}/);
  assert.match(css, /tablet[^{}]*[\s\S]*?priority="4"[^{]*\{display:none;\}/);
  assert.match(css, /@media print[\s\S]*\[data-saagar-priority\]\{display:table-cell;\}/);
  const cell = new Element('td');
  for (const priority of [1, 2, 3, 4]) assert.equal(api.setPriority(cell, priority).getAttribute('data-saagar-priority'), String(priority));
  assert.throws(() => api.setPriority(cell, 5), /priority/);
});

test('ordinary hostile data is opaque text and audited controls are allowlisted nodes', () => {
  const hostile = '<img src=x onerror="globalThis.pwned=1"> & \'quoted\'';
  const textCell = api.createTextCell(document, 'Employee <name>', hostile);
  assert.equal(textCell.textContent, hostile);
  assert.equal(textCell.children.length, 0);
  assert.equal(textCell.getAttribute('data-saagar-label'), 'Employee <name>');

  const token = api.createAuditedControl(document, 'row-action-v1', { actionId: 'open-row', label: hostile });
  const controlCell = api.createControlCell(document, 'Action', token);
  const button = controlCell.children[0];
  assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.textContent, hostile);
  assert.equal(button.getAttribute('type'), 'button');
  assert.equal(button.getAttribute('data-action'), 'open-row');
  assert.equal(controlCell.getAttribute('data-saagar-audited-control'), 'row-action-v1');
  assert.equal(Object.isFrozen(token), true);
  assert.throws(() => api.createAuditedControl(document, 'caller-certified', { actionId: 'open-row' }), /unknown audited/);
  assert.throws(() => api.createAuditedControl(document, 'row-action-v1', { actionId: 'javascript:alert-1', label: 'Bad' }), /canonical identifier/);
  assert.throws(() => api.createAuditedControl(document, 'row-details-v1', { controlsId: 'bad id', label: 'Bad' }), /canonical identifier/);
  assert.throws(() => api.createControlCell(document, 'Action', { auditId: 'row-action-v1' }), /opaque audited/);
  assert.throws(() => api.createControlCell(document, 'Action', hostile), /opaque audited/);
  assert.throws(() => api.createControlCell(document, 'Action', new Element('script')), /opaque audited/);
});

test('runtime is frozen, non-autoboot and contains no HTML execution sinks', () => {
  assert.equal(Object.isFrozen(api), true);
  assert.equal(Object.isFrozen(api.strategies), true);
  assert.deepEqual([...api.strategies], ['cards', 'priority', 'grid']);
  assert.doesNotMatch(runtime, /innerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.doesNotMatch(runtime, /href|srcdoc|setAttribute\(['"]on/i);
  assert.doesNotMatch(runtime, /DOMContentLoaded|addEventListener\s*\(/);
});
