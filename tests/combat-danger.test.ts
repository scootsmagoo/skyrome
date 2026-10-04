/**
 * The night muggers on the §17.2 golden path (src/combat/danger.ts): a scripted walker leaves the
 * Porta Capena at 04:30, walks the street under the Palatine and the Vicus Tuscus at three speeds,
 * and must meet a lurking pair before first light; a mark who keeps out of reach is never asked for
 * the purse, and a pair walked past slips away and frees the way for the next street.
 */
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { MUGGING, NIGHT, StreetDanger } from '../src/combat/danger';
import type { CombatSystem } from '../src/combat/CombatSystem';
import type { Game } from '../src/core/Game';
import { toGame } from '../src/world/coords';

/** The walk (atlas metres): just inside the Porta Capena, down the Circus valley, up the Vicus Tuscus to the Forum. */
const ROUTE_ATLAS: [number, number][] = [
  [496.3, 942.2],
  [406, 840],
  [156, 657],
  [-96, 471],
  [-73, 452],
  [-45, 311],
  [45, 140],
  [66, 131],
  [97, 62],
];
const ROUTE = ROUTE_ATLAS.map(([x, z]) => toGame(x, z));

/** A point `s` metres along the route. */
function along(s: number): { x: number; z: number; dx: number; dz: number } {
  for (let i = 1; i < ROUTE.length; i++) {
    const [ax, az] = ROUTE[i - 1];
    const [bx, bz] = ROUTE[i];
    const l = Math.hypot(bx - ax, bz - az);
    if (s <= l || i === ROUTE.length - 1) {
      const f = Math.min(1, s / l);
      return { x: ax + (bx - ax) * f, z: az + (bz - az) * f, dx: (bx - ax) / l, dz: (bz - az) / l };
    }
    s -= l;
  }
  return { x: 0, z: 0, dx: 1, dz: 0 };
}

interface FakeFoe {
  id: string;
  position: Vector3;
  active: boolean;
  status: string;
  lastHitBy: string | null;
  driven: boolean;
  body: { heading: number; move: () => void };
}

/** Just enough of the game and the combat system for the danger director. */
function fakeWorld() {
  const cam = { x: 0, z: -1 };
  const player = { position: new Vector3() };
  const despawned: string[] = [];
  const subtitles: string[] = [];
  const foes: FakeFoe[] = [];
  let hour = 4.5;
  const game = {
    elapsed: 0,
    time: {
      get hour() {
        return hour;
      },
      get totalHours() {
        return 24 + hour;
      },
    },
    player,
    camera: { getWorldDirection: (v: Vector3) => v.set(cam.x, 0, cam.z) },
    physics: { groundHeight: () => 0 },
    terrain: { heightAt: () => 0 },
    actors: { near: () => [] },
    events: { emit: (type: string, p: { text?: string }) => type === 'ui:subtitle' && subtitles.push(p.text ?? '') },
  };
  const playerC = { id: 'player', drawn: false };
  const combat = {
    core: { playerInCombat: false, list: foes, sight: () => true, engage: () => {} },
    settings: () => ({ streetDanger: true }),
    playerC,
    spawnEnemy: (_a: string, pos: { x: number; y: number; z: number }, o: { id: string }) => {
      const f: FakeFoe = { id: o.id, position: new Vector3(pos.x, pos.y, pos.z), active: true, status: 'active', lastHitBy: null, driven: true, body: { heading: 0, move: () => {} } };
      foes.push(f);
      return f;
    },
    despawn: (c: FakeFoe) => {
      despawned.push(c.id);
      foes.splice(foes.indexOf(c), 1);
    },
  };
  const danger = new StreetDanger(game as unknown as Game, combat as unknown as CombatSystem);
  return {
    game,
    danger,
    cam,
    player,
    foes,
    despawned,
    subtitles,
    /** Advance the clock like a new game: 04:30, the opening dawn at 5× until 05:05, then ×20. */
    tick(dt: number) {
      game.elapsed += dt;
      hour += (dt * 20 * (hour < 5 + 5 / 60 ? 5 : 1)) / 3600;
    },
    get hour() {
      return hour;
    },
  };
}

describe('night muggers on the golden path (§13.3, §17.2)', () => {
  for (const speed of [1.9, 3.0, 4.4]) {
    it(`a walker at ${speed} m/s from the Porta Capena at 04:30 meets a pair before first light`, () => {
      const w = fakeWorld();
      let s = 0;
      let met: { site: string; t: number; hour: number } | null = null;
      const dt = 0.1;
      while (w.hour < NIGHT.firstLight && !met) {
        w.tick(dt);
        s += speed * dt;
        const p = along(s);
        w.player.position.set(p.x, 0, p.z);
        w.cam.x = p.dx;
        w.cam.z = p.dz;
        w.danger.update();
        const st = w.danger.state;
        if (st && st.phase !== 'lurk') met = { site: st.site, t: w.game.elapsed, hour: w.hour };
      }
      expect(met, `no mugging met at ${speed} m/s`).not.toBeNull();
      expect(met!.hour).toBeLessThan(NIGHT.firstLight);
      // Never before the opening grace.
      expect(met!.t).toBeGreaterThan(w.danger.graceSeconds);
    });
  }

  it('a pair walked past slips away and frees the slot for the next street', () => {
    const w = fakeWorld();
    w.game.elapsed = 100;
    w.danger.trigger('circus-north-capena', { x: 0, z: -60 });
    const first = w.danger.state!.site;
    // Walk past them at 20 m and on (they never see you: no sight).
    (w.danger as unknown as { combat: { core: { sight: () => boolean } } }).combat.core.sight = () => false;
    for (let i = 0; i < 400; i++) {
      w.tick(0.1);
      w.player.position.set(20, 0, -i * 0.5);
      w.danger.update();
    }
    expect(w.danger.state).toBeNull();
    expect(w.despawned.length).toBe(2);
    expect(first).toBe('circus-north-capena');
  });

  it('they ask for the purse only face to face; a mark who runs is let go', () => {
    const w = fakeWorld();
    w.game.elapsed = 100;
    w.danger.trigger('circus-north-capena', { x: 0, z: -12 });
    w.danger.update(); // within 14 m and in sight: they step out
    expect(w.danger.state?.phase).toBe('approach');
    // Run away faster than they walk: the distance grows past 15 m.
    let demanded = false;
    for (let i = 0; i < 100 && w.danger.state; i++) {
      w.tick(0.1);
      w.player.position.set(0, 0, i * 0.6);
      w.danger.update();
      if (w.danger.state?.phase === 'demand') demanded = true;
    }
    expect(demanded).toBe(false);
    expect(w.danger.state).toBeNull();
    expect(w.subtitles.at(-1)).toContain('Run, then');
    expect(MUGGING.demand).toBeLessThanOrEqual(5);
  });
});
