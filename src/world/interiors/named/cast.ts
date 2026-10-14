/**
 * The people of the named cells (docs/modules/interiors.md, "Named cells"): the named NPCs who are in a cell
 * whenever the player is in it, with no street schedule of their own.
 *
 * - `domus-asclepiodoti`: Asclepiodotus the Chaldaean sits at his table (`reader`), always.
 * - `mithraeum-subura`: the Father of the cave, Cassius Ursus, stands before the relief (`father`), always; two
 *   initiates (soldiers) sit on the benches (`initiate-1`, `initiate-2`) only at night, 19:00 to 24:00, when
 *   the cave holds its feasts.
 *
 * They are staged with the director's `stage` (content/director.ts, which passes the cell floor's height on),
 * so they are posed, talkable named NPCs (their `dialogue` ids). `CellCast` polls once a second while the
 * player is in a cell with a cast: it brings the people in (and takes out those whose hours are over), and
 * when the player leaves the cell it puts them away again (unstages and despawns them), so nobody stays under
 * the street. A quest that wants one of them elsewhere (Asclepiodotus at the feast in the cave) stages him
 * itself and calls `holdCast(game, id)` so the flat stops claiming him; he is let go with `holdCast(game, id,
 * false)`. A man who is found already standing in another cell is not taken from it either.
 */
import type { IdleLoop } from '../../../actors/Actor';
import { stage, unstage } from '../../../content/director';
import type { Game, System } from '../../../core/Game';
import { withinHours } from '../../doors/rules';
import { DOMUS_ASCLEPIODOTI } from './asclepiodotus';
import { MITHRAEUM } from './mithraeum';

export interface CastMember {
  npc: string;
  /** The cell's place (`PLACES` of its file) they stand or sit at. */
  place: string;
  loop: IdleLoop;
  /** Only between these hours (default: always). */
  hours?: readonly [number, number];
}

export const CELL_CAST: Record<string, CastMember[]> = {
  [DOMUS_ASCLEPIODOTI]: [{ npc: 'npc-asclepiodotus', place: 'reader', loop: 'sit' }],
  [MITHRAEUM]: [
    { npc: 'npc-cassius-ursus', place: 'father', loop: 'stand' },
    { npc: 'npc-initiate-1', place: 'initiate-1', loop: 'sit', hours: [19, 24] },
    { npc: 'npc-initiate-2', place: 'initiate-2', loop: 'sit', hours: [19, 24] },
  ],
};

/** Who should be in a cell at an hour (pure). */
export function castAt(cell: string, hour: number): CastMember[] {
  return (CELL_CAST[cell] ?? []).filter((m) => !m.hours || withinHours(hour, m.hours));
}

declare module '../../../core/Game' {
  interface Game {
    cellCast?: CellCast;
  }
}

const POLL_S = 1;
const NEAR = 1.5; // m: where a placed person is taken to be in place

/** Keep a quest-staged person out of the cast (their place is theirs to say). */
export function holdCast(game: Game, npcId: string, held = true) {
  const c = game.cellCast;
  if (!c) return;
  if (held) c.held.add(npcId);
  else c.held.delete(npcId);
}

export class CellCast implements System {
  readonly name = 'cell-cast';
  readonly priority = 63;
  readonly held = new Set<string>();
  private t = 0;
  private cell: string | null = null;
  private readonly placed = new Set<string>();

  constructor(private readonly game: Game) {}

  update(dt: number) {
    this.t += dt;
    if (this.t < POLL_S) return;
    this.t = 0;
    const g = this.game;
    const inside = g.interiors?.current?.() ?? null;
    if (inside !== this.cell) {
      if (this.cell) this.clear(this.cell);
      this.cell = inside;
    }
    if (!inside || !CELL_CAST[inside]) return;
    const hour = g.time?.hour ?? 12;
    const wanted = castAt(inside, hour);
    for (const m of CELL_CAST[inside]) {
      if (!wanted.includes(m) && this.placed.has(m.npc)) this.remove(inside, m.npc);
    }
    for (const m of wanted) this.place(inside, m);
  }

  private place(cell: string, m: CastMember) {
    const g = this.game;
    if (this.held.has(m.npc)) return;
    const spot = g.interiors?.spot(cell, m.place);
    if (!spot) return;
    const have = g.population?.get(m.npc);
    if (have) {
      const there = g.interiors?.cellAt(have.position);
      // Elsewhere (the street, another cell: a quest has taken them) and not ours: leave them be.
      if (there !== cell && !this.placed.has(m.npc)) return;
      if (there === cell && Math.hypot(have.position.x - spot.position.x, have.position.z - spot.position.z) < NEAR) return;
    }
    if (stage(g, m.npc, spot.position, spot.heading ?? 0, m.loop)) this.placed.add(m.npc);
  }

  private remove(cell: string, npcId: string) {
    const g = this.game;
    this.placed.delete(npcId);
    unstage(g, npcId);
    const n = g.population?.get(npcId);
    // Only if still in this cell: a quest may have moved them on.
    if (n && g.interiors?.cellAt(n.position) === cell) g.population?.despawn(n);
  }

  private clear(cell: string) {
    for (const m of CELL_CAST[cell] ?? []) if (this.placed.has(m.npc)) this.remove(cell, m.npc);
  }

  dispose() {
    if (this.cell) this.clear(this.cell);
  }
}

/** Install the system (once per game). */
export function installCellCast(game: Game) {
  if (game.cellCast) return;
  game.cellCast = game.addSystem(new CellCast(game));
}
