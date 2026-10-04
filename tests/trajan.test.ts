/**
 * Forum of Trajan complex (src/world/landmarks/builders/trajan-*.ts): the shared plan, the
 * builders' budgets and spots, and walkability of the main routes, checked on the colliders the
 * builders hand to physics (a capsule-free "ground profile" walk: each step up must be ≤ 0.26 m and
 * nothing may block the 1.8 m tall walker).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { bearingToRotationY } from '../src/core/math';
import { LANDMARK_BY_ID } from '../src/data/atlas';
import { MeshBuilder, transformCollider, type ColliderSpec } from '../src/gfx/MeshBuilder';
import { toGame } from '../src/world/coords';
import { builderFor } from '../src/world/landmarks/registry';
import type { LandmarkBuild, LandmarkData, Spot } from '../src/world/landmarks/types';
import { SIDE_X } from '../src/world/landmarks/builders/trajan-basilica';
import { PLAN, TRAJAN_INSCRIPTIONS, divide, flight, forumSite, forumToLocal, uvToLocal, uvToWorld, worldToLocal, worldToUV } from '../src/world/landmarks/builders/trajan-layout';
import { brickFront } from '../src/world/landmarks/builders/trajan-facades';
import { coneRoof } from '../src/world/landmarks/builders/trajan-kit';

const IDS = ['forum-trajan', 'forum-trajan-gateway', 'equus-traiani', 'basilica-ulpia', 'column-trajan', 'bibliotheca-ulpia-east', 'bibliotheca-ulpia-west', 'markets-trajan'];
const SPOT_KINDS = new Set(['inscription', 'vista', 'shrine', 'container', 'door', 'npc', 'vendor', 'spawn', 'sit', 'stall']);

const lmOf = (id: string) => LANDMARK_BY_ID[id] as unknown as LandmarkData;

function build(id: string, detail: 'high' | 'low' = 'high'): LandmarkBuild {
  const lm = lmOf(id);
  return builderFor(lm)!.build({ game: {} as never, lm, S: 0.6, rng: new Rng(id), detail, builder: () => new MeshBuilder(), groundAt: () => 0 });
}

/** Triangles with every LOD at its first (near) level. */
function nearTriangles(o: THREE.Object3D): number {
  let n = 0;
  const visit = (x: THREE.Object3D) => {
    if ((x as THREE.LOD).isLOD) return visit((x as THREE.LOD).levels[0].object);
    const m = x as THREE.Mesh;
    if (m.isMesh) n += m.geometry.getAttribute('position').count / 3;
    x.children.forEach(visit);
  };
  visit(o);
  return n;
}

/** Placement matrix of a landmark on a flat pad (all Trajanic landmarks sit at 17.5 m). */
function placement(id: string): THREE.Matrix4 {
  const lm = lmOf(id);
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  return new THREE.Matrix4().makeRotationY(bearingToRotationY(lm.rotation)).setPosition(gx, 0, gz);
}

const builds = new Map<string, LandmarkBuild>();
const get = (id: string) => {
  let b = builds.get(id);
  if (!b) builds.set(id, (b = build(id)));
  return b;
};

/** Every collider of the complex in world (game) space. */
function worldColliders(): ColliderSpec[] {
  const out: ColliderSpec[] = [];
  for (const id of IDS) for (const c of get(id).colliders) out.push(transformCollider(c, placement(id)));
  return out;
}

const _q = new THREE.Quaternion();
const _v = new THREE.Vector3();
/** Colliders whose footprint contains (x, z), expanded by `pad`, as [bottom, top] intervals. */
function columnAt(cols: ColliderSpec[], x: number, z: number, pad: number): [number, number][] {
  const out: [number, number][] = [];
  for (const c of cols) {
    if (c.kind === 'box') {
      _q.copy(c.rotation ?? new THREE.Quaternion()).invert();
      _v.set(x - c.center.x, 0, z - c.center.z).applyQuaternion(_q);
      if (Math.abs(_v.x) <= c.half.x + pad && Math.abs(_v.z) <= c.half.z + pad) out.push([c.center.y - c.half.y, c.center.y + c.half.y]);
    } else if (c.kind === 'cylinder') {
      if (Math.hypot(x - c.center.x, z - c.center.z) <= c.radius + pad) out.push([c.center.y - c.halfHeight, c.center.y + c.halfHeight]);
    }
  }
  return out;
}

interface Walk {
  /** Final ground height, and where (if anywhere) the walker was blocked. */
  y: number;
  blockedAt: THREE.Vector3 | null;
  maxStep: number;
}

/** Walk a polyline (world xz) from height y0, climbing ≤ 0.3 m per sample and checking headroom. */
function walk(cols: ColliderSpec[], pts: THREE.Vector3[], y0: number): Walk {
  let y = y0;
  let maxStep = 0;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const n = Math.max(1, Math.ceil(a.distanceTo(b) / 0.1));
    for (let k = 1; k <= n; k++) {
      const p = a.clone().lerp(b, k / n);
      const under = columnAt(cols, p.x, p.z, 0).filter(([, top]) => top <= y + 0.3);
      const ny = Math.max(0, ...under.map(([, top]) => top));
      maxStep = Math.max(maxStep, ny - y);
      y = ny;
      // Anything solid between knee height and the head, within the capsule radius, blocks.
      const blocking = columnAt(cols, p.x, p.z, 0.3).some(([bot, top]) => top > y + 0.3 && bot < y + 1.8);
      if (blocking) return { y, blockedAt: p, maxStep };
    }
  }
  return { y, blockedAt: null, maxStep };
}

/** Forum-frame (u·S, v) game point → world game point. */
const fl = (x: number, z: number) => {
  const m = placement('forum-trajan');
  return new THREE.Vector3(x, 0, z).applyMatrix4(m);
};
const spotWorld = (id: string, spotId: string) => {
  const s = get(id).spots!.find((q) => q.id === spotId)!;
  const m = placement(id);
  const p = s.position.clone().applyMatrix4(m);
  const h = s.heading! + bearingToRotationY(lmOf(id).rotation);
  return { p, dir: new THREE.Vector3(Math.sin(h), 0, Math.cos(h)) };
};

describe('trajan layout', () => {
  it('maps the forum frame to the world and back', () => {
    for (const [u, v] of [
      [0, 0],
      [46.3, 62.5],
      [-80, -130],
    ]) {
      const [x, z] = uvToWorld(u, v);
      const [u2, v2] = worldToUV(x, z);
      expect(u2).toBeCloseTo(u, 6);
      expect(v2).toBeCloseTo(v, 6);
    }
    // +v points to the SE gateway (bearing 140), +u to the SW hemicycle (bearing 230).
    const f = forumSite();
    const [gx, gz] = uvToWorld(0, 100);
    expect(Math.atan2(gx - f.center[0], -(gz - f.center[1])) / (Math.PI / 180)).toBeCloseTo(140, 3);
  });

  it('forumToLocal agrees with uvToLocal for every Trajanic landmark', () => {
    for (const id of IDS) {
      const lm = lmOf(id);
      const F = forumToLocal(lm);
      for (const [u, v] of [
        [0, 0],
        [30, -100],
        [-59.25, -10],
      ]) {
        const p = new THREE.Vector3(u * 0.6, 0, -v * 0.6).applyMatrix4(F);
        const [lx, lz] = uvToLocal(lm, u, v);
        expect(p.x).toBeCloseTo(lx, 4);
        expect(p.z).toBeCloseTo(lz, 4);
      }
      const [wx, wz] = uvToWorld(10, 10);
      const [lx, lz] = worldToLocal(lm, wx, wz);
      expect(Number.isFinite(lx) && Number.isFinite(lz)).toBe(true);
    }
  });

  it('plans walkable flights and even colonnades', () => {
    for (const rise of [0.54, 0.72, 4.72, 8.4]) {
      const f = flight(rise);
      expect(f.riser).toBeLessThanOrEqual(0.2 + 1e-9);
      expect(f.tread).toBeGreaterThanOrEqual(0.3);
      expect(f.count * f.riser).toBeCloseTo(rise, 9);
    }
    const xs = divide(-36.3, 36.3, 2.5);
    expect(xs[0]).toBe(-36.3);
    expect(xs[xs.length - 1]).toBeCloseTo(36.3, 9);
    expect(Math.abs(xs[1] - xs[0] - 2.5)).toBeLessThan(0.1);
    expect(PLAN.basilica.halfLength * 2).toBeCloseTo(117, 6);
  });
});

describe('trajan builders', () => {
  it('every assigned id has its own builder', () => {
    for (const id of IDS) expect(builderFor(lmOf(id))!.handles).toContain(id);
  });

  it('stay within their triangle budgets, and low detail is lighter', () => {
    const budget: Record<string, number> = {
      'forum-trajan': 260_000,
      'basilica-ulpia': 260_000,
      'markets-trajan': 150_000,
      'forum-trajan-gateway': 120_000,
      'column-trajan': 80_000,
      'equus-traiani': 30_000,
      'bibliotheca-ulpia-east': 40_000,
      'bibliotheca-ulpia-west': 40_000,
    };
    for (const id of IDS) {
      const hi = nearTriangles(get(id).object);
      const lo = nearTriangles(build(id, 'low').object);
      expect(hi, id).toBeLessThan(budget[id]);
      expect(lo, id).toBeLessThanOrEqual(hi);
    }
  });

  it('produce finite colliders', () => {
    for (const id of IDS) {
      const cols = get(id).colliders;
      expect(cols.length, id).toBeGreaterThan(2);
      for (const c of cols) {
        if (c.kind === 'trimesh') continue;
        const vals = c.kind === 'box' ? [c.center.x, c.center.y, c.center.z, c.half.x, c.half.y, c.half.z] : [c.center.x, c.center.y, c.center.z, c.radius, c.halfHeight];
        expect(vals.every(Number.isFinite), id).toBe(true);
      }
    }
  });

  it('expose unique, typed spots, including every promised "thing"', () => {
    const all: Spot[] = [];
    for (const id of IDS) all.push(...(get(id).spots ?? []));
    const ids = all.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of all) {
      expect(SPOT_KINDS.has(s.kind), s.id).toBe(true);
      expect([s.position.x, s.position.y, s.position.z, s.heading ?? 0].every(Number.isFinite), s.id).toBe(true);
    }
    for (const want of ['column-door', 'column-inscription', 'column-vista-gallery', 'equus-inscription', 'forum-gateway-inscription', 'basilica-attic-inscription', 'markets-stair-foot', 'markets-mensa-ponderaria', 'forum-tribunal-consul', 'forum-altar', 'library-east-label', 'library-west-label']) {
      expect(ids, want).toContain(want);
    }
    expect(all.filter((s) => s.id.startsWith('markets') && s.kind === 'stall').length).toBeGreaterThanOrEqual(20);
    expect(all.filter((s) => s.kind === 'sit').length).toBeGreaterThanOrEqual(20);
    // Readable texts exist for the inscription spots (side variants share a text).
    for (const s of all.filter((q) => q.kind === 'inscription')) {
      const key = s.id.replace(/-(ne|sw)$/, '');
      expect(TRAJAN_INSCRIPTIONS[key], s.id).toBeDefined();
    }
  });

  it('build every landmark at low detail without errors', () => {
    for (const id of IDS) expect(() => build(id, 'low')).not.toThrow();
  });
});

describe('trajan walkability (collider ground profile)', () => {
  const cols = worldColliders();
  const route = (pts: [number, number][]) => pts.map(([x, z]) => fl(x, z));

  const cases: { name: string; pts: () => THREE.Vector3[]; y0: number; y: number; tol?: number }[] = [
    { name: 'square → NE portico over the giallo steps', pts: () => route([[-20, 0], [-33, 0]]), y0: 0, y: 0.54 },
    { name: 'portico → NE exedra through the screen', pts: () => route([[-30, 6], [-44, 6]]), y0: 0.54, y: 0.54 },
    { name: 'outside → square through the gateway', pts: () => route([[0, -52], [0, -20]]), y0: 0, y: 0.03 },
    { name: 'square → basilica nave through the central porch', pts: () => route([[0, 29], [0, 50]]), y0: 0, y: 0.72 },
    { name: 'square → basilica through a side porch', pts: () => route([[SIDE_X, 28], [SIDE_X, 46]]), y0: 0, y: 0.72 },
    { name: 'nave → column court through the back door', pts: () => route([[0, 66], [0, 77]]), y0: 0.72, y: 0.03 },
    { name: 'court → NE library', pts: () => route([[-3.5, 80.9], [-10.8, 80.9]]), y0: 0.03, y: 0.36 },
    { name: 'court → SW library', pts: () => route([[3.5, 80.9], [10.8, 80.9]]), y0: 0.03, y: 0.36 },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const w = walk(cols, c.pts(), c.y0);
      expect(w.blockedAt, `blocked at ${w.blockedAt?.toArray().map((v) => v.toFixed(2))}`).toBeNull();
      expect(w.maxStep).toBeLessThanOrEqual(0.26);
      expect(w.y).toBeCloseTo(c.y, 1);
    });
  }

  it('the viewing gallery stair climbs to the gallery in ≤ 0.2 m risers', () => {
    const { p, dir } = spotWorld('column-trajan', 'column-gallery-stair');
    const w = walk(cols, [p.clone().setY(0), p.clone().addScaledVector(dir, 8.5)], 0.03);
    expect(w.blockedAt).toBeNull();
    expect(w.maxStep).toBeLessThanOrEqual(0.21);
    expect(w.y).toBeGreaterThan(4.5);
  });

  it('the markets stair street climbs to the upper street level', () => {
    const { p, dir } = spotWorld('markets-trajan', 'markets-stair-foot');
    const w = walk(cols, [p.clone().setY(0), p.clone().addScaledVector(dir, 14.5)], 0.04);
    expect(w.blockedAt).toBeNull();
    expect(w.maxStep).toBeLessThanOrEqual(0.21);
    expect(w.y).toBeCloseTo(8.4, 1);
  });

  it('a hemicycle taberna can be entered from the ring street', () => {
    const { p, dir } = spotWorld('markets-trajan', 'markets-taberna5-stall');
    const w = walk(cols, [p.clone().setY(0), p.clone().addScaledVector(dir, 3.2)], 0.04);
    expect(w.blockedAt).toBeNull();
  });
});

describe('trajan lamps, roofs and street fronts', () => {
  /** A stand-in Game: collects systems, and a light pool that records requests. */
  function fakeGame() {
    const systems: { update?: (dt: number, a: number) => void }[] = [];
    const requests: { position: THREE.Vector3Like; intensity?: number }[] = [];
    const game = { addSystem: (s: (typeof systems)[number]) => (systems.push(s), s), lights: undefined as unknown };
    return { game, systems, requests, installPool: () => (game.lights = { request: (r: (typeof requests)[number]) => (requests.push(r), {}) }) };
  }

  it('queue their lamps until the light pool exists, then request them in world space', () => {
    const f = fakeGame();
    const lm = lmOf('forum-trajan');
    const built = builderFor(lm)!.build({ game: f.game as never, lm, S: 0.6, rng: new Rng('x'), detail: 'high', builder: () => new MeshBuilder(), groundAt: () => 0 });
    built.object.position.set(100, 10, -50);
    built.object.updateMatrixWorld(true);
    expect(f.systems.length).toBe(1);
    f.systems[0].update?.(0.016, 1);
    expect(f.requests.length).toBe(0); // no pool yet
    f.installPool();
    f.systems[0].update?.(0.016, 1);
    expect(f.requests.length).toBeGreaterThanOrEqual(20);
    for (const r of f.requests) {
      expect(Number.isFinite(r.position.x + r.position.y + r.position.z)).toBe(true);
      expect(r.position.y).toBeGreaterThan(10); // above the pad, in world space
    }
    f.systems[0].update?.(0.016, 1);
    expect(f.requests.length).toBeLessThan(200); // requested once
  });

  it('every Trajanic landmark lights something for the 04:30 start', () => {
    const f = fakeGame();
    for (const id of IDS) {
      const lm = lmOf(id);
      builderFor(lm)!.build({ game: f.game as never, lm, S: 0.6, rng: new Rng(id), detail: 'high', builder: () => new MeshBuilder(), groundAt: () => 0 });
    }
    f.installPool();
    for (const s of f.systems) s.update?.(0.016, 1);
    expect(f.systems.length).toBe(1); // one shared queue per game
    expect(f.requests.length).toBeGreaterThanOrEqual(60);
  });

  it('cone roofs face up on both hands of the axis', () => {
    for (const [a0, a1] of [
      [-Math.PI / 2, Math.PI / 2],
      [Math.PI / 2, Math.PI * 1.5],
    ]) {
      const b = new MeshBuilder();
      coneRoof(b, 'roof_tile', new THREE.Matrix4(), 0, 0, 10, a0, a1, 5, 8, 12);
      const g = b.build().children[0] as THREE.Mesh;
      const n = g.geometry.getAttribute('normal');
      for (let i = 0; i < n.count; i++) expect(n.getY(i)).toBeGreaterThan(0);
    }
  });

  it('brick street fronts shutter most shops at dawn and close the face with a collider', () => {
    const b = new MeshBuilder();
    const f = brickFront(b, new THREE.Matrix4(), { x0: -20, x1: 20, storeys: [4.4, 4.0], shops: true, seed: 3 });
    expect(f.shops.length).toBeGreaterThanOrEqual(9);
    expect(f.shops.filter((s) => s.open).length).toBeLessThan(f.shops.length);
    expect(f.top).toBeCloseTo(8.4, 6);
    expect(b.colliders.length).toBe(1);
  });

  const cols = worldColliders();
  it('the processional way runs from the gateway to the tribunal past the Equus and the candelabra', () => {
    const w = walk(cols, [fl(3.2, -34), fl(3.2, 18)], 0.03);
    expect(w.blockedAt, `blocked at ${w.blockedAt?.toArray().map((v) => v.toFixed(2))}`).toBeNull();
  });

  it('the street behind the Markets is open, and its shop fronts are solid', () => {
    const m = placement('markets-trajan');
    const P = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(m);
    const along = walk(cols, [P(-38, 19.6), P(38, 19.6)], 0);
    expect(along.blockedAt).toBeNull();
    const into = walk(cols, [P(3, 21), P(3, 15)], 0);
    expect(into.blockedAt).not.toBeNull();
  });
});
