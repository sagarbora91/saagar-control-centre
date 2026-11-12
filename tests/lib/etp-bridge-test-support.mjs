/* Shared helpers for the ETP report-engine bridge tests. Test-only: nothing here is reachable from the built app.
   Pack signing uses a throwaway key pair that is generated in memory (non-extractable) and never written. */
import fs from 'node:fs';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { webcrypto } from 'node:crypto';

export const require = createRequire(import.meta.url);
export const wwwUrl = (name) => new URL(`../../www/${name}`, import.meta.url);
export const readWww = (name) => fs.readFileSync(wwwUrl(name), 'utf8');
export const verifierApi = require('../../www/etp-bridge-pack-verifier.js');
export const trustApi = require('../../www/etp-bridge-trust.js');

/* A crypto wrapper that counts every call and then delegates to the real WebCrypto. */
export function spyCrypto(real = webcrypto) {
  const calls = { digest: 0, importKey: 0, verify: 0 };
  const subtle = {
    digest: (...args) => { calls.digest += 1; return real.subtle.digest(...args); },
    importKey: (...args) => { calls.importKey += 1; return real.subtle.importKey(...args); },
    verify: (...args) => { calls.verify += 1; return real.subtle.verify(...args); }
  };
  return { crypto: { subtle }, calls };
}

/* Loads the bridge files into a fresh vm context the way a browser page would (no `module`, no `require`),
   or as CommonJS (`cjs: true`, which exposes the Node-only factory) so that the parse and decode counts can be observed.
   `edit` can rewrite the source text of a file before it runs. `sandbox` adds globals or replaces built-ins. */
export function loadBridge({ files = ['etp-bridge-trust.js', 'etp-bridge-pack-verifier.js'], edit = {}, sandbox = {}, cjs = false, countParse = true, prelude = '' } = {}) {
  const counts = { parse: 0, decode: 0 };
  class CountingDecoder extends TextDecoder {
    decode(...args) { counts.decode += 1; return super.decode(...args); }
  }
  const base = { TextDecoder: CountingDecoder, crypto: webcrypto };
  if (countParse) base.JSON = { parse: (...args) => { counts.parse += 1; return JSON.parse(...args); }, stringify: JSON.stringify };
  if (cjs) base.module = { exports: {} };
  const context = vm.createContext({ ...base, ...sandbox });
  if (prelude) vm.runInContext(prelude, context, { filename: 'prelude.js' });
  for (const name of files) {
    const source = edit[name] ? edit[name](readWww(name)) : readWww(name);
    vm.runInContext(source, context, { filename: name });
  }
  return { context, counts, exports: cjs ? context.module.exports : null };
}

/* Small seeded generator so fuzz runs repeat exactly. */
export function seeded(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const CHECKS = Object.freeze(['GATE', 'ENV', 'INPUT', 'SIZE', 'FRAME', 'KEY', 'SIGNATURE', 'MANIFEST', 'VERSION', 'SCHEMA', 'POLICY', 'HASH', 'ROWS', 'TOTALS']);
/* Tokens that must never appear in the bridge's browser files. Each is built from fragments so this list does not match itself. */
export const BANNED_BROWSER_TOKENS = Object.freeze([
  /\bset(?:Timeout|Interval|Immediate)\b/, /\brequestAnimationFrame\b/, /\baddEventListener\b/, /\bMutationObserver\b/, /\bpostMessage\b/,
  new RegExp(`\\bconsole${'\\.'}`), new RegExp(`\\bfet${'ch'}\\b`), new RegExp(`XML${'Http'}Request`), /\bWebSocket\b/, /\bEventSource\b/, /\bsendBeacon\b/, /\bimportScripts\b/,
  /\blocalStorage\b/, /\bsessionStorage\b/, /\bindexedDB\b/, /\bcaches\b/, /\bcookie\b/, /createElement\s*\(\s*['"]script/, new RegExp(`document${'\\.'}write\\s*\\(`),
  new RegExp(`imp${'ort'}\\s*\\(`), /\bBigInt\b/, /\d+n\b/, /\?\?/, /\?\.[A-Za-z_$(\[]/, /\(\?<[=!]/, /\(\?<[A-Za-z]/, /\bnew Function\b/, /\beval\s*\(/,
  /Saagar(?:EtpOperational|EtpE[3-7]|EtpCro|EtpTarget|EtpIncentive)/, /\bwindow\.parent\b/, /\bCapacitor\b/, /\bSaagarReauth\b/, /\bSaagarOwnerSession\b/
]);
