/** Minimal stand-ins for Game/Player/Input so the RPG engines can be tested without WebGL. */
import { Vector3 } from 'three';
import { EventBus, type GameEvents } from '../src/core/Events';
import type { Game, System } from '../src/core/Game';
import { GameTime } from '../src/core/GameTime';
import { Rng } from '../src/core/Rng';

export interface FakePlayer {
  position: Vector3;
  heading: number;
  yaw: number;
  pitch: number;
  zoom: number;
  viewMode: 'first' | 'third';
  sprinting: boolean;
  teleport(p: { x: number; y: number; z: number }, heading?: number): void;
  setViewMode(m: 'first' | 'third'): void;
}

export function fakePlayer(): FakePlayer {
  return {
    position: new Vector3(),
    heading: 0,
    yaw: 0,
    pitch: -0.1,
    zoom: 3.4,
    viewMode: 'third',
    sprinting: false,
    teleport(p, heading) {
      this.position.set(p.x, p.y, p.z);
      if (heading !== undefined) this.heading = heading;
    },
    setViewMode(m) {
      this.viewMode = m;
    },
  };
}

/** A PlayerController-shaped system for hook tests. */
export function fakePlayerController() {
  return { name: 'playerController', priority: -10, canSprint: () => true, speedMultiplier: () => 1 };
}

export interface FakeGame {
  game: Game;
  events: EventBus<GameEvents>;
  systems: System[];
  /** Input actions "pressed" this frame. */
  pressed: Set<string>;
  /** Run n fixed steps + one update/lateUpdate per step. */
  step(n?: number, dt?: number): void;
}

export function fakeGame(opts: { player?: boolean; controller?: boolean } = {}): FakeGame {
  const events = new EventBus<GameEvents>();
  const time = new GameTime(events);
  const systems: System[] = [];
  const pressed = new Set<string>();
  const input = { pressed: (a: string) => pressed.has(a), down: () => false, released: () => false, enabled: true };
  const g = {
    events,
    time,
    rng: new Rng(113),
    paused: false,
    input,
    player: opts.player === false ? undefined : fakePlayer(),
    addSystem<T extends System>(s: T): T {
      systems.push(s);
      systems.sort((a, b) => (a.priority ?? 0) - (b.priority ?? 0));
      return s;
    },
    getSystem<T extends System>(name: string): T | undefined {
      return systems.find((s) => s.name === name) as T | undefined;
    },
  };
  if (opts.controller) g.addSystem(fakePlayerController());
  const game = g as unknown as Game;
  return {
    game,
    events,
    systems,
    pressed,
    step(n = 1, dt = 1 / 60) {
      for (let i = 0; i < n; i++) {
        for (const s of systems) s.fixedUpdate?.(dt);
        for (const s of systems) s.update?.(dt, 1);
        for (const s of systems) s.lateUpdate?.(dt);
        pressed.clear();
      }
    },
  };
}

/** Collect every emission of some events, in order. */
export function record(events: EventBus<GameEvents>, types: (keyof GameEvents)[]) {
  const log: { type: string; e: unknown }[] = [];
  for (const t of types) events.on(t, (e) => log.push({ type: t, e }));
  return log;
}
