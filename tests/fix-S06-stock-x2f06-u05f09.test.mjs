// X2-F06: no value="undefined" in number inputs. U05-F-09: opening print variance over counted brands only.
import test from 'node:test';
import assert from 'node:assert/strict';
import { makeCtx, stockSource, dayRecord } from './lib/fix-S06-stock-vm.mjs';

test('X2-F06 none of the 14 old null-only forms remain', () => {
  const s = stockSource();
  /* the theft line (thV) already handles old blobs via (m.theft ?? null) and is not one of the 14 */
  assert.equal(/!== null \? (o|m|c)\.(?!theft)\w+\s*:\s*''/.test(s), false);
  assert.equal(/syV = sys\s+!== null/.test(s), false);
  assert.equal(s.includes("inputEl.value = (prev !== null ? prev : '')"), false);
  for (const line of [
    "const dV = o.display ?? '';", "const sV = o.storage ?? '';", "const dE = o.defective ?? '';", "const yV = o.yLoc ?? '';",
    "const syV = sys ?? '';", "const inV  = m.inward ?? '';", "const ouV  = m.outward ?? '';", "const saV  = m.sales ?? '';",
    "const grV  = m.grn ?? '';", "const dV = c.display ?? '';", "const sV = c.storage ?? '';", "const dE = c.defective ?? '';",
    "const yV = c.yLoc ?? '';", "inputEl.value = (prev != null ? prev : '')",
  ]) assert.ok(s.includes(line), line);
});

test('X2-F06 behaviour: the real renders write no value="undefined", zero stays zero', () => {
  /* audit S06: render the real tables for a day whose CLASSIC fields are missing (o = {}) */
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  const key = 'saagar_stock_titanworld_' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const rec = dayRecord();
  rec.opening.CLASSIC = { systemStock: 0, croName: 'A' }; rec.movements.CLASSIC = {}; rec.closing.CLASSIC = { croName: 'A' };
  const c = makeCtx({ storage: { [key]: JSON.stringify(rec) } });
  for (const [fn, id] of [['renderOpening', 'tbody-open'], ['renderMovements', 'tbody-mov'], ['renderClosing', 'tbody-close']]) {
    c.run(fn + '()');
    const html = c.els[id].innerHTML;
    assert.ok(html.length > 0, fn);
    assert.equal((html.match(/value="undefined"/g) || []).length, 0, fn);
  }
  assert.ok(/value="0"/.test(c.els['tbody-open'].innerHTML));
});

function printed(rec) {
  const d = new Date(); const p = n => String(n).padStart(2, '0');
  const key = 'saagar_stock_titanworld_' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  const c = makeCtx({ storage: { [key]: JSON.stringify(rec) } });
  let html = '';
  c.win.parent = { postMessage: m => { html = m.html; } };
  c.api.printOpeningReg();
  return html;
}

test('U05-F-09 print: pending brand shows a dash variance; total over counted brands only', () => {
  const rec = dayRecord();
  const blank = { display: null, storage: null, defective: null, yLoc: null, systemStock: 64, remarks: '', croName: '', time: '', verified: false, countDone: false };
  rec.opening = Object.assign({}, rec.opening, { RAGA: blank });
  const html = printed(rec);
  const raga = html.match(/<tr><td>RAGA<\/td>.*?<\/tr>/s)[0];
  assert.ok(!raga.includes('-64'), raga);
  const tfoot = html.match(/<tfoot>.*?<\/tfoot>/s)[0];
  assert.ok(/stp-r">-5<\/td>/.test(tfoot), tfoot);   // CLASSIC: phys 5 - sys 10 = -5; RAGA not counted
});

test('U05-F-09 source text', () => {
  const s = stockSource();
  assert.ok(s.includes('if (phys !== null) tVar += vr;'));
  assert.ok(s.includes("(phys !== null ? stEsc(stVar(vr)) : '—')"));
  assert.ok(s.includes('stVar(tVar)'));
  assert.equal(s.includes("((phys !== null || sys !== null) ? stEsc(stVar(vr)) : '—')"), false);
});
