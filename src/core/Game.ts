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

    this.input = new Input(this.canvas);
    this.input.sensitivity = 0.0022 * this.settings.data.lookSensitivity;
    this.input.invertY = this.settings.data.invertY;
    this.physics = new Physics();
    this.time = new GameTime(this.events);

    this.resize();
    window.addEventListener('resize', () => this.resize());
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
      // Idle throttling: when the window is in the background or unfocused (and the mouse isn't
      // captured) the world freezes and we redraw only twice a second; with a menu open we cap
      // at ~30 fps. Keeps an idle tab from heating the machine. Automation (navigator.webdriver)
      // always runs at full rate so headless screenshots and tests are unaffected.
      const idle = this.isIdle();
      const minGap = idle ? 500 : this.paused ? 32 : 0;
      if (minGap > 0 && now - this.lastRenderAt < minGap) return;
      // Frame cap (settings.maxFps): render on a fixed schedule and skip the display refreshes in
      // between, so a 60 fps cap draws every other frame of a 120 Hz display and averages 60 on a
      // 144 Hz one. 1.5 ms of slack absorbs rAF jitter; a slow frame never causes a catch-up burst.
      const cap = this.fpsOverride ?? this.settings.data.maxFps;
      if (cap > 0 && !idle) {
        const interval = 1000 / cap;
        if (now < this.nextFrameAt - 1.5) return;
        this.nextFrameAt = Math.max(this.nextFrameAt + interval, now);
      }
      this.lastRenderAt = now;
      if (idle) {
        this.lastTime = now; // no simulated time passes while idle
        this.renderer.render(this.scene, this.camera);
        return;
      }
      this.frame(now);
    };
    this.rafId = requestAnimationFrame(loop);
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
