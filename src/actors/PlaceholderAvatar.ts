/** A capsule with a nose — stands in until the procedural humanoid avatar exists. */
import * as THREE from 'three';
import type { AvatarView, LocomotionState } from './Actor';

export class PlaceholderAvatar implements AvatarView {
  readonly root = new THREE.Group();
  eyeHeight = 1.62;
  private body: THREE.Mesh;
  private t = 0;

  constructor(color = 0xb5452c) {
    const mat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
    this.body = new THREE.Mesh(new THREE.CapsuleGeometry(0.33, 1.1, 6, 12), mat);
    this.body.position.y = 0.9;
    this.body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 12, 8), new THREE.MeshStandardMaterial({ color: 0xd8a67e }));
    head.position.set(0, 1.62, 0);
    head.castShadow = true;
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.06, 0.12), mat);
    nose.position.set(0, 1.62, 0.17);
    this.root.add(this.body, head, nose);
  }

  update(dt: number, s: LocomotionState) {
    this.t += dt * (1 + s.speed * 2);
    this.body.position.y = 0.9 + (s.grounded ? Math.abs(Math.sin(this.t * 3)) * 0.04 * Math.min(1, s.speed / 4) : 0);
  }
}
