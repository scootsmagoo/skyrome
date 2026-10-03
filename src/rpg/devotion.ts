/**
 * Devotion (game.devotion) — docs/GDD.md §14.6, the low-fantasy "magic" system.
 *
 *   - Pietas never regenerates (§3.3). Acts of devotion add it: a compitum prayer +5 (once per shrine
 *     per day, with the Lares favor), a temple prayer with an offering +10 (and the temple's blessing),
 *     the home lararium +15 once a day (full with the perk), a festival rite +25, a fulfilled vow
 *     +20…+50, sparing a yielded foe +5, burying the dead +10. Impiety costs it (and may leave you
 *     `infaustus`).
 *   - Two blessing slots: one temple blessing (24 game hours) and the Lares favor (2 game hours).
 *   - A patron deity, chosen at its temple, gives a passive bonus and an invocation (Z) that spends
 *     pietas. The first choice is free; changing costs 100 den. and waits 7 days.
 *   - Vows (vota): pledge V before a quest for `votum`; pay V within 3 days of success or become
 *     infaustus. A piaculum (2 × V, at least 20 den.) lifts the ill omen.
 *   - The daily omen and curse tablets work through belief, as at Rome.
 */
import type { EventBus, GameEvents } from '../core/Events';
import { DEVOTION, XP } from './data/balance';
import { blessingAt } from './data/conditions';
import { DEITIES } from './data/deities';
import type { InventoryImpl } from './inventory';
import type { CharacterSheetImpl } from './sheet';
import type { DeityDef } from './types';
import './events';

export type PietasLoss = keyof typeof DEVOTION.loss;
export type Omen = 'none' | 'good' | 'bad';

export interface DevotionDeps {
  sheet: CharacterSheetImpl;
  inventory?: InventoryImpl;
  events?: EventBus<GameEvents>;
  /** Whole game days since the start (GameTime.dayIndex). */
  day?: () => number;
  rng?: { next(): number };
}

export interface PrayerResult {
  ok: boolean;
  /** Pietas actually gained. */
  pietas: number;
  /** Blessing (condition id) granted or renewed. */
  blessing?: string;
  /** Ailments cured (Isis as patron). */
  cured?: number;
  reason?: 'no-blessing' | 'no-offering' | 'unknown';
}

export interface Vow {
  questId: string;
  value: number;
  /** 'active' until the quest ends; 'owed' after success, due on `due` (day index). */
  state: 'active' | 'owed';
  due?: number;
}

/** A day-stamped set (shrines prayed at today, festivals kept today). */
interface Daily {
  day: number;
  ids: string[];
}

export class Devotion {
  private readonly defs = new Map<string, DeityDef>();
  private _patron: string | null = null;
  private chosenDay: number | null = null;
  private compita: Daily = { day: -1, ids: [] };
  private temples: Daily = { day: -1, ids: [] };
  private festivals: Daily = { day: -1, ids: [] };
  private lastLarariumDay = -1;
  private invokedDay: Record<string, number> = {};
  private readonly vowList = new Map<string, Vow>();
  private brokenVowValue = 0;
  private omenDay = -1;
  private omenOptions: Omen[] = [];

  constructor(
    private readonly deps: DevotionDeps,
    deities: readonly DeityDef[] = DEITIES,
  ) {
    for (const d of deities) this.defs.set(d.id, d);
  }

  deity(id: string) {
    return this.defs.get(id);
  }

  all(): DeityDef[] {
    return [...this.defs.values()];
  }

  get patron(): DeityDef | undefined {
    return this._patron ? this.defs.get(this._patron) : undefined;
  }

  // ---------------------------------------------------------------- pietas

  /** Add pietas (capped at max) with a "+5 Pietas" notification. Returns what was gained. */
  gainPietas(amount: number): number {
    const v = this.deps.sheet.vitals;
    const before = v.pietas.current;
    v.restore('pietas', amount);
    const gained = v.pietas.current - before;
    if (gained > 0) this.notify(`+${round1(gained)} Pietas`);
    return gained;
  }

  /** Lose pietas (never below 0). Returns what was lost. */
  losePietas(amount: number): number {
    const lost = this.deps.sheet.vitals.drain('pietas', amount);
    if (lost > 0) this.notify(`−${round1(lost)} Pietas`);
    return lost;
  }

  /** An impious act (§14.6): killing a yielded foe, temple theft, killing in a precinct, a broken vow, a false oath. */
  impiety(kind: PietasLoss = 'templeTheft') {
    const l = DEVOTION.loss[kind];
    this.losePietas(l.pietas);
    if (l.omen) this.deps.sheet.applyCondition('infaustus');
  }

  sparedYielded() {
    return this.gainPietas(DEVOTION.gain.spareYielded);
  }

  buriedDead() {
    return this.gainPietas(DEVOTION.gain.burial);
  }

  // ---------------------------------------------------------------- prayer

  /** Whether today's prayer at this compitum shrine still gives pietas. */
  canPrayAt(shrineId: string): boolean {
    return !this.has(this.compita, shrineId);
  }

  /**
   * Pray at a crossroads shrine (compitum): +5 pietas once per shrine per day, the Lares favor
   * every time, Rites XP 8 (with the pietas). With Isis as patron, prayer cures ailments.
   */
  prayAtCompitum(shrineId: string): PrayerResult {
    const { sheet } = this.deps;
    let pietas = 0;
    if (this.canPrayAt(shrineId)) {
      this.mark('compita', shrineId);
      pietas = this.gainPietas(DEVOTION.gain.compitum);
      sheet.useSkill('religio', XP.religio.dailyPrayer);
    }
    sheet.applyCondition('favor-larum');
    this.deps.events?.emit('devotion:act', { act: 'compitum', god: 'lares' });
    return { ok: true, pietas, blessing: 'favor-larum', cured: this.isisCure() };
  }

  /**
   * Pray at a temple with an offering — an item tagged 'offering' (libum, incense), or wine or food
   * worth 1 den., or `denarii` ≥ 1. Grants the temple's blessing (§14.6; it replaces your previous
   * temple blessing), +10 pietas once per temple per day, Rites XP 5 + value/2 (max 30).
   */
  prayAtTemple(templeId: string, offering: { itemId?: string; denarii?: number } = {}): PrayerResult {
    const { sheet, inventory } = this.deps;
    const cond = blessingAt(templeId);
    const value = this.offeringValue(offering);
    if (value === null) return { ok: false, pietas: 0, reason: 'no-offering' };
    if (offering.itemId) inventory!.remove(offering.itemId, 1, { reason: 'used' });
    else if (offering.denarii) inventory!.spendDenarii(offering.denarii);
    let pietas = 0;
    if (!this.has(this.temples, templeId)) {
      this.mark('temples', templeId);
      pietas = this.gainPietas(DEVOTION.gain.temple);
    }
    const R = XP.religio;
    sheet.useSkill('religio', Math.min(R.offeringMax, R.offering + value / R.offeringValueDiv));
    if (cond) sheet.applyCondition(cond.id);
    this.deps.events?.emit('devotion:act', { act: 'temple', god: cond?.id ?? templeId });
    return { ok: true, pietas, blessing: cond?.id, cured: this.isisCure() };
  }

  /** The value of an offering, or null if it is not one (§14.6: at least a libum, a pinch of incense or 1 den.). */
  offeringValue(o: { itemId?: string; denarii?: number }): number | null {
    const inv = this.deps.inventory;
    if (o.itemId) {
      const def = inv?.items.get(o.itemId);
      if (!def || !inv!.has(o.itemId)) return null;
      if (def.tags?.includes('offering')) return def.value;
      if ((def.tags?.includes('wine') || def.tags?.includes('food')) && def.value >= DEVOTION.minOffering) return def.value;
      return null;
    }
    if (o.denarii !== undefined && o.denarii >= DEVOTION.minOffering && (inv?.denarii ?? 0) + 1e-9 >= o.denarii) return o.denarii;
    return null;
  }

  /** Pray at your home lararium: +15 pietas once a day (a full refill with perk-religio-lararium). */
  prayAtLararium(): PrayerResult {
    const { sheet } = this.deps;
    if (this.lastLarariumDay === this.today()) return { ok: true, pietas: 0 };
    this.lastLarariumDay = this.today();
    const full = sheet.hasFlag('perk-religio-lararium');
    const pietas = this.gainPietas(full ? sheet.vitals.pietas.max : DEVOTION.gain.lararium);
    sheet.useSkill('religio', XP.religio.dailyPrayer);
    this.deps.events?.emit('devotion:act', { act: 'lararium' });
    return { ok: true, pietas, cured: this.isisCure() };
  }

  /** Take part in a festival rite: +25 pietas and Rites XP 25, once per festival per day. */
  festivalRite(festivalId: string): PrayerResult {
    if (this.has(this.festivals, festivalId)) return { ok: true, pietas: 0 };
    this.mark('festivals', festivalId);
    const pietas = this.gainPietas(DEVOTION.gain.festival);
    this.deps.sheet.useSkill('religio', XP.religio.festival);
    this.deps.events?.emit('devotion:act', { act: 'festival', god: festivalId });
    return { ok: true, pietas };
  }

  /** With Isis as patron, praying cures diseases and poisons. */
  private isisCure(): number | undefined {
    const { sheet } = this.deps;
    if (!sheet.hasFlag('patron.isis')) return undefined;
    return sheet.cure('disease') + sheet.cure('poison');
  }

  // ---------------------------------------------------------------- patron

  /** Days until the patron can be changed (0 = now). */
  patronWait(): number {
    if (this.chosenDay === null) return 0;
    return Math.max(0, this.chosenDay + DEVOTION.rechooseDays - this.today());
  }

  /** Denarii it costs to take this patron now. */
  patronCost(id: string): number {
    return this.chosenDay === null || this._patron === id ? 0 : DEVOTION.rechooseCost;
  }

  /** Take a god as patron at their temple (changing: 100 den., and not within 7 days of the last choice). */
  choosePatron(id: string): { ok: boolean; cost: number; reason?: 'unknown' | 'same' | 'no-money' | 'too-soon'; waitDays?: number } {
    const d = this.defs.get(id);
    if (!d) return { ok: false, cost: 0, reason: 'unknown' };
    if (this._patron === id) return { ok: false, cost: 0, reason: 'same' };
    const cost = this.patronCost(id);
    const wait = this.patronWait();
    if (wait > 0) return { ok: false, cost, reason: 'too-soon', waitDays: wait };
    if (cost > 0 && !this.deps.inventory?.spendDenarii(cost)) return { ok: false, cost, reason: 'no-money' };
    this._patron = id;
    this.chosenDay = this.today();
    this.applyPassive();
    this.deps.events?.emit('devotion:patron', { deityId: id });
    this.notify(`${d.name} is now your patron`);
    return { ok: true, cost };
  }

  /** Pietas the patron's invocation costs now (Pax Deorum: −20%). */
  invocationCost(): number {
    const d = this.patron;
    if (!d) return 0;
    return d.invocation.cost * (this.deps.sheet.hasFlag('perk-religio-pax-deorum') ? 1 - DEVOTION.paxDeorumDiscount : 1);
  }

  /** Call on your patron (Z): spends pietas and applies the invocation (Invictus once a day). */
  invoke(): { ok: boolean; reason?: 'no-patron' | 'no-pietas' | 'used-today'; deity?: DeityDef } {
    const d = this.patron;
    if (!d) return { ok: false, reason: 'no-patron' };
    if (d.invocation.oncePerDay && this.invokedDay[d.id] === this.today()) return { ok: false, reason: 'used-today', deity: d };
    const { sheet } = this.deps;
    if (!sheet.vitals.spend('pietas', this.invocationCost())) return { ok: false, reason: 'no-pietas', deity: d };
    this.invokedDay[d.id] = this.today();
    sheet.applyEffects(`invocation:${d.id}`, d.invocation.effects);
    this.deps.events?.emit('devotion:invoked', { deityId: d.id, invocation: d.invocation.name });
    this.notify(d.invocation.name);
    return { ok: true, deity: d };
  }

  // ---------------------------------------------------------------- vows

  vows(): Vow[] {
    return [...this.vowList.values()].map((v) => ({ ...v }));
  }

  /** Pledge an offering of `value` den. for a quest's success: `votum` (+50% with perk-religio-votum) until it ends. */
  vow(questId: string, value: number): boolean {
    if (this.vowList.has(questId) || !(value > 0)) return false;
    this.vowList.set(questId, { questId, value, state: 'active' });
    this.applyVotum();
    this.deps.events?.emit('devotion:act', { act: 'vow', god: questId });
    return true;
  }

  /** The quest ended: success makes the vow owed (3 days to pay); failure releases it. */
  resolveVow(questId: string, success: boolean) {
    const v = this.vowList.get(questId);
    if (!v || v.state !== 'active') return;
    if (success) {
      v.state = 'owed';
      v.due = this.today() + DEVOTION.vowDays;
      this.notify(`Your vow is due: ${v.value} den. within ${DEVOTION.vowDays} days`);
    } else this.vowList.delete(questId);
    this.applyVotum();
  }

  /** Pay an owed vow: pietas +20…+50, Rites XP 40, and a votive tablet (V·S·L·M). */
  payVow(questId: string): boolean {
    const v = this.vowList.get(questId);
    if (!v || v.state !== 'owed' || !this.deps.inventory?.spendDenarii(v.value)) return false;
    this.vowList.delete(questId);
    const G = DEVOTION.gain;
    this.gainPietas(Math.min(G.vowMax, G.vowMin + Math.floor(v.value / G.vowPerDenarii)));
    this.deps.sheet.useSkill('religio', XP.religio.vow);
    if (this.deps.inventory.items.has('tabella-votiva')) this.deps.inventory.add('tabella-votiva', 1, { source: 'vow' });
    this.notify('Votum solvit libens merito');
    return true;
  }

  /** Break overdue vows (call daily, e.g. on the hour): −30 pietas and infaustus. Returns how many broke. */
  checkVows(): number {
    let n = 0;
    for (const v of [...this.vowList.values()]) {
      if (v.state !== 'owed' || v.due === undefined || this.today() <= v.due) continue;
      this.vowList.delete(v.questId);
      this.brokenVowValue = Math.max(this.brokenVowValue, v.value);
      this.impiety('brokenVow');
      n++;
    }
    return n;
  }

  private applyVotum() {
    const { sheet } = this.deps;
    const active = [...this.vowList.values()].some((v) => v.state === 'active');
    if (!active) {
      sheet.cure('state:votum');
      return;
    }
    if (sheet.hasCondition('votum')) return;
    const def = sheet.conditionDef('votum');
    if (def) sheet.applyEffects('state:votum', def.effects, { magnitude: sheet.hasFlag('perk-religio-votum') ? 1 + DEVOTION.votumPerk : 1 });
  }

  // ---------------------------------------------------------------- piaculum

  /** A piaculum costs twice the broken vow, or 20 den. */
  piaculumCost(): number {
    return Math.max(DEVOTION.piaculumMin, DEVOTION.piaculumMult * this.brokenVowValue);
  }

  /** Pay the piaculum at a temple: lifts `infaustus`. */
  expiate(): boolean {
    const { sheet, inventory } = this.deps;
    if (!sheet.hasCondition('infaustus')) return false;
    if (!inventory?.spendDenarii(this.piaculumCost())) return false;
    sheet.cure('omen:infaustus');
    this.brokenVowValue = 0;
    sheet.useSkill('religio', XP.religio.offering);
    this.notify('The gods are appeased');
    return true;
  }

  // ---------------------------------------------------------------- omens and curses

  /**
   * The daily omen, the first time you go outdoors after dawn: 20% good, 20% bad, 60% nothing.
   * A bad omen takes hold at once unless you wear an amulet (refuse it with refuseOmen(): touch an
   * amulet or re-cross the threshold); a good one waits for acceptOmen(). Augur's Eye rolls twice
   * and offers both (chooseOmen). Returns null if today's omen has already come.
   */
  rollOmen(rng = this.deps.rng ?? { next: Math.random }): { omen: Omen; options: Omen[] } | null {
    if (this.omenDay === this.today()) return null;
    this.omenDay = this.today();
    const roll = (): Omen => {
      const r = rng.next();
      return r < DEVOTION.omen.good ? 'good' : r < DEVOTION.omen.good + DEVOTION.omen.bad ? 'bad' : 'none';
    };
    this.omenOptions = this.deps.sheet.hasFlag('perk-religio-augur') ? [roll(), roll()] : [roll()];
    const omen = this.omenOptions[0];
    if (this.omenOptions.length === 1) this.settleOmen(omen);
    return { omen, options: [...this.omenOptions] };
  }

  /** Augur's Eye: pick one of the two omens offered. */
  chooseOmen(i: number): Omen {
    const o = this.omenOptions[i] ?? 'none';
    this.omenOptions = [o];
    this.settleOmen(o);
    return o;
  }

  private settleOmen(o: Omen) {
    if (o !== 'bad') return;
    if (this.deps.sheet.hasFlag('amulet')) {
      this.notify('Your amulet turns aside a bad omen');
      return;
    }
    this.deps.sheet.applyCondition('omen-malum');
  }

  /** Accept today's good omen: +5% crit for the day. */
  acceptOmen(): boolean {
    if (this.omenOptions[0] !== 'good') return false;
    this.omenOptions = [];
    this.deps.sheet.applyCondition('omen-faustum');
    this.deps.sheet.useSkill('religio', XP.religio.omen);
    return true;
  }

  /** Refuse today's bad omen (touch an amulet, re-cross the threshold). */
  refuseOmen(): boolean {
    if (this.omenOptions[0] !== 'bad') return false;
    this.omenOptions = [];
    this.deps.sheet.cure('omen:omen-malum');
    this.deps.sheet.useSkill('religio', XP.religio.omen);
    return true;
  }

  /** You learn of a curse tablet against you: `defixus` for 3 days, unless you wear an amulet. */
  learnOfCurse(): boolean {
    if (this.deps.sheet.hasFlag('amulet')) return false;
    return this.deps.sheet.applyCondition('defixus');
  }

  // ---------------------------------------------------------------- internals

  private today() {
    return this.deps.day?.() ?? 0;
  }

  private has(d: Daily, id: string) {
    return d.day === this.today() && d.ids.includes(id);
  }

  private mark(which: 'compita' | 'temples' | 'festivals', id: string) {
    const d = this[which];
    if (d.day !== this.today()) this[which] = { day: this.today(), ids: [id] };
    else d.ids.push(id);
  }

  private applyPassive() {
    const d = this.patron;
    this.deps.sheet.setModifierSource('patron', d?.passive.modifiers);
    this.deps.sheet.setFlagSource('patron', d?.passive.flags);
  }

  private notify(text: string) {
    this.deps.events?.emit('rpg:notify', { text, kind: 'effect' });
  }

  serialize() {
    return {
      patron: this._patron,
      chosenDay: this.chosenDay,
      compita: { ...this.compita, ids: [...this.compita.ids] },
      temples: { ...this.temples, ids: [...this.temples.ids] },
      festivals: { ...this.festivals, ids: [...this.festivals.ids] },
      lastLarariumDay: this.lastLarariumDay,
      invokedDay: { ...this.invokedDay },
      vows: this.vows(),
      brokenVowValue: this.brokenVowValue,
      omenDay: this.omenDay,
      omenOptions: [...this.omenOptions],
    };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as Partial<ReturnType<Devotion['serialize']>>;
    this._patron = typeof d.patron === 'string' && this.defs.has(d.patron) ? d.patron : null;
    this.chosenDay = typeof d.chosenDay === 'number' ? d.chosenDay : this._patron ? 0 : null;
    const daily = (x: unknown): Daily => {
      const v = x as Partial<Daily> | undefined;
      return { day: typeof v?.day === 'number' ? v.day : -1, ids: Array.isArray(v?.ids) ? v!.ids.filter((i) => typeof i === 'string') : [] };
    };
    this.compita = daily(d.compita);
    this.temples = daily(d.temples);
    this.festivals = daily(d.festivals);
    this.lastLarariumDay = typeof d.lastLarariumDay === 'number' ? d.lastLarariumDay : -1;
    this.invokedDay = {};
    for (const [k, v] of Object.entries(d.invokedDay ?? {})) if (typeof v === 'number') this.invokedDay[k] = v;
    this.vowList.clear();
    for (const v of Array.isArray(d.vows) ? d.vows : []) {
      if (!v || typeof v.questId !== 'string' || !(v.value > 0)) continue;
      this.vowList.set(v.questId, { questId: v.questId, value: v.value, state: v.state === 'owed' ? 'owed' : 'active', due: typeof v.due === 'number' ? v.due : undefined });
    }
    this.brokenVowValue = typeof d.brokenVowValue === 'number' ? d.brokenVowValue : 0;
    this.omenDay = typeof d.omenDay === 'number' ? d.omenDay : -1;
    this.omenOptions = (Array.isArray(d.omenOptions) ? d.omenOptions : []).filter((o): o is Omen => o === 'none' || o === 'good' || o === 'bad');
    this.applyPassive();
  }
}

function round1(n: number) {
  return Math.round(n * 10) / 10;
}
