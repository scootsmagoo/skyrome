/** Movement/camera test bed: flat ground, ramps, stairs, walls, columns, a few dummies. */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { PlaceholderAvatar } from '../actors/PlaceholderAvatar';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { basicLights, setupPlayer } from './common';
import type { SceneDef } from './types';

function checkerTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  for (let y = 0; y < 8; y++)
    for (let x = 0; x < 8; x++) {
      g.fillStyle = (x + y) % 2 ? '#b9a98a' : '#a8977a';
      g.fillRect(x * 16, y * 16, 16, 16);
    }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function box(game: Game, pos: THREE.Vector3, size: THREE.Vector3, color: number, rotY = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), new THREE.MeshStandardMaterial({ color, roughness: 0.85 }));
  m.position.copy(pos);
  m.rotation.y = rotY;
  m.castShadow = m.receiveShadow = true;
  game.scene.add(m);
  game.physics.addBox(pos, size.clone().multiplyScalar(0.5), rotY);
  return m;
}

const scene: SceneDef = {
  title: 'Sandbox',
  description: 'Movement & camera test bed',
  setup(game) {
    game.scene.background = new THREE.Color(0x9cc3e6);
    game.scene.fog = new THREE.Fog(0x9cc3e6, 80, 400);

    const tex = checkerTexture();
    tex.repeat.set(100, 100);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    game.scene.add(ground);
    game.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 200, y: 0.5, z: 200 });

    // Stairs (0.2 m risers, 0.35 m treads — Roman-ish) and a ramp
    for (let i = 0; i < 12; i++) {
      const h = 0.2 * (i + 1);
      box(game, new THREE.Vector3(8, h / 2, -8 - i * 0.35), new THREE.Vector3(3, h, 0.35), i % 2 ? 0xd8cfc0 : 0xcfc5b4);
    }
    box(game, new THREE.Vector3(8, 1.2, -13.275), new THREE.Vector3(3, 2.4, 2.5), 0xd8cfc0); // landing, flush with the top step
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(4, 0.3, 12), new THREE.MeshStandardMaterial({ color: 0xc2b59b }));
    ramp.position.set(-8, 1.6, -12);
    ramp.rotation.x = 0.28;
    ramp.castShadow = ramp.receiveShadow = true;
    game.scene.add(ramp);
    game.physics.addOrientedBox(ramp.position, { x: 2, y: 0.15, z: 6 }, ramp.quaternion);

    // Walls & a portico of columns
    box(game, new THREE.Vector3(0, 2, -25), new THREE.Vector3(20, 4, 1), 0xb0573f);
    box(game, new THREE.Vector3(-12, 2, 0), new THREE.Vector3(1, 4, 14), 0xe3d7bf);
    for (let i = 0; i < 8; i++) {
      const x = -6 + i * 2.5;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 5, 16), new THREE.MeshStandardMaterial({ color: 0xf0ebe0, roughness: 0.6 }));
      col.position.set(x, 2.5, 12);
      col.castShadow = col.receiveShadow = true;
      game.scene.add(col);
      game.physics.addCylinder(col.position, 2.5, 0.38);
    }
    box(game, new THREE.Vector3(2.75, 5.3, 12), new THREE.Vector3(20, 0.6, 1.4), 0xf0ebe0);

    const player = setupPlayer(game, new THREE.Vector3(0, 0.05, 6), Math.PI);
    basicLights(game, () => player.root.position);

    // Dummies
    for (let i = 0; i < 4; i++) {
      const a = new Actor(game, { id: `dummy-${i}`, position: { x: -4 + i * 2.6, y: 0.05, z: -4 }, heading: 0, layer: Layer.Npc, avatar: new PlaceholderAvatar(0x3b5d8f) });
      game.actors.add(a);
    }
    // Dummies need locomotion each fixed step to stay grounded.
    game.addSystem({
      name: 'dummies',
      fixedUpdate(dt) {
        for (const a of game.actors.all()) if (a !== player) a.locomote({ x: 0, y: 0, z: 0 }, dt);
      },
    });
  },
};
export default scene;
