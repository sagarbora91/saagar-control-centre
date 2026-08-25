import { auditResult, lineNumber, makeCheck, sha256 } from '../lib.mjs';
import { renderedObservationSha256 } from '../capture-attestation.mjs';
import { baseEvidenceTrust, isHex64, RENDERED_RECORD_PREFIX } from '../evidence-contract.mjs';

const DESIGN_TOKENS = Object.freeze({
  '--navy': '#0d2340',
  '--navy-mid': '#1a3a5c',
  '--navy-light': '#264d7a',
  '--gold': '#b8922a',
  '--gold-light': '#d4a843',
  '--gold-pale': '#fdf6e3',
  '--cream': '#faf8f3',
  '--white': '#ffffff',
  '--red': '#b91c1c',
  '--red-pale': '#fef2f2',
  '--amber': '#b45309',
  '--amber-pale': '#fffbeb',
  '--green': '#166534',
  '--green-pale': '#f0fdf4',
  '--green-mid': '#bbf7d0',
  '--radius': '10px'
});

const VIEWPORTS = Object.freeze([
  { id: 'mobile-390x844', width: 390, height: 844 },
  { id: 'desktop-1366x768', width: 1366, height: 768 }
]);
const LANGUAGES = Object.freeze(['en', 'mr', 'hi']);
const SAFE_BROWSER_IDENTITY = /^[A-Za-z0-9][A-Za-z0-9 ._+:/();-]{0,159}$/;
const MAX_CELL_TARGETS = 512;
const MAX_CELL_CONTRASTS = 512;
const UI_EVIDENCE_KEYS = Object.freeze(['attestationSignature', 'auditToolingSha', 'browser', 'captureTool', 'capturedAt', 'cells',
  'environmentIdentitySha256', 'evidenceSha256', 'format', 'matrixSha256', 'productFingerprintSha256',
  'recordPath', 'schemaVersion']);
const UI_BROWSER_KEYS = Object.freeze(['identity', 'identitySha256']);
const UI_CELL_KEYS = Object.freeze(['contrasts', 'documentSha256', 'language', 'observationSha256',
  'screenshotSha256', 'surfaceId', 'surfaceSourceSha256', 'targets', 'viewportId']);
const UI_TARGET_KEYS = Object.freeze(['heightCssPx', 'nodeSha256', 'visible', 'widthCssPx']);
const UI_CONTRAST_KEYS = Object.freeze(['nodeSha256', 'ratio', 'requiredRatio']);
const TECHNICAL_WORD = /^(?:api|apk|bcc|csv|cro|db|dsr|etp|fy|grn|gst|he?mw|html|id|ifsc|json|nps|pdf|pin|qms|qrmp|r\d{3}|rso|sha|sms|sql|tds|ui|upi|url|utc|v\d+(?:\.\d+)*|wlmhw|xml|zip)$/i;
const PROPER_OR_BUSINESS = /\b(?:Saagar|Titan|Helios|Tanishq|WhatsApp|Google|Android|Marathi|Hindi|English|Latur)\b/i;
const LOCALIZATION_JAVASCRIPT_EXCLUSIONS = new Set([
  'www/app-i18n.js', 'www/build-identity.js', 'www/demo-seed.js',
  'www/module-manifest.js', 'www/sql-wasm.js'
]);
const USER_FACING_SCRIPT_PROPERTIES = /\.\s*(textContent|innerText|ariaLabel|title|placeholder)\s*=\s*(['"])((?:\\.|(?!\2).)*)\2/g;
const USER_FACING_SET_ATTRIBUTE = /\.setAttribute\(\s*(['"])(aria-label|title|placeholder)\1\s*,\s*(['"])((?:\\.|(?!\3).)*)\3/g;

function normalizeCssValue(value) {
  let out = String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (/^#[0-9a-f]{3}$/.test(out)) out = `#${out[1]}${out[1]}${out[2]}${out[2]}${out[3]}${out[3]}`;
  return out;
}

function tokenDefinitions(context) {
  const files = ['www/index.html', ...context.modules.map(module => module.file)].sort();
  const rows = [];
  for (const file of files) {
    const source = context.read(file);
    for (const match of source.matchAll(/(--[a-z][a-z0-9-]*)\s*:\s*([^;}\r\n]+)/gi)) {
      const token = match[1].toLowerCase();
      if (!Object.hasOwn(DESIGN_TOKENS, token)) continue;
      const actual = normalizeCssValue(match[2]);
      const expected = normalizeCssValue(DESIGN_TOKENS[token]);
      rows.push({ file, line: lineNumber(source, match.index), token, actual, expected,
        divergent: actual !== expected });
    }
  }
  return rows.sort((a, b) => `${a.file}\0${a.line}\0${a.token}`.localeCompare(`${b.file}\0${b.line}\0${b.token}`));
}

function unescapeLiteral(value) {
  return String(value || '')
    .replace(/\0/g, '>')
    .replace(/\\n|\\r|\\t/g, ' ')
    .replace(/\\u\{([0-9a-f]{1,6})\}|\\u([0-9a-f]{4})/gi, (_, wide, fixed) =>
      String.fromCodePoint(Number.parseInt(wide || fixed, 16)))
    .replace(/\\(['"\\])/g, '$1')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&apos;|&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&(?:mdash|ndash);/gi, '—')
    .replace(/&(?:hellip);/gi, '…')
    .replace(/&(?:rsaquo);/gi, '›')
    .replace(/&#x([0-9a-f]{1,6});|&#([0-9]{1,7});/gi, (_, hex, decimal) =>
      String.fromCodePoint(Number.parseInt(hex || decimal, hex ? 16 : 10)))
    .replace(/\s+/g, ' ')
    .trim();
}

function localizationDictionary(context) {
  if (!context.exists('www/app-i18n.js')) return { phrases: new Set(), words: new Set(), available: false };
  const source = context.read('www/app-i18n.js');
  const phrases = new Set();
  for (const match of source.matchAll(/\[\s*(['"])((?:\\.|(?!\1)[\s\S])*?)\1\s*,/g)) {
    const phrase = unescapeLiteral(match[2]);
    if (phrase) phrases.add(phrase.toLowerCase());
  }
  const words = new Set([...phrases].filter(value => /^[a-z][a-z'\u2019-]*$/i.test(value)));
  return { phrases, words, available: phrases.size > 0 };
}

function candidateAllowed(text, dictionary) {
  const normalized = unescapeLiteral(text);
  if (!normalized || !/[a-z]/i.test(normalized)) return true;
  if (dictionary.phrases.has(normalized.toLowerCase())) return true;
  if (/^(?:https?:|data:|blob:|[./]|#)|\.(?:css|html?|js|json|pdf|csv|zip)$/i.test(normalized)) return true;
  if (/^[A-Z0-9_.:/ -]{2,18}$/.test(normalized) && normalized.split(/\s+/).every(word => TECHNICAL_WORD.test(word) || /^\d+$/.test(word))) return true;
  if (PROPER_OR_BUSINESS.test(normalized) && normalized.split(/\s+/).length <= 4) return true;
  const words = normalized.match(/[A-Za-z][A-Za-z'\u2019-]*/g) || [];
  if (!words.length) return true;
  return words.every(word => dictionary.words.has(word.toLowerCase()) || TECHNICAL_WORD.test(word) || PROPER_OR_BUSINESS.test(word));
}

function interpolationOnly(raw) {
  const match = /^(['"])\s*\+([\s\S]*)\+\s*\1$/.exec(String(raw || '').trim());
  if (!match) return false;
  /* A generated element whose complete text is one JavaScript expression has
     no static English string for A6-03 to classify. Retain it when any quoted
     branch contains words (for example a ternary choosing "Post now"), because
     those literals are genuine UI even though the surrounding value is dynamic. */
  for (const literal of match[2].matchAll(/(['"])((?:\\.|(?!\1).)*)\1/g)) {
    if (/[A-Za-z]{2}/.test(unescapeLiteral(literal[2]))) return false;
  }
  return true;
}

function addCandidate(rows, dictionary, file, source, offset, kind, raw, blocked = false) {
  if (interpolationOnly(raw)) return;
  const value = unescapeLiteral(String(raw || '').replace(/<[^>]*>/g, ' '));
  if (!value || value.length > 500 || /(?:\$\{|<%|\{\{|\}\}|\bfunction\b|=>)/.test(value)) return;
  if (!/[A-Za-z]{2}/.test(value) || candidateAllowed(value, dictionary)) return;
  rows.push({ path: file, line: lineNumber(source, offset), kind,
    code: blocked ? 'STATIC_LOCALIZATION_EXPLICIT_BYPASS' : 'STATIC_LOCALIZATION_BYPASS',
    textFingerprint: sha256(value).slice(0, 20) });
}

function browserRenderedLineSegments(value) {
  const source = String(value || '');
  const rows = [];
  const separator = /\\r\\n|\\[nr]|\r\n|[\r\n]|&#(?:0*10|0*13);|&#x(?:0*a|0*d);/gi;
  let cursor = 0;
  for (const match of source.matchAll(separator)) {
    rows.push({ offset: cursor, value: source.slice(cursor, match.index) });
    cursor = match.index + match[0].length;
  }
  rows.push({ offset: cursor, value: source.slice(cursor) });
  return rows;
}

function addAttributeCandidates(rows, dictionary, file, source, offset, kind, raw, blocked = false) {
  for (const segment of browserRenderedLineSegments(raw)) {
    addCandidate(rows, dictionary, file, source, offset + segment.offset, kind, segment.value, blocked);
  }
}

function visibleControlTextSegments(value) {
  const source = String(value || '');
  const rows = [];
  const stack = [{ name: '', hidden: false, blocked: false }];
  const tags = /<[^>]*>/g;
  let cursor = 0;
  const addText = end => {
    if (end <= cursor) return;
    const state = stack[stack.length - 1];
    if (!state.hidden) rows.push({ offset: cursor, value: source.slice(cursor, end), blocked: state.blocked });
  };
  for (const match of source.matchAll(tags)) {
    addText(match.index);
    const tag = match[0];
    const closing = /^<\s*\//.test(tag);
    const name = (/^<\s*\/?\s*([A-Za-z][A-Za-z0-9:-]*)/.exec(tag) || [])[1];
    if (name && closing) {
      for (let index = stack.length - 1; index > 0; index -= 1) {
        const removed = stack.pop();
        if (removed.name === name.toLowerCase()) break;
      }
    } else if (name && !/\/\s*>$/.test(tag) && !/^(?:area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i.test(name)) {
      const parent = stack[stack.length - 1];
      stack.push({ name: name.toLowerCase(),
        hidden: parent.hidden || /\baria-hidden\s*=\s*(['"]?)true\1/i.test(tag),
        blocked: parent.blocked || /\bdata-no-i18n\b|\bcontenteditable\s*=\s*(['"]?)true\1/i.test(tag) });
    }
    cursor = match.index + tag.length;
  }
  addText(source.length);
  return rows;
}

function javascriptLiteralView(value) {
  const input = String(value || '');
  const output = input.split('').map(character => /[\r\n]/.test(character) ? character : ' ');
  const stack = [{ mode: 'code', templateExpression: false, braceDepth: 0 }];
  let escaped = false;
  const preserve = index => { output[index] = input[index]; };
  const regexCanStart = index => {
    let cursor = index - 1;
    while (cursor >= 0 && /\s/.test(input[cursor])) cursor -= 1;
    if (cursor < 0 || /[=(:,!\[{;&|?+*%^~<>-]/.test(input[cursor])) return true;
    if (!/[A-Za-z0-9_$]/.test(input[cursor])) return false;
    const end = cursor + 1;
    while (cursor >= 0 && /[A-Za-z0-9_$]/.test(input[cursor])) cursor -= 1;
    return /^(?:await|case|delete|in|instanceof|new|of|return|throw|typeof|void|yield)$/.test(input.slice(cursor + 1, end));
  };
  for (let index = 0; index < input.length; index += 1) {
    const frame = stack[stack.length - 1];
    const char = input[index], next = input[index + 1] || '';
    if (frame.mode === 'line-comment') {
      if (/\r|\n/.test(char)) stack.pop();
      continue;
    }
    if (frame.mode === 'block-comment') {
      if (char === '*' && next === '/') { index += 1; stack.pop(); }
      continue;
    }
    if (frame.mode === 'string') {
      if (escaped) { preserve(index); escaped = false; continue; }
      if (char === '\\') { preserve(index); escaped = true; continue; }
      if (char === frame.quote) { stack.pop(); continue; }
      preserve(index);
      continue;
    }
    if (frame.mode === 'template') {
      if (escaped) { preserve(index); escaped = false; continue; }
      if (char === '\\') { preserve(index); escaped = true; continue; }
      if (char === '`') { stack.pop(); continue; }
      if (char === '$' && next === '{') {
        index += 1;
        stack.push({ mode: 'code', templateExpression: true, braceDepth: 1 });
        continue;
      }
      preserve(index);
      continue;
    }
    if (char === '/' && next === '/') {
      index += 1; stack.push({ mode: 'line-comment' }); continue;
    }
    if (char === '/' && next === '*') {
      index += 1; stack.push({ mode: 'block-comment' }); continue;
    }
    if (char === '/' && regexCanStart(index)) {
      let inClass = false, regexEscaped = false;
      for (index += 1; index < input.length; index += 1) {
        const regexChar = input[index];
        if (regexEscaped) { regexEscaped = false; continue; }
        if (regexChar === '\\') { regexEscaped = true; continue; }
        if (regexChar === '[') { inClass = true; continue; }
        if (regexChar === ']' && inClass) { inClass = false; continue; }
        if (regexChar === '/' && !inClass) {
          while (/[A-Za-z]/.test(input[index + 1] || '')) index += 1;
          break;
        }
        if (/\r|\n/.test(regexChar)) break;
      }
      continue;
    }
    if (char === '"' || char === "'") {
      stack.push({ mode: 'string', quote: char }); escaped = false; continue;
    }
    if (char === '`') { stack.push({ mode: 'template' }); escaped = false; continue; }
    if (frame.templateExpression && char === '{') frame.braceDepth += 1;
    else if (frame.templateExpression && char === '}' && --frame.braceDepth === 0) stack.pop();
  }
  return output.join('');
}

function localizationMarkupView(source) {
  const output = String(source || '').split('');
  for (const match of String(source || '').matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const body = match[1];
    const start = match.index + match[0].indexOf(body);
    const view = javascriptLiteralView(body);
    for (let index = 0; index < view.length; index += 1) output[start + index] = view[index];
  }
  /* Keep regex-based control discovery position-preserving, but prevent a
     greater-than sign inside a quoted attribute (notably an inline arrow
     handler) from masquerading as the end of the start tag. NUL cannot occur
     in conforming HTML source and is restored before candidate normalization. */
  let inTag = false, quote = '';
  for (let index = 0; index < output.length; index += 1) {
    const character = output[index];
    if (!inTag) {
      if (character === '<' && /[!/?A-Za-z]/.test(output[index + 1] || '')) inTag = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = '';
      else if (character === '>') output[index] = '\0';
      continue;
    }
    if (character === '"' || character === "'") quote = character;
    else if (character === '>') inTag = false;
  }
  return output.join('');
}

function firstPartyLocalizationJavaScript(context) {
  return context.productFiles
    .filter(file => /^www\/(?:shared\/)?[^/]+\.m?js$/i.test(file))
    .filter(file => !/\.min\.js$/i.test(file) && !LOCALIZATION_JAVASCRIPT_EXCLUSIONS.has(file))
    .sort();
}

function localizationBypasses(context, dictionary, javascriptFiles) {
  const rows = [];
  const htmlFiles = ['www/index.html', ...context.modules.map(module => module.file)].sort();
  for (const file of htmlFiles) {
    const source = context.read(file);
    const markup = localizationMarkupView(source);
    const control = /<(button|label|h[1-6]|th|summary|legend|option|a)\b([^>]*)>([\s\S]*?)<\/\1\s*>/gi;
    for (const match of markup.matchAll(control)) {
      const blocked = /\bdata-no-i18n\b|\bcontenteditable\s*=\s*['"]?true/i.test(match[2]);
      const innerOffset = match.index + match[0].indexOf(match[3]);
      for (const segment of visibleControlTextSegments(match[3])) {
        addCandidate(rows, dictionary, file, source, innerOffset + segment.offset,
          `element:${match[1].toLowerCase()}`, segment.value, blocked || segment.blocked);
      }
    }
    for (const match of markup.matchAll(/<[^>]+\b(placeholder|aria-label|title)\s*=\s*(['"])([^'"]+)\2[^>]*>/gi)) {
      addAttributeCandidates(rows, dictionary, file, source, match.index, `attribute:${match[1].toLowerCase()}`,
        match[3], /\bdata-no-i18n\b/i.test(match[0]));
    }
    for (const match of markup.matchAll(/<input\b(?=[^>]*\btype\s*=\s*(['"])(?:button|submit|reset)\1)[^>]*\bvalue\s*=\s*(['"])([^'"]+)\2[^>]*>/gi)) {
      addCandidate(rows, dictionary, file, source, match.index, 'attribute:value', match[3], /\bdata-no-i18n\b/i.test(match[0]));
    }
    for (const match of source.matchAll(/\b(?:alert|confirm|toast|notify|showToast)\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
      addCandidate(rows, dictionary, file, source, match.index, 'script-message', match[2]);
    }
  }
  for (const file of javascriptFiles) {
    const source = context.read(file);
    for (const match of source.matchAll(/\b(?:alert|confirm|toast|notify|showToast)\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g)) {
      addCandidate(rows, dictionary, file, source, match.index, 'script-message', match[2]);
    }
    for (const match of source.matchAll(USER_FACING_SCRIPT_PROPERTIES)) {
      addCandidate(rows, dictionary, file, source, match.index,
        `script-property:${match[1].toLowerCase()}`, match[3]);
    }
    for (const match of source.matchAll(USER_FACING_SET_ATTRIBUTE)) {
      addCandidate(rows, dictionary, file, source, match.index,
        `script-attribute:${match[2].toLowerCase()}`, match[4]);
    }
  }
  const unique = new Map();
  for (const row of rows) unique.set(`${row.path}\0${row.line}\0${row.kind}\0${row.textFingerprint}`, row);
  return [...unique.values()].sort((a, b) => `${a.path}\0${a.line}\0${a.kind}`.localeCompare(`${b.path}\0${b.line}\0${b.kind}`));
}

function surfaceMatrix(context) {
  const surfaces = [{ id: 'shell', path: 'www/index.html' },
    ...context.modules.map(module => ({ id: module.id, path: module.file }))]
    .sort((a, b) => a.id.localeCompare(b.id));
  const cells = [];
  for (const surface of surfaces) for (const viewport of VIEWPORTS) for (const language of LANGUAGES) {
    cells.push({ surfaceId: surface.id, path: surface.path, viewportId: viewport.id, language });
  }
  return { surfaces, cells };
}

function exactKeys(value, expected) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function cellIdentity(cell) {
  return [cell.surfaceId, cell.viewportId, cell.language].join('\\0');
}

export function renderedMatrixCoverage(matrixCells, evidenceCells) {
  const expectedCells = Array.isArray(matrixCells) ? matrixCells : [];
  const suppliedCells = Array.isArray(evidenceCells) ? evidenceCells : [];
  const expected = new Set(expectedCells.map(cellIdentity));
  const seen = new Set();
  let duplicateCells = 0;
  let unexpectedCells = 0;
  for (const cell of suppliedCells) {
    const key = cellIdentity(cell || {});
    if (!expected.has(key)) unexpectedCells += 1;
    else if (seen.has(key)) duplicateCells += 1;
    else seen.add(key);
  }
  const missingCells = [...expected].filter(key => !seen.has(key)).length;
  return Object.freeze({
    requiredCells: expectedCells.length,
    uniqueRequiredCells: expected.size,
    suppliedCells: suppliedCells.length,
    missingCells,
    duplicateCells,
    unexpectedCells,
    valid: expectedCells.length > 0 && expected.size === expectedCells.length &&
      suppliedCells.length === expectedCells.length && missingCells === 0 &&
      duplicateCells === 0 && unexpectedCells === 0
  });
}

function finiteCssMeasurement(value, minimum = 0, maximum = 10000) {
  return typeof value === 'number' && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function sortedUniqueObservationRows(rows) {
  if (!Array.isArray(rows)) return false;
  let previous = '';
  for (const row of rows) {
    if (!isHex64(row && row.nodeSha256) || row.nodeSha256 <= previous) return false;
    previous = row.nodeSha256;
  }
  return true;
}

function validTargetObservations(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.length <= MAX_CELL_TARGETS &&
    sortedUniqueObservationRows(rows) && rows.every(row => exactKeys(row, UI_TARGET_KEYS) &&
      typeof row.visible === 'boolean' && finiteCssMeasurement(row.widthCssPx) &&
      finiteCssMeasurement(row.heightCssPx));
}

function validContrastObservations(rows) {
  return Array.isArray(rows) && rows.length > 0 && rows.length <= MAX_CELL_CONTRASTS &&
    sortedUniqueObservationRows(rows) && rows.every(row => exactKeys(row, UI_CONTRAST_KEYS) &&
      finiteCssMeasurement(row.ratio, 1, 21) && [3, 4.5].includes(row.requiredRatio));
}

function renderedUiEvidence(context, matrix) {
  const raw = context.options && context.options.uiEvidence;
  const matrixSha256 = sha256(JSON.stringify(matrix.cells));
  const empty = {
    provided: false,
    envelopeValid: false,
    captureSourceBound: false,
    matrixValid: false,
    matrixSha256,
    browserIdentitySha256: null,
    environmentIdentitySha256: null,
    validCells: [],
    measuredTargets: 0,
    measuredContrastSamples: 0,
    targetViolations: 0,
    contrastViolations: 0,
    duplicateCells: 0,
    extraCells: 0,
    malformedCells: 0,
    missingCells: matrix.cells.length,
    findings: [{ code: 'RENDERED_UI_EVIDENCE_ABSENT' }]
  };
  if (raw === undefined || raw === null) return empty;

  const trust = baseEvidenceTrust(context, raw, {
    format: 'SAAGAR_RENDERED_UI_ATTESTATION',
    schemaVersion: 2,
    recordPrefix: RENDERED_RECORD_PREFIX
  });
  const findings = [...trust.integrityFindings];
  if (!exactKeys(raw, UI_EVIDENCE_KEYS)) findings.push({ code: 'UI_EVIDENCE_SCHEMA_KEYS_INVALID' });
  if (!raw || raw.format !== 'SAAGAR_RENDERED_UI_ATTESTATION' || raw.schemaVersion !== 2) {
    findings.push({ code: 'UI_EVIDENCE_SCHEMA_VERSION_INVALID' });
  }
  if (!isHex64(raw && raw.matrixSha256) || raw.matrixSha256 !== matrixSha256) {
    findings.push({ code: 'UI_EVIDENCE_MATRIX_IDENTITY_INVALID' });
  }
  const browser = raw && raw.browser;
  const browserIdentity = browser && typeof browser.identity === 'string' ? browser.identity : '';
  if (!exactKeys(browser, UI_BROWSER_KEYS) || !SAFE_BROWSER_IDENTITY.test(browserIdentity) ||
      browserIdentity !== browserIdentity.trim() || !isHex64(browser.identitySha256) ||
      browser.identitySha256 !== sha256(browserIdentity)) {
    findings.push({ code: 'UI_EVIDENCE_BROWSER_IDENTITY_INVALID' });
  }
  if (!isHex64(raw && raw.environmentIdentitySha256)) {
    findings.push({ code: 'UI_EVIDENCE_ENVIRONMENT_IDENTITY_INVALID' });
  }

  const envelopeIntegrityValid = trust.integrityValid && findings.length === 0;
  const envelopeValid = envelopeIntegrityValid && trust.authorized;
  if (!trust.authorized) findings.push(...trust.findings.filter(item =>
    item.code === 'ATTESTED_EVIDENCE_TRUST_ROOT_UNAVAILABLE'));
  const result = {
    ...empty,
    provided: true,
    envelopeValid,
    captureSourceBound: trust.integrityValid,
    browserIdentitySha256: isHex64(browser && browser.identitySha256)
      ? browser.identitySha256.slice(0, 20) : null,
    environmentIdentitySha256: isHex64(raw && raw.environmentIdentitySha256)
      ? raw.environmentIdentitySha256.slice(0, 20) : null,
    findings
  };
  if (!envelopeIntegrityValid) return result;

  const expected = new Map(matrix.cells.map((cell, index) => [cellIdentity(cell), { ...cell, index }]));
  const requiredCells = matrix.cells.length;
  const sourceEntries = new Map(context.productFingerprint.entries.map(entry => [entry.path, entry.sha256]));
  if (requiredCells === 0 || expected.size !== requiredCells) {
    result.findings.push({ code: 'DISCOVERED_RENDERED_MATRIX_INVALID', requiredCells,
      discoveredCells: matrix.cells.length, uniqueCells: expected.size });
  }
  if (!Array.isArray(raw.cells)) {
    result.findings.push({ code: 'UI_EVIDENCE_CELLS_NOT_ARRAY' });
    return result;
  }
  const coverage = renderedMatrixCoverage(matrix.cells, raw.cells);
  if (raw.cells.length !== requiredCells) {
    result.findings.push({ code: 'UI_EVIDENCE_CELL_COUNT_INVALID', requiredCells,
      suppliedCells: raw.cells.length });
  }

  const observationBinding = {
    auditToolingSha: raw.auditToolingSha,
    productFingerprintSha256: raw.productFingerprintSha256,
    matrixSha256,
    producerSha256: raw.captureTool.producerSha256,
    protocolSha256: raw.captureTool.protocolSha256,
    browserIdentitySha256: browser.identitySha256,
    environmentIdentitySha256: raw.environmentIdentitySha256
  };
  const seen = new Set();
  const valid = [];
  const inspected = raw.cells;
  inspected.forEach((cell, cellIndex) => {
    if (!exactKeys(cell, UI_CELL_KEYS)) {
      result.malformedCells += 1;
      result.findings.push({ code: 'UI_EVIDENCE_CELL_SCHEMA_INVALID', cellIndex });
      return;
    }
    const key = cellIdentity(cell);
    const expectedCell = expected.get(key);
    if (!expectedCell) {
      result.extraCells += 1;
      result.findings.push({ code: 'UI_EVIDENCE_CELL_UNEXPECTED', cellIndex });
      return;
    }
    if (seen.has(key)) {
      result.duplicateCells += 1;
      result.findings.push({ code: 'UI_EVIDENCE_CELL_DUPLICATE', cellIndex,
        surfaceId: expectedCell.surfaceId, viewportId: expectedCell.viewportId, language: expectedCell.language });
      return;
    }

    const sourceSha256 = sourceEntries.get(expectedCell.path);
    const viewport = VIEWPORTS.find(item => item.id === expectedCell.viewportId);
    const artifactsValid = isHex64(cell.documentSha256) && isHex64(cell.screenshotSha256) &&
      isHex64(cell.surfaceSourceSha256) && cell.surfaceSourceSha256 === sourceSha256;
    const observationsValid = validTargetObservations(cell.targets) &&
      validContrastObservations(cell.contrasts) && cell.targets.some(item => item.visible);
    const observation = {
      surfaceId: expectedCell.surfaceId,
      surfacePath: expectedCell.path,
      surfaceSourceSha256: sourceSha256,
      viewportId: expectedCell.viewportId,
      viewportWidthCssPx: viewport && viewport.width,
      viewportHeightCssPx: viewport && viewport.height,
      language: expectedCell.language,
      documentSha256: cell.documentSha256,
      screenshotSha256: cell.screenshotSha256,
      targets: cell.targets,
      contrasts: cell.contrasts
    };
    const observationHashValid = isHex64(cell.observationSha256) &&
      cell.observationSha256 === renderedObservationSha256(observationBinding, observation);
    if (!artifactsValid || !observationsValid || !observationHashValid) {
      result.malformedCells += 1;
      result.findings.push({ code: 'UI_EVIDENCE_CELL_OBSERVATION_INVALID', cellIndex,
        surfaceId: expectedCell.surfaceId, viewportId: expectedCell.viewportId, language: expectedCell.language });
      return;
    }

    seen.add(key);
    const visibleTargets = cell.targets.filter(item => item.visible);
    const targetViolations = visibleTargets.filter(item => item.widthCssPx < 44 || item.heightCssPx < 44).length;
    const contrastViolations = cell.contrasts.filter(item => item.ratio < item.requiredRatio).length;
    valid.push({
      surfaceId: expectedCell.surfaceId,
      viewportId: expectedCell.viewportId,
      language: expectedCell.language,
      index: expectedCell.index,
      measuredTargets: visibleTargets.length,
      measuredContrastSamples: cell.contrasts.length,
      targetViolations,
      contrastViolations,
      renderedEvidenceSha256: cell.observationSha256
    });
  });

  const missing = [...expected.entries()].filter(([key]) => !seen.has(key)).map(([, cell]) => cell);
  for (const cell of missing) result.findings.push({ code: 'UI_EVIDENCE_CELL_MISSING', surfaceId: cell.surfaceId,
    viewportId: cell.viewportId, language: cell.language });
  valid.sort((a, b) => a.index - b.index);
  result.validCells = valid;
  result.missingCells = missing.length;
  result.measuredTargets = valid.reduce((sum, cell) => sum + cell.measuredTargets, 0);
  result.measuredContrastSamples = valid.reduce((sum, cell) => sum + cell.measuredContrastSamples, 0);
  result.targetViolations = valid.reduce((sum, cell) => sum + cell.targetViolations, 0);
  result.contrastViolations = valid.reduce((sum, cell) => sum + cell.contrastViolations, 0);
  result.matrixValid = envelopeValid && coverage.valid && valid.length === requiredCells &&
    result.duplicateCells === 0 && result.extraCells === 0 &&
    result.malformedCells === 0 && missing.length === 0;
  return result;
}

function renderedCellEvidence(cell, code) {
  return { code, surfaceId: cell.surfaceId, viewportId: cell.viewportId, language: cell.language,
    measuredTargets: cell.measuredTargets, measuredContrastSamples: cell.measuredContrastSamples,
    targetViolations: cell.targetViolations, contrastViolations: cell.contrastViolations,
    renderedEvidenceSha256: cell.renderedEvidenceSha256 };
}

export async function run(context) {
  const tokens = tokenDefinitions(context);
  const divergences = tokens.filter(row => row.divergent);
  const dictionary = localizationDictionary(context);
  const localizationJavaScript = firstPartyLocalizationJavaScript(context);
  const bypasses = dictionary.available ? localizationBypasses(context, dictionary, localizationJavaScript) : [];
  const matrix = surfaceMatrix(context);
  const rendered = renderedUiEvidence(context, matrix);
  const renderedViolations = rendered.validCells.filter(cell => cell.targetViolations > 0 || cell.contrastViolations > 0);
  const renderedResult = !rendered.provided || !rendered.envelopeValid ? 'unmeasured'
    : (!rendered.matrixValid || renderedViolations.length ? 'fail' : 'pass');
  const matrixEvidenceResult = !rendered.provided || !rendered.envelopeValid ? 'unmeasured'
    : (rendered.matrixValid ? 'pass' : 'fail');

  const checks = [
    makeCheck({
      id: 'A6-01', title: 'Shared design-token divergence',
      result: divergences.length ? 'fail' : 'pass', severity: 'P2', mandatory: true,
      metric: { canonicalTokens: Object.keys(DESIGN_TOKENS).length, definitions: tokens.length,
        filesWithDefinitions: new Set(tokens.map(row => row.file)).size, divergences: divergences.length },
      rule: 'Every definition of a shared SAAGAR design token must equal its canonical normalized value.',
      evidence: divergences.map(row => ({ path: row.file, line: row.line, code: 'DESIGN_TOKEN_DIVERGENCE',
        token: row.token, expectedFingerprint: sha256(row.expected).slice(0, 16), actualFingerprint: sha256(row.actual).slice(0, 16) })),
      notes: 'Absence of a token is not called divergence; this check compares only definitions of the canonical shared names.'
    }),
    makeCheck({
      id: 'A6-02', title: 'Surface, viewport and language matrix', result: 'pass', severity: 'INFO', mandatory: false,
      metric: { surfaces: matrix.surfaces.length, viewports: VIEWPORTS.length, languages: LANGUAGES.length,
        matrixCells: matrix.cells.length, surfaceInventory: matrix.surfaces,
        viewportInventory: VIEWPORTS, languageInventory: LANGUAGES,
        matrixSha256: sha256(JSON.stringify(matrix.cells)) },
      rule: 'Enumerate every discovered shell/module surface across the frozen mobile/desktop viewports and English, Marathi and Hindi.',
      evidence: matrix.surfaces.map(surface => ({ path: surface.path, code: 'UI_SURFACE', surfaceId: surface.id,
        requiredCells: VIEWPORTS.length * LANGUAGES.length }))
    }),
    makeCheck({
      id: 'A6-03', title: 'Static localization bypass',
      result: dictionary.available ? (bypasses.length ? 'fail' : 'pass') : 'unmeasured', severity: 'P1', mandatory: true,
      metric: { dictionaryAvailable: dictionary.available, dictionaryPhrases: dictionary.phrases.size,
        highConfidenceBypasses: bypasses.length, scannedSurfaces: matrix.surfaces.length,
        scannedFirstPartyJavaScript: localizationJavaScript.length },
      rule: 'Static text on controls, control labels, accessibility attributes, literal notification calls and first-party shared JavaScript DOM-label sinks must be covered by the shared localization dictionary unless it is business data, a proper name or an approved technical label.',
      evidence: dictionary.available ? bypasses : [{ path: 'www/app-i18n.js', code: 'LOCALIZATION_DICTIONARY_UNAVAILABLE' }],
      notes: 'Evidence stores only source location, kind and a one-way text fingerprint; rendered/dynamic completeness is decided by A6-05.'
    }),
    makeCheck({
      id: 'A6-04', title: 'Rendered target size and contrast', result: renderedResult, severity: 'P1', mandatory: true,
      metric: { minimumTargetCssPixels: 44, normalTextContrast: 4.5, largeTextContrast: 3,
        evidenceProvided: rendered.provided, identityBound: rendered.envelopeValid,
        measuredCells: rendered.validCells.length, measuredTargets: rendered.measuredTargets,
        measuredContrastSamples: rendered.measuredContrastSamples, targetViolations: rendered.targetViolations,
        contrastViolations: rendered.contrastViolations },
      rule: 'Rendered interactive targets must be at least 44 by 44 CSS pixels; normal text contrast must be at least 4.5:1 and large text at least 3:1.',
      evidence: renderedResult === 'unmeasured' ? rendered.findings
        : (!rendered.matrixValid ? rendered.findings
          : (renderedViolations.length ? renderedViolations.map(cell => renderedCellEvidence(cell, 'RENDERED_UI_VIOLATION'))
            : rendered.validCells.map(cell => renderedCellEvidence(cell, 'RENDERED_UI_CELL_PASS')))),
      notes: renderedResult === 'unmeasured'
        ? 'No complete schema-valid rendered measurement bound to this product, tooling identity, browser and matrix was supplied.'
        : 'Computed target and contrast outcomes were supplied by the identity-bound external renderer; physical-device acceptance remains separate.'
    }),
    makeCheck({
      id: 'A6-05', title: 'Identity-bound rendered matrix evidence', result: matrixEvidenceResult, severity: 'P1', mandatory: true,
      metric: { requiredCells: matrix.cells.length, measuredCells: rendered.validCells.length,
        missingCells: rendered.missingCells, duplicateCells: rendered.duplicateCells, extraCells: rendered.extraCells,
        malformedCells: rendered.malformedCells, matrixSha256: rendered.matrixSha256,
        productFingerprintSha256: context.productFingerprint.treeSha256,
        productIdentityBound: rendered.envelopeValid, toolingIdentityBound: rendered.envelopeValid,
        browserIdentitySha256: rendered.browserIdentitySha256 },
      rule: `Exactly ${matrix.cells.length} discovered unique mandatory surface, viewport and language cells must carry rendered evidence hashes bound to the exact product SHA, product fingerprint, tooling SHA, browser identity and matrix hash.`,
      evidence: rendered.matrixValid
        ? rendered.validCells.map(cell => renderedCellEvidence(cell, 'RENDERED_MATRIX_CELL_VERIFIED'))
        : rendered.findings,
      notes: matrixEvidenceResult === 'unmeasured'
        ? 'Absent or invalid schema/identity evidence is unmeasured, never pass.'
        : 'Rendered evidence establishes browser matrix coverage only; it does not establish physical-device or fluent-language acceptance.'
    })
  ];

  return auditResult('A6', 'UI, responsive behavior, i18n and accessibility', checks, {
    surfaceCount: matrix.surfaces.length,
    matrixCells: matrix.cells.length,
    staticLocalizationBypasses: bypasses.length,
    renderedEvidenceProvided: rendered.provided,
    renderedMatrixValid: rendered.matrixValid,
    renderedTargetViolations: rendered.targetViolations,
    renderedContrastViolations: rendered.contrastViolations
  });
}
