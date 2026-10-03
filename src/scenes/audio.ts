/**
 * Audio test bench: a small Roman set to walk around while listening.
 *
 *  - Plaza (travertine paving) with a fountain you can circle — a spatial loop.
 *  - Temple to the north: steps, columns, two braziers (fire loops); stand in the porch for the
 *    temple reverb and temple music.
 *  - Forum to the west: a colonnade and market stalls on packed earth (crowd, market calls, a smithy).
 *  - Garden to the east: grass, cypresses and a pool with a wooden boardwalk (birds by day,
 *    cicadas at midday, crickets and owls at night; wood and water footsteps).
 *  - A hill to the south up a gravel ramp: the city thins and the wind rises as you climb.
 *  - A patrolling legionary (hobnailed caligae and mail) and a gardener on the boardwalk, with
 *    spatial footsteps.
 *
 * Tab shows/hides the sound board (every sound, loop, music state, mixer, spectrogram, verifier).
 */
import * as THREE from 'three';
import { Actor } from '../actors/Actor';
import { PlaceholderAvatar } from '../actors/PlaceholderAvatar';
import type { Game } from '../core/Game';
import { Layer } from '../core/Physics';
import { Rng } from '../core/Rng';
import { headingFromDir } from '../core/math';
import { MeshBuilder, placeAndRegister } from '../gfx/MeshBuilder';
import { installAudio, type Surface } from '../audio';
import { SoundBoard } from '../audio/debug/SoundBoard';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

// ---------------------------------------------------------------- layout (meters)

type Rect = { x0: number; x1: number; z0: number; z1: number };
const inRect = (r: Rect, x: number, z: number) => x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1;

const PLAZA: Rect = { x0: -13, x1: 13, z0: -13, z1: 13 };
const TEMPLE_GROUND: Rect = { x0: -11, x1: 11, z0: -38, z1: -13 };
const FORUM: Rect = { x0: -44, x1: -13, z0: -17, z1: 17 };
const GARDEN: Rect = { x0: 13, x1: 44, z0: -17, z1: 17 };
const POOL: Rect = { x0: 22, x1: 34, z0: -6, z1: 6 };
const BOARDWALK: Rect = { x0: 19, x1: 37, z0: -1.1, z1: 1.1 };
const PATH: Rect = { x0: -3.5, x1: 3.5, z0: 13, z1: 21 };
const RAMP = { x0: -4, x1: 4, z0: 21, z1: 49, y1: 16 };
const HILL: Rect = { x0: -10, x1: 10, z0: 49, z1: 63 };
const DECK_Y = 0.22;

export function surfaceAt(x: number, y: number, z: number): Surface {
  if (z > RAMP.z0 - 0.5 && y > 0.6) return z < RAMP.z1 ? 'gravel' : 'grass';
  if (inRect(BOARDWALK, x, z) && y > 0.12) return 'wood';
  if (inRect(POOL, x, z)) return 'water';
  if (inRect(PLAZA, x, z) || inRect(TEMPLE_GROUND, x, z)) return 'stone';
  if (inRect(PATH, x, z)) return 'gravel';
  if (inRect(FORUM, x, z)) return 'dirt';
  if (inRect(GARDEN, x, z)) return 'grass';
  return 'grass'; // the meadow around the bench
}

// ---------------------------------------------------------------- procedural textures

function canvasTex(size: number, draw: (g: CanvasRenderingContext2D, s: number) => void, repeat: number, color = true) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function speckle(g: CanvasRenderingContext2D, s: number, n: number, colors: string[], r0: number, r1: number, seed = 1) {
  let x = seed * 9301 + 49297;
  const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < n; i++) {
    g.fillStyle = colors[Math.floor(rnd() * colors.length)];
    const r = r0 + (r1 - r0) * rnd();
    g.beginPath();
    g.ellipse(rnd() * s, rnd() * s, r, r * (0.6 + rnd() * 0.5), rnd() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

const tex = {
  paving: () =>
    canvasTex(512, (g, s) => {
      g.fillStyle = '#cfc2a4';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 2500, ['#d6caad', '#c7b996', '#d9cfb6', '#bfb08e'], 1, 4, 3);
      // Slabs: 2 rows of staggered rectangles per tile, mortar joints.
      g.strokeStyle = 'rgba(92,80,60,0.55)';
      g.lineWidth = 3;
      const rows = 4;
      for (let r = 0; r < rows; r++) {
        const y = (r * s) / rows;
        g.beginPath();
        g.moveTo(0, y);
        g.lineTo(s, y);
        g.stroke();
        const off = r % 2 ? s / 6 : 0;
        for (let k = 0; k < 3; k++) {
          const x = (off + (k * s) / 3) % s;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x, y + s / rows);
          g.stroke();
        }
      }
      // Wear: subtle darker blotches.
      speckle(g, s, 40, ['rgba(120,100,70,0.08)', 'rgba(255,250,235,0.08)'], 10, 40, 7);
    }, 1),
  meadow: () =>
    canvasTex(512, (g, s) => {
      g.fillStyle = '#9c9258';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 90, ['rgba(120,128,60,0.22)', 'rgba(176,150,96,0.22)', 'rgba(96,104,52,0.18)'], 25, 80, 21);
      speckle(g, s, 5000, ['#a39a5f', '#8e8a4f', '#b3a56c', '#7d7d45'], 1, 2.5, 23);
    }, 1),
  dirt: () =>
    canvasTex(512, (g, s) => {
      g.fillStyle = '#9a7d5a';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 60, ['rgba(80,60,40,0.12)', 'rgba(190,160,120,0.12)'], 20, 70, 5);
      speckle(g, s, 3000, ['#8d7151', '#a78a63', '#7f6547', '#b09572'], 1, 3, 11);
    }, 1),
  grass: () =>
    canvasTex(512, (g, s) => {
      g.fillStyle = '#6b7a3c';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 70, ['rgba(140,150,70,0.18)', 'rgba(60,75,35,0.2)', 'rgba(170,155,90,0.15)'], 20, 60, 2);
      // Blades.
      let x = 77;
      const rnd = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
      for (let i = 0; i < 6000; i++) {
        g.strokeStyle = ['#7d8c45', '#5d6c32', '#8f9a52', '#6f7d3a', '#a19a5a'][Math.floor(rnd() * 5)];
        g.lineWidth = 1;
        const px = rnd() * s;
        const py = rnd() * s;
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px + (rnd() - 0.5) * 4, py - 3 - rnd() * 6);
        g.stroke();
      }
    }, 1),
  gravel: () =>
    canvasTex(512, (g, s) => {
      g.fillStyle = '#a69d89';
      g.fillRect(0, 0, s, s);
      speckle(g, s, 9000, ['#b8af9b', '#8f8673', '#c9c1ad', '#7d7563', '#a59a83'], 1.5, 4, 13);
    }, 1),
  planks: () =>
    canvasTex(512, (g, s) => {
      const n = 8;
      for (let i = 0; i < n; i++) {
        const shade = 0.85 + ((i * 37) % 10) / 40;
        g.fillStyle = `rgb(${Math.round(138 * shade)},${Math.round(104 * shade)},${Math.round(70 * shade)})`;
        g.fillRect(0, (i * s) / n, s, s / n);
        g.strokeStyle = 'rgba(40,28,18,0.6)';
        g.lineWidth = 3;
        g.strokeRect(-2, (i * s) / n, s + 4, s / n);
        // Grain.
        g.strokeStyle = 'rgba(70,48,30,0.18)';
        g.lineWidth = 1;
        for (let k = 0; k < 6; k++) {
          const y = (i * s) / n + 4 + k * (s / n / 6);
          g.beginPath();
          g.moveTo(0, y);
          g.bezierCurveTo(s * 0.3, y + 2, s * 0.6, y - 2, s, y + 1);
          g.stroke();
        }
      }
    }, 1),
};

function groundMat(t: THREE.Texture, rough = 0.95) {
  return new THREE.MeshStandardMaterial({ map: t, roughness: rough, metalness: 0, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
}

function patch(game: Game, r: Rect, mat: THREE.Material, metersPerTile: number, y = 0.004) {
  const w = r.x1 - r.x0;
  const d = r.z1 - r.z0;
  const geo = new THREE.PlaneGeometry(w, d);
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * (w / metersPerTile), uv.getY(i) * (d / metersPerTile));
  const m = new THREE.Mesh(geo, mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set((r.x0 + r.x1) / 2, y, (r.z0 + r.z1) / 2);
  m.receiveShadow = true;
  game.scene.add(m);
  return m;
}

// ---------------------------------------------------------------- architecture

const M = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);

function column(b: MeshBuilder, x: number, z: number, h: number, r: number, y0 = 0) {
  b.add(new THREE.CylinderGeometry(r * 1.25, r * 1.32, 0.28, 24), 'marble', M(x, y0 + 0.14, z));
  b.add(new THREE.CylinderGeometry(r * 0.86, r, h - 0.62, 24), 'marble', M(x, y0 + 0.28 + (h - 0.62) / 2, z));
  b.add(new THREE.CylinderGeometry(r * 1.2, r * 0.9, 0.22, 24), 'marble', M(x, y0 + h - 0.23, z));
  b.box('marble', r * 2.6, 0.12, r * 2.6, M(x, y0 + h - 0.06, z));
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, y0 + h / 2, z), halfHeight: h / 2, radius: r * 1.1 });
}

function buildTemple(game: Game) {
  const b = new MeshBuilder();
  const podH = 1.8;
  // Podium (z from -34 to -19), steps down to -14.5 on the south.
  b.box('travertine', 11, podH, 15, M(0, podH / 2, -26.5), { collide: true });
  b.box('marble', 11.3, 0.2, 15.3, M(0, podH + 0.02, -26.5));
  const steps = 8;
  for (let i = 0; i < steps; i++) {
    const h = podH * ((i + 1) / steps);
    const zf = -19 + (steps - i) * 0.55;
    b.box('marble', 7.5, h, 0.56, M(0, h / 2, zf - 0.28), { collide: true });
  }
  // Pronaos columns (4 across) and cella.
  const colH = 6.6;
  for (const x of [-4.1, -1.37, 1.37, 4.1]) column(b, x, -20.2, colH, 0.4, podH);
  for (const x of [-4.1, 4.1]) column(b, x, -23, colH, 0.4, podH);
  const top = podH + colH;
  b.box('plaster_cream', 0.6, colH, 10, M(-4.6, podH + colH / 2, -29), { collide: true });
  b.box('plaster_cream', 0.6, colH, 10, M(4.6, podH + colH / 2, -29), { collide: true });
  b.box('plaster_cream', 9.8, colH, 0.6, M(0, podH + colH / 2, -33.7), { collide: true });
  // Front wall of the cella with a tall doorway.
  b.box('plaster_cream', 3.2, colH, 0.6, M(-3.1, podH + colH / 2, -24.3), { collide: true });
  b.box('plaster_cream', 3.2, colH, 0.6, M(3.1, podH + colH / 2, -24.3), { collide: true });
  b.box('plaster_cream', 3, colH - 4.6, 0.6, M(0, podH + 4.6 + (colH - 4.6) / 2, -24.3));
  b.box('black', 3, 4.6, 0.1, M(0, podH + 2.3, -24.6));
  b.box('bronze', 3.1, 0.15, 0.1, M(0, podH + 4.62, -24.0));
  // Entablature and pediment.
  b.box('marble', 10.4, 0.55, 15, M(0, top + 0.27, -26.6));
  b.box('marble_veined', 10.6, 0.4, 15.2, M(0, top + 0.75, -26.6));
  const ped = new THREE.Shape();
  ped.moveTo(-5.3, 0);
  ped.lineTo(5.3, 0);
  ped.lineTo(0, 1.7);
  ped.closePath();
  const pg = new THREE.ExtrudeGeometry(ped, { depth: 15.2, bevelEnabled: false });
  b.add(pg, 'marble', M(0, top + 0.95, -34.2));
  // Roof slopes.
  const roofLen = Math.hypot(5.5, 1.75);
  const ang = Math.atan2(1.75, 5.5);
  for (const s of [-1, 1]) {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(s * 2.7, top + 1.85, -26.6), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -s * ang)), new THREE.Vector3(1, 1, 1));
    b.box('roof_tile', roofLen, 0.18, 15.4, m);
  }
  placeAndRegister(game, 'audio:temple', b.build('temple'), b.colliders, { x: 0, y: 0, z: 0 });
}

const flameMat = new THREE.MeshBasicMaterial({ color: 0xff6a1c, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
const flameCoreMat = new THREE.MeshBasicMaterial({ color: 0xffc45a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });

function buildBrazier(game: Game, x: number, z: number) {
  const b = new MeshBuilder();
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI * 2;
    // Legs lean in at the top (under the bowl) and splay out at the feet.
    const m = new THREE.Matrix4().compose(new THREE.Vector3(x + Math.cos(a) * 0.26, 0.5, z + Math.sin(a) * 0.26), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.sin(a) * 0.25, 0, Math.cos(a) * 0.25)), new THREE.Vector3(1, 1, 1));
    b.add(new THREE.CylinderGeometry(0.03, 0.035, 1.05, 8), 'bronze', m);
  }
  const bowl = new THREE.LatheGeometry([new THREE.Vector2(0, 0), new THREE.Vector2(0.18, 0.02), new THREE.Vector2(0.36, 0.14), new THREE.Vector2(0.4, 0.2), new THREE.Vector2(0.37, 0.2)], 24);
  b.add(bowl, 'bronze', M(x, 0.98, z), { uv: 'keep' });
  b.add(new THREE.SphereGeometry(0.3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), 'glow_fire', new THREE.Matrix4().compose(new THREE.Vector3(x, 1.08, z), new THREE.Quaternion(), new THREE.Vector3(1, 0.45, 1)), { castShadow: false });
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, 0.6, z), halfHeight: 0.6, radius: 0.42 });
  placeAndRegister(game, `audio:brazier:${x}`, b.build('brazier'), b.colliders, { x: 0, y: 0, z: 0 });
  // Flames: three additive tongues around a hot yellow-white core, all flickering (the group sits
  // on the brazier; the cones are offset within it).
  const flames = new THREE.Group();
  flames.position.set(x, 0, z);
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(new THREE.ConeGeometry(0.15 - i * 0.025, 0.5 - i * 0.09, 12, 1, true).translate(0, (0.5 - i * 0.09) / 2, 0), flameMat);
    f.position.set((i - 1) * 0.09, 1.1, (i % 2) * 0.06 - 0.03);
    flames.add(f);
  }
  const core = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 12, 1, true).translate(0, 0.15, 0), flameCoreMat);
  core.position.set(0, 1.1, 0);
  flames.add(core);
  game.scene.add(flames);
  const light = new THREE.PointLight(0xff9a48, 6, 9, 1.6);
  light.position.set(x, 1.6, z);
  game.scene.add(light);
  return { flames, light, pos: new THREE.Vector3(x, 1.2, z) };
}

function buildFountain(game: Game) {
  const b = new MeshBuilder();
  // Lathe profiles must run up the outside and down the inside so the faces point outward: outer
  // foot → up the outer wall → across the rounded top → down the inner wall into the basin.
  const rim = new THREE.LatheGeometry(
    [new THREE.Vector2(2.98, 0.0), new THREE.Vector2(2.84, 0.12), new THREE.Vector2(2.92, 0.5), new THREE.Vector2(2.86, 0.6), new THREE.Vector2(2.6, 0.6), new THREE.Vector2(2.5, 0.5), new THREE.Vector2(2.5, 0.04)],
    64,
  );
  b.add(rim, 'marble', undefined, { uv: 'keep' });
  b.add(new THREE.CircleGeometry(2.5, 48).rotateX(-Math.PI / 2), 'marble_veined', M(0, 0.05, 0));
  const ped = new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.55, 0.05), new THREE.Vector2(0.5, 0.2), new THREE.Vector2(0.28, 0.32), new THREE.Vector2(0.24, 1.2), new THREE.Vector2(0.3, 1.32),
      new THREE.Vector2(0.95, 1.42), new THREE.Vector2(1.02, 1.55), new THREE.Vector2(0.92, 1.56), new THREE.Vector2(0.3, 1.5), new THREE.Vector2(0.16, 1.62),
      new THREE.Vector2(0.14, 2.05), new THREE.Vector2(0.22, 2.12), new THREE.Vector2(0.05, 2.3), new THREE.Vector2(0, 2.32),
    ],
    40,
  );
  b.add(ped, 'marble', undefined, { uv: 'keep' });
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, 0.3, 0), halfHeight: 0.3, radius: 2.92 });
  placeAndRegister(game, 'audio:fountain', b.build('fountain'), b.colliders, { x: 0, y: 0, z: 0 });
  // Water surfaces and the falling sheet from the upper bowl.
  const water = new THREE.MeshStandardMaterial({ color: 0x4f7f84, roughness: 0.08, metalness: 0.1, transparent: true, opacity: 0.82 });
  const pool = new THREE.Mesh(new THREE.CircleGeometry(2.5, 48).rotateX(-Math.PI / 2), water);
  pool.position.y = 0.42;
  const bowlWater = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32).rotateX(-Math.PI / 2), water);
  bowlWater.position.y = 1.53;
  const sheetMat = new THREE.MeshStandardMaterial({ color: 0xcfe6ea, roughness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
  const sheet = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 1.18, 1.1, 40, 1, true), sheetMat);
  sheet.position.y = 0.98;
  const jet = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.06, 0.5, 8, 1, true), sheetMat);
  jet.position.y = 2.5;
  game.scene.add(pool, bowlWater, sheet, jet);
  return { sheet, pool };
}

function buildForum(game: Game) {
  const b = new MeshBuilder();
  // A portico along the plaza's west edge.
  for (let i = 0; i < 9; i++) column(b, -14.5, -12 + i * 3, 5, 0.32);
  b.box('travertine', 1.2, 0.6, 26, M(-14.5, 5.3, 0));
  b.box('roof_tile', 4.4, 0.2, 26.6, new THREE.Matrix4().compose(new THREE.Vector3(-16.4, 5.85, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, 0.18)), new THREE.Vector3(1, 1, 1)));
  b.box('plaster_ochre', 0.6, 6, 26, M(-18.6, 3, 0), { collide: true });
  // Shop openings in the back wall (dark doorways).
  for (let i = 0; i < 4; i++) b.box('black', 0.05, 2.6, 2.2, M(-18.27, 1.3, -9 + i * 6));
  // Market stalls with awnings.
  const fabrics = ['fabric_red', 'fabric_ochre', 'fabric_blue', 'fabric_white'] as const;
  for (let i = 0; i < 4; i++) {
    const x = -26 - (i % 2) * 9;
    const z = -9 + Math.floor(i / 2) * 14;
    b.box('wood', 2.8, 0.9, 1.2, M(x, 0.45, z), { collide: true });
    for (const dx of [-1.4, 1.4]) for (const dz of [-0.9, 0.9]) b.add(new THREE.CylinderGeometry(0.05, 0.05, 2.4, 6), 'wood_dark', M(x + dx, 1.2, z + dz));
    b.box(fabrics[i], 3.4, 0.06, 2.4, new THREE.Matrix4().compose(new THREE.Vector3(x, 2.45, z + 0.1), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0)), new THREE.Vector3(1, 1, 1)));
    // Wares: amphorae and baskets.
    for (let k = 0; k < 3; k++) b.add(new THREE.SphereGeometry(0.18, 10, 8), k % 2 ? 'terracotta' : 'dry_grass', M(x - 0.8 + k * 0.8, 1.05, z));
  }
  placeAndRegister(game, 'audio:forum', b.build('forum'), b.colliders, { x: 0, y: 0, z: 0 });
  const s = new MeshBuilder();
  s.box('tufa', 1.6, 1.1, 1.4, M(-38, 0.55, 12), { collide: true });
  s.box('glow_fire', 0.8, 0.1, 0.6, M(-38, 1.12, 12), { castShadow: false });
  s.box('iron', 0.7, 0.35, 0.25, M(-35.6, 0.75, 12), {});
  s.add(new THREE.CylinderGeometry(0.22, 0.28, 0.6, 10), 'wood_dark', M(-35.6, 0.3, 12));
  placeAndRegister(game, 'audio:smithy', s.build('smithy'), s.colliders, { x: 0, y: 0, z: 0 });
}

function buildGarden(game: Game) {
  const b = new MeshBuilder();
  // Pool curb and the boardwalk across it.
  const curb = 0.16;
  b.box('travertine', POOL.x1 - POOL.x0 + 0.8, curb, 0.4, M((POOL.x0 + POOL.x1) / 2, curb / 2, POOL.z0 - 0.2));
  b.box('travertine', POOL.x1 - POOL.x0 + 0.8, curb, 0.4, M((POOL.x0 + POOL.x1) / 2, curb / 2, POOL.z1 + 0.2));
  b.box('travertine', 0.4, curb, POOL.z1 - POOL.z0, M(POOL.x0 - 0.2, curb / 2, 0));
  b.box('travertine', 0.4, curb, POOL.z1 - POOL.z0, M(POOL.x1 + 0.2, curb / 2, 0));
  const deckW = BOARDWALK.z1 - BOARDWALK.z0;
  const deckL = BOARDWALK.x1 - BOARDWALK.x0;
  b.box('wood_dark', deckL, 0.08, deckW, M((BOARDWALK.x0 + BOARDWALK.x1) / 2, DECK_Y - 0.04, 0), { collide: true });
  for (let i = 0; i <= 6; i++) for (const s of [-1, 1]) b.add(new THREE.CylinderGeometry(0.06, 0.06, 0.9, 6), 'wood_dark', M(BOARDWALK.x0 + 1 + i * 2.6, 0.45, s * (deckW / 2 + 0.05)));
  b.box('wood_dark', deckL, 0.06, 0.08, M((BOARDWALK.x0 + BOARDWALK.x1) / 2, 0.86, deckW / 2 + 0.05));
  b.box('wood_dark', deckL, 0.06, 0.08, M((BOARDWALK.x0 + BOARDWALK.x1) / 2, 0.86, -deckW / 2 - 0.05));
  // Cypresses and umbrella pines.
  const cyp = [[16, -14], [16, 14], [41, -14], [41, 14], [20, -15], [38, 15]];
  for (const [x, z] of cyp) {
    b.add(new THREE.CylinderGeometry(0.12, 0.16, 1.2, 6), 'bark', M(x, 0.6, z));
    b.add(new THREE.ConeGeometry(0.85, 7.5, 10), 'foliage_cypress', M(x, 4.6, z));
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, 1, z), halfHeight: 1, radius: 0.35 });
  }
  for (const [x, z] of [[39, -6], [17, 6], [36, 9]]) {
    b.add(new THREE.CylinderGeometry(0.18, 0.28, 6.5, 8), 'bark', M(x, 3.25, z));
    b.add(new THREE.SphereGeometry(2.8, 14, 8), 'foliage_pine', new THREE.Matrix4().compose(new THREE.Vector3(x, 7, z), new THREE.Quaternion(), new THREE.Vector3(1.2, 0.45, 1.2)));
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, 1.5, z), halfHeight: 1.5, radius: 0.3 });
  }
  placeAndRegister(game, 'audio:garden', b.build('garden'), b.colliders, { x: 0, y: 0, z: 0 });
  const water = new THREE.Mesh(
    new THREE.PlaneGeometry(POOL.x1 - POOL.x0, POOL.z1 - POOL.z0).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x3f6a6b, roughness: 0.06, metalness: 0.15, transparent: true, opacity: 0.78 }),
  );
  water.position.set((POOL.x0 + POOL.x1) / 2, 0.13, (POOL.z0 + POOL.z1) / 2);
  game.scene.add(water);
}

function buildHill(game: Game) {
  const b = new MeshBuilder();
  const len = RAMP.z1 - RAMP.z0;
  const ang = Math.atan2(RAMP.y1, len);
  const slopeLen = Math.hypot(len, RAMP.y1);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-ang, 0, 0));
  const center = new THREE.Vector3(0, RAMP.y1 / 2 - 0.25, (RAMP.z0 + RAMP.z1) / 2);
  b.add(new THREE.BoxGeometry(RAMP.x1 - RAMP.x0, 0.5, slopeLen), 'gravel', new THREE.Matrix4().compose(center, q, new THREE.Vector3(1, 1, 1)), { uvScale: 3 });
  b.collider({ kind: 'box', center: center.clone(), half: new THREE.Vector3((RAMP.x1 - RAMP.x0) / 2, 0.25, slopeLen / 2), rotation: q.clone() });
  // Earth bank under the ramp: a wedge (triangle profile in z–y, extruded across x).
  const bankW = RAMP.x1 - RAMP.x0 + 2.4;
  const profile = new THREE.Shape([new THREE.Vector2(0, 0), new THREE.Vector2(len + 0.5, 0), new THREE.Vector2(len + 0.5, RAMP.y1 - 0.45), new THREE.Vector2(0, -0.45)]);
  const wedge = new THREE.ExtrudeGeometry(profile, { depth: bankW, bevelEnabled: false }).rotateY(-Math.PI / 2).translate(bankW / 2, 0, RAMP.z0);
  b.add(wedge, 'tufa');
  const hw = HILL.x1 - HILL.x0;
  const hd = HILL.z1 - HILL.z0;
  b.box('rock', hw + 2, RAMP.y1, hd + 2, M(0, RAMP.y1 / 2 - 0.02, (HILL.z0 + HILL.z1) / 2), { collide: true });
  b.box('grass', hw, 0.05, hd, M(0, RAMP.y1 + 0.01, (HILL.z0 + HILL.z1) / 2));
  // Parapet with a gap for the ramp.
  for (const s of [-1, 1]) b.box('tufa', 0.5, 0.9, hd, M(s * (hw / 2 - 0.25), RAMP.y1 + 0.45, (HILL.z0 + HILL.z1) / 2), { collide: true });
  b.box('tufa', hw, 0.9, 0.5, M(0, RAMP.y1 + 0.45, HILL.z1 - 0.25), { collide: true });
  // A small shrine on the hilltop.
  for (const [x, z] of [[-1.6, 57], [1.6, 57], [-1.6, 60], [1.6, 60]]) column(b, x, z, 3.2, 0.2, RAMP.y1);
  b.box('marble', 4, 0.35, 4, M(0, RAMP.y1 + 3.4, 58.5));
  placeAndRegister(game, 'audio:hill', b.build('hill'), b.colliders, { x: 0, y: 0, z: 0 });
}

/** Gradient sky dome: warm haze at the horizon, clear blue overhead. */
function buildSky(game: Game) {
  const geo = new THREE.SphereGeometry(900, 32, 16);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const horizon = new THREE.Color(0xeadfc8);
  const mid = new THREE.Color(0xb8cfe0);
  const zenith = new THREE.Color(0x6f9bc8);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const h = Math.max(0, pos.getY(i) / 900);
    if (h < 0.18) c.copy(horizon).lerp(mid, h / 0.18);
    else c.copy(mid).lerp(zenith, Math.min(1, (h - 0.18) / 0.6));
    colors.set([c.r, c.g, c.b], i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const sky = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false }));
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  game.scene.add(sky);
  game.addSystem({ name: 'skyFollow', priority: 101, lateUpdate: () => sky.position.copy(game.camera.position) });
}

/** A ring of instanced insulae and a few temples on the horizon, and the hills beyond: Rome around the bench. */
function buildDistantCity(game: Game) {
  const rnd = new Rng(113);
  const N = 320;
  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const roof = new THREE.ConeGeometry(0.72, 1, 4, 1).rotateY(Math.PI / 4).translate(0, 0.5, 0);
  const walls = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ roughness: 0.95 }), N);
  const roofs = new THREE.InstancedMesh(roof, new THREE.MeshStandardMaterial({ roughness: 0.9 }), N);
  const plaster = [0xe3d3b0, 0xd9b98a, 0xcf9f55, 0xe9e2d3, 0xb5643f, 0xc98e5c, 0xd8ccb2];
  const tile = [0xa9512f, 0xb35a33, 0x9a4a2c, 0xb8653d];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  let n = 0;
  for (let i = 0; i < N; i++) {
    const a = rnd.range(0, Math.PI * 2);
    const r = rnd.range(78, 190);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    // Keep the hill's view corridor (south) a little more open.
    if (z > 30 && Math.abs(x) < 40) continue;
    const w = rnd.range(8, 22);
    const d = rnd.range(8, 18);
    const temple = rnd.chance(0.04);
    const h = temple ? rnd.range(14, 20) : rnd.range(6, 19);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), a + rnd.range(-0.2, 0.2));
    m.compose(new THREE.Vector3(x, 0, z), q, new THREE.Vector3(w, h, d));
    walls.setMatrixAt(n, m);
    walls.setColorAt(n, col.setHex(temple ? 0xf1ece2 : rnd.pick(plaster)));
    m.compose(new THREE.Vector3(x, h, z), q, new THREE.Vector3(w * 1.08, rnd.range(1.8, 3.2), d * 1.08));
    roofs.setMatrixAt(n, m);
    roofs.setColorAt(n, col.setHex(rnd.pick(tile)));
    n++;
  }
  walls.count = roofs.count = n;
  walls.castShadow = false;
  walls.receiveShadow = roofs.receiveShadow = true;
  game.scene.add(walls, roofs);
  // Hills on the horizon (the fog turns them blue-grey).
  const hillMat = new THREE.MeshStandardMaterial({ color: 0x7d8150, roughness: 1 });
  for (const [x, z, r, s] of [[-260, -180, 120, 0.28], [40, -300, 150, 0.22], [300, -60, 130, 0.25], [-320, 120, 140, 0.2], [220, 260, 160, 0.18]]) {
    const hill = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), hillMat);
    hill.scale.y = s * 2;
    hill.position.set(x, -2, z);
    game.scene.add(hill);
  }
}

// ---------------------------------------------------------------- the scene

const scene: SceneDef = {
  title: 'Audio',
  description: 'Sound board, footsteps by surface, spatial fountain, ambience zones, music states',
  setup(game, ui) {
    game.scene.background = new THREE.Color(0xb8cfe0);
    game.scene.fog = new THREE.Fog(0xd9d6c8, 90, 420);
    buildSky(game);
    buildDistantCity(game);

    // Ground and surface patches.
    const meadow = tex.meadow();
    meadow.repeat.set(160, 160);
    const base = new THREE.Mesh(new THREE.PlaneGeometry(800, 800).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: meadow, roughness: 1 }));
    base.receiveShadow = true;
    game.scene.add(base);
    game.physics.addBox({ x: 0, y: -0.5, z: 0 }, { x: 400, y: 0.5, z: 400 });
    const paving = groundMat(tex.paving(), 0.8);
    patch(game, PLAZA, paving, 3.2);
    patch(game, FORUM, groundMat(tex.dirt()), 3);
    patch(game, TEMPLE_GROUND, paving, 3.2);
    patch(game, GARDEN, groundMat(tex.grass()), 3);
    patch(game, PATH, groundMat(tex.gravel()), 2);
    const wood = new THREE.MeshStandardMaterial({ map: tex.planks(), roughness: 0.8 });
    const deck = patch(game, BOARDWALK, wood, 1.6, DECK_Y + 0.002);
    deck.castShadow = true;

    buildTemple(game);
    buildForum(game);
    buildGarden(game);
    buildHill(game);
    const fountain = buildFountain(game);
    const braziers = [buildBrazier(game, -4.2, -15.6), buildBrazier(game, 4.2, -15.6)];

    // Player (heading π faces north, toward the fountain and the temple).
    const player = setupPlayer(game, new THREE.Vector3(0, 0.05, 9), Math.PI);

    // Warm late-afternoon light from the south-west.
    const hemi = new THREE.HemisphereLight(0xd3e3f2, 0x9a7b56, 1.05);
    const sun = new THREE.DirectionalLight(0xffdcb0, 3.0);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera;
    sc.left = sc.bottom = -50;
    sc.right = sc.top = 50;
    sc.near = 1;
    sc.far = 300;
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.04;
    game.scene.add(hemi, sun, sun.target);
    const sunOffset = new THREE.Vector3(-55, 70, 65);
    game.addSystem({
      name: 'sunFollow',
      priority: 90,
      lateUpdate() {
        const p = player.root.position;
        const sx = Math.round(p.x / 2) * 2;
        const sz = Math.round(p.z / 2) * 2;
        sun.target.position.set(sx, p.y, sz);
        sun.position.set(sx + sunOffset.x, p.y + sunOffset.y, sz + sunOffset.z);
      },
    });

    // ---------------------------------------------------------------- audio
    const audio = installAudio(game);
    audio.ambience.altitude = { low: 2, high: 15 };
    audio.ambience.defaultReverb = 'street';
    audio.ambience.setBase({ city: 0.9, birds: 0.45, swifts: 0.7, wind: 0.75, dogs: 0.6, carts: 0.6, crickets: 0.35, owl: 0.5, cicadas: 0.25 });
    audio.ambience.addZone({ name: 'forum', center: { x: -28, y: 0, z: 0 }, radius: 13, fade: 12, layers: [{ id: 'crowd', volume: 1 }, { id: 'market', volume: 0.9 }], reverb: 'forum' });
    audio.ambience.addZone({ name: 'garden', center: { x: 29, y: 0, z: 0 }, radius: 13, fade: 10, layers: [{ id: 'birds', volume: 1 }, { id: 'cicadas', volume: 1 }, { id: 'crickets', volume: 1 }, { id: 'owl', volume: 0.9 }], reverb: 'open' });
    // The porch and cella (z -19 … -31): the temple takes over at the top of the steps.
    audio.ambience.addZone({ name: 'temple', center: { x: 0, y: 0, z: -25.5 }, radius: 5.5, fade: 3, layers: [], reverb: 'temple', music: 'temple' });
    audio.ambience.addZone({ name: 'hill', center: { x: 0, y: 16, z: 56 }, radius: 10, fade: 20, layers: [{ id: 'wind', volume: 1 }], reverb: 'open' });
    audio.loop('fountain', { position: { x: 0, y: 0.9, z: 0 } });
    for (const b of braziers) audio.loop('fire', { position: b.pos });
    audio.loop('workshop', { position: { x: -37, y: 1, z: 12 } });
    audio.loop('temple-music', { position: { x: 0, y: 3, z: -30 }, volume: 0.8, occlude: true });
    audio.music.setState('explore');

    // Player footsteps: 2D (the camera is behind the player in third person), cloak rustle, male efforts.
    audio.footsteps.attach(player, { surfaceAt, spatial: false, voice: 'm', gear: 'cloth', volume: 0.9 });

    // NPCs with spatial footsteps: a legionary circling the plaza, a gardener on the boardwalk.
    const legionary = new Actor(game, { id: 'legionary', position: { x: 8, y: 0.05, z: 0 }, layer: Layer.Npc, avatar: new PlaceholderAvatar(0x8f2a1f) });
    const gardener = new Actor(game, { id: 'gardener', position: { x: BOARDWALK.x0 + 1, y: DECK_Y + 0.05, z: 0 }, layer: Layer.Npc, avatar: new PlaceholderAvatar(0x6b7a3c) });
    game.actors.add(legionary);
    game.actors.add(gardener);
    audio.footsteps.attach(legionary, { surfaceAt, gear: 'armor', voice: 'm' });
    audio.footsteps.attach(gardener, { surfaceAt, gear: 'none', voice: 'f' });
    let ang = 0;
    let gDir = 1;
    const wish = new THREE.Vector3();
    game.addSystem({
      name: 'audioNpcs',
      fixedUpdate(dt) {
        ang += dt * (1.6 / 8.5);
        const tx = Math.cos(ang) * 8.5;
        const tz = Math.sin(ang) * 8.5;
        wish.set(tx - legionary.position.x, 0, tz - legionary.position.z);
        if (wish.lengthSq() > 0.01) wish.normalize().multiplyScalar(1.6);
        legionary.turnToward(headingFromDir(wish.x, wish.z), 4, dt);
        legionary.locomote(wish, dt);
        const gx = gardener.position.x;
        if (gx > BOARDWALK.x1 - 1) gDir = -1;
        if (gx < BOARDWALK.x0 + 1) gDir = 1;
        wish.set(gDir * 1.2, 0, -gardener.position.z * 0.5);
        gardener.turnToward(headingFromDir(wish.x, wish.z), 4, dt);
        gardener.locomote(wish, dt);
      },
    });

    // Combat / foley keys on the player.
    let doorOpen = false;
    let drawn = false;
    const fwd = new THREE.Vector3();
    game.addSystem({
      name: 'audioKeys',
      update() {
        const inp = game.input;
        if (inp.pressed('attack')) {
          player.lookForward(fwd);
          const hit = [legionary, gardener].find((a) => a.position.distanceTo(player.position) < 2.8 && fwd.dot(a.position.clone().sub(player.position).setY(0).normalize()) > 0.4);
          audio.play(Math.random() < 0.5 ? 'swing.medium' : 'swing.fast', { volume: 0.9 });
          audio.play('vox.grunt.m', { volume: 0.5, delay: 0.02 });
          if (hit) {
            const p = hit.position.clone().setY(1.2);
            audio.play(Math.random() < 0.6 ? 'clash.metal' : 'block.shield', { position: p, delay: 0.16 });
            if (Math.random() < 0.4) audio.play(hit === gardener ? 'vox.pain.f' : 'vox.pain.m', { position: p, delay: 0.3 });
          }
        }
        if (inp.pressed('block')) audio.play('block.shield', { volume: 0.9 });
        if (inp.pressed('interact')) audio.play((doorOpen = !doorOpen) ? 'door.open' : 'door.close');
        if (inp.pressed('readyWeapon')) audio.play((drawn = !drawn) ? 'weapon.draw' : 'weapon.sheathe');
      },
    });

    // Visual flicker for flames and the fountain sheet.
    let t = 0;
    game.addSystem({
      name: 'audioSceneFx',
      update(dt) {
        t += dt;
        for (const [i, b] of braziers.entries()) {
          const f = 0.8 + 0.2 * Math.sin(t * 13 + i) * Math.sin(t * 7.3 + i * 2);
          b.light.intensity = 5 + f * 2.5;
          b.flames.children.forEach((c, k) => {
            c.scale.y = 0.8 + 0.3 * Math.abs(Math.sin(t * (9 + k * 2.3) + i)) * (0.7 + 0.3 * f);
            c.scale.x = c.scale.z = 0.92 + 0.1 * Math.sin(t * (6.1 + k) + i * 3);
          });
        }
        (fountain.sheet.material as THREE.MeshStandardMaterial).opacity = 0.28 + 0.05 * Math.sin(t * 9);
      },
    });

    // Floating labels for the areas.
    const labels: [string, THREE.Vector3][] = [
      ['Fountain (spatial loop)', new THREE.Vector3(0, 3, 0)],
      ['Temple · reverb + temple music', new THREE.Vector3(0, 10.5, -21)],
      ['Forum · crowd, market, smithy', new THREE.Vector3(-27, 4, 0)],
      ['Garden · birds / cicadas / crickets · pool & boardwalk', new THREE.Vector3(28, 3.5, 0)],
      ['Hill · wind rises, city fades', new THREE.Vector3(0, 21, 56)],
    ];
    const labelEls = labels.map(([text]) => {
      const el = document.createElement('div');
      el.textContent = text;
      el.style.cssText = 'position:absolute;transform:translate(-50%,-50%);font:600 12px var(--font-display);letter-spacing:0.06em;color:#fff6e2;text-shadow:0 1px 3px #000,0 0 8px rgba(0,0,0,0.6);white-space:nowrap;pointer-events:none';
      ui.appendChild(el);
      return el;
    });
    const v = new THREE.Vector3();
    game.addSystem({
      name: 'audioLabels',
      priority: 120,
      lateUpdate() {
        const w = game.container.clientWidth || window.innerWidth;
        const h = game.container.clientHeight || window.innerHeight;
        labels.forEach(([, p], i) => {
          v.copy(p).project(game.camera);
          const el = labelEls[i];
          const d = p.distanceTo(game.camera.position);
          const vis = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1 && d < 90;
          el.style.display = vis ? '' : 'none';
          if (vis) {
            el.style.left = `${((v.x + 1) / 2) * w}px`;
            el.style.top = `${((1 - v.y) / 2) * h}px`;
            el.style.opacity = String(Math.max(0.25, 1 - d / 90));
          }
        });
      },
    });

    // The sound board.
    const board = new SoundBoard(game, ui);
    board.extraStatus = () => {
      const p = player.position;
      const zones = audio.ambience.allZones().filter((z) => z.weight > 0.05).map((z) => `${z.name} ${z.weight.toFixed(2)}`).join(', ');
      return `you: ${surfaceAt(p.x, p.y, p.z)} · y ${p.y.toFixed(1)} m${zones ? ` · zones: ${zones}` : ''}`;
    };
    game.addSystem(board);
    if (new URLSearchParams(location.search).has('noboard')) board.toggle(false);
    const cross = document.createElement('div');
    cross.className = 'crosshair';
    ui.appendChild(cross);
  },
};
export default scene;
