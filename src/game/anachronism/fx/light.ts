/**
 * One light for every flash of the guns (muzzle, back-blast, rocket in flight, explosion), taken from
 * the light pool once and kept while the cheat is on. A fresh pool request takes a moment to get a
 * real light and fades in over a sixth of a second, which a 60 ms muzzle flash would never outlast; a
 * held request sits at a whisper of intensity (it keeps its slot) and is driven here every frame.
 * The brightest of the four contributors wins the light.
 */
import * as THREE from 'three';
import type { Game } from '../../../core/Game';
import type { LightHandle } from '../../../world/lights/LightPool';

const IDLE = 0.0005;

interface Pulse {
  peak: number;
  t: number;
  dur: number;
  r: number;
  g: number;
  b: number;
  x: number;
  y: number;
  z: number;
}

const pulse = (): Pulse => ({ peak: 0, t: 1, dur: 1, r: 1, g: 1, b: 1, x: 0, y: 0, z: 0 });

export class FxLight {
  private handle: LightHandle | null = null;
  private readonly flashP = pulse();
  private readonly blastP = pulse();
  private rocketUp = false;
  private rocketAt = new THREE.Vector3();
  private rocketFresh = 0;
  private idleFor = 0;
  private lastColor = -1;
  private time = 0;

  constructor(private readonly game: Game) {}

  /** A short flash (muzzle, back-blast): `peak` intensity falling to nothing over `dur` seconds. */
  flash(peak: number, dur: number, r: number, g: number, b: number, x: number, y: number, z: number, _kind: number) {
    const p = this.flashP;
    // By day a flash hardly shows on the ground; at night it lights the street.
    peak *= this.dark();
    // A new flash is never dimmer than what is still fading.
    if (peak < this.level(p) && p.t < p.dur) return;
    Object.assign(p, { peak, t: 0, dur, r, g, b, x, y, z });
    this.ensure(x, y, z);
  }

  /** A blast: bright at once, fading over most of a second. */
  blast(peak: number, x: number, y: number, z: number) {
    if (peak <= 0) return;
    peak *= this.dark();
    Object.assign(this.blastP, { peak, t: 0, dur: 0.9, r: 1, g: 0.68, b: 0.38, x, y, z });
    this.ensure(x, y, z);
  }

  /** 0.3 in full daylight, 1 at night. */
  private dark(): number {
    return 0.3 + 0.7 * (1 - (this.game.sky?.daylight ?? 1));
  }

  rocketOn(on: boolean) {
    this.rocketUp = on;
    if (!on) this.rocketFresh = 0;
  }

  rocket(x: number, y: number, z: number) {
    this.rocketAt.set(x, y, z);
    this.rocketFresh = 0.1;
    this.ensure(x, y, z);
  }

  private level(p: Pulse): number {
    if (p.t >= p.dur) return 0;
    const u = p.t / p.dur;
    return p.peak * (1 - u) * (1 - u);
  }

  private ensure(x: number, y: number, z: number) {
    if (this.handle?.alive) return;
    this.handle = this.game.lights.request({ position: { x, y, z }, color: 0xffb060, intensity: IDLE, distance: 36, dayScale: 1, priority: 6, glow: 0 });
    this.idleFor = 0;
  }

  update(dt: number, armed: boolean) {
    this.time += dt;
    const h = this.handle;
    if (!h || !h.alive) return;
    const f = this.flashP;
    const b = this.blastP;
    f.t += dt;
    b.t += dt;
    this.rocketFresh -= dt;
    const lf = this.level(f);
    const lb = this.level(b);
    const lr = this.rocketUp && this.rocketFresh > 0 ? 55 * this.dark() * (0.85 + 0.15 * Math.sin(this.time * 47)) : 0;
    const top = Math.max(lf, lb, lr);
    if (top <= 0) {
      h.setIntensity(IDLE);
      this.idleFor += dt;
      // The cheat is off and quiet: give the slot back.
      if (!armed && this.idleFor > 1.5) this.release();
      return;
    }
    this.idleFor = 0;
    const src = top === lb ? b : top === lf ? f : null;
    if (src) {
      h.setPosition(src);
      const key = ((src.r * 255) << 16) | ((src.g * 255) << 8) | (src.b * 255);
      if (key !== this.lastColor) {
        this.lastColor = key;
        h.setColor(key);
      }
    } else {
      h.setPosition(this.rocketAt);
      if (this.lastColor !== 0xff9a4a) {
        this.lastColor = 0xff9a4a;
        h.setColor(0xff9a4a);
      }
    }
    h.setIntensity(top);
  }

  release() {
    this.handle?.remove();
    this.handle = null;
    this.flashP.t = this.blastP.t = 9;
    this.rocketUp = false;
    this.lastColor = -1;
  }
}
