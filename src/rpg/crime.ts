/**
 * Crime and bounty (game.crime), after docs/research/game-design.md §B9.7 and society.md §8.
 *
 *   - Witnessed crimes add a bounty in a jurisdiction; unwitnessed ones are only recorded.
 *   - Jurisdiction is by authority: the Vigiles by night (and for fire and burglary at any hour),
 *     the Urban Cohorts by day, the Praetorians at the palace.
 *   - When caught: pay the fine (your patron may lower it), go to the Carcer (time passes, skill
 *     progress is lost, stolen goods are confiscated), bribe, talk your way out of a small bounty,
 *     resist (the bounty rises and guards attack), or seek asylum at a temple or Caesar's statue.
 *   - Severe bounties may be commuted to condemnation ad ludum; at high bounty fugitivarii hunt you.
 *   - Status crimes: wearing the toga without citizenship, the gold ring without equestrian rank.
 */
import type { EventBus, GameEvents } from '../core/Events';
import { rollSkillCheck, skillCheckChance } from './checks';
import { CRIME } from './data/balance';
import { CRIMES, JURISDICTIONS, VIGILES_CRIMES } from './data/crimes';
import type { FactionSystem } from './factions';
import type { InventoryImpl } from './inventory';
import type { CharacterSheetImpl } from './sheet';
import type { Standing } from './standing';
import type { CrimeId, ItemDef, ItemStack } from './types';
import './events';

export interface CrimeDeps {
  events?: EventBus<GameEvents>;
  inventory?: InventoryImpl;
  sheet?: CharacterSheetImpl;
  /** Game clock: jail time passes; the hour decides Vigiles vs Urban Cohorts; asylum times out. */
  time?: { advanceHours(h: number): void; readonly hour?: number; readonly totalHours?: number };
  /** Clientela rank lowers fines. */
  factions?: FactionSystem;
  standing?: Standing;
  rng?: { next(): number };
  /** True while the player is on the Palatine (Praetorian jurisdiction). */
  inPalace?: () => boolean;
}

export interface CommitOptions {
  /** Was it seen? true/false, or the ids of the witnesses (empty = unseen). */
  witnessed: boolean | readonly string[];
  victimId?: string;
  /** Value of stolen goods (theft, pickpocket, sacrilege). */
  value?: number;
  /** Override the jurisdiction (default: by authority and hour). */
  jurisdiction?: string;
}

export type GuardResponse = 'none' | 'arrest' | 'attack';

export interface ArrestOptions {
  jurisdiction: string;
  bounty: number;
  /** What paying costs (bounty less any patron discount). */
  fine: number;
  canPay: boolean;
  /** Bribe cost, when a bribe is possible. */
  bribe?: number;
  canBribe: boolean;
  /** A Rhetoric check is possible for small bounties. */
  persuade?: { skill: string; difficulty: number; chance: number };
  jailDays: number;
  /** The sentence may be commuted to the gladiator school. */
  adLudum: boolean;
}

/** The status crime (if any) of wearing an item (GDD §3.2, §8.2): the toga without citizenship, the gold ring without rank. */
export function statusCrimeFor(item: ItemDef, standing: Pick<Standing, 'mayWearToga' | 'dignitas'>): CrimeId | null {
  if (item.tags?.includes('citizen-only') && !standing.mayWearToga) return 'usurpatio-togae';
  if (item.id === 'anulus-aureus' && standing.dignitas !== 'eques') return 'usurpatio-anuli';
  return null;
}

export class CrimeSystem {
  private readonly bounties = new Map<string, number>();
  private readonly committed = new Map<CrimeId, number>();
  private readonly reported = new Map<CrimeId, number>();
  /** Jurisdictions where the player resisted arrest: guards attack until the bounty is cleared. */
  private readonly resisting = new Set<string>();
  private asylumUntil = -Infinity;
  /** Forces a jurisdiction (outside the city, scripted scenes); null = by authority and hour. */
  override: string | null = null;

  constructor(private readonly deps: CrimeDeps = {}) {}

  /** The jurisdiction a crime falls under right now. */
  jurisdictionFor(crime?: CrimeId): string {
    if (this.override) return this.override;
    if (this.deps.inPalace?.()) return 'praetoriani';
    if (crime && VIGILES_CRIMES.includes(crime)) return 'vigiles';
    const h = this.deps.time?.hour;
    if (h !== undefined && (h >= CRIME.nightFrom || h < CRIME.nightTo)) return 'vigiles';
    return 'cohortes-urbanae';
  }

  /** The jurisdiction of guards on duty now. */
  get jurisdiction(): string {
    return this.jurisdictionFor();
  }

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
    const j = opts.jurisdiction ?? this.jurisdictionFor(crime);
    const witnessed = Array.isArray(opts.witnessed) ? opts.witnessed.length > 0 : !!opts.witnessed;
    this.committed.set(crime, (this.committed.get(crime) ?? 0) + 1);
    // Urban Cohorts members' word reduces bounties by 25% (GDD §9.2).
    const member = this.deps.factions?.isMember('cohortes-urbanae') ? CRIME.cohortsBountyMult : 1;
    const bounty = witnessed ? Math.round(this.bountyFor(crime, opts.value) * member) : 0;
    if (witnessed) this.reported.set(crime, (this.reported.get(crime) ?? 0) + 1);
    if (bounty > 0) this.bounties.set(j, this.bounty(j) + bounty);
    this.deps.events?.emit('crime:committed', { crime, victimId: opts.victimId, witnessed, bounty, jurisdiction: j });
    if (bounty > 0) {
      this.deps.events?.emit('crime:bounty', { jurisdiction: j, bounty: this.bounty(j) });
      this.deps.events?.emit('rpg:notify', { text: `${CRIMES[crime].name} reported — bounty ${this.bounty(j)} denarii`, kind: 'crime' });
    }
    return bounty;
  }

  /** How guards of a jurisdiction react on seeing the player. */
  guardResponse(j = this.jurisdiction): GuardResponse {
    if (this.inAsylum()) return 'none';
    const b = this.bounty(j);
    if (this.resisting.has(j) || b >= CRIME.attackOnSight) return 'attack';
    return b > 0 ? 'arrest' : 'none';
  }

  /** Professional slave-catchers hunt the player at high bounty. */
  huntersActive(): boolean {
    return this.totalBounty() >= CRIME.hunters;
  }

  jailDays(j = this.jurisdiction): number {
    return Math.max(1, Math.ceil(this.bounty(j) / CRIME.jailDenariiPerDay));
  }

  /** The fine to pay: the bounty, lowered by your patron's influence (Clientela rank). */
  fine(j = this.jurisdiction): number {
    const rank = this.deps.factions?.rankIndex('clientela') ?? -1;
    const off = rank >= 0 ? Math.min(CRIME.patronDiscountCap, CRIME.patronDiscountPerRank * (rank + 1)) : 0;
    return Math.ceil(this.bounty(j) * (1 - off));
  }

  /** What the guard's "Stop right there!" dialogue should offer. */
  arrestOptions(j = this.jurisdiction): ArrestOptions {
    const bounty = this.bounty(j);
    const fine = this.fine(j);
    const denarii = this.deps.inventory?.denarii ?? 0;
    const bribe = bounty > 0 && bounty < CRIME.bribeMax ? Math.ceil(bounty * CRIME.bribeMult) : undefined;
    const rhet = this.deps.sheet?.skillLevel('rhetoric') ?? 0;
    const bonus = this.deps.sheet?.modifier('persuade.chance') ?? 0;
    const persuade = bounty > 0 && bounty < CRIME.persuadeMax ? { skill: 'rhetoric', difficulty: CRIME.persuadeDifficulty, chance: skillCheckChance(rhet, CRIME.persuadeDifficulty, bonus) } : undefined;
    return { jurisdiction: j, bounty, fine, canPay: bounty > 0 && denarii >= fine, bribe, canBribe: bribe !== undefined && denarii >= bribe, persuade, jailDays: this.jailDays(j), adLudum: bounty >= CRIME.adLudumMin };
  }

  /** Pay the fine; stolen goods are confiscated. */
  payFine(j = this.jurisdiction): boolean {
    if (this.bounty(j) <= 0 || !this.deps.inventory?.spendDenarii(this.fine(j))) return false;
    this.confiscate();
    this.clear(j, 'paid');
    return true;
  }

  /** Serve time in the Carcer: days pass, stolen goods are confiscated, some skill progress is lost. */
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

  /** Condemnation to the gladiator school instead of execution or exile (severe bounties only). */
  sentenceAdLudum(j = this.jurisdiction): boolean {
    if (this.bounty(j) < CRIME.adLudumMin) return false;
    this.confiscate();
    this.deps.standing?.addInfamia(25);
    this.deps.events?.emit('crime:sentenced', { jurisdiction: j, sentence: 'ludus' });
    this.clear(j, 'jail');
    return true;
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

  /** Refuse arrest: the bounty rises and guards attack until it is cleared. */
  resistArrest(j = this.jurisdiction) {
    this.resisting.add(j);
    this.commit('resistentia', { witnessed: true, jurisdiction: j });
    this.deps.events?.emit('crime:resist', { jurisdiction: j });
  }

  /** Cling to a temple altar or Caesar's statue: guards leave you be for a while (game hours). */
  seekAsylum(hours = 6) {
    this.asylumUntil = (this.deps.time?.totalHours ?? 0) + hours;
  }

  inAsylum(): boolean {
    return (this.deps.time?.totalHours ?? 0) < this.asylumUntil;
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
      override: this.override,
      asylumUntil: Number.isFinite(this.asylumUntil) ? this.asylumUntil : null,
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
    this.override = typeof d.override === 'string' ? d.override : null;
    this.asylumUntil = typeof d.asylumUntil === 'number' ? d.asylumUntil : -Infinity;
  }
}
