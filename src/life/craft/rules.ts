/**
 * The mortar's rules (docs/design/world-life.md §4.6), pure so tests can drive them: can a recipe
 * be made with what is in hand, what the card says when it can't, and the economy rule that keeps
 * crafting a source of XP and remedies and not of money (tests/life-economy.test.ts holds it).
 */
import type { Recipe } from '../types';

/** What the player has: counts of items and the Medicina level. */
export interface Stock {
  count(item: string): number;
  level: number;
}

export type MakeState =
  | { ok: true }
  | { ok: false; why: 'level'; need: number }
  | { ok: false; why: 'inputs'; lacking: { item: string; count: number }[] };

/** Can this recipe be made now? Level is checked first (a greyed line shows the level). */
export function makeState(r: Recipe, have: Stock): MakeState {
  if (r.skill && have.level < r.minLevel) return { ok: false, why: 'level', need: r.minLevel };
  const lacking: { item: string; count: number }[] = [];
  for (const i of r.inputs) {
    if (have.count(i.item) < i.count) lacking.push({ item: i.item, count: i.count });
  }
  return lacking.length ? { ok: false, why: 'inputs', lacking } : { ok: true };
}

/** "Medicina 20" / "You need mel, sage and vinegar" for a recipe that can't be made. */
export function whyNot(s: MakeState, name: (item: string) => string, skillName = 'Medicina'): string {
  if (s.ok) return '';
  if (s.why === 'level') return `${skillName} ${s.need}`;
  const parts = s.lacking.map((l) => (l.count > 1 ? `${l.count} × ${name(l.item)}` : name(l.item)));
  return `You need ${list(parts)}`;
}

function list(parts: readonly string[]): string {
  if (parts.length <= 1) return parts.join('');
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Skill XP for one making (GDD §5.4: 10 + 5 per effect the remedy has). */
export function craftXp(effects: number): number {
  return 10 + 5 * Math.max(0, effects);
}

// ------------------------------------------------------------------ the economy rule

/** One price table: item id to its base value in denarii (ItemDef.value). */
export type Values = (item: string) => number;

/** What the inputs of one making cost at the best price the player can ever get (the buy floor). */
export function inputCostBest(r: Recipe, value: Values, buyFloor = 1.05): number {
  let sum = 0;
  for (const i of r.inputs) sum += value(i.item) * i.count;
  return sum * buyFloor;
}

/** What one making sells back for at the best price any vendor ever pays (the sell cap). */
export function sellBackBest(r: Recipe, value: Values, sellCap = 0.9): number {
  return value(r.output.item) * r.output.count * sellCap;
}

/** The rule: a craft sells back for at most this multiple of what its inputs cost. */
export const SELL_BACK_MAX = 2;
