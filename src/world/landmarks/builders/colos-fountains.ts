/**
 * Fountains of the valley and the Esquiline:
 *
 * - meta-sudans (H): the Flavian "sweating turning-post" — a brick-and-concrete cone faced with
 *   marble, ≈ 17 m high, on a drum with niches, standing in a round basin 16 m across. Water oozes
 *   from the top and runs down the cone in a moving sheen (an animated, semi-transparent film),
 *   spills from the niches into the basin. Several regions meet here; the triumphal route turns
 *   onto the Sacra Via beside it.
 * - lacus-orphei: a street fountain with Orpheus charming the beasts, at the top of the Clivus
 *   Suburanus.
 */
import * as THREE from 'three';
import { MeshBuilder } from '../../../gfx/MeshBuilder';
import { Draw } from '../../../arch/fabric';
import { ProfileBuilder, lathe } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { seatedDeity, togate } from '../../../arch/classical/statues';
import { placeProp } from '../../../arch/props';
import { Rng } from '../../../core/Rng';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { instanceLod } from './colos-kit';

// ---------------------------------------------------------------- moving water material

let sheetMat: THREE.MeshStandardMaterial | null = null;
let sheetTex: THREE.DataTexture | null = null;

/** Streaky normal map for running water (pure: rows of vertical rivulets). */
export function rivuletNormals(w = 64, h = 128, seed = 7): Uint8Array {
  const out = new Uint8Array(w * h * 4);
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const phase = Array.from({ length: w }, () => rnd() * Math.PI * 2);
  const amp = Array.from({ length: w }, () => 0.4 + rnd() * 0.6);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = (y / h) * Math.PI * 2;
      // Horizontal slope from the rivulet ridges, vertical slope from travelling beads.
      const nx = Math.sin((x / w) * Math.PI * 2 * 9 + phase[x % 7] * 0.3) * 0.35;
      const ny = Math.sin(v * 6 + phase[x]) * 0.5 * amp[x];
      const i = (y * w + x) * 4;
      out[i] = Math.round((nx * 0.5 + 0.5) * 255);
      out[i + 1] = Math.round((ny * 0.5 + 0.5) * 255);
      out[i + 2] = 230;
      out[i + 3] = 255;
    }
  }
  return out;
}

/** Shared material for water films (sheets running down stone), animated by `animateWater`. */
export function waterSheetMaterial(): THREE.MeshStandardMaterial {
  if (sheetMat) return sheetMat;
  const tex = new THREE.DataTexture(rivuletNormals(), 64, 128, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  sheetTex = tex;
  sheetMat = new THREE.MeshStandardMaterial({
    color: 0xb9d4d2,
    roughness: 0.06,
    metalness: 0.15,
    transparent: true,
    opacity: 0.42,
    normalMap: tex,
    normalScale: new THREE.Vector2(0.9, 0.9),
    depthWrite: false,
  });
  sheetMat.name = 'colos:water-sheet';
  return sheetMat;
}

/** Scroll the water film texture (called each frame by the module's LOD system). */
export function animateWater(dt: number) {
  if (sheetTex) sheetTex.offset.y = (sheetTex.offset.y + dt * 0.35) % 1;
}

let hooked = false;

// ---------------------------------------------------------------- Meta Sudans

function buildMetaSudans(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const high = ctx.detail === 'high';
  const S = ctx.S;
  const spots: Spot[] = [];
  const Rb = 8 * S; // basin radius (16 m across)
  const H = 17 * S; // total height
  const seg = high ? 48 : 20;
  // Paved round piazza with a travertine kerb (the crossroads of the regions).
  const plaza = lathe(new ProfileBuilder(Rb + 4.5, 0.0).to(Rb + 4.5, 0.08).to(0.0, 0.08).build(), { segments: seg });
  b.add(plaza, 'paving_travertine', undefined, { castShadow: false });
  // Basin: low marble rim (seat height), water surface, a step inside.
  const rim = lathe(new ProfileBuilder(Rb + 0.1, 0.0).to(Rb + 0.1, 0.62).to(Rb + 0.05, 0.68).to(Rb - 0.4, 0.68).to(Rb - 0.45, 0.62).to(Rb - 0.45, 0.25).build(), { segments: seg });
  b.add(rim, 'marble');
  b.add(lathe(new ProfileBuilder(Rb + 0.35, 0.0).to(Rb + 0.35, 0.16).to(Rb + 0.1, 0.16).build(), { segments: seg }), 'travertine');
  const water = new THREE.CircleGeometry(Rb - 0.44, seg);
  water.rotateX(-Math.PI / 2);
  water.translate(0, 0.42, 0);
  b.add(water, 'water', undefined, { castShadow: false });
  // Drum (with niches) and cone.
  const rd = 3.2 * S; // drum radius
  const hd = 4.2 * S; // drum height
  const drum = lathe(new ProfileBuilder(rd + 0.25, 0.0).to(rd + 0.25, 0.35).to(rd, 0.45).to(rd, hd - 0.4).to(rd + 0.18, hd - 0.28).to(rd + 0.18, hd).to(0.0, hd).build(), { segments: seg });
  b.add(drum, 'marble');
  const niches = 8;
  for (let i = 0; i < niches; i++) {
    const a = ((i + 0.5) / niches) * Math.PI * 2;
    const f = d.at(Math.sin(a) * (rd + 0.01), 0, Math.cos(a) * (rd + 0.01), a + Math.PI);
    // A shallow arched niche: dark recess, marble frame, a spout and its fall into the basin.
    f.span('black', -0.32, 0.9, -0.02, 0.32, 1.85, 0.04);
    f.cyl('black', 0, 1.85, 0.01, 0.32, 0.04, 8, { rx: Math.PI / 2 });
    f.span('marble_veined', -0.4, 0.8, -0.06, 0.4, 0.9, 0.02);
    if (high) {
      // Spout: a short bronze pipe and its fall (water film material), foam where it lands.
      f.cyl('bronze', 0, 1.05, -0.08, 0.03, 0.18, 6, { rx: Math.PI / 2 });
      const fall = new THREE.CylinderGeometry(0.035, 0.06, 0.8, 6, 1, true);
      fall.rotateX(0.75);
      fall.translate(0, 0.74, -0.35);
      b.add(fall, waterSheetMaterial(), f.m, { castShadow: false });
      f.cyl('fabric_white', 0, 0.43, -0.62, 0.16, 0.02, 8);
    }
  }
  // The cone: a slightly concave turning-post profile rising to an egg-shaped finial.
  const rc = 2.6 * S;
  const coneTop = H - 1.2;
  const coneProf = new ProfileBuilder(rc, hd);
  const n = high ? 12 : 6;
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = rc * (1 - t) ** 1.12 + 0.18 * t;
    coneProf.to(r, hd + (coneTop - hd) * t);
  }
  coneProf.to(0.0, coneTop);
  b.add(lathe(coneProf.build(), { segments: seg }), 'marble');
  // Moulded ring at the cone's foot and a bronze finial (a closed bud).
  b.add(lathe(new ProfileBuilder(rc + 0.22, hd).to(rc + 0.22, hd + 0.15).to(rc + 0.05, hd + 0.3).to(rc, hd + 0.3).build(), { segments: seg }), 'marble_veined');
  b.add(lathe(new ProfileBuilder(0.25, coneTop - 0.05).to(0.34, coneTop + 0.25).to(0.3, coneTop + 0.7).to(0.12, coneTop + 1.05).to(0.0, H).build(), { segments: high ? 16 : 8 }), 'gilded_bronze');
  // The water film: a cone a few cm proud of the marble, from the finial down over the drum.
  const film = new ProfileBuilder(rc + 0.25, hd + 0.32);
  for (let i = 1; i <= n; i++) {
    const t = i / n;
    const r = rc * (1 - t) ** 1.12 + 0.18 * t + 0.035;
    film.to(r, hd + (coneTop - hd) * t);
  }
  film.to(0.0, coneTop + 0.05);
  const filmGeo = lathe(film.build(), { segments: seg });
  // Its own mesh (transparent, animated): UV v runs up the profile, so scrolling v makes it run down.
  const filmMesh = new THREE.Mesh(filmGeo, waterSheetMaterial());
  filmMesh.name = 'meta-sudans:water';
  filmMesh.renderOrder = 2;
  const sys = instanceLod(ctx.game);
  if (sys && !hooked) {
    hooked = true;
    sys.hook((dt) => animateWater(dt));
  }
  // Colliders: basin rim ring (as a cylinder ring of boxes), drum + cone.
  const ringN = 24;
  for (let i = 0; i < ringN; i++) {
    const a = (i / ringN) * Math.PI * 2;
    const c = new THREE.Vector3(Math.sin(a) * (Rb - 0.18), 0.34, Math.cos(a) * (Rb - 0.18));
    b.collider({ kind: 'box', center: c, half: new THREE.Vector3(((Rb * Math.PI * 2) / ringN) * 0.55, 0.34, 0.3), rotation: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), a) });
  }
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, hd / 2, 0), halfHeight: hd / 2, radius: rd + 0.25 });
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, (hd + H) / 2, 0), halfHeight: (H - hd) / 2, radius: rc * 0.6 });
  // Water inside the basin is wading depth only; block it so nobody walks on water.
  b.collider({ kind: 'cylinder', center: new THREE.Vector3(0, 0.3, 0), halfHeight: 0.3, radius: Rb - 0.5 });
  // Seats on the rim (people rest and fill jugs here), a vista and a meeting spot.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    spots.push({ id: `meta-sudans-rim-${i + 1}`, kind: 'sit', position: new THREE.Vector3(Math.sin(a) * (Rb + 0.25), 0.7, Math.cos(a) * (Rb + 0.25)), heading: a });
  }
  spots.push({ id: 'meta-sudans-fountain', kind: 'shrine', position: new THREE.Vector3(0, 0.1, -(Rb + 1.2)), heading: 0 });
  spots.push({ id: 'meta-sudans-vista', kind: 'vista', position: new THREE.Vector3(Rb + 3.5, 0.1, Rb + 3.5), heading: -Math.PI * 0.75 });
  // Water-carriers' jugs and a pair of street altars at the crossroads (regions meet here).
  if (high) {
    const rng = new Rng('meta');
    placeProp(d, 'amphora_tall', Rb + 0.9, 0.08, 0.6, 0.3, { rng });
    placeProp(d, 'amphora_tall', Rb + 1.1, 0.08, 1.2, 1.2, { rng });
    placeProp(d, 'altar', -(Rb + 2.6), 0.08, -(Rb + 0.8), Math.PI / 3, { rng });
  }
  const object = b.build('meta-sudans');
  object.add(filmMesh);
  return { object, colliders: b.colliders, spots, cullDistance: 1600 };
}

// ---------------------------------------------------------------- Lacus Orphei

function buildLacusOrphei(ctx: LandmarkContext): LandmarkBuild {
  const b = new MeshBuilder();
  const S = ctx.S;
  const high = ctx.detail === 'high';
  // A street fountain: a wide rectangular basin before a niche wall with Orpheus seated, his lyre,
  // and beasts around (a lion, a deer and an eagle on a rock), water from masks into the basin.
  // The front faces the street (−z). Human scale, the whole ~5 × 3.6 m on a stepped base.
  let lo = Infinity;
  let hi = -Infinity;
  for (const [x, z] of [[-3, -2], [3, -2], [3, 2], [-3, 2], [0, 0]]) {
    const g = ctx.groundAt(x, z);
    lo = Math.min(lo, g);
    hi = Math.max(hi, g);
  }
  const y0 = Math.max(0, hi) + 0.02;
  const d = new Draw(b).at(0, y0, 0);
  const w = Math.max(5, 8 * S * 1.0);
  if (lo < y0 - 0.05) d.span('travertine', -w / 2 - 0.3, lo - y0 - 0.3, -1.9, w / 2 + 0.3, 0, 2.1, { collide: true });
  // Back wall with a pedimented niche.
  d.span('travertine', -w / 2, 0, 1.2, w / 2, 3.6, 1.9, { collide: true });
  d.span('marble', -1.3, 0.9, 1.15, 1.3, 3.0, 1.22);
  d.span('black', -1.0, 1.0, 1.1, 1.0, 2.8, 1.14);
  d.span('marble', -w / 2 - 0.1, 3.6, 1.1, w / 2 + 0.1, 3.85, 2.0);
  const ped = new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-1.6, 0), new THREE.Vector2(1.6, 0), new THREE.Vector2(0, 0.7)]), { depth: 0.3, bevelEnabled: false });
  d.geo(ped, 'marble', 0, 3.0, 0.9);
  // Orpheus seated with the lyre on a pedestal before the niche, beasts at his feet.
  d.span('marble', -1.1, 0, 0.55, 1.1, 1.0, 1.2, { collide: true });
  const om = d.m.clone().multiply(new THREE.Matrix4().makeTranslation(0, 1.0, 0.9));
  if (high) {
    seatedDeity(b, om, { material: 'marble', scale: 0.62, detail: 'low' });
    d.box('gilded_bronze', 0.32, 1.95, 0.6, 0.3, 0.45, 0.05, { rz: 0.2 });
    d.ellipsoid('marble_veined', -0.75, 1.15, 0.75, 0.3, 0.2, 0.16);
    d.ellipsoid('marble_veined', -0.95, 1.3, 0.62, 0.12, 0.12, 0.12);
    d.ellipsoid('marble_veined', 0.82, 1.15, 0.78, 0.25, 0.16, 0.14);
    d.box('bronze', 0.85, 2.6, 1.05, 0.5, 0.08, 0.18, { rz: 0.15 });
  } else {
    d.box('marble', 0, 1.6, 0.9, 0.7, 1.2, 0.4);
  }
  // Basin with lion-head spouts.
  d.span('travertine', -w / 2 + 0.2, 0, -1.2, w / 2 - 0.2, 0.75, 0.55, { collide: true });
  d.span('water', -w / 2 + 0.4, 0.6, -1.0, w / 2 - 0.4, 0.62, 0.5);
  for (const x of [-1.6, 1.6]) {
    d.ellipsoid('bronze', x, 1.35, 1.12, 0.14, 0.16, 0.08);
    if (high) d.rod('water', { x, y: 1.3, z: 1.05 }, { x, y: 0.62, z: 0.3 }, 0.025, 5);
  }
  d.cyl('travertine', 0, 0.08, -1.6, 0.42, 0.16, 10);
  void togate;
  void inscriptionPanel;
  const spots: Spot[] = [
    { id: 'lacus-orphei-basin', kind: 'container', position: d.point(0, 0.05, -1.7), heading: 0 },
    { id: 'lacus-orphei-statue', kind: 'shrine', position: d.point(0.8, 0.05, -2.2), heading: 0 },
  ];
  return { object: b.build('lacus-orphei'), colliders: b.colliders, spots, cullDistance: 400 };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['meta-sudans'], build: buildMetaSudans },
  { handles: ['lacus-orphei'], build: buildLacusOrphei },
];
