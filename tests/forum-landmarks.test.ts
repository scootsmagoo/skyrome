/**
 * Forum Romanum and Velia landmark builders (src/world/landmarks/builders/forum-*.ts):
 * plaza geometry, inscription coverage, builder coverage of the assigned atlas ids, triangle
 * budgets of the near and far versions, spots, and walkability through the real colliders
 * (stairs up to the Rostra, into the Curia and the Basilica Iulia).
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Physics, initPhysics } from '../src/core/Physics';
import { Rng } from '../src/core/Rng';
import { LANDMARK_BY_ID } from '../src/data/atlas';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import type { Game } from '../src/core/Game';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext } from '../src/world/landmarks/types';
import { FORUM_INSCRIPTIONS, FORUM_PLAZA, bufferPolyline, clipPolyline, isSimplePolygon, plazaRoadStrips, pointInPolygon, polygonArea } from '../src/world/landmarks/builders/forum-data';
import * as square from '../src/world/landmarks/builders/forum-square';
import * as temples from '../src/world/landmarks/builders/forum-temples';
import * as basilicas from '../src/world/landmarks/builders/forum-basilicas';
import * as arches from '../src/world/landmarks/builders/forum-arches';
import * as curia from '../src/world/landmarks/builders/forum-curia';
import * as vesta from '../src/world/landmarks/builders/forum-vesta';
import * as capitol from '../src/world/landmarks/builders/forum-capitol';
import * as velia from '../src/world/landmarks/builders/forum-velia';

const ASSIGNED = 'miliarium-aureum umbilicus-urbis rostra comitium-lapis-niger curia-julia janus-geminus temple-saturn temple-vespasian-titus temple-concord temple-divus-augustus basilica-julia basilica-aemilia temple-divus-julius arch-augustus arch-tiberius lacus-curtius equus-domitiani-site temple-castor-pollux lacus-juturnae temple-vesta regia atrium-vestae domitianic-vestibule porticus-margaritaria horrea-agrippiana shrine-venus-cloacina lacus-servilius volcanal tabularium porticus-dei-consentes carcer-tullianum fornix-fabianus arch-titus velia-vestibule colossus-sol horrea-piperataria temple-jupiter-stator'.split(' ');
/** Hero landmarks (full detail): budget 150k triangles near. */
const HEROES = new Set(['miliarium-aureum', 'rostra', 'curia-julia', 'temple-saturn', 'basilica-julia', 'basilica-aemilia', 'temple-castor-pollux', 'temple-vesta', 'arch-titus', 'colossus-sol']);
const SPOT_KINDS = new Set(['inscription', 'vista', 'shrine', 'container', 'door', 'npc', 'vendor', 'spawn', 'sit', 'stall']);

const ALL: LandmarkBuilder[] = [square, temples, basilicas, arches, curia, vesta, capitol, velia].flatMap((m) => m.builders);

function triangles(o: THREE.Object3D) {
  let n = 0;
  o.traverse((x) => {
    const m = x as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return n;
}

/** A minimal stand-in for Game: enough for vegetation, the fire queue and localToWorld. */
function fakeGame(): Game {
  const scene = new THREE.Scene();
  return { scene, camera: new THREE.PerspectiveCamera(), addSystem: <T>(s: T) => s, removeSystem: () => {} } as unknown as Game;
}

function context(id: string, game: Game): LandmarkContext {
  const lm = LANDMARK_BY_ID[id];
  return { game, lm, S: 0.6, rng: new Rng(`landmark:${id}`), detail: 'high', groundAt: () => 0, builder: () => new MeshBuilder() };
}

const built = new Map<string, LandmarkBuild>();
function build(id: string): LandmarkBuild {
  let r = built.get(id);
  if (!r) {
    const b = ALL.find((x) => x.handles.includes(id))!;
    r = b.build(context(id, fakeGame()));
    built.set(id, r);
  }
  return r;
}

describe('forum plaza geometry', () => {
  it('the paved square is a simple polygon round the Golden Milestone', () => {
    expect(isSimplePolygon(FORUM_PLAZA)).toBe(true);
    expect(Math.abs(polygonArea(FORUM_PLAZA))).toBeGreaterThan(9000);
    expect(pointInPolygon(0, 0, FORUM_PLAZA)).toBe(true);
    // the square lies between the two basilicas
    expect(pointInPolygon(60, 25, FORUM_PLAZA)).toBe(true);
    expect(pointInPolygon(34, 66, FORUM_PLAZA)).toBe(false);
    expect(pointInPolygon(145, -6, FORUM_PLAZA)).toBe(false);
  });

  it('buffers a polyline to a closed strip of the right width', () => {
    const strip = bufferPolyline([[0, 0], [10, 0]], 2);
    expect(strip).toHaveLength(4);
    expect(Math.abs(polygonArea(strip))).toBeCloseTo(40, 5);
    const bent = bufferPolyline([[0, 0], [10, 0], [10, 10]], 1);
    expect(isSimplePolygon(bent)).toBe(true);
  });

  it('clips a polyline to a polygon', () => {
    const sq: [number, number][] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const runs = clipPolyline([[-5, 5], [15, 5]], sq, 0.25);
    expect(runs).toHaveLength(1);
    expect(runs[0][0][0]).toBeGreaterThanOrEqual(0);
    expect(runs[0][runs[0].length - 1][0]).toBeLessThanOrEqual(10);
    expect(runs[0][runs[0].length - 1][0] - runs[0][0][0]).toBeGreaterThan(9.4);
    expect(clipPolyline([[-5, -5], [-1, -1]], sq)).toHaveLength(0);
  });

  it('paves the streets that cross the square in basalt strips inside it', () => {
    const strips = plazaRoadStrips();
    expect(strips.length).toBeGreaterThanOrEqual(3);
    for (const s of strips) {
      expect(s.length).toBeGreaterThanOrEqual(4);
      // the strip's centre lies in the square
      const cx = s.reduce((a, p) => a + p[0], 0) / s.length;
      const cz = s.reduce((a, p) => a + p[1], 0) / s.length;
      expect(pointInPolygon(cx, cz, FORUM_PLAZA)).toBe(true);
    }
  });
});

describe('forum inscriptions', () => {
  const dir = join(__dirname, '../src/world/landmarks/builders');
  const src = readdirSync(dir)
    .filter((f) => f.startsWith('forum-') && f.endsWith('.ts'))
    .map((f) => readFileSync(join(dir, f), 'utf8'))
    .join('\n');

  it('every inscription spot has a text with a translation and a confidence', () => {
    const ids = [...src.matchAll(/p\.spot\('([a-z0-9-]+)', 'inscription'/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThan(15);
    for (const id of ids) {
      const t = FORUM_INSCRIPTIONS[id];
      expect(t, id).toBeDefined();
      expect(t.english.length).toBeGreaterThan(5);
      expect(['A', 'B', 'C']).toContain(t.conf);
    }
  });

  it('the Arch of Titus carries its attested dedication', () => {
    expect(FORUM_INSCRIPTIONS['arch-titus'].latin.join(' ')).toBe('Senatus Populusque Romanus Divo Tito Divi Vespasiani F Vespasiano Augusto');
  });
});

describe('forum builders', () => {
  it('cover exactly the assigned atlas ids, once each', () => {
    const handles = ALL.flatMap((b) => b.handles);
    expect(new Set(handles).size).toBe(handles.length);
    expect([...handles].sort()).toEqual([...ASSIGNED].sort());
    for (const id of ASSIGNED) expect(LANDMARK_BY_ID[id], id).toBeDefined();
  });

  it.each(ASSIGNED)('%s builds within its triangle budget, with colliders and valid spots', (id) => {
    const r = build(id);
    const near = triangles(r.object);
    expect(near).toBeGreaterThan(100);
    expect(near).toBeLessThan(HEROES.has(id) ? 150_000 : 100_000);
    if (r.far) expect(triangles(r.far)).toBeLessThan(32_000);
    expect(r.colliders.length).toBeGreaterThan(0);
    for (const s of r.spots ?? []) {
      expect(SPOT_KINDS.has(s.kind), `${id}:${s.id} ${s.kind}`).toBe(true);
      expect(Number.isFinite(s.position.x + s.position.y + s.position.z)).toBe(true);
    }
  });

  it('the hero landmarks expose a "thing" for the player', () => {
    for (const id of HEROES) {
      const kinds = new Set((build(id).spots ?? []).map((s) => s.kind));
      expect(kinds.size, id).toBeGreaterThan(0);
    }
    const castor = build('temple-castor-pollux').spots ?? [];
    expect(castor.some((s) => s.id === 'castor-strongroom' && s.kind === 'door')).toBe(true);
    const carcer = build('carcer-tullianum').spots ?? [];
    expect(carcer.some((s) => s.kind === 'door')).toBe(true);
    const titus = build('arch-titus').spots ?? [];
    expect(titus.some((s) => s.kind === 'spawn')).toBe(true);
  });
});

describe('forum walkability', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  function world(id: string) {
    const p = new Physics();
    p.addBox({ x: 0, y: -0.5, z: 0 }, { x: 200, y: 0.5, z: 200 });
    for (const c of build(id).colliders) {
      if (c.kind === 'box') p.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
      else if (c.kind === 'cylinder') p.addCylinder(c.center, c.halfHeight, c.radius);
      else p.addTrimesh(c.geometry, c.matrix);
    }
    p.step(1 / 60);
    return p;
  }

  /** Walk with Actor.locomote's rules (as tests/arch.stairs.test.ts). */
  function walk(p: Physics, start: THREE.Vector3, dir: THREE.Vector3, seconds: number, speed = 3) {
    const ch = p.createCharacter(start);
    const dt = 1 / 60;
    const v = new THREE.Vector3();
    let grounded = false;
    const k = 1 - Math.exp(-14 * dt);
    let maxY = -Infinity;
    for (let i = 0; i < seconds * 60; i++) {
      const accel = grounded ? k : 1 - Math.exp(-2.5 * dt);
      v.x += (speed * dir.x - v.x) * accel;
      v.z += (speed * dir.z - v.z) * accel;
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
    return { x: t.x, y: t.y - ch.halfHeight - ch.radius, z: t.z, maxY };
  }

  it('climbs the stair at the back of the Rostra onto the platform', () => {
    const r = walk(world('rostra'), new THREE.Vector3(0, 0.05, 7.5), new THREE.Vector3(0, 0, -1), 5);
    expect(r.maxY).toBeGreaterThan(2.3);
  });

  it('walks up the steps and in through the open bronze doors of the Curia', () => {
    const r = walk(world('curia-julia'), new THREE.Vector3(0, 0.05, -14), new THREE.Vector3(0, 0, 1), 7);
    expect(r.z).toBeGreaterThan(-4);
    expect(r.y).toBeGreaterThan(0.3);
  });

  it('climbs the seven steps into the Basilica Iulia through an arch', () => {
    const r = walk(world('basilica-julia'), new THREE.Vector3(1.52, 0.05, -18), new THREE.Vector3(0, 0, 1), 6);
    expect(r.z).toBeGreaterThan(-8);
    expect(r.y).toBeCloseTo(1.4, 1);
  });

  it('passes through the Arch of Titus', () => {
    const r = walk(world('arch-titus'), new THREE.Vector3(0, 0.05, -6), new THREE.Vector3(0, 0, 1), 5);
    expect(r.z).toBeGreaterThan(4);
  });
});
