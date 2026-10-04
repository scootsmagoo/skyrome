/** Fakes for the combat tests: point bodies, a recording env, combatant builders. */
import { Vector3 } from 'three';
import { CombatBrain } from '../src/ai/combat/CombatBrain';
import { brainProfileFrom, type BrainProfile } from '../src/ai/combat/types';
import { Combatant, type CombatBody } from '../src/combat/Combatant';
import { CombatCore, type CombatEnv } from '../src/combat/CombatCore';
import { flatStats, FISTS } from '../src/rpg/combat-math';
import { ITEMS } from '../src/rpg/data/items';
import { profileStats, profileWeapon } from '../src/rpg/enemies';
import { ItemDb } from '../src/rpg/items';
import type { CombatProfile } from '../src/rpg/types';
import { VitalsImpl } from '../src/rpg/vitals';

export const items = new ItemDb(ITEMS);

export class FakeBody implements CombatBody {
  readonly position = new Vector3();
  heading: number;
  radius = 0.35;
  height = 1.8;
  vel = { x: 0, z: 0 };
  ghost = false;
  constructor(
    readonly id: string,
    x = 0,
    z = 0,
    heading = 0,
  ) {
    this.position.set(x, 0, z);
    this.heading = heading;
  }
  move(w: { x: number; z: number }, dt: number) {
    this.vel = { x: w.x, z: w.z };
    this.position.x += w.x * dt;
    this.position.z += w.z * dt;
  }
  velocity() {
    return this.vel;
  }
  setGhost(g: boolean) {
    this.ghost = g;
  }
}

export interface RecordingEnv extends CombatEnv {
  log: { type: string; payload: unknown }[];
  cues: string[];
  feedbacks: string[];
  of(type: string): unknown[];
}

/** A deterministic env: no crits (rng 0.5 unless given), sight everywhere, events recorded. */
export function fakeEnv(rng: () => number = () => 0.5): RecordingEnv {
  const log: { type: string; payload: unknown }[] = [];
  const cues: string[] = [];
  const feedbacks: string[] = [];
  return {
    log,
    cues,
    feedbacks,
    of: (type) => log.filter((e) => e.type === type).map((e) => e.payload),
    emit: (type, payload) => void log.push({ type: type as string, payload }),
    lineOfSight: () => true,
    sfx: () => {},
    feedback: (k) => void feedbacks.push(k),
    cue: (k) => void cues.push(k),
    night: () => false,
    rng,
    parryWindowOverride: () => null,
  };
}

export function makeCore(env: CombatEnv = fakeEnv()) {
  return new CombatCore(env);
}

/** The player: flat skill (default 25), a weapon and shield from the item catalogue. */
export function addPlayer(core: CombatCore, o: { weapon?: string; shield?: string; skill?: number; x?: number; z?: number; heading?: number; armor?: number; health?: number } = {}): Combatant {
  const weaponItem = o.weapon ? items.get(o.weapon) : items.get('gladius');
  const shieldItem = o.shield ? items.get(o.shield) : undefined;
  const c = new Combatant({
    id: 'player',
    body: new FakeBody('player', o.x ?? 0, o.z ?? 0, o.heading ?? 0),
    isPlayer: true,
    team: 'player',
    name: 'You',
    stats: flatStats(o.skill ?? 25),
    vitals: new VitalsImpl({ health: o.health ?? 100, stamina: 100 }),
    ownsVitals: true,
    weaponItem,
    weapon: weaponItem?.weapon ?? FISTS,
    shieldItem,
    shield: shieldItem?.shield,
    armor: o.armor ?? 0,
    family: 'cloth',
    poise: 50,
  });
  c.drawn = true;
  return core.add(c);
}

/** An NPC from a profile, with (or without) its AI. */
export function addNpc(
  core: CombatCore,
  id: string,
  profile: CombatProfile,
  o: { x?: number; z?: number; heading?: number; team?: string; ai?: boolean; brain?: Partial<BrainProfile>; rng?: () => number } = {},
): Combatant {
  const weaponItem = profile.weapon ? items.get(profile.weapon) : undefined;
  const shieldItem = profile.shield ? items.get(profile.shield) : undefined;
  const c = new Combatant({
    id,
    body: new FakeBody(id, o.x ?? 0, o.z ?? 1.4, o.heading ?? Math.PI),
    team: o.team ?? 'hostile',
    name: profile.name ?? id,
    profile,
    stats: profileStats(profile),
    vitals: new VitalsImpl({ health: profile.health, stamina: profile.stamina }),
    ownsVitals: true,
    weaponItem,
    weapon: profileWeapon(profile, items),
    shieldItem,
    shield: shieldItem?.shield,
    armor: profile.armor,
    family: profile.armorFamily ?? 'cloth',
    poise: profile.poise ?? 50,
  });
  c.drawn = true;
  if (o.ai) {
    c.brain = new CombatBrain(brainProfileFrom(profile, o.brain), o.rng ?? (() => 0.5));
    c.driven = true;
  }
  return core.add(c);
}

/** Run the core for `seconds` at 60 Hz. */
export function run(core: CombatCore, seconds: number, each?: () => void) {
  const n = Math.round(seconds * 60);
  for (let i = 0; i < n; i++) {
    core.fixedStep(1 / 60);
    each?.();
  }
}

/** 'actor:killed' events that were real deaths (knockouts and flights carry 'ko' / 'fled' instead). */
export function deaths(env: RecordingEnv) {
  return (env.of('actor:killed') as { victimId: string; tags?: string[] }[]).filter((e) => e.tags?.includes('dead'));
}

// ---------------------------------------------------------------- walls (pathing tests)

/** An axis-aligned block on the ground (x0..x1, z0..z1). */
export interface Box {
  x0: number;
  x1: number;
  z0: number;
  z1: number;
}

/** Does the segment a→b come within `r` of the box (slab test on the box grown by r)? */
export function segmentHitsBox(ax: number, az: number, bx: number, bz: number, b: Box, r: number): boolean {
  const x0 = b.x0 - r;
  const x1 = b.x1 + r;
  const z0 = b.z0 - r;
  const z1 = b.z1 + r;
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  for (const [p, d, lo, hi] of [
    [ax, dx, x0, x1],
    [az, dz, z0, z1],
  ]) {
    if (Math.abs(d) < 1e-9) {
      if (p < lo || p > hi) return false;
      continue;
    }
    let ta = (lo - p) / d;
    let tb = (hi - p) / d;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    if (t0 > t1) return false;
  }
  return true;
}

/** A nav probe over boxes (what the game does with rays against the world). */
export function boxProbe(boxes: Box[]) {
  return {
    blocked: (ax: number, az: number, bx: number, bz: number, _y: number, r: number) => boxes.some((b) => segmentHitsBox(ax, az, bx, bz, b, r * 0.9)),
  };
}

/** A point body that can't walk into the boxes: it slides along them like the character controller. */
export class WalledBody extends FakeBody {
  constructor(
    id: string,
    x: number,
    z: number,
    heading: number,
    readonly boxes: Box[],
  ) {
    super(id, x, z, heading);
  }
  private inside(x: number, z: number) {
    const r = this.radius;
    return this.boxes.some((b) => x > b.x0 - r && x < b.x1 + r && z > b.z0 - r && z < b.z1 + r);
  }
  override move(w: { x: number; z: number }, dt: number) {
    const p = this.position;
    let nx = p.x + w.x * dt;
    let nz = p.z + w.z * dt;
    if (this.inside(nx, nz)) {
      if (!this.inside(nx, p.z)) nz = p.z;
      else if (!this.inside(p.x, nz)) nx = p.x;
      else {
        nx = p.x;
        nz = p.z;
      }
    }
    this.vel = { x: (nx - p.x) / dt, z: (nz - p.z) / dt };
    p.x = nx;
    p.z = nz;
  }
}

/** Put a combatant's body behind walls (replaces its point body). */
export function wall(c: Combatant, boxes: Box[]) {
  const b = new WalledBody(c.id, c.position.x, c.position.z, c.heading, boxes);
  (c as unknown as { body: CombatBody }).body = b;
  return b;
}
