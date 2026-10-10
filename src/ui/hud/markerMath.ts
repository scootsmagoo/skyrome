/**
 * Where a world point lands on screen for an overlay marker (the quest guide's chevron), whatever
 * the camera's depth convention (pure).
 *
 * Why this exists: the marker used to decide "behind the camera" from the projected depth
 * (`v.project(cam).z > 1`). That holds for the standard depth range, but the game renders with a
 * reversed depth buffer (src/gfx/depth.ts, three's `camera.reversedDepth`), where a point behind
 * the camera projects to z < 0, never > 1. A target behind the player was then drawn mirrored
 * through the screen centre: straight ahead. The owner ran toward it, the distance grew, and the
 * compass (which uses bearings) said behind. The test here is on the camera-space z, which means
 * the same thing under either convention.
 */

/** Screen margins (px) the marker keeps from each window edge. */
export interface MarkerBox {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface ScreenMarker {
  /** Screen position in px (top-left origin). */
  x: number;
  y: number;
  /** Riding the edge of the screen (the target is off screen or behind). */
  edge: boolean;
  /** The target is behind the camera (or level with it). */
  behind: boolean;
  /** The side a behind target rides: −1 left, 1 right (kept between calls to stop it flickering). */
  side: -1 | 1;
  /** CSS rotation (degrees) that turns a downward-pointing chevron toward the target (0 on screen). */
  angle: number;
}

export function screenMarker(): ScreenMarker {
  return { x: 0, y: 0, edge: false, behind: false, side: 1, angle: 0 };
}

/**
 * Place a marker for a point given in CAMERA space (the camera looks down −z, +y up, +x right).
 * `p00`, `p11` are the projection's x and y scales (projectionMatrix.elements[0] and [5]), and
 * `p08`, `p09` its off-centre terms (elements[8], [9]; 0 for a symmetric frustum). Writes `out`,
 * whose `side` should be the previous call's result: a target almost straight behind keeps riding
 * the side it was on instead of jumping across the screen.
 */
export function placeMarker(out: ScreenMarker, cx: number, cy: number, cz: number, p00: number, p11: number, p08: number, p09: number, w: number, h: number, box: MarkerBox): ScreenMarker {
  const x0 = box.left;
  const x1 = w - box.right;
  const y0 = box.top;
  const y1 = h - box.bottom;
  const mx = w / 2;
  const my = h / 2;
  // In front: a real projection. Within a hair of the camera plane or behind it, the projection
  // is meaningless (it flips through the centre), so the marker goes to a side edge instead.
  const depth = -cz;
  if (depth > 1e-3 && depth > Math.abs(cx) * 0.02) {
    const nx = (p00 * cx + p08 * cz) / depth;
    const ny = (p11 * cy + p09 * cz) / depth;
    let sx = (nx * 0.5 + 0.5) * w;
    let sy = (-ny * 0.5 + 0.5) * h;
    out.behind = false;
    if (sx >= x0 && sx <= x1 && sy >= y0 && sy <= y1) {
      out.x = sx;
      out.y = sy;
      out.edge = false;
      out.angle = 0;
      out.side = sx < mx ? -1 : 1;
      return out;
    }
    // Off screen in front: slide toward the centre along the line to it until inside the box, so
    // the marker sits on the edge in the target's direction.
    const dx = sx - mx;
    const dy = sy - my;
    let t = 1;
    if (sx < x0) t = Math.min(t, (x0 - mx) / dx);
    if (sx > x1) t = Math.min(t, (x1 - mx) / dx);
    if (sy < y0) t = Math.min(t, (y0 - my) / dy);
    if (sy > y1) t = Math.min(t, (y1 - my) / dy);
    sx = mx + dx * t;
    sy = my + dy * t;
    out.x = sx;
    out.y = sy;
    out.edge = true;
    out.side = dx < 0 ? -1 : 1;
    out.angle = chevronAngle(dx, dy);
    return out;
  }
  // Behind (or beside): ride the left or right edge, on the side to turn toward. Straight behind
  // (|x| small next to the depth) keeps the previous side.
  out.behind = true;
  out.edge = true;
  if (Math.abs(cx) > Math.abs(cz) * 0.18 + 0.05) out.side = cx < 0 ? -1 : 1;
  out.x = out.side < 0 ? x0 : x1;
  // A little below the middle: under the horizon reads as "turn round", not "up there".
  out.y = Math.max(y0, Math.min(y1, my + (y1 - my) * 0.35));
  out.angle = out.side < 0 ? 90 : -90;
  return out;
}

/** CSS rotation (degrees) that turns a chevron pointing down (+y) toward the screen direction (dx, dy). */
export function chevronAngle(dx: number, dy: number): number {
  return (Math.atan2(-dx, dy) * 180) / Math.PI;
}

/**
 * The compass's end for a pinned marker (the tracked quest) at relative bearing `rel` (degrees,
 * −180..180, positive = right): the nearer end, but a target within `band` degrees of straight
 * behind keeps the end it was on (`prev`), so walking straight away doesn't flip it from end to end.
 */
export function pinnedSide(rel: number, prev: -1 | 1 | 0, band = 12): -1 | 1 {
  if (prev !== 0 && Math.abs(rel) > 180 - band) return prev;
  return rel < 0 ? -1 : 1;
}
