#!/usr/bin/env node
/**
 * STREETS crew (phase 4b): runs one browser tool under G0's load guard (scripts/audit/lock.mjs), as
 * gate.mjs does for its steps: waits for a quiet machine and a free browser slot, runs the tool, frees
 * the slot.
 *
 *   node scripts/audit/streets-run.mjs [--max-wait 90] -- <scripts/...mjs> [the tool's own options]
 */
import { spawn } from 'node:child_process';
import { acquireSlot } from './lock.mjs';

const argv = process.argv.slice(2);
const sep = argv.indexOf('--');
const own = sep >= 0 ? argv.slice(0, sep) : [];
const tool = sep >= 0 ? argv.slice(sep + 1) : argv;
const mw = own.indexOf('--max-wait');
const maxWaitMin = mw >= 0 ? Number(own[mw + 1]) : 90;
if (!tool.length) {
  console.error('usage: streets-run.mjs [--max-wait min] -- <tool.mjs> [options]');
  process.exit(2);
}
const release = await acquireSlot({ label: `streets:${tool[0].split('/').pop()}`, maxWaitMin });
const child = spawn(process.execPath, tool, { stdio: 'inherit' });
const code = await new Promise((res) => child.on('exit', (c) => res(c ?? 1)));
release();
process.exit(code);
