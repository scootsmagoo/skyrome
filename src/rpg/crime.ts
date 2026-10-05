/**
 * Crime and bounty (game.crime) — docs/GDD.md §14.1.
 *
 *   - Ledgers: the city (`urbs`), enforced by the Urban Cohorts by day and the Vigiles by night;
 *     the Palatine (`palatium`, the Praetorians), which also takes treason.
 *   - Witnessed and identified crimes add bounty; a witnessed crime by an unidentified culprit
 *     (hood up at night: identified half the time) only raises the district's alert (0–3, a day).
 *   - Bounty ≥ 1,000: guards attack on sight. ≥ 2,000: fugitivarii hunt you.
 *   - Confronted: pay (−10% per Clientela rank, max 40%; stolen goods confiscated), persuade (bounty
 *     < 200, DC min(85, 10 + bounty/20); success halves it), bribe (bounty ≤ 200, a corruptible
 *     guard, 1.5 × bounty), the Carcer (ceil(bounty/100) days, max 10, citizens 25% less; a random
 *     skill's progress lost per day), asylum (1 game hour; non-violent, ≤ 1,000, once a day), or flee
 *     (+10%) / resist (+50%, guards attack).
 *   - A murder conviction or a bounty ≥ 3,000 means condemnation ad ludum: win 3 bouts to go free
 *     (bounty cleared, Infamia +30). An eques pays twice the fine instead of the Carcer (not for maiestas).
 *   - A city bounty under 40 lapses after 7 days without a new crime.
 *   - Status crimes: the toga without citizenship (100), the gold ring without rank (200).
 */
import type { EventBus, GameEvents } from '../core/Events';
import { checkTier, rollSkillCheck, skillCheckChance } from './checks';
import { skipTime } from './clock';
import { CRIME, XP } from './data/tuning';
import { CRIMES, LEDGERS, USURPATIO_BOUNTY } from './data/crimes';
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
  /** Game clock: jail time passes, night decides the Vigiles, asylum and lapses time out. */
  time?: { advanceHours(h: number): void; readonly hour?: number; readonly totalHours?: number; readonly isNight?: boolean };
  /** Clientela rank lowers fines; Urban Cohorts members' bounties are reduced. */
  factions?: FactionSystem;
  standing?: Standing;
  rng?: { next(): number };
  /** True while the player is on the Palatine (the Praetorian ledger). */
  inPalace?: () => boolean;
  /** Persuasion points with a guard (dress, cleanliness, Fama…; checks.persuasionPoints). */
  persuasionPoints?: () => number;
}

export interface CommitOptions {
  /** Was it seen? true/false, or the ids of the witnesses (empty = unseen). */
  witnessed: boolean | readonly string[];
  /** Did the witnesses know who you were? (default true; see identifyChance). */
  identified?: boolean;
  victimId?: string;
  /** Value of stolen goods (theft, pickpocketing). */
  value?: number;
  /** Book it in this ledger (default: by place and crime). */
  ledger?: string;
  /** District for the alert of an unidentified crime. */
  district?: string;
  /** Override the bounty (status crimes). */
  bounty?: number;
}

export type GuardResponse = 'none' | 'arrest' | 'attack';
export type Sentence = 'carcer' | 'fine' | 'ad-ludum';

export interface GuardInfo {
  id?: string;
  /** 'cohortes-urbanae', 'vigiles' or 'praetoriani' (default: on duty now). */
  faction?: string;
  /**
   * Force corruptibility. Default: from the faction's rate in CRIME.corruptible — fixed per guard id,
   * or, with no id, rolled once per confrontation with the crime rng.
   */
  corruptible?: boolean;
}

export interface ArrestOptions {
  ledger: string;
  /** The faction whose guard confronts you. */
  guards: string;
  bounty: number;
  /** What paying costs (bounty less any patron discount). */
  fine: number;
  canPay: boolean;
  /** Rhetoric check for bounties under 200 (null once failed today). */
  persuade?: { skill: string; difficulty: number; chance: number };
  /** Bribe cost (bounty ≤ 200 and a corruptible guard). */
  bribe?: number;
  canBribe: boolean;
  corruptible: boolean;
  /** What submitting means: the Carcer, the eques' double fine, or the gladiator school. */
  sentence: Sentence;
  jailDays: number;
  /** An eques pays this instead of serving (not for maiestas). */
  equesFine?: number;
  canAsylum: boolean;
}

/**
 * The status crime (if any) of wearing an item (§14.1): the toga or stola without citizenship or
 * freedom (100), the gold ring on a man without equestrian rank (200). A woman in a toga commits
 * no crime (she takes a social stain instead, §3.7); on a woman the gold ring is jewellery.
 */
export function statusCrimeFor(item: ItemDef, standing: Pick<Standing, 'mayWearToga' | 'dignitas'> & { sex?: 'male' | 'female' }): { crime: CrimeId; bounty: number } | null {
  const female = standing.sex === 'female';
  if (item.tags?.includes('citizen-only') && !standing.mayWearToga && !(female && item.tags.includes('toga'))) return { crime: 'usurpatio', bounty: USURPATIO_BOUNTY.toga };
  if (item.id === 'anulus-aureus' && !female && standing.dignitas !== 'eques') return { crime: 'usurpatio', bounty: USURPATIO_BOUNTY.anulus };
  return null;
}

/** Chance witnesses identify you: half with a hood up at night (§14.1). */
export function identifyChance(o: { hooded?: boolean; night?: boolean }): number {
  return o.hooded && o.night ? CRIME.hoodedIdentify : 1;
}

export class CrimeSystem {
  private readonly bounties = new Map<string, number>();
  private readonly committed = new Map<CrimeId, number>();
  private readonly reported = new Map<CrimeId, number>();
  /** Crimes booked per ledger since it was last cleared (violent? murder?). */
  private readonly booked = new Map<string, CrimeId[]>();
  private readonly lastCrimeHour = new Map<string, number>();
  /** Ledgers where the player resisted arrest: guards attack until the bounty is cleared. */
  private readonly resisting = new Set<string>();
  private readonly alerts = new Map<string, { level: number; until: number }>();
  private readonly persuadeFailedAt = new Map<string, number>();
  private asylumUntil = -Infinity;
  private asylumDay = -1;
  private _evidence: ItemStack[] = [];
  private _condemned: { ledger: string; bouts: number } | null = null;
  /** The confrontation with an unnamed guard: its corruptibility is rolled once and kept. */
  private confrontation: { ledger: string; faction: string; at: number; corruptible: boolean } | null = null;
  /** Forces a ledger (outside the city, scripted scenes); null = by place and crime. */
  override: string | null = null;

  constructor(private readonly deps: CrimeDeps = {}) {}

  private now(): number {
    return this.deps.time?.totalHours ?? 0;
  }

  private night(): boolean {
    const t = this.deps.time;
    if (!t) return false;
    if (typeof t.isNight === 'boolean') return t.isNight;
    const h = t.hour ?? 12;
    return h < 5.5 || h > 20.5;
  }

  // ---------------------------------------------------------------- ledgers

  /** The ledger a crime is booked in now: the Palatine and treason are the Praetorians'; the rest is the city's. */
  ledgerFor(crime?: CrimeId): string {
    if (this.override) return this.override;
    if (crime && CRIMES[crime]?.ledger) return CRIMES[crime].ledger!;
    if (this.deps.inPalace?.()) return 'palatium';
    return 'urbs';
  }

  /** The ledger where the player is now. */
  get ledger(): string {
    return this.ledgerFor();
  }

  /** Guards on duty for a ledger: the Urban Cohorts by day, the Vigiles by night, the Praetorians on the Palatine. */
  guardsFor(ledger = this.ledger): string {
    const def = LEDGERS.find((l) => l.id === ledger);
    if (!def) return 'cohortes-urbanae';
    return this.night() ? def.guards.night : def.guards.day;
  }

  ledgers() {
    return LEDGERS;
  }

  bounty(ledger = this.ledger): number {
    return this.bounties.get(ledger) ?? 0;
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

  /** Bounty a crime would add: flat + value × mult, at least the minimum. */
  bountyFor(crime: CrimeId, value = 0): number {
    const d = CRIMES[crime];
    if (!d) return 0;
    return Math.round(Math.max(d.min ?? 0, d.bounty + Math.max(0, value) * (d.valueMult ?? 0)));
  }

  /** District alert 0–3 (more patrols for a game day after an unidentified crime). */
  alert(district: string): number {
    const a = this.alerts.get(district);
    return a && this.now() < a.until ? a.level : 0;
  }

  raiseAlert(district: string) {
    const level = Math.min(CRIME.alertMax, this.alert(district) + 1);
    this.alerts.set(district, { level, until: this.now() + CRIME.alertHours });
  }

  /** Record a crime; returns the bounty added (0 if unwitnessed or unidentified). */
  commit(crime: CrimeId, opts: CommitOptions): number {
    const def = CRIMES[crime];
    if (!def) return 0;
    const ledger = opts.ledger ?? this.ledgerFor(crime);
    const witnessed = Array.isArray(opts.witnessed) ? opts.witnessed.length > 0 : !!opts.witnessed;
    const identified = witnessed && opts.identified !== false;
    this.committed.set(crime, (this.committed.get(crime) ?? 0) + 1);
    this.lastCrimeHour.set(ledger, this.now());
    if (witnessed) this.reported.set(crime, (this.reported.get(crime) ?? 0) + 1);
    if (witnessed && !identified && opts.district) this.raiseAlert(opts.district);
    let bounty = 0;
    if (identified) {
      // Urban Cohorts members' word reduces bounties by 25% (GDD §9.2).
      const member = this.deps.factions?.isMember('cohortes-urbanae') ? CRIME.cohortsBountyMult : 1;
      bounty = Math.round((opts.bounty ?? this.bountyFor(crime, opts.value)) * member);
      this.add(ledger, bounty);
      this.booked.set(ledger, [...(this.booked.get(ledger) ?? []), crime]);
    }
    this.deps.events?.emit('crime:committed', { crime, victimId: opts.victimId, witnessed, bounty, jurisdiction: ledger });
    if (bounty > 0) this.deps.events?.emit('rpg:notify', { text: `Crime witnessed: ${crime} (bounty ${bounty} den.)`, kind: 'crime' });
    return bounty;
  }

  private add(ledger: string, amount: number) {
    if (!(amount > 0)) return;
    this.bounties.set(ledger, this.bounty(ledger) + amount);
    this.deps.events?.emit('crime:bounty', { jurisdiction: ledger, bounty: this.bounty(ledger) });
  }

  // ---------------------------------------------------------------- guards

  /** How guards of a ledger react on seeing the player. */
  guardResponse(ledger = this.ledger): GuardResponse {
    if (this.inAsylum() || this._condemned) return 'none';
    const b = this.bounty(ledger);
    if (this.resisting.has(ledger) || b >= CRIME.attackOnSight) return 'attack';
    return b > 0 ? 'arrest' : 'none';
  }

  /** Fugitivarii hunt the player at a total bounty of 2,000 or more. */
  huntersActive(): boolean {
    return this.totalBounty() >= CRIME.hunters;
  }

  /** Days in the Carcer: ceil(bounty / 100), at most 10; citizens serve 25% less. */
  jailDays(ledger = this.ledger): number {
    const days = Math.min(CRIME.jailMaxDays, Math.max(1, Math.ceil(this.bounty(ledger) / CRIME.jailDenariiPerDay)));
    return this.deps.standing?.isCitizen ? Math.max(1, Math.round(days * CRIME.citizenJailMult)) : days;
  }

  /** The fine: the bounty less 10% per Clientela rank (at most 40%). */
  fine(ledger = this.ledger): number {
    const rank = this.deps.factions?.rankIndex('clientela') ?? -1;
    const off = rank >= 0 ? Math.min(CRIME.patronDiscountCap, CRIME.patronDiscountPerRank * (rank + 1)) : 0;
    return Math.ceil(this.bounty(ledger) * (1 - off));
  }

  /** A murder conviction or a bounty ≥ 3,000 means the gladiator school; an eques pays double instead of the Carcer. */
  sentence(ledger = this.ledger): Sentence {
    const crimes = this.booked.get(ledger) ?? [];
    if (crimes.some((c) => CRIMES[c]?.murder) || this.bounty(ledger) >= CRIME.adLudumMin) return 'ad-ludum';
    if (this.deps.standing?.dignitas === 'eques' && !crimes.includes('maiestas')) return 'fine';
    return 'carcer';
  }

  /** Persuasion DC for a bounty: min(85, 10 + bounty / 20). */
  persuadeDc(bounty: number): number {
    return Math.min(CRIME.persuadeDcMax, Math.round(CRIME.persuadeDcBase + bounty / CRIME.persuadeDcDiv));
  }

  /**
   * Whether a guard takes bribes, at the faction's rate (vigiles 40%, urban 25%, praetorians 5%).
   * A guard with an id is always corruptible or never; an unnamed guard is rolled once per
   * confrontation (same ledger and faction, within an hour, until the bounty is settled or the
   * player flees or resists), so the offer and the bribe agree.
   */
  isCorruptible(guard: GuardInfo = {}, ledger = this.ledger): boolean {
    if (guard.corruptible !== undefined) return guard.corruptible;
    const faction = guard.faction ?? this.guardsFor(ledger);
    const rate = CRIME.corruptible[faction] ?? 0;
    if (guard.id) return hash01(guard.id) < rate;
    const c = this.confrontation;
    if (c && c.ledger === ledger && c.faction === faction && this.now() - c.at < CRIME.confrontationHours) return c.corruptible;
    const rng = this.deps.rng ?? { next: Math.random };
    this.confrontation = { ledger, faction, at: this.now(), corruptible: rng.next() < rate };
    return this.confrontation.corruptible;
  }

  /** The confrontation is over (settled, fled, resisted): the next unnamed guard is a new roll. */
  endConfrontation() {
    this.confrontation = null;
  }

  /** What the guard's "Stop right there!" dialogue should offer. */
  arrestOptions(ledger = this.ledger, guard: GuardInfo = {}): ArrestOptions {
    const bounty = this.bounty(ledger);
    const fine = this.fine(ledger);
    const denarii = this.deps.inventory?.denarii ?? 0;
    const corruptible = this.isCorruptible(guard, ledger);
    const bribe = bounty > 0 && bounty <= CRIME.bribeMax && corruptible ? Math.ceil(bounty * CRIME.bribeMult) : undefined;
    const failed = this.persuadeFailedAt.get(ledger);
    const canPersuade = bounty > 0 && bounty < CRIME.persuadeMax && !(failed !== undefined && this.now() - failed < 24);
    const dc = this.persuadeDc(bounty);
    const persuade = canPersuade ? { skill: 'rhetoric', difficulty: dc, chance: skillCheckChance(this.persuadeSkill(), dc, this.persuadeBonus()) } : undefined;
    const sentence = this.sentence(ledger);
    return {
      ledger,
      guards: guard.faction ?? this.guardsFor(ledger),
      bounty,
      fine,
      canPay: bounty > 0 && denarii + 1e-9 >= fine,
      persuade,
      bribe,
      canBribe: bribe !== undefined && denarii + 1e-9 >= bribe,
      corruptible,
      sentence,
      jailDays: this.jailDays(ledger),
      equesFine: sentence === 'fine' ? fine * CRIME.equesFineMult : undefined,
      canAsylum: this.canSeekAsylum(ledger),
    };
  }

  private persuadeSkill() {
    return (this.deps.sheet?.skillLevel('rhetoric') ?? 0) + (this.deps.persuasionPoints?.() ?? 0);
  }

  private persuadeBonus() {
    return this.deps.sheet?.modifier('persuade.chance') ?? 0;
  }

  /** Pay the fine; stolen goods go to the evidence chest. */
  payFine(ledger = this.ledger): boolean {
    if (this.bounty(ledger) <= 0 || !this.deps.inventory?.spendDenarii(this.fine(ledger))) return false;
    this.confiscate();
    this.clear(ledger, 'paid');
    return true;
  }

  /** Talk the guard down (bounty < 200): success halves the bounty with a warning; failure locks it for a day. */
  persuade(ledger = this.ledger, rng: { next(): number } = this.deps.rng ?? { next: Math.random }): { pass: boolean; chance: number } {
    const o = this.arrestOptions(ledger);
    if (!o.persuade) return { pass: false, chance: 0 };
    const r = rollSkillCheck(this.persuadeSkill(), o.persuade.difficulty, rng, this.persuadeBonus());
    if (!r.pass && this.deps.sheet?.consumeFlag('fortuna.nextRoll')) r.pass = true;
    this.deps.sheet?.useSkill('rhetoric', r.pass ? XP.rhetoric.perTier * checkTier(o.persuade.difficulty) : XP.rhetoric.fail);
    if (!r.pass) {
      this.persuadeFailedAt.set(ledger, this.now());
      return r;
    }
    const half = Math.floor(this.bounty(ledger) / 2);
    if (half > 0) {
      this.bounties.set(ledger, half);
      this.deps.events?.emit('crime:bounty', { jurisdiction: ledger, bounty: half });
    } else this.clear(ledger, 'persuade');
    this.deps.events?.emit('rpg:notify', { text: 'Let off with a warning — the bounty is halved', kind: 'crime' });
    return r;
  }

  /** Bribe the guard (bounty ≤ 200, corruptible): no confiscation. */
  bribe(ledger = this.ledger, guard: GuardInfo = {}): boolean {
    const o = this.arrestOptions(ledger, guard);
    if (!o.canBribe || o.bribe === undefined || !this.deps.inventory?.spendDenarii(o.bribe)) return false;
    this.clear(ledger, 'bribe');
    return true;
  }

  /**
   * Submit to arrest: the Carcer (days pass, stolen goods confiscated, one random skill's progress
   * lost per day), the eques' double fine, or condemnation ad ludum, as sentence() says.
   * `anySentence`: serve the Carcer whatever the sentence (the street arrest uses it while the
   * condemnation ad ludum has no bouts to fight yet).
   */
  goToJail(
    ledger = this.ledger,
    rng: { next(): number } = this.deps.rng ?? { next: Math.random },
    opts: { anySentence?: boolean } = {},
  ): { days: number; lostProgress: string[]; confiscated: ItemStack[] } | null {
    if (this.bounty(ledger) <= 0 || (this.sentence(ledger) !== 'carcer' && !opts.anySentence)) return null;
    const days = this.jailDays(ledger);
    const confiscated = this.confiscate();
    skipTime(this.deps.time, this.deps.events, days * 24);
    const lostProgress = this.deps.sheet?.loseProgress(days * CRIME.jailProgressLossPerDay, rng) ?? [];
    this.deps.events?.emit('crime:jailed', { jurisdiction: ledger, days });
    this.clear(ledger, 'jail');
    return { days, lostProgress, confiscated };
  }

  /** An eques pays twice the fine instead of the Carcer. */
  payEquesFine(ledger = this.ledger): boolean {
    if (this.sentence(ledger) !== 'fine') return false;
    if (!this.deps.inventory?.spendDenarii(this.fine(ledger) * CRIME.equesFineMult)) return false;
    this.confiscate();
    this.clear(ledger, 'fine');
    return true;
  }

  /** Condemnation to the gladiator school (murder conviction or bounty ≥ 3,000): win 3 bouts to go free. */
  sentenceAdLudum(ledger = this.ledger): boolean {
    if (this.bounty(ledger) <= 0 || this.sentence(ledger) !== 'ad-ludum') return false;
    this.confiscate();
    this._condemned = { ledger, bouts: CRIME.adLudumBouts };
    this.deps.events?.emit('crime:sentenced', { jurisdiction: ledger, sentence: 'ludus' });
    return true;
  }

  /** The condemned fighter's state (bouts left), or null. */
  get condemned(): { ledger: string; bouts: number } | null {
    return this._condemned ? { ...this._condemned } : null;
  }

  /** A bout won while condemned; the third frees you (bounty cleared, Infamia +30). Returns bouts left. */
  winLudusBout(): number {
    const c = this._condemned;
    if (!c) return 0;
    c.bouts--;
    if (c.bouts > 0) return c.bouts;
    this._condemned = null;
    this.deps.standing?.addInfamia(CRIME.adLudumInfamia);
    this.clear(c.ledger, 'ludus');
    return 0;
  }

  /** Run from the guards: +10% bounty. */
  flee(ledger = this.ledger) {
    this.add(ledger, Math.ceil(this.bounty(ledger) * CRIME.fleeMult));
    this.endConfrontation();
  }

  /** Refuse arrest: +50% bounty, and guards attack until it is cleared. */
  resistArrest(ledger = this.ledger) {
    this.resisting.add(ledger);
    this.add(ledger, Math.ceil(this.bounty(ledger) * CRIME.resistMult));
    this.endConfrontation();
    this.deps.events?.emit('crime:resist', { jurisdiction: ledger });
  }

  /** Asylum: non-violent crimes, bounty ≤ 1,000, once a day. */
  canSeekAsylum(ledger = this.ledger): boolean {
    const crimes = this.booked.get(ledger) ?? [];
    return this.bounty(ledger) <= CRIME.asylumMaxBounty && !crimes.some((c) => CRIMES[c]?.violent) && this.asylumDay !== this.day();
  }

  /** Cling to a temple altar or Caesar's statue: guards hold off for 1 game hour so you can negotiate. */
  seekAsylum(ledger = this.ledger): boolean {
    if (!this.canSeekAsylum(ledger)) return false;
    this.asylumDay = this.day();
    this.asylumUntil = this.now() + CRIME.asylumHours;
    return true;
  }

  inAsylum(): boolean {
    return this.now() < this.asylumUntil;
  }

  /** Clear a bounty (also used for quest pardons). */
  clear(ledger = this.ledger, how: GameEvents['crime:cleared']['how'] = 'pardon') {
    this.bounties.delete(ledger);
    this.booked.delete(ledger);
    this.resisting.delete(ledger);
    if (this.confrontation?.ledger === ledger) this.endConfrontation();
    this.deps.events?.emit('crime:cleared', { jurisdiction: ledger, how });
  }

  /** A city bounty under 40 lapses after 7 days without a new crime. Call hourly; returns true if one lapsed. */
  checkLapse(): boolean {
    const b = this.bounty('urbs');
    const last = this.lastCrimeHour.get('urbs') ?? 0;
    if (b > 0 && b < CRIME.lapseBelow && this.now() - last >= CRIME.lapseDays * 24) {
      this.clear('urbs', 'lapsed');
      return true;
    }
    return false;
  }

  /** Confiscated goods wait in the evidence chest at the Carcer. */
  evidence(): ItemStack[] {
    return this._evidence.map((s) => ({ ...s }));
  }

  /** Take everything back out of the evidence chest (a quest, a break-in). */
  reclaimEvidence(): ItemStack[] {
    const out = this._evidence;
    this._evidence = [];
    for (const s of out) this.deps.inventory?.add(s.itemId, s.count, { stolenFrom: s.stolenFrom, condition: s.condition, silent: true });
    return out;
  }

  private confiscate(): ItemStack[] {
    const taken = this.deps.inventory?.removeAllStolen() ?? [];
    this._evidence.push(...taken);
    return taken;
  }

  private day(): number {
    return Math.floor(this.now() / 24);
  }

  serialize() {
    const fin = (v: number) => (Number.isFinite(v) ? v : null);
    return {
      bounties: Object.fromEntries(this.bounties),
      committed: Object.fromEntries(this.committed),
      reported: Object.fromEntries(this.reported),
      booked: Object.fromEntries([...this.booked].map(([k, v]) => [k, [...v]])),
      lastCrimeHour: Object.fromEntries(this.lastCrimeHour),
      resisting: [...this.resisting],
      alerts: Object.fromEntries(this.alerts),
      persuadeFailedAt: Object.fromEntries(this.persuadeFailedAt),
      override: this.override,
      asylumUntil: fin(this.asylumUntil),
      asylumDay: this.asylumDay,
      evidence: this.evidence(),
      condemned: this.condemned,
    };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<CrimeSystem['serialize']>>;
    const nums = <K extends string>(m: Map<K, number>, o: Record<string, unknown> | undefined, pos = false) => {
      m.clear();
      for (const [k, v] of Object.entries(o ?? {})) if (typeof v === 'number' && Number.isFinite(v) && (!pos || v > 0)) m.set(k as K, v);
    };
    nums(this.bounties, d.bounties, true);
    nums(this.committed, d.committed);
    nums(this.reported, d.reported);
    nums(this.lastCrimeHour, d.lastCrimeHour);
    nums(this.persuadeFailedAt, d.persuadeFailedAt);
    this.booked.clear();
    for (const [k, v] of Object.entries(d.booked ?? {})) if (Array.isArray(v)) this.booked.set(k, v.filter((c): c is CrimeId => c in CRIMES));
    this.resisting.clear();
    for (const j of Array.isArray(d.resisting) ? d.resisting : []) if (typeof j === 'string') this.resisting.add(j);
    this.alerts.clear();
    for (const [k, v] of Object.entries(d.alerts ?? {})) if (v && typeof v.level === 'number' && typeof v.until === 'number') this.alerts.set(k, { level: v.level, until: v.until });
    this.override = typeof d.override === 'string' ? d.override : null;
    this.asylumUntil = typeof d.asylumUntil === 'number' ? d.asylumUntil : -Infinity;
    this.asylumDay = typeof d.asylumDay === 'number' ? d.asylumDay : -1;
    this._evidence = (Array.isArray(d.evidence) ? d.evidence : []).filter((s) => s && typeof s.itemId === 'string' && s.count > 0).map((s) => ({ ...s }));
    this.confrontation = null;
    const c = d.condemned;
    this._condemned = c && typeof c.ledger === 'string' && typeof c.bouts === 'number' && c.bouts > 0 ? { ledger: c.ledger, bouts: c.bouts } : null;
  }
}

/** Deterministic 0..1 from a string (FNV-1a), so a guard is always corruptible or never. */
function hash01(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}
