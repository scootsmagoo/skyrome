/**
 * Avatar test bed: a sunlit travertine plaza with a lineup of characters cycling their clips, and
 * the player as a procedural humanoid (walk around, V for first/third person, R draw, F attack,
 * hold F for a power attack, Q block, E interact, C sneak).
 *
 * URL params:
 *   &clip=<ActionClip|IdleLoop>  play it on the whole lineup (actions repeat)
 *   &freeze=<seconds>            with &clip: hold the clip at this time (for screenshots)
 *   &role=<role>                 every lineup slot uses this role (different seeds)
 *   &crowd=<n>                   spawn n wandering citizens (perf test)
 *   &player=<role>               the player's role (default legionary)
 *   &pweapon=<model>&pshield=<model|none>  override the player's weapon/shield
 *   &drawn=1                     lineup starts with weapons drawn
 *   &lod=low|auto                lineup mesh LOD
 *   &labels=0                    hide name labels
 *   &seed=<n>                    variation seed
 */
import * as THREE from 'three';
import { Actor, type ActionClip, type IdleLoop, type LocomotionState } from '../actors/Actor';
import { createHumanoid, type HumanoidAvatar } from '../actors/avatar/HumanoidAvatar';
import { AVATAR_ROLES, isAvatarRole, randomAppearance, type AvatarRole } from '../actors/avatar/variants';
import { avatarLod } from '../actors/avatar/lod';
import { warmUpAnimations } from '../actors/avatar/anim/library';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { Rng } from '../core/Rng';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

const IDLE_LOOPS: IdleLoop[] = ['stand', 'sit', 'sitGround', 'lean', 'work', 'sweep', 'talk', 'pray', 'sleep', 'cheer', 'guard', 'drunk'];
const ACTIONS: ActionClip[] = [
  'attackLight1', 'attackLight2', 'attackLight3', 'attackPower', 'bash', 'blockHit', 'hitFront', 'hitBack', 'stagger', 'knockdown', 'death',
  'drawWeapon', 'sheathWeapon', 'bowDraw', 'bowRelease', 'throw', 'interact', 'pickup', 'drink', 'pray', 'cheer', 'wave', 'talk', 'yield',
];

const LINEUP: AvatarRole[] = [
  'legionary', 'praetorian', 'urban-cohort', 'vigil', 'murmillo', 'thraex', 'retiarius', 'secutor', 'hoplomachus', 'provocator',
  'patrician-man', 'matron', 'plebeian-man', 'plebeian-woman', 'slave', 'priest', 'vestal', 'merchant', 'dacian', 'greek',
];

function travertineTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const rng = new Rng(7);
  g.fillStyle = '#b9ab90';
  g.fillRect(0, 0, 1024, 1024);
  // Courses of slabs of varying length.
  const rowH = 128;
  for (let y = 0; y < 1024; y += rowH) {
    let x = -rng.range(0, 200);
    while (x < 1024) {
      const w = rng.range(150, 300);
      const l = rng.range(0.78, 0.9);
      const hue = rng.range(36, 44);
      g.fillStyle = `hsl(${hue}, ${rng.range(18, 28)}%, ${l * 100}%)`;
      g.fillRect(x + 2, y + 2, w - 4, rowH - 4);
      // Travertine pores and veins.
      for (let k = 0; k < 40; k++) {
        g.fillStyle = `rgba(120, 100, 70, ${rng.range(0.05, 0.18)})`;
        g.fillRect(x + rng.range(4, w - 8), y + rng.range(4, rowH - 8), rng.range(2, 14), rng.range(1, 2.5));
      }
      g.fillStyle = 'rgba(255,255,255,0.05)';
      g.fillRect(x + 2, y + 2, w - 4, 6);
      x += w;
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

/** Gradient sky environment for reflections on metal (helmets, armor). */
function skyEnvironment(game: Game): THREE.Texture {
  const pm = new THREE.PMREMGenerator(game.renderer);
  const scene = new THREE.Scene();
  const geo = new THREE.SphereGeometry(10, 32, 16);
  const cols: number[] = [];
  const pos = geo.getAttribute('position');
  const top = new THREE.Color('#7fa6d6');
  const hor = new THREE.Color('#f1dcc0');
  const gnd = new THREE.Color('#8a7356');
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i) / 10;
    if (y > 0) c.copy(hor).lerp(top, Math.pow(y, 0.6));
    else c.copy(hor).lerp(gnd, Math.min(1, -y * 3));
    cols.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  const sun = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(8, 7, 5.5) }));
  sun.position.set(-5, 5, 4);
  scene.add(new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })), sun);
  const rt = pm.fromScene(scene, 0.02);
  pm.dispose();
  return rt.texture;
}

function buildPlaza(game: Game) {
  const tex = travertineTexture();
  tex.repeat.set(16, 16);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.88, color: 0xf2e8d8 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  game.scene.add(ground);
  game.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 60, y: 0.5, z: 60 });
  // A portico behind the lineup: stylobate, columns, entablature.
  const marble = new THREE.MeshStandardMaterial({ color: 0xece4d4, roughness: 0.55 });
  const travertine = new THREE.MeshStandardMaterial({ color: 0xd9ccb0, roughness: 0.8 });
  const z = -9;
  for (let s = 0; s < 3; s++) {
    const step = new THREE.Mesh(new THREE.BoxGeometry(34 - s * 0.8, 0.22, 4 - s * 0.6), travertine);
    step.position.set(0, 0.11 + s * 0.22, z - 0.6 + s * 0.3);
    step.castShadow = step.receiveShadow = true;
    game.scene.add(step);
  }
  game.physics.addBox({ x: 0, y: 0.33, z: z - 0.3 }, { x: 17, y: 0.33, z: 2 });
  const colGeo = new THREE.CylinderGeometry(0.34, 0.4, 6.2, 20, 1);
  // Fluting via a slight radial ripple.
  const p = colGeo.getAttribute('position');
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const zz = p.getZ(i);
    const a = Math.atan2(zz, x);
    const k = 1 - 0.035 * Math.max(0, Math.cos(a * 20));
    p.setX(i, x * k);
    p.setZ(i, zz * k);
  }
  colGeo.computeVertexNormals();
  const cols = new THREE.InstancedMesh(colGeo, marble, 11);
  const m = new THREE.Matrix4();
  for (let i = 0; i < 11; i++) {
    m.makeTranslation(-15 + i * 3, 0.66 + 3.1, z);
    cols.setMatrixAt(i, m);
  }
  cols.castShadow = cols.receiveShadow = true;
  game.scene.add(cols);
  const ent = new THREE.Mesh(new THREE.BoxGeometry(32, 1.2, 1.4), marble);
  ent.position.set(0, 0.66 + 6.2 + 0.6, z);
  ent.castShadow = ent.receiveShadow = true;
  game.scene.add(ent);
  const back = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 0.6), new THREE.MeshStandardMaterial({ color: 0xc98f5e, roughness: 0.9 }));
  back.position.set(0, 4, z - 2.6);
  back.receiveShadow = true;
  game.scene.add(back);
  // A low bench (seat height 0.45 m) for the sitting idle, and a block to hammer on.
  const bench = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.42), travertine);
  bench.position.set(9, 0.225, 5.7);
  bench.castShadow = bench.receiveShadow = true;
  game.scene.add(bench);
}

function lights(game: Game, follow: () => THREE.Vector3) {
  const hemi = new THREE.HemisphereLight(0xc4d8f2, 0xa8865e, 0.8);
  game.scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe3bd, 2.7);
  const offset = new THREE.Vector3(-40, 52, 34);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -30;
  cam.right = cam.top = 30;
  cam.near = 1;
  cam.far = 200;
  sun.shadow.bias = -0.0003;
  sun.shadow.normalBias = 0.03;
  game.scene.add(sun, sun.target);
  game.addSystem({
    name: 'avatarSun',
    priority: 90,
    lateUpdate() {
      const p = follow();
      const sx = Math.round(p.x / 2) * 2;
      const sz = Math.round(p.z / 2) * 2;
      sun.target.position.set(sx, 0, sz);
      sun.position.set(sx + offset.x, offset.y, sz + offset.z);
    },
  });
}

interface Slot {
  actor: Actor;
  avatar: HumanoidAvatar;
  role: AvatarRole;
  label?: HTMLDivElement;
  script: (() => number)[];
  step: number;
  wait: number;
}

const scene: SceneDef = {
  title: 'Avatars',
  description: 'Procedural humanoids: lineup, clips, crowd, first/third person',
  setup(game, ui) {
    const q = new URLSearchParams(location.search);
    const clip = q.get('clip');
    const freeze = q.has('freeze') ? Number(q.get('freeze')) : null;
    const roleParam = q.get('role');
    const crowdN = Number(q.get('crowd') ?? 0);
    const drawnAll = q.get('drawn') === '1';
    const lod = (q.get('lod') as 'low' | 'auto' | null) ?? undefined;
    const rng = new Rng(Number(q.get('seed') ?? 113));
    const showLabels = q.get('labels') !== '0';

    game.scene.background = new THREE.Color(0xb7cde6);
    game.scene.fog = new THREE.Fog(0xd9d2c4, 40, 160);
    game.scene.environment = skyEnvironment(game);
    game.scene.environmentIntensity = 0.55;
    buildPlaza(game);
    warmUpAnimations();

    // Player.
    const playerRole = (q.get('player') as AvatarRole) ?? 'legionary';
    const pApp = randomAppearance(rng.fork('player'), isAvatarRole(playerRole) ? playerRole : 'legionary');
    if (q.get('pweapon')) pApp.weapon = q.get('pweapon') as typeof pApp.weapon;
    if (q.get('pshield')) pApp.shield = q.get('pshield') === 'none' ? undefined : { model: q.get('pshield') as 'scutum', color: '#8e2a1e', emblem: 'thunderbolt' };
    const playerAvatar = createHumanoid(pApp);
    const player = setupPlayer(game, new THREE.Vector3(0, 0.05, 7), Math.PI, playerAvatar);
    lights(game, () => player.root.position);
    avatarLod.viewer = game.camera;

    // Delayed actions in game time (the demo scripts release blocks with these).
    const timers: { t: number; fn: () => void }[] = [];
    const later = (seconds: number, fn: () => void) => timers.push({ t: seconds, fn });

    // Lineup in two rows facing the plaza (+z).
    const slots: Slot[] = [];
    const labelLayer = document.createElement('div');
    labelLayer.style.cssText = 'position:absolute;inset:0;pointer-events:none;font:12px/1.2 ui-sans-serif,system-ui;color:#fff;text-shadow:0 1px 2px #000';
    ui.appendChild(labelLayer);
    LINEUP.forEach((r, i) => {
      const role: AvatarRole = roleParam && isAvatarRole(roleParam) ? roleParam : r;
      const row = Math.floor(i / 10);
      const col = i % 10;
      const app = randomAppearance(rng.fork(`slot${i}`), role);
      const avatar = createHumanoid(app, { lod });
      // The back row sits half a slot over, so its name labels fall between the front row's.
      const pos = { x: -8.1 + col * 1.8 + (row === 0 ? 0.9 : 0), y: 0.05, z: -3 + row * 3 };
      const actor = new Actor(game, { id: `slot-${i}`, position: pos, heading: 0, layer: Layer.Npc, avatar });
      game.actors.add(actor);
      const slot: Slot = { actor, avatar, role, script: [], step: 0, wait: 0.3 + (i % 5) * 0.37 };
      if (showLabels) {
        const el = document.createElement('div');
        el.textContent = role;
        el.style.cssText = 'position:absolute;transform:translate(-50%,-100%);white-space:nowrap;opacity:0.85';
        labelLayer.appendChild(el);
        slot.label = el;
      }
      if (drawnAll) avatar.setDrawn(true);
      slot.script = clip ? clipScript(avatar, clip, freeze) : demoScript(avatar, role, i, later);
      slots.push(slot);
    });
    // A torch-bearer and a sitter for variety.
    slots.find((s) => s.role === 'vigil')?.avatar.setTorch(true);

    // Crowd.
    const crowd: { actor: Actor; target: THREE.Vector3; speed: number; avatar: HumanoidAvatar }[] = [];
    const civRoles: AvatarRole[] = ['plebeian-man', 'plebeian-woman', 'slave', 'freedman', 'merchant', 'elderly', 'patrician-man', 'matron', 'child', 'legionary', 'vigil', 'greek', 'syrian', 'egyptian', 'dacian'];
    for (let i = 0; i < crowdN; i++) {
      const r = rng.pick(civRoles);
      const avatar = createHumanoid(randomAppearance(rng.fork(`crowd${i}`), r), { lod: 'auto' });
      const actor = new Actor(game, { id: `crowd-${i}`, position: { x: rng.range(-30, 30), y: 0.05, z: rng.range(4, 40) }, heading: rng.range(-3, 3), layer: Layer.Npc, avatar });
      game.actors.add(actor);
      crowd.push({ actor, avatar, target: new THREE.Vector3(rng.range(-35, 35), 0, rng.range(2, 45)), speed: rng.chance(0.1) ? rng.range(3.5, 4.5) : rng.range(1.0, 1.6) });
    }

    const wish = new THREE.Vector3();
    const tmp = new THREE.Vector3();
    const byDistance: Slot[] = [];
    const placed: [number, number, number][] = [];
    game.addSystem({
      name: 'avatarScene',
      priority: 0,
      fixedUpdate(dt) {
        for (const s of slots) s.actor.locomote({ x: 0, y: 0, z: 0 }, dt);
        for (const c of crowd) {
          const p = c.actor.position;
          tmp.set(c.target.x - p.x, 0, c.target.z - p.z);
          const d = tmp.length();
          if (d < 1.5) c.target.set(rng.range(-35, 35), 0, rng.range(2, 45));
          tmp.normalize();
          c.actor.turnToward(Math.atan2(tmp.x, tmp.z), 3, dt);
          wish.set(Math.sin(c.actor.heading), 0, Math.cos(c.actor.heading)).multiplyScalar(c.speed);
          c.actor.locomote(wish, dt);
        }
      },
      update(dt) {
        for (let i = timers.length - 1; i >= 0; i--) {
          timers[i].t -= dt;
          if (timers[i].t <= 0) timers.splice(i, 1)[0].fn();
        }
        for (const s of slots) {
          s.wait -= dt;
          if (s.wait <= 0 && s.script.length) {
            s.wait = s.script[s.step % s.script.length]();
            s.step++;
          }
        }
      },
      lateUpdate() {
        if (!showLabels) return;
        const cam = game.camera;
        const w = game.canvas.clientWidth;
        const h = game.canvas.clientHeight;
        // Nearest first; a label that would overlap one already placed is hidden.
        byDistance.length = 0;
        for (const s of slots) if (s.label) byDistance.push(s);
        byDistance.sort((a, b) => cam.position.distanceToSquared(a.actor.root.position) - cam.position.distanceToSquared(b.actor.root.position));
        placed.length = 0;
        for (const s of byDistance) {
          const label = s.label!;
          tmp.copy(s.actor.root.position);
          tmp.y += s.avatar.rig.height + 0.25;
          tmp.project(cam);
          let vis = tmp.z < 1 && Math.abs(tmp.x) < 1.1 && Math.abs(tmp.y) < 1.1 && cam.position.distanceTo(s.actor.root.position) < 18;
          const x = (tmp.x * 0.5 + 0.5) * w;
          const y = (-tmp.y * 0.5 + 0.5) * h;
          const half = label.textContent!.length * 3.4 + 4;
          if (vis) for (const r of placed) if (Math.abs(r[0] - x) < r[2] + half && Math.abs(r[1] - y) < 15) vis = false;
          label.style.display = vis ? '' : 'none';
          if (!vis) continue;
          placed.push([x, y, half]);
          label.style.left = `${x}px`;
          label.style.top = `${y}px`;
        }
      },
    });

    playerControls(game, playerAvatar);

    // Photo mode (screenshots): frame a lineup slot from a given distance/angle/height.
    const photo = { on: false, target: 0, dist: 2.4, angle: 0, height: 1.1, look: 1.0, fov: 40, bone: -1, elev: 0 };
    game.addSystem({
      name: 'avatarPhoto',
      priority: 150,
      lateUpdate() {
        if (!photo.on) return;
        const s = slots[photo.target];
        if (!s) return;
        const c = s.actor.root.position;
        const a = (photo.angle * Math.PI) / 180 + s.actor.heading;
        if (photo.bone >= 0) {
          // Frame a bone from a direction (angle around, elevation up), e.g. a hand close-up.
          const p = s.avatar.bones[photo.bone].getWorldPosition(tmp);
          const e = (photo.elev * Math.PI) / 180;
          game.camera.position.set(p.x + Math.sin(a) * Math.cos(e) * photo.dist, p.y + Math.sin(e) * photo.dist, p.z + Math.cos(a) * Math.cos(e) * photo.dist);
          game.camera.lookAt(p);
        } else {
          game.camera.position.set(c.x + Math.sin(a) * photo.dist, c.y + photo.height, c.z + Math.cos(a) * photo.dist);
          game.camera.lookAt(c.x, c.y + photo.look, c.z);
        }
        if (game.camera.fov !== photo.fov) {
          game.camera.fov = photo.fov;
          game.camera.updateProjectionMatrix();
        }
        player.avatar!.root.visible = false;
      },
    });
    const api = {
      slots,
      crowd,
      player: playerAvatar,
      /** Frame slot i: distance, angle (deg, 0 = in front), camera height, look-at height, fov. */
      /** Close-up of a bone (index into BONES) of slot i. */
      photoBone(i: number, bone: number, dist = 0.5, angle = 0, elev = 10, fov = 35) {
        Object.assign(photo, { on: true, target: i, dist, angle, fov, bone, elev });
        labelLayer.style.display = 'none';
        slots.forEach((sl, k) => (sl.actor.root.visible = k === i));
        return slots[i]?.role;
      },
      photo(i: number, dist = 2.4, angle = 0, height = 1.1, look = 1.0, fov = 40, isolate = true) {
        Object.assign(photo, { on: true, target: i, dist, angle, height, look, fov, bone: -1 });
        labelLayer.style.display = 'none';
        slots.forEach((sl, k) => (sl.actor.root.visible = !isolate || k === i));
        return slots[i]?.role;
      },
      /** Rebuild slot i as a new random `role` (seeded). */
      restyle(i: number, role: AvatarRole, seed = 1) {
        const sl = slots[i];
        const av = createHumanoid(randomAppearance(new Rng(seed), role));
        sl.actor.setAvatar(av);
        sl.avatar = av;
        sl.role = role;
        sl.script = [];
        return `${role}:${av.appearance.sex}:${av.appearance.age}:${av.appearance.skin}`;
      },
      /** Play `clip` on slot i and hold it at time t (s). IdleLoops hold their loop at t. */
      pose(i: number, clip: string, t: number, drawn = true) {
        const sl = slots[i];
        sl.script = [];
        const av = sl.avatar;
        av.setIdleLoop(null);
        if ((IDLE_LOOPS as string[]).includes(clip)) {
          av.setIdleLoop(clip as IdleLoop);
          av.anim.debugFreezeLoop(t);
          return clip;
        }
        av.setDrawn(drawn);
        if (clip === 'block') {
          av.setBlocking(true);
          return clip;
        }
        av.setBlocking(false);
        av.play(clip as ActionClip);
        av.anim.debugFreeze(t);
        return av.anim.current;
      },
      /** Run slot i's animation as if moving at `speed` m/s in direction `dir` (deg, + left) without moving. */
      treadmill(i: number, speed: number, dir = 0, sneak = false, turnRate = 0, grounded = true, verticalSpeed = 0) {
        const sl = slots[i];
        const av = sl.avatar as HumanoidAvatar & { __tm?: LocomotionState };
        const st: LocomotionState = {
          speed,
          forwardSpeed: speed * Math.cos((dir * Math.PI) / 180),
          strafeSpeed: -speed * Math.sin((dir * Math.PI) / 180),
          verticalSpeed,
          grounded,
          sprinting: speed > 5.5,
          sneaking: sneak,
          turnRate,
        };
        if (!av.__tm) {
          const orig = av.update.bind(av);
          av.update = (dt) => orig(dt, av.__tm!);
        }
        av.__tm = st;
        sl.script = [];
        av.setIdleLoop(null);
        return sl.role;
      },
    };
    (window as unknown as { __avatars: unknown }).__avatars = api;
  },
};
export default scene;

/** Script that plays one clip on repeat (or holds an idle loop). */
function clipScript(avatar: HumanoidAvatar, clip: string, freeze: number | null): (() => number)[] {
  const isLoop = (IDLE_LOOPS as string[]).includes(clip);
  const needsDrawn = clip.startsWith('attack') || clip === 'bash' || clip === 'blockHit' || clip === 'sheathWeapon' || clip === 'bowRelease';
  if (needsDrawn) avatar.setDrawn(true);
  if (isLoop)
    return [
      () => {
        avatar.setIdleLoop(clip as IdleLoop);
        if (freeze !== null) avatar.anim.debugFreezeLoop(freeze);
        return 1e9;
      },
    ];
  return [
    () => {
      if (clip === 'drawWeapon') avatar.setDrawn(false);
      if (clip === 'bowRelease') avatar.play('bowDraw');
      avatar.play(clip as ActionClip);
      if (freeze !== null) {
        avatar.anim.debugFreeze(freeze);
        return 1e9;
      }
      return 2.2;
    },
  ];
}

/** A per-role demo loop so the lineup shows a variety of motion. */
function demoScript(avatar: HumanoidAvatar, role: AvatarRole, i: number, later: (seconds: number, fn: () => void) => void): (() => number)[] {
  const armed = avatar.equipment.weapon !== 'none';
  const play = (c: ActionClip, t = 1.4) => () => {
    avatar.play(c);
    return t;
  };
  const loop = (l: IdleLoop | null, t: number) => () => {
    avatar.setIdleLoop(l);
    return t;
  };
  const drawn = (on: boolean) => () => {
    avatar.play(on ? 'drawWeapon' : 'sheathWeapon');
    avatar.setDrawn(on);
    return 1.0;
  };
  const block = (t: number) => () => {
    avatar.setBlocking(true);
    later(t, () => avatar.setBlocking(false));
    return t + 0.4;
  };
  if (armed && role !== 'vigil') {
    return [loop(null, 0.1), drawn(true), play('attackLight1', 0.7), play('attackLight2', 0.7), play('attackLight3', 1.2), block(1.2), play('blockHit', 0.8), play('attackPower', 1.6), play('bash', 1.0), drawn(false), loop('guard', 3)];
  }
  const civ: Record<string, (() => number)[]> = {
    'patrician-man': [play('talk', 2.4), loop('talk', 6), loop(null, 1), play('wave', 2)],
    matron: [loop('pray', 6), loop(null, 1), play('drink', 2.2), play('talk', 2.4)],
    'plebeian-man': [loop('work', 6), loop(null, 1), play('pickup', 1.6), play('cheer', 2)],
    'plebeian-woman': [loop('sweep', 6), loop(null, 1), play('wave', 2), play('interact', 1.2)],
    slave: [loop('sitGround', 6), loop(null, 1.5), play('pickup', 1.6), loop('lean', 5)],
    priest: [play('pray', 3.2), loop('pray', 5), loop(null, 1)],
    vestal: [loop('pray', 5), loop(null, 1.2), play('interact', 1.3)],
    merchant: [play('talk', 2.4), loop('talk', 5), loop(null, 1), play('drink', 2.2)],
    dacian: [loop('drunk', 5), loop(null, 1), play('cheer', 2)],
    greek: [loop('talk', 6), loop(null, 1), play('wave', 2)],
    vigil: [loop('guard', 4), loop(null, 1), play('interact', 1.4), play('wave', 2)],
  };
  return civ[role] ?? [loop(IDLE_LOOPS[i % IDLE_LOOPS.length], 5), loop(null, 1)];
}

/** Minimal combat-ish controls so the player avatar can be exercised in this test bed. */
function playerControls(game: Game, avatar: HumanoidAvatar) {
  const player = game.player;
  let drawn = false;
  let held = 0;
  let charging = false;
  let combo = 0;
  game.addSystem({
    name: 'avatarPlayerControls',
    priority: -5,
    update(dt) {
      const input = game.input;
      avatar.setAimPitch(player.pitch);
      if (input.pressed('readyWeapon') && !avatar.isBusy()) {
        drawn = !drawn;
        avatar.play(drawn ? 'drawWeapon' : 'sheathWeapon');
        avatar.setDrawn(drawn);
        player.combatStance = drawn;
      }
      avatar.setBlocking(drawn && input.down('block'));
      if (input.pressed('interact')) avatar.play('interact');
      if (input.down('attack')) {
        if (!drawn) {
          drawn = true;
          avatar.play('drawWeapon');
          avatar.setDrawn(true);
          player.combatStance = true;
          held = -10;
        }
        held += dt;
        if (held > 0.35 && !avatar.isBusy()) {
          charging = true;
          avatar.setCharge(Math.min(1, (held - 0.35) / 0.6));
        }
      } else if (held !== 0) {
        if (held > 0) {
          if (charging) {
            avatar.play('attackPower');
            combo = 0;
          } else {
            const cur = avatar.anim.current;
            const prog = avatar.anim.progress();
            if (!avatar.isBusy() || (cur?.startsWith('attackLight') && prog > 0.42)) {
              combo = cur?.startsWith('attackLight') ? (combo % 3) + 1 : 1;
              avatar.play(`attackLight${combo}` as ActionClip);
            }
          }
        }
        held = 0;
        charging = false;
        avatar.setCharge(0);
      }
    },
  });
}

export { ACTIONS, AVATAR_ROLES };
