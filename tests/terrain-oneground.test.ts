/**
 * One ground (phase 4b, G1a; docs/design/solid-ground.md §1 RC1 and §3 item 1): under the v2 terrain
 * profile `Heightmap.heightAt`, the drawn CDLOD mesh and Rapier's heightfield are the same
 * triangles, every 2 m cell split along b–c (from (x+1, z) to (x, z+1)). Under v1 nothing has
 * changed: the heights, the patch and `heightAt` hash to what they were before the switch existed.
 */
import { createHash } from 'node:crypto';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { initPhysics, Layer, Physics } from '../src/core/Physics';
import { buildHeightmap, Heightmap, type TerrainSource } from '../src/world/terrain/heightmap';
import { DEFAULT_TERRAIN_PROFILE, setTerrainProfile, terrainProfile, type TerrainProfile } from '../src/world/terrain/profile';
import { heightfieldChunks, patchGeometry } from '../src/world/terrain/Terrain';
import { morphOffset, PATCH_STRIDE, TerrainQuadtree } from '../src/world/terrain/quadtree';
import { landmarkPads } from '../src/world/rome/buildRome';

const sha = (a: ArrayBufferView) => createHash('sha256').update(new Uint8Array(a.buffer, a.byteOffset, a.byteLength)).digest('hex');

/** Deterministic xorshift32 in [0, 1). */
function rng(seed: number) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5;
    s >>>= 0;
    return s / 4294967296;
  };
}

/** The city's heightmap exactly as buildRome makes it (core extent). */
function gameHeightmap(profile: TerrainProfile): Heightmap {
  const box = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
  const lb = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
  const landmarkBounds = { minX: Math.min(...lb.map((b) => b.minX)), maxX: Math.max(...lb.map((b) => b.maxX)), minZ: Math.min(...lb.map((b) => b.minZ)), maxZ: Math.max(...lb.map((b) => b.maxZ)) };
  const src: TerrainSource = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, bounds: atlas.CITY_BOUNDS };
  return buildHeightmap(src, { spacing: 2, pads: landmarkPads(landmarkBounds), profile });
}

/** A rough hand-made grid (±3 m per sample): nearly every cell twisted, the worst case for a diagonal. */
function roughHeightmap(profile: TerrainProfile, nx = 97, nz = 81): Heightmap {
  const hm = new Heightmap(-37, 52, 2, nx, nz, profile);
  const r = rng(7);
  for (let k = 0; k < nx * nz; k++) hm.heights[k] = 10 + (r() - 0.5) * 6;
  return hm;
}

/** The terrain's colliders for a grid, the way Terrain.addColliders adds them (65-sample chunks). */
function physicsFor(hm: Heightmap): Physics {
  const p = new Physics();
  for (const c of heightfieldChunks(hm, 65)) p.addHeightfield(c.minX, c.minZ, c.sizeX, c.sizeZ, c.segX, c.segZ, c.heights);
  p.step(1 / 60);
  return p;
}

function rayDown(p: Physics, x: number, z: number): number | null {
  const hit = p.raycast({ x, y: 400, z }, { x: 0, y: -1, z: 0 }, 800, Layer.World);
  return hit ? hit.point.y : null;
}

/** Points inside the grid, kept a little off its edge (heightAt clamps there). */
function randomPoints(hm: Heightmap, n: number, seed: number): [number, number][] {
  const r = rng(seed);
  const out: [number, number][] = [];
  const m = 0.01;
  for (let k = 0; k < n; k++) out.push([hm.minX + m + r() * (hm.maxX - hm.minX - 2 * m), hm.minZ + m + r() * (hm.maxZ - hm.minZ - 2 * m)]);
  return out;
}

/**
 * A CPU copy of the drawn ground: the leaf patches the quadtree selects for a camera, each the
 * shared patch's surface triangles (skirts left out) placed as the vertex shader places them at
 * level 0 (vertex = a grid sample's height; `uBias[0]` is 0). Returns the drawn height under
 * (x, z) from the triangle that contains it, or null when no unmorphed leaf patch covers it. The
 * shader's 9 cm drop under roads and pads is a deliberate visual offset and is left out.
 */
function drawnLeaf(hm: Heightmap, qt: TerrainQuadtree, cam: { x: number; y: number; z: number }, profile: TerrainProfile) {
  const g = patchGeometry(qt.patchQuads, profile);
  const pos = g.getAttribute('position').array as Float32Array;
  const idx = g.index!.array as ArrayLike<number>;
  const surf: number[] = [];
  for (let t = 0; t < idx.length; t += 3) {
    if (pos[idx[t] * 3 + 1] === 0 && pos[idx[t + 1] * 3 + 1] === 0 && pos[idx[t + 2] * 3 + 1] === 0) surf.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  const { data, count } = qt.select(cam);
  const leaves: [number, number, number][] = [];
  for (let p = 0; p < count; p++) {
    const o = p * PATCH_STRIDE;
    if (data[o + 3] === 0) leaves.push([data[o], data[o + 1], data[o + 2]]);
  }
  const morphStart = qt.morph[0][0];
  const sp = hm.spacing;
  const vy = (x: number, z: number) => hm.heights[Math.round((z - hm.minZ) / sp) * hm.nx + Math.round((x - hm.minX) / sp)];
  const P = qt.patchQuads;
  const tri = (px: number, pz: number, cell: number, t: number, x: number, z: number): number | null => {
    const v = [surf[t], surf[t + 1], surf[t + 2]].map((i) => {
      const vx = px + pos[i * 3] * cell, vz = pz + pos[i * 3 + 2] * cell;
      return [vx, vz, vy(vx, vz)] as const;
    });
    const [[x0, z0, y0], [x1, z1, y1], [x2, z2, y2]] = v;
    const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
    const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det;
    const l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det;
    const l2 = 1 - l0 - l1;
    if (!(l0 >= -1e-9 && l1 >= -1e-9 && l2 >= -1e-9)) return null;
    // The shader morphs a vertex once its distance passes the level's morph start: only compare
    // where all three still sit on the grid.
    for (const [vx, vz, vy0] of v) if (Math.hypot(cam.x - vx, cam.y - vy0, cam.z - vz) >= morphStart) return NaN;
    return l0 * y0 + l1 * y1 + l2 * y2;
  };
  return (x: number, z: number): number | null => {
    for (const [px, pz, cell] of leaves) {
      const size = P * cell;
      if (x < px || z < pz || x >= px + size || z >= pz + size) continue;
      // The patch indexes its cells in order, two triangles each; any other triangle as a fallback.
      const k = Math.min(P - 1, Math.floor((z - pz) / cell)) * P + Math.min(P - 1, Math.floor((x - px) / cell));
      const order = [6 * k, 6 * k + 3];
      for (let t = 0; t < surf.length; t += 3) if (t !== 6 * k && t !== 6 * k + 3) order.push(t);
      for (const t of order) {
        const y = tri(px, pz, cell, t, x, z);
        if (y !== null) return Number.isNaN(y) ? null : y;
      }
    }
    return null;
  };
}

/** The city grids, built once per profile. */
const cities = new Map<TerrainProfile, Heightmap>();
function cityHm(profile: TerrainProfile) {
  let hm = cities.get(profile);
  if (!hm) cities.set(profile, (hm = gameHeightmap(profile)));
  return hm;
}

describe('terrain profile switch', () => {
  // The suite may itself run under SKYROME_TERRAIN=v1: put it back afterwards.
  const envBefore = process.env.SKYROME_TERRAIN;
  afterEach(() => {
    delete (globalThis as { location?: unknown }).location;
    if (envBefore === undefined) delete process.env.SKYROME_TERRAIN;
    else process.env.SKYROME_TERRAIN = envBefore;
    setTerrainProfile(null);
  });

  it('defaults to v2; the URL, the environment and setTerrainProfile choose', () => {
    delete process.env.SKYROME_TERRAIN;
    setTerrainProfile(null);
    expect(DEFAULT_TERRAIN_PROFILE).toBe('v2');
    expect(terrainProfile()).toBe('v2');
    (globalThis as { location?: unknown }).location = { search: '?scene=rome&terrain=v1' };
    setTerrainProfile(null); // re-read the URL
    expect(terrainProfile()).toBe('v1');
    (globalThis as { location?: unknown }).location = { search: '?terrain=bogus' };
    setTerrainProfile(null);
    expect(terrainProfile()).toBe('v2');
    delete (globalThis as { location?: unknown }).location;
    process.env.SKYROME_TERRAIN = 'v1';
    setTerrainProfile(null);
    expect(terrainProfile()).toBe('v1');
    setTerrainProfile('v2');
    expect(terrainProfile()).toBe('v2');
    setTerrainProfile('v1');
    expect(new Heightmap(0, 0, 2, 3, 3).profile).toBe('v1');
    expect(buildHeightmap({ BASE_ELEVATION: 15, HILLS: [], LOWLANDS: [], RIVERS: [], ISLANDS: [], bounds: { minX: 0, maxX: 20, minZ: 0, maxZ: 20 } }, { profile: 'v2' }).profile).toBe('v2');
  });
});

describe('one ground (v2): heightAt, the drawn mesh and the physics agree', () => {
  let city: Heightmap;
  let cityPhysics: Physics;
  beforeAll(async () => {
    await initPhysics();
    city = cityHm('v2');
    cityPhysics = physicsFor(city);
  });

  it("Rapier splits each heightfield cell along b–c, from (x+1, z) to (x, z+1)", () => {
    // Two cells twisted opposite ways: (0, 1 / 1, 0) and (1, 0 / 0, 1).
    const hm = new Heightmap(10, 20, 2, 3, 2, 'v2');
    hm.heights.set([0, 1, 0, 1, 0, 1]);
    const p = physicsFor(hm);
    const bc = (h00: number, h10: number, h01: number, h11: number, tx: number, tz: number) =>
      tx + tz <= 1 ? h00 + (h10 - h00) * tx + (h01 - h00) * tz : h11 + (h01 - h11) * (1 - tx) + (h10 - h11) * (1 - tz);
    for (const [tx, tz] of [[0.4, 0.4], [0.6, 0.6], [0.2, 0.7], [0.7, 0.2], [0.1, 0.1], [0.9, 0.9]]) {
      // On the a–d split the first cell would read 0 along its diagonal; bilinear 2·t·(1 − t)…
      expect(rayDown(p, 10 + 2 * tx, 20 + 2 * tz)).toBeCloseTo(bc(0, 1, 1, 0, tx, tz), 4);
      expect(rayDown(p, 12 + 2 * tx, 20 + 2 * tz)).toBeCloseTo(bc(1, 0, 0, 1, tx, tz), 4);
      expect(hm.heightAt(10 + 2 * tx, 20 + 2 * tz)).toBeCloseTo(bc(0, 1, 1, 0, tx, tz), 6);
    }
  });

  it('heightAt matches a Rapier ray on the chunk heightfields at 20k random points of the city (≤ 1 mm)', () => {
    let worst = 0;
    let missed = 0;
    for (const [x, z] of randomPoints(city, 20_000, 113)) {
      const y = rayDown(cityPhysics, x, z);
      if (y === null) {
        missed++;
        continue;
      }
      worst = Math.max(worst, Math.abs(y - city.heightAt(x, z)));
    }
    expect(missed).toBe(0);
    expect(worst).toBeLessThan(0.001);
  });

  it('… and on a rough grid where nearly every cell is twisted (≤ 1 mm)', () => {
    const hm = roughHeightmap('v2');
    const p = physicsFor(hm);
    let worst = 0;
    for (const [x, z] of randomPoints(hm, 5000, 5)) worst = Math.max(worst, Math.abs((rayDown(p, x, z) ?? Infinity) - hm.heightAt(x, z)));
    expect(worst).toBeLessThan(0.001);
    // The old bilinear ground missed it by up to a quarter of the twist.
    const v1 = roughHeightmap('v1');
    let old = 0;
    for (const [x, z] of randomPoints(v1, 5000, 5)) old = Math.max(old, Math.abs((rayDown(p, x, z) ?? Infinity) - v1.heightAt(x, z)));
    expect(old).toBeGreaterThan(0.5);
  });

  it('heightAt matches the drawn leaf triangles (a CPU copy of the patch mesh) within 1 mm', () => {
    const qt = new TerrainQuadtree(city, { leafFactor: 2.4 }); // as buildRome
    const r = rng(41);
    let compared = 0;
    let worst = 0;
    let worstV1 = 0;
    const v1 = cityHm('v1');
    for (let c = 0; c < 40; c++) {
      const cx = city.minX + 100 + r() * (city.maxX - city.minX - 200), cz = city.minZ + 100 + r() * (city.maxZ - city.minZ - 200);
      const cam = { x: cx, y: city.heightAt(cx, cz) + 1.7, z: cz };
      const drawn = drawnLeaf(city, qt, cam, 'v2');
      const drawnV1 = drawnLeaf(v1, qt, cam, 'v1');
      for (let k = 0; k < 500; k++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 80;
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
        const y = drawn(x, z);
        if (y === null) continue;
        compared++;
        worst = Math.max(worst, Math.abs(y - city.heightAt(x, z)));
        worstV1 = Math.max(worstV1, Math.abs((drawnV1(x, z) ?? y) - v1.heightAt(x, z)));
      }
    }
    expect(compared).toBeGreaterThan(19_000);
    expect(worst).toBeLessThan(0.001);
    // Under v1 the drawn a–d triangles and the bilinear heightAt disagreed.
    expect(worstV1).toBeGreaterThan(0.05);
  });

  it('the drawn rough grid matches heightAt and the physics too', () => {
    const hm = roughHeightmap('v2');
    const p = physicsFor(hm);
    const qt = new TerrainQuadtree(hm, { patchQuads: 16, leafRange: 1e4 });
    const drawn = drawnLeaf(hm, qt, { x: 60, y: 30, z: 130 }, 'v2');
    let n = 0;
    for (const [x, z] of randomPoints(hm, 3000, 9)) {
      const y = drawn(x, z);
      if (y === null) continue;
      n++;
      expect(Math.abs(y - hm.heightAt(x, z))).toBeLessThan(0.001);
      expect(Math.abs(y - (rayDown(p, x, z) ?? Infinity))).toBeLessThan(0.001);
    }
    expect(n).toBeGreaterThan(2500);
  });
});

describe('the drawn patch under both diagonals', () => {
  const P = 16;
  /** Surface triangles (no skirt vertex) as sorted vertex-coordinate keys. */
  function surface(profile: TerrainProfile) {
    const g = patchGeometry(P, profile);
    const pos = g.getAttribute('position').array as Float32Array;
    const idx = Array.from(g.index!.array as ArrayLike<number>);
    const tris: number[][] = [];
    const skirt: number[][] = [];
    for (let t = 0; t < idx.length; t += 3) {
      const tri = [idx[t], idx[t + 1], idx[t + 2]];
      (tri.some((i) => pos[i * 3 + 1] !== 0) ? skirt : tris).push(tri);
    }
    return { pos, tris, skirt };
  }

  for (const profile of ['v1', 'v2'] as const) {
    it(`${profile}: every cell is two upward triangles; interior edges shared, the perimeter open for the skirts`, () => {
      const { pos, tris } = surface(profile);
      expect(tris.length).toBe(2 * P * P);
      const edges = new Map<string, number>();
      let area = 0;
      for (const [a, b, c] of tris) {
        const ax = pos[a * 3], az = pos[a * 3 + 2], bx = pos[b * 3], bz = pos[b * 3 + 2], cx = pos[c * 3], cz = pos[c * 3 + 2];
        // y up: (b − a) × (c − a) has a positive y.
        const cross = (bz - az) * (cx - ax) - (bx - ax) * (cz - az);
        expect(cross).toBeGreaterThan(0);
        area += cross / 2;
        for (const [u, v] of [[a, b], [b, c], [c, a]]) {
          const k = u < v ? `${u}-${v}` : `${v}-${u}`;
          edges.set(k, (edges.get(k) ?? 0) + 1);
        }
      }
      expect(area).toBeCloseTo(P * P, 9);
      const open = [...edges].filter(([, n]) => n === 1).map(([k]) => k);
      expect([...edges.values()].every((n) => n <= 2)).toBe(true);
      expect(open.length).toBe(4 * P); // only the perimeter
      for (const k of open) {
        const [u, v] = k.split('-').map(Number);
        const onEdge = (i: number) => pos[i * 3] === 0 || pos[i * 3] === P || pos[i * 3 + 2] === 0 || pos[i * 3 + 2] === P;
        expect(onEdge(u) && onEdge(v)).toBe(true);
      }
    });

    it(`${profile}: fully morphed, a patch is the next level's patch with the same diagonal (no pop at the switch)`, () => {
      const { pos, tris } = surface(profile);
      const key = (pts: [number, number][]) => pts.map(([x, z]) => `${x}:${z}`).sort().join('|');
      const morphed: string[] = [];
      for (const tri of tris) {
        const v = tri.map((i) => [morphOffset(pos[i * 3], 1), morphOffset(pos[i * 3 + 2], 1)] as [number, number]);
        const area = (v[1][1] - v[0][1]) * (v[2][0] - v[0][0]) - (v[1][0] - v[0][0]) * (v[2][1] - v[0][1]);
        if (area !== 0) morphed.push(key(v)); // the rest collapse
      }
      // The next level's cells are twice the size: its patch's first quarter, in this patch's units.
      const expected = tris
        .filter((tri) => tri.every((i) => pos[i * 3] <= P / 2 && pos[i * 3 + 2] <= P / 2))
        .map((tri) => key(tri.map((i) => [pos[i * 3] * 2, pos[i * 3 + 2] * 2] as [number, number])));
      expect(morphed.length).toBe(2 * (P / 2) * (P / 2));
      expect(morphed.sort()).toEqual(expected.sort());
    });
  }

  it('the skirts and the vertices are the same under both diagonals', () => {
    const a = surface('v1'), b = surface('v2');
    expect(Array.from(b.pos)).toEqual(Array.from(a.pos));
    expect(b.skirt).toEqual(a.skirt);
  });

  it('v2 flips only the diagonal: a cell is (a, c, b), (b, c, d)', () => {
    const idx = Array.from(patchGeometry(P, 'v2').index!.array as ArrayLike<number>);
    const n = P + 1;
    expect(idx.slice(0, 6)).toEqual([0, n, 1, 1, n, n + 1]);
  });
});

describe('v1 is byte-identical to the ground before the switch', () => {
  // Hashes taken on the phase-4b base (commit 751ab61), before profile.ts existed.
  const V1 = {
    heights: '604c349b3eff9b79b2d34552b7c77ec1e0dff870dbcaa03f74ccc2db8837bd0d',
    index: '940a3955d1e30157084e133961c9b9057cf8b5f1429ab206bf636dc06ccaded3',
    position: '7933b9d04d9604f13311ad7719177d557afb5ac141c8c3c984660bdd6f43574b',
    heightAt: '6e13a2fccba4c4985e80d70128e5769adcbb05727458f049e4d09781152d0acb',
  };

  it('the city grid, the patch and heightAt hash as before', () => {
    const hm = cityHm('v1');
    expect(hm.profile).toBe('v1');
    expect(sha(hm.heights)).toBe(V1.heights);
    const g = patchGeometry(16, 'v1');
    expect(sha(new Uint32Array(g.index!.array as ArrayLike<number>))).toBe(V1.index);
    expect(sha(new Float32Array(g.getAttribute('position').array as ArrayLike<number>))).toBe(V1.position);
    // The same xorshift stream as the base's hash script: x then z per point.
    let s = 0x9e3779b9 >>> 0;
    const rnd = () => {
      s ^= s << 13;
      s >>>= 0;
      s ^= s >>> 17;
      s ^= s << 5;
      s >>>= 0;
      return s / 4294967296;
    };
    const out = new Float64Array(4096);
    for (let k = 0; k < out.length; k++) out[k] = hm.heightAt(hm.minX + rnd() * (hm.maxX - hm.minX), hm.minZ + rnd() * (hm.maxZ - hm.minZ));
    expect(sha(out)).toBe(V1.heightAt);
  });

  it('G1a leaves the grid itself alone: v2 heights are v1 heights (G1b changes them)', () => {
    expect(sha(cityHm('v2').heights)).toBe(V1.heights);
  });
});
