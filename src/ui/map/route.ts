/**
 * The quest route on a map canvas (the big map and the minimap): a red line with a pale casing,
 * like a route inked on a plan, from where the player stands on to the objective (or the door on
 * the way). Drawn straight on the context's current path, so a redraw allocates nothing.
 */
import type { MapRouteView } from '../types';

export interface RouteStyle {
  /** Line width in screen px. */
  width: number;
  /** Extra casing on each side, screen px. */
  casing: number;
}

export const ROUTE_INK = '#a3271c';
export const ROUTE_CASING = 'rgba(252, 244, 222, 0.92)';

/**
 * Stroke the legs walked in `place` (null = outside) with the context in world units (game m),
 * `scale` screen px per metre. The first leg starts at `route.along`. Returns how many legs it drew.
 */
export function drawRoute(ctx: CanvasRenderingContext2D, route: MapRouteView, place: string | null, scale: number, st: RouteStyle): number {
  let drawn = 0;
  ctx.beginPath();
  for (let li = 0; li < route.legs.length; li++) {
    const leg = route.legs[li];
    if (leg.cell !== place) continue;
    const { pts, n, cum } = leg.line;
    if (n < 2) continue;
    let i = 0;
    if (li === 0 && route.along > 0) {
      // Start where the player stands: inside the segment that holds `along`.
      while (i < n - 2 && cum[i + 1] <= route.along) i++;
      const len = cum[i + 1] - cum[i];
      const t = len > 1e-6 ? Math.min(1, Math.max(0, (route.along - cum[i]) / len)) : 0;
      ctx.moveTo(pts[i * 3] + (pts[i * 3 + 3] - pts[i * 3]) * t, pts[i * 3 + 2] + (pts[i * 3 + 5] - pts[i * 3 + 2]) * t);
    } else ctx.moveTo(pts[0], pts[2]);
    for (let k = i + 1; k < n; k++) ctx.lineTo(pts[k * 3], pts[k * 3 + 2]);
    drawn++;
  }
  if (!drawn) return 0;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = ROUTE_CASING;
  ctx.lineWidth = (st.width + st.casing * 2) / scale;
  ctx.stroke();
  ctx.strokeStyle = ROUTE_INK;
  ctx.lineWidth = st.width / scale;
  ctx.stroke();
  return drawn;
}
