/**
 * The painted face of one appearance: the numbers real/skin.ts's shader paints with (see paintShader.ts).
 * Positions are relative to the head joint in the REFERENCE head's frame, so one set of feature shapes
 * serves every height and head size (the shader divides by `headK`).
 */
import * as THREE from 'three';
import type { Appearance } from '../../../appearance';
import { B, type Rig } from '../../rig';
import { mixC, shade, srgb } from '../../build/common';
import { refRig } from '../refs';
import type { SkinPaint } from '../skin';
import type { HeadSurface } from './frame';
import { hairlineYf } from './hair';
import { MOUTH } from './beard';

const r2 = (x: number) => Math.round(x * 100) / 100;

export function makeSkinPaint(app: Appearance, H: HeadSurface, rig: Rig, helmet: boolean): SkinPaint {
  const m = H.measure;
  const ref = refRig(m.sex);
  const jy = ref.joints[B.head * 3 + 1];
  const jz = ref.joints[B.head * 3 + 2];
  const Href = m.crown - m.chin;
  const female = m.sex === 'female';
  const skin = srgb(app.skin);
  const hair = srgb(app.hair.color);
  const old = app.age === 'old';
  const style = helmet ? 'cropped' : app.hair.style;
  const beard = !female && app.age !== 'child' ? app.beard ?? 'none' : 'none';
  const beardCode = beard === 'full' ? 3 : beard === 'short' ? 2 : beard === 'stubble' ? 1 : !female && app.age !== 'child' ? 1 : 0;
  const stubAmt = beard === 'stubble' ? 0.85 : beard === 'none' ? (beardCode ? 0.16 : 0) : 1;
  const bw = new THREE.Color();
  const brow = mixC(shade(skin, 0.75), hair, old ? 0.5 : 0.78);
  const lip = mixC(shade(skin, 0.8), srgb(female ? '#a24f4a' : '#8a4a40'), female ? 0.55 : 0.4);
  const roots = shade(hair, 0.42);
  bw.copy(hair);
  const hl = (deg: number) => hairlineYf(style, (deg * Math.PI) / 180, H);
  const skullX = H.radii.x / H.k;
  const paint: SkinPaint = {
    key: '',
    headJ: new THREE.Vector3(rig.joints[B.head * 3], rig.joints[B.head * 3 + 1], rig.joints[B.head * 3 + 2]),
    headK: H.k,
    eye: new THREE.Vector3(m.eyeX, m.eyeY - jy, m.eyeZ - jz),
    face: new THREE.Vector4(m.chin + MOUTH.line * Href - jy, m.noseTip.y - jy, m.noseTip.z - jz, female ? 0.0238 : 0.0252),
    head: new THREE.Vector4(m.chin - jy, Href, m.cz - jz, m.eyeY + 0.075 * Href - jy),
    ear: new THREE.Vector4(skullX + 0.001, m.earBottom - jy, m.earTop - jy, m.cz - jz + 0.035),
    brow,
    lip,
    stub: new THREE.Vector4(bw.r, bw.g, bw.b, stubAmt),
    hairline: new THREE.Vector4(hl(0), hl(38), hl(100), hl(180)),
    hairRoots: roots,
    misc: new THREE.Vector4(beardCode, female ? 0.38 : 0.14, old ? 1 : app.age === 'middle' ? 0.35 : 0, style === 'bald' ? 0 : 1),
    look: new THREE.Vector2(female ? 1 : 0, (female ? 0.85 : 1) * (old ? 0.85 : 1)),
  };
  paint.key = [
    m.sex,
    H.k.toFixed(4),
    app.skin,
    app.hair.color,
    beard,
    style,
    app.age,
    paint.hairline.toArray().map(r2).join(','),
    paint.ear.y.toFixed(3),
    paint.headJ.y.toFixed(3),
    paint.headJ.z.toFixed(3),
  ].join('|');
  return paint;
}
