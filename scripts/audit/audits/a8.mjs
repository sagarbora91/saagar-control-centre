import fs from 'node:fs';
import path from 'node:path';

import { auditResult, lineNumber, makeCheck, sha256, stableSha256 } from '../lib.mjs';
import { ALLOWED_REMOTE_LITERAL_CONTEXTS } from '../config.mjs';
import { conservativeStaticResult, staticDiscoveryAuthority, staticDiscoveryEvidence,
  trackedSecretScanAuthority } from '../runner-support.mjs';

const VENDOR_PATH = /(?:^|\/)(?:vendor|vendors|third[-_]?party|libs?|node_modules)(?:\/|$)|(?:\.min\.(?:js|css)$|bundle\.min\.js$|html2pdf|jspdf|fflate|read-excel-file|sql-wasm\.js$)/i;
const PII_IDENTIFIER = /\b(?:customer(?:Name|Mobile|Phone|Email|Address)?|cust(?:Name|Mobile|Phone)?|employee(?:Name|Mobile|Phone|Email|Address)?|staff(?:Name|Mobile|Phone)?|mobile(?:Number)?|phone(?:Number)?|email(?:Address)?|postalAddress|homeAddress|salary|payslip|bankAccount|accountNumber|aadhaar|panNumber|ownerPin|adminPin|staffPin|photoData|imageData)\b/i;
const MAX_SECRET_FILES = 20_000;
const MAX_SECRET_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SECRET_TOTAL_BYTES = 128 * 1024 * 1024;
const MAX_SECRET_FINDINGS = 500;

function runtimeFiles(context) {
  return context.productFiles
    .filter(file => /^(?:www|build-overrides|android\/app\/src\/main)\/.+\.(?:html?|css|js|mjs|java|xml)$/i.test(file))
    .filter(file => !VENDOR_PATH.test(file))
    .sort();
}

function balancedEnd(source, open, opening = '(', closing = ')') {
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = open; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if (char === opening) depth += 1;
    else if (char === closing && --depth === 0) return index + 1;
  }
  return -1;
}

function functionSpans(source) {
  const structural = withoutBlockComments(source);
  const patterns = [
    /\b([A-Za-z_$][\w$]*)\s*(?::|=)\s*(?:async\s+)?function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{/g,
    /\b(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g,
    /\b([A-Za-z_$][\w$]*)\s*(?::|=)\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g,
    /\b(?:async\s+)?([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g
  ];
  const rows = [];
  const seen = new Set();
  for (const pattern of patterns) for (const match of structural.matchAll(pattern)) {
    const reserved = new Set(['if', 'for', 'while', 'switch', 'catch', 'with', 'function']);
    const open = match.index + match[0].lastIndexOf('{');
    if (reserved.has(match[1])) continue;
    if (seen.has(open)) continue;
    seen.add(open);
    const end = balancedEnd(structural, open, '{', '}');
    rows.push({ name: match[1], start: match.index, open, end,
      body: end > open ? source.slice(match.index, end) : '', resolved: end > open });
  }
  return rows.sort((left, right) => left.start - right.start || right.end - left.end);
}

function enclosingFunction(spans, offset) {
  return spans.filter(row => row.resolved && row.start <= offset && row.end > offset)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start))[0] || null;
}

/* Every enclosing scope, innermost first. */
function enclosingChain(spans, offset) {
  return spans.filter(row => row.resolved && row.start <= offset && row.end > offset)
    .sort((left, right) => (left.end - left.start) - (right.end - right.start));
}

/* A delivery guard in ANY enclosing scope, not only the innermost one.
   A sink inside a callback - .catch(function(e){ downloadFallback(opts); }) -
   is still downstream of a guard executed earlier in the function that built
   that callback, because the callback cannot run unless the guarded function
   got past its own guard first. Checking only the innermost scope judged the
   anonymous callback, which has no guard of its own, and reported a guarded
   delivery path as a bypass. The guard must still appear BEFORE the sink within
   whichever scope carries it, so this proves the ordering rather than assuming
   it, and an unguarded ancestor chain still fails closed. */
function scopeChainGuarded(spans, offset, aliases) {
  for (const scope of enclosingChain(spans, offset)) {
    if (hasOwnerScopeFailClosedDeliveryGuard(scope.body, offset - scope.start, aliases)) return true;
  }
  return false;
}

function callText(source, offset) {
  const open = source.indexOf('(', offset);
  if (open < 0 || open - offset > 160) return source.slice(offset, offset + 600);
  const end = balancedEnd(source, open);
  return source.slice(offset, end > open ? end : Math.min(source.length, offset + 600));
}

function codeOnly(source) {
  return String(source).replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length))
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(/^\s*\/\/.*$/gm, match => ' '.repeat(match.length))
    .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, match => ' '.repeat(match.length));
}

function withoutBlockComments(source) {
  return String(source).replace(/<!--[\s\S]*?-->/g, match => ' '.repeat(match.length))
    .replace(/\/\*[\s\S]*?\*\//g, match => ' '.repeat(match.length))
    .replace(/^\s*\/\/.*$/gm, match => ' '.repeat(match.length));
}

function moduleFallbackIsShellBound(body) {
  return /(?:window\.)?parent\s*&&\s*(?:window\.)?parent\s*!==\s*window/.test(body) &&
    /parent\s*\.\s*postMessage\s*\(/.test(body) && /postMessage[\s\S]{0,500}\breturn\b/.test(body);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizedReference(value) {
  let text = String(value || '').trim().replace(/\?\./g, '.').replace(/\s+/g, '');
  text = text.replace(/\.bind\([^)]*\)$/, '');
  text = text.replace(/\[\s*(["'])([A-Za-z_$][\w$]*)\1\s*\]/g, '.$2');
  while (/^\([^()]+\)$/.test(text)) text = text.slice(1, -1);
  return /^(?:[A-Za-z_$][\w$]*)(?:\.[A-Za-z_$][\w$]*)*$/.test(text) ? text : null;
}

function authControlName(value) {
  const name = String(value || '');
  const tokens = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .split(/[^A-Za-z0-9]+/).filter(Boolean).map(token => token.toLowerCase());
  const lower = name.toLowerCase();
  if (/(?:^|[^a-z])(?:auth|reauth|authori[sz](?:e|ation)?|authenticat(?:e|ion)?)(?:[^a-z]|$)/.test(lower) ||
      /(?:reauth|authori[sz]|authenticat)/.test(lower)) return true;
  if (tokens.some(token => ['passcode', 'permission', 'security', 'credential', 'unlock', 'login'].includes(token))) return true;
  if (tokens.includes('verify')) return true;
  if (tokens.includes('pin') && tokens.some(token =>
    ['check', 'verify', 'has', 'set', 'change', 'clear', 'prompt', 'record', 'lock', 'policy', 'attempt', 'manage'].includes(token))) return true;
  if (tokens.includes('access') && tokens.some(token =>
    ['ensure', 'check', 'has', 'grant', 'allow', 'deny', 'set', 'manage'].includes(token))) return true;
  return false;
}

function simpleAliases(source) {
  const safe = withoutBlockComments(source);
  const code = codeOnly(source);
  const aliases = new Map();
  for (const match of safe.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\r\n]+)/g)) {
    if (!/\S/.test(code[match.index] || '')) continue;
    const target = normalizedReference(match[2]);
    if (target) aliases.set(match[1], target);
  }
  for (const match of safe.matchAll(/\b(?:const|let|var)\s*\{\s*([A-Za-z_$][\w$]*)(?:\s*:\s*([A-Za-z_$][\w$]*))?\s*\}\s*=\s*([A-Za-z_$][\w$]*)/g)) {
    if (!/\S/.test(code[match.index] || '')) continue;
    aliases.set(match[2] || match[1], match[3] + '.' + match[1]);
  }
  for (let pass = 0; pass < aliases.size + 1; pass += 1) {
    let changed = false;
    for (const [name, target] of aliases) {
      const parts = target.split('.');
      const replacement = aliases.get(parts[0]);
      if (!replacement) continue;
      const resolved = [replacement, ...parts.slice(1)].join('.');
      if (resolved !== target) { aliases.set(name, resolved); changed = true; }
    }
    if (!changed) break;
  }
  return aliases;
}

function aliasIsReassigned(source, name) {
  const code = codeOnly(source);
  const pattern = new RegExp('\\b' + escapeRegExp(name) +
    '\\s*(?:\\+\\+|--|(?:\\+|-|\\*|\\/|%|&&|\\|\\||\\?\\?)?=)', 'g');
  for (const match of code.matchAll(pattern)) {
    const prefix = code.slice(Math.max(0, match.index - 40), match.index);
    if (/(?:const|let|var)\s+$/.test(prefix) && /=\s*$/.test(match[0])) continue;
    return true;
  }
  return false;
}

function guardNames(aliases) {
  const names = new Set(['beginDelivery', 'beginExport']);
  for (const [name, target] of aliases) {
    if (/(?:^|\.)(?:beginDelivery|beginExport)$/.test(target)) names.add(name);
  }
  return names;
}

function depthAt(code, start, end) {
  let depth = 0;
  for (let index = start; index < end; index += 1) {
    if (code[index] === '{') depth += 1;
    else if (code[index] === '}') depth -= 1;
  }
  return depth;
}

function hasTopLevelTerminal(block) {
  const code = codeOnly(block);
  for (const match of code.matchAll(/\b(?:return|throw)\b/g)) {
    if (depthAt(code, 0, match.index) === 0) return true;
  }
  return false;
}

/* Split on a logical operator at bracket depth 0 only, so a nested call such as
   `f(a || b)` is never split. */
function splitTopLevel(condition, operator) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < condition.length; index += 1) {
    const char = condition[index];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') depth -= 1;
    else if (depth === 0 && condition.startsWith(operator, index)) {
      parts.push(condition.slice(start, index));
      index += operator.length - 1;
      start = index + 1;
    }
  }
  parts.push(condition.slice(start));
  return parts;
}

function hasOwnerScopeFailClosedDeliveryGuard(body, sinkOffset, aliases = new Map()) {
  const prefix = body.slice(0, Math.max(0, sinkOffset));
  const code = codeOnly(prefix);
  const ownerOpen = code.indexOf('{');
  const aliasAlternation = [...guardNames(aliases)].map(escapeRegExp).join('|');
  const guardCall = '(?:(?:[A-Za-z_$][\\w$]*\\s*\\.\\s*)*(?:beginDelivery|beginExport)|(?:' +
    aliasAlternation + '))';
  for (const match of code.matchAll(/\bif\s*\(/g)) {
    if (ownerOpen < 0 || depthAt(code, ownerOpen + 1, match.index) !== 0) continue;
    const conditionOpen = prefix.indexOf('(', match.index);
    const conditionEnd = balancedEnd(prefix, conditionOpen);
    if (conditionEnd < 0) continue;
    const condition = codeOnly(prefix.slice(conditionOpen + 1, conditionEnd - 1));
    const guard = new RegExp('^\\s*!\\s*\\(?\\s*' + guardCall +
      '\\s*\\([^)]*\\)\\s*\\)?\\s*$');
    /* A compound OR guard counts. `if (!api || typeof api.beginDelivery !== 'function'
       || !api.beginDelivery(token)) { return blocked; }` is STRICTER than the bare
       `if (!beginDelivery(token))` this matcher used to require - it additionally
       refuses when the control is missing or is not callable - yet an anchored
       whole-condition match rejected it and reported a hardened delivery path as a
       bypass. With `||`, any true disjunct enters the blocking branch, so it is
       sufficient that ONE disjunct is the fail-closed guard call. AND-joined
       conditions are deliberately not accepted: there every term must be true to
       block, so a single guard disjunct would not prove fail-closed behaviour. */
    if (!splitTopLevel(condition, '||').some(part => guard.test(part))) continue;
    let cursor = conditionEnd;
    while (/\s/.test(prefix[cursor] || '')) cursor += 1;
    if (prefix[cursor] === '{') {
      const blockEnd = balancedEnd(prefix, cursor, '{', '}');
      if (blockEnd < 0) continue;
      if (hasTopLevelTerminal(prefix.slice(cursor + 1, blockEnd - 1))) return true;
      continue;
    }
    const statement = codeOnly(prefix.slice(cursor, Math.min(prefix.length, cursor + 240))).trimStart();
    if (/^(?:return|throw)\b/.test(statement)) return true;
  }
  return false;
}

function helperCallsitesControlled(file, source, spans, owner, aliases, sink) {
  if (!owner || !owner.name) return false;
  const names = new Set([owner.name]);
  for (const [name, target] of aliases) if (target === owner.name) names.add(name);
  const pattern = new RegExp('\\b(?:' + [...names].map(escapeRegExp).join('|') + ')\\s*(?:\\?\\.\\s*)?\\(', 'g');
  const calls = [];
  for (const match of source.matchAll(pattern)) {
    if (spans.some(span => span.name === owner.name && match.index >= span.start && match.index <= span.open)) continue;
    const caller = enclosingFunction(spans, match.index);
    if (!caller) { calls.push(false); continue; }
    calls.push(scopeChainGuarded(spans, match.index, aliases));
  }
  return calls.length > 0 && calls.every(Boolean);
}

function sinkIsControlled(file, source, spans, offset, sink, aliases) {
  const owner = enclosingFunction(spans, offset);
  if (!owner) return false;
  if (scopeChainGuarded(spans, offset, aliases)) return true;
  return helperCallsitesControlled(file, source, spans, owner, aliases, sink);
}

function piiSinkFindings(context) {
  const rules = [
    { id: 'CONSOLE', pattern: /\bconsole\s*\.\s*(?:log|info|warn|error|debug)\s*\(/g, controlled: false },
    { id: 'FETCH', pattern: /\bfetch\s*\(/g, controlled: false },
    { id: 'BEACON', pattern: /\bnavigator\s*\.\s*sendBeacon\s*\(/g, controlled: false },
    { id: 'BROWSER_SHARE', pattern: /\bnavigator\s*\.\s*share\s*\(/g, controlled: true },
    { id: 'NATIVE_SHARE', pattern: /\bShare\s*\.\s*share\s*\(/g, controlled: true }
  ];
  const rows = [];
  for (const file of runtimeFiles(context)) {
    const source = context.read(file);
    const spans = functionSpans(source);
    for (const rule of rules) for (const match of source.matchAll(rule.pattern)) {
      const call = callText(source, match.index);
      if (!PII_IDENTIFIER.test(codeOnly(call))) continue;
      if (rule.controlled && sinkIsControlled(file, source, spans, match.index)) continue;
      rows.push({ path: file, line: lineNumber(source, match.index), code: 'PII_TO_UNAPPROVED_SINK',
        sink: rule.id, flowFingerprint: sha256(call).slice(0, 20) });
    }
  }
  return rows.sort((left, right) => `${left.path}\0${left.line}\0${left.sink}`.localeCompare(`${right.path}\0${right.line}\0${right.sink}`));
}

export function exportBypasses(context) {
  const directRules = [
    { sink: 'ANCHOR_DOWNLOAD', pattern: /\.download\s*=/g },
    { sink: 'ANCHOR_DOWNLOAD', pattern: /\[\s*(["'])download\1\s*\]\s*=/g },
    { sink: 'BROWSER_SHARE', pattern: /\bnavigator\s*(?:\?\.|\.)\s*share\s*(?:\?\.\s*)?\(/g },
    { sink: 'NATIVE_SHARE', pattern: /(?:\.Plugins\s*(?:\?\.|\.)\s*|(?<![A-Za-z0-9_$]))Share\s*(?:\?\.|\.)\s*share\s*(?:\?\.\s*)?\(/g },
    { sink: 'PRINT', pattern: /\bwindow\s*(?:\?\.|\.)\s*print\s*(?:\?\.\s*)?\(/g },
    { sink: 'POPUP', pattern: /\bwindow\s*(?:\?\.|\.)\s*open\s*(?:\?\.\s*)?\(/g }
  ];
  const rows = [];
  const unresolved = [];
  for (const file of runtimeFiles(context).filter(value => /^www\//.test(value))) {
    const original = context.read(file);
    const source = withoutBlockComments(original);
    const spans = functionSpans(source);
    const aliases = simpleAliases(source);
    for (const [name, target] of [...aliases]) {
      if (!/(?:^|\.)(?:beginDelivery|beginExport|downloadText|navigator\.share|Share\.share|window\.(?:print|open))$/.test(target) ||
          !aliasIsReassigned(source, name)) continue;
      unresolved.push({ path: file, line: 1, code: 'EXPORT_POLICY_ALIAS_UNRESOLVED',
        aliasFingerprint: sha256(name).slice(0, 20) });
      aliases.delete(name);
    }
    const code = codeOnly(source);
    const rules = [...directRules];
    for (const [name, target] of aliases) {
      const sink = /(?:^|\.)navigator\.share$/.test(target) ? 'BROWSER_SHARE' :
        /(?:^|\.)Share\.share$/.test(target) ? 'NATIVE_SHARE' :
          /(?:^|\.)window\.print$/.test(target) ? 'PRINT' :
            /(?:^|\.)window\.open$/.test(target) ? 'POPUP' : null;
      if (sink) rules.push({ sink, pattern: new RegExp('\\b' + escapeRegExp(name) + '\\s*(?:\\?\\.\\s*)?\\(', 'g') });
    }
    for (const rule of rules) for (const match of source.matchAll(rule.pattern)) {
      if (!/\S/.test(code[match.index] || '')) continue;
      const owner = enclosingFunction(spans, match.index);
      if (sinkIsControlled(file, source, spans, match.index, rule.sink, aliases)) continue;
      rows.push({ path: file, line: lineNumber(original, match.index), code: 'EXPORT_POLICY_BYPASS',
        sink: rule.sink, function: owner ? owner.name : 'top-level' });
    }
    const helperNames = new Set(['downloadText']);
    for (const [name, target] of aliases) if (/(?:^|\.)downloadText$/.test(target)) helperNames.add(name);
    const helperPattern = new RegExp('\\b(?:' + [...helperNames].map(escapeRegExp).join('|') +
      ')\\s*(?:\\?\\.\\s*)?\\(', 'g');
    for (const match of source.matchAll(helperPattern)) {
      if (!/\S/.test(code[match.index] || '')) continue;
      const owner = enclosingFunction(spans, match.index);
      if (owner && owner.name === 'downloadText' && match.index <= owner.open) continue;
      if (sinkIsControlled(file, source, spans, match.index, 'DOWNLOAD_HELPER', aliases)) continue;
      rows.push({ path: file, line: lineNumber(original, match.index), code: 'EXPORT_POLICY_BYPASS',
        sink: 'DOWNLOAD_HELPER', function: owner ? owner.name : 'top-level' });
    }
  }
  const unique = new Map();
  for (const row of rows) unique.set(`${row.path}\0${row.line}\0${row.sink}`, row);
  return { findings: [...unique.values()].sort((left, right) => `${left.path}\0${left.line}\0${left.sink}`.localeCompare(`${right.path}\0${right.line}\0${right.sink}`)),
    unresolved: [...new Map(unresolved.map(row => [`${row.path}\0${row.line}\0${row.code}`, row])).values()] };
}

function catchBlocks(body) {
  const structural = withoutBlockComments(body);
  const rows = [];
  for (const match of structural.matchAll(/\bcatch\s*(?:\([^)]*\))?\s*\{/g)) {
    const open = match.index + match[0].lastIndexOf('{');
    const end = balancedEnd(structural, open, '{', '}');
    rows.push({ start: match.index, end, resolved: end > open,
      body: end > open ? body.slice(match.index, end) : '' });
  }
  for (const match of structural.matchAll(/\.catch\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*(?!\{)([^);\r\n]+)\s*\)/g)) {
    rows.push({ start: match.index, end: match.index + match[0].length, resolved: true,
      body: match[0], conciseExpression: match[1].trim() });
  }
  for (const match of structural.matchAll(/\.catch\s*\(\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)?\s*=>\s*\{/g)) {
    const open = match.index + match[0].lastIndexOf('{');
    const end = balancedEnd(structural, open, '{', '}');
    rows.push({ start: match.index, end, resolved: end > open,
      body: end > open ? body.slice(match.index, end) : '' });
  }
  for (const match of structural.matchAll(/\.catch\s*\(\s*function(?:\s+[A-Za-z_$][\w$]*)?\s*\([^)]*\)\s*\{/g)) {
    const open = match.index + match[0].lastIndexOf('{');
    const end = balancedEnd(structural, open, '{', '}');
    rows.push({ start: match.index, end, resolved: end > open,
      body: end > open ? body.slice(match.index, end) : '' });
  }
  return rows;
}

function authCatchOutcome(caught) {
  if (caught.conciseExpression !== undefined) {
    const expression = caught.conciseExpression.trim();
    return authReturnOutcome(expression);
  }
  const open = caught.body.indexOf('{');
  const close = caught.body.lastIndexOf('}');
  if (open < 0 || close <= open) return 'unknown';
  const inner = caught.body.slice(open + 1, close);
  const code = codeOnly(inner);
  if (/\bresolve\s*\(\s*\{[\s\S]*\b(?:ok|allowed|authorized|authenticated|verified|granted)\s*:\s*false\b/i.test(code)) return 'deny';
  const outcomes = [];
  let hasOwnerTerminal = false;
  for (const match of code.matchAll(/\b(?:return|throw)\b/g)) {
    const keyword = match[0];
    if (depthAt(code, 0, match.index) === 0) hasOwnerTerminal = true;
    if (keyword === 'throw') { outcomes.push('deny'); continue; }
    const expression = inner.slice(match.index + keyword.length).split(/[;\r\n}]/, 1)[0].trim();
    outcomes.push(authReturnOutcome(expression));
  }
  if (outcomes.includes('allow')) return 'allow';
  if (!outcomes.length && !hasOwnerTerminal) return 'continue';
  if (!outcomes.length || outcomes.includes('unknown') || !hasOwnerTerminal) return 'unknown';
  return 'deny';
}

function authReturnOutcome(expression) {
  const value = String(expression || '').trim();
  if (!value) return 'deny';
  if (/^(?:false|null|undefined|void\b|0(?:\.0+)?\b|Promise\.reject\s*\()/i.test(value)) return 'deny';
  if (/^(?:deny|reject|refuse|block)\s*\(/i.test(value)) return 'deny';
  if (/^\{[\s\S]*\b(?:ok|allowed|authorized|authenticated|verified|granted)\s*:\s*false\b/i.test(value)) return 'deny';
  if (/^(?:true\b|Promise\.resolve\s*\(\s*true\s*\)|[1-9]\d*(?:\.\d+)?\b|["'][^"']+["']|\[|\{|new\b)/i.test(value)) return 'allow';
  return 'unknown';
}

export function authFailOpenPaths(context) {
  const findings = [];
  const unresolved = [];
  for (const file of runtimeFiles(context)) {
    const source = context.read(file);
    const spans = functionSpans(source);
    const relevant = spans.filter(row => authControlName(row.name));
    const boundNames = new Set(relevant.map(row => row.name));
    for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([^;\r\n]{0,160})/g)) {
      if (!authControlName(match[1])) continue;
      if (/^\s*\{/.test(match[2])) continue;
      if (!/(?:\bfunction\b|=>|\b[A-Za-z_$][\w$]*(?:factory|policy|guard|gate)\s*\()/i.test(match[2])) continue;
      if (!boundNames.has(match[1])) unresolved.push({ path: file, line: lineNumber(source, match.index),
        code: 'AUTH_CONTROL_STATIC_ANALYSIS_UNRESOLVED', function: match[1] });
    }
    for (const match of source.matchAll(/\[\s*([^\]\r\n]{1,160})\s*\]\s*\([^)]*\)\s*\{/g)) {
      if (!authControlName(match[1])) continue;
      unresolved.push({ path: file, line: lineNumber(source, match.index),
        code: 'AUTH_CONTROL_STATIC_ANALYSIS_UNRESOLVED', function: 'computed-auth-method',
        expressionFingerprint: sha256(match[1]).slice(0, 20) });
    }
    for (const candidate of relevant) {
      if (!candidate.resolved) {
        unresolved.push({ path: file, line: lineNumber(source, candidate.start),
          code: 'AUTH_CONTROL_STATIC_ANALYSIS_UNRESOLVED', function: candidate.name });
        continue;
      }
      for (const failure of candidate.body.matchAll(/if\s*\(\s*!\s*(?:has[A-Za-z0-9_$]*Pin|[A-Za-z0-9_$.]*(?:auth|policy|guard|gate))\s*\([^)]*\)\s*\)\s*(?:\{\s*)?return\s+true\b/gi)) {
        findings.push({ path: file, line: lineNumber(source, candidate.start + failure.index),
          code: 'AUTH_FAIL_OPEN_ABSENT_CONTROL', function: candidate.name });
      }
      const catches = catchBlocks(candidate.body);
      const structuralBody = withoutBlockComments(candidate.body);
      if (/\bcatch\b|\.catch\s*\(/.test(structuralBody) && catches.length === 0) {
        unresolved.push({ path: file, line: lineNumber(source, candidate.start),
          code: 'AUTH_EXCEPTION_PATH_UNRESOLVED', function: candidate.name });
      }
      for (const caught of catches) {
        if (!caught.resolved) {
          unresolved.push({ path: file, line: lineNumber(source, candidate.start + caught.start),
            code: 'AUTH_EXCEPTION_PATH_UNRESOLVED', function: candidate.name });
        } else if (authCatchOutcome(caught) === 'allow') {
          findings.push({ path: file, line: lineNumber(source, candidate.start + caught.start),
            code: 'AUTH_FAIL_OPEN_EXCEPTION', function: candidate.name });
        } else if (authCatchOutcome(caught) === 'unknown') {
          unresolved.push({ path: file, line: lineNumber(source, candidate.start + caught.start),
            code: 'AUTH_EXCEPTION_PATH_UNRESOLVED', function: candidate.name });
        }
      }
    }
  }
  const dedupe = rows => [...new Map(rows.map(row => [`${row.path}\0${row.line}\0${row.code}\0${row.function}`, row])).values()]
    .sort((left, right) => `${left.path}\0${left.line}\0${left.code}`.localeCompare(`${right.path}\0${right.line}\0${right.code}`));
  return { findings: dedupe(findings), unresolved: dedupe(unresolved) };
}

function inside(candidate, root) {
  const relative = path.relative(path.resolve(root), path.resolve(candidate));
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

function probablyText(bytes) {
  const sample = bytes.subarray(0, Math.min(bytes.length, 8192));
  if (sample.includes(0)) return false;
  let controls = 0;
  for (const value of sample) if (value < 9 || (value > 13 && value < 32)) controls += 1;
  return sample.length === 0 || controls / sample.length < 0.05;
}

function trackedFileBytes(context, file) {
  if (context.root) {
    const resolved = path.resolve(context.root, file);
    if (!inside(resolved, context.root)) return { kind: 'unresolved', code: 'SECRET_SCAN_PATH_INVALID' };
    const stat = fs.lstatSync(resolved, { throwIfNoEntry: false });
    if (stat?.isSymbolicLink()) return { kind: 'unresolved', code: 'SECRET_SCAN_SYMLINK_UNRESOLVED' };
    if (stat?.isFile()) {
      if (stat.size > MAX_SECRET_FILE_BYTES) {
        const descriptor = fs.openSync(resolved, 'r');
        try {
          const sample = Buffer.alloc(Math.min(8192, stat.size));
          fs.readSync(descriptor, sample, 0, sample.length, 0);
          return probablyText(sample) ? { kind: 'unresolved', code: 'SECRET_SCAN_FILE_LIMIT' } : { kind: 'binary' };
        } finally { fs.closeSync(descriptor); }
      }
      const bytes = fs.readFileSync(resolved);
      return probablyText(bytes) ? { kind: 'text', bytes } : { kind: 'binary' };
    }
  }
  try {
    const bytes = Buffer.from(String(context.read(file)), 'utf8');
    if (bytes.length > MAX_SECRET_FILE_BYTES) return { kind: 'unresolved', code: 'SECRET_SCAN_FILE_LIMIT' };
    return probablyText(bytes) ? { kind: 'text', bytes } : { kind: 'binary' };
  } catch (_) { return { kind: 'unresolved', code: 'SECRET_SCAN_READ_FAILED' }; }
}

function assignedSecretValue(candidate) {
  const value = String(candidate || '');
  if (!value || /^(?:process\.env|System\.getenv|env\.|secrets\.|vars\.|example|sample|changeme|replace|placeholder|undefined|null)/i.test(value) ||
      /\$\{\{|<[^>]+>/.test(value)) return null;
  return value;
}

function secretAssignmentFile(file) {
  const normalized = String(file).replaceAll('\\', '/');
  return /^\.github\/.*\.(?:ya?ml|json|toml|ini|conf|cfg|properties)$/i.test(normalized) ||
    /^[^/]+\.(?:ya?ml|json|toml|ini|conf|cfg|properties|env)$/i.test(normalized) ||
    /^(?:\.env|\.npmrc|\.yarnrc)$/i.test(normalized);
}
function secretFindings(context) {
  const findings = [];
  const unresolved = [];
  let scannedTextFiles = 0;
  let binaryFilesSkipped = 0;
  let scannedBytes = 0;
  const sensitiveFile = /(?:^|\/)(?:\.env)(?!\.example$)|\.(?:jks|keystore|p12|pfx|pem|key)$/i;
  const files = [...context.files].sort();
  if (files.length > MAX_SECRET_FILES) unresolved.push({ code: 'SECRET_SCAN_FILE_COUNT_LIMIT', trackedFiles: files.length });
  const rules = [
    { id: 'PRIVATE_KEY', pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
    { id: 'AWS_ACCESS_KEY', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
    { id: 'GITHUB_TOKEN', pattern: /\bgh[oprsu]_[A-Za-z0-9_]{30,}\b/g },
    { id: 'GOOGLE_API_KEY', pattern: /\bAIza[0-9A-Za-z_-]{30,}\b/g },
    { id: 'SLACK_TOKEN', pattern: /\bxox[baprs]-[0-9A-Za-z-]{20,}\b/g },
    { id: 'STRIPE_LIVE_KEY', pattern: /\bsk_live_[0-9A-Za-z]{16,}\b/g },
    { id: 'BASIC_AUTH_URL', pattern: /https?:\/\/[^\s/@:'"]+:[^\s/@'"]+@[^\s/'"]+/g },
    { id: 'ASSIGNED_SECRET_JSON', pattern: /(?:^|[,{]\s*)["'](?:[A-Za-z0-9_.-]*(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|private[_-]?key)[A-Za-z0-9_.-]*)["']\s*:\s*(["'])((?:\\.|(?!\1)[^\r\n]){12,}?)\1/gim,
      valueGroup: 2, configOnly: true },
    { id: 'ASSIGNED_SECRET', pattern: /(?:^|[\s{,])["']?(?:[A-Za-z0-9_.-]*(?:password|passwd|api[_-]?key|client[_-]?secret|access[_-]?token|private[_-]?key)[A-Za-z0-9_.-]*)["']?\s*[:=]\s*["']?([^\s#,}"']{12,})["']?/gim,
      valueGroup: 1, configOnly: true }
  ];
  for (const file of files.slice(0, MAX_SECRET_FILES)) {
    if (sensitiveFile.test(file)) findings.push({ path: file, line: 1, code: 'TRACKED_SECRET_BEARING_FILE',
      ruleId: 'SECRET_FILE_EXTENSION', fingerprint: sha256(file).slice(0, 20) });
    const captured = trackedFileBytes(context, file);
    if (captured.kind === 'binary') { binaryFilesSkipped += 1; continue; }
    if (captured.kind !== 'text') { unresolved.push({ path: file, code: captured.code }); continue; }
    if (scannedBytes + captured.bytes.length > MAX_SECRET_TOTAL_BYTES) {
      unresolved.push({ path: file, code: 'SECRET_SCAN_TOTAL_BYTE_LIMIT' });
      continue;
    }
    scannedBytes += captured.bytes.length;
    scannedTextFiles += 1;
    const source = captured.bytes.toString('utf8');
    for (const rule of rules) for (const match of source.matchAll(rule.pattern)) {
      if (rule.configOnly && !secretAssignmentFile(file)) continue;
      const secret = rule.valueGroup ? assignedSecretValue(match[rule.valueGroup]) : match[0];
      if (!secret) continue;
      if (findings.length >= MAX_SECRET_FINDINGS) {
        if (!unresolved.some(row => row.code === 'SECRET_SCAN_FINDING_LIMIT')) unresolved.push({ code: 'SECRET_SCAN_FINDING_LIMIT' });
        break;
      }
      findings.push({ path: file, line: lineNumber(source, match.index), code: 'VERIFIED_SECRET_PATTERN',
        ruleId: rule.id, fingerprint: sha256(secret).slice(0, 20) });
    }
  }
  const unique = new Map();
  for (const row of findings) unique.set(`${row.path}\0${row.line}\0${row.ruleId}\0${row.fingerprint}`, row);
  return { findings: [...unique.values()].sort((left, right) => `${left.path}\0${left.line}\0${left.ruleId}`.localeCompare(`${right.path}\0${right.line}\0${right.ruleId}`)),
    unresolved: unresolved.slice(0, 200), scannedTextFiles, binaryFilesSkipped, scannedBytes };
}

function splitArguments(source, open) {
  const end = balancedEnd(source, open);
  if (end < 0) return null;
  const body = source.slice(open + 1, end - 1);
  const args = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < body.length; index += 1) {
    const char = body[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if (char === ',' && depth === 0) { args.push(body.slice(start, index).trim()); start = index + 1; }
  }
  args.push(body.slice(start).trim());
  return args;
}

function literal(expression) {
  const value = String(expression || '').trim();
  const match = value.match(/^(['"])([\s\S]*)\1$/);
  if (match && !/\\/.test(match[2])) return match[2];
  const template = value.match(/^`([^$`]*)`$/);
  return template ? template[1] : null;
}

function allowedRemote(url) {
  const value = String(url || '').toLowerCase();
  return ALLOWED_REMOTE_LITERAL_CONTEXTS.some(prefix => value.startsWith(prefix.toLowerCase())) ||
    /^https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/|$)/i.test(value);
}

function remoteAliasContract(target) {
  const value = String(target || '').replace(/^(?:window|globalThis|self)\./, '');
  if (value === 'fetch') return { kind: 'FETCH', argument: 0, construct: false };
  if (value === 'WebSocket' || value === 'EventSource') return { kind: 'WEBSOCKET', argument: 0, construct: true };
  if (/(?:^|\.)navigator\.sendBeacon$/.test(target) || value === 'sendBeacon') {
    return { kind: 'BEACON', argument: 0, construct: false };
  }
  if (/(?:^|\.)window\.open$/.test(target) || value === 'open') {
    return { kind: 'NAVIGATION', argument: 0, construct: false };
  }
  if (/(?:^|\.)location\.(?:assign|replace)$/.test(target)) {
    return { kind: 'NAVIGATION', argument: 0, construct: false };
  }
  if (/(?:^|\.)postMessage$/.test(target)) return { kind: 'MESSAGE', argument: 1, construct: false };
  return null;
}

function structurallyApprovedDynamicTarget(file, source, offset, kind, expression, spans) {
  const value = String(expression || '').trim().replace(/\s+/g, '');
  if (kind === 'MESSAGE') {
    if (!value) return true; // Worker/MessagePort postMessage has no origin argument.
    if (/^(?:TARGET_ORIGIN|origin|targetOrigin|SaagarModuleRuntime\.targetOrigin)$/.test(value)) return true;
    const call = source.slice(Math.max(0, offset - 80), Math.min(source.length, offset + 120));
    if (/\b(?:worker|port)\s*\.\s*postMessage\s*\(/.test(call)) return true;
  }
  if (kind === 'NAVIGATION') {
    if (/^URL\.createObjectURL\(/.test(value)) return true;
    if ((file === 'www/module-manifest.js' && value === 'src') ||
        (file === 'www/shared/shell-module-frame-controller.js' && value === 'mod.src') ||
        (file === 'www/modules/expense/index.html' && value === 'r.result')) return true;
    const owner = enclosingFunction(spans, offset);
    if (owner && owner.name === 'openControlledWhatsApp' && /String\(url\|\|['"]{2}\)/.test(value)) {
      const prefix = withoutBlockComments(owner.body.slice(0, Math.max(0, offset - owner.start)));
      if (/if\s*\(\s*!\s*\/\^https:\\\/\\\/wa\\\.me\\\/\/[a-z]*\.test\(url\)\s*\)\s*\{[\s\S]*?return\s+false\s*;/i.test(prefix)) return true;
    }
  }
  return false;
}

function recordRemoteTarget(findings, unresolved, file, original, offset, kind, expression, spans = []) {
  const target = literal(expression);
  if (target === null) {
    if (structurallyApprovedDynamicTarget(file, original, offset, kind, expression, spans)) return;
    unresolved.push({ path: file, line: lineNumber(original, offset), code: 'DYNAMIC_REMOTE_TARGET_UNRESOLVED',
      kind, expressionFingerprint: sha256(String(expression || 'unavailable')).slice(0, 20) });
  } else if (kind === 'MESSAGE') {
    if (target === '*' || (/^https?:\/\//i.test(target) && !allowedRemote(target))) {
      findings.push({ path: file, line: lineNumber(original, offset), code: 'UNAPPROVED_REMOTE_RUNTIME',
        kind, scheme: target === '*' ? 'wildcard' : target.split(':', 1)[0].toLowerCase(),
        urlFingerprint: sha256(target).slice(0, 20) });
    }
  } else if (/^https?:\/\//i.test(target) && !allowedRemote(target)) {
    findings.push({ path: file, line: lineNumber(original, offset), code: 'UNAPPROVED_REMOTE_RUNTIME',
      kind, scheme: target.split(':', 1)[0].toLowerCase(), urlFingerprint: sha256(target).slice(0, 20) });
  }
}

export function remoteFindings(context) {
  const findings = [];
  const unresolved = [];
  const calls = [
    { kind: 'FETCH', pattern: /\bfetch\s*(?:\?\.\s*)?\(/g, argument: 0 },
    { kind: 'FETCH', pattern: /\b(?:window|globalThis|self)\s*(?:\?\.|\.)\s*fetch\s*(?:\?\.\s*)?\(/g, argument: 0 },
    { kind: 'WEBSOCKET', pattern: /\bnew\s+(?:WebSocket|EventSource)\s*\(/g, argument: 0 },
    { kind: 'BEACON', pattern: /\b(?:navigator\s*(?:\?\.|\.)\s*)?sendBeacon\s*(?:\?\.\s*)?\(/g, argument: 0 },
    { kind: 'NAVIGATION', pattern: /\bwindow\s*(?:\?\.|\.)\s*open\s*(?:\?\.\s*)?\(/g, argument: 0 },
    { kind: 'NAVIGATION', pattern: /\b(?:window\s*(?:\?\.|\.)\s*)?location\s*(?:\?\.|\.)\s*(?:assign|replace)\s*(?:\?\.\s*)?\(/g, argument: 0 },
    { kind: 'MESSAGE', pattern: /\bpostMessage\s*(?:\?\.\s*)?\(/g, argument: 1 },
    { kind: 'DECLARATIVE_NAVIGATION', pattern: /\.setAttribute\s*\(\s*(["'])(?:href|src|action|formaction)\1\s*,/gi, argument: 1 }
  ];
  const literalAssets = [
    { kind: 'DECLARATIVE_NAVIGATION', pattern: /<[A-Za-z][^>]*?\b(?:src|href|action|formaction)\s*=\s*(['"])(https?:\/\/[^'"]+)\1/gi, group: 2 },
    { kind: 'CSS_URL', pattern: /\burl\s*\(\s*(['"]?)(https?:\/\/[^)'"\s]+)\1\s*\)/gi, group: 2 }
  ];
  for (const file of runtimeFiles(context)) {
    const original = context.read(file);
    const source = withoutBlockComments(original);
    const code = codeOnly(source);
    const spans = functionSpans(source);
    const effectiveCalls = [...calls];
    for (const match of source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*new\s+XMLHttpRequest\b/g)) {
      effectiveCalls.push({ kind: 'XHR', argument: 1,
        pattern: new RegExp('\\b' + escapeRegExp(match[1]) + '\\s*\\.\\s*open\\s*\\(', 'g') });
    }
    for (const [name, target] of simpleAliases(source)) {
      const contract = remoteAliasContract(target);
      if (!contract) continue;
      effectiveCalls.push({ kind: contract.kind, argument: contract.argument,
        pattern: new RegExp((contract.construct ? '\\bnew\\s+' : '\\b') + escapeRegExp(name) +
          '\\s*(?:\\?\\.\\s*)?\\(', 'g') });
    }
    for (const rule of literalAssets) for (const match of source.matchAll(rule.pattern)) {
      const url = match[rule.group];
      if (allowedRemote(url)) continue;
      findings.push({ path: file, line: lineNumber(original, match.index), code: 'UNAPPROVED_REMOTE_RUNTIME',
        kind: rule.kind, scheme: String(url).split(':', 1)[0].toLowerCase(), urlFingerprint: sha256(url).slice(0, 20) });
    }
    for (const rule of effectiveCalls) for (const match of source.matchAll(rule.pattern)) {
      if (!/\S/.test(code[match.index] || '')) continue;
      const open = source.indexOf('(', match.index);
      const args = splitArguments(source, open);
      const expression = args && args[rule.argument];
      recordRemoteTarget(findings, unresolved, file, original, match.index, rule.kind, expression, spans);
    }
    for (const match of source.matchAll(/\b(?:window|globalThis|self|navigator|location)\s*(?:\?\.\s*)?\[\s*([^\]\r\n]{1,160})\s*\]\s*(?:\?\.\s*)?\(/g)) {
      if (!/\S/.test(code[match.index] || '')) continue;
      const member = literal(match[1]);
      const root = /^\s*([A-Za-z_$][\w$]*)/.exec(match[0])?.[1] || '';
      const contract = member && remoteAliasContract(root + '.' + member);
      if (!contract) {
        unresolved.push({ path: file, line: lineNumber(original, match.index),
          code: 'DYNAMIC_REMOTE_API_UNRESOLVED', kind: 'REMOTE_API',
          expressionFingerprint: sha256(match[1]).slice(0, 20) });
        continue;
      }
      const open = source.indexOf('(', match.index);
      const args = splitArguments(source, open);
      recordRemoteTarget(findings, unresolved, file, original, match.index, contract.kind,
        args && args[contract.argument], spans);
    }
    const assignments = [
      /\b(?:window\s*(?:\?\.|\.)\s*)?location(?:\s*(?:\?\.|\.)\s*href)?\s*(?:\+|\|\||&&|\?\?)?=(?!=)\s*([^;\r\n]+)/g,
      /\b[A-Za-z_$][\w$]*(?:\s*(?:\?\.|\.)\s*)(?:href|src|action|formAction)\s*(?:\+|\|\||&&|\?\?)?=(?!=)\s*([^;\r\n]+)/g,
      /\b[A-Za-z_$][\w$]*\s*\[\s*(["'])(?:href|src|action|formAction)\1\s*\]\s*(?:\+|\|\||&&|\?\?)?=(?!=)\s*([^;\r\n]+)/g
    ];
    for (const pattern of assignments) for (const match of source.matchAll(pattern)) {
      if (!/\S/.test(code[match.index] || '')) continue;
      const expression = match[2] === undefined ? match[1].trim() : match[2].trim();
      recordRemoteTarget(findings, unresolved, file, original, match.index, 'NAVIGATION', expression, spans);
    }
    for (const match of source.matchAll(/\b(?:window|globalThis|self|navigator|location)\s*(?:\?\.\s*)?\[\s*([^\]\r\n]{1,160})\s*\]\s*(?:\+|\|\||&&|\?\?)?=/g)) {
      if (!/\S/.test(code[match.index] || '')) continue;
      const member = literal(match[1]);
      if (member && !/^(?:href|src|action|formAction|location)$/i.test(member)) continue;
      const equals = match.index + match[0].lastIndexOf('=');
      const expression = source.slice(equals + 1).split(/[;\r\n]/, 1)[0].trim();
      if (!member) unresolved.push({ path: file, line: lineNumber(original, match.index),
        code: 'DYNAMIC_REMOTE_API_UNRESOLVED', kind: 'NAVIGATION',
        expressionFingerprint: sha256(match[1]).slice(0, 20) });
      else recordRemoteTarget(findings, unresolved, file, original, match.index, 'NAVIGATION', expression, spans);
    }
  }
  const dedupe = (rows, key) => [...new Map(rows.map(row => [key(row), row])).values()]
    .sort((left, right) => `${left.path}\0${left.line}\0${left.kind}`.localeCompare(`${right.path}\0${right.line}\0${right.kind}`));
  return { findings: dedupe(findings, row => `${row.path}\0${row.line}\0${row.kind}\0${row.urlFingerprint}`),
    unresolved: dedupe(unresolved, row => `${row.path}\0${row.line}\0${row.kind}\0${row.expressionFingerprint}`) };
}

export async function run(context) {
  const piiFlows = piiSinkFindings(context);
  const exportPaths = exportBypasses(context);
  const auth = authFailOpenPaths(context);
  const secrets = secretFindings(context);
  const remotes = remoteFindings(context);
  /* Closure addendum §3. A clean heuristic scan is not proof of safety: alias,
     reassignment, computed-property, regex-literal and control-flow variants can
     always extend the syntax surface. Absence therefore settles at 'unmeasured'
     unless an explicit complete discovery authority is supplied. Definite
     violations continue to fail. */
  const authority = staticDiscoveryAuthority(context);
  const secretAuthority = trackedSecretScanAuthority(context);
  const conservative = (findings, unresolved) => conservativeStaticResult({
    definiteViolations: findings.length, unresolved: unresolved.length, authority
  });
  const exportResult = conservative(exportPaths.findings, exportPaths.unresolved);
  const authResult = conservative(auth.findings, auth.unresolved);
  const piiResult = conservativeStaticResult({ definiteViolations: piiFlows.length,
    unresolved: 0, authority });
  const secretResult = conservativeStaticResult({ definiteViolations: secrets.findings.length,
    unresolved: secrets.unresolved.length, authority: secretAuthority });
  /* Remote targets are a fail-closed policy boundary. A syntactically present
     target that the scanner cannot validate is measurable non-compliance, not
     an absence-of-evidence gap: it may not ship as an approved remote path until
     it becomes a literal approved context or a structurally verified local
     target. Keep the detailed site set hash-bound while emitting one stable
     evidence row so comparison severity is not distorted by evidence-array size. */
  const remotePolicyRows = [...remotes.findings, ...remotes.unresolved];
  const remoteResult = remotePolicyRows.length ? 'fail' : conservative(remotes.findings, remotes.unresolved);
  const remoteEvidence = remotePolicyRows.length ? [{
    code: 'REMOTE_TARGET_POLICY_NOT_CLOSED',
    definiteRemoteCalls: remotes.findings.length,
    unresolvedDynamicTargets: remotes.unresolved.length,
    siteInventorySha256: stableSha256(remotePolicyRows)
  }] : staticDiscoveryEvidence(authority);

  const checks = [
    makeCheck({
      id: 'A8-01', title: 'PII flow to unapproved sinks', result: piiResult,
      severity: 'P0', mandatory: true,
      metric: { runtimeFiles: runtimeFiles(context).length, highConfidenceFlows: piiFlows.length,
        staticDiscoveryComplete: authority.complete, staticAbsenceIsProof: false },
      rule: 'A PII-bearing identifier must not reach console, network or direct share sinks outside an export-controlled delivery function.',
      evidence: piiFlows.length ? piiFlows : (authority.complete
        ? staticDiscoveryEvidence(authority)
        : [{ code: 'PII_FLOW_STATIC_ANALYSIS_INCOMPLETE' }]),
      notes: 'A definite static flow fails. Regex absence cannot prove end-to-end non-flow and remains unmeasured; evidence never includes values or call text.'
    }),
    makeCheck({
      id: 'A8-02', title: 'Export policy bypass', result: exportResult,
      severity: 'P0', mandatory: true,
      metric: { bypasses: exportPaths.findings.length, unresolvedPaths: exportPaths.unresolved.length,
        affectedFiles: new Set([...exportPaths.findings, ...exportPaths.unresolved].map(row => row.path)).size,
        staticDiscoveryComplete: authority.complete, staticAbsenceIsProof: false },
      rule: 'Every reachable download, print, popup, browser share or native share delivery must have a structural fail-closed begin-delivery guard, or be a helper whose every call site has that guard.',
      evidence: staticDiscoveryEvidence(authority, exportPaths.findings.length ? exportPaths.findings : exportPaths.unresolved),
      notes: exportResult === 'unmeasured' ? 'At least one delivery alias or path could not be resolved conservatively.' :
        'Names such as token, SaagarExportControl or beginDelivery do not authorize a sink unless the control is invoked and denial returns or throws before delivery.'
    }),
    makeCheck({
      id: 'A8-03', title: 'Fail-open authentication and PIN controls', result: authResult,
      severity: 'P0', mandatory: true,
      metric: { failOpenPaths: auth.findings.length, unresolvedPaths: auth.unresolved.length,
        affectedFunctions: new Set([...auth.findings, ...auth.unresolved].map(row => `${row.path}:${row.function}`)).size,
        staticDiscoveryComplete: authority.complete, staticAbsenceIsProof: false },
      rule: 'An authentication, authorization or PIN control must deny when its required control is absent or throws.',
      evidence: staticDiscoveryEvidence(authority, auth.findings.length ? auth.findings : auth.unresolved),
      notes: authResult === 'unmeasured' ? 'Relevant auth syntax could not be resolved conservatively; absence is not treated as pass.' : ''
    }),
    makeCheck({
      id: 'A8-04', title: 'Tracked secret scan', result: secretResult,
      severity: 'P0', mandatory: true,
      metric: { trackedFiles: context.files.length, scannedTextFiles: secrets.scannedTextFiles,
        scannedBytes: secrets.scannedBytes, binaryFilesSkipped: secrets.binaryFilesSkipped,
        verifiedSecretPatterns: secrets.findings.length, unresolvedFiles: secrets.unresolved.length,
        staticDiscoveryComplete: secretAuthority.complete, staticAbsenceIsProof: false },
      rule: 'Every tracked nonbinary text file must be bounded-scanned for private keys, secret-bearing files and high-confidence credential formats.',
      evidence: staticDiscoveryEvidence(secretAuthority, secrets.findings.length ? secrets.findings : secrets.unresolved),
      notes: 'The report emits only rule identifier, file, line and one-way fingerprint; suspected values are never emitted.'
    }),
    makeCheck({
      id: 'A8-05', title: 'Unapproved remote runtime behavior', result: remoteResult,
      severity: 'P0', mandatory: true,
      metric: { unapprovedRemoteCalls: remotes.findings.length, unresolvedDynamicTargets: remotes.unresolved.length,
        allowedLiteralPrefixes: ALLOWED_REMOTE_LITERAL_CONTEXTS.length,
        affectedFiles: new Set([...remotes.findings, ...remotes.unresolved].map(row => row.path)).size,
        staticDiscoveryComplete: authority.complete, staticAbsenceIsProof: false },
      rule: 'Shipped runtime must not contain a reachable literal external request, remote asset, navigation or message target outside approved contexts; dynamic targets must be resolved before pass.',
      evidence: remoteEvidence,
      notes: remotePolicyRows.length ? 'Every unresolved dynamic target is a fail-closed policy violation until it is structurally resolved.' :
        remoteResult === 'unmeasured' ? 'Complete static-discovery authority was not supplied.' :
        'Block comments, licence-only URLs, SVG namespaces, data/blob URLs, localhost and approved literals are excluded.'
    })
  ];

  return auditResult('A8', 'Security and privacy', checks, {
    piiFlowFindings: piiFlows.length,
    exportBypasses: exportPaths.findings.length,
    exportUnresolvedPaths: exportPaths.unresolved.length,
    authFailOpenPaths: auth.findings.length,
    authUnresolvedPaths: auth.unresolved.length,
    secretFindings: secrets.findings.length,
    secretScanUnresolved: secrets.unresolved.length,
    remoteFindings: remotes.findings.length,
    remoteUnresolved: remotes.unresolved.length
  });
}
