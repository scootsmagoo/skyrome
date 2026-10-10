/**
 * Helpers for the SHOPS crew's data files (the '_' keeps it out of the data glob). A few goods and
 * conditions the shops lean on come from other crews (CITY VOICE: oleum, linteum, calda; SERVICES:
 * tonsus, calefactus). Until their branches merge, the shop sells without them and the service
 * runs without the condition, so this branch's data validates on its own and nothing is lost when
 * theirs arrive.
 */
import type { Appearance } from '../../../actors/appearance';
import { randomAppearance, type AvatarRole } from '../../../actors/avatar/variants';
import { Rng } from '../../../core/Rng';
import { CONDITIONS } from '../../../rpg/data/conditions';
import { ITEMS } from '../../../rpg/data/items';
import type { Effect } from '../../types';

const ITEM_IDS = new Set(ITEMS.map((i) => i.id));
const CONDITION_IDS = new Set(CONDITIONS.map((c) => c.id));

/** A shop's stock, leaving out goods that no crew has defined yet. */
export const stock = (...lines: [id: string, count: number][]): { id: string; count: number }[] =>
  lines.filter(([id]) => ITEM_IDS.has(id)).map(([id, count]) => ({ id, count }));

/** A condition effect, or nothing while the condition is not defined yet. */
export const condition = (id: string): Effect[] => (CONDITION_IDS.has(id) ? [{ kind: 'condition', id }] : []);

const looks = new Map<string, Appearance>();

/**
 * A look for a keeper the crowd role would make a man (the merchant, the artisan): a woman, made on
 * first use from the keeper's id. Use it as `get appearance() { return look(id, 'plebeian-woman'); }`.
 */
export function look(id: string, role: AvatarRole): Appearance {
  let a = looks.get(id);
  if (!a) looks.set(id, (a = randomAppearance(new Rng(`keeper:${id}`), role)));
  return a;
}
