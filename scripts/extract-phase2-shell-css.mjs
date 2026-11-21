#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const shellPath = path.join(root, 'www/index.html');
let shell = fs.readFileSync(shellPath, 'utf8');

function persist(file, css) {
  const normalized = css.replace(/^\r?\n/, '').replace(/\r?\n$/, '') + '\n';
  fs.writeFileSync(path.join(root, 'www', file), normalized, 'utf8');
  return `<link rel="stylesheet" href="${file}">`;
}

function extractId(id, file) {
  if (shell.includes(`href="${file}"`)) return;
  const pattern = new RegExp(`<style id="${id}">([\\s\\S]*?)<\\/style>`);
  const match = shell.match(pattern);
  if (!match) throw new Error(`Missing shell style: ${id}`);
  shell = shell.replace(match[0], persist(file, match[1]));
}

function extractContaining(marker, file) {
  const markerAt = shell.indexOf(marker);
  const start = shell.lastIndexOf('<style>', markerAt);
  const end = shell.indexOf('</style>', markerAt);
  if (markerAt < 0 || start < 0 || end < 0) throw new Error(`Missing shell style marker: ${marker}`);
  const css = shell.slice(start + '<style>'.length, end);
  shell = shell.slice(0, start) + persist(file, css) + shell.slice(end + '</style>'.length);
}

extractId('st-v5-fonts', 'shell-fonts.css');
extractContaining('Single-file shell. Drop into assets/public/index.html.', 'shell-core.css');
extractId('bcc-mobile-shell', 'shell-mobile.css');
extractId('rpt-redesign', 'shell-report.css');
extractId('st-v51-redesign', 'shell-redesign.css');
extractId('st-shell-features', 'shell-features.css');

fs.writeFileSync(shellPath, shell, 'utf8');
process.stdout.write(`${JSON.stringify({ shellBytes: Buffer.byteLength(shell) })}\n`);
