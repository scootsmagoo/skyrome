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
import { Cymbala, FLUTE, Lyre, OBOE, Pad, Reed, Tympanum, type MusicOutput } from './instruments';
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

/**
 * Instrument gains (each recording is level-matched to about -25 dBFS RMS, so these are the mix).
 * Tuned with tools/music/render-check.mjs so that exploring music sits near -31 dBFS RMS before the
 * music bus, combat a few dB above, and the 1-4 kHz band stays well under the low and mid bands.
 */
const LEVELS = { harp: 1.65, oboe: 1.85, flute: 1.95, pad: 1.0, drum: 1.5, tambourine: 0.8 };
/** The lowest notes the recorded oboe (B-flat 3) and flute (middle C) play; lower melody notes sound an octave up. */
const LOWEST = { aulos: 233, syrinx: 250 };

/** Instruments for one performer, created lazily, all feeding one fader. */
export class WebAudioRack implements Rack {
  private readonly out: GainNode;
  private readonly revOut: GainNode;
  private readonly o: MusicOutput;
  private readonly sync: boolean;
  private oboe?: Reed;
  private flute?: Reed;
  private lyreInst?: Lyre;
  private tymp?: Tympanum;
  private cym?: Cymbala;
  private pad?: Pad;

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
    return (this.lyreInst ??= new Lyre(this.o, this.state === 'combat' || this.state === 'tavern' ? 'kithara' : 'lyre', { gain: LEVELS.harp, pan: -0.25, reverb: 0.4 }, this.sync));
  }
  private get drums() {
    return (this.tymp ??= new Tympanum(this.o, { gain: LEVELS.drum, pan: 0.18, reverb: 0.3 }, this.sync));
  }
  private get cymbals() {
    return (this.cym ??= new Cymbala(this.o, { gain: LEVELS.tambourine, pan: 0.35, reverb: 0.4 }, this.sync));
  }
  private get oboeInst() {
    return (this.oboe ??= new Reed(this.o, OBOE, { gain: LEVELS.oboe, pan: 0.15, reverb: 0.4 }));
  }
  private get fluteInst() {
    return (this.flute ??= new Reed(this.o, FLUTE, { gain: LEVELS.flute, pan: -0.1, reverb: 0.5 }));
  }
  private get padInst() {
    return (this.pad ??= new Pad(this.o, { gain: LEVELS.pad, pan: 0.05, reverb: 0.6 }));
  }

  /** Request every sample the block plays (harp notes, melody voices, the pad, drum and tambourine strokes). */
  prepare(b: Block): boolean {
    let ready = true;
    for (const e of b.events) {
      if (e.part === 'lyre') ready = this.ly.ready(e.freq!, e.bright ?? 0.55) && ready;
      else if (e.part === 'drum') ready = this.drums.ready(e.stroke ?? 'doum') && ready;
      else if (e.part === 'cymbal') ready = this.cymbals.ready(e.cymbal ?? 'choke') && ready;
      else if (e.part === 'melody' || e.part === 'answer') {
        const inst = e.part === 'melody' ? (b.info.melody ?? 'aulos') : (b.info.answer ?? 'syrinx');
        ready = (inst === 'aulos' ? this.oboeInst : this.fluteInst).settled() && ready;
      } else if (e.part === 'drone' && e.freq) ready = this.padInst.settled() && ready;
    }
    return ready;
  }

  melody(inst: MelodyInstrument, when: number, freq: number, dur: number, vel: number, legato: boolean, release: boolean) {
    const reed = inst === 'aulos' ? this.oboeInst : this.fluteInst;
    // If this reed's recordings failed to load, the other one carries the line; with neither, it is silent.
    const use = reed.loaded ? reed : (inst === 'aulos' ? this.fluteInst : this.oboeInst);
    if (!use.loaded) return;
    let f = freq;
    while (f < LOWEST[use === this.oboeInst ? 'aulos' : 'syrinx']) f *= 2;
    use.note(when, f, dur, vel, legato, release);
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
    if (!freq && !this.pad) return;
    this.padInst.set(when, freq, vel);
  }
  level(when: number, gain: number, seconds: number) {
    const wet = STYLES[this.state].reverb / 0.5;
    const trim = STYLES[this.state].level;
    for (const [g, v] of [[this.out.gain, gain * trim], [this.revOut.gain, gain * trim * wet]] as const) {
      g.cancelScheduledValues(when);
      g.setValueAtTime(g.value, when);
      g.setTargetAtTime(v, when, Math.max(0.01, seconds / 3));
    }
  }
  dispose(when: number) {
    for (const i of [this.oboe, this.flute, this.lyreInst, this.tymp, this.cym, this.pad]) i?.dispose(when);
    const ms = Math.max(0, (when - this.o.ctx.currentTime) * 1000) + 800;
    setTimeout(() => {
      this.out.disconnect();
      this.revOut.disconnect();
    }, ms);
  }
}

// ---------------------------------------------------------------- the music bus

/**
 * Tone shaping for everything the music plays, in front of the music bus and its hall reverb: a
 * high-pass under the rumble, a dip where oboe, flute and harp pile up (about 2.4 kHz) and a low-pass
 * above the point where recorded instruments only add hiss. This is what makes the music sit under
 * the world instead of cutting through it.
 */
export const MUSIC_TONE = { highpass: 100, shelfHz: 240, shelfDb: -3.5, dipHz: 2300, dipDb: -4, lowpass: 4400, reverbLowpass: 3800 };

class MusicChain {
  readonly output: MusicOutput;
  private readonly nodes: AudioNode[] = [];

  constructor(out: MusicOutput) {
    const ctx = out.ctx;
    this.output = out;
    if (typeof ctx.createBiquadFilter !== 'function') return; // test doubles have no audio graph
    const make = <T extends AudioNode>(n: T): T => (this.nodes.push(n), n);
    const hp = make(ctx.createBiquadFilter());
    hp.type = 'highpass';
    hp.frequency.value = MUSIC_TONE.highpass;
    hp.Q.value = 0.6;
    // Half of the music's power sat under 250 Hz (harp bass, drum, pad): thin it so it sits under the
    // world on laptop speakers without losing the body.
    const shelf = make(ctx.createBiquadFilter());
    shelf.type = 'lowshelf';
    shelf.frequency.value = MUSIC_TONE.shelfHz;
    shelf.gain.value = MUSIC_TONE.shelfDb;
    const dip = make(ctx.createBiquadFilter());
    dip.type = 'peaking';
    dip.frequency.value = MUSIC_TONE.dipHz;
    dip.Q.value = 0.8;
    dip.gain.value = MUSIC_TONE.dipDb;
    const lp = make(ctx.createBiquadFilter());
    lp.type = 'lowpass';
    lp.frequency.value = MUSIC_TONE.lowpass;
    lp.Q.value = 0.6;
    hp.connect(shelf);
    shelf.connect(dip);
    dip.connect(lp);
    lp.connect(out.dry);
    const rlp = make(ctx.createBiquadFilter());
    rlp.type = 'lowpass';
    rlp.frequency.value = MUSIC_TONE.reverbLowpass;
    rlp.Q.value = 0.5;
    rlp.connect(out.rev);
    this.output = { ctx, dry: hp, rev: rlp };
  }

  dispose() {
    for (const n of this.nodes) n.disconnect();
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
  /** The tone shaping between the instruments and the music bus. */
  private chain: MusicChain | null = null;
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
    this.chain?.dispose();
    this.chain = new MusicChain(out);
    this.out = this.chain.output;
    if (!opts.offline && !this.timer) this.timer = setInterval(() => this.update(), 50);
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
    // The racks release their own nodes shortly after `t`; the chain goes after them.
    const chain = this.chain;
    this.chain = null;
    if (chain) setTimeout(() => chain.dispose(), 2500);
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
      const out = toCombat ? 2.2 : prev !== 'silence' ? STYLES[prev as Exclude<MusicState, 'silence'>].fadeOut : 1;
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
