/**
 * Coplanar faces of different materials, facing the same way, flicker in blocks as the camera
 * moves (z-fighting): the depth buffer cannot tell which is in front. Procedural builders make
 * them all the time — a coping slab whose top is flush with the wall it caps, plaster laid exactly
 * on the inner face of a brick wall, a floor band level with the floor.
 *
 * `separateCoplanar` finds them before the parts are merged and sinks the loser of each pair by
 * GAP along its normal, so one face is cleanly in front. The winner is the face already in front
 * by more than a millimetre, else the one added LAST (finishes, plaster, paving and copings are
 * added after the masses they cover). Same-material overlaps are left alone: box UVs are in world
 * space, so both draw the same pixels.
 *
 * Triangles are moved one by one (the geometries are non-indexed), so a sunk face leaves a
 * millimetre-wide seam at its edges, under the face that covers it.
 */
import type * as THREE from 'three';

/** How far the losing face ends up behind the winner (m). */
export const GAP = 0.006;
/** Faces closer than this (m) along their normal count as coplanar. */
const EPS = 0.004;

export interface CoplanarPart {
  geometry: THREE.BufferGeometry;
  /** Material key: overlaps within one material are ignored. */
  material: string;
  /** Add order: later parts win ties. */
  seq: number;
}

interface Tri {
  /** The axis the plane is most perpendicular to (dropped when projecting). */
  drop: number;
  part: number;
  i: number; // first vertex index
  nx: number;
  ny: number;
  nz: number;
  d: number;
  min: [number, number, number];
  max: [number, number, number];
}

/** Numeric plane key: quantised normal (to ~1°) and offset (to EPS). */
function planeKey(nx: number, ny: number, nz: number, dq: number): number {
  return (((Math.round(nx * 60) + 60) * 121 + Math.round(ny * 60) + 60) * 121 + Math.round(nz * 60) + 60) + 1771561 * (dq + 4_000_000);
}

interface Bucket {
  tris: Tri[];
  mat: number;
  mixed: boolean;
  /** First triangle of the plane in pass 1's chain (−1: none). */
  head: number;
}

/** Moves losing triangles in place; returns how many were moved. */
export function separateCoplanar(parts: CoplanarPart[]): number {
  const matId = new Map<string, number>();
  const pm = parts.map((p) => {
    let id = matId.get(p.material);
    if (id === undefined) matId.set(p.material, (id = matId.size));
    return id;
  });
  if (matId.size < 2) return 0;
  // Pass 1: plane key of every triangle (typed arrays, no objects), and which planes mix materials.
  let total = 0;
  for (const p of parts) {
    const pos = p.geometry.getAttribute('position');
    if (pos && !p.geometry.index) total += Math.floor(pos.count / 3);
  }
  const next = new Int32Array(total);
  const tpart = new Int32Array(total);
  const toff = new Int32Array(total);
  const planes = new Map<number, Bucket>();
  let n = 0;
  parts.forEach((p, pi) => {
    const pos = p.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (!pos || p.geometry.index) return;
    const a = pos.array as Float32Array;
    const m = pm[pi];
    for (let i = 0; i + 8 < a.length; i += 9) {
      const ux = a[i + 3] - a[i], uy = a[i + 4] - a[i + 1], uz = a[i + 5] - a[i + 2];
      const vx = a[i + 6] - a[i], vy = a[i + 7] - a[i + 1], vz = a[i + 8] - a[i + 2];
      const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
      const l = Math.sqrt(cx * cx + cy * cy + cz * cz);
      if (l < 0.1) continue; // under 0.05 m² (mouldings, flutes, trim: flicker there is too small to see)
      const nx = cx / l, ny = cy / l, nz = cz / l;
      const k = planeKey(nx, ny, nz, Math.floor((nx * a[i] + ny * a[i + 1] + nz * a[i + 2]) / EPS));
      tpart[n] = pi;
      toff[n] = i;
      const bk = planes.get(k);
      if (!bk) {
        next[n] = -1;
        planes.set(k, { tris: [], mat: m, mixed: false, head: n });
      } else {
        if (bk.mat !== m) bk.mixed = true;
        next[n] = bk.head;
        bk.head = n;
      }
      n++;
    }
  });
  // A plane matters if it mixes materials, or its neighbour slot holds another material.
  const relevant = (k: number) => {
    const bk = planes.get(k)!;
    if (bk.mixed) return true;
    const nb = planes.get(k + 1771561), pb = planes.get(k - 1771561);
    return (!!nb && (nb.mixed || nb.mat !== bk.mat)) || (!!pb && (pb.mixed || pb.mat !== bk.mat));
  };
  // Pass 2: objects only for the triangles of those planes.
  const buckets = new Map<number, Bucket>();
  for (const [k, pl] of planes) {
    if (!relevant(k)) continue;
    const bk: Bucket = { tris: [], mat: pl.mat, mixed: pl.mixed, head: -1 };
    buckets.set(k, bk);
    for (let t = pl.head; t >= 0; t = next[t]) {
      const pi = tpart[t], i = toff[t];
      const a = (parts[pi].geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
      const ux = a[i + 3] - a[i], uy = a[i + 4] - a[i + 1], uz = a[i + 5] - a[i + 2];
      const vx = a[i + 6] - a[i], vy = a[i + 7] - a[i + 1], vz = a[i + 8] - a[i + 2];
      let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const l = Math.sqrt(nx * nx + ny * ny + nz * nz); // not Math.hypot: it allocates
      nx /= l;
      ny /= l;
      nz /= l;
      const ax = Math.abs(nx), ay = Math.abs(ny), az = Math.abs(nz);
      bk.tris.push({
        drop: ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2,
        part: pi,
        i,
        nx,
        ny,
        nz,
        d: nx * a[i] + ny * a[i + 1] + nz * a[i + 2],
        min: [Math.min(a[i], a[i + 3], a[i + 6]), Math.min(a[i + 1], a[i + 4], a[i + 7]), Math.min(a[i + 2], a[i + 5], a[i + 8])],
        max: [Math.max(a[i], a[i + 3], a[i + 6]), Math.max(a[i + 1], a[i + 4], a[i + 7]), Math.max(a[i + 2], a[i + 5], a[i + 8])],
      });
    }
  }
  // Required shift per losing triangle (most negative wins).
  const shift = new Map<Tri, number>();
  const consider = (t: Tri, u: Tri) => {
    if (pm[t.part] === pm[u.part]) return;
    if (Math.abs(t.d - u.d) > EPS || t.nx * u.nx + t.ny * u.ny + t.nz * u.nz < 0.9995) return;
    // Boxes must overlap by a real area in the plane (neighbours sharing an edge only touch).
    let box = 1;
    for (let k = 0; k < 3; k++) {
      const o = Math.min(t.max[k], u.max[k]) - Math.max(t.min[k], u.min[k]);
      if (o < -1e-4) return;
      if (k !== t.drop) box *= Math.max(0, o);
    }
    if (box < 0.0015) return;
    if (overlapArea(parts, t, u) < 0.0015) return;
    // Winner: clearly in front, else the later part.
    const front = t.d - u.d > 0.001 ? t : u.d - t.d > 0.001 ? u : parts[t.part].seq >= parts[u.part].seq ? t : u;
    const back = front === t ? u : t;
    const s = front.d - GAP - back.d; // move the loser to GAP behind the winner
    if (s < 0) shift.set(back, Math.min(shift.get(back) ?? 0, s));
  };
  for (const [k, bk] of buckets) {
    const nb = buckets.get(k + 1771561); // the next offset slot, same normal
    if (!bk.mixed && !(nb && (nb.mixed || nb.mat !== bk.mat))) continue;
    const list = nb ? bk.tris.concat(nb.tris) : bk.tris;
    const own = bk.tris.length;
    if (list.length <= 48) {
      for (let i = 0; i < own; i++) {
        const mi = pm[list[i].part];
        for (let j = i + 1; j < list.length; j++) if (pm[list[j].part] !== mi) consider(list[i], list[j]);
      }
      continue;
    }
    // Large planes: hash triangles into 2 m cells of the plane's two widest axes, compare per cell.
    const t0 = list[0];
    const ax = Math.abs(t0.nx), ay = Math.abs(t0.ny), az = Math.abs(t0.nz);
    const [c0, c1] = ax >= ay && ax >= az ? [1, 2] : ay >= az ? [0, 2] : [0, 1];
    const cells = new Map<number, number[]>();
    list.forEach((t, idx) => {
      for (let x = Math.floor(t.min[c0] / 2); x <= Math.floor(t.max[c0] / 2); x++)
        for (let y = Math.floor(t.min[c1] / 2); y <= Math.floor(t.max[c1] / 2); y++) {
          const ck = x * 100003 + y;
          let l = cells.get(ck);
          if (!l) cells.set(ck, (l = []));
          l.push(idx);
        }
    });
    const seen = new Set<number>();
    for (const l of cells.values()) {
      for (let a = 0; a < l.length; a++)
        for (let b = a + 1; b < l.length; b++) {
          const i = l[a], j = l[b];
          if (i >= own && j >= own) continue; // both in the next slot: its own pass
          if (pm[list[i].part] === pm[list[j].part]) continue;
          const pk = i < j ? i * 1_000_003 + j : j * 1_000_003 + i;
          if (seen.has(pk)) continue;
          seen.add(pk);
          consider(list[i], list[j]);
        }
    }
  }
  for (const [t, s] of shift) {
    const pos = parts[t.part].geometry.getAttribute('position') as THREE.BufferAttribute;
    const a = pos.array as Float32Array;
    for (let v = 0; v < 3; v++) {
      a[t.i + v * 3] += t.nx * s;
      a[t.i + v * 3 + 1] += t.ny * s;
      a[t.i + v * 3 + 2] += t.nz * s;
    }
    pos.needsUpdate = true;
  }
  return shift.size;
}

/** Overlap area of two (near-)coplanar triangles, by clipping one against the other in their plane. */
function overlapArea(parts: CoplanarPart[], t: Tri, u: Tri): number {
  const ax = Math.abs(t.nx), ay = Math.abs(t.ny), az = Math.abs(t.nz);
  const drop = ax >= ay && ax >= az ? 0 : ay >= az ? 1 : 2;
  const pick = (tr: Tri): [number, number][] => {
    const a = (parts[tr.part].geometry.getAttribute('position') as THREE.BufferAttribute).array as Float32Array;
    const out: [number, number][] = [];
    for (let v = 0; v < 3; v++) {
      const o = tr.i + v * 3;
      out.push(drop === 0 ? [a[o + 1], a[o + 2]] : drop === 1 ? [a[o], a[o + 2]] : [a[o], a[o + 1]]);
    }
    return out;
  };
  let poly = pick(t);
  const clip = pick(u);
  const sgn = Math.sign((clip[1][0] - clip[0][0]) * (clip[2][1] - clip[0][1]) - (clip[1][1] - clip[0][1]) * (clip[2][0] - clip[0][0])) || 1;
  for (let e = 0; e < 3 && poly.length; e++) {
    const p = clip[e], q = clip[(e + 1) % 3];
    const side = (s: [number, number]) => sgn * ((q[0] - p[0]) * (s[1] - p[1]) - (q[1] - p[1]) * (s[0] - p[0]));
    const next: [number, number][] = [];
    for (let k = 0; k < poly.length; k++) {
      const s = poly[k], f = poly[(k + 1) % poly.length];
      const ds = side(s), df = side(f);
      if (ds >= 0) next.push(s);
      if (ds >= 0 !== df >= 0) {
        const r = ds / (ds - df);
        next.push([s[0] + (f[0] - s[0]) * r, s[1] + (f[1] - s[1]) * r]);
      }
    }
    poly = next;
  }
  let area = 0;
  for (let k = 0; k < poly.length; k++) {
    const s = poly[k], f = poly[(k + 1) % poly.length];
    area += s[0] * f[1] - f[0] * s[1];
  }
  return Math.abs(area) / 2 / Math.max(ax, ay, az);
}
