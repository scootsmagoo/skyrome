import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import { Actor, type GroundSample, type LocomotionState } from '../src/actors/Actor';
import { B } from '../src/actors/avatar/rig';
import { REF_RIG } from '../src/actors/avatar/anim/ik';
import { fk, forwardKinematics } from '../src/actors/avatar/anim/armIK';
import { Pose, REF_LEG, samplePhase } from '../src/actors/avatar/anim/clip';
import { FootIk, type GroundProbe } from '../src/actors/avatar/anim/footIk';
import { gaitClip } from '../src/actors/avatar/anim/library';
import { SecondaryMotion, stepSpring, type Spring } from '../src/actors/avatar/anim/secondary';
import { avatarLod } from '../src/actors/avatar/lod';
import { createHumanoid } from '../src/actors/avatar/HumanoidAvatar';
import { randomAppearance } from '../src/actors/avatar/variants';
import { initPhysics, Layer, Physics } from '../src/core/Physics';
import { Rng } from '../src/core/Rng';

const STAND: LocomotionState = { speed: 0, forwardSpeed: 0, strafeSpeed: 0, verticalSpeed: 0, grounded: true, sprinting: false, sneaking: false, turnRate: 0 };
/** Moving at `speed` m/s in direction `dir` (deg, + = to the left) relative to the facing. */
const moving = (speed: number, dir = 0): LocomotionState => ({
  ...STAND,
  speed,
  forwardSpeed: speed * Math.cos((dir * Math.PI) / 180),
  strafeSpeed: -speed * Math.sin((dir * Math.PI) / 180),
  sprinting: speed > 5.5,
});
const person = () => createHumanoid(randomAppearance(new Rng(5), 'plebeian-man'));

describe('springs', () => {
  it('critically damped springs ease to the goal without overshoot', () => {
    const s: Spring = { x: 10, v: 0 };
    let min = Infinity;
    for (let i = 0; i < 120; i++) {
      stepSpring(s, 0, 20, 1, 1 / 60);
      min = Math.min(min, s.x);
    }
    expect(min).toBeGreaterThanOrEqual(-1e-6);
    expect(Math.abs(s.x)).toBeLessThan(1e-3);
  });

  it('is exact: one long step equals many short ones', () => {
    for (const zeta of [1, 0.45]) {
      const a: Spring = { x: 3, v: 40 };
      const b: Spring = { x: 3, v: 40 };
      stepSpring(a, 1, 12, zeta, 0.2);
      for (let i = 0; i < 20; i++) stepSpring(b, 1, 12, zeta, 0.01);
      expect(a.x).toBeCloseTo(b.x, 4);
      expect(a.v).toBeCloseTo(b.v, 3);
    }
  });

  it('an underdamped spring overshoots and rings down', () => {
    const s: Spring = { x: 0, v: 200 };
    let max = 0;
    let min = 0;
    for (let i = 0; i < 180; i++) {
      stepSpring(s, 0, 13, 0.45, 1 / 60);
      max = Math.max(max, s.x);
      min = Math.min(min, s.x);
    }
    expect(max).toBeGreaterThan(5);
    expect(min).toBeLessThan(-1);
    expect(Math.abs(s.x)).toBeLessThan(0.05);
  });
});

describe('secondary motion', () => {
  it('lags the head behind a forward acceleration and the other way when braking', () => {
    const m = new SecondaryMotion();
    for (let i = 0; i < 60; i++) m.step(1 / 60, { af: 6, al: 0, au: 0, turn: 0 }, 1);
    expect(m.pitch[0].x).toBeLessThan(-2);
    expect(m.pitch[0].x).toBeGreaterThan(-16.5);
    // Hanging forearms swing back (the opposite way from the head).
    expect(m.pitch[1].x).toBeGreaterThan(2);
    for (let i = 0; i < 120; i++) m.step(1 / 60, { af: -6, al: 0, au: 0, turn: 0 }, 1);
    expect(m.pitch[0].x).toBeGreaterThan(2);
  });

  it('does nothing at amount 0 and settles to rest when the drive stops', () => {
    const m = new SecondaryMotion();
    for (let i = 0; i < 30; i++) m.step(1 / 60, { af: 8, al: 3, au: 0, turn: 2 }, 0);
    expect(m.energy).toBeLessThan(1e-6);
    for (let i = 0; i < 30; i++) m.step(1 / 60, { af: 8, al: 3, au: 0, turn: 2 }, 1);
    expect(m.energy).toBeGreaterThan(1);
    for (let i = 0; i < 240; i++) m.step(1 / 60, { af: 0, al: 0, au: 0, turn: 0 }, 1);
    expect(m.energy).toBeLessThan(0.02);
  });

  it('a blow from the right rocks the torso left and back, opposite to one from the left', () => {
    const a = new SecondaryMotion();
    const b = new SecondaryMotion();
    a.hit(0, 1, 1); // travelling toward the left
    b.hit(0, -1, 1);
    let aMin = 0;
    let bMax = 0;
    for (let i = 0; i < 30; i++) {
      a.step(1 / 60, { af: 0, al: 0, au: 0, turn: 0 }, 1);
      b.step(1 / 60, { af: 0, al: 0, au: 0, turn: 0 }, 1);
      aMin = Math.min(aMin, a.hitRoll.x);
      bMax = Math.max(bMax, b.hitRoll.x);
    }
    expect(aMin).toBeLessThan(-5);
    expect(bMax).toBeGreaterThan(5);
    // A blow from behind (travelling forward) pitches the body forward; from the front, back.
    const f = new SecondaryMotion();
    f.hit(1, 0, 1);
    let fMax = 0;
    for (let i = 0; i < 20; i++) {
      f.step(1 / 60, { af: 0, al: 0, au: 0, turn: 0 }, 1);
      fMax = Math.max(fMax, f.hitPitch.x);
    }
    expect(fMax).toBeGreaterThan(5);
  });
});

describe('foot contacts', () => {
  const contactsFor = (state: LocomotionState, seconds = 6) => {
    const av = person();
    const out: { side: 'L' | 'R'; gait: string; strength: number; t: number }[] = [];
    let t = 0;
    av.onFootContact = (side, gait, strength) => out.push({ side, gait, strength, t });
    for (let i = 0; i < seconds * 60; i++) {
      t += 1 / 60;
      av.update(1 / 60, state);
    }
    return out;
  };

  it('fires alternating left and right contacts at the gait cadence', () => {
    const c = contactsFor(moving(1.5));
    expect(c.length).toBeGreaterThanOrEqual(10);
    expect(c.length).toBeLessThanOrEqual(16);
    for (let i = 1; i < c.length; i++) expect(c[i].side).not.toBe(c[i - 1].side);
    expect(c.every((x) => x.gait === 'walk' && x.strength > 0.2 && x.strength <= 1)).toBe(true);
    // Evenly spaced: about half a cycle (0.5 s) apart.
    const gaps = c.slice(1).map((x, i) => x.t - c[i].t);
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.1);
  });

  it('runs and sprints land harder and faster, sneaking softer', () => {
    const walk = contactsFor(moving(1.5));
    const run = contactsFor(moving(4.2));
    const sprint = contactsFor(moving(6.8));
    const sneak = contactsFor({ ...moving(1.3), sneaking: true });
    const mean = (a: typeof walk) => a.reduce((s, x) => s + x.strength, 0) / a.length;
    expect(run[run.length - 1].gait).toBe('run');
    expect(sprint[sprint.length - 1].gait).toBe('sprint');
    expect(sneak[sneak.length - 1].gait).toBe('sneak');
    expect(run.length).toBeGreaterThan(walk.length);
    expect(sprint.length).toBeGreaterThanOrEqual(run.length);
    expect(mean(run)).toBeGreaterThan(mean(walk));
    expect(mean(sprint)).toBeGreaterThan(mean(run));
    expect(mean(sneak)).toBeLessThan(mean(walk));
  });

  it('is silent standing still, in the air and when dead', () => {
    expect(contactsFor(STAND).length).toBe(0);
    expect(contactsFor({ ...moving(4), grounded: false }).length).toBe(0);
  });

  it('keeps the count when the pose updates are throttled far from the viewer', () => {
    const viewer = new THREE.Object3D();
    viewer.position.set(500, 0, 0);
    viewer.updateMatrixWorld(true);
    const prev = avatarLod.viewer;
    avatarLod.viewer = viewer;
    try {
      const near = contactsFor(moving(4.2)).length;
      const far = contactsFor(moving(4.2)).length;
      // The far one updates at 8 Hz: a few contacts can merge into one step, never more than a cycle's worth lost.
      expect(far).toBeGreaterThan(near * 0.7);
      expect(far).toBeLessThanOrEqual(near + 1);
    } finally {
      avatarLod.viewer = prev;
    }
  });
});

describe('sprint direction', () => {
  const mixAfter = (state: LocomotionState) => {
    const av = person();
    for (let i = 0; i < 90; i++) av.update(1 / 60, state);
    return av.anim.gaitMix();
  };

  it('sprints straight ahead', () => {
    const mix = mixAfter(moving(7));
    expect(mix.find((m) => m.gait === 'sprint')?.w).toBeGreaterThan(0.95);
  });

  it('hands a sideways or backward sprint to the directional run', () => {
    for (const dir of [90, -90, 180, 135]) {
      const mix = mixAfter(moving(7, dir));
      expect(mix.find((m) => m.gait === 'sprint')?.w ?? 0, `dir ${dir}`).toBeLessThan(0.02);
      expect(mix.find((m) => m.gait === 'run')?.w ?? 0, `dir ${dir}`).toBeGreaterThan(0.95);
    }
  });

  it('eases between them on a diagonal', () => {
    const mix = mixAfter(moving(7, 40));
    const sprint = mix.find((m) => m.gait === 'sprint')?.w ?? 0;
    expect(sprint).toBeGreaterThan(0.1);
    expect(sprint).toBeLessThan(0.9);
  });
});

describe('foot IK', () => {
  const legScale = (REF_RIG.thigh + REF_RIG.shin) / REF_LEG;
  const rest = (b: number) => REF_RIG.joints[b * 3 + 1];

  /** A walk pose at a phase, and the IK run on it for 0.6 s over `ground(lx, lz)`. */
  function solve(phase: number, ground: (lx: number, lz: number) => number | null, normal = [0, 1, 0]) {
    const ik = new FootIk();
    const pose = new Pose();
    const probe: GroundProbe = (lx, lz, out: GroundSample) => {
      const y = ground(lx, lz);
      if (y === null) return false;
      out.y = y;
      [out.nx, out.ny, out.nz] = normal;
      return true;
    };
    for (let i = 0; i < 36; i++) {
      samplePhase(gaitClip('walk', 0), phase, pose);
      ik.apply(pose, REF_RIG, legScale, 1 / 60, 1, 0, probe, 0, 0, 1.5);
    }
    forwardKinematics(pose, REF_RIG, legScale);
    // Read the global FK result now: the next solve overwrites it.
    const ank = new Map<number, number[]>();
    for (const b of [B.footL, B.footR]) ank.set(b, [fk.p[b * 3], fk.p[b * 3 + 1], fk.p[b * 3 + 2]]);
    const footUp = new THREE.Vector3(0, 1, 0).applyQuaternion(new THREE.Quaternion(fk.q[B.footL * 4], fk.q[B.footL * 4 + 1], fk.q[B.footL * 4 + 2], fk.q[B.footL * 4 + 3]));
    return { ik, pose, footUp, ankle: (b: number) => ank.get(b)! };
  }

  it('leaves a flat floor alone', () => {
    const base = new Pose();
    samplePhase(gaitClip('walk', 0), 0.3, base);
    const r = solve(0.3, () => 0);
    expect(r.ik.drop).toBe(0);
    expect(r.ik.active).toBe(false);
    for (let i = 0; i < base.q.length; i++) expect(r.pose.q[i]).toBeCloseTo(base.q[i], 6);
  });

  it('puts the lower stance foot on the lower ground and drops the pelvis, never raising it', () => {
    // Phase 0.05: the left foot has just landed in front, the right is the rear stance foot.
    const flat = solve(0.05, () => 0);
    const step = solve(0.05, (_lx, lz) => (lz < -0.02 ? -0.15 : 0));
    const aR = step.ankle(B.footR);
    expect(aR[1]).toBeLessThan(flat.ankle(B.footR)[1] - 0.12);
    expect(aR[1] - flat.ankle(B.footR)[1]).toBeCloseTo(-0.15, 1);
    // The front foot stays where it was.
    expect(step.ankle(B.footL)[1]).toBeCloseTo(flat.ankle(B.footL)[1], 2);
    expect(step.ik.drop).toBeLessThan(-0.08);
    expect(step.ik.drop).toBeGreaterThan(-0.2);
    // Raised ground never lifts the pelvis.
    const up = solve(0.05, () => 0.1);
    expect(up.ik.drop).toBeLessThanOrEqual(0);
  });

  it('lifts a planted foot onto raised ground and a swinging foot clear of it', () => {
    // The left foot lands on a 0.12 m kerb.
    const kerb = solve(0.02, (lx, lz) => (lz > 0.05 ? 0.12 : 0));
    expect(kerb.ankle(B.footL)[1] - rest(B.footL)).toBeGreaterThan(0.08);
    // A swinging foot (phase 0.8: left mid-swing) over the same kerb clears it.
    const swing = solve(0.8, (lx, lz) => (lz > -0.2 ? 0.12 : 0));
    expect(swing.ankle(B.footL)[1]).toBeGreaterThan(rest(B.footL) + 0.12 - 1e-3);
  });

  it('tilts a planted foot to the slope', () => {
    const a = (12 * Math.PI) / 180;
    const flat = solve(0.1, () => 0);
    const slope = solve(0.1, (lx, lz) => lz * Math.tan(a), [0, Math.cos(a), -Math.sin(a)]);
    // The foot's up axis, in character space, leans back with the surface (toward -z).
    expect(slope.footUp.z).toBeLessThan(flat.footUp.z - 0.1);
  });

  it('ignores ground that is out of reach (a ledge), and ground that is not there', () => {
    const wall = solve(0.05, () => 0.9);
    expect(wall.ik.drop).toBe(0);
    const none = solve(0.05, () => null);
    expect(none.ik.drop).toBe(0);
  });

  it('shortens the stride on steep ground and keeps it on flat', () => {
    const stairs = solve(0.05, (_lx, lz) => Math.max(-0.4, Math.min(0.4, lz * 1.2)));
    expect(stairs.ik.stride).toBeLessThan(0.9);
    expect(stairs.ik.stride).toBeGreaterThanOrEqual(0.62 - 1e-6);
    expect(solve(0.05, () => 0).ik.stride).toBe(1);
  });

  it('casts few rays: a standing figure on level ground almost none', () => {
    const ik = new FootIk();
    const pose = new Pose();
    samplePhase(gaitClip('walk', 0), 0, pose);
    let rays = 0;
    const probe: GroundProbe = (_x, _z, out) => {
      rays++;
      out.y = 0;
      out.nx = 0;
      out.ny = 1;
      out.nz = 0;
      return true;
    };
    for (let i = 0; i < 120; i++) ik.apply(pose, REF_RIG, legScale, 1 / 60, 1, 1 / 30, probe, 0, 0, 0);
    // A re-check every quarter second: 8 in two seconds, two feet each.
    expect(rays).toBeLessThanOrEqual(18);
    rays = 0;
    for (let i = 0; i < 120; i++) ik.apply(pose, REF_RIG, legScale, 1 / 60, 1, 1 / 30, probe, 0, 0, 1.5);
    // Moving: both feet every 1/30 s.
    expect(rays).toBeGreaterThan(100);
    expect(rays).toBeLessThanOrEqual(130);
  });
});

describe('Actor foot IK wiring', () => {
  beforeAll(async () => {
    await initPhysics();
  });

  function stairWorld() {
    const physics = new Physics();
    physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 50, y: 0.5, z: 50 });
    // Ten 0.18 m risers with 0.3 m treads going north.
    for (let i = 0; i < 10; i++) {
      const h = 0.18 * (i + 1);
      physics.addBox({ x: 0, y: h / 2, z: -2 - i * 0.3 - 0.15 }, { x: 1.5, y: h / 2, z: 0.15 });
    }
    const scene = new THREE.Scene();
    const game = { physics, scene } as any;
    const avatar = person();
    const a = new Actor(game, { id: 'p', position: { x: 0, y: 0.05, z: 0 }, layer: Layer.Player, avatar });
    physics.step(1 / 60);
    return { physics, scene, a, avatar };
  }

  it('gives its avatar a probe that reads the ground in the avatar frame', () => {
    const { a, avatar, physics } = stairWorld();
    expect(typeof avatar.groundProbe).toBe('function');
    a.root.position.set(0, 0, 0);
    a.heading = 0;
    const out: GroundSample = { y: -1, nx: 0, ny: 0, nz: 0 };
    // Heading 0: forward is +z (south), the stairs go north (-z): behind the avatar, a metre away.
    expect(avatar.groundProbe!(0, 1, out)).toBe(true);
    expect(out.y).toBeCloseTo(0, 3);
    a.root.position.set(0, 0.18, -2.4);
    a.heading = Math.PI; // facing north, up the stairs: forward is -z
    // 0.3 m ahead is the next riser (0.36 high), 0.6 m ahead 0.54, a step higher each.
    expect(avatar.groundProbe!(0, 0.4, out)).toBe(true);
    expect(out.y).toBeGreaterThan(0.3);
    expect(out.ny).toBeGreaterThan(0.99);
    void physics;
  });

  it('eases the drawn height over a riser instead of popping, while the body is physically there at once', () => {
    const { a, physics } = stairWorld();
    let maxJump = 0;
    let maxPhysJump = 0;
    let last = a.root.position.y;
    let lastPhys = a.position.y;
    for (let i = 0; i < 150; i++) {
      a.locomote({ x: 0, y: 0, z: -2.2 }, 1 / 60);
      physics.step(1 / 60);
      a.syncVisual(1, 1 / 60);
      maxJump = Math.max(maxJump, Math.abs(a.root.position.y - last));
      maxPhysJump = Math.max(maxPhysJump, Math.abs(a.position.y - lastPhys));
      last = a.root.position.y;
      lastPhys = a.position.y;
    }
    expect(a.position.y).toBeGreaterThan(1.1);
    expect(maxPhysJump).toBeGreaterThan(0.06);
    expect(maxJump).toBeLessThan(maxPhysJump * 0.6);
    // It catches up: standing still, the drawn height meets the physical one.
    for (let i = 0; i < 60; i++) {
      a.locomote({ x: 0, y: 0, z: 0 }, 1 / 60);
      physics.step(1 / 60);
      a.syncVisual(1, 1 / 60);
    }
    expect(a.root.position.y).toBeCloseTo(a.position.y, 2);
  });

  it('plants the avatar feet on the stairs it climbs (the pelvis drops, the feet follow the treads)', () => {
    const { a, physics, avatar, scene } = stairWorld();
    let minDrop = 0;
    let rays = 0;
    for (let i = 0; i < 150; i++) {
      a.locomote({ x: 0, y: 0, z: -2.2 }, 1 / 60);
      physics.step(1 / 60);
      a.heading = Math.PI;
      scene.updateMatrixWorld(true);
      a.syncVisual(1, 1 / 60);
      minDrop = Math.min(minDrop, avatar.anim.footIk.drop);
    }
    rays = avatar.anim.footIk.rays;
    expect(minDrop).toBeLessThan(-0.03);
    expect(rays).toBeGreaterThan(20);
    // And off, the pelvis never drops.
    const w2 = stairWorld();
    w2.avatar.anim.footIkEnabled = false;
    let drop2 = 0;
    for (let i = 0; i < 150; i++) {
      w2.a.locomote({ x: 0, y: 0, z: -2.2 }, 1 / 60);
      w2.physics.step(1 / 60);
      w2.a.heading = Math.PI;
      w2.scene.updateMatrixWorld(true);
      w2.a.syncVisual(1, 1 / 60);
      drop2 = Math.min(drop2, w2.avatar.anim.footIk.drop);
    }
    expect(drop2).toBe(0);
  });
});

describe('hit reactions', () => {
  it('rock the body away from the blow and settle', () => {
    const rolls: number[] = [];
    for (const dx of [1, -1]) {
      const av = person();
      for (let i = 0; i < 10; i++) av.update(1 / 60, STAND);
      const rest = av.bones[B.spine].quaternion.z;
      av.hitImpulse(dx, 0, 1);
      let peak = 0;
      for (let i = 0; i < 20; i++) {
        av.update(1 / 60, STAND);
        const z = av.bones[B.spine].quaternion.z - rest;
        if (Math.abs(z) > Math.abs(peak)) peak = z;
      }
      rolls.push(peak);
      for (let i = 0; i < 240; i++) av.update(1 / 60, STAND);
      expect(av.anim.secondary.energy).toBeLessThan(0.02);
    }
    // Opposite blows, opposite roll; both clearly visible (a few degrees of spine roll).
    expect(Math.sign(rolls[0])).toBe(-Math.sign(rolls[1]));
    expect(Math.abs(rolls[0])).toBeGreaterThan(0.02);
  });

  it('does not move a corpse', () => {
    const av = person();
    av.update(1 / 60, STAND);
    av.setDead(true);
    for (let i = 0; i < 40; i++) av.update(1 / 60, STAND);
    const q = av.bones[B.spine].quaternion.clone();
    av.hitImpulse(1, 0, 1);
    for (let i = 0; i < 20; i++) av.update(1 / 60, STAND);
    expect(av.bones[B.spine].quaternion.angleTo(q)).toBeLessThan(0.02);
  });
});
