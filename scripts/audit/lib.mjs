import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

export const AUDIT_VERSION = 'saagar-whole-app-audit-v1.0.0';
/* Anchor history and the reasoning for each move live in
   docs/audit/AUDIT-PROGRAM-v1.md section 1.3. The anchor is the frozen
   pre-migration product snapshot and the tooling/baseline gates require an exact
   product-fingerprint match, so every product change forces an explicit
   re-anchor rather than silent drift. Current anchor is the SEC-08 fail-closed
   fix; 88ba118 and f4da822 are superseded as comparison baselines. */
export const PRODUCT_BASELINE_SHA = '8f96480ec6ddfc99016af43a7369f57a06cb9fd6';

export function posix(value) {
  return String(value).replaceAll('\\', '/');
}

export function compareText(left, right) {
  return String(left) < String(right) ? -1 : String(left) > String(right) ? 1 : 0;
}

export function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function runGit(root, args) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024
  }).trim();
}

export function trackedFiles(root) {
  const output = execFileSync('git', ['-C', root, 'ls-files', '-z'], {
    encoding: 'buffer', windowsHide: true, maxBuffer: 64 * 1024 * 1024
  });
  return output.toString('utf8').split('\0').filter(Boolean).map(posix).sort();
}

export const AUDIT_PROGRAM_FILE = 'docs/audit/AUDIT-PROGRAM-v1.md';
export const AUDIT_PROGRAM_CLOSURE_ADDENDUM_FILE =
  'docs/audit/AUDIT-PROGRAM-v1-CLOSURE-ADDENDUM-2026-08-09.md';
// Stable prefix, not a dated exact string: the base program and every
// AUDIT-PROGRAM-v1 addendum are audit-control evidence, never product files.
// A dated string would silently reintroduce the 2026-08-09 freeze blocker
// (a committed addendum counted as product and broke exact-equality with the
// product anchor) the next time an addendum is written.
export const AUDIT_PROGRAM_PATTERN = /^docs\/audit\/AUDIT-PROGRAM-v1(-[A-Za-z0-9.-]+)?\.md$/;

export function isAuditControlPath(file) {
  const value = posix(file);
  return value.startsWith('scripts/audit/') ||
    value === 'tests/whole-app-audit-runner.test.mjs' ||
    /* docs/audit/ is audit control EXCEPT change contracts. Naming individual
       files was the recurring defect: the U3 freeze blocker was a committed
       addendum counting as a product file, and it recurred when
       P0-DECISIONS-2026-08-10.md was committed and broke the anchor gate with
       AUDIT_TOOLING_PRODUCT_FINGERPRINT_DRIFT.

       But a blanket prefix is WRONG in the other direction: docs/audit/ also
       holds `*-CHANGE-CONTRACT-*.md` (D2-QMS, D3-SERVICE, D4-DSR, D5-STOCK, C1,
       MAH1-MAH4). Those are approved PRODUCT specifications that the audit
       measures the product against — excluding them would let a behavioural
       contract change without moving the product fingerprint, which is exactly
       the silent drift the anchor exists to prevent. */
    (value.startsWith('docs/audit/') && !/-CHANGE-CONTRACT-/.test(value)) ||
    value.startsWith('verification/audit/');
}

export function isProductPath(file) {
  return !isAuditControlPath(file);
}

export function fingerprint(root, files) {
  const entries = files.map(file => {
    const bytes = fs.readFileSync(path.join(root, file));
    return { path: posix(file), bytes: bytes.length, sha256: sha256(bytes) };
  });
  const body = entries.map(item => `${item.path}\0${item.bytes}\0${item.sha256}\n`).join('');
  return Object.freeze({ algorithm: 'sha256(path\\0bytes\\0sha256\\n):worktree', fileCount: entries.length,
    totalBytes: entries.reduce((sum, item) => sum + item.bytes, 0), treeSha256: sha256(body), entries });
}

export function revisionFingerprint(root, files, revision = 'HEAD') {
  const ordered = files.map(posix).sort();
  if (ordered.some(file => /[\r\n]/.test(file))) throw new Error('AUDIT_UNSAFE_GIT_PATH');
  const output = execFileSync('git', ['-C', root, 'cat-file', '--batch'], {
    input: `${ordered.map(file => `${revision}:${file}`).join('\n')}\n`,
    encoding: null, windowsHide: true, maxBuffer: 256 * 1024 * 1024
  });
  let cursor = 0;
  const entries = [];
  for (const file of ordered) {
    const headerEnd = output.indexOf(0x0a, cursor);
    if (headerEnd < 0) throw new Error('AUDIT_GIT_BATCH_HEADER_MISSING');
    const header = output.subarray(cursor, headerEnd).toString('utf8');
    const match = header.match(/^[a-f0-9]+ blob (\d+)$/);
    if (!match) throw new Error(`AUDIT_GIT_BLOB_UNAVAILABLE:${file}`);
    const length = Number(match[1]);
    if (!Number.isSafeInteger(length) || length < 0) throw new Error('AUDIT_GIT_BLOB_SIZE_INVALID');
    const start = headerEnd + 1;
    const end = start + length;
    if (end >= output.length || output[end] !== 0x0a) throw new Error('AUDIT_GIT_BATCH_PAYLOAD_INVALID');
    const bytes = output.subarray(start, end);
    entries.push({ path: file, bytes: bytes.length, sha256: sha256(bytes) });
    cursor = end + 1;
  }
  if (cursor !== output.length) throw new Error('AUDIT_GIT_BATCH_TRAILING_DATA');
  const body = entries.map(item => `${item.path}\0${item.bytes}\0${item.sha256}\n`).join('');
  return Object.freeze({ algorithm: 'sha256(path\\0bytes\\0sha256\\n)', fileCount: entries.length,
    totalBytes: entries.reduce((sum, item) => sum + item.bytes, 0), treeSha256: sha256(body), entries });
}

export function parseManifest(root) {
  const source = fs.readFileSync(path.join(root, 'www/module-manifest.js'), 'utf8');
  const match = source.match(/\/\*__SAAGAR_MODULE_MANIFEST_START__\*\/([\s\S]*?)\/\*__SAAGAR_MODULE_MANIFEST_END__\*\//);
  if (!match) throw new Error('AUDIT_MANIFEST_BLOCK_MISSING');
  return JSON.parse(match[1]);
}

export function readText(root, file) {
  return fs.readFileSync(path.join(root, posix(file)), 'utf8');
}

export function exists(root, file) {
  return fs.existsSync(path.join(root, posix(file)));
}

export function lineNumber(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

export function evidence(items, limit = 200) {
  const seen = new Set();
  return items.map(item => typeof item === 'string' ? { code: item } : item)
    .map(item => Object.fromEntries(Object.entries(item).filter(([, value]) => value !== undefined && value !== null)))
    .sort((a, b) => compareText(JSON.stringify(a), JSON.stringify(b)))
    .filter(item => { const key = JSON.stringify(item); if (seen.has(key)) return false; seen.add(key); return true; })
    .slice(0, limit);
}

export function makeCheck({ id, title, result, severity = 'INFO', mandatory = false,
  metric = {}, rule, evidence: items = [], notes = '' }) {
  if (!/^A(?:[1-9]|10|11)-\d{2}$/.test(id)) throw new Error(`AUDIT_CHECK_ID_INVALID:${id}`);
  if (!['pass', 'fail', 'unmeasured', 'na'].includes(result)) throw new Error(`AUDIT_RESULT_INVALID:${id}`);
  if (!['P0', 'P1', 'P2', 'P3', 'INFO'].includes(severity)) throw new Error(`AUDIT_SEVERITY_INVALID:${id}`);
  return Object.freeze({ id, title, result, severity, mandatory: Boolean(mandatory), metric,
    rule: String(rule || ''), evidence: evidence(items), notes: String(notes || '') });
}

export function textFiles(context, prefixes = ['www/', 'build-overrides/', 'scripts/', 'tests/', 'docs/', 'verification/']) {
  return context.files.filter(file => prefixes.some(prefix => file.startsWith(prefix)))
    .filter(file => /\.(?:html?|css|js|mjs|cjs|json|md|java|xml|gradle|properties|txt)$/i.test(file));
}

export function extractTagAssets(html) {
  const assets = [];
  for (const match of html.matchAll(/<(script|link)\b[^>]*?\b(?:src|href)\s*=\s*(["'])([^"']+)\2[^>]*>/gi)) {
    assets.push({ tag: match[1].toLowerCase(), value: match[3], offset: match.index });
  }
  return assets;
}

export function buildContext(root) {
  const resolved = path.resolve(root);
  const files = trackedFiles(resolved);
  const manifest = parseManifest(resolved);
  const modules = manifest.modules.map(item => {
    const file = `www/${posix(item.src)}`;
    return { ...item, file, html: readText(resolved, file) };
  });
  const productFiles = files.filter(isProductPath);
  return Object.freeze({
    root: resolved,
    files,
    productFiles,
    manifest,
    modules,
    sharedAssets: manifest.sharedAssets,
    head: runGit(resolved, ['rev-parse', 'HEAD']),
    status: runGit(resolved, ['status', '--porcelain']),
    trackedFingerprint: revisionFingerprint(resolved, files),
    worktreeFingerprint: fingerprint(resolved, files),
    productFingerprint: revisionFingerprint(resolved, productFiles),
    read: file => readText(resolved, file),
    exists: file => exists(resolved, file)
  });
}

export function auditResult(id, title, checks, metrics = {}) {
  return Object.freeze({ auditId: id, title, checks: [...checks].sort((a, b) => a.id.localeCompare(b.id)), metrics });
}

