/**
 * Map view transform (pure): a center in game meters plus a scale in screen px per game meter.
 * Screen x grows east, screen y grows south (north up).
 */

export interface MapView {
  cx: number;
  cz: number;
  /** Screen pixels per game meter. */
  scale: number;
}

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function worldToScreen(v: MapView, vw: number, vh: number, x: number, z: number): [number, number] {
  return [(x - v.cx) * v.scale + vw / 2, (z - v.cz) * v.scale + vh / 2];
}

export function screenToWorld(v: MapView, vw: number, vh: number, sx: number, sy: number): [number, number] {
  return [(sx - vw / 2) / v.scale + v.cx, (sy - vh / 2) / v.scale + v.cz];
}

/** Scale that fits the bounds inside the viewport with `pad` pixels of margin. */
export function fitScale(b: Bounds, vw: number, vh: number, pad = 0): number {
  const w = Math.max(1, b.maxX - b.minX);
  const h = Math.max(1, b.maxZ - b.minZ);
  return Math.min((vw - pad * 2) / w, (vh - pad * 2) / h);
}

/** Zoom by `factor` keeping the world point under (sx, sy) fixed on screen. */
export function zoomAt(v: MapView, factor: number, sx: number, sy: number, vw: number, vh: number, minScale: number, maxScale: number): MapView {
  const scale = Math.min(maxScale, Math.max(minScale, v.scale * factor));
  const [wx, wz] = screenToWorld(v, vw, vh, sx, sy);
  // After zooming, wx must map back to sx.
  return { scale, cx: wx - (sx - vw / 2) / scale, cz: wz - (sy - vh / 2) / scale };
}

/** Pan by a screen-space delta. */
export function panBy(v: MapView, dx: number, dy: number): MapView {
  return { ...v, cx: v.cx - dx / v.scale, cz: v.cz - dy / v.scale };
}

/**
 * Keep the visible area over the map: when the map is larger than the viewport the edges may not
 * come inside it; when smaller, the map is centered.
 */
export function clampView(v: MapView, b: Bounds, vw: number, vh: number): MapView {
  const halfW = vw / 2 / v.scale;
  const halfH = vh / 2 / v.scale;
  const clampAxis = (c: number, lo: number, hi: number, half: number) =>
    hi - lo <= half * 2 ? (lo + hi) / 2 : Math.min(hi - half, Math.max(lo + half, c));
  return { ...v, cx: clampAxis(v.cx, b.minX, b.maxX, halfW), cz: clampAxis(v.cz, b.minZ, b.maxZ, halfH) };
}

/** Pick a 'nice' scale-bar length (1/2/5 × 10^n) close to `targetPx` on screen. */
export function niceScaleBar(scale: number, targetPx: number, unit = 1): { length: number; px: number } {
  const raw = targetPx / scale / unit;
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const steps = [1, 2, 5, 10];
  let best = pow;
  for (const s of steps) if (s * pow <= raw) best = s * pow;
  return { length: best, px: best * unit * scale };
}

/** Rotate a local shape point by a compass bearing (degrees, clockwise) — atlas convention. */
export function rotateLocal(lx: number, lz: number, bearingDeg: number): [number, number] {
  const t = (bearingDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return [lx * c - lz * s, lx * s + lz * c];
}
