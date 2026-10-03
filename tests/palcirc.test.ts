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
