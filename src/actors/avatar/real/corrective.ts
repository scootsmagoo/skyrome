/**
 * Pose-space correctives for the shoulders and armpits of the realistic bodies.
 *
 * The sculpt has its arms 22 degrees out from the torso, with an open armpit. The game's bind pose
 * (arms straight down) closes it, so with the arm raised, plain linear blend skinning (LBS) gives a
 * stretched web of skin under the arm. tools/characters/build_body.py (stage 5b) solves, for each
 * side and for four sample poses (arm out sideways and forwards, by 90 and 150 degrees), the shape
 * that skinning the sculpt's own A-pose to that pose gives, and stores the difference to the
 * bind-pose LBS result as morph targets (bind-space deltas, so skin(bind + d) lands on the solved
 * shape), with their normals. They ride in the GLB on LOD 0 and 1 (`abd90L`, `abd150L`, `flex90L`,
 * `flex150L`, and R); only LOD 0 uses them.
 *
 *   addCorrectives(geometry, ctx)   per appearance geometry: shares the template's morph attributes
 *   updateCorrectives(mesh, bones)  every frame: influences from the upper-arm direction
 *
 * The influence of a target is (elevation basis) x (plane basis): the elevation of the upper arm
 * from hanging (0 at rest, 1 at the sample, 150 degrees beyond), and how far the arm points
 * sideways (abduction) or forwards (flexion). In between, the shapes blend; arms behind the back
 * get the abduction shape faded by the direction.
 */
import * as THREE from 'three';
import { B } from '../rig';
import type { BodyArrays } from './morph';
import { refRig } from './refs';
import type { AddCorrectives, UpdateCorrectives } from './types';

/** Target names per side, in the order of the geometry's morph attributes. */
export const CORRECTIVE_TARGETS = ['abd90', 'abd150', 'flex90', 'flex150'] as const;
export const CORRECTIVE_ORDER: readonly string[] = [...CORRECTIVE_TARGETS.map((t) => `${t}L`), ...CORRECTIVE_TARGETS.map((t) => `${t}R`)];

/**
 * Influences [abd90, abd150, flex90, flex150] for an upper arm pointing along `(dx, dy, dz)` (unit,
 * in the chest's frame; hanging = (0, -1, 0)). `out` is +1 when pointing away from the body.
 */
export function correctiveInfluences(out: number, dy: number, dz: number, res: number[]): void {
  const e = (Math.acos(Math.max(-1, Math.min(1, -dy))) * 180) / Math.PI;
  res[0] = res[1] = res[2] = res[3] = 0;
  if (e < 1) return;
  const ph = Math.atan2(dz, out);
  const c = Math.cos(ph);
  const s = Math.sin(ph);
  const wAbd = c > 1e-6 ? c * c : 0;
  const wFlex = s > 1e-6 ? s * s : 0;
  // Elevation basis: hanging 0, 90 -> 1, 150 -> second sample; linear between.
  const a90 = e < 90 ? e / 90 : Math.max(0, (150 - e) / 60);
  const a150 = e < 90 ? 0 : Math.min(1, (e - 90) / 60);
  res[0] = wAbd * a90;
  res[1] = wAbd * a150;
  res[2] = wFlex * a90;
  res[3] = wFlex * a150;
}

/**
 * Attach the baked deltas as relative morph targets of a LOD 0 body geometry. The attributes are
 * shared by every appearance of a sex (built once per template, so a body costs no extra CPU memory
 * and the GPU only holds the morph texture of geometries that are drawn); a taller or shorter body
 * scales the influences instead (`userData.correctiveScale`, see updateCorrectives). Other LODs
 * (14 m and beyond, where an armpit is a few pixels) get none.
 */
export const addCorrectives: AddCorrectives = (geometry, ctx) => {
  const src = ctx.body.morphs;
  if (ctx.lod > 0 || !src?.length) return;
  let shared = templates.get(ctx.body);
  if (shared === undefined) {
    shared = build(src);
    templates.set(ctx.body, shared);
  }
  if (!shared) return;
  geometry.morphAttributes.position = shared.position;
  if (shared.normal) geometry.morphAttributes.normal = shared.normal;
  geometry.morphTargetsRelative = true;
  // Deltas are baked for the reference rig: scale them with the body's overall size.
  geometry.userData.correctiveScale = ctx.rig.s / refRig(ctx.sex).s;
};

interface Shared {
  position: THREE.BufferAttribute[];
  normal?: THREE.BufferAttribute[];
}

const templates = new WeakMap<object, Shared | null>();

function build(src: NonNullable<BodyArrays['morphs']>): Shared | null {
  const byName = new Map(src.map((m) => [m.name, m] as const));
  if (!CORRECTIVE_ORDER.every((n) => byName.has(n))) return null;
  const mk = (name: string, data: Float32Array) => {
    const a = new THREE.BufferAttribute(data, 3);
    a.name = name;
    return a;
  };
  const position = CORRECTIVE_ORDER.map((n) => mk(n, byName.get(n)!.delta));
  // The normals follow (the shaded armpit hollow needs them).
  const normal = CORRECTIVE_ORDER.every((n) => byName.get(n)!.normal) ? CORRECTIVE_ORDER.map((n) => mk(n, byName.get(n)!.normal!)) : undefined;
  return { position, normal };
}

const q = new THREE.Quaternion();
const dir = new THREE.Vector3();
const inf = [0, 0, 0, 0];
const SIDES = [
  { shoulder: B.shoulderL as number, arm: B.upperArmL as number, sign: 1, base: 0 },
  { shoulder: B.shoulderR as number, arm: B.upperArmR as number, sign: -1, base: 4 },
] as const;

/** Drive the morph influences from the upper-arm directions (a no-op for geometry without correctives). */
export const updateCorrectives: UpdateCorrectives = (mesh, bones) => {
  const targets = mesh.geometry.morphAttributes.position;
  if (!targets || targets.length < 8) return;
  let infl = mesh.morphTargetInfluences;
  if (!infl || infl.length < 8) {
    infl = mesh.morphTargetInfluences = new Array<number>(targets.length).fill(0);
  }
  const scale = (mesh.geometry.userData.correctiveScale as number | undefined) ?? 1;
  for (const s of SIDES) {
    // Upper-arm direction in the chest's frame: the shoulder's and the arm's rotations (rest = identity).
    q.copy(bones[s.shoulder].quaternion).multiply(bones[s.arm].quaternion);
    dir.set(0, -1, 0).applyQuaternion(q);
    correctiveInfluences(dir.x * s.sign, dir.y, dir.z, inf);
    for (let k = 0; k < 4; k++) infl[s.base + k] = inf[k] * scale;
  }
};

