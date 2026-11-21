import { compareText, posix, sha256 } from './lib.mjs';

const MAX_DEPTH = 20;
const MAX_ARRAY_ITEMS = 6000;
const MAX_OBJECT_KEYS = 2000;
const MAX_STRING_LENGTH = 4096;
const MAX_JSON_BYTES = 8 * 1024 * 1024;

function canonicalize(value, state, trail, depth) {
  if (depth > MAX_DEPTH) throw new Error('AUDIT_EVIDENCE_DEPTH_EXCEEDED');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('AUDIT_EVIDENCE_NUMBER_INVALID');
    return value;
  }
  if (typeof value === 'string') {
    if (value.length > MAX_STRING_LENGTH) throw new Error('AUDIT_EVIDENCE_STRING_EXCEEDED');
    if (value.includes('\0')) throw new Error('AUDIT_EVIDENCE_CONTROL_CHARACTER');
    const normalized = posix(value).toLowerCase();
    if (state.forbiddenRoots.some(root => normalized.includes(root))) {
      throw new Error('AUDIT_EVIDENCE_LOCAL_PATH_FORBIDDEN');
    }
    if (/^[a-z]:[\\/]/i.test(value) || /^\\\\/.test(value) || /^\/(?!\/)/.test(value)) {
      throw new Error('AUDIT_EVIDENCE_ABSOLUTE_PATH_FORBIDDEN');
    }
    return value;
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_ITEMS) throw new Error('AUDIT_EVIDENCE_ARRAY_EXCEEDED');
    return value.map((item, index) => canonicalize(item, state, `${trail}[${index}]`, depth + 1));
  }
  if (!value || typeof value !== 'object' || Object.getPrototypeOf(value) !== Object.prototype) {
    throw new Error('AUDIT_EVIDENCE_TYPE_FORBIDDEN');
  }
  if (state.seen.has(value)) throw new Error('AUDIT_EVIDENCE_CYCLE');
  state.seen.add(value);
  const keys = Object.keys(value).filter(key => value[key] !== undefined).sort(compareText);
  if (keys.length > MAX_OBJECT_KEYS) throw new Error('AUDIT_EVIDENCE_OBJECT_EXCEEDED');
  const result = {};
  for (const key of keys) {
    if (key.length > 160 || /[\r\n\0]/.test(key)) throw new Error('AUDIT_EVIDENCE_KEY_INVALID');
    result[key] = canonicalize(value[key], state, trail ? `${trail}.${key}` : key, depth + 1);
  }
  state.seen.delete(value);
  return result;
}

export function safeJson(value, options = {}) {
  const forbiddenRoots = (options.forbiddenRoots || []).filter(Boolean)
    .map(root => posix(root).toLowerCase()).sort(compareText);
  const canonical = canonicalize(value, { forbiddenRoots, seen: new WeakSet() }, '', 0);
  const json = `${JSON.stringify(canonical, null, 2)}\n`;
  if (Buffer.byteLength(json, 'utf8') > MAX_JSON_BYTES) throw new Error('AUDIT_EVIDENCE_FILE_EXCEEDED');
  return json;
}

export function canonicalSha256(value, options = {}) {
  return sha256(safeJson(value, options));
}

export function safeError(error) {
  const message = String(error && error.message || 'AUDIT_INTERNAL_ERROR');
  const code = (/^AUDIT_[A-Z0-9_]+/.exec(message) || [])[0] || 'AUDIT_INTERNAL_ERROR';
  return { code, fingerprint: sha256(message).slice(0, 20) };
}

export const EVIDENCE_LIMITS = Object.freeze({
  maxDepth: MAX_DEPTH,
  maxArrayItems: MAX_ARRAY_ITEMS,
  maxObjectKeys: MAX_OBJECT_KEYS,
  maxStringLength: MAX_STRING_LENGTH,
  maxJsonBytes: MAX_JSON_BYTES
});
