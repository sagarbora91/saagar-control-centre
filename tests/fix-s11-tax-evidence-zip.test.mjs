// S11 U11-F01: the evidence ZIP must pass realm-independent data to the shell's JSZip.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import path from 'node:path';
import { buildContext, run, ROOT } from './lib/fix-s11-extract.mjs';

const require = createRequire(import.meta.url);
const RealJSZip = require(path.join(ROOT, 'www', 'jszip.min.js'));
// The shell JSZip rejects binary data that is not an instance of ITS OWN Uint8Array (cross-realm
// instanceof check in JSZip getTypeOf). Node's JSZip is lenient, so this wrapper applies the browser rule.
function StrictJSZip() {
  const wrap = z => ({
    file(n, d, o) {
      if (typeof d !== 'string' && !(d instanceof Uint8Array)) throw new Error("Can't read the data of '" + n + "'. Is it in a supported JavaScript type");
      z.file(n, d, o); return this;
    },
    folder: f => wrap(z.folder(f)),
    generateAsync: (...a) => z.generateAsync(...a)
  });
  return wrap(new RealJSZip());
}
const b64 = s => Buffer.from(s).toString('base64');

function build(jszip) {
  const alerts = [], posts = [];
  const files = [
    { itemKey: 'f1|2026|x1', name: 'a.txt', addedAt: 1, dataURL: 'data:text/plain;base64,' + b64('hello') },
    { itemKey: 'f1|2026|x1', name: 'a.txt', addedAt: 2, dataURL: 'data:text/plain;base64,' + b64('again') },
    { itemKey: 'f1|2026|x1', name: 'empty.txt', addedAt: 3, dataURL: 'data:text/plain;base64,' }
  ];
  const globals = {
    atob, Blob, Promise, Error, String, Number, Date, Object, Array, Math, isNaN,
    alert: m => alerts.push(m),
    window: { parent: { postMessage: m => posts.push(m) } },
    SaagarModuleRuntime: { targetOrigin: '*' },
    STATE: { firms: [{ id: 'f1', name: 'T' }], activeFirmId: 'f1', fyStartYear: 2026 },
    getActiveFirm: () => ({ id: 'f1', name: 'T' }),
    getFinancialYearLabel: () => 'FY 2026-27',
    getFinancialYearShortLabel: () => '2026-27',
    itemMetaById: () => ({}),
    evApi: () => ({ snapshotAll: async () => files, snapshotByPrefix: async () => files }),
    ensureJSZipRef: () => Promise.resolve(jszip)
  };
  // Module code under test: real functions from the module file.
  const names = ['dataURLToBytes', 'downloadZipBlob', 'exportEvidenceZip'];
  let helper = null;
  try { helper = 'dataURLToBase64'; buildContext([helper], {}); } catch { helper = null; }
  const ctx = buildContext(helper ? [helper, ...names] : names, globals);
  return { ctx, alerts, posts };
}

test('F01: evidence ZIP is built with the shell realm JSZip and holds every file', async () => {
  const { ctx, alerts, posts } = build(StrictJSZip);
  await run(ctx, 'exportEvidenceZip()');
  assert.deepEqual(alerts, []);
  const share = posts.find(p => p && p.exportId === 'tax-evidence-zip');
  assert.ok(share, 'one ST_SHARE message for tax-evidence-zip');
  assert.equal(posts.filter(p => p && p.exportId === 'tax-evidence-zip').length, 1);
  assert.ok(share.file && share.file.size > 0);
  const zip = await RealJSZip.loadAsync(await share.file.arrayBuffer());
  const names = Object.keys(zip.files).filter(n => !zip.files[n].dir);
  assert.ok(names.includes('index.csv'));
  const a = names.find(n => n.endsWith('/a.txt'));
  const a2 = names.find(n => n.endsWith('/a (2).txt'));
  const e = names.find(n => n.endsWith('/empty.txt'));
  assert.ok(a && a2 && e, 'a.txt, a (2).txt and empty.txt present: ' + names.join(','));
  assert.equal(await zip.file(a).async('string'), 'hello');
  assert.equal(await zip.file(a2).async('string'), 'again');
  assert.equal((await zip.file(e).async('uint8array')).length, 0);
});

test('F01: a ZIP failure shows the real reason in the alert', async () => {
  const stub = function () { this.folder = () => ({ file() { throw new Error('boom'); } }); this.file = () => {}; };
  const { ctx, alerts } = build(stub);
  await run(ctx, 'exportEvidenceZip()');
  assert.deepEqual(alerts, ['Could not build the evidence ZIP. (boom)']);
});
