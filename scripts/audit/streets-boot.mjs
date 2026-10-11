/**
 * STREETS crew (phase 4b): G0's `boot.mjs` for `streets-fit.mjs`, with one addition G0's street-fit
 * run cannot take (scripts/audit/street-fit.mjs boots one fixed URL): `STREETS_QUERY` (environment),
 * extra game URL parameters, e.g. `terrain=v1`. Everything else is boot.mjs's.
 */
import { boot as boot0, parseArgs, root } from './boot.mjs';

export { parseArgs, root };

export async function boot(query, opts) {
  const extra = process.env.STREETS_QUERY;
  return boot0(extra ? `${query}&${extra}` : query, opts);
}
