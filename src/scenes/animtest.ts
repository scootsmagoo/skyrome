/**
 * Animation test course: a walker on real physics crosses a kerb, a flight of stairs and a slope,
 * filmed side-on, to check foot planting (anim/footIk.ts) and the secondary motion.
 *
 *   ?scene=animtest&role=legionary&speed=1.6&seed=3
 *
 * Course along +x (the walker faces east, the camera looks north from the south side):
 * flat, a 0.15 m kerb (up at x=-4, down at x=-1), six 0.18 m stairs from x=1, a platform, then a 10 degree slope.
 * `window.__animtest`: { walker, avatar, speed, dir (deg, + left), photo: {az, dist, height, fov}, setX(x) }.
 */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { createHumanoid, type HumanoidAvatar } from '../actors/avatar/HumanoidAvatar';
import { warmUpAnimations } from '../actors/avatar/anim/library';
import { avatarLod } from '../actors/avatar/lod';
import { isAvatarRole, randomAppearance, type AvatarRole } from '../actors/avatar/variants';
import { Layer } from '../core/Physics';
import { Rng } from '../core/Rng';
import { basicLights, setupPlayer } from './common';
import type { SceneDef } from './types';

const stone = new THREE.MeshStandardMaterial({ color: 0xcdbfa4, roughness: 0.85 });

const scene: SceneDef = {
  title: 'Animation course',
  description: 'A walker crosses a kerb, stairs and a slope (foot IK, secondary motion, hit reactions)',
  setup(game) {
    const q = new URLSearchParams(location.search);
    const role = (q.get('role') as AvatarRole) ?? 'legionary';
    const rng = new Rng(Number(q.get('seed') ?? 3));
    game.scene.background = new THREE.Color(0xb7cde6);
    warmUpAnimations();

    // Ground.
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x9d9078, roughness: 0.95 }));
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    game.scene.add(ground);
    game.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 60, y: 0.5, z: 60 });
    const block = (x0: number, x1: number, top: number, depth = 3) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, top, depth), stone);
      m.position.set((x0 + x1) / 2, top / 2, 0);
      m.castShadow = m.receiveShadow = true;
      game.scene.add(m);
      game.physics.addBox({ x: (x0 + x1) / 2, y: top / 2, z: 0 }, { x: (x1 - x0) / 2, y: top / 2, z: depth / 2 });
    };
    block(-4, -1, 0.15);
    for (let i = 0; i < 6; i++) block(1 + i * 0.3, 2.8, 0.18 * (i + 1));
    block(2.8, 6, 6 * 0.18);
    // A slope down from the platform: 10 degrees over 8 m.
    const slopeLen = 8;
    const slopeAng = Math.atan2(6 * 0.18, slopeLen);
    const slopeGeo = new THREE.BoxGeometry(Math.hypot(slopeLen, 6 * 0.18), 0.2, 3);
    const slope = new THREE.Mesh(slopeGeo, stone);
    const sx = 6 + slopeLen / 2;
    const sy = (6 * 0.18) / 2 - 0.1 * Math.cos(slopeAng);
    slope.position.set(sx, sy, 0);
    slope.rotation.z = -slopeAng;
    slope.castShadow = slope.receiveShadow = true;
    game.scene.add(slope);
    game.physics.addOrientedBox({ x: sx, y: sy, z: 0 }, { x: Math.hypot(slopeLen, 6 * 0.18) / 2, y: 0.1, z: 1.5 }, new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -slopeAng)));

    const { sun } = basicLights(game, () => walker.root.position);
    sun.position.set(-20, 60, 40);

    // A player offstage (the game wants one); the photo camera takes over.
    const player = setupPlayer(game, new THREE.Vector3(0, 0.05, 40), Math.PI);
    avatarLod.viewer = game.camera;

    const avatar: HumanoidAvatar = createHumanoid(randomAppearance(rng.fork('walker'), isAvatarRole(role) ? role : 'legionary'));
    const walker = new Actor(game, { id: 'walker', position: { x: -9, y: 0.05, z: 0 }, heading: Math.PI / 2, layer: Layer.Npc, avatar });
    game.actors.add(walker);

    const api = {
      walker,
      avatar,
      speed: Number(q.get('speed') ?? 1.6),
      /** Direction of travel against the facing (deg, + = to the left). */
      dir: 0,
      loop: true,
      photo: { on: true, x: -9, dist: 3.2, height: 0.8, look: 0.8, fov: 35, follow: true, az: 0 },
      setX(x: number) {
        walker.teleport({ x, y: (game.physics.groundHeight(x, 0, 6, 12) ?? 0) + 0.02, z: 0 }, Math.PI / 2);
      },
    };
    (window as unknown as { __animtest: unknown }).__animtest = api;

    const wish = new THREE.Vector3();
    game.addSystem({
      name: 'animtest',
      priority: 0,
      fixedUpdate(dt) {
        if (api.loop && (walker.position.x > 15 || walker.position.x < -15 || Math.abs(walker.position.z) > 6)) api.setX(-9);
        walker.turnToward(Math.PI / 2, 8, dt);
        walker.sprinting = api.speed > 5.5;
        const d = (api.dir * Math.PI) / 180;
        // Facing east: forward is +x, to the left is -z.
        wish.set(api.speed * Math.cos(d), 0, -api.speed * Math.sin(d));
        walker.locomote(wish, dt);
      },
    });
    game.addSystem({
      name: 'animtestCam',
      priority: 150,
      lateUpdate() {
        const p = api.photo;
        if (!p.on) return;
        const c = walker.root.position;
        const x = p.follow ? c.x : p.x;
        // az: where the camera stands around the walker (0 = south, 90 = east, i.e. in front of the walker).
        const a = (p.az * Math.PI) / 180;
        game.camera.position.set(x + Math.sin(a) * p.dist, c.y + p.height, c.z + Math.cos(a) * p.dist);
        game.camera.lookAt(x, c.y + p.look, c.z);
        if (game.camera.fov !== p.fov) {
          game.camera.fov = p.fov;
          game.camera.updateProjectionMatrix();
        }
        player.root.visible = false;
      },
    });
  },
};
export default scene;
