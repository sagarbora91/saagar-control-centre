import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8');

test('compact remediation is bounded below the desktop contract', () => {
  const sources = [
    read('www/modules/stock/stock-ui.css'),
    read('www/modules/service/service-ui.css'),
    read('www/modules/expense/index.html'),
    read('www/modules/leave/leave-ui.css'),
    read('www/modules/tax/tax-ui.css')
  ];
  for (const source of sources) {
    assert.match(source, /max-width:\s*899px/);
    assert.doesNotMatch(source, /min-width:\s*900px[^}]*display:\s*none/s);
  }
});

test('compact modules remove the measured sideways-only interactions', () => {
  const stock = read('www/modules/stock/stock-ui.css');
  const service = read('www/modules/service/service-ui.css');
  const expense = read('www/modules/expense/index.html');
  const leave = read('www/modules/leave/leave-ui.css');
  const tax = read('www/modules/tax/tax-ui.css');
  const finalMobile = read('www/mobile-layout.css');

  assert.match(stock, /@media \(max-width: 899px\)[\s\S]*?\.rtbl\.saagar-table--cards\s*\{[^}]*min-width:\s*0\s*!important/);
  assert.match(service, /@media\(max-width:899px\)\{[\s\S]*?\.d3-board\{grid-template-columns:1fr;overflow-x:hidden\}/);
  assert.match(expense, /\.tabs\{flex-wrap:wrap;overflow-x:hidden/);
  assert.match(leave, /\.staff-strip \{ flex-wrap: wrap; overflow-x: hidden; \}/);
  assert.match(tax, /\.mnav\{padding:4px 8px;flex-wrap:wrap;overflow-x:hidden;\}/);
  assert.match(finalMobile, /data-mod="expense"\] \.tabs \{[\s\S]*?flex-wrap: wrap !important;[\s\S]*?overflow-x: hidden !important;/);
  assert.match(finalMobile, /data-mod="leave"\] \.header-actions \{[\s\S]*?flex-wrap: wrap !important;/);
  assert.match(finalMobile, /data-mod="tax"\] \.hd-right \{[\s\S]*?flex-wrap: wrap !important;/);
});
