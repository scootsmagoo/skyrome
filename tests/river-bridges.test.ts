import { describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import { WORLD_SCALE } from '../src/world/coords';
import { buildHeightmap } from '../src/world/terrain/heightmap';
import { landmarkPads } from '../src/world/rome/buildRome';
import { deckAt, extradosAt, layoutBridge, maxGrade, segmentalArch, simplifyProfile } from '../src/world/bridges/layout';
import { BRIDGE_STYLES, styleFor } from '../src/world/bridges/specs';

const S = WORLD_SCALE;

describe('bridge layout (pure)', () => {
  it('segmental arch geometry: the circle passes through both springings and the crown', () => {
    const { radius, drop } = segmentalArch(20, 7);
    expect(Math.hypot(10, drop)).toBeCloseTo(radius, 6);
    expect(radius - drop).toBeCloseTo(7, 6);
    const semi = segmentalArch(20, 10);
    expect(semi.radius).toBeCloseTo(10, 6);
    expect(semi.drop).toBeCloseTo(0, 6);
  });

  it('simplifyProfile keeps straight runs as one segment and keeps the kinks', () => {
    const pts: [number, number][] = [];
    for (let x = 0; x <= 10; x += 0.5) pts.push([x, x < 5 ? x * 0.1 : 0.5 - (x - 5) * 0.1]);
    const s = simplifyProfile(pts, 0.01);
    expect(s.length).toBe(3);
    expect(s[1][0]).toBeCloseTo(5);
  });

  it('a flat-bank river gets an arcade over the channel and a deck no steeper than the grade', () => {
    // Bank at 6 m, 40 m wide channel (bed 1.2) in the middle of a 70 m crossing.
    const ground = (u: number) => (u > 15 && u < 55 ? 1.2 : 6);
    const L = layoutBridge({ length: 70, ground, waterY: 3.6, S, arches: BRIDGE_STYLES['pons-fabricius'], grade: 0.18 });
    expect(L.arches.length).toBe(2);
    expect(L.arcade[0]).toBeLessThanOrEqual(15.5);
    expect(L.arcade[1]).toBeGreaterThanOrEqual(54.5);
    expect(maxGrade(L.deck)).toBeLessThanOrEqual(0.19);
    for (const a of L.arches) {
      const c = (a.u0 + a.u1) / 2;
      expect(deckAt(L.deck, c)).toBeGreaterThan((extradosAt(a, c) ?? 0) + 0.2);
      expect(a.spring).toBeGreaterThan(3.6);
    }
    for (const p of L.piers) expect(p.bottom).toBeLessThan(1.2);
    // The ramps come down to the street.
    expect(Math.abs(deckAt(L.deck, L.start) - ground(L.start))).toBeLessThan(0.3);
    expect(Math.abs(deckAt(L.deck, L.end) - ground(L.end))).toBeLessThan(0.3);
  });

  it('every atlas bridge has a style; unknown ids fall back to equal spans', () => {
    for (const b of atlas.BRIDGES) {
      const st = styleFor(b.id, b.arches, b.length ?? 100);
      if (b.arches === 0) expect(st.kind).toBe('timber');
      else {
        expect(st.kind).toBe('stone');
        expect(st.spans.length).toBe(b.arches);
        expect(st.piers.length).toBe(b.arches - 1);
      }
    }
    const f = styleFor('pons-test', 4, 100);
    expect(f.spans.length).toBe(4);
  });
});

describe('bridges on the real terrain', () => {
  // Terrain around the central bridges only (fast); same pads as the game.
  const bounds = { minX: -720, maxX: -260, minZ: 80, maxZ: 620 };
  const hm = buildHeightmap({ ...atlas, bounds } as never, { spacing: 2, pads: landmarkPads(atlas.CITY_BOUNDS) });
  const waterY = hm.waterLevelY;
  for (const id of ['pons-fabricius', 'pons-cestius', 'pons-aemilius', 'pons-sublicius']) {
    it(`${id}: spans the river, walkable deck, arches clear the water`, () => {
      const br = atlas.BRIDGES.find((b) => b.id === id)!;
      const ax = br.a[0] * S, az = br.a[1] * S;
      const bx = br.b[0] * S, bz = br.b[1] * S;
      const length = Math.hypot(bx - ax, bz - az);
      const ux = (bx - ax) / length, uz = (bz - az) / length;
      const ground = (u: number) => hm.heightAt(ax + ux * u, az + uz * u);
      const st = styleFor(br.id, br.arches, br.length ?? length / S);
      const L = layoutBridge({ length, ground, waterY, S, arches: st, deckAbove: st.deckAbove, grade: st.kind === 'timber' ? 0.16 : 0.19 });
      // Walkable: under ~11.5° everywhere (the character controller climbs up to 50°).
      expect(maxGrade(L.deck)).toBeLessThan(0.205);
      // The deck never dips into the ground between the ends.
      for (let u = 0; u <= length; u += 1) expect(deckAt(L.deck, u)).toBeGreaterThan(ground(u) + 0.1);
      // Wet channel covered by the arcade (stone) or the trestle.
      for (let u = 0; u <= length; u += 0.5) if (ground(u) < waterY - 0.5) {
        expect(u).toBeGreaterThanOrEqual(L.arcade[0] - 0.01);
        expect(u).toBeLessThanOrEqual(L.arcade[1] + 0.01);
      }
      for (const a of L.arches) expect(a.spring).toBeGreaterThan(waterY);
      // Ramps end at street level, not in mid-air.
      expect(deckAt(L.deck, L.start) - ground(L.start)).toBeLessThan(0.35);
      expect(deckAt(L.deck, L.end) - ground(L.end)).toBeLessThan(0.35);
    });
  }
});
