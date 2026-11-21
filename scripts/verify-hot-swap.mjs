#!/usr/bin/env node

/**
 * Root wrapper for @digitalcanopy/assets hot-swap verification.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const targetScript = path.resolve(__dirname, '../packages/assets/scripts/verify-hot-swap.mjs');

const result = spawnSync(process.execPath, [targetScript], {
  stdio: 'inherit',
  cwd: path.resolve(__dirname, '../packages/assets'),
});

process.exit(result.status ?? 0);
