#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createMah4Inventory, createMah4Profile } from './lib/mah4-contract-source.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, '..');
const result = process.argv.includes('--profile') ? createMah4Profile(root) : createMah4Inventory(root);
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
