// Helpers for the Service wave 2 billing-calc tests (tests/svc2-calc-*.test.mjs).
// Loads www/service-billing-calc.js the same way a Phase 1 pure core is loaded (CommonJS through createRequire).
// Nothing here computes an expected value: expected values are typed by hand in the tests and the fixture.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(HERE, '..', '..');
export const CALC_REL = 'www/service-billing-calc.js';
export const CALC_PATH = path.join(ROOT, 'www', 'service-billing-calc.js');

export const Calc = require(CALC_PATH);

export const srcText = () => fs.readFileSync(CALC_PATH, 'utf8');
export const srcBuf = () => fs.readFileSync(CALC_PATH);
export const fixture = (name) => JSON.parse(fs.readFileSync(path.join(ROOT, 'tests', 'fixtures', 'service-wave-2', name), 'utf8'));

export const clone = (v) => JSON.parse(JSON.stringify(v));

export function deepFreeze(v) {
  if (v && typeof v === 'object' && !Object.isFrozen(v)) {
    Object.freeze(v);
    for (const k of Object.keys(v)) deepFreeze(v[k]);
  }
  return v;
}

// Invented, checksum-valid GSTINs of the spec (section 10.6). Not real numbers.
export const GSTIN_29 = '29LMNOP4321D1ZR';
export const GSTIN_27 = '27PQRST5678K1Z2';
export const GSTIN_33 = '33FGHIJ9876C1ZH';

const KIND_DEFAULT = {
  PART: { code: 'P1', hsnSac: '9101' },
  LABOUR: { code: 'L1', hsnSac: '998719' },
  OTHER: { code: '', hsnSac: '' }
};

// compact fixture line {k,p,q,r,b,d,nc} -> a full calc input line
export function fullLine(l) {
  const def = KIND_DEFAULT[l.k];
  const out = {
    kind: l.k, code: def.code, name: 'Item ' + l.k.toLowerCase(), hsnSac: def.hsnSac, rateBp: l.r, priceBasis: l.b,
    unitPricePaise: l.p, qty: l.q
  };
  if (l.d) out.discountPaise = l.d;
  if (l.nc) out.noCharge = true;
  return out;
}

export function billInput(ex) {
  const input = { lines: ex.lines.map(fullLine), sellerStateCode: '27' };
  if (ex.bd) input.billDiscountPaise = ex.bd;
  if (ex.gstin) input.recipientGstin = ex.gstin;
  return input;
}

export const part = (over) => Object.assign({
  kind: 'PART', code: 'P1', name: 'A', hsnSac: '9101', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 100000, qty: 1
}, over || {});
export const labour = (over) => Object.assign({
  kind: 'LABOUR', code: 'L1', name: 'Labour', hsnSac: '998719', rateBp: 1800, priceBasis: 'EXCL', unitPricePaise: 80000, qty: 1
}, over || {});
export const one = (over, top) => Object.assign({ lines: [part(over)], sellerStateCode: '27' }, top || {});

// the line columns of the fixture rows, in this order
export const ROW_FIELDS = [
  'listPaise', 'lineDiscountPaise', 'priceAfterLineDiscountPaise', 'payableWeightPaise', 'billDiscountSharePaise', 'netPaise',
  'taxablePaise', 'taxPaise', 'cgstPaise', 'sgstPaise', 'igstPaise', 'totalPaise'
];

// A seeded generator (32-bit linear congruential). Never Math.random.
export function makeRng(seed) {
  let s = seed >>> 0;
  const next = () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const int = (n) => Math.floor(next() * n);
  const range = (a, b) => a + int(b - a + 1);
  const pick = (list) => list[int(list.length)];
  return { next, int, range, pick };
}

const RATES = [0, 500, 1200, 1800, 1800, 1800, 2800];
const KINDS = ['PART', 'PART', 'LABOUR', 'OTHER'];

// A random valid bill input. The bill discount range is found from a no-discount bill (only used to pick the input).
export function randomBillInput(rng) {
  const n = rng.range(1, 6);
  const lines = [];
  for (let i = 0; i < n; i += 1) {
    const kind = rng.pick(KINDS);
    const price = rng.int(10) === 0 ? rng.range(0, 99) : rng.range(1, 3000000);
    const qty = rng.range(1, 5);
    const l = {
      kind, code: kind === 'OTHER' ? '' : (kind === 'PART' ? 'P' + (i + 1) : 'L' + (i + 1)), name: 'Item ' + (i + 1),
      hsnSac: kind === 'PART' ? rng.pick(['9101', '910111', '91011100']) : (kind === 'LABOUR' ? rng.pick(['9987', '998719']) : ''),
      rateBp: rng.pick(RATES), priceBasis: rng.int(2) === 0 ? 'INCL' : 'EXCL', unitPricePaise: price, qty
    };
    if (rng.int(8) === 0) l.noCharge = true;
    else if (rng.int(4) === 0) l.discountPaise = rng.int(price * qty + 1);
    lines.push(l);
  }
  if (lines.every((l) => l.noCharge)) delete lines[0].noCharge;
  const input = { lines, sellerStateCode: '27' };
  if (rng.int(10) < 3) input.recipientGstin = GSTIN_29;
  const base = Calc.computeBill(input);
  if (!base.ok) return { input, base };
  const weight = base.lines.reduce((a, l) => a + l.payableWeightPaise, 0);
  const pickD = rng.int(10);
  if (weight > 0 && pickD >= 4) input.billDiscountPaise = pickD === 9 ? weight : rng.int(weight + 1);
  return { input, base: Calc.computeBill(input) };
}
