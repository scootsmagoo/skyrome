/**
 * Music director: a lookahead scheduler on the Web Audio clock plus state crossfades.
 *
 *   music.setState('explore')                  // base state: explore-day / explore-night by game time
 *   music.setOverride('combat', 'combat', 10)  // fights (null clears it when the fight ends)
 *   music.setOverride('tension', 'tension', 5) // enemies searching
 *
 * Requests are layered and the highest priority wins. Ambience zones (temples, tabernae) request
 * their music with priority 1. The base state set by `setState` ranks below them when it is
 * 'explore' (or 'silence'), so walking into a temple brings temple music; any other base state
 * ('combat', 'tavern', …) ranks 2 and wins over zones. Fights should still use the 'combat'
 * override above, which outranks everything else.
 *
 * Each state runs a Performer (a Composer + an instrument Rack). `pump(horizon)` schedules every
 * event that starts before `horizon` (Web Audio clock seconds). In real time the engine pumps
 * ~0.3 s ahead every frame and on a 50 ms timer (so frame hitches never starve the music); offline
 * rendering simply pumps the whole duration at once. A performer asks its rack to prepare each
 * block's samples one block ahead (baked in the worker) and only schedules a block once they are
 * ready, so the main thread never bakes music.
 */
import type { DrumStroke } from '../dsp/instruments';
import { Composer, type Block, type MusicEvent } from './composer';
import { Aulos, Cymbala, Drone, Lyre, Syrinx, Tympanum, type MusicOutput } from './instruments';
import { percussionSpecs } from './sampleSpec';
import { musicSamples } from './samples';
import { STYLES, type MelodyInstrument, type MusicState } from './styles';

export type { MusicState } from './styles';

/** What a Performer plays on. The Web Audio rack implements it; tests use a recording fake. */
export interface Rack {
  melody(inst: MelodyInstrument, when: number, freq: number, dur: number, vel: number, legato: boolean, release: boolean): void;
  lyre(when: number, freq: number, vel: number, dur: number, bright: number): void;
  drum(when: number, stroke: DrumStroke, vel: number): void;
  cymbal(when: number, kind: 'ring' | 'choke', vel: number): void;
  drone(when: number, freq: number | null, vel: number): void;
  /** Ramp the rack's output level. */
  level(when: number, gain: number, seconds: number): void;
  /**
   * Make sure everything a block plays is baked (starting any bakes); true when it is all ready.
   * Racks without baked samples may omit it.
   */
  prepare?(block: Block): boolean;
  dispose(when: number): void;
}

interface Queued {
  time: number;
  e: MusicEvent;
  spp: number;
  release: boolean;
}

/** Plays one state's endless composition through a rack. */
export class Performer {
  readonly composer: Composer;
  private queue: Queued[] = [];
  /** Start time of the next block (s). */
  private cursor: number;
  /** The next block, generated one ahead so its samples bake while the current one plays. */
  private upcoming: Block | null = null;
  /** The upcoming block's samples weren't ready when it was due (the music waited for them). */
  private waited = false;
  /** No new blocks start at or after this time. */
  stopAt = Infinity;
  /** Most recent block (for the HUD / sound board). */
  block: Block | null = null;
  /** Events played (for verification). */
  played = 0;
  /** Optional observer of every scheduled event. */
  onEvent?: (time: number, e: MusicEvent) => void;
  private jitter = 0x9e3779b9;

  constructor(
    readonly state: Exclude<MusicState, 'silence'>,
    readonly rack: Rack,
    start: number,
    seed: number | string,
  ) {
    this.composer = new Composer(state, seed);
    this.cursor = start;
  }

  get nextBlockTime() {
    return this.cursor;
  }

  /** Schedule everything that starts before `horizon`. `now` drops events that are already late. */
  pump(horizon: number, now = -Infinity) {
    for (let guard = 0; guard < 10000; guard++) {
      if (!this.queue.length) {
        if (this.cursor >= horizon || this.cursor >= this.stopAt) return;
        const b = (this.upcoming ??= this.composer.next());
        if (this.rack.prepare && !this.rack.prepare(b)) {
          // Its samples are still baking off the main thread: hold the music for a moment rather
          // than play a block with missing notes (a new state's first block waits a few tens of ms).
          if (now > -Infinity) {
            this.waited = true;
            this.cursor = Math.max(this.cursor, now + 0.03);
          }
          return;
        }
        if (this.waited && now > -Infinity) this.cursor = Math.max(this.cursor, now + 0.02);
        this.waited = false;
        // Generate the next block now so its samples bake while this one plays.
        this.upcoming = this.stopAt === Infinity ? this.composer.next() : null;
        if (this.upcoming) this.rack.prepare?.(this.upcoming);
        this.enqueue(b, this.cursor);
        this.block = b;
        this.cursor += b.pulses * b.spp;
        continue;
      }
      const q = this.queue[0];
      if (q.time >= horizon) return;
      this.queue.shift();
      if (q.time >= this.stopAt) continue;
      if (q.time < now - 0.05 && q.e.part !== 'drone') continue; // hitch: skip rather than burst
      this.play(q, Math.max(q.time, now));
    }
  }

  private enqueue(b: Block, start: number) {
    const ev = b.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      let release = true;
      if (e.part === 'melody' || e.part === 'answer') {
        // Don't release into a slurred next note of the same voice.
        for (let j = i + 1; j < ev.length; j++) {
          if (ev[j].part !== e.part) continue;
          release = !(ev[j].legato && ev[j].t - (e.t + (e.dur ?? 0)) < 0.35);
          break;
        }
      }
      this.queue.push({ time: start + e.t * b.spp, e, spp: b.spp, release });
    }
    this.queue.sort((a, b2) => a.time - b2.time);
  }

  private humanize(e: MusicEvent): number {
    if (e.orn || e.part === 'drone') return 0;
    // Tiny timing looseness (±6 ms; drums tighter) so it breathes like players, not a sequencer.
    this.jitter ^= this.jitter << 13;
    this.jitter ^= this.jitter >>> 17;
    this.jitter ^= this.jitter << 5;
    const r = ((this.jitter >>> 0) / 4294967296 - 0.5) * 2;
    return r * (e.part === 'drum' ? 0.003 : 0.006);
  }

  private play(q: Queued, when0: number) {
    const e = q.e;
    const when = Math.max(0, when0 + this.humanize(e));
    const dur = (e.dur ?? 1) * q.spp;
    const inst = this.block?.info;
    switch (e.part) {
      case 'melody':
        this.rack.melody(inst?.melody ?? 'aulos', when, e.freq!, dur, e.vel, !!e.legato, q.release);
        break;
      case 'answer':
        this.rack.melody(inst?.answer ?? 'syrinx', when, e.freq!, dur, e.vel, !!e.legato, q.release);
        break;
      case 'lyre':
        this.rack.lyre(when, e.freq!, e.vel, dur, e.bright ?? 0.55);
        break;
      case 'drum':
        this.rack.drum(when, e.stroke ?? 'doum', e.vel);
        break;
      case 'cymbal':
        this.rack.cymbal(when, e.cymbal ?? 'choke', e.vel);
        break;
      case 'drone':
        this.rack.drone(when, e.freq ?? null, e.vel);
        break;
    }
    this.played++;
    this.onEvent?.(when, e);
  }
}

// ---------------------------------------------------------------- Web Audio rack

/** Instruments for one performer, created lazily, all feeding one fader. */
export class WebAudioRack implements Rack {
  private readonly out: GainNode;
  private readonly revOut: GainNode;
  private readonly o: MusicOutput;
  private readonly sync: boolean;
  private aulos?: Aulos;
  private syrinx?: Syrinx;
  private lyreInst?: Lyre;
  private tymp?: Tympanum;
  private cym?: Cymbala;
  private droneInst?: Drone;

  constructor(
    dest: MusicOutput,
    private readonly state: Exclude<MusicState, 'silence'>,
    /** Bake samples on the spot (offline rendering) instead of in the worker. */
    opts: { sync?: boolean } = {},
  ) {
    const ctx = dest.ctx;
    this.sync = !!opts.sync;
    // One fader for the dry mix and one for the reverb sends; both follow `level()`.
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.revOut = ctx.createGain();
    this.revOut.gain.value = 0;
    this.out.connect(dest.dry);
    this.revOut.connect(dest.rev);
    this.o = { ctx, dry: this.out, rev: this.revOut };
  }

  private get ly() {
    return (this.lyreInst ??= new Lyre(this.o, this.state === 'combat' || this.state === 'tavern' ? 'kithara' : 'lyre', { gain: this.state === 'combat' ? 0.32 : 0.42, pan: -0.25, reverb: 0.4 }, this.sync));
  }
  private get drums() {
    return (this.tymp ??= new Tympanum(this.o, { gain: this.state === 'combat' ? 0.5 : 0.45, pan: 0.18, reverb: 0.3 }, this.sync));
  }
  private get cymbals() {
    return (this.cym ??= new Cymbala(this.o, { gain: 0.16, pan: 0.35, reverb: 0.4 }, this.sync));
  }

  /** Request every sample the block plays (lyre notes, drum and cymbal strokes). */
  prepare(b: Block): boolean {
    let ready = true;
    for (const e of b.events) {
      if (e.part === 'lyre') ready = this.ly.ready(e.freq!, e.bright ?? 0.55) && ready;
      else if (e.part === 'drum') ready = this.drums.ready(e.stroke ?? 'doum') && ready;
      else if (e.part === 'cymbal') ready = this.cymbals.ready(e.cymbal ?? 'choke') && ready;
    }
    return ready;
  }

  melody(inst: MelodyInstrument, when: number, freq: number, dur: number, vel: number, legato: boolean, release: boolean) {
    if (inst === 'aulos') (this.aulos ??= new Aulos(this.o, { gain: 0.24, pan: 0.15, reverb: 0.4 })).note(when, freq, dur, vel, legato, release);
    else (this.syrinx ??= new Syrinx(this.o, { gain: 0.34, pan: -0.1, reverb: 0.5 })).note(when, freq, dur, vel, legato, release);
  }
  lyre(when: number, freq: number, vel: number, dur: number, bright: number) {
    this.ly.play(when, freq, vel, dur, bright);
  }
  drum(when: number, stroke: DrumStroke, vel: number) {
    this.drums.hit(when, stroke, vel);
  }
  cymbal(when: number, kind: 'ring' | 'choke', vel: number) {
    this.cymbals.hit(when, kind, vel);
  }
  drone(when: number, freq: number | null, vel: number) {
    if (!freq && !this.droneInst) return;
    (this.droneInst ??= new Drone(this.o, { gain: 0.16, pan: 0.05, reverb: 0.5 })).set(when, freq, vel);
  }
  level(when: number, gain: number, seconds: number) {
    const wet = STYLES[this.state].reverb / 0.5;
    for (const [g, v] of [[this.out.gain, gain], [this.revOut.gain, gain * wet]] as const) {
      g.cancelScheduledValues(when);
      g.setValueAtTime(g.value, when);
      g.setTargetAtTime(v, when, Math.max(0.01, seconds / 3));
    }
  }
  dispose(when: number) {
    for (const i of [this.aulos, this.syrinx, this.lyreInst, this.tymp, this.cym, this.droneInst]) i?.dispose(when);
    const ms = Math.max(0, (when - this.o.ctx.currentTime) * 1000) + 800;
    setTimeout(() => {
      this.out.disconnect();
      this.revOut.disconnect();
    }, ms);
  }
}

// ---------------------------------------------------------------- director

const LOOKAHEAD = 0.3;

interface Running {
  performer: Performer;
  rack: Rack;
  /** When the fade-out completes (Infinity while current). */
  end: number;
}

export type MusicRequest = MusicState | 'explore';

/** Base states that ambience zones may override (they say "nothing in particular is happening"). */
const BACKGROUND: ReadonlySet<MusicRequest> = new Set(['explore', 'explore-day', 'explore-night', 'silence']);
/** Priority of any other base state: above ambience zones (1), below fights and alerts. */
const BASE_PRIORITY = 2;

export class MusicDirector {
  private out: MusicOutput | null = null;
  private base: MusicRequest = 'silence';
  private overrides = new Map<string, { state: MusicRequest; priority: number }>();
  private current: Running | null = null;
  private fading: Running[] = [];
  private effective: MusicState = 'silence';
  private seed = 1;
  private timer: ReturnType<typeof setInterval> | null = null;
  /** Night test for the 'explore' alias (wired to game time by the engine). */
  isNight: () => boolean = () => false;
  /** Factory for racks (tests inject fakes). */
  makeRack: (out: MusicOutput, state: Exclude<MusicState, 'silence'>) => Rack = (out, s) => new WebAudioRack(out, s);
  /** Called when the effective state changes. */
  onChange?: (state: MusicState) => void;

  /** The state actually playing (after resolving overrides and the explore alias). */
  get state(): MusicState {
    return this.effective;
  }

  /** The block currently being played (mode, tempo, phrase…), for display. */
  get nowPlaying(): Block | null {
    return this.current?.performer.block ?? null;
  }

  get requested(): MusicRequest {
    return this.base;
  }

  /** Connect to an audio context's music bus. Starts the real-time pump unless `offline`. */
  attach(out: MusicOutput, opts: { offline?: boolean } = {}) {
    this.out = out;
    if (!opts.offline) {
      if (!this.timer) this.timer = setInterval(() => this.update(), 50);
      // Percussion is shared by every style and small (≈2 MB): bake it all now, in the worker.
      for (const spec of percussionSpecs()) musicSamples.get(out.ctx, spec);
    }
    this.resolve(true);
  }

  /**
   * The base state from game logic. 'explore' (day/night by the clock) and 'silence' yield to
   * ambience-zone music (temples, tabernae); any other base state outranks zones. For fights use
   * `setOverride('combat', 'combat', 10)` so ending the fight restores whatever was playing.
   */
  setState(state: MusicRequest) {
    this.base = state;
    this.resolve();
  }

  /**
   * Layered request; the highest priority wins (ties: the base, then the earliest request).
   * Conventions: ambience zones 1, a non-explore base state 2, tension 5, combat 10. `null` clears.
   */
  setOverride(key: string, state: MusicRequest | null, priority = 1) {
    if (state === null) this.overrides.delete(key);
    else this.overrides.set(key, { state, priority });
    this.resolve();
  }

  /** Real-time tick (frame + timer). */
  update() {
    const ctx = this.out?.ctx;
    if (!ctx || (ctx as AudioContext).state !== 'running') return;
    this.resolve();
    this.pump(ctx.currentTime + LOOKAHEAD, ctx.currentTime);
  }

  /** Schedule everything up to `horizon` (offline rendering calls this once with the full length). */
  pump(horizon: number, now = -Infinity) {
    this.current?.performer.pump(horizon, now);
    for (const f of this.fading) f.performer.pump(Math.min(horizon, f.end), now);
    const t = this.out?.ctx.currentTime ?? 0;
    this.fading = this.fading.filter((f) => {
      const keep = f.end > t || f.end > horizon - LOOKAHEAD * 2;
      // Faded out: release its instruments (kept until now so the state could still come back).
      if (!keep) f.rack.dispose(t);
      return keep;
    });
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const t = this.out?.ctx.currentTime ?? 0;
    for (const r of [this.current, ...this.fading]) r?.rack.dispose(t);
    this.current = null;
    this.fading = [];
  }

  private resolveRequest(r: MusicRequest): MusicState {
    return r === 'explore' ? (this.isNight() ? 'explore-night' : 'explore-day') : r;
  }

  private resolve(force = false) {
    let req: MusicRequest = this.base;
    let best = BACKGROUND.has(this.base) ? -Infinity : BASE_PRIORITY;
    for (const o of this.overrides.values())
      if (o.priority > best) {
        best = o.priority;
        req = o.state;
      }
    const next = this.resolveRequest(req);
    if (next === this.effective && !force) return;
    if (next === this.effective && this.current) return;
    this.transition(next);
  }

  private transition(next: MusicState) {
    const prev = this.effective;
    this.effective = next;
    this.onChange?.(next);
    if (!this.out) return;
    const ctx = this.out.ctx;
    const now = ctx.currentTime;
    const toCombat = next === 'combat';
    const fromCombat = prev === 'combat';
    if (this.current) {
      const c = this.current;
      const out = toCombat ? 1.2 : prev !== 'silence' ? STYLES[prev as Exclude<MusicState, 'silence'>].fadeOut : 1;
      c.end = now + out;
      c.performer.stopAt = now + out;
      c.rack.level(now, 0, out);
      this.fading.push(c);
      this.current = null;
    }
    if (next === 'silence') return;
    const style = STYLES[next];
    // Back to a state that is still fading out (out of the temple and straight back in): bring that
    // performance back up instead of starting a new piece from its intro.
    const back = this.fading.findIndex((f) => f.performer.state === next && f.end > now + 0.1);
    if (back >= 0) {
      const r = this.fading.splice(back, 1)[0];
      r.end = Infinity;
      r.performer.stopAt = Infinity;
      r.rack.level(now, 1, Math.min(style.fadeIn, 2));
      this.current = r;
      return;
    }
    const delay = toCombat ? 0.05 : fromCombat ? 1.8 : 0.4;
    const start = now + delay;
    const rack = this.makeRack(this.out, next);
    const performer = new Performer(next, rack, start, `${next}:${this.seed++}`);
    rack.level(now, 0, 0.01);
    rack.level(start, 1, style.fadeIn);
    this.current = { performer, rack, end: Infinity };
  }
}
