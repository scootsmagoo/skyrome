/**
 * GrassField: instanced grass tufts (green and sun-dried) and wildflowers (poppies, daisies,
 * chamomile, chicory…) over a region, chunked into cells so frustum culling and distance culling
 * work, and shrunk smoothly to nothing between `fadeStart` and `fadeEnd` in the vertex shader.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
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

const FLOWERS = [0xd8261c, 0xd8261c, 0xf4f1e6, 0xf2d64b, 0x8a7ad8, 0xe9e2f2];

interface Cell {
  center: THREE.Vector3;
  meshes: THREE.InstancedMesh[];
}

export class GrassField {
  readonly group = new THREE.Group();
  private cells: Cell[] = [];
  private o: Required<Omit<GrassOptions, 'mask'>> & { mask?: GrassOptions['mask'] };
  private lastCam = new THREE.Vector3(Infinity, 0, 0);
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

  build(): THREE.Group {
    const o = this.o;
    const rng = new Rng(o.seed);
    const green = tuftGeometry(1), dry = tuftGeometry(2), flower = flowerGeometry();
    const fade: [number, number] = [o.fadeStart, o.fadeEnd];
    const gMat = vegMaterial('grass', { sway: 0.25, flutter: 0.0, fade });
    const dMat = vegMaterial('dry_grass', { sway: 0.25, flutter: 0.0, fade });
    const fMat = vegMaterial('fabric_white', { sway: 0.35, flutter: 0.0, fade, heads: true });
    const { minX, minZ, maxX, maxZ } = this.bounds;
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(), p = new THREE.Vector3();
    for (let cx = minX; cx < maxX; cx += o.cell) {
      for (let cz = minZ; cz < maxZ; cz += o.cell) {
        const lists: THREE.Matrix4[][] = [[], [], []];
        const colors: THREE.Color[] = [];
        const x1 = Math.min(maxX, cx + o.cell), z1 = Math.min(maxZ, cz + o.cell);
        const area = (x1 - cx) * (z1 - cz);
        const nT = Math.round(area * o.density);
        for (let i = 0; i < nT; i++) {
          const x = rng.range(cx, x1), z = rng.range(cz, z1);
          if (o.mask && !o.mask(x, z)) continue;
          const patch = fbm2(x * 0.08, z * 0.08, o.seed);
          if (patch < 0.28) continue; // bare patches
          const isDry = fbm2(x * 0.05 + 40, z * 0.05, o.seed + 1) < o.dryness;
          const sc = rng.range(0.7, 1.3) * (0.6 + patch * 0.7);
          m4.compose(p.set(x, o.heightAt(x, z) - 0.02, z), q.setFromAxisAngle(up, rng.range(0, Math.PI * 2)), s.set(sc, sc * rng.range(0.8, 1.25), sc));
          lists[isDry ? 1 : 0].push(m4.clone());
        }
        const nF = Math.round(area * o.flowers);
        for (let i = 0; i < nF; i++) {
          const x = rng.range(cx, x1), z = rng.range(cz, z1);
          if (o.mask && !o.mask(x, z)) continue;
          const meadow = fbm2(x * 0.06 + 13, z * 0.06 - 7, o.seed + 2);
          if (meadow < 0.55) continue;
          const sc = rng.range(0.7, 1.2);
          m4.compose(p.set(x, o.heightAt(x, z) - 0.02, z), q.setFromAxisAngle(up, rng.range(0, Math.PI * 2)), s.set(sc, sc, sc));
          lists[2].push(m4.clone());
          // One colour per meadow area, with a few strays.
          const base = FLOWERS[Math.floor(fbm2(x * 0.04, z * 0.04, 99) * FLOWERS.length) % FLOWERS.length];
          colors.push(new THREE.Color(rng.chance(0.85) ? base : rng.pick(FLOWERS)));
        }
        const cell: Cell = { center: new THREE.Vector3((cx + x1) / 2, o.heightAt((cx + x1) / 2, (cz + z1) / 2), (cz + z1) / 2), meshes: [] };
        const geos = [green, dry, flower], mats = [gMat, dMat, fMat];
        lists.forEach((list, k) => {
          if (!list.length) return;
          const m = new THREE.InstancedMesh(geos[k], mats[k], list.length);
          list.forEach((mm, i) => m.setMatrixAt(i, mm));
          if (k === 2) colors.forEach((c, i) => m.setColorAt(i, c));
          m.castShadow = false;
          m.receiveShadow = true;
          m.computeBoundingSphere();
          m.name = 'grass';
          cell.meshes.push(m);
          this.group.add(m);
          this.instanceCount += list.length;
        });
        if (cell.meshes.length) this.cells.push(cell);
      }
    }
    return this.group;
  }

  /** Hide whole cells beyond the fade distance. */
  update(cam: THREE.Vector3) {
    if (cam.distanceToSquared(this.lastCam) < 1) return;
    this.lastCam.copy(cam);
    const lim = this.o.fadeEnd + this.o.cell * 0.75;
    for (const c of this.cells) {
      const vis = Math.hypot(c.center.x - cam.x, c.center.z - cam.z) < lim;
      for (const m of c.meshes) m.visible = vis;
    }
  }
}
