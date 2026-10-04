/**
 * NpcManager end to end over a headless world (tests/npc-harness.ts): street spawns on an open
 * street, stations staffed on approach, the night cap, named NPCs at buildings, the Lemuria and
 * guards in scripted fights.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { randomAppearance } from '../src/actors/avatar/variants';
import type { Actor } from '../src/actors/Actor';
import { LaneSet, makeLane } from '../src/ai/life/lanes';
import { Rng } from '../src/core/Rng';
import * as atlas from '../src/data/atlas';
import { atlasLocations } from '../src/game/locations';
import { crowdBudget, NIGHT_CAP, roleWeights } from '../src/npc/crowd/budget';
import type { District } from '../src/npc/crowd/districts';
import { CROWD_ROLES } from '../src/npc/crowd/roles';
import { crowdRoom, LANE_SPAWN, laneSpawnRing, laneSpawnVerdict } from '../src/npc/crowd/spawnRules';
import type { StationDef } from '../src/npc/crowd/stations';
import { stationAnchor, stationPoint } from '../src/npc/crowd/stations';
import type { Npc } from '../src/npc/Npc';
import { NpcRegistry } from '../src/npc/registry';
import { isOut, sunTimes } from '../src/npc/schedules';
import { StationDirector, type StationHost } from '../src/npc/stationDirector';
import { sacrifice } from '../src/npc/vignettes/civic';
import type { VignetteContext } from '../src/npc/vignettes/types';
import { toGame, toReal } from '../src/world/coords';
import { npcHarness } from './npc-harness';

const STREET: District = { id: 'test-street', name: 'A street', density: 1, weights: { citizen: 3, 'citizen-woman': 2, porter: 1, merchant: 1, artisan: 1, reveler: 0 } };
const sun = sunTimes({ year: 113, month: 4, day: 11 });
/** A straight open street 800 m long, east–west along z = 0. */
const lanes = () => new LaneSet([makeLane('long-street', [{ x: -400, z: 0 }, { x: 400, z: 0 }], 6)]);

describe('street spawns on an open street', () => {
  it('lets at least 30% of street candidates through with a clear line of sight', () => {
    const set = lanes();
    const cam = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 2000);
    const frustum = new THREE.Frustum();
    const halfFov = Math.atan(Math.tan((70 * Math.PI) / 360) * (16 / 9));
    const rng = new Rng(4);
    for (const playerSpeed of [3.5, 0]) {
      // The player on the street looking east along it (camera 3.4 m behind, 1.9 m up).
      cam.position.set(-3.4, 1.9, 0);
      cam.lookAt(20, 1.2, 0);
      cam.updateMatrixWorld(true);
      frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
      let pass = 0;
      let total = 0;
      for (let i = 0; i < 400; i++) {
        const [r0, r1] = laneSpawnRing(i, false, LANE_SPAWN.radiusDay, 14);
        const p = set.sample(() => rng.next(), 0, 0, r0, r1)!;
        total++;
        const d = Math.hypot(p.x, p.z);
        const offView = Math.abs(Math.atan2(p.x, p.z) - Math.PI / 2);
        const v = laneSpawnVerdict({ d, inView: frustum.containsPoint(new THREE.Vector3(p.x, 1.2, p.z)), seen: () => true, offView, halfFov, playerSpeed });
        if (v) pass++;
      }
      expect(pass / total, `speed ${playerSpeed}`).toBeGreaterThanOrEqual(0.3);
    }
  });

  it('never spawns people close in plain view', () => {
    const q = { inView: true, seen: () => true, offView: 0, halfFov: 0.9, playerSpeed: 3 };
    expect(laneSpawnVerdict({ ...q, d: 20 })).toBeNull();
    expect(laneSpawnVerdict({ ...q, d: 40 })).toBeNull();
    expect(laneSpawnVerdict({ ...q, d: 40, seen: () => false })).toBe('hidden');
    expect(laneSpawnVerdict({ ...q, d: 60 })).toBe('far');
    // Behind the camera only while the player stands still (then they overtake into view).
    expect(laneSpawnVerdict({ ...q, inView: false, offView: 3, d: 30 })).toBeNull();
    expect(laneSpawnVerdict({ ...q, inView: false, offView: 3, d: 30, playerSpeed: 0 })).toBe('behind');
  });

  it('keeps people walking toward the player on the street ahead while he walks it', async () => {
    const h = await npcHarness({ hour: 9, opts: { lanes: lanes(), district: STREET, density: 0.6 } });
    h.walk(-150, 1.5, Math.PI / 2, 3.5);
    h.run(8);
    const samples: number[] = [];
    h.run(30, () => samples.push(h.inView((n) => Math.abs(n.position.z) < 5 && n.distToPlayer > 3).length));
    const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
    const empty = samples.filter((s) => s === 0).length / samples.length;
    expect(mean).toBeGreaterThanOrEqual(6);
    expect(empty).toBeLessThan(0.05);
    // Most of the crowd is on the street, not off in the fields.
    const onStreet = h.pop.list.filter((n) => Math.abs(n.position.z) < 6).length;
    expect(onStreet / h.pop.list.length).toBeGreaterThan(0.5);
  }, 60000);
});

describe('stations along an open street', () => {
  const def: StationDef = {
    id: 'st-test',
    when: ['morning', 'midday', 'afternoon'],
    point: toReal(100, 0),
    bearing: 0,
    members: [
      { role: 'merchant', out: 1, side: 0, loop: 'stand', face: 'center' },
      { role: 'citizen', out: 2.5, side: 1, loop: 'talk', face: 'center' },
    ],
    dressing: [{ kind: 'table', out: 0, side: 0 }],
  };

  function host(player: THREE.Vector3, opts: { hidden?: boolean } = {}) {
    const spawned: { x: number; z: number; from?: { x: number; z: number } }[] = [];
    const h: StationHost = {
      game: { scene: new THREE.Scene(), physics: { addBox: () => ({}), removeCollider: () => {} } } as never,
      player,
      phase: 'morning',
      isSeen: () => true,
      floorY: () => 0,
      spawnMember: (_d, _m, x, z, _h, from) => {
        spawned.push({ x, z, from });
        return { id: `m${spawned.length}` } as Npc;
      },
      dismiss: () => {},
      alive: () => true,
      block: () => {},
      hiddenNear: opts.hidden ? (x, z) => ({ x: x + 15, z: z + 10 }) : undefined,
    };
    return { h, spawned };
  }

  it('staffs a post that is always in view once the player is within 60 m', () => {
    const player = new THREE.Vector3(-200, 0, 0);
    const { h, spawned } = host(player);
    const d = new StationDirector(h, [def]);
    d.update(1); // the boot's eager fill finds nothing in range
    let staffedAt = Infinity;
    for (let x = -100; x <= 100; x += 2) {
      player.x = x;
      d.update(0.6);
      if (spawned.length === def.members.length && staffedAt === Infinity) staffedAt = 100 - x;
    }
    expect(staffedAt).toBeGreaterThanOrEqual(60);
    // At the post itself, not walking in.
    expect(spawned.every((s) => !s.from)).toBe(true);
  });

  it('near and in view, people walk in from out of sight', () => {
    const a = stationAnchor(def)!;
    const post = stationPoint(a, 1, 0);
    const player = new THREE.Vector3(post.x - 20, 0, post.z);
    const { h, spawned } = host(player, { hidden: true });
    const d = new StationDirector(h, [def]);
    d.update(1); // eager: everyone at their posts
    expect(spawned.every((s) => !s.from)).toBe(true);
    // A new director without the eager fill (the player walked in from far): walk-ins.
    const late = host(player, { hidden: true });
    const d2 = new StationDirector(late.h, [def]);
    (d2 as unknown as { eager: boolean }).eager = false;
    d2.update(1);
    expect(late.spawned.length).toBe(def.members.length);
    expect(late.spawned.every((s) => !!s.from)).toBe(true);
  });
});

describe('station posts boxed in by their own stall', () => {
  it('a member steps onto the post out of sight, and waits beside it in view', async () => {
    // A counter (blocked cells all round the post) 12 m north of the player.
    const h = await npcHarness({ hour: 10, opts: { crowd: false } });
    h.face(Math.PI); // looking north (−z)
    h.run(1);
    for (let dz = -1.5; dz <= 1.5; dz += 0.5) for (let dx = -1.5; dx <= 1.5; dx += 0.5) h.pop.grid.block(dx, -12 + dz);
    const post = { id: 'st-q', x: 0, z: -12, face: 0, loop: 'stand' as const };
    h.run(2.5); // the reachability flood refreshes every 2 s
    expect(h.pop.grid.reachable(post.x, post.z)).toBe(false);
    // In view: he goes to stand beside the counter instead of failing to path forever.
    const a = h.pop.spawnAmbient('merchant', 4, -18, 0, { escorts: false })!;
    a.station = { ...post };
    a.brain!.next(h.pop.life);
    h.run(6);
    expect(Math.hypot(a.position.x - post.x, a.position.z - post.z)).toBeLessThan(4.5);
    expect(['goto', 'idle']).toContain(a.brain!.task?.kind);
    // Out of sight (the player turned away): onto the post.
    h.face(0);
    h.run(8);
    expect(Math.hypot(a.position.x - post.x, a.position.z - post.z)).toBeLessThan(0.8);
    expect(a.brain!.task?.kind).toBe('idle');
  }, 30000);
});

describe('the night crowd (AC-10)', () => {
  it('no role is picked at an hour its archetype spends at home (revelers too)', () => {
    for (const hour of [21, 23, 0.5, 1.5, 2.5, 3.5, 4.5]) {
      for (const [id] of roleWeights({ ...STREET, weights: { ...STREET.weights, reveler: 2, beggar: 1, soldier: 1 } }, hour, sun)) {
        expect(isOut(CROWD_ROLES[id].archetype, hour, sun), `${id} at ${hour}`).toBe(true);
      }
    }
    // Revelers are out all night long, the 3rd watch included.
    expect(isOut('comissator', 0.5, sun)).toBe(true);
    expect(isOut('comissator', 12, sun)).toBe(false);
  });

  it('counts people walking home toward a hard night cap', () => {
    expect(crowdRoom(20, 0, 20, true)).toBe(0);
    expect(crowdRoom(10, 5, 20, true)).toBe(10);
    // By day a small margin replaces people heading home before they vanish.
    expect(crowdRoom(60, 55, 60, false)).toBe(5);
    expect(crowdRoom(66, 55, 60, false)).toBe(0);
  });

  it('stays at or under 25 people for a minute at 00:30', async () => {
    const district: District = { ...STREET, id: 'test-night', density: 1.6, weights: { ...STREET.weights, reveler: 3, beggar: 1, soldier: 1 } };
    const h = await npcHarness({ hour: 0.5, opts: { lanes: lanes(), district, density: 2 } });
    expect(crowdBudget(0.5, sun, 1.6, 2).night).toBe(true);
    h.face(Math.PI / 2);
    let max = 0;
    h.run(60, () => {
      max = Math.max(max, h.pop.list.length);
    });
    expect(h.pop.list.length).toBeGreaterThan(8);
    expect(max).toBeLessThanOrEqual(NIGHT_CAP);
  }, 90000);
});

describe('named NPCs at buildings', () => {
  it('appear at street level beside a building, not on top of it', async () => {
    const h = await npcHarness({
      hour: 10,
      heightmap: true,
      // A temple: a solid podium 12 × 20 m, 4 m high, with no way up.
      build: (p) => p.addBox({ x: 0, y: 2, z: -30 }, { x: 6, y: 2, z: 10 }),
      opts: { named: true, crowd: false },
    });
    const def = { id: 'qa-priest', name: 'Philo', appearance: randomAppearance(new Rng('qa'), 'priest'), schedule: [{ from: 0, at: 'qa-temple', activity: 'stand' as const }] };
    h.game.npcs = new NpcRegistry([def]);
    // Registered at the building's centre, as the game flow registers atlas landmarks.
    (h.game as unknown as { locations: unknown }).locations = { get: (id: string) => (id === 'qa-temple' ? { id, name: 'Temple', position: { x: 0, z: -30 }, radius: 10 } : undefined) };
    h.face(Math.PI);
    h.run(4);
    const n = h.pop.get('qa-priest');
    expect(n).toBeDefined();
    expect(Math.abs(n!.position.y)).toBeLessThan(0.5);
    const inside = Math.abs(n!.position.x) < 6 && Math.abs(n!.position.z + 30) < 10;
    expect(inside).toBe(false);
    expect(h.pop.grid.reachable(n!.position.x, n!.position.z)).toBe(true);
  }, 30000);

  it('resolves the landmark ids the content bible uses to a forecourt outside the building', async () => {
    const h = await npcHarness({ hour: 10, opts: { atlas: true, crowd: false } });
    // The game flow registers every landmark at its centre (src/game/locations.ts).
    const defs = new Map(atlasLocations().map((d) => [d.id, d]));
    const locations = { get: (id: string) => defs.get(id) };
    (h.game as unknown as { locations: unknown }).locations = locations;
    const ids = ['temple-castor-pollux', 'rostra', 'atrium-vestae', 'basilica-aemilia', 'basilica-julia', 'column-trajan', 'meta-sudans', 'temple-vesta', 'curia-julia', 'shrine-venus-cloacina', 'carcer-tullianum', 'ludus-magnus', 'castra-peregrina', 'colossus-sol', 'domus-augustana'];
    let checked = 0;
    for (const id of ids) {
      const lm = atlas.LANDMARK_BY_ID[id];
      if (!lm) continue;
      const loc = h.pop.resolveLocation(id)!;
      expect(loc, id).not.toBeNull();
      if (lm.siting === 'open' || lm.category === 'forum') continue;
      expect(insideFootprint(lm, loc.x, loc.z), `${id} at ${loc.x.toFixed(1)}, ${loc.z.toFixed(1)}`).toBe(false);
      checked++;
    }
    expect(checked).toBeGreaterThanOrEqual(10);
    // A location content registers under a landmark id at a point of its own still wins.
    const [cx, cz] = toGame(atlas.LANDMARK_BY_ID['temple-castor-pollux'].center[0], atlas.LANDMARK_BY_ID['temple-castor-pollux'].center[1]);
    defs.set('temple-castor-pollux', { id: 'temple-castor-pollux', name: 'Castor', position: { x: cx - 12, z: cz }, radius: 3 });
    expect(h.pop.resolveLocation('temple-castor-pollux')).toMatchObject({ x: cx - 12, z: cz });
  }, 30000);
});

describe('the Lemuria (GDD §14.10)', () => {
  it('its night runs from sunset of the festival day to sunrise of the next', async () => {
    const h = await npcHarness({ hour: 12, opts: { crowd: false } });
    const t = h.game.time;
    const at = (hours: number) => {
      t.totalHours = hours;
      h.run(0.05);
      return h.pop.lemuriaPhase();
    };
    expect(at(12)).toBe('day');
    expect(at(23.5)).toBe('night');
    // Past midnight: still the Lemuria night (the bean rite at the 3rd watch, mq-03).
    expect(at(24 + 2.1)).toBe('night');
    expect(h.pop.isLemuria()).toBe(true);
    expect(at(24 + 9)).toBeNull();
    expect(at(48 + 1)).toBeNull();
    // Temple cellae are shut on the festival day only.
    t.totalHours = 10;
    expect(h.pop.templesShut()).toBe(true);
    t.totalHours = 24 + 10;
    expect(h.pop.templesShut()).toBe(false);
  }, 30000);

  it('follows the calendar when there is one (the pridie clamp holds 11 May)', async () => {
    const h = await npcHarness({ hour: 12, opts: { crowd: false } });
    // Day 0 showed 11 May (ordinal 130); day 1 is still 11 May but no longer a festival.
    (h.game as unknown as { calendar: unknown }).calendar = { year: 113, serialize: () => ({ firstSeen: { '130': 0 } }) };
    expect(h.pop.lemuriaOnDay(0)).toBe(true);
    expect(h.pop.lemuriaOnDay(1)).toBe(false);
  }, 30000);

  it('moves the daytime sacrifice to an open-air shrine while the temples are shut', () => {
    const temple = { id: 'poi:t', kind: 'temple', x: 10, z: 0, face: 0, radius: 6, landmarkId: 't', name: 'Temple' };
    const shrine = { ...temple, id: 'poi:s', kind: 'shrine', landmarkId: 's', name: 'Compitum' };
    const ctx = (shut: boolean, pois: unknown[]) =>
      ({
        templesShut: shut,
        player: new THREE.Vector3(),
        look: { x: 0, z: -1 },
        nav: {},
        pois: (_x: number, _z: number, _r: number, kinds: string[]) => pois.filter((p) => kinds.includes((p as { kind: string }).kind)),
        snap: (x: number, z: number) => ({ x, z }),
        rng: new Rng(1),
      }) as unknown as VignetteContext;
    expect(sacrifice.plan(ctx(false, [temple]))).not.toBeNull();
    expect(sacrifice.plan(ctx(true, [temple]))).toBeNull();
    expect(sacrifice.plan(ctx(true, [temple, shrine]))?.data).toMatchObject({ lares: true });
  });
});

describe('guards and scripted fights', () => {
  async function fight() {
    const h = await npcHarness({ hour: 10, opts: { crowd: false } });
    const fighters = new Set<Actor>();
    const engage = vi.fn();
    (h.game as unknown as { combat: unknown }).combat = { engage, isInCombat: (a: Actor) => fighters.has(a) };
    h.face(0);
    h.run(0.5);
    const guard = h.pop.spawnAmbient('soldier', 0, 8, 0, { escorts: false })!;
    const thug = h.pop.spawnAmbient('citizen', 3, 14, 0, { escorts: false })!;
    fighters.add(thug).add(h.game.player as unknown as Actor);
    return { h, guard, thug, engage };
  }

  it('guards step in and engage the one fighting the player', async () => {
    const { h, guard, thug, engage } = await fight();
    h.run(1);
    expect(guard.brain?.task?.kind).toBe('respond');
    expect(engage).toHaveBeenCalledWith(guard, thug);
  }, 30000);

  it('stand down for a quest fight (marked enemies, or suppressGuards)', async () => {
    const a = await fight();
    a.h.pop.questFight(a.thug);
    a.h.run(1);
    expect(a.engage).not.toHaveBeenCalled();
    expect(a.guard.brain?.task?.kind).toBe('idle');
    expect(a.guard.brain?.task?.loop).toBe('guard');
    const b = await fight();
    b.h.pop.suppressGuards = true;
    b.h.run(1);
    expect(b.engage).not.toHaveBeenCalled();
  }, 30000);
});

/** Is a game point inside a landmark's footprint (real-metre geometry)? */
function insideFootprint(lm: atlas.Landmark, gx: number, gz: number): boolean {
  const [rx, rz] = toReal(gx, gz);
  const fp = lm.footprint;
  if (fp.kind === 'poly') {
    let inside = false;
    const pts = fp.points;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, zi] = pts[i];
      const [xj, zj] = pts[j];
      if (zi > rz !== zj > rz && rx < ((xj - xi) * (rz - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }
  const dx = rx - lm.center[0];
  const dz = rz - lm.center[1];
  const th = (lm.rotation * Math.PI) / 180;
  // Local frame: w along the facade normal (sin th, -cos th), u across it.
  const w = dx * Math.sin(th) - dz * Math.cos(th);
  const u = dx * Math.cos(th) + dz * Math.sin(th);
  if (fp.kind === 'rect') return Math.abs(u) <= fp.w / 2 && Math.abs(w) <= fp.d / 2;
  if (fp.kind === 'circle') return Math.hypot(dx, dz) <= fp.r;
  return (u / fp.rx) ** 2 + (w / fp.rz) ** 2 <= 1;
}
