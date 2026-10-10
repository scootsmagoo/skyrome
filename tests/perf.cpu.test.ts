/** The CPU audit's pure pieces (docs/research/perf-audit-2026-10.md): per-pass batch lists, the main-pass pre-cull, frozen groups. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FastCull, fastCullStats } from '../src/gfx/fastCull';
import { TransformWatch, freezeGroups, sealGroup, thaw } from '../src/gfx/freeze';
import { frameCap } from '../src/core/Game';
import { cluster } from '../src/world/landmarks/farBake';

type Internals = { _multiDrawCount: number; _indirectTexture: THREE.DataTexture; _multiDrawStarts: Int32Array };

/** A batch of boxes on a line along -z (x = 0), each with its stored sphere. */
function batch(n = 50) {
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const mat = new THREE.MeshBasicMaterial();
  const b = new THREE.BatchedMesh(64, 64, 64, mat);
  b.sortObjects = false;
  const id = b.addGeometry(box);
  const cull = new FastCull(b);
  const m = new THREE.Matrix4();
  for (let i = 0; i < n; i++) {
    const inst = b.addInstance(id);
    m.makeTranslation(0, 0, -i * 4);
    b.setMatrixAt(inst, m);
    cull.setSphere(inst, 0, 0, -i * 4, 0.9);
  }
  expect(cull.install()).toBe(true);
  return { b, mat, box, cull };
}

function camera(x: number, z: number, yaw: number) {
  const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 60);
  cam.position.set(x, 0, z);
  cam.rotation.y = yaw;
  cam.updateMatrixWorld(true);
  cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
  return cam;
}

const ids = (b: THREE.BatchedMesh) => {
  const m = b as unknown as Internals;
  return [...(m._indirectTexture.image.data as unknown as Uint32Array).slice(0, m._multiDrawCount)];
};

describe('FastCull per-pass lists', () => {
  it('keeps the shadow list apart from the main one and restores the main list after the shadow draw', () => {
    const { b, mat, box } = batch();
    const main = camera(0, 5, 0); // looks down -z along the line: sees the near boxes
    const light = camera(0, -150, Math.PI); // looks +z from far beyond: sees the far end only
    b.onBeforeRender(null as never, null as never, main, box, mat, null as never);
    const mainIds = ids(b);
    const mainTex = (b as unknown as Internals)._indirectTexture;
    expect(mainIds.length).toBeGreaterThan(3);
    b.onBeforeShadow(null as never, null as never, main, light, box, mat, null as never);
    const shadowIds = ids(b);
    expect((b as unknown as Internals)._indirectTexture).not.toBe(mainTex);
    expect(shadowIds).not.toEqual(mainIds);
    b.onAfterShadow(null as never, null as never, main, light, box, mat, null as never);
    expect((b as unknown as Internals)._indirectTexture).toBe(mainTex);
    expect(ids(b)).toEqual(mainIds);
  });

  it('flags the indirect texture only when the instance sequence changed', () => {
    const { b, mat, box } = batch();
    const cam = camera(0, 5, 0);
    b.onBeforeRender(null as never, null as never, cam, box, mat, null as never);
    const tex = (b as unknown as Internals)._indirectTexture;
    const v = tex.version;
    const u = fastCullStats.uploads;
    b.onBeforeRender(null as never, null as never, cam, box, mat, null as never);
    b.onBeforeRender(null as never, null as never, cam, box, mat, null as never);
    expect(tex.version).toBe(v);
    expect(fastCullStats.uploads).toBe(u);
    // One instance hidden: the sequence changes, one upload.
    b.setVisibleAt(ids(b)[1], false);
    b.onBeforeRender(null as never, null as never, cam, box, mat, null as never);
    expect(tex.version).toBe(v + 1);
  });

  it('hides a batch with nothing in view for the main walk and shows it for the shadow pass', () => {
    const { b, mat, box } = batch();
    const scene = new THREE.Scene();
    const group = new THREE.Group();
    group.add(b);
    scene.add(group);
    let shadowSawVisible: boolean | null = null;
    const renderer = { shadowMap: { render: () => { shadowSawVisible = b.visible; } } } as unknown as THREE.WebGLRenderer;
    // First draw hooks the scene and the shadow map.
    b.onBeforeRender(renderer, scene, camera(0, 5, 0), box, mat, null as never);
    const away = camera(0, 5, Math.PI); // looks +z, away from every box
    scene.onBeforeRender(renderer, scene, away, null as never, null as never, null as never);
    expect(b.visible).toBe(false);
    renderer.shadowMap.render([], scene, away);
    expect(shadowSawVisible).toBe(true);
    scene.onAfterRender(renderer, scene, away, null as never, null as never, null as never);
    expect(b.visible).toBe(true);
    // In view: stays visible, and the main draw reuses the pre-culled list.
    const toward = camera(0, 5, 0);
    scene.onBeforeRender(renderer, scene, toward, null as never, null as never, null as never);
    expect(b.visible).toBe(true);
    const n = (b as unknown as Internals)._multiDrawCount;
    const culls = fastCullStats.culls;
    b.onBeforeRender(renderer, scene, toward, box, mat, null as never);
    expect(fastCullStats.culls).toBe(culls);
    expect((b as unknown as Internals)._multiDrawCount).toBe(n);
    scene.onAfterRender(renderer, scene, toward, null as never, null as never, null as never);
  });
});

describe('TransformWatch', () => {
  it('freezes groups and recomposes exactly those that move', () => {
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.add(pivot);
    pivot.add(mesh);
    root.position.set(10, 0, 0);
    const watch = new TransformWatch();
    expect(freezeGroups(root, watch)).toBe(2); // root and pivot, not the mesh
    expect(root.matrixAutoUpdate).toBe(false);
    expect(mesh.matrixAutoUpdate).toBe(true);
    root.updateMatrixWorld(true);
    expect(watch.check()).toBe(0);
    // A builder turns the pivot (a door): the watch notices and the world matrices follow.
    pivot.rotation.y = Math.PI / 2;
    expect(watch.check()).toBe(1);
    root.updateMatrixWorld();
    const p = new THREE.Vector3(1, 0, 0).applyMatrix4(pivot.matrixWorld);
    expect(p.x).toBeCloseTo(10, 5);
    expect(p.z).toBeCloseTo(-1, 5);
    expect(watch.check()).toBe(0);
  });

  it('lets go of objects that left the scene', () => {
    const scene = new THREE.Scene();
    const a = new THREE.Group();
    const b = new THREE.Group();
    scene.add(a, b);
    const watch = new TransformWatch();
    freezeGroups(a, watch);
    freezeGroups(b, watch);
    expect(watch.size).toBe(2);
    scene.remove(a);
    watch.prune(scene);
    expect(watch.size).toBe(1);
    b.position.x = 3;
    expect(watch.check()).toBe(1);
  });
});

describe('sealGroup', () => {
  function world() {
    const scene = new THREE.Scene();
    scene.matrixAutoUpdate = false; // as the game's (core/Game.ts): it would force every walk
    const root = new THREE.Group();
    const pivot = new THREE.Group();
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    root.position.set(5, 0, 0);
    pivot.add(mesh);
    root.add(pivot);
    scene.add(root);
    const watch = new TransformWatch();
    const seal = sealGroup(root, watch);
    return { scene, root, pivot, mesh, watch, seal };
  }

  it('skips the subtree while nothing changed and walks it once something moved', () => {
    const { scene, pivot, mesh, watch } = world();
    scene.updateMatrixWorld();
    expect(mesh.matrixAutoUpdate).toBe(false);
    expect(mesh.matrixWorld.elements[12]).toBeCloseTo(5);
    // A matrix written behind the watch's back is not picked up: proof that the walk is skipped.
    pivot.matrix.makeTranslation(100, 0, 0);
    scene.updateMatrixWorld();
    expect(mesh.matrixWorld.elements[12]).toBeCloseTo(5);
    // A real move (position) is seen by the watch, which marks the seal dirty: the walk runs.
    pivot.position.set(1, 0, 0);
    watch.check();
    scene.updateMatrixWorld();
    expect(mesh.matrixWorld.elements[12]).toBeCloseTo(6);
  });

  it('walks children added after sealing every frame, and thawed meshes', () => {
    const { scene, pivot, mesh } = world();
    scene.updateMatrixWorld();
    const late = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial());
    pivot.add(late);
    late.position.set(0, 2, 0);
    scene.updateMatrixWorld();
    expect(late.matrixWorld.elements[13]).toBeCloseTo(2);
    late.position.y = 3;
    scene.updateMatrixWorld();
    expect(late.matrixWorld.elements[13]).toBeCloseTo(3);
    // A frozen mesh thawed: it moves again.
    thaw(mesh);
    mesh.position.z = 4;
    scene.updateMatrixWorld();
    expect(mesh.matrixWorld.elements[14]).toBeCloseTo(4);
    // Removed: no longer walked.
    pivot.remove(late);
    late.position.y = 9;
    scene.updateMatrixWorld();
    expect(late.matrixWorld.elements[13]).toBeCloseTo(3);
  });

  it('still honours a forced walk', () => {
    const { scene, pivot, mesh } = world();
    scene.updateMatrixWorld();
    pivot.matrix.makeTranslation(100, 0, 0);
    scene.updateMatrixWorld(true);
    expect(mesh.matrixWorld.elements[12]).toBeCloseTo(105);
  });
});

describe('frameCap', () => {
  it('runs at the lowest of the setting and the caps, and ?fps= overrides all', () => {
    expect(frameCap(undefined, 60, [])).toBe(60);
    expect(frameCap(undefined, 60, [30])).toBe(30);
    expect(frameCap(undefined, 30, [45])).toBe(30);
    expect(frameCap(undefined, 0, [])).toBe(0); // uncapped
    expect(frameCap(undefined, 0, [30])).toBe(30);
    expect(frameCap(0, 60, [30])).toBe(0);
    expect(frameCap(120, 60, [30])).toBe(120);
  });
});

/** The string-keyed cluster farBake.ts had before the audit: the numeric one must give the same mesh. */
function clusterReference(geo: THREE.BufferGeometry, cell: number) {
  const pa = geo.getAttribute('position').array as Float32Array;
  const ca = geo.getAttribute('color').array as Uint8Array;
  const n = pa.length / 3;
  const keyOf = new Map<string, number>();
  const outP: number[] = [];
  const outC: number[] = [];
  const sum: number[] = [];
  const count: number[] = [];
  const remap = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    const key = `${Math.round(pa[i * 3] / cell)},${Math.round(pa[i * 3 + 1] / cell)},${Math.round(pa[i * 3 + 2] / cell)},${ca[i * 3]},${ca[i * 3 + 1]},${ca[i * 3 + 2]}`;
    let k = keyOf.get(key);
    if (k === undefined) {
      k = count.length;
      keyOf.set(key, k);
      sum.push(0, 0, 0);
      count.push(0);
      outC.push(ca[i * 3], ca[i * 3 + 1], ca[i * 3 + 2]);
    }
    sum[k * 3] += pa[i * 3];
    sum[k * 3 + 1] += pa[i * 3 + 1];
    sum[k * 3 + 2] += pa[i * 3 + 2];
    count[k]++;
    remap[i] = k;
  }
  for (let k = 0; k < count.length; k++) outP.push(sum[k * 3] / count[k], sum[k * 3 + 1] / count[k], sum[k * 3 + 2] / count[k]);
  const index: number[] = [];
  const seen = new Set<string>();
  for (let t = 0; t + 2 < n; t += 3) {
    const a = remap[t], b = remap[t + 1], c = remap[t + 2];
    if (a === b || b === c || a === c) continue;
    const s = [a, b, c].sort((x, y) => x - y).join(',');
    if (seen.has(s)) continue;
    seen.add(s);
    index.push(a, b, c);
  }
  return { position: new Float32Array(outP), color: new Uint8Array(outC), index };
}

describe('farBake cluster', () => {
  it('gives exactly the mesh the string-keyed version gave', () => {
    // Two colours of a finely tessellated torus knot plus a box, some faces stacked twice.
    const a = new THREE.TorusKnotGeometry(6, 1.5, 200, 24).toNonIndexed();
    const b = new THREE.BoxGeometry(8, 3, 5, 6, 3, 4).toNonIndexed().translate(-12, 2, 3);
    const parts = [a, b, b.clone()];
    const pos: number[] = [];
    const col: number[] = [];
    parts.forEach((g, k) => {
      const p = g.getAttribute('position').array as Float32Array;
      for (let i = 0; i < p.length; i += 3) {
        pos.push(p[i], p[i + 1], p[i + 2]);
        col.push(k === 0 ? 200 : 90, 120, k === 0 ? 40 : 160);
      }
    });
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Uint8Array(col), 3, true));
    const ref = clusterReference(geo, 0.5);
    const got = cluster(geo, 0.5);
    expect([...(got.getAttribute('position').array as Float32Array)]).toEqual([...ref.position]);
    expect([...(got.getAttribute('color').array as Uint8Array)]).toEqual([...ref.color]);
    expect([...(got.index!.array as Uint16Array)]).toEqual(ref.index);
    expect(ref.index.length).toBeGreaterThan(300);
  });
});
