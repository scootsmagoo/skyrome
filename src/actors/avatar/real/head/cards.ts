/**
 * Accumulates the geometry of hair: ribbons ("cards": three vertices across, curved along a path),
 * tubes (plaits, curls, coils) and scalp-cap grids, all skinned to the head bone (or blended down the neck
 * for a tail). One BufferGeometry results, with the attributes the hair material wants:
 * position, normal, uv (hairTexture.ts regions), color, strand (direction root -> tip), skinIndex, skinWeight.
 */
import * as THREE from 'three';
import { B } from '../../rig';
import { HAIR_UV } from './hairTexture';

export type Region = readonly [number, number];
export type WeightsFn = (t: number) => readonly [number, number, number, number, number, number, number, number];
const HEAD_W = [B.head, 1, 0, 0, 0, 0, 0, 0] as const;

export interface VertexIn {
  p: THREE.Vector3;
  n: THREE.Vector3;
  u: number;
  v: number;
  c: THREE.Color;
  t: THREE.Vector3;
  w?: readonly number[];
}

export class HairBuilder {
  private pos: number[] = [];
  private nor: number[] = [];
  private uvs: number[] = [];
  private col: number[] = [];
  private str: number[] = [];
  private si: number[] = [];
  private sw: number[] = [];
  private idx: number[] = [];

  get vertexCount() {
    return this.pos.length / 3;
  }
  get triangleCount() {
    return this.idx.length / 3;
  }

  vertex(a: VertexIn): number {
    const i = this.vertexCount;
    this.pos.push(a.p.x, a.p.y, a.p.z);
    this.nor.push(a.n.x, a.n.y, a.n.z);
    this.uvs.push(a.u, a.v);
    this.col.push(a.c.r, a.c.g, a.c.b);
    this.str.push(a.t.x, a.t.y, a.t.z);
    const w = a.w ?? HEAD_W;
    for (let k = 0; k < 8; k += 2) {
      this.si.push(w[k] ?? 0);
      this.sw.push(w[k + 1] ?? 0);
    }
    return i;
  }

  tri(a: number, b: number, c: number) {
    this.idx.push(a, b, c);
  }

  /**
   * A ribbon along `path` (>= 2 points), `width(t)` wide (t 0 root ... 1 tip), facing `normal(t)`.
   * Three vertices across, the middle one lifted a little so the card has a rounded section.
   */
  ribbon(
    path: readonly THREE.Vector3[],
    width: (t: number) => number,
    normal: (t: number, i: number) => THREE.Vector3,
    color: THREE.Color,
    opts: { region?: Region; shade?: (t: number) => number; lift?: number; weights?: WeightsFn; v1?: number } = {},
  ) {
    const region = opts.region ?? HAIR_UV.strand;
    const n = path.length;
    const base = this.vertexCount;
    const lift = opts.lift ?? 0.12;
    const side = new THREE.Vector3();
    const tan = new THREE.Vector3();
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      tan.subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize();
      const nm = normal(t, i);
      side.crossVectors(tan, nm).normalize();
      const w = width(t) * 0.5;
      const shade = opts.shade ? opts.shade(t) : 0.8 + 0.3 * t;
      c.copy(color).multiplyScalar(shade);
      const wts = opts.weights ? opts.weights(t) : undefined;
      for (let k = -1; k <= 1; k++) {
        p.copy(path[i]).addScaledVector(side, k * w).addScaledVector(nm, (1 - k * k) * lift * w);
        // Tilt the shading normal toward the side so a card reads as a rounded lock.
        const sn = nm.clone().addScaledVector(side, k * 0.45).normalize();
        this.vertex({ p, n: sn, u: region[0] + ((k + 1) / 2) * (region[1] - region[0]), v: t * (opts.v1 ?? 0.97), c, t: tan, w: wts });
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let k = 0; k < 2; k++) {
        const a = base + i * 3 + k;
        const b = a + 1;
        const c2 = base + (i + 1) * 3 + k + 1;
        const d = base + (i + 1) * 3 + k;
        this.tri(a, b, c2);
        this.tri(a, c2, d);
      }
  }

  /** A tube along `path`: `segs` vertices around, texture u around the tube, v along it. */
  tube(
    path: readonly THREE.Vector3[],
    radius: (t: number) => number,
    segs: number,
    color: THREE.Color,
    opts: { region?: Region; shade?: (t: number, a: number) => number; weights?: WeightsFn; vRepeat?: number; capEnd?: boolean } = {},
  ) {
    const region = opts.region ?? HAIR_UV.plait;
    const n = path.length;
    const base = this.vertexCount;
    const tan = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    const bin = new THREE.Vector3();
    const prev = new THREE.Vector3(0, 0, 1);
    const p = new THREE.Vector3();
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1);
      tan.subVectors(path[Math.min(n - 1, i + 1)], path[Math.max(0, i - 1)]).normalize();
      // Parallel-transported frame.
      nrm.copy(prev).addScaledVector(tan, -prev.dot(tan));
      if (nrm.lengthSq() < 1e-8) nrm.set(1, 0, 0).addScaledVector(tan, -tan.x);
      nrm.normalize();
      prev.copy(nrm);
      bin.crossVectors(tan, nrm);
      const r = radius(t);
      const wts = opts.weights ? opts.weights(t) : undefined;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        const o = nrm.clone().multiplyScalar(dx).addScaledVector(bin, dy);
        p.copy(path[i]).addScaledVector(o, r);
        const sh = opts.shade ? opts.shade(t, a) : 0.7 + 0.35 * Math.sin(a + t * 3);
        c.copy(color).multiplyScalar(sh);
        this.vertex({ p, n: o, u: region[0] + (s / segs) * (region[1] - region[0]), v: (t * (opts.vRepeat ?? 1)) % 1, c, t: tan, w: wts });
      }
    }
    for (let i = 0; i < n - 1; i++)
      for (let s = 0; s < segs; s++) {
        const a = base + i * segs + s;
        const b = base + i * segs + ((s + 1) % segs);
        const c2 = base + (i + 1) * segs + ((s + 1) % segs);
        const d = base + (i + 1) * segs + s;
        this.tri(a, d, c2);
        this.tri(a, c2, b);
      }
    if (opts.capEnd) {
      // Close the far end with a fan to the last path point.
      const ci = this.vertex({ p: path[n - 1], n: tan.clone(), u: region[0], v: 0.5, c: color, t: tan, w: opts.weights ? opts.weights(1) : undefined });
      for (let s = 0; s < segs; s++) this.tri(ci, base + (n - 1) * segs + ((s + 1) % segs), base + (n - 1) * segs + s);
    }
  }

  build(): THREE.BufferGeometry {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.uvs, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(this.col, 3));
    g.setAttribute('strand', new THREE.Float32BufferAttribute(this.str, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(this.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(this.sw, 4));
    const n = this.vertexCount;
    g.setIndex(n > 65535 ? new THREE.Uint32BufferAttribute(this.idx, 1) : new THREE.Uint16BufferAttribute(this.idx, 1));
    return g;
  }
}
