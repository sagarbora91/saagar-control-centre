import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../www/', import.meta.url);
const read = relative => readFile(new URL(relative, root), 'utf8');

test('dynamic controls expose real alternatives without leaking JavaScript into visible text', async () => {
  const [shell, qms, tax] = await Promise.all([
    read('index.html'),
    read('modules/qms/index.html'),
    read('modules/tax/index.html')
  ]);

  assert.match(shell, /x=>x\.checked=true/);
  assert.match(shell, />Select all<\/button>/);
  assert.match(shell, /<span>Owner PIN required to open<\/span>/);
  assert.match(shell, /<span>No module-entry PIN<\/span>/);
  assert.doesNotMatch(shell, /\$\{enabled\?'Owner PIN required to open':'No module-entry PIN'\}/);

  assert.match(qms, /placeholderOption=isCro\?'<option value="">— select your name —<\/option>':'<option value="">— select CRO —<\/option>'/);
  assert.doesNotMatch(qms, /\$\{isCro\?'— select your name —':'— select CRO —'\}/);

  assert.match(tax, /<span>NA<\/span>\$\{naItems\.length\?` <span>\(\$\{naItems\.length\}\)<\/span>`:''\}/);
  assert.match(tax, /title="Not Applicable — read-only"/);
  assert.match(tax, /title="Undo completion"/);
  assert.match(tax, /title="Mark as completed"/);
  assert.match(tax, />✓ Not Applicable \(NA\)<\/button>/);
  assert.match(tax, />Mark Not Applicable \(NA\)<\/button>/);
});

test('dynamic labels keep runtime text while removing scanner-only empty slots', async () => {
  const [expense, payroll, planning] = await Promise.all([
    read('modules/expense/index.html'),
    read('modules/payroll/index.html'),
    read('modules/planning/index.html')
  ]);

  assert.match(expense, /<option value="'\+esc\(v\.name\)\+'"><\/option>/);
  assert.match(payroll, /const advanceTitle=`Auto from Advance Vouchers mapped to \$\{state\.meta\.month\} \$\{state\.meta\.year\}\. Create\/manage in the Advances tab\.`/);
  assert.match(payroll, /title="\$\{escA\(advanceTitle\)\}"/);
  assert.match(payroll, /const currentMonthLabel=`Current month \(\$\{state\.meta\.month\} \$\{state\.meta\.year\}\) — live`/);
  assert.match(payroll, /const optionLabel=\(r\.name\|\|"\(no name\)"\)/);
  assert.match(planning, /var checklistLabel='Pre-festival checklist \('\+done\+'\/'\+chk\.length\+'\)'/);
});

test('browser-decoded symbols are represented canonically in source', async () => {
  const [service, tax] = await Promise.all([
    read('modules/service/index.html'),
    read('modules/tax/index.html')
  ]);

  assert.match(service, /aria-label="Close">×<\/button>/);
  assert.doesNotMatch(service, /&times;/);
  assert.match(tax, /turnover ≤ &#8377;5 crore/);
  assert.doesNotMatch(tax, /&le;/);
});
