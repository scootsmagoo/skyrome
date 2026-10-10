/**
 * installContent(game): puts the content bible's small things into the world, where the player will
 * meet them on the golden path (GDD §17.2) and around it, each with something to see:
 *
 *   shrines      "Pray" at an altar: the crossroads shrines, Vortumnus, Venus Cloacina, Juturna's
 *                spring… (+5 Pietas a day, the Lares favor; AC-18)
 *   texts        "Read" graffiti scratched on a wall, a painted notice or a marble plaque on a wall,
 *                or (where there is no wall) a notice board, a stele, a scratched pier (T3–T11, T13)
 *   things       a stele, a notice board or a herm in front of every landmark of the v0.1 districts
 *   containers   ≥ 40 street containers, each a thing: a lifted slab, a crack stuffed with rags, a
 *                bundle, amphorae, a basket on a crate, the offering box on its stand, a basin with a
 *                coin, a tool left on a step; loot rolled once and remembered in the world deltas;
 *                owned ones are theft when someone sees (furtum)
 *   lamps        a lantern on a wall bracket or a post (or a shrine's altar fire) at the gate,
 *                shrines, stations and shops, and on house walls along the street (the light pool,
 *                lit from dusk to dawn)
 *   carts        Dromo's cart and mule beside the spawn and Cornix's cart with a wheel off, if the
 *                NPC module's props are in this build
 *
 * Placement goes through src/content/ground.ts: out of solid buildings, onto open street level, off
 * the things already placed, with walls found for notices and lamps; the visible stand-ins
 * (src/content/standins.ts) are merged per area and registered with their colliders. The world's
 * own spots (the Porta Capena builder's cart, arch and knife-men) replace the content's fallbacks
 * first (`mirrorLandmarkSpots`).
 *
 * It is installed by the flow module's optional-module hook (src/game/optional.ts finds this file)
 * and works with whatever services exist: without interactions, UI, physics or a world it places
 * what it can and the quests stay drivable by events.
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
import { CONTAINERS, CONTAINER_STYLES, STREET_CONTAINERS, routePoint, type ContainerKind, type ContainerSpec } from './containers';
import { frontOf, Placer, pushOutOfFootprints, refreshQueries, solidLandmarkAt, type Spot, type WallHit } from './ground';
import { lampSpecs, type LampSpec } from './lamps';
import { GEMELLUS_HIDEOUT, MUS_HIDEOUT, mirrorLandmarkSpots, syncAliases } from './places';
import { projectOnPath, onPath } from './route';
import { installServices } from './services';
import { SHRINES, type ShrineSpec } from './shrines';
import { LAMP_FLAME, StandIns, yawFacing, type PlaceableKind } from './standins';
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
  /** Visible stand-ins built (altars, boards, baskets, lanterns…). */
  readonly props: number;
  /** World spots that replaced the content's fallbacks (spawn-capena, courier-ambush…). */
  readonly worldSpots: string[];
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

const hash = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
};

/** Yaw that turns a free-standing thing's face (local −z) toward a point. */
function faceToward(from: XZ, to: XZ): number {
  return Math.atan2(-(to.x - from.x), -(to.z - from.z));
}

/** A point `out` metres in front of a thing's face (local −z) and `h` above its foot. */
function inFront(s: Spot, rotY: number, out: number, h: number): THREE.Vector3 {
  return new THREE.Vector3(s.x - Math.sin(rotY) * out, s.y + h, s.z - Math.cos(rotY) * out);
}

/** A local offset of a thing (rotation.y = rotY) in world space, added to its foot. */
function local(s: Spot, rotY: number, v: THREE.Vector3Like): THREE.Vector3 {
  const c = Math.cos(rotY);
  const n = Math.sin(rotY);
  return new THREE.Vector3(s.x + v.x * c + v.z * n, s.y + v.y, s.z - v.x * n + v.z * c);
}

/** Who the thing faces: the golden path when it is near (the walker), else away from `fallback` (a building) or toward it. */
function viewer(p: XZ, away?: XZ): XZ {
  const pr = projectOnPath(p.x / 0.6, p.z / 0.6);
  if (pr.off < 40) {
    const [rx, rz] = onPath(pr.d, 0);
    const [x, z] = toGame(rx, rz);
    if (Math.hypot(x - p.x, z - p.z) > 1) return { x, z };
  }
  if (away) return { x: p.x * 2 - away.x, z: p.z * 2 - away.z };
  const a = (hash(`${p.x},${p.z}`) % 628) / 100;
  return { x: p.x + Math.cos(a), z: p.z + Math.sin(a) };
}

/**
 * Turn a free-standing thing so that the spot in front of its face (where its prompt is and where
 * the reader stands) is open street: the preferred heading first, then the other three quarters.
 */
function orient(ctx: Ctx, s: Spot, rotY: number, out: number): number {
  return tryOrient(ctx, s, rotY, out) ?? rotY;
}

function tryOrient(ctx: Ctx, s: Spot, rotY: number, out: number): number | null {
  for (const turn of [0, Math.PI / 2, -Math.PI / 2, Math.PI]) {
    const r = rotY + turn;
    const fx = s.x - Math.sin(r) * (out + 0.5);
    const fz = s.z - Math.cos(r) * (out + 0.5);
    if (solidLandmarkAt(fx, fz, 0.3)) continue;
    if (ctx.placer.levelAt(fx, fz, 0.3, 0) === null) continue;
    return r;
  }
  return null;
}

/**
 * A spot for a free-standing thing read from the front: free itself, with open street in front of
 * its face. Steps away from `away` (the building it belongs to) while cramped.
 */
function standFree(ctx: Ctx, x: number, z: number, out: number, claim: number, face: (s: Spot) => number, away?: XZ): { s: Spot; rotY: number } | null {
  let px = x;
  let pz = z;
  let first: { s: Spot; rotY: number } | null = null;
  for (let i = 0; i < 6; i++) {
    const s = ctx.placer.tryFind(px, pz, { clearance: 0.45, claim, away });
    if (!s) break;
    const pref = face(s);
    const r = tryOrient(ctx, s, pref, out);
    if (r !== null) return { s, rotY: r };
    first ??= { s, rotY: pref };
    const dx = away ? s.x - away.x : Math.cos(i * 2.1);
    const dz = away ? s.z - away.z : Math.sin(i * 2.1);
    const l = Math.hypot(dx, dz) || 1;
    px = s.x + (dx / l) * 1.6;
    pz = s.z + (dz / l) * 1.6;
  }
  return first;
}

/** Everything one install shares. */
interface Ctx {
  game: Game;
  placer: Placer;
  props: StandIns;
  /** World spots that replaced fallbacks. */
  world: Set<string>;
  /** Altars placed at shrines (their lamps burn on them; offering boxes stand beside them). */
  altars: Map<string, { s: Spot; rotY: number }>;
  /** Carts placed (or provided by the world), by place id. */
  carts: Map<string, CartPose>;
  /** Removers of the interactables placed. */
  offs: (() => void)[];
}

function add(ctx: Ctx, kind: PlaceableKind, s: Spot, rotY: number, claim: number, opts: { variant?: number; scale?: number } = {}) {
  ctx.props.add(kind, s.x, s.y, s.z, rotY, opts);
  if (claim > 0) ctx.placer.claim(s.x, s.z, claim);
}

/** A place buried in the world's geometry (a district block with no streets yet): nothing goes there for now. */
function buried(what: string): null {
  console.warn(`[content] no open street near ${what}: not placed until the world has one`);
  return null;
}

// ------------------------------------------------------------------ shrines

/** Shrines the world builds itself (the Porta Capena builder's spring): no altar of ours there. */
const WORLD_SHRINES: Record<string, string> = { 'fons-mercurii': 'capena-mercury-spring' };

function addShrine(ctx: Ctx, spec: ShrineSpec): (() => void) | null {
  const { game, placer } = ctx;
  const anchor = placeXZ(game, spec.id);
  if (!anchor) return null;
  let pos: THREE.Vector3;
  const own = WORLD_SHRINES[spec.id] && ctx.world.has(WORLD_SHRINES[spec.id]);
  if (own) {
    const g = placer.groundY(anchor.x, anchor.z);
    pos = new THREE.Vector3(anchor.x, g + 1.0, anchor.z);
  } else {
    const lm = LANDMARK_BY_ID[spec.id];
    const centre = lm ? (() => { const [x, z] = toGame(lm.center[0], lm.center[1]); return { x, z }; })() : undefined;
    // A shrine that is a building (the Lacus Curtius, Janus' shrine): the altar stands before it.
    const start = lm ? frontOf(lm, 1.4) : anchor;
    const s = placer.tryFind(start.x, start.z, { clearance: 0.5, claim: 0.85, away: centre });
    if (!s) return buried(spec.id);
    const rotY = faceToward(s, viewer(s, centre));
    add(ctx, 'altar', s, rotY, 0.85, { variant: hash(spec.id) % 2 });
    ctx.altars.set(spec.id, { s, rotY });
    pos = new THREE.Vector3(s.x, s.y + 1.32, s.z);
  }
  if (!game.interactions) return null;
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

/** How a text looks on a wall and standing free, the height of its middle on a wall, and where its prompt goes. */
const TEXT_LOOK: Record<WallText['kind'], { wall: PlaceableKind; free: PlaceableKind; h: number }> = {
  graffito: { wall: 'wall-graffito', free: 'pier', h: 1.4 },
  dipinto: { wall: 'wall-notice', free: 'album', h: 1.55 },
  notice: { wall: 'wall-notice', free: 'album', h: 1.55 },
  inscription: { wall: 'wall-plaque', free: 'stele', h: 1.55 },
  tablet: { wall: 'wall-plaque', free: 'stele', h: 1.4 },
  sign: { wall: 'signboard', free: 'album', h: 2.55 },
};

/** Free-standing look: where the prompt is in front of it (out, height). */
const FREE_PROMPT: Partial<Record<PlaceableKind, [number, number]>> = { album: [0.5, 1.4], stele: [0.5, 1.1], pier: [0.62, 1.3], herm: [0.5, 1.25] };

/** Slots on the nearest wall around a point, 1.3 m apart, each with a free spot to stand and read. */
function wallSlots(ctx: Ctx, s: Spot, n: number, h: number, maxDist: number): WallHit[] {
  const { placer } = ctx;
  const walls = placer.walls(s.x, s.y + h, s.z, maxDist);
  const out: WallHit[] = [];
  for (const base of walls.slice(0, 3)) {
    const tx = -base.normal.z;
    const tz = base.normal.x;
    for (let i = 0; out.length < n && i < n + 4; i++) {
      const off = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * 1.3;
      const p = { x: base.point.x + tx * off, y: s.y + h, z: base.point.z + tz * off };
      const w = placer.wallAt(p, base.normal, 1);
      if (!w || w.normal.dot(base.normal) < 0.8) continue;
      if (out.some((o) => o.point.distanceTo(w.point) < 1.15)) continue;
      // Someone must be able to stand in front of it at street level.
      const stand = placer.levelAt(w.point.x + w.normal.x * 0.9, w.point.z + w.normal.z * 0.9, 0.3, 0.2);
      if (stand === null || Math.abs(stand - s.y) > 1.2) continue;
      w.point.y = stand + h;
      out.push(w);
    }
    if (out.length >= n) break;
  }
  return out;
}

function addTextsAt(ctx: Ctx, site: string, texts: WallText[]): number {
  const { game, placer } = ctx;
  const anchor = placeXZ(game, site);
  if (!anchor) return 0;
  const s0 = placer.tryFind(anchor.x, anchor.z, { claim: 0.2 });
  if (!s0) return buried(site) ?? 0;
  // Signs hang high; the rest share one wall at reading height.
  const signs = texts.filter((t) => t.kind === 'sign');
  const rest = texts.filter((t) => t.kind !== 'sign');
  const slots = new Map<WallText, { wall?: WallHit }>();
  const low = wallSlots(ctx, s0, rest.length, TEXT_LOOK.notice.h, 7);
  rest.forEach((t, i) => slots.set(t, { wall: low[i] }));
  const high = wallSlots(ctx, s0, signs.length, TEXT_LOOK.sign.h, 7);
  signs.forEach((t, i) => slots.set(t, { wall: high[i] }));
  // Several notices and graffiti with no building to go on: a stretch of wall of their own.
  const homeless = texts.filter((t) => !slots.get(t)?.wall && t.kind !== 'inscription' && t.kind !== 'tablet');
  if (homeless.length >= 2) {
    const len = Math.max(2.2, homeless.length * 1.3 + 0.5);
    const s = placer.find(s0.x, s0.z, { clearance: 0.6, claim: len / 2 + 0.4 });
    const rotY = orient(ctx, s, faceToward(s, viewer(s, anchor)), 0.7);
    ctx.props.addWall(s.x, s.y, s.z, rotY, len);
    placer.claim(s.x, s.z, len / 2 + 0.4);
    const normal = new THREE.Vector3(-Math.sin(rotY), 0, -Math.cos(rotY));
    homeless.forEach((t, i) => {
      const h = t.kind === 'sign' ? 2.12 : TEXT_LOOK.notice.h - (i % 2) * 0.25;
      const point = local(s, rotY, { x: (i - (homeless.length - 1) / 2) * 1.3, y: h, z: -0.2 });
      slots.set(t, { wall: { point, normal: normal.clone(), distance: 0 } });
    });
  }
  let placed = 0;
  let free = 0;
  for (const t of texts) {
    const look = TEXT_LOOK[t.kind];
    const wall = slots.get(t)?.wall;
    let pos: THREE.Vector3;
    if (wall) {
      // On the wall: the slot is already at the text's height (a sign hangs above the door).
      const rotY = yawFacing(wall.normal.x, wall.normal.z);
      ctx.props.add(look.wall, wall.point.x, wall.point.y, wall.point.z, rotY);
      const out = t.kind === 'sign' ? 0.55 : 0.5;
      pos = new THREE.Vector3(wall.point.x + wall.normal.x * out, wall.point.y - (t.kind === 'sign' ? 0.55 : 0), wall.point.z + wall.normal.z * out);
      placer.claim(wall.point.x + wall.normal.x * 0.4, wall.point.z + wall.normal.z * 0.4, 0.3);
    } else {
      // No wall: a board, a stele or a pier of its own, a step apart from its neighbours.
      const a = ((free++ * 2.4 + (hash(site) % 7)) / 7) * Math.PI * 2;
      const [out, h] = FREE_PROMPT[look.free] ?? [0.5, 1.3];
      const at = standFree(ctx, s0.x + Math.cos(a) * 1.6, s0.z + Math.sin(a) * 1.6, out, 0.75, (q) => faceToward(q, viewer(q, anchor)), anchor);
      if (!at) continue;
      const { s, rotY } = at;
      add(ctx, look.free, s, rotY, 0.75);
      pos = inFront(s, rotY, out, h);
    }
    if (!game.interactions) continue;
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
    ctx.offs.push(game.interactions.add(it));
    placed++;
  }
  return placed;
}

// ------------------------------------------------------------------ containers

interface Stored {
  items: { id: string; count: number }[];
  coins: number;
  emptied?: boolean;
  unlocked?: boolean;
  /** The theft has been reported to the law (once per container). */
  reported?: boolean;
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

  /** The container's state: the world deltas are the truth (a new game clears them); the local copy is only for worlds without deltas. */
  private read(): Stored {
    const deltas = this.game.deltas;
    const d = deltas?.get(this.spec.id) as Partial<Stored> | undefined;
    if (d?.items) return { items: d.items.map((i) => ({ ...i })), coins: d.coins ?? 0, emptied: d.emptied, unlocked: d.unlocked, reported: d.reported };
    if (!deltas && this.local) return this.local;
    const loot = rollLoot(this.spec.table, 1, new Rng(`ctn:${this.spec.id}`));
    const fresh: Stored = { items: loot.items.map((i) => ({ ...i })), coins: loot.denarii };
    if (!deltas) this.local = fresh;
    return fresh;
  }

  private write(s: Stored) {
    if (!this.game.deltas) this.local = s;
    // A storage chest (spec.store) is never "emptied" for good: the player keeps putting things in.
    s.emptied = !this.spec.store && s.items.length === 0 && s.coins <= 0;
    if (this.game.deltas) {
      this.game.deltas.merge(this.spec.id, { items: s.items, coins: s.coins, emptied: s.emptied, unlocked: s.unlocked, reported: s.reported });
      if (s.emptied) this.game.deltas.markLooted(this.spec.id);
    }
  }

  get emptied(): boolean {
    if (this.spec.store) return false;
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

  /** Take `count` of an item (or the coins, itemId 'denarii'). Taking from an owned container is furtum if seen: once per container, for what it held. */
  take(itemId: string, count: number): number {
    const s = this.read();
    const inv = this.game.player?.inventory;
    if (!inv) return 0;
    if (this.spec.owner) this.report(s);
    let taken = 0;
    if (itemId === 'denarii') {
      taken = s.coins;
      inv.addDenarii(taken);
      s.coins = 0;
    } else {
      const row = s.items.find((i) => i.id === itemId);
      if (!row) return 0;
      taken = Math.min(count, row.count);
      row.count -= taken;
      s.items = s.items.filter((i) => i.count > 0);
      inv.add(itemId, taken, { source: 'container', stolenFrom: this.spec.owner });
    }
    this.write(s);
    return taken;
  }

  /** The theft is booked once, on the first thing taken, for the value of everything inside (§14.1: twice that in bounty, by the crime table). */
  private report(s: Stored) {
    if (s.reported) return;
    s.reported = true;
    const value = s.coins + s.items.reduce((v, i) => v + (this.game.items?.get(i.id)?.value ?? 0) * i.count, 0);
    const pop = (this.game as unknown as { population?: { witnesses?(p: THREE.Vector3Like, r?: number): string[] } }).population;
    let witnesses: string[] = [];
    try {
      witnesses = pop?.witnesses?.(this.position, 20) ?? [];
    } catch {
      witnesses = [];
    }
    this.game.crime?.commit('furtum', { witnessed: witnesses, victimId: this.spec.owner, value });
  }

  /** Put `count` of an item from the player's pack into a storage chest (spec.store). Returns how many went in. */
  store(itemId: string, count: number): number {
    const inv = this.game.player?.inventory;
    if (!this.spec.store || !inv) return 0;
    // Only whole, honestly-owned goods: a worn blade would come out new, and stolen goods are marked.
    const whole = inv.list((d, st) => d.id === itemId && !st.stolenFrom && (st.condition ?? 1) >= 1).reduce((n, e) => n + e.stack.count, 0);
    const n = Math.min(count, whole);
    if (n <= 0 || !inv.remove(itemId, n, { reason: 'given' })) return 0;
    const s = this.read();
    const row = s.items.find((i) => i.id === itemId);
    if (row) row.count += n;
    else s.items.push({ id: itemId, count: n });
    this.write(s);
    return n;
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
    // A storage chest also shows the player's pack and takes things (spec.store).
    ...(rt.spec.store
      ? {
          playerItems: () => (rt.game.player?.inventory?.list((d, st) => !d.questItem && !st.stolenFrom && (st.condition ?? 1) >= 1) ?? []).filter((e) => !e.equipped).map((e) => ({ itemId: e.def.id, def: e.def, count: e.stack.count })),
          store: (itemId: string, count: number) => {
            rt.store(itemId, count);
            changed();
          },
        }
      : {}),
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


/** What a container looks like, how much room it claims, and its prompt (height, or out-and-height in front). */
const CONTAINER_LOOK: Record<ContainerKind, { kind: PlaceableKind; claim: number; h: number; out?: number }> = {
  'latebra-silicis': { kind: 'slab', claim: 0.55, h: 0.32 },
  'fissura-muri': { kind: 'wall-stub', claim: 0.95, h: 1.32, out: 0.05 },
  'sarcina-abiecta': { kind: 'bundle', claim: 0.6, h: 0.6 },
  'amphora-stack': { kind: 'amphora_stack', claim: 0.75, h: 0.95 },
  'corbis-mercatoris': { kind: 'basket-crate', claim: 0.55, h: 0.85 },
  'cista-insulae': { kind: 'crate', claim: 0.5, h: 0.62 },
  'arca-tabernae': { kind: 'crate', claim: 0.5, h: 0.62 },
  'arca-compiti': { kind: 'offering-box', claim: 0.5, h: 1.06 },
  'cella-ludi': { kind: 'crate', claim: 0.5, h: 0.62 },
  'silt-niche': { kind: 'silt-heap', claim: 0.7, h: 0.45 },
  'cista-muris': { kind: 'crate', claim: 0.5, h: 0.62 },
  'cista-regis-cloacae': { kind: 'loot-heap', claim: 0.9, h: 0.75 },
  plaustrum: { kind: 'crate', claim: 0, h: 1.05 },
  'moneta-in-fonte': { kind: 'trough', claim: 0.95, h: 0.75 },
  'instrumentum-abiectum': { kind: 'tool-step', claim: 0.5, h: 0.5 },
  fasciculus: { kind: 'bundle', claim: 0.6, h: 0.6 },
};

/** Where a container's prompt is (and the stand-in that shows it). */
function containerPoint(ctx: Ctx, spec: ContainerSpec): THREE.Vector3 | null {
  const { game, placer } = ctx;
  const style = CONTAINER_LOOK[spec.kind];
  // On a cart: at the cart's side or tail, outside its blocker (the prompt exists once the cart does).
  if (spec.needs === 'cart' && typeof spec.at === 'string') {
    const cart = ctx.carts.get(spec.at);
    if (!cart) {
      const p = placeXZ(game, spec.at, spec.dx ?? 0, spec.dz ?? 0);
      return p ? new THREE.Vector3(p.x, placer.groundY(p.x, p.z) + style.h, p.z) : null;
    }
    const tail = spec.kind === 'fasciculus';
    // The world's cart: its spot is beside the load; the bundle a step along.
    if (cart.world) return new THREE.Vector3(cart.x + (tail ? 1.3 : 0), cart.y + (tail ? 0.9 : 1.05), cart.z);
    const v = tail ? new THREE.Vector3(0, 0.95, -1.55) : new THREE.Vector3(1.2, 1.05, 0.2);
    return local(cart, cart.heading, v);
  }
  let start = placeXZ(game, spec.at, spec.dx ?? 0, spec.dz ?? 0);
  if (!start) return null;
  // A coin in the basin of a spring the world builds itself (the Porta Capena builder's): no basin of ours.
  const worldSpring = typeof spec.at === 'string' && WORLD_SHRINES[spec.at] && ctx.world.has(WORLD_SHRINES[spec.at]);
  if (spec.kind === 'moneta-in-fonte' && worldSpring) {
    const spring = placeXZ(game, spec.at as string)!;
    const x = spring.x + 1.3;
    return new THREE.Vector3(x, placer.groundY(x, spring.z) + 0.6, spring.z);
  }
  // The offering box stands beside the shrine's altar, far enough apart to aim at either.
  const altar = typeof spec.at === 'string' && spec.kind === 'arca-compiti' ? ctx.altars.get(spec.at) : undefined;
  if (altar) start = { x: altar.s.x + Math.cos(altar.rotY) * 1.7, z: altar.s.z - Math.sin(altar.rotY) * 1.7 };
  if (spec.kind === 'fissura-muri') {
    // A crack in a real wall when there is one close by.
    const s0 = placer.find(start.x, start.z, { claim: 0.2 });
    const w = wallSlots(ctx, s0, 1, 0.9, 3.5)[0];
    if (w) {
      ctx.props.add('wall-crack', w.point.x, w.point.y, w.point.z, yawFacing(w.normal.x, w.normal.z));
      placer.claim(w.point.x + w.normal.x * 0.4, w.point.z + w.normal.z * 0.4, 0.35);
      return new THREE.Vector3(w.point.x + w.normal.x * 0.45, w.point.y + 0.05, w.point.z + w.normal.z * 0.45);
    }
  }
  const s = placer.tryFind(start.x, start.z, { clearance: Math.min(0.6, style.claim), claim: style.claim });
  if (!s) return buried(spec.id);
  const rotY = altar ? altar.rotY : style.out !== undefined ? orient(ctx, s, faceToward(s, viewer(s)), style.out + 0.3) : faceToward(s, viewer(s));
  add(ctx, style.kind, s, rotY, style.claim, { variant: hash(spec.id) % 3 });
  return style.out !== undefined ? inFront(s, rotY, style.out, style.h) : new THREE.Vector3(s.x, s.y + style.h, s.z);
}

function addContainer(ctx: Ctx, spec: ContainerSpec): { off: (() => void) | null; runtime: ContainerRuntime } | null {
  const { game } = ctx;
  const style = CONTAINER_STYLES[spec.kind];
  const pos = containerPoint(ctx, spec);
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
    enabled: () => !rt.emptied && (!spec.needs || (typeof spec.at === 'string' && ctx.carts.get(spec.at)?.ready === true)),
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

/** Where a landmark's thing stands: in front of its façade, 2.5 m beyond the footprint, a little to one side, out of any building. */
export function thingPoint(thing: Thing): { x: number; y: number; z: number } | null {
  const lm = LANDMARK_BY_ID[thing.at];
  if (!lm) return null;
  const side = ((hash(thing.at) % 9) - 4) * 1.1;
  const f = frontOf(lm, 2.5, side);
  const p = pushOutOfFootprints(f.x, f.z);
  return { x: p.x, y: 0, z: p.z };
}

const THING_LOOK: Record<Thing['kind'], PlaceableKind> = { inscription: 'stele', note: 'album', vista: 'herm' };

function addThing(ctx: Ctx, thing: Thing): (() => void) | null {
  const { game, placer } = ctx;
  const base = thingPoint(thing);
  if (!base) return null;
  const lm = LANDMARK_BY_ID[thing.at];
  const [cx, cz] = toGame(lm.center[0], lm.center[1]);
  const kind = THING_LOOK[thing.kind];
  const [out, h] = FREE_PROMPT[kind] ?? [0.5, 1.2];
  // It faces away from the building, toward whoever comes to it.
  const at = standFree(ctx, base.x, base.z, out, 0.75, (s) => faceToward(s, { x: s.x * 2 - cx, z: s.z * 2 - cz }), { x: cx, z: cz });
  if (!at) return buried(thing.at);
  const { s, rotY } = at;
  add(ctx, kind, s, rotY, 0.75, { variant: hash(thing.at) % 2 });
  const pos = inFront(s, rotY, out, h);
  if (!game.interactions) return null;
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

// ------------------------------------------------------------------ lamps

/** Something to burn in, then a light: the altar's fire, a lantern on a wall bracket, or a lantern on a post. */
function addLamp(ctx: Ctx, spec: LampSpec): { remove(): void } | null {
  const { game, placer } = ctx;
  if (!game.lights?.request) return null;
  const light = (p: THREE.Vector3Like) => game.lights.request({ position: p, intensity: spec.intensity ?? 10, distance: spec.distance ?? 12, flicker: true, night: true, color: spec.color });
  if (spec.mount === 'altar' && typeof spec.at === 'string') {
    const altar = ctx.altars.get(spec.at);
    if (altar) return light({ x: altar.s.x, y: altar.s.y + spec.height, z: altar.s.z });
  }
  const anchor = placeXZ(game, spec.at, spec.dx ?? 0, spec.dz ?? 0);
  if (!anchor) return null;
  const s = placer.tryFind(anchor.x, anchor.z, { clearance: 0.3, claim: 0.3 });
  if (!s) return null;
  const reach = spec.wallOnly ?? 2.2;
  const wall = placer.probing ? placer.walls(s.x, s.y + 2.45, s.z, reach, 16)[0] : undefined;
  if (wall) {
    const rotY = yawFacing(wall.normal.x, wall.normal.z);
    const mount = { x: wall.point.x, y: s.y + 2.45, z: wall.point.z };
    ctx.props.add('wall-lamp', mount.x, mount.y, mount.z, rotY);
    return light(local(mount, rotY, LAMP_FLAME['wall-lamp']));
  }
  // Nobody hangs a lamp over open ground; without a probe-able world (tests) the street lamps stay as data.
  if (spec.wallOnly !== undefined) return null;
  const rotY = faceToward(s, viewer(s)) + Math.PI; // the arm reaches over the street
  add(ctx, 'lantern-post', s, rotY, 0.3);
  return light(local(s, rotY, LAMP_FLAME['lantern-post']));
}

// ------------------------------------------------------------------ carts

interface PropsModule {
  makeCart?(load: 'amphorae' | 'marble'): { group: THREE.Group; wheels: THREE.Object3D[]; lamp: THREE.Object3D };
  Quadruped?: new (kind: 'mule' | 'dog') => { root: THREE.Object3D; dispose(): void };
}
const propsModules = import.meta.glob<PropsModule>('../npc/props.ts');

interface CartSpec {
  /** Place id the cart stands at (a container with `needs: 'cart'` is `at` the same id). */
  at: string;
  /** Where it points: a place id (down the street for Dromo's cart). */
  facing?: string;
  load: 'amphorae' | 'marble';
  mule: boolean;
  /** A wheel off and the whole thing canted (Cornix). */
  broken?: boolean;
  /** Offset from the place, game metres. */
  dx: number;
  dz: number;
}

interface CartPose extends Spot {
  heading: number;
  /** The cart is in the world (its load can be searched). */
  ready: boolean;
  /** A landmark builder's own cart (its spot is the place to search it from). */
  world?: boolean;
}

/** Carts that stand still: Dromo's at the night-cart stand, Cornix's with its wheel off. */
const CARTS: CartSpec[] = [
  { at: 'night-cart', facing: 'courier-ambush', load: 'amphorae', mule: true, dx: 0, dz: 0 },
  { at: 'via-plaustrum', load: 'marble', mule: false, broken: true, dx: -2, dz: 1 },
];

/** Where each cart stands (synchronously, so its load's prompt and the room it takes are known). */
function cartPoses(ctx: Ctx) {
  for (const spec of CARTS) {
    // The Porta Capena builder brings its own cart: its load is searchable at the world's spot.
    if (spec.at === 'night-cart' && ctx.world.has('night-cart')) {
      const p = placeXZ(ctx.game, spec.at);
      if (p) ctx.carts.set(spec.at, { x: p.x, y: ctx.placer.groundY(p.x, p.z), z: p.z, heading: 0, ready: true, world: true });
      continue;
    }
    const stand = placeXZ(ctx.game, spec.at, spec.dx, spec.dz);
    if (!stand) continue;
    const s = ctx.placer.find(stand.x, stand.z, { clearance: 0.8, claim: 2.4 });
    const toward = spec.facing ? placeXZ(ctx.game, spec.facing) : null;
    const heading = toward ? Math.atan2(toward.x - s.x, toward.z - s.z) : (hash(spec.at) % 628) / 100;
    ctx.carts.set(spec.at, { ...s, heading, ready: false });
  }
}

/** Build the standing carts (when the NPC module's props exist). */
async function placeCarts(ctx: Ctx, disposers: (() => void)[]) {
  const { game } = ctx;
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
    const pose = ctx.carts.get(spec.at);
    if (!pose || pose.ready) continue;
    try {
      const c = m.makeCart(spec.load);
      c.group.position.set(pose.x, pose.y, pose.z);
      c.group.rotation.y = pose.heading;
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
      game.physics?.addBox?.({ x: pose.x + Math.sin(pose.heading) * 0.3, y: pose.y + 0.9, z: pose.z + Math.cos(pose.heading) * 0.3 }, { x: 0.75, y: 0.75, z: 1.4 }, pose.heading);
      if (game.lights?.request) {
        const lamp = game.lights.request({ position: local(pose, pose.heading, { x: 0, y: 1.8, z: 1.2 }), intensity: 12, distance: 10, flicker: true, night: true });
        disposers.push(() => lamp.remove());
      }
      pose.ready = true;
    } catch (err) {
      console.warn(`[content] the cart at ${spec.at} could not be placed`, err);
    }
  }
}

// ------------------------------------------------------------------ people who come and go

/** Named people quests move around (the opening's courier): reset to their home on a New Game. */
const SCRIPTED_NPCS = ['npc-festus'];

interface PopulationLike {
  deadNamed?: Set<string>;
  get?(id: string): { dead?: boolean } | undefined;
  despawn?(npc: unknown): void;
}

/**
 * Keep the population in step with the story when a game starts: a New Game brings back everyone
 * the last playthrough killed (Festus knifed under the arch, Mus…), and a loaded save takes away
 * whoever died in it (the world deltas record deaths). The NPC module keeps its dead in
 * `deadNamed`; a corpse left from another game is removed so the person spawns again by schedule.
 */
export function syncNamedDeaths(game: Game, kind: 'new' | 'load' | 'quick' = 'load') {
  const pop = (game as unknown as { population?: PopulationLike }).population;
  if (!pop) return;
  // A New Game: the people the opening moves about (Festus, knifed down the street) start over
  // where their day begins, so they are despawned and the population module spawns them afresh.
  if (kind === 'new') {
    for (const id of SCRIPTED_NPCS) {
      const npc = pop.get?.(id);
      if (npc && !npc.dead && !game.deltas?.isDead(id)) {
        try {
          pop.despawn?.(npc);
        } catch (err) {
          console.warn(`[content] could not reset ${id}`, err);
        }
      }
    }
  }
  const named = (id: string) => game.npcs?.has?.(id) ?? id.startsWith('npc-');
  const ids = new Set([...(pop.deadNamed ?? [])].filter(named));
  for (const def of game.npcs?.all?.() ?? []) if (game.deltas?.isDead(def.id)) ids.add(def.id);
  for (const id of ids) {
    const dead = game.deltas?.isDead(id) === true;
    const npc = pop.get?.(id);
    try {
      if (!dead) {
        pop.deadNamed?.delete(id);
        if (npc?.dead) pop.despawn?.(npc);
      } else {
        pop.deadNamed?.add(id);
        if (npc && !npc.dead) pop.despawn?.(npc);
      }
    } catch (err) {
      console.warn(`[content] could not bring ${id} in step with the story`, err);
    }
  }
}

/** Mus is in his corner only while the player is on his trail and he has not been dealt with (places.ts MUS_HIDEOUT). */
export function syncMusHideout(game: Game) {
  const loc = game.locations;
  if (!loc) return;
  const flags = game.quests?.flags;
  const st = game.quests?.status?.('mq-02-tabella');
  const hunting = !!st?.running && st.stage === 'mus';
  const want = !flags?.get('mus-fate') && (flags?.get('hideout-known') === true || hunting);
  const has = !!loc.get(MUS_HIDEOUT.id);
  if (want && !has) loc.add(MUS_HIDEOUT);
  else if (!want && has) loc.remove?.(MUS_HIDEOUT.id);
  // Gemellus hides in Tryphon's back room from the Lemuria rite until he hands over the key (mq-03).
  const m3 = game.quests?.status?.('mq-03-lemuria');
  const hiding = !!m3?.running && (m3.stage === 'clues' || m3.stage === 'gemellus');
  const hasG = !!loc.get(GEMELLUS_HIDEOUT.id);
  if (hiding && !hasG) loc.add(GEMELLUS_HIDEOUT);
  else if (!hiding && hasG) loc.remove?.(GEMELLUS_HIDEOUT.id);
}

/**
 * Keep the spots where people stand clear of altars, boards and baskets: every place a schedule, a
 * patrol or the opening puts somebody (the NPC module spawns them there) is claimed first.
 */
function claimPeoplesPlaces(ctx: Ctx) {
  const ids = new Set<string>(['spawn-capena', 'night-cart-courier', 'night-cart-driver', 'courier-ambush', 'capena-grassator-a', 'capena-grassator-b']);
  for (const d of ctx.game.npcs?.all?.() ?? []) {
    if (d.home) ids.add(d.home);
    for (const e of d.schedule ?? []) {
      ids.add(e.at);
      for (const r of e.route ?? []) ids.add(r);
    }
  }
  for (const id of ids) {
    if (LANDMARK_BY_ID[id]) continue; // a whole landmark: people stand wherever its builder lets them
    const l = ctx.game.locations?.get(id);
    if (l && l.radius <= 25) ctx.placer.claim(l.position.x, l.position.z, Math.min(1.4, l.radius));
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

  // The world's spots (the Porta Capena builder's cart and arch, the Ludus' armory…) replace the
  // content's fallbacks, and the bible's aliases follow them.
  const world = mirrorLandmarkSpots(game.landmarks, game.locations);
  if (game.locations) syncAliases(game.locations, world);
  // The world was built behind the loading screen: let the physics queries see it before probing.
  refreshQueries(game);
  const ctx: Ctx = { game, placer: new Placer(game), props: new StandIns(), world, altars: new Map(), carts: new Map(), offs };
  claimPeoplesPlaces(ctx);
  cartPoses(ctx);

  let shrines = 0;
  for (const s of SHRINES) if (keep(addShrine(ctx, s)) || ctx.altars.has(s.id)) shrines++;

  let texts = 0;
  const bySite = new Map<string, WallText[]>();
  for (const t of ALL_WALL_TEXTS) bySite.set(t.at, [...(bySite.get(t.at) ?? []), t]);
  for (const [site, list] of bySite) texts += addTextsAt(ctx, site, list);

  const ids: string[] = [];
  const street = new Set(STREET_CONTAINERS.map((c) => c.id));
  for (const spec of CONTAINERS) {
    // Interiors wait for their interior cell: the place must be registered for them (the world side does that).
    if (spec.interior && !(typeof spec.at === 'string' && game.locations?.get(`${spec.at}:interior`))) continue;
    const placed = addContainer(ctx, spec);
    if (!placed) continue;
    keep(placed.off);
    if (street.has(spec.id)) ids.push(spec.id);
  }

  let things = 0;
  for (const th of THINGS) if (keep(addThing(ctx, th))) things++;

  let lamps = 0;
  const handles: { remove(): void }[] = [];
  for (const l of lampSpecs()) {
    const h = addLamp(ctx, l);
    if (h) {
      handles.push(h);
      lamps++;
    }
  }
  const props = ctx.props.count;
  ctx.props.build(game);

  const disposers: (() => void)[] = [() => handles.forEach((h) => h.remove()), installServices(game), () => ctx.props.dispose(game)];
  void placeCarts(ctx, disposers);

  // People who come and go with the story.
  syncMusHideout(game);
  const ev = game.events;
  if (ev?.on) {
    disposers.push(
      ev.on('game:started', (e) => {
        syncNamedDeaths(game, e.kind);
        syncMusHideout(game);
      }),
      ev.on('save:loaded', () => syncMusHideout(game)),
      ev.on('flag:changed', (e) => {
        if (e.name === 'hideout-known' || e.name === 'mus-fate') syncMusHideout(game);
      }),
      ev.on('quest:stage', (e) => {
        if (e.questId === 'mq-02-tabella' || e.questId === 'mq-03-lemuria') syncMusHideout(game);
      }),
    );
  }

  const service: ContentService = {
    shrines,
    texts,
    things,
    containers: ids.length,
    lamps,
    props,
    worldSpots: [...world],
    containerIds: () => [...ids],
    dispose() {
      for (const off of offs.splice(0)) off();
      for (const d of disposers.splice(0)) d();
    },
  };
  game.content = service;
  return service;
}

/** Positions of every placed street container's place (before placement), for tests and the debug overlay. */
export function containerPoints(game: Game): { id: string; x: number; z: number }[] {
  return STREET_CONTAINERS.flatMap((c) => {
    const p = placeXZ(game, c.at, c.dx ?? 0, c.dz ?? 0);
    return p ? [{ id: c.id, ...p }] : [];
  });
}
