/**
 * installContent(game): puts the content bible's small things into the world, where the player will
 * meet them on the golden path (GDD §17.2) and around it:
 *
 *   shrines      "Pray" at the crossroads shrines, Vortumnus, Venus Cloacina, Juturna's spring…
 *                (+5 Pietas a day, the Lares favor; AC-18)
 *   texts        "Read" the graffiti, playbills, notices and altar inscriptions (T3–T11, T13)
 *   containers   ≥ 40 street containers: slabs, cracks, bundles, amphorae, baskets, offering boxes,
 *                carts' loads, a coin in a basin; loot rolled once and remembered in the world
 *                deltas; owned ones are theft when someone sees (furtum)
 *   lamps        lanterns at the gate, shrines, stations and shops and a hung lamp every ~45 m of the
 *                corridor (the sky module's light pool, lit from dusk to dawn)
 *   cart         Dromo's cart and mule at the cart stand outside the gate, if the NPC module's props
 *                are in this build
 *
 * It is installed by the flow module's optional-module hook (src/game/optional.ts finds this file)
 * and works with whatever services exist: without interactions, UI or a world it places nothing and
 * the quests stay drivable by events.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import { LANDMARK_BY_ID } from '../data/atlas';
import type { Interactable } from '../interaction/Interactions';
import { rollLoot } from '../rpg/loot';
import type { ItemDef } from '../rpg/types';
import { toGame } from '../world/coords';
import type { BookView, ContainerView } from '../ui/types';
import { CONTAINERS, CONTAINER_STYLES, STREET_CONTAINERS, routePoint, type ContainerSpec } from './containers';
import { groundAt } from './director';
import { lampSpecs, type LampSpec } from './lamps';
import { footprintHalf, atLandmark, syncAliases } from './places';
import { installServices } from './services';
import { SHRINES, type ShrineSpec } from './shrines';
import { THINGS, type Thing } from './things';
import { ALL_WALL_TEXTS, type WallText } from './texts';

declare module '../core/Game' {
  interface Game {
    content: ContentService;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    /** The player read a wall text (graffito, playbill, notice, inscription). */
    'content:read': { id: string };
    /** A content container was opened (id = its world-delta key). */
    'content:opened': { id: string; kind: string };
  }
}

export interface ContentService {
  readonly shrines: number;
  readonly texts: number;
  /** Landmark things (a note, inscription or vista at each tier-1 landmark, AC-23). */
  readonly things: number;
  readonly containers: number;
  readonly lamps: number;
  /** Container ids placed in the street (the AC-23 count). */
  containerIds(): string[];
  dispose(): void;
}

type XZ = { x: number; z: number };

/** A place id or golden-path point as game x, z (null when the place is unknown). */
export function placeXZ(game: Game, at: string | { d: number; side: number }, dx = 0, dz = 0): XZ | null {
  if (typeof at !== 'string') {
    const [rx, rz] = routePoint(at);
    const [x, z] = toGame(rx, rz);
    return { x: x + dx, z: z + dz };
  }
  const loc = game.locations?.get(at);
  if (loc) return { x: loc.position.x + dx, z: loc.position.z + dz };
  const lm = LANDMARK_BY_ID[at];
  if (lm) {
    const [x, z] = toGame(lm.center[0], lm.center[1]);
    return { x: x + dx, z: z + dz };
  }
  return null;
}

function point(game: Game, at: string | { d: number; side: number }, dx: number, dz: number, height: number): THREE.Vector3 | null {
  const p = placeXZ(game, at, dx, dz);
  if (!p) return null;
  const g = groundAt(game, p);
  return new THREE.Vector3(p.x, g.y + height, p.z);
}

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

// ------------------------------------------------------------------ shrines

function addShrine(game: Game, spec: ShrineSpec): (() => void) | null {
  const pos = point(game, spec.id, 1.2, 0.6, 1.0);
  if (!pos || !game.interactions) return null;
  const it: Interactable = {
    id: `shrine:${spec.id}`,
    reach: 3.2,
    position: () => pos,
    verb: () => (spec.boon === 'heal-and-purify' ? 'Drink' : 'Pray'),
    label: () => spec.name,
    detail: () => (game.devotion?.canPrayAt(spec.id) === false ? 'You have prayed here today' : '+5 Pietas, the Lares favor'),
    interact: (g) => {
      const d = g.devotion;
      if (!d) return;
      d.prayAtCompitum(spec.id);
      if (spec.boon) {
        if (g.standing?.cleanliness === 'sordidus') g.standing.setCleanliness('normal');
        if (spec.boon === 'heal-and-purify') g.player?.sheet?.vitals.restore('health', 10);
      }
      g.events.emit('rpg:notify', { text: spec.line, kind: 'info' });
    },
  };
  return game.interactions.add(it);
}

// ------------------------------------------------------------------ wall texts

function bookOf(t: WallText): BookView {
  const text = t.latin ? `${t.latin}\n\n${t.text}` : t.text;
  return { title: t.title, kind: t.kind === 'inscription' || t.kind === 'tablet' ? 'tablet' : 'note', text };
}

/** Texts at the same place fan out around it so each can be aimed at. */
function addWallText(game: Game, t: WallText, index: number, siblings: number): (() => void) | null {
  const angle = (index / Math.max(1, siblings)) * Math.PI * 2 + (hash(t.id) % 100) / 400;
  const pos = point(game, t.at, Math.cos(angle) * 2.6, Math.sin(angle) * 2.6, 1.3);
  if (!pos || !game.interactions) return null;
  const it: Interactable = {
    id: `text:${t.id}`,
    reach: 2.8,
    position: () => pos,
    verb: () => 'Read',
    label: () => t.title,
    enabled: () => t.until === undefined || (game.time?.hour ?? 12) < t.until,
    interact: (g) => {
      g.ui?.openBook(bookOf(t));
      g.events.emit('content:read', { id: t.id });
    },
  };
  return game.interactions.add(it);
}

// ------------------------------------------------------------------ containers

interface Stored {
  items: { id: string; count: number }[];
  coins: number;
  emptied?: boolean;
  unlocked?: boolean;
}

/** The runtime of one container: deterministic loot, rolled on first use and kept in the world deltas. */
export class ContainerRuntime {
  private local: Stored | null = null;

  constructor(
    readonly game: Game,
    readonly spec: ContainerSpec,
    readonly position: THREE.Vector3,
  ) {}

  get style() {
    return CONTAINER_STYLES[this.spec.kind];
  }

  private read(): Stored {
    const d = this.game.deltas?.get(this.spec.id) as Partial<Stored> | undefined;
    if (d?.items) return { items: d.items.map((i) => ({ ...i })), coins: d.coins ?? 0, emptied: d.emptied, unlocked: d.unlocked };
    if (this.local) return this.local;
    const loot = rollLoot(this.spec.table, 1, new Rng(`ctn:${this.spec.id}`));
    return (this.local = { items: loot.items.map((i) => ({ ...i })), coins: loot.denarii });
  }

  private write(s: Stored) {
    this.local = s;
    s.emptied = s.items.length === 0 && s.coins <= 0;
    if (this.game.deltas) {
      this.game.deltas.merge(this.spec.id, { items: s.items, coins: s.coins, emptied: s.emptied, unlocked: s.unlocked });
      if (s.emptied) this.game.deltas.markLooted(this.spec.id);
    }
  }

  get emptied(): boolean {
    return this.game.deltas?.isLooted(this.spec.id) === true || this.read().emptied === true;
  }

  get locked(): boolean {
    const s = this.read();
    return !!this.spec.key && !s.unlocked;
  }

  /** Try the key: true when it is open now. */
  unlock(): boolean {
    if (!this.spec.key) return true;
    const s = this.read();
    if (s.unlocked) return true;
    if (!this.game.player?.inventory?.count(this.spec.key)) return false;
    s.unlocked = true;
    this.write(s);
    return true;
  }

  contents(): { id: string; def: ItemDef; count: number }[] {
    return this.read().items.flatMap((i) => {
      const def = this.game.items?.get(i.id);
      return def ? [{ id: i.id, def, count: i.count }] : [];
    });
  }

  coins(): number {
    return this.read().coins;
  }

  /** Take `count` of an item (or the coins, itemId 'denarii'). Stealing from an owned container is furtum if seen. */
  take(itemId: string, count: number): number {
    const s = this.read();
    const inv = this.game.player?.inventory;
    if (!inv) return 0;
    let value = 0;
    let taken = 0;
    if (itemId === 'denarii') {
      taken = s.coins;
      inv.addDenarii(taken);
      value = taken;
      s.coins = 0;
    } else {
      const row = s.items.find((i) => i.id === itemId);
      if (!row) return 0;
      taken = Math.min(count, row.count);
      row.count -= taken;
      s.items = s.items.filter((i) => i.count > 0);
      inv.add(itemId, taken, { source: 'container', stolenFrom: this.spec.owner });
      value = (this.game.items?.get(itemId)?.value ?? 0) * taken;
    }
    this.write(s);
    if (this.spec.owner && value > 0) this.stealing(value);
    return taken;
  }

  private stolen = 0;

  private stealing(value: number) {
    this.stolen += value;
    const pop = (this.game as unknown as { population?: { witnesses?(p: THREE.Vector3Like, r?: number): string[] } }).population;
    let witnesses: string[] = [];
    try {
      witnesses = pop?.witnesses?.(this.position, 20) ?? [];
    } catch {
      witnesses = [];
    }
    this.game.crime?.commit('furtum', { witnessed: witnesses, victimId: this.spec.owner, value: this.stolen });
  }

  takeAll() {
    for (const c of this.contents()) this.take(c.id, c.count);
    if (this.coins() > 0) this.take('denarii', 1);
  }
}

function viewOf(rt: ContainerRuntime): ContainerView {
  const subs = new Set<() => void>();
  const changed = () => subs.forEach((f) => f());
  return {
    title: rt.style.label,
    owner: rt.spec.ownerName,
    owned: !!rt.spec.owner,
    items: () => rt.contents().map((c) => ({ itemId: c.id, def: c.def, count: c.count })),
    take: (itemId, count) => {
      rt.take(itemId, count);
      changed();
    },
    takeAll: () => {
      rt.takeAll();
      changed();
    },
    onChange: (fn) => {
      subs.add(fn);
      return () => subs.delete(fn);
    },
  };
}

function addContainer(game: Game, spec: ContainerSpec, carts: Set<string>): { off: (() => void) | null; runtime: ContainerRuntime } | null {
  const style = CONTAINER_STYLES[spec.kind];
  const pos = point(game, spec.at, spec.dx ?? 0, spec.dz ?? 0, style.height);
  if (!pos) return null;
  const rt = new ContainerRuntime(game, spec, pos);
  if (!game.interactions) return { off: null, runtime: rt };
  const simple = spec.kind === 'moneta-in-fonte' || spec.kind === 'instrumentum-abiectum';
  const it: Interactable = {
    id: `container:${spec.id}`,
    reach: 2.6,
    position: () => pos,
    verb: () => style.verb,
    label: () => style.label,
    detail: () => (spec.owner ? `Owned: ${spec.ownerName ?? 'someone'}` : rt.locked ? 'Locked' : null),
    illegal: () => !!spec.owner,
    enabled: () => !rt.emptied && (!spec.needs || (typeof spec.at === 'string' && carts.has(spec.at))),
    interact: (g) => {
      if (rt.locked && !rt.unlock()) {
        g.events.emit('rpg:notify', { text: spec.locked && !spec.key ? 'Locked. You have no way to open it.' : 'Locked. It needs a key.', kind: 'info' });
        return;
      }
      g.events.emit('content:opened', { id: spec.id, kind: spec.kind });
      if (simple || !g.ui?.openContainer) {
        rt.takeAll();
        return;
      }
      g.ui.openContainer(viewOf(rt));
    },
  };
  return { off: game.interactions.add(it), runtime: rt };
}

// ------------------------------------------------------------------ the "thing" at every landmark

/** Where a landmark's thing stands: in front of its façade (at most 40 m out), a little to one side. */
export function thingPoint(thing: Thing): { x: number; y: number; z: number } | null {
  const lm = LANDMARK_BY_ID[thing.at];
  if (!lm) return null;
  const forward = Math.min(footprintHalf(lm).d + 2.5, 40);
  const side = ((hash(thing.at) % 9) - 4) * 1.1;
  return atLandmark(thing.at, forward, side);
}

function addThing(game: Game, thing: Thing): (() => void) | null {
  const base = thingPoint(thing);
  if (!base || !game.interactions) return null;
  const g = groundAt(game, base);
  const pos = new THREE.Vector3(base.x, g.y + 1.1, base.z);
  const lm = LANDMARK_BY_ID[thing.at];
  const it: Interactable = {
    id: `thing:${thing.at}`,
    reach: 3,
    position: () => pos,
    verb: () => (thing.kind === 'vista' ? 'Look' : 'Read'),
    label: () => thing.title,
    detail: () => lm?.name ?? null,
    interact: (gm) => {
      const text = thing.latin ? `${thing.latin}\n\n${thing.text}` : thing.text;
      gm.ui?.openBook({ title: thing.title, kind: thing.kind === 'inscription' ? 'tablet' : 'note', text });
      gm.events.emit('content:read', { id: `thing:${thing.at}` });
    },
  };
  return game.interactions.add(it);
}

// ------------------------------------------------------------------ lamps and the cart

function addLamp(game: Game, spec: LampSpec): { remove(): void } | null {
  const pos = point(game, spec.at, spec.dx ?? 0, spec.dz ?? 0, spec.height);
  if (!pos || !game.lights?.request) return null;
  return game.lights.request({ position: pos, intensity: spec.intensity ?? 10, distance: spec.distance ?? 12, flicker: true, night: true, color: spec.color });
}

interface PropsModule {
  makeCart?(load: 'amphorae' | 'marble'): { group: THREE.Group; wheels: THREE.Object3D[]; lamp: THREE.Object3D };
  Quadruped?: new (kind: 'mule' | 'dog') => { root: THREE.Object3D; dispose(): void };
}
const propsModules = import.meta.glob<PropsModule>('../npc/props.ts');

interface CartSpec {
  /** Place id the cart stands at (a container with `needs: 'cart'` is `at` the same id). */
  at: string;
  /** Where it points: a place id (the arch for Dromo's cart). */
  facing?: string;
  load: 'amphorae' | 'marble';
  mule: boolean;
  /** A wheel off and the whole thing canted (Cornix). */
  broken?: boolean;
  /** Offset from the place, game metres. */
  dx: number;
  dz: number;
}

/** Carts that stand still: Dromo's at the cart stand outside the gate, Cornix's with its wheel off. */
const CARTS: CartSpec[] = [
  { at: 'capena-extra', facing: 'courier-ambush', load: 'amphorae', mule: true, dx: 4, dz: 2 },
  { at: 'via-plaustrum', load: 'marble', mule: false, broken: true, dx: -2, dz: 1 },
];

/** Place the standing carts (when the NPC module's props exist); the set holds the places that got one. */
async function placeCarts(game: Game, disposers: (() => void)[], placed: Set<string>) {
  const load = Object.values(propsModules)[0];
  if (!load || !game.scene) return;
  let m: PropsModule;
  try {
    m = await load();
  } catch (err) {
    console.warn('[content] the cart props could not be loaded', err);
    return;
  }
  if (!m.makeCart) return;
  for (const spec of CARTS) {
    try {
      const stand = placeXZ(game, spec.at, spec.dx, spec.dz);
      if (!stand) continue;
      const toward = spec.facing ? placeXZ(game, spec.facing) : null;
      const heading = toward ? Math.atan2(toward.x - stand.x, toward.z - stand.z) : (hash(spec.at) % 628) / 100;
      const ground = groundAt(game, stand);
      const c = m.makeCart(spec.load);
      c.group.position.set(stand.x, ground.y, stand.z);
      c.group.rotation.y = heading;
      if (spec.broken) {
        c.group.rotation.z = 0.12;
        if (c.wheels[0]) c.wheels[0].visible = false;
      }
      if (spec.mule && m.Quadruped) {
        const mule = new m.Quadruped('mule');
        mule.root.position.set(0, 0, 3.1);
        c.group.add(mule.root);
        disposers.push(() => mule.dispose());
      }
      game.scene.add(c.group);
      disposers.push(() => c.group.removeFromParent());
      // A static blocker the size of the bed, so the cart is a thing in the street and not a ghost.
      game.physics?.addBox?.({ x: stand.x + Math.sin(heading) * 0.3, y: ground.y + 0.9, z: stand.z + Math.cos(heading) * 0.3 }, { x: 0.75, y: 0.75, z: 1.4 }, heading);
      if (game.lights?.request) {
        const at = new THREE.Vector3(stand.x + Math.sin(heading) * 1.2, ground.y + 1.8, stand.z + Math.cos(heading) * 1.2);
        const lamp = game.lights.request({ position: at, intensity: 12, distance: 10, flicker: true, night: true });
        disposers.push(() => lamp.remove());
      }
      placed.add(spec.at);
    } catch (err) {
      console.warn(`[content] the cart at ${spec.at} could not be placed`, err);
    }
  }
}

// ------------------------------------------------------------------ install

/** Place the content in the world. Idempotent; returns the service (also `game.content`). */
export function installContent(game: Game): ContentService {
  if (game.content) return game.content;
  const offs: (() => void)[] = [];
  const keep = (off: (() => void) | null | undefined) => {
    if (off) offs.push(off);
    return !!off;
  };

  // Keep the bible's aliases (castor-loculi, ludus-cavea…) on top of the world's own spots.
  if (game.locations) syncAliases(game.locations);
  const carts = new Set<string>();

  let shrines = 0;
  for (const s of SHRINES) if (keep(addShrine(game, s))) shrines++;

  let texts = 0;
  const bySite = new Map<string, WallText[]>();
  for (const t of ALL_WALL_TEXTS) bySite.set(t.at, [...(bySite.get(t.at) ?? []), t]);
  for (const list of bySite.values()) list.forEach((t, i) => keep(addWallText(game, t, i, list.length)) && texts++);

  let things = 0;
  for (const th of THINGS) if (keep(addThing(game, th))) things++;

  const ids: string[] = [];
  const street = new Set(STREET_CONTAINERS.map((c) => c.id));
  for (const spec of CONTAINERS) {
    // Interiors wait for their interior cell: the place must be registered for them (the world side does that).
    if (spec.interior && !(typeof spec.at === 'string' && game.locations?.get(`${spec.at}:interior`))) continue;
    const placed = addContainer(game, spec, carts);
    if (!placed) continue;
    keep(placed.off);
    if (street.has(spec.id)) ids.push(spec.id);
  }

  let lamps = 0;
  const handles: { remove(): void }[] = [];
  for (const l of lampSpecs()) {
    const h = addLamp(game, l);
    if (h) {
      handles.push(h);
      lamps++;
    }
  }
  const disposers: (() => void)[] = [() => handles.forEach((h) => h.remove()), installServices(game)];
  void placeCarts(game, disposers, carts);

  const service: ContentService = {
    shrines,
    texts,
    things,
    containers: ids.length,
    lamps,
    containerIds: () => [...ids],
    dispose() {
      for (const off of offs.splice(0)) off();
      for (const d of disposers.splice(0)) d();
    },
  };
  game.content = service;
  return service;
}

/** Positions of every placed street container, for tests and the debug overlay. */
export function containerPoints(game: Game): { id: string; x: number; z: number }[] {
  return STREET_CONTAINERS.flatMap((c) => {
    const p = placeXZ(game, c.at, c.dx ?? 0, c.dz ?? 0);
    return p ? [{ id: c.id, ...p }] : [];
  });
}

