/**
 * Hands that hold things (realistic bodies, LOD 0).
 *
 * The animation curls a hand with one angle per finger bone (`fingers` for the middle, ring and little
 * finger, `index`), authored for the old block hand: 22 degrees at rest, 80 to 95 round a grip. A real
 * finger closes at three joints, so the curl is shared out here: the knuckle (the bone, rewritten after
 * the animation), the middle and the end joints (real/deform.ts bends them in the shader from the
 * parameters written here). Round a grip the knuckle opens up a little and the middle joints close, so
 * the fingers wrap the handle instead of driving through it; the thumb swings over the fingers. A
 * negative curl (an open, reaching hand) straightens the relaxed curl that the bind pose carries.
 *
 * Pure apart from writing bone quaternions and the parameter floats.
 */
import type * as THREE from 'three';
import { B } from '../rig';
import { PRM } from '../real/deform';

const DEG = Math.PI / 180;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Curl (degrees) where a hand starts to grip, and where the grip is complete. */
export const GRIP_FROM = 28;
export const GRIP_FULL = 88;

/**
 * The knuckle and middle-joint angles (degrees) for an animation curl (degrees); the end joint follows at
 * 0.75 of the middle. Holding something, the knuckles open up so the fingers wrap the handle; an empty hand
 * closes into a fist.
 */
export function gripAngles(curl: number, holding: boolean, out = { mcp: 0, pip: 0 }): { mcp: number; pip: number } {
  if (curl <= 0) {
    out.mcp = curl;
    // Straighten the relaxed curl of the bind pose (it bends the middle joints about 20 to 33 degrees).
    out.pip = Math.max(-24, curl * 1.2);
    return out;
  }
  const g = smooth(GRIP_FROM, GRIP_FULL, curl);
  out.mcp = holding ? curl - 30 * g : curl;
  out.pip = (holding ? 56 : 66) * g;
  return out;
}

/** The thumb's swing over the fingers and its end joint (degrees) for the hand's stronger curl. */
export function thumbAngles(curl: number, out = { swing: 0, ip: 0 }): { swing: number; ip: number } {
  const g = smooth(GRIP_FROM + 10, GRIP_FULL, curl);
  out.swing = 58 * g;
  out.ip = 34 * g;
  return out;
}

/** The curl (degrees) a finger bone's quaternion carries (rotation about z; the right hand mirrored). */
export function curlOf(q: THREE.Quaternion, right: boolean): number {
  const a = 2 * Math.atan2(q.z, q.w) / DEG;
  return right ? a : -a;
}

const HANDS = [
  { fingers: B.fingersL, index: B.indexL, right: false, prm: PRM.hand[0] },
  { fingers: B.fingersR, index: B.indexR, right: true, prm: PRM.hand[1] },
] as const;

/** Per-avatar state: remembers what it wrote, so a pose the animation did not refresh is not remapped twice. */
export class HandDriver {
  /** Per bone (fingersL, indexL, fingersR, indexR): the quaternion's z and w as last written, and the curl it came from. */
  private readonly lastZ = new Float64Array(4).fill(NaN);
  private readonly lastW = new Float64Array(4).fill(NaN);
  private readonly curl = new Float64Array(4);
  private readonly g = { mcp: 0, pip: 0 };
  private readonly t = { swing: 0, ip: 0 };

  /**
   * Remap the finger bones after the animation and write the joint parameters. `held`: whether each hand
   * (left, right) holds something. `on` false: leave the bones and zero the parameters.
   */
  update(bones: readonly THREE.Bone[], params: Float32Array | null, on: boolean, heldL = false, heldR = false) {
    for (let h = 0; h < 2; h++) {
      const hand = HANDS[h];
      let strongest = 0;
      for (let k = 0; k < 2; k++) {
        const slot = h * 2 + k;
        const bone = bones[k === 0 ? hand.fingers : hand.index];
        const q = bone.quaternion;
        // The animation wrote a new pose unless the bone still holds exactly what we wrote last time.
        const fresh = !(q.z === this.lastZ[slot] && q.w === this.lastW[slot]);
        if (fresh) this.curl[slot] = curlOf(q, hand.right);
        const c = this.curl[slot];
        strongest = Math.max(strongest, c);
        if (!on) {
          if (!fresh) {
            // Hand the bone back its own curl (the shader no longer bends the joints).
            const a = (hand.right ? c : -c) * DEG * 0.5;
            q.set(0, 0, Math.sin(a), Math.cos(a));
          }
          this.lastZ[slot] = this.lastW[slot] = NaN;
          if (params) params[hand.prm + k] = 0;
          continue;
        }
        const g = gripAngles(c, h === 0 ? heldL : heldR, this.g);
        const a = (hand.right ? g.mcp : -g.mcp) * DEG * 0.5;
        q.set(0, 0, Math.sin(a), Math.cos(a));
        this.lastZ[slot] = q.z;
        this.lastW[slot] = q.w;
        if (params) params[hand.prm + k] = g.pip * DEG;
      }
      if (params) {
        const t = thumbAngles(on ? strongest : 0, this.t);
        params[hand.prm + 2] = t.swing * DEG;
        params[hand.prm + 3] = t.ip * DEG;
      }
    }
  }
}
