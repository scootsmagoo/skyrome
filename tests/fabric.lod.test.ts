import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { MATERIAL_BASE } from '../src/gfx/materialIds';
import { MeshBuilder } from '../src/gfx/MeshBuilder';
import { fillBlock } from '../src/arch/fabric/blockFiller';
import { Draw } from '../src/arch/fabric/draw';
import { insula } from '../src/arch/fabric/insula';
import { CityLOD, bakeFarGeometry } from '../src/arch/fabric/lod';
import { roof } from '../src/arch/fabric/roof';
import type { Polygon } from '../src/arch/fabric/types';
import { socleAndDado } from '../src/arch/fabric/wall';
import { WorldRegistry } from '../src/world/WorldRegistry';

const tris = (g: THREE.Object3D) => {
  let n = 0;
  g.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh) n += (m.geometry.index ? m.geometry.index.count : m.geometry.getAttribute('position').count) / 3;
  });
  return n;
};
const meshOf = (g: THREE.Group, mat: string) => g.children.find((c) => c.name.endsWith(`:${mat}`)) as THREE.Mesh | undefined;

describe('block detail levels', () => {
  const block: Polygon = [[0, 0], [60, 0], [60, 40], [0, 40]];
  const slope = (x: number, z: number) => 0.05 * x - 0.03 * z;
  const o = { heightAt: slope, seed: 4, wealth: 0.5, density: 0.8, allowHorrea: true };
  const full = fillBlock(block, o), mid = fillBlock(block, { ...o, detail: 'mid' }), low = fillBlock(block, { ...o, detail: 'low' });

  it('share the same lots and heights at every level', () => {
    const sig = (r: typeof full) => r.lots.map((l) => [l.id, l.kind, l.floorY, l.height]);
    expect(sig(mid)).toEqual(sig(full));
    expect(sig(low)).toEqual(sig(full));
  });

  it('get cheaper level by level, and only full detail has colliders', () => {
    const [f, m, l] = [full, mid, low].map((r) => tris(r.builder.build('x')));
    expect(m).toBeLessThan(f * 0.7);
    expect(l).toBeLessThan(m * 0.45);
    expect(full.builder.colliders.length).toBeGreaterThan(20);
    expect(mid.builder.colliders.length).toBe(0);
    expect(low.builder.colliders.length).toBe(0);
  });

  it('full detail keeps shop interiors out of the shadow pass', () => {
    const g = full.builder.build('x');
    const noCast = g.children.filter((c) => !(c as THREE.Mesh).castShadow && c.name.endsWith(':terracotta'));
    expect(noCast.length).toBeGreaterThan(0);
  });
});

describe('far baking', () => {
  it('bakes a building into one vertex-coloured geometry with its block index', () => {
    const b = insula({ width: 16, depth: 14, seed: 2, finish: 'plaster', plaster: 'plaster_ochre', detail: 'low' }).builder.build('i');
    const g = bakeFarGeometry(b, 7)!;
    expect(g.index).toBeTruthy();
    expect(g.index!.count / 3).toBe(tris(b));
    expect(g.getAttribute('normal')).toBeUndefined();
    const blk = g.getAttribute('aBlock');
    for (let i = 0; i < blk.count; i += 13) expect(blk.getX(i)).toBe(7);
    // The ochre walls keep their flat colour (stored as sRGB bytes).
    const ochre = new THREE.Color(MATERIAL_BASE.plaster_ochre.color).convertLinearToSRGB();
    const col = g.getAttribute('color') as THREE.BufferAttribute;
    expect(col.normalized).toBe(true);
    let found = false;
    for (let i = 0; i < col.count && !found; i++) found = Math.abs(col.getX(i) - ochre.r) < 0.01 && Math.abs(col.getY(i) - ochre.g) < 0.01 && Math.abs(col.getZ(i) - ochre.b) < 0.01;
    expect(found).toBe(true);
  });
});

describe('CityLOD', () => {
  function fakeGame() {
    const game = {
      settings: { data: { viewDistance: 900 }, onChange() {} },
      scene: new THREE.Scene(),
      camera: new THREE.PerspectiveCamera(),
    } as unknown as Game;
    game.world = new WorldRegistry(game);
    return game;
  }
  const box = (x: number) => {
    const b = new MeshBuilder();
    b.box('brick', 20, 10, 20, new THREE.Matrix4().makeTranslation(x, 5, 0));
    return b.build(`b${x}`);
  };

  it('shows exactly one level per block and merges far blocks per cell', () => {
    const game = fakeGame();
    const lod = new CityLOD(game, { near: 50, mid: 250, cell: 1000 });
    for (const x of [0, 400]) lod.addBlock(`b${x}`, { near: box(x), mid: box(x), far: box(x) });
    lod.finish();
    expect(lod.cellCount).toBe(1);
    const check = (camX: number, expectFar: [boolean, boolean]) => {
      game.camera.position.set(camX, 2, 0);
      game.world.refreshAll();
      lod.lateUpdate();
      ['b0', 'b400'].forEach((id, i) => {
        const e = game.world.get(id)!;
        const shown = [e.object.visible, e.far!.visible, lod.farVisible(id)].filter(Boolean).length;
        expect(shown, `${id} at ${camX}`).toBe(1);
        expect(lod.farVisible(id), `${id} far at ${camX}`).toBe(expectFar[i]);
      });
    };
    check(0, [false, true]); // b0 near, b400 far (385 m from its sphere surface)
    check(200, [false, false]); // both mid (185 m)
    check(400, [true, false]);
  });
});

describe('socle and dado', () => {
  it('follow the ground: a stone socle where it falls below the floor, a ~1.1 m dado above', () => {
    const b = new MeshBuilder();
    const d = new Draw(b);
    // Ground in front of the wall falls from 0 at x = 0 to −2 m at x = 20.
    const ground = (x: number) => -0.1 * x;
    socleAndDado(d, 0, 20, -3, (x) => ground(x), { dado: 'plaster_red', socle: 'tufa' });
    const g = b.build('w');
    const dado = meshOf(g, 'plaster_red')!.geometry.getAttribute('position');
    for (let i = 0; i < dado.count; i++) {
      const x = dado.getX(i), y = dado.getY(i);
      const base = Math.max(Math.min(ground(Math.max(0, x - 1.1)), 0), ground(Math.min(20, x + 1.1)));
      expect(y, `dado vertex at x=${x.toFixed(2)}`).toBeLessThanOrEqual(Math.max(base, 0) + 1.1 + 1e-6);
      expect(y).toBeGreaterThanOrEqual(ground(x) - 0.4);
    }
    const socle = meshOf(g, 'tufa')!;
    socle.geometry.computeBoundingBox();
    const bb = socle.geometry.boundingBox!;
    expect(bb.max.y).toBeCloseTo(0, 5); // up to the floor
    expect(bb.min.x).toBeGreaterThan(0.5); // only where the ground is clearly below the floor
  });
});

describe('roof UVs', () => {
  it('tile rows follow each face eave (U horizontal, V up-slope), also on a rotated building', () => {
    const b = new MeshBuilder();
    roof(new Draw(b).at(3, 10, -2, 0.7), { kind: 'hip', w: 12, d: 9, y: 0 });
    const m = meshOf(b.build('r'), 'roof_tile')!;
    const pos = m.geometry.getAttribute('position'), uv = m.geometry.getAttribute('uv');
    const P = [0, 1, 2].map(() => new THREE.Vector3());
    let checked = 0;
    for (let i = 0; i < pos.count; i += 3) {
      for (let k = 0; k < 3; k++) P[k].fromBufferAttribute(pos, i + k);
      const e1 = P[1].clone().sub(P[0]), e2 = P[2].clone().sub(P[0]);
      const n = e1.clone().cross(e2);
      if (n.length() < 1e-6) continue;
      const area = n.length() / 2;
      n.normalize();
      // Tile courses only: ribs are thin slivers, risers and fascias face sideways.
      const longest = Math.max(e1.length(), e2.length(), P[2].distanceTo(P[1]));
      if (n.y < 0.85 || (2 * area) / longest < 0.2) continue;
      // Gradient of a per-vertex scalar over the triangle (in its plane).
      const grad = (f: number[]) => {
        const df1 = f[1] - f[0], df2 = f[2] - f[0];
        const a = e1.dot(e1), bb = e1.dot(e2), c = e2.dot(e2), det = a * c - bb * bb;
        const s = (df1 * c - df2 * bb) / det, t = (df2 * a - df1 * bb) / det;
        return e1.clone().multiplyScalar(s).add(e2.clone().multiplyScalar(t));
      };
      const gu = grad([0, 1, 2].map((k) => uv.getX(i + k))), gv = grad([0, 1, 2].map((k) => uv.getY(i + k)));
      expect(Math.abs(gu.y)).toBeLessThan(1e-3);
      expect(gv.y).toBeGreaterThan(0);
      checked++;
    }
    expect(checked).toBeGreaterThan(40);
  });
});
