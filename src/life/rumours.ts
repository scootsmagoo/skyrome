/**
 * The city's voice (docs/design/world-life.md §3.3 "Rumours", §4.9): each game day a few rumours
 * are picked for each board, each district and the crier, seeded by the day and the place, so they
 * stay put through a save and load and change at midnight.
 *
 *  - Weighted picks without replacement by an exponential race on a hash of (day, place, rumour):
 *    a rumour that drops out (its quest started) leaves the others where they were.
 *  - A hooked rumour (it offers a quest or job) shows only once mq-01 is done (STORY rule 2) and
 *    only until its quest has started; a board shows at most 2 hooks a day.
 *  - Picks are cached for the game hour and dropped whenever a quest or flag changes.
 */
import { districtAt as barksDistrictAt } from '../content/barks';
import type { Game } from '../core/Game';
import { districtAt } from '../npc/crowd/districts';
import { passes, questDone, questNotStarted } from './gates';
import type { RumourDef, RumourKind } from './types';

/** The opening (STORY rule 2): no hooks before it is done. */
export const OPENING = 'mq-01-madida-capena';

export interface RumourWhere {
  district?: string;
  board?: string;
  kind?: RumourKind;
}

/** FNV-1a: a stable 32-bit hash of a string. */
export function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Does a rumour belong to this place and kind (gates and hooks aside)? */
export function fits(r: RumourDef, where: RumourWhere): boolean {
  if (where.kind && r.kind !== where.kind) return false;
  if (where.board) {
    if (r.kind !== 'notice') return false;
    if (r.boards && !r.boards.includes(where.board)) return false;
  }
  if (where.district && r.districts && !r.districts.includes(where.district)) return false;
  return true;
}

/**
 * Pick `n` from the eligible rumours for a day and a place key (pure; tests drive it). Weighted,
 * without replacement; at most `maxHooks` hooked ones.
 */
export function pickRumours(eligible: readonly RumourDef[], n: number, day: number, key: string, maxHooks = Infinity): RumourDef[] {
  if (n <= 0 || !eligible.length) return [];
  const scored = eligible.map((r) => {
    // u in (0, 1): the smaller −ln(u)/w, the earlier the rumour comes up.
    const u = (hash32(`${day}|${key}|${r.id}`) + 0.5) / 4294967296;
    return { r, s: -Math.log(u) / (r.weight ?? 1) };
  });
  scored.sort((a, b) => a.s - b.s || (a.r.id < b.r.id ? -1 : 1));
  const out: RumourDef[] = [];
  let hooks = 0;
  for (const { r } of scored) {
    if (out.length >= n) break;
    if (r.hook) {
      if (hooks >= maxHooks) continue;
      hooks++;
    }
    out.push(r);
  }
  return out;
}

/** Today's rumours from a pool, with the game's state deciding what may be told. */
export class RumourMill {
  private cache = new Map<string, RumourDef[]>();
  private stamp = -1;

  constructor(
    private readonly game: Game,
    private readonly pool: readonly RumourDef[],
  ) {
    // What may be told changes with the story: drop the day's picks and pick again.
    const drop = () => this.cache.clear();
    for (const e of ['quest:started', 'quest:completed', 'quest:failed', 'quest:stage', 'flag:changed', 'save:loaded'] as const) game.events.on(e, drop);
  }

  /** May this rumour be told now (its gate; a hook only after the opening and before its quest)? */
  allowed(r: RumourDef): boolean {
    if (r.hook && (!questDone(this.game, OPENING) || !questNotStarted(this.game, r.hook))) return false;
    return passes(r.gate, this.game);
  }

  /** Today's picks (stable for the game day and across save/load). */
  pick(where: RumourWhere, n: number): RumourDef[] {
    const hour = Math.floor(this.game.time.totalHours);
    if (hour !== this.stamp) {
      this.stamp = hour;
      this.cache.clear();
    }
    const key = `${where.board ?? ''}|${where.district ?? ''}|${where.kind ?? ''}|${n}`;
    let hit = this.cache.get(key);
    if (!hit) {
      const eligible = this.pool.filter((r) => fits(r, where) && this.allowed(r));
      // The place seeds the picks, so each board and district has its own today.
      const place = where.board ?? where.district ?? where.kind ?? 'city';
      hit = pickRumours(eligible, n, this.game.time.dayIndex, place, where.board ? 2 : Infinity);
      this.cache.set(key, hit);
    }
    return hit;
  }
}

/**
 * The district a rumour is told in at a game point: the crowd's district (crowd/districts.ts), or
 * where that has none, the nearest of the barks' (content/barks.ts: the Capitol, the Palatine, the
 * Forum Holitorium).
 */
export function districtHere(x: number, z: number): string | null {
  const d = districtAt(x, z).id;
  if (d !== 'generic') return d;
  return barksDistrictAt(x, z);
}
