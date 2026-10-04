/**
 * Lootable bodies (docs/GDD.md §6.14): a fallen enemy can be searched with E. What it carried is
 * what it drops — its weapon and shield (unless practice arms), some of what it wore (weighted by
 * condition), and a roll of its tier's loot table with coin. Bodies stay for 3 game days.
 *
 * The contents are rolled once, when the body is first opened, from the 'combat:death' event (the
 * same hook a dedicated container module can use instead: set `game.combat.bodies.enabled = false`).
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import type { GameEvents } from '../core/Events';
import { Rng } from '../core/Rng';
import { rollLoot } from '../rpg/loot';
import type { ItemDb } from '../rpg/items';
import type { ItemDef } from '../rpg/types';
import type { ContainerItem, ContainerView } from '../ui/types';

/** Bodies persist 3 game days outdoors (§6.14). */
const PERSIST_HOURS = 72;
/** Worn clothes and armor come off a body this often (the rest is too torn or bloody). */
const WORN_CHANCE = 0.5;

/** One entry of a body's contents ('__denarii' is the purse). */
export interface BodyItem {
  id: string;
  count: number;
  condition?: number;
}

/**
 * What a body holds (pure; tests call it): the loot table's roll and coin, the weapon and shield
 * (never practice arms or fists), and each worn piece with `WORN_CHANCE`.
 */
export function bodyContents(
  e: Pick<GameEvents['combat:death'], 'loot' | 'worn' | 'weapon' | 'shield'>,
  items: ItemDb,
  rng: { next(): number; int(a: number, b: number): number; range(a: number, b: number): number; chance(p: number): boolean },
): { items: BodyItem[]; denarii: number } {
  const out = new Map<string, BodyItem>();
  const put = (id: string | undefined, count = 1, condition?: number) => {
    if (!id || !items.has(id)) return;
    const def = items.get(id)!;
    if (def.weapon?.practice || def.tags?.includes('lusoria') || def.weapon?.class === 'unarmed') return;
    const cur = out.get(id);
    if (cur) cur.count += count;
    else out.set(id, { id, count, condition });
  };
  let denarii = 0;
  if (e.loot) {
    const r = rollLoot(e.loot, 1, rng as Rng);
    denarii += r.denarii;
    for (const it of r.items) put(it.id, it.count);
  }
  // What it fought with, a little worn by the fight.
  put(e.weapon, 1, 0.55 + rng.next() * 0.35);
  put(e.shield, 1, 0.45 + rng.next() * 0.4);
  for (const w of e.worn) if (rng.next() < WORN_CHANCE) put(w, 1, 0.4 + rng.next() * 0.4);
  return { items: [...out.values()], denarii: Math.round(denarii * 16) / 16 };
}

interface Body {
  id: string;
  name: string;
  at: THREE.Vector3;
  until: number;
  death: GameEvents['combat:death'];
  contents: { items: BodyItem[]; denarii: number } | null;
  off: () => void;
}

export class Bodies {
  /** Turn off when another module provides body containers from 'combat:death'. */
  enabled = true;
  private list = new Map<string, Body>();
  private coin: ItemDef;

  constructor(
    private readonly game: Game,
    private readonly items: ItemDb,
    private readonly rnd: () => number,
  ) {
    const base = items.get('denarius-columnae');
    this.coin = { ...(base ?? { type: 'misc', description: '', weight: 0, value: 1 }), id: '__denarii', name: 'Denarii', description: 'Coin from the purse.', weight: 0, value: 1, tags: ['coin'] } as ItemDef;
  }

  /** A searchable body for a death (called by the combat system for NPC deaths). */
  add(death: GameEvents['combat:death'], name: string, position: () => THREE.Vector3Like) {
    const inter = this.game.interactions;
    if (!this.enabled || !inter) return;
    this.remove(death.actorId);
    const at = new THREE.Vector3();
    const body: Body = {
      id: death.actorId,
      name,
      at,
      until: this.game.time.totalHours + PERSIST_HOURS,
      death,
      contents: null,
      off: () => {},
    };
    body.off = inter.add({
      id: `body:${death.actorId}`,
      position: () => {
        const p = position();
        return at.set(p.x, p.y + 0.35, p.z);
      },
      reach: 2.4,
      verb: () => 'Search',
      label: () => (this.isEmpty(body) ? `${name} (empty)` : name),
      interact: () => this.open(body),
    });
    this.list.set(body.id, body);
  }

  remove(id: string) {
    const b = this.list.get(id);
    if (!b) return;
    b.off();
    this.list.delete(id);
  }

  has(id: string) {
    return this.list.has(id);
  }

  /** The body's contents (rolled on first look). */
  contents(id: string): { items: BodyItem[]; denarii: number } | null {
    const b = this.list.get(id);
    return b ? this.roll(b) : null;
  }

  /** Expire old bodies (call now and then). Returns the ids removed. */
  expire(): string[] {
    const now = this.game.time.totalHours;
    const gone: string[] = [];
    for (const b of this.list.values()) {
      if (now < b.until) continue;
      gone.push(b.id);
      this.remove(b.id);
    }
    return gone;
  }

  private roll(b: Body) {
    if (!b.contents) {
      const seed = Math.floor(this.rnd() * 1e9);
      b.contents = bodyContents(b.death, this.items, new Rng(seed));
    }
    return b.contents;
  }

  private isEmpty(b: Body) {
    return !!b.contents && !b.contents.items.length && b.contents.denarii <= 0;
  }

  private open(b: Body) {
    const ui = this.game.ui;
    const inv = this.game.player?.inventory;
    if (!inv) return;
    const view = new BodyView(b.name, this.roll(b), this.items, this.coin, (it) => {
      if (it.id === '__denarii') inv.addDenarii(it.count);
      else inv.add(it.id, it.count, { source: 'loot', condition: it.condition });
    });
    if (ui) ui.openContainer(view);
    else view.takeAll();
  }
}

/** The container panel's view of one body. */
class BodyView implements ContainerView {
  readonly owned = false;
  readonly owner = 'The dead keep nothing';
  private fns = new Set<() => void>();

  constructor(
    readonly title: string,
    private readonly c: { items: BodyItem[]; denarii: number },
    private readonly db: ItemDb,
    private readonly coin: ItemDef,
    private readonly give: (it: BodyItem) => void,
  ) {}

  items(): ContainerItem[] {
    const out: ContainerItem[] = [];
    if (this.c.denarii > 0) out.push({ itemId: '__denarii', def: { ...this.coin, name: `${fmt(this.c.denarii)} denarii` }, count: 1 });
    for (const it of this.c.items) {
      const def = this.db.get(it.id);
      if (def) out.push({ itemId: it.id, def, count: it.count });
    }
    return out;
  }

  take(itemId: string, count: number) {
    if (itemId === '__denarii') {
      if (this.c.denarii <= 0) return;
      this.give({ id: '__denarii', count: this.c.denarii });
      this.c.denarii = 0;
    } else {
      const it = this.c.items.find((x) => x.id === itemId);
      if (!it) return;
      const n = Math.min(it.count, Math.max(1, Math.floor(count)));
      this.give({ id: it.id, count: n, condition: it.condition });
      it.count -= n;
      if (it.count <= 0) this.c.items.splice(this.c.items.indexOf(it), 1);
    }
    for (const f of [...this.fns]) f();
  }

  takeAll() {
    if (this.c.denarii > 0) this.take('__denarii', 1);
    for (const it of [...this.c.items]) this.take(it.id, it.count);
  }

  onChange(fn: () => void) {
    this.fns.add(fn);
    return () => this.fns.delete(fn);
  }
}

function fmt(d: number): string {
  return Number.isInteger(d) ? String(d) : d.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
}
