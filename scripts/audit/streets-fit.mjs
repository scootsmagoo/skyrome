#!/usr/bin/env node
/**
 * STREETS crew (phase 4b): G0's street-fit audit (scripts/audit/street-fit.mjs, unchanged) under the
 * load guard, with an extra game URL query and the drawn terrain on the profile's diagonal.
 *
 *   node scripts/audit/streets-fit.mjs [--query terrain=v1] [--keep-diagonal] [--max-wait 45]
 *        [every street-fit.mjs option: --out dir --shots 0 --minutes 20 --near x,z,r --only k;k ...]
 *
 * Why: street-fit.mjs boots a fixed URL (no `?terrain=v1`), and its `visibleTerrain` (streetFit.ts)
 * splits each 2 m cell along a–d, which is the drawn mesh of terrain v1 only; under v2 (the default
 * since G1a) the mesh is drawn on b–c and the tool compares every street with a ground that is not
 * drawn. See streets-boot.mjs. `--keep-diagonal` runs the tool exactly as G0 wrote it.
 */
import { register } from 'node:module';
import { parseArgs } from './boot.mjs';
import { acquireSlot } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.query) process.env.STREETS_QUERY = String(args.query);
if (args['keep-diagonal']) process.env.STREETS_KEEP_DIAGONAL = '1';
if (!args['no-guard']) await acquireSlot({ label: `streets-fit${args.query ? `:${args.query}` : ''}`, maxWaitMin: Number(args['max-wait'] ?? 45) });
register('./streets-hook.mjs', import.meta.url);
await import('./street-fit.mjs');
