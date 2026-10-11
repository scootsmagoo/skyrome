#!/usr/bin/env node
/**
 * L-WEST (phase 4b): run one audit tool under G0's load guard (scripts/audit/lock.mjs), so a crew run of
 * collision.mjs / structures.mjs on its own places waits its turn like the gate's steps do.
 *
 *   node scripts/audit/lwest-guarded.mjs [--max-wait 60] -- collision.mjs --only porta-capena ...
 *
 * The tool path is relative to scripts/audit/. Exit code: the tool's, or 2 when the guard gave up.
 */
import { spawn } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { acquireSlot } from './lock.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const argv = process.argv.slice(2);
const cut = argv.indexOf('--');
const own = cut >= 0 ? argv.slice(0, cut) : [];
const rest = cut >= 0 ? argv.slice(cut + 1) : argv;
const mw = own.indexOf('--max-wait');
const maxWaitMin = mw >= 0 ? Number(own[mw + 1]) : 60;
if (!rest.length) {
  console.error('usage: lwest-guarded.mjs [--max-wait min] -- <tool.mjs> [args]');
  process.exit(2);
}
let release;
try {
  release = await acquireSlot({ label: `lwest:${rest[0]}`, maxWaitMin, log: (m) => console.log(m) });
} catch (e) {
  console.log(e.message);
  process.exit(2);
}
const child = spawn(process.execPath, [join(here, rest[0]), ...rest.slice(1)], { cwd: root, stdio: 'inherit' });
const stop = () => child.kill('SIGTERM');
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
const code = await new Promise((res) => child.on('close', (c) => res(c ?? 1)));
release();
process.exit(code);
