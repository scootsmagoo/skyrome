/**
 * Minimap geometry (pure). The minimap is a disc centred on the player; with `rotate` the view's
 * heading points up (GTA-style), otherwise north is up. World axes: +x east, +z south. Screen: +x
 * right, +y down.
 *
 * A world offset (dx, dz) from the player goes to the screen as the clockwise rotation by −heading:
 *   sx = (dx·cos h + dz·sin h)·scale,  sy = (−dx·sin h + dz·cos h)·scale
 * so a target on bearing h (dx = sin h, dz = −cos h) lands straight up.
 */

export interface MiniView {
  /** Player position (game m). */
  px: number;
  pz: number;
  /** cos/sin of the heading (radians) the view is turned by (0 when north is up). */
  cos: number;
  sin: number;
  /** Screen px per game metre. */
  scale: number;
  /** Disc centre and radius in screen px. */
  cx: number;
  cy: number;
  r: number;
}

export function miniView(): MiniView {
  return { px: 0, pz: 0, cos: 1, sin: 0, scale: 1, cx: 0, cy: 0, r: 1 };
}

/** Set the view: `headingDeg` is the compass bearing of the view (ignored when `northUp`). */
export function setMiniView(v: MiniView, px: number, pz: number, headingDeg: number, northUp: boolean, scale: number, cx: number, cy: number, r: number): MiniView {
  const h = northUp ? 0 : (headingDeg * Math.PI) / 180;
  v.px = px;
  v.pz = pz;
  v.cos = Math.cos(h);
  v.sin = Math.sin(h);
  v.scale = scale;
  v.cx = cx;
  v.cy = cy;
  v.r = r;
  return v;
}

export interface XY {
  x: number;
  y: number;
}

/** World (x, z) to screen px. Writes and returns `out`. */
export function toDisc(v: MiniView, x: number, z: number, out: XY): XY {
  const dx = x - v.px;
  const dz = z - v.pz;
  out.x = v.cx + (dx * v.cos + dz * v.sin) * v.scale;
  out.y = v.cy + (-dx * v.sin + dz * v.cos) * v.scale;
  return out;
}

/**
 * The canvas transform (a, b, c, d, e, f for setTransform) that draws world metres the same way,
 * `k` extra scale for device pixels.
 */
export function discTransform(v: MiniView, k: number, out: number[]): number[] {
  const s = v.scale * k;
  const a = v.cos * s;
  const b = -v.sin * s;
  const c = v.sin * s;
  const d = v.cos * s;
  out[0] = a;
  out[1] = b;
  out[2] = c;
  out[3] = d;
  out[4] = v.cx * k - (a * v.px + c * v.pz);
  out[5] = v.cy * k - (b * v.px + d * v.pz);
  return out;
}

/**
 * Pull a screen point onto the rim (radius `r` from the centre) when it lies beyond it. Returns
 * true if it was moved; `out.x/out.y` hold the result.
 */
export function clampToRim(v: MiniView, p: XY, r: number): boolean {
  const dx = p.x - v.cx;
  const dy = p.y - v.cy;
  const d = Math.hypot(dx, dy);
  if (d <= r || d < 1e-6) return false;
  p.x = v.cx + (dx / d) * r;
  p.y = v.cy + (dy / d) * r;
  return true;
}

/** Tiles (index ranges, inclusive) covering a disc of `radius` m round (x, z), tiles `tile` m square. */
export function tileRange(x: number, z: number, radius: number, tile: number, out: number[]): number[] {
  out[0] = Math.floor((x - radius) / tile);
  out[1] = Math.floor((x + radius) / tile);
  out[2] = Math.floor((z - radius) / tile);
  out[3] = Math.floor((z + radius) / tile);
  return out;
}

/** Shortest signed difference a − b in degrees, in (−180, 180]. */
export function angleDelta(a: number, b: number): number {
  let d = (a - b) % 360;
  if (d <= -180) d += 360;
  if (d > 180) d -= 360;
  return d;
}
