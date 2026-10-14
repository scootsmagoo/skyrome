/**
 * What the hand-built interiors of the named places share (docs/modules/interiors.md, "Named
 * cells"): a cell sunk under its place like the Column's stair, its `<place>:interior` location
 * (which makes the place's interior containers appear in it, src/content/install.ts), lamps and
 * doors handed to the light pool and the door system once it is placed, first person inside, and the
 * way out. A cell's frame has the world's axes (rotation 0), so a container's dx and dz in
 * src/content/containers.ts are plain offsets from the cell's origin.
 *
 * The cells themselves are the other files of this folder; each exports one `NamedCell`.
 */
import * as THREE from 'three';
import type { Draw } from '../../../arch/fabric/draw';
import { CONTAINERS, type ContainerSpec } from '../../../content/containers';
import type { Game } from '../../../core/Game';
import type { LightHandle } from '../../lights/LightPool';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { Spot } from '../../landmarks/types';
import { daylightOf, type KitBuilt } from '../generic';
import { chest, type ChestLook } from '../kits/parts';
import type { InteriorDef, InteriorDoor, Vec3 } from '../types';

/** How far under its place a named cell sits (generic cells are 160 m and more under their doors). */
export const NAMED_SINK = 240;
const SLOT_DROP = 6;

export interface NamedCell {
  /** The cell id, as docs/CONTENT.md §1.4 names it. */
  id: string;
  name: string;
  latin: string;
  /** The place id whose interior containers belong here (`<at>:interior` is registered for it). */
  at: string;
  /** Sink slot: cells of different places never share a depth either. */
  slot: number;
  /** The world point the origin sits under (its y is the street level there); null until the world can say. */
  anchor(game: Game): Vec3 | null;
  bounds: { min: Vec3; max: Vec3 };
  /** Where the player appears (local) and the way they face. */
  entry: { position: Vec3; heading: number };
  /** Ordered local waypoints from the entry to the far end (bots, tests, the minimap). */
  route: Vec3[];
  build(ctx: { game: Game; builder(): MeshBuilder }): KitBuilt;
  /** The way out: the prompt's local point, and the world point and heading it puts the player at. */
  exit: { at: Vec3; label: string; verb: string; to(game: Game): { position: Vec3; heading: number } | null };
  /** Doors from the street into the cell that belong to the cell's def (a fixed doorway on a landmark). */
  outside?: InteriorDoor[];
  /**
   * The cell's named places (local point and heading), as pure data: `build` turns them into spots, and
   * `registerNamed` registers each as the location `<cell id>:<name>` so schedules and quests can name it.
   */
  places?: Record<string, { position: Vec3; heading: number }>;
}

/** The cell's `places` as `Spot`s of the built cell (the kind is only a label). */
export function placeSpots(cell: Pick<NamedCell, 'places'>, kind = 'spot'): Spot[] {
  return Object.entries(cell.places ?? {}).map(([id, p]) => ({ id, kind: id === 'entry' ? 'spawn' : kind, position: new THREE.Vector3(p.position.x, p.position.y, p.position.z), heading: p.heading }));
}

/** A location of the world's registry (undefined where there is none: tests, a bare game). */
export function locationOf(game: Game, id: string): { x: number; y: number; z: number } | undefined {
  const reg = game.locations as { get?(id: string): { position: { x: number; y?: number; z: number } } | undefined } | undefined;
  const l = typeof reg?.get === 'function' ? reg.get(id) : undefined;
  return l ? { x: l.position.x, y: l.position.y ?? 0, z: l.position.z } : undefined;
}

const anchors = new WeakMap<Game, Map<string, Vec3>>();

/** The cell's anchor, worked out once (the origin, the location and the chests must agree). */
export function anchorOf(game: Game, cell: NamedCell): Vec3 | null {
  let m = anchors.get(game);
  if (!m) anchors.set(game, (m = new Map()));
  const have = m.get(cell.id);
  if (have) return have;
  const a = cell.anchor(game);
  if (!a) return null;
  const rounded = { x: Math.round(a.x * 100) / 100, y: Math.round(a.y * 100) / 100, z: Math.round(a.z * 100) / 100 };
  m.set(cell.id, rounded);
  return rounded;
}

/** The cell's origin in the world. */
export function originOf(game: Game, cell: NamedCell): { x: number; y: number; z: number; rotY: number } | null {
  const a = anchorOf(game, cell);
  return a ? { x: a.x, y: a.y - NAMED_SINK - cell.slot * SLOT_DROP, z: a.z, rotY: 0 } : null;
}

/** The lamps of each built cell, lit while the player is in it (a named cell stays built, so its flames are not left burning under the street). */
const lampsOf = new WeakMap<Game, Map<string, LightHandle[]>>();

function setLamps(game: Game, id: string, on: boolean) {
  for (const h of lampsOf.get(game)?.get(id) ?? []) h.setEnabled(on);
}

/** The view the player had before a cell switched them to first person. */
const viewBefore = new WeakMap<Game, string>();

type PlayerView = { viewMode?: string; setViewMode?(m: string): void };

/** The def of a named cell. */
export function namedDef(cell: NamedCell): InteriorDef {
  const doors: InteriorDoor[] = [
    ...(cell.outside ?? []),
    {
      id: `${cell.id}:out`,
      label: cell.exit.label,
      verb: cell.exit.verb,
      at: cell.exit.at,
      from: cell.id,
      to: {
        interior: null,
        position: (game) => cell.exit.to(game)?.position ?? (null as unknown as Vec3),
        heading: (game) => cell.exit.to(game)?.heading ?? 0,
      },
    },
  ];
  const def: InteriorDef = {
    id: cell.id,
    name: cell.name,
    latin: cell.latin,
    origin: (game) => originOf(game, cell),
    build: (ctx) => {
      const built = cell.build(ctx);
      // The lamps and doors ride on the object until afterPlace hands them to the light pool and the door system.
      built.object.userData.kitLamps = built.lamps ?? [];
      built.object.userData.kitDoors = built.doors ?? [];
      return built;
    },
    bounds: cell.bounds,
    doors,
    route: cell.route,
    hiddenOutside: true,
    indoor: 1,
    // Rooms a few metres across: the over-the-shoulder camera would sit in the walls (as in the
    // Column's stair), so these are seen in first person and the player's own view comes back outside.
    onEnter: (g) => {
      setLamps(g, cell.id, true);
      const p = g.player as (typeof g.player & PlayerView) | undefined;
      if (!p?.setViewMode || p.viewMode === 'first') return;
      viewBefore.set(g, p.viewMode ?? 'third');
      p.setViewMode('first');
    },
    onExit: (g) => {
      setLamps(g, cell.id, false);
      const p = g.player as (typeof g.player & PlayerView) | undefined;
      const was = viewBefore.get(g);
      viewBefore.delete(g);
      if (was && p?.setViewMode && p.viewMode === 'first') p.setViewMode(was);
    },
    afterPlace: (g, object) => {
      object.updateWorldMatrix(true, false);
      const lamps = object.userData.kitLamps as KitBuilt['lamps'];
      const v = new THREE.Vector3();
      const handles: LightHandle[] = [];
      const day: { h: LightHandle; base: number }[] = [];
      for (const l of lamps ?? []) {
        const h = g.lights?.request({
          position: v.set(l.position.x, l.position.y, l.position.z).applyMatrix4(object.matrixWorld).clone(),
          color: l.color ?? 0xffb46b,
          intensity: l.intensity ?? 10,
          distance: l.distance ?? 9,
          flicker: l.flicker,
          // Lit while the player is inside (onEnter), which follows this at once when the cell is entered.
          enabled: g.interiors?.current() === cell.id,
          // Daylight through a window: no flame sprite, and it follows the sky (see generic.ts daylightOf).
          glow: l.daylight ? 0 : undefined,
        });
        if (h) {
          handles.push(h);
          if (l.daylight) {
            day.push({ h, base: l.intensity ?? 10 });
            h.setIntensity((l.intensity ?? 10) * (0.04 + 0.96 * (g.sky?.daylight ?? 1)));
          }
        }
      }
      if (day.length) daylightOf(g).set(`named:${cell.id}`, day);
      let m = lampsOf.get(g);
      if (!m) lampsOf.set(g, (m = new Map()));
      m.set(cell.id, handles);
      const kd = object.userData.kitDoors as NonNullable<KitBuilt['doors']> | undefined;
      if (kd?.length && g.doors) g.doors.attachGroup(cell.id, kd.map((dd) => ({ ...dd, id: `${cell.id}:${dd.id}`, matrix: object.matrixWorld.clone().multiply(dd.matrix) })));
    },
  };
  return def;
}

/**
 * Register a cell: its def with the interior service, and the `<at>:interior` location at its floor
 * (a point under the street; the radius is tiny so nobody walking above ever "enters" it) that makes
 * the place's interior containers appear in it. A no-op until the world can place the cell.
 */
export function registerNamed(game: Game, cell: NamedCell): boolean {
  const sys = game.interiors;
  if (!sys) return false;
  const o = originOf(game, cell);
  if (!o) return false;
  sys.register(namedDef(cell));
  game.locations?.add({ id: `${cell.at}:interior`, name: cell.name, latin: cell.latin, position: { x: o.x, y: o.y, z: o.z }, radius: 0.3, discoverable: false });
  for (const [name, p] of Object.entries(cell.places ?? {})) {
    game.locations?.add({ id: `${cell.id}:${name}`, name: `${cell.name}: ${name}`, position: { x: o.x + p.position.x, y: o.y + p.position.y, z: o.z + p.position.z }, radius: 0.3, discoverable: false });
  }
  return true;
}

// ---------------------------------------------------------------- the chests a cell draws

/** The interior containers that belong to a place (data: src/content/containers.ts), for the cell to draw and for tests. */
export function interiorContainers(at: string): ContainerSpec[] {
  return CONTAINERS.filter((c) => c.interior && c.at === at);
}

/** How each kind of container looks (kits/parts.ts `chest`). */
const CHEST_LOOK: Partial<Record<ContainerSpec['kind'], ChestLook>> = {
  'arca-tabernae': 'strongbox',
  'cista-insulae': 'trunk',
  'cella-ludi': 'locker',
};

/**
 * A container's chest standing at its place on the floor of `d`'s frame. `yaw` turns its face (a wall's
 * chest looks into the room). Colliding, so the player cannot walk through it.
 */
export function drawChest(d: Draw, spec: ContainerSpec, yaw = 0, y = 0) {
  chest(d, CHEST_LOOK[spec.kind] ?? 'strongbox', spec.dx ?? 0, y, spec.dz ?? 0, yaw);
}

/** Draw every chest of a place (at their data's places, facing `yaws[id]` or +z). */
export function drawChests(d: Draw, at: string, yaws: Record<string, number> = {}) {
  for (const c of interiorContainers(at)) drawChest(d, c, yaws[c.id] ?? 0);
}

/** Does a local point lie inside a cell's bounds? */
export function inBounds(cell: Pick<NamedCell, 'bounds'>, p: Vec3, margin = 0): boolean {
  const { min, max } = cell.bounds;
  return p.x >= min.x + margin && p.x <= max.x - margin && p.y >= min.y && p.y <= max.y && p.z >= min.z + margin && p.z <= max.z - margin;
}

/**
 * A barrel vault: the upper half of a cylinder along z (z from −length/2 to +length/2, x from
 * −radius to +radius, the springing at y = 0), its faces turned in to be seen from underneath.
 */
export function barrelGeometry(radius: number, length: number, seg = 18): THREE.BufferGeometry {
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= seg; i++) {
    const a = (Math.PI * i) / seg;
    const x = Math.cos(a) * radius;
    const y = Math.sin(a) * radius;
    pos.push(x, y, -length / 2, x, y, length / 2);
  }
  for (let i = 0; i < seg; i++) {
    const a0 = i * 2, b0 = a0 + 1, a1 = a0 + 2, b1 = a0 + 3;
    idx.push(a0, b0, a1, b0, b1, a1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  const flat = g.toNonIndexed();
  flat.computeVertexNormals();
  g.dispose();
  return flat;
}
