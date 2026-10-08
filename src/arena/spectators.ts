/**
 * The crowd in the stands: thousands of seated spectators drawn as instances of one low-poly
 * figure (72 triangles), in eight sectors round the bowl so the far side culls. The vertex shader
 * animates them: everyone turns their head toward the fight, the excitable ones pump their arms
 * as the crowd warms up, and on a big moment (a fall, a yield, the verdict) they jump to their
 * feet. Nobody sits where the player stands (they make room).
 *
 * Who sits where (the lex Iulia theatralis, renewed by Domitian): senators in their togas on the
 * podium, knights and togate citizens in the first and second maeniana (a sea of white: the toga
 * was required), and women, slaves and the poor up in the wooden summum, in colour.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../core/Rng';
import { caveaGaps, type ColosseumLayout } from '../world/landmarks/builders/colos-colosseum';

export interface Seat {
  /** Local (landmark) position of the hips on the tread. */
  x: number;
  y: number;
  z: number;
  /** Heading (Actor convention): toward the arena. */
  h: number;
  tier: number;
  /** Arrival order key: lower fills first. */
  key: number;
}

/** Seat spacing along the row by tier (podium seats were wide, the summum packed). */
const SPACING = [0.9, 0.56, 0.52, 0.5];

/** Every seat in the cavea (local frame of the Colosseum), skipping aisles, vomitoria and boxes. */
export function caveaSeats(L: ColosseumLayout, seed = 'colosseum-crowd'): Seat[] {
  const rng = new Rng(seed);
  const gaps = caveaGaps(L).map((g) => {
    const [ox, oz] = L.oval.point(g.t, 0);
    const [nx, nz] = L.oval.normal(g.t);
    return { ...g, ox, oz, nx, nz, tx: -nz, tz: nx };
  });
  const seats: Seat[] = [];
  for (const r of L.section.rows) {
    const x = r.x0 + 0.24;
    const n = Math.floor(L.oval.perimeter(x, 512) / SPACING[r.tier]);
    const ts = L.oval.equalArc(n, x, rng.next(), 1024);
    for (const t of ts) {
      const [px, pz] = L.oval.point(t, x);
      let cut = false;
      for (const g of gaps) {
        if (g.tier !== r.tier || r.row >= g.rows) continue;
        const dx = px - g.ox;
        const dz = pz - g.oz;
        if (dx * g.nx + dz * g.nz < 0) continue;
        if (Math.abs(dx * g.tx + dz * g.tz) < g.hw + 0.3) {
          cut = true;
          break;
        }
      }
      // Empty seats here and there even in a full house.
      if (cut || rng.chance(0.04)) continue;
      const [nx, nz] = L.oval.normal(t);
      // Plebs come early for the good seats; senators arrive when they please.
      const key = rng.next() + (r.tier === 0 ? 0.45 : r.tier === 1 ? 0.18 : 0);
      seats.push({ x: px, y: r.y, z: pz, h: Math.atan2(-nx, -nz), tier: r.tier, key });
    }
  }
  return seats;
}

// ---------------------------------------------------------------- the figure

/** Parts (aPart): 0 body, 1 head, 2 left arm, 3 right arm, 4 shins. About 90 triangles. */
function figureGeometry(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const add = (g: THREE.BufferGeometry, part: number) => {
    g.deleteAttribute('uv');
    const n = g.attributes.position.count;
    g.setAttribute('aPart', new THREE.Float32BufferAttribute(new Float32Array(n).fill(part), 1));
    parts.push(g);
  };
  const box = (w: number, h: number, d: number, x: number, y: number, z: number, part: number) => add(new THREE.BoxGeometry(w, h, d).translate(x, y, z), part);
  box(0.34, 0.15, 0.46, 0, 0.075, 0.12, 0); // seat and thighs
  box(0.3, 0.44, 0.13, 0, -0.15, 0.37, 4); // shins hanging over the edge
  // Torso: a six-sided drum, broader at the shoulders, flattened front to back.
  const torso = new THREE.CylinderGeometry(0.2, 0.17, 0.5, 6, 1, false, Math.PI / 6);
  torso.scale(1, 1, 0.62).translate(0, 0.39, -0.04);
  torso.computeVertexNormals();
  add(torso, 0);
  const head = new THREE.SphereGeometry(0.1, 6, 3);
  head.scale(0.92, 1.15, 1).translate(0, 0.78, -0.02);
  add(head, 1);
  // Arms hang straight down from the shoulder pivots (±0.235, 0.62, -0.03); the shader swings them.
  box(0.085, 0.44, 0.1, -0.235, 0.62 - 0.2, -0.03, 2);
  box(0.085, 0.44, 0.1, 0.235, 0.62 - 0.2, -0.03, 3);
  const g = mergeGeometries(parts)!;
  for (const p of parts) p.dispose();
  return g;
}

const VERT_PARS = /* glsl */ `
attribute float aPart;
attribute vec3 aCloth;
attribute vec3 aSkin;
attribute vec3 aHair;
attribute float aSeed;
uniform float uTime;
uniform float uExcite;
uniform float uRoar;
uniform vec3 uFocus;
uniform vec4 uHole;
uniform vec4 uCam;
varying vec3 vColA;
varying vec3 vColB;
varying float vK;
vec3 crowdRotY(vec3 p, float a) { float c = cos(a), s = sin(a); return vec3(p.x * c + p.z * s, p.y, -p.x * s + p.z * c); }
vec3 crowdArm(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(d.x, d.y * c + d.z * s, -d.y * s + d.z * c); }
`;

/** Shared by the normal and the position (computed once in beginnormal). */
const VERT_SETUP = /* glsl */ `
vec3 cIpos = vec3(instanceMatrix[3]);
float cEager = fract(aSeed * 7.31);
float cPh = aSeed * 6.2832;
float cPump = 0.5 + 0.5 * sin(uTime * (5.5 + 2.5 * fract(aSeed * 3.1)) + cPh * 5.0);
float cRaise = clamp((uExcite - cEager * 0.85) * 4.0, 0.0, 1.0);
float cStand = clamp((uRoar - cEager * 0.9) * 5.0, 0.0, 1.0);
// Look toward the action (instance space yaw), with a little idle wandering.
vec3 cTo = uFocus - cIpos;
float cSide = dot(normalize(vec3(instanceMatrix[0])), cTo);
float cAhead = dot(normalize(vec3(instanceMatrix[2])), cTo);
float cYaw = clamp(atan(cSide, max(cAhead, 0.5)), -1.2, 1.2) + 0.25 * sin(uTime * 0.31 + cPh * 3.0) * (1.0 - cRaise);
float cArmL = mix(0.55, 2.55 + 0.45 * (cPump - 0.5), cRaise);
float cArmR = mix(0.55, 2.55 + 0.45 * (0.5 - cPump), cRaise * step(0.45, fract(aSeed * 13.7)));
vec3 cPivot = vec3(aPart < 2.5 ? -0.235 : 0.235, 0.62, -0.03);
float cArmA = aPart < 2.5 ? cArmL : cArmR;
bool cIsArm = aPart > 1.5 && aPart < 3.5;
`;

const VERT_NORMAL = /* glsl */ `
#include <beginnormal_vertex>
${VERT_SETUP}
if (cIsArm) objectNormal = crowdArm(objectNormal, cArmA);
if (aPart < 3.5) objectNormal = crowdRotY(objectNormal, aPart > 0.5 && aPart < 1.5 ? cYaw : cYaw * 0.3);
`;

const VERT_POS = /* glsl */ `
vec3 transformed = vec3(position);
if (cIsArm) transformed = cPivot + crowdArm(transformed - cPivot, cArmA);
if (aPart < 3.5 && position.y > 0.14) transformed = crowdRotY(transformed, aPart > 0.5 && aPart < 1.5 ? cYaw : cYaw * 0.3);
float cLift = cStand * 0.3 * (aPart > 3.5 ? smoothstep(-0.37, 0.08, position.y) : 1.0);
transformed.y += cLift + cRaise * 0.035 * cPump * step(0.14, position.y);
// Make room for the player.
if (distance(cIpos, uHole.xyz) < uHole.w || distance(cIpos + vec3(0.0, 0.5, 0.0), uCam.xyz) < uCam.w) transformed *= 0.0;
// Colours: head = skin below the hairline; arms = sleeve above the hand; shins = bare below the hem.
if (aPart > 0.5 && aPart < 1.5) { vColA = aSkin; vColB = aHair; vK = position.y - 0.835; }
else if (cIsArm) { vColA = aSkin; vColB = aCloth; vK = position.y - 0.62 + 0.27; }
else if (aPart > 3.5) { vColA = aSkin; vColB = aCloth; vK = position.y + 0.18; }
else { vColA = aCloth; vColB = aCloth; vK = 0.0; }
`;

const FRAG_PARS = /* glsl */ `
varying vec3 vColA;
varying vec3 vColB;
varying float vK;
`;

function crowdMaterial(uniforms: Record<string, THREE.IUniform>): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  m.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, uniforms);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_PARS}`)
      .replace('#include <beginnormal_vertex>', VERT_NORMAL)
      .replace('#include <begin_vertex>', VERT_POS);
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_PARS}`)
      .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * mix( vColA, vColB, step( 0.0, vK ) ), opacity );');
  };
  m.customProgramCacheKey = () => 'arena-crowd-v2';
  return m;
}

// ---------------------------------------------------------------- palettes

const SKIN = ['#e0b896', '#d4a37f', '#c69070', '#b47c5c', '#a06a4a', '#8a5a3e', '#6e4630', '#c99a78'];
const HAIR = ['#1c1410', '#2a1d14', '#3a2a1c', '#4a3524', '#6a5a4a', '#8a8580', '#24180f'];
const TOGA = ['#ece6d6', '#e4dccb', '#f0ebdf', '#ddd4c0', '#e8e0cc'];
const DULL = ['#d9d0bd', '#cfc4ad', '#c4b79c', '#a08665', '#8a6e50', '#8c8170', '#bfb196'];
const DYED = ['#8f4a35', '#9a5a3a', '#b08a4a', '#5d6e80', '#6f7553', '#7d5a6a', '#a46a46', '#a8382a', '#c98b2e', '#3f5f8a', '#b86a6a', '#2f6e74', '#d19a3a'];

function clothFor(rng: Rng, tier: number): string {
  if (tier === 0) return rng.pick(TOGA);
  if (tier === 1) return rng.chance(0.85) ? rng.pick(TOGA) : rng.pick(DULL);
  if (tier === 2) return rng.chance(0.55) ? rng.pick(TOGA) : rng.chance(0.6) ? rng.pick(DULL) : rng.pick(DYED);
  return rng.chance(0.55) ? rng.pick(DYED) : rng.pick(DULL);
}

// ---------------------------------------------------------------- the crowd

const SECTORS = 8;

export class ArenaCrowd {
  readonly group = new THREE.Group();
  readonly uniforms = {
    uTime: { value: 0 },
    uExcite: { value: 0 },
    uRoar: { value: 0 },
    uFocus: { value: new THREE.Vector3() },
    uHole: { value: new THREE.Vector4(0, -1e5, 0, 0.9) },
    uCam: { value: new THREE.Vector4(0, -1e5, 0, 0) },
  };
  private readonly meshes: THREE.InstancedMesh[] = [];
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.MeshStandardMaterial;
  /** Total seats. */
  readonly capacity: number;
  private fill = -1;

  /** `maxFill` caps the house by graphics tier (fewer figures on weaker GPUs). */
  constructor(seats: readonly Seat[], private readonly maxFill = 1) {
    this.group.name = 'arena-crowd';
    this.geometry = figureGeometry();
    this.material = crowdMaterial(this.uniforms);
    const rng = new Rng('arena-crowd-look');
    const bins: Seat[][] = Array.from({ length: SECTORS }, () => []);
    for (const s of seats) {
      const a = Math.atan2(s.z, s.x) + Math.PI;
      bins[Math.min(SECTORS - 1, Math.floor((a / (Math.PI * 2)) * SECTORS))].push(s);
    }
    const m4 = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const one = new THREE.Vector3(1, 1, 1);
    const pos = new THREE.Vector3();
    const col = new THREE.Color();
    for (const bin of bins) {
      bin.sort((a, b) => a.key - b.key);
      const n = bin.length;
      const geo = this.geometry.clone();
      const cloth = new Float32Array(n * 3);
      const skin = new Float32Array(n * 3);
      const hair = new Float32Array(n * 3);
      const seed = new Float32Array(n);
      const mesh = new THREE.InstancedMesh(geo, this.material, n);
      bin.forEach((s, i) => {
        q.setFromAxisAngle(up, s.h);
        mesh.setMatrixAt(i, m4.compose(pos.set(s.x, s.y, s.z), q, one));
        col.set(clothFor(rng, s.tier)).toArray(cloth, i * 3);
        col.set(rng.pick(SKIN)).toArray(skin, i * 3);
        // Women up in the summum often have the palla drawn over the head.
        col.set(s.tier === 3 && rng.chance(0.35) ? clothFor(rng, 3) : s.tier === 0 && rng.chance(0.3) ? rng.pick(HAIR.slice(4)) : rng.pick(HAIR)).toArray(hair, i * 3);
        seed[i] = rng.next();
      });
      geo.setAttribute('aCloth', new THREE.InstancedBufferAttribute(cloth, 3));
      geo.setAttribute('aSkin', new THREE.InstancedBufferAttribute(skin, 3));
      geo.setAttribute('aHair', new THREE.InstancedBufferAttribute(hair, 3));
      geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seed, 1));
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = false;
      mesh.receiveShadow = true;
      mesh.count = 0;
      mesh.visible = false;
      mesh.name = 'arena-crowd-sector';
      this.meshes.push(mesh);
      this.group.add(mesh);
    }
    this.capacity = seats.length;
  }

  /** Fraction of seats taken (0..1); figures fill in arrival order. */
  setFill(f: number) {
    const v = Math.max(0, Math.min(1, f)) * this.maxFill;
    if (Math.abs(v - this.fill) < 0.002) return;
    this.fill = v;
    for (const m of this.meshes) {
      m.count = Math.round(m.instanceMatrix.count * v);
      m.visible = m.count > 0;
    }
  }

  /** Spectators showing now. */
  get count(): number {
    let n = 0;
    for (const m of this.meshes) n += m.count;
    return n;
  }

  /** Per frame: time, the crowd's mood, where the action is and where the player stands (local frame). */
  update(time: number, excite: number, roar: number, focus: THREE.Vector3Like, player: THREE.Vector3Like | null, camera: THREE.Vector3Like | null = null) {
    const u = this.uniforms;
    u.uTime.value = time;
    u.uExcite.value = excite;
    u.uRoar.value = roar;
    u.uFocus.value.set(focus.x, focus.y, focus.z);
    if (player) u.uHole.value.set(player.x, player.y, player.z, 0.9);
    else u.uHole.value.set(0, -1e5, 0, 0);
    // Nobody sits right in front of the lens.
    if (camera) u.uCam.value.set(camera.x, camera.y, camera.z, 2.1);
    else u.uCam.value.set(0, -1e5, 0, 0);
  }

  dispose() {
    this.group.removeFromParent();
    for (const m of this.meshes) m.geometry.dispose();
    this.geometry.dispose();
    this.material.dispose();
  }
}
