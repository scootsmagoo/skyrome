/**
 * A small timeline for staged scenes, advanced by game time: it pauses with the game
 * (`game.paused`) and runs at the game's time scale. Steps run once each, in time order.
 *
 *   new Sequence(game).at(0, () => say(...)).at(5, () => ...).start();
 *
 * Steps are times in seconds from `start()`. A step whose time has passed when the sequence
 * advances in a big `dt` still runs, in order, on that same advance. `stop()` cancels whatever
 * has not run yet; the steps stay, so a later `start()` replays the whole timeline.
 *
 * Both this and `Tableau` run off `stageTicker(game)`: one System per game that calls the
 * subscribed tickers' `fixed` (fixed 60 Hz, before physics) and `update` (once per frame).
 */
import type { Game, System } from '../core/Game';

/** Something the per-game ticker calls each frame. */
export interface Ticked {
  /** Fixed 60 Hz step (skipped while paused). */
  fixed?(dt: number): void;
  /** Once per frame, with game-time dt (skipped while paused). */
  update?(dt: number): void;
}

class StageTicker implements System {
  readonly name = 'stagecraft';
  readonly priority = 40;
  private subs: Ticked[] = [];

  /** How many tickers are subscribed (for tests and debugging). */
  get count(): number {
    return this.subs.length;
  }

  fixedUpdate(dt: number) {
    for (const s of this.subs.slice()) s.fixed?.(dt);
  }

  update(dt: number) {
    for (const s of this.subs.slice()) s.update?.(dt);
  }

  /** Subscribe; returns the unsubscribe function. */
  add(s: Ticked): () => void {
    this.subs.push(s);
    return () => {
      this.subs = this.subs.filter((x) => x !== s);
    };
  }
}

const tickers = new WeakMap<Game, StageTicker>();

/** The game's staging ticker (installed on first use). */
export function stageTicker(game: Game): { add(s: Ticked): () => void; readonly count: number } {
  let t = tickers.get(game);
  if (!t) {
    t = game.addSystem(new StageTicker());
    tickers.set(game, t);
  }
  return t;
}

export type SequenceStep = () => void;

export class Sequence implements Ticked {
  private steps: { t: number; fn: SequenceStep }[] = [];
  private next = 0;
  private time = 0;
  private running = false;
  private started = false;
  /** Bumped by `start()`, so a restart from inside a step ends the advance that is running. */
  private gen = 0;
  private off: (() => void) | null = null;

  constructor(private readonly game: Game) {}

  /** Seconds since `start()` (game time). */
  get elapsed(): number {
    return this.time;
  }

  /** True between `start()` and the last step running (or `stop()`). */
  get active(): boolean {
    return this.running;
  }

  /** True once every step has run since the last `start()`. */
  get done(): boolean {
    return this.started && !this.running && this.next >= this.steps.length;
  }

  /**
   * Add a step at time `t` (s from start), kept in time order. Steps with equal times run in the
   * order added. While running, a step goes after the steps already run, so each runs exactly once;
   * otherwise (not started, finished, or stopped) it is placed among all the steps, so a replay
   * from `start()` still runs in time order.
   */
  at(t: number, fn: SequenceStep): this {
    const floor = this.running ? this.next : 0;
    let i = this.steps.length;
    while (i > floor && this.steps[i - 1].t > t) i--;
    this.steps.splice(i, 0, { t, fn });
    return this;
  }

  /** Begin (or restart) from time zero. */
  start(): this {
    this.gen++;
    this.time = 0;
    this.next = 0;
    this.running = true;
    this.started = true;
    if (!this.off) this.off = stageTicker(this.game).add(this);
    return this;
  }

  /** Cancel the steps that have not run yet. */
  stop(): void {
    this.running = false;
    this.unsubscribe();
  }

  update(dt: number) {
    if (!this.running || this.game.paused) return;
    this.time += dt;
    // A step may call start() (or stop()): then this advance is over, and the restart runs from zero next time.
    const gen = this.gen;
    while (this.running && gen === this.gen && this.next < this.steps.length && this.steps[this.next].t <= this.time) {
      const step = this.steps[this.next++];
      step.fn();
    }
    if (gen !== this.gen) return;
    if (this.running && this.next >= this.steps.length) {
      this.running = false;
      this.unsubscribe();
    }
  }

  private unsubscribe() {
    this.off?.();
    this.off = null;
  }
}
