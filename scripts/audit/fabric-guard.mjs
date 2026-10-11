#!/usr/bin/env node
// FABRIC: run any audit command under G0's load guard.  node scripts/audit/fabric-guard.mjs -- <cmd> <args…>
import { spawn } from 'node:child_process';
import { acquireSlot } from './lock.mjs';
const i = process.argv.indexOf('--');
const cmd = process.argv.slice(i + 1);
const release = await acquireSlot({ label: 'fabric', maxWaitMin: 60, log: (m) => console.log(m) });
const p = spawn(cmd[0], cmd.slice(1), { stdio: 'inherit' });
p.on('exit', (c) => { release?.(); process.exit(c ?? 1); });
