/**
 * `game.lockpick` (GDD §14.3): the lockpicking minigame as a service. Anything that holds a lock
 * (a strongbox, later a door or a casket) asks `start({ tier, label })` and gets the outcome.
 *
 *   const r = await game.lockpick.start({ tier: 'mediocris', label: 'A strongbox' });
 *   // 'opened' | 'broken' (the last pick snapped) | 'cancelled' | 'nopick' (no hamulus)
 *
 * The service owns the side effects: it finds the lock's zone width from the player's sheet
 * (Light Touch, Portunus and luck widen it), removes a `hamulus` when a pick snaps, grants Locks &
 * Seals XP on opening, and plays the sounds. The rules are in machine.ts, the picture in
 * LockpickScreen.ts. Events: 'lockpick:start', 'lockpick:done', and 'lockpick:snap' (a breaking
 * pick is a noise event, loudness 0.4 within 6 m, GDD §14.2: no stealth system hears it yet).
 */
import type { Game } from '../../core/Game';
import { LOCK_TIERS, lockXp, lockZoneWidth, type LockTier, type LuckStats } from '../../rpg/thievery';
import { LockMachine, type LockEvent } from './machine';
import { LockpickScreen } from './LockpickScreen';

export type LockpickResult = 'opened' | 'broken' | 'cancelled' | 'nopick';

export interface LockpickOptions {
  tier: LockTier;
  /** The lock's name on the screen ("A strongbox"). */
  label: string;
}

export const LOCKPICK_ITEM = 'hamulus';
export const LOCKPICK_SKILL = 'locks-seals';
export const TUMBLER_SENSE = 'locks-tumbler-sense';
/** A breaking pick's noise (GDD §14.2). */
export const SNAP_NOISE = { loudness: 0.4, range: 6 } as const;

declare module '../../core/Game' {
  interface Game {
    lockpick?: LockpickService;
  }
}

declare module '../../core/Events' {
  interface GameEvents {
    'lockpick:start': { tier: LockTier; label: string };
    'lockpick:done': { result: LockpickResult; tier: LockTier; label: string };
    /** A pick snapped at this point: the noise a future stealth system listens for. */
    'lockpick:snap': { x: number; y: number; z: number; loudness: number; range: number };
  }
}

/** A character with no sheet (a bare test game): no skill, no modifiers. */
const NO_STATS: LuckStats = { skillLevel: () => 0, modifier: () => 0 };

export class LockpickService {
  private active: LockpickScreen | null = null;

  constructor(
    private readonly game: Game,
    /** Random numbers for the zones' places (tests inject their own). */
    private readonly rng: () => number = Math.random,
  ) {}

  /** A lockpicking screen is open. */
  get busy(): boolean {
    return this.active !== null;
  }

  /** How many picks the player has. */
  get picks(): number {
    return this.game.player?.inventory?.count(LOCKPICK_ITEM) ?? 0;
  }

  start(opts: LockpickOptions): Promise<LockpickResult> {
    const { game } = this;
    if (this.active || !game.ui) return Promise.resolve('cancelled');
    if (this.picks < 1) {
      game.events.emit('rpg:notify', { text: 'You have no lockpick.', kind: 'info' });
      game.events.emit('sfx', { id: 'ui.error' });
      return Promise.resolve('nopick');
    }
    const sheet = game.player?.sheet;
    const machine = new LockMachine({
      tumblers: LOCK_TIERS[opts.tier].tumblers,
      zoneWidth: lockZoneWidth(opts.tier, sheet ?? NO_STATS),
      picks: this.picks,
      rng: this.rng,
    });
    const sense = sheet?.perks.has(TUMBLER_SENSE) === true;
    game.events.emit('lockpick:start', { tier: opts.tier, label: opts.label });
    return new Promise<LockpickResult>((resolve) => {
      const screen = new LockpickScreen(
        game,
        machine,
        { label: opts.label, tier: opts.tier, sense },
        (events) => this.react(events, opts, sense),
        (result) => {
          this.active = null;
          game.events.emit('lockpick:done', { result, tier: opts.tier, label: opts.label });
          resolve(result);
        },
      );
      this.active = screen;
      game.ui.open(screen);
    });
  }

  /** The machine's events become sounds, a spent pick, the XP and a noise. */
  private react(events: LockEvent[], opts: LockpickOptions, sense: boolean) {
    const { game } = this;
    const sfx = (id: string, rate?: number) => game.events.emit('sfx', { id, rate });
    for (const e of events) {
      switch (e.type) {
        case 'set':
          sfx('lock.click');
          break;
        case 'strain':
          sfx('lock.turn', 0.8);
          break;
        case 'enterZone':
          if (sense) sfx('lock.click', 1.5);
          break;
        case 'bolt':
          break;
        case 'snap': {
          sfx('lock.break');
          game.player?.inventory?.remove(LOCKPICK_ITEM, 1, { reason: 'used' });
          const p = game.player?.position;
          if (p) game.events.emit('lockpick:snap', { x: p.x, y: p.y, z: p.z, ...SNAP_NOISE });
          break;
        }
        case 'newpick':
          sfx('item.pickup');
          break;
        case 'opened':
          sfx('lock.turn');
          sfx('lock.open');
          game.player?.sheet?.useSkill(LOCKPICK_SKILL, lockXp(opts.tier));
          break;
        default:
          break;
      }
    }
  }
}

/** Install the service (idempotent): `game.lockpick`. */
export function installLockpick(game: Game, rng?: () => number): LockpickService {
  if (game.lockpick) return game.lockpick;
  game.lockpick = new LockpickService(game, rng);
  return game.lockpick;
}
