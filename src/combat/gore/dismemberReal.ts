/**
 * Severing a part of a REALISTIC body (actors/avatar/real): a textured, UV-mapped skin mesh with
 * normals and tangents, skinned to the game's bones.
 *
 * Unlike the procedural body (dismember.ts, whose joints are clean rings), the real mesh has smooth
 * weights, so cutting by bone weight leaves a ragged rim and a pointed stump. Instead the mesh is
 * cut with a PLANE through the middle of a bone (REAL_CUT: the upper arm halfway, the neck, the
 * thigh), in the bind pose:
 *  - the piece: the triangles beyond the plane (split on it, attributes interpolated) baked in
 *    their current pose into a new world-space mesh with the same skin material (UV, normal and
 *    tangent kept, so the baked maps still fit), a flesh cap on the rim and the bone's end;
 *  - the body: this avatar gets its own copy of the geometry without those triangles (the shared
 *    geometry is never touched) and a cap on the stump, carried by the cut bone; the child bone
 *    collapses so that whatever hangs from it (hand, weapon, shield, helmet) goes with the piece.
 * The avatar's mesh is flagged (`userData.goreGeometry`) so the LOD switch of RealBody leaves it be.
 */
import * as THREE from 'three';
import type { HumanoidAvatar } from '../../actors/avatar/HumanoidAvatar';
import { B } from '../../actors/avatar/rig';
import { cutMesh } from './cut';
import { REAL_CUT, partMask, subtree, type Part } from './limbs';
import type { SeveredPiece } from './dismember';
import { fleshMaterials } from './stump';

/** Is this avatar's body a realistic one (UV-mapped skin, not the procedural vertex-coloured mesh)? */
export function isRealBody(avatar: HumanoidAvatar): boolean {
  const g = avatar.mesh.geometry;
  return !!g.getAttribute('uv') && !!g.getAttribute('tangent') && !g.getAttribute('surf');
}

/** Skinning of arbitrary vertices to world space with the avatar's current pose. */
class Poser {
  private readonly w: Float32Array;
  private readonly m = new Float32Array(16);

  constructor(mesh: THREE.SkinnedMesh) {
    const sk = mesh.skeleton;
    this.w = new Float32Array(sk.bones.length * 16);
    const t = new THREE.Matrix4();
    for (let i = 0; i < sk.bones.length; i++) {
      // world = meshWorld * bindInverse * boneWorld * boneInverse * bind
      t.multiplyMatrices(sk.bones[i].matrixWorld, sk.boneInverses[i]);
      t.premultiply(mesh.bindMatrixInverse).multiply(mesh.bindMatrix).premultiply(mesh.matrixWorld);
      // (bindInverse and bind cancel for identity binds; kept in the formula so a bound mesh stays right)
      this.w.set(t.elements, i * 16);
    }
  }

  /** Blend the matrices of one vertex into this.m. */
  private blend(idx: ArrayLike<number>, wt: ArrayLike<number>, o: number) {
    const m = this.m;
    m.fill(0);
    for (let k = 0; k < 4; k++) {
      const w = wt[o + k];
      if (w <= 0) continue;
      const b = idx[o + k] * 16;
      for (let j = 0; j < 16; j++) m[j] += w * this.w[b + j];
    }
  }

  point(out: THREE.Vector3, p: THREE.Vector3, idx: ArrayLike<number>, wt: ArrayLike<number>, o: number): THREE.Vector3 {
    this.blend(idx, wt, o);
    const m = this.m;
    return out.set(
      m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12],
      m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13],
      m[2] * p.x + m[6] * p.y + m[10] * p.z + m[14],
    );
  }

  /** Direction with the blend of the LAST point() call. */
  dir(out: THREE.Vector3, d: THREE.Vector3): THREE.Vector3 {
    const m = this.m;
    return out
      .set(m[0] * d.x + m[4] * d.y + m[8] * d.z, m[1] * d.x + m[5] * d.y + m[9] * d.z, m[2] * d.x + m[6] * d.y + m[10] * d.z)
      .normalize();
  }
}

const Y = new THREE.Vector3(0, 1, 0);
const v0 = new THREE.Vector3();
const v1 = new THREE.Vector3();
const v2 = new THREE.Vector3();

interface Attr {
  name: string;
  size: number;
  data: ArrayLike<number>;
}

/**
 * A flesh stump cap on a rim: a shallow dome over the loop with the pale end of the bone in it.
 * Built in the frame of the returned anchor (+Y out of the wound); `ring` are rim points in the
 * parent's frame, `out` the outward direction there.
 */
function buildCap(ring: THREE.Vector3[], out: THREE.Vector3): { anchor: THREE.Group; radius: number } {
  const c = new THREE.Vector3();
  for (const p of ring) c.add(p);
  c.multiplyScalar(1 / ring.length);
  let radius = 0;
  for (const p of ring) radius += p.distanceTo(c);
  radius /= ring.length;
  const anchor = new THREE.Group();
  anchor.name = 'gore:stump';
  anchor.position.copy(c);
  anchor.quaternion.setFromUnitVectors(Y, out);
  const qi = anchor.quaternion.clone().invert();
  const loc = ring.map((p) => p.clone().sub(c).applyQuaternion(qi));
  const m = loc.length;
  // rings: rim (y 0), inner ring (55 %, a little up), apex
  const pos: number[] = [];
  for (const p of loc) pos.push(p.x, 0, p.z);
  for (const p of loc) pos.push(p.x * 0.7, radius * 0.2, p.z * 0.7);
  pos.push(0, radius * 0.3, 0);
  // Wet muscle: pinker at the skin edge, dark in the middle.
  const col: number[] = [];
  for (let i = 0; i < m; i++) col.push(0.3, 0.07, 0.06);
  for (let i = 0; i < m; i++) col.push(0.19, 0.03, 0.03);
  col.push(0.11, 0.012, 0.012);
  const idx: number[] = [];
  for (let i = 0; i < m; i++) {
    const j = (i + 1) % m;
    // outward-facing winding for a loop listed in the piece's boundary order is fixed up below
    idx.push(i, m + i, j, j, m + i, m + j);
    idx.push(m + i, 2 * m, m + j);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  // Flip the winding if the first facet points inward (towards -Y).
  const n = g.getAttribute('normal');
  if (n.getY(2 * m) < 0) {
    for (let i = 0; i < idx.length; i += 3) {
      const t = idx[i + 1];
      idx[i + 1] = idx[i + 2];
      idx[i + 2] = t;
    }
    g.setIndex(idx);
    g.computeVertexNormals();
  }
  const { wound, bone, nub } = fleshMaterials();
  const dome = new THREE.Mesh(g, wound);
  dome.name = 'gore:cap';
  const b = new THREE.Mesh(nub, bone);
  b.userData.sharedGeometry = true;
  b.scale.set(radius * 0.2, radius * 0.18, radius * 0.2);
  b.position.set(0, radius * 0.27, 0);
  anchor.add(dome, b);
  return { anchor, radius };
}

/** Take `part` off a realistic body now; see the file comment. Null when nothing is left to cut. */
export function severReal(avatar: HumanoidAvatar, part: Part): SeveredPiece | null {
  const cfg = REAL_CUT[part];
  const childBone = avatar.bones[B[cfg.child]];
  if (childBone.scale.x < 0.01) return null;
  const mesh = avatar.mesh;
  // A cut body keeps the stock bone path for good (the pieces and the stump read the world matrices).
  avatar.holdFull(true);
  avatar.root.updateMatrixWorld(true);
  mesh.skeleton.update();
  const geo = mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  const tan = geo.getAttribute('tangent') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const si = geo.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = geo.getAttribute('skinWeight') as THREE.BufferAttribute;
  const index = geo.getIndex();
  if (!pos?.array || !nor?.array || !tan?.array || !uv?.array || !si?.array || !sw?.array || !index?.array) return null;
  const n = pos.count;

  // The plane: through the bone at fraction t of its length, perpendicular to it (bind pose).
  const joints = avatar.rig.joints;
  const jb = B[cfg.bone] * 3;
  const jc = B[cfg.child] * 3;
  const J = new THREE.Vector3(joints[jb], joints[jb + 1], joints[jb + 2]);
  const axis = new THREE.Vector3(joints[jc] - J.x, joints[jc + 1] - J.y, joints[jc + 2] - J.z);
  const len = axis.length();
  if (len < 1e-4) return null;
  axis.multiplyScalar(1 / len);
  const s0 = len * cfg.t;
  const mask = partMask(si.array as ArrayLike<number>, sw.array as ArrayLike<number>, subtree(cfg.bone));
  const g = new Float32Array(n);
  let any = false;
  for (let i = 0; i < n; i++) {
    const s = (pos.getX(i) - J.x) * axis.x + (pos.getY(i) - J.y) * axis.y + (pos.getZ(i) - J.z) * axis.z - s0;
    g[i] = mask[i] ? s : Math.min(s, 0) - 0.003;
    if (g[i] > 0) any = true;
  }
  if (!any) return null;
  const cut = cutMesh(index.array as ArrayLike<number>, g, pos.array as ArrayLike<number>);
  if (!cut.piece.length) return null;

  // Attributes, with the new vertices interpolated (skin weights from the chosen end).
  const attrs: Attr[] = [
    { name: 'position', size: 3, data: pos.array as ArrayLike<number> },
    { name: 'normal', size: 3, data: nor.array as ArrayLike<number> },
    { name: 'tangent', size: 4, data: tan.array as ArrayLike<number> },
    { name: 'uv', size: 2, data: uv.array as ArrayLike<number> },
  ];
  const m = cut.extra.length;
  const lerped = attrs.map((a) => {
    const out = new Float32Array(m * a.size);
    cut.extra.forEach((e, k) => {
      for (let c = 0; c < a.size; c++) out[k * a.size + c] = a.data[e.a * a.size + c] * (1 - e.t) + a.data[e.b * a.size + c] * e.t;
      if (a.name === 'normal' || a.name === 'tangent') {
        const o = k * a.size;
        const l = Math.hypot(out[o], out[o + 1], out[o + 2]) || 1;
        out[o] /= l;
        out[o + 1] /= l;
        out[o + 2] /= l;
        if (a.name === 'tangent') out[o + 3] = a.data[e.a * 4 + 3];
      }
    });
    return out;
  });
  const skinOf = (end: 'a' | 'b') => {
    const idx = new Uint16Array(m * 4);
    const wt = new Float32Array(m * 4);
    cut.extra.forEach((e, k) => {
      const v = e[end];
      for (let c = 0; c < 4; c++) {
        idx[k * 4 + c] = si.array[v * 4 + c];
        wt[k * 4 + c] = sw.array[v * 4 + c];
      }
    });
    return { idx, wt };
  };

  // ---- the piece, baked in the current pose
  const poser = new Poser(mesh);
  const remap = new Map<number, number>();
  const used: number[] = [];
  for (const i of cut.piece) if (!remap.has(i)) remap.set(i, used.push(i) - 1);
  const pn = used.length;
  const pieceSkin = skinOf('a');
  const skinAt = (i: number) => (i < n ? { idx: si.array, wt: sw.array, o: i * 4 } : { idx: pieceSkin.idx, wt: pieceSkin.wt, o: (i - n) * 4 });
  const val = (ai: number, i: number, c: number) => (i < n ? attrs[ai].data[i * attrs[ai].size + c] : lerped[ai][(i - n) * attrs[ai].size + c]);
  const wp = new Float32Array(pn * 3);
  const wn = new Float32Array(pn * 3);
  const wt4 = new Float32Array(pn * 4);
  const wu = new Float32Array(pn * 2);
  const centroid = new THREE.Vector3();
  for (let k = 0; k < pn; k++) {
    const i = used[k];
    const s = skinAt(i);
    v0.set(val(0, i, 0), val(0, i, 1), val(0, i, 2));
    poser.point(v1, v0, s.idx, s.wt, s.o);
    wp[k * 3] = v1.x;
    wp[k * 3 + 1] = v1.y;
    wp[k * 3 + 2] = v1.z;
    centroid.add(v1);
    v0.set(val(1, i, 0), val(1, i, 1), val(1, i, 2));
    poser.dir(v2, v0);
    wn[k * 3] = v2.x;
    wn[k * 3 + 1] = v2.y;
    wn[k * 3 + 2] = v2.z;
    v0.set(val(2, i, 0), val(2, i, 1), val(2, i, 2));
    poser.dir(v2, v0);
    wt4[k * 4] = v2.x;
    wt4[k * 4 + 1] = v2.y;
    wt4[k * 4 + 2] = v2.z;
    wt4[k * 4 + 3] = val(2, i, 3);
    wu[k * 2] = val(3, i, 0);
    wu[k * 2 + 1] = val(3, i, 1);
  }
  centroid.multiplyScalar(1 / pn);
  const box = new THREE.Box3();
  for (let k = 0; k < pn; k++) {
    wp[k * 3] -= centroid.x;
    wp[k * 3 + 1] -= centroid.y;
    wp[k * 3 + 2] -= centroid.z;
    box.expandByPoint(v0.set(wp[k * 3], wp[k * 3 + 1], wp[k * 3 + 2]));
  }
  const pg = new THREE.BufferGeometry();
  pg.setAttribute('position', new THREE.BufferAttribute(wp, 3));
  pg.setAttribute('normal', new THREE.BufferAttribute(wn, 3));
  pg.setAttribute('tangent', new THREE.BufferAttribute(wt4, 4));
  pg.setAttribute('uv', new THREE.BufferAttribute(wu, 2));
  pg.setIndex(cut.piece.map((i) => remap.get(i)!));
  pg.computeBoundingSphere();
  pg.name = `gore:${part}`;

  const group = new THREE.Group();
  group.name = `gore:${part}`;
  group.position.copy(centroid);
  const body = new THREE.Mesh(pg, mesh.material as THREE.Material);
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Piece-side cap: the rim posed, facing back towards the body (-axis).
  const worldAxis = new THREE.Vector3();
  const bigLoop = cut.rim.slice().sort((a, b) => b.length - a.length)[0];
  const ringWorld: THREE.Vector3[] = [];
  const ringBind: THREE.Vector3[] = [];
  const bodySkin = skinOf('b');
  if (bigLoop) {
    for (const id of bigLoop) {
      const k = id - n;
      v0.set(lerped[0][k * 3], lerped[0][k * 3 + 1], lerped[0][k * 3 + 2]);
      ringBind.push(v0.clone());
      poser.point(v1, v0, pieceSkin.idx, pieceSkin.wt, k * 4);
      ringWorld.push(v1.clone());
    }
    // axis in the piece's frame: pose a point a little along the axis from the rim centre
    const cb = new THREE.Vector3();
    for (const p of ringBind) cb.add(p);
    cb.multiplyScalar(1 / ringBind.length);
    const k0 = bigLoop[0] - n;
    poser.point(v1, cb, pieceSkin.idx, pieceSkin.wt, k0 * 4);
    v2.copy(cb).addScaledVector(axis, 0.05);
    poser.point(v0, v2, pieceSkin.idx, pieceSkin.wt, k0 * 4);
    worldAxis.subVectors(v0, v1).normalize();
  } else {
    worldAxis.copy(axis).transformDirection(mesh.matrixWorld);
  }
  const pieceOut = worldAxis.clone().negate();
  let pieceStump: THREE.Object3D;
  if (ringWorld.length >= 3) {
    pieceStump = buildCap(ringWorld.map((p) => p.clone().sub(centroid)), pieceOut).anchor;
  } else {
    pieceStump = new THREE.Group();
    pieceStump.name = 'gore:stump';
    pieceStump.quaternion.setFromUnitVectors(Y, pieceOut);
  }
  group.add(pieceStump);

  // Whatever hangs from the collapsing bone goes with the piece (weapon, shield, helmet, hair).
  group.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(group.matrixWorld).invert();
  const mm = new THREE.Matrix4();
  const sockets: THREE.Object3D[] = [];
  childBone.traverse((o) => {
    if ((o as THREE.Bone).isBone) return;
    if (o.parent && (o.parent as THREE.Bone).isBone) sockets.push(o);
  });
  const adopt = (child: THREE.Object3D) => {
    if (!child.visible || child.name.startsWith('gore:')) return;
    const copy = child.clone(true);
    copy.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.isMesh && me.geometry) me.geometry = me.geometry.clone();
    });
    copy.matrixAutoUpdate = true;
    mm.multiplyMatrices(inv, child.matrixWorld).decompose(copy.position, copy.quaternion, copy.scale);
    group.add(copy);
  };
  for (const s of sockets) {
    // A mesh hung straight on the bone (hair, a helmet) goes with it; so do a socket's children.
    if ((s as THREE.Mesh).isMesh) adopt(s);
    else for (const child of s.children) adopt(child);
  }
  if (part === 'head') bakeEyes(avatar, poser, group, centroid);

  // ---- the body: its own geometry without the piece, a cap on the stump
  const bn = n + m;
  const bodyAttr = (ai: number) => {
    const a = attrs[ai];
    const out = new Float32Array(bn * a.size);
    out.set(a.data as ArrayLike<number> as Float32Array, 0);
    out.set(lerped[ai], n * a.size);
    return new THREE.BufferAttribute(out, a.size);
  };
  const bg = new THREE.BufferGeometry();
  bg.setAttribute('position', bodyAttr(0));
  bg.setAttribute('normal', bodyAttr(1));
  bg.setAttribute('tangent', bodyAttr(2));
  bg.setAttribute('uv', bodyAttr(3));
  const bidx = new Uint16Array(bn * 4);
  const bwt = new Float32Array(bn * 4);
  for (let i = 0; i < n * 4; i++) {
    bidx[i] = si.array[i];
    bwt[i] = sw.array[i];
  }
  bidx.set(bodySkin.idx, n * 4);
  bwt.set(bodySkin.wt, n * 4);
  bg.setAttribute('skinIndex', new THREE.BufferAttribute(bidx, 4));
  bg.setAttribute('skinWeight', new THREE.BufferAttribute(bwt, 4));
  bg.setIndex(new THREE.BufferAttribute(bn > 65535 ? Uint32Array.from(cut.body) : Uint16Array.from(cut.body), 1));
  if (geo.boundingSphere) bg.boundingSphere = geo.boundingSphere.clone();
  bg.name = `gore:body:${part}`;
  bg.userData.gore = true;
  const old = geo;
  mesh.geometry = bg;
  mesh.userData.goreGeometry = bg;
  const mine = (mesh.userData.goreOwned ??= []) as THREE.BufferGeometry[];
  if (old.userData.gore) old.dispose();
  mine.push(bg);

  // Body cap: on the cut bone, in its frame, facing out along +axis.
  const cutBone = avatar.bones[B[cfg.bone]];
  const boneInv = mesh.skeleton.boneInverses[B[cfg.bone]];
  let bodyStump: THREE.Object3D;
  if (ringBind.length >= 3) {
    const local = ringBind.map((p) => p.clone().applyMatrix4(boneInv));
    const out = axis.clone().transformDirection(boneInv);
    bodyStump = buildCap(local, out).anchor;
  } else {
    bodyStump = new THREE.Group();
    bodyStump.name = 'gore:stump';
    bodyStump.position.copy(J).applyMatrix4(boneInv);
    bodyStump.quaternion.setFromUnitVectors(Y, axis);
  }
  cutBone.add(bodyStump);
  const caps = (mesh.userData.goreCaps ??= []) as THREE.Object3D[];
  caps.push(bodyStump);
  if (!mesh.userData.goreHooked) {
    mesh.userData.goreHooked = true;
    // Free what only this body owns when it leaves the scene (the geometry is re-uploaded if it returns).
    avatar.root.addEventListener('removed', () => {
      for (const o of (mesh.userData.goreOwned as THREE.BufferGeometry[]) ?? []) o.dispose();
      for (const c of (mesh.userData.goreCaps as THREE.Object3D[]) ?? []) c.traverse((o) => {
        const me = o as THREE.Mesh;
        if (me.isMesh && !me.userData.sharedGeometry) me.geometry.dispose();
      });
    });
  }

  // Collapse the rest of the limb on the body (its attachments vanish into the joint).
  childBone.scale.setScalar(0.0001);
  const half = box.getSize(new THREE.Vector3()).multiplyScalar(0.5);
  return { group, half, pieceStump, bodyStump };
}

/** The eyes ride with a severed head: baked in the pose, same material and `eyeLocal`. */
function bakeEyes(avatar: HumanoidAvatar, poser: Poser, group: THREE.Group, centroid: THREE.Vector3) {
  const eyes = avatar.root.getObjectByName('humanoid:eyes') as THREE.SkinnedMesh | undefined;
  if (!eyes?.isSkinnedMesh) return;
  const g = eyes.geometry;
  const p = g.getAttribute('position') as THREE.BufferAttribute;
  const nn = g.getAttribute('normal') as THREE.BufferAttribute;
  const el = g.getAttribute('eyeLocal') as THREE.BufferAttribute | undefined;
  const si = g.getAttribute('skinIndex') as THREE.BufferAttribute;
  const sw = g.getAttribute('skinWeight') as THREE.BufferAttribute;
  const ix = g.getIndex();
  if (!p || !nn || !si || !sw || !ix) return;
  const pos = new Float32Array(p.count * 3);
  const nor = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    v0.fromBufferAttribute(p, i);
    poser.point(v1, v0, si.array, sw.array, i * 4);
    pos[i * 3] = v1.x - centroid.x;
    pos[i * 3 + 1] = v1.y - centroid.y;
    pos[i * 3 + 2] = v1.z - centroid.z;
    v0.fromBufferAttribute(nn, i);
    poser.dir(v2, v0);
    nor[i * 3] = v2.x;
    nor[i * 3 + 1] = v2.y;
    nor[i * 3 + 2] = v2.z;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  if (el) out.setAttribute('eyeLocal', el.clone());
  out.setIndex(new THREE.BufferAttribute(ix.array.slice() as Uint16Array, 1));
  const mesh = new THREE.Mesh(out, eyes.material);
  mesh.name = 'gore:eyes';
  group.add(mesh);
}
