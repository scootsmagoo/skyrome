/**
 * The load guard and the browser slots of the audit tools (phase 4b G0).
 *
 *  - no browser audit starts while the 1-minute load average is over MAX_LOAD (16);
 *  - at most SLOTS (2) browser audits run at once across the machine: each holds a lock file
 *    (skyrome-audit-slot-N.lock in the OS temp directory, with its pid; a lock whose process is gone,
 *    or older than 6 hours, is taken over);
 *  - waiting is bounded (maxWaitMin): on a timeout `acquireSlot` rejects, and says so.
 */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { loadavg, tmpdir } from 'node:os';
import { join } from 'node:path';

export const MAX_LOAD = Number(process.env.SKYROME_AUDIT_MAX_LOAD ?? 16);
export const SLOTS = Number(process.env.SKYROME_AUDIT_SLOTS ?? 2);
const STALE_MS = 6 * 3600_000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const alive = (pid) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
};

function tryTake(i, label) {
  const path = join(tmpdir(), `skyrome-audit-slot-${i}.lock`);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      writeFileSync(path, JSON.stringify({ pid: process.pid, label, t: Date.now() }), { flag: 'wx' });
      return path;
    } catch {
      let held = null;
      try {
        held = JSON.parse(readFileSync(path, 'utf8'));
      } catch {
        /* unreadable: treat as stale below */
      }
      if (!held || !alive(held.pid) || Date.now() - held.t > STALE_MS) {
        try {
          unlinkSync(path);
        } catch {
          /* somebody else took it over */
        }
        continue;
      }
      return null;
    }
  }
  return null;
}

/** Wait for a quiet machine and a free slot; resolves to a release function. */
export async function acquireSlot({ label = 'audit', maxWaitMin = 60, log = console.log, maxLoad = MAX_LOAD } = {}) {
  const t0 = Date.now();
  let lastSay = 0;
  for (;;) {
    const load = loadavg()[0];
    if (load <= maxLoad) {
      for (let i = 0; i < SLOTS; i++) {
        const path = tryTake(i, label);
        if (path) {
          let done = false;
          const release = () => {
            if (done) return;
            done = true;
            try {
              unlinkSync(path);
            } catch {
              /* already gone */
            }
          };
          process.on('exit', release);
          for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { release(); process.exit(130); });
          if (Date.now() - t0 > 2000) log(`[guard] ${label}: started after waiting ${((Date.now() - t0) / 60000).toFixed(1)} min (load ${load.toFixed(1)}, slot ${i})`);
          return release;
        }
      }
    }
    if (Date.now() - t0 > maxWaitMin * 60_000) throw new Error(`[guard] ${label}: gave up after ${maxWaitMin} min (load ${load.toFixed(1)} over ${maxLoad}, or both browser slots busy); nothing was run`);
    if (Date.now() - lastSay > 60_000) {
      lastSay = Date.now();
      log(`[guard] ${label}: waiting (1-minute load ${load.toFixed(1)}${load > maxLoad ? ` is over ${maxLoad}` : ''}${load <= maxLoad ? ', both browser slots are busy' : ''}); ${((Date.now() - t0) / 60000).toFixed(0)} of at most ${maxWaitMin} min`);
    }
    await sleep(5000);
  }
}

/** For tools that run in-process and want the guard: `const release = await guard('look', args)`. */
export async function guard(label, args = {}) {
  if (args['no-guard']) return () => {};
  return acquireSlot({ label, maxWaitMin: Number(args['max-wait'] ?? 60) });
}
