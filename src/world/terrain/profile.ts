/**
 * The terrain profile: which version of the ground the world is built on (docs/design/solid-ground.md
 * §3, "The terrain decision").
 *
 * - `v1`: the ground as it was before phase 4b. `heightAt` is bilinear and the drawn mesh splits each
 *   2 m cell along a–d, while Rapier's heightfield splits it along b–c: three grounds that disagree
 *   by up to 1.19 m on a twisted cell. Kept byte-identical for A/B shots (`?terrain=v1`) and tests.
 * - `v2` (the default): one ground. `heightAt`, the drawn mesh and the physics all use the b–c
 *   triangles (from (x+1, z) to (x, z+1)); the later GROUND changes (roads over pads, gentler
 *   flanks, capped road grades) also switch on it.
 *
 * Read once per build: `buildHeightmap` stores it on the heightmap (`hm.profile`) and everything
 * else (the drawn patch, the stamp order) reads it from there, so one world never mixes profiles.
 *
 * Choosing it:
 * - in the game, `?terrain=v1|v2` in the URL;
 * - in Node tools, the environment variable `SKYROME_TERRAIN=v1|v2`;
 * - in tests and tools, `setTerrainProfile('v1')` (and `null` to go back), or
 *   `buildHeightmap(src, { profile: 'v1' })` for one heightmap.
 */
export type TerrainProfile = 'v1' | 'v2';

/** The profile used when nothing chooses one. */
export const DEFAULT_TERRAIN_PROFILE: TerrainProfile = 'v2';

let forced: TerrainProfile | null = null;
/** The URL / environment's choice, read once (undefined = not read yet). */
let chosen: TerrainProfile | null | undefined;

/** 'v1' or 'v2' from a URL parameter or an environment value; anything else is null. */
export function parseTerrainProfile(v: unknown): TerrainProfile | null {
  return v === 'v1' || v === 'v2' ? v : null;
}

function readChoice(): TerrainProfile | null {
  const loc = (globalThis as { location?: { search?: string } }).location;
  if (loc && typeof loc.search === 'string') {
    const q = parseTerrainProfile(new URLSearchParams(loc.search).get('terrain'));
    if (q) return q;
  }
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return parseTerrainProfile(env?.SKYROME_TERRAIN);
}

/** The terrain profile in force: a forced one, else the URL / environment, else the default. */
export function terrainProfile(): TerrainProfile {
  if (forced) return forced;
  if (chosen === undefined) chosen = readChoice();
  return chosen ?? DEFAULT_TERRAIN_PROFILE;
}

/** Force a profile for what is built next (tests, Node tools); null goes back to the URL / default. */
export function setTerrainProfile(p: TerrainProfile | null) {
  forced = p;
  chosen = undefined;
}

/**
 * The diagonal each 2 m cell is split along: 'bc' from (x+1, z) to (x, z+1), as Rapier's
 * heightfield does (v2), or 'ad' from (x, z) to (x+1, z+1), the drawn mesh of v1.
 */
export function drawnDiagonal(p: TerrainProfile): 'ad' | 'bc' {
  return p === 'v1' ? 'ad' : 'bc';
}
