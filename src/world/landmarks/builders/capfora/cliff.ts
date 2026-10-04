/**
 * A rock face draped over a terrain cliff (the Tarpeian Rock, the Capitoline's flanks): the face
 * only covers the steep stretch of each terrain profile — found by scanning the ground from the
 * hilltop outwards — so it never lies on flat ground like a rug. It is stratified (ledges every
 * ~0.5–0.9 m that step out over the slope, like the bedded tufa of the Capitol) and cut by
 * vertical fissures; its edges tuck under the terrain at the brink, the foot and both ends.
 * Boulders fallen from it lie along the foot.
 *
 * Frame: the cliff faces −z (the scan runs from `zStart` towards `zEnd` < `zStart`), columns along
 * x. GAME metres; `groundAt` in the same frame.
 */
import * as THREE from 'three';
import { Rng } from '../../../../core/Rng';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';

export interface CliffSpec {
  x0: number;
  x1: number;
  /** Column spacing along x. */
  step: number;
  /** Scan start (on top, behind the brink) and limit (beyond the foot). */
  zStart: number;
  zEnd: number;
  rows: number;
  /** Minimum drop (m) for a column to be cliff. */
  minDrop?: number;
  /** x ranges left open (stairs, paths). */
  gaps?: [number, number][];
  /** Override the brink z per column (e.g. keep the face in front of a terrace). */
  clampTop?: (x: number) => number | undefined;
  seed?: string;
  boulders?: boolean;
}

export interface CliffColumn {
  x: number;
  zTop: number;
  zFoot: number;
  yTop: number;
  yFoot: number;
}

/** Pure: the brink and foot of each terrain column (exported for tests). */
export function cliffColumns(groundAt: (x: number, z: number) => number, spec: CliffSpec): (CliffColumn | null)[] {
  const out: (CliffColumn | null)[] = [];
  const minDrop = spec.minDrop ?? 4;
  const n = Math.max(1, Math.round((spec.x1 - spec.x0) / spec.step));
  for (let i = 0; i <= n; i++) {
    const x = spec.x0 + ((spec.x1 - spec.x0) * i) / n;
    if (spec.gaps?.some(([a, c]) => x > a && x < c)) {
      out.push(null);
      continue;
    }
    const y0 = groundAt(x, spec.zStart);
    let zTop: number | null = null;
    let gMin = Infinity;
    for (let z = spec.zStart; z >= spec.zEnd; z -= 0.5) {
      const g = groundAt(x, z);
      if (zTop === null && g < y0 - 0.8) zTop = z + 0.5;
      if (zTop !== null) gMin = Math.min(gMin, g);
    }
    if (zTop === null) {
      out.push(null);
      continue;
    }
    const clamp = spec.clampTop?.(x);
    if (clamp !== undefined) zTop = Math.min(zTop, clamp);
    // The foot: where the slope flattens out (under ~0.35 m per m) once most of the drop is done.
    const yT = groundAt(x, zTop);
    let zFoot = spec.zEnd;
    for (let z = zTop - 1.5; z >= spec.zEnd + 1; z -= 0.5) {
      const gz = groundAt(x, z);
      const slope = gz - groundAt(x, z - 1);
      if ((slope < 0.35 && yT - gz > minDrop * 0.7) || gz < gMin + 0.4) {
        zFoot = z;
        break;
      }
    }
    const yTop = groundAt(x, zTop);
    const yFoot = groundAt(x, zFoot);
    out.push(yTop - yFoot >= minDrop && zTop - zFoot > 1.5 ? { x, zTop, zFoot, yTop, yFoot } : null);
  }
  return out;
}

export function cliffFace(b: MeshBuilder, groundAt: (x: number, z: number) => number, spec: CliffSpec, at?: THREE.Matrix4): CliffColumn[] {
  const cols = cliffColumns(groundAt, spec);
  const rng = new Rng(spec.seed ?? 'cliff');
  const rows = Math.max(3, spec.rows);
  const found: CliffColumn[] = [];
  // Runs of consecutive cliff columns become separate strips.
  let i = 0;
  while (i < cols.length) {
    if (!cols[i]) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < cols.length && cols[j + 1]) j++;
    const run = cols.slice(i, j + 1) as CliffColumn[];
    found.push(...run);
    if (run.length >= 2) strip(b, groundAt, run, rows, rng, at);
    i = j + 1;
  }
  if (spec.boulders ?? true) boulders(b, groundAt, found, rng, at);
  return found;
}

function strip(b: MeshBuilder, groundAt: (x: number, z: number) => number, run: CliffColumn[], rows: number, rng: Rng, at?: THREE.Matrix4) {
  const nc = run.length;
  const pos = new Float32Array(nc * rows * 3);
  const phase = rng.range(0, 10);
  for (let c = 0; c < nc; c++) {
    const col = run[c];
    // Taper the relief to nothing over the first/last two columns so the strip ends in the slope.
    const endW = Math.min(1, Math.min(c, nc - 1 - c) / 2);
    for (let r = 0; r < rows; r++) {
      const v = r / (rows - 1);
      // From just behind the brink to just beyond the foot.
      const z = col.zTop + 0.6 + (col.zFoot - 0.6 - (col.zTop + 0.6)) * v;
      const g = groundAt(col.x, z);
      const edge = r === 0 || r === rows - 1 || endW === 0;
      let y = g;
      let dz = 0;
      if (edge) y = g - 0.3;
      else {
        const env = Math.pow(Math.sin(Math.PI * v), 0.5) * endW;
        // Strata: bands that step out over the slope (sawtooth in height), plus vertical fissures.
        const band = g * 1.35 + Math.sin(col.x * 0.21 + phase) * 0.8;
        const saw = band - Math.floor(band);
        const fiss = Math.abs(Math.sin(col.x * 1.37 + phase * 0.3)) * 0.35 + Math.abs(Math.sin(col.x * 0.47 + 1.3)) * 0.3;
        dz = -env * (0.35 + 0.9 * saw + fiss);
        y = g + env * 0.15;
      }
      const k = (c * rows + r) * 3;
      pos[k] = col.x;
      pos[k + 1] = y;
      pos[k + 2] = z + dz;
    }
  }
  const idx: number[] = [];
  for (let c = 0; c < nc - 1; c++)
    for (let r = 0; r < rows - 1; r++) {
      const a = c * rows + r;
      const bb = (c + 1) * rows + r;
      // Winding so the face's normal points outwards (−z, up the slope's normal).
      idx.push(a, bb, a + 1, bb, bb + 1, a + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setIndex(idx);
  const flat = geo.toNonIndexed();
  flat.computeVertexNormals();
  b.add(flat, 'rock', at, { uvScale: 3 });
}

function boulders(b: MeshBuilder, groundAt: (x: number, z: number) => number, cols: CliffColumn[], rng: Rng, at?: THREE.Matrix4) {
  const base = new THREE.IcosahedronGeometry(1, 0);
  for (let i = 0; i < cols.length; i += 2) {
    const col = cols[i];
    const n = rng.int(0, 2);
    for (let k = 0; k < n; k++) {
      const r = rng.range(0.35, 1.25);
      const x = col.x + rng.range(-1.2, 1.2);
      const z = col.zFoot - rng.range(-0.5, 2.8);
      const y = groundAt(x, z) + r * 0.35;
      const m = new THREE.Matrix4().compose(
        new THREE.Vector3(x, y, z),
        new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 3), rng.range(0, 6.3), rng.range(0, 3))),
        new THREE.Vector3(r * rng.range(0.8, 1.3), r * rng.range(0.55, 0.9), r * rng.range(0.8, 1.2)),
      );
      b.add(base.clone().applyMatrix4(m), 'rock', at, { uvScale: 2 });
      if (r > 0.75) {
        const c = new THREE.Vector3(x, y, z);
        if (at) c.applyMatrix4(at);
        b.collider({ kind: 'cylinder', center: c, halfHeight: r * 0.6, radius: r * 0.85 });
      }
    }
  }
}
