/**
 * An arena bout (docs/GDD.md §6.10): crowd favor 0–100, the lusio (practice bout) rules, missio.
 * The numbers and formulas are in src/rpg/arena.ts; this tracks one bout over time.
 *
 *   favor starts at 30 (+10 with plebs Fama > 30)
 *   + parry 6, riposte or finisher 8, power hit 3, dodging an unblockable 4, salute 5 (hold E
 *     toward the editor's box at favor ≥ 50, once), sparing with the crowd 10 (+15 for going with it)
 *   − retreating more than 3 s: 2 a second; no attack for 6 s: 5; striking a yielded fighter 20;
 *     going against the crowd's chant 15
 *   full favor: hold E toward the crowd for gifts (coins 5–50, wine +40 stamina, 20 % a weapon), back to 60
 *   missio when you yield: spared at ≥ 50, half the time at 30–49, one in ten below (Tiro: always)
 *
 * Pure logic; tests in tests/combat-arena.test.ts.
 */
import { clamp } from '../core/math';
import { addFavor, ARENA, arenaPurse, missioChance, startingFavor, stansMissusPossible, yieldOutcome, type FavorEvent } from '../rpg/arena';

export interface BoutOptions {
  /** Practice bout with arma lusoria: nobody dies (§6.10). */
  lusio: boolean;
  /** The opponents' combatant ids. */
  foes: string[];
  /** The editor's box (world xz), for the salute. */
  editor?: { x: number; z: number };
  plebsFama?: number;
  /** Tiro difficulty: always spared. */
  tiro?: boolean;
  /** Gain multiplier (1 + arena.favor: Nemesis, a gladiatrix). */
  gainMult?: number;
  /** Missio bonus points (Nemesis as patron: 15). */
  missioBonus?: number;
  /** Base purse in denarii. */
  purse?: number;
}

export type Chant = 'mitte' | 'iugula';

export class ArenaBout {
  favor: number;
  readonly lusio: boolean;
  readonly foes: Set<string>;
  readonly editor?: { x: number; z: number };
  saluted = false;
  /** The crowd's wish when a foe yields. */
  chant: Chant | null = null;
  over = false;
  /** The end has been announced (once). */
  reported = false;
  winner: 'player' | 'foe' | 'draw' | null = null;
  /** Seconds since the bout started. */
  t = 0;
  private retreatFor = 0;
  private idleFor = 0;
  private gainMult: number;
  private tiro: boolean;
  private missioBonus: number;
  private basePurse: number;
  /** Notified on every favor change. */
  onChange: ((favor: number, delta: number, reason: string) => void) | null = null;

  constructor(o: BoutOptions) {
    this.lusio = o.lusio;
    this.foes = new Set(o.foes);
    this.editor = o.editor;
    this.favor = startingFavor(o.plebsFama ?? 0);
    this.gainMult = o.gainMult ?? 1;
    this.tiro = !!o.tiro;
    this.missioBonus = o.missioBonus ?? 0;
    this.basePurse = o.purse ?? 0;
  }

  /** Apply a favor event. Returns the change. */
  event(e: FavorEvent | number, reason = typeof e === 'string' ? e : 'favor'): number {
    if (this.over && e !== 'with-crowd' && e !== 'against-crowd' && e !== 'spare-right') return 0;
    const before = this.favor;
    this.favor = addFavor(this.favor, e, this.gainMult);
    const d = this.favor - before;
    if (d !== 0) this.onChange?.(this.favor, d, reason);
    return d;
  }

  /** The player attacked (resets the "no attack for 6 s" clock). */
  attacked() {
    this.idleFor = 0;
  }

  /**
   * Advance by `dt`. `retreating`: the player is moving away from the nearest foe. Applies the
   * −2/s retreat drain after 3 s and −5 for each 6 s without an attack.
   */
  tick(dt: number, retreating: boolean) {
    if (this.over) return;
    this.t += dt;
    this.retreatFor = retreating ? this.retreatFor + dt : 0;
    if (this.retreatFor > 3) this.event(ARENA.retreatPerSecond * dt, 'retreat');
    this.idleFor += dt;
    if (this.idleFor >= 6) {
      this.idleFor -= 6;
      this.event('no-attack-6s');
    }
  }

  /** Hold E toward the editor's box: +5 once per bout at favor ≥ 50. */
  canSalute() {
    return !this.saluted && this.favor >= ARENA.saluteMin && !this.over;
  }

  salute(): boolean {
    if (!this.canSalute()) return false;
    this.saluted = true;
    this.event('salute');
    return true;
  }

  /** Full favor: hold E toward the crowd. Returns the gifts (coins, wine, weapon chance) and resets favor to 60. */
  takeGifts(rng: () => number): { denarii: number; wineStamina: number; weapon: boolean } | null {
    if (this.favor < 100) return null;
    const [lo, hi] = ARENA.gifts.coins;
    const gifts = { denarii: Math.round(lo + (hi - lo) * rng()), wineStamina: ARENA.gifts.wineStamina, weapon: rng() < ARENA.gifts.weaponChance };
    const before = this.favor;
    this.favor = ARENA.fullFavorReset;
    this.onChange?.(this.favor, this.favor - before, 'gifts');
    return gifts;
  }

  /** A foe yielded: the crowd chants. In a lusio, or after a brave bout, it wants mercy. */
  foeYielded(o: { foeFoughtWell: boolean }): Chant {
    this.chant = this.lusio || o.foeFoughtWell || this.t > 75 ? 'mitte' : 'iugula';
    return this.chant;
  }

  /** The player decides a yielded foe's fate; going with the crowd +15 (and +10 for sparing rightly), against −15. */
  decide(spare: boolean) {
    const wish = this.chant ?? 'mitte';
    const withCrowd = spare === (wish === 'mitte');
    this.event(withCrowd ? 'with-crowd' : 'against-crowd');
    if (spare && withCrowd) this.event('spare-right');
    this.finish('player');
  }

  /** The player yields: missio roll. Spared → Saniarium; refused → death, or in a lusio the doctor stops it. */
  playerYields(rng: () => number): { spared: boolean; outcome: ReturnType<typeof yieldOutcome> } {
    const spared = rng() < missioChance(this.favor, { bonus: this.missioBonus, tiro: this.tiro });
    this.finish('foe');
    return { spared, outcome: yieldOutcome(spared, this.lusio) };
  }

  /** Both below 30 % and favor ≥ 70: stans missus (a draw). */
  stansMissus(playerHealth: number, foeHealth: number) {
    return stansMissusPossible({ playerHealth, foeHealth, favor: this.favor });
  }

  /** The purse for a win: base × (1 + favor/100). */
  purse(): number {
    return Math.round(arenaPurse(this.basePurse, this.favor));
  }

  finish(winner: 'player' | 'foe' | 'draw') {
    if (this.over) return;
    this.over = true;
    this.winner = winner;
  }

  /** 0..1 for the HUD meter. */
  get meter() {
    return clamp(this.favor / 100, 0, 1);
  }
}

export type { FavorEvent };
