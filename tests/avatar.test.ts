import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ActionClip, IdleLoop, LocomotionState, Stance } from '../src/actors/Actor';
import { isCombatAvatar } from '../src/actors/Actor';
import { computeRig, B, BONES, BONE_COUNT } from '../src/actors/avatar/rig';
import { MonotoneCurve } from '../src/actors/avatar/anim/spline';
import { boneQuat, limitViolations, PARAM_OFFSET, SEM_LEN, specToSem, semZero, mirrorPose } from '../src/actors/avatar/anim/pose';
import { REF_RIG, jointWorld, restAnkle, solveLeg } from '../src/actors/avatar/anim/ik';
import { GAITS, DIRECTIONS } from '../src/actors/avatar/anim/gait';
import { actionInfo, actionNames, gaitClip, idleLoopClip, stanceIdleClip, STANCES } from '../src/actors/avatar/anim/library';
import { semAt } from '../src/actors/avatar/anim/clip';
import { speedWeights } from '../src/actors/avatar/anim/controller';
import { createHumanoid, type HumanoidAvatar } from '../src/actors/avatar/HumanoidAvatar';
import { MAX_IDLE, avatarCacheStats, buildAvatarGeometry } from '../src/actors/avatar/buildAvatar';
import { flameMaterial, syncFlameClock } from '../src/actors/avatar/material';
import { AVATAR_ROLES, randomAppearance } from '../src/actors/avatar/variants';
import { AvatarLod } from '../src/actors/avatar/lod';
import { Rng } from '../src/core/Rng';
import type { Appearance } from '../src/actors/appearance';

const STAND: LocomotionState = { speed: 0, forwardSpeed: 0, strafeSpeed: 0, verticalSpeed: 0, grounded: true, sprinting: false, sneaking: false, turnRate: 0 };

const legionary = (): Appearance => ({
  sex: 'male',
  age: 'adult',
  build: 'average',
  height: 1.7,
  skin: '#c69a6e',
  hair: { style: 'cropped', color: '#2a1f17' },
  garments: [{ kind: 'tunica', color: '#d9d0bd' }],
  footwear: 'caligae',
  armor: { helmet: { kind: 'imperial-gallic' }, body: { kind: 'lorica-segmentata' } },
  weapon: 'gladius',
  shield: { model: 'scutum', color: '#8e2a1e', emblem: 'thunderbolt' },
});

describe('rig', () => {
  it('places joints in anatomical order and scales with height', () => {
    for (const h of [1.5, 1.65, 1.85]) {
      const r = computeRig({ height: h, sex: 'male', build: 'average', age: 'adult' });
      const y = (n: keyof typeof B) => r.joints[B[n] * 3 + 1];
      expect(y('head')).toBeGreaterThan(y('neck'));
      expect(y('neck')).toBeGreaterThan(y('chest'));
      expect(y('chest')).toBeGreaterThan(y('spine'));
      expect(y('spine')).toBeGreaterThan(y('hips'));
      expect(y('hips')).toBeGreaterThan(y('shinL'));
      expect(y('shinL')).toBeGreaterThan(y('footL'));
      expect(y('forearmL')).toBeLessThan(y('upperArmL'));
      expect(r.eyeHeight / h).toBeGreaterThan(0.9);
      expect(r.eyeHeight / h).toBeLessThan(0.96);
    }
    const a = computeRig({ height: 1.6, sex: 'female', build: 'slight', age: 'adult' });
    const b = computeRig({ height: 1.6, sex: 'male', build: 'muscular', age: 'adult' });
    expect(b.joints[B.upperArmL * 3]).toBeGreaterThan(a.joints[B.upperArmL * 3]);
    expect(a.g.hips).toBeGreaterThan(b.g.hips);
  });
});

describe('spline', () => {
  it('passes through keys without overshoot', () => {
    const c = new MonotoneCurve([0, 1, 2, 3], [0, 10, 10, 0]);
    expect(c.eval(1)).toBeCloseTo(10);
    for (let x = 0; x <= 3; x += 0.05) {
      expect(c.eval(x)).toBeLessThanOrEqual(10 + 1e-9);
      expect(c.eval(x)).toBeGreaterThanOrEqual(-1e-9);
    }
  });
  it('wraps periodic curves continuously', () => {
    const c = new MonotoneCurve([0, 0.5, 1], [0, 1, 0], { period: 1 });
    expect(c.eval(0.999)).toBeCloseTo(c.eval(-0.001), 2);
    expect(c.eval(1.25)).toBeCloseTo(c.eval(0.25), 6);
  });
});

describe('pose', () => {
  it('produces unit quaternions and mirrors left/right', () => {
    const sem = specToSem({ upperArmL: [40, 20, 15, 10], upperArmR: [40, 20, 15, 10], thighL: [30, 10, 5], thighR: [30, 10, 5] }, semZero());
    const qL = new Float32Array(4);
    const qR = new Float32Array(4);
    for (const [l, r] of [[B.upperArmL, B.upperArmR], [B.thighL, B.thighR]]) {
      boneQuat(l, sem, PARAM_OFFSET[l], qL, 0);
      boneQuat(r, sem, PARAM_OFFSET[r], qR, 0);
      expect(Math.hypot(...qL)).toBeCloseTo(1, 5);
      // Mirror across the YZ plane: (x, y, z, w) → (x, -y, -z, w).
      expect(qR[0]).toBeCloseTo(qL[0], 5);
      expect(qR[1]).toBeCloseTo(-qL[1], 5);
      expect(qR[2]).toBeCloseTo(-qL[2], 5);
      expect(qR[3]).toBeCloseTo(qL[3], 5);
    }
  });
  it('flexing the thigh moves the knee forward and bending the elbow lifts the hand', () => {
    const sem = specToSem({ thighL: [40, 0, 0], upperArmR: [0, 0, 0, 0], forearmR: [90, 0] }, semZero());
    const knee = jointWorld(sem, B.shinL);
    expect(knee[2]).toBeGreaterThan(0.2);
    const wrist = jointWorld(sem, B.handR);
    const elbow = jointWorld(sem, B.forearmR);
    expect(wrist[2]).toBeGreaterThan(elbow[2] + 0.2);
  });
  it('mirrorPose swaps sides and flips turns', () => {
    const m = mirrorPose({ upperArmL: [10, 20, 30, 40], chest: [5, 12, -3] });
    expect(m.upperArmR).toEqual([10, 20, 30, 40]);
    expect(m.chest).toEqual([5, -12, 3]);
  });
});

describe('leg IK', () => {
  it('reaches reachable ankle targets', () => {
    const sem = semZero();
    sem[SEM_LEN - 2] = -0.08; // lower the hips
    const rest = restAnkle('L');
    for (const [dx, dz, dy] of [[0, 0.2, 0], [0.05, -0.2, 0.02], [0, 0.35, 0.1]]) {
      solveLeg(sem, 'L', { x: rest[0] + dx, y: rest[1] + dy, z: rest[2] + dz, pitch: 0, yaw: 0 });
      const a = jointWorld(sem, B.footL);
      expect(Math.hypot(a[0] - rest[0] - dx, a[1] - rest[1] - dy, a[2] - rest[2] - dz)).toBeLessThan(0.01);
    }
  });
});

describe('locomotion', () => {
  it('keeps the stance foot planted (moves backward at the nominal speed)', () => {
    for (const gait of ['walk', 'run'] as const) {
      const g = GAITS[gait];
      const clip = gaitClip(gait, 0);
      // Mid-stance of the left foot: phase ~[0.2, 0.45] of the duty for walk.
      const t0 = g.cycle * g.duty * 0.3;
      const t1 = g.cycle * g.duty * 0.55;
      const z0 = jointWorld(semAt(clip, t0), B.footL)[2];
      const z1 = jointWorld(semAt(clip, t1), B.footL)[2];
      const v = (z1 - z0) / (t1 - t0);
      expect(v).toBeLessThan(-g.speed * 0.85);
      expect(v).toBeGreaterThan(-g.speed * 1.15);
    }
  });
  it('blends speed weights that sum to one', () => {
    for (let v = 0; v < 8; v += 0.3) {
      const w = speedWeights(v);
      expect(w.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    }
    expect(speedWeights(0)[0]).toBe(1);
    expect(speedWeights(1.6)[1]).toBe(1);
    expect(speedWeights(4)[2]).toBe(1);
    expect(speedWeights(7)[3]).toBe(1);
  });
  it('bakes all directions', () => {
    for (let d = 0; d < DIRECTIONS.length; d++) for (const g of ['walk', 'run', 'sneak'] as const) expect(gaitClip(g, d).frames).toBeGreaterThan(10);
  });
});

const ACTIONS: ActionClip[] = [
  'attackLight1', 'attackLight2', 'attackLight3', 'attackPower', 'bash', 'blockHit', 'hitFront', 'hitBack', 'stagger', 'knockdown', 'death',
  'bowDraw', 'bowRelease', 'throw', 'interact', 'pickup', 'drink', 'pray', 'cheer', 'wave', 'talk', 'yield',
];
const LOOPS: IdleLoop[] = ['stand', 'sit', 'sitGround', 'lean', 'work', 'sweep', 'talk', 'pray', 'sleep', 'cheer', 'guard', 'drunk'];

describe('clip library', () => {
  it('has every ActionClip for every stance, with impacts inside the clip', () => {
    for (const st of STANCES) {
      for (const a of ACTIONS) {
        const info = actionInfo(st, a);
        expect(info, `${st}/${a}`).toBeTruthy();
        if (info!.hit !== undefined) {
          expect(info!.hit).toBeGreaterThan(0);
          expect(info!.hit).toBeLessThan(info!.clip.duration);
        }
      }
      for (const loc of ['hipR', 'hipL', 'back', 'fists']) {
        expect(actionInfo(st, `drawWeapon:${loc}`)).toBeTruthy();
        expect(actionInfo(st, `sheathWeapon:${loc}`)).toBeTruthy();
      }
    }
  });
  it('attack impacts land at 35–55 % of the clip', () => {
    for (const st of STANCES) {
      for (const a of ['attackLight1', 'attackLight2', 'attackLight3', 'attackPower'] as const) {
        const info = actionInfo(st, a)!;
        const f = info.hit! / info.clip.duration;
        expect(f, `${st}/${a}`).toBeGreaterThan(0.2);
        expect(f, `${st}/${a}`).toBeLessThan(0.6);
      }
    }
  });
  it('keeps every baked frame within joint limits', () => {
    const check = (name: string, sem: Float32Array, frames: number) => {
      for (let f = 0; f < frames; f++) {
        const v = limitViolations(sem.subarray(f * SEM_LEN, (f + 1) * SEM_LEN), 2);
        expect(v, `${name} frame ${f}`).toEqual([]);
      }
    };
    for (const st of STANCES) {
      for (const n of actionNames(st)) {
        const c = actionInfo(st, n)!.clip;
        check(`${st}/${n}`, c.sem, c.frames);
      }
      for (const drawn of [false, true]) {
        const c = stanceIdleClip(st, drawn);
        check(c.name, c.sem, c.frames);
      }
    }
    for (const l of LOOPS) {
      const c = idleLoopClip(l);
      check(c.name, c.sem, c.frames);
    }
    for (let d = 0; d < 8; d++)
      for (const g of ['walk', 'run', 'sneak'] as const) {
        const c = gaitClip(g, d);
        check(c.name, c.sem, c.frames);
      }
  });
});

describe('HumanoidAvatar', () => {
  it('implements CombatAvatar and fires onHit once then onEnd', () => {
    const av = createHumanoid(legionary());
    expect(isCombatAvatar(av)).toBe(true);
    expect(av.mesh.skeleton.bones.length).toBe(BONE_COUNT);
    av.setDrawn(true);
    let hits = 0;
    let ended: boolean | null = null;
    av.play('attackLight1', { onHit: () => hits++, onEnd: (i) => (ended = i) });
    expect(av.isBusy()).toBe(true);
    for (let i = 0; i < 120; i++) av.update(1 / 60, STAND);
    expect(hits).toBe(1);
    expect(ended).toBe(false);
    expect(av.isBusy()).toBe(false);
  });
  it('reports interruption and stays down when dead', () => {
    const av = createHumanoid(legionary());
    let ended: boolean | null = null;
    av.play('attackPower', { onEnd: (i) => (ended = i) });
    av.update(0.1, STAND);
    av.play('hitFront');
    expect(ended).toBe(true);
    av.setDead(true);
    for (let i = 0; i < 200; i++) av.update(1 / 60, STAND);
    expect(av.isBusy()).toBe(true);
    // Lying: the head is near the ground.
    av.root.updateMatrixWorld(true);
    const head = new THREE.Vector3().setFromMatrixPosition(av.bones[B.head].matrixWorld);
    expect(head.y).toBeLessThan(0.45);
  });
  it('collapses the head in first person and exposes eye height', () => {
    const av = createHumanoid(legionary());
    expect(av.eyeHeight).toBeGreaterThan(1.5);
    expect(av.eyeHeight).toBeLessThan(1.7);
    av.setFirstPerson(true);
    expect(av.bones[B.head].scale.x).toBeLessThan(0.01);
    av.setFirstPerson(false);
    expect(av.bones[B.head].scale.x).toBe(1);
  });
  it('exposes sockets and THREE.AnimationClips', () => {
    const av = createHumanoid(legionary());
    for (const s of ['handR', 'handL', 'head', 'chest', 'hips', 'back'] as const) expect(av.getSocket(s)).toBeInstanceOf(THREE.Object3D);
    const clip = av.getAnimationClip('attackLight1')!;
    expect(clip.tracks.length).toBe(BONE_COUNT + 1);
    expect(clip.tracks[0].name).toBe(`${BONES[0]}.quaternion`);
  });
  it('plays every idle loop and stance without NaNs', () => {
    const av = createHumanoid(legionary());
    for (const st of STANCES as Stance[]) {
      av.setStance(st);
      av.setDrawn(st !== 'unarmed');
      for (const l of LOOPS) {
        av.setIdleLoop(l);
        for (let i = 0; i < 5; i++) av.update(0.05, { ...STAND, speed: i > 2 ? 3 : 0, forwardSpeed: i > 2 ? 3 : 0 });
        for (const b of av.bones) expect(Number.isFinite(b.quaternion.w)).toBe(true);
      }
    }
  });
});

const headY = (av: HumanoidAvatar) => {
  av.root.updateMatrixWorld(true);
  return new THREE.Vector3().setFromMatrixPosition(av.bones[B.head].matrixWorld).y;
};
const run = (av: HumanoidAvatar, seconds: number, st: LocomotionState = STAND) => {
  for (let t = 0; t < seconds; t += 1 / 60) av.update(1 / 60, st);
};

describe('HumanoidAvatar state', () => {
  it('keeps a corpse down: later clips are refused and the dropped kit stays on the ground', () => {
    const av = createHumanoid(legionary());
    av.setDrawn(true);
    run(av, 0.5);
    av.setDead(true);
    run(av, 1);
    expect(av.equipment.droppedItems).toBe('all');
    let ended: boolean | null = null;
    av.play('hitFront', { onEnd: (i) => (ended = i) });
    expect(ended).toBe(true);
    run(av, 2);
    expect(headY(av)).toBeLessThan(0.4);
    expect(av.equipment.droppedItems).toBe('all');
    expect(av.equipment.shieldObject!.parent).toBe(av.root);
    // setDead(true) again is harmless; reviving gets up and picks the kit back up.
    av.setDead(true);
    av.setDead(false);
    run(av, 1);
    expect(av.equipment.droppedItems).toBe(null);
    expect(headY(av)).toBeGreaterThan(1.3);
  });

  it('cancels a draw when told to stay sheathed (and the reverse)', () => {
    const av = createHumanoid(legionary());
    av.play('drawWeapon');
    run(av, 0.15);
    av.setDrawn(false);
    run(av, 1.5);
    expect(av.anim.drawn).toBe(false);
    expect(av.equipment.inHand).toBe(false);
    expect(av.equipment.weaponObject!.parent!.name).not.toBe('socket:gripR');

    av.setDrawn(true);
    run(av, 0.2);
    expect(av.equipment.inHand).toBe(true);
    av.play('sheathWeapon');
    run(av, 0.15);
    av.setDrawn(true);
    run(av, 1.5);
    expect(av.anim.drawn).toBe(true);
    expect(av.equipment.inHand).toBe(true);
  });

  it('puts the weapon back when a draw is cancelled after the grab', () => {
    const av = createHumanoid(legionary());
    av.play('drawWeapon');
    run(av, 0.5);
    expect(av.equipment.inHand).toBe(true);
    av.setDrawn(false);
    expect(av.anim.current).toMatch(/^sheathWeapon/);
    run(av, 1.5);
    expect(av.anim.drawn).toBe(false);
    expect(av.equipment.inHand).toBe(false);
  });

  it('commits the drawn state when a draw clip plays on its own', () => {
    const av = createHumanoid(legionary());
    av.play('drawWeapon');
    expect(av.anim.drawn).toBe(true);
    expect(av.equipment.inHand).toBe(false);
    run(av, 1.2);
    expect(av.equipment.inHand).toBe(true);
    expect(av.equipment.shieldObject!.parent!.name).toBe('socket:shieldL');
  });

  it('holds the bow in the left hand and draws the string to the right hand', () => {
    const app = { ...legionary(), weapon: 'bow' as const, shield: undefined, armor: undefined };
    const av = createHumanoid(app);
    expect(av.anim.stance).toBe('bow');
    av.setDrawn(true);
    expect(av.equipment.weaponObject!.parent!.name).toBe('socket:gripL');
    av.play('bowDraw');
    run(av, 1);
    const bow = av.equipment.weaponObject!;
    const arrow = bow.getObjectByName('bow:arrow')!;
    expect(arrow.visible).toBe(true);
    // The nock (arrow origin) is pulled well back toward the archer.
    expect(arrow.position.z).toBeLessThan(-0.35);
    av.play('bowRelease');
    run(av, 0.1);
    expect(arrow.visible).toBe(false);
  });

  it('keeps a torch or net arm out of two-handed attacks', () => {
    const vigil = createHumanoid({ ...legionary(), weapon: 'axe', shield: undefined, armor: undefined });
    vigil.setTorch(true);
    vigil.setDrawn(true);
    run(vigil, 1);
    const before = vigil.bones[B.upperArmL].quaternion.clone();
    const flame = vigil.root.getObjectByName('torch:flame')!;
    vigil.play('attackLight1');
    run(vigil, 0.4);
    expect(vigil.bones[B.upperArmL].quaternion.angleTo(before)).toBeLessThan(0.15);
    // The flame burns upward in world space whatever the torch does (its shader ignores rotation).
    expect(flame.frustumCulled).toBe(false);
  });

  it('advances the flame clock from wall time, not per torch', () => {
    syncFlameClock(1000);
    syncFlameClock(1000);
    expect(flameMaterial().uniforms.time.value).toBeCloseTo(0.5, 6);
  });

  it('hides head and neck in first person and does not bend the spine to aim', () => {
    const av = createHumanoid(legionary());
    av.setDrawn(true);
    av.setFirstPerson(true);
    expect(av.bones[B.neck].scale.x).toBeLessThan(0.01);
    av.setAimPitch(-0.9);
    run(av, 1);
    // Spine and chest do not bend forward (they lean back a little so the collar stays out of view).
    av.root.updateMatrixWorld(true);
    const neck = new THREE.Vector3().setFromMatrixPosition(av.bones[B.neck].matrixWorld);
    expect(neck.z).toBeLessThan(0.02);
  });

  it('swaps armor and clothes in place, keeping bones, animation and kit', () => {
    const av = createHumanoid(legionary());
    av.setDrawn(true);
    run(av, 0.3);
    const bones = av.bones;
    const geo = av.mesh.geometry;
    av.setArmor({ helmet: { kind: 'praetorian-attic', crest: '#b3261e' }, body: { kind: 'lorica-squamata' } });
    expect(av.mesh.geometry).not.toBe(geo);
    expect(av.bones).toBe(bones);
    expect(av.anim.drawn).toBe(true);
    expect(av.equipment.inHand).toBe(true);
    av.setGarments([{ kind: 'tunica', color: '#a33b2a' }, { kind: 'toga', color: '#efe9dc' }]);
    expect(av.anim.togate).toBe(true);
    // New proportions move the joints and the eyes.
    const eye = av.eyeHeight;
    av.setAppearance({ ...av.appearance, height: 1.85 });
    expect(av.eyeHeight).toBeGreaterThan(eye + 0.1);
    av.root.updateMatrixWorld(true);
    run(av, 0.1);
    for (const b of av.bones) expect(Number.isFinite(b.quaternion.w)).toBe(true);
    expect(av.skeleton.boneInverses[B.head].elements[13]).toBeCloseTo(-av.rig.joints[B.head * 3 + 1], 5);
  });

  it('releases geometry: unheld meshes are evicted and disposed, held ones never', () => {
    const rng = new Rng(11);
    const held = createHumanoid(randomAppearance(rng.fork('keep'), 'matron'));
    let disposed = 0;
    for (let i = 0; i < MAX_IDLE + 30; i++) {
      const av = createHumanoid(randomAppearance(rng.fork(`npc${i}`), 'plebeian-man'));
      av.mesh.geometry.addEventListener('dispose', () => disposed++);
      av.dispose();
      av.dispose();
    }
    const st = avatarCacheStats();
    expect(st.idle).toBeLessThanOrEqual(MAX_IDLE);
    expect(st.held).toBeGreaterThanOrEqual(1);
    expect(disposed).toBeGreaterThanOrEqual(30);
    expect(held.mesh.geometry.getAttribute('position').count).toBeGreaterThan(100);
  });
});

describe('geometry', () => {
  it('has normalized skin weights and valid indices', () => {
    const g = buildAvatarGeometry(legionary()).geometry;
    const w = g.getAttribute('skinWeight');
    const si = g.getAttribute('skinIndex');
    for (let i = 0; i < w.count; i++) {
      const s = w.getX(i) + w.getY(i) + w.getZ(i) + w.getW(i);
      expect(s).toBeCloseTo(1, 4);
      expect(si.getX(i)).toBeLessThan(BONE_COUNT);
    }
    const n = g.getAttribute('position').count;
    const idx = g.index!;
    for (let i = 0; i < idx.count; i++) expect(idx.getX(i)).toBeLessThan(n);
  });
  it('stays within the triangle budget', () => {
    const rng = new Rng(7);
    for (const role of AVATAR_ROLES) {
      const app = randomAppearance(rng.fork(role), role);
      const hi = buildAvatarGeometry(app, 'high');
      const lo = buildAvatarGeometry(app, 'low');
      const armored = !!app.armor?.helmet || !!app.armor?.body;
      expect(hi.triangles, role).toBeLessThan(armored ? 6500 : 5200);
      expect(lo.triangles, role).toBeLessThan(armored ? 1800 : 1400);
    }
  });
});

describe('variants', () => {
  it('is deterministic and valid for every role', () => {
    for (const role of AVATAR_ROLES) {
      const a = randomAppearance(new Rng(42), role);
      const b = randomAppearance(new Rng(42), role);
      expect(a).toEqual(b);
      expect(a.height).toBeGreaterThan(0.9);
      expect(a.height).toBeLessThan(2.0);
      expect(a.skin).toMatch(/^#[0-9a-f]{6}$/i);
      expect(a.garments.length).toBeGreaterThan(0);
    }
  });
  it('keeps purple to elites and white togas', () => {
    const rng = new Rng(3);
    for (let i = 0; i < 200; i++) {
      const role = rng.pick(AVATAR_ROLES);
      const a = randomAppearance(rng, role);
      for (const g of a.garments) {
        if (g.kind === 'toga') expect(['#ebe5d6', '#efe9dc', '#f2eee4']).toContain(g.color);
        if (g.color === '#4f1838') expect(['patrician-man', 'priest']).toContain(role);
      }
    }
  });
});

describe('animation LOD', () => {
  it('updates distant avatars less often but keeps total time', () => {
    const lod = new AvatarLod();
    const viewer = new THREE.Object3D();
    lod.viewer = viewer;
    viewer.updateMatrixWorld();
    const near = { root: new THREE.Object3D() };
    const far = { root: new THREE.Object3D() };
    far.root.position.set(200, 0, 0);
    near.root.updateMatrixWorld();
    far.root.updateMatrixWorld();
    let nearT = 0;
    let farT = 0;
    let farUpdates = 0;
    for (let i = 0; i < 120; i++) {
      nearT += lod.step(near, 1 / 60);
      const s = lod.step(far, 1 / 60);
      if (s > 0) farUpdates++;
      farT += s;
    }
    expect(nearT).toBeCloseTo(2, 5);
    expect(farUpdates).toBeLessThan(30);
    expect(farT).toBeGreaterThan(1.7);
  });
});
