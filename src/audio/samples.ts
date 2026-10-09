/**
 * Recorded sounds. The CC0 recordings behind most effects are packed by `scripts/sfx/build.mjs`
 * into a few strips (`public/audio/sfx/<group>.m4a`, with an `.mp3` twin) and described by
 * `manifest.json`: for each sound id, the group and the [start, end] seconds of every variant.
 *
 * `SampleLibrary` fetches the manifest at start-up, then a group the first time one of its sounds is
 * asked for (the engine prefetches the footsteps, combat, world and UI groups at once), decodes it
 * with an OfflineAudioContext and cuts out the variants. The bank treats those exactly like baked
 * ones: they go through the same level conventions, so the mix gains stay meaningful. A sound the
 * manifest lacks, or whose group failed to load, falls back to the synthesised version in
 * `sounds/*.ts`, so the game always has something to play.
 *
 * Everything that needs no browser (the manifest rules, cutting, trimming, levelling) is pure and
 * has unit tests; only `decodeStrip` and the fetching touch the platform.
 */
import { fadeEdges, normalizeLoudness, normalizePeak, peakOf, removeDc, rmsOf, trimTail } from './dsp/core';
import { BED_RMS, ONESHOT_LOUDNESS, ONESHOT_PEAK } from './levels';

export interface SampleGroup {
  rate: number;
  m4a: string;
  mp3: string;
  seconds: number;
  bytes: number;
}

export interface SampleEntry {
  /** Another sound whose clips this one plays (walk and run share their footfalls). */
  alias?: string;
  group?: string;
  kind?: 'oneshot' | 'bed';
  /** [start, end] seconds of each variant inside the group's strip. */
  clips?: [number, number][];
}

export interface SampleManifest {
  version: number;
  groups: Record<string, SampleGroup>;
  sounds: Record<string, SampleEntry>;
}

/** What the bank asks of a sample provider. */
export interface SampleSource {
  /** The manifest has arrived (or failed: then nothing is wanted). */
  readonly ready: Promise<void>;
  /** After `ready`: is there a recording for this sound that has not failed to load? */
  wants(id: string): boolean;
  /** True until the manifest is in, and while a wanted sound's group is still loading. */
  pending(id: string): boolean;
  /** The variants as PCM at `rateOf(id)`, levelled; null if the group could not be loaded. */
  load(id: string): Promise<Float32Array[] | null>;
  /** Sample rate of a loaded sound's PCM. */
  rateOf(id: string): number | undefined;
  /** The PCM was copied elsewhere: drop it. */
  release?(id: string): void;
}

/** Follow an alias (one hop) and return the entry that owns the clips. */
export function resolveEntry(m: SampleManifest, id: string): { id: string; entry: SampleEntry } | null {
  let e = m.sounds[id];
  let at = id;
  if (e?.alias) {
    at = e.alias;
    e = m.sounds[at];
  }
  return e?.clips && e.group && m.groups[e.group] ? { id: at, entry: e } : null;
}

/** Margin (s) kept around a clip when cutting, to absorb the codec's start delay. */
const MARGIN = 0.04;

/** Index of the first sample louder than `thresholdDb` below the clip's peak, minus a short pre-roll. */
export function onsetIndex(buf: Float32Array, rate: number, thresholdDb = -50, preRoll = 0.002): number {
  const pk = peakOf(buf);
  if (pk === 0) return 0;
  const th = pk * Math.pow(10, thresholdDb / 20);
  let i = 0;
  while (i < buf.length && Math.abs(buf[i]) < th) i++;
  return Math.max(0, i - Math.round(preRoll * rate));
}

/**
 * Cut the variants out of a decoded strip (copies, so the strip can be freed). A one-shot keeps a
 * margin around its range (its onset is found afterwards). A bed is a loop of an exact length: the
 * codec may have shifted the strip by a few milliseconds, so its start is located by the first
 * audible sample after the silence in front of it and exactly `end - start` seconds are taken.
 */
export function cutClips(strip: Float32Array, rate: number, clips: readonly [number, number][], kind: 'oneshot' | 'bed' = 'oneshot'): Float32Array[] {
  return clips.map(([a, b]) => {
    if (kind === 'bed') {
      const n = Math.round((b - a) * rate);
      let s = Math.max(0, Math.floor((a - 0.1) * rate));
      const stop = Math.min(strip.length, Math.ceil((a + 0.1) * rate));
      let pk = 0;
      for (let i = s; i < stop; i++) pk = Math.max(pk, Math.abs(strip[i]));
      const th = pk * 0.01;
      while (s < stop && Math.abs(strip[s]) < th) s++;
      return strip.slice(s, Math.min(strip.length, s + n));
    }
    const s = Math.max(0, Math.floor((a - MARGIN) * rate));
    const e = Math.min(strip.length, Math.ceil((b + MARGIN) * rate));
    return strip.slice(s, Math.max(s + 1, e));
  });
}

/**
 * Level one cut-out clip like a baked one: one-shots are trimmed to their onset, high-passed, peak
 * and loudness normalised and faded (see bank.bakeVariant); beds just lose their DC and are set to
 * the bed RMS (the strip already holds a seamless loop).
 */
export function finishSample(buf: Float32Array, rate: number, kind: 'oneshot' | 'bed'): Float32Array {
  if (kind === 'bed') {
    let m = 0;
    for (let i = 0; i < buf.length; i++) m += buf[i];
    m /= Math.max(1, buf.length);
    for (let i = 0; i < buf.length; i++) buf[i] -= m;
    // To the bed RMS, but a sparse recording (birdsong: a few loud chirps in near silence) would need
    // more gain than its peaks allow: scale it down to the peak limit instead of distorting it.
    const r = rmsOf(buf);
    const pk = peakOf(buf);
    if (r > 1e-9) {
      const g = Math.min(BED_RMS / r, 0.9 / Math.max(pk, 1e-9));
      for (let i = 0; i < buf.length; i++) buf[i] *= g;
    }
    return buf;
  }
  let out: Float32Array = new Float32Array(buf.subarray(onsetIndex(buf, rate)));
  removeDc(out, rate, 18);
  normalizePeak(out, 0.9);
  out = trimTail(out, rate, 2e-4, 0.01);
  normalizeLoudness(out, rate, ONESHOT_LOUDNESS, 0.05, ONESHOT_PEAK);
  fadeEdges(out, rate, 0.0003, 0.008);
  if (peakOf(out) > 1) normalizePeak(out, ONESHOT_PEAK);
  return out;
}

/** Decode a compressed strip to mono PCM at `rate` (the context resamples). */
export async function decodeStrip(bytes: ArrayBuffer, rate: number): Promise<Float32Array> {
  const g = globalThis as { OfflineAudioContext?: typeof OfflineAudioContext; webkitOfflineAudioContext?: typeof OfflineAudioContext };
  const Ctor = g.OfflineAudioContext ?? g.webkitOfflineAudioContext;
  if (!Ctor) throw new Error('no OfflineAudioContext');
  const ctx = new Ctor(1, 1, rate);
  const buf = await ctx.decodeAudioData(bytes);
  if (buf.numberOfChannels === 1) return buf.getChannelData(0).slice();
  const out = new Float32Array(buf.length);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < out.length; i++) out[i] += d[i] / buf.numberOfChannels;
  }
  return out;
}

export interface LibraryHooks {
  fetchBytes(url: string): Promise<ArrayBuffer>;
  fetchJson(url: string): Promise<unknown>;
  decode(bytes: ArrayBuffer, rate: number): Promise<Float32Array>;
}

const browserHooks: LibraryHooks = {
  fetchBytes: async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.arrayBuffer();
  },
  fetchJson: async (url) => {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    return r.json();
  },
  decode: decodeStrip,
};

export class SampleLibrary implements SampleSource {
  readonly ready: Promise<void>;
  manifest: SampleManifest | null = null;
  readonly loadedGroups = new Set<string>();
  readonly failedGroups = new Set<string>();
  /** Which format decoded (m4a first, mp3 if the browser cannot decode AAC). */
  format: 'm4a' | 'mp3' | null = null;
  /** Milliseconds spent cutting and levelling on the main thread (decoding runs in the browser's own thread), per group. */
  readonly cutMs = new Map<string, number>();
  private groups = new Map<string, Promise<boolean>>();
  private pcm = new Map<string, Float32Array[]>();
  private rates = new Map<string, number>();
  private settled = false;

  constructor(
    private readonly baseUrl: string,
    private readonly hooks: LibraryHooks = browserHooks,
  ) {
    this.ready = this.hooks.fetchJson(`${baseUrl}manifest.json`).then(
      (m) => {
        const man = m as SampleManifest;
        if (man?.version === 1 && man.sounds && man.groups) this.manifest = man;
        this.settled = true;
      },
      () => {
        this.settled = true;
      },
    );
  }

  private owner(id: string) {
    return this.manifest ? resolveEntry(this.manifest, id) : null;
  }

  wants(id: string): boolean {
    const o = this.owner(id);
    return !!o && !this.failedGroups.has(o.entry.group!);
  }

  pending(id: string): boolean {
    if (!this.settled) return true;
    const o = this.owner(id);
    if (!o) return false;
    const g = o.entry.group!;
    return !this.failedGroups.has(g) && !this.loadedGroups.has(g);
  }

  rateOf(id: string): number | undefined {
    return this.rates.get(id);
  }

  /** Start fetching groups now (the engine calls this for the sounds every session needs). */
  async prefetch(groups: readonly string[]): Promise<void> {
    await this.ready;
    await Promise.all(groups.filter((g) => this.manifest?.groups[g]).map((g) => this.loadGroup(g)));
  }

  async load(id: string): Promise<Float32Array[] | null> {
    await this.ready;
    const o = this.owner(id);
    if (!o) return null;
    if (!(await this.loadGroup(o.entry.group!))) return null;
    return this.pcm.get(id) ?? null;
  }

  private loadGroup(name: string): Promise<boolean> {
    let p = this.groups.get(name);
    if (!p) {
      p = this.fetchGroup(name).then(
        (ok) => {
          (ok ? this.loadedGroups : this.failedGroups).add(name);
          return ok;
        },
        (e) => {
          console.warn(`[audio] sample group "${name}" failed: ${e?.message ?? e}`);
          this.failedGroups.add(name);
          return false;
        },
      );
      this.groups.set(name, p);
    }
    return p;
  }

  private async fetchGroup(name: string): Promise<boolean> {
    const m = this.manifest!;
    const g = m.groups[name];
    let strip: Float32Array | null = null;
    for (const fmt of ['m4a', 'mp3'] as const) {
      try {
        const bytes = await this.hooks.fetchBytes(this.baseUrl + g[fmt]);
        strip = await this.hooks.decode(bytes, g.rate);
        this.format = fmt;
        break;
      } catch {
        /* try the next format */
      }
    }
    if (!strip) return false;
    // Cut every sound of the group once; aliases share the owner's arrays.
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    const own = new Map<string, Float32Array[]>();
    for (const [id, e] of Object.entries(m.sounds)) {
      if (e.group !== name || !e.clips) continue;
      const kind = e.kind ?? 'oneshot';
      own.set(id, cutClips(strip, g.rate, e.clips, kind).map((c) => finishSample(c, g.rate, kind)));
    }
    for (const [id, e] of Object.entries(m.sounds)) {
      const list = e.alias ? own.get(e.alias) : own.get(id);
      if (!list) continue;
      this.pcm.set(id, list);
      this.rates.set(id, g.rate);
    }
    this.cutMs.set(name, (typeof performance !== 'undefined' ? performance.now() : 0) - t0);
    return true;
  }

  /** Bytes of PCM held for sounds the engine has not uploaded yet. */
  heldBytes(): number {
    const seen = new Set<Float32Array>();
    let n = 0;
    for (const l of this.pcm.values())
      for (const b of l)
        if (!seen.has(b)) {
          seen.add(b);
          n += b.byteLength;
        }
    return n;
  }

  /** The engine copied this sound into AudioBuffers: drop the PCM. */
  release(id: string) {
    this.pcm.delete(id);
  }

  /** Ids of every recorded sound (for reports and the sound board). */
  ids(): string[] {
    return this.manifest ? Object.keys(this.manifest.sounds) : [];
  }
}
