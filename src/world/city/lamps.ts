/**
 * CityLamps: the city's torches and lamps as light-pool requests (`game.lights`), made only for
 * the lamps within `radius` of the camera (and dropped beyond 1.3 × that), so the pool's per-frame
 * work stays at a few hundred requests however large the city is. The pool itself picks the eight
 * nearest for real PointLights; the rest show as glow sprites. Lamps are `night` lamps: lit at
 * dusk, out after dawn (the 04:30 arrival sees them all burning).
 *
 * Lamps are kept in a hash of 64 m cells; the camera's neighbourhood is re-evaluated every few
 * frames or when it has moved more than 8 m.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import type { LightHandle, LightRequest } from '../../world/lights/LightPool';
import type { LampDef, LampKind } from './life';

const CELL = 64;

const STYLE: Record<LampKind, Omit<LightRequest, 'position'>> = {
  torch: { color: 0xff8f3e, intensity: 9, distance: 10, flicker: 0.45, night: true, glow: 0.3, glowIntensity: 1 },
  stall: { color: 0xffa255, intensity: 5, distance: 7, flicker: 0.2, night: true, glow: 0.18, priority: 0.7 },
  shrine: { color: 0xff9a4a, intensity: 6, distance: 7, flicker: 0.25, night: true, glow: 0.22, priority: 1.2 },
  fountain: { color: 0xffa255, intensity: 7, distance: 9, flicker: 0.3, night: true, glow: 0.24 },
};

export class CityLamps implements System {
  readonly name = 'cityLamps';
  readonly priority = 97;
  private cells = new Map<string, LampDef[]>();
  private live = new Map<LampDef, LightHandle>();
  private last = new THREE.Vector3(Infinity, 0, 0);
  private frame = 0;
  total = 0;

  constructor(private readonly game: Game, private readonly radius = 150) {}

  add(l: LampDef) {
    const k = `${Math.floor(l.x / CELL)},${Math.floor(l.z / CELL)}`;
    const list = this.cells.get(k);
    if (list) list.push(l);
    else this.cells.set(k, [l]);
    this.total++;
  }

  /** Requests currently held. */
  get active() {
    return this.live.size;
  }

  lateUpdate() {
    const pool = this.game.lights;
    if (!pool) return;
    const cam = this.game.camera.position;
    this.frame++;
    if (this.frame % 12 !== 0 && cam.distanceToSquared(this.last) < 64) return;
    this.last.copy(cam);
    const s = this.game.world?.distanceScale ?? 1;
    const r = this.radius * s, drop = r * 1.3;
    // Drop far lamps.
    for (const [l, h] of this.live) {
      if (Math.hypot(l.x - cam.x, l.z - cam.z) > drop) {
        h.remove();
        this.live.delete(l);
      }
    }
    // Request lamps in range.
    const c0x = Math.floor((cam.x - r) / CELL), c1x = Math.floor((cam.x + r) / CELL);
    const c0z = Math.floor((cam.z - r) / CELL), c1z = Math.floor((cam.z + r) / CELL);
    for (let cx = c0x; cx <= c1x; cx++)
      for (let cz = c0z; cz <= c1z; cz++) {
        for (const l of this.cells.get(`${cx},${cz}`) ?? []) {
          if (this.live.has(l) || Math.hypot(l.x - cam.x, l.z - cam.z) > r) continue;
          this.live.set(l, pool.request({ position: { x: l.x, y: l.y, z: l.z }, ...STYLE[l.kind] }));
        }
      }
  }

  dispose() {
    for (const h of this.live.values()) h.remove();
    this.live.clear();
  }
}
