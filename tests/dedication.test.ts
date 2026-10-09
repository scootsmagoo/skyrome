import { describe, expect, it } from 'vitest';
import { Group, Vector3 } from 'three';
import type { Actor, IdleLoop } from '../src/actors/Actor';
import { createDedication, type Dedication } from '../src/content/dedication';
import type { FigureDef, FigureFactory } from '../src/content/tableau';
import { COLUMN_LOCAL, columnHeading } from '../src/world/landmarks/columnFrame';
import { fakeGame } from './rpg-fakes';

const DT = 1 / 60;
/** The Column stands here in the world, unrotated. */
const COLUMN = new Vector3(100, 0, 200);
/** The Forum of Trajan's centre: 200 m east of the Column, so it is outside the boost of a point at the Column. */
const FORUM = new Vector3(300, 0, 200);

/** A stand-in Actor: kinematic, no physics. Records its idle loops and gives a right hand socket. */
function fakeFigure(id: string, at: { x: number; y: number; z: number }, heading: number) {
  const hand = new Group();
  const loops: IdleLoop[] = [];
  const f = {
    id,
    position: new Vector3(at.x, at.y, at.z),
    heading,
    velocity: new Vector3(),
    disposed: false,
    grounded: false,
    loops,
    hand,
    avatar: {
      setIdleLoop: (l: IdleLoop | null) => {
        if (l) loops.push(l);
      },
      getSocket: (_name: string) => hand,
    },
    locomote(wish: { x: number; y: number; z: number }, dt: number) {
      f.position.x += wish.x * dt;
      f.position.z += wish.z * dt;
    },
  };
  return f as unknown as Actor & { loops: IdleLoop[]; hand: Group };
}

interface Stubs {
  figures: FigureFactory;
  made: FigureDef[];
  actors: Map<string, Actor & { loops: IdleLoop[]; hand: Group }>;
  destroyed: string[];
  stages: unknown[][];
  directs: unknown[][];
  unstages: string[];
  alarms: unknown[][];
  nogo: ((x: number, z: number) => boolean)[];
  held: Set<string>;
  shots: { from: { x: number; y: number; z: number }; to: { x: number; y: number; z: number }; seconds: number; onArrive?: () => void }[];
}

interface Rig {
  fg: ReturnType<typeof fakeGame>;
  game: Record<string, unknown>;
  stubs: Stubs;
  shots: number[];
  subtitles: { t: number; speaker: string; text: string }[];
  /** Advance `seconds` of game time (in whole frames). */
  run(seconds: number): void;
  dedication: Dedication;
}

/** Trajan's look in the registry (his appearance comes from game.npcs when it is there). */
const REGISTRY_TRAJAN = { sex: 'male', age: 'adult', build: 'average', height: 1.8, skin: '#C99A72', hair: { style: 'cropped', color: '#8A8580' }, beard: 'none', garments: [{ kind: 'toga', color: '#f2eee4' }], footwear: 'calcei' } as const;

function rig(
  opts: { column?: boolean; combat?: boolean; extras?: boolean; boost?: (x: number, z: number) => number; population?: boolean; npcs?: boolean } = {},
): Rig {
  const fg = fakeGame();
  const game = fg.game as unknown as Record<string, unknown>;
  const landmarks = new Map<string, { position: Vector3; rotationY: number }>();
  if (opts.column !== false) landmarks.set('column-trajan', { position: COLUMN.clone(), rotationY: 0 });
  landmarks.set('forum-trajan', { position: FORUM.clone(), rotationY: 0 });
  game.landmarks = landmarks;

  const stubs: Stubs = {
    made: [],
    actors: new Map(),
    destroyed: [],
    stages: [],
    directs: [],
    unstages: [],
    alarms: [],
    nogo: [],
    held: new Set<string>(),
    shots: [],
    figures: {
      create(def, at) {
        stubs.made.push({ ...def, x: at.x, y: at.y, z: at.z });
        const actor = fakeFigure(def.id, at, def.heading);
        stubs.actors.set(def.id, actor);
        return actor;
      },
      destroy(actor) {
        stubs.destroyed.push(actor.id);
      },
    },
  };
  const gratus = { position: new Vector3(COLUMN.x + 1.4, 0.03, COLUMN.z - 4.6), heading: 0 };
  game.population = {
    get: (id: string) => (id === 'npc-gratus' ? gratus : undefined),
    unstage: (id: string) => {
      stubs.unstages.push(id);
    },
    direct: (...args: unknown[]) => {
      stubs.directs.push(args);
      return true;
    },
    stage: (...args: unknown[]) => {
      stubs.stages.push(args);
      return true;
    },
    alarm: (...args: unknown[]) => {
      stubs.alarms.push(args);
    },
    holdNamed: (id: string) => {
      stubs.held.add(id);
      return () => {
        stubs.held.delete(id);
      };
    },
    addNoGo: (test: (x: number, z: number) => boolean) => {
      stubs.nogo.push(test);
      return () => {
        stubs.nogo.splice(stubs.nogo.indexOf(test), 1);
      };
    },
    crowdBoost: opts.boost ?? null,
  };
  if (opts.population === false) delete game.population;
  if (opts.npcs) game.npcs = { get: (id: string) => (id === 'npc-traianus' ? { appearance: REGISTRY_TRAJAN } : undefined) };
  const shots = stubs.shots;
  if (opts.combat) {
    game.combat = {
      shootVisual(from: (typeof shots)[number]['from'], to: (typeof shots)[number]['to'], seconds: number, onArrive?: () => void) {
        shots.push({ from, to, seconds, onArrive });
      },
    };
  }
  if (opts.extras !== false) game.trajanExtras = { enabled: true };

  const shotsFired: number[] = [];
  const subtitles: { t: number; speaker: string; text: string }[] = [];
  let frame = 0;
  fg.events.on('ui:subtitle', (e) => subtitles.push({ t: frame * DT, speaker: e.speaker ?? '', text: e.text }));

  const dedication = createDedication(game as never, { onShot: () => shotsFired.push(frame * DT) }, { figures: stubs.figures });
  return {
    fg,
    game,
    stubs,
    shots: shotsFired,
    subtitles,
    run(seconds: number) {
      const n = Math.round(seconds / DT);
      for (let i = 0; i < n; i++) {
        fg.step(1, DT);
        frame++;
      }
    },
    dedication,
  };
}

/** Subtitle texts, in order. */
const texts = (r: Rig) => r.subtitles.map((s) => s.text);
/** The world point of a Column-local point (the Column is unrotated). */
const at = (x: number, z: number) => ({ x: COLUMN.x + x, z: COLUMN.z + z });

describe('dedication: timeline', () => {
  it('runs the subtitles at their times, each once', () => {
    const r = rig();
    r.dedication.start();
    r.run(0.1);
    expect(r.subtitles[0]).toMatchObject({ text: '(The cornicines sound. The crowd falls quiet.)' });
    r.run(5);
    expect(r.subtitles.find((s) => s.text.startsWith('Favete'))?.t).toBeCloseTo(5, 1);
    r.run(6);
    const inscription = r.subtitles.find((s) => s.text.startsWith('SENATVS'));
    expect(inscription?.t).toBeCloseTo(10, 1);
    r.run(40);
    const lines = texts(r);
    expect(lines.filter((x) => x.startsWith('SENATVS'))).toHaveLength(1);
    expect(lines).toContain('Let the dedication be short, Marcus. The gods are patient; the crowd is not.');
    expect(lines).toContain('Everyone within thirty paces is mine today. Everyone.');
    expect(lines).toContain('Watered, Caesar, as you asked. Lightly.');
    expect(r.subtitles.find((s) => s.text.startsWith('Watered'))?.t).toBeCloseTo(46, 1);
    expect(r.subtitles.find((s) => s.text.startsWith('AD DECLARANDVM'))?.t).toBeCloseTo(17, 1);
  });

  it('times every line of the spec: 0, 5, 10, 17, 23, 29, 34, 40, 46 s', () => {
    const r = rig();
    r.dedication.start();
    r.run(60);
    const line = (prefix: string) => r.subtitles.find((s) => s.text.startsWith(prefix));
    expect(line('(The cornicines')).toMatchObject({ speaker: '' });
    expect(line('(The cornicines')!.t).toBeCloseTo(0, 1);
    expect(line('Favete')).toMatchObject({ speaker: 'Herald' });
    expect(line('Favete')!.t).toBeCloseTo(5, 1);
    expect(line('SENATVS')).toMatchObject({ speaker: 'Herald' });
    expect(line('SENATVS')!.t).toBeCloseTo(10, 1);
    expect(line('AD DECLARANDVM')!.t).toBeCloseTo(17, 1);
    expect(line('The Senate and People')!.t).toBeCloseTo(23, 1);
    expect(line('(Trajan steps down')!.t).toBeCloseTo(29, 1);
    expect(line('Let the dedication')).toMatchObject({ speaker: 'Plotina' });
    expect(line('Let the dedication')!.t).toBeCloseTo(34, 1);
    expect(line('Everyone within')).toMatchObject({ speaker: 'Similis' });
    expect(line('Everyone within')!.t).toBeCloseTo(40, 1);
    expect(line('Watered')).toMatchObject({ speaker: 'Phaedimus' });
    expect(line('Watered')!.t).toBeCloseTo(46, 1);
  });

  it('Trajan walks two metres toward the altar at 29 s', () => {
    const r = rig();
    r.dedication.start();
    r.run(29.2);
    const trajan = r.stubs.actors.get('trajan')!;
    const place = at(-1.04, -5.0);
    expect(Math.hypot(trajan.position.x - place.x, trajan.position.z - place.z)).toBeLessThan(0.2);
    r.run(3);
    // The altar is at (2.37, −3.25): two metres along the line from his place to it.
    const dx = COLUMN_LOCAL.altar.x + 1.04;
    const dz = COLUMN_LOCAL.altar.z + 5.0;
    const len = Math.hypot(dx, dz);
    const goal = at(-1.04 + (dx / len) * 2, -5.0 + (dz / len) * 2);
    expect(Math.hypot(trajan.position.x - goal.x, trajan.position.z - goal.z)).toBeLessThan(0.2);
  });

  it('the party steps out 0.4 s apart: Crito, the sixth walker, starts at 2.0 s', () => {
    const r = rig();
    r.dedication.start();
    const crito = r.stubs.actors.get('crito')!;
    const start = { x: crito.position.x, z: crito.position.z };
    r.run(1.9);
    expect(crito.position.x).toBeCloseTo(start.x, 5);
    expect(crito.position.z).toBeCloseTo(start.z, 5);
    r.run(0.6);
    expect(Math.hypot(crito.position.x - start.x, crito.position.z - start.z)).toBeGreaterThan(0.05);
  });

  it('no walker outruns a stroll: every walk stays at or under 2 m/s', () => {
    const r = rig();
    r.dedication.start();
    const walkers = [...r.stubs.actors.keys()].filter((id) => !id.startsWith('watch-') && id !== 'herald' && id !== 'priest');
    let prev = new Map(walkers.map((id) => [id, { ...r.stubs.actors.get(id)!.position }]));
    let worst = 0;
    for (let k = 0; k < 12; k++) {
      r.run(0.5);
      for (const id of walkers) {
        const a = r.stubs.actors.get(id)!;
        const p = prev.get(id)!;
        worst = Math.max(worst, Math.hypot(a.position.x - p.x, a.position.z - p.z) / 0.5);
        prev.set(id, { ...a.position });
      }
    }
    expect(worst).toBeLessThanOrEqual(2);
    expect(worst).toBeGreaterThan(0);
  });

  it('the praetorians reach their places by 5.5 s', () => {
    const r = rig();
    r.dedication.start();
    r.run(5.5);
    for (const [id, x, z] of [['pr-0', 4.6, -5.6], ['pr-2', 5.2, -3.4], ['pr-4', 5.2, -1.0], ['pr-5', -5.2, -1.0]] as const) {
      const a = r.stubs.actors.get(id)!;
      const p = at(x, z);
      expect(Math.hypot(a.position.x - p.x, a.position.z - p.z)).toBeLessThan(0.2);
    }
  });

  it('uses the registry look for Trajan when game.npcs has him, and a role without it', () => {
    const withNpcs = rig({ npcs: true });
    withNpcs.dedication.start();
    expect(withNpcs.stubs.made.find((d) => d.id === 'trajan')!.appearance).toBe(REGISTRY_TRAJAN);
    const without = rig();
    without.dedication.start();
    const t = without.stubs.made.find((d) => d.id === 'trajan')!;
    expect(t.appearance).toBeUndefined();
    expect(t.role).toBe('patrician-man');
  });

  it('starts each of the party a step behind its place, toward the basilica, at court height', () => {
    const r = rig();
    r.dedication.start();
    const trajan = r.stubs.made.find((d) => d.id === 'trajan');
    expect(trajan).toBeDefined();
    // No physics here, so no floor ray: the court height. Trajan's place is z −5.0: he starts at −6.2.
    expect(trajan!.y).toBeCloseTo(0.03, 5);
    expect(trajan!.z).toBeCloseTo(COLUMN.z - 6.2, 5);
    // Never inside the basilica's back wall.
    expect(r.stubs.made.every((d) => !d.id.match(/^(pr-|trajan|plotina|matidia|similis|phaedimus|crito|celsus|apollodorus)/) || d.z >= COLUMN.z - 6.85 - 1e-6)).toBe(true);
    const herald = r.stubs.made.find((d) => d.id === 'herald');
    expect(herald!.y).toBeCloseTo(0.03, 5);
    expect(herald!.heading).toBeCloseTo(Math.PI, 5);
    expect(r.stubs.made.filter((d) => d.id.startsWith('watch-g'))).toHaveLength(10);
    expect(r.stubs.made.filter((d) => d.id.startsWith('watch-p'))).toHaveLength(6);
  });

  it('walks the party forward to their places, facing the Column, all by 5 s', () => {
    const r = rig();
    r.dedication.start();
    const trajan = r.stubs.actors.get('trajan')!;
    r.run(0.05);
    // Trajan starts 1.2 m behind his place, straight back toward the basilica.
    expect(Math.hypot(trajan.position.x - at(-1.04, -6.2).x, trajan.position.z - at(-1.04, -6.2).z)).toBeLessThan(0.1);
    r.run(4.2);
    const place = at(-1.04, -5.0);
    expect(Math.hypot(trajan.position.x - place.x, trajan.position.z - place.z)).toBeLessThan(0.2);
    expect(trajan.heading).toBeCloseTo(columnHeading(r.game as never, 0)!, 2);
    // The last praetorian is in place too by 6.5 s (the walks are timed to 5 s, then the arrival tail).
    const pr5 = at(-5.2, -1.0);
    const pr5a = r.stubs.actors.get('pr-5')!;
    expect(Math.hypot(pr5a.position.x - pr5.x, pr5a.position.z - pr5.z)).toBeLessThan(0.2);
  });

  it('gives Phaedimus a cup in his right hand, and no one else one', () => {
    const r = rig();
    r.dedication.start();
    expect(r.stubs.actors.get('phaedimus')!.hand.children).toHaveLength(1);
    expect(r.stubs.actors.get('trajan')!.hand.children).toHaveLength(0);
  });
});

describe('dedication: the shot', () => {
  it('sealSeen fires the shot 4 s later, and onShot once', () => {
    const r = rig();
    r.dedication.start();
    r.run(10);
    r.dedication.sealSeen();
    expect(r.stubs.directs).toHaveLength(1);
    r.run(3.9);
    expect(r.shots).toHaveLength(0);
    r.run(0.3);
    expect(r.shots).toHaveLength(1);
    expect(r.stubs.stages.some((a) => a[0] === 'npc-gratus' && a[a.length - 1] === 'sleep')).toBe(true);
    expect(r.stubs.alarms).toHaveLength(1);
    expect(r.dedication.phase).toBe('shot');
    r.run(60);
    expect(r.shots).toHaveLength(1);
    expect(r.dedication.phase).toBe('over');
  });

  it('with no seal, the shot comes at 56 s', () => {
    const r = rig();
    r.dedication.start();
    r.run(55.5);
    expect(r.shots).toHaveLength(0);
    r.run(1);
    expect(r.shots).toHaveLength(1);
    expect(r.shots[0]).toBeCloseTo(56, 1);
  });

  it('a late seal does not make a second shot', () => {
    const r = rig();
    r.dedication.start();
    r.dedication.sealSeen();
    r.dedication.sealSeen();
    r.run(52);
    r.dedication.sealSeen();
    r.run(30);
    expect(r.shots).toHaveLength(1);
  });

  it('sealSeen before start does nothing', () => {
    const r = rig();
    r.dedication.sealSeen();
    expect(r.dedication.phase).toBe('idle');
    r.run(10);
    expect(r.stubs.directs).toHaveLength(0);
    expect(r.stubs.made).toHaveLength(0);
    r.dedication.start();
    r.run(10);
    expect(r.shots).toHaveLength(0);
    r.run(47);
    expect(r.shots).toHaveLength(1);
    expect(r.shots[0]).toBeCloseTo(66, 1);
  });

  it('Gratus is unstaged and walked halfway to the door when the shot is set', () => {
    const r = rig();
    r.dedication.start();
    r.dedication.sealSeen();
    expect(r.stubs.unstages).toEqual(['npc-gratus']);
    expect(r.stubs.directs).toHaveLength(1);
    const [, x, z, speed] = r.stubs.directs[0] as number[];
    const door = at(COLUMN_LOCAL.door.x, COLUMN_LOCAL.door.z);
    expect(x).toBeCloseTo((COLUMN.x + 1.4 + door.x) / 2, 5);
    expect(z).toBeCloseTo((COLUMN.z - 4.6 + door.z) / 2, 5);
    expect(speed).toBeCloseTo(1.8, 5);
  });

  it('with combat, the arrow flies 0.6 s after the draw and the shot lands on arrival', () => {
    const r = rig({ combat: true });
    r.dedication.start();
    r.dedication.sealSeen();
    r.run(4.5);
    expect(r.stubs.shots).toHaveLength(0);
    r.run(0.3);
    expect(r.stubs.shots).toHaveLength(1);
    expect(r.stubs.shots[0].seconds).toBeCloseTo(0.7, 5);
    expect(r.shots).toHaveLength(0);
    r.stubs.shots[0].onArrive?.();
    expect(r.shots).toHaveLength(1);
    r.run(60);
    expect(r.shots).toHaveLength(1);
  });

  it('the arrow still lands if combat disappears during the draw', () => {
    const r = rig({ combat: true });
    r.dedication.start();
    r.dedication.sealSeen();
    r.run(4.3);
    delete r.game.combat;
    r.run(0.5);
    expect(r.shots).toHaveLength(1);
    expect(r.dedication.phase).toBe('shot');
  });

  it('removes Bitus when the player enters dun-columna', () => {
    const r = rig();
    r.dedication.start();
    r.dedication.sealSeen();
    r.run(4.1);
    expect(r.stubs.made.some((d) => d.id === 'bitus-top')).toBe(true);
    (r.game.events as unknown as { emit(t: string, e: unknown): void }).emit('interior:entered', { id: 'dun-columna' });
    expect(r.stubs.destroyed).toContain('bitus-top');
  });
});

describe('dedication: the panic', () => {
  it('the party and praetorians leave by 4 s after the panic; Crito steps out of the tableau at once (the quest stages the real one)', () => {
    const r = rig();
    r.dedication.start();
    r.dedication.sealSeen();
    r.run(4.5);
    expect(r.shots[0]).toBeCloseTo(4, 1);
    expect(r.dedication.phase).toBe('shot');
    r.run(1);
    expect(r.dedication.phase).toBe('panic');
    // Only the tableau Crito has gone before the 4 s mark.
    r.run(2.5);
    expect(r.stubs.destroyed).toEqual(['crito']);
    r.run(2);
    for (const id of ['trajan', 'plotina', 'phaedimus', 'apollodorus', 'pr-0', 'pr-5', 'herald', 'priest']) {
      expect(r.stubs.destroyed).toContain(id);
    }
  });

  it('the panic is over 12 s after it starts', () => {
    const r = rig();
    r.dedication.start();
    r.dedication.sealSeen();
    r.run(16);
    expect(r.dedication.phase).toBe('panic');
    r.run(2);
    expect(r.dedication.phase).toBe('over');
  });
});

describe('dedication: stop and the holds', () => {
  it('restores trajanExtras, the crowd boost, the no-go and the Apollodorus hold', () => {
    const prev = (x: number, z: number) => (x > 0 ? 2 : z);
    const r = rig({ boost: prev });
    const pop = r.game.population as { crowdBoost: (x: number, z: number) => number };
    const extras = r.game.trajanExtras as { enabled: boolean };
    r.dedication.start();
    expect(extras.enabled).toBe(false);
    expect(r.stubs.held.has('npc-apollodorus')).toBe(true);
    expect(r.stubs.nogo).toHaveLength(1);
    // Inside the Forum's 120 m: the old boost times 1.6. Outside it (the Column is 200 m off): the old boost alone.
    expect(pop.crowdBoost(FORUM.x + 1, FORUM.z)).toBeCloseTo(2 * 1.6, 5);
    expect(pop.crowdBoost(COLUMN.x, COLUMN.z)).toBeCloseTo(2, 5);
    expect(pop.crowdBoost(COLUMN.x + 500, COLUMN.z)).toBeCloseTo(2, 5);
    // The no-go covers the court, not the street beyond it.
    expect(r.stubs.nogo[0](COLUMN.x, COLUMN.z - 5)).toBe(true);
    expect(r.stubs.nogo[0](COLUMN.x + 40, COLUMN.z)).toBe(false);
    r.dedication.stop();
    expect(extras.enabled).toBe(true);
    expect(pop.crowdBoost).toBe(prev);
    expect(r.stubs.nogo).toHaveLength(0);
    expect(r.stubs.held.has('npc-apollodorus')).toBe(false);
    expect(r.dedication.phase).toBe('idle');
  });

  it('a placed forum is needed for the boost: without it, no boost', () => {
    const r = rig();
    (r.game.landmarks as Map<string, unknown>).delete('forum-trajan');
    const pop = r.game.population as { crowdBoost: ((x: number, z: number) => number) | null };
    r.dedication.start();
    expect(pop.crowdBoost!(COLUMN.x, COLUMN.z)).toBe(1);
  });

  it('stop cancels the timeline and any pending shot', () => {
    const r = rig();
    r.dedication.start();
    r.run(20);
    const before = r.subtitles.length;
    r.dedication.stop();
    r.dedication.sealSeen();
    r.run(60);
    expect(r.subtitles.length).toBe(before);
    expect(r.shots).toHaveLength(0);
    expect(r.stubs.destroyed.length).toBeGreaterThan(0);
  });

  it('stop during the panic cancels the leave and the over', () => {
    const r = rig();
    r.dedication.start();
    r.dedication.sealSeen();
    r.run(6);
    r.dedication.stop();
    const before = r.subtitles.length;
    r.run(30);
    expect(r.subtitles.length).toBe(before);
    expect(r.shots).toHaveLength(1);
    expect(r.dedication.phase).toBe('idle');
  });

  it('runs without a placed Column: subtitles and the shot still play, no figures', () => {
    const r = rig({ column: false, extras: false });
    expect(() => r.dedication.start()).not.toThrow();
    expect(r.stubs.made).toHaveLength(0);
    r.run(10);
    r.dedication.sealSeen();
    r.run(4.5);
    expect(r.shots).toHaveLength(1);
    expect(() => r.dedication.stop()).not.toThrow();
  });
});

describe('dedication: services missing', () => {
  it('runs the timeline and the shot with no population: no throw, no holds', () => {
    const r = rig({ population: false, extras: false });
    expect(() => r.dedication.start()).not.toThrow();
    expect(r.stubs.made.length).toBeGreaterThan(0);
    r.run(10);
    expect(() => r.dedication.sealSeen()).not.toThrow();
    r.run(4.5);
    expect(r.shots).toHaveLength(1);
    expect(() => r.dedication.stop()).not.toThrow();
    expect(r.dedication.phase).toBe('idle');
  });

  it('an interior other than dun-columna leaves Bitus on the platform', () => {
    const r = rig();
    r.dedication.start();
    r.dedication.sealSeen();
    r.run(4.1);
    (r.game.events as unknown as { emit(t: string, e: unknown): void }).emit('interior:entered', { id: 'dun-other' });
    expect(r.stubs.destroyed).not.toContain('bitus-top');
  });
});
