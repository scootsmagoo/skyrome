import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Appearance } from '../../appearance';
import { B, BONES, computeRig } from '../rig';
import { CORRECTIVE_ORDER, addCorrectives, correctiveInfluences, updateCorrectives } from './corrective';
import { REAL_REFS } from './refs';

const inf = [0, 0, 0, 0];
const at = (deg: number, az: number) => {
  // arm direction: elevation `deg` from hanging, azimuth `az` (0 = outwards, 90 = forwards)
  const e = (deg * Math.PI) / 180;
  const a = (az * Math.PI) / 180;
  correctiveInfluences(Math.sin(e) * Math.cos(a), -Math.cos(e), Math.sin(e) * Math.sin(a), inf);
  return inf.map((x) => +x.toFixed(3));
};

describe('correctiveInfluences', () => {
  it('is zero for a hanging arm', () => {
    expect(at(0, 0)).toEqual([0, 0, 0, 0]);
  });
  it('is one at the samples and blends between them', () => {
    expect(at(90, 0)).toEqual([1, 0, 0, 0]);
    expect(at(150, 0)).toEqual([0, 1, 0, 0]);
    expect(at(90, 90)).toEqual([0, 0, 1, 0]);
    expect(at(150, 90)).toEqual([0, 0, 0, 1]);
    expect(at(45, 0)).toEqual([0.5, 0, 0, 0]);
    expect(at(120, 0)).toEqual([0.5, 0.5, 0, 0]);
    expect(at(90, 45)).toEqual([0.5, 0, 0.5, 0]);
  });
  it('stays at the top shape beyond 150 degrees, and ignores arms behind the back or across the chest', () => {
    expect(at(170, 0)).toEqual([0, 1, 0, 0]);
    expect(at(90, -90)).toEqual([0, 0, 0, 0]);
    correctiveInfluences(-0.9, -0.1, 0, inf); // pointing inwards, slightly down
    expect(inf.every((x) => x === 0)).toBe(true);
  });
});

describe('addCorrectives / updateCorrectives', () => {
  const app = { ...REAL_REFS.male, height: 1.9 } as unknown as Appearance;
  const rig = computeRig(app);
  // one vertex rigid to the upper arm, a delta of (0, 0.01, 0) in every target
  const body = {
    position: new Float32Array([0.2, 1.3, 0]),
    normal: new Float32Array([0, 0, 1]),
    skinIndex: Uint16Array.from([B.upperArmL, 0, 0, 0]),
    skinWeight: Float32Array.from([1, 0, 0, 0]),
    morphs: CORRECTIVE_ORDER.map((name) => ({ name, delta: new Float32Array([0, 0.01, 0]), normal: new Float32Array([0, 0, 0.1]) })),
  };

  it('attaches the template\'s relative morph targets (shared between appearances) and the size scale', () => {
    const geo = new THREE.BufferGeometry();
    addCorrectives(geo, { app, rig, sex: 'male', lod: 0, body });
    const t = geo.morphAttributes.position!;
    expect(t.length).toBe(8);
    expect(geo.morphTargetsRelative).toBe(true);
    expect(geo.morphAttributes.normal!.length).toBe(8);
    // 1.9 m against the 1.75 m reference
    expect(geo.userData.correctiveScale).toBeCloseTo(1.9 / 1.75, 6);
    const other = new THREE.BufferGeometry();
    const app2 = { ...app, height: 1.6 } as Appearance;
    addCorrectives(other, { app: app2, rig: computeRig(app2), sex: 'male', lod: 0, body });
    expect(other.morphAttributes.position![0]).toBe(t[0]);
    expect(other.userData.correctiveScale).toBeCloseTo(1.6 / 1.75, 6);
  });

  it('adds nothing for the other LODs or a GLB without the targets', () => {
    const g1 = new THREE.BufferGeometry();
    addCorrectives(g1, { app, rig, sex: 'male', lod: 1, body });
    expect(g1.morphAttributes.position).toBeUndefined();
    const g2 = new THREE.BufferGeometry();
    addCorrectives(g2, { app, rig, sex: 'male', lod: 2, body });
    expect(g2.morphAttributes.position).toBeUndefined();
    const g3 = new THREE.BufferGeometry();
    addCorrectives(g3, { app, rig, sex: 'male', lod: 0, body: { ...body, morphs: undefined } });
    expect(g3.morphAttributes.position).toBeUndefined();
  });

  it('drives the influences from the upper-arm rotation of each side', () => {
    const geo = new THREE.BufferGeometry();
    addCorrectives(geo, { app, rig, sex: 'male', lod: 0, body });
    const mesh = new THREE.SkinnedMesh(geo);
    const bones = BONES.map(() => new THREE.Bone());
    // left arm out sideways by 90 degrees (rotation about +z lifts it towards +x), right arm hanging
    bones[B.upperArmL].quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2);
    updateCorrectives(mesh, bones);
    const i = mesh.morphTargetInfluences!;
    expect(i[0]).toBeCloseTo(1.9 / 1.75, 5); // abd90L, scaled with the body
    expect(i.slice(1, 8).every((x) => Math.abs(x) < 1e-6)).toBe(true);
    // and the right one, mirrored (rotation about -z)
    bones[B.upperArmL].quaternion.identity();
    bones[B.upperArmR].quaternion.setFromAxisAngle(new THREE.Vector3(0, 0, -1), (150 * Math.PI) / 180);
    updateCorrectives(mesh, bones);
    expect(i[5]).toBeCloseTo(1.9 / 1.75, 5); // abd150R
    expect(i[0]).toBeCloseTo(0, 6);
  });
});
