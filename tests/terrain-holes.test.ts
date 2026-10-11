/**
 * Holes in the drawn ground: every point of the grid a camera can see must lie on a patch the
 * terrain draws for that camera.
 *
 * The phase 4b hole beside the Clivus Palatinus hairpin (sky through the ground, the neighbouring
 * patches' skirts standing at its edge as earth walls) came from drawing the patches selected for
 * another view: the terrain selected in its lateUpdate (priority 101), and a camera placed later in
 * the frame (the audit tools pin theirs at 150) rendered with the camera rig's frustum culling.
 * The terrain now selects again for whatever camera renders the scene (`scene.onBeforeRender`).
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Game } from '../src/core/Game';
import { buildHeightmap, type TerrainSource } from '../src/world/terrain/heightmap';
import { PATCH_STRIDE, TerrainQuadtree, type QuadtreeGrid } from '../src/world/terrain/quadtree';
import { Terrain } from '../src/world/terrain/Terrain';

/** Grid points (every `step` samples) inside `camera`'s view that no patch in `data` covers. */
function uncovered(grid: QuadtreeGrid, patchQuads: number, data: ArrayLike<number>, count: number, camera: THREE.Camera, step = 2) {
  camera.updateMatrixWorld();
  const pv = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  const v = new THREE.Vector3();
  const misses: [number, number][] = [];
  let seen = 0;
  for (let j = 0; j < grid.nz; j += step) {
    for (let i = 0; i < grid.nx; i += step) {
      const x = grid.minX + i * grid.spacing, z = grid.minZ + j * grid.spacing;
      v.set(x, grid.heights[j * grid.nx + i], z).applyMatrix4(pv);
      if (!(Math.abs(v.x) <= 1 && Math.abs(v.y) <= 1 && v.z >= -1 && v.z <= 1)) continue;
      seen++;
      let ok = false;
      for (let p = 0; p < count && !ok; p++) {
        const o = p * PATCH_STRIDE;
        const size = data[o + 2] * patchQuads;
        ok = x >= data[o] && x <= data[o] + size && z >= data[o + 1] && z <= data[o + 1] + size;
      }
      if (!ok) misses.push([x, z]);
    }
  }
  return { seen, misses };
}

function camera(x: number, y: number, z: number, yaw: number, pitch: number) {
  const c = new THREE.PerspectiveCamera(70, 16 / 9, 0.1, 6000);
  c.position.set(x, y, z);
  c.rotation.set(pitch, yaw, 0, 'YXZ');
  c.updateMatrixWorld();
  return c;
}

describe('terrain holes: the selection covers everything in view', () => {
  it('frustum culling keeps every patch with ground in view (random cameras over steep ground)', () => {
    // Steep, broken relief: ridges 60 m high on a 2 m grid, so the node boxes' heights matter.
    const nx = 801, nz = 601, spacing = 2;
    const heights = new Float32Array(nx * nz);
    for (let j = 0; j < nz; j++) {
      for (let i = 0; i < nx; i++) heights[j * nx + i] = 30 * Math.sin(i * 0.045) * Math.cos(j * 0.06) + 25 * Math.max(0, Math.sin(i * 0.011 + j * 0.017)) + (i > 400 && i < 430 ? 18 : 0);
    }
    const g = { minX: -800, minZ: -600, spacing, nx, nz, heights };
    const qt = new TerrainQuadtree(g, { leafFactor: 2.4 }); // as buildRome
    const frustum = new THREE.Frustum();
    let rnd = 12345;
    const rand = () => ((rnd = (rnd * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
    let seen = 0;
    for (let k = 0; k < 40; k++) {
      const x = -700 + rand() * 1400, z = -500 + rand() * 1000;
      const i = Math.round((x - g.minX) / spacing), j = Math.round((z - g.minZ) / spacing);
      const c = camera(x, heights[j * nx + i] + 1.6 + rand() * (k % 3 === 0 ? 120 : 8), z, rand() * Math.PI * 2, -0.15 - rand() * 1.3);
      frustum.setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(c.projectionMatrix, c.matrixWorldInverse));
      const { data, count } = qt.select(c.position, frustum);
      const r = uncovered(g, qt.patchQuads, data, count, c, 3);
      seen += r.seen;
      expect(r.misses.slice(0, 3), `camera ${k} at ${x.toFixed(0)}, ${z.toFixed(0)}`).toEqual([]);
    }
    expect(seen).toBeGreaterThan(10_000);
  });

  it('draws the patches of the camera that renders, also when it moved after the terrain updated', () => {
    // A small valley (a river through a 14 m plain) with the real Terrain on a stand-in game.
    const src: TerrainSource = {
      BASE_ELEVATION: 14,
      HILLS: [],
      LOWLANDS: [],
      RIVERS: [{ id: 'r', centerline: [[0, -800], [0, 800]], width: [80, 80], waterLevel: 6, bankHeight: 10.5 }],
      ISLANDS: [],
      bounds: { minX: -500, maxX: 500, minZ: -500, maxZ: 500 },
    };
    const hm = buildHeightmap(src, { spacing: 2, noise: 0, quays: [] });
    const rig = camera(60, 12, 0, 0, -0.1); // looking north
    const scene = new THREE.Scene();
    const game = { scene, camera: rig, addSystem: <T>(s: T) => s, removeSystem: () => {} } as unknown as Game;
    const terrain = new Terrain(game, hm, { noColliders: true, flat: true, apron: false, inputs: {} });
    const geo = terrain.mesh.geometry as THREE.InstancedBufferGeometry;
    const drawn = () => uncovered(hm, terrain.quadtree.patchQuads, geo.attributes.aPatch.array, geo.instanceCount, pinned);

    // The frame: the rig placed the camera (priority 100), the terrain selected (101)...
    terrain.lateUpdate();
    // ... then a later system pins the camera to look south and down from above (a tool at 150).
    const pinned = rig;
    pinned.position.set(40, 60, -40);
    pinned.lookAt(10, 10, 60);
    pinned.updateMatrixWorld();
    const before = drawn();
    expect(before.seen).toBeGreaterThan(1000);
    expect(before.misses.length).toBeGreaterThan(100); // the rig's selection: holes in this view

    // The renderer calls scene.onBeforeRender with the camera it renders from, before drawing.
    scene.onBeforeRender({} as THREE.WebGLRenderer, scene, pinned, null as never, null as never, null as never);
    const after = drawn();
    expect(after.seen).toBe(before.seen);
    expect(after.misses).toEqual([]);

    // A second render from the same view keeps the selection (no work), and dispose takes the hook out.
    const count = geo.instanceCount;
    scene.onBeforeRender({} as THREE.WebGLRenderer, scene, pinned, null as never, null as never, null as never);
    expect(geo.instanceCount).toBe(count);
    terrain.dispose();
    expect(scene.onBeforeRender).toBe(THREE.Object3D.prototype.onBeforeRender);
  });
});
