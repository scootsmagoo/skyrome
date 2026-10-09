import { describe, expect, it } from 'vitest';
import { REF_RIG } from '../src/actors/avatar/anim/ik';
import { Pose, REF_LEG, samplePhase } from '../src/actors/avatar/anim/clip';
import { FootIk, type GroundProbe } from '../src/actors/avatar/anim/footIk';
import { gaitClip } from '../src/actors/avatar/anim/library';
import { hitClipFor } from '../src/combat/geometry';

describe('stair gait', () => {
  const legScale = (REF_RIG.thigh + REF_RIG.shin) / REF_LEG;
  // Treads 0.3 m deep, risers 0.18 m, rising along +z.
  const stairs = (_lx: number, lz: number) => Math.floor((lz + 0.05) / 0.3) * 0.18 + 0.3;
  const walk = (ground: (lx: number, lz: number) => number, speed: number, frames = 120) => {
    const ik = new FootIk();
    ik.baseStep = 0.77;
    const pose = new Pose();
    const probe: GroundProbe = (lx, lz, out) => {
      out.y = ground(lx, lz);
      out.nx = 0;
      out.ny = 1;
      out.nz = 0;
      return true;
    };
    let ph = 0;
    for (let i = 0; i < frames; i++) {
      ph = (ph + speed / 1.53 / 60) % 1;
      samplePhase(gaitClip('walk', 0), ph, pose);
      ik.apply(pose, REF_RIG, legScale, 1 / 60, 1, 1 / 30, probe, 0.3, 0, speed);
    }
    return ik;
  };

  it('finds the tread depth and takes one tread per step when slow', () => {
    const ik = walk(stairs, 0.8);
    expect(ik.stairs).toBeGreaterThan(0.9);
    expect(ik.tread).toBeGreaterThan(0.27);
    expect(ik.tread).toBeLessThan(0.33);
    expect(ik.treadsPerStep).toBe(1);
    expect(ik.stride).toBeLessThan(0.5);
  });

  it('still takes one tread per step at a walking pace', () => {
    const ik = walk(stairs, 1.6, 240);
    expect(ik.treadsPerStep).toBe(1);
    expect(ik.stride).toBeCloseTo(ik.tread / 0.77, 1);
  });

  it('is not fooled by a single kerb or by flat ground', () => {
    expect(walk((_x, lz) => (lz > 0.2 ? 0.15 : 0), 1.2).stairs).toBeLessThan(0.1);
    expect(walk(() => 0, 1.2).stairs).toBe(0);
  });
});

describe('hit reaction side', () => {
  it('picks front, back, left and right from where the blow comes from', () => {
    expect(hitClipFor(0.2)).toBe('hitFront');
    expect(hitClipFor(Math.PI)).toBe('hitBack');
    expect(hitClipFor(Math.PI / 2)).toBe('hitLeft');
    expect(hitClipFor(-Math.PI / 2)).toBe('hitRight');
  });
});
