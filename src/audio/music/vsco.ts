/**
 * The recorded instruments of the music engine: harp, oboe, flute, a low string pad and hand percussion,
 * from the VSCO 2 Community Edition (CC0; public/audio/music/CREDITS.md).
 *
 * Samples are loaded per group on first use (a few hundred KB each, AAC with an MP3 fallback), decoded at
 * 24 kHz (the files' own rate, so nothing is resampled and each buffer is a third smaller than at
 * 48 kHz), and kept: all of it is about 11 MB. AudioBuffers are not tied to a context, so one bank
 * serves the live context and offline renders alike.
 *
 * A group that cannot be loaded (offline, blocked, no decoder) is marked failed, and the instrument
 * falls back to the old synthesised voice for it, so the music never stalls waiting for a file.
 */
import { VSCO, type VscoSample } from './vscoManifest';

export type VscoGroup = keyof typeof VSCO;
export type GroupState = 'idle' | 'loading' | 'ready' | 'failed';

/** Rate of the decoded buffers (the encoded files are 24 kHz). */
export const VSCO_RATE = 24000;

const baseUrl = (import.meta as { env?: { BASE_URL?: string } }).env?.BASE_URL ?? '/';

export const midiToFreq = (m: number) => 440 * Math.pow(2, (m - 69) / 12);
export const freqToMidi = (f: number) => 69 + 12 * Math.log2(f / 440);

export class VscoBank {
  private bufs = new Map<string, AudioBuffer>();
  private states = new Map<string, GroupState>();
  private jobs = new Map<string, Promise<void>>();
  private total = 0;
  /** File type that decoded last time ('m4a' first; mp3 where AAC cannot be decoded). */
  private ext: 'm4a' | 'mp3' = 'm4a';
  /** Loads that failed (for stats). */
  failures: string[] = [];

  /** Decoded bytes held. */
  get bytes(): number {
    return this.total;
  }

  state(group: VscoGroup): GroupState {
    return this.states.get(group) ?? 'idle';
  }

  /** Start loading a group (once). True when it is settled: loaded, or failed and so on its fallback. */
  request(group: VscoGroup): boolean {
    const st = this.state(group);
    if (st === 'idle') void this.load(group);
    return st === 'ready' || st === 'failed';
  }

  /** Load a group; resolves when it has settled (never rejects). */
  load(group: VscoGroup): Promise<void> {
    const have = this.jobs.get(group);
    if (have) return have;
    this.states.set(group, 'loading');
    const job = Promise.all(VSCO[group].map((s) => this.fetchOne(s)))
      .then(() => {
        this.states.set(group, 'ready');
      })
      .catch((e: Error) => {
        this.failures.push(`${group}: ${e?.message ?? e}`);
        this.states.set(group, 'failed');
      });
    this.jobs.set(group, job);
    return job;
  }

  /** Load every group (offline renders and tests, which cannot wait for the music to ask). */
  async loadAll(): Promise<void> {
    await Promise.all((Object.keys(VSCO) as VscoGroup[]).map((g) => this.load(g)));
  }

  private async fetchOne(s: VscoSample): Promise<void> {
    const order: ('m4a' | 'mp3')[] = this.ext === 'm4a' ? ['m4a', 'mp3'] : ['mp3', 'm4a'];
    let err: unknown;
    for (const ext of order) {
      try {
        const res = await fetch(`${baseUrl}audio/music/${s.id}.${ext}`);
        if (!res.ok) throw new Error(`${s.id}.${ext}: HTTP ${res.status}`);
        const data = await res.arrayBuffer();
        const buf = await decode(data);
        this.ext = ext;
        this.bufs.set(s.id, buf);
        this.total += buf.length * 4;
        return;
      } catch (e) {
        err = e;
      }
    }
    throw err;
  }

  get(id: string): AudioBuffer | undefined {
    return this.bufs.get(id);
  }

  /** The recorded note nearest in pitch to `midi` (fractional) in a pitched group, with its buffer. */
  nearest(group: VscoGroup, midi: number): { sample: VscoSample; buf: AudioBuffer } | null {
    let best: VscoSample | null = null;
    for (const s of VSCO[group]) if (s.midi !== undefined && (!best || Math.abs(s.midi - midi) < Math.abs(best.midi! - midi))) best = s;
    const buf = best ? this.bufs.get(best.id) : undefined;
    return best && buf ? { sample: best, buf } : null;
  }

  /** A percussion hit: variant `pick` (0..1) among the group's samples of the given dynamic layer. */
  hit(group: VscoGroup, layer: number, pick: number): { sample: VscoSample; buf: AudioBuffer } | null {
    const all = VSCO[group];
    let set = all.filter((s) => (s.layer ?? 0) === layer);
    if (!set.length) set = all;
    const sample = set[Math.min(set.length - 1, Math.floor(pick * set.length))];
    const buf = this.bufs.get(sample.id);
    return buf ? { sample, buf } : null;
  }

  /** Drop everything (tests). */
  clear() {
    this.bufs.clear();
    this.states.clear();
    this.jobs.clear();
    this.total = 0;
    this.failures = [];
  }
}

let decoder: OfflineAudioContext | null = null;

/** Decode at the files' own rate (a throwaway OfflineAudioContext is the way to pick the rate). */
function decode(data: ArrayBuffer): Promise<AudioBuffer> {
  decoder ??= new OfflineAudioContext(1, 1, VSCO_RATE);
  const ctx = decoder;
  return new Promise((res, rej) => {
    try {
      const p = ctx.decodeAudioData(data, res, rej);
      p?.then?.(res, rej);
    } catch (e) {
      rej(e);
    }
  });
}

/** The shared bank used by every music rack. */
export const vsco = new VscoBank();
