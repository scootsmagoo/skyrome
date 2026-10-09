/**
 * Proportion morph for the realistic bodies (pure maths, no three.js).
 *
 * The baked mesh stands in the bind pose of a REFERENCE rig (an average adult: man 1.75 m, woman
 * 1.62 m, see refs.ts). To fit any other appearance, every bone gets a per-axis scale around its
 * own joint plus the translation of the joint itself:
 *
 *     p' = Σ w_i · ( J'_i + S_i · (p − J_i) )
 *
 * where J_i / J'_i are the reference / target joint positions (computeRig) and S_i is a diagonal
 * scale: along the bone it is the ratio of the bone lengths, across it the ratio of the girths (and
 * of the overall scale `s`). Normals use the inverse-transpose (1 / S_i) and tangents S_i. The
 * scale along a bone moves its child joint exactly to the target, so the morphed body skins
 * correctly with the target skeleton.
 */
import { B, BONES, type BoneName, type Rig } from '../rig';

/** Scale of one bone: x across the limb, z front/back (belly, bust), y along it. */
export interface BoneScale {
  sx: number;
  sy: number;
  szFront: number;
  szBack: number;
}

const J = (rig: Rig, bone: BoneName) => [rig.joints[B[bone] * 3], rig.joints[B[bone] * 3 + 1], rig.joints[B[bone] * 3 + 2]] as const;

/** Per-bone scales taking `ref` to `tgt`. */
export function boneScales(ref: Rig, tgt: Rig): BoneScale[] {
  const sr = tgt.s / ref.s;
  const g = (k: keyof Rig['g']) => (ref.g[k] > 1e-6 ? tgt.g[k] / ref.g[k] : 1);
  const seg = (a: BoneName, b: BoneName) => {
    const ra = J(ref, a);
    const rb = J(ref, b);
    const ta = J(tgt, a);
    const tb = J(tgt, b);
    const rl = Math.hypot(rb[0] - ra[0], rb[1] - ra[1], rb[2] - ra[2]);
    const tl = Math.hypot(tb[0] - ta[0], tb[1] - ta[1], tb[2] - ta[2]);
    return rl > 1e-6 ? tl / rl : 1;
  };
  const out: BoneScale[] = [];
  for (const bone of BONES) {
    const base = bone.replace(/[LR]$/, '');
    const side = bone.endsWith('L') ? 'L' : bone.endsWith('R') ? 'R' : '';
    const nm = (b: string) => (b + side) as BoneName;
    let sx = sr;
    let sy = sr;
    let szF = sr;
    let szB = sr;
    switch (base) {
      case 'hips':
        sy = seg('hips', 'spine');
        sx = szF = szB = sr * g('hips');
        break;
      case 'spine':
        sy = seg('spine', 'chest');
        sx = sr * Math.sqrt(g('waist') * g('torso'));
        szB = sr * g('torso');
        szF = sr * g('torso') * g('belly');
        break;
      case 'chest':
        sy = seg('chest', 'neck');
        sx = sr * Math.sqrt(g('torso') * g('shoulders'));
        szB = sr * g('torso');
        // The bust only grows the front; a man (bust 0) keeps the plain torso depth.
        szF = sr * g('torso') * (ref.g.bust > 1e-6 ? 1 + (g('bust') - 1) * 0.6 : 1);
        break;
      case 'neck':
        sy = seg('neck', 'head');
        sx = szF = szB = sr * g('neck');
        break;
      case 'head': {
        const h = ref.headH > 1e-6 ? tgt.headH / ref.headH : 1;
        sx = sy = szF = szB = h;
        break;
      }
      case 'shoulder':
        sx = sr * g('shoulders');
        szF = szB = sr * g('torso');
        break;
      case 'upperArm':
        sy = seg(nm('upperArm'), nm('forearm'));
        sx = szF = szB = sr * g('arm');
        break;
      case 'forearm':
        sy = seg(nm('forearm'), nm('hand'));
        sx = szF = szB = sr * g('arm');
        break;
      case 'hand':
        sy = seg(nm('hand'), nm('fingers'));
        sx = szF = szB = sr * Math.sqrt(g('arm'));
        break;
      case 'fingers':
      case 'index':
        sx = sy = szF = szB = sr * Math.sqrt(g('arm'));
        break;
      case 'thigh':
        sy = seg(nm('thigh'), nm('shin'));
        sx = szF = szB = sr * g('leg');
        break;
      case 'shin':
        sy = seg(nm('shin'), nm('foot'));
        sx = szF = szB = sr * g('leg');
        break;
      default:
        break; // foot, toe: the overall scale
    }
    out.push({ sx, sy, szFront: szF, szBack: szB });
  }
  return out;
}

/** Vertex arrays of one baked mesh (reference pose). */
export interface BodyArrays {
  position: Float32Array;
  normal: Float32Array;
  /** vec4: xyz tangent, w handedness. */
  tangent?: Float32Array;
  /** Four game-bone indices per vertex. */
  skinIndex: ArrayLike<number>;
  skinWeight: ArrayLike<number>;
}

/** Morph `src` (reference pose) into `out` (same layout) for the target rig. */
export function morphBody(src: BodyArrays, ref: Rig, tgt: Rig, out: { position: Float32Array; normal: Float32Array; tangent?: Float32Array }) {
  const sc = boneScales(ref, tgt);
  const n = src.position.length / 3;
  const rj = ref.joints;
  const tj = tgt.joints;
  const tan = src.tangent;
  for (let v = 0; v < n; v++) {
    const px = src.position[v * 3];
    const py = src.position[v * 3 + 1];
    const pz = src.position[v * 3 + 2];
    const nx = src.normal[v * 3];
    const ny = src.normal[v * 3 + 1];
    const nz = src.normal[v * 3 + 2];
    const ax = tan ? tan[v * 4] : 0;
    const ay = tan ? tan[v * 4 + 1] : 0;
    const az = tan ? tan[v * 4 + 2] : 0;
    let ox = 0, oy = 0, oz = 0;
    let mx = 0, my = 0, mz = 0;
    let tx = 0, ty = 0, tz = 0;
    for (let k = 0; k < 4; k++) {
      const w = src.skinWeight[v * 4 + k];
      if (w <= 0) continue;
      const b = src.skinIndex[v * 4 + k];
      const s = sc[b];
      const dz = pz - rj[b * 3 + 2];
      const sz = dz > 0 ? s.szFront : s.szBack;
      ox += w * (tj[b * 3] + s.sx * (px - rj[b * 3]));
      oy += w * (tj[b * 3 + 1] + s.sy * (py - rj[b * 3 + 1]));
      oz += w * (tj[b * 3 + 2] + sz * dz);
      // Normals: inverse-transpose of the diagonal scale.
      mx += w * (nx / s.sx);
      my += w * (ny / s.sy);
      mz += w * (nz / (nz > 0 ? s.szFront : s.szBack));
      tx += w * (ax * s.sx);
      ty += w * (ay * s.sy);
      tz += w * (az * sz);
    }
    out.position[v * 3] = ox;
    out.position[v * 3 + 1] = oy;
    out.position[v * 3 + 2] = oz;
    const nl = Math.hypot(mx, my, mz) || 1;
    out.normal[v * 3] = mx / nl;
    out.normal[v * 3 + 1] = my / nl;
    out.normal[v * 3 + 2] = mz / nl;
    if (tan && out.tangent) {
      const tl = Math.hypot(tx, ty, tz) || 1;
      out.tangent[v * 4] = tx / tl;
      out.tangent[v * 4 + 1] = ty / tl;
      out.tangent[v * 4 + 2] = tz / tl;
      out.tangent[v * 4 + 3] = tan[v * 4 + 3];
    }
  }
}
