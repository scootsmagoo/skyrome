/**
 * What comes off, and which vertices it takes with it (pure: no scene, so it runs in tests).
 *
 * A part is cut at one bone of the humanoid rig (actors/avatar/rig.ts): everything skinned mostly
 * to that bone and its descendants leaves with it (a forearm takes the hand and what it holds).
 */
import { BONES, PARENT, type BoneName } from '../../actors/avatar/rig';

export type Part = 'head' | 'armL' | 'armR' | 'forearmL' | 'forearmR' | 'legL' | 'legR' | 'shinL' | 'shinR';
export type GoreLevel = 'off' | 'normal' | 'ultra';

export const CUT_BONE: Readonly<Record<Part, BoneName>> = {
  head: 'head',
  armL: 'upperArmL',
  armR: 'upperArmR',
  forearmL: 'forearmL',
  forearmR: 'forearmR',
  legL: 'thighL',
  legR: 'thighR',
  shinL: 'shinL',
  shinR: 'shinR',
};

/** Stump radius (m) at each cut, for the flesh caps. */
export const STUMP_RADIUS: Readonly<Record<Part, number>> = {
  head: 0.065,
  armL: 0.055,
  armR: 0.055,
  forearmL: 0.045,
  forearmR: 0.045,
  legL: 0.08,
  legR: 0.08,
  shinL: 0.06,
  shinR: 0.06,
};

/**
 * Where a realistic body is cut (dismemberReal.ts): the cut plane crosses `bone` at the fraction `t` of
 * its length (towards `child`), perpendicular to the bone, so a stump of the bone remains; `child` is
 * the bone that collapses on the body (and takes whatever hangs from it).
 */
export const REAL_CUT: Readonly<Record<Part, { bone: BoneName; child: BoneName; t: number }>> = {
  head: { bone: 'neck', child: 'head', t: 0.5 },
  armL: { bone: 'upperArmL', child: 'forearmL', t: 0.55 },
  armR: { bone: 'upperArmR', child: 'forearmR', t: 0.55 },
  forearmL: { bone: 'forearmL', child: 'handL', t: 0.5 },
  forearmR: { bone: 'forearmR', child: 'handR', t: 0.5 },
  legL: { bone: 'thighL', child: 'shinL', t: 0.5 },
  legR: { bone: 'thighR', child: 'shinR', t: 0.5 },
  shinL: { bone: 'shinL', child: 'footL', t: 0.5 },
  shinR: { bone: 'shinR', child: 'footR', t: 0.5 },
};

/** Bone indices of `bone` and everything below it. */
export function subtree(bone: BoneName): Set<number> {
  const out = new Set<number>();
  BONES.forEach((name, i) => {
    for (let b: BoneName | null = name; b; b = PARENT[b]) {
      if (b === bone) {
        out.add(i);
        return;
      }
    }
  });
  return out;
}

/** Which vertices go with the part: at least half their skin weight on the subtree's bones. */
export function partMask(skinIndex: ArrayLike<number>, skinWeight: ArrayLike<number>, bones: Set<number>): Uint8Array {
  const n = Math.floor(skinIndex.length / 4);
  const mask = new Uint8Array(n);
  for (let v = 0; v < n; v++) {
    let w = 0;
    for (let k = 0; k < 4; k++) if (bones.has(skinIndex[v * 4 + k])) w += skinWeight[v * 4 + k];
    if (w >= 0.5) mask[v] = 1;
  }
  return mask;
}

/** Triangles (as index triples) whose three corners all go with the part. */
export function partTriangles(index: ArrayLike<number>, mask: Uint8Array): number[] {
  const out: number[] = [];
  for (let i = 0; i + 2 < index.length; i += 3) {
    const a = index[i];
    const b = index[i + 1];
    const c = index[i + 2];
    if (mask[a] && mask[b] && mask[c]) out.push(a, b, c);
  }
  return out;
}

export interface Blow {
  /** The weapon cuts (a blade); clubs, fists and spears don't take limbs off. */
  blade: boolean;
  power: boolean;
  /** Power-attack direction (sideways sweeps and overheads go for the head). */
  direction?: 'none' | 'forward' | 'sideways' | 'back';
  rng: () => number;
}

/**
 * What a killing blow takes off. Ultra: every killing cut severs something, a power attack often
 * two things; normal: a power attack often, a light one sometimes; off: nothing.
 */
export function chooseParts(blow: Blow, level: GoreLevel, severed: ReadonlySet<Part> = new Set()): Part[] {
  if (level === 'off' || !blow.blade) return [];
  const r = blow.rng;
  const chance = level === 'ultra' ? 1 : blow.power ? 0.6 : 0.25;
  if (r() >= chance) return [];
  const out: Part[] = [];
  const pick = (): Part | null => {
    const side = r() < 0.5 ? 'L' : 'R';
    const x = r();
    // Overheads and sweeps go for the head; lunges and light cuts anywhere.
    const head = blow.power && (blow.direction === 'sideways' || blow.direction === 'none') ? 0.6 : 0.35;
    let p: Part;
    if (x < head) p = 'head';
    else if (x < head + (1 - head) * 0.6) p = (r() < 0.5 ? `arm${side}` : `forearm${side}`) as Part;
    else p = (r() < 0.4 ? `leg${side}` : `shin${side}`) as Part;
    return taken(p, severed, out) ? null : p;
  };
  const first = pick();
  if (first) out.push(first);
  if (level === 'ultra' && blow.power && r() < 0.4) {
    const second = pick();
    if (second) out.push(second);
  }
  return out;
}

/** Already gone, or inside (or containing) something already gone? */
function taken(p: Part, severed: ReadonlySet<Part>, picked: Part[]): boolean {
  const all = new Set<Part>([...severed, ...picked]);
  if (all.has(p)) return true;
  const side = p.slice(-1);
  if (p.startsWith('arm') || p.startsWith('forearm')) return all.has(`arm${side}` as Part) || all.has(`forearm${side}` as Part);
  if (p.startsWith('leg') || p.startsWith('shin')) return all.has(`leg${side}` as Part) || all.has(`shin${side}` as Part);
  return false;
}

/** Blood per blow: droplets for a hit of `damage` (blunt bleeds less), scaled by the gore level. */
export function dropletsFor(damage: number, blunt: boolean, level: GoreLevel): number {
  if (level === 'off' || !(damage > 0)) return 0;
  const base = Math.min(140, 10 + damage * (blunt ? 1.2 : 3));
  return Math.round(base * (level === 'ultra' ? 2.2 : 1));
}
