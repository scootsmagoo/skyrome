/**
 * Palatine / Circus Maximus / Porta Capena (palcirc crew): layout arithmetic and walkability of
 * the generated stands, gate and palace stairs (the character controller's rules, as in
 * tests/arch.stairs.test.ts).
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Physics, initPhysics } from '../src/core/Physics';
import { Rng } from '../src/core/Rng';
import { MeshBuilder, registerColliders } from '../src/gfx/MeshBuilder';
import type { Game } from '../src/core/Game';
import { LANDMARK_BY_ID } from '../src/data/atlas';
import type { LandmarkContext, LandmarkData } from '../src/world/landmarks/types';
import {
  CIRCUS,
  bays,
  carceresFaceBays,
  carceresStalls,
  channelGap,
  circusSection,
  facadeBays,
  ringPoint,
  stations,
  subtractIntervals,
  totalStations,
} from '../src/world/landmarks/builders/palcirc/circusLayout';
import { buildStandsAll, circusGaps } from '../src/world/landmarks/builders/palcirc/circus';
import { ringFrame } from '../src/world/landmarks/builders/palcirc/ring';
import { relLocal, toHost, fromHost } from '../src/world/landmarks/builders/palcirc/frames';
import { builders as capenaBuilders, capenaArcade } from '../src/world/landmarks/builders/palcirc-capena';
import { PL, SQUARE, appiaTombs, capenaKeepOuts, quarterLots, tombBox, tombHalf } from '../src/world/landmarks/builders/palcirc/capenaParts';
import { augFacadePlan, augFaceZ } from '../src/world/landmarks/builders/palcirc/augFacade';
import { builders as palaceBuilders, AUG } from '../src/world/landmarks/builders/palcirc-palace';
import { builders as circusBuilders } from '../src/world/landmarks/builders/palcirc-circus';
import { builders as germalusBuilders } from '../src/world/landmarks/builders/palcirc-germalus';

describe('circus layout', () => {
  it('stand rows are human scale and every riser is climbable through the aisles', () => {
    const sec = circusSection();
    expect(sec.rows.length).toBe(14);
    for (const r of sec.rows) {
      expect(r.y - r.prevY).toBeCloseTo(0.4, 5);
      expect(r.u1 - r.u0).toBeCloseTo(0.7, 5);
      // Aisle half-step: 0.2 m rise on a 0.35 m tread.
      expect((r.y - r.prevY) / 2).toBeLessThanOrEqual(0.22);
    }
    for (const w of sec.walks) {
      const n = Math.round((w.y1 - w.y) / 0.2);
      // The balteus flight (0.34 m treads) fits in front of the wall.
      expect(n * 0.34).toBeLessThanOrEqual(w.u1 - w.u0 + 1e-6);
      expect((w.y1 - w.y) / n).toBeLessThanOrEqual(0.22);
    }
    // Outline is monotonic outward and stays inside the band (behind the facade's inner face).
    for (let i = 1; i < sec.outline.length; i++) expect(sec.outline[i][0]).toBeGreaterThanOrEqual(sec.outline[i - 1][0] - 1e-9);
    expect(sec.gallery.u1).toBeCloseTo(sec.band - CIRCUS.wall, 6);
    expect(sec.gallery.eaveY).toBeLessThan(CIRCUS.height);
  });

  it('ring stations are continuous round the straights and the curve', () => {
    const st = stations();
    for (const s of [st.curveStart, st.curveEnd]) {
      const a = ringPoint(s - 1e-6, 5);
      const c = ringPoint(s + 1e-6, 5);
      expect(Math.hypot(a.x - c.x, a.z - c.z)).toBeLessThan(1e-3);
    }
    const apex = ringPoint(st.apex, 0);
    expect(apex.x).toBeCloseTo(0, 6);
    expect(apex.z).toBeCloseTo(CIRCUS.halfLen - CIRCUS.halfW + CIRCUS.track, 6);
    expect(totalStations()).toBeCloseTo(st.end, 6);
  });

  it('facade bays tile the perimeter with the gap left open for the Arch of Titus', () => {
    const full = facadeBays();
    for (const bay of full) expect(Math.abs(bay.w - CIRCUS.bay)).toBeLessThan(0.15);
    const gaps = circusGaps();
    const withGap = facadeBays(gaps.channel);
    expect(withGap.length).toBeLessThan(full.length);
    // No bay centre falls inside the channel on the curve.
    for (const bay of withGap.filter((b) => b.side === 0)) expect(bay.x < gaps.channel[0] - 1 || bay.x > gaps.channel[1] + 1).toBe(true);
    const cb = carceresFaceBays();
    expect(cb.length).toBe(2 * bays(CIRCUS.halfW - 4.8).n);
  });

  it('carceres: twelve stalls on an arc concave to the track', () => {
    const st = carceresStalls();
    expect(st.length).toBe(12);
    expect(st[0].z).toBeGreaterThan(st[5].z);
    expect(st[11].z).toBeCloseTo(st[0].z, 6);
    for (const s of st) expect(s.w).toBeGreaterThan(3.0);
  });

  it('interval subtraction and the curved-end channel', () => {
    expect(subtractIntervals(0, 10, [[2, 3], [5, 7]])).toEqual([[0, 2], [3, 5], [7, 10]]);
    expect(subtractIntervals(0, 10, [[-1, 11]])).toEqual([]);
    const g = channelGap(-3, 3, 0)!;
    const st = stations();
    expect((g[0] + g[1]) / 2).toBeCloseTo(st.apex, 6);
    expect(channelGap(-3, 3, 30)![1] - channelGap(-3, 3, 30)![0]).toBeLessThan(g[1] - g[0]);
  });

  it('nested landmarks sit where the atlas puts them (relative frames round-trip)', () => {
    const host = LANDMARK_BY_ID['circus-maximus'] as LandmarkData;
    const pul = LANDMARK_BY_ID['pulvinar'] as LandmarkData;
    const r = relLocal(host, pul);
    // The pulvinar is in the Palatine (+x) stands, facing the track.
    expect(r.x).toBeGreaterThan(CIRCUS.track);
    expect(r.x).toBeLessThan(CIRCUS.halfW);
    const [x, z] = toHost(r, 1, 2);
    const [x2, z2] = fromHost(r, x, z);
    expect(x2).toBeCloseTo(1, 6);
    expect(z2).toBeCloseTo(2, 6);
  });
});

describe('Porta Capena arcade', () => {
  it('has the wide arch over the gate and contiguous bays', () => {
    const a = capenaArcade();
    const wide = a.find((b) => b.x0 < 0 && b.x1 > 0)!;
    expect(wide.span).toBeGreaterThan(8);
    for (let i = 1; i < a.length; i++) expect(a[i].x0).toBeCloseTo(a[i - 1].x1, 6);
    // Arches spring above the gate block (6.6 m) so carts pass under the wide one.
    expect(wide.spring).toBeGreaterThan(6.6);
  });
});

describe('Porta Capena surroundings', () => {
  it('tombs line the Via Appia outside the gate without touching the road or each other', () => {
    const tombs = appiaTombs();
    expect(tombs.length).toBeGreaterThanOrEqual(12);
    const boxes = tombs.map((t) => {
      const [ha, hd] = tombHalf(t.kind);
      const x0 = t.side * (PL + t.setback), x1 = t.side * (PL + t.setback + 2 * hd);
      return { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: t.z - ha, z1: t.z + ha };
    });
    for (const [i, a] of boxes.entries()) {
      // Behind the property line, outside the gate, within the first ~160 m of the road.
      expect(Math.min(Math.abs(a.x0), Math.abs(a.x1))).toBeGreaterThanOrEqual(PL);
      expect(a.z1).toBeLessThan(-30);
      expect(a.z0).toBeGreaterThan(-160);
      for (const b of boxes.slice(i + 1)) {
        const overlap = a.x0 < b.x1 && b.x0 < a.x1 && a.z0 < b.z1 && b.z0 < a.z1;
        expect(overlap).toBe(false);
      }
    }
    // Some carry inscriptions to read, some a grave lamp.
    expect(tombs.filter((t) => t.text).length).toBeGreaterThanOrEqual(6);
    expect(tombs.some((t) => t.lamp)).toBe(true);
  });

  it('the tombs keep out of the neighbouring landmarks (the Temple of Honos and Virtus by the road)', () => {
    const keep = capenaKeepOuts();
    expect(keep.length).toBeGreaterThan(0);
    const kept = appiaTombs(keep);
    expect(kept.length).toBeGreaterThanOrEqual(12);
    expect(kept.length).toBeLessThan(appiaTombs().length);
    // The tower tomb at z = −117 stood inside the temple's footprint.
    expect(kept.some((t) => t.z === -117)).toBe(false);
    for (const t of kept) {
      const b = tombBox(t);
      expect(Math.min(Math.abs(b.x0), Math.abs(b.x1))).toBeGreaterThanOrEqual(PL);
    }
  });

  it('the gate quarter: blocks front the street behind the sidewalk and leave the square clear', () => {
    const lots = quarterLots();
    for (const [i, a] of lots.entries()) {
      expect(a.z0).toBeGreaterThanOrEqual(SQUARE.z1);
      expect(a.z1 - a.z0).toBeGreaterThan(8);
      for (const b of lots.slice(i + 1)) if (a.side === b.side) expect(a.z1 <= b.z0 || b.z1 <= a.z0).toBe(true);
    }
    expect(PL).toBeGreaterThan(3.5);
  });
});

describe('Domus Augustana facade plan', () => {
  it('a concave segment meets the chord at its ends, with even bays, clear of the pad ramp', () => {
    const p = augFacadePlan();
    expect(augFaceZ(p, 0)).toBeCloseTo(p.front + p.sag, 6);
    expect(augFaceZ(p, p.c - 1e-6)).toBeCloseTo(p.front, 3);
    expect(augFaceZ(p, p.hw)).toBe(p.front);
    const arc = p.bays.filter((b) => b.kind === 'arc');
    for (const b of arc) {
      expect(Math.abs(b.w - arc[0].w)).toBeLessThan(1e-6);
      // Faces point toward the circle's centre, i.e. out of the palace (−z side).
      expect(b.nz).toBeLessThan(0);
    }
    // The deepest point stays in front of where the pad's terrain ramp begins (z ≈ −72).
    expect(p.front + p.sag).toBeLessThanOrEqual(-71.9);
    // The colonnade's ends land inside the pavilions' inner faces.
    expect(p.Rc * Math.cos(p.a0)).toBeLessThan(p.pav);
  });
});

// ---------------------------------------------------------------- walkability (character controller)

function walk(p: Physics, start: THREE.Vector3, dir: THREE.Vector3, speed: number, seconds: number) {
  p.step(1 / 60);
  const ch = p.createCharacter(start);
  const dt = 1 / 60;
  const v = new THREE.Vector3();
  let grounded = false;
  const k = 1 - Math.exp(-14 * dt);
  let maxY = -Infinity;
  for (let i = 0; i < seconds * 60; i++) {
    const accel = grounded ? k : 1 - Math.exp(-2.5 * dt);
    v.z += (speed * dir.z - v.z) * accel;
    v.x += (speed * dir.x - v.x) * accel;
    if (grounded) v.y = -2;
    else v.y = Math.max(v.y - 20 * dt, -55);
    ch.controller.computeColliderMovement(ch.collider, { x: v.x * dt, y: v.y * dt, z: v.z * dt });
    const mv = ch.controller.computedMovement();
    grounded = ch.controller.computedGrounded();
    if (!grounded) {
      if (Math.abs(mv.x / dt) < Math.abs(v.x) * 0.5) v.x = mv.x / dt;
      if (Math.abs(mv.z / dt) < Math.abs(v.z) * 0.5) v.z = mv.z / dt;
    }
    const t = ch.body.translation();
    ch.body.setNextKinematicTranslation({ x: t.x + mv.x, y: t.y + mv.y, z: t.z + mv.z });
    p.step(dt);
    maxY = Math.max(maxY, t.y + mv.y - ch.halfHeight - ch.radius);
  }
  const t = ch.body.translation();
  const end = new THREE.Vector3(t.x, t.y - ch.halfHeight - ch.radius, t.z);
  return Object.assign(end, { maxY });
}

/** Minimal LandmarkContext on flat ground for building in Node (no scene, no sky). */
function fakeCtx(id: string, p: Physics): LandmarkContext {
  const game = { physics: p, scene: { add() {} }, addSystem() {}, removeSystem() {}, camera: { position: new THREE.Vector3() } } as unknown as Game;
  return { game, lm: LANDMARK_BY_ID[id] as LandmarkData, S: 0.6, rng: new Rng(id), groundAt: () => 0, builder: () => new MeshBuilder(), detail: 'high' };
}

function world(p: Physics) {
  // Flat "terrain".
  p.addBox(new THREE.Vector3(0, -0.5, 0), new THREE.Vector3(600, 0.5, 600));
}

describe('palcirc walkability', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  it('circus: up the vomitorium stair from the track to the first walkway', () => {
    const p = new Physics();
    world(p);
    const b = new MeshBuilder();
    const sec = circusSection();
    const gaps = circusGaps();
    buildStandsAll(b, sec, gaps, 'high');
    registerColliders({ physics: p } as unknown as Game, b.colliders);
    const t = gaps.tunnels.find((x) => x.side === -1)!;
    const F = ringFrame(t.s, 0);
    // Stair along the tunnel's left wall (x ∈ [−1.5, −0.5] in the ring frame), climbing outward (+z).
    const start = new THREE.Vector3(-1.0, 0.2, -1.5).applyMatrix4(F);
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(F);
    const end = walk(p, start.add(new THREE.Vector3(0, 0.9, 0)), dir, 4.4, 10);
    expect(end.y).toBeGreaterThan(sec.walks[0].y - 0.15);
  });

  it('circus: from the first walkway up the aisle to the top gallery', () => {
    const p = new Physics();
    world(p);
    const b = new MeshBuilder();
    const sec = circusSection();
    const gaps = circusGaps();
    const { aisles } = buildStandsAll(b, sec, gaps, 'high');
    registerColliders({ physics: p } as unknown as Game, b.colliders);
    const s = aisles.find((x) => x < stations().curveStart - 20)!;
    const F = ringFrame(s, 0);
    const w1 = sec.walks[0];
    const start = new THREE.Vector3(0, w1.y + 1.0, (w1.u0 + w1.u1) / 2 - 0.3).applyMatrix4(F);
    const dir = new THREE.Vector3(0, 0, 1).transformDirection(F);
    // (Only the stands are built here: past the gallery the walker would leave through the absent facade.)
    const end = walk(p, start, dir, 4.4, 12);
    expect(end.maxY).toBeGreaterThan(sec.gallery.y - 0.15);
  });

  it('Porta Capena: through the gate passage along the Via Appia', () => {
    const p = new Physics();
    world(p);
    const built = capenaBuilders[0].build(fakeCtx('porta-capena', p));
    registerColliders({ physics: p } as unknown as Game, built.colliders);
    const end = walk(p, new THREE.Vector3(-0.6, 1.2, -16), new THREE.Vector3(0, 0, 1), 3, 10);
    expect(end.z).toBeGreaterThan(12);
    // ...and the gate's piers are solid.
    const blocked = walk(p, new THREE.Vector3(-3.4, 1.2, -6), new THREE.Vector3(0, 0, 1), 3, 4);
    expect(blocked.z).toBeLessThan(-3);
  });

  it('Domus Augustana: up the stair from the sunken peristyle to the upper palace level', () => {
    const p = new Physics();
    world(p);
    const built = palaceBuilders.find((x) => x.handles.includes('domus-augustana'))!.build(fakeCtx('domus-augustana', p));
    registerColliders({ physics: p } as unknown as Game, built.colliders);
    const end = walk(p, new THREE.Vector3(0, AUG.low + 1.0, -16.5), new THREE.Vector3(0, 0, 1), 4.4, 10);
    expect(end.y).toBeGreaterThan(AUG.up - 0.15);
    // ...on through the front hall and the doorway in the upper peristyle's (solid) back wall.
    expect(end.z).toBeGreaterThan(5);
  });

  // The facade's tabernae and the gallery over the Circus are walked on the real terrain in
  // tests/palcirc-world.test.ts (flat test ground hides the drop under the gallery).

  it('every palcirc landmark offers the player a "thing" (GDD §12.3)', () => {
    const p = new Physics();
    const all = [...circusBuilders, ...capenaBuilders, ...palaceBuilders, ...germalusBuilders];
    const things = new Set(['inscription', 'vista', 'shrine', 'container']);
    for (const b of all) for (const id of b.handles) {
      const built = b.build(fakeCtx(id, p));
      expect((built.spots ?? []).some((s) => things.has(s.kind)), id).toBe(true);
    }
    // The quest hooks at the spawn.
    const cap = capenaBuilders[0].build(fakeCtx('porta-capena', p));
    for (const id of ['spawn-capena', 'courier-ambush', 'night-cart']) expect(cap.spots?.some((s) => s.id === id), id).toBe(true);
  });

  it('the Lupercal\'s Vicus Tuscus row is the Leaning Insula and Tuccius\' house of the content (src/content/places.ts WORLD_SPOTS)', () => {
    const p = new Physics();
    const built = germalusBuilders.find((x) => x.handles.includes('lupercal'))!.build(fakeCtx('lupercal', p));
    const at = (id: string) => built.spots?.find((s) => s.id === id)?.position;
    const ids = ['insula-nutans', 'insula-nutans-taberna', 'insula-nutans-scalae', 'insula-nutans-tectum', 'insula-nutans-cenaculum', 'insula-tuccii'];
    for (const id of ids) expect(at(id), id).toBeTruthy();
    // The places of one household stand on one frontage and apart from each other (people stand there).
    const nutans = ids.slice(0, 5).map((id) => at(id)!);
    for (let i = 0; i < nutans.length; i++) {
      for (let j = i + 1; j < nutans.length; j++) expect(nutans[i].distanceTo(nutans[j]), `${ids[i]} / ${ids[j]}`).toBeGreaterThan(1.4);
      expect(nutans[i].distanceTo(nutans[0]), ids[i]).toBeLessThan(8);
    }
    // The two houses are different blocks of the row.
    expect(at('insula-tuccii')!.distanceTo(at('insula-nutans')!)).toBeGreaterThan(25);
  });

  it('every palcirc builder also builds at low detail', () => {
    const p = new Physics();
    const all = [...circusBuilders, ...capenaBuilders, ...palaceBuilders, ...germalusBuilders];
    for (const b of all) for (const id of b.handles) {
      const built = b.build({ ...fakeCtx(id, p), detail: 'low' });
      expect(built.colliders.length).toBeGreaterThan(0);
    }
  });

  it('every palcirc builder runs in Node and emits spots inside a sane radius', () => {
    const p = new Physics();
    const all = [...circusBuilders, ...capenaBuilders, ...palaceBuilders, ...germalusBuilders];
    const ids = all.flatMap((b) => b.handles);
    expect(new Set(ids).size).toBe(ids.length);
    for (const b of all) {
      for (const id of b.handles) {
        const built = b.build(fakeCtx(id, p));
        expect(built.colliders.length).toBeGreaterThan(0);
        for (const s of built.spots ?? []) {
          expect(Number.isFinite(s.position.x + s.position.y + s.position.z)).toBe(true);
          expect(Math.hypot(s.position.x, s.position.z)).toBeLessThan(260);
        }
      }
    }
  });
});
