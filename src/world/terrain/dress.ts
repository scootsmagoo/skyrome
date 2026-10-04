/**
 * Dressing the ground of Rome, so the open land between the monuments reads as May in AD 113
 * rather than a lawn: grass tufts and wildflowers, trees and shrubs (stone pines and cypresses on
 * the skyline, olives on the hill slopes, plane trees by the river, figs and laurels in the
 * quarters, oleander in the gardens, cypress groves round the temples and tombs and along the
 * roads out of town), loose tufa stones and rubble, and travertine kerbstones along the basalt
 * roads.
 *
 * It runs after everything built on the ground (landmarks, water, bridges, city fabric) and asks
 * the physics world whether a spot is built over (`BuiltProbe`), so nothing grows through a
 * building, a quay or a street, whatever made it. Placement is deterministic (hashes of the grid
 * cell), the rules are pure (`treeRule`, `stoneRule`) and use the same splat inputs that decide
 * what the ground looks like.
 *
 *   const dressing = dressTerrain(game);   // buildRome does this as its last step
 */
import * as THREE from 'three';
import { Forest, vegetation, type GrassField, type TreeSpecies } from '../../arch/vegetation';
import type { Game } from '../../core/Game';
import { hash2 } from '../../core/Rng';
import * as atlas from '../../data/atlas';
import { getMaterial } from '../../gfx/materials';
import { registerColliders } from '../../gfx/MeshBuilder';
import { WORLD_SCALE } from '../coords';
import { bodyAt, type WaterBody } from '../water/bodies';
import { addTerrainGrass } from './grass';
import { CANAL, type Heightmap, type P2 } from './heightmap';
import { playableBounds } from './safety';
import { L, LAYER_COUNT, splatWeights, type SplatInput } from './splat';
import type { Terrain } from './Terrain';

declare module '../../core/Game' {
  interface Game {
    dressing?: TerrainDressing;
  }
}

// ------------------------------------------------------------------------------- built probe

/**
 * Is (x, z) built over? A ray down from high above: if the first World surface it meets stands
 * more than 0.25 m above the terrain, something (a floor, a wall, a street, a trunk) is there.
 * Answers are cached per 2 m cell and computed only when first asked.
 */
export class BuiltProbe {
  private readonly cells: Uint8Array;
  private readonly nx: number;
  private readonly nz: number;
  constructor(
    private readonly game: Game,
    private readonly hm: Heightmap,
    private readonly cell = 2,
  ) {
    this.nx = Math.ceil((hm.maxX - hm.minX) / cell) + 1;
    this.nz = Math.ceil((hm.maxZ - hm.minZ) / cell) + 1;
    this.cells = new Uint8Array(this.nx * this.nz);
  }

  at(x: number, z: number): boolean {
    const i = Math.round((x - this.hm.minX) / this.cell), j = Math.round((z - this.hm.minZ) / this.cell);
    if (i < 0 || j < 0 || i >= this.nx || j >= this.nz) return true;
    const k = j * this.nx + i;
    let v = this.cells[k];
    if (!v) {
      const cx = this.hm.minX + i * this.cell, cz = this.hm.minZ + j * this.cell;
      const g = this.hm.heightAt(cx, cz);
      const hit = this.game.physics.groundHeight(cx, cz, g + 45, 46);
      v = this.cells[k] = hit !== null && hit > g + 0.25 ? 2 : 1;
    }
    return v === 2;
  }

  /** Clear at the centre and on a ring of `n` points at radius r. */
  clear(x: number, z: number, r: number, n = 6): boolean {
    if (this.at(x, z)) return false;
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + 0.4;
      if (this.at(x + Math.cos(a) * r, z + Math.sin(a) * r)) return false;
    }
    return true;
  }
}

// ------------------------------------------------------------------------------- rules (pure)

export type Grove = 'garden' | 'river' | 'hill' | 'road' | 'apron' | 'urban' | 'open';

/** Species mix (weights) per kind of place. */
export const GROVE_SPECIES: Record<Grove, [TreeSpecies, number][]> = {
  garden: [['umbrella_pine', 3], ['cypress', 3], ['plane', 2], ['laurel', 2], ['oleander', 3], ['fig', 1]],
  river: [['plane', 4], ['laurel', 2], ['fig', 2], ['oleander', 1]],
  hill: [['olive', 5], ['cypress', 2], ['umbrella_pine', 2], ['laurel', 1], ['oleander', 2]],
  road: [['cypress', 5], ['umbrella_pine', 3], ['olive', 1]],
  apron: [['cypress', 5], ['laurel', 3], ['plane', 1], ['oleander', 1]],
  urban: [['fig', 4], ['laurel', 3], ['cypress', 2], ['oleander', 2]],
  open: [['olive', 3], ['fig', 2], ['laurel', 2], ['oleander', 3], ['umbrella_pine', 1]],
};

/** Room each species needs clear of buildings (m): canopy, roughly. */
export const TREE_CLEARANCE: Record<TreeSpecies, number> = { umbrella_pine: 4.5, plane: 4.5, olive: 2.4, fig: 2.4, laurel: 1.8, cypress: 1.1, oleander: 1, reeds: 0.6 };

/**
 * Trees per 100 m² and the kind of place at a ground point, or null where nothing grows (roads,
 * paving, pads, water margins, rock). `nearRiver`: within a few tens of metres of a natural bank;
 * `corridor` 0..1: on the way from the Porta Capena to the Forum (denser). Pure.
 */
export function treeRule(inp: SplatInput, w: ArrayLike<number>, nearRiver: boolean, corridor = 0): { density: number; grove: Grove } | null {
  const green = w[L.grass] + w[L.dry];
  const paved = w[L.basalt] + w[L.travertine] + w[L.gravel];
  if (paved > 0.15 || green + w[L.dirt] < 0.6 || w[L.rock] > 0.3) return null;
  if (inp.roadSd < 3 || inp.padSd < 2.5 || inp.hw < 0.7 || inp.ny < 0.7) return null;
  const urban = inp.urban;
  const hill = Math.min(1, Math.max(0, (inp.hw - 7) / 7)) * (1 - urban * 0.6) + (1 - inp.ny) * 1.5;
  const opts: [Grove, number][] = [
    ['garden', inp.lush * 1.6],
    ['river', nearRiver ? 0.9 : 0],
    ['hill', hill * 0.32],
    ['apron', inp.padSd < 12 ? 0.4 * (1 - (inp.padSd - 2.5) / 9.5) : 0],
    ['road', inp.roadSd < 10 && urban < 0.55 ? 0.3 * (1 - (inp.roadSd - 3) / 7) : 0],
    ['urban', urban > 0.4 ? 0.06 : 0],
    ['open', 0.07 * (1 - urban)],
  ];
  let best = opts[0];
  for (const o of opts) if (o[1] > best[1]) best = o;
  if (best[1] <= 0) return null;
  const boost = best[0] === 'road' || best[0] === 'apron' || best[0] === 'open' || best[0] === 'urban' ? 1 + corridor : 1;
  return { density: best[1] * boost, grove: best[0] };
}

export type StoneKind = 'rock' | 'pebble' | 'block' | 'brick';

/** Stones per m² and their kind at a ground point (tufa outcrops, rubble, beach pebbles). Pure. */
export function stoneRule(inp: SplatInput, w: ArrayLike<number>): { density: number; kind: StoneKind } | null {
  if (inp.hw < 0.05 || inp.padSd < 0.5 || inp.roadSd < 0.5) return null;
  if (w[L.basalt] + w[L.travertine] > 0.2) return null;
  const rock = w[L.rock], dirt = w[L.dirt], beach = w[L.sand] + w[L.gravel] + w[L.mud] * 0.5;
  if (rock > 0.2) return { density: 0.05 * rock, kind: 'rock' };
  if (beach > 0.4 && inp.hw < 2.5) return { density: 0.02 * beach, kind: 'pebble' };
  if (dirt > 0.4 && inp.urban > 0.25) return { density: 0.006 * dirt * inp.urban, kind: inp.roadSd < 4 ? 'block' : 'brick' };
  if (inp.roadSd < 2.5) return { density: 0.008, kind: 'pebble' };
  return null;
}

/** Distance (real m) from a point to a polyline. */
function polyDist(pts: readonly P2[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.min(1, Math.max(0, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(ax + dx * t - x, az + dz * t - z));
  }
  return best;
}

/** The first walk of the game (REAL m): the Porta Capena, the triumphal road, the Via Sacra. */
export function goldenRoute(): P2[] {
  const gate = atlas.LANDMARK_BY_ID['porta-capena'];
  const tri = atlas.ROADS.find((r) => r.id === 'road-between-palatine-and-caelian');
  const sacra = atlas.ROADS.find((r) => r.id === 'via-sacra');
  const out: P2[] = [];
  if (gate) out.push(gate.center);
  if (tri) out.push(...tri.points);
  if (sacra) out.push(...sacra.points.slice(1));
  return out;
}

// ------------------------------------------------------------------------------- instancing

/** Instances bucketed into square tiles, one InstancedMesh per (tile, kind), distance-culled. */
class TiledInstances {
  private readonly tiles = new Map<string, Map<string, { geo: THREE.BufferGeometry; mat: THREE.Material; m: THREE.Matrix4[]; tint: number[] }>>();
  count = 0;
  constructor(private readonly tile: number) {}

  add(kind: string, geo: THREE.BufferGeometry, mat: THREE.Material, m: THREE.Matrix4, x: number, z: number, tint = 1) {
    const key = `${Math.floor(x / this.tile)},${Math.floor(z / this.tile)}`;
    let t = this.tiles.get(key);
    if (!t) this.tiles.set(key, (t = new Map()));
    let b = t.get(kind);
    if (!b) t.set(kind, (b = { geo, mat, m: [], tint: [] }));
    b.m.push(m);
    b.tint.push(tint);
    this.count++;
  }

  build(game: Game, name: string, parent: THREE.Object3D, cullDistance: number): THREE.Group[] {
    const out: THREE.Group[] = [];
    for (const [key, t] of this.tiles) {
      const g = new THREE.Group();
      g.name = `${name}:${key}`;
      for (const [kind, b] of t) {
        const mesh = new THREE.InstancedMesh(b.geo, b.mat, b.m.length);
        b.m.forEach((m, i) => mesh.setMatrixAt(i, m));
        if (b.tint.some((v) => v !== 1)) {
          const c = new THREE.Color();
          b.tint.forEach((v, i) => mesh.setColorAt(i, c.setRGB(v, v * 0.98, v * 0.95)));
        }
        mesh.name = `${name}:${kind}`;
        mesh.castShadow = false;
        mesh.receiveShadow = true;
        mesh.computeBoundingBox();
        mesh.computeBoundingSphere();
        g.add(mesh);
      }
      if (game.world) game.world.add(`${name}:${key}`, g, { cullDistance, parent });
      else parent.add(g);
      out.push(g);
    }
    return out;
  }
}

/** A lumpy stone: an icosahedron pushed about by a little noise, flattened (unit size). */
function stoneGeometry(seed: number): THREE.BufferGeometry {
  const g = new THREE.IcosahedronGeometry(0.5, 1);
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const n = hash2(Math.round(v.x * 40), Math.round(v.y * 40) * 7 + Math.round(v.z * 40), seed) / 4294967296;
    v.multiplyScalar(0.8 + 0.4 * n);
    v.y *= 0.62;
    p.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------------------- dressing

export interface DressOptions {
  grass?: boolean;
  trees?: boolean;
  stones?: boolean;
  kerbs?: boolean;
  /** Candidate spacing for trees (game m). */
  treeStep?: number;
  seed?: number;
}

export interface TerrainDressing {
  group: THREE.Group;
  built: BuiltProbe;
  grass: GrassField[];
  /** Trees and shrubs, one Forest per 512 m tile. */
  forests: Forest[];
  stats: { trees: number; stones: number; kerbs: number; ms: number };
}

export function dressTerrain(game: Game, opts: DressOptions = {}): TerrainDressing | null {
  const terrain = game.terrain as Terrain | undefined;
  if (!terrain) return null;
  const t0 = performance.now();
  const hm = terrain.hm;
  const seed = opts.seed ?? 113;
  const S = WORLD_SCALE;
  const group = new THREE.Group();
  group.name = 'terrain-dressing';
  game.scene.add(group);
  const built = new BuiltProbe(game, hm);
  const b = playableBounds(hm, 8);
  const w = new Float32Array(LAYER_COUNT);
  const rnd = (i: number, j: number, k: number) => hash2(i, j, seed * 31 + k) / 4294967296;
  const rivers: WaterBody[] = (game.water?.bodies ?? []).filter((x) => x.kind === 'river');
  // The canal's masonry (walls, paved strips) has no pads: keep it bare by hand.
  const canals: WaterBody[] = (game.water?.bodies ?? []).filter((x) => x.kind === 'canal');
  const canalMargin = CANAL.wall * S + 1.6;
  const onCanal = (x: number, z: number) => canals.length > 0 && bodyAt(canals, x, z, canalMargin) !== null;
  const route = goldenRoute();
  const dressing: TerrainDressing = { group, built, grass: [], forests: [], stats: { trees: 0, stones: 0, kerbs: 0, ms: 0 } };

  // ---- trees and shrubs
  if (opts.trees !== false) {
    const step = opts.treeStep ?? 5;
    // One Forest per 512 m tile: each batch's bounding sphere then covers one tile, so whole
    // tiles behind the camera are frustum-culled (a single city-wide Forest draws every far tree).
    const forests = new Map<string, Forest>();
    const forestAt = (x: number, z: number) => {
      const key = `${Math.floor(x / 512)},${Math.floor(z / 512)}`;
      let f = forests.get(key);
      if (!f) forests.set(key, (f = new Forest({ near: 85, far: 650, castShadow: true, seed })));
      return f;
    };
    const ni = Math.floor((b.maxX - b.minX) / step), nj = Math.floor((b.maxZ - b.minZ) / step);
    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const r0 = rnd(i, j, 0);
        if (r0 > 0.25) continue; // the densest rule plants ~0.4 per 25 m²: cull early
        const x = b.minX + (i + 0.15 + 0.7 * rnd(i, j, 1)) * step;
        const z = b.minZ + (j + 0.15 + 0.7 * rnd(i, j, 2)) * step;
        const inp = terrain.inputAt(x, z);
        splatWeights(inp, w);
        const corridor = route.length > 1 ? Math.max(0, 1 - polyDist(route, x / S, z / S) / 110) * 0.8 : 0;
        const near = rivers.length > 0 && inp.hw < 9 && bodyAt(rivers, x, z, 22) !== null;
        const rule = treeRule(inp, w, near, corridor);
        if (!rule) continue;
        if (r0 > rule.density * (step * step) / 100) continue;
        const mix = GROVE_SPECIES[rule.grove];
        let total = 0;
        for (const [, wt] of mix) total += wt;
        let pick = rnd(i, j, 3) * total;
        let species = mix[0][0];
        for (const [sp, wt] of mix) {
          if ((pick -= wt) <= 0) {
            species = sp;
            break;
          }
        }
        if (onCanal(x, z) || !built.clear(x, z, TREE_CLEARANCE[species], species === 'umbrella_pine' || species === 'plane' ? 8 : 5)) continue;
        const scale = 0.78 + 0.4 * rnd(i, j, 4);
        forestAt(x, z).add(species, x, hm.heightAt(x, z) - 0.06, z, { scale, rotationY: rnd(i, j, 5) * Math.PI * 2, variant: Math.floor(rnd(i, j, 6) * 2) });
      }
    }
    for (const forest of forests.values()) {
      group.add(forest.build());
      vegetation(game).addForest(forest);
      registerColliders(game, forest.colliders(), undefined, dressing);
      dressing.forests.push(forest);
      dressing.stats.trees += forest.count;
    }
  }

  // ---- grass tufts and wildflowers (kept out of anything built)
  if (opts.grass !== false) dressing.grass = addTerrainGrass(game, terrain, { exclude: (x, z) => onCanal(x, z) || built.at(x, z) });

  // ---- stones and rubble
  if (opts.stones !== false) {
    const tiles = new TiledInstances(256);
    const geos = [stoneGeometry(1), stoneGeometry(2), stoneGeometry(3)];
    const box = new THREE.BoxGeometry(1, 1, 1);
    const mats = { tufa: getMaterial('tufa'), travertine: getMaterial('travertine'), brick: getMaterial('brick'), peperino: getMaterial('peperino') };
    const step = 2.5;
    const ni = Math.floor((b.maxX - b.minX) / step), nj = Math.floor((b.maxZ - b.minZ) / step);
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const e = new THREE.Euler();
    for (let j = 0; j < nj; j++) {
      for (let i = 0; i < ni; i++) {
        const r0 = rnd(i, j, 10);
        if (r0 > 0.32) continue;
        const x = b.minX + (i + rnd(i, j, 11)) * step, z = b.minZ + (j + rnd(i, j, 12)) * step;
        const inp = terrain.inputAt(x, z);
        splatWeights(inp, w);
        const rule = stoneRule(inp, w);
        if (!rule || r0 > rule.density * step * step) continue;
        if (built.at(x, z) || onCanal(x, z)) continue;
        const y = hm.heightAt(x, z);
        const r = rnd(i, j, 13);
        e.set((rnd(i, j, 14) - 0.5) * 0.5, r * Math.PI * 2, (rnd(i, j, 15) - 0.5) * 0.5);
        q.setFromEuler(e);
        let kind: string, geo: THREE.BufferGeometry, mat: THREE.Material, sx: number, sy: number, sz: number;
        if (rule.kind === 'rock' || rule.kind === 'pebble') {
          const v = Math.floor(rnd(i, j, 16) * 3);
          const s = rule.kind === 'rock' ? 0.35 + 1.1 * r * r : 0.12 + 0.22 * r;
          geo = geos[v];
          mat = rule.kind === 'rock' ? mats.tufa : rnd(i, j, 17) < 0.5 ? mats.tufa : mats.peperino;
          kind = `${rule.kind}${v}${mat === mats.tufa ? 't' : 'p'}`;
          sx = s * (0.8 + 0.5 * rnd(i, j, 18));
          sy = s;
          sz = s * (0.8 + 0.5 * rnd(i, j, 19));
        } else {
          // Rubble: a squared travertine block, or a few bricks' worth of broken brick.
          const block = rule.kind === 'block';
          geo = box;
          mat = block ? mats.travertine : mats.brick;
          kind = block ? 'block' : 'brick';
          sx = block ? 0.45 + 0.5 * r : 0.3 + 0.15 * r;
          sy = block ? 0.25 + 0.2 * rnd(i, j, 18) : 0.05;
          sz = block ? 0.3 + 0.3 * rnd(i, j, 19) : 0.2 + 0.1 * r;
        }
        m.compose(new THREE.Vector3(x, y + sy * 0.18, z), q, new THREE.Vector3(sx, sy, sz));
        tiles.add(kind, geo, mat, m.clone(), x, z);
      }
    }
    tiles.build(game, 'stones', group, 170);
    dressing.stats.stones = tiles.count;
  }

  // ---- kerbstones along the basalt roads (the edge of the paving; crepidines)
  if (opts.kerbs !== false && hm.features) {
    const tiles = new TiledInstances(256);
    const L0 = 2.4;
    const geo = new THREE.BoxGeometry(L0, 0.36, 0.26);
    const mat = getMaterial('travertine');
    const m = new THREE.Matrix4();
    const X = new THREE.Vector3(), Y = new THREE.Vector3(), Z = new THREE.Vector3();
    for (const road of hm.features.roads) {
      const paving = road.paving ?? 'basalt';
      if (paving !== 'basalt') continue;
      const half = (road.width * S) / 2;
      const pts = road.points.map((p) => [p[0] * S, p[1] * S] as const);
      for (let s = 0; s < pts.length - 1; s++) {
        const [ax, az] = pts[s], [bx, bz] = pts[s + 1];
        const len = Math.hypot(bx - ax, bz - az);
        if (len < 1) continue;
        const ux = (bx - ax) / len, uz = (bz - az) / len;
        const n = Math.max(1, Math.round(len / L0));
        const pl = len / n;
        for (const side of [-1, 1]) {
          const ox = -uz * side * (half + 0.14), oz = ux * side * (half + 0.14);
          for (let k = 0; k < n; k++) {
            const x0 = ax + ux * k * pl + ox, z0 = az + uz * k * pl + oz;
            const x1 = x0 + ux * pl, z1 = z0 + uz * pl;
            const mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
            if (mx < b.minX || mx > b.maxX || mz < b.minZ || mz > b.maxZ) continue;
            // Not across another road (junctions), on pads and fora, by the water or under buildings.
            const inp = terrain.inputAt(mx - uz * side * 0.2, mz + ux * side * 0.2);
            if (inp.roadSd < -0.05 || inp.padSd < 0.4 || inp.hw < 0.4 || built.at(mx, mz)) continue;
            const y0 = hm.heightAt(x0, z0), y1 = hm.heightAt(x1, z1);
            X.set(x1 - x0, y1 - y0, z1 - z0).normalize();
            Y.set(0, 1, 0).addScaledVector(X, -X.y).normalize();
            Z.crossVectors(X, Y);
            m.makeBasis(X, Y, Z).scale(new THREE.Vector3(pl / L0, 1, 1));
            // Top 0.11 m above the paving; weathered blocks, no two alike.
            m.setPosition(mx, (y0 + y1) / 2 - 0.07, mz);
            tiles.add('kerb', geo, mat, m.clone(), mx, mz, 0.62 + 0.22 * (hash2(Math.round(mx * 3), Math.round(mz * 3), seed) / 4294967296));
          }
        }
      }
    }
    tiles.build(game, 'kerbs', group, 320);
    dressing.stats.kerbs = tiles.count;
  }

  dressing.stats.ms = Math.round(performance.now() - t0);
  game.dressing = dressing;
  return dressing;
}
