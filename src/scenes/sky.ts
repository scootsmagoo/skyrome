/**
 * Sky / lighting test bed: rolling hills, a lake, a hexastyle temple with a gilded roof on its
 * podium, umbrella pines, cypresses, olives, a little town, braziers and torches.
 *
 * URL parameters:
 *   &hour=6.5          fixed local solar time (the clock stops)
 *   &day=0             days after 13 May AD 113
 *   &weather=rain      clear | hazy | overcast | rain | storm   (&auto=1 lets it change by itself)
 *   &timelapse=1       fast day cycle (24 h per minute × value)
 *   &shadows=high      off | low | high      &shadowmode=cascade   (single | cascade)
 *   &post=0            disable post-processing      &tonemap=aces | agx | neutral
 *   &msaa=0            FXAA instead of MSAA
 *   &view=temple       camera preset: temple | noon | golden | dusk | lake | town | sun | moon | steps
 *   &fp=0              third person (default first person, so the placeholder doesn't block the view)
 *   &torch=1           the player carries a torch (a moving pooled light)
 *   &lamps=300         scatter extra night lamps (light-pool stress test)
 *
 * `window.__skyBench(frames)` renders N frames synchronously and reports ms/frame (for shot.mjs).
 */
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Rng } from '../core/Rng';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { MeshBuilder } from '../gfx/MeshBuilder';
import { getMaterial } from '../gfx/materials';
import { installSky } from '../world/sky';
import { WEATHER_STATES, type WeatherState } from '../world/sky/weather';
import type { ShadowMode, ShadowQuality } from '../world/sky/shadows';
import type { ToneMap } from '../gfx/post';
import { setupPlayer } from './common';
import type { SceneDef } from './types';

// ---------------------------------------------------------------- terrain

function hash2(x: number, y: number) {
  let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi), b = hash2(xi + 1, yi), c = hash2(xi, yi + 1), d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x: number, y: number, oct = 4) {
  let s = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f + i * 17.3, y * f - i * 9.1);
    f *= 2.03;
    a *= 0.5;
  }
  return s / (1 - Math.pow(0.5, oct));
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const TEMPLE = { x: 0, z: -48, y: 11 };
const LAKE = { x: 150, z: 110 };
const TOWN = { x: -135, z: 70 };
const WATER_Y = 0.4;

function height(x: number, z: number): number {
  let h = 7 * (fbm(x / 210, z / 210) - 0.45) + 2.2 * (fbm(x / 55, z / 55) - 0.5);
  const dt = Math.hypot(x - TEMPLE.x, z - TEMPLE.z);
  h += 10 * Math.exp(-(dt * dt) / (2 * 75 * 75));
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
  h -= 11 * Math.exp(-(dl * dl) / (2 * 85 * 85));
  const r = Math.hypot(x, z);
  h += smooth(230, 470, r) * (34 + 26 * fbm(x / 120 + 5, z / 120));
  // Flatten the temple terrace and the town.
  const flat = smooth(34, 22, dt);
  h = h * (1 - flat) + TEMPLE.y * flat;
  const dtw = Math.hypot(x - TOWN.x, z - TOWN.z);
  const town = smooth(60, 35, dtw);
  h = h * (1 - town * 0.75) + (h * 0.4 + 2.5) * town * 0.75;
  return h;
}

function speckleTexture(seed: number) {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  const img = g.createImageData(256, 256);
  const rng = new Rng(seed);
  for (let i = 0; i < 256 * 256; i++) {
    const x = i % 256, y = (i / 256) | 0;
    const n = 0.8 + 0.2 * (vnoise(x / 9, y / 9) * 0.45 + vnoise(x / 3.1, y / 3.1) * 0.3 + rng.next() * 0.25);
    img.data[i * 4] = img.data[i * 4 + 1] = img.data[i * 4 + 2] = Math.round(255 * n);
    img.data[i * 4 + 3] = 255;
  }
  // Tileable: blend the edges (cheap — the texture is fine-grained noise).
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function buildTerrain(game: Game) {
  const size = 1000, seg = 200;
  const geo = new THREE.PlaneGeometry(size, size, seg, seg);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const heights = new Float32Array(pos.count);
  const colors = new Float32Array(pos.count * 3);
  const grass = new THREE.Color(0x6c8a3c), dry = new THREE.Color(0xbcab6c), dirt = new THREE.Color(0xa08260), lush = new THREE.Color(0x5d7a36), meadow = new THREE.Color(0x8f9a4e);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    const h = height(x, z);
    pos.setY(i, h);
    heights[i] = h;
  }
  geo.computeVertexNormals();
  const nrm = geo.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), h = heights[i];
    const slope = 1 - nrm.getY(i);
    const n = fbm(x / 40, z / 40, 3);
    const big = fbm(x / 150 + 3, z / 150 - 2, 3);
    c.copy(grass).lerp(meadow, smooth(0.3, 0.7, fbm(x / 13, z / 13, 2)) * 0.6);
    c.lerp(dry, smooth(0.48, 0.72, n * 0.6 + big * 0.4) * 0.7);
    c.lerp(lush, smooth(3, 0.5, h - WATER_Y) * 0.7);
    c.lerp(dirt, smooth(0.08, 0.22, slope) * 0.8);
    if (h < WATER_Y + 0.25) c.lerp(new THREE.Color(0x7d6c52), 0.6);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const tex = speckleTexture(5);
  tex.repeat.set(size / 3, size / 3);
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, map: tex, roughness: 0.96, metalness: 0 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'terrain';
  mesh.receiveShadow = true;
  game.scene.add(mesh);
  game.physics.addHeightfield(-size / 2, -size / 2, size, size, seg, seg, heights);
  return mesh;
}

function waterNormalMap() {
  const s = 256;
  const data = new Uint8Array(s * s * 4);
  const waves: [number, number, number, number][] = [];
  const rng = new Rng(9);
  for (let i = 0; i < 12; i++) waves.push([rng.int(1, 6) * (rng.chance(0.5) ? 1 : -1), rng.int(1, 6) * (rng.chance(0.5) ? 1 : -1), rng.next() * 6.28, 0.6 / (1 + i * 0.35)]);
  for (let y = 0; y < s; y++)
    for (let x = 0; x < s; x++) {
      let dx = 0, dy = 0;
      for (const [kx, ky, ph, a] of waves) {
        const t = ((kx * x + ky * y) / s) * Math.PI * 2 + ph;
        dx += a * kx * Math.cos(t) * 0.05;
        dy += a * ky * Math.cos(t) * 0.05;
      }
      const n = new THREE.Vector3(-dx, -dy, 1).normalize();
      const i = (y * s + x) * 4;
      data[i] = (n.x * 0.5 + 0.5) * 255;
      data[i + 1] = (n.y * 0.5 + 0.5) * 255;
      data[i + 2] = (n.z * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, s, s, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

function buildWater(game: Game) {
  const nm = waterNormalMap();
  nm.repeat.set(70, 70);
  const mat = new THREE.MeshStandardMaterial({ color: 0x1f4a52, roughness: 0.06, metalness: 0.0, normalMap: nm, normalScale: new THREE.Vector2(0.18, 0.18) });
  const water = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), mat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = WATER_Y;
  water.name = 'water';
  water.receiveShadow = true;
  game.scene.add(water);
  game.addSystem({
    name: 'waterAnim',
    update(dt) {
      nm.offset.x += dt * 0.004;
      nm.offset.y += dt * 0.0025;
    },
  });
}

// ---------------------------------------------------------------- temple

const m4 = () => new THREE.Matrix4();
const T = (x: number, y: number, z: number) => m4().makeTranslation(x, y, z);

function column(b: MeshBuilder, x: number, y: number, z: number, shaft: number, d: number, mat: 'marble' = 'marble') {
  const r = d / 2;
  b.add(new THREE.CylinderGeometry(r * 1.32, r * 1.38, 0.18, 24), mat, T(x, y + 0.09, z));
  b.add(new THREE.TorusGeometry(r * 1.12, r * 0.16, 8, 24).rotateX(Math.PI / 2), mat, T(x, y + 0.26, z));
  b.add(new THREE.CylinderGeometry(r * 0.86, r, shaft, 24, 1), mat, T(x, y + 0.3 + shaft / 2, z), { uv: 'keep' });
  // Capital: a flared bell (Corinthian silhouette) and a square abacus.
  const top = y + 0.3 + shaft;
  b.add(new THREE.CylinderGeometry(r * 1.25, r * 0.86, d * 1.05, 24), mat, T(x, top + d * 0.52, z));
  b.add(new THREE.BoxGeometry(d * 1.42, d * 0.16, d * 1.42), mat, T(x, top + d * 1.13, z));
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(x, y + (shaft + 0.3 + d * 1.2) / 2, z), halfHeight: (shaft + 0.3 + d * 1.2) / 2, radius: r * 1.05 });
  return top + d * 1.21;
}

function buildTemple(game: Game) {
  const b = new MeshBuilder();
  const W = 14, D = 28, P = 3.4;
  // Podium: plinth, die, crowning cornice.
  b.box('travertine', W + 0.6, 0.45, D + 0.6, T(0, 0.225, 0), { collide: true });
  b.box('marble', W, P - 0.75, D, T(0, 0.45 + (P - 0.75) / 2, 0), { collide: true });
  b.box('marble', W + 0.4, 0.3, D + 0.4, T(0, P - 0.15, 0), { collide: true });
  // Front stairs (facade faces +z): 17 risers of 0.2 m.
  const steps = 17, rise = P / steps, tread = 0.36;
  for (let i = 0; i < steps; i++) {
    const depth = (steps - i) * tread;
    b.box('marble', W - 1.6, rise, depth, T(0, rise * (i + 0.5), D / 2 + depth / 2), { collide: true });
  }
  // Stair cheek walls with brazier pedestals.
  for (const sx of [-1, 1]) b.box('marble', 0.8, P, steps * tread, T(sx * (W / 2 - 0.4), P / 2, D / 2 + (steps * tread) / 2), { collide: true });

  const dcol = 1.05, shaft = 9.4, y0 = P;
  const front = D / 2 - 1.1;
  const xs = [-5.75, -3.45, -1.15, 1.15, 3.45, 5.75];
  let topY = 0;
  for (let row = 0; row < 3; row++) {
    for (const x of row === 0 ? xs : [xs[0], xs[5]]) topY = column(b, x, y0, front - row * 2.4, shaft, dcol);
  }
  // Cella (walls + engaged pilasters along the sides).
  const cellaFront = front - 2 * 2.4 - 1.4;
  const cellaBack = -D / 2 + 0.6;
  const cellaLen = cellaFront - cellaBack;
  const cz = (cellaFront + cellaBack) / 2;
  const wallH = topY - y0;
  b.box('marble', 0.9, wallH, cellaLen, T(-W / 2 + 1.1, y0 + wallH / 2, cz), { collide: true });
  b.box('marble', 0.9, wallH, cellaLen, T(W / 2 - 1.1, y0 + wallH / 2, cz), { collide: true });
  b.box('marble', W - 2.2, wallH, 0.9, T(0, y0 + wallH / 2, cellaBack + 0.45), { collide: true });
  // Front wall with a tall doorway.
  const doorW = 3.4, doorH = 7.2;
  const side = (W - 2.2 - doorW) / 2;
  for (const sx of [-1, 1]) b.box('marble', side, wallH, 0.9, T(sx * (doorW / 2 + side / 2), y0 + wallH / 2, cellaFront), { collide: true });
  b.box('marble', doorW, wallH - doorH, 0.9, T(0, y0 + doorH + (wallH - doorH) / 2, cellaFront));
  b.box('black', doorW, doorH, 0.2, T(0, y0 + doorH / 2, cellaFront - 0.3));
  b.box('bronze', doorW * 0.48, doorH, 0.12, T(-doorW * 0.27, y0 + doorH / 2, cellaFront - 0.05));
  for (let i = 0; i < 6; i++) {
    const z = cellaBack + 1.6 + i * ((cellaLen - 2.4) / 5);
    for (const sx of [-1, 1]) b.box('marble', 0.3, wallH - 0.4, 0.85, T(sx * (W / 2 - 0.55), y0 + (wallH - 0.4) / 2, z));
  }
  // Entablature: architrave, frieze, cornice with overhang.
  const eY = topY;
  const ew = W - 0.2, ed = D - 0.6;
  const ez = 0.2;
  b.box('marble', ew, 0.85, ed, T(0, eY + 0.425, ez));
  b.box('marble_veined', ew - 0.1, 0.75, ed - 0.1, T(0, eY + 0.85 + 0.375, ez));
  b.box('marble', ew + 0.7, 0.35, ed + 0.7, T(0, eY + 1.6 + 0.175, ez));
  // Pediment (front and back) and the gilded roof.
  const roofY = eY + 1.95;
  const span = ew + 0.7, pitch = 0.27;
  const ridge = (span / 2) * pitch;
  const tri = new THREE.Shape();
  tri.moveTo(-span / 2, 0);
  tri.lineTo(span / 2, 0);
  tri.lineTo(0, ridge);
  tri.closePath();
  const pedGeo = new THREE.ExtrudeGeometry(tri, { depth: 0.6, bevelEnabled: false });
  b.add(pedGeo, 'marble', T(0, roofY, ez + ed / 2 + 0.35 - 0.6));
  b.add(pedGeo, 'marble', T(0, roofY, ez - ed / 2 - 0.35));
  // Tympanum recess (darker) on the front.
  const tri2 = new THREE.Shape();
  tri2.moveTo(-span / 2 + 1.1, 0.25);
  tri2.lineTo(span / 2 - 1.1, 0.25);
  tri2.lineTo(0, ridge - 0.45);
  tri2.closePath();
  b.add(new THREE.ExtrudeGeometry(tri2, { depth: 0.08, bevelEnabled: false }), 'marble_veined', T(0, roofY, ez + ed / 2 + 0.36));
  // Raking cornices.
  const rake = Math.hypot(span / 2, ridge) + 0.5;
  const ang = Math.atan2(ridge, span / 2);
  for (const sx of [-1, 1]) {
    const m = m4().makeRotationZ(sx * -ang).premultiply(T((sx * span) / 4, roofY + ridge / 2 + 0.12, ez + ed / 2 + 0.25));
    b.add(new THREE.BoxGeometry(rake, 0.3, 0.9), 'marble', m);
  }
  // Roof planes (gilded bronze tiles, as on the Capitoline temple).
  const roofLen = ed + 1.1;
  for (const sx of [-1, 1]) {
    const m = m4().makeRotationZ(sx * -ang).premultiply(T((sx * span) / 4, roofY + ridge / 2 + 0.3, ez));
    b.add(new THREE.BoxGeometry(rake + 0.2, 0.18, roofLen), 'gilded_bronze', m);
  }
  b.box('gilded_bronze', 0.35, 0.35, roofLen, T(0, roofY + ridge + 0.38, ez));
  // Acroteria: small gilded figures on the gable apex and corners (simple silhouettes).
  for (const [x, y] of [[0, roofY + ridge + 0.5], [-span / 2 + 0.3, roofY + 0.4], [span / 2 - 0.3, roofY + 0.4]] as const) {
    b.add(new THREE.CylinderGeometry(0.25, 0.4, 0.4, 10), 'gilded_bronze', T(x, y + 0.2, ez + ed / 2 + 0.1));
    b.add(new THREE.CapsuleGeometry(0.28, 0.9, 4, 10), 'gilded_bronze', T(x, y + 1.05, ez + ed / 2 + 0.1));
  }
  const g = b.build('temple');
  g.position.set(TEMPLE.x, TEMPLE.y, TEMPLE.z);
  g.updateMatrixWorld(true);
  for (const c of b.colliders) {
    if (c.kind === 'box') game.physics.addOrientedBox(c.center.clone().add(g.position), c.half, c.rotation ?? new THREE.Quaternion());
    else if (c.kind === 'cylinder') game.physics.addCylinder(c.center.clone().add(g.position), c.halfHeight, c.radius);
  }
  game.scene.add(g);
  return { stairsFront: TEMPLE.z + D / 2 + steps * tread, W, P };
}

// ---------------------------------------------------------------- props

function buildColumns(game: Game) {
  // A row of honorific columns along the path, one fallen drum for good measure.
  const b = new MeshBuilder();
  const pts: [number, number][] = [[-14, -6], [14, -6], [-14, 6], [14, 6]];
  for (const [x, z] of pts) {
    const y = height(x, z) - 0.3;
    b.box('travertine', 2.2, 1.2, 2.2, T(x, y + 0.6, z), { collide: true });
    const top = column(b, x, y + 1.2, z, 7.5, 0.9);
    b.add(new THREE.CylinderGeometry(0.5, 0.5, 0.25, 16), 'bronze', T(x, top + 0.12, z));
    b.add(new THREE.SphereGeometry(0.45, 16, 12), 'gilded_bronze', T(x, top + 0.7, z));
  }
  const g = b.build('columns');
  for (const c of b.colliders) {
    if (c.kind === 'box') game.physics.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
    else if (c.kind === 'cylinder') game.physics.addCylinder(c.center, c.halfHeight, c.radius);
  }
  game.scene.add(g);
}

function buildTown(game: Game, rng: Rng) {
  const b = new MeshBuilder();
  const lamps: THREE.Vector3[] = [];
  const walls = ['plaster_cream', 'plaster_ochre', 'plaster_white', 'brick', 'plaster_red'] as const;
  for (let i = 0; i < 70; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = Math.sqrt(rng.next()) * 48;
    const x = TOWN.x + Math.cos(a) * r, z = TOWN.z + Math.sin(a) * r;
    const w = rng.range(6, 12), d = rng.range(6, 11), floors = rng.int(1, 3), h = floors * 3.1;
    const y = height(x, z) - 0.5;
    const rot = Math.round(rng.next() * 4) * (Math.PI / 2) + rng.range(-0.08, 0.08);
    const m = m4().makeRotationY(rot).premultiply(T(x, y + h / 2, z));
    b.box(rng.pick(walls), w, h + 0.5, d, m, { collide: true });
    // Hip-ish roof: a flattened pyramid of terracotta.
    const roof = new THREE.ConeGeometry(Math.hypot(w, d) / 2 * 1.02, 1.6, 4, 1);
    roof.rotateY(Math.PI / 4);
    roof.scale(w / Math.hypot(w, d) * 1.414, 1, d / Math.hypot(w, d) * 1.414);
    b.add(roof, 'roof_tile', m4().makeRotationY(rot).premultiply(T(x, y + h + 0.25 + 0.8, z)));
    // Dark windows on the facade.
    const fwd = new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot));
    const rightV = new THREE.Vector3(Math.cos(rot), 0, -Math.sin(rot));
    for (let f = 0; f < floors; f++) {
      const n = Math.max(1, Math.floor(w / 3));
      for (let k = 0; k < n; k++) {
        const off = (k - (n - 1) / 2) * 2.6;
        const p = new THREE.Vector3(x, y + 1.9 + f * 3.1 + 0.5, z).addScaledVector(fwd, d / 2 + 0.02).addScaledVector(rightV, off);
        b.add(new THREE.BoxGeometry(0.8, 1.1, 0.06), 'black', m4().makeRotationY(rot).premultiply(T(p.x, p.y, p.z)), { castShadow: false });
        if (rng.chance(0.18)) lamps.push(p.clone().addScaledVector(fwd, 0.25));
      }
    }
  }
  const g = b.build('town');
  for (const c of b.colliders) if (c.kind === 'box') game.physics.addOrientedBox(c.center, c.half, c.rotation ?? new THREE.Quaternion());
  game.scene.add(g);
  return lamps;
}

function buildTrees(game: Game, rng: Rng, avoid: (x: number, z: number) => boolean) {
  const bark = getMaterial('bark'), pineM = getMaterial('foliage_pine'), cypM = getMaterial('foliage_cypress'), oliveM = getMaterial('foliage_olive');
  const place = (n: number, minR: number, maxR: number) => {
    const out: THREE.Vector3[] = [];
    let tries = 0;
    while (out.length < n && tries++ < n * 30) {
      const a = rng.next() * Math.PI * 2, r = minR + Math.sqrt(rng.next()) * (maxR - minR);
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      const y = height(x, z);
      if (y < WATER_Y + 0.6 || avoid(x, z)) continue;
      out.push(new THREE.Vector3(x, y, z));
    }
    return out;
  };
  const dummy = new THREE.Object3D();
  const inst = (geo: THREE.BufferGeometry, mat: THREE.Material, pts: THREE.Vector3[], f: (p: THREE.Vector3, i: number, o: THREE.Object3D) => void, shadow = true) => {
    const im = new THREE.InstancedMesh(geo, mat, pts.length);
    pts.forEach((p, i) => {
      dummy.position.copy(p);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.set(1, 1, 1);
      f(p, i, dummy);
      dummy.updateMatrix();
      im.setMatrixAt(i, dummy.matrix);
    });
    im.castShadow = shadow;
    im.receiveShadow = true;
    im.computeBoundingSphere();
    game.scene.add(im);
    return im;
  };
  // Umbrella (stone) pines: tall bare trunk, wide flat lumpy canopy.
  const pines = place(80, 30, 420);
  const pineScale = pines.map(() => rng.range(0.8, 1.25));
  inst(new THREE.CylinderGeometry(0.2, 0.36, 1, 7).translate(0, 0.5, 0), bark, pines, (p, i, o) => {
    o.scale.set(pineScale[i], 10.5 * pineScale[i], pineScale[i]);
    o.rotation.z = (rng.next() - 0.5) * 0.14;
  });
  const pineFoliage = new THREE.MeshStandardMaterial({ color: 0x4a6431, roughness: 0.9, vertexColors: true });
  inst(pineCanopy(), pineFoliage, pines, (p, i, o) => {
    const s = pineScale[i];
    o.position.y += 10.2 * s;
    o.scale.set(4.6 * s, 3.4 * s, 4.6 * s);
    o.rotation.y = rng.next() * 6.28;
  });
  // Cypresses: dark narrow flames.
  const cyp = place(120, 25, 430);
  const cypGeo = new THREE.SphereGeometry(1, 10, 12);
  const cpp = cypGeo.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < cpp.count; i++) {
    const y = cpp.getY(i);
    const taper = y > 0 ? 1 - y * 0.75 : 1 + y * 0.15;
    cpp.setXYZ(i, cpp.getX(i) * taper, y, cpp.getZ(i) * taper);
  }
  cypGeo.translate(0, 1, 0);
  cypGeo.computeVertexNormals();
  // An avenue of cypresses along the processional way.
  for (let i = 0; i < 4; i++) for (const sx of [-1, 1]) cyp.push(new THREE.Vector3(sx * 10.5, height(sx * 10.5, -16 + i * 10), -16 + i * 10));
  inst(cypGeo, cypM, cyp, (p, i, o) => {
    const s = rng.range(0.8, 1.3);
    o.position.y -= 0.3;
    o.scale.set(1.15 * s, 6.5 * s, 1.15 * s);
  });
  // Olives: low, silvery, round.
  const olives = place(140, 40, 380);
  inst(new THREE.CylinderGeometry(0.16, 0.25, 1, 6).translate(0, 0.5, 0), bark, olives, (p, i, o) => o.scale.set(1, 1.6, 1));
  const oliveGeo = new THREE.IcosahedronGeometry(1, 1);
  inst(oliveGeo, oliveM, olives, (p, i, o) => {
    const s = rng.range(0.8, 1.3);
    o.position.y += 2.1 * s;
    o.scale.set(2.2 * s, 1.5 * s, 2.2 * s);
    o.rotation.y = rng.next() * 6.28;
  });
}

/** Several lumpy flattened blobs merged into one umbrella-pine crown, darker underneath. */
function pineCanopy() {
  const parts: THREE.BufferGeometry[] = [];
  const blobs: [number, number, number, number][] = [[0, 0, 0, 1], [0.55, -0.08, 0.1, 0.62], [-0.5, -0.05, 0.25, 0.6], [0.1, -0.1, -0.58, 0.58], [-0.2, 0.05, 0.5, 0.55], [0.45, 0, -0.45, 0.5]];
  for (const [x, y, z, r] of blobs) {
    const g = new THREE.IcosahedronGeometry(r, 2);
    const p = g.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const k = 1 + 0.16 * Math.sin(v.x * 9 + v.z * 7 + x * 3) + 0.1 * Math.sin(v.z * 13 - v.x * 5);
      p.setXYZ(i, x + v.x * k, y + v.y * (v.y > 0 ? 0.42 : 0.18) * k, z + v.z * k);
    }
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  const merged = mergeGeometries(parts)!;
  merged.computeVertexNormals();
  const pos = merged.getAttribute('position') as THREE.BufferAttribute;
  const col = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const y = pos.getY(i);
    const k = 0.45 + 0.55 * smooth(-0.2, 0.35, y);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = k;
  }
  merged.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return merged;
}

function brazier(b: MeshBuilder, x: number, y: number, z: number) {
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    const m = m4().makeRotationFromEuler(new THREE.Euler(Math.sin(a) * 0.18, 0, -Math.cos(a) * 0.18)).premultiply(T(x + Math.cos(a) * 0.28, y + 0.55, z + Math.sin(a) * 0.28));
    b.add(new THREE.CylinderGeometry(0.035, 0.035, 1.15, 6), 'bronze', m);
  }
  b.add(new THREE.CylinderGeometry(0.55, 0.3, 0.32, 16), 'bronze', T(x, y + 1.2, z));
  b.add(new THREE.ConeGeometry(0.38, 0.55, 8), 'glow_fire', T(x, y + 1.55, z), { castShadow: false });
}

function torchPost(b: MeshBuilder, x: number, y: number, z: number) {
  b.add(new THREE.CylinderGeometry(0.07, 0.09, 2.6, 6), 'wood_dark', T(x, y + 1.3, z));
  b.add(new THREE.CylinderGeometry(0.11, 0.07, 0.35, 8), 'iron', T(x, y + 2.7, z));
  b.add(new THREE.ConeGeometry(0.12, 0.3, 6), 'glow_fire', T(x, y + 3.0, z), { castShadow: false });
}

// ---------------------------------------------------------------- views

type Look = [number, number, number] | 'sun' | 'moon';
const VIEWS: Record<string, { pos: [number, number]; look: Look; pitch?: number; eye?: number }> = {
  temple: { pos: [3, 26], look: [0, 19, -48] },
  noon: { pos: [34, 4], look: [0, 17, -46] },
  golden: { pos: [-40, -4], look: [0, 16, -50] },
  dusk: { pos: [24, 14], look: [-6, 12, -48] },
  lake: { pos: [72, 56], look: [150, 2, 110] },
  town: { pos: [-60, 30], look: [-135, 5, 70] },
  sun: { pos: [-58, -44], look: 'sun', pitch: 0.06 },
  moon: { pos: [30, 30], look: 'moon' },
  steps: { pos: [-4, -24], look: [2, 18, -40] },
};

function applyView(game: Game, name: string) {
  const v = VIEWS[name] ?? VIEWS.temple;
  let [x, z] = v.pos;
  // Never stand in the lake: walk back toward the temple until on dry ground.
  for (let i = 0; i < 60 && height(x, z) < WATER_Y + 0.4; i++) {
    x += (TEMPLE.x - x) * 0.05;
    z += (TEMPLE.z - z) * 0.05;
  }
  const p = game.player;
  const y = height(x, z) + 0.1;
  p.teleport({ x, y, z });
  const eye = y + (v.eye ?? 1.62);
  let dx: number, dy: number, dz: number;
  if (v.look === 'sun' || v.look === 'moon') {
    const d = v.look === 'sun' ? game.sky.sunDir : game.sky.moonDir;
    dx = d.x;
    dy = d.y;
    dz = d.z;
  } else {
    dx = v.look[0] - x;
    dy = v.look[1] - eye;
    dz = v.look[2] - z;
  }
  const hd = Math.hypot(dx, dz);
  p.yaw = Math.atan2(-dx, -dz);
  p.pitch = v.pitch ?? Math.min(0.5, Math.atan2(dy, hd) * (v.look === 'moon' ? 0.6 : 1));
  p.heading = p.yaw + Math.PI;
}

// ---------------------------------------------------------------- scene

const scene: SceneDef = {
  title: 'Sky',
  description: 'Sky, sun & moon, weather, shadows, post-processing and the light pool',
  setup(game) {
    const q = new URLSearchParams(location.search);
    const rng = new Rng(113);

    // Time & weather from the URL.
    const day = Number(q.get('day') ?? 0);
    const hourParam = q.get('hour');
    const hour = hourParam !== null ? Number(hourParam) : 17.8;
    game.time.restore({ totalHours: day * 24 + hour });
    if (hourParam !== null) game.time.paused = true;
    const tl = q.get('timelapse');
    if (tl) {
      game.time.paused = false;
      game.time.timeScale = 1440 * Number(tl || 1);
    }
    const weatherParam = q.get('weather') as WeatherState | null;
    const weather = weatherParam && (WEATHER_STATES as readonly string[]).includes(weatherParam) ? weatherParam : 'clear';

    const sky = installSky(game, {
      weather,
      autoWeather: q.get('auto') === '1',
      shadows: (q.get('shadows') as ShadowQuality | null) ?? undefined,
      shadowMode: (q.get('shadowmode') as ShadowMode | null) ?? undefined,
      post: { toneMapping: (q.get('tonemap') as ToneMap | null) ?? 'aces', msaa: q.has('msaa') ? q.get('msaa') === '1' : undefined },
    });
    if (q.get('post') === '0') game.post.enabled = false;

    buildTerrain(game);
    buildWater(game);
    const temple = buildTemple(game);
    buildColumns(game);
    const windowLamps = buildTown(game, rng);
    buildTrees(game, rng, (x, z) => Math.hypot(x - TEMPLE.x, z - TEMPLE.z) < 34 || Math.hypot(x - TOWN.x, z - TOWN.z) < 62 || (Math.abs(x) < 9 && z > -20 && z < 60));

    // Fire: braziers on the stair cheeks (always burning), torches along the path (lit at dusk),
    // and lamps in the town windows.
    const props = new MeshBuilder();
    const by = TEMPLE.y + temple.P;
    const bz = TEMPLE.z + 14 + 3;
    for (const sx of [-1, 1]) {
      brazier(props, sx * (temple.W / 2 - 0.4), by, bz);
      game.lights.request({ position: { x: sx * (temple.W / 2 - 0.4), y: by + 1.7, z: bz }, color: 0xff8a3a, intensity: 40, distance: 18, flicker: 0.5, glow: 0.7, priority: 1.6 });
    }
    for (let i = 0; i < 5; i++) {
      for (const sx of [-1, 1]) {
        const x = sx * 4.2, z = temple.stairsFront + 6 + i * 9;
        const y = height(x, z);
        torchPost(props, x, y, z);
        game.lights.request({ position: { x, y: y + 3.15, z }, color: 0xff9246, intensity: 16, distance: 13, flicker: 0.35, night: true, glow: 0.38 });
      }
    }
    for (const p of windowLamps) game.lights.request({ position: p, color: 0xffa860, intensity: 5, distance: 7, flicker: 0.12, night: true, glow: 0.22, priority: 0.5 });
    const pg = props.build('props');
    game.scene.add(pg);
    const extra = Number(q.get('lamps') ?? 0);
    for (let i = 0; i < extra; i++) {
      const a = rng.next() * Math.PI * 2, r = 20 + Math.sqrt(rng.next()) * 380;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      game.lights.request({ position: { x, y: height(x, z) + 2.5, z }, intensity: 10, distance: 10, flicker: 0.3, night: true, glow: 0.3 });
    }

    setupPlayer(game, new THREE.Vector3(3, height(3, 26) + 0.1, 26), Math.PI);
    if (q.get('fp') !== '0') game.player.setViewMode('first');
    // Sun/moon views need the sky's first update: aim after one frame.
    const view = q.get('view') ?? 'temple';
    applyView(game, view === 'sun' || view === 'moon' ? 'temple' : view);
    if (view === 'sun' || view === 'moon') game.events.once('game:ready', () => requestAnimationFrame(() => applyView(game, view)));
    if (q.get('torch') === '1') {
      // A torch carried in the right hand: one pooled light that follows the player every frame.
      const torch = game.lights.request({ position: game.player.position, color: 0xff8f40, intensity: 14, distance: 12, flicker: 0.45, glow: 0.25, priority: 3, night: true });
      const off = new THREE.Vector3();
      game.addSystem({
        name: 'carriedTorch',
        priority: 104,
        lateUpdate() {
          const p = game.player;
          off.set(Math.cos(p.yaw) * 0.45, 1.75, -Math.sin(p.yaw) * 0.45).addScaledVector(p.lookForward(), 0.35);
          torch.setPosition(off.add(p.root.position));
        },
      });
    }
    void sky;

    // Dev hooks for shot.mjs.
    const w = window as unknown as Record<string, unknown>;
    w.__skyView = (name: string) => applyView(game, name);
    w.__skyBench = (frames = 120) => {
      const gl = game.renderer.getContext();
      const px = new Uint8Array(4);
      game.renderFrame();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const t0 = performance.now();
      for (let i = 0; i < frames; i++) game.renderFrame();
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const ms = (performance.now() - t0) / frames;
      game.renderFrame();
      const info = game.renderer.info.render;
      return { msPerFrame: +ms.toFixed(3), drawCalls: info.calls, triangles: info.triangles, lights: game.lights.count, envRefreshes: game.sky.env.refreshes, lutBakes: game.sky.dome.bakes };
    };
  },
};
export default scene;
