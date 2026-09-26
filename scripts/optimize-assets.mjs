#!/usr/bin/env node
/**
 * Safe compatibility entry point for the MillOS model pipeline.
 *
 * Canonical model inputs under assets/source/models are immutable. This command
 * regenerates only validated runtime derivatives, then checks their manifest
 * contracts. It replaces the legacy optimizer that modified public assets in
 * place and left mutable backups beside runtime files.
 */

import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const dryRun = process.argv.includes('--dry-run');

function runScript(relativePath, args = []) {
  const script = path.join(ROOT, relativePath);
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    stdio: 'inherit',
  });

  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${relativePath} exited with status ${result.status ?? 'unknown'}`);
  }
}

console.log('=== MillOS derived model optimization ===');
console.log('Canonical inputs remain immutable under assets/source/models.');

runScript('scripts/normalize-model-assets.mjs', dryRun ? ['--dry-run'] : []);

if (!dryRun) {
  runScript('scripts/validate-assets.mjs');
  console.log('Runtime derivatives regenerated and validated. Assets are fresh.');
} else {
  console.log('Dry run complete. No runtime derivative was changed.');
}
