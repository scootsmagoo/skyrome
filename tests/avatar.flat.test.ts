import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeRig } from '../src/actors/avatar/rig';
import { boneInverses, createBones } from '../src/actors/avatar/buildAvatar';
import { FlatSkeleton } from '../src/actors/avatar/flatSkeleton';
import { AvatarLod } from '../src/actors/avatar/lod';

function rig() {
  return computeRig({ height: 1.75, sex: 'male', build: 'average', age: 'adult' });
}

function build() {
  const r = rig();
  const bones = createBones(r);
  const root = new THREE.Group();
  const mesh = new THREE.Group();
  mesh.add(bones[0]);
  root.add(mesh);
  const skeleton = new THREE.Skeleton(bones, boneInverses(r));
  const socket = new THREE.Object3D();
  socket.position.set(0.01, -0.06, 0.02);
  bones[14].add(socket);
  const scene = new THREE.Scene();
  scene.add(root);
  return { bones, root, mesh, skeleton, socket, scene };
}

function pose(bones: THREE.Bone[], seed: number) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) * 2 - 1;
  for (const b of bones) b.quaternion.setFromEuler(new THREE.Euler(rnd() * 0.8, rnd() * 0.8, rnd() * 0.8));
}

describe('flat bone path', () => {
  it('gives the stock skin matrices wherever the avatar stands', () => {
    const { bones, root, skeleton, scene } = build();
    const flat = new FlatSkeleton(skeleton, root.children[0], root, []);
    pose(bones, 7);
    root.position.set(40, 2, -17);
    root.rotation.y = 1.3;
    scene.updateMatrixWorld(true);
    skeleton.update();
    const stock = Float32Array.from(skeleton.boneMatrices!);
    const inv = root.children[0].matrixWorld.clone().invert();
    const want = new THREE.Matrix4();
    const got = new THREE.Matrix4();
    flat.enter();
    flat.tick();
    // Move the avatar without a tick: the model-space skin matrices must not change.
    root.position.set(-5, 0, 9);
    for (let i = 0; i < bones.length; i++) {
      want.fromArray(stock, i * 16).premultiply(inv);
      got.fromArray(flat.skinMatrices(), i * 16);
      for (let k = 0; k < 16; k++) expect(got.elements[k]).toBeCloseTo(want.elements[k], 4);
    }
  });

  it('syncWorld restores the bones world matrices and keeps carried gear in place', () => {
    const { bones, root, mesh, skeleton, scene, socket } = build();
    const prop = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 0.1), new THREE.MeshBasicMaterial());
    socket.add(prop);
    const flat = new FlatSkeleton(skeleton, mesh, root, [socket]);
    pose(bones, 11);
    root.position.set(3, 0, 4);
    root.rotation.y = -0.6;
    scene.updateMatrixWorld(true);
    const stockHand = bones[14].matrixWorld.clone();
    const stockProp = prop.matrixWorld.clone();
    flat.enter();
    flat.tick();
    // Scramble the stale values, then walk the scene the way a frame does.
    bones.forEach((b) => b.matrixWorld.identity());
    flat.updateAttached();
    scene.updateMatrixWorld(true);
    expect(prop.matrixWorld.elements.every((v, i) => Math.abs(v - stockProp.elements[i]) < 1e-4)).toBe(true);
    flat.syncWorld();
    expect(bones[14].matrixWorld.elements.every((v, i) => Math.abs(v - stockHand.elements[i]) < 1e-4)).toBe(true);
    flat.leave();
    expect(bones[3].matrixAutoUpdate).toBe(true);
  });
});

describe('animation LOD intervals', () => {
  const lod = new AvatarLod();
  it('runs near avatars every frame and throttles far and unseen ones', () => {
    lod.disabled = false;
    expect(lod.interval(5)).toBe(0);
    expect(lod.interval(30)).toBeCloseTo(1 / 30);
    expect(lod.interval(60)).toBeCloseTo(1 / 15);
    expect(lod.interval(24)).toBe(0);
    expect(lod.interval(30, false)).toBeCloseTo(1 / 8);
    expect(lod.interval(5, false)).toBe(0);
  });

  it('samples at once on the first call and when forced', () => {
    lod.disabled = false;
    const cam = new THREE.PerspectiveCamera();
    cam.position.set(0, 1.6, 0);
    cam.updateMatrixWorld(true);
    lod.viewer = cam;
    const a = { root: new THREE.Group() };
    a.root.position.set(0, 0, -60);
    a.root.updateMatrixWorld(true);
    expect(lod.step(a, 1 / 60)).toBeGreaterThan(0);
    let ticks = 0;
    for (let i = 0; i < 60; i++) if (lod.step(a, 1 / 60) > 0) ticks++;
    expect(ticks).toBeGreaterThanOrEqual(13);
    expect(ticks).toBeLessThanOrEqual(17);
    expect(lod.step(a, 1 / 60, true)).toBeGreaterThan(0);
  });
});
