/**
 * Street life: the things that make the ordinary city feel lived in, placed from the plan (pure
 * placement; geometry is written into the street cells' MeshBuilders when they are built).
 *
 * - Torches on the shop fronts (iron brackets with a burning pitch torch at the corner piers of
 *   insulae and shop rows): more on the main roads and the golden path, a few in the back lanes.
 *   Each is also a lamp of the light pool (lamps.ts), lit from dusk to dawn.
 * - Landmark frontages: where a landmark's walkable margin faces a street, market stalls (with a
 *   lamp on some), crates, baskets and amphora stacks, masonry benches, inscribed statue bases in
 *   front of temples and basilicas, and shade trees.
 * - Washing hung on lines across the narrow lanes of the dense quarters.
 *
 * Every stall, bench and container is also a street spot for NPCs (network.ts).
 */
import * as THREE from 'three';
import { Rng, hash2 } from '../../core/Rng';
import { Draw } from '../../arch/fabric/draw';
import { placeProp } from '../../arch/props/props';
import type { PropKind } from '../../arch/props/props';
import type { LotPlan } from '../../arch/fabric/blockFiller';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import { getMaterial } from '../../gfx/materials';
import type { MaterialId } from '../../gfx/materialIds';
import type { TreeSpecies } from '../../arch/vegetation/species';
import { FLOOR_LIFT, SIDEWALK } from './datum';
import type { CityPlan, PlanBlock } from './plan';
import { K, signedArea, type Pt } from './raster';

export type HeightFn = (x: number, z: number) => number;

export type LampKind = 'torch' | 'stall' | 'shrine' | 'fountain';

/** A light of the city (a light-pool request near the camera, see lamps.ts). */
export interface LampDef {
  x: number;
  y: number;
  z: number;
  kind: LampKind;
}

/** A wall torch: the bracket's origin on the facade, `rotY` turns its local −z outward. */
export interface Torch {
  x: number;
  y: number;
  z: number;
  rotY: number;
}

/** Height of the torch brackets above the shop floor (over the shop lintels, under the balconies). */
const TORCH_Y = 2.85;
/** The flame of `torch_bracket` relative to its origin (local frame). */
const FLAME = { up: 0.48, out: 0.3 };

/**
 * Torches on a block's shop fronts: at a corner pier of each insula / shop row (where the wall is
 * solid), with a probability by the street it fronts (main road, vicus, lane) and the golden path.
 */
export function blockTorches(blk: PlanBlock, lots: LotPlan[], H: HeightFn): Torch[] {
  const out: Torch[] = [];
  const rng = new Rng(blk.seed ^ 0x70c4);
  for (const p of lots) {
    if (p.kind !== 'insula' && p.kind !== 'shops' && p.kind !== 'domus' && p.kind !== 'horrea') continue;
    const sw = blk.sidewalk[p.edge] ?? SIDEWALK.other;
    let prob = blk.corridor ? 0.85 : sw >= SIDEWALK.road - 1e-6 ? 0.55 : sw >= SIDEWALK.street - 1e-6 ? 0.32 : 0.12;
    if (p.kind === 'domus' || p.kind === 'horrea') prob *= 0.5;
    if (!rng.chance(prob) || p.obb.hu < 2.2) continue;
    const { obb } = p;
    // Floor level as the filler computes it (highest sidewalk point of the frontage).
    let floorY = -Infinity;
    for (let i = 0; i <= 4; i++) {
      const lx = -obb.hu + (2 * obb.hu * i) / 4;
      floorY = Math.max(floorY, H(obb.c[0] + obb.u[0] * lx - obb.v[0] * (obb.hv + 0.4), obb.c[1] + obb.u[1] * lx - obb.v[1] * (obb.hv + 0.4)) + sw + FLOOR_LIFT);
    }
    const lx = (rng.chance(0.5) ? -1 : 1) * (obb.hu - 0.4);
    const x = obb.c[0] + obb.u[0] * lx - obb.v[0] * obb.hv, z = obb.c[1] + obb.u[1] * lx - obb.v[1] * obb.hv;
    out.push({ x, y: floorY + TORCH_Y, z, rotY: p.rotationY });
  }
  return out;
}

/** The lamp (flame position) of a wall torch. */
export function torchLamp(t: Torch): LampDef {
  // Local −z (outward) in world: (−sin rotY, −cos rotY).
  return { x: t.x - Math.sin(t.rotY) * FLAME.out, y: t.y + FLAME.up, z: t.z - Math.cos(t.rotY) * FLAME.out, kind: 'torch' };
}

/** Merge the torch brackets into a builder (world coordinates). */
export function drawTorches(b: MeshBuilder, torches: Torch[]) {
  const d = new Draw(b);
  for (const t of torches) placeProp(d, 'torch_bracket', t.x, t.y, t.z, t.rotY, { variant: 0, collide: false });
}

let flame: THREE.Material | null = null;

/**
 * The material of the wall torches' flames: the library's `glow_fire`, cloned so that the city can
 * put the torches out by day (`torchFlames().visible = lampFactor > 0`) without dousing forges,
 * ovens and altars.
 */
export function torchFlames(): THREE.Material {
  if (!flame) {
    flame = getMaterial('glow_fire').clone();
    flame.name = 'glow_fire_torch';
  }
  return flame;
}

/** Torches of a block as a built group whose flames use `torchFlames()`. */
export function torchGroup(torches: Torch[], name: string): THREE.Group {
  const b = new MeshBuilder();
  drawTorches(b, torches);
  const g = b.build(name);
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && m.name.endsWith(':glow_fire')) m.material = torchFlames();
  });
  return g;
}

// ---------------------------------------------------------------- landmark frontages & lanes

export interface LifeSpot {
  id: string;
  kind: 'stall' | 'bench' | 'container';
  position: THREE.Vector3;
  heading: number;
  tag?: string;
}

export interface LifeTree {
  species: TreeSpecies;
  x: number;
  z: number;
  scale: number;
}

export interface LifeWork {
  spots: LifeSpot[];
  lamps: LampDef[];
  trees: LifeTree[];
  /** Placed items by kind (stats / tests). */
  counts: Record<string, number>;
}

type Item = 'stall' | 'goods' | 'amphorae' | 'bench' | 'statue' | 'tree' | 'none';

const MARKETS = new Set(['market', 'forum', 'circus', 'portico', 'warehouse', 'baths', 'theatre', 'amphitheatre', 'stadium', 'odeum']);
const CIVIC = new Set(['temple', 'basilica', 'curia', 'arch', 'column', 'monument', 'library', 'shrine', 'fountain', 'gate', 'tomb']);
const WALKWAY = new Set<number>([K.ROAD, K.STREET, K.PIAZZA]);

function mix(category: string, corridor: boolean): readonly (readonly [Item, number])[] {
  if (MARKETS.has(category)) return [['stall', corridor ? 0.62 : 0.5], ['goods', 0.14], ['amphorae', 0.1], ['bench', 0.08], ['tree', 0.04], ['none', corridor ? 0.02 : 0.14]];
  if (CIVIC.has(category)) return [['statue', 0.26], ['bench', 0.14], ['tree', 0.14], ['stall', corridor ? 0.3 : 0.14], ['goods', 0.05], ['none', corridor ? 0.11 : 0.27]];
  return [['tree', 0.3], ['bench', 0.15], ['stall', corridor ? 0.25 : 0.05], ['none', 0.4]];
}

/**
 * Plan the street life of the area and queue its geometry with `add(x, z, item)` (the street cell
 * at x, z builds it). Deterministic.
 */
export function lifeWork(plan: CityPlan, H: HeightFn, inArea: (x: number, z: number) => boolean, add0: (x: number, z: number, item: (b: MeshBuilder) => void, layer: 'detail') => void): LifeWork {
  // Everything here is street furniture: built only near the camera.
  const add = (x: number, z: number, item: (b: MeshBuilder) => void) => add0(x, z, item, 'detail');
  const g = plan.grid;
  const spots: LifeSpot[] = [];
  const lamps: LampDef[] = [];
  const trees: LifeTree[] = [];
  const counts: Record<string, number> = {};
  const count = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  const placed: Pt[] = [];
  const hash = new Map<string, Pt[]>();
  const near = (p: Pt, r: number) => {
    const kx = Math.floor(p[0] / 8), kz = Math.floor(p[1] / 8);
    for (let dx = -1; dx <= 1; dx++)
      for (let dz = -1; dz <= 1; dz++) for (const q of hash.get(`${kx + dx},${kz + dz}`) ?? []) if (Math.hypot(q[0] - p[0], q[1] - p[1]) < r) return true;
    return false;
  };
  const remember = (p: Pt) => {
    placed.push(p);
    const k = `${Math.floor(p[0] / 8)},${Math.floor(p[1] / 8)}`;
    const l = hash.get(k);
    if (l) l.push(p);
    else hash.set(k, [p]);
  };

  // ---- landmark frontages
  for (const lm of plan.landmarkPolys) {
    const poly = lm.poly;
    const sgn = signedArea(poly) >= 0 ? 1 : -1;
    const rng = new Rng(`life:${lm.id}`);
    for (let k = 0; k < poly.length; k++) {
      const a = poly[k], b = poly[(k + 1) % poly.length];
      const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (L < 4) continue;
      const t: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L];
      // Outward normal of a positive polygon: (dz, −dx).
      const n: Pt = [t[1] * sgn, -t[0] * sgn];
      const steps = Math.floor((L - 2) / 5.2);
      for (let j = 0; j < steps; j++) {
        const s = 2.6 + j * 5.2 + rng.range(-0.6, 0.6);
        const e: Pt = [a[0] + t[0] * s, a[1] + t[1] * s];
        const p: Pt = [e[0] + n[0] * 3.1, e[1] + n[1] * 3.1];
        if (!inArea(p[0], p[1])) continue;
        const at = (dn: number, dt: number) => g.at(p[0] + n[0] * dn + t[0] * dt, p[1] + n[1] * dn + t[1] * dt);
        if (at(0, 0) !== K.MARGIN || at(1.3, 0) !== K.MARGIN || at(-1.4, 0) !== K.MARGIN || at(0, 1.9) !== K.MARGIN || at(0, -1.9) !== K.MARGIN) continue;
        // Only where the margin opens on a street (not round the back of a building on a slope).
        if (!WALKWAY.has(at(4.2, 0)) && !WALKWAY.has(at(5.8, 0)) && !WALKWAY.has(at(3.2, 0))) continue;
        if (near(p, 4.4)) continue;
        // Level ground only (stalls on a 1:5 slope would float).
        const h0 = H(p[0] - t[0] * 1.2, p[1] - t[1] * 1.2), h1 = H(p[0] + t[0] * 1.2, p[1] + t[1] * 1.2);
        if (Math.abs(h1 - h0) > 0.5) continue;
        const corridor = plan.corridor(p[0], p[1]);
        const item = rng.weighted(mix(lm.category, corridor));
        if (item === 'none') continue;
        remember(p);
        count(item);
        const y = Math.min(h0, h1, H(p[0], p[1])) + 0.04;
        const toStreet = Math.atan2(n[0], n[1]);
        const id = `${lm.id}:life${j}_${k}`;
        if (item === 'tree') {
          trees.push({ species: rng.pick(['plane', 'plane', 'laurel', 'umbrella_pine'] as const), x: p[0], z: p[1], scale: rng.range(0.75, 0.95) });
          continue;
        }
        const seed = hash2(Math.round(p[0] * 10), Math.round(p[1] * 10), 41);
        // On the golden path, a brazier or a bronze lampstand beside some of them (the street is lit
        // for the dawn arrival even where only monuments line it).
        if (corridor && rng.chance(0.4)) {
          const side = rng.chance(0.5) ? 1 : -1;
          const q: Pt = [p[0] + t[0] * 1.9 * side - n[0] * 0.6, p[1] + t[1] * 1.9 * side - n[1] * 0.6];
          if (g.at(q[0], q[1]) === K.MARGIN) {
            const brazier = MARKETS.has(lm.category);
            const qy = H(q[0], q[1]) + 0.04;
            lamps.push({ x: q[0], y: qy + (brazier ? 0.85 : 1.42), z: q[1], kind: brazier ? 'stall' : 'fountain' });
            count(brazier ? 'brazier' : 'lampstand');
            add(q[0], q[1], (bb) => placeProp(new Draw(bb), brazier ? 'brazier' : 'lampstand', q[0], qy, q[1], 0, { variant: 0, ground: H }));
          }
        }
        if (item === 'stall') {
          spots.push({ id, kind: 'stall', position: new THREE.Vector3(p[0] - n[0] * 1.3, y, p[1] - n[1] * 1.3), heading: toStreet, tag: 'market' });
          const lit = corridor ? rng.chance(0.55) : rng.chance(0.25);
          if (lit) lamps.push({ x: p[0] + n[0] * 0.2, y: y + 1.25, z: p[1] + n[1] * 0.2, kind: 'stall' });
          add(p[0], p[1], (bb) => {
            const r = new Rng(seed);
            const d = new Draw(bb);
            // The stall's front (local −z) faces the street.
            placeProp(d, 'stall', p[0], y, p[1], toStreet + Math.PI, { rng: r, ground: H });
            if (lit) placeProp(d, 'oil_lamp', p[0] + n[0] * 0.2, y + 0.93, p[1] + n[1] * 0.2, toStreet, { collide: false });
            if (r.chance(0.6)) placeProp(d, r.pick(['basket', 'crate', 'sack', 'amphora_globular'] as const), p[0] - n[0] * 1.2 + t[0] * r.range(-0.9, 0.9), y, p[1] - n[1] * 1.2 + t[1] * r.range(-0.9, 0.9), r.range(0, 6), { rng: r, collide: false, ground: H });
          });
        } else if (item === 'goods' || item === 'amphorae') {
          spots.push({ id, kind: 'container', position: new THREE.Vector3(p[0] + n[0] * 1.1, y, p[1] + n[1] * 1.1), heading: toStreet + Math.PI, tag: item === 'amphorae' ? 'amphora_stack' : 'goods' });
          add(p[0], p[1], (bb) => {
            const r = new Rng(seed);
            const d = new Draw(bb);
            if (item === 'amphorae') placeProp(d, r.chance(0.5) ? 'amphora_stack' : 'amphora_rack', p[0], y, p[1], toStreet + Math.PI, { rng: r, ground: H });
            else {
              const kinds: PropKind[] = ['crate', 'sack', 'basket', 'dolium', 'crate', 'sack'];
              for (let i = 0; i < 4; i++) placeProp(d, r.pick(kinds), p[0] + t[0] * r.range(-1.3, 1.3) + n[0] * r.range(-0.6, 0.6), y, p[1] + t[1] * r.range(-1.3, 1.3) + n[1] * r.range(-0.6, 0.6), r.range(0, 6), { rng: r, collide: i < 2, ground: H });
            }
          });
        } else if (item === 'bench') {
          spots.push({ id, kind: 'bench', position: new THREE.Vector3(p[0] - n[0] * 0.5, y, p[1] - n[1] * 0.5), heading: toStreet });
          add(p[0], p[1], (bb) => placeProp(new Draw(bb), 'bench_masonry', p[0] - n[0] * 0.8, y, p[1] - n[1] * 0.8, toStreet + Math.PI, { variant: seed % 2, ground: H }));
        } else if (item === 'statue') {
          add(p[0], p[1], (bb) => placeProp(new Draw(bb), 'statue_pedestal', p[0] - n[0] * 0.6, y, p[1] - n[1] * 0.6, toStreet + Math.PI, { variant: seed % 3, ground: H }));
        }
      }
    }
  }

  // ---- washing lines across the narrow lanes of the dense quarters
  {
    const rng = new Rng('washing');
    for (const st of plan.streets) {
      if (st.kind === 'vicus' || st.steps.some(Boolean) || (st.density < 0.78 && !st.corridor)) continue;
      let acc = 0;
      for (let k = 0; k + 1 < st.points.length; k++) {
        const a = st.points[k], b = st.points[k + 1];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
        for (let s = 5 + (acc % 7); s < L - 4; s += rng.range(9, 16)) {
          if (!rng.chance(0.45)) continue;
          const t: Pt = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n: Pt = [-t[1], t[0]];
          const p: Pt = [a[0] + t[0] * s, a[1] + t[1] * s];
          if (!inArea(p[0], p[1])) continue;
          const half = st.width / 2 + 0.9;
          // Both ends on a built block (a facade), not a yard gap or open ground.
          const built = (sg: number) => {
            for (const dd of [1.5, 3]) {
              const i = g.index(p[0] + n[0] * (half + dd) * sg, p[1] + n[1] * (half + dd) * sg);
              if (i < 0 || g.cls[i] !== K.FREE) return false;
              const o = g.owner[i] - 2_000_000;
              if (o < 0 || plan.blocks[o]?.kind !== 'built') return false;
            }
            return true;
          };
          if (!built(1) || !built(-1)) continue;
          const y = H(p[0], p[1]) + rng.range(5.2, 6.4);
          const A: Pt = [p[0] - n[0] * half, p[1] - n[1] * half], B: Pt = [p[0] + n[0] * half, p[1] + n[1] * half];
          const seed = hash2(Math.round(p[0] * 10), Math.round(p[1] * 10), 77);
          count('washing');
          add(p[0], p[1], (bb) => washingLine(new Draw(bb), A, B, y, new Rng(seed)));
        }
        acc += L;
      }
    }
  }
  return { spots, lamps, trees, counts };
}

const CLOTH: MaterialId[] = ['fabric_white', 'fabric_white', 'fabric_ochre', 'fabric_red', 'fabric_blue', 'fabric_purple'];

/** A rope between two facades with a few pieces of cloth hanging from it (sagging slightly). */
function washingLine(d: Draw, A: Pt, B: Pt, y: number, rng: Rng) {
  const L = Math.hypot(B[0] - A[0], B[1] - A[1]);
  const sag = 0.25 + L * 0.03;
  const P = (f: number) => new THREE.Vector3(A[0] + (B[0] - A[0]) * f, y - sag * 4 * f * (1 - f), A[1] + (B[1] - A[1]) * f);
  for (let k = 0; k < 4; k++) d.rod('wood_dark', P(k / 4), P((k + 1) / 4), 0.008, 3, { shadow: false });
  const rot = Math.atan2(B[0] - A[0], B[1] - A[1]) + Math.PI / 2;
  const n = rng.int(2, 5);
  for (let i = 0; i < n; i++) {
    const f = (i + 0.6 + rng.range(-0.2, 0.2)) / (n + 0.2);
    const top = P(f);
    const w = rng.range(0.45, 0.95), h = rng.range(0.5, 1.1);
    d.box(rng.pick(CLOTH), top.x, top.y - h / 2, top.z, w, h, 0.02, { ry: rot });
  }
}
