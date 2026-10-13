/**
 * The lockpicking minigame as a pure state machine (GDD §14.3), with no DOM, no audio and no clock
 * of its own: the screen feeds it presses, releases and `advance(dt)`, and reads back what to draw.
 *
 * A Roman lift-and-slide lock: the bolt is held by N tumblers. For each tumbler in turn, hold to
 * lift: the lift meter rises and falls (a triangle wave at `LOCKS.meterHz`, starting at the bottom
 * when the lift starts); release while it is inside the tumbler's set zone to set it. A release
 * outside adds strain; `LOCKS.strainToBreak` strain snaps the pick. With every tumbler set the bolt
 * can slide (`slide()`), which opens the lock. A snapped pick may be replaced by a fresh one if the
 * player has more: strain starts again, the tumblers already set stay set.
 */
import { LOCKS } from '../../rpg/thievery';

export type LockPhase = 'picking' | 'bolt' | 'snapped' | 'opened' | 'broken' | 'cancelled';

export type LockEvent =
  | { type: 'set'; index: number }
  | { type: 'strain'; strain: number }
  | { type: 'bolt' }
  | { type: 'snap'; picksLeft: number }
  | { type: 'newpick'; picksLeft: number }
  | { type: 'opened' }
  | { type: 'broken' }
  | { type: 'cancelled' }
  /** The meter has just entered the current tumbler's zone (Tumbler Sense listens for this). */
  | { type: 'enterZone' };

export interface LockMachineOptions {
  /** Number of tumblers (LOCK_TIERS[tier].tumblers). */
  tumblers: number;
  /** Set-zone width as a fraction of the meter (lockZoneWidth). */
  zoneWidth: number;
  /** Picks the player owns, including the one in hand. */
  picks: number;
  /** Random numbers in [0, 1): the zones' places. */
  rng?: () => number;
  meterHz?: number;
  strainToBreak?: number;
}

/** A hold shorter than this is a tap, not a lift: it costs nothing. */
export const MIN_LIFT_S = 0.12;
/** Zones keep off the very bottom of the meter, where the lift starts. */
const ZONE_FLOOR = 0.12;

/** The meter at `cycles` oscillations since the lift began: 0 → 1 → 0, a triangle wave. */
export function meterAt(cycles: number): number {
  const p = cycles - Math.floor(cycles);
  return p < 0.5 ? p * 2 : (1 - p) * 2;
}

export class LockMachine {
  readonly tumblers: number;
  readonly zoneWidth: number;
  readonly strainToBreak: number;
  private readonly hz: number;
  /** Lower edge of each tumbler's zone (0..1 along the meter). */
  readonly zones: number[];
  readonly set: boolean[];
  phase: LockPhase = 'picking';
  strain = 0;
  picks: number;
  /** Seconds the current lift has lasted (0 when not lifting). */
  private liftS = 0;
  private lifting = false;
  private wasIn = false;

  constructor(opts: LockMachineOptions) {
    this.tumblers = Math.max(1, Math.floor(opts.tumblers));
    this.zoneWidth = Math.min(0.95, Math.max(0.01, opts.zoneWidth));
    this.strainToBreak = opts.strainToBreak ?? LOCKS.strainToBreak;
    this.hz = opts.meterHz ?? LOCKS.meterHz;
    this.picks = Math.max(1, Math.floor(opts.picks));
    const rng = opts.rng ?? Math.random;
    const lo = Math.min(ZONE_FLOOR, 1 - this.zoneWidth);
    this.zones = Array.from({ length: this.tumblers }, () => lo + rng() * (1 - this.zoneWidth - lo));
    this.set = Array.from({ length: this.tumblers }, () => false);
  }

  /** Index of the tumbler being worked (the first not set); `tumblers` when all are set. */
  get current(): number {
    const i = this.set.indexOf(false);
    return i < 0 ? this.tumblers : i;
  }

  get setCount(): number {
    return this.set.filter(Boolean).length;
  }

  get holding(): boolean {
    return this.lifting;
  }

  /** The lift meter, 0..1 (0 while nothing is lifting). */
  get meter(): number {
    return this.lifting ? meterAt(this.liftS * this.hz) : 0;
  }

  /** The current tumbler's zone, [low, high] along the meter, or null when there is none to work. */
  zone(index = this.current): [number, number] | null {
    const z = this.zones[index];
    return z === undefined ? null : [z, z + this.zoneWidth];
  }

  /** Is the meter inside the zone of the tumbler being worked? */
  get inZone(): boolean {
    return this.lifting && this.phase === 'picking' && this.meterInZone();
  }

  /** Over: the lock is open, the last pick snapped, or the player left. */
  get done(): boolean {
    return this.phase === 'opened' || this.phase === 'broken' || this.phase === 'cancelled';
  }

  /** The way it ended, or null while it goes on. */
  get result(): 'opened' | 'broken' | 'cancelled' | null {
    return this.phase === 'opened' || this.phase === 'broken' || this.phase === 'cancelled' ? this.phase : null;
  }

  private meterInZone(): boolean {
    const z = this.zone();
    if (!z) return false;
    const m = this.meter;
    return m >= z[0] && m <= z[1];
  }

  /** Start lifting (Lift pressed). Ignored unless a tumbler is waiting. */
  press(): boolean {
    if (this.phase !== 'picking' || this.lifting) return false;
    this.lifting = true;
    this.liftS = 0;
    this.wasIn = false;
    return true;
  }

  /** Stop lifting without setting or straining (focus lost, the screen closed). */
  abortLift() {
    this.lifting = false;
    this.liftS = 0;
    this.wasIn = false;
  }

  /** Time passes. Returns an `enterZone` event when the meter has just reached the zone. */
  advance(dt: number): LockEvent[] {
    if (!this.lifting || this.phase !== 'picking') return [];
    this.liftS += Math.max(0, dt);
    const inside = this.meterInZone();
    const enter = inside && !this.wasIn;
    this.wasIn = inside;
    return enter ? [{ type: 'enterZone' }] : [];
  }

  /** Lift released: inside the zone sets the tumbler, outside adds strain, a tap does nothing. */
  release(): LockEvent[] {
    if (!this.lifting || this.phase !== 'picking') return [];
    const held = this.liftS;
    const inside = this.meterInZone();
    this.abortLift();
    if (held < MIN_LIFT_S) return [];
    const out: LockEvent[] = [];
    if (inside) {
      const index = this.current;
      this.set[index] = true;
      out.push({ type: 'set', index });
      if (this.setCount === this.tumblers) {
        this.phase = 'bolt';
        out.push({ type: 'bolt' });
      }
      return out;
    }
    this.strain++;
    out.push({ type: 'strain', strain: this.strain });
    if (this.strain >= this.strainToBreak) {
      this.picks--;
      if (this.picks > 0) {
        this.phase = 'snapped';
        out.push({ type: 'snap', picksLeft: this.picks });
      } else {
        this.phase = 'broken';
        out.push({ type: 'snap', picksLeft: 0 }, { type: 'broken' });
      }
    }
    return out;
  }

  /** Slide the bolt: only when every tumbler is set. */
  slide(): LockEvent[] {
    if (this.phase !== 'bolt') return [];
    this.phase = 'opened';
    return [{ type: 'opened' }];
  }

  /** After a snap: take a fresh pick. Strain starts again; the tumblers already set stay set. */
  newPick(): LockEvent[] {
    if (this.phase !== 'snapped') return [];
    this.phase = 'picking';
    this.strain = 0;
    this.abortLift();
    return [{ type: 'newpick', picksLeft: this.picks }];
  }

  /** Leave the lock. */
  cancel(): LockEvent[] {
    if (this.done) return [];
    this.abortLift();
    this.phase = 'cancelled';
    return [{ type: 'cancelled' }];
  }
}
