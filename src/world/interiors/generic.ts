/**
 * Generic interiors: the cells behind the city's ordinary doors (an insula's stair, a house). A
 * cell is made from a kit (kits/*.ts) and the door's own seed the first time someone goes through
 * that door, sunk under the door like the Column's stair (docs/modules/interiors.md), and given
 * one way out: back to the street in front of the door.
 *
 *   enterThroughDoor(game, door, 'insula-stair', { seed, wealth })
 *
 * The cell id is `gen:<door id>`, so the same door always leads to the same rooms. At most
 * `MAX_BUILT` cells are kept built (the oldest the player is not in is dropped: object, geometry,
 * colliders, lamps); a dropped cell is rebuilt the same from its seed. The registrations are saved
 * ('interiors-generic'), so a game saved inside one loads inside it.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type { LightHandle } from '../lights/LightPool';
import type { DoorDef } from '../doors/DoorSystem';
import type { InteriorBuild, InteriorDef, Vec3 } from './types';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import { CONTAINER_STYLES, type ContainerSpec } from '../../content/containers';
import type { ResidentSpot } from './residents/plan';
import { arriveResidents, leaveResidents } from './residents/system';
import { KITS } from './kits';

/** What a kit says about a cell before building it (cheap, pure): its box, where you come in and go out. */
export interface KitPlan {
  bounds: { min: Vec3; max: Vec3 };
  /** Where the player appears, local; heading local (0 faces +z, into the building). */
  entry: { position: Vec3; heading: number };
  /** The way-out prompt, local. */
  exitAt: Vec3;
  route?: Vec3[];
}

export interface KitLamp {
  position: Vec3;
  color?: number;
  intensity?: number;
  distance?: number;
  /** 0..1 or true (a torch): the flame wavers (hearths, brazier). */
  flicker?: number | boolean;
}

/** A door inside a cell (door system, src/world/doors): its id and frame are local to the cell. */
export type KitDoor = Omit<DoorDef, 'leadsTo'>;

/**
 * A container in a cell (a tenant's chest, a house's strongbox): the kit draws it, the content module
 * makes its prompt once the cell is placed (`game.content.addContainer`). Its world-delta key is
 * `<cell id>:<id>`, so what was taken or unlocked outlives the cell being dropped and rebuilt.
 */
export interface KitContainer {
  id: string;
  /** Where its prompt sits, local to the cell (the chest's floor point; the kind's own height is added). */
  position: Vec3;
  spec: Omit<ContainerSpec, 'id' | 'at' | 'dx' | 'dz' | 'interior'>;
}

export interface KitBuilt extends InteriorBuild {
  /** Lamp flames, local to the cell. */
  lamps?: KitLamp[];
  /** Doors that open, lock and break (a tenant's door on the landing). */
  doors?: KitDoor[];
  /** Chests the player can open (owner, lock and loot as for the street's containers). */
  containers?: KitContainer[];
}

export interface KitContext {
  game: Game;
  /** The cell's id (`gen:<door id>`): the prefix of its containers' ids. */
  cellId: string;
  builder(): MeshBuilder;
  seed: number;
  /** 0 poor … 1 rich. */
  wealth: number;
  plan: KitPlan;
}

export interface InteriorKit {
  id: string;
  name: string;
  latin?: string;
  plan(seed: number, wealth: number): KitPlan;
  build(ctx: KitContext): KitBuilt;
  /** The people the rooms could hold, with the places they would be at (pure; residents/plan.ts says who is home when). */
  residents?(seed: number, wealth: number): ResidentSpot[];
}

/** How far under its door a cell is sunk, and the extra drop per slot (cells of nearby doors never meet). */
const SINK = 160;
const SLOT_DROP = 16;
const MAX_BUILT = 4;

const kits = new Map<string, InteriorKit>();

export function registerKit(kit: InteriorKit) {
  kits.set(kit.id, kit);
}

export function kit(id: string): InteriorKit | undefined {
  return kits.get(id);
}

interface CellRecord {
  id: string;
  kit: string;
  seed: number;
  wealth: number;
  slot: number;
  /** The door's frame in the world: its threshold and rotation. */
  door: { x: number; y: number; z: number; rotY: number };
}

interface GenericState {
  records: Map<string, CellRecord>;
  /** Built cells, oldest first. */
  built: string[];
  lamps: Map<string, LightHandle[]>;
  /** Removers of the containers' prompts, by cell. */
  containers: Map<string, (() => void)[]>;
  saveRegistered: boolean;
}

const states = new WeakMap<Game, GenericState>();
/** The view the player had before a cell switched them to first person. */
const viewBefore = new WeakMap<Game, string>();

function stateOf(game: Game): GenericState {
  let s = states.get(game);
  if (!s) {
    s = { records: new Map(), built: [], lamps: new Map(), containers: new Map(), saveRegistered: false };
    states.set(game, s);
    game.events.on('interior:entered', ({ id }) => touch(game, id));
  }
  if (!s.saveRegistered && game.save) {
    s.saveRegistered = true;
    game.save.register('interiors-generic', {
      save: () => [...stateOf(game).records.values()],
      load: (data) => {
        if (!Array.isArray(data)) return;
        for (const r of data as CellRecord[]) if (r && typeof r.id === 'string' && kits.has(r.kit)) define(game, r);
      },
    });
  }
  return s;
}

/** A hash of a door id: the seed of the rooms behind it. */
export function doorSeed(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h >>> 0;
}

function freeSlot(s: GenericState, door: CellRecord['door']): number {
  // A slot no registered cell near this door (within 60 m) uses.
  const used = new Set<number>();
  for (const r of s.records.values()) if (Math.hypot(r.door.x - door.x, r.door.z - door.z) < 60) used.add(r.slot);
  let k = 0;
  while (used.has(k)) k++;
  return k;
}

/** The street point in front of the door, and the heading out of it. */
function outside(r: CellRecord): { position: Vec3; heading: number } {
  const c = Math.cos(r.door.rotY), s = Math.sin(r.door.rotY);
  // Local −z of the door frame is the street side.
  const dx = -s * 0.9, dz = -c * 0.9;
  return { position: { x: r.door.x + dx, y: r.door.y + 0.05, z: r.door.z + dz }, heading: r.door.rotY + Math.PI };
}

/** Register the cell for a record (idempotent). */
function define(game: Game, r: CellRecord): InteriorDef | undefined {
  const s = stateOf(game);
  const k = kits.get(r.kit);
  if (!k || !game.interiors) return undefined;
  const have = game.interiors.get(r.id);
  s.records.set(r.id, r);
  if (have) return have;
  const plan = k.plan(r.seed, r.wealth);
  const out = outside(r);
  const def: InteriorDef = {
    id: r.id,
    name: k.name,
    latin: k.latin,
    origin: () => ({ x: r.door.x, y: r.door.y - SINK - r.slot * SLOT_DROP, z: r.door.z, rotY: r.door.rotY }),
    build: (ctx) => k.build({ game, cellId: r.id, builder: ctx.builder, seed: r.seed, wealth: r.wealth, plan }),
    bounds: plan.bounds,
    route: plan.route,
    hiddenOutside: true,
    indoor: 1,
    // Stairs and rooms a few metres across: the over-the-shoulder camera would sit in the walls,
    // so these are seen in first person (as the Column's stair), and the player's view comes back outside.
    onEnter: (g) => {
      // The people at home appear (residents/system.ts).
      arriveResidents(g, { id: r.id, spots: k.residents?.(r.seed, r.wealth) ?? [], seed: r.seed, wealth: r.wealth, rotY: r.door.rotY, street: out.position });
      const p = g.player as (typeof g.player & { viewMode?: string; setViewMode?(m: string): void }) | undefined;
      if (!p?.setViewMode || p.viewMode === 'first') return;
      viewBefore.set(g, p.viewMode ?? 'third');
      p.setViewMode('first');
    },
    onExit: (g) => {
      leaveResidents(g, r.id);
      const p = g.player as (typeof g.player & { viewMode?: string; setViewMode?(m: string): void }) | undefined;
      const was = viewBefore.get(g);
      viewBefore.delete(g);
      if (was && p?.setViewMode && p.viewMode === 'first') p.setViewMode(was);
    },
    doors: [
      {
        id: `${r.id}:out`,
        label: 'Door to the street',
        verb: 'Go out',
        at: plan.exitAt,
        from: r.id,
        to: { interior: null, position: out.position, heading: out.heading },
      },
    ],
    afterPlace: (g, object) => {
      object.updateWorldMatrix(true, false);
      const doors = object.userData.kitDoors as KitDoor[] | undefined;
      if (doors?.length && g.doors) g.doors.attachGroup(r.id, doors.map((dd) => ({ ...dd, id: `${r.id}:${dd.id}`, matrix: object.matrixWorld.clone().multiply(dd.matrix) })));
      const boxes = object.userData.kitContainers as KitContainer[] | undefined;
      if (boxes?.length && g.content?.addContainer) {
        const v = new THREE.Vector3();
        s.containers.set(r.id, boxes.map((c) => g.content.addContainer({ ...c.spec, id: `${r.id}:${c.id}`, at: r.id, interior: true }, v.set(c.position.x, c.position.y + CONTAINER_STYLES[c.spec.kind].height, c.position.z).applyMatrix4(object.matrixWorld).clone())));
      }
      const built = object.userData.kitLamps as KitLamp[] | undefined;
      const pool = g.lights;
      if (!built?.length || !pool) return;
      const v = new THREE.Vector3();
      const handles = built.map((l) => pool.request({ position: v.set(l.position.x, l.position.y, l.position.z).applyMatrix4(object.matrixWorld).clone(), color: l.color ?? 0xffb46b, intensity: l.intensity ?? 10, distance: l.distance ?? 9, flicker: l.flicker }));
      s.lamps.set(r.id, handles);
    },
  };
  // The kit's lamps ride on the object until afterPlace hands them to the light pool.
  const build = def.build;
  def.build = (ctx) => {
    const b = build(ctx) as KitBuilt;
    b.object.userData.kitLamps = b.lamps ?? [];
    b.object.userData.kitDoors = b.doors ?? [];
    b.object.userData.kitContainers = b.containers ?? [];
    return b;
  };
  game.interiors.register(def);
  return def;
}

/** Mark a cell as just used; drop the oldest built cells beyond the cap. */
function touch(game: Game, id: string) {
  const s = stateOf(game);
  if (!s.records.has(id)) return;
  s.built = s.built.filter((x) => x !== id);
  s.built.push(id);
  const inside = game.interiors?.current();
  while (s.built.length > MAX_BUILT) {
    const old = s.built.find((x) => x !== inside);
    if (!old) break;
    s.built = s.built.filter((x) => x !== old);
    drop(game, old);
  }
}

function drop(game: Game, id: string) {
  const s = stateOf(game);
  leaveResidents(game, id);
  for (const h of s.lamps.get(id) ?? []) h.remove();
  s.lamps.delete(id);
  for (const off of s.containers.get(id) ?? []) off();
  s.containers.delete(id);
  game.doors?.detachGroup(id);
  const obj = game.interiors?.objectOf(id);
  game.interiors?.dispose(id);
  // The materials are the shared library's; only the geometry is this cell's.
  obj?.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
}

/** Go through a city door into the rooms behind it (built on first use). */
export function enterThroughDoor(game: Game, door: DoorDef, kitId: string, opts: { seed?: number; wealth?: number } = {}): void {
  const k = kits.get(kitId);
  if (!k || !game.interiors) return;
  const s = stateOf(game);
  const id = `gen:${door.id}`;
  let r = s.records.get(id);
  if (!r) {
    const p = new THREE.Vector3().setFromMatrixPosition(door.matrix);
    const q = new THREE.Quaternion().setFromRotationMatrix(door.matrix);
    const rotY = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    const d = { x: p.x, y: p.y, z: p.z, rotY };
    r = { id, kit: kitId, seed: opts.seed ?? doorSeed(door.id), wealth: opts.wealth ?? 0.4, slot: freeSlot(s, d), door: d };
  }
  const def = define(game, r);
  if (!def) return;
  const plan = k.plan(r.seed, r.wealth);
  void game.interiors.enter(id, plan.entry.position, plan.entry.heading);
}

/** Called by the interiors installer (install.ts): the kits, and the save part before any save or load. */
export function registerGenericInteriors(game: Game) {
  for (const k of KITS) registerKit(k);
  stateOf(game);
}
