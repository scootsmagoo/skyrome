/**
 * Light pool: any number of light REQUESTS, a fixed number of real PointLights.
 *
 *   const torch = game.lights.request({ position, color: 0xff9a4a, intensity: 14, distance: 12, flicker: true, night: true });
 *   torch.setPosition(p);   // moving lights (carried torches) just update the position
 *   torch.remove();
 *
 * Three.js compiles the light count into every shader, so the scene always holds exactly `count`
 * PointLights (unused ones at intensity 0): adding or removing lamps never recompiles shaders.
 * The nearest / most important requests get the real lights (with hysteresis and short fades so
 * swaps don't pop); every request also gets an additive glow sprite (its visible flame halo).
 * `night: true` lamps follow the sky's lamp factor and are lit one by one at dusk.
 */
import * as THREE from 'three';
import type { Game, System } from '../../core/Game';
import { GlowSprites } from './GlowSprites';
import { flicker, lampLevel, seed01, selectLights, type Candidate } from './logic';

declare module '../../core/Game' {
  interface Game {
    lights: LightPool;
  }
}

export interface LightRequest {
  position: THREE.Vector3Like;
  /** Default: warm flame (≈1900 K). */
  color?: THREE.ColorRepresentation;
  /** PointLight intensity (candela-like). Default 12. */
  intensity?: number;
  /** Range in metres (light reaches zero here). Default 12. */
  distance?: number;
  /** 0..1 or true (= 0.35, a torch). Default 0. */
  flicker?: number | boolean;
  /** Only lit from dusk to dawn (street lamps, shop lamps). Default false. */
  night?: boolean;
  /** Importance; 2 ≈ competes as if twice as close. Default 1. */
  priority?: number;
  /** Glow sprite radius in metres; 0 = no sprite. Default 0.3. */
  glow?: number;
  /** Glow brightness multiplier. Default 1. */
  glowIntensity?: number;
  /** Default true. */
  enabled?: boolean;
}

export interface LightHandle {
  readonly id: number;
  setPosition(p: THREE.Vector3Like): void;
  setEnabled(on: boolean): void;
  setIntensity(i: number): void;
  setColor(c: THREE.ColorRepresentation): void;
  /** Current brightness factor 0..1 (night fade × enabled), without flicker. */
  readonly level: number;
  remove(): void;
}

export interface LightPoolOptions {
  /** Number of real PointLights. Default 8. */
  count?: number;
}

interface Entry {
  id: number;
  index: number;
  position: THREE.Vector3;
  color: THREE.Color;
  intensity: number;
  distance: number;
  flicker: number;
  night: boolean;
  priority: number;
  glow: number;
  glowIntensity: number;
  enabled: boolean;
  seed: number;
  level: number;
  slot: number;
  dirty: boolean;
}

interface Slot {
  light: THREE.PointLight;
  entry: Entry | null;
  /** 0..1 fade for swaps. */
  fade: number;
  /** Entry waiting for this slot once it has faded out. */
  next: Entry | null;
}

const DEFAULT_COLOR = new THREE.Color(0xff9a50);
const _cam = new THREE.Vector3();

export class LightPool implements System {
  readonly name = 'lightPool';
  readonly priority = 106;
  readonly glows = new GlowSprites();
  private slots: Slot[] = [];
  private entries: Entry[] = [];
  private nextId = 1;
  private cands: Candidate[] = [];
  private selected: number[] = [];
  private selectTimer = 0;
  private time = 0;
  /** Seconds between re-ranking (positions/levels still update every frame). */
  selectInterval = 0.1;
  /** Daytime glow multiplier for always-on fires. */
  dayGlow = 0.25;

  constructor(
    private readonly game: Game,
    opts: LightPoolOptions = {},
  ) {
    const n = opts.count ?? 8;
    for (let i = 0; i < n; i++) {
      const light = new THREE.PointLight(0xffffff, 0, 10, 2);
      light.name = `poolLight${i}`;
      light.castShadow = false;
      light.position.set(0, -1e4, 0);
      game.scene.add(light);
      this.slots.push({ light, entry: null, fade: 0, next: null });
    }
    game.scene.add(this.glows.mesh);
  }

  get count() {
    return this.slots.length;
  }

  /** Number of live requests. */
  get size() {
    return this.entries.length;
  }

  request(req: LightRequest): LightHandle {
    const id = this.nextId++;
    const e: Entry = {
      id,
      index: this.entries.length,
      position: new THREE.Vector3(req.position.x, req.position.y, req.position.z),
      color: req.color !== undefined ? new THREE.Color(req.color) : DEFAULT_COLOR.clone(),
      intensity: req.intensity ?? 12,
      distance: req.distance ?? 12,
      flicker: req.flicker === true ? 0.35 : typeof req.flicker === 'number' ? req.flicker : 0,
      night: req.night ?? false,
      priority: req.priority ?? 1,
      glow: req.glow ?? 0.3,
      glowIntensity: req.glowIntensity ?? 1,
      enabled: req.enabled ?? true,
      seed: seed01(id),
      level: 0,
      slot: -1,
      dirty: true,
    };
    this.entries.push(e);
    this.glows.ensureCapacity(this.entries.length);
    this.writeStatic(e);
    this.selectTimer = Infinity;
    const pool = this;
    return {
      id,
      setPosition(p) {
        e.position.set(p.x, p.y, p.z);
        pool.writeStatic(e);
      },
      setEnabled(on) {
        e.enabled = on;
      },
      setIntensity(i) {
        e.intensity = i;
        pool.writeStatic(e);
      },
      setColor(c) {
        e.color.set(c);
        pool.writeStatic(e);
      },
      get level() {
        return e.level;
      },
      remove() {
        pool.removeEntry(e);
      },
    };
  }

  private removeEntry(e: Entry) {
    const i = this.entries.indexOf(e);
    if (i < 0) return;
    if (e.slot >= 0) {
      const s = this.slots[e.slot];
      s.entry = null;
      s.fade = 0;
      s.light.intensity = 0;
    }
    for (const s of this.slots) if (s.next === e) s.next = null;
    // Swap-remove, keeping glow instance data aligned with the entry index.
    const last = this.entries.pop()!;
    if (last !== e) {
      this.entries[i] = last;
      last.index = i;
      this.writeStatic(last);
    }
    this.selectTimer = Infinity;
  }

  /** Write position/color/size into the glow buffers. */
  private writeStatic(e: Entry) {
    const g = this.glows;
    const i = e.index;
    g.pos.setXYZ(i, e.position.x, e.position.y, e.position.z);
    // Glow color: light color × a brightness that scales gently with the light's intensity.
    const k = e.glowIntensity * (0.5 + Math.sqrt(e.intensity) * 0.18) * 2.4;
    g.color.setXYZW(i, e.color.r * k, e.color.g * k, e.color.b * k, e.glow);
    g.params.setXYZ(i, 0, e.flicker, e.seed * 100);
    g.pos.needsUpdate = true;
    g.color.needsUpdate = true;
  }

  lateUpdate(dt: number) {
    const { game } = this;
    this.time += dt;
    const lamp = game.sky?.lampFactor ?? (game.time.isNight ? 1 : 0);
    const daylight = game.sky?.daylight ?? (game.time.isNight ? 0 : 1);
    game.camera.getWorldPosition(_cam);

    // Levels (night stagger) for every entry; glow level buffer.
    const params = this.glows.params;
    const n = this.entries.length;
    for (let i = 0; i < n; i++) {
      const e = this.entries[i];
      const lvl = e.enabled ? (e.night ? lampLevel(lamp, e.seed) : 1) : 0;
      e.level = lvl;
      // Fires that burn all day barely show against daylight.
      const dayK = e.night ? 1 : this.dayGlow + (1 - this.dayGlow) * (1 - daylight);
      params.setX(i, lvl * dayK);
    }
    params.needsUpdate = n > 0;
    this.glows.count = n;
    this.glows.uniforms.uTime.value = this.time;
    this.glows.uniforms.uFogDensity.value = (game.scene.fog as THREE.FogExp2 | null)?.density ?? 0;
    game.renderer.getDrawingBufferSize(this.glows.uniforms.uViewport.value);

    // Re-rank a few times per second.
    this.selectTimer += dt;
    if (this.selectTimer >= this.selectInterval) {
      this.selectTimer = 0;
      this.rank();
    }

    // Drive the real lights: fades, flicker, distance fade.
    const fadeRate = 6;
    for (const s of this.slots) {
      if (s.next && (!s.entry || s.fade <= 0.001)) {
        if (s.entry) s.entry.slot = -1;
        s.entry = s.next;
        s.entry.slot = this.slots.indexOf(s);
        s.next = null;
        s.fade = 0;
      }
      const e = s.entry;
      const target = e && !s.next ? 1 : 0;
      s.fade = THREE.MathUtils.clamp(s.fade + Math.sign(target - s.fade) * fadeRate * dt, 0, 1);
      if (!e) {
        s.light.intensity = 0;
        continue;
      }
      const l = s.light;
      l.position.copy(e.position);
      l.color.copy(e.color);
      l.distance = e.distance;
      const f = flicker(this.time, e.seed * 100, e.flicker);
      l.intensity = e.intensity * e.level * f * s.fade;
    }
  }

  private rank() {
    const n = this.entries.length;
    const cands = this.cands;
    cands.length = n;
    for (let i = 0; i < n; i++) {
      const e = this.entries[i];
      const d2 = e.position.distanceToSquared(_cam);
      const reach = e.distance + 40;
      const c = cands[i] ?? (cands[i] = { d2: 0, priority: 1, assigned: false, active: false });
      c.d2 = d2;
      c.priority = e.priority;
      c.assigned = e.slot >= 0;
      c.active = e.level > 0.01 && e.intensity > 0 && d2 < reach * reach * e.priority * e.priority;
    }
    const sel = selectLights(cands, this.slots.length, 0.75, this.selected);
    const want = new Set<Entry>();
    for (const i of sel) want.add(this.entries[i]);
    // Slots whose entry is no longer wanted start fading out (their replacement waits).
    const free: Slot[] = [];
    for (const s of this.slots) {
      if (s.entry && !want.has(s.entry)) {
        if (!s.next) free.push(s);
      } else if (!s.entry && !s.next) free.push(s);
      if (s.next && !want.has(s.next)) s.next = null;
    }
    for (const e of want) {
      if (e.slot >= 0 || this.slots.some((s) => s.next === e)) continue;
      const s = free.shift();
      if (!s) break;
      s.next = e;
    }
  }

  dispose() {
    for (const s of this.slots) s.light.removeFromParent();
    this.glows.mesh.removeFromParent();
    this.glows.dispose();
  }
}
