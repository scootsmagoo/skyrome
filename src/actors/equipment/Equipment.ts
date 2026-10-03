/**
 * What a humanoid carries: weapon, shield, scabbard, torch, net and small props, attached to the
 * avatar's sockets. Meshes share cached geometry and the single avatar material, so a carried
 * item costs one draw call. Sheathed swords hide in a scabbard mesh at the hip (one mesh, not two).
 */
import * as THREE from 'three';
import type { Stance } from '../Actor';
import type { Appearance, ShieldModel, WeaponModel } from '../appearance';
import { avatarMaterial, flameMaterial } from '../avatar/material';
import { flameGeometry, propGeometry, weaponGeometry, type PropModel } from './weapons';
import { shieldGeometry } from './shields';
import type { HumanoidAvatar } from '../avatar/HumanoidAvatar';

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
  hasta: { stance: 'spear', stanceShield: 'spearShield', sheath: 'hand' },
  pilum: { stance: 'spear', stanceShield: 'spearShield', sheath: 'hand' },
  trident: { stance: 'spear', stanceShield: 'spearShield', sheath: 'hand' },
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

const D = Math.PI / 180;

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
    // Retiarius: the net rides in the off hand whenever a trident is carried without a shield.
    const a = opts.appearance;
    if (this.weapon === 'trident' && this.shield === 'none' && a?.armor?.manica === 'left') this.setNet(true);
  }

  private mesh(geo: THREE.BufferGeometry | null, name: string): THREE.Mesh | null {
    if (!geo) return null;
    const m = new THREE.Mesh(geo, avatarMaterial());
    m.name = name;
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  }

  private rebuild() {
    for (const m of [this.weaponMesh, this.shieldMesh, this.scabbardEmpty, this.scabbardFull]) m?.removeFromParent();
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
    this.place();
  }

  /** Default stance for the carried weapon and shield. */
  defaultStance(): Stance {
    const info = WEAPON_INFO[this.weapon];
    return this.shield !== 'none' ? info.stanceShield : info.stance;
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
    if (this.weapon === 'pugio' || this.weapon === 'axe' || this.weapon === 'hammer' || this.weapon === 'fustis' || this.weapon === 'sling') return 'L';
    return 'L';
  }

  setVisualDrawn(drawn: boolean) {
    this.visualDrawn = drawn;
    this.place();
  }

  /** Re-attach meshes to the sockets for the current state. */
  private place() {
    if (this.dropped) return;
    const av = this.avatar;
    const info = WEAPON_INFO[this.weapon];
    const drawn = this.visualDrawn;
    const side = this.scabbardSide();
    // Weapon.
    if (this.weaponMesh) {
      this.weaponMesh.removeFromParent();
      this.weaponMesh.position.set(0, 0, 0);
      this.weaponMesh.rotation.set(0, 0, 0);
      if (drawn || info.sheath === 'hand') {
        if (this.weapon === 'net') av.getSocket('gripL').add(this.weaponMesh);
        else av.getSocket('gripR').add(this.weaponMesh);
        // Lean toward the fingertips: rotate about the grip's X axis (weapon +Y toward hand -Y).
        this.weaponMesh.rotation.x = ((info.gripTilt ?? 0) * Math.PI) / 180;
      } else if (info.sheath === 'back') {
        av.getSocket('backWeapon').add(this.weaponMesh);
      } else if (info.sheath === 'belt') {
        const s = av.getSocket(side === 'R' ? 'sheathR' : 'sheathL');
        s.add(this.weaponMesh);
        // Tucked through the belt: blades and daggers point down, hafted tools hang head-up.
        const headUp = this.weapon === 'axe' || this.weapon === 'hammer' || this.weapon === 'fustis';
        this.weaponMesh.rotation.set(headUp ? 0 : Math.PI, 0, 0);
        this.weaponMesh.position.set(0, headUp ? -0.12 : -0.02, -0.01);
      }
      // Scabbard swords: hidden while sheathed (the full scabbard mesh shows the hilt).
      this.weaponMesh.visible = !(info.sheath === 'scabbard' && !drawn);
    }
    if (this.scabbardEmpty && this.scabbardFull) {
      const s = av.getSocket(side === 'R' ? 'sheathR' : 'sheathL');
      for (const m of [this.scabbardEmpty, this.scabbardFull]) {
        m.removeFromParent();
        s.add(m);
        // Socket points blade-down; tilt the scabbard forward a little like a hanging sword.
        m.position.set(0, 0, 0);
        m.rotation.set(0, 0, 0);
      }
      this.scabbardEmpty.visible = drawn;
      this.scabbardFull.visible = !drawn;
    }
    // Shield.
    if (this.shieldMesh) {
      this.shieldMesh.removeFromParent();
      if (drawn) av.getSocket('shieldL').add(this.shieldMesh);
      else av.getSocket('backShield').add(this.shieldMesh);
      this.shieldMesh.visible = !(this.fp && !drawn);
    }
    if (this.weaponMesh && info.sheath === 'back' && !drawn) this.weaponMesh.visible = !this.fp;
  }

  private dropped: 'all' | 'shield' | null = null;

  /**
   * Let go of carried items (they lie on the ground beside the body) or pick them back up (null).
   * Death drops everything; a yielding gladiator drops his shield.
   */
  drop(what: 'all' | 'shield' | null) {
    this.dropped = what;
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
    }
  }

  setWeapon(model: WeaponModel) {
    if (model === this.weapon) return;
    this.weapon = model;
    this.rebuild();
  }

  setShield(model: ShieldModel, color?: string, emblem?: string) {
    this.shield = model;
    if (color) this.shieldColor = color;
    if (emblem) this.emblem = emblem;
    this.rebuild();
  }

  private setNet(on: boolean) {
    if (on && !this.netMesh) {
      this.netMesh = this.mesh(weaponGeometry('net'), 'net');
      if (this.netMesh) this.avatar.getSocket('gripL').add(this.netMesh);
    } else if (!on && this.netMesh) {
      this.netMesh.removeFromParent();
      this.netMesh = null;
    }
  }

  setTorch(on: boolean) {
    this.torchOn = on;
    if (on && !this.torchMesh) {
      this.torchMesh = this.mesh(weaponGeometry('torch'), 'torch');
      this.flame = new THREE.Mesh(flameGeometry(), flameMaterial());
      this.flame.name = 'torch:flame';
      this.flame.position.set(0, 0.4, 0);
      this.flame.renderOrder = 2;
      this.torchMesh!.add(this.flame);
      this.avatar.getSocket('gripL').add(this.torchMesh!);
      // The torch must stay upright regardless of the forearm: undo the grip's +90° X.
      this.torchMesh!.rotation.set(0, 0, 0);
    } else if (!on && this.torchMesh) {
      this.torchMesh.removeFromParent();
      this.torchMesh = null;
      this.flame = null;
    }
    if (this.weapon === 'torch' && this.weaponMesh && !this.flame) {
      // A torch as the main weapon also burns.
    }
  }

  /** Temporary prop for an action (e.g. a cup while drinking). */
  showProp(prop: 'cup', on: boolean) {
    if (on) {
      if (!this.propMesh) this.propMesh = this.mesh(propGeometry(prop), `prop:${prop}`);
      if (this.propMesh) {
        this.avatar.getSocket('handR').add(this.propMesh);
        this.propMesh.position.set(0.02, -0.01, 0.03);
      }
      if (this.weaponMesh && this.visualDrawn) this.weaponMesh.visible = false;
    } else {
      this.propMesh?.removeFromParent();
      this.place();
    }
  }

  /** Prop for an idle loop (hammer while working, broom while sweeping), unless a weapon is drawn. */
  setLoopProp(prop: PropModel | null) {
    this.loopProp?.removeFromParent();
    this.loopProp = null;
    if (!prop || this.visualDrawn) {
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

  update(dt: number) {
    if (this.flame || this.weapon === 'torch') {
      const m = flameMaterial();
      m.uniforms.time.value += dt * 0.5;
    }
  }

  dispose() {
    for (const m of [this.weaponMesh, this.shieldMesh, this.scabbardEmpty, this.scabbardFull, this.netMesh, this.torchMesh, this.propMesh, this.loopProp]) m?.removeFromParent();
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

export { D };
