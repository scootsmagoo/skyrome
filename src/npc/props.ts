/**
 * Small procedural props for street life: things people carry (amphorae, baskets, sacks, trays,
 * lanterns, scrolls) and things vignettes need (an altar, a falling pot and its shards, a dog,
 * a cart and its mule, a sausage, a mason's block). Geometry and materials are built once and
 * shared; meshes are cheap wrappers.
 */
import * as THREE from 'three';
import type { HumanoidAvatar } from '../actors/avatar/HumanoidAvatar';
import type { PropKind } from './crowd/roles';

let mats: Record<string, THREE.MeshStandardMaterial> | null = null;
function M() {
  if (mats) return mats;
  const m = (color: number, roughness = 0.8, metalness = 0, extra: THREE.MeshStandardMaterialParameters = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, ...extra });
  mats = {
    terracotta: m(0xb5643c, 0.85),
    wicker: m(0x9c7b4a, 0.95),
    sack: m(0xb8a582, 0.95),
    wood: m(0x6b4a2e, 0.85),
    woodDark: m(0x4a3220, 0.9),
    bronze: m(0x8a6a3a, 0.45, 0.8),
    horn: m(0xffd9a0, 0.6, 0, { emissive: 0xffa040, emissiveIntensity: 1.6 }),
    marble: m(0xe8e1d2, 0.5),
    fire: m(0xffb050, 0.9, 0, { emissive: 0xff8020, emissiveIntensity: 2.5 }),
    dog: m(0x8a6440, 0.9),
    dogDark: m(0x4e3826, 0.9),
    mule: m(0x6e5a48, 0.9),
    sausage: m(0x7a3a24, 0.7),
    papyrus: m(0xe9dcb8, 0.9),
    bread: m(0xc08a4a, 0.9),
    iron: m(0x3a3a3a, 0.6, 0.6),
    stone: m(0xcfc6b2, 0.85),
  };
  return mats;
}

const geos = new Map<string, THREE.BufferGeometry>();
function geo(key: string, make: () => THREE.BufferGeometry) {
  let g = geos.get(key);
  if (!g) geos.set(key, (g = make()));
  return g;
}

function lathe(profile: [number, number][], segs = 10) {
  return new THREE.LatheGeometry(
    profile.map(([r, y]) => new THREE.Vector2(r, y)),
    segs,
  );
}

const amphoraGeo = () =>
  geo('amphora', () =>
    lathe([
      [0.0, -0.36],
      [0.03, -0.34],
      [0.1, -0.22],
      [0.15, -0.05],
      [0.15, 0.08],
      [0.11, 0.18],
      [0.05, 0.24],
      [0.045, 0.34],
      [0.06, 0.36],
      [0.0, 0.37],
    ]),
  );

function mesh(g: THREE.BufferGeometry, m: THREE.Material, cast = true) {
  const o = new THREE.Mesh(g, m);
  o.castShadow = cast;
  o.receiveShadow = true;
  return o;
}

/** A carried prop, positioned for its socket. `update()` keeps hanging things upright. */
export interface CarriedProp {
  kind: PropKind;
  object: THREE.Object3D;
  /** World point of a light source carried with it (lantern), or null. */
  lightPoint?: THREE.Object3D;
  /** Keep hanging props vertical (call after the avatar animates). */
  update?(): void;
  dispose(): void;
}

const qInv = new THREE.Quaternion();

/** Attach a prop to an avatar. Torches use the avatar's own torch (with its arm pose). */
export function attachProp(avatar: HumanoidAvatar, kind: PropKind): CarriedProp {
  const m = M();
  let object: THREE.Object3D;
  let lightPoint: THREE.Object3D | undefined;
  let update: (() => void) | undefined;
  switch (kind) {
    case 'amphora': {
      object = mesh(amphoraGeo(), m.terracotta);
      // Strapped on the back, neck over the shoulder.
      object.position.set(0.04, 0.02, -0.15);
      object.rotation.set(0.22, 0, -0.18);
      avatar.getSocket('back').add(object);
      break;
    }
    case 'basket': {
      const g = geo('basket', () => lathe([[0.0, 0], [0.15, 0.0], [0.2, 0.12], [0.21, 0.14], [0.0, 0.1]], 9));
      object = new THREE.Group();
      const b = mesh(g, m.wicker);
      const loaf = mesh(geo('loaf', () => new THREE.SphereGeometry(0.08, 7, 5).scale(1.3, 0.6, 1)), m.bread);
      loaf.position.set(0.03, 0.12, 0);
      object.add(b, loaf);
      // Balanced on the head.
      object.position.set(0, 0.07, -0.01);
      avatar.getSocket('head').add(object);
      break;
    }
    case 'sack': {
      object = mesh(geo('sack', () => new THREE.SphereGeometry(0.2, 8, 6).scale(1.5, 0.75, 0.9)), m.sack);
      // Over the right shoulder.
      object.position.set(-0.13, 0.17, -0.05);
      object.rotation.set(0, 0, 0.35);
      avatar.getSocket('back').add(object);
      break;
    }
    case 'tray': {
      const g = new THREE.Group();
      const board = mesh(geo('tray', () => new THREE.BoxGeometry(0.46, 0.04, 0.3)), m.wood);
      g.add(board);
      for (let i = 0; i < 4; i++) {
        const bun = mesh(geo('bun', () => new THREE.SphereGeometry(0.05, 6, 4).scale(1, 0.6, 1)), m.bread, false);
        bun.position.set(-0.15 + i * 0.1, 0.035, (i % 2) * 0.08 - 0.04);
        g.add(bun);
      }
      object = g;
      // Hung from the neck on a strap, at belly height in front.
      object.position.set(0, -0.3, 0.24);
      avatar.getSocket('chest').add(object);
      break;
    }
    case 'scroll': {
      object = mesh(geo('scroll', () => new THREE.CylinderGeometry(0.025, 0.025, 0.24, 6)), m.papyrus, false);
      object.rotation.set(0, 0, Math.PI / 2);
      avatar.getSocket('handR').add(object);
      break;
    }
    case 'lantern': {
      const g = new THREE.Group();
      const body = mesh(geo('lanternBody', () => new THREE.CylinderGeometry(0.07, 0.08, 0.2, 8)), m.horn, false);
      const cap = mesh(geo('lanternCap', () => new THREE.ConeGeometry(0.09, 0.08, 8)), m.bronze, false);
      cap.position.y = 0.14;
      const base = mesh(geo('lanternBase', () => new THREE.CylinderGeometry(0.085, 0.085, 0.03, 8)), m.bronze, false);
      base.position.y = -0.11;
      const ring = mesh(geo('lanternRing', () => new THREE.TorusGeometry(0.035, 0.008, 4, 8)), m.bronze, false);
      ring.position.y = 0.2;
      g.add(body, cap, base, ring);
      // Hangs below the fist from its ring.
      const pivot = new THREE.Group();
      g.position.y = -0.22;
      pivot.add(g);
      object = pivot;
      lightPoint = body;
      avatar.getSocket('handL').add(pivot);
      update = () => {
        // Undo the hand's rotation so the lantern hangs plumb.
        pivot.parent?.getWorldQuaternion(qInv);
        pivot.quaternion.copy(qInv.invert());
      };
      break;
    }
    case 'torch': {
      avatar.setTorch(true);
      object = new THREE.Group();
      lightPoint = avatar.getSocket('gripL');
      return {
        kind,
        object,
        lightPoint,
        dispose: () => avatar.setTorch(false),
      };
    }
  }
  return {
    kind,
    object,
    lightPoint,
    update,
    dispose: () => object.removeFromParent(),
  };
}

// ---------------------------------------------------------------- vignette props

/** A small marble altar with a fire on top (sacrifices). */
export function makeAltar(): { group: THREE.Group; flame: THREE.Object3D } {
  const m = M();
  const group = new THREE.Group();
  const base = mesh(geo('altarBase', () => new THREE.BoxGeometry(1.0, 0.12, 0.8)), m.marble);
  base.position.y = 0.06;
  const die = mesh(geo('altarDie', () => new THREE.BoxGeometry(0.82, 0.7, 0.62)), m.marble);
  die.position.y = 0.47;
  const top = mesh(geo('altarTop', () => new THREE.BoxGeometry(0.96, 0.1, 0.76)), m.marble);
  top.position.y = 0.87;
  const flame = mesh(geo('altarFlame', () => new THREE.ConeGeometry(0.16, 0.42, 7)), m.fire, false);
  flame.position.y = 1.12;
  group.add(base, die, top, flame);
  return { group, flame };
}

/** A terracotta pot (falls from windows, Juvenal 3.268–77). */
export function makePot(): THREE.Mesh {
  return mesh(
    geo('pot', () =>
      lathe([
        [0, -0.14],
        [0.1, -0.13],
        [0.14, -0.02],
        [0.12, 0.08],
        [0.08, 0.12],
        [0.09, 0.15],
        [0, 0.15],
      ]),
    ),
    M().terracotta,
  );
}

/** Instanced shards for a shattered pot. */
export function makeShards(n: number): THREE.InstancedMesh {
  const im = new THREE.InstancedMesh(
    geo('shard', () => new THREE.BoxGeometry(0.09, 0.02, 0.06)),
    M().terracotta,
    n,
  );
  im.castShadow = false;
  im.receiveShadow = true;
  return im;
}

export function makeSausage(): THREE.Mesh {
  const g = geo('sausage', () => new THREE.CapsuleGeometry(0.025, 0.14, 3, 6));
  const s = mesh(g, M().sausage, false);
  s.rotation.z = Math.PI / 2;
  return s;
}

/** A mason's block of travertine for the 'work' idle loop (struck ~0.5 m in front, ~0.75 m high). */
export function makeWorkBlock(): THREE.Mesh {
  const b = mesh(geo('workBlock', () => new THREE.BoxGeometry(0.7, 0.72, 0.5)), M().stone);
  b.position.y = 0.36;
  return b;
}

/** A simple quadruped (dog or mule): a body, head, tail and four swinging legs. */
export class Quadruped {
  readonly root = new THREE.Group();
  private legs: THREE.Object3D[] = [];
  private head: THREE.Object3D;
  private tail: THREE.Object3D;
  private phase = 0;
  /** Mouth socket (the dog carries a sausage here). */
  readonly mouth = new THREE.Object3D();

  constructor(readonly kind: 'dog' | 'mule') {
    const m = M();
    const dog = kind === 'dog';
    // Proportions in metres (a street dog; a mule with a long face and long ears).
    const P = dog
      ? { bodyR: 0.12, bodyLen: 0.42, legH: 0.32, legR: 0.026, legX: 0.08, legZ: 0.19, headW: 0.13, headH: 0.13, headL: 0.17, snoutL: 0.12, snoutW: 0.07, neckUp: 0.13, neckFwd: 0.33, earL: 0.08, earW: 0.035, tailL: 0.24, tailR: 0.022 }
      : { bodyR: 0.27, bodyLen: 0.9, legH: 0.74, legR: 0.055, legX: 0.16, legZ: 0.5, headW: 0.17, headH: 0.2, headL: 0.26, snoutL: 0.3, snoutW: 0.13, neckUp: 0.62, neckFwd: 0.86, earL: 0.27, earW: 0.045, tailL: 0.55, tailR: 0.035 };
    const mat = dog ? m.dog : m.mule;
    const dark = dog ? m.dogDark : m.woodDark;
    const body = mesh(geo(`${kind}Body`, () => new THREE.CapsuleGeometry(P.bodyR, P.bodyLen, 3, 8).rotateX(Math.PI / 2)), mat);
    const bodyY = P.legH + P.bodyR * 0.75;
    body.position.y = bodyY;
    this.root.add(body);
    if (!dog) {
      // A thick neck rising forward from the shoulders.
      const neck = mesh(geo('muleNeck', () => new THREE.BoxGeometry(0.17, 0.62, 0.26)), mat);
      neck.position.set(0, bodyY + 0.3, P.bodyLen / 2 + 0.12);
      neck.rotation.x = 0.75;
      this.root.add(neck);
    }
    const head = new THREE.Group();
    const skull = mesh(geo(`${kind}Head`, () => new THREE.BoxGeometry(P.headW, P.headH, P.headL)), mat);
    const snout = mesh(geo(`${kind}Snout`, () => new THREE.BoxGeometry(P.snoutW, P.headH * 0.65, P.snoutL)), dog ? dark : mat);
    snout.position.set(0, -P.headH * 0.15, (P.headL + P.snoutL) / 2 - 0.01);
    const ear = geo(`${kind}Ear`, () => new THREE.ConeGeometry(P.earW, P.earL, 4));
    const e1 = mesh(ear, dark, false);
    const e2 = mesh(ear, dark, false);
    e1.position.set(P.headW * 0.35, P.headH / 2 + P.earL * 0.4, -P.headL * 0.25);
    e2.position.set(-P.headW * 0.35, P.headH / 2 + P.earL * 0.4, -P.headL * 0.25);
    e1.rotation.set(-0.35, 0, -0.25);
    e2.rotation.set(-0.35, 0, 0.25);
    head.add(skull, snout, e1, e2);
    head.position.set(0, bodyY + P.neckUp, P.neckFwd);
    // The mule carries its long face angled down.
    if (!dog) head.rotation.x = 0.55;
    this.mouth.position.set(0, -P.headH * 0.4, P.headL / 2 + P.snoutL * 0.8);
    head.add(this.mouth);
    this.head = head;
    this.root.add(head);
    const tail = mesh(geo(`${kind}Tail`, () => new THREE.CylinderGeometry(P.tailR * 0.6, P.tailR, P.tailL, 4).translate(0, P.tailL / 2, 0)), dog ? mat : dark, false);
    tail.position.set(0, bodyY + P.bodyR * 0.4, -(P.bodyLen / 2 + P.bodyR * 0.8));
    tail.rotation.x = dog ? -0.9 : -2.7;
    this.tail = tail;
    this.root.add(tail);
    const legG = geo(`${kind}Leg`, () => new THREE.CylinderGeometry(P.legR, P.legR * 0.8, P.legH + P.bodyR * 0.5, 5).translate(0, -(P.legH + P.bodyR * 0.5) / 2, 0));
    for (const [x, z] of [
      [P.legX, P.legZ],
      [-P.legX, P.legZ],
      [P.legX, -P.legZ],
      [-P.legX, -P.legZ],
    ]) {
      const l = mesh(legG, mat, false);
      l.position.set(x, P.legH + P.bodyR * 0.5, z);
      this.legs.push(l);
      this.root.add(l);
    }
  }

  /** Animate legs for a ground speed (m/s). */
  animate(dt: number, speed: number) {
    const stride = this.kind === 'dog' ? 0.5 : 1.3;
    this.phase += (dt * speed) / stride * Math.PI * 2;
    const amp = Math.min(0.7, speed * 0.25);
    for (let i = 0; i < 4; i++) {
      const p = this.phase + (i === 0 || i === 3 ? 0 : Math.PI);
      this.legs[i].rotation.x = Math.sin(p) * amp;
    }
    this.tail.rotation.z = Math.sin(this.phase * 0.5 + 1) * (speed > 0.1 ? 0.5 : 0.25);
    this.head.rotation.x = speed > 2 ? 0.15 : Math.sin(this.phase * 0.25) * 0.05;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

/** A Roman heavy cart (plaustrum) loaded with amphorae or a marble block. Front is +Z. */
export function makeCart(load: 'amphorae' | 'marble'): { group: THREE.Group; wheels: THREE.Object3D[]; lamp: THREE.Object3D } {
  const m = M();
  const group = new THREE.Group();
  const bed = mesh(geo('cartBed', () => new THREE.BoxGeometry(1.4, 0.12, 2.6)), m.wood);
  bed.position.y = 0.72;
  group.add(bed);
  for (const side of [-1, 1]) {
    const rail = mesh(geo('cartRail', () => new THREE.BoxGeometry(0.06, 0.3, 2.6)), m.woodDark);
    rail.position.set(side * 0.68, 0.92, 0);
    group.add(rail);
  }
  const wheels: THREE.Object3D[] = [];
  const wg = geo('cartWheel', () => new THREE.CylinderGeometry(0.5, 0.5, 0.12, 12).rotateZ(Math.PI / 2));
  for (const [x, z] of [
    [0.8, 0.85],
    [-0.8, 0.85],
    [0.8, -0.85],
    [-0.8, -0.85],
  ]) {
    const w = mesh(wg, m.woodDark);
    w.position.set(x, 0.5, z);
    wheels.push(w);
    group.add(w);
  }
  for (const side of [-1, 1]) {
    const shaft = mesh(geo('cartShaft', () => new THREE.BoxGeometry(0.07, 0.07, 2.0)), m.wood);
    shaft.position.set(side * 0.35, 0.75, 2.2);
    group.add(shaft);
  }
  if (load === 'marble') {
    const block = mesh(geo('cartMarble', () => new THREE.BoxGeometry(1.1, 0.8, 1.9)), m.marble);
    block.position.y = 1.18;
    group.add(block);
  } else {
    const a = amphoraGeo();
    for (let i = 0; i < 6; i++) {
      const am = mesh(a, m.terracotta);
      am.position.set(((i % 2) - 0.5) * 0.6, 1.0, -0.9 + Math.floor(i / 2) * 0.75);
      am.rotation.x = Math.PI / 2;
      group.add(am);
    }
  }
  const lamp = new THREE.Object3D();
  lamp.position.set(0.6, 1.3, 1.25);
  group.add(lamp);
  return { group, wheels, lamp };
}
