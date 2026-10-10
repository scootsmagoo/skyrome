/**
 * The Game owns the renderer, scene, camera, clock, physics and the list of systems, and runs
 * the frame loop:
 *
 *   for each rendered frame:
 *     input look/edges are fresh
 *     fixedUpdate(1/60) × N   (gameplay that must be deterministic: movement, AI, combat timing)
 *     physics.step(1/60) × N
 *     update(dt, alpha)       (animation, interpolation, triggers that read input edges)
 *     lateUpdate(dt)          (camera placement, HUD)
 *     render
 *
 * Modules attach typed services to the Game with declaration merging instead of editing this file:
 *
 *   declare module '../core/Game' { interface Game { terrain: Terrain } }
 *   game.terrain = new Terrain(...);
 */
import * as THREE from 'three';
import { chooseGraphics } from './graphics';
import { reversedDepth } from '../gfx/depth';
import { EventBus, type GameEvents } from './Events';
import { GameTime } from './GameTime';
import { Input } from './Input';
import { Physics, initPhysics } from './Physics';
import { Rng } from './Rng';
import { Settings } from './Settings';

export interface System {
  readonly name: string;
  /** Lower runs first. Default 0. */
  readonly priority?: number;
  /** Fixed 60 Hz, before the physics step. */
  fixedUpdate?(dt: number): void;
  /** Once per rendered frame after physics; `alpha` (0..1) interpolates between the last two fixed steps. */
  update?(dt: number, alpha: number): void;
  /** Once per frame after every `update` (camera, HUD). */
  lateUpdate?(dt: number): void;
  dispose?(): void;
}

export interface FrameStats {
  fps: number;
  frameMs: number;
  cpuMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}

export const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 5;
/** The title and character creation run at this frame rate (Game.capFps). */
const MENU_FPS = 30;

/**
 * The frame rate the loop runs at (0 = uncapped): `?fps=` when given (measuring), else the lowest of
 * the player's setting and the caps in force (pure, unit-tested).
 */
export function frameCap(override: number | undefined, own: number, caps: Iterable<number>): number {
  if (override !== undefined) return override;
  let cap = own > 0 ? own : Infinity;
  for (const c of caps) if (c > 0 && c < cap) cap = c;
  return Number.isFinite(cap) ? cap : 0;
}

export class Game {
  readonly container: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly events = new EventBus<GameEvents>();
  readonly settings: Settings;
  readonly input: Input;
  readonly physics: Physics;
  readonly time: GameTime;
  readonly rng: Rng;
  readonly stats: FrameStats = { fps: 0, frameMs: 0, cpuMs: 0, drawCalls: 0, triangles: 0, geometries: 0, textures: 0 };

  /** Real seconds since start (unaffected by pause). */
  elapsed = 0;
  /** When true, fixed/update systems don't run (menus); lateUpdate and rendering continue. */
  paused = false;
  /**
   * Milliseconds of deferrable background work done so far this frame (city streaming, avatar LOD
   * builds). Such work adds what it spent and skips its big steps once another one has had the
   * frame, so two 10 ms jobs never stack into one 30 ms frame. Reset at the start of every frame.
   */
  backgroundMs = 0;
  /** Multiplier on simulated time (hit-stop, slow-mo). */
  timeScale = 1;
  /** Draws the frame. Post-processing (src/gfx/post) replaces this. */
  renderFrame: () => void = () => this.renderer.render(this.scene, this.camera);

  private systems: System[] = [];
  /** Per-system CPU timing (ms per frame, smoothed). Off unless `profiling` is set (dev overlay, perf runs). */
  profiling = false;
  readonly profile = new Map<string, number>();
  /** The last frame's CPU ms per system (while profiling): spikes, not averages. */
  lastTick: Map<string, number> = new Map();
  private running = false;
  private accumulator = 0;
  private lastTime = 0;
  private fpsAccum = 0;
  private fpsFrames = 0;
  private rafId = 0;
  private lastRenderAt = 0;
  private lastShadowAt = -Infinity;
  private nextFrameAt = 0;
  /** Frame-rate caps by reason (`capFps`): the title at 30 fps and so on. */
  private readonly caps = new Map<string, number>();
  /** Something changed that the next paused or idle frame must draw (`invalidate`). */
  private redraw = true;
  /** When the scene was last drawn, and the view it was drawn from (paused frames redraw only on change). */
  private lastDrawAt = -Infinity;
  private readonly drawnView = new Float64Array(14);
  private readonly view = new Float64Array(14);
  /** Paused frames that drew nothing, and frames drawn (the idle checks in scripts/perf-budget.mjs). */
  readonly drawStats = { skipped: 0, drawn: 0 };
  /** Minimum time between shadow-map renders (ms); 0 = every frame. */
  shadowIntervalMs = 1000 / 30;
  /** `?fps=N` overrides the frame-rate setting for this page load (0 = uncapped; perf runs). */
  private readonly fpsOverride = (() => {
    const v = new URLSearchParams(location.search).get('fps');
    return v !== null && Number.isFinite(+v) ? +v : undefined;
  })();

  static async create(container: HTMLElement, opts: { seed?: number } = {}): Promise<Game> {
    await initPhysics();
    return new Game(container, opts);
  }

  private constructor(container: HTMLElement, opts: { seed?: number }) {
    this.container = container;
    this.settings = Settings.load();
    // Graphics quality for this machine (Auto), before the renderer: antialiasing is fixed at creation.
    this.gpu = chooseGraphics(this.settings).gpu;
    this.rng = new Rng(opts.seed ?? 113);

    this.renderer = new THREE.WebGLRenderer({
      antialias: this.settings.data.antialias,
      powerPreference: 'high-performance',
      stencil: false,
      // Reversed-Z (where EXT_clip_control exists; otherwise three falls back): with the post
      // chain's float depth target, depth precision is nearly even at every distance, so surfaces
      // a few centimetres apart no longer flicker 100–300 m away.
      reversedDepthBuffer: true,
    });
    reversedDepth.value = this.renderer.state.buffers.depth.getReversed() ? 1 : 0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.shadowMap.enabled = this.settings.data.shadows !== 'off';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.canvas = this.renderer.domElement;
    this.canvas.tabIndex = 0;
    this.canvas.className = 'game-canvas';
    container.appendChild(this.canvas);

    this.camera = new THREE.PerspectiveCamera(this.settings.data.fov, 1, 0.08, 4000);
    this.scene.add(this.camera);
    // The scene root never moves. Left to update itself it flags its world matrix dirty every frame,
    // which forces three.js to recompute the world matrix of every object in the scene, frozen or
    // not (gfx/freeze.ts).
    this.scene.matrixAutoUpdate = false;

    this.input = new Input(this.canvas);
    this.input.sensitivity = 0.0022 * this.settings.data.lookSensitivity;
    this.input.invertY = this.settings.data.invertY;
    this.physics = new Physics();
    this.time = new GameTime(this.events);

    this.resize();
    window.addEventListener('resize', () => this.resize());
    // A setting can change the picture without moving the camera (exposure, effects): draw again.
    this.settings.onChange(() => this.invalidate());
    // The title and character creation circle a slow camera over the city: 30 fps is plenty there.
    this.events.on('flow:state', ({ state }) => this.capFps('menu', state === 'title' || state === 'creation' ? MENU_FPS : null));
  }

  /**
   * Cap the frame rate for a reason (null lifts it): the loop runs at the lowest of these and
   * settings.maxFps. `?fps=` (measuring) overrides them all.
   */
  capFps(reason: string, fps: number | null) {
    if (fps === null) this.caps.delete(reason);
    else this.caps.set(reason, fps);
  }

  /** A cap below the player's own frame-rate setting is on (the graphics governor ignores such frames). */
  get capped(): boolean {
    const own = this.settings.data.maxFps;
    for (const v of this.caps.values()) if (own <= 0 || v < own) return true;
    return false;
  }

  /** The picture changed in a way the camera does not show: the next paused or idle frame draws. */
  invalidate() {
    this.redraw = true;
  }

  addSystem<T extends System>(system: T): T {
    this.systems.push(system);
    this.systems.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
    return system;
  }

  removeSystem(system: System) {
    this.systems = this.systems.filter((s) => s !== system);
    system.dispose?.();
  }

  getSystem<T extends System>(name: string): T | undefined {
    return this.systems.find((s) => s.name === name) as T | undefined;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.lastTime = performance.now();
    this.events.emit('game:ready', {});
    const loop = (now: number) => {
      if (!this.running) return;
      this.rafId = requestAnimationFrame(loop);
      // Idle: when the window is in the background or unfocused (and the mouse isn't captured) the
      // world freezes and the last frame stays on screen; it is drawn again only when something
      // asks for it (a resize clears the canvas), at most twice a second. With a menu open the loop
      // runs at ~30 fps and draws only when the view changed (see frame). Keeps an idle tab from
      // heating the machine. Automation (navigator.webdriver) is never idle, so headless
      // screenshots and tests are unaffected.
      const idle = this.isIdle();
      if (idle) {
        this.lastTime = now; // no simulated time passes while idle
        if (this.redraw && now - this.lastRenderAt >= 500) {
          this.lastRenderAt = now;
          this.redraw = false;
          this.renderFrame();
        }
        return;
      }
      if (this.paused && now - this.lastRenderAt < 32) return;
      // Frame cap (settings.maxFps and capFps): render on a fixed schedule and skip the display
      // refreshes in between, so a 60 fps cap draws every other frame of a 120 Hz display and
      // averages 60 on a 144 Hz one. 1.5 ms of slack absorbs rAF jitter; a slow frame never causes
      // a catch-up burst.
      const cap = frameCap(this.fpsOverride, this.settings.data.maxFps, this.caps.values());
      if (cap > 0) {
        const interval = 1000 / cap;
        if (now < this.nextFrameAt - 1.5) return;
        this.nextFrameAt = Math.max(this.nextFrameAt + interval, now);
      }
      this.lastRenderAt = now;
      this.frame(now);
    };
    this.rafId = requestAnimationFrame(loop);
  }

  /** Did the camera move (or its lens or the canvas change) since the last drawn frame? Fills `view`. */
  private viewMoved(): boolean {
    const c = this.camera;
    const v = this.view;
    v[0] = c.position.x; v[1] = c.position.y; v[2] = c.position.z;
    v[3] = c.quaternion.x; v[4] = c.quaternion.y; v[5] = c.quaternion.z; v[6] = c.quaternion.w;
    v[7] = c.fov; v[8] = c.aspect; v[9] = c.near; v[10] = c.far; v[11] = c.zoom;
    v[12] = this.canvas.width; v[13] = this.canvas.height;
    for (let i = 0; i < 14; i++) if (v[i] !== this.drawnView[i]) return true;
    return false;
  }

  /** True when nobody is playing: background tab, or an unfocused window without pointer lock. */
  isIdle(): boolean {
    if (typeof document === 'undefined' || (typeof navigator !== 'undefined' && navigator.webdriver)) return false;
    return document.hidden || (!document.hasFocus() && !this.input.pointerLocked);
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.rafId);
  }

  /** Advance the simulation manually (tests / headless). */
  stepFrames(n: number, dt = FIXED_DT) {
    for (let i = 0; i < n; i++) this.frame(this.lastTime + dt * 1000);
  }

  resize() {
    this.invalidate();
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    const ratio = Math.min(window.devicePixelRatio || 1, this.settings.data.maxPixelRatio) * this.settings.data.renderScale;
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.camera.aspect = w / Math.max(1, h);
    this.camera.updateProjectionMatrix();
  }

  private frame(now: number) {
    const cpuStart = performance.now();
    this.backgroundMs = 0;
    let dt = (now - this.lastTime) / 1000;
    this.lastTime = now;
    if (!(dt > 0)) dt = 0;
    dt = Math.min(dt, 0.1);
    this.elapsed += dt;

    // FPS counter
    this.fpsAccum += dt;
    this.fpsFrames++;
    if (this.fpsAccum >= 0.5) {
      this.stats.fps = this.fpsFrames / this.fpsAccum;
      this.stats.frameMs = (this.fpsAccum / this.fpsFrames) * 1000;
      this.fpsAccum = 0;
      this.fpsFrames = 0;
    }

    const simDt = this.paused ? 0 : dt * this.timeScale;
    const prof = this.profiling;
    const tick = prof ? new Map<string, number>() : null;
    const time = (name: string, t0: number) => tick!.set(name, (tick!.get(name) ?? 0) + performance.now() - t0);
    if (!this.paused) {
      this.time.tick(simDt);
      this.accumulator += simDt;
      let steps = 0;
      while (this.accumulator >= FIXED_DT && steps < MAX_SUBSTEPS) {
        for (const s of this.systems) {
          if (!s.fixedUpdate) continue;
          if (!prof) s.fixedUpdate(FIXED_DT);
          else { const t0 = performance.now(); s.fixedUpdate(FIXED_DT); time(s.name, t0); }
        }
        const tp = prof ? performance.now() : 0;
        this.physics.step(FIXED_DT);
        if (prof) time('(physics)', tp);
        this.accumulator -= FIXED_DT;
        steps++;
      }
      if (steps === MAX_SUBSTEPS) this.accumulator = 0;
    }
    const alpha = this.paused ? 1 : this.accumulator / FIXED_DT;
    for (const s of this.systems) {
      if (this.paused || !s.update) continue;
      if (!prof) s.update(simDt, alpha);
      else { const t0 = performance.now(); s.update(simDt, alpha); time(s.name, t0); }
    }
    for (const s of this.systems) {
      if (!s.lateUpdate) continue;
      if (!prof) s.lateUpdate(dt);
      else { const t0 = performance.now(); s.lateUpdate(dt); time(s.name, t0); }
    }

    // A paused world (menus, dialogue, the console) looks the same from frame to frame: draw only
    // when the view moved, something called invalidate(), or once a second just in case.
    const moved = this.viewMoved();
    const draw = !this.paused || this.redraw || moved || now - this.lastDrawAt > 1000;
    if (!draw) {
      this.drawStats.skipped++;
      this.stats.cpuMs = performance.now() - cpuStart;
      this.input.endFrame();
      return;
    }
    this.redraw = false;
    this.lastDrawAt = now;
    this.drawnView.set(this.view);
    this.drawStats.drawn++;
    // Shadow maps re-render at most every `shadowIntervalMs` (≈30 Hz): the shadow pass is about a
    // third of the GPU frame, and a one-frame-old shadow is invisible at a 60 fps cap. The shadow
    // matrices only change when the map re-renders, so a skipped frame stays consistent.
    const sm = this.renderer.shadowMap;
    if (sm.enabled) {
      sm.autoUpdate = false;
      if (now - this.lastShadowAt >= this.shadowIntervalMs - 1.5 || now < this.lastShadowAt) {
        sm.needsUpdate = true;
        this.lastShadowAt = now;
      }
    }
    const tr = prof ? performance.now() : 0;
    this.renderFrame();
    if (prof) {
      time('(render submit)', tr);
      // Exponential smoothing per entry; entries not seen this frame decay toward zero.
      for (const [k, v] of this.profile) if (!tick!.has(k)) this.profile.set(k, v * 0.9);
      for (const [k, v] of tick!) this.profile.set(k, (this.profile.get(k) ?? v) * 0.9 + v * 0.1);
      this.lastTick = tick!;
    }
    const info = this.renderer.info;
    this.stats.drawCalls = info.render.calls;
    this.stats.triangles = info.render.triangles;
    this.stats.geometries = info.memory.geometries;
    this.stats.textures = info.memory.textures;
    this.stats.cpuMs = performance.now() - cpuStart;
    this.input.endFrame();
  }
}
