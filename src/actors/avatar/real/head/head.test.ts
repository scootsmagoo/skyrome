import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { Rng } from '../../../../core/Rng';
import type { Appearance, BeardStyle, HairStyle } from '../../../appearance';
import { computeRig } from '../../rig';
import { REAL_REFS } from '../refs';
import { buildBeard } from './beard';
import { buildGear } from './gear';
import { buildHair } from './hair';
import { hairPixels, HAIR_TEX, HAIR_UV } from './hairTexture';
import { headSurface } from './frame';
import { buildHead } from './index';
import { makeSkinPaint } from './paint';
import { loadBody } from './testBody';

const STYLES: HairStyle[] = ['bald', 'cropped', 'curly-short', 'receding', 'long-tied', 'bun', 'braided-crown', 'trajanic-tower', 'veiled', 'vestal'];

function appFor(sex: 'male' | 'female', patch: Partial<Appearance> = {}): Appearance {
  return { ...REAL_REFS[sex], skin: '#c89a78', hair: { style: 'cropped', color: '#3a2a1e' }, garments: [], ...patch };
}

/** Checks every vertex of a hair/beard/gear geometry is sane; returns its bounding box. */
function check(geo: THREE.BufferGeometry, rigHeight: number) {
  const pos = geo.getAttribute('position');
  const idx = geo.index!;
  const sw = geo.getAttribute('skinWeight');
  const si = geo.getAttribute('skinIndex');
  for (let i = 0; i < pos.count; i++) {
    expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true);
    let w = 0;
    for (let k = 0; k < 4; k++) {
      w += sw.getComponent(i, k);
      expect(si.getComponent(i, k)).toBeGreaterThanOrEqual(0);
    }
    expect(w).toBeCloseTo(1, 3);
  }
  for (let i = 0; i < idx.count; i++) expect(idx.getX(i)).toBeLessThan(pos.count);
  geo.computeBoundingBox();
  const bb = geo.boundingBox!;
  // Everything sits on the head (above the shoulders) and within a metre of the body's axis.
  expect(bb.max.y).toBeLessThan(rigHeight + 0.2);
  expect(bb.min.y).toBeGreaterThan(rigHeight * 0.55);
  expect(Math.max(Math.abs(bb.min.x), Math.abs(bb.max.x))).toBeLessThan(0.3);
  return bb;
}

describe('hair texture', () => {
  it('has solid roots, tapering strands, an opaque plait and a stipple that thins out', () => {
    const px = hairPixels();
    const { w, h } = HAIR_TEX;
    const alpha = (u: number, v: number) => px[(Math.floor(v * (h - 1)) * w + Math.floor(u * (w - 1))) * 4 + 3];
    const cover = (u0: number, u1: number, v: number) => {
      let n = 0;
      let c = 0;
      for (let u = u0; u < u1; u += 1 / w) {
        n++;
        if (alpha(u, v) > 128) c++;
      }
      return c / n;
    };
    expect(cover(HAIR_UV.strand[0], HAIR_UV.strand[1], 0.01)).toBeGreaterThan(0.9);
    const mid = cover(HAIR_UV.strand[0], HAIR_UV.strand[1], 0.5);
    const tip = cover(HAIR_UV.strand[0], HAIR_UV.strand[1], 0.95);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(0.9);
    expect(tip).toBeLessThan(mid);
    expect(cover(HAIR_UV.plait[0], HAIR_UV.plait[1], 0.5)).toBe(1);
    // The fade region is noise that the material thresholds against a density rising with v.
    const kept = (v: number) => {
      const th = Math.min(1, Math.max(0, v / 0.92)) ** 2 * (3 - 2 * Math.min(1, Math.max(0, v / 0.92))) * 0.95 + 0.02;
      let c = 0;
      let n = 0;
      for (let u = HAIR_UV.fade[0]; u < HAIR_UV.fade[1]; u += 1 / w) {
        n++;
        if (alpha(u, v) / 255 > th) c++;
      }
      return c / n;
    };
    expect(kept(0.0)).toBeGreaterThan(0.9);
    expect(kept(0.95)).toBeLessThan(0.4);
  });
  it('is deterministic', () => {
    expect(Buffer.from(hairPixels(3)).equals(Buffer.from(hairPixels(3)))).toBe(true);
  });
});

describe('hair and beards on the real heads', () => {
  for (const sex of ['male', 'female'] as const) {
    for (const style of STYLES) {
      it(`${sex} ${style}: sane geometry at every LOD, fewer cards further away`, () => {
        const app = appFor(sex, { hair: { style, color: '#6a4a2a' } });
        const rig = computeRig(app);
        const H = headSurface(loadBody(sex), rig, sex);
        const tris: number[] = [];
        for (const lod of [0, 1, 2] as const) {
          const h = buildHair({ H, style, color: new THREE.Color(0.1, 0.05, 0.02), rng: new Rng(5), lod, helmet: false, age: 'adult' });
          if (style === 'bald') {
            expect(h).toBeNull();
            continue;
          }
          expect(h).not.toBeNull();
          check(h!.geometry, rig.height);
          tris.push(h!.triangles);
        }
        if (style !== 'bald') {
          expect(tris[0]).toBeGreaterThan(tris[1]);
          expect(tris[1]).toBeGreaterThanOrEqual(tris[2]);
          // A full head of hair is a few thousand triangles at most.
          expect(tris[0], `${sex} ${style} ${tris.join('/')}`).toBeLessThan(6000);
        }
      });
    }
  }

  for (const beard of ['stubble', 'short', 'full'] as BeardStyle[]) {
    it(`beard ${beard}`, () => {
      const app = appFor('male');
      const rig = computeRig(app);
      const H = headSurface(loadBody('male'), rig, 'male');
      const b = buildBeard(H, beard, new THREE.Color(0.1, 0.05, 0.02), new Rng(2), 0);
      if (beard === 'stubble') expect(b).toBeNull();
      else {
        expect(b).not.toBeNull();
        const bb = check(b!.geometry, rig.height);
        // A beard hangs from the jaw: it reaches below the chin only when full.
        if (beard === 'full') expect(bb.min.y).toBeLessThan(H.chin);
        expect(bb.max.y).toBeLessThan(H.crown - 0.05);
      }
    });
  }

  it('the same seed gives the same hair', () => {
    const app = appFor('male', { hair: { style: 'curly-short', color: '#222' } });
    const H = headSurface(loadBody('male'), computeRig(app), 'male');
    const run = () => buildHair({ H, style: 'curly-short', color: new THREE.Color(0.1, 0.1, 0.1), rng: new Rng(9), lod: 0, helmet: false, age: 'adult' })!.geometry.getAttribute('position').array;
    expect(Array.from(run())).toEqual(Array.from(run()));
  });
});

describe('helmets and veils on the real head', () => {
  it('fits a helmet through the measured surface', () => {
    const app = appFor('male', { armor: { helmet: { kind: 'imperial-gallic', metal: 'iron' } } });
    const rig = computeRig(app);
    const H = headSurface(loadBody('male'), rig, 'male');
    const g = buildGear(app, rig, H, 0);
    expect(g).not.toBeNull();
    const bb = check(g!.geometry, rig.height);
    // The bowl covers the crown and stays within a few centimetres of the skull.
    expect(bb.max.y).toBeGreaterThan(H.crown);
    expect(bb.max.y).toBeLessThan(H.crown + 0.1);
    expect(bb.max.x).toBeLessThan(H.radii.x + 0.12);
  });
  it('fits a veil, and the Vestal gets the infula too', () => {
    for (const style of ['veiled', 'vestal'] as const) {
      const app = appFor('female', { hair: { style, color: '#2a1c14' }, garments: [{ kind: 'palla', color: '#8a3a52' }] });
      const rig = computeRig(app);
      const H = headSurface(loadBody('female'), rig, 'female');
      const g = buildGear(app, rig, H, 0)!;
      expect(g).not.toBeNull();
      check(g.geometry, rig.height);
      g.geometry.computeBoundingBox();
      // The veil drapes onto the shoulders.
      expect(g.geometry.boundingBox!.min.y).toBeLessThan(H.chin);
    }
  });
  it('builds nothing for a bare head', () => {
    const app = appFor('male');
    const rig = computeRig(app);
    expect(buildGear(app, rig, headSurface(loadBody('male'), rig, 'male'), 0)).toBeNull();
  });
});

describe('buildHead', () => {
  it('returns skinned objects, a measured frame and a skin paint, per the wave-2 interface', () => {
    const app = appFor('female', { hair: { style: 'bun', color: '#2a1c14' }, age: 'old' });
    const rig = computeRig(app);
    const head = buildHead({ app, rig, sex: 'female', lod: 0, body: loadBody('female') });
    expect(head.objects.length).toBeGreaterThan(0);
    for (const o of head.objects) expect((o as THREE.SkinnedMesh).isSkinnedMesh).toBe(true);
    expect(head.frame.crown).toBeCloseTo(rig.height, 1);
    expect(head.frame.chin).toBeLessThan(head.frame.brow);
    expect(head.frame.brow).toBeLessThan(head.frame.crown);
    expect(head.frame.ears).toBeGreaterThan(head.frame.chin);
    expect(head.frame.centre.y).toBeGreaterThan(head.frame.chin);
    expect(head.skinPaint.misc.z).toBe(1);
    head.setLod(2);
    head.setLod(0);
    head.dispose();
  });
  it('skin paint places the eyes above the mouth in the reference frame, for both sexes', () => {
    for (const sex of ['male', 'female'] as const) {
      const app = appFor(sex, { beard: sex === 'male' ? 'full' : undefined });
      const rig = computeRig(app);
      const H = headSurface(loadBody(sex), rig, sex);
      const p = makeSkinPaint(app, H, rig, false);
      expect(p.eye.y).toBeGreaterThan(p.face.x);
      expect(p.face.y).toBeLessThan(p.eye.y);
      expect(p.face.y).toBeGreaterThan(p.face.x);
      expect(p.head.w).toBeGreaterThan(p.eye.y);
      expect(p.misc.x).toBe(sex === 'male' ? 3 : 0);
    }
  });
  it('different people get different paint keys, the same person the same', () => {
    const a = appFor('male', { skin: '#a07050' });
    const b = appFor('male', { skin: '#e0b090' });
    const key = (x: Appearance) => {
      const rig = computeRig(x);
      return makeSkinPaint(x, headSurface(loadBody('male'), rig, 'male'), rig, false).key;
    };
    expect(key(a)).toBe(key({ ...a }));
    expect(key(a)).not.toBe(key(b));
  });
});
