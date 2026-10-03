/**
 * GrassField: instanced grass tufts (green and sun-dried) and wildflowers (poppies, daisies,
 * chamomile, chicory…) over a region of any size. Only the cells near the camera exist (generated
 * on demand into pooled InstancedMeshes, see `update`), each is frustum-culled on its own, and the
 * tufts shrink smoothly to nothing between `fadeStart` and `fadeEnd` in the vertex shader.
 */
import * as THREE from 'three';
import { Rng, hash2 } from '../../core/Rng';
import { fbm2, mergeParts, twoSided } from './geom';
import { vegMaterial } from './materials';

export interface GrassOptions {
  heightAt: (x: number, z: number) => number;
  /** Return false to keep a spot bare (roads, buildings, water). */
  mask?: (x: number, z: number) => boolean;
  /** Tufts per m². */
  density?: number;
  /** Flowers per m² (inside flowery patches). */
  flowers?: number;
  /** 0 = lush green … 1 = summer-dry. */
  dryness?: number;
  fadeStart?: number;
  fadeEnd?: number;
  cell?: number;
  seed?: number;
}

/** A tuft: 5 curved blades fanning out (double-sided), darker at the base. */
function tuftGeometry(seed: number): THREE.BufferGeometry {
  const r = new Rng(seed);
  const pos: number[] = [], col: number[] = [];
  const blades = 5;
  for (let i = 0; i < blades; i++) {
    const a = (i / blades) * Math.PI * 2 + r.range(-0.3, 0.3);
    const h = r.range(0.28, 0.55);
    const lean = r.range(0.08, 0.22);
    const w = 0.035;
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const side = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(w);
    const base = dir.clone().multiplyScalar(r.range(0, 0.06));
    const segs = 2;
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs, t1 = (k + 1) / segs;
      const p0 = base.clone().addScaledVector(dir, lean * t0 * t0).setY(h * t0);
      const p1 = base.clone().addScaledVector(dir, lean * t1 * t1).setY(h * t1);
      const s0 = side.clone().multiplyScalar(1 - t0), s1 = side.clone().multiplyScalar(Math.max(0.05, 1 - t1));
      const a0 = p0.clone().sub(s0), b0 = p0.clone().add(s0), a1 = p1.clone().sub(s1), b1 = p1.clone().add(s1);
      pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
      const c0 = 0.72 + 0.4 * t0, c1 = 0.72 + 0.4 * t1;
      col.push(c0, c0, c0, c0, c0, c0, c1, c1, c1, c0, c0, c0, c1, c1, c1, c1, c1, c1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return mergeParts([twoSided(g)], 1);
}

/** A flower: thin stem plus a small star-shaped head (aHead = 1 on the head). */
function flowerGeometry(): THREE.BufferGeometry {
  const pos: number[] = [], col: number[] = [], head: number[] = [];
  const h = 0.42;
  pos.push(-0.006, 0, 0, 0.006, 0, 0, 0.004, h, 0, -0.006, 0, 0, 0.004, h, 0, -0.004, h, 0);
  for (let i = 0; i < 6; i++) { col.push(0.45, 0.62, 0.3); head.push(0); }
  const petals = 5, rIn = 0.012, rOut = 0.045;
  for (let i = 0; i < petals; i++) {
    const a0 = (i / petals) * Math.PI * 2, a1 = a0 + Math.PI / petals, a2 = a0 + (2 * Math.PI) / petals;
    const c = [0, h + 0.005, 0];
    const p0 = [Math.cos(a0) * rIn, h + 0.005, Math.sin(a0) * rIn];
    const p1 = [Math.cos(a1) * rOut, h + 0.02, Math.sin(a1) * rOut];
    const p2 = [Math.cos(a2) * rIn, h + 0.005, Math.sin(a2) * rIn];
    pos.push(...c, ...p0, ...p1, ...c, ...p1, ...p2);
    for (let k = 0; k < 6; k++) { col.push(1, 1, 1); head.push(1); }
  }
  // Centre dot (stays yellowish: not tinted).
  pos.push(-0.01, h + 0.025, -0.01, 0.01, h + 0.025, -0.01, 0, h + 0.025, 0.012);
  for (let k = 0; k < 3; k++) { col.push(1.4, 1.1, 0.2); head.push(0); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('aHead', new THREE.Float32BufferAttribute(head, 1));
  const n = new Float32Array(pos.length);
  for (let i = 0; i < n.length; i += 3) { n[i + 1] = 1; }
  g.setAttribute('normal', new THREE.BufferAttribute(n, 3));
  return mergeParts([twoSided(g)], 1);
}

const FLOWERS = [0xd8261c, 0xd8261c, 0xf4f1e6, 0xf2d64b, 0x8a7ad8, 0xe9e2f2].map((c) => new THREE.Color(c));

/** A pooled set of instanced meshes (green tufts, dry tufts, flowers) showing one cell at a time. */
interface Slot {
  meshes: [THREE.InstancedMesh, THREE.InstancedMesh, THREE.InstancedMesh];
  sphere: THREE.Sphere;
  count: number;
}

/**
 * Grass is generated lazily, cell by cell, in a ring around the camera (radius ≈ `fadeEnd` + ¾
 * cell), with a deterministic seed per cell, so memory and build time do not depend on the size of
 * the field. Cells leaving the ring hand their meshes back to a small pool; matrices are written
 * straight into the pooled instance buffers.
 */
export class GrassField {
  readonly group = new THREE.Group();
  private o: Required<Omit<GrassOptions, 'mask'>> & { mask?: GrassOptions['mask'] };
  private lastCam = new THREE.Vector3(Infinity, 0, 0);
  private active = new Map<string, Slot>();
  private pool: Slot[] = [];
  private slots = 0;
  private pending = false;
  private geos: THREE.BufferGeometry[] = [];
  private mats: THREE.Material[] = [];
  private cap = [0, 0, 0];
  /** Instances in the cells currently generated. */
  instanceCount = 0;

  constructor(
    private readonly bounds: { minX: number; minZ: number; maxX: number; maxZ: number },
    opts: GrassOptions,
  ) {
    this.o = {
      density: 2.6, flowers: 0.5, dryness: 0.45, fadeStart: 26, fadeEnd: 42, cell: 20, seed: 21, ...opts,
    };
    this.group.name = 'grass';
  }

  /** Cells currently generated. */
  get cellCount() {
    return this.active.size;
  }

  /** Pooled mesh sets created so far (bounded by the ring size, not the field size). */
  get poolSize() {
    return this.slots;
  }

  /** Prepare shared geometry and materials. Cells appear as `update(camera)` runs. */
  build(): THREE.Group {
    if (this.geos.length) return this.group;
    const o = this.o;
    const fade: [number, number] = [o.fadeStart, o.fadeEnd];
    this.geos = [tuftGeometry(1), tuftGeometry(2), flowerGeometry()];
    this.mats = [
      vegMaterial('grass', { sway: 0.25, flutter: 0.0, fade }),
      vegMaterial('dry_grass', { sway: 0.25, flutter: 0.0, fade }),
      vegMaterial('fabric_white', { sway: 0.35, flutter: 0.0, fade, heads: true }),
    ];
    const area = o.cell * o.cell;
    this.cap = [Math.ceil(area * o.density) + 1, Math.ceil(area * o.density) + 1, Math.ceil(area * o.flowers) + 1];
    return this.group;
  }

  /**
   * Generate the cells that came within range of the camera (nearest first, at most `budget` per
   * call) and recycle the ones that left it.
   */
  update(cam: THREE.Vector3, budget = 8) {
    if (!this.geos.length) this.build();
    if (!this.pending && cam.distanceToSquared(this.lastCam) < 1) return;
    this.lastCam.copy(cam);
    const o = this.o;
    const lim = o.fadeEnd + o.cell * 0.75;
    const { minX, minZ, maxX, maxZ } = this.bounds;
    const ix0 = Math.max(0, Math.floor((cam.x - lim - minX) / o.cell)), ix1 = Math.min(Math.ceil((maxX - minX) / o.cell) - 1, Math.floor((cam.x + lim - minX) / o.cell));
    const iz0 = Math.max(0, Math.floor((cam.z - lim - minZ) / o.cell)), iz1 = Math.min(Math.ceil((maxZ - minZ) / o.cell) - 1, Math.floor((cam.z + lim - minZ) / o.cell));
    const want: { key: string; ix: number; iz: number; d: number }[] = [];
    for (let ix = ix0; ix <= ix1; ix++) {
      for (let iz = iz0; iz <= iz1; iz++) {
        const cx = minX + (ix + 0.5) * o.cell, cz = minZ + (iz + 0.5) * o.cell;
        const d = Math.hypot(cx - cam.x, o.heightAt(cx, cz) - cam.y, cz - cam.z);
        if (d < lim) want.push({ key: `${ix},${iz}`, ix, iz, d });
      }
    }
    const keep = new Set(want.map((w) => w.key));
    for (const [key, slot] of this.active) {
      if (keep.has(key)) continue;
      this.active.delete(key);
      this.instanceCount -= slot.count;
      for (const m of slot.meshes) { m.count = 0; m.visible = false; }
      this.pool.push(slot);
    }
    const todo = want.filter((w) => !this.active.has(w.key)).sort((a, b) => a.d - b.d);
    for (const w of todo.slice(0, budget)) {
      const slot = this.pool.pop() ?? this.newSlot();
      this.fill(slot, w.ix, w.iz);
      this.active.set(w.key, slot);
      this.instanceCount += slot.count;
    }
    this.pending = todo.length > budget;
  }

  private newSlot(): Slot {
    this.slots++;
    const meshes = [0, 1, 2].map((k) => {
      const m = new THREE.InstancedMesh(this.geos[k], this.mats[k], this.cap[k]);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (k === 2) m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(this.cap[k] * 3).fill(1), 3);
      m.castShadow = false;
      m.receiveShadow = true;
      m.name = 'grass';
      m.count = 0;
      m.visible = false;
      this.group.add(m);
      return m;
    }) as Slot['meshes'];
    const sphere = new THREE.Sphere();
    for (const m of meshes) m.boundingSphere = sphere;
    return { meshes, sphere, count: 0 };
  }

  /** Scatter one cell (deterministic per cell and seed) into a slot's instance buffers. */
  private fill(slot: Slot, ix: number, iz: number) {
    const o = this.o;
    const rng = new Rng(hash2(ix, iz, o.seed));
    const x0 = this.bounds.minX + ix * o.cell, z0 = this.bounds.minZ + iz * o.cell;
    const x1 = Math.min(this.bounds.maxX, x0 + o.cell), z1 = Math.min(this.bounds.maxZ, z0 + o.cell);
    const area = (x1 - x0) * (z1 - z0);
    const arrs = slot.meshes.map((m) => m.instanceMatrix.array as Float32Array);
    const colors = slot.meshes[2].instanceColor!.array as Float32Array;
    const n = [0, 0, 0];
    let ymin = Infinity, ymax = -Infinity;
    const put = (k: number, x: number, y: number, z: number, a: number, sx: number, sy: number) => {
      const e = arrs[k], i = n[k]++ * 16;
      const c = Math.cos(a), s = Math.sin(a);
      // Column-major: rotation about Y by a, scale (sx, sy, sx), translation (x, y, z).
      e[i] = c * sx; e[i + 1] = 0; e[i + 2] = -s * sx; e[i + 3] = 0;
      e[i + 4] = 0; e[i + 5] = sy; e[i + 6] = 0; e[i + 7] = 0;
      e[i + 8] = s * sx; e[i + 9] = 0; e[i + 10] = c * sx; e[i + 11] = 0;
      e[i + 12] = x; e[i + 13] = y; e[i + 14] = z; e[i + 15] = 1;
      ymin = Math.min(ymin, y); ymax = Math.max(ymax, y);
    };
    const nT = Math.min(this.cap[0], Math.round(area * o.density));
    for (let i = 0; i < nT; i++) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1);
      const a = rng.range(0, Math.PI * 2), r1 = rng.range(0.7, 1.3), r2 = rng.range(0.8, 1.25);
      if (o.mask && !o.mask(x, z)) continue;
      const patch = fbm2(x * 0.08, z * 0.08, o.seed);
      if (patch < 0.28) continue; // bare patches
      const isDry = fbm2(x * 0.05 + 40, z * 0.05, o.seed + 1) < o.dryness;
      const sc = r1 * (0.6 + patch * 0.7);
      put(isDry ? 1 : 0, x, o.heightAt(x, z) - 0.02, z, a, sc, sc * r2);
    }
    const nF = Math.min(this.cap[2], Math.round(area * o.flowers));
    for (let i = 0; i < nF; i++) {
      const x = rng.range(x0, x1), z = rng.range(z0, z1);
      const a = rng.range(0, Math.PI * 2), sc = rng.range(0.7, 1.2), stray = rng.chance(0.15), pick = rng.pick(FLOWERS);
      if (o.mask && !o.mask(x, z)) continue;
      const meadow = fbm2(x * 0.06 + 13, z * 0.06 - 7, o.seed + 2);
      if (meadow < 0.55) continue;
      // One colour per meadow area, with a few strays.
      const col = stray ? pick : FLOWERS[Math.floor(fbm2(x * 0.04, z * 0.04, 99) * FLOWERS.length) % FLOWERS.length];
      colors[n[2] * 3] = col.r; colors[n[2] * 3 + 1] = col.g; colors[n[2] * 3 + 2] = col.b;
      put(2, x, o.heightAt(x, z) - 0.02, z, a, sc, sc);
    }
    slot.meshes.forEach((m, k) => {
      m.count = n[k];
      m.visible = n[k] > 0;
      m.instanceMatrix.clearUpdateRanges();
      m.instanceMatrix.addUpdateRange(0, n[k] * 16);
      m.instanceMatrix.needsUpdate = true;
    });
    const ci = slot.meshes[2].instanceColor!;
    ci.clearUpdateRanges();
    ci.addUpdateRange(0, n[2] * 3);
    ci.needsUpdate = true;
    slot.count = n[0] + n[1] + n[2];
    if (ymin > ymax) ymin = ymax = 0;
    const hw = Math.max(x1 - x0, z1 - z0) / 2;
    slot.sphere.center.set((x0 + x1) / 2, (ymin + ymax) / 2 + 0.3, (z0 + z1) / 2);
    slot.sphere.radius = Math.hypot(hw * Math.SQRT2 + 0.6, (ymax - ymin) / 2 + 0.6);
  }
}
