/**
 * Forum of Trajan complex: floor coverage and fall-through checks on the colliders the builders
 * hand to physics (pure, see tests/helpers/colliderProbe.ts). Every walkable visual floor must
 * have a collider top at its height, the Markets' upper level must have no edge a walker can step
 * off, the exedrae and apses no pits, and the authored spots must stand on a floor and in the clear.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/Rng';
import { bearingToRotationY } from '../src/core/math';
import { LANDMARK_BY_ID } from '../src/data/atlas';
import { MeshBuilder, transformCollider, type ColliderSpec } from '../src/gfx/MeshBuilder';
import { toGame } from '../src/world/coords';
import { builderFor } from '../src/world/landmarks/registry';
import type { LandmarkBuild, LandmarkData } from '../src/world/landmarks/types';
import { BAS } from '../src/world/landmarks/builders/trajan-basilica';
import { FORUM_X, FORUM_Y } from '../src/world/landmarks/builders/trajan-forum';
import { MK, marketsPolar } from '../src/world/landmarks/builders/trajan-markets';
import { forumToLocal } from '../src/world/landmarks/builders/trajan-layout';
import { EXTRAS, extraPlacement, inHours } from '../src/world/landmarks/builders/trajan-extras';
import { ColliderProbe, flood } from './helpers/colliderProbe';

// Building all eight landmarks at high detail takes a few seconds (more under a parallel run).
const IDS = ['forum-trajan', 'forum-trajan-gateway', 'equus-traiani', 'basilica-ulpia', 'column-trajan', 'bibliotheca-ulpia-east', 'bibliotheca-ulpia-west', 'markets-trajan'];
const DEG = Math.PI / 180;
const lmOf = (id: string) => LANDMARK_BY_ID[id] as unknown as LandmarkData;

const builds = new Map<string, LandmarkBuild>();
function get(id: string): LandmarkBuild {
  let b = builds.get(id);
  if (!b) {
    const lm = lmOf(id);
    b = builderFor(lm)!.build({ game: {} as never, lm, S: 0.6, rng: new Rng(id), detail: 'high', builder: () => new MeshBuilder(), groundAt: () => 0 });
    builds.set(id, b);
  }
  return b;
}

function placement(id: string): THREE.Matrix4 {
  const lm = lmOf(id);
  const [gx, gz] = toGame(lm.center[0], lm.center[1]);
  return new THREE.Matrix4().makeRotationY(bearingToRotationY(lm.rotation)).setPosition(gx, 0, gz);
}

/** One landmark's colliders in its local frame. */
const localProbe = (id: string) => new ColliderProbe(get(id).colliders);

let world: ColliderProbe | null = null;
/** The whole complex in world space (all pads at the same height). */
function worldProbe(): ColliderProbe {
  if (world) return world;
  const cols: ColliderSpec[] = [];
  for (const id of IDS) for (const c of get(id).colliders) cols.push(transformCollider(c, placement(id)));
  return (world = new ColliderProbe(cols));
}

/** Sample a polar annular sector about (cx, cz); returns the points that fail `ok`. */
function sector(cx: number, cz: number, r0: number, r1: number, a0: number, a1: number, dr: number, ok: (x: number, z: number) => boolean): [number, number][] {
  const bad: [number, number][] = [];
  for (let r = r0; r <= r1 + 1e-9; r += dr) {
    const n = Math.max(2, Math.ceil((Math.abs(a1 - a0) * r) / dr));
    for (let i = 0; i <= n; i++) {
      const a = a0 + ((a1 - a0) * i) / n;
      const x = cx + Math.cos(a) * r;
      const z = cz + Math.sin(a) * r;
      if (!ok(x, z)) bad.push([+x.toFixed(2), +z.toFixed(2)]);
    }
  }
  return bad;
}

describe('trajan floors: colliders under every walkable floor', { timeout: 60_000 }, () => {
  it('builders hand physics no degenerate boxes', () => {
    for (const id of IDS) {
      for (const c of get(id).colliders) {
        if (c.kind !== 'box') continue;
        expect(Math.min(c.half.x, c.half.y, c.half.z), id).toBeGreaterThan(0.004);
      }
    }
  });

  it('the Markets upper level (street, both rows of shops, terraces, landing) is floored at 8.4 m', () => {
    const p = localProbe('markets-trajan');
    const P = marketsPolar(lmOf('markets-trajan'));
    const a0 = P.bulge - MK.half;
    const a1 = P.bulge + MK.half;
    const ok = (x: number, z: number) => p.floorNear(x, z, MK.y2, 0.06);
    // The whole deck between the third-storey front wall and the outer shops' back wall.
    const deck = sector(P.c.x, P.c.z, MK.rT + 0.65, MK.rO + 0.5, a0 + 0.2 * DEG, a1, 0.3, ok);
    expect(deck.length, `unfloored deck points, e.g. ${JSON.stringify(deck.slice(0, 6))}`).toBe(0);
    // The landing beyond the street's south end, either side of the stairwell.
    const aS = a1 + 7 * DEG;
    const slot = Math.asin((1.0 + 0.55 + 0.35) / MK.rT);
    for (const [e0, e1] of [
      [a1, aS - slot],
      [aS + slot, a1 + 14 * DEG],
    ]) {
      const land = sector(P.c.x, P.c.z, MK.rT + 0.35, MK.rO + 0.5, e0, e1, 0.3, ok);
      expect(land.length, `unfloored landing points, e.g. ${JSON.stringify(land.slice(0, 6))}`).toBe(0);
    }
  });

  it('the Markets upper level has no edge to fall off, from the stair head to the Great Hall', () => {
    const p = localProbe('markets-trajan');
    const P = marketsPolar(lmOf('markets-trajan'));
    const aS = P.bulge + MK.half + 7 * DEG;
    const r = MK.rO - 1.0;
    const start = new THREE.Vector3(P.c.x + Math.cos(aS) * r, MK.y2, P.c.z + Math.sin(aS) * r);
    // Stay on the upper level (the stair flight down is a gradual descent and leaves it).
    const res = flood(p, start, 0.35, (_x, _z, y) => y > MK.y2 - 1.2);
    const pts = res.drops.map((d) => [+d.x.toFixed(1), +d.z.toFixed(1), d.to === -Infinity ? 'void' : +d.to.toFixed(2)]);
    expect(res.reached.size).toBeGreaterThan(3000);
    expect(pts.length, `drops off the upper level at ${JSON.stringify(pts.slice(0, 12))}`).toBe(0);
  });

  it('the exedrae are floored right up to the curved wall, with nothing poking out behind it', () => {
    const p = localProbe('forum-trajan');
    const R = FORUM_X.exedraR;
    const tW = FORUM_X.exedraT;
    for (const s of [-1, 1]) {
      const cx = (s * (FORUM_X.wallIn + FORUM_X.wallOut)) / 2;
      const cz = FORUM_X.exedraZ;
      const a0 = s > 0 ? -Math.PI / 2 : Math.PI / 2;
      const inside = sector(cx, cz, 0.3, R - 0.3, a0, a0 + Math.PI, 0.25, (x, z) => p.floorNear(x, z, FORUM_Y.styl, 0.03));
      expect(inside.length, `pits in exedra ${s}: ${JSON.stringify(inside.slice(0, 6))}`).toBe(0);
      // Behind the wall: no raised floor outside the wall's outer face.
      const behind = sector(cx, cz, R + tW + 0.05, R + tW + 1.5, a0 + 2 * DEG, a0 + Math.PI - 2 * DEG, 0.25, (x, z) => !p.tops(x, z).some((t) => t > 0.1 && t < 2));
      expect(behind.length, `floor poking out behind exedra ${s}: ${JSON.stringify(behind.slice(0, 6))}`).toBe(0);
    }
  });

  it('the basilica apses are floored right up to the curved wall', () => {
    const p = localProbe('basilica-ulpia');
    const F = forumToLocal(lmOf('basilica-ulpia'));
    const B = BAS;
    for (const sx of [-1, 1]) {
      // Sample in the forum frame and map into the basilica's local frame.
      const cx = sx * (B.half - B.t / 2);
      const a0 = sx > 0 ? -Math.PI / 2 : Math.PI / 2;
      const map = (x: number, z: number) => new THREE.Vector3(x, 0, z).applyMatrix4(F);
      const inside = sector(cx, B.zc, 0.3, B.apseR - 0.3, a0, a0 + Math.PI, 0.25, (x, z) => {
        const q = map(x, z);
        return p.floorNear(q.x, q.z, B.yF, 0.03);
      });
      expect(inside.length, `pits in apse ${sx}: ${JSON.stringify(inside.slice(0, 6))}`).toBe(0);
      const behind = sector(cx, B.zc, B.apseR + B.apseT + 0.05, B.apseR + B.apseT + 1.5, a0 + 2 * DEG, a0 + Math.PI - 2 * DEG, 0.25, (x, z) => {
        const q = map(x, z);
        return !p.tops(q.x, q.z).some((t) => t > 0.1 && t < 2);
      });
      expect(behind.length, `floor poking out behind apse ${sx}: ${JSON.stringify(behind.slice(0, 6))}`).toBe(0);
    }
  });
});

describe('trajan spots stand on a floor and in the clear', { timeout: 60_000 }, () => {
  const STANDING = new Set(['npc', 'vendor', 'stall', 'spawn', 'shrine', 'vista', 'door']);
  const spots = () =>
    IDS.flatMap((id) => {
      const m = placement(id);
      return (get(id).spots ?? []).map((s) => ({ lm: id, id: s.id, kind: s.kind, p: s.position.clone().applyMatrix4(m) }));
    });

  it('people stand on a floor (within a few cm) and no wall, column or prop overlaps them', () => {
    const w = worldProbe();
    const floating: string[] = [];
    const inside: string[] = [];
    for (const s of spots()) {
      if (!STANDING.has(s.kind) && s.kind !== 'sit') continue;
      // The pads are flat at y = 0 here (the terrain stands in for a floor at ground level).
      const tops = [0, ...w.tops(s.p.x, s.p.z, 0.12)];
      if (!tops.some((t) => t <= s.p.y + 0.06 && t >= s.p.y - 0.1)) floating.push(`${s.id} y=${s.p.y.toFixed(2)} tops=${tops.map((t) => t.toFixed(2)).join(',')}`);
      // A stander needs a 0.3 m capsule clear from the knees up; a sitter, room for the body.
      if (s.kind === 'sit' ? w.blocked(s.p.x, s.p.z, s.p.y + 0.1, s.p.y + 1.2, 0.2) : w.blocked(s.p.x, s.p.z, s.p.y + 0.3, s.p.y + 1.75, 0.3)) inside.push(s.id);
    }
    // Chests and cupboards sit in the open (not inside a wall or a prop's collider).
    for (const s of spots()) if (s.kind === 'container' && w.blocked(s.p.x, s.p.z, s.p.y + 0.1, s.p.y + 0.8, 0.15)) inside.push(s.id);
    expect({ floating, inside }).toEqual({ floating: [], inside: [] });
  });
});

describe('trajan extras (the idle figures at the spots)', { timeout: 60_000 }, () => {
  const placed = (lm: string, id: string) => {
    const s = (get(lm).spots ?? []).find((q) => q.id === id);
    if (!s) return null;
    const m = placement(lm);
    const h = (s.heading ?? 0) + bearingToRotationY(lmOf(lm).rotation);
    return { kind: s.kind, position: s.position.clone().applyMatrix4(m), heading: h };
  };

  it('every figure has its spot, of a kind that suits its pose', () => {
    const ids = EXTRAS.map((e) => e.spot);
    expect(new Set(ids).size).toBe(ids.length);
    expect(EXTRAS.length).toBeGreaterThanOrEqual(30);
    for (const e of EXTRAS) {
      const s = placed(e.lm, e.spot);
      expect(s, e.spot).not.toBeNull();
      if (e.idle === 'sit') expect(s!.kind, e.spot).toBe('sit');
      else expect(['npc', 'vendor', 'shrine', 'stall', 'door', 'spawn'], e.spot).toContain(s!.kind);
    }
  });

  it('sitters put their feet on the floor in front of the seat, standers on their spot', () => {
    const w = worldProbe();
    for (const e of EXTRAS) {
      const s = placed(e.lm, e.spot)!;
      const at = extraPlacement(e.idle, s);
      const tops = [0, ...w.tops(at.position.x, at.position.z, 0.1)];
      expect(tops.some((t) => Math.abs(t - at.position.y) < 0.1), `${e.spot}: feet at ${at.position.y.toFixed(2)}, floors ${tops.map((t) => t.toFixed(2))}`).toBe(true);
      if (e.idle === 'sit') {
        // The seat is behind the feet, at the height the sitting idle expects.
        const back = at.position.clone().add(new THREE.Vector3(-Math.sin(at.heading) * 0.37, 0, -Math.cos(at.heading) * 0.37));
        expect(w.floorNear(back.x, back.z, s.position.y, 0.08, 0.05), `${e.spot}: no seat behind`).toBe(true);
      }
    }
  });

  it('keep hours, including windows that wrap past midnight', () => {
    expect(inHours(3)).toBe(true);
    expect(inHours(4.5, [4.5, 20.5])).toBe(true);
    expect(inHours(20.5, [4.5, 20.5])).toBe(false);
    expect(inHours(23, [22, 5])).toBe(true);
    expect(inHours(2, [22, 5])).toBe(true);
    expect(inHours(12, [22, 5])).toBe(false);
    // The 04:30 start finds the dedication's people at their posts.
    const dawn = EXTRAS.filter((e) => inHours(4.5, e.hours));
    expect(dawn.length).toBeGreaterThanOrEqual(15);
  });
});
