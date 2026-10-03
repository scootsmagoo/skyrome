/**
 * The Tiber bridges standing in AD 113, from atlas BRIDGES: stone arched bridges (Fabricius,
 * Cestius, Aemilius, Agrippa, Neronianus, Mulvius) and the sacred timber Pons Sublicius.
 *
 * Each bridge is laid out along its axis from the terrain profile (layout.ts): the arcade is
 * fitted over the wet channel, the deck clears every arch and comes down to the streets on ramps
 * of at most ~10°. Geometry is merged per material per bridge, with box colliders (deck runs,
 * parapets, piers, abutments). Spots (vista at the crown, inscriptions, the Argei ritual on the
 * Sublicius, spawn points at the ends) are published on `game.bridges` for gameplay.
 */
import * as THREE from 'three';
import type { Game } from '../../core/Game';
import type * as Atlas from '../../data/atlas';
import { MeshBuilder, registerColliders } from '../../gfx/MeshBuilder';
import { WORLD_SCALE } from '../coords';
import type { Spot } from '../landmarks/types';
import type { Heightmap } from '../terrain/heightmap';
import { buildStoneBridge, buildTimberBridge } from './geometry';
import { layoutBridge, type BridgeLayout } from './layout';
import { styleFor } from './specs';

export interface PlacedBridge {
  id: string;
  name: string;
  latin: string;
  object: THREE.Object3D;
  layout: BridgeLayout;
  /** Game-space positions of the atlas ends. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** World-space spots. */
  spots: Spot[];
  triangles: number;
}

declare module '../../core/Game' {
  interface Game {
    bridges: Map<string, PlacedBridge>;
  }
}

export interface BuildBridgesOptions {
  /** Only these bridge ids. */
  only?: string[];
  /** Bridges whose midpoint lies inside these REAL-metre bounds are built at high detail. */
  highDetailBounds?: { minX: number; maxX: number; minZ: number; maxZ: number };
}

/** Atlas core plus a margin: bridges in or near the playable core get full detail. */
const DEFAULT_HIGH = { minX: -1100, maxX: 1300, minZ: -830, maxZ: 1330 };

export async function buildBridges(game: Game, atlas: typeof Atlas, hm: Heightmap, opts: BuildBridgesOptions = {}): Promise<void> {
  const S = WORLD_SCALE;
  const placed = new Map<string, PlacedBridge>();
  game.bridges = placed;
  const river = atlas.RIVERS[0];
  const waterY = Number.isFinite(hm.waterLevelY) ? hm.waterLevelY : river.waterLevel * S;
  const hiB = opts.highDetailBounds ?? DEFAULT_HIGH;
  for (const br of atlas.BRIDGES) {
    if (opts.only && !opts.only.includes(br.id)) continue;
    try {
      placed.set(br.id, buildOne(game, br, hm, waterY, river, hiB));
    } catch (err) {
      console.error(`[bridges] failed to build ${br.id}`, err);
    }
  }
}

function buildOne(
  game: Game,
  br: Atlas.Bridge,
  hm: Heightmap,
  waterY: number,
  river: Atlas.River,
  hiB: { minX: number; maxX: number; minZ: number; maxZ: number },
): PlacedBridge {
  const S = WORLD_SCALE;
  const ax = br.a[0] * S, az = br.a[1] * S;
  const bx = br.b[0] * S, bz = br.b[1] * S;
  const length = Math.hypot(bx - ax, bz - az);
  const ux = (bx - ax) / length, uz = (bz - az) / length;
  const inside = (x: number, z: number) => x >= hm.minX && x <= hm.maxX && z >= hm.minZ && z <= hm.maxZ;
  const bank = river.bankHeight * S;
  const bed = waterY - 2.4;
  // Ground along the axis: the heightmap where it exists, otherwise a synthetic river section
  // (the Pons Mulvius lies kilometres north of the modelled terrain).
  const synthetic = !inside(ax, az) || !inside(bx, bz);
  const ground = (u: number): number => {
    const x = ax + ux * u, z = az + uz * u;
    if (!synthetic) return hm.heightAt(x, z);
    const t = u / length;
    const k = Math.min(smooth(0.1, 0.2, t), 1 - smooth(0.8, 0.9, t));
    return bank + (bed - bank) * k;
  };
  const style = styleFor(br.id, br.arches, br.length ?? length / S);
  const layout = layoutBridge({
    length,
    ground,
    waterY,
    S,
    arches: style,
    deckAbove: style.deckAbove,
    grade: style.kind === 'timber' ? 0.16 : 0.18,
  });
  const mx = (br.a[0] + br.b[0]) / 2, mz = (br.a[1] + br.b[1]) / 2;
  const detail = mx >= hiB.minX && mx <= hiB.maxX && mz >= hiB.minZ && mz <= hiB.maxZ ? 'high' : 'low';
  // Bridge frame: x along A→B, z across (x × y), origin at A on y = 0 (heights are absolute).
  const xh = new THREE.Vector3(ux, 0, uz);
  const yh = new THREE.Vector3(0, 1, 0);
  const zh = new THREE.Vector3(-uz, 0, ux);
  const frame = new THREE.Matrix4().makeBasis(xh, yh, zh).setPosition(ax, 0, az);
  const b = new MeshBuilder();
  const input = { layout, style, width: br.width * S, ground, waterY, length, detail } as const;
  const localSpots = style.kind === 'timber' ? buildTimberBridge(b, frame, input) : buildStoneBridge(b, frame, input);
  const object = b.build(`bridge:${br.id}`);
  object.updateMatrixWorld(true);
  registerColliders(game, b.colliders, undefined, { bridgeId: br.id });
  game.world.add(`bridge:${br.id}`, object, { cullDistance: detail === 'high' ? 1400 : 2200 });
  const yaw = Math.atan2(-uz, ux);
  const spots: Spot[] = localSpots.map((s) => ({
    id: `${br.id}:${s.id}`,
    kind: s.kind,
    position: new THREE.Vector3(s.u, s.y, s.v).applyMatrix4(frame),
    heading: s.heading + yaw,
  }));
  let triangles = 0;
  object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) triangles += m.geometry.getAttribute('position').count / 3;
  });
  return {
    id: br.id,
    name: br.name,
    latin: br.latin,
    object,
    layout,
    a: new THREE.Vector3(ax, ground(0), az),
    b: new THREE.Vector3(bx, ground(length), bz),
    spots,
    triangles,
  };
}

function smooth(e0: number, e1: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}
