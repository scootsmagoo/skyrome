import { describe, expect, it } from 'vitest';
import { WORLD_SCALE } from '../src/world/coords';
import { buildHeightmap, canalProfile, riverBankProfile, riverReach, type TerrainSource } from '../src/world/terrain/heightmap';
import { chain, footOn, indexSegments, nearSegments, resolveQuays, type TerrainQuay } from '../src/world/terrain/riverbanks';
import { buildTerrainData, decodeSdf, encodeSdf, PAD_KIND_VALUE, sampleChannel, SDF_RANGE } from '../src/world/terrain/terrainData';
import { padKindFor } from '../src/world/terrain/romeInputs';

const S = WORLD_SCALE;
const square = (cx: number, cz: number, r: number) => [[cx - r, cz - r], [cx + r, cz - r], [cx + r, cz + r], [cx - r, cz + r]] as const;

const quay: TerrainQuay = { id: 'q', name: 'Quay', river: 'r', bank: 'left', from: [-300, -100], to: [-300, 100], top: 11, width: 12, confidence: 'high' };
const src: TerrainSource = {
  BASE_ELEVATION: 15,
  // A hill close to the river: the river valley must not shave its foot.
  HILLS: [{ id: 'h', outline: square(-650, 0, 60), summit: 70, plateau: 65, slope: 120 }],
  LOWLANDS: [],
  RIVERS: [
    { id: 'r', centerline: [[-400, -400], [-400, 400]], width: [100, 100], waterLevel: 6, bankHeight: 10.5 },
    { id: 'c', kind: 'canal', centerline: [[0, -300], [0, 300]], width: [8, 8], waterLevel: 10.5, bankHeight: 11.5 },
  ],
  ISLANDS: [],
  ROADS: [{ id: 'road', points: [[150, -200], [150, 200]], width: 8 }],
  bounds: { minX: -800, maxX: 300, minZ: -300, maxZ: 300 },
};

describe('terrain data', () => {
  const hm = buildHeightmap(src, { spacing: 2, noise: 0, quays: [quay], pads: [{ id: 'forum', polygon: square(220, 0, 30) }] });
  const y = (x: number, z: number) => hm.heightAt(x * S, z * S) / S;

  it('encodes signed distances within their range', () => {
    for (const d of [-7.9, -2, 0, 0.5, 3, 7.9]) expect(decodeSdf(encodeSdf(d))).toBeCloseTo(d, 0);
    expect(decodeSdf(encodeSdf(100))).toBeCloseTo(SDF_RANGE, 1);
  });

  it('river profile: bed, beach, cut bank, bounded flood plain; canal: narrow and vertical', () => {
    const r = { waterLevel: 6, bankHeight: 10.5 };
    expect(riverBankProfile(r, 0, 50)).toBeCloseTo(2);
    expect(riverBankProfile(r, 50, 50)).toBeCloseTo(6.3, 1);
    expect(riverBankProfile(r, 70, 50)).toBeGreaterThan(10.4);
    // Steep beyond the plain, so hills keep their shape.
    expect(riverBankProfile(r, 50 + 16 + 120 + 100, 50)).toBeGreaterThan(40);
    expect(riverReach(r)).toBeGreaterThan(200);
    expect(canalProfile({ waterLevel: 10.5 }, 2, 4)).toBeCloseTo(8.9);
    expect(canalProfile({ waterLevel: 10.5 }, 6, 4)).toBe(Infinity);
    expect(riverReach({ bankHeight: 11, kind: 'canal' })).toBeLessThan(5);
  });

  it('keeps the hill beside the river, carves the canal, levels the quay', () => {
    expect(y(-650, 0)).toBeGreaterThan(64);
    expect(y(-400, 200)).toBeLessThan(3); // river bed
    expect(y(0, 0)).toBeLessThan(10); // canal bed below its water
    expect(y(10, 0)).toBeCloseTo(15, 0); // untouched beside the canal
    expect(y(-345, 0)).toBeCloseTo(11, 0); // quay top (left bank = east of a southward river)
  });

  it('builds road, pad, quay and canal data', () => {
    const data = buildTerrainData(hm, { padKind: () => 'travertine' });
    const road = decodeSdf(sampleChannel(hm, data.a, 2, 150 * S, 0) * 255);
    expect(road).toBeLessThan(-1);
    expect(decodeSdf(sampleChannel(hm, data.a, 2, 200 * S, 100 * S) * 255)).toBeGreaterThan(3);
    expect(decodeSdf(sampleChannel(hm, data.a, 3, 220 * S, 0) * 255)).toBeLessThan(-5);
    expect(sampleChannel(hm, data.b, 0, 220 * S, 0)).toBeCloseTo(PAD_KIND_VALUE.travertine, 1);
    // The quay strip is travertine-paved.
    expect(decodeSdf(sampleChannel(hm, data.a, 3, -340 * S, 0) * 255)).toBeLessThan(0);
    // The canal raises the local water level only inside its channel.
    expect(sampleChannel(hm, data.b, 3, 0, 0)).toBeGreaterThan(0.2);
    expect(sampleChannel(hm, data.b, 3, 12 * S, 0)).toBe(0);
  });

  it('segment index finds the true nearest foot', () => {
    const pts = [[0, 0], [100, 0], [100, 100], [250, 120]] as const;
    const line = chain(pts);
    const idx = indexSegments(pts, 40, 25);
    for (const [x, z] of [[50, 10], [110, 50], [200, 130], [95, 95]]) {
      const a = footOn(line, x, z);
      const b = footOn(line, x, z, nearSegments(idx, x, z));
      expect(b.d).toBeCloseTo(a.d);
      expect(b.s).toBeCloseTo(a.s);
    }
    expect(nearSegments(idx, 500, 500)).toBeNull();
    const rq = resolveQuays([quay], 'r', chain(src.RIVERS[0].centerline));
    expect(rq[0].s1 - rq[0].s0).toBeCloseTo(200);
  });

  it('pad kinds by landmark category', () => {
    expect(padKindFor('forum')).toBe('travertine');
    expect(padKindFor('camp')).toBe('gravel');
    expect(padKindFor('house')).toBe('earth');
  });
});
