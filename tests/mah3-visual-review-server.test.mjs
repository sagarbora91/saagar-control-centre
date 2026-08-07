import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createReviewServer,
  createRunnerFingerprint,
  validateBaseline
} from '../scripts/mah3-visual-review-server.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const profilePath = path.join(root, 'verification', 'MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json');
const profile = JSON.parse(fs.readFileSync(profilePath, 'utf8'));
const sha256 = value => crypto.createHash('sha256').update(value).digest('hex');

function copyFile(source, destination) {
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyHarness(tempRoot) {
  fs.cpSync(path.join(root, 'www'), path.join(tempRoot, 'www'), { recursive: true });
  for (const relative of [
    'scripts/mah3-visual-review-server.mjs',
    'verification/MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json',
    'verification/mah3-visual-review/index.html',
    'verification/mah3-visual-review/review.css',
    'verification/mah3-visual-review/review-controller.js'
  ]) copyFile(path.join(root, relative), path.join(tempRoot, relative));
}

function rawRequest(port, requestPath, method = 'GET') {
  return new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port, path: requestPath, method }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => resolve({
        status: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks)
      }));
    });
    request.on('error', reject);
    request.end();
  });
}

test('MAH-3 profile hash, runner hash, and exact matrix reject drift', () => {
  const verified = validateBaseline(root, profilePath);
  assert.equal(verified.profileSha256, sha256(fs.readFileSync(profilePath)));
  assert.deepEqual(verified.runnerFingerprint, createRunnerFingerprint(root));
  assert.deepEqual(
    verified.runnerFingerprint.files.map(file => file.path),
    [
      'scripts/mah3-visual-review-server.mjs',
      'verification/mah3-visual-review/index.html',
      'verification/mah3-visual-review/review.css',
      'verification/mah3-visual-review/review-controller.js'
    ]
  );

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-mah3-matrix-'));
  try {
    const malformedPath = path.join(temp, 'malformed.json');
    const malformed = structuredClone(profile);
    malformed.matrix.languages = ['en', 'hi', 'mr'];
    fs.writeFileSync(malformedPath, JSON.stringify(malformed));
    assert.throws(() => validateBaseline(root, malformedPath), /exact 168-case contract/);
  } finally {
    fs.rmSync(temp, { recursive: true, force: true });
  }
});

test('MAH-3 loopback server serves immutable verified snapshots and rejects unsafe requests', async () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'saagar-mah3-server-'));
  copyHarness(temp);
  const tempProfile = path.join(temp, 'verification', 'MAH3-SHARED-RUNTIME-BASELINE-PROFILE.json');
  const shellPath = path.join(temp, 'www', 'index.html');
  const controllerPath = path.join(temp, 'verification', 'mah3-visual-review', 'review-controller.js');
  const originalShell = fs.readFileSync(shellPath);
  const originalController = fs.readFileSync(controllerPath);
  const server = createReviewServer({ root: temp, profilePath: tempProfile });
  try {
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const port = server.address().port;

    fs.appendFileSync(shellPath, '\n<!-- changed after snapshot -->\n');
    fs.appendFileSync(controllerPath, '\n// changed after snapshot\n');

    const shell = await rawRequest(port, '/app/index.html');
    assert.equal(shell.status, 200);
    assert.equal(sha256(shell.body), sha256(originalShell));
    assert.notEqual(sha256(shell.body), sha256(fs.readFileSync(shellPath)));

    const controller = await rawRequest(port, '/review/review-controller.js');
    assert.equal(controller.status, 200);
    assert.equal(sha256(controller.body), sha256(originalController));
    assert.match(String(controller.headers['content-security-policy']), /default-src 'self'/);

    const head = await rawRequest(port, '/app/index.html', 'HEAD');
    assert.equal(head.status, 200);
    assert.equal(head.body.length, 0);
    assert.equal((await rawRequest(port, '/app/index.html', 'POST')).status, 405);
    assert.notEqual((await rawRequest(port, '/app/%2e%2e/package.json')).status, 200);
    assert.notEqual((await rawRequest(port, '/app/..%5cpackage.json')).status, 200);
    assert.notEqual((await rawRequest(port, '/review/%2e%2e/%2e%2e/package.json')).status, 200);

    const identity = JSON.parse((await rawRequest(port, '/profile.json')).body.toString('utf8'));
    assert.match(identity.profileSha256, /^[a-f0-9]{64}$/);
    assert.match(identity.runnerFingerprint.treeSha256, /^[a-f0-9]{64}$/);
    assert.equal(identity.fingerprint.treeSha256, profile.sourceFingerprint.treeSha256);
  } finally {
    await new Promise(resolve => server.close(resolve));
    fs.rmSync(temp, { recursive: true, force: true });
  }
});
