/**
 * Collision-against-visuals audit: the pure rules (no three.js, no Rapier), unit-tested in
 * `collisionRules.test.ts`. `collisionAudit.ts` gathers the surfaces in the running game and
 * `scripts/audit/collision.mjs` drives it across the city.
 *
 * A probe column at (x, z) has two lists of surfaces: what is DRAWN (the three.js triangles, plus
 * the terrain as the GPU triangulates it) and what the player STANDS ON (Rapier colliders). The
 * player walks on the highest collider near the ground and sees the highest drawn surface there
 * that is not overhead (a gallery floor, an awning or a lintel the player walks under); the
 * difference between the two is what the owner sees as "floating" or "sunk", or what the body
 * feels as an invisible ledge or a solid it passes through.
 */

export interface Surf {
  /** Height of the surface (m). */
  y: number;
  /**
   * Up component of its normal (1 = flat, facing up). Drawn hits carry the triangle's own facing
   * (winding), so the underside of a slab or a ceiling is negative; physics hits the collider's.
   */
  ny: number;
  /** What made it: a mesh or batch name and material for drawn surfaces, a collider owner and shape for physics. */
  tag: string;
  /** Which piece or collider exactly (instance, handle key): groups findings by their cause. */
  key?: string;
}

/**
 * float     the collider is above the drawn ground by less than a step: the feet hover
 * ledge     the collider is above the drawn ground by more than a step: an invisible block or shelf
 * sink      the drawn ground is above the collider by less than a step: the feet sink into a drawn kerb, step or plinth
 * ghost     the drawn thing is above the collider by more than a step and is not overhead: the body passes through it
 * ramp-steps a smooth ramp collider under drawn treads (or a stepped collider under a drawn ramp), by less than a riser
 * low-overhead a drawn slab (a lintel, a landing) with no collider whose underside is at head height: the head clips into it
 * fallthrough nothing to stand on in the ground band under a drawn floor
 */
export type ColumnKind = 'float' | 'ledge' | 'sink' | 'ghost' | 'low-overhead' | 'ramp-steps' | 'fallthrough';

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
  physKey?: string;
  visKey?: string;
}

export const COLUMN = {
  /** Agreement within this is fine (a tread-wear decal is 4 mm, a kerb 150 mm). */
  tol: 0.04,
  /** Surfaces this far below the terrain still count (basins, sunk floors). */
  below: 1.5,
  /** Surfaces this far above the terrain count as ground the player reaches (not roofs). */
  above: 3.2,
  /** Slack on the band's edges so a surface exactly at the edge is not in for one list and out for the other. */
  edge: 0.05,
  /** A sloped collider under flat drawn treads, differing by less than this, is a stair ramp. */
  rampStep: 0.13,
  /** A surface is "up-facing" (walkable) from this normal.y. */
  upNy: 0.6,
  /** Up to this the controller's step-up takes a ledge in stride (traversal.ts STEP_ASSIST_MAX 0.3, CLIMB.minRise 0.32). */
  step: 0.32,
  /** Room a player needs under something overhead (capsule 1.8 m plus a margin). */
  headroom: 1.9,
  /** The player's capsule height: open space this tall under a drawn surface lets the body pass under it. */
  body: 1.8,
  /** An underside from this height up to `body` only clips the head (a low lintel), it does not stop the body. */
  lowHead: 1.4,
  /** An underside this close below a drawn top makes it a slab (a floor, a lintel), not a solid block. */
  slab: 1.2,
} as const;

/** Keep the up-facing surfaces inside the ground band around the terrain height, highest first. */
export function groundBand(list: readonly Surf[], terrainY: number, o = COLUMN): Surf[] {
  return list
    .filter((s) => s.ny >= o.upNy && s.y >= terrainY - o.below - o.edge && s.y <= terrainY + o.above + o.edge)
    .sort((a, b) => b.y - a.y);
}

/**
 * Is the drawn up-facing surface `top` overhead for a player standing at `floorY`: at least the
 * body's height (`body`, the capsule's 1.8 m) above the floor, and either a slab (an underside
 * within `slab` m below it, itself at body height or above: a gallery floor, a lintel) or with
 * nothing drawn between the floor and body height (a roof plane, an awning, a canopy)? A drawn solid standing on the floor (a statue, a
 * counter) has surfaces in that space and is not overhead.
 */
export function isOverhead(top: Surf, all: readonly Surf[], floorY: number, o = COLUMN): boolean {
  if (top.y < floorY + o.body) return false;
  for (const s of all) {
    if (s.ny > -0.3) continue;
    if (s.y > top.y + 1e-3 || top.y - s.y > o.slab) continue;
    if (s.y >= floorY + o.body) return true;
  }
  for (const s of all) if (s.y > floorY + o.tol && s.y < floorY + o.body) return false;
  return true;
}

/**
 * Compare one probe column. `vis` must already include the terrain's drawn surface and may hold
 * down-facing hits (undersides); `phys` holds every collider surface the ray crossed (any height:
 * a column with no collider at all down to the safety net is a fall-through). Returns null when
 * the player stands where the picture says.
 */
export function compareColumn(vis: readonly Surf[], phys: readonly Surf[], terrainY: number, o = COLUMN): ColumnFinding | null {
  const p = groundBand(phys, terrainY, o);
  const vAll = groundBand(vis, terrainY, o);
  if (!vAll.length) return null; // nothing drawn here (a hole in the picture is another lens)
  if (!p.length) {
    const topV = vAll[0];
    const any = phys.find((s) => s.ny >= o.upNy);
    return { kind: 'fallthrough', delta: any ? any.y - topV.y : -Infinity, physY: any ? any.y : -Infinity, visY: topV.y, phys: any?.tag ?? 'none', vis: topV.tag, physKey: any?.key, visKey: topV.key };
  }
  const topP = p[0];
  // What the player sees at their own level: overhead slabs (a gallery floor, a lintel) do not count.
  const v = vAll.filter((s) => !isOverhead(s, vis, topP.y, o));
  if (!v.length) return null;
  const topV = v[0];
  const d = topP.y - topV.y;
  if (Math.abs(d) <= o.tol) return null;
  const base = { delta: d, physY: topP.y, visY: topV.y, phys: topP.tag, vis: topV.tag, physKey: topP.key, visKey: topV.key };
  // A smooth ramp collider under drawn steps: the physics is sloped and the drawn tread is flat, or
  // the other way round, by less than a riser. Walkable by design, but the feet float or sink by it.
  const sloped = (topP.ny < 0.96 && topV.ny > 0.96) || (topV.ny < 0.96 && topP.ny > 0.96);
  if (sloped && Math.abs(d) < o.rampStep) return { kind: 'ramp-steps', ...base };
  if (d > 0) return { kind: d > o.step ? 'ledge' : 'float', ...base };
  if (-d > o.step && lowSlab(topV, vis, topP.y, o)) return { kind: 'low-overhead', ...base };
  return { kind: -d > o.step ? 'ghost' : 'sink', ...base };
}

/** A drawn slab over the floor whose underside is at head height (above `lowHead`, below the body's height). */
export function lowSlab(top: Surf, all: readonly Surf[], floorY: number, o = COLUMN): boolean {
  for (const s of all) {
    if (s.ny > -0.3 || s.y > top.y + 1e-3 || top.y - s.y > o.slab) continue;
    if (s.y >= floorY + o.lowHead && s.y < floorY + o.body) return true;
  }
  return false;
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
  physKey?: string;
  visKey?: string;
}

export const WALL = {
  /** A collider this far in front of what is drawn is an invisible wall (the capsule radius is 0.35, so 0.25 is already felt). */
  tol: 0.25,
} as const;

/**
 * Compare one horizontal probe: the first collider and the first drawn surface along the ray, with
 * `reach` the length of the ray. Returns null when they agree (or neither is within reach).
 */
export function compareWall(phys: { dist: number; tag: string; key?: string } | null, vis: { dist: number; tag: string; key?: string } | null, reach: number, o = WALL): WallFinding | null {
  if (!phys && !vis) return null;
  const keys = { physKey: phys?.key, visKey: vis?.key };
  if (phys && !vis) {
    // Only a collider: an invisible wall unless the ray simply ran out before the drawn wall.
    if (reach - phys.dist <= o.tol) return null;
    return { kind: 'invisible', gap: reach - phys.dist, physDist: phys.dist, visDist: null, phys: phys.tag, vis: 'none', ...keys };
  }
  if (vis && !phys) {
    if (reach - vis.dist <= o.tol) return null;
    return { kind: 'ghost', gap: Infinity, physDist: null, visDist: vis.dist, phys: 'none', vis: vis.tag, ...keys };
  }
  const d = vis!.dist - phys!.dist;
  if (Math.abs(d) <= o.tol) return null;
  if (d > 0) return { kind: 'invisible', gap: d, physDist: phys!.dist, visDist: vis!.dist, phys: phys!.tag, vis: vis!.tag, ...keys };
  return { kind: 'ghost', gap: -d, physDist: phys!.dist, visDist: vis!.dist, phys: phys!.tag, vis: vis!.tag, ...keys };
}

/**
 * Seams along a walking line: heights of the collider the walker follows and of the drawn ground,
 * sampled every few centimetres. A step in the collider where the picture is smooth is an invisible
 * lip (or a crack between two collider pieces) that catches the capsule's foot; a drawn step over a
 * smooth collider is only a look (the feet float over the riser), reported as `drawn-step`.
 */
export interface SeamFinding {
  kind: 'lip' | 'crack' | 'drawn-step';
  /** Index of the sample after the seam. */
  at: number;
  /** Physics rise and drawn rise across the seam (m). */
  dPhys: number;
  dVis: number;
}

export const SEAM = {
  /** A collider step under this is depenetration noise. */
  lip: 0.03,
  /** A drawn step from this is a visible riser or kerb. */
  riser: 0.06,
  /** Steps over this are walls or ledges (the column probes and the wall rays report them). */
  max: 0.6,
  /** A dip of at least this between two samples at the same height is a crack. */
  crack: 0.04,
  /** A physics step and a drawn step this many samples apart are the same kerb (0.1 m samples: 0.2 m). */
  win: 2,
} as const;

/**
 * `phys` and `vis` are heights along one line at equal spacing (null where nothing was found).
 * A step in one list is matched with a step of the same sign and about the same size in the other
 * within `win` samples (a kerb drawn and collided a few centimetres apart is fine).
 */
export function findSeams(phys: readonly (number | null)[], vis: readonly (number | null)[], o = SEAM): SeamFinding[] {
  const out: SeamFinding[] = [];
  const n = Math.min(phys.length, vis.length);
  const dOf = (list: readonly (number | null)[], i: number) => (i > 0 && i < n && list[i] !== null && list[i - 1] !== null ? list[i]! - list[i - 1]! : null);
  const matched = (other: readonly (number | null)[], i: number, d: number, min: number) => {
    for (let j = Math.max(1, i - o.win); j <= Math.min(n - 1, i + o.win); j++) {
      const e = dOf(other, j);
      if (e !== null && Math.sign(e) === Math.sign(d) && Math.abs(e) >= min && Math.abs(e - d) <= Math.max(0.03, 0.35 * Math.abs(d))) return true;
    }
    return false;
  };
  for (let i = 1; i < n; i++) {
    const dp = dOf(phys, i), dv = dOf(vis, i);
    if (dp === null || dv === null) continue;
    // A crack: one sample drops and the next comes back, while the picture stays level.
    const dp2 = dOf(phys, i + 1), dv2 = dOf(vis, i + 1);
    if (dp2 !== null && dv2 !== null && -dp >= o.crack && dp2 >= o.crack && Math.abs(dv) < o.lip && Math.abs(dv2) < o.lip) {
      out.push({ kind: 'crack', at: i, dPhys: +(-Math.min(-dp, dp2)).toFixed(3), dVis: +dv.toFixed(3) });
      i++;
      continue;
    }
    if (Math.abs(dp) >= o.lip && Math.abs(dp) < o.max && !matched(vis, i, dp, o.lip)) out.push({ kind: 'lip', at: i, dPhys: +dp.toFixed(3), dVis: +dv.toFixed(3) });
    else if (Math.abs(dv) >= o.riser && Math.abs(dv) < o.max && !matched(phys, i, dv, o.lip)) out.push({ kind: 'drawn-step', at: i, dPhys: +dp.toFixed(3), dVis: +dv.toFixed(3) });
  }
  return out;
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

export type Severity = 'blocker' | 'major' | 'minor';

/**
 * Severity for the report: what a player would notice. `size` is the height or gap (m), `area` the
 * number of 1 m probes the defect covers.
 */
export function severityOf(kind: ColumnKind | WallKind | 'embedded' | 'headroom' | SeamFinding['kind'], size: number, area = 1): Severity {
  switch (kind) {
    case 'fallthrough':
      return 'blocker';
    case 'ledge':
    case 'ghost':
      return size >= 0.6 || area >= 4 ? 'major' : 'minor';
    case 'float':
    case 'sink':
      return size >= 0.12 && area >= 2 ? 'major' : 'minor';
    case 'ramp-steps':
    case 'drawn-step':
    case 'low-overhead':
      return 'minor';
    case 'invisible':
      return size >= 0.5 ? 'major' : 'minor';
    case 'embedded':
      return area >= 3 ? 'major' : 'minor';
    case 'lip':
    case 'crack':
      return size >= 0.1 ? 'major' : 'minor';
    case 'headroom':
      return 'minor';
  }
}
