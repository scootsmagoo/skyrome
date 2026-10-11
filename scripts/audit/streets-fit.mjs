#!/usr/bin/env node
/**
 * STREETS crew (phase 4b): G0's street-fit audit (scripts/audit/street-fit.mjs, unchanged) under the
 * load guard, with an extra game URL query (street-fit.mjs boots a fixed URL: no `?terrain=v1`).
 *
 *   node scripts/audit/streets-fit.mjs [--query terrain=v1] [--max-wait 45] [--no-guard]
 *        [every street-fit.mjs option: --out dir --shots 0 --minutes 20 --near x,z,r --only k;k ...]
 */
import { register } from 'node:module';
import { parseArgs } from './boot.mjs';
import { acquireSlot } from './lock.mjs';

const args = parseArgs(process.argv.slice(2));
if (args.query) process.env.STREETS_QUERY = String(args.query);
if (!args['no-guard']) await acquireSlot({ label: `streets-fit${args.query ? `:${args.query}` : ''}`, maxWaitMin: Number(args['max-wait'] ?? 45) });
register('./streets-hook.mjs', import.meta.url);
await import('./street-fit.mjs');
