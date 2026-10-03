/**
 * Crime and bounty (game.crime). Witnessed crimes add a bounty in the current jurisdiction;
 * unwitnessed ones are only recorded. When a guard confronts the player the options are pay the
 * fine, go to jail, bribe, talk your way out (small bounties) or resist arrest.
 */
import type { EventBus, GameEvents } from '../core/Events';
import { rollSkillCheck, skillCheckChance } from './checks';
import { CRIME } from './data/balance';
import { CRIMES, JURISDICTIONS } from './data/crimes';
import type { InventoryImpl } from './inventory';
import type { CharacterSheetImpl } from './sheet';
import type { CrimeId, ItemStack } from './types';
import './events';

export interface CrimeDeps {
  events?: EventBus<GameEvents>;
  inventory?: InventoryImpl;
  sheet?: CharacterSheetImpl;
  /** Game clock (jail time passes). */
  time?: { advanceHours(h: number): void };
  rng?: { next(): number };
}

export interface CommitOptions {
  /** Was it seen? true/false, or the ids of the witnesses (empty = unseen). */
  witnessed: boolean | readonly string[];
  victimId?: string;
  /** Value of stolen goods (theft, pickpocket, sacrilege). */
  value?: number;
  jurisdiction?: string;
}

export type GuardResponse = 'none' | 'arrest' | 'attack';

export interface ArrestOptions {
  jurisdiction: string;
  bounty: number;
  canPay: boolean;
  /** Bribe cost, when a bribe is possible. */
  bribe?: number;
  canBribe: boolean;
  /** A Rhetoric check is possible for small bounties. */
  persuade?: { skill: string; difficulty: number; chance: number };
  jailDays: number;
}

export class CrimeSystem {
  private readonly bounties = new Map<string, number>();
  private readonly committed = new Map<CrimeId, number>();
  private readonly reported = new Map<CrimeId, number>();
  /** Jurisdictions where the player resisted arrest: guards attack until the bounty is cleared. */
  private readonly resisting = new Set<string>();
  /** Set by the location system / integration when crossing borders. */
  jurisdiction = 'roma';

  constructor(private readonly deps: CrimeDeps = {}) {}

  bounty(j = this.jurisdiction): number {
    return this.bounties.get(j) ?? 0;
  }

  totalBounty(): number {
    let n = 0;
    for (const v of this.bounties.values()) n += v;
    return n;
  }

  /** Crimes committed (seen or not) and reported (seen), for the stats screen. */
  stats(): { crime: CrimeId; committed: number; reported: number }[] {
    return [...this.committed].map(([crime, n]) => ({ crime, committed: n, reported: this.reported.get(crime) ?? 0 }));
  }

  /** Bounty a crime would add. */
  bountyFor(crime: CrimeId, value = 0): number {
    const d = CRIMES[crime];
    if (!d) return 0;
    return Math.round(d.bounty + Math.max(0, value) * (d.valueMult ?? 0));
  }

  /** Record a crime; returns the bounty added (0 if unwitnessed). */
  commit(crime: CrimeId, opts: CommitOptions): number {
    const j = opts.jurisdiction ?? this.jurisdiction;
    const witnessed = Array.isArray(opts.witnessed) ? opts.witnessed.length > 0 : !!opts.witnessed;
    this.committed.set(crime, (this.committed.get(crime) ?? 0) + 1);
    const bounty = witnessed ? this.bountyFor(crime, opts.value) : 0;
    if (witnessed) this.reported.set(crime, (this.reported.get(crime) ?? 0) + 1);
    if (bounty > 0) this.bounties.set(j, this.bounty(j) + bounty);
    this.deps.events?.emit('crime:committed', { crime, victimId: opts.victimId, witnessed, bounty, jurisdiction: j });
    if (bounty > 0) {
      this.deps.events?.emit('crime:bounty', { jurisdiction: j, bounty: this.bounty(j) });
      this.deps.events?.emit('rpg:notify', { text: `${CRIMES[crime].name} reported — bounty ${this.bounty(j)} denarii`, kind: 'crime' });
    }
    return bounty;
  }

  /** How guards in a jurisdiction react on seeing the player. */
  guardResponse(j = this.jurisdiction): GuardResponse {
    const b = this.bounty(j);
    if (this.resisting.has(j) || b >= CRIME.attackOnSight) return 'attack';
    return b > 0 ? 'arrest' : 'none';
  }

  jailDays(j = this.jurisdiction): number {
    return Math.max(1, Math.ceil(this.bounty(j) / CRIME.jailDenariiPerDay));
  }

  /** What the guard's "Stop right there!" dialogue should offer. */
  arrestOptions(j = this.jurisdiction): ArrestOptions {
    const bounty = this.bounty(j);
    const denarii = this.deps.inventory?.denarii ?? 0;
    const bribe = bounty < CRIME.bribeMax ? Math.ceil(bounty * CRIME.bribeMult) : undefined;
    const rhet = this.deps.sheet?.skillLevel('rhetoric') ?? 0;
    const bonus = this.deps.sheet?.modifier('persuade.chance') ?? 0;
    const persuade =
      bounty > 0 && bounty < CRIME.persuadeMax
        ? { skill: 'rhetoric', difficulty: CRIME.persuadeDifficulty, chance: skillCheckChance(rhet, CRIME.persuadeDifficulty, bonus) }
        : undefined;
    return { jurisdiction: j, bounty, canPay: bounty > 0 && denarii >= bounty, bribe, canBribe: bribe !== undefined && denarii >= bribe, persuade, jailDays: this.jailDays(j) };
  }

  /** Pay the fine in full; stolen goods are confiscated. */
  payFine(j = this.jurisdiction): boolean {
    const b = this.bounty(j);
    if (b <= 0 || !this.deps.inventory?.spendDenarii(b)) return false;
    this.confiscate();
    this.clear(j, 'paid');
    return true;
  }

  /** Serve time: days pass, stolen goods are confiscated and some skill progress is lost. */
  goToJail(j = this.jurisdiction): { days: number; lostProgress: string[]; confiscated: ItemStack[] } | null {
    if (this.bounty(j) <= 0) return null;
    const days = this.jailDays(j);
    const confiscated = this.confiscate();
    this.deps.time?.advanceHours(days * 24);
    const lostProgress = this.deps.sheet?.loseProgress(days * CRIME.jailProgressLossPerDay) ?? [];
    this.deps.events?.emit('crime:jailed', { jurisdiction: j, days });
    this.clear(j, 'jail');
    return { days, lostProgress, confiscated };
  }

  /** Bribe the guard (small bounties): no confiscation. */
  bribe(j = this.jurisdiction): boolean {
    const o = this.arrestOptions(j);
    if (!o.canBribe || o.bribe === undefined || !this.deps.inventory?.spendDenarii(o.bribe)) return false;
    this.clear(j, 'bribe');
    return true;
  }

  /** Rhetoric check to have a small bounty waived. Trains Rhetoric on success. */
  persuade(j = this.jurisdiction, rng: { next(): number } = this.deps.rng ?? { next: Math.random }): boolean {
    const o = this.arrestOptions(j);
    if (!o.persuade) return false;
    const r = rollSkillCheck(this.deps.sheet?.skillLevel('rhetoric') ?? 0, o.persuade.difficulty, rng, this.deps.sheet?.modifier('persuade.chance') ?? 0);
    if (!r.pass) return false;
    this.deps.sheet?.useSkill('rhetoric', 2);
    this.clear(j, 'persuade');
    return true;
  }

  /** Refuse arrest: guards attack until the bounty is cleared. */
  resistArrest(j = this.jurisdiction) {
    this.resisting.add(j);
    this.commit('resist', { witnessed: true, jurisdiction: j });
    this.deps.events?.emit('crime:resist', { jurisdiction: j });
  }

  /** Clear a bounty (also used for quest pardons). */
  clear(j = this.jurisdiction, how: GameEvents['crime:cleared']['how'] = 'pardon') {
    this.bounties.delete(j);
    this.resisting.delete(j);
    this.deps.events?.emit('crime:cleared', { jurisdiction: j, how });
  }

  jurisdictions() {
    return JURISDICTIONS;
  }

  private confiscate(): ItemStack[] {
    return this.deps.inventory?.removeAllStolen() ?? [];
  }

  serialize() {
    return {
      bounties: Object.fromEntries(this.bounties),
      committed: Object.fromEntries(this.committed),
      reported: Object.fromEntries(this.reported),
      resisting: [...this.resisting],
      jurisdiction: this.jurisdiction,
    };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<CrimeSystem['serialize']>>;
    this.bounties.clear();
    this.committed.clear();
    this.reported.clear();
    this.resisting.clear();
    for (const [k, v] of Object.entries(d.bounties ?? {})) if (typeof v === 'number' && v > 0) this.bounties.set(k, v);
    for (const [k, v] of Object.entries(d.committed ?? {})) if (typeof v === 'number') this.committed.set(k as CrimeId, v);
    for (const [k, v] of Object.entries(d.reported ?? {})) if (typeof v === 'number') this.reported.set(k as CrimeId, v);
    for (const j of Array.isArray(d.resisting) ? d.resisting : []) this.resisting.add(j);
    if (typeof d.jurisdiction === 'string') this.jurisdiction = d.jurisdiction;
  }
}
