/**
 * What a humanoid carries: weapon, shield, scabbard, torch, net and small props, attached to the
 * avatar's sockets. Meshes share cached geometry and the single avatar material, so a carried
 * item costs one draw call. Sheathed swords hide in a scabbard mesh at the hip (one mesh, not two).
 */
import * as THREE from 'three';
import type { Stance } from '../Actor';
import type { Appearance, ShieldModel, WeaponModel } from '../appearance';
import { avatarMaterial, flameMaterial, syncFlameClock } from '../avatar/material';
import { BOW, arrowGeometry, createBowString, flameGeometry, propGeometry, setBowString, weaponGeometry, type PropModel } from './weapons';
import { shieldGeometry, shieldSize } from './shields';
import type { HumanoidAvatar } from '../avatar/HumanoidAvatar';
import type { GripSpec } from '../avatar/anim/armIK';

export type SheathLocation = 'hipR' | 'hipL' | 'back' | 'fists';

export interface WeaponInfo {
  /** Stance without / with a shield. */
  stance: Stance;
  stanceShield: Stance;
  /** Where it lives when not drawn: a scabbard, the back, the belt, or still in hand. */
  sheath: 'scabbard' | 'back' | 'belt' | 'hand';
  scabbard?: 'scabbard-gladius' | 'scabbard-spatha';
  /** Degrees the weapon leans from perpendicular toward the fingertips (swords sit diagonally in the palm). */
  gripTilt?: number;
}

export const WEAPON_INFO: Record<WeaponModel, WeaponInfo> = {
  gladius: { stance: 'oneHand', stanceShield: 'oneHandShield', sheath: 'scabbard', scabbard: 'scabbard-gladius', gripTilt: 25 },
  spatha: { stance: 'oneHand', stanceShield: 'oneHandShield', sheath: 'scabbard', scabbard: 'scabbard-spatha', gripTilt: 25 },
  pugio: { stance: 'oneHand', stanceShield: 'oneHandShield', sheath: 'belt', gripTilt: 20 },
  sica: { stance: 'oneHand', stanceShield: 'oneHandShield', sheath: 'belt', gripTilt: 25 },
  hasta: { stance: 'spear', stanceShield: 'spearShield', sheath: 'hand', gripTilt: 30 },
  pilum: { stance: 'spear', stanceShield: 'spearShield', sheath: 'hand', gripTilt: 30 },
  trident: { stance: 'spear', stanceShield: 'spearShield', sheath: 'hand', gripTilt: 30 },
  fustis: { stance: 'oneHand', stanceShield: 'oneHandShield', sheath: 'belt', gripTilt: 18 },
  net: { stance: 'unarmed', stanceShield: 'unarmed', sheath: 'hand' },
  bow: { stance: 'bow', stanceShield: 'bow', sheath: 'back' },
  sling: { stance: 'unarmed', stanceShield: 'unarmed', sheath: 'belt' },
  axe: { stance: 'twoHand', stanceShield: 'twoHand', sheath: 'belt' },
  hammer: { stance: 'oneHand', stanceShield: 'oneHandShield', sheath: 'belt', gripTilt: 12 },
  torch: { stance: 'oneHand', stanceShield: 'oneHandShield', sheath: 'hand' },
  none: { stance: 'unarmed', stanceShield: 'unarmed', sheath: 'hand' },
};

export interface EquipmentOptions {
  weapon: WeaponModel;
  shield: ShieldModel;
  shieldColor?: string;
  emblem?: string;
  appearance?: Appearance;
}

/** What the off (left) hand can be busy with besides a shield. */
export type OffHand = 'torch' | 'net';

/** Right-hand grip position in the hand bone frame (matches the gripR socket, reference meters). */
const GRIP_R: [number, number, number] = [0.026, -0.08, 0.002];
/** Seconds a shield or bow takes to swing between the back and the hand after the grab frame. */
const SWING_TIME = 0.2;
const UP = new THREE.Vector3(0, 1, 0);
const IDENTITY_Q = new THREE.Quaternion();
const _m = new THREE.Matrix4();
const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _s = new THREE.Vector3();

/** A carried item swinging from where it was to its new socket (local offset decaying to zero). */
interface Swing {
  m: THREE.Object3D;
  t: number;
  p0: THREE.Vector3;
  q0: THREE.Quaternion;
  bp: THREE.Vector3;
  bq: THREE.Quaternion;
}

export class Equipment {
  weapon: WeaponModel;
  shield: ShieldModel;
  private weaponMesh: THREE.Mesh | null = null;
  private shieldMesh: THREE.Mesh | null = null;
  private scabbardEmpty: THREE.Mesh | null = null;
  private scabbardFull: THREE.Mesh | null = null;
  private netMesh: THREE.Mesh | null = null;
  private torchMesh: THREE.Mesh | null = null;
  private flame: THREE.Mesh | null = null;
  private propMesh: THREE.Mesh | null = null;
  private loopProp: THREE.Mesh | null = null;
  private bowString: THREE.Mesh | null = null;
  private arrow: THREE.Mesh | null = null;
  private bowDraw = 0;
  private stringBent = false;
  private readonly nock = new THREE.Vector3(0, 0, BOW.stringZ);
  private swings: Swing[] = [];
  private visualDrawn = false;
  private torchOn = false;
  private fp = false;
  private shieldColor?: string;
  private emblem?: string;

  constructor(
    private readonly avatar: HumanoidAvatar,
    opts: EquipmentOptions,
  ) {
    this.weapon = opts.weapon;
    this.shield = opts.shield;
    this.shieldColor = opts.shieldColor;
    this.emblem = opts.emblem;
    this.rebuild();
    this.refreshAppearance(opts.appearance);
  }

  /** Appearance-dependent extras (after construction or HumanoidAvatar.setAppearance). */
  refreshAppearance(a: Appearance | undefined = this.avatar.appearance) {
    // Retiarius: the net rides in the off hand whenever a trident is carried without a shield.
    this.setNet(this.weapon === 'trident' && this.shield === 'none' && a?.armor?.manica === 'left');
    // The scabbard side depends on the kit (military or not).
    this.place();
  }

  private mesh(geo: THREE.BufferGeometry | null, name: string): THREE.Mesh | null {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, avatarMaterial());
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private makeFlame(): THREE.Mesh {
    const f = new THREE.Mesh(flameGeometry(), flameMaterial());
    f.name = 'torch:flame';
    f.position.set(0, 0.4, 0);
    f.renderOrder = 2;
    // The flame is built in world axes in its shader, so its local bounds are not reliable.
    f.frustumCulled = false;
    f.onBeforeRender = () => syncFlameClock();
    return f;
  }

  private rebuild() {
    for (const m of [this.weaponMesh, this.shieldMesh, this.scabbardEmpty, this.scabbardFull]) m?.removeFromParent();
    this.swings.length = 0;
    this.bowString?.geometry.dispose();
    this.bowString = null;
    this.arrow = null;
    this.weaponMesh = this.mesh(weaponGeometry(this.weapon), `weapon:${this.weapon}`);
    this.shieldMesh = this.mesh(shieldGeometry(this.shield, this.shieldColor, this.emblem), `shield:${this.shield}`);
    const info = WEAPON_INFO[this.weapon];
    this.scabbardEmpty = null;
    this.scabbardFull = null;
    if (info.scabbard) {
      this.scabbardEmpty = this.mesh(propGeometry(info.scabbard), 'scabbard');
      // A sheathed sword shows as the scabbard with the hilt on top: one mesh, two parts.
      const full = mergeHilt(info.scabbard, this.weapon);
      this.scabbardFull = this.mesh(full, 'scabbard:full');
    }
    if (this.weaponMesh && this.weapon === 'bow') {
      // A live string (drawn to the right hand) and an arrow that is nocked while drawing.
      this.bowString = this.mesh(createBowString(), 'bow:string');
      this.bowString!.castShadow = false;
      this.arrow = this.mesh(arrowGeometry(), 'bow:arrow');
      this.arrow!.visible = false;
      this.weaponMesh.add(this.bowString!, this.arrow!);
      this.stringBent = true;
    }
    // A torch as the main weapon burns too.
    if (this.weaponMesh && this.weapon === 'torch') this.weaponMesh.add(this.makeFlame());
    this.place();
  }

  /** Default stance for the carried weapon and shield. */
  defaultStance(): Stance {
    const info = WEAPON_INFO[this.weapon];
    return this.shield !== 'none' ? info.stanceShield : info.stance;
  }

  /** The off hand's burden (a lit torch or a retiarius's net), or null when it is free or holds a shield. */
  offHand(): OffHand | null {
    if (this.dropped) return null;
    if (this.torchMesh) return 'torch';
    if (this.netMesh) return 'net';
    return null;
  }

  /** Grip for the left hand on two-handed weapons (null when one-handed or the off hand is busy). */
  twoHandGrip(): GripSpec | null {
    const offsets: Partial<Record<WeaponModel, number>> = { hasta: 0.34, pilum: 0.32, trident: 0.32, axe: 0.26 };
    const off = offsets[this.weapon];
    if (off === undefined || this.shield !== 'none' || this.netMesh || this.torchOn) return null;
    const tilt = ((WEAPON_INFO[this.weapon].gripTilt ?? 0) * Math.PI) / 180;
    return { gripPos: GRIP_R, gripDir: [0, -Math.sin(tilt), Math.cos(tilt)], offset: off };
  }

  sheathLocation(): SheathLocation {
    const info = WEAPON_INFO[this.weapon];
    if (this.weapon === 'none' || this.weapon === 'net') return this.shield !== 'none' ? 'back' : 'fists';
    if (info.sheath === 'back') return 'back';
    if (info.sheath === 'hand') return this.shield !== 'none' ? 'back' : 'fists';
    return this.scabbardSide() === 'R' ? 'hipR' : 'hipL';
  }

  private scabbardSide(): 'R' | 'L' {
    const a = this.avatar.appearance;
    const military = !!a.armor?.body || a.footwear === 'caligae';
    // Legionaries wore the gladius on the right; officers and cavalry (spatha) on the left.
    if (this.weapon === 'gladius' && military) return 'R';
    return 'L';
  }

  /**
   * Move the weapon and shield to hand (true) or to where they are carried. With `swing` (the grab
   * frame of a draw or sheath clip), the shield and a back-carried weapon travel there over
   * SWING_TIME instead of jumping.
   */
  setVisualDrawn(drawn: boolean, swing = false) {
    this.visualDrawn = drawn;
    this.place(swing);
  }

  /** Whether the weapon is visually in hand (it changes at the grab frame of a draw clip). */
  get inHand(): boolean {
    return this.visualDrawn;
  }

  /** The weapon and shield meshes (or null), e.g. for hit tests or tests. */
  get weaponObject(): THREE.Object3D | null {
    return this.weaponMesh;
  }
  get shieldObject(): THREE.Object3D | null {
    return this.shieldMesh;
  }
  get droppedItems(): 'all' | 'shield' | null {
    return this.dropped;
  }

  /**
   * Parent `m` to `parent` with a base local pose. With `swing`, and if it moves between sockets,
   * the offset from its old world transform decays to zero over SWING_TIME (see update()).
   */
  private attach(m: THREE.Object3D, parent: THREE.Object3D, swing: boolean, px = 0, py = 0, pz = 0, rx = 0, ry = 0, rz = 0) {
    const moving = m.parent !== parent;
    let from: THREE.Matrix4 | null = null;
    if (swing && moving && m.parent && m.visible) {
      m.updateWorldMatrix(true, false);
      from = m.matrixWorld.clone();
    }
    if (moving) parent.add(m);
    const bq = _q.setFromEuler(_e.set(rx, ry, rz));
    const k = this.swings.findIndex((x) => x.m === m);
    if (k >= 0) {
      if (!moving && !from) {
        // Still swinging into this socket: keep going toward the (possibly updated) base pose.
        this.swings[k].bp.set(px, py, pz);
        this.swings[k].bq.copy(bq);
        return;
      }
      this.swings.splice(k, 1);
    }
    m.position.set(px, py, pz);
    m.quaternion.copy(bq);
    if (from) {
      m.updateWorldMatrix(true, false);
      const sw: Swing = { m, t: 0, p0: new THREE.Vector3(), q0: new THREE.Quaternion(), bp: m.position.clone(), bq: m.quaternion.clone() };
      _m.copy(m.matrixWorld).invert().multiply(from).decompose(sw.p0, sw.q0, _s);
      this.swings.push(sw);
      this.applySwing(sw, 0);
    }
  }

  private applySwing(sw: Swing, k: number) {
    const m = sw.m;
    _v.copy(sw.p0).multiplyScalar(1 - k).applyQuaternion(sw.bq);
    m.position.copy(sw.bp).add(_v);
    m.quaternion.copy(sw.q0).slerp(IDENTITY_Q, k).premultiply(sw.bq);
  }

  /** Re-attach meshes to the sockets for the current state. */
  private place(swing = false) {
    if (this.dropped) return;
    const av = this.avatar;
    const info = WEAPON_INFO[this.weapon];
    const drawn = this.visualDrawn;
    const side = this.scabbardSide();
    // Weapon.
    if (this.weaponMesh) {
      const m = this.weaponMesh;
      if (drawn || info.sheath === 'hand') {
        // The bow and the net are held in the left hand.
        const left = this.weapon === 'net' || this.weapon === 'bow';
        // Lean toward the fingertips: rotate about the grip's X axis (weapon +Y toward hand -Y).
        this.attach(m, av.getSocket(left ? 'gripL' : 'gripR'), swing && info.sheath === 'back', 0, 0, 0, ((info.gripTilt ?? 0) * Math.PI) / 180);
      } else if (info.sheath === 'back') {
        this.attach(m, av.getSocket('backWeapon'), swing);
      } else if (info.sheath === 'belt') {
        // Tucked through the belt: blades and daggers point down, hafted tools hang head-up.
        const headUp = this.weapon === 'axe' || this.weapon === 'hammer' || this.weapon === 'fustis';
        this.attach(m, av.getSocket(side === 'R' ? 'sheathR' : 'sheathL'), false, 0, headUp ? -0.12 : -0.02, -0.01, headUp ? 0 : Math.PI);
      } else {
        // A sword in its scabbard: the scabbard mesh shows the hilt, this one waits hidden there.
        this.attach(m, av.getSocket(side === 'R' ? 'sheathR' : 'sheathL'), false);
      }
      // Scabbard swords: hidden while sheathed (the full scabbard mesh shows the hilt).
      m.visible = !(info.sheath === 'scabbard' && !drawn);
      if (info.sheath === 'back' && !drawn && this.fp) m.visible = false;
    }
    if (this.scabbardEmpty && this.scabbardFull) {
      const s = av.getSocket(side === 'R' ? 'sheathR' : 'sheathL');
      for (const m of [this.scabbardEmpty, this.scabbardFull]) this.attach(m, s, false);
      this.scabbardEmpty.visible = drawn;
      this.scabbardFull.visible = !drawn;
    }
    // Shield: on the arm, or slung on the back with its top edge at the shoulders.
    if (this.shieldMesh) {
      if (drawn) this.attach(this.shieldMesh, av.getSocket('shieldL'), swing);
      else this.attach(this.shieldMesh, av.getSocket('backShield'), swing, 0, -shieldSize(this.shield).h, 0);
      this.shieldMesh.visible = !(this.fp && !drawn);
    }
  }

  private dropped: 'all' | 'shield' | null = null;

  /**
   * Let go of carried items (they lie on the ground beside the body) or pick them back up (null).
   * Death drops everything; a yielding gladiator drops his shield.
   */
  drop(what: 'all' | 'shield' | null) {
    this.dropped = what;
    this.swings.length = 0;
    const root = this.avatar.root;
    if (!what) {
      this.place();
      for (const m of [this.netMesh, this.torchMesh]) {
        if (!m) continue;
        this.avatar.getSocket('gripL').add(m);
        m.position.set(0, 0, 0);
        m.rotation.set(0, 0, 0);
      }
      return;
    }
    const lay = (m: THREE.Mesh | null, x: number, z: number, rx: number, rz: number, y: number) => {
      if (!m) return;
      m.removeFromParent();
      root.add(m);
      m.position.set(x, y, z);
      m.rotation.set(rx, 0, rz);
      m.visible = true;
    };
    // Shield flat on its back to the left, face up; weapon on the ground to the right.
    lay(this.shieldMesh, 0.55, 0.15, -Math.PI / 2, 0.3, 0.09);
    if (what === 'all') {
      if (this.weaponMesh && this.weaponMesh.visible) lay(this.weaponMesh, -0.5, 0.35, Math.PI / 2, 0.2, 0.025);
      lay(this.netMesh, -0.3, 0.6, Math.PI / 2, 0, 0.05);
      lay(this.torchMesh, 0.35, 0.6, Math.PI / 2, -0.4, 0.03);
      this.setBowDraw(0);
    }
  }

  setWeapon(model: WeaponModel) {
    if (model === this.weapon) return;
    this.weapon = model;
    this.rebuild();
    this.refreshAppearance();
  }

  setShield(model: ShieldModel, color?: string, emblem?: string) {
    this.shield = model;
    if (color) this.shieldColor = color;
    if (emblem) this.emblem = emblem;
    this.rebuild();
    this.refreshAppearance();
  }

  private setNet(on: boolean) {
    if (on && !this.netMesh) {
      this.netMesh = this.mesh(weaponGeometry('net'), 'net');
      if (this.netMesh && !this.dropped) this.avatar.getSocket('gripL').add(this.netMesh);
    } else if (!on && this.netMesh) {
      this.netMesh.removeFromParent();
      this.netMesh = null;
    }
  }

  setTorch(on: boolean) {
    this.torchOn = on;
    if (on && !this.torchMesh) {
      this.torchMesh = this.mesh(weaponGeometry('torch'), 'torch');
      this.flame = this.makeFlame();
      this.torchMesh!.add(this.flame);
      if (!this.dropped) this.avatar.getSocket('gripL').add(this.torchMesh!);
      this.torchMesh!.rotation.set(0, 0, 0);
    } else if (!on && this.torchMesh) {
      this.torchMesh.removeFromParent();
      this.torchMesh = null;
      this.flame = null;
    }
  }

  /** How far the bowstring is drawn to the right hand (0..1); set by the animation each update. */
  setBowDraw(w: number) {
    this.bowDraw = w;
  }

  /** Temporary prop for an action (e.g. a cup while drinking). */
  showProp(prop: 'cup', on: boolean) {
    if (on) {
      if (!this.propMesh) this.propMesh = this.mesh(propGeometry(prop), `prop:${prop}`);
      if (this.propMesh) {
        this.avatar.getSocket('handR').add(this.propMesh);
        this.propMesh.position.set(0.02, -0.01, 0.03);
      }
      if (this.weaponMesh && this.visualDrawn && !this.dropped) this.weaponMesh.visible = false;
    } else {
      this.propMesh?.removeFromParent();
      this.place();
    }
  }

  /** Prop for an idle loop (hammer while working, broom while sweeping), unless a weapon is drawn. */
  setLoopProp(prop: PropModel | null) {
    this.loopProp?.removeFromParent();
    this.loopProp = null;
    if (!prop || this.visualDrawn || this.dropped) {
      this.place();
      return;
    }
    this.loopProp = this.mesh(propGeometry(prop), `prop:${prop}`);
    if (this.loopProp) {
      this.avatar.getSocket('gripR').add(this.loopProp);
      // The broom runs along the forearm line: bristles toward the fingertips, down to the floor.
      if (prop === 'broom') this.loopProp.rotation.set(-Math.PI / 2 - 0.35, 0, 0);
    }
    if (this.weaponMesh && WEAPON_INFO[this.weapon].sheath === 'hand') this.weaponMesh.visible = false;
  }

  setFirstPerson(on: boolean) {
    this.fp = on;
    this.place();
  }

  /** Per frame (after the pose is written): swings between sockets and the bowstring. */
  update(dt: number) {
    for (let i = this.swings.length - 1; i >= 0; i--) {
      const sw = this.swings[i];
      sw.t += dt;
      const x = Math.min(1, sw.t / SWING_TIME);
      this.applySwing(sw, x * x * (3 - 2 * x));
      if (x >= 1) this.swings.splice(i, 1);
    }
    if (this.bowString) this.updateBowString();
  }

  private updateBowString() {
    const bow = this.weaponMesh!;
    const w = this.dropped || !this.visualDrawn ? 0 : this.bowDraw;
    if (w <= 0.001) {
      if (this.stringBent) {
        this.nock.set(0, 0, BOW.stringZ);
        setBowString(this.bowString!.geometry, this.nock);
        this.stringBent = false;
      }
      this.arrow!.visible = false;
      return;
    }
    // The right hand's grip, in the bow's frame (matrices of this avatar only, so a stale parent
    // transform cancels out).
    this.avatar.root.updateMatrixWorld(true);
    const p = _v.setFromMatrixPosition(this.avatar.getSocket('gripR').matrixWorld);
    bow.worldToLocal(p);
    // The string can only come back toward the archer, near the bow's center line.
    p.x = THREE.MathUtils.clamp(p.x, -0.06, 0.06);
    p.y = THREE.MathUtils.clamp(p.y, -0.1, 0.1);
    p.z = THREE.MathUtils.clamp(p.z, -BOW.maxDraw, BOW.stringZ);
    this.nock.set(0, 0, BOW.stringZ).lerp(p, w);
    setBowString(this.bowString!.geometry, this.nock);
    this.stringBent = true;
    // The arrow runs from the nock over the rest beside the grip.
    const a = this.arrow!;
    a.visible = w > 0.5;
    a.position.copy(this.nock);
    a.quaternion.setFromUnitVectors(UP, _v.subVectors(BOW.rest, this.nock).normalize());
  }

  dispose() {
    for (const m of [this.weaponMesh, this.shieldMesh, this.scabbardEmpty, this.scabbardFull, this.netMesh, this.torchMesh, this.propMesh, this.loopProp]) m?.removeFromParent();
    this.bowString?.geometry.dispose();
    this.swings.length = 0;
  }
}

const hiltCache = new Map<string, THREE.BufferGeometry>();

/** Scabbard + the sword's hilt sticking out of its mouth, merged into one geometry. */
function mergeHilt(scabbard: 'scabbard-gladius' | 'scabbard-spatha', weapon: WeaponModel): THREE.BufferGeometry {
  const key = `${scabbard}|${weapon}`;
  const hit = hiltCache.get(key);
  if (hit) return hit;
  const sc = propGeometry(scabbard);
  const sword = weaponGeometry(weapon)!;
  // The sword sits blade-down in the scabbard: rotate 180° about Z so +Y (blade) points down, and
  // lift it so only the guard, grip and pommel show above the mouth.
  const s2 = sword.clone();
  s2.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.PI).setPosition(0, 0.07, 0));
  const merged = mergeIndexed([sc, s2]);
  merged.name = `scabbard+${weapon}`;
  hiltCache.set(key, merged);
  return merged;
}

function mergeIndexed(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const names = ['position', 'normal', 'color', 'surf'];
  const out = new THREE.BufferGeometry();
  let vcount = 0;
  const idx: number[] = [];
  for (const g of geos) {
    const ix = g.index!;
    for (let i = 0; i < ix.count; i++) idx.push(ix.getX(i) + vcount);
    vcount += g.getAttribute('position').count;
  }
  for (const n of names) {
    const first = geos[0].getAttribute(n) as THREE.BufferAttribute;
    const arr = new (first.array.constructor as { new (n: number): THREE.TypedArray })(vcount * first.itemSize);
    let o = 0;
    for (const g of geos) {
      const a = g.getAttribute(n) as THREE.BufferAttribute;
      arr.set(a.array as ArrayLike<number>, o);
      o += a.array.length;
    }
    out.setAttribute(n, new THREE.BufferAttribute(arr, first.itemSize, first.normalized));
  }
  out.setIndex(vcount > 65535 ? new THREE.Uint32BufferAttribute(idx, 1) : new THREE.Uint16BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

