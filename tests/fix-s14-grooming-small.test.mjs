import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../www/modules/grooming/index.html', import.meta.url), 'utf8');

test('U08-O1: CRO name input is capped at 60 characters', () => {
  assert.ok(html.includes('id="cro-inp" type="text" maxlength="60"'));
});
test('U08-O2: zero ticks ask for confirmation, directly after the checked line', () => {
  const a = "const checked = items.filter(i=>i.passed).length;\n  if (checked === 0 && !confirm('No item is ticked. Save this check as 0%?')) return;\n  const pct";
  assert.ok(html.includes(a));
});
test('U08-O3: an empty month warns before the export continues', () => {
  const warn = "if (rows.length === 1) { try { showToast('No records for this month. Only the header row will be exported.'); } catch(e) {} }";
  const i = html.indexOf(warn);
  assert.ok(i > 0);
  assert.ok(html.indexOf('const csvCell = v =>') > i);
  assert.ok(html.indexOf('const csvCell = v =>') - i < 200);
});
test('singular wording for one failure is still in the source', () => {
  assert.ok(html.includes("x.fails===1?' time':' times'"));
});
