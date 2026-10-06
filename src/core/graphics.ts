/**
 * Graphics quality tiers and the automatic choice between them.
 *
 * At startup, before the renderer exists (antialiasing is fixed at creation), `chooseGraphics`
 * reads the GPU's name through a throwaway WebGL context and, in Auto, writes the matching tier's
 * rows into Settings: an Apple M-series or discrete GPU gets High, recent integrated graphics
 * Medium, older Intel graphics, low-memory machines and software rendering (hardware acceleration
 * off) Low. It does that once per GPU, so the player's own changes to single rows stay.
 *
 * While playing in Auto, `GraphicsGovernor` watches the frame rate and steps down one tier at a
 * time when the game can't hold it (never up, so it doesn't oscillate), with a notice.
 *
 * Automation (navigator.webdriver) is left at the defaults unless `?graphics=` asks otherwise, so
 * the perf and screenshot scripts keep measuring the High settings.
 */
import type { Game, System } from './Game';

declare module './Game' {
  interface Game {
    /** The GPU found at startup (null outside a browser or under automation). */
    gpu?: GpuInfo | null;
  }
}
import type { SettingsData } from './Settings';

export type GraphicsTier = 'low' | 'medium' | 'high';
export type GraphicsChoice = 'auto' | GraphicsTier;

declare module './Settings' {
  interface SettingsData {
    /** Graphics quality: 'auto' (default) picks a tier for this machine; a tier fixes it. */
    graphics?: GraphicsChoice;
    /** What Auto last applied, and for which GPU (so it re-detects on a new machine). */
    graphicsApplied?: { tier: GraphicsTier; gpu: string; by: 'gpu' | 'fps' };
    /** People on the streets, × the normal crowd (the population reads it). */
    crowdDensity?: number;
  }
}

/** The rows each tier writes. Antialiasing applies from the next launch. */
export const TIER_SETTINGS: Record<GraphicsTier, Partial<SettingsData>> = {
  high: { renderScale: 1, maxPixelRatio: 1.5, shadows: 'high', viewDistance: 900, bloom: true, antialias: true, maxFps: 60, crowdDensity: 1 },
  medium: { renderScale: 0.85, maxPixelRatio: 1.25, shadows: 'low', viewDistance: 700, bloom: true, antialias: true, maxFps: 60, crowdDensity: 0.8 },
  low: { renderScale: 0.75, maxPixelRatio: 1, shadows: 'off', viewDistance: 550, bloom: false, antialias: false, maxFps: 30, crowdDensity: 0.6 },
};

export const TIER_LABEL: Record<GraphicsTier, string> = { low: 'Low', medium: 'Medium', high: 'High' };

export interface GpuInfo {
  /** The unmasked renderer string (or the masked one, or '' when WebGL is unavailable). */
  name: string;
  /** No hardware acceleration: the browser draws 3D on the CPU. */
  software: boolean;
}

/**
 * The tier for a GPU (pure). `memoryGb` is navigator.deviceMemory (Chrome; capped at 8), `cores`
 * navigator.hardwareConcurrency.
 */
export function classifyGpu(gpu: GpuInfo, o: { memoryGb?: number; cores?: number } = {}): GraphicsTier {
  const n = gpu.name.toLowerCase();
  let tier: GraphicsTier;
  if (gpu.software || !n || /swiftshader|llvmpipe|softpipe|software|basic render|microsoft basic/.test(n)) tier = 'low';
  // Discrete cards: NVIDIA, AMD Radeon RX/Pro/R9, Intel Arc.
  else if (/nvidia|geforce|quadro|rtx|gtx|radeon (rx|pro|r9)|radeon\(tm\) (rx|pro)|intel.*arc\b|\barc a\d/.test(n)) tier = 'high';
  // Apple silicon (Chrome says "Apple M1…", Safari only "Apple GPU").
  else if (/apple (m\d|gpu)/.test(n)) tier = 'high';
  // Recent integrated graphics: Intel Iris Xe, AMD Radeon (Vega / RDNA) integrated, Apple's older AMD.
  else if (/iris\(r\) xe|iris xe|radeon|amd/.test(n)) tier = 'medium';
  // Older Intel (UHD, HD, Iris Plus), mobile GPUs and anything unknown.
  else tier = 'low';
  if (o.memoryGb !== undefined && o.memoryGb > 0 && o.memoryGb <= 4) tier = 'low';
  else if (tier === 'high' && o.cores !== undefined && o.cores > 0 && o.cores <= 4) tier = 'medium';
  return tier;
}

/** The GPU's name, through a throwaway WebGL context (null outside a browser). */
export function detectGpu(): GpuInfo | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2', { failIfMajorPerformanceCaveat: false }) ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { name: '', software: true };
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    // A context that would refuse "major performance caveats" tells software rendering apart.
    const strict = document.createElement('canvas').getContext('webgl2', { failIfMajorPerformanceCaveat: true });
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    strict?.getExtension('WEBGL_lose_context')?.loseContext();
    return { name, software: !strict && !/apple/i.test(name) };
  } catch {
    return null;
  }
}

/** One step down (null at the bottom). */
export function lowerTier(t: GraphicsTier): GraphicsTier | null {
  return t === 'high' ? 'medium' : t === 'medium' ? 'low' : null;
}

/** The rows to write for a choice and what Auto should record (pure). Null: nothing to change. */
export function graphicsWrites(d: Partial<SettingsData>, gpu: GpuInfo | null, env: { memoryGb?: number; cores?: number } = {}): Partial<SettingsData> | null {
  const choice = d.graphics ?? 'auto';
  if (choice !== 'auto') return null;
  const name = gpu?.name ?? '';
  // Already chosen for this GPU (by its name or, after a step down, by the frame rate): keep it.
  if (d.graphicsApplied && d.graphicsApplied.gpu === name) return null;
  const tier = gpu ? classifyGpu(gpu, env) : 'high';
  return { ...TIER_SETTINGS[tier], graphicsApplied: { tier, gpu: name, by: 'gpu' } };
}

/**
 * Startup: pick the tier for this machine (Auto) and write its rows before the renderer exists.
 * Returns what was detected, for the notice and the console.
 */
export function chooseGraphics(settings: { data: SettingsData; set<K extends keyof SettingsData>(k: K, v: SettingsData[K]): void }): { gpu: GpuInfo | null; tier: GraphicsTier | null; changed: boolean } {
  const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('graphics') : null;
  if (q === 'low' || q === 'medium' || q === 'high' || q === 'auto-reset') {
    // A link that picks a tier picks it the way the Settings row does (Settings shows it; Auto
    // there goes back to detection). `auto-reset` forgets a previous choice.
    const tier = q === 'auto-reset' ? null : q;
    settings.set('graphics', tier ?? 'auto');
    if (tier) {
      for (const [k, v] of Object.entries(TIER_SETTINGS[tier])) settings.set(k as keyof SettingsData, v as never);
      return { gpu: detectGpu(), tier, changed: true };
    }
    settings.set('graphicsApplied', undefined);
  }
  const automated = typeof navigator !== 'undefined' && navigator.webdriver && q !== 'auto' && q !== 'auto-reset';
  if (automated) return { gpu: null, tier: null, changed: false };
  const gpu = detectGpu();
  const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
  const writes = graphicsWrites(settings.data, gpu, { memoryGb: nav?.deviceMemory, cores: nav?.hardwareConcurrency });
  if (writes) for (const [k, v] of Object.entries(writes)) settings.set(k as keyof SettingsData, v as never);
  return { gpu, tier: writes?.graphicsApplied?.tier ?? settings.data.graphicsApplied?.tier ?? null, changed: !!writes };
}

/**
 * Auto, while playing: sample the frame rate (2 Hz) in play only (not paused, tab visible) and,
 * when the median over a window can't reach 75 % of the frame-rate limit, step down one tier.
 * The first seconds after a start or a change (shader compiles, streaming) don't count.
 */
export class GraphicsGovernor implements System {
  readonly name = 'graphicsGovernor';
  readonly priority = 990;
  private samples: number[] = [];
  private acc = 0;
  private settle = 6;
  private readonly enabled: boolean;

  constructor(private readonly game: Game) {
    const q = typeof location !== 'undefined' ? new URLSearchParams(location.search).get('graphics') : null;
    this.enabled = !(typeof navigator !== 'undefined' && navigator.webdriver) || q === 'auto' || q === 'auto-reset';
    let prev = game.settings.data.graphics ?? 'auto';
    game.settings.onChange((d) => {
      this.samples.length = 0;
      this.settle = 6;
      // The Graphics quality row: a tier writes its rows; Auto detects again.
      const choice = d.graphics ?? 'auto';
      if (choice === prev) return;
      prev = choice;
      queueMicrotask(() => applyChoice(game, choice));
    });
  }

  lateUpdate(dt: number) {
    const g = this.game;
    const s = g.settings.data;
    if (!this.enabled || (s.graphics ?? 'auto') !== 'auto' || g.paused || (typeof document !== 'undefined' && document.hidden)) return;
    if (this.settle > 0) {
      this.settle -= dt;
      return;
    }
    this.acc += dt;
    if (this.acc < 0.5) return;
    this.acc = 0;
    this.samples.push(g.stats.fps);
    if (this.samples.length < 16) return;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[sorted.length >> 1];
    this.samples.length = 0;
    const target = s.maxFps > 0 ? s.maxFps : 60;
    if (median >= target * 0.75) return;
    const cur = s.graphicsApplied?.tier ?? 'high';
    const next = lowerTier(cur);
    if (!next) return;
    for (const [k, v] of Object.entries(TIER_SETTINGS[next])) g.settings.set(k as keyof SettingsData, v as never);
    g.settings.set('graphicsApplied', { tier: next, gpu: s.graphicsApplied?.gpu ?? '', by: 'fps' });
    g.events.emit('ui:notify', { text: `Graphics lowered to ${TIER_LABEL[next]} for a smoother game (Esc → Settings → Display).`, kind: 'info' });
  }
}

/** Apply a Graphics quality choice now (the settings row and the console's `graphics`). */
export function applyChoice(game: Game, choice: GraphicsChoice) {
  const set = <K extends keyof SettingsData>(k: K, v: SettingsData[K]) => game.settings.set(k, v);
  if (game.settings.data.graphics !== choice) set('graphics', choice);
  if (choice === 'auto') {
    const gpu = game.gpu ?? detectGpu();
    const nav = typeof navigator !== 'undefined' ? (navigator as Navigator & { deviceMemory?: number }) : undefined;
    const writes = graphicsWrites({ ...game.settings.data, graphicsApplied: undefined }, gpu, { memoryGb: nav?.deviceMemory, cores: nav?.hardwareConcurrency });
    if (writes) for (const [k, v] of Object.entries(writes)) set(k as keyof SettingsData, v as never);
    return;
  }
  for (const [k, v] of Object.entries(TIER_SETTINGS[choice])) set(k as keyof SettingsData, v as never);
}
