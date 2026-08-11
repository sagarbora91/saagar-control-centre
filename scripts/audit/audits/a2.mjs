import { auditResult, makeCheck, sha256 } from '../lib.mjs';

const DOMAIN_NAME = /(?:KEY|STORE|PREFIX|VERSION|SCHEMA|CHANNEL|REPORT|ROLE|STATUS|TOLERANCE|LIMIT|MESSAGE|CODE|DATE|FORMAT|TYPE|MODE|POLICY)/;
const KEYWORDS = new Set((
  'await break case catch class const continue debugger default delete do else export extends false finally for function if import in instanceof let new null return static super switch this throw true try typeof undefined var void while with yield async of'
).split(' '));
const MAX_FUNCTION_CANDIDATES = 5000;

function lineAt(text, offset) {
  return text.slice(0, Math.max(0, offset)).split(/\r?\n/).length;
}

function jsSegments(file, source) {
  if (!/\.html?$/i.test(file)) return [{ source, offset: 0 }];
  const result = [];
  for (const match of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)) {
    const openEnd = match[0].indexOf('>') + 1;
    result.push({ source: match[1], offset: match.index + openEnd });
  }
  return result;
}

function isRegexStart(previous) {
  return !previous || /[=(:,!&|?{};\[\]+\-*%^~<>]/.test(previous);
}

function maskLiteralsAndComments(source) {
  const out = [...source];
  let state = 'code';
  let quote = '';
  let inClass = false;
  let previous = '';
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    const next = source[i + 1] || '';
    if (state === 'line-comment') {
      if (char === '\n' || char === '\r') { state = 'code'; previous = ''; }
      else out[i] = ' ';
      continue;
    }
    if (state === 'block-comment') {
      if (char === '*' && next === '/') { out[i] = out[i + 1] = ' '; i += 1; state = 'code'; }
      else if (char !== '\n' && char !== '\r') out[i] = ' ';
      continue;
    }
    if (state === 'string') {
      if (char === '\\') {
        out[i] = ' ';
        if (i + 1 < source.length) { if (source[i + 1] !== '\n' && source[i + 1] !== '\r') out[i + 1] = ' '; i += 1; }
      } else if (char === quote) { out[i] = ' '; state = 'code'; previous = 'v'; }
      else if (char !== '\n' && char !== '\r') out[i] = ' ';
      continue;
    }
    if (state === 'regex') {
      if (char === '\\') { out[i] = ' '; if (i + 1 < source.length) { out[i + 1] = ' '; i += 1; } }
      else if (char === '[') { inClass = true; out[i] = ' '; }
      else if (char === ']') { inClass = false; out[i] = ' '; }
      else if (char === '/' && !inClass) {
        out[i] = ' ';
        while (/[a-z]/i.test(source[i + 1] || '')) { out[i + 1] = ' '; i += 1; }
        state = 'code'; previous = 'v';
      } else if (char !== '\n' && char !== '\r') out[i] = ' ';
      continue;
    }
    if (char === '/' && next === '/') { out[i] = out[i + 1] = ' '; i += 1; state = 'line-comment'; continue; }
    if (char === '/' && next === '*') { out[i] = out[i + 1] = ' '; i += 1; state = 'block-comment'; continue; }
    if (char === '"' || char === "'" || char === '`') { quote = char; out[i] = ' '; state = 'string'; continue; }
    if (char === '/' && isRegexStart(previous)) { out[i] = ' '; state = 'regex'; inClass = false; continue; }
    if (!/\s/.test(char)) previous = char;
  }
  return out.join('');
}

function closingBrace(masked, open) {
  let depth = 0;
  for (let index = open; index < masked.length; index += 1) {
    if (masked[index] === '{') depth += 1;
    else if (masked[index] === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function functionName(masked, match, sequence) {
  if (match[1]) return match[1];
  const prefix = masked.slice(Math.max(0, match.index - 100), match.index);
  const assigned = prefix.match(/(?:const|let|var|[.;{])\s*([A-Za-z_$][\w$]*)\s*=\s*$/);
  return assigned ? assigned[1] : `anonymous-${sequence}`;
}

function extractFunctions(context) {
  const files = context.productFiles.filter(file => /^www\/.+\.(?:html?|js|mjs)$/i.test(file)).sort();
  const functions = [];
  const head = /\bfunction(?:\s+([A-Za-z_$][\w$]*))?\s*\([^{};]*\)\s*\{|(?:\([^{};]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{/g;
  for (const file of files) {
    const whole = context.read(file);
    let sequence = 0;
    for (const segment of jsSegments(file, whole)) {
      const masked = maskLiteralsAndComments(segment.source);
      head.lastIndex = 0;
      for (const match of masked.matchAll(head)) {
        const open = match.index + match[0].lastIndexOf('{');
        const close = closingBrace(masked, open);
        if (close < 0) continue;
        const body = segment.source.slice(open + 1, close).replace(/\r\n?/g, '\n').trim();
        if (!body) continue;
        sequence += 1;
        functions.push({
          file,
          line: lineAt(whole, segment.offset + open),
          name: functionName(masked, match, sequence),
          body,
          chars: body.length,
          rawSha256: sha256(body)
        });
      }
    }
  }
  return functions.sort((a, b) => `${a.file}\0${String(a.line).padStart(8, '0')}\0${a.name}`
    .localeCompare(`${b.file}\0${String(b.line).padStart(8, '0')}\0${b.name}`));
}

function normalizedTokens(source) {
  const tokens = [];
  for (let i = 0; i < source.length;) {
    const char = source[i];
    const next = source[i + 1] || '';
    if (/\s/.test(char)) { i += 1; continue; }
    if (char === '/' && next === '/') { i += 2; while (i < source.length && source[i] !== '\n') i += 1; continue; }
    if (char === '/' && next === '*') { i += 2; while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) i += 1; i += 2; continue; }
    if (char === '"' || char === "'" || char === '`') {
      const quote = char;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') { i += 2; continue; }
        if (source[i] === quote) { i += 1; break; }
        i += 1;
      }
      tokens.push('$string');
      continue;
    }
    if (/[A-Za-z_$]/.test(char)) {
      let end = i + 1;
      while (/[A-Za-z0-9_$]/.test(source[end] || '')) end += 1;
      const word = source.slice(i, end);
      tokens.push(KEYWORDS.has(word) ? word : '$id');
      i = end;
      continue;
    }
    if (/\d/.test(char)) {
      let end = i + 1;
      while (/[A-Za-z0-9_.]/.test(source[end] || '')) end += 1;
      tokens.push('$number');
      i = end;
      continue;
    }
    const operator = source.slice(i).match(/^(?:===|!==|>>>|\*\*|=>|==|!=|<=|>=|&&|\|\||\?\?|\+\+|--|\+=|-=|\*=|\/=|\?\.|<<|>>)/);
    if (operator) { tokens.push(operator[0]); i += operator[0].length; }
    else { tokens.push(char); i += 1; }
  }
  return tokens;
}

function frequency(tokens) {
  const counts = new Map();
  for (const token of tokens) counts.set(token, (counts.get(token) || 0) + 1);
  return counts;
}

function tokenSimilarity(left, right) {
  const maximum = (2 * Math.min(left.tokens.length, right.tokens.length)) / (left.tokens.length + right.tokens.length);
  if (maximum < 0.9) return 0;
  const [small, large] = left.counts.size <= right.counts.size ? [left.counts, right.counts] : [right.counts, left.counts];
  let common = 0;
  for (const [token, count] of small) common += Math.min(count, large.get(token) || 0);
  return (2 * common) / (left.tokens.length + right.tokens.length);
}

function groupsBy(items, keyOf, minimumFiles) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return [...map.entries()].map(([key, members]) => ({ key, members,
    files: [...new Set(members.map(item => item.file))].sort() }))
    .filter(group => group.files.length >= minimumFiles)
    .sort((a, b) => a.key.localeCompare(b.key));
}

function exactFunctionGroups(functions) {
  return groupsBy(functions.filter(item => item.chars >= 160), item => item.rawSha256, 3);
}

function nearFunctionGroups(functions) {
  const expanded = functions.map(item => {
    const tokens = normalizedTokens(item.body);
    const normalized = tokens.join(' ');
    return { ...item, tokens, counts: frequency(tokens), normalizedChars: normalized.length,
      normalizedSha256: sha256(normalized) };
  }).filter(item => item.normalizedChars >= 240);

  // Repeated occurrences of the same normalized body in one file cannot add a
  // cross-file member. Collapse them before the bounded O(n^2) comparison.
  const unique = new Map();
  for (const item of expanded) {
    const key = `${item.file}\0${item.normalizedSha256}`;
    if (!unique.has(key)) unique.set(key, item);
  }
  const candidates = [...unique.values()];
  if (candidates.length > MAX_FUNCTION_CANDIDATES) return { candidates, groups: [], overflow: true, edges: 0 };

  const parent = candidates.map((_, index) => index);
  const find = index => {
    let cursor = index;
    while (parent[cursor] !== cursor) cursor = parent[cursor];
    while (parent[index] !== index) { const next = parent[index]; parent[index] = cursor; index = next; }
    return cursor;
  };
  const union = (a, b) => { const ra = find(a); const rb = find(b); if (ra !== rb) parent[rb] = ra; };
  let edges = 0;
  for (let left = 0; left < candidates.length; left += 1) {
    for (let right = left + 1; right < candidates.length; right += 1) {
      if (candidates[left].file === candidates[right].file) continue;
      const similarity = tokenSimilarity(candidates[left], candidates[right]);
      if (similarity >= 0.9) { union(left, right); edges += 1; }
    }
  }
  const components = new Map();
  for (let index = 0; index < candidates.length; index += 1) {
    const root = find(index);
    if (!components.has(root)) components.set(root, []);
    components.get(root).push(candidates[index]);
  }
  const groups = [...components.values()].map(members => ({
    key: sha256(members.map(item => item.normalizedSha256).sort().join('\n')),
    members,
    files: [...new Set(members.map(item => item.file))].sort(),
    normalizedHashes: [...new Set(members.map(item => item.normalizedSha256))].sort(),
    rawHashes: [...new Set(members.map(item => item.rawSha256))].sort()
  })).filter(group => group.files.length >= 3 && group.rawHashes.length > 1)
    .sort((a, b) => a.key.localeCompare(b.key));
  return { candidates, groups, overflow: false, edges };
}

function cssBlocks(context) {
  const blocks = [];
  for (const module of context.modules) {
    for (const style of module.html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style\s*>/gi)) {
      const css = style[1].replace(/\/\*[\s\S]*?\*\//g, '');
      for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
        const declarations = match[2].split(';').map(value => value.trim()).filter(value => /^[\w-]+\s*:/.test(value));
        if (declarations.length < 6) continue;
        const normalized = declarations.map(value => value.replace(/\s+/g, ' ').replace(/\s*:\s*/g, ':').trim()).join(';');
        blocks.push({ file: module.file, moduleId: module.id, selector: match[1].replace(/\s+/g, ' ').trim().slice(0, 120),
          declarationCount: declarations.length, sha256: sha256(normalized) });
      }
    }
  }
  return blocks;
}

function constantSites(context) {
  const files = context.productFiles.filter(file => /^www\/.+\.(?:html?|js|mjs)$/i.test(file)).sort();
  const sites = [];
  const stringDefinition = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(['"])([^'"\r\n]{1,200})\2/g;
  const numberDefinition = /\b(?:const|let|var)\s+([A-Z][A-Z0-9_]{2,})\s*=\s*(-?\d+(?:\.\d+)?)\b/g;
  for (const file of files) {
    const whole = context.read(file);
    for (const segment of jsSegments(file, whole)) {
      for (const match of segment.source.matchAll(stringDefinition)) {
        if (!DOMAIN_NAME.test(match[1])) continue;
        sites.push({ file, line: lineAt(whole, segment.offset + match.index), name: match[1], kind: 'string', value: match[3] });
      }
      for (const match of segment.source.matchAll(numberDefinition)) {
        if (!DOMAIN_NAME.test(match[1])) continue;
        sites.push({ file, line: lineAt(whole, segment.offset + match.index), name: match[1], kind: 'number', value: match[2] });
      }
    }
  }
  return sites.sort((a, b) => `${a.name}\0${a.file}\0${a.line}`.localeCompare(`${b.name}\0${b.file}\0${b.line}`));
}

function duplicateDomainConstants(sites) {
  return groupsBy(sites, item => `${item.name}\0${item.kind}\0${item.value}`, 2)
    .map(group => ({ ...group, name: group.members[0].name, kind: group.members[0].kind,
      valueSha256: sha256(group.members[0].value), valueLength: group.members[0].value.length }));
}

function sharedConceptAuthority(context, constants) {
  const concepts = context.sharedAssets.map(asset => ({
    conceptId: `asset:${asset.id}`,
    kind: 'shared-asset',
    consumerCount: context.modules.filter(module => module.html.includes(asset.file)).length,
    authoritySites: ['www/module-manifest.js']
  }));
  const useMap = new Map();
  const keyPattern = /(['"])((?:saagar|st|gm)_[A-Za-z0-9_.:-]{2,})\1/gi;
  for (const module of context.modules) {
    const values = new Set([...module.html.matchAll(keyPattern)].map(match => match[2]));
    for (const value of values) {
      if (!useMap.has(value)) useMap.set(value, []);
      useMap.get(value).push(module.file);
    }
  }
  for (const [value, files] of [...useMap.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (files.length < 2) continue;
    const declarations = constants.filter(site => site.kind === 'string' && site.value === value)
      .map(site => `${site.file}:${site.line}:${site.name}`).sort();
    concepts.push({ conceptId: `storage:${sha256(value).slice(0, 20)}`, kind: 'persistent-key',
      consumerCount: files.length, authoritySites: declarations });
  }
  const gaps = concepts.filter(item => item.authoritySites.length !== 1);
  return { concepts: concepts.sort((a, b) => a.conceptId.localeCompare(b.conceptId)), gaps };
}

function functionEvidence(group, code) {
  return group.members.slice(0, 12).map(member => ({ path: member.file, line: member.line, code,
    groupSha256: group.key, functionName: member.name, normalizedChars: member.normalizedChars || member.chars }));
}

export async function run(context) {
  const functions = extractFunctions(context);
  const exactGroups = exactFunctionGroups(functions);
  const near = nearFunctionGroups(functions);
  const blocks = cssBlocks(context);
  const cssGroups = groupsBy(blocks, item => item.sha256, 3);
  const constants = constantSites(context);
  const duplicateConstants = duplicateDomainConstants(constants);
  const authorities = sharedConceptAuthority(context, constants);

  const checks = [
    makeCheck({
      id: 'A2-01', title: 'Byte-identical repeated function bodies',
      result: exactGroups.length ? 'fail' : 'pass', severity: 'P2', mandatory: true,
      metric: { functions: functions.length, eligibleFunctions: functions.filter(item => item.chars >= 160).length,
        duplicateGroups: exactGroups.length, affectedFiles: new Set(exactGroups.flatMap(group => group.files)).size },
      rule: 'A function body of at least 160 LF-normalized characters must not be byte-identical across three or more product files.',
      evidence: exactGroups.flatMap(group => functionEvidence(group, 'BYTE_IDENTICAL_FUNCTION')),
      notes: 'Bodies are line-ending-normalized and trimmed; names and parameter lists are intentionally outside the body comparison.'
    }),
    makeCheck({
      id: 'A2-02', title: 'Near-copy function bodies',
      result: near.overflow ? 'unmeasured' : near.groups.length ? 'fail' : 'pass', severity: 'P2', mandatory: true,
      metric: { candidateFunctions: near.candidates.length, candidateLimit: MAX_FUNCTION_CANDIDATES,
        similarityThreshold: 0.9, similarityEdges: near.edges, nearCopyGroups: near.groups.length },
      rule: 'After comment/whitespace removal and identifier/literal normalization, bodies of at least 240 normalized characters with at least 90% token similarity must not span three or more product files.',
      evidence: near.overflow
        ? [{ code: 'NEAR_COPY_CANDIDATE_LIMIT_EXCEEDED', candidates: near.candidates.length, limit: MAX_FUNCTION_CANDIDATES }]
        : near.groups.flatMap(group => functionEvidence(group, 'NEAR_COPY_FUNCTION')),
      notes: near.overflow ? 'The deterministic bound was exceeded; the check is not reported as passed.' : 'Similarity is multiset Dice similarity over normalized lexical tokens; SHA-256 identities are emitted for each cluster.'
    }),
    makeCheck({
      id: 'A2-03', title: 'Repeated CSS declaration blocks',
      result: cssGroups.length ? 'fail' : 'pass', severity: 'P2', mandatory: true,
      metric: { eligibleBlocks: blocks.length, duplicateGroups: cssGroups.length,
        affectedModules: new Set(cssGroups.flatMap(group => group.members.map(item => item.moduleId))).size },
      rule: 'An identical CSS declaration block containing at least six declarations must not appear in three or more module files.',
      evidence: cssGroups.flatMap(group => group.members.slice(0, 12).map(item => ({ path: item.file,
        code: 'DUPLICATE_CSS_DECLARATIONS', blockSha256: group.key, declarations: item.declarationCount,
        selector: item.selector })))
    }),
    makeCheck({
      id: 'A2-04', title: 'Duplicated approved domain constants',
      result: duplicateConstants.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { authorityCandidates: constants.length, duplicatedConstants: duplicateConstants.length,
        affectedFiles: new Set(duplicateConstants.flatMap(group => group.files)).size },
      rule: 'The same named domain constant and literal value must not be defined as an authority in two or more product files.',
      evidence: duplicateConstants.flatMap(group => group.members.slice(0, 12).map(item => ({ path: item.file,
        line: item.line, code: 'DUPLICATE_DOMAIN_CONSTANT_AUTHORITY', constant: item.name,
        valueKind: item.kind, valueLength: group.valueLength, valueSha256: group.valueSha256 }))),
      notes: 'Literal values are fingerprinted rather than emitted. Ordinary use sites are excluded; only uppercase domain-definition sites are counted.'
    }),
    makeCheck({
      id: 'A2-05', title: 'Single authority for shared concepts',
      result: authorities.gaps.length ? 'fail' : 'pass', severity: 'P1', mandatory: true,
      metric: { sharedConcepts: authorities.concepts.length, authorityGaps: authorities.gaps.length,
        zeroAuthorities: authorities.gaps.filter(item => item.authoritySites.length === 0).length,
        multipleAuthorities: authorities.gaps.filter(item => item.authoritySites.length > 1).length,
        conceptRegistrySha256: sha256(JSON.stringify(authorities.concepts)) },
      rule: 'Each application-owned asset or persistent-key concept shared by at least two modules must have exactly one declared product authority.',
      evidence: authorities.gaps.map(item => ({ code: item.authoritySites.length ? 'MULTIPLE_SHARED_CONCEPT_AUTHORITIES' : 'MISSING_SHARED_CONCEPT_AUTHORITY',
        conceptId: item.conceptId, kind: item.kind, consumerCount: item.consumerCount,
        authorityCount: item.authoritySites.length, authoritySites: item.authoritySites.slice(0, 20) })),
      notes: 'Persistent key names are represented by one-way concept IDs; manifest shared assets use the module manifest as their declared authority.'
    })
  ];

  return auditResult('A2', 'Duplication and ownership', checks, {
    functionCount: functions.length,
    cssBlockCount: blocks.length,
    constantAuthorityCandidateCount: constants.length
  });
}
