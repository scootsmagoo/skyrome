import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { B, BONES } from '../rig';
import { PRM } from '../real/deform';
import { curlOf, gripAngles, HandDriver, thumbAngles } from './hands';

const DEG = Math.PI / 180;

function bones() {
  return BONES.map(() => new THREE.Bone());
}

/** The finger-bone quaternion the animation writes for a curl (pose.ts: about z, the right hand mirrored). */
function setCurl(b: THREE.Bone, curl: number, right: boolean) {
  b.quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), (right ? curl : -curl) * DEG);
}

describe('hands: sharing the curl over three joints', () => {
  it('leaves a relaxed hand alone and straightens an open one', () => {
    expect(gripAngles(22, false)).toEqual({ mcp: 22, pip: 0 });
    const open = gripAngles(-10, false);
    expect(open.mcp).toBe(-10);
    expect(open.pip).toBeLessThan(0);
    expect(open.pip).toBeGreaterThanOrEqual(-24);
  });
  it('round a handle the knuckles open up and the middle joints close; an empty hand makes a fist', () => {
    const grip = gripAngles(88, true);
    expect(grip.mcp).toBeLessThan(65);
    expect(grip.pip).toBeGreaterThan(45);
    const fist = gripAngles(95, false);
    expect(fist.mcp).toBe(95);
    expect(fist.pip).toBeGreaterThan(grip.pip);
    // Monotonic: more curl never opens the hand.
    let last = -Infinity;
    for (let c = 0; c <= 110; c += 5) {
      const g = gripAngles(c, true);
      const total = g.mcp + g.pip * 1.75;
      expect(total).toBeGreaterThanOrEqual(last - 1e-9);
      last = total;
    }
    expect(thumbAngles(10).swing).toBe(0);
    expect(thumbAngles(90).swing).toBeGreaterThan(40);
  });
  it('reads the curl of either hand from its bone', () => {
    const b = new THREE.Bone();
    setCurl(b, 40, false);
    expect(curlOf(b.quaternion, false)).toBeCloseTo(40, 4);
    setCurl(b, 40, true);
    expect(curlOf(b.quaternion, true)).toBeCloseTo(40, 4);
  });
});

describe('HandDriver', () => {
  it('rewrites the knuckles and writes the joint parameters', () => {
    const bs = bones();
    const p = new Float32Array(16);
    setCurl(bs[B.fingersR], 88, true);
    setCurl(bs[B.indexR], 88, true);
    setCurl(bs[B.fingersL], 22, false);
    new HandDriver().update(bs, p, true, false, true);
    expect(curlOf(bs[B.fingersR].quaternion, true)).toBeCloseTo(gripAngles(88, true).mcp, 3);
    expect(p[PRM.hand[1]]).toBeCloseTo(gripAngles(88, true).pip * DEG, 5);
    expect(p[PRM.hand[1] + 2]).toBeGreaterThan(0);
    // The relaxed left hand keeps its curl and bends no extra joints.
    expect(curlOf(bs[B.fingersL].quaternion, false)).toBeCloseTo(22, 3);
    expect(p[PRM.hand[0]]).toBeCloseTo(0, 6);
  });
  it('does not remap a pose the animation did not refresh (no drift frame after frame)', () => {
    const bs = bones();
    const p = new Float32Array(16);
    const d = new HandDriver();
    setCurl(bs[B.fingersR], 90, true);
    d.update(bs, p, true, false, true);
    const once = curlOf(bs[B.fingersR].quaternion, true);
    for (let i = 0; i < 10; i++) d.update(bs, p, true, false, true);
    expect(curlOf(bs[B.fingersR].quaternion, true)).toBeCloseTo(once, 6);
    // Far away (no shader to bend the joints): the bone gets its whole curl back, the parameters go to zero.
    d.update(bs, p, false);
    expect(curlOf(bs[B.fingersR].quaternion, true)).toBeCloseTo(90, 3);
    expect(p[PRM.hand[1]]).toBe(0);
  });
});
