/** The phase 3 GPU pass's pure pieces (docs/research/perf-audit-2026-10.md, "Phase 3"). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FastCull, cullAsWhole, fastCullStats, stopCullingAsWhole } from '../src/gfx/fastCull';
import { casterKind } from '../src/gfx/shadowLod';
import { TIER_SETTINGS, lodScaleDefault, sessionQuality, tierOf } from '../src/core/graphics';

/** A batch of boxes on a line along -z (x = 0), each with its stored sphere. */
function batch(n = 20) {
  const box = new THREE.BoxGeometry(1, 1, 1).toNonIndexed();
  const mat = new THREE.MeshBasicMaterial();
  const b = new THREE.BatchedMesh(64, 64, 64, mat);
  b.sortObjects = false;
  b.castShadow = true;
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

/** A sun over (x, z) looking straight down, with a 20 m shadow box. */
function sun(x: number, z: number) {
  const l = new THREE.DirectionalLight(0xffffff, 1);
  l.castShadow = true;
  l.position.set(x, 100, z + 0.01);
  l.target.position.set(x, 0, z);
  const cam = l.shadow.camera as THREE.OrthographicCamera;
  cam.left = cam.bottom = -10;
  cam.right = cam.top = 10;
  cam.near = 1;
  cam.far = 200;
  cam.updateProjectionMatrix();
  l.updateMatrixWorld(true);
  l.target.updateMatrixWorld(true);
  return l;
}

describe('FastCull shadow pre-cull', () => {
  it('finds an instance in a camera view, and none when the view misses them all', () => {
    const { cull } = batch();
    const over = sun(0, -20);
    over.shadow.updateMatrices(over);
    expect(cull.anyInView(over.shadow.camera)).toBe(true);
    const away = sun(300, 300);
    away.shadow.updateMatrices(away);
    expect(cull.anyInView(away.shadow.camera)).toBe(false);
  });

  it('takes a batch with nothing in the shadow view out of that pass, and only that pass', () => {
    const { b, mat, box } = batch();
    const scene = new THREE.Scene();
    scene.add(b);
    let cast: boolean | null = null;
    const sm = { enabled: true, autoUpdate: false, needsUpdate: true, render: () => { cast = b.castShadow; } };
    const renderer = { shadowMap: sm } as unknown as THREE.WebGLRenderer;
    const view = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    view.updateMatrixWorld(true);
    // The first draw hooks the scene and the shadow map.
    b.onBeforeRender(renderer, scene, view, box, mat, null as never);
    const skipped = fastCullStats.shadowSkipped;
    renderer.shadowMap.render([sun(300, 300)], scene, view);
    expect(cast).toBe(false);
    expect(b.castShadow).toBe(true);
    expect(fastCullStats.shadowSkipped).toBe(skipped + 1);
    renderer.shadowMap.render([sun(0, -20)], scene, view);
    expect(cast).toBe(true);
    // No shadow render this frame: nothing is touched.
    sm.needsUpdate = false;
    renderer.shadowMap.render([sun(300, 300)], scene, view);
    expect(cast).toBe(true);
  });
});

describe('culling people as a whole', () => {
  it('hides an out-of-view subtree for the main walk only, and lets a detached one go', () => {
    const { b, mat, box } = batch();
    const scene = new THREE.Scene();
    scene.add(b);
    const person = new THREE.Group();
    person.position.set(0, 0, 40); // behind a camera at the origin looking down -z
    scene.add(person);
    scene.updateMatrixWorld(true);
    cullAsWhole(person, 2, 1);
    let shadowSaw: boolean | null = null;
    const renderer = { shadowMap: { render: () => { shadowSaw = person.visible; } } } as unknown as THREE.WebGLRenderer;
    const cam = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    cam.updateMatrixWorld(true);
    cam.matrixWorldInverse.copy(cam.matrixWorld).invert();
    b.onBeforeRender(renderer, scene, cam, box, mat, null as never); // hooks the scene
    scene.onBeforeRender(renderer, scene, cam, null as never, null as never, null as never);
    expect(person.visible).toBe(false);
    renderer.shadowMap.render([], scene, cam);
    expect(shadowSaw).toBe(true);
    scene.onAfterRender(renderer, scene, cam, null as never, null as never, null as never);
    expect(person.visible).toBe(true);
    // In front of the camera: stays.
    person.position.set(0, 0, -20);
    person.updateMatrixWorld(true);
    scene.onBeforeRender(renderer, scene, cam, null as never, null as never, null as never);
    expect(person.visible).toBe(true);
    scene.onAfterRender(renderer, scene, cam, null as never, null as never, null as never);
    // Removed from the world: never touched again.
    person.position.set(0, 0, 40);
    person.updateMatrixWorld(true);
    person.removeFromParent();
    scene.onBeforeRender(renderer, scene, cam, null as never, null as never, null as never);
    expect(person.visible).toBe(true);
    scene.onAfterRender(renderer, scene, cam, null as never, null as never, null as never);
    stopCullingAsWhole(person);
  });
});

describe('people in the shadow pass', () => {
  it('leaves out a subtree that casts nothing or is outside the shadow view, for that pass only', () => {
    const { b, mat, box } = batch();
    const scene = new THREE.Scene();
    scene.add(b);
    const near = new THREE.Group();
    near.position.set(0, 0, -20); // under the sun's 20 m box at (0, -20)
    const far = new THREE.Group();
    far.position.set(300, 0, 300); // outside it
    const quiet = new THREE.Group();
    quiet.position.set(0, 0, -22); // in the box, but its body casts no shadow
    for (const g of [near, far, quiet]) scene.add(g);
    scene.updateMatrixWorld(true);
    let casts = false;
    cullAsWhole(near, 2, 1, () => true);
    cullAsWhole(far, 2, 1, () => true);
    cullAsWhole(quiet, 2, 1, () => casts);
    const saw: Record<string, boolean> = {};
    const sm = { enabled: true, autoUpdate: false, needsUpdate: true, render: () => Object.assign(saw, { near: near.visible, far: far.visible, quiet: quiet.visible }) };
    const renderer = { shadowMap: sm } as unknown as THREE.WebGLRenderer;
    const view = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
    view.updateMatrixWorld(true);
    b.onBeforeRender(renderer, scene, view, box, mat, null as never); // hooks the scene and the shadow map
    renderer.shadowMap.render([sun(0, -20)], scene, view);
    expect(saw).toEqual({ near: true, far: false, quiet: false });
    expect([near.visible, far.visible, quiet.visible]).toEqual([true, true, true]);
    casts = true;
    renderer.shadowMap.render([sun(0, -20)], scene, view);
    expect(saw.quiet).toBe(true);
    for (const g of [near, far, quiet]) stopCullingAsWhole(g);
  });
});

describe('tier quality rows', () => {
  it('reads the tier in force and its level-of-detail scale, with the row winning when set', () => {
    expect(tierOf({})).toBeNull();
    expect(tierOf({ graphics: 'auto', graphicsApplied: { tier: 'medium' } })).toBe('medium');
    expect(tierOf({ graphics: 'low', graphicsApplied: { tier: 'high' } })).toBe('low');
    expect(lodScaleDefault({})).toBe(1);
    // A save from before the row: its tier's scale.
    expect(lodScaleDefault({ graphics: 'auto', graphicsApplied: { tier: 'low' } })).toBe(TIER_SETTINGS.low.lodScale);
    expect(lodScaleDefault({ graphics: 'medium', lodScale: 0.9 })).toBe(0.9);
    // Each tier is at most as detailed as the one above.
    expect(TIER_SETTINGS.medium.lodScale!).toBeLessThan(TIER_SETTINGS.high.lodScale!);
    expect(TIER_SETTINGS.low.lodScale!).toBeLessThan(TIER_SETTINGS.medium.lodScale!);
    expect(sessionQuality({ graphics: 'low' })).toEqual({ pointLights: 4, nearDetail: false });
    expect(sessionQuality({ graphics: 'high' })).toEqual({ pointLights: 8, nearDetail: true });
    expect(sessionQuality({})).toEqual({ pointLights: 8, nearDetail: true });
  });
});

describe('casterKind', () => {
  it('tells apart what changes a depth program', () => {
    const g = new THREE.BoxGeometry();
    const mat = new THREE.MeshBasicMaterial();
    expect(casterKind(new THREE.Mesh(g, mat), false)).toBe(0);
    expect(casterKind(new THREE.InstancedMesh(g, mat, 2), false)).toBe(2);
    const coloured = new THREE.InstancedMesh(g, mat, 2);
    coloured.setColorAt(0, new THREE.Color(1, 0, 0));
    expect(casterKind(coloured, false)).toBe(18);
    expect(casterKind(new THREE.BatchedMesh(1, 8, 8, mat), false)).toBe(1);
    const skinned = new THREE.SkinnedMesh(g, mat);
    expect(casterKind(skinned, false)).toBe(4);
    skinned.morphTargetInfluences = [0];
    expect(casterKind(skinned, true)).toBe(12);
    // Influences without morph attributes on this geometry: no morph program.
    expect(casterKind(skinned, false)).toBe(4);
  });
});
