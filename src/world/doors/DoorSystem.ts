/**
 * `game.doors`: doors that open, close, lock and break (docs/modules/doors.md).
 *
 * A door is a doorway frame in the world (`DoorDef.matrix`: origin at the middle of the threshold
 * in the plane of the leaves, x along the wall, y up, +z into the building) with one or two leaves.
 * The leaves are instances of two shared InstancedMeshes (planks, bronze studs), so a street of
 * doors costs two draw calls; a leaf only gets a new matrix while it swings. A shut door has a box
 * collider across the doorway, removed as it starts to open and put back once it has closed.
 *
 * A door either swings open where it stands, or leads somewhere (`leadsTo`: an interior cell or a
 * callback): then it swings ajar and the player goes through in the fade.
 *
 * Locks (rules.ts): a key opens at once; else the lockpicking minigame (`game.lockpick`) when the
 * player has a `hamulus`; else blows: the player's swings that hit no one land on a locked door in
 * front of them (`combat:swing`) and break its bolt. Picking or forcing a door with an owner is
 * effractio when someone sees (`game.crime`), booked once per door. Unlocked and broken doors are
 * saved under 'doors'; open/shut is not (doors are shut after a load).
 *
 * The city hands over the doors of a block when the block's full detail is built and takes them
 * back when it streams out (`attachGroup` / `detachGroup`); a door's saved state outlives that.
 */
import * as THREE from 'three';
import type RAPIER from '@dimforge/rapier3d-compat';
import type { Game, System } from '../../core/Game';
import { getMaterial } from '../../gfx/materials';
import type { Interactable } from '../../interaction/Interactions';
import type { LockTier } from '../../rpg/thievery';
import { bashDamage, DOOR_HP, isLocked, lockDetail, lockedAction, type DoorLock, type DoorState } from './rules';

export type DoorStyle = 'studded' | 'plank';

export interface DoorDef {
  /** Stable id (saved state is keyed by it): the city uses `<block>:<lot>:<door>`. */
  id: string;
  /** Prompt name: "Stair door", "Gate", "Door". */
  label: string;
  /** World frame of the doorway (see the file comment). */
  matrix: THREE.Matrix4;
  width: number;
  height: number;
  leaves?: 1 | 2;
  style?: DoorStyle;
  lock?: DoorLock;
  /** Whose door it is: picking or forcing it is a crime against them. */
  owner?: { id: string; name: string };
  /** Where it goes. Absent: the door swings open in place (a room behind it in the world). */
  leadsTo?: { interior: string; position: THREE.Vector3Like; heading: number } | ((game: Game) => void);
}

declare module '../../core/Game' {
  interface Game {
    doors?: DoorSystem;
  }
}

declare module '../../core/Events' {
  interface GameEvents {
    'door:opened': { id: string };
    'door:closed': { id: string };
    'door:unlocked': { id: string; how: 'key' | 'pick' | 'force' | 'script' };
  }
}

const OPEN_ANGLE = 1.45; // radians a leaf swings in to
const SWING_S = 0.55; // seconds for a full swing
const AJAR = 0.35; // how far a door that leads somewhere opens before the fade
const THICK = 0.07;
const MAX_LEAVES = 384;

interface Door {
  def: DoorDef;
  group: string;
  slots: number[];
  /** 0 shut … 1 open. */
  open: number;
  target: number;
  collider: RAPIER.Collider | null;
  interactable: Interactable;
  center: THREE.Vector3;
  /** Street side of the door, where the prompt sits. */
  front: THREE.Vector3;
  rotY: number;
  busy: boolean;
}

const m4 = new THREE.Matrix4();
const m4b = new THREE.Matrix4();
const v3 = new THREE.Vector3();
const q = new THREE.Quaternion();
const sc = new THREE.Vector3();

/** A leaf of unit size: vertical planks, two cross battens on the inside, the edge at x = 0..1. */
function leafGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const g = new THREE.BoxGeometry(1 / n - 0.012, 1, 1);
    g.translate((i + 0.5) / n, 0.5, (i % 2) * 0.04);
    parts.push(g);
  }
  for (const y of [0.18, 0.82]) {
    const g = new THREE.BoxGeometry(0.94, 0.07, 0.6);
    g.translate(0.5, y, 0.75);
    parts.push(g);
  }
  return mergeAll(parts);
}

/** Bronze stud bands on the street face (studded doors), and a ring handle. */
function studGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const y of [0.2, 0.5, 0.8]) {
    const g = new THREE.BoxGeometry(0.86, 0.022, 0.5);
    g.translate(0.5, y, -0.7);
    parts.push(g);
  }
  const ring = new THREE.TorusGeometry(0.05, 0.012, 4, 10);
  ring.scale(1, 0.05 / 0.06, 1);
  ring.translate(0.85, 0.45, -0.9);
  parts.push(ring.toNonIndexed());
  return mergeAll(parts.map((p) => (p.index ? p.toNonIndexed() : p)));
}

function mergeAll(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = parts.map((p) => (p.index ? p.toNonIndexed() : p));
  let n = 0;
  for (const p of flat) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3);
  const nor = new Float32Array(n * 3);
  const uv = new Float32Array(n * 2);
  let o = 0;
  for (const p of flat) {
    pos.set(p.attributes.position.array as Float32Array, o * 3);
    nor.set(p.attributes.normal.array as Float32Array, o * 3);
    if (p.attributes.uv) uv.set(p.attributes.uv.array as Float32Array, o * 2);
    o += p.attributes.position.count;
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return g;
}

export class DoorSystem implements System {
  readonly name = 'doors';
  readonly priority = 60;
  private readonly doors = new Map<string, Door>();
  private readonly groups = new Map<string, Set<string>>();
  private readonly states = new Map<string, DoorState>();
  private readonly moving = new Set<Door>();
  private readonly free: number[] = [];
  private readonly leaves: THREE.InstancedMesh;
  private readonly studs: THREE.InstancedMesh;
  private readonly root = new THREE.Group();
  private readonly off: (() => void)[] = [];
  private saveRegistered = false;

  constructor(private readonly game: Game) {
    this.leaves = new THREE.InstancedMesh(leafGeometry(), getMaterial('wood_dark'), MAX_LEAVES);
    this.studs = new THREE.InstancedMesh(studGeometry(), getMaterial('bronze'), MAX_LEAVES);
    for (const im of [this.leaves, this.studs]) {
      im.count = 0;
      im.visible = false;
      im.frustumCulled = false;
      im.castShadow = im === this.leaves;
      im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.root.add(im);
    }
    this.root.name = 'doors';
    for (let i = MAX_LEAVES - 1; i >= 0; i--) this.free.push(i);
    game.scene.add(this.root);
    const ev = game.events;
    this.off.push(
      ev.on('combat:swing', (e) => {
        if (e.attackerId === 'player' && e.hits === 0) this.bash(e.power, e.reach);
      }),
      ev.on('save:loaded', () => {
        for (const d of this.doors.values()) this.snap(d, 0);
      }),
    );
  }

  /** The save part registers once the save system exists (the doors are installed before it). */
  private registerSave() {
    this.saveRegistered = true;
    this.game.save.register('doors', {
      save: () => Object.fromEntries([...this.states].filter(([, s]) => s.unlocked || s.broken || s.booked)),
      load: (data) => {
        this.states.clear();
        if (data && typeof data === 'object') for (const [k, v] of Object.entries(data as Record<string, DoorState>)) if (v && typeof v === 'object') this.states.set(k, { ...v });
      },
      reset: () => this.states.clear(),
    });
  }

  // ------------------------------------------------------------------ registry

  /** Add a door (replacing one with the same id). `group` lets a builder take its doors back at once. */
  add(def: DoorDef, group = 'world'): void {
    if (this.doors.has(def.id)) this.remove(def.id);
    const n = def.leaves ?? (def.width > 1.3 ? 2 : 1);
    if (this.free.length < n) {
      console.warn(`[doors] no room for door ${def.id}`);
      return;
    }
    const slots: number[] = [];
    for (let i = 0; i < n; i++) slots.push(this.free.pop()!);
    const center = new THREE.Vector3(0, def.height / 2, 0).applyMatrix4(def.matrix);
    const front = new THREE.Vector3(0, Math.min(1.25, def.height * 0.5), -0.35).applyMatrix4(def.matrix);
    def.matrix.decompose(v3, q, sc);
    const rotY = new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
    const door: Door = { def, group, slots, open: 0, target: 0, collider: null, center, front, rotY, busy: false, interactable: null as unknown as Interactable };
    door.interactable = this.makeInteractable(door);
    this.doors.set(def.id, door);
    let g = this.groups.get(group);
    if (!g) this.groups.set(group, (g = new Set()));
    g.add(def.id);
    this.game.interactions?.add(door.interactable);
    this.snap(door, 0);
    this.refreshCounts();
  }

  remove(id: string): void {
    const d = this.doors.get(id);
    if (!d) return;
    this.doors.delete(id);
    this.groups.get(d.group)?.delete(id);
    this.moving.delete(d);
    if (d.collider) this.game.physics.removeCollider(d.collider);
    d.collider = null;
    this.game.interactions?.remove(d.interactable);
    for (const s of d.slots) {
      m4.makeScale(0, 0, 0);
      this.leaves.setMatrixAt(s, m4);
      this.studs.setMatrixAt(s, m4);
      this.free.push(s);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    this.studs.instanceMatrix.needsUpdate = true;
    this.refreshCounts();
  }

  /** Add a builder's doors as one group (a city block's full detail). */
  attachGroup(group: string, defs: readonly DoorDef[]): void {
    this.detachGroup(group);
    for (const d of defs) this.add(d, group);
  }

  detachGroup(group: string): void {
    const g = this.groups.get(group);
    if (!g) return;
    for (const id of [...g]) this.remove(id);
    this.groups.delete(group);
  }

  get(id: string): DoorDef | undefined {
    return this.doors.get(id)?.def;
  }

  count(): number {
    return this.doors.size;
  }

  state(id: string): DoorState {
    return this.states.get(id) ?? {};
  }

  private setState(id: string, patch: Partial<DoorState>) {
    this.states.set(id, { ...this.states.get(id), ...patch });
  }

  locked(id: string): boolean {
    const d = this.doors.get(id);
    return !!d && isLocked(d.def.lock, this.states.get(id), this.hour());
  }

  isOpen(id: string): boolean {
    const d = this.doors.get(id);
    return !!d && d.target > 0;
  }

  /** Unlock for good (a quest hands over a key, a script opens it). */
  unlock(id: string, how: 'key' | 'pick' | 'force' | 'script' = 'script'): void {
    this.setState(id, { unlocked: true });
    this.game.events.emit('door:unlocked', { id, how });
  }

  /** Swing a door open (no lock check: callers check). */
  open(id: string): void {
    const d = this.doors.get(id);
    if (!d || d.target === 1) return;
    this.swing(d, 1);
  }

  close(id: string): void {
    const d = this.doors.get(id);
    if (!d || d.target === 0) return;
    // Never shut a door on someone standing in it.
    if (this.blocked(d)) return;
    this.swing(d, 0);
  }

  // ------------------------------------------------------------------ the player at a door

  private hour(): number {
    return this.game.time?.hour ?? 10;
  }

  private picks(): number {
    return this.game.lockpick?.picks ?? 0;
  }

  private canPick(): boolean {
    const shipped = this.game.player?.sheet?.shippedSystems;
    return !!this.game.lockpick && (!shipped || shipped.has('lockpicking'));
  }

  private hasKey(d: Door): boolean {
    const k = d.def.lock?.key;
    return !!k && !!this.game.player?.inventory?.has(k);
  }

  private makeInteractable(d: Door): Interactable {
    const sys = this;
    return {
      id: `door:${d.def.id}`,
      reach: 2.4,
      position: () => (d.target > 0 ? d.center : d.front),
      verb() {
        if (d.target > 0 && !d.def.leadsTo) return 'Close';
        if (!sys.locked(d.def.id)) return d.def.leadsTo ? 'Enter' : 'Open';
        const a = lockedAction(d.def.lock!, { key: sys.hasKey(d), picks: sys.picks(), canPick: sys.canPick() });
        return a === 'key' ? 'Unlock' : a === 'pick' ? 'Pick the lock' : 'Open';
      },
      label: () => d.def.label,
      detail() {
        const locked = sys.locked(d.def.id);
        const base = lockDetail(d.def.lock, locked);
        if (!base || d.def.lock?.barred) return base;
        if (sys.hasKey(d)) return `${base} · you have the key`;
        const n = sys.picks();
        return sys.canPick() ? `${base} · ${n} lockpick${n === 1 ? '' : 's'}` : base;
      },
      illegal: () => !!d.def.owner && sys.locked(d.def.id),
      interact: () => void sys.use(d),
    };
  }

  private notify(text: string) {
    this.game.events.emit('rpg:notify', { text, kind: 'info' });
  }

  private sfx(id: string, at: THREE.Vector3) {
    this.game.events.emit('sfx', { id, position: at });
  }

  private async use(d: Door) {
    if (d.busy) return;
    const id = d.def.id;
    if (d.target > 0 && !d.def.leadsTo) {
      this.close(id);
      return;
    }
    if (this.locked(id)) {
      const lock = d.def.lock!;
      const a = lockedAction(lock, { key: this.hasKey(d), picks: this.picks(), canPick: this.canPick() });
      if (a === 'none') {
        if (lock.barred) this.notify('Barred from the other side.');
        else if (lock.openHours) {
          const h = this.hour(), at = `${String(lock.openHours[0]).padStart(2, '0')}:00`;
          // (shut for the night, or not open yet today: a tenant out at work)
          this.notify(h >= 19 || h < 5 ? `Locked for the night. It opens at ${at}.` : `Locked. It opens at ${at}.`);
        }
        else this.notify(lock.key ? 'Locked. It needs its key, a lockpick, or a few heavy blows.' : 'Locked. A lockpick would open it, or a few heavy blows.');
        this.sfx('lock.turn', d.front);
        return;
      }
      if (a === 'key') {
        this.unlock(id, 'key');
        this.sfx('lock.open', d.front);
      } else {
        d.busy = true;
        try {
          if (this.picks() > 0) this.book(d);
          const r = await this.game.lockpick!.start({ tier: lock.tier as LockTier, label: d.def.label });
          if (r !== 'opened') return;
          this.unlock(id, 'pick');
        } finally {
          d.busy = false;
        }
      }
    }
    this.pass(d);
  }

  /** Open the door, and go through if it leads somewhere. */
  private pass(d: Door) {
    const to = d.def.leadsTo;
    if (!to) {
      this.swing(d, 1);
      return;
    }
    d.busy = true;
    this.swing(d, AJAR);
    window.setTimeout(() => {
      d.busy = false;
      if (typeof to === 'function') to(this.game);
      else void this.game.interiors?.enter(to.interior, new THREE.Vector3(to.position.x, to.position.y, to.position.z), to.heading);
      // Shut behind the player once they are through (the fade hides it).
      window.setTimeout(() => this.doors.get(d.def.id) === d && this.swing(d, 0), 900);
    }, 260);
  }

  /** effractio against the door's owner when someone sees, once per door. */
  private book(d: Door) {
    const owner = d.def.owner;
    if (!owner || this.states.get(d.def.id)?.booked) return;
    this.setState(d.def.id, { booked: true });
    const pop = (this.game as unknown as { population?: { witnesses?(p: THREE.Vector3Like, r?: number): string[] } }).population;
    let witnesses: string[] = [];
    try {
      witnesses = pop?.witnesses?.(d.front, 20) ?? [];
    } catch {
      witnesses = [];
    }
    (this.game as unknown as { crime?: { commit(id: string, o: { witnessed: string[]; victimId?: string }): void } }).crime?.commit('effractio', { witnessed: witnesses, victimId: owner.id });
  }

  /** A swing that hit no one: the locked door in front of the player takes the blow. */
  private bash(power: boolean, reach: number) {
    const p = this.game.player;
    if (!p) return;
    const fx = Math.sin(p.heading), fz = Math.cos(p.heading);
    let best: Door | null = null;
    let bestD = reach + 0.9;
    for (const d of this.doors.values()) {
      if (d.target > 0 || d.def.lock?.barred || !this.locked(d.def.id)) continue;
      const dx = d.center.x - p.position.x, dz = d.center.z - p.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bestD || Math.abs(d.center.y - (p.position.y + 1)) > 2) continue;
      if ((dx * fx + dz * fz) / Math.max(dist, 1e-3) < 0.45) continue;
      best = d;
      bestD = dist;
    }
    if (!best) return;
    const id = best.def.id;
    const tier = best.def.lock!.tier as LockTier;
    const dmg = (this.states.get(id)?.damage ?? 0) + bashDamage(power);
    this.book(best);
    this.sfx('arrow.impact.wood', best.center);
    if (dmg < DOOR_HP[tier]) {
      this.setState(id, { damage: dmg });
      this.kick(best);
      return;
    }
    this.setState(id, { damage: dmg, broken: true });
    this.sfx('lock.break', best.center);
    this.game.events.emit('door:unlocked', { id, how: 'force' });
    this.notify('The bolt gives.');
    if (!best.def.leadsTo) this.swing(best, 1);
  }

  /** A shudder on a blow that did not break the bolt. */
  private kick(d: Door) {
    d.open = 0.03;
    d.target = 0;
    this.moving.add(d);
  }

  // ------------------------------------------------------------------ motion and colliders

  private swing(d: Door, target: number) {
    d.target = target;
    if (target > 0 && d.collider) {
      this.game.physics.removeCollider(d.collider);
      d.collider = null;
    }
    this.sfx(target > 0 ? 'door.open' : 'door.close', d.center);
    this.game.events.emit(target > 0 ? 'door:opened' : 'door:closed', { id: d.def.id });
    this.moving.add(d);
  }

  /** Is the player in the doorway (shutting it would trap them in the collider)? */
  private blocked(d: Door): boolean {
    const p = this.game.player?.position;
    if (!p) return false;
    m4.copy(d.def.matrix).invert();
    v3.set(p.x, p.y, p.z).applyMatrix4(m4);
    return Math.abs(v3.x) < d.def.width / 2 + 0.4 && v3.z > -0.5 && v3.z < d.def.width * 0.8 + 0.4 && v3.y > -1 && v3.y < d.def.height;
  }

  private snap(d: Door, open: number) {
    d.open = d.target = open;
    this.moving.delete(d);
    this.place(d);
    this.syncCollider(d);
  }

  private syncCollider(d: Door) {
    const shut = d.target === 0 && d.open === 0;
    if (shut && !d.collider) {
      d.collider = this.game.physics.addBox(d.center, { x: d.def.width / 2, y: d.def.height / 2, z: 0.08 }, d.rotY);
    } else if (!shut && d.collider) {
      this.game.physics.removeCollider(d.collider);
      d.collider = null;
    }
  }

  /** Write the leaves' matrices for the door's current opening. */
  private place(d: Door) {
    const { width: w, height: h } = d.def;
    const n = d.slots.length;
    const lw = w / n - 0.012;
    const phi = d.open * OPEN_ANGLE;
    const studded = (d.def.style ?? 'studded') === 'studded';
    for (let i = 0; i < n; i++) {
      // One leaf hangs on the left jamb; a pair on both. `side` is the hinge's side (−1 left).
      const side = n === 1 ? -1 : i === 0 ? -1 : 1;
      const hx = side * (w / 2 - 0.006);
      m4.copy(d.def.matrix)
        .multiply(m4b.makeTranslation(hx, 0.004, 0))
        .multiply(m4b.makeRotationY(side * phi))
        // Unit leaf: x 0..1 from the hinge (mirrored for a right-hand leaf), y 0..1, z ±0.5.
        .multiply(m4b.makeScale(-side * lw, h - 0.012, THICK));
      this.leaves.setMatrixAt(d.slots[i], m4);
      if (studded) this.studs.setMatrixAt(d.slots[i], m4);
      else this.studs.setMatrixAt(d.slots[i], m4b.makeScale(0, 0, 0));
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    this.studs.instanceMatrix.needsUpdate = true;
  }

  private refreshCounts() {
    // Instances are drawn up to the highest slot in use (slots are recycled from the free list).
    let hi = 0;
    for (const d of this.doors.values()) for (const s of d.slots) hi = Math.max(hi, s + 1);
    this.leaves.count = this.studs.count = hi;
    this.leaves.visible = this.studs.visible = hi > 0;
  }

  update(dt: number) {
    if (!this.saveRegistered && this.game.save) this.registerSave();
    if (!this.moving.size) return;
    const step = dt / SWING_S;
    for (const d of this.moving) {
      const before = d.open;
      d.open = d.target > d.open ? Math.min(d.target, d.open + step) : Math.max(d.target, d.open - step);
      if (d.open !== before) this.place(d);
      if (d.open === d.target) {
        this.moving.delete(d);
        this.syncCollider(d);
      }
    }
    this.game.invalidate?.();
  }

  dispose() {
    for (const id of [...this.doors.keys()]) this.remove(id);
    for (const f of this.off) f();
    this.root.removeFromParent();
    this.leaves.geometry.dispose();
    this.studs.geometry.dispose();
    this.leaves.dispose();
    this.studs.dispose();
  }
}
