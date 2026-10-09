/**
 * Gore (the combat module): every blow that draws blood sprays it, and leaves splats on the ground;
 * a killing cut takes off the head or a limb (gore/limbs.ts decides which), which tumbles away with
 * physics while both stumps spurt; the dead bleed out into a spreading pool.
 *
 * Settings → Gameplay → Gore: 'ultra' (default: every killing cut severs something, power attacks
 * often two things, buckets of blood), 'normal' (fewer severings, less blood) or 'off'.
 *
 *   const gore = game.addSystem(new GoreSystem(game, combat));   // installCombat does this
 *   gore.blood.burst(at, dir, 60);                                 // any module can spill blood
 */
import * as THREE from 'three';
import { HumanoidAvatar } from '../../actors/avatar/HumanoidAvatar';
import type { Game, System } from '../../core/Game';
import { Layer, RAPIER, groups } from '../../core/Physics';
import type { Combatant } from '../Combatant';
import type { CombatCore } from '../CombatCore';
import { BloodFx } from './blood';
import { sever, type SeveredPiece } from './dismember';
import { chooseParts, dropletsFor, type GoreLevel, type Part } from './limbs';

declare module '../../core/Settings' {
  interface SettingsData {
    /** How much blood and dismemberment: 'off', 'normal' or 'ultra' (default). */
    gore?: GoreLevel;
  }
}

/** Severed pieces kept in the world at once (the oldest go first) and how long (s). */
const MAX_PIECES = 36;
const PIECE_LIFE = 240;

interface Piece {
  piece: SeveredPiece;
  body: RAPIER.RigidBody | null;
  born: number;
}

const tmp = new THREE.Vector3();
const dir = new THREE.Vector3();

export class GoreSystem implements System {
  readonly name = 'gore';
  /** After combat (20): blows of this step are in. */
  readonly priority = 22;
  readonly blood: BloodFx;
  private readonly pieces: Piece[] = [];
  private readonly severed = new Map<string, Set<Part>>();
  private readonly pooled = new Set<string>();
  private readonly pendingPools: { id: string; at: number; size: number }[] = [];
  private time = 0;
  private readonly offs: (() => void)[] = [];

  constructor(
    private readonly game: Game,
    private readonly core: CombatCore,
    private readonly rng: () => number = Math.random,
  ) {
    // The city's paving is drawn up to 10 cm above the terrain collider (world/city/roads.ts LIFT).
    const city = () => (game as unknown as { city?: { coversGround?(x: number, z: number): boolean } }).city;
    this.blood = new BloodFx(game.physics, rng, (x, z) => (city()?.coversGround?.(x, z) ? 0.105 : 0));
    game.scene.add(this.blood.group);
    const ev = game.events;
    this.offs.push(
      ev.on('combat:hit', (e) => this.onHit(e)),
      ev.on('actor:killed', (e) => {
        if (e.tags?.includes('dead')) this.schedulePool(e.victimId, 0.9);
      }),
      ev.on('combat:swing', (e) => this.onSwing(e)),
      ev.on('save:loaded', () => this.clear()),
    );
  }

  get level(): GoreLevel {
    return this.game.settings.data.gore ?? 'ultra';
  }

  private onHit(e: { attackerId: string; targetId: string; damage: number; blocked: boolean; parried: boolean; power: boolean; kind?: string }) {
    const level = this.level;
    if (level === 'off' || e.blocked || e.parried || !(e.damage > 0)) return;
    const def = this.core.get(e.targetId);
    const att = this.core.get(e.attackerId);
    if (!def || !att) return;
    const w = att.weapon;
    const blunt = w.class === 'blunt' || w.class === 'unarmed' || w.damageType === 'blunt';
    const s = def.body.height / 1.8;
    // Out of the far side of the wound, along the blow.
    dir.set(def.position.x - att.position.x, 0, def.position.z - att.position.z);
    if (dir.lengthSq() < 1e-6) dir.set(Math.sin(att.heading), 0, Math.cos(att.heading));
    dir.normalize();
    tmp.set(def.position.x - dir.x * 0.12, def.position.y + 1.25 * s, def.position.z - dir.z * 0.12);
    dir.y = 0.35;
    const n = dropletsFor(e.damage, blunt, level);
    const ground = this.blood.groundBelow(def.position.x, def.position.y + 0.5, def.position.z);
    this.blood.burst(tmp, dir, n, e.power ? 4.4 : 3.2, 0.5, level === 'ultra' ? 0.3 : 0.18, ground.y);
    // A splat or two on the ground behind the victim.
    const splats = level === 'ultra' ? (e.power ? 3 : 2) : 1;
    for (let i = 0; i < splats; i++) {
      const d = 0.4 + this.rng() * (e.power ? 1.6 : 1);
      this.blood.splat(def.position.x + dir.x * d + (this.rng() - 0.5) * 0.4, def.position.y + 0.3, def.position.z + dir.z * d + (this.rng() - 0.5) * 0.4, (blunt ? 0.25 : 0.35) + this.rng() * 0.35);
    }
    // The killing blow (combat reports the hit after the death); an arrow severs nothing.
    if (def.status === 'dead' && !def.isPlayer && e.kind !== 'arrow') this.killingBlow(def, att, e.power, level);
  }

  private killingBlow(def: Combatant, att: Combatant, power: boolean, level: GoreLevel) {
    const actor = this.game.actors?.get(def.id);
    const avatar = actor?.avatar;
    if (!(avatar instanceof HumanoidAvatar)) return;
    const severed = this.severed.get(def.id) ?? new Set<Part>();
    const parts = chooseParts({ blade: att.weapon.class === 'blade', power, direction: att.action?.direction, rng: this.rng }, level, severed);
    for (const part of parts) {
      const piece = sever(avatar, part);
      if (!piece) continue;
      severed.add(part);
      this.launch(piece, part, def, att, power);
      // The stump on the body pumps for a while; the piece dribbles.
      this.blood.spurt(piece.bodyStump, level === 'ultra' ? 8 : 4, level === 'ultra' ? 340 : 180, part === 'head' ? 3.1 : 2.6);
      this.blood.spurt(piece.pieceStump, 2.5, 120, 1.6);
      piece.bodyStump.updateWorldMatrix(true, false);
      tmp.setFromMatrixPosition(piece.bodyStump.matrixWorld);
      dir.set(0, 1, 0).transformDirection(piece.bodyStump.matrixWorld);
      this.blood.burst(tmp, dir, level === 'ultra' ? 160 : 70, 4.5, 0.4, 0.3);
    }
    if (severed.size) this.severed.set(def.id, severed);
    this.schedulePool(def.id, 0.6, parts.length ? 2.6 : 1.8);
  }

  /**
   * A swing that struck nobody alive can still land on a body in reach: a blade takes another part
   * off it (always on ultra, half the time on normal), any weapon spills more blood.
   */
  private onSwing(e: { attackerId: string; power: boolean; hits: number; reach: number }) {
    const level = this.level;
    if (level === 'off' || e.hits > 0) return;
    const att = this.core.get(e.attackerId);
    if (!att) return;
    let best: Combatant | null = null;
    let bd = e.reach + 0.75;
    for (const o of this.core.list) {
      if (o.status !== 'dead' || o === att) continue;
      const dx = o.position.x - att.position.x;
      const dz = o.position.z - att.position.z;
      const d = Math.hypot(dx, dz);
      if (d >= bd) continue;
      let a = Math.atan2(dx, dz) - att.heading;
      a = Math.atan2(Math.sin(a), Math.cos(a));
      if (Math.abs(a) > 1.2) continue;
      best = o;
      bd = d;
    }
    if (!best) return;
    tmp.set(best.position.x, best.position.y + 0.25, best.position.z);
    dir.set(best.position.x - att.position.x, 0.6, best.position.z - att.position.z).normalize();
    this.blood.burst(tmp, dir, level === 'ultra' ? 90 : 35, 2.6, 0.7, 0.3);
    this.game.events.emit('sfx', { id: 'hit.flesh', position: { x: tmp.x, y: tmp.y, z: tmp.z } });
    if (att.weapon.class !== 'blade' || (level === 'normal' && this.rng() < 0.5)) return;
    const gone = this.severed.get(best.id) ?? new Set<Part>();
    const options = (['head', 'armL', 'armR', 'forearmL', 'forearmR', 'legL', 'legR', 'shinL', 'shinR'] as Part[]).filter((p) => !gone.has(p) && !chooseBlocked(p, gone));
    if (!options.length) return;
    this.dismember(best.id, options[Math.floor(this.rng() * options.length)], { from: att.id, power: e.power });
  }

  /**
   * Take `part` off someone now (dev scenes, scripted executions): the piece flies off away from
   * `from` (default the player) and both stumps bleed. Returns whether anything came off.
   */
  dismember(id: string, part: Part, opts: { from?: string; power?: boolean } = {}): boolean {
    const def = this.core.get(id);
    const att = this.core.get(opts.from ?? this.game.player?.id ?? 'player');
    const avatar = this.game.actors?.get(id)?.avatar;
    if (!def || !att || !(avatar instanceof HumanoidAvatar)) return false;
    const piece = sever(avatar, part);
    if (!piece) return false;
    const severed = this.severed.get(id) ?? new Set<Part>();
    severed.add(part);
    this.severed.set(id, severed);
    this.launch(piece, part, def, att, opts.power ?? true);
    this.blood.spurt(piece.bodyStump, 6, 300, 2.6);
    this.blood.spurt(piece.pieceStump, 2.5, 120, 1.6);
    return true;
  }

  /** Throw the piece: off the body along the blow, up a little, spinning. */
  private launch(piece: SeveredPiece, part: Part, def: Combatant, att: Combatant, power: boolean) {
    this.game.scene.add(piece.group);
    const g = piece.group;
    const physics = this.game.physics;
    let body: RAPIER.RigidBody | null = null;
    try {
      const h = piece.half;
      body = physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(g.position.x, g.position.y, g.position.z)
          .setLinearDamping(0.25)
          .setAngularDamping(0.5)
          .setCcdEnabled(true),
      );
      physics.world.createCollider(
        RAPIER.ColliderDesc.cuboid(Math.max(0.04, h.x * 0.8), Math.max(0.04, h.y * 0.8), Math.max(0.04, h.z * 0.8))
          .setCollisionGroups(groups(Layer.Debris, Layer.World))
          .setDensity(part === 'head' ? 1100 : 1000)
          .setFriction(0.9)
          .setRestitution(0.15),
        body,
      );
      dir.set(def.position.x - att.position.x, 0, def.position.z - att.position.z);
      if (dir.lengthSq() < 1e-6) dir.set(Math.sin(att.heading), 0, Math.cos(att.heading));
      dir.normalize();
      const speed = (power ? 3.4 : 2.2) * (part === 'head' ? 1.3 : 1);
      const up = part === 'head' ? 2.6 : 1.6;
      body.setLinvel({ x: dir.x * speed + (this.rng() - 0.5), y: up + this.rng(), z: dir.z * speed + (this.rng() - 0.5) }, true);
      body.setAngvel({ x: (this.rng() - 0.5) * 14, y: (this.rng() - 0.5) * 8, z: (this.rng() - 0.5) * 14 }, true);
    } catch (err) {
      console.warn('[gore] no physics for a severed piece', err);
      body = null;
    }
    this.pieces.push({ piece, body, born: this.time });
    while (this.pieces.length > MAX_PIECES) this.remove(this.pieces[0]);
  }

  private schedulePool(id: string, delay: number, size = 1.8) {
    if (this.level === 'off' || this.pooled.has(id)) return;
    this.pooled.add(id);
    this.pendingPools.push({ id, at: this.time + delay, size: this.level === 'ultra' ? size * 1.25 : size });
  }

  update(dt: number) {
    this.time += dt;
    for (let i = this.pendingPools.length - 1; i >= 0; i--) {
      const p = this.pendingPools[i];
      if (this.time < p.at) continue;
      this.pendingPools.splice(i, 1);
      const c = this.core.get(p.id);
      const a = c ? c.position : this.game.actors?.get(p.id)?.position;
      if (a) this.blood.pool(a.x, a.y + 0.3, a.z, p.size, 9);
    }
    for (let i = this.pieces.length - 1; i >= 0; i--) {
      const pc = this.pieces[i];
      if (this.time - pc.born > PIECE_LIFE) {
        this.remove(pc);
        continue;
      }
      // A body at rest sleeps (free in the physics step); removing one walks every collider, so it
      // stays until the piece goes.
      const b = pc.body;
      if (!b || b.isSleeping()) continue;
      const t = b.translation();
      const r = b.rotation();
      pc.piece.group.position.set(t.x, t.y, t.z);
      pc.piece.group.quaternion.set(r.x, r.y, r.z, r.w);
    }
    this.blood.update(dt);
  }

  private remove(pc: Piece) {
    const i = this.pieces.indexOf(pc);
    if (i >= 0) this.pieces.splice(i, 1);
    if (pc.body) this.game.physics.world.removeRigidBody(pc.body);
    this.blood.forget(pc.piece.pieceStump);
    pc.piece.group.removeFromParent();
    pc.piece.group.traverse((o) => {
      const m = o as THREE.Mesh;
      // Stump caps share their geometry; the baked piece and equipment copies own theirs.
      if (m.isMesh && m.parent?.name !== 'gore:stump') m.geometry.dispose();
    });
  }

  /** Severed pieces lying about (tests, debug). */
  get pieceCount(): number {
    return this.pieces.length;
  }

  clear() {
    while (this.pieces.length) this.remove(this.pieces[0]);
    this.blood.clear();
    this.severed.clear();
    this.pooled.clear();
    this.pendingPools.length = 0;
  }

  dispose() {
    this.clear();
    for (const off of this.offs) off();
    this.blood.dispose();
  }
}

/** An arm or leg already gone at the shoulder or hip leaves nothing below it to cut (and vice versa). */
function chooseBlocked(p: Part, gone: ReadonlySet<Part>): boolean {
  const side = p.slice(-1);
  if (p.startsWith('arm') || p.startsWith('forearm')) return gone.has(`arm${side}` as Part) || gone.has(`forearm${side}` as Part);
  if (p.startsWith('leg') || p.startsWith('shin')) return gone.has(`leg${side}` as Part) || gone.has(`shin${side}` as Part);
  return false;
}
