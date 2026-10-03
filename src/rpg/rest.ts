/**
 * Rest, baths and cleanliness — docs/GDD.md §14.8.
 *
 *   sleep / wait (T): 1–24 game hours; not while in combat or trespassing. Sleep restores all
 *     health and stamina; your own bed gives `bene-quietus` (+10% skill XP for 8 game hours), a
 *     rented bed `quietus` (+5%). Both ask for an autosave ('save:request', §14.13).
 *   baths: 1 quadrans, 1 game hour → `lautus` for 12 game hours (+10 persuasion, +10% stamina
 *     regeneration) and no more `sordidus`; a massage (2 as.) restores stamina; tip the capsarius
 *     (1 as.) or there is a 15% chance your outer garment is stolen.
 *   a street fountain (lacus) removes `sordidus` but gives no `lautus`.
 *   fast travel (§14.12): not in combat, over-encumbered or trespassing.
 */
import type { EventBus, GameEvents } from '../core/Events';
import type { InventoryImpl } from './inventory';
import type { CharacterSheetImpl } from './sheet';
import type { Standing } from './standing';
import '../save/SaveSystem';

export const REST = {
  maxHours: 24,
  bath: { fee: 1 / 64, hours: 1, massage: 2 / 16, tip: 1 / 16, theftChance: 0.15 },
};

export interface RestDeps {
  sheet: CharacterSheetImpl;
  standing?: Standing;
  inventory?: InventoryImpl;
  time?: { advanceHours(h: number): void };
  events?: EventBus<GameEvents>;
  /** Trespassing right now (a private space after a warning). */
  trespassing?: () => boolean;
}

export type Bed = 'own' | 'rented' | 'none';

/** Why you can't sleep or wait now, or null. */
export function restBlocker(d: RestDeps): 'in-combat' | 'trespassing' | null {
  if (d.sheet.vitals.inCombat) return 'in-combat';
  if (d.trespassing?.()) return 'trespassing';
  return null;
}

/** Sleep (in a bed) or wait (bed 'none') for 1–24 game hours. */
export function sleep(d: RestDeps, hours: number, bed: Bed = 'none'): { ok: boolean; hours: number; reason?: 'in-combat' | 'trespassing' } {
  const why = restBlocker(d);
  if (why) return { ok: false, hours: 0, reason: why };
  const h = Math.max(1, Math.min(REST.maxHours, Math.round(hours)));
  d.time?.advanceHours(h);
  if (bed !== 'none') {
    const v = d.sheet.vitals;
    v.restore('health', v.health.max);
    v.restore('stamina', v.stamina.max);
    d.sheet.applyCondition(bed === 'own' ? 'bene-quietus' : 'quietus');
  }
  d.events?.emit('save:request', { reason: 'sleep' });
  return { ok: true, hours: h };
}

/** Wait (T) without a bed. */
export function wait(d: RestDeps, hours: number) {
  return sleep(d, hours, 'none');
}

/** A visit to the baths (§14.8). Returns what it cost and anything stolen from the changing room. */
export function bathe(d: RestDeps, opts: { massage?: boolean; tip?: boolean; rng?: { next(): number } } = {}): { ok: boolean; cost: number; stolen?: string; reason?: 'no-money' } {
  const B = REST.bath;
  const cost = B.fee + (opts.massage ? B.massage : 0) + (opts.tip ? B.tip : 0);
  if (d.inventory && !d.inventory.spendDenarii(cost)) return { ok: false, cost, reason: 'no-money' };
  d.time?.advanceHours(B.hours);
  d.standing?.setCleanliness('lautus');
  if (opts.massage) d.sheet.vitals.restore('stamina', d.sheet.vitals.stamina.max);
  let stolen: string | undefined;
  if (!opts.tip && d.inventory && (opts.rng ?? { next: Math.random }).next() < B.theftChance) {
    const cloak = d.inventory.equipped('cloak');
    if (cloak && d.inventory.remove(cloak, 1, { reason: 'quest' })) stolen = cloak;
  }
  return { ok: true, cost, stolen };
}

/** Wash at a street fountain: no longer sordidus (no lautus). */
export function washAtFountain(d: RestDeps): boolean {
  if (d.standing?.cleanliness !== 'sordidus') return false;
  d.standing.setCleanliness('normal');
  return true;
}

/** Why map fast travel is refused now (§14.12), or null. Indoors and "lectica only" are the map's business. */
export function fastTravelBlocker(d: RestDeps): 'in-combat' | 'over-encumbered' | 'trespassing' | null {
  if (d.sheet.vitals.inCombat) return 'in-combat';
  if (d.inventory?.overEncumbered) return 'over-encumbered';
  if (d.trespassing?.()) return 'trespassing';
  return null;
}
