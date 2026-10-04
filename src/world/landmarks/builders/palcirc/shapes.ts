/**
 * Small cached geometries for the palcirc builders: walls with arched or square openings, arch
 * bands, simple statues and turning posts. Local conventions follow the kit: the front face is at
 * z = 0 facing −z and the body extends toward +z.
 */
import * as THREE from 'three';
import { extrudePolygon, type V2 } from '../../../../arch/common/geom';

const cache = new Map<string, THREE.BufferGeometry>();
function cached(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
  let g = cache.get(key);
  if (!g) {
    g = make();
    cache.set(key, g);
  }
  return g;
}

/** Points of a semicircular arch head (left springing → crown → right springing). */
export function archHead(cx: number, spring: number, r: number, n: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i <= n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    out.push([cx + Math.cos(a) * r, spring + Math.sin(a) * r]);
  }
  return out;
}

/** Turn an extrudePolygon result (front +z at z = 0, body to −depth) round so it faces −z with the body toward +z. */
function faceMinusZ(g: THREE.BufferGeometry): THREE.BufferGeometry {
  g.rotateY(Math.PI);
  return g;
}

/**
 * Wall slab w × h × depth with an arched doorway from the ground (clear `span`, springing `spring`).
 * x ∈ [−w/2, w/2], y ∈ [0, h], z ∈ [0, depth].
 */
export function archDoorWall(w: number, h: number, span: number, spring: number, depth: number, n = 8): THREE.BufferGeometry {
  return cached(`door|${w}|${h}|${span}|${spring}|${depth}|${n}`, () => {
    const r = span / 2;
    const pts: V2[] = [[-w / 2, 0], [-r, 0], ...archHead(0, spring, r, n), [r, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
    // Mirror x (faceMinusZ rotates by π) — the shape is symmetric, so this is a no-op.
    return faceMinusZ(extrudePolygon(pts, depth));
  });
}

/** Wall slab with an arched opening whose sill is at `sill` (> 0). */
export function archWindowWall(w: number, h: number, span: number, sill: number, spring: number, depth: number, n = 8): THREE.BufferGeometry {
  return cached(`win|${w}|${h}|${span}|${sill}|${spring}|${depth}|${n}`, () => {
    const r = span / 2;
    const hole: V2[] = [[-r, sill], [r, sill], ...archHead(0, spring, r, n).reverse()];
    const outer: V2[] = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
    return faceMinusZ(extrudePolygon(outer, depth, [hole]));
  });
}

/** Wall slab with rectangular holes [cx, y0, width, height]. */
export function rectHoleWall(w: number, h: number, holes: [number, number, number, number][], depth: number): THREE.BufferGeometry {
  return cached(`rect|${w}|${h}|${JSON.stringify(holes)}|${depth}`, () => {
    const outer: V2[] = [[-w / 2, 0], [w / 2, 0], [w / 2, h], [-w / 2, h]];
    // faceMinusZ mirrors x, so mirror the hole centres first.
    const hs: V2[][] = holes.map(([cx, y0, hw, hh]) => [[-cx - hw / 2, y0], [-cx - hw / 2, y0 + hh], [-cx + hw / 2, y0 + hh], [-cx + hw / 2, y0]]);
    return faceMinusZ(extrudePolygon(outer, depth, hs));
  });
}

/** Archivolt: a half-annulus band from radius r0 to r1 round (0, spring), `depth` proud of z = 0 (toward −z). */
export function archBand(r0: number, r1: number, spring: number, depth: number, n = 8): THREE.BufferGeometry {
  return cached(`band|${r0}|${r1}|${spring}|${depth}|${n}`, () => {
    const outer = archHead(0, spring, r1, n);
    const inner = archHead(0, spring, r0, n).reverse();
    const pts: V2[] = [...outer, ...inner];
    // CCW: outer arc runs left→right over the top (clockwise), so reverse the whole loop.
    pts.reverse();
    const g = extrudePolygon(pts, depth);
    // extrudePolygon occupies z ∈ [−depth, 0] with the front at z = 0 facing +z: flip to face −z
    // and sit proud of the wall face (z ∈ [−depth, 0]).
    g.rotateY(Math.PI);
    g.translate(0, 0, -depth);
    return g;
  });
}

/**
 * Light archivolt: the front face of a half-annulus band (r0 → r1 round (0, spring)) standing
 * `depth` proud of z = 0, plus its outer rim. 4n triangles (the extruded version costs ~6×).
 */
export function archBandLite(r0: number, r1: number, spring: number, depth: number, n = 6): THREE.BufferGeometry {
  return cached(`bandl|${r0}|${r1}|${spring}|${depth}|${n}`, () => {
    const pos: number[] = [];
    const z = -depth;
    for (let i = 0; i < n; i++) {
      const a0 = Math.PI - (Math.PI * i) / n;
      const a1 = Math.PI - (Math.PI * (i + 1)) / n;
      const I0 = [Math.cos(a0) * r0, spring + Math.sin(a0) * r0];
      const I1 = [Math.cos(a1) * r0, spring + Math.sin(a1) * r0];
      const O0 = [Math.cos(a0) * r1, spring + Math.sin(a0) * r1];
      const O1 = [Math.cos(a1) * r1, spring + Math.sin(a1) * r1];
      // Front (facing −z) and the outer rim back to the wall (facing outward).
      pos.push(I0[0], I0[1], z, O0[0], O0[1], z, O1[0], O1[1], z);
      pos.push(I0[0], I0[1], z, O1[0], O1[1], z, I1[0], I1[1], z);
      pos.push(O0[0], O0[1], z, O1[0], O1[1], 0, O1[0], O1[1], z);
      pos.push(O0[0], O0[1], z, O0[0], O0[1], 0, O1[0], O1[1], 0);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  });
}

/** A flat-sided ring sector (plan) extruded vertically: for curved parapets and podia. */
export function ringSector(r0: number, r1: number, a0: number, a1: number, h: number, n = 12): THREE.BufferGeometry {
  return cached(`sector|${r0}|${r1}|${a0}|${a1}|${h}|${n}`, () => {
    const pts: V2[] = [];
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([Math.cos(a) * r1, Math.sin(a) * r1]);
    }
    for (let i = n; i >= 0; i--) {
      const a = a0 + ((a1 - a0) * i) / n;
      pts.push([Math.cos(a) * r0, Math.sin(a) * r0]);
    }
    const g = extrudePolygon(pts, h);
    // Polygon in XY, extruded along −z → rotate so XY becomes XZ (plan) and the extrusion goes up.
    g.rotateX(Math.PI / 2);
    return g;
  });
}

/** A turning-post cone (meta) with an egg-shaped tip, base at y = 0. */
export function metaCone(r: number, h: number): THREE.BufferGeometry {
  return cached(`meta|${r}|${h}`, () => {
    const pts: THREE.Vector2[] = [];
    pts.push(new THREE.Vector2(0, 0), new THREE.Vector2(r * 1.25, 0), new THREE.Vector2(r * 1.25, r * 0.4), new THREE.Vector2(r, r * 0.5));
    pts.push(new THREE.Vector2(r * 0.72, h * 0.55), new THREE.Vector2(r * 0.42, h * 0.84));
    // Egg tip.
    const ey = h * 0.9;
    const er = r * 0.42;
    for (let i = 0; i <= 6; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 6;
      pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * er), ey + Math.sin(a) * er * 1.6 + er * 0.2));
    }
    pts.push(new THREE.Vector2(0, ey + er * 1.85));
    return new THREE.LatheGeometry(pts, 10).toNonIndexed();
  });
}

/** Stylised leaping dolphin (lap counter), nose toward −z, length ≈ 1. */
export function dolphin(): THREE.BufferGeometry {
  return cached('dolphin', () => {
    const body = new THREE.SphereGeometry(0.5, 8, 6);
    body.scale(0.22, 0.24, 1);
    body.rotateX(-0.5);
    const tail = new THREE.ConeGeometry(0.16, 0.36, 4);
    tail.rotateX(-Math.PI / 2 - 0.9);
    tail.translate(0, 0.42, 0.42);
    const fin = new THREE.ConeGeometry(0.08, 0.2, 3);
    fin.translate(0, 0.2, 0.05);
    const parts = [body, tail, fin].map((g) => g.toNonIndexed());
    return mergeAll(parts);
  });
}

/** Egg on a short stem (lap counter). */
export function egg(): THREE.BufferGeometry {
  return cached('egg', () => {
    const pts: THREE.Vector2[] = [new THREE.Vector2(0, 0), new THREE.Vector2(0.06, 0), new THREE.Vector2(0.05, 0.12)];
    for (let i = 0; i <= 8; i++) {
      const a = -Math.PI / 2 + (Math.PI * i) / 8;
      const k = a < 0 ? 0.24 : 0.36;
      pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * 0.17), 0.3 + Math.sin(a) * k));
    }
    return new THREE.LatheGeometry(pts, 8).toNonIndexed();
  });
}

/** Simple lion (for Cybele's group): body, head and mane blobs; faces −z, about 1.6 long. */
export function lion(): THREE.BufferGeometry {
  return cached('lion', () => {
    const parts: THREE.BufferGeometry[] = [];
    const add = (g: THREE.BufferGeometry, x: number, y: number, z: number) => parts.push(g.translate(x, y, z).toNonIndexed());
    add(new THREE.SphereGeometry(1, 8, 6).scale(0.32, 0.34, 0.75), 0, 0.72, 0.1);
    add(new THREE.SphereGeometry(1, 8, 6).scale(0.36, 0.4, 0.32), 0, 0.92, -0.55);
    add(new THREE.SphereGeometry(1, 8, 6).scale(0.18, 0.2, 0.24), 0, 0.98, -0.82);
    for (const [x, z] of [[-0.17, -0.45], [0.17, -0.45], [-0.17, 0.6], [0.17, 0.6]]) add(new THREE.CylinderGeometry(0.08, 0.07, 0.62, 6), x, 0.31, z);
    add(new THREE.CylinderGeometry(0.04, 0.02, 0.7, 4).rotateX(1.1), 0, 0.85, 1.05);
    return mergeAll(parts);
  });
}

export function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  let n = 0;
  for (const p of parts) n += p.getAttribute('position').count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    const g = p.index ? p.toNonIndexed() : p;
    if (!g.getAttribute('normal')) g.computeVertexNormals();
    pos.set(g.getAttribute('position').array as Float32Array, o * 3);
    nor.set(g.getAttribute('normal').array as Float32Array, o * 3);
    o += g.getAttribute('position').count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  return out;
}
