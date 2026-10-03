/**
 * Debug helpers for the city (exposed as `window.__city` / `window.__cityBreakdown`): draw calls
 * and triangles per family of objects, measured by rendering the current view with each family
 * hidden in turn (shadow pass included, like `game.stats`).
 */
import type * as THREE from 'three';
import type { Game } from '../../core/Game';

export function renderBreakdown(game: Game, families: Record<string, () => THREE.Object3D[]>) {
  const r = game.renderer;
  const info = r.info;
  const render = () => {
    r.render(game.scene, game.camera);
    return { calls: info.render.calls, tris: info.render.triangles };
  };
  const total = render();
  const out: Record<string, { calls: number; tris: number }> = { total };
  let restCalls = total.calls, restTris = total.tris;
  for (const [k, get] of Object.entries(families)) {
    const objs = get().filter((o) => o.visible);
    for (const o of objs) o.visible = false;
    const t = render();
    for (const o of objs) o.visible = true;
    out[k] = { calls: total.calls - t.calls, tris: total.tris - t.tris };
    restCalls -= out[k].calls;
    restTris -= out[k].tris;
  }
  out.other = { calls: restCalls, tris: restTris };
  return out;
}
