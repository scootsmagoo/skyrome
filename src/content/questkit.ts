/**
 * Bookkeeping helpers for quest content: which actors are this stage's foes (kept in the quest's
 * saved vars as comma-separated ids, so a reload remembers them), which of them are already down,
 * and whether an 'actor:killed' / 'actor:yielded' event is about one of them or about the player.
 */
import type { QuestContext } from '../quests/types';

/** The player's actor id in 'actor:*' events. */
export const PLAYER_ID = 'player';

function list(v: unknown): string[] {
  return typeof v === 'string' && v ? v.split(',') : [];
}

/** Remember an actor id as a foe of the group `key` (e.g. 'foes', 'bout2'). */
export function addFoe(q: QuestContext, key: string, id: string | null | undefined) {
  if (!id) return;
  const ids = list(q.vars[key]);
  if (!ids.includes(id)) q.vars[key] = [...ids, id].join(',');
}

export function foes(q: QuestContext, key: string): string[] {
  return list(q.vars[key]);
}

/**
 * Is `actorId` a foe of the group? Foes are matched by id, by a stand-in id (`<npc>~foe`), or by
 * the group's named NPC ids passed as `named` (in case the combat side kept its own actor ids).
 */
export function isFoe(q: QuestContext, key: string, actorId: string, named: readonly string[] = []): boolean {
  const base = actorId.split('~')[0];
  return list(q.vars[key]).some((id) => id === actorId || id.split('~')[0] === base) || named.includes(base);
}

/** Mark a foe as beaten (killed, knocked out or yielded). True only the first time. */
export function beatFoe(q: QuestContext, key: string, actorId: string, named: readonly string[] = []): boolean {
  if (!isFoe(q, key, actorId, named)) return false;
  const base = actorId.split('~')[0];
  const down = list(q.vars[`${key}:down`]);
  if (down.includes(base)) return false;
  q.vars[`${key}:down`] = [...down, base].join(',');
  return true;
}

export function beatenCount(q: QuestContext, key: string): number {
  return list(q.vars[`${key}:down`]).length;
}

export function isPlayer(id: string | undefined): boolean {
  return id === PLAYER_ID;
}

/** Give the player one item (quest source); false without an inventory. */
export function giveItem(q: QuestContext, id: string, count = 1): boolean {
  const inv = q.game.player?.inventory;
  if (!inv) return false;
  inv.add(id, count, { source: 'quest' });
  return true;
}

/** Take items back (quest reason); false when the player doesn't have them. */
export function takeItem(q: QuestContext, id: string, count = 1): boolean {
  const inv = q.game.player?.inventory;
  if (!inv || inv.count(id) < count) return false;
  return inv.remove(id, count, { reason: 'quest' });
}

export function hasItem(q: QuestContext, id: string, count = 1): boolean {
  return (q.game.player?.inventory?.count(id) ?? 0) >= count;
}
