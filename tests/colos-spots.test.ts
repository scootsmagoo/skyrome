/**
 * Every spot the Colosseum-valley builders hand to the gameplay team must be somewhere a person
 * can stand: not under the real terrain (a teleport or an NPC schedule would drop them through
 * the world), not inside furniture or walls, and not floating over the ground. Checked against
 * the real heightmap with the real pads, and against each builder's own colliders.
 */
import * as THREE from 'three';
import { beforeAll, describe, expect, it } from 'vitest';
import * as atlas from '../src/data/atlas';
import type { ColliderSpec } from '../src/gfx/MeshBuilder';
import type { LandmarkBuild, LandmarkBuilder } from '../src/world/landmarks/types';
import { builders as colosseum } from '../src/world/landmarks/builders/colos-colosseum';
import { builders as ludus } from '../src/world/landmarks/builders/colos-ludus';
import { builders as fountains } from '../src/world/landmarks/builders/colos-fountains';
import { builders as baths } from '../src/world/landmarks/builders/colos-baths';
import { builders as caelian } from '../src/world/landmarks/builders/colos-caelian';
import { builders as quarter } from '../src/world/landmarks/builders/colos-quarter';
import { COLOS_IDS, ctxFor } from './colos-ctx';

const ALL: LandmarkBuilder[] = [...colosseum, ...ludus, ...fountains, ...baths, ...caelian, ...quarter];
const built = new Map<string, { out: LandmarkBuild; ground: (x: number, z: number) => number }>();

beforeAll(() => {
  for (const id of COLOS_IDS) {
    const ctx = ctxFor(id);
    built.set(id, { out: ALL.find((b) => b.handles.includes(id))!.build(ctx), ground: ctx.groundAt });
  }
}, 120_000);

const _p = new THREE.Vector3();
const _q = new THREE.Quaternion();

/** Is the local point inside a box / cylinder collider? (Trimeshes are not tested.) */
function inside(c: ColliderSpec, x: number, y: number, z: number): boolean {
  if (c.kind === 'cylinder') {
    return Math.hypot(x - c.center.x, z - c.center.z) <= c.radius && Math.abs(y - c.center.y) <= c.halfHeight;
  }
  if (c.kind !== 'box') return false;
  _p.set(x, y, z).sub(c.center);
  if (c.rotation) _p.applyQuaternion(_q.copy(c.rotation).invert());
  return Math.abs(_p.x) <= c.half.x && Math.abs(_p.y) <= c.half.y && Math.abs(_p.z) <= c.half.z;
}

/** Highest up-facing triangle of a trimesh under (x, z) that is no higher than `maxY`, or null. */
function trimeshTop(c: Extract<ColliderSpec, { kind: 'trimesh' }>, x: number, z: number, maxY: number): number | null {
  const pos = c.geometry.getAttribute('position');
  const idx = c.geometry.index;
  const n = idx ? idx.count : pos.count;
  const m = c.matrix;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3();
  let best: number | null = null;
  for (let i = 0; i < n; i += 3) {
    a.fromBufferAttribute(pos, idx ? idx.getX(i) : i);
    b.fromBufferAttribute(pos, idx ? idx.getX(i + 1) : i + 1);
    d.fromBufferAttribute(pos, idx ? idx.getX(i + 2) : i + 2);
    if (m) {
      a.applyMatrix4(m);
      b.applyMatrix4(m);
      d.applyMatrix4(m);
    }
    // Barycentric point-in-triangle on the xz plane.
    const den = (b.z - d.z) * (a.x - d.x) + (d.x - b.x) * (a.z - d.z);
    if (Math.abs(den) < 1e-9) continue;
    const u = ((b.z - d.z) * (x - d.x) + (d.x - b.x) * (z - d.z)) / den;
    const v = ((d.z - a.z) * (x - d.x) + (a.x - d.x) * (z - d.z)) / den;
    const w = 1 - u - v;
    if (u < 0 || v < 0 || w < 0) continue;
    const y = u * a.y + v * b.y + w * d.y;
    if (y <= maxY && (best === null || y > best)) best = y;
  }
  return best;
}

/** Top of the highest collider surface under (x, z) that is no higher than `maxY`, or null. */
function topUnder(cs: ColliderSpec[], x: number, z: number, maxY: number): number | null {
  let best: number | null = null;
  for (const c of cs) {
    let top: number | null;
    if (c.kind === 'cylinder') {
      if (Math.hypot(x - c.center.x, z - c.center.z) > c.radius) continue;
      top = c.center.y + c.halfHeight;
    } else if (c.kind === 'box') {
      // The point's footprint inside the (possibly yawed) box, at the box's mid height.
      if (!inside(c, x, c.center.y, z)) continue;
      top = c.center.y + c.half.y;
    } else {
      top = trimeshTop(c, x, z, maxY);
    }
    if (top !== null && top <= maxY && (best === null || top > best)) best = top;
  }
  return best;
}

/** The colliders a person (a 0.3 m-radius column from knee to head) standing at the spot touches. */
function bodyHits(cs: ColliderSpec[], x: number, y: number, z: number): ColliderSpec[] {
  const ring: [number, number][] = [[0, 0]];
  for (let k = 0; k < 8; k++) ring.push([Math.cos((k * Math.PI) / 4) * 0.3, Math.sin((k * Math.PI) / 4) * 0.3]);
  const out: ColliderSpec[] = [];
  for (const c of cs) {
    let hit = false;
    for (const [dx, dz] of ring) for (let h = 0.45; h <= 1.75 && !hit; h += 0.25) hit = inside(c, x + dx, y + h, z + dz);
    if (hit) out.push(c);
  }
  return out;
}

/** Spots a character is placed ON (feet at the spot). */
const STANDING = new Set(['npc', 'vendor', 'spawn', 'door', 'inscription']);

describe('colos spots are standable', () => {
  it.each(COLOS_IDS)('%s: no spot is under the terrain', (id) => {
    const { out, ground } = built.get(id)!;
    const bad: string[] = [];
    for (const s of out.spots ?? []) {
      const g = ground(s.position.x, s.position.z);
      if (s.position.y < g - 0.1) bad.push(`${s.id} (${s.kind}) y=${s.position.y.toFixed(2)} terrain=${g.toFixed(2)}`);
    }
    expect(bad).toEqual([]);
  });

  it.each(COLOS_IDS)('%s: people stand clear of furniture and walls, on something', (id) => {
    const { out, ground } = built.get(id)!;
    const bad: string[] = [];
    for (const s of out.spots ?? []) {
      if (!STANDING.has(s.kind)) continue;
      const { x, y, z } = s.position;
      const hits = bodyHits(out.colliders, x, y, z);
      if (hits.length) {
        const at = (v: THREE.Vector3) => `(${v.x.toFixed(1)}, ${v.y.toFixed(1)}, ${v.z.toFixed(1)})`;
        const what = hits
          .slice(0, 3)
          .map((hit) => (hit.kind === 'box' ? `box ${at(hit.center)} half ${at(hit.half)}` : hit.kind === 'cylinder' ? `cylinder ${at(hit.center)} r ${hit.radius.toFixed(2)} h ${(hit.halfHeight * 2).toFixed(1)}` : 'trimesh'))
          .join('; ');
        bad.push(`${s.id} (${s.kind}) at ${at(s.position)} is inside ${what}`);
      }
      // Supported: the floor under the spot (terrain or the top of a collider within reach) is within 0.3 m.
      const top = topUnder(out.colliders, x, z, y + 0.3);
      const floor = Math.max(ground(x, z), top ?? -Infinity);
      if (y - floor >= 0.35) bad.push(`${s.id} (${s.kind}) floats ${(y - floor).toFixed(2)} m above its floor`);
    }
    expect(bad).toEqual([]);
  });
});
