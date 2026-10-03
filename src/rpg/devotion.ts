/**
 * Devotion (game.devotion): the "magic" system (GDD §3.3: pietas never regenerates; §14.6 is
 * pending, so the details follow docs/research/game-design.md §B8.3).
 *
 *   - Pietas does not regenerate; acts of devotion refill it: a daily prayer at a shrine, offerings,
 *     fulfilled vows, festivals, resting at your lararium.
 *   - Shrine blessings last one game day, one at a time (sheet.applyCondition handles that).
 *   - A patron deity, chosen at its temple, gives a passive bonus and an invocation (Z) that
 *     spends pietas. The first choice is free; changing patron costs an offering in denarii.
 *   - Impiety leaves you ill-omened until you make expiation (a piaculum: a fee and a rite).
 */
import type { EventBus, GameEvents } from '../core/Events';
import { DEVOTION, XP } from './data/balance';
import { DEITIES } from './data/deities';
import type { InventoryImpl } from './inventory';
import type { CharacterSheetImpl } from './sheet';
import type { DeityDef } from './types';
import './events';

export type DevotionAct = keyof typeof DEVOTION.restore;

export interface DevotionDeps {
  sheet: CharacterSheetImpl;
  inventory?: InventoryImpl;
  events?: EventBus<GameEvents>;
  /** Whole game days since the start (GameTime.dayIndex), for the once-a-day prayer refill. */
  day?: () => number;
}

export interface DevotionResult {
  restored: number;
  blessed?: string;
  cured?: number;
}

export class Devotion {
  private readonly defs = new Map<string, DeityDef>();
  private _patron: string | null = null;
  private chosenOnce = false;
  private lastPrayerDay = -1;
  private lastLarariumDay = -1;

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

  /** Denarii it costs to choose this patron now. */
  patronCost(id: string): number {
    return !this.chosenOnce || this._patron === id ? 0 : DEVOTION.rechooseCost;
  }

  /** Take a god as patron at their temple. */
  choosePatron(id: string): { ok: boolean; cost: number; reason?: 'unknown' | 'same' | 'no-money' } {
    const d = this.defs.get(id);
    if (!d) return { ok: false, cost: 0, reason: 'unknown' };
    if (this._patron === id) return { ok: false, cost: 0, reason: 'same' };
    const cost = this.patronCost(id);
    if (cost > 0 && !this.deps.inventory?.spendDenarii(cost)) return { ok: false, cost, reason: 'no-money' };
    this._patron = id;
    this.chosenOnce = true;
    this.applyPassive();
    this.deps.events?.emit('devotion:patron', { deityId: id });
    this.deps.events?.emit('rpg:notify', { text: `${d.name} is now your patron`, kind: 'effect' });
    return { ok: true, cost };
  }

  /** Call on your patron (Z): spends pietas, applies the invocation's effects. */
  invoke(): { ok: boolean; reason?: 'no-patron' | 'no-pietas'; deity?: DeityDef } {
    const d = this.patron;
    if (!d) return { ok: false, reason: 'no-patron' };
    const { sheet } = this.deps;
    if (!sheet.vitals.spend('pietas', this.invocationCost())) return { ok: false, reason: 'no-pietas', deity: d };
    sheet.applyEffects(`invocation:${d.id}`, d.invocation.effects);
    this.deps.events?.emit('devotion:invoked', { deityId: d.id, invocation: d.invocation.name });
    this.deps.events?.emit('rpg:notify', { text: `${d.invocation.name}`, kind: 'effect' });
    return { ok: true, deity: d };
  }

  /** Pietas the patron's invocation costs now (Pax Deorum: −20%). */
  invocationCost(): number {
    const d = this.patron;
    if (!d) return 0;
    return d.invocation.cost * (this.deps.sheet.hasFlag('perk-religio-pax-deorum') ? 1 - DEVOTION.paxDeorumDiscount : 1);
  }

  /** Whether today's prayer refill is still available. */
  canPrayToday(): boolean {
    return this.today() !== this.lastPrayerDay;
  }

  /**
   * An act of devotion. Restores pietas (a fraction of max, × 1 + pietas.regen), trains Piety and,
   * at a god's shrine (`god`), grants that god's blessing. The daily prayer refills once per game
   * day; praying again still renews the blessing. With Isis as patron, prayer cures diseases.
   */
  devote(act: DevotionAct, opts: { god?: string; offeringValue?: number } = {}): DevotionResult {
    const { sheet } = this.deps;
    let fraction = DEVOTION.restore[act];
    if (act === 'dailyPrayer') {
      if (this.canPrayToday()) this.lastPrayerDay = this.today();
      else fraction = 0;
    }
    // perk-religio-lararium: praying at your home lararium fully restores pietas once a day.
    if (act === 'lararium') {
      if (sheet.hasFlag('perk-religio-lararium') && this.lastLarariumDay !== this.today()) {
        fraction = 1;
        this.lastLarariumDay = this.today();
      }
    }
    const before = sheet.vitals.pietas.current;
    sheet.vitals.restore('pietas', sheet.vitals.pietas.max * fraction * Math.max(0, 1 + sheet.modifier('pietas.regen')));
    const result: DevotionResult = { restored: sheet.vitals.pietas.current - before };
    const R = XP.religio;
    const xp = act === 'dailyPrayer' ? (fraction > 0 ? R.dailyPrayer : 0) : act === 'offering' ? Math.min(R.offeringMax, R.offering + (opts.offeringValue ?? 0) / R.offeringValueDiv) : act === 'vow' ? R.vow : act === 'festival' ? R.festival : 0;
    if (xp) sheet.useSkill('religio', xp);
    const god = opts.god ? this.defs.get(opts.god) : undefined;
    const blessing = god?.blessing ?? (opts.god && sheet.conditionDef(opts.god)?.kind === 'blessing' ? opts.god : undefined);
    if (blessing && (act === 'dailyPrayer' || act === 'offering' || act === 'festival')) {
      sheet.applyCondition(blessing);
      result.blessed = blessing;
    }
    if (sheet.hasFlag('patron.isis') && (act === 'dailyPrayer' || act === 'offering')) result.cured = sheet.cure('disease');
    this.deps.events?.emit('devotion:act', { act, god: opts.god });
    return result;
  }

  /** Burn incense, pour wine or leave a cake at an altar: consumes the item, then devote('offering'). */
  offer(itemId: string, god?: string): DevotionResult | null {
    const inv = this.deps.inventory;
    const def = inv?.items.get(itemId);
    if (!inv || !def || !inv.has(itemId)) return null;
    const fit = def.tags?.includes('offering') || def.tags?.includes('wine') || def.tags?.includes('food');
    if (!fit) return null;
    inv.remove(itemId, 1, { reason: 'used' });
    return this.devote('offering', { god, offeringValue: def.value });
  }

  /** Desecration, killing in a temple, robbing tombs, breaking vows. */
  impiety() {
    this.deps.sheet.applyCondition('infaustus');
  }

  /** A piaculum: pay the fee and the rite lifts the ill omen. */
  expiate(fee = 10): boolean {
    const { sheet, inventory } = this.deps;
    if (!sheet.hasCondition('infaustus')) return false;
    if (fee > 0 && !inventory?.spendDenarii(fee)) return false;
    sheet.cure('omen');
    sheet.useSkill('religio', XP.religio.offering);
    return true;
  }

  private today() {
    return this.deps.day?.() ?? 0;
  }

  private applyPassive() {
    const d = this.patron;
    this.deps.sheet.setModifierSource('patron', d?.passive.modifiers);
    this.deps.sheet.setFlagSource('patron', d?.passive.flags);
  }

  serialize() {
    return { patron: this._patron, chosenOnce: this.chosenOnce, lastPrayerDay: this.lastPrayerDay, lastLarariumDay: this.lastLarariumDay };
  }

  restore(data: unknown) {
    const d = (data ?? {}) as { patron?: string | null; chosenOnce?: boolean; lastPrayerDay?: number; lastLarariumDay?: number };
    this._patron = typeof d.patron === 'string' && this.defs.has(d.patron) ? d.patron : null;
    this.chosenOnce = !!d.chosenOnce || !!this._patron;
    this.lastPrayerDay = typeof d.lastPrayerDay === 'number' ? d.lastPrayerDay : -1;
    this.lastLarariumDay = typeof d.lastLarariumDay === 'number' ? d.lastLarariumDay : -1;
    this.applyPassive();
  }
}
