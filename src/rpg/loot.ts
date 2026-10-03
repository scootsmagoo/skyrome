/** Weighted, level-gated loot rolls with nested tables. Deterministic given an Rng. */
import type { Rng } from '../core/Rng';
import { LOOT_TABLES } from './data/loot';
import type { LootEntry, LootTableDef } from './types';

const tables = new Map<string, LootTableDef>(LOOT_TABLES.map((t) => [t.id, t]));

export function registerLootTables(defs: readonly LootTableDef[]) {
  for (const d of defs) tables.set(d.id, d);
}

export function lootTable(id: string) {
  return tables.get(id);
}

export interface LootResult {
  items: { id: string; count: number }[];
  denarii: number;
}

type RngLike = Pick<Rng, 'next' | 'int' | 'range' | 'chance'>;

/** Roll a table at a level. Unknown tables yield nothing (with a warning). */
export function rollLoot(id: string, level: number, rng: RngLike): LootResult {
  const out = new Map<string, number>();
  const denarii = roll(id, level, rng, out, 0);
  return { items: [...out].map(([itemId, count]) => ({ id: itemId, count })), denarii };
}

function roll(id: string, level: number, rng: RngLike, out: Map<string, number>, depth: number): number {
  const t = tables.get(id);
  if (!t) {
    console.warn(`[loot] unknown table "${id}"`);
    return 0;
  }
  if (depth > 5) return 0;
  let coins = 0;
  if (t.denarii && rng.chance(t.denarii.chance ?? 1)) {
    const [lo, hi] = t.denarii.range;
    const scale = 1 + Math.max(0, level - 1) * (t.denarii.perLevel ?? 0);
    // Round to the nearest as.
    coins += Math.round(rng.range(lo, hi) * scale * 16) / 16;
  }
  for (const a of t.always ?? []) out.set(a.item, (out.get(a.item) ?? 0) + (a.count ?? 1));
  const eligible = t.entries.filter((e) => level >= (e.minLevel ?? 0) && level <= (e.maxLevel ?? Infinity) && e.weight > 0);
  if (!eligible.length) return coins;
  const rolls = rng.int(t.rolls[0], t.rolls[1]);
  for (let i = 0; i < rolls; i++) {
    if (t.chanceNone && rng.chance(t.chanceNone)) continue;
    const e = pick(eligible, rng);
    if (e.table) {
      coins += roll(e.table, level, rng, out, depth + 1);
    } else if (e.item) {
      const [lo, hi] = e.count ?? [1, 1];
      out.set(e.item, (out.get(e.item) ?? 0) + rng.int(lo, hi));
    }
  }
  return coins;
}

function pick(entries: LootEntry[], rng: RngLike): LootEntry {
  let total = 0;
  for (const e of entries) total += e.weight;
  let r = rng.next() * total;
  for (const e of entries) if ((r -= e.weight) <= 0) return e;
  return entries[entries.length - 1];
}
