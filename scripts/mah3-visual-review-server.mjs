#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const defaultRoot = path.resolve(scriptDir, '..');
const defaultProfilePath = path.join(
  defaultRoot,
  'verification',
  'MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json'
);
const reviewRoot = path.join(defaultRoot, 'verification', 'mah3-visual-review');
const LOOPBACK_HOST = '127.0.0.1';
const DEFAULT_PORT = 8766;
const require = createRequire(import.meta.url);
const EXPECTED_LANGUAGES = ['en', 'mr', 'hi'];
const EXPECTED_VIEWPORTS = [
  { id: 'phone-360', width: 360, height: 800, uiMode: 'mobile' },
  { id: 'phone-412', width: 412, height: 915, uiMode: 'mobile' },
  { id: 'compact-800', width: 800, height: 600, uiMode: 'mobile' },
  { id: 'desktop-1365', width: 1365, height: 768, uiMode: 'desktop' }
];
const EXPECTED_SHELL_SURFACES = ['shell-home', 'settings-home', 'settings-detail'];

const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function walkFiles(directory, base = directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute, base));
    else if (entry.isFile()) files.push(path.relative(base, absolute).replace(/\\/g, '/'));
  }
  return files.sort((left, right) => left.localeCompare(right, 'en'));
}
export function fingerprintFile(root, relativePath) {
  const normalized = relativePath.replace(/\\/g, '/');
  const absolute = path.resolve(root, normalized);
  const rootPrefix = `${path.resolve(root)}${path.sep}`;
  if (!absolute.startsWith(rootPrefix)) throw new Error(`fingerprint path escapes repository: ${normalized}`);
  const bytes = fs.readFileSync(absolute);
  return { path: normalized, bytes: bytes.length, sha256: sha256(bytes) };
}

export function createWwwFingerprint(root = defaultRoot) {
  const wwwRoot = path.join(root, 'www');
  const files = walkFiles(wwwRoot).map(relative => fingerprintFile(root, `www/${relative}`));
  const treeMaterial = files
    .map(file => `${file.path}\0${file.bytes}\0${file.sha256}\n`)
    .join('');
  return {
    algorithm: 'sha256(path\\0bytes\\0sha256\\n)',
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    treeSha256: sha256(Buffer.from(treeMaterial, 'utf8')),
    files
  };
}

export function createEvidenceCases(profile) {
  const cases = [];
  for (const surface of profile.matrix.surfaces) {
    for (const viewport of profile.matrix.viewports) {
      for (const language of profile.matrix.languages) {
        const isShell = surface === 'shell-home' || surface.startsWith('settings-');
        cases.push({
          id: `${surface}__${viewport.id}__${language}`,
          surface,
          viewportId: viewport.id,
          width: viewport.width,
          height: viewport.height,
          uiMode: viewport.uiMode,
          language,
          kind: isShell ? 'shell' : 'module',
          src: '/app/index.html'
        });
      }
    }
  }
  return cases;
}

export function validateBaseline(root = defaultRoot, profilePath = defaultProfilePath) {
  const profileBytes = fs.readFileSync(profilePath);
  const profile = JSON.parse(profileBytes.toString('utf8'));
  if (profile.schemaVersion !== 1) throw new Error('MAH-3 baseline profile schema must be 1');
  if (profile.profileId !== 'mah3-shared-runtime-baseline-2026-08-06') {
    throw new Error('Unexpected MAH-3 baseline profile identity');
  }

  const manifest = require(path.join(root, 'www', 'module-manifest.js'));
  const expectedSurfaces = EXPECTED_SHELL_SURFACES.concat(manifest.modules.map(module => module.id));
  if (JSON.stringify(profile.matrix.languages) !== JSON.stringify(EXPECTED_LANGUAGES) ||
      JSON.stringify(profile.matrix.viewports) !== JSON.stringify(EXPECTED_VIEWPORTS) ||
      JSON.stringify(profile.matrix.surfaces) !== JSON.stringify(expectedSurfaces) ||
      profile.matrix.minimumVisualCases !== 168) {
    throw new Error('MAH-3 evidence matrix must match the exact 168-case contract');
  }
  for (const module of manifest.modules) {
    if (module.src !== `modules/${module.id}/index.html`) throw new Error(`Unexpected module route: ${module.id}`);
  }

  const cases = createEvidenceCases(profile);
  if (cases.length !== profile.matrix.minimumVisualCases || new Set(cases.map(item => item.id)).size !== cases.length) {
    throw new Error('MAH-3 evidence matrix count or identity mismatch');
  }

  const actual = createWwwFingerprint(root);
  for (const field of ['algorithm', 'fileCount', 'totalBytes', 'treeSha256']) {
    if (actual[field] !== profile.sourceFingerprint[field]) {
      throw new Error(`MAH-3 source fingerprint mismatch: ${field}`);
    }
  }

  const actualByPath = new Map(actual.files.map(file => [file.path, file]));
  for (const expected of profile.sourceFingerprint.criticalFiles) {
    const found = actualByPath.get(expected.path);
    if (!found || found.bytes !== expected.bytes || found.sha256 !== expected.sha256) {
      throw new Error(`MAH-3 critical source mismatch: ${expected.path}`);
    }
  }

  return {
    profile,
    profileSha256: sha256(profileBytes),
    cases,
    fingerprint: {
      algorithm: actual.algorithm,
      fileCount: actual.fileCount,
      totalBytes: actual.totalBytes,
      treeSha256: actual.treeSha256
    },
    runnerFingerprint: createRunnerFingerprint(root)
  };
}

export function createRunnerFingerprint(root = defaultRoot) {
  const paths = [
    'scripts/mah3-visual-review-server.mjs',
    'verification/mah3-visual-review/index.html',
    'verification/mah3-visual-review/review.css',
    'verification/mah3-visual-review/review-controller.js'
  ];
  const files = paths.map(relativePath => fingerprintFile(root, relativePath));
  const material = files.map(file => `${file.path}\0${file.bytes}\0${file.sha256}\n`).join('');
  return {
    algorithm: 'sha256(path\\0bytes\\0sha256\\n)',
    fileCount: files.length,
    totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
    treeSha256: sha256(Buffer.from(material, 'utf8')),
    files
  };
}

function contentType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  return ({
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.wasm': 'application/wasm',
    '.woff2': 'font/woff2'
  })[extension] || 'application/octet-stream';
}

function resolveUnder(base, relativePath) {
  const clean = String(relativePath || '').replace(/^\/+/, '');
  const absoluteBase = path.resolve(base);
  const absolute = path.resolve(absoluteBase, clean || 'index.html');
  if (absolute !== absoluteBase && !absolute.startsWith(`${absoluteBase}${path.sep}`)) return null;
  return absolute;
}

function send(res, status, body, type = 'text/plain; charset=utf-8', headOnly = false) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(status, {
    'Cache-Control': 'no-store',
    'Content-Length': bytes.length,
    'Content-Type': type,
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(headOnly ? undefined : bytes);
}

function serveFile(req, res, filePath, headOnly) {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    send(res, 404, 'Not found', undefined, headOnly);
    return;
  }
  send(res, 200, fs.readFileSync(filePath), contentType(filePath), headOnly);
}

function snapshotWww(root) {
  const wwwRoot = path.join(root, 'www');
  const entries = walkFiles(wwwRoot).map(relative => {
    const bytes = fs.readFileSync(path.join(wwwRoot, relative));
    return {
      relative,
      file: { path: `www/${relative}`, bytes: bytes.length, sha256: sha256(bytes) },
      bytes,
      contentType: contentType(relative)
    };
  });
  const material = entries.map(entry => `${entry.file.path}\0${entry.file.bytes}\0${entry.file.sha256}\n`).join('');
  return {
    fingerprint: {
      algorithm: 'sha256(path\\0bytes\\0sha256\\n)',
      fileCount: entries.length,
      totalBytes: entries.reduce((sum, entry) => sum + entry.file.bytes, 0),
      treeSha256: sha256(Buffer.from(material, 'utf8'))
    },
    files: new Map(entries.map(entry => [entry.relative, { bytes: entry.bytes, contentType: entry.contentType }]))
  };
}

function snapshotKey(relativePath) {
  const raw = String(relativePath || '').replace(/^\/+/, '') || 'index.html';
  if (raw.split('/').some(segment => segment === '..' || segment === '.')) return null;
  const normalized = path.posix.normalize(raw);
  if (normalized.startsWith('../') || path.posix.isAbsolute(normalized)) return null;
  return normalized;
}

function serveSnapshot(res, snapshot, relativePath, headOnly) {
  const key = snapshotKey(relativePath);
  const item = key ? snapshot.get(key) : null;
  if (!item) {
    send(res, 404, 'Not found', undefined, headOnly);
    return;
  }
  send(res, 200, item.bytes, item.contentType, headOnly);
}

function snapshotReview(root) {
  const base = path.join(root, 'verification', 'mah3-visual-review');
  const names = ['index.html', 'review.css', 'review-controller.js'];
  return new Map(names.map(name => {
    const bytes = fs.readFileSync(path.join(base, name));
    return [name, { bytes, contentType: contentType(name) }];
  }));
}

function applyRunnerCsp(res) {
  res.setHeader('Content-Security-Policy', "default-src 'self'; base-uri 'none'; object-src 'none'; frame-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; form-action 'none'");
}

export function createReviewServer({ root = defaultRoot, profilePath = defaultProfilePath } = {}) {
  const verified = validateBaseline(root, profilePath);
  const wwwSnapshot = snapshotWww(root);
  const reviewSnapshot = snapshotReview(root);
  for (const field of ['algorithm', 'fileCount', 'totalBytes', 'treeSha256']) {
    if (wwwSnapshot.fingerprint[field] !== verified.fingerprint[field]) {
      throw new Error(`MAH-3 snapshot changed after validation: ${field}`);
    }
  }

  return http.createServer((req, res) => {
    const method = String(req.method || 'GET').toUpperCase();
    const headOnly = method === 'HEAD';
    if (method !== 'GET' && !headOnly) {
      send(res, 405, 'Method not allowed');
      return;
    }

    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url || '/', `http://${LOOPBACK_HOST}`).pathname);
    } catch {
      send(res, 400, 'Invalid URL');
      return;
    }
    if (pathname.includes('\0')) {
      send(res, 400, 'Invalid path');
      return;
    }

    if (pathname === '/profile.json') {
      send(res, 200, JSON.stringify(verified, null, 2), 'application/json; charset=utf-8', headOnly);
      return;
    }
    if (pathname === '/' || pathname === '/index.html') {
      applyRunnerCsp(res);
      serveSnapshot(res, reviewSnapshot, 'index.html', headOnly);
      return;
    }
    if (pathname.startsWith('/review/')) {
      applyRunnerCsp(res);
      serveSnapshot(res, reviewSnapshot, pathname.slice('/review/'.length), headOnly);
      return;
    }
    if (pathname === '/app' || pathname === '/app/') {
      serveSnapshot(res, wwwSnapshot.files, 'index.html', headOnly);
      return;
    }
    if (pathname.startsWith('/app/')) {
      serveSnapshot(res, wwwSnapshot.files, pathname.slice('/app/'.length), headOnly);
      return;
    }
    send(res, 404, 'Not found', undefined, headOnly);
  });
}

function parsePort(argv) {
  const raw = argv.find(value => value.startsWith('--port='))?.slice('--port='.length);
  if (raw === undefined) return DEFAULT_PORT;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Port must be an integer from 1024 to 65535');
  return port;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  const port = parsePort(process.argv.slice(2));
  const server = createReviewServer();
  server.listen(port, LOOPBACK_HOST, () => {
    process.stdout.write(
      `MAH-3 source fingerprint verified.\nOpen http://${LOOPBACK_HOST}:${port}/\n` +
      'This runner clears localStorage only on this dedicated loopback origin before each synthetic case.\n'
    );
  });
}
