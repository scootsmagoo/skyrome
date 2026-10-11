/**
 * Terrain profile v2, GROUND part 2 (docs/design/solid-ground.md §3 items 2-5): pads blend by
 * their height, roads are stamped last and capped at 25 % per 4 m, eased-linear flanks with longer
 * runs, cliffs short of the roads, the Tiber Island's landings, the retaining runs; the water's
 * edge stays where v1 has it, and v1 stays v1.
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { WORLD_SCALE as S } from '../src/world/coords';
import { landmarkPads, terrainLandmarks } from '../src/world/rome/buildRome';
import {
  buildHeightmap,
  clipCliff,
  CLIFF_ROAD_CLEAR,
  easedLinear,
  flankRun,
  flankTopFactor,
  holdToFixed,
  ISLAND_LANDING,
  padMarginV2,
  relaxPins,
  ROAD_GRADE_CAP,
  RETAIN_DEG,
  signedDistance,
  type Heightmap,
  type TerrainRoad,
  type TerrainSource,
} from '../src/world/terrain/heightmap';
import { chain, footOn } from '../src/world/terrain/riverbanks';
import type { TerrainProfile } from '../src/world/terrain/profile';
import { maxGrade, regrade } from '../src/world/terrain/regrade';

const box = (b: { minX: number; maxX: number; minZ: number; maxZ: number }, m = 0) => ({ minX: b.minX - m, maxX: b.maxX + m, minZ: b.minZ - m, maxZ: b.maxZ + m });
const lbs = [box(atlas.CORE_BOUNDS, 350), ...atlas.DETAIL_REGIONS.map((r) => box(r, 100))];
const landmarkBounds = { minX: Math.min(...lbs.map((b) => b.minX)), maxX: Math.max(...lbs.map((b) => b.maxX)), minZ: Math.min(...lbs.map((b) => b.minZ)), maxZ: Math.max(...lbs.map((b) => b.maxZ)) };
/** The source buildRome gives the heightmap (with the bridges). */
const SRC: TerrainSource = { BASE_ELEVATION: atlas.BASE_ELEVATION, HILLS: atlas.HILLS, LOWLANDS: atlas.LOWLANDS, RIVERS: atlas.RIVERS, ISLANDS: atlas.ISLANDS, ROADS: atlas.ROADS, BRIDGES: atlas.BRIDGES, bounds: atlas.CITY_BOUNDS };
const PADS = landmarkPads(landmarkBounds);
const cache = new Map<TerrainProfile, Heightmap>();
const city = (p: TerrainProfile) => {
  let hm = cache.get(p);
  if (!hm) cache.set(p, (hm = buildHeightmap(SRC, { spacing: 2, pads: PADS, profile: p })));
  return hm;
};

/** Steepest |grade| over a 4 m window (game m) along a polyline (game m), every metre. */
function steepest4m(hm: Heightmap, pts: readonly (readonly [number, number])[]): number {
  const ys: number[] = [];
  for (let i = 0; i + 1 < pts.length; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    const n = Math.max(1, Math.round(Math.hypot(bx - ax, bz - az)));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) ys.push(hm.heightAt(ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n));
  }
  let m = 0;
  for (let i = 4; i < ys.length; i++) m = Math.max(m, Math.abs(ys[i] - ys[i - 4]) / 4);
  return m;
}

describe('v2 shapes (pure)', () => {
  it('the eased-linear flank runs 0 → 1, is monotone, and its top grade is 1.25 × the mean', () => {
    expect(easedLinear(0)).toBe(0);
    expect(easedLinear(1)).toBe(1);
    expect(easedLinear(0.5)).toBeCloseTo(0.5, 9);
    let prev = 0, top = 0;
    const n = 10000;
    for (let i = 1; i <= n; i++) {
      const v = easedLinear(i / n);
      expect(v).toBeGreaterThanOrEqual(prev);
      top = Math.max(top, (v - prev) * n);
      prev = v;
    }
    expect(top).toBeCloseTo(1.25, 3);
    expect(flankTopFactor('v1')).toBe(1.5);
    expect(flankTopFactor('v2')).toBeCloseTo(1.25, 9);
  });

  it('the steep designed flanks get longer runs under v2 only', () => {
    const hill = (id: string) => atlas.HILLS.find((h) => h.id === id)!;
    expect(flankRun(hill('capitolium'), 'v2')).toBe(71);
    expect(flankRun(hill('arx'), 'v2')).toBe(64);
    expect(flankRun(hill('palatine-t34'), 'v2')).toBe(53);
    for (const h of atlas.HILLS) expect(flankRun(h, 'v1')).toBe(h.slope);
  });

  it('pads blend over max(given, 1 + 2.6·|dh|) real m, at most 60', () => {
    expect(padMarginV2(14, 2)).toBe(14);
    expect(padMarginV2(14, 10)).toBeCloseTo(27, 9);
    expect(padMarginV2(14, -10)).toBeCloseTo(27, 9);
    expect(padMarginV2(14, 40)).toBe(60);
  });

  it('a cliff ends CLIFF_ROAD_CLEAR m short of a road band; flights of steps keep it', () => {
    const cliff = { a: [0, 0] as const, b: [100, 0] as const };
    const road: TerrainRoad = { id: 'r', width: 6, paving: 'basalt', points: [[50, -40], [50, 40]] };
    const parts = clipCliff(cliff, [road]);
    expect(parts.length).toBe(2);
    const gap = 3 + CLIFF_ROAD_CLEAR;
    expect(parts[0].b[0]).toBeLessThanOrEqual(50 - gap + 1);
    expect(parts[0].b[0]).toBeGreaterThan(50 - gap - 2);
    expect(parts[1].a[0]).toBeGreaterThanOrEqual(50 + gap - 1);
    expect(clipCliff(cliff, [{ ...road, paving: 'steps' as const }])).toEqual([cliff]);
  });

  it('regrade makes the least cut and fill under the grade', () => {
    const s = [0, 4, 8, 12, 16, 20];
    const y = [0, 0, 0, 4, 4, 4];
    const r = regrade(s, y, 0.25);
    expect(maxGrade(s, r.y)).toBeLessThanOrEqual(0.25 + 1e-9);
    // At most 1 m per 4 m step: the 4 m step is spread over the three steps round it, and the
    // least worst change (Chebyshev) is 1.5 m, as much cut as fill.
    expect(r.cut).toBeCloseTo(1.5, 6);
    expect(r.fill).toBeCloseTo(1.5, 6);
  });

  it('holdToFixed keeps the fixed points; only the gap between two it cannot join is steeper', () => {
    const s = Array.from({ length: 21 }, (_, i) => i * 3);
    const y = s.map(() => 0);
    const fixed = s.map((_, i) => (i === 10 ? 6 : i === 12 ? 0 : NaN));
    const out = holdToFixed(s, y, fixed, 0.2);
    expect(out[10]).toBe(6);
    expect(out[12]).toBe(0);
    // Left of the first fixed point the profile keeps the cap.
    for (let i = 1; i <= 10; i++) expect(Math.abs(out[i] - out[i - 1]) / 3).toBeLessThanOrEqual(0.2 + 1e-9);
    for (let i = 13; i < s.length; i++) expect(Math.abs(out[i] - out[i - 1]) / 3).toBeLessThanOrEqual(0.2 + 1e-9);
  });

  it('relaxPins drops footprint pins the cap cannot join, never a crossing road', () => {
    const s = [0, 3, 6, 9, 12];
    const pins = Float64Array.from([5, NaN, NaN, NaN, 0]);
    relaxPins(s, pins, [1, 0, 0, 0, 0], [0, 0, 0, 0, 0], 0.2);
    expect(pins[0]).toBe(5);
    expect(Number.isNaN(pins[4])).toBe(true);
    const ok = Float64Array.from([1, NaN, 2]);
    relaxPins([0, 3, 6], ok, [0, 0, 0], [0, 0, 0], 0.2);
    expect([...ok]).toEqual([1, NaN, 2]);
  });
});

describe('the city under v2', () => {
  it('builds both profiles; v1 has no retaining runs, v2 lists road edges against steep ground', () => {
    const v1 = city('v1'), v2 = city('v2');
    expect(v1.profile).toBe('v1');
    expect(v2.profile).toBe('v2');
    expect(v1.features!.retaining).toEqual([]);
    expect(v2.features!.retaining.length).toBeGreaterThan(10);
    const lim = Math.tan((RETAIN_DEG * Math.PI) / 180);
    for (const run of v2.features!.retaining) {
      expect(run.points.length).toBeGreaterThanOrEqual(2);
      expect(atlas.ROADS.some((r) => r.id === run.road && r.paving !== 'steps')).toBe(true);
      for (const p of run.points) expect(p.grade).toBeGreaterThan(lim);
    }
  });

  it('the atlas roads are capped at 25 % per 4 m (flights of steps, and spans inside a footprint the city detours round, left out)', () => {
    const v2 = city('v2');
    const over: string[] = [];
    for (const r of atlas.ROADS) {
      if (r.paving === 'steps') continue;
      const g = steepest4m(v2, r.points.map(([x, z]) => [x * S, z * S] as const));
      if (g > ROAD_GRADE_CAP + 0.005) over.push(`${r.id} ${Math.round(g * 100)}%`);
    }
    // Via Nova runs through the Porticus Margaritaria and the Temple of Jupiter Stator, at levels
    // 25 % cannot join; the city plan bends it round them (detour.ts).
    expect(over.filter((o) => !o.startsWith('via-nova '))).toEqual([]);
  });

  it('the water edge does not move: the grid along the river banks and quays is v1 to 5 cm', () => {
    const v1 = city('v1'), v2 = city('v2');
    let worst = 0, at = '';
    for (const r of atlas.RIVERS) {
      const pts = r.centerline;
      for (let i = 0; i + 1 < pts.length; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
        const L = Math.hypot(bx - ax, bz - az);
        const tx = (bx - ax) / L, tz = (bz - az) / L;
        const w0 = r.width[i] ?? r.width[r.width.length - 1], w1 = r.width[i + 1] ?? w0;
        for (let s = 0; s < L; s += 10) {
          const half = (w0 + ((w1 - w0) * s) / L) / 2;
          const cx = ax + tx * s, cz = az + tz * s;
          for (const side of [1, -1]) {
            for (const d of [half - 2, half, half + 3, half + 8]) {
              const x = (cx - tz * side * d) * S, z = (cz + tx * side * d) * S;
              if (x < v1.minX || x > v1.maxX || z < v1.minZ || z > v1.maxZ) continue;
              // Not where another stretch of the river is nearer, nor at the Tiber Island, whose
              // landings v2 flattens on purpose (§3 item 5).
              if (footOn(chain(r.centerline), x / S, z / S).d > d + 0.5) continue;
              if (atlas.ISLANDS.some((isl) => signedDistance(x / S, z / S, isl.outline) < 4.5 + ISLAND_LANDING + 1)) continue;
              // The grid samples round the point (heightAt's own interpolation is G1a's: v2 reads the
              // physics' diagonal, which moves a point beside a quay wall by itself).
              const ix = Math.floor((x - v1.minX) / v1.spacing), iz = Math.floor((z - v1.minZ) / v1.spacing);
              let dy = 0;
              for (const k of [iz * v1.nx + ix, iz * v1.nx + ix + 1, (iz + 1) * v1.nx + ix, (iz + 1) * v1.nx + ix + 1]) dy = Math.max(dy, Math.abs(v2.heights[k] - v1.heights[k]));
              if (dy > worst) {
                worst = dy;
                at = `${r.id} @${x.toFixed(1)},${z.toFixed(1)} d ${d.toFixed(1)} (half ${half.toFixed(1)})`;
              }
            }
          }
        }
      }
    }
    expect(worst, at).toBeLessThanOrEqual(0.05);
  });

  it('the Porticus Margaritaria is unpinned under v2 only, for its pad and its building alike', () => {
    const lm = (p: TerrainProfile) => terrainLandmarks(p).find((l) => l.id === 'porticus-margaritaria')!;
    expect(lm('v1').baseElevation).toBe(19);
    expect(lm('v2').baseElevation).toBeUndefined();
    const pad = PADS.find((p) => p.id === 'porticus-margaritaria')!;
    expect(pad.elevation).toBe(19);
    expect(pad.elevationV2).toBe('mean');
    // Every other landmark is the atlas record itself.
    const changed = terrainLandmarks('v2').filter((l, i) => l !== atlas.LANDMARKS[i]).map((l) => l.id);
    expect(changed).toEqual(['porticus-margaritaria']);
  });

  it('a landmark on a seating bowl\'s floor blends into it (the Arch of Titus in the Circus); one at the bowl\'s edge keeps its footprint', () => {
    const v2 = city('v2');
    const plain = buildHeightmap(SRC, { spacing: 2, pads: PADS.map(({ host: _h, ...p }) => p), profile: 'v2' });
    expect(PADS.find((p) => p.id === 'arch-titus-circus')!.host).toBe('circus-maximus');
    const at = (id: string) => atlas.LANDMARKS.find((l) => l.id === id)!.center.map((v) => v * S) as [number, number];
    const [ax, az] = at('arch-titus-circus');
    /** The largest rise between neighbouring samples within `r` game m of (cx, cz). */
    const steepest = (hm: Heightmap, cx: number, cz: number, r: number) => {
      let m = 0;
      for (let iz = 0; iz < hm.nz - 1; iz++)
        for (let ix = 0; ix < hm.nx - 1; ix++) {
          if (Math.hypot(hm.minX + ix * hm.spacing - cx, hm.minZ + iz * hm.spacing - cz) > r) continue;
          const k = iz * hm.nx + ix;
          m = Math.max(m, Math.abs(hm.heights[k + 1] - hm.heights[k]), Math.abs(hm.heights[k + hm.nx] - hm.heights[k]));
        }
      return m;
    };
    // Without the host the arch's floor stood 0.9 m over the track in one 2 m cell (the sand floated over it).
    expect(steepest(plain, ax, az, 16)).toBeGreaterThan(0.85);
    expect(steepest(v2, ax, az, 16)).toBeLessThan(0.3);
    // Nothing else moves: the pulvinar and the Temple of Sol stand in the stands at the Circus's edge.
    let farthest = 0;
    for (let k = 0; k < v2.heights.length; k++) {
      if (v2.heights[k] === plain.heights[k]) continue;
      farthest = Math.max(farthest, Math.hypot(v2.minX + (k % v2.nx) * v2.spacing - ax, v2.minZ + Math.floor(k / v2.nx) * v2.spacing - az));
    }
    expect(farthest).toBeGreaterThan(0);
    expect(farthest).toBeLessThan(20);
  });

  it('v1 with the bridges is still v1 (the island landings are v2 only)', () => {
    const noBridges = buildHeightmap({ ...SRC, BRIDGES: undefined }, { spacing: 2, pads: PADS, profile: 'v1' });
    const sha = (a: Float32Array) => createHash('sha256').update(Buffer.from(a.buffer)).digest('hex');
    expect(sha(city('v1').heights)).toBe(sha(noBridges.heights));
  });
});
