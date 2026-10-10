/**
 * Loads that fall. A basket, amphora, sack or tray carried on the head, back or chest comes off its
 * carrier when they go down (a shove, a blow, a death) and becomes a rigid body of its own
 * (`Layer.Debris`, seeded with the carrier's velocity). A basket's loaf and a tray's buns spill as
 * little bodies of their own; an amphora that lands hard may break into a shell and shards.
 *
 * The carrier gets up, walks to the load, crouches, picks it up and puts it back on: the recover
 * task (`recoverStep` here is its pure state machine; the brain runs it). They give up after a
 * timeout, or when the load is gone, broken or out of reach.
 *
 * The budget follows the GoreSystem's pattern: at most MAX_LOADS loads and MAX_PIECES spilled
 * bits in the world at once, oldest out first, and a load nobody collects goes after LOAD_LIFE.
 * Bodies at rest sleep (free in the physics step) and are left alone until they go.
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Layer, RAPIER, groups } from '../core/Physics';
import type { PropKind } from './crowd/roles';
import type { Npc } from './Npc';
import { attachProp, BUN_GEO, LOAF_GEO, makeBrokenAmphora } from './props';
import { WineStains } from './spill';

declare module '../core/Game' {
  interface Game {
    looseLoads?: LooseLoads;
  }
}

declare module '../core/Events' {
  interface GameEvents {
    /** A load that came off its carrier hit the ground (or broke); bystanders look over. */
    'load:fell': { kind: LoadKind; x: number; y: number; z: number; ownerId: string | null; broke: boolean };
  }
}

/** The loads that come off a carrier who goes down. */
export type LoadKind = 'basket' | 'amphora' | 'sack' | 'tray';
export function isDetachable(kind: PropKind | undefined): kind is LoadKind {
  return kind === 'basket' || kind === 'amphora' || kind === 'sack' || kind === 'tray';
}

/** Loads and spilled bits kept in the world at once (the oldest go first) and how long (s): the High tier's. */
export const MAX_LOADS = 10;
export const MAX_PIECES = 24;
export const LOAD_LIFE = 150;

/** The budget per graphics tier: loads, spilled bits (each a body in the physics step) and wine stains. */
export const LOAD_BUDGET = {
  low: { loads: 4, pieces: 8, stains: 2 },
  medium: { loads: 7, pieces: 14, stains: 4 },
  high: { loads: MAX_LOADS, pieces: MAX_PIECES, stains: 6 },
} as const;
export type LoadTier = keyof typeof LOAD_BUDGET;

/** The chance that a stumble (not a fall) shakes the load off, by what is carried (a tall head load slips most). */
export const SLIP_CHANCE: Record<LoadKind, number> = { amphora: 0.3, basket: 0.4, tray: 0.5, sack: 0.15 };

/**
 * Does an amphora landing at `speed` after falling from `before` (m/s) break? It must come down
 * hard (a fall from the head onto stone is about 5–7 m/s) and then it usually does.
 */
export function breaks(before: number, after: number, roll: number): boolean {
  return before > 3.5 && before - after > BREAK_DECEL && roll < BREAK_CHANCE;
}
const PIECE_LIFE = 50;
/** Sudden slowing (m/s between two frames) that can break an amphora. */
const BREAK_DECEL = 2.5;
const BREAK_CHANCE = 0.8;

export interface LoosePiece {
  mesh: THREE.Object3D;
  body: RAPIER.RigidBody | null;
}

export interface LooseLoad {
  kind: LoadKind;
  /** Moves with the body; its position is the load's centre. */
  holder: THREE.Group;
  body: RAPIER.RigidBody | null;
  /** The carrier, who will come for it (null: nobody does). */
  owner: Npc | null;
  pieces: LoosePiece[];
  born: number;
  /** 'broken' (an amphora in shards) can't be picked up. */
  state: 'loose' | 'broken';
  speed: number;
  /** Has hit the ground yet (bystanders were told). */
  landed: boolean;
}

// ---------------------------------------------------------------- the recover task (pure)

/** Metres from the load at which the carrier crouches for it. */
export const REACH = 0.6;
/** Where the carrier stands from the load's centre (m) when they crouch: the clip's hand meets the ground about 0.3 m ahead of the feet. */
export const STAND_OFF = 0.4;
/** The ground-reach clip ('pickupGround') length (s) and the moment the hand closes on the load. */
export const PICKUP_TIME = 1.7;
export const PICKUP_AT = 0.85;
/** The moment (s into the clip) the load goes from the hand to where it is carried (the clip is straightening up). */
export const SEAT_AT = 1.4;
/** Give up on a load after this long (s). */
export const RECOVER_TIMEOUT = 45;

export type RecoverPhase = 'walk' | 'crouch' | 'done' | 'giveup';

export interface RecoverState {
  phase: RecoverPhase;
  /** Time in the task (s), and in the crouch. */
  t: number;
  crouchT: number;
  grabbed: boolean;
  seated: boolean;
}

export interface RecoverInput {
  /** Distance to the load (m). */
  dist: number;
  /** The load is still there and can be picked up. */
  present: boolean;
  /** The mover has arrived, or can go no nearer. */
  stalled: boolean;
}

export type RecoverEvent = 'none' | 'crouch' | 'grab' | 'seat';

export const newRecover = (): RecoverState => ({ phase: 'walk', t: 0, crouchT: 0, grabbed: false, seated: false });

/** Advance the recover task by `dt`; the event says what the brain must do now. */
export function recoverStep(s: RecoverState, dt: number, i: RecoverInput): RecoverEvent {
  if (s.phase === 'done' || s.phase === 'giveup') return 'none';
  s.t += dt;
  if (!i.present && !s.grabbed) {
    s.phase = 'giveup';
    return 'none';
  }
  if (s.phase === 'walk') {
    if (i.dist <= REACH) {
      s.phase = 'crouch';
      s.crouchT = 0;
      return 'crouch';
    }
    // Stopped short (no way nearer): close enough to reach for it, or give up.
    if (i.stalled) s.phase = i.dist <= REACH * 2 ? 'crouch' : 'giveup';
    else if (s.t > RECOVER_TIMEOUT) s.phase = 'giveup';
    return s.phase === 'crouch' ? 'crouch' : 'none';
  }
  s.crouchT += dt;
  if (!s.grabbed && s.crouchT >= PICKUP_AT) {
    s.grabbed = true;
    return 'grab';
  }
  if (s.grabbed && !s.seated && s.crouchT >= SEAT_AT) {
    s.seated = true;
    return 'seat';
  }
  if (s.crouchT >= PICKUP_TIME) s.phase = 'done';
  return 'none';
}

// ---------------------------------------------------------------- the system

const tmpP = new THREE.Vector3();
const tmpQ = new THREE.Quaternion();
const tmpS = new THREE.Vector3();
const tmpV = new THREE.Vector3();
const tmpC = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

/** Collider and visual offset (object origin to body centre) per kind. */
const SHAPES: Record<LoadKind, { shape: (b: typeof RAPIER) => RAPIER.ColliderDesc; centre: number; kg: number }> = {
  basket: { shape: (R) => R.ColliderDesc.cylinder(0.07, 0.2), centre: 0.07, kg: 2.5 },
  amphora: { shape: (R) => R.ColliderDesc.capsule(0.17, 0.13), centre: 0, kg: 8 },
  sack: { shape: (R) => R.ColliderDesc.cuboid(0.28, 0.13, 0.18), centre: 0, kg: 10 },
  tray: { shape: (R) => R.ColliderDesc.cuboid(0.23, 0.025, 0.15), centre: 0, kg: 2 },
};

export class LooseLoads {
  private readonly loads: LooseLoad[] = [];
  private readonly spilled: (LoosePiece & { born: number; load: LooseLoad | null })[] = [];
  private time = 0;
  /** Loads, bits and stains kept at once (the graphics tier sets them). */
  maxLoads = MAX_LOADS;
  maxPieces = MAX_PIECES;
  private stains: WineStains | null = null;
  constructor(
    private readonly game: Game,
    private readonly rng: () => number = Math.random,
  ) {
    game.looseLoads = this;
    const g = game.settings?.data;
    const tier = (g?.graphics && g.graphics !== 'auto' ? g.graphics : g?.graphicsApplied?.tier) as LoadTier | undefined;
    const b = LOAD_BUDGET[tier ?? 'high'] ?? LOAD_BUDGET.high;
    this.maxLoads = b.loads;
    this.maxPieces = b.pieces;
    this.stainBudget = b.stains;
  }
  private stainBudget: number = LOAD_BUDGET.high.stains;

  get stainCount(): number {
    return this.stains?.count ?? 0;
  }

  get count(): number {
    return this.loads.length;
  }

  get pieceCount(): number {
    return this.spilled.length;
  }

  has(load: LooseLoad | null | undefined): boolean {
    return !!load && this.loads.includes(load);
  }

  /**
   * Take the carrier's load off them: it keeps the world pose it had, flies off with the carrier's
   * velocity plus `kick`, and (with `recover`) the carrier will come for it. Null when they carry
   * nothing that falls.
   */
  detach(npc: Npc, opts: { recover: boolean; kick?: THREE.Vector3Like }): LooseLoad | null {
    const prop = npc.prop;
    const kind = prop?.kind;
    if (!prop || !isDetachable(kind)) return null;
    const obj = prop.object;
    obj.updateWorldMatrix(true, false);
    obj.matrixWorld.decompose(tmpP, tmpQ, tmpS);
    // Contents that spill come off first (their own world poses).
    const spill: THREE.Object3D[] = [];
    if (kind === 'basket' || kind === 'tray') {
      for (const c of [...obj.children]) {
        if ((c as THREE.Mesh).geometry === (kind === 'basket' ? LOAF_GEO() : BUN_GEO())) spill.push(c);
      }
    }
    const spillPoses = spill.map((c) => {
      c.updateWorldMatrix(true, false);
      const p = new THREE.Vector3();
      const q = new THREE.Quaternion();
      c.matrixWorld.decompose(p, q, new THREE.Vector3());
      return { c, p, q };
    });
    // The prop leaves the carrier (its object lives on as the load's visual).
    npc.prop = null;
    const sp = SHAPES[kind];
    const holder = new THREE.Group();
    const centre = tmpC.set(0, sp.centre, 0).multiply(tmpS).applyQuaternion(tmpQ).add(tmpP);
    holder.position.copy(centre);
    holder.quaternion.copy(tmpQ);
    holder.scale.copy(tmpS);
    this.game.scene.add(holder);
    obj.removeFromParent();
    obj.position.set(0, -sp.centre, 0);
    obj.quaternion.identity();
    obj.scale.set(1, 1, 1);
    holder.add(obj);
    const kick = opts.kick ?? { x: 0, y: 0, z: 0 };
    const v = tmpV.set(npc.velocity.x + kick.x, 1.3 + kick.y + this.rng() * 0.8, npc.velocity.z + kick.z);
    const load: LooseLoad = { kind, holder, body: null, owner: opts.recover ? npc : null, pieces: [], born: this.time, state: 'loose', speed: v.length(), landed: false };
    load.body = this.makeBody(centre, tmpQ, v, sp.shape(RAPIER).setMass(sp.kg), 0.5);
    this.loads.push(load);
    if (opts.recover) npc.lostLoad = load;
    for (const { c, p, q } of spillPoses) this.spill(load, c, p, q, v);
    while (this.loads.length > this.maxLoads) this.remove(this.loads[0]);
    return load;
  }

  /**
   * The carrier takes the load into the hand (the brain calls it at the moment the hand closes);
   * `seat` then puts it back where it is carried once they have straightened up.
   */
  collect(load: LooseLoad, npc: Npc): boolean {
    if (!this.has(load) || load.state !== 'loose' || npc.dead) return false;
    npc.prop?.dispose();
    const prop = attachProp(npc.humanoid, load.kind);
    npc.prop = prop;
    // In the hand for now (the socket the prop was made for is kept for `seat`).
    const o = prop.object;
    this.home.set(npc, { parent: o.parent, pos: o.position.clone(), quat: o.quaternion.clone() });
    const hand = npc.humanoid.getSocket('handR');
    if (hand && o.parent) {
      hand.add(o);
      o.position.set(0, 0, 0.1);
      o.quaternion.identity();
    }
    if (npc.lostLoad === load) npc.lostLoad = null;
    this.game.events.emit('sfx', { id: 'item.pickup', position: { x: load.holder.position.x, y: load.holder.position.y, z: load.holder.position.z } });
    this.remove(load);
    return true;
  }

  private readonly home = new WeakMap<Npc, { parent: THREE.Object3D | null; pos: THREE.Vector3; quat: THREE.Quaternion }>();

  /** The load goes from the hand to the head, back or chest it is carried on. */
  seat(npc: Npc) {
    const h = this.home.get(npc);
    const o = npc.prop?.object;
    this.home.delete(npc);
    if (!h || !o || !h.parent) return;
    h.parent.add(o);
    o.position.copy(h.pos);
    o.quaternion.copy(h.quat);
  }

  /** The carrier gave up (or went away): the load stays where it is until its time is up. */
  abandon(load: LooseLoad) {
    if (load.owner?.lostLoad === load) load.owner.lostLoad = null;
    load.owner = null;
  }

  private spill(load: LooseLoad, c: THREE.Object3D, p: THREE.Vector3, q: THREE.Quaternion, v: THREE.Vector3Like) {
    const m = c as THREE.Mesh;
    m.removeFromParent();
    m.position.copy(p);
    m.quaternion.copy(q);
    this.game.scene.add(m);
    const angle = this.rng() * Math.PI * 2;
    const out = 0.8 + this.rng() * 1.2;
    const body = this.makeBody(p, q, { x: v.x + Math.cos(angle) * out, y: v.y * 0.7 + this.rng(), z: v.z + Math.sin(angle) * out }, RAPIER.ColliderDesc.ball(0.05).setMass(0.15), 0.35);
    const piece = { mesh: m, body, born: this.time, load };
    this.spilled.push(piece);
    load.pieces.push(piece);
    while (this.spilled.length > this.maxPieces) this.removePiece(this.spilled[0]);
  }

  private makeBody(at: THREE.Vector3Like, q: THREE.Quaternion, v: THREE.Vector3Like, shape: RAPIER.ColliderDesc, restitution: number): RAPIER.RigidBody | null {
    const physics = this.game.physics;
    try {
      const body = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(at.x, at.y, at.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setLinearDamping(0.2)
          .setAngularDamping(0.6)
          .setCcdEnabled(true),
      );
      physics.world.createCollider(shape.setCollisionGroups(groups(Layer.Debris, Layer.World)).setFriction(0.8).setRestitution(restitution * 0.5), body);
      body.setLinvel({ x: v.x, y: v.y, z: v.z }, true);
      body.setAngvel({ x: (this.rng() - 0.5) * 8, y: (this.rng() - 0.5) * 5, z: (this.rng() - 0.5) * 8 }, true);
      return body;
    } catch (err) {
      console.warn('[loads] no physics for a fallen load', err);
      return null;
    }
  }

  update(dt: number) {
    this.time += dt;
    for (let i = this.loads.length - 1; i >= 0; i--) {
      const l = this.loads[i];
      if (this.time - l.born > LOAD_LIFE) {
        this.remove(l);
        continue;
      }
      const b = l.body;
      if (!b || b.isSleeping() || l.state !== 'loose') continue;
      const t = b.translation();
      const r = b.rotation();
      l.holder.position.set(t.x, t.y, t.z);
      l.holder.quaternion.set(r.x, r.y, r.z, r.w);
      const lv = b.linvel();
      const speed = Math.hypot(lv.x, lv.y, lv.z);
      // An amphora that hits the ground hard enough may break.
      if (l.kind === 'amphora' && breaks(l.speed, speed, this.rng())) this.shatter(l);
      else if (!l.landed && l.speed - speed > 1.5) {
        l.landed = true;
        this.game.events.emit('load:fell', { kind: l.kind, x: t.x, y: t.y, z: t.z, ownerId: l.owner?.id ?? null, broke: false });
        // A thud on the street (a basket, sack or tray; the amphora's own is its crack).
        if (l.kind !== 'amphora') this.game.events.emit('sfx', { id: 'body.fall', position: { x: t.x, y: t.y, z: t.z } });
      }
      l.speed = speed;
    }
    this.stains?.update(dt);
    for (let i = this.spilled.length - 1; i >= 0; i--) {
      const p = this.spilled[i];
      if (this.time - p.born > PIECE_LIFE) {
        this.removePiece(p);
        continue;
      }
      const b = p.body;
      if (!b || b.isSleeping()) continue;
      const t = b.translation();
      const r = b.rotation();
      p.mesh.position.set(t.x, t.y, t.z);
      p.mesh.quaternion.set(r.x, r.y, r.z, r.w);
    }
  }

  /** The amphora breaks where it lies: a shell and shards on the ground, nothing to carry any more. */
  private shatter(l: LooseLoad) {
    const at = l.holder.position;
    const ground = this.game.physics.groundHeight(at.x, at.z, at.y + 0.6, 2) ?? at.y - 0.13;
    if (l.body) this.game.physics.world.removeRigidBody(l.body);
    l.body = null;
    l.state = 'broken';
    l.holder.clear();
    const shell = makeBrokenAmphora();
    shell.position.set(0, 0, 0);
    l.holder.add(shell);
    l.holder.position.set(at.x, ground + this.lift(at.x, at.z) + 0.005, at.z);
    l.holder.quaternion.setFromAxisAngle(UP, this.rng() * Math.PI * 2);
    l.holder.scale.set(1, 1, 1);
    const pos = { x: at.x, y: ground, z: at.z };
    this.game.events.emit('sfx', { id: 'pot.break', position: pos });
    // The wine runs out over the stones.
    this.stain(at.x, ground, at.z);
    this.game.events.emit('sfx', { id: 'wine.splash', position: pos });
    // Bystanders are told once (the load may have been told already on its first bounce).
    this.game.events.emit('load:fell', { kind: l.kind, x: at.x, y: ground, z: at.z, ownerId: l.owner?.id ?? null, broke: true });
    l.landed = true;
    // Nothing left to come back for.
    this.abandon(l);
  }

  /** How far the drawn paving sits above the physics ground at (x, z) (world/city/roads.ts LIFT). */
  private lift(x: number, z: number): number {
    const city = (this.game as unknown as { city?: { coversGround?(x: number, z: number): boolean } }).city;
    return city?.coversGround?.(x, z) ? 0.105 : 0;
  }

  /** A wine stain on the ground (drawn on the paving where the city covers the ground). */
  private stain(x: number, y: number, z: number) {
    if (!this.stains) {
      this.stains = new WineStains(this.game.scene, this.stainBudget);
    }
    this.stains.add(x, y + this.lift(x, z), z, 1.1 + this.rng() * 0.7, this.rng() * Math.PI * 2);
  }

  private remove(l: LooseLoad) {
    const i = this.loads.indexOf(l);
    if (i >= 0) this.loads.splice(i, 1);
    if (l.owner?.lostLoad === l) l.owner.lostLoad = null;
    if (l.body) this.game.physics.world.removeRigidBody(l.body);
    l.body = null;
    for (const p of [...l.pieces]) this.removePiece(p as (typeof this.spilled)[number]);
    // Geometries and materials are shared (props.ts): only the meshes go.
    l.holder.removeFromParent();
  }

  private removePiece(p: (typeof this.spilled)[number]) {
    const i = this.spilled.indexOf(p);
    if (i >= 0) this.spilled.splice(i, 1);
    if (p.load) {
      const k = p.load.pieces.indexOf(p);
      if (k >= 0) p.load.pieces.splice(k, 1);
    }
    if (p.body) this.game.physics.world.removeRigidBody(p.body);
    p.body = null;
    p.mesh.removeFromParent();
  }

  clear() {
    while (this.loads.length) this.remove(this.loads[0]);
    while (this.spilled.length) this.removePiece(this.spilled[0]);
    this.stains?.clear();
  }

  dispose() {
    this.clear();
    this.stains?.dispose();
    this.stains = null;
    if (this.game.looseLoads === this) this.game.looseLoads = undefined;
  }
}
