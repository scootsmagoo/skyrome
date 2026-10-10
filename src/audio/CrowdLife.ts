/**
 * The city's voices, driven by the people who are actually there.
 *
 * What the old ambience did: a crowd bed of 18 synthetic talkers whenever you stood in a forum zone,
 * a "city" bed of more babble everywhere, and one synthetic voice every 1-2 s dropped at a random
 * spot around you whether or not anyone stood there. Constant, unlocated, identical at noon and at
 * midnight. See docs/research/crowd-audio.md.
 *
 * What it does now (all of it here, pure and unit tested, plus one small System):
 *  - the crowd hum is a soft texture whose level follows the number of people within 25 m (smoothed
 *    over a few seconds) and the hour: nothing with three people in a lane, a gentle low murmur only
 *    where a crowd is dense, near silence at night;
 *  - voices are rare and come from where people really stand: a short murmured exchange (`amb.murmur`)
 *    at a pair of NPCs who are talking to each other (a `converse` task, or two idlers in the `talk`
 *    loop), a stallholder's call (`amb.calls`) at a merchant. Each pair has a cool-down, and a pacer
 *    leaves silence between voices, longer at night;
 *  - everything else is placed by the engine (distance, air absorption, occlusion), so a voice you
 *    hear is a person you can walk toward.
 */
import type { Game, System } from '../core/Game';
import type { AudioEngine } from './AudioEngine';
import { smoothstep } from './ambienceCurves';

// ---------------------------------------------------------------- pure logic

/** Radius (m) in which people count toward the hum. */
export const HUM_RADIUS = 25;

/**
 * Level (0..1, before the hour and altitude curves) of the crowd hum for `n` people within 25 m.
 * Nothing up to 3 people; a clearly audible but soft murmur from a dozen; about 0.75 for a full
 * forum (50+). The curve is concave so that a street of ten still has a thread of life.
 */
export function crowdHum(n: number): number {
  const t = Math.min(1, Math.max(0, (n - 3) / 52));
  return 0.75 * Math.pow(t, 0.7) * smoothstep(0, 0.12, t);
}

/** Exponential smoothing step: move `cur` toward `target` with time constant `tau` seconds. */
export function easeTo(cur: number, target: number, dt: number, tau: number): number {
  return cur + (target - cur) * (1 - Math.exp(-dt / Math.max(1e-3, tau)));
}

/**
 * How lively the streets are at `hour` (0..1) for the voices: busy from dawn to dusk, a lull at the
 * midday siesta, nearly asleep after dark. The pacers divide their gaps by it.
 */
export function streetActivity(hour: number): number {
  const wrap = (x: number) => ((x % 24) + 24) % 24;
  const h = wrap(hour);
  const day = smoothstep(5.5, 8, h) * (1 - smoothstep(19, 22.5, h));
  const siesta = 1 - 0.35 * smoothstep(12.5, 13.5, h) * (1 - smoothstep(14.5, 15.5, h));
  return Math.max(0.04, day * siesta);
}

/** Time between events: at least `lo` s and at most `hi` s at full activity, stretched as it falls. */
export class Pacer {
  private nextAt = 0;
  constructor(
    private readonly lo: number,
    private readonly hi: number,
  ) {}

  ready(now: number): boolean {
    return now >= this.nextAt;
  }

  /** Call after an event: `u` is a random number in [0, 1). */
  fired(now: number, activity: number, u: number) {
    this.nextAt = now + (this.lo + (this.hi - this.lo) * u) / Math.max(0.2, activity);
  }

  /** Push the first event back (so a fresh level does not start with a burst). */
  delay(now: number, s: number) {
    this.nextAt = Math.max(this.nextAt, now + s);
  }
}

export interface Talker {
  key: string;
  x: number;
  y: number;
  z: number;
}

/** Closest-first pick among the talkers that are in earshot and off cool-down. */
export class ChatterPlanner {
  readonly pacer: Pacer;
  /** Pair key → time it may speak again. */
  private cool = new Map<string, number>();
  /** Pair key → when we first saw them talking (a pair speaks a moment after it starts). */
  private since = new Map<string, number>();
  /** Nearest and farthest range (m) from the listener at which a pair is voiced. */
  minD = 2.5;
  maxD = 14;
  /** Cool-down per pair (s). */
  coolLo = 35;
  coolHi = 80;
  /** A pair must have been talking this long (s) before the first words. */
  settle = 1.2;

  constructor(gapLo = 3.5, gapHi = 9) {
    this.pacer = new Pacer(gapLo, gapHi);
  }

  /** Forget pairs that are not in `seen` any more (keeps the maps small). */
  private prune(now: number, seen: ReadonlySet<string>) {
    for (const k of this.since.keys()) if (!seen.has(k)) this.since.delete(k);
    if (this.cool.size > 64) for (const [k, t] of this.cool) if (t < now) this.cool.delete(k);
  }

  /**
   * `talkers` are pairs currently in conversation. Returns the one that speaks now, or null; the
   * caller plays the sound at it. `rnd` supplies [0, 1) numbers.
   */
  plan(now: number, hour: number, lx: number, lz: number, talkers: readonly Talker[], rnd: () => number): Talker | null {
    const seen = new Set<string>();
    for (const t of talkers) {
      seen.add(t.key);
      if (!this.since.has(t.key)) this.since.set(t.key, now);
    }
    this.prune(now, seen);
    if (!this.pacer.ready(now)) return null;
    const activity = streetActivity(hour);
    let best: Talker | null = null;
    let bestScore = -1;
    for (const t of talkers) {
      const d = Math.hypot(t.x - lx, t.z - lz);
      if (d < this.minD || d > this.maxD) continue;
      if (now - (this.since.get(t.key) ?? now) < this.settle) continue;
      if ((this.cool.get(t.key) ?? 0) > now) continue;
      // Nearer pairs are likelier, with a dice roll so that it is not always the same two.
      const score = (1 / (1 + d * 0.3)) * (0.4 + rnd());
      if (score > bestScore) {
        bestScore = score;
        best = t;
      }
    }
    if (!best) return null;
    this.cool.set(best.key, now + this.coolLo + (this.coolHi - this.coolLo) * rnd());
    this.pacer.fired(now, activity, rnd());
    return best;
  }
}

/** What CrowdLife needs to know about a person (a subset of `Npc`). */
export interface Person {
  id: string;
  position: { x: number; y: number; z: number };
  dead?: boolean;
  talking?: boolean;
  scripted?: boolean;
  role?: { id: string } | null;
  brain?: { task?: { kind?: string; loop?: string | null; partner?: { id: string } | null } | null } | null;
}

export interface PeopleSource {
  near(p: { x: number; y: number; z: number }, r: number): readonly Person[];
}

const IDLE_PAIR_D2 = 3.5 * 3.5;
const VENDOR_ROLES: ReadonlySet<string> = new Set(['merchant']);

/**
 * The pairs in conversation among `people`: those with a `converse` task (one entry per pair) and
 * two idlers in the `talk` loop standing within 3.5 m. Appends to `out` (cleared first).
 */
export function findTalkers(people: readonly Person[], out: Talker[]): Talker[] {
  out.length = 0;
  const used = new Set<string>();
  for (const p of people) {
    if (p.dead || p.talking) continue;
    const t = p.brain?.task;
    if (t?.kind !== 'converse' || !t.partner) continue;
    const a = p.id < t.partner.id ? p.id : t.partner.id;
    const b = p.id < t.partner.id ? t.partner.id : p.id;
    const key = `${a}|${b}`;
    if (used.has(key)) continue;
    used.add(key);
    const q = people.find((o) => o.id === t.partner!.id);
    const qx = q ? q.position.x : p.position.x;
    const qz = q ? q.position.z : p.position.z;
    out.push({ key, x: (p.position.x + qx) / 2, y: p.position.y + 1.5, z: (p.position.z + qz) / 2 });
  }
  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const t = p.brain?.task;
    if (p.dead || p.talking || t?.kind !== 'idle' || t.loop !== 'talk') continue;
    for (let j = i + 1; j < people.length; j++) {
      const q = people[j];
      const u = q.brain?.task;
      if (q.dead || q.talking || u?.kind !== 'idle' || u.loop !== 'talk') continue;
      const dx = p.position.x - q.position.x;
      const dz = p.position.z - q.position.z;
      if (dx * dx + dz * dz > IDLE_PAIR_D2) continue;
      const key = p.id < q.id ? `${p.id}|${q.id}` : `${q.id}|${p.id}`;
      if (used.has(key)) continue;
      used.add(key);
      out.push({ key, x: (p.position.x + q.position.x) / 2, y: p.position.y + 1.5, z: (p.position.z + q.position.z) / 2 });
    }
  }
  return out;
}

/** Stallholders in earshot (6 to 30 m), for the hawkers' calls. */
export function findVendors(people: readonly Person[], lx: number, lz: number, out: Talker[]): Talker[] {
  out.length = 0;
  for (const p of people) {
    if (p.dead || p.talking || !p.role || !VENDOR_ROLES.has(p.role.id)) continue;
    const d = Math.hypot(p.position.x - lx, p.position.z - lz);
    if (d < 6 || d > 30) continue;
    out.push({ key: p.id, x: p.position.x, y: p.position.y + 1.6, z: p.position.z });
  }
  return out;
}

// ---------------------------------------------------------------- the system

export interface CrowdStats {
  /** People within 25 m (instant and smoothed). */
  count: number;
  smoothed: number;
  /** The hum's level before the hour curve. */
  hum: number;
  /** Pairs in conversation within earshot. */
  talkers: number;
  murmurs: number;
  calls: number;
}

/** Drives the 'crowd' layer from the people around the player and voices from real pairs. */
export class CrowdLife implements System {
  readonly name = 'crowdLife';
  readonly priority = 106;
  readonly stats: CrowdStats = { count: 0, smoothed: 0, hum: 0, talkers: 0, murmurs: 0, calls: 0 };
  readonly chatter = new ChatterPlanner();
  readonly hawkers = new ChatterPlanner(14, 34);
  private acc = 0;
  private clock = 0;
  private started = false;
  private readonly talkers: Talker[] = [];
  private readonly vendors: Talker[] = [];

  constructor(
    private readonly game: Game,
    private readonly audio: AudioEngine,
    private readonly source: () => PeopleSource | null | undefined,
    private readonly rnd: () => number = Math.random,
  ) {
    this.hawkers.minD = 6;
    this.hawkers.maxD = 30;
    this.hawkers.coolLo = 25;
    this.hawkers.coolHi = 60;
    this.hawkers.settle = 0;
  }

  update(dt: number) {
    this.acc += dt;
    if (this.acc < 0.5) return;
    const step = this.acc;
    this.acc = 0;
    this.clock += step;
    const src = this.source();
    const player = this.game.player?.position;
    if (!src || !player) return;
    const people = src.near(player, HUM_RADIUS);
    let n = 0;
    for (const p of people) if (!p.dead) n++;
    const s = this.stats;
    s.count = n;
    if (!this.started) {
      this.started = true;
      s.smoothed = n;
      // No voice in the first seconds after arriving.
      this.chatter.pacer.delay(this.clock, 4);
    } else s.smoothed = easeTo(s.smoothed, n, step, 4);
    s.hum = crowdHum(s.smoothed);
    this.audio.ambience.setBase({ crowd: s.hum });

    const now = this.clock;
    const hour = this.audio.ambience.hour;
    if (!this.audio.ambience.enabled) return;
    findTalkers(people, this.talkers);
    s.talkers = this.talkers.length;
    const t = this.chatter.plan(now, hour, player.x, player.z, this.talkers, this.rnd);
    if (t) {
      s.murmurs++;
      this.audio.play('amb.murmur', { position: { x: t.x, y: t.y, z: t.z }, bus: 'ambience', ifReady: true });
    }
    findVendors(people, player.x, player.z, this.vendors);
    const v = this.hawkers.plan(now, hour, player.x, player.z, this.vendors, this.rnd);
    if (v) {
      s.calls++;
      this.audio.play('amb.calls', { position: { x: v.x, y: v.y, z: v.z }, bus: 'ambience', ifReady: true });
    }
  }
}
