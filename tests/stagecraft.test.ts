import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import type { Actor, IdleLoop } from '../src/actors/Actor';
import { Tableau, type FigureDef, type FigureFactory } from '../src/content/tableau';
import { Sequence, stageTicker } from '../src/content/sequence';
import { fakeGame } from './rpg-fakes';

const DT = 1 / 60;

/** A stand-in Actor: kinematic, no physics. `locomote` moves it straight at the wish speed. */
/** The fake Actor, with the idle loops it was given in `loops`. */
type FakeActor = Actor & { loops: IdleLoop[]; stuck: boolean };

function fakeFigure(id: string, at: { x: number; y: number; z: number }, heading: number, stuck: boolean): FakeActor {
  const loops: IdleLoop[] = [];
  const f = {
    id,
    position: new Vector3(at.x, at.y, at.z),
    heading,
    velocity: new Vector3(),
    disposed: false,
    grounded: false,
    loops,
    stuck,
    avatar: { setIdleLoop: (l: IdleLoop | null) => l && loops.push(l) },
    locomote(wish: { x: number; y: number; z: number }, dt: number) {
      if (f.stuck) return;
      f.position.x += wish.x * dt;
      f.position.z += wish.z * dt;
      f.velocity.set(wish.x, 0, wish.z);
    },
  };
  return f as unknown as FakeActor;
}

function fakeFactory() {
  const made: { def: FigureDef; at: { x: number; y: number; z: number }; actor: FakeActor }[] = [];
  const destroyed: Actor[] = [];
  const opts = { stuck: false };
  const factory: FigureFactory = {
    create(def, at) {
      const actor = fakeFigure(def.id, at, def.heading, opts.stuck);
      made.push({ def, at, actor });
      return actor;
    },
    destroy(actor) {
      destroyed.push(actor);
    },
  };
  return { factory, made, destroyed, opts };
}

describe('Sequence', () => {
  it('runs steps in time order, each once, with equal times in the order added', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    new Sequence(game).at(2, () => log.push('a')).at(1, () => log.push('b')).at(1, () => log.push('c')).start();
    step(60, DT); // 1 s
    expect(log).toEqual(['b', 'c']);
    step(120, DT); // 3 s
    expect(log).toEqual(['b', 'c', 'a']);
    step(300, DT);
    expect(log).toEqual(['b', 'c', 'a']);
  });

  it('tracks elapsed game time and done', () => {
    const { game, step } = fakeGame();
    const seq = new Sequence(game).at(0.5, () => undefined).start();
    expect(seq.elapsed).toBe(0);
    expect(seq.done).toBe(false);
    step(31, DT);
    expect(seq.elapsed).toBeGreaterThanOrEqual(0.5);
    expect(seq.elapsed).toBeLessThan(0.52);
    expect(seq.done).toBe(true);
    expect(seq.active).toBe(false);
  });

  it('runs every step that is due in a single big advance, in order', () => {
    const { game, step } = fakeGame();
    const log: number[] = [];
    new Sequence(game).at(3, () => log.push(3)).at(0.5, () => log.push(0.5)).at(1, () => log.push(1)).start();
    step(1, 10);
    expect(log).toEqual([0.5, 1, 3]);
  });

  it('pauses with the game', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    const seq = new Sequence(game).at(1, () => log.push('x')).start();
    game.paused = true;
    step(600, DT);
    expect(seq.elapsed).toBe(0);
    expect(log).toEqual([]);
    game.paused = false;
    step(60, DT);
    expect(log).toEqual(['x']);
  });

  it('stop cancels the steps not yet run', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    const seq = new Sequence(game).at(0.2, () => log.push('early')).at(2, () => log.push('late')).start();
    step(30, DT); // 0.5 s
    expect(log).toEqual(['early']);
    seq.stop();
    expect(seq.active).toBe(false);
    step(300, DT);
    expect(log).toEqual(['early']);
  });

  it('a step may stop the sequence, and the steps after it do not run', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    const seq: Sequence = new Sequence(game)
      .at(1, () => {
        log.push('a');
        seq.stop();
      })
      .at(1, () => log.push('b'))
      .start();
    step(120, DT);
    expect(log).toEqual(['a']);
  });

  it('a step added during a run runs once, after the steps already run', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    const seq = new Sequence(game)
      .at(1, () => log.push('A'))
      .at(2, () => log.push('B'))
      .start();
    step(90, DT); // 1.5 s: A has run
    expect(log).toEqual(['A']);
    seq.at(0.5, () => log.push('C')); // already in the past: runs next, once
    step(20, DT); // to about 1.83 s: B (at 2 s) is not due yet
    expect(log).toEqual(['A', 'C']);
    step(120, DT);
    expect(log).toEqual(['A', 'C', 'B']);
    step(300, DT);
    expect(log).toEqual(['A', 'C', 'B']);
  });

  it('start() from inside a step ends that advance, and the restart runs from zero', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    let count = 0;
    const seq: Sequence = new Sequence(game)
      .at(0, () => log.push('zero'))
      .at(1, () => {
        log.push('restart');
        if (count++ === 0) seq.start();
      })
      .start();
    step(60, DT); // 1 s: the restart happens here
    expect(log).toEqual(['zero', 'restart']);
    expect(seq.elapsed).toBe(0);
    expect(seq.active).toBe(true);
    step(60, DT); // the replay: zero, then restart again (count is now 1, so it does not restart)
    expect(log).toEqual(['zero', 'restart', 'zero', 'restart']);
    expect(seq.done).toBe(true);
  });

  it('start() replays the timeline from zero', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    const seq = new Sequence(game).at(0.5, () => log.push('go')).start();
    step(60, DT);
    seq.start();
    expect(seq.elapsed).toBe(0);
    step(60, DT);
    expect(log).toEqual(['go', 'go']);
  });

  it('at() after a finished run keeps time order, so the replay runs in order', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    const seq = new Sequence(game).at(1, () => log.push('A')).at(2, () => log.push('B')).start();
    step(180, DT); // 3 s: both run, the sequence is done
    expect(seq.done).toBe(true);
    seq.at(0.5, () => log.push('C'));
    seq.start();
    step(180, DT);
    // Replay order is C (0.5 s), A (1 s), B (2 s).
    expect(log).toEqual(['A', 'B', 'C', 'A', 'B']);
  });

  it('at() after stop() keeps time order for the replay', () => {
    const { game, step } = fakeGame();
    const log: string[] = [];
    const seq = new Sequence(game).at(1, () => log.push('A')).at(2, () => log.push('B')).start();
    step(60, DT); // 1 s: A runs
    seq.stop();
    seq.at(0.5, () => log.push('C'));
    seq.start();
    step(180, DT);
    // Replay order is C (0.5 s), A (1 s), B (2 s).
    expect(log).toEqual(['A', 'C', 'A', 'B']);
  });
});

describe('Tableau', () => {
  it('adds a figure at the given place, with its heading, and keeps it by id', () => {
    const { game } = fakeGame();
    const { factory, made } = fakeFactory();
    const t = new Tableau(game, factory);
    const a = t.add({ id: 'trajan', x: 1, y: 2, z: 3, heading: Math.PI, loop: 'stand' });
    expect(a).not.toBeNull();
    expect(t.get('trajan')).toBe(a);
    expect(made[0].at).toEqual({ x: 1, y: 2, z: 3 });
    expect(a!.heading).toBe(Math.PI);
  });

  it('defaults the feet height to 0 with no physics', () => {
    const { game } = fakeGame();
    const { factory, made } = fakeFactory();
    const t = new Tableau(game, factory);
    t.add({ id: 'p', x: 0, z: 0, heading: 0 });
    expect(made[0].at.y).toBe(0);
  });

  it('replacing an id removes the old figure', () => {
    const { game } = fakeGame();
    const { factory, destroyed } = fakeFactory();
    const t = new Tableau(game, factory);
    const first = t.add({ id: 'p', x: 0, y: 0, z: 0, heading: 0 });
    const second = t.add({ id: 'p', x: 5, y: 0, z: 0, heading: 0 });
    expect(destroyed).toEqual([first]);
    expect(t.get('p')).toBe(second);
  });

  it('walks a figure to its mark at the given speed, facing the way it goes, then switches loop', () => {
    const { game, step } = fakeGame();
    const { factory, made } = fakeFactory();
    const t = new Tableau(game, factory);
    t.add({ id: 'trajan', x: 0, y: 0, z: 0, heading: 0, loop: 'stand' });
    t.walk('trajan', { x: 3, z: 4 }, 2, 'talk');
    step(30, DT); // half a second: still walking, no loop yet
    const fig = made[0].actor;
    expect(fig.loops).toEqual([]);
    const p = fig.position;
    expect(Math.hypot(p.x, p.z)).toBeCloseTo(1, 1); // 2 m/s for 0.5 s
    expect(fig.heading).toBeCloseTo(Math.atan2(3, 4), 5);
    step(600, DT); // 10 s, plenty
    expect(Math.hypot(p.x - 3, p.z - 4)).toBeLessThan(0.1);
    expect(fig.loops).toEqual(['talk']);
    expect(fig.velocity.length()).toBe(0);
  });

  it('a walk that cannot arrive still ends, and switches loop', () => {
    const { game, step } = fakeGame();
    const { factory, made, opts } = fakeFactory();
    opts.stuck = true;
    const t = new Tableau(game, factory);
    t.add({ id: 'p', x: 0, y: 0, z: 0, heading: 0 });
    t.walk('p', { x: 10, z: 0 }, 1.4, 'stand');
    step(60, DT * 10); // 10 s: not yet, the walk allows about 24 s
    expect(made[0].actor.loops).toEqual([]);
    step(60 * 20, DT);
    expect(made[0].actor.loops).toEqual(['stand']);
  });

  it('a new walk replaces the old one, and face/loop act on the figure', () => {
    const { game, step } = fakeGame();
    const { factory, made } = fakeFactory();
    const t = new Tableau(game, factory);
    t.add({ id: 'p', x: 0, y: 0, z: 0, heading: 0 });
    t.walk('p', { x: 50, z: 0 }, 1, 'sit');
    t.walk('p', { x: 0, z: 0.5 }, 1, 'pray');
    step(120, DT);
    expect(made[0].actor.loops).toEqual(['pray']);
    t.face('p', 1.5);
    expect(made[0].actor.heading).toBe(1.5);
    t.loop('p', 'guard');
    expect(made[0].actor.loops).toEqual(['pray', 'guard']);
  });

  it('remove and clear destroy figures and cancel their walks', () => {
    const { game, step } = fakeGame();
    const { factory, destroyed, made } = fakeFactory();
    const t = new Tableau(game, factory);
    t.add({ id: 'a', x: 0, y: 0, z: 0, heading: 0 });
    t.add({ id: 'b', x: 0, y: 0, z: 0, heading: 0 });
    t.walk('a', { x: 5, z: 0 }, 1, 'talk');
    t.remove('a');
    expect(destroyed).toEqual([made[0].actor]);
    expect(t.get('a')).toBeUndefined();
    step(600, DT);
    expect(made[0].actor.loops).toEqual([]);
    t.walk('nobody', { x: 1, z: 1 });
    t.clear();
    expect(t.get('b')).toBeUndefined();
    expect(destroyed.length).toBe(2);
  });

  it('dispose removes everything and unsubscribes from the ticker', () => {
    const { game, step, systems } = fakeGame();
    const { factory, made } = fakeFactory();
    const t = new Tableau(game, factory);
    // The shared ticker is installed on first use; its subscriber count shows the unsubscribe.
    const ticker = stageTicker(game);
    expect(ticker.count).toBe(1);
    expect(systems.filter((s) => s.name === 'stagecraft').length).toBe(1);
    t.add({ id: 'a', x: 0, y: 0, z: 0, heading: 0 });
    t.walk('a', { x: 5, z: 0 }, 1, 'talk');
    t.dispose();
    expect(ticker.count).toBe(0);
    expect(t.get('a')).toBeUndefined();
    // After dispose, add() refuses to make a figure.
    expect(t.add({ id: 'b', x: 0, y: 0, z: 0, heading: 0 })).toBeNull();
    expect(t.get('b')).toBeUndefined();
    // A walk registered on a disposed Tableau never ticks, even if the figure is still held.
    const a = made[0].actor;
    a.position.x = 0;
    step(600, DT);
    expect(a.position.x).toBe(0);
    expect(a.loops).toEqual([]);
  });
});
