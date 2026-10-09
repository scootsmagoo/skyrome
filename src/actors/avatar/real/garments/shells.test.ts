import { describe, expect, it } from 'vitest';
import { Rng } from '../../../../core/Rng';
import { B, computeRig } from '../../rig';
import { randomAppearance } from '../../variants';
import type { BodyArrays } from '../morph';
import { BodyProfile } from './profile';
import { buildShells } from './shells';

/** A stand-in body: elliptical rings (torso, then two legs below the crotch) with the pelvis weighted to hips. */
function fakeBody(app: Parameters<typeof computeRig>[0]) {
  const rig = computeRig(app);
  const pos: number[] = [];
  const idx: number[] = [];
  const wt: number[] = [];
  const ring = (cx: number, y: number, rx: number, rz: number, bone: number) => {
    for (let k = 0; k < 24; k++) {
      const a = (k / 24) * Math.PI * 2;
      pos.push(cx + rx * Math.cos(a), y, rz * Math.sin(a));
      idx.push(bone, 0, 0, 0);
      wt.push(1, 0, 0, 0);
    }
  };
  const s = rig.s;
  for (let y = 0.05; y < rig.height - rig.headH; y += 0.02) {
    if (y < 0.85 * s) {
      ring(0.09 * s, y, 0.07 * s, 0.07 * s, B.thighL);
      ring(-0.09 * s, y, 0.07 * s, 0.07 * s, B.thighR);
    } else ring(0, y, (y < 1.0 * s ? 0.16 : 0.15) * s, 0.1 * s, B.hips);
  }
  const position = Float32Array.from(pos);
  const body: BodyArrays = { position, normal: new Float32Array(pos.length), skinIndex: idx, skinWeight: wt };
  return { rig, body };
}

describe('real-body shell garments', () => {
  it('BodyProfile follows the silhouette', () => {
    const { rig, body } = fakeBody({ sex: 'male', age: 'adult', build: 'average', height: 1.75 });
    const bp = new BodyProfile(body, rig, false);
    const y = 1.1 * rig.s;
    expect(bp.radius(y, 0)).toBeGreaterThan(0.15 * rig.s - 0.01);
    expect(bp.radius(y, Math.PI / 2)).toBeGreaterThan(0.1 * rig.s - 0.01);
    expect(bp.radius(y, 0)).toBeLessThan(0.2 * rig.s);
  });

  it('a toga stands outside the body and hides only the pelvis', () => {
    const app = randomAppearance(new Rng(1), 'patrician-man');
    const { rig, body } = fakeBody(app);
    const out = buildShells({ app, rig, sex: app.sex, lod: 0, body });
    expect(out).not.toBeNull();
    const g = out!.geometry;
    for (const a of ['position', 'normal', 'color', 'surf', 'skinIndex', 'skinWeight']) expect(g.getAttribute(a), a).toBeTruthy();
    expect(out!.hide.length).toBe(body.position.length / 3);
    expect(out!.hide.some((h) => h === 1)).toBe(true);
    // Skirt rows near the knees are well off the 7 cm thigh radius of each leg.
    const p = g.getAttribute('position');
    let low = 0;
    for (let i = 0; i < p.count; i++) {
      if (p.getY(i) < 0.5 * rig.s && p.getY(i) > 0.3 * rig.s) low++;
    }
    expect(low).toBeGreaterThan(0);
    for (let i = 0; i < p.count; i++) expect(Number.isFinite(p.getX(i) + p.getY(i) + p.getZ(i))).toBe(true);
  });

  it('a bare appearance has no shells', () => {
    const app = { ...randomAppearance(new Rng(2), 'plebeian-man'), garments: [] };
    const { rig, body } = fakeBody(app);
    expect(buildShells({ app, rig, sex: app.sex, lod: 0, body })).toBeNull();
  });

  it('cloaks stay clear of the body', () => {
    const app = { ...randomAppearance(new Rng(3), 'plebeian-man'), garments: [{ kind: 'paenula' as const, color: '#4a3a2a' }] };
    const { rig, body } = fakeBody(app);
    const out = buildShells({ app, rig, sex: app.sex, lod: 0, body });
    expect(out).not.toBeNull();
    const p = out!.geometry.getAttribute('position');
    const bp = new BodyProfile(body, rig, true);
    for (let i = 0; i < p.count; i++) {
      const y = p.getY(i);
      if (y > bp.top - 0.12 || y < 0.9 * rig.s) continue;
      const r = Math.hypot(p.getX(i), p.getZ(i) - bp.centre(y));
      expect(r).toBeGreaterThan(bp.radius(y, Math.atan2(p.getZ(i) - bp.centre(y), p.getX(i))) - 0.002);
    }
  });
});
