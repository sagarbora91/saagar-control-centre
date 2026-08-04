import assert from 'node:assert/strict';
import test from 'node:test';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const indexPath = path.join(repoDir, 'www', 'index.html');

/* Module patchers inject code via Function.prototype.toString(), which reproduces
   the patcher file's on-disk source verbatim — line endings included. Git checks
   .mjs out with CRLF on Windows and LF elsewhere (.gitattributes pins no *.mjs
   rule), so an unnormalised patcher produced a different bundle per platform:
   re-running it rewrote every injected line, and the committed bundle could only
   be reproduced on the platform that generated it.

   These tests run each patcher twice over identical inputs — once from a
   LF-ending copy of the script, once from a CRLF-ending copy — and require the
   two bundles to be byte-identical. */

const PATCHERS = [
  { script: 'apply-d3-service.mjs', moduleId: 'service' },
  { script: 'apply-d4-dsr.mjs', moduleId: 'dsr' }
];

function moduleOf(shell, id) {
  const match = shell.match(/\bconst\s+MODULES\s*=\s*(\[[\s\S]*?\])\s*;\s*(?:\r?\n)/);
  assert.ok(match, 'MODULES bundle present');
  return JSON.parse(match[1]).find(item => item.id === id);
}

function runWithScriptEol(scriptName, eol) {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eol-indep-'));
  try {
    const wwwDir = path.join(workDir, 'www');
    const scriptsDir = path.join(workDir, 'scripts');
    fs.mkdirSync(wwwDir, { recursive: true });
    fs.mkdirSync(scriptsDir, { recursive: true });
    fs.copyFileSync(indexPath, path.join(wwwDir, 'index.html'));

    const source = fs.readFileSync(path.join(repoDir, 'scripts', scriptName), 'utf8');
    const retargeted = source.replace(/\r\n/g, '\n').replace(/\n/g, eol);
    fs.writeFileSync(path.join(scriptsDir, scriptName), retargeted, 'utf8');

    execFileSync(process.execPath, [path.join(scriptsDir, scriptName)],
      { cwd: workDir, stdio: 'pipe' });
    return fs.readFileSync(path.join(wwwDir, 'index.html'));
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
}

for (const { script, moduleId } of PATCHERS) {
  test(`${script} output does not depend on its own line endings`, () => {
    const fromLf = runWithScriptEol(script, '\n');
    const fromCrlf = runWithScriptEol(script, '\r\n');
    assert.ok(fromLf.equals(fromCrlf),
      `${script} produced different bundles from LF and CRLF copies of itself`);
  });

  test(`${script} is a no-op on the committed bundle`, () => {
    const committed = fs.readFileSync(indexPath);
    const reapplied = runWithScriptEol(script, '\n');
    assert.ok(committed.equals(reapplied),
      `${script} rewrote the committed bundle; www/index.html is not its fixed point`);
  });

  test(`${script} preserves the ${moduleId} payload's own line endings`, () => {
    const shell = fs.readFileSync(indexPath, 'utf8');
    const module = moduleOf(shell, moduleId);
    const html = Buffer.from(module.html_b64, 'base64').toString('utf8');
    const crlf = (html.match(/\r\n/g) || []).length;
    const bareLf = (html.match(/(?<!\r)\n/g) || []).length;
    // Each payload is dominated by one ending; a patcher that injected the other
    // would show up as a large minority count rather than a handful of literals.
    const dominant = Math.max(crlf, bareLf);
    const minority = Math.min(crlf, bareLf);
    assert.ok(dominant > 1000, `${moduleId} payload should be line-oriented`);
    assert.ok(minority / dominant < 0.02,
      `${moduleId} payload is ${crlf} CRLF / ${bareLf} LF — mixed endings injected`);
  });
}
