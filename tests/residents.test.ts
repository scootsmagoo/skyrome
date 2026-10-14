/**
 * Residents of the generic cells (src/world/interiors/residents, docs/modules/interiors.md "Residents"):
 * who is at home at what hour by seed (pure rules), the waking rule, that the places the kits give
 * them lie inside the cell and not inside the furniture, and the game side (spawning real NPCs, who
 * witnesses what, waking, the crimes of a visit, leaving) on a fake population.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { EventBus, type GameEvents } from '../src/core/Events';
import type { Game } from '../src/core/Game';
import { MeshBuilder, type ColliderSpec } from '../src/gfx/MeshBuilder';
import { CELL_OPEN } from '../src/world/interiors/named/ludus';
import { doorSeed } from '../src/world/interiors/generic';
import { domusKit, ianitorChance } from '../src/world/interiors/kits/domus';
import { flatRolls, insulaStairKit } from '../src/world/interiors/kits/insulaStair';
import { Residents } from '../src/world/interiors/residents/system';
import {
  NOISES,
  PROFILES,
  RESIDENT_CAP,
  dayPart,
  inBed,
  isTrespass,
  lightness,
  lineFor,
  unit,
  wakeChance,
  wakes,
  whoIsHome,
  type ResidentSpot,
} from '../src/world/interiors/residents/plan';
import { withinHours } from '../src/world/doors/rules';

const SEEDS = Array.from({ length: 300 }, (_, i) => doorSeed(`block-${i}:lot-${i % 7}:stair`));

describe('who is at home', () => {
  const tenant = (seed: number, hour: number) => whoIsHome(insulaStairKit.residents!(seed, 0.4), seed, hour);

  it('the same door, seed and hour give the same people', () => {
    for (const seed of SEEDS.slice(0, 40)) {
      for (const hour of [3, 9, 12.5, 19, 23.5]) {
        expect(tenant(seed, hour)).toEqual(tenant(seed, hour));
        expect(whoIsHome(domusKit.residents!(seed, 0.7), seed, hour)).toEqual(whoIsHome(domusKit.residents!(seed, 0.7), seed, hour));
      }
    }
  });

  it('most tenants are home at night, in bed, and fewer by day, at the table in the evening', () => {
    const count = (hour: number) => SEEDS.filter((s) => tenant(s, hour).some((h) => h.spot.id === 'tenant')).length / SEEDS.length;
    expect(count(2)).toBeGreaterThan(0.85);
    expect(count(23.9)).toBeGreaterThan(0.8);
    expect(count(11)).toBeGreaterThan(0.1);
    expect(count(11)).toBeLessThan(0.32);
    expect(count(19)).toBeGreaterThan(0.65);
    expect(count(11)).toBeLessThan(count(19));
    for (const s of SEEDS.slice(0, 100)) {
      for (const h of tenant(s, 2)) if (h.spot.id === 'tenant') expect(h.posture).toBe('sleep');
      for (const h of tenant(s, 19)) expect(h.posture).not.toBe('sleep');
      for (const h of tenant(s, 11)) expect(h.posture).not.toBe('sleep');
    }
  });

  it('someone at home by day is at home in the evening and at night (the chance only rises toward the night)', () => {
    for (const s of SEEDS) {
      const day = tenant(s, 11).some((h) => h.spot.id === 'tenant');
      if (day) {
        expect(tenant(s, 19).some((h) => h.spot.id === 'tenant')).toBe(true);
        expect(tenant(s, 1).some((h) => h.spot.id === 'tenant')).toBe(true);
      }
    }
  });

  it('a house keeps a doorkeeper at the door by day and asleep on his mat at night, the family in bed at night, at most three people', () => {
    let keepers = 0;
    let night = 0;
    for (const s of SEEDS) {
      const wealth = (s % 10) / 10;
      const spots = domusKit.residents!(s, wealth);
      for (const hour of [0, 6, 9, 13, 18, 21, 23]) expect(whoIsHome(spots, s, hour).length).toBeLessThanOrEqual(RESIDENT_CAP);
      const noon = whoIsHome(spots, s, 12);
      const k = noon.find((h) => h.spot.id === 'ianitor');
      if (k) {
        keepers++;
        expect(k.posture).toBe('stand');
      }
      for (const h of whoIsHome(spots, s, 2)) {
        // Everyone at home in the small hours is in bed, but for the doorkeeper's mat, which is a bed too.
        expect(h.posture).toBe('sleep');
        night++;
      }
      // The dominus is at his desk by day and in the atrium in the evening.
      const d = whoIsHome(spots, s, 12).find((h) => h.spot.id === 'dominus');
      if (d) expect(d.posture).toBe('sit');
      const e = whoIsHome(spots, s, 18).find((h) => h.spot.id === 'dominus');
      if (e) expect(e.posture).toBe('stand');
    }
    expect(keepers / SEEDS.length).toBeGreaterThan(0.4);
    expect(night).toBeGreaterThan(SEEDS.length);
    // The richer the house, the likelier a doorkeeper.
    expect(ianitorChance(0.9)).toBeGreaterThan(ianitorChance(0.1));
  });

  it('bedtime and waking are each person’s own, within the evening and the dawn', () => {
    const spot = { id: 'tenant' } as ResidentSpot;
    for (const s of SEEDS.slice(0, 50)) {
      expect(inBed(s, spot, 13)).toBe(false);
      expect(inBed(s, spot, 3)).toBe(true);
      expect(inBed(s, spot, 23.5)).toBe(true);
      expect(inBed(s, spot, 21)).toBe(false);
      expect(inBed(s, spot, 7)).toBe(false);
    }
    expect(new Set(SEEDS.map((s) => inBed(s, spot, 22.2))).size).toBe(2);
  });

  it('the parts of the day, and the trespass hours', () => {
    expect(dayPart(23)).toBe('night');
    expect(dayPart(4.9)).toBe('night');
    expect(dayPart(6)).toBe('dawn');
    expect(dayPart(12)).toBe('day');
    expect(dayPart(17)).toBe('evening');
    expect(isTrespass(2)).toBe(true);
    expect(isTrespass(13)).toBe(false);
    for (const p of Object.values(PROFILES)) for (const v of Object.values(p)) expect(v).toBeGreaterThanOrEqual(0);
    expect(unit(1, 'a')).not.toBe(unit(1, 'b'));
    expect(unit(1, 'a')).toBe(unit(1, 'a'));
  });
});

describe('the flat door and its tenant', () => {
  it('a locked flat is undone in the evening, when the tenant is in and receiving; locked by day and at night', () => {
    let locked = 0;
    for (const s of SEEDS.slice(0, 80)) {
      const plan = insulaStairKit.plan(s, 0.4);
      const door = insulaStairKit.build({ game: {} as Game, cellId: 'gen:x', builder: () => new MeshBuilder(), seed: s, wealth: 0.4, plan }).doors![0];
      expect(!!door.lock).toBe(flatRolls(s).locked);
      if (!door.lock) continue;
      locked++;
      expect(withinHours(19, door.lock.openHours!)).toBe(true);
      expect(withinHours(12, door.lock.openHours!)).toBe(false);
      expect(withinHours(2, door.lock.openHours!)).toBe(false);
    }
    expect(locked).toBeGreaterThan(20);
  });

  it('the Ludus cell doors are locked at night and open by day', () => {
    expect(withinHours(12, CELL_OPEN)).toBe(true);
    expect(withinHours(23, CELL_OPEN)).toBe(false);
    expect(withinHours(3, CELL_OPEN)).toBe(false);
  });
});

describe('waking sleepers', () => {
  it('louder noises wake more, near wakes more than far, nothing beyond the range', () => {
    for (const n of Object.keys(NOISES) as (keyof typeof NOISES)[]) {
      expect(wakeChance(n, 0)).toBeCloseTo(Math.min(1, NOISES[n].base), 6);
      expect(wakeChance(n, 3)).toBeGreaterThanOrEqual(wakeChance(n, 6));
      expect(wakeChance(n, NOISES[n].range)).toBe(0);
      expect(wakeChance(n, NOISES[n].range + 5)).toBe(0);
    }
    expect(wakeChance('force', 4)).toBeGreaterThan(wakeChance('snap', 4));
    expect(wakeChance('snap', 4)).toBeGreaterThan(wakeChance('pick', 4));
    expect(wakeChance('pick', 2)).toBeGreaterThan(wakeChance('rummage', 2));
    expect(wakeChance('fight', 10)).toBeGreaterThan(0.5);
  });

  it('sneaking halves the chance and a light sleeper wakes more than a heavy one', () => {
    expect(wakeChance('snap', 3, { sneaking: true })).toBeCloseTo(wakeChance('snap', 3) / 2, 6);
    expect(wakeChance('snap', 3, { light: 1.4 })).toBeGreaterThan(wakeChance('snap', 3, { light: 0.6 }));
    expect(wakeChance('force', 0, { light: 1.4 })).toBe(1);
    for (const s of SEEDS.slice(0, 30)) {
      const l = lightness(s, 'tenant');
      expect(l).toBeGreaterThanOrEqual(0.6);
      expect(l).toBeLessThanOrEqual(1.4);
    }
  });

  it('the roll decides: a low roll wakes, a high one does not, and a fight wakes everyone nearby', () => {
    expect(wakes('snap', 3, 0.01)).toBe(true);
    expect(wakes('snap', 3, 0.99)).toBe(false);
    expect(wakes('pick', 3, 0.5)).toBe(false);
    let woke = 0;
    for (let i = 0; i < 200; i++) if (wakes('pick', 2, unit(7, `r${i}`))) woke++;
    expect(woke).toBeGreaterThan(5);
    expect(woke).toBeLessThan(80);
    for (let i = 0; i < 50; i++) expect(wakes('fight', 6, unit(9, `f${i}`), { light: 1.4 })).toBe(true);
  });

  it('every person has a line of every kind', () => {
    for (const p of ['tenant', 'mate', 'ianitor', 'dominus', 'domina'] as const) {
      for (const k of ['greet', 'trespass', 'woken', 'caught', 'talk', 'roused'] as const) {
        for (const r of [0, 0.5, 0.999]) expect(lineFor(p, k, r).length).toBeGreaterThan(3);
      }
    }
  });
});

// ------------------------------------------------------------------ the kits' places

interface Box {
  c: THREE.Vector3;
  h: THREE.Vector3;
  q: THREE.Quaternion;
}

function boxes(colliders: ColliderSpec[]): Box[] {
  const out: Box[] = [];
  for (const c of colliders) if (c.kind === 'box') out.push({ c: c.center, h: c.half, q: (c.rotation ?? new THREE.Quaternion()).clone().invert() });
  return out;
}

const tmp = new THREE.Vector3();

/** Does a vertical column at (x, z) of radius r, from y0 to y1, touch the box? */
function touches(b: Box, x: number, z: number, r: number, y0: number, y1: number): boolean {
  if (y1 < b.c.y - b.h.y || y0 > b.c.y + b.h.y) return false;
  // The box's footprint is tested at the column's axis, grown by r (the box may turn: test in its own frame).
  tmp.set(x - b.c.x, 0, z - b.c.z).applyQuaternion(b.q);
  return Math.abs(tmp.x) < b.h.x + r && Math.abs(tmp.z) < b.h.z + r;
}

/** The top of the highest box under (x, z) at or below `y` + 0.3 (what a body lying there rests on). */
function supportTop(bs: Box[], x: number, z: number, y: number): number {
  let top = -Infinity;
  for (const b of bs) {
    const t = b.c.y + b.h.y;
    if (t > y + 0.3 || t <= top) continue;
    tmp.set(x - b.c.x, 0, z - b.c.z).applyQuaternion(b.q);
    if (Math.abs(tmp.x) <= b.h.x && Math.abs(tmp.z) <= b.h.z) top = t;
  }
  return top;
}

describe('the places residents take', () => {
  const cases: [string, typeof insulaStairKit, number][] = [];
  for (let i = 0; i < 24; i++) {
    cases.push([`insula-stair #${i}`, insulaStairKit, i], [`domus #${i}`, domusKit, i]);
  }

  it.each(cases)('%s: every place is inside the cell, standing and sitting ones are clear of the furniture, sleepers lie on something', (_name, kit, i) => {
    const seed = doorSeed(`place-${kit.id}-${i}`);
    const wealth = (i % 10) / 10;
    const plan = kit.plan(seed, wealth);
    const built = kit.build({ game: {} as Game, cellId: 'gen:t', builder: () => new MeshBuilder(), seed, wealth, plan });
    const bs = boxes(built.colliders);
    const spots = kit.residents!(seed, wealth);
    expect(spots.length).toBeGreaterThan(0);
    const inside = (p: { x: number; y: number; z: number }, what: string) => {
      expect(p.x, `${what} x`).toBeGreaterThan(plan.bounds.min.x);
      expect(p.x, `${what} x`).toBeLessThan(plan.bounds.max.x);
      expect(p.z, `${what} z`).toBeGreaterThan(plan.bounds.min.z);
      expect(p.z, `${what} z`).toBeLessThan(plan.bounds.max.z);
      expect(p.y, `${what} y`).toBeGreaterThan(plan.bounds.min.y);
      expect(p.y, `${what} y`).toBeLessThan(plan.bounds.max.y);
    };
    for (const s of spots) {
      for (const key of ['bed', 'seat', 'post', 'bedside'] as const) {
        const pl = s[key];
        if (!pl) continue;
        const what = `${s.id} ${key}`;
        inside(pl.position, what);
        const { x, y, z } = pl.position;
        if (key === 'bed') {
          // Lying: along the body (pelvis at the point, the head behind the heading, the feet ahead) something is under it.
          const hx = -Math.sin(pl.heading), hz = -Math.cos(pl.heading);
          for (const t of [-0.8, -0.4, 0, 0.4, 0.6]) {
            const top = supportTop(bs, x + hx * t, z + hz * t, y);
            expect(top, `${what} at ${t}: a bed or mat under the body`).toBeGreaterThan(y - 0.2);
            expect(top, `${what} at ${t}`).toBeLessThan(y + 0.1);
          }
          // And nothing above it for a body's thickness.
          for (const b of bs) expect(touches(b, x, z, 0.1, y + 0.2, y + 0.6), `${what}: nothing over the sleeper`).toBe(false);
        } else {
          // Standing or sitting at the floor (or the landing): nothing solid in the column from the knee to the head, and the
          // ground under the point is the floor and not a table or a stool's top.
          // (A sitter's hips are at the table's edge by design, so a seat only has to be off the furniture itself.)
          const margin = key === 'seat' ? 0.02 : 0.25;
          for (const b of bs) expect(touches(b, x, z, margin, y + 0.25, y + 1.6), `${what}: clear of furniture`).toBe(false);
          const top = supportTop(bs, x, z, y);
          expect(Math.abs(top - y), `${what}: the floor under it`).toBeLessThan(0.1);
        }
      }
      expect(s.exists).toBeGreaterThan(0);
      expect(s.exists).toBeLessThanOrEqual(1);
      // A sleeper can be woken to a place to stand.
      if (s.bed) expect(s.bedside, `${s.id}: a bedside`).toBeDefined();
    }
  });
});

// ------------------------------------------------------------------ the game side, on a fake population

interface FakeNpc {
  id: string;
  name: string;
  position: THREE.Vector3;
  heading: number;
  dead: boolean;
  talking: boolean;
  resident: { asleep: boolean; alarm(kind: 'fight' | 'crime' | 'danger', aggressor: { id: string } | null): void } | null;
  interactable: { verb(): string; enabled(): boolean; interact(g: unknown): void };
  loop: string | null;
  brain: { scriptStand(loop: string | null, face: number | null): void };
  isFighting(): boolean;
  teleport(p: { x: number; y: number; z: number }, h?: number): void;
  turnToward(h: number, rate: number, dt: number): void;
  headingTo(x: number, z: number): number;
}

function world(hour: number, opts: { seeThrough?: boolean } = {}) {
  const events = new EventBus<GameEvents>();
  const npcs = new Map<string, FakeNpc>();
  const said: string[] = [];
  const commits: { crime: string; witnessed: unknown; victimId?: string }[] = [];
  const alarms: { x: number; z: number }[] = [];
  const dead = new Set<string>();
  const player = { id: 'player', position: new THREE.Vector3(0, 0, 0), sneaking: false };
  let current: string | null = 'gen:t';
  const game = {
    events,
    time: { hour },
    player,
    physics: { raycast: () => (opts.seeThrough === false ? ({}) : null) },
    crime: { commit: (crime: string, o: { witnessed: unknown; victimId?: string }) => commits.push({ crime, ...o }) },
    interiors: { toWorld: (_id: string, p: { x: number; y: number; z: number }) => new THREE.Vector3(p.x + 100, p.y - 150, p.z + 40), current: () => current },
    population: {
      get: (id: string) => npcs.get(id),
      isKilled: (id: string) => dead.has(id),
      isVisible: () => false,
      barks: { say: (_id: string, _name: string, text: string) => said.push(text) },
      alarm: (x: number, z: number) => alarms.push({ x, z }),
      witnesses: (_p: unknown) => [...npcs.values()].filter((n) => !n.dead && !n.resident?.asleep).map((n) => n.id),
      spawnResident: (id: string, name: string, _app: unknown, at: { x: number; y: number; z: number }, heading: number) => {
        if (npcs.has(id) || dead.has(id)) return null;
        const n: FakeNpc = {
          id,
          name,
          position: new THREE.Vector3(at.x, at.y, at.z),
          heading,
          dead: false,
          talking: false,
          resident: null,
          loop: null,
          interactable: { verb: () => 'Talk', enabled: () => true, interact: () => {} },
          brain: { scriptStand: (loop: string | null) => void (n.loop = loop) },
          isFighting: () => false,
          teleport: (p, h) => {
            n.position.set(p.x, p.y, p.z);
            if (h !== undefined) n.heading = h;
          },
          turnToward: (h) => void (n.heading = h),
          headingTo: (x, z) => Math.atan2(x - n.position.x, z - n.position.z),
        };
        npcs.set(id, n);
        return n;
      },
      pose: (n: FakeNpc, loop: string) => {
        n.loop = loop;
        return true;
      },
      despawn: (n: FakeNpc) => void npcs.delete(n.id),
    },
  };
  const res = new Residents(game as unknown as Game);
  return { game, res, npcs, said, commits, alarms, dead, player, setCurrent: (c: string | null) => (current = c), events };
}

/** A cell with a tenant who is always home (and, with `mates`, people who are too) and the usual bed, seat and post. */
function cell(mates = 0) {
  const spots: ResidentSpot[] = [
    {
      id: 'tenant',
      person: 'tenant',
      exists: 1,
      bed: { position: { x: 3, y: 0.6, z: 3 }, heading: 0 },
      seat: { position: { x: 1, y: 0, z: 1 }, heading: 0 },
      post: { position: { x: 2, y: 0, z: 2 }, heading: 0 },
      bedside: { position: { x: 2, y: 0, z: 4 }, heading: 0 },
    },
  ];
  for (let i = 0; i < mates; i++) spots.push({ id: `p${i}`, person: 'mate', exists: 1, post: { position: { x: 5 + i, y: 0, z: 2 }, heading: 0 } });
  // A seed whose people are home at every hour.
  let seed = 1;
  for (; seed < 50000; seed++) if (spots.every((sp) => unit(seed, `${sp.id}:home`) < 0.1)) break;
  return { id: 'gen:t', spots, seed, wealth: 0.4, rotY: 0, street: { x: 0, y: 0, z: 0 } };
}

/** A point of the cell (local) as the fake world places it. */
const at = (x: number, y: number, z: number) => new THREE.Vector3(x + 100, y - 150, z + 40);

function run(res: Residents, seconds: number) {
  for (let t = 0; t < seconds; t += 1 / 60) res.fixedUpdate(1 / 60);
}

/** Make noise at the player's feet until the sleeper wakes (a few tries: it is a chance). */
function noiseUntilWoken(w: ReturnType<typeof world>, kind: 'force' | 'bash' = 'force') {
  for (let i = 0; i < 40 && w.res.list().some((r) => r.mode === 'asleep'); i++) {
    if (kind === 'force') w.events.emit('door:unlocked', { id: 'x', how: 'force' });
    else w.events.emit('combat:swing', { attackerId: 'player', power: false, hits: 0, reach: 1 });
  }
}

describe('residents in the game', () => {
  it('a sleeper at night is a real person on the bed who witnesses nothing; by day the tenant stands', () => {
    const night = world(2);
    night.res.arrive(cell());
    const [r] = night.res.list();
    expect(r.mode).toBe('asleep');
    const n = night.npcs.get(r.id)!;
    expect(n.loop).toBe('sleep');
    expect(n.resident!.asleep).toBe(true);
    expect(n.position.y).toBeCloseTo(0.6 - 150, 6);
    expect(night.game.population.witnesses(night.player.position)).toEqual([]);

    const day = world(12);
    day.res.arrive(cell());
    const d = day.res.list()[0];
    expect(d.mode).toBe('awake');
    expect(day.npcs.get(d.id)!.loop).toBe('stand');
    expect(day.game.population.witnesses(day.player.position)).toEqual([d.id]);
  });

  it('a noise wakes the sleeper: sits up, says a line, gets out of bed beside it', () => {
    const w = world(2);
    w.res.arrive(cell());
    const id = w.res.list()[0].id;
    w.player.position.copy(at(2, 0, 3));
    noiseUntilWoken(w);
    expect(w.res.list()[0].mode).toBe('rising');
    expect(w.npcs.get(id)!.loop).toBe('sitGround');
    expect(w.npcs.get(id)!.resident!.asleep).toBe(false);
    expect(w.said.length).toBe(1);
    run(w.res, 1.0);
    expect(w.res.list()[0].mode).toBe('rising');
    run(w.res, 0.5);
    expect(w.res.list()[0].mode).toBe('awake');
    const n = w.npcs.get(id)!;
    expect(n.loop).toBe('stand');
    expect(n.position.x).toBeCloseTo(102, 6);
    expect(n.position.z).toBeCloseTo(44, 6);
  });

  it('blows on a door wake sleepers too (less than a forced bolt), but never ones in another cell', () => {
    const w = world(2);
    w.res.arrive(cell());
    w.player.position.copy(at(2, 0, 3));
    noiseUntilWoken(w, 'bash');
    expect(w.res.list()[0].mode).toBe('rising');
    const other = world(2);
    other.res.arrive(cell());
    other.player.position.copy(at(2, 0, 3));
    other.setCurrent('gen:elsewhere');
    for (let i = 0; i < 40; i++) other.events.emit('door:unlocked', { id: 'x', how: 'force' });
    expect(other.res.list()[0].mode).toBe('asleep');
  });

  it('a pick scraping in the lock wakes light sleepers now and then, never someone far away; sneaking helps', () => {
    let woke = 0;
    let wokeSneak = 0;
    let wokeFar = 0;
    for (let i = 0; i < 80; i++) {
      for (const [sneak, far] of [[false, false], [true, false], [false, true]] as const) {
        const w = world(2);
        const c = cell();
        // A different sleeper each time: a seed of its own, home at night.
        let s = 1000 + i * 31;
        while (!(unit(s, 'tenant:home') < 0.5)) s++;
        c.seed = s;
        w.res.arrive(c);
        w.player.sneaking = sneak;
        w.player.position.copy(far ? at(60, 0, 60) : at(4, 0, 3));
        w.events.emit('lockpick:start', { tier: 'simplex', label: 'x' });
        if (w.res.list()[0].mode !== 'asleep') {
          if (far) wokeFar++;
          else if (sneak) wokeSneak++;
          else woke++;
        }
      }
    }
    expect(woke).toBeGreaterThan(3);
    expect(woke).toBeLessThan(60);
    expect(wokeFar).toBe(0);
    expect(wokeSneak).toBeLessThan(woke);
  });

  it('a pick being worked keeps up its noise while the screen is open, and stops when it is done', () => {
    const w = world(2);
    w.res.arrive(cell());
    w.player.position.copy(at(3, 0, 11));
    w.events.emit('lockpick:start', { tier: 'simplex', label: 'x' });
    const rolls = () => (w.res as unknown as { rolls: number }).rolls;
    const r0 = rolls();
    run(w.res, 7);
    expect(rolls()).toBeGreaterThan(r0);
    w.events.emit('lockpick:done', { result: 'cancelled', tier: 'simplex', label: 'x' });
    const r1 = rolls();
    run(w.res, 7);
    expect(rolls()).toBe(r1);
  });

  it('a crime nobody saw is reported when a woken sleeper sees the thief', () => {
    const w = world(2);
    w.res.arrive(cell());
    w.player.position.copy(at(2, 0, 3));
    // The sleeper is no witness: the theft is unseen (the container path passes witnesses = []).
    w.events.emit('crime:committed', { crime: 'furtum', victimId: 'tenant:1', witnessed: false, bounty: 0 });
    w.events.emit('crime:committed', { crime: 'effractio', victimId: 'tenant:1', witnessed: false, bounty: 0 });
    expect(w.commits).toEqual([]);
    noiseUntilWoken(w);
    run(w.res, 1.6);
    expect(w.commits.map((c) => c.crime).sort()).toEqual(['effractio', 'furtum']);
    for (const c of w.commits) expect(c.witnessed).toEqual([w.res.list()[0].id]);
    expect(w.alarms.length).toBe(1);
    // Reported once.
    run(w.res, 3);
    expect(w.commits.length).toBe(2);
  });

  it('but a sleeper woken with no line of sight to the thief reports nothing', () => {
    const w = world(2, { seeThrough: false });
    w.res.arrive(cell());
    w.player.position.copy(at(2, 0, 3));
    w.events.emit('crime:committed', { crime: 'furtum', victimId: 'tenant:1', witnessed: false, bounty: 0 });
    noiseUntilWoken(w);
    run(w.res, 2);
    expect(w.commits).toEqual([]);
  });

  it('the crimes of one visit are forgotten when the player leaves', () => {
    const w = world(2);
    const c = cell();
    w.res.arrive(c);
    w.player.position.copy(at(2, 0, 3));
    w.events.emit('crime:committed', { crime: 'furtum', victimId: 'tenant:1', witnessed: false, bounty: 0 });
    w.res.leave();
    w.res.arrive(c);
    w.player.position.copy(at(2, 0, 3));
    noiseUntilWoken(w);
    run(w.res, 2);
    expect(w.commits).toEqual([]);
  });

  it('an awake resident who sees a crime cries out and the cry reaches the street', () => {
    const w = world(12);
    w.res.arrive(cell());
    w.player.position.copy(at(2, 0, 4));
    w.events.emit('crime:committed', { crime: 'effractio', victimId: 'x', witnessed: true, bounty: 10 });
    expect(w.said.length).toBe(1);
    expect(w.alarms.length).toBe(1);
    // Not twice in a breath.
    w.events.emit('crime:committed', { crime: 'furtum', victimId: 'x', witnessed: true, bounty: 10 });
    expect(w.alarms.length).toBe(1);
  });

  it('the alarm of a fight reaches a sleeper through the brain’s hook and wakes them', () => {
    const night = world(2);
    night.res.arrive(cell());
    night.player.position.copy(at(2, 0, 3));
    const sleeper = night.npcs.get(night.res.list()[0].id)!;
    for (let i = 0; i < 20 && night.res.list()[0].mode === 'asleep'; i++) sleeper.resident!.alarm('fight', night.game.player);
    expect(night.res.list()[0].mode).toBe('rising');
  });

  it('the Wake prompt on a sleeper rouses them; the Talk prompt of one awake gives a line, a challenge at night', () => {
    const w = world(2);
    w.res.arrive(cell());
    const n = w.npcs.get(w.res.list()[0].id)!;
    expect(n.interactable.verb()).toBe('Wake');
    n.interactable.interact(w.game);
    expect(w.res.list()[0].mode).toBe('rising');
    run(w.res, 2);
    expect(n.interactable.verb()).toBe('Talk');
    n.interactable.interact(w.game);
    expect(w.said.length).toBe(2);
    expect([0, 0.4, 0.8].map((r) => lineFor('tenant', 'trespass', r))).toContain(w.said[1]);
  });

  it('they are removed when the player leaves, stay gone when killed, and the house empties if the player is elsewhere', () => {
    const w = world(12);
    const c = cell(1);
    w.res.arrive(c);
    expect(w.npcs.size).toBe(2);
    w.res.leave('gen:other');
    expect(w.npcs.size).toBe(2);
    w.res.leave('gen:t');
    expect(w.npcs.size).toBe(0);
    expect(w.res.list()).toEqual([]);

    const k = world(12);
    k.res.arrive(c);
    k.dead.add(k.res.list()[0].id);
    k.res.leave();
    k.res.arrive(c);
    expect(k.res.list().find((r) => r.spot.id === 'tenant')).toBeUndefined();

    const e = world(12);
    e.res.arrive(c);
    e.setCurrent(null);
    run(e.res, 1);
    expect(e.npcs.size).toBe(0);
  });

  it('people who are gone out or in bed by the hour are swapped in while nobody looks', () => {
    const w = world(12);
    w.res.arrive(cell());
    expect(w.res.list()[0].posture).toBe('stand');
    w.game.time.hour = 2;
    run(w.res, 2.5);
    expect(w.res.list()[0].posture).toBe('sleep');
    expect(w.res.list()[0].mode).toBe('asleep');
  });

  it('a woken resident stays up and about when the hour changes', () => {
    const w = world(2);
    w.res.arrive(cell());
    w.player.position.copy(at(2, 0, 3));
    noiseUntilWoken(w);
    run(w.res, 2);
    expect(w.res.list()[0].mode).toBe('awake');
    w.game.time.hour = 3;
    run(w.res, 3);
    expect(w.res.list()[0].mode).toBe('awake');
  });
});

vi.setConfig({ testTimeout: 30000 });
