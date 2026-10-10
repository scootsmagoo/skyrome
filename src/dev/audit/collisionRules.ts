/**
 * Collision-against-visuals audit: the pure rules (no three.js, no Rapier), unit-tested in
 * `collisionRules.test.ts`. `collisionAudit.ts` gathers the surfaces in the running game and
 * `scripts/audit/collision.mjs` drives it across the city.
 *
 * A probe column at (x, z) has two lists of up-facing surfaces: what is DRAWN (the three.js
 * triangles, plus the terrain as the GPU triangulates it) and what the player STANDS ON (Rapier
 * colliders). The player walks on the highest collider near the ground and sees the highest drawn
 * surface there; the difference between the two is what the owner sees as "floating" or "sunk".
 */

export interface Surf {
  /** Height of the surface (m). */
  y: number;
  /** Up component of its normal (1 = flat). */
  ny: number;
  /** What made it: a mesh or batch name and material for drawn surfaces, a collider owner and shape for physics. */
  tag: string;
}

export type ColumnKind = 'float' | 'sink' | 'ramp-steps' | 'fallthrough';

export interface ColumnFinding {
  kind: ColumnKind;
  /** Signed physics-minus-visual height at the top (m): + the player floats, − the player sinks. */
  delta: number;
  /** Height of the surface the player stands on (physics top). */
  physY: number;
  /** Height of the surface the player sees (visual top). */
  visY: number;
  /** The physics surface involved. */
  phys: string;
  /** The drawn surface involved. */
  vis: string;
}

export const COLUMN = {
  /** Agreement within this is fine (a tread-wear decal is 4 mm, a kerb 150 mm). */
  tol: 0.04,
  /** Surfaces this far below the terrain still count (basins, sunk floors). */
  below: 1.5,
  /** Surfaces this far above the terrain count as ground the player reaches (not roofs). */
  above: 3.2,
  /** A sloped collider under flat drawn treads, differing by less than this, is a stair ramp. */
  rampStep: 0.13,
  /** A surface is "up-facing" (walkable) from this normal.y. */
  upNy: 0.6,
} as const;

/** Keep the up-facing surfaces inside the ground band around the terrain height, highest first. */
export function groundBand(list: readonly Surf[], terrainY: number, o = COLUMN): Surf[] {
  return list
    .filter((s) => s.ny >= o.upNy && s.y >= terrainY - o.below && s.y <= terrainY + o.above)
    .sort((a, b) => b.y - a.y);
}

/**
 * Compare one probe column. `vis` must already include the terrain's drawn surface; `phys` holds
 * every collider surface the ray crossed (any height: a column with no collider at all down to the
 * safety net is a fall-through). Returns null when the player stands where the picture says.
 */
export function compareColumn(vis: readonly Surf[], phys: readonly Surf[], terrainY: number, o = COLUMN): ColumnFinding | null {
  const v = groundBand(vis, terrainY, o);
  const p = groundBand(phys, terrainY, o);
  if (!v.length) return null; // nothing drawn here (a hole in the picture is another lens)
  const topV = v[0];
  if (!p.length) {
    const any = phys.find((s) => s.ny >= o.upNy);
    return { kind: 'fallthrough', delta: any ? any.y - topV.y : -Infinity, physY: any ? any.y : -Infinity, visY: topV.y, phys: any?.tag ?? 'none', vis: topV.tag };
  }
  const topP = p[0];
  const d = topP.y - topV.y;
  if (Math.abs(d) <= o.tol) return null;
  // A smooth ramp collider under drawn steps: the physics is sloped and the drawn tread is flat, or
  // the other way round, by less than a riser. Walkable by design, but the feet float or sink by it.
  const sloped = (topP.ny < 0.96 && topV.ny > 0.96) || (topV.ny < 0.96 && topP.ny > 0.96);
  if (sloped && Math.abs(d) < o.rampStep) return { kind: 'ramp-steps', delta: d, physY: topP.y, visY: topV.y, phys: topP.tag, vis: topV.tag };
  if (d > 0) return { kind: 'float', delta: d, physY: topP.y, visY: topV.y, phys: topP.tag, vis: topV.tag };
  return { kind: 'sink', delta: d, physY: topP.y, visY: topV.y, phys: topP.tag, vis: topV.tag };
}

export type WallKind = 'invisible' | 'ghost';

export interface WallFinding {
  kind: WallKind;
  /** invisible: how far in front of the drawn surface the collider stops the player (m); ghost: how far past the drawn surface the body passes before anything stops it (m, or Infinity). */
  gap: number;
  /** Distance to the collider (m) or null for none within reach. */
  physDist: number | null;
  /** Distance to the drawn surface (m) or null for none within reach. */
  visDist: number | null;
  phys: string;
  vis: string;
}

export const WALL = {
  /** A collider this far in front of what is drawn is an invisible wall (the capsule radius is 0.35, so 0.25 is already felt). */
  tol: 0.25,
} as const;

/**
 * Compare one horizontal probe: the first collider and the first drawn surface along the ray, with
 * `reach` the length of the ray. Returns null when they agree (or neither is within reach).
 */
export function compareWall(phys: { dist: number; tag: string } | null, vis: { dist: number; tag: string } | null, reach: number, o = WALL): WallFinding | null {
  if (!phys && !vis) return null;
  if (phys && !vis) {
    // Only a collider: an invisible wall unless the ray simply ran out before the drawn wall.
    if (reach - phys.dist <= o.tol) return null;
    return { kind: 'invisible', gap: reach - phys.dist, physDist: phys.dist, visDist: null, phys: phys.tag, vis: 'none' };
  }
  if (vis && !phys) {
    if (reach - vis.dist <= o.tol) return null;
    return { kind: 'ghost', gap: Infinity, physDist: null, visDist: vis.dist, phys: 'none', vis: vis.tag };
  }
  const d = vis!.dist - phys!.dist;
  if (Math.abs(d) <= o.tol) return null;
  if (d > 0) return { kind: 'invisible', gap: d, physDist: phys!.dist, visDist: vis!.dist, phys: phys!.tag, vis: vis!.tag };
  return { kind: 'ghost', gap: -d, physDist: phys!.dist, visDist: vis!.dist, phys: phys!.tag, vis: vis!.tag };
}

/**
 * The height the GPU draws for the terrain inside one heightmap cell. `patchGeometry` (terrain)
 * splits every cell along the a–d diagonal, from (0,0) to (1,1): triangles (a, c, d) and (a, d, b).
 * `tx`, `tz` are the fractions across the cell; h00 is at (0,0), h10 at (1,0), h01 at (0,1), h11 at (1,1).
 */
export function terrainDrawnHeight(h00: number, h10: number, h01: number, h11: number, tx: number, tz: number): number {
  if (tz >= tx) return h00 + (h01 - h00) * tz + (h11 - h01) * tx; // (a, c, d)
  return h00 + (h10 - h00) * tx + (h11 - h10) * tz; // (a, d, b)
}

/** The same cell split along the other diagonal (b–c), for telling which one Rapier's heightfield uses. */
export function terrainOtherHeight(h00: number, h10: number, h01: number, h11: number, tx: number, tz: number): number {
  if (tx + tz <= 1) return h00 + (h10 - h00) * tx + (h01 - h00) * tz; // (a, b, c)
  return h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz); // (b, d, c)
}

/** Bilinear height, what `Heightmap.heightAt` reports (neither triangulation). */
export function terrainBilinear(h00: number, h10: number, h01: number, h11: number, tx: number, tz: number): number {
  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * tz;
}

/** Severity for the report: what a player would notice. */
export function severityOf(kind: ColumnKind | WallKind | 'embedded' | 'headroom', size: number): 'blocker' | 'major' | 'minor' {
  switch (kind) {
    case 'fallthrough':
      return 'blocker';
    case 'float':
    case 'sink':
      return size >= 0.3 ? 'major' : size >= 0.1 ? 'major' : 'minor';
    case 'ramp-steps':
      return 'minor';
    case 'invisible':
      return size >= 1.0 ? 'major' : size >= 0.5 ? 'major' : 'minor';
    case 'ghost':
      return size >= 0.5 ? 'major' : 'minor';
    case 'embedded':
      return 'major';
    case 'headroom':
      return 'minor';
  }
}
