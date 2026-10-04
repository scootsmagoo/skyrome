/**
 * The amphitheatre's far LOD (docs/research/architecture.md §1.8, LOD2–3): the Flavian
 * Amphitheatre as a ~5k-triangle shell for the skyline, against ~370k for the full build.
 *
 *  - The four-storey facade is one band of quads, one per bay, carrying a procedural two-bay
 *    texture (arches, half-columns, pedestals, entablatures, the attic with pilasters, windows in
 *    alternate bays and corbels). Real cornice bands give the storeys their shadow lines, and
 *    the velarium masts keep the attic's silhouette.
 *  - The cavea is one slope per tier with a seat-row stripe texture, plus the podium wall,
 *    walkways and praecinctio walls; the porticus in summa cavea is a textured colonnade band
 *    under its lean-to roof, backed by the wall that rises to the facade top.
 *  - The arena floor.
 *
 * No colliders: build it next to the full amphitheatre() and register it as the WorldRegistry
 * entry's `far` object. Same frame and spec as amphitheatre(): origin at the arena centre on the
 * ground, the major axis along x.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { fbm2D, heightToNormal } from '../../gfx/textures/noise';
import { makeGeometry, type V2 } from '../common/geom';
import { caveaFarProfile, ellipseAt, ellipseNormal, equalArcParams, type AmphitheatreSpec } from './amphitheatre';
import { storeyColumn, type ArcadeStorey } from './arch';
import { columnDims, diameterForHeight, entablatureDims, type Order } from './orders';

// ---------------------------------------------------------------- textures (pure)

/** An sRGB colour map (RGBA, row 0 = v 0, as DataTexture uploads it) and an optional normal map. */
export interface FarTexture {
  w: number;
  h: number;
  color: Uint8ClampedArray;
  normal?: Uint8ClampedArray;
}

type RGB = readonly [number, number, number];
const STONE: RGB = [214, 202, 176];
/** Seen through an arch: the ambulatory's travertine inner wall in skylight (near build's look). */
const AMBULATORY: RGB = [168, 156, 136];
/** Attic windows open onto an unlit gallery. */
const VOID: RGB = [58, 50, 42];
const MARBLE: RGB = [236, 231, 222];

const clamp255 = (v: number) => (v < 0 ? 0 : v > 255 ? 255 : v);

function put(color: Uint8ClampedArray, i: number, rgb: RGB, shade: number) {
  const j = i * 4;
  color[j] = clamp255(rgb[0] * shade);
  color[j + 1] = clamp255(rgb[1] * shade);
  color[j + 2] = clamp255(rgb[2] * shade);
  color[j + 3] = 255;
}

/** Shading across an entablature band at fraction e (0 = architrave soffit, 1 = cornice top). */
function entablatureShade(e: number): { shade: number; h: number } {
  if (e < 0.3) return { shade: e > 0.26 ? 0.86 : 1.0, h: 0.3 };
  if (e < 0.6) return { shade: 0.96, h: 0.2 };
  // the bed mouldings sit in the corona's shadow, the corona face is lit, its top edge catches light
  if (e < 0.72) return { shade: 0.55 + 0.3 * ((e - 0.6) / 0.12), h: 0.45 };
  return { shade: e > 0.95 ? 0.92 : 1.1, h: 0.6 };
}

/**
 * The facade of superimposed arcade storeys (colosseumStoreys) as a texture two bays wide
 * (u ∈ [0, 1) = bays 0 and 1; 'alternate' attic windows fall in bay 1) and the full facade
 * height tall (v = 0 at the ground). Half-columns stand on the bay edges, arches are centred.
 */
export function arcadeFacadeTexture(storeys: ArcadeStorey[], bay: number, pier: number, w = 256, h = 512): FarTexture {
  const H = storeys.reduce((a, s) => a + s.height, 0);
  const color = new Uint8ClampedArray(w * h * 4);
  const height = new Float32Array(w * h);
  const noise = fbm2D(23, 24, 3);
  let y0 = 0;
  const st = storeys.map((s) => {
    const c = storeyColumn(s, bay);
    const ped = s.pedestal ?? 0;
    const span = bay - pier;
    const crown = s.archHeight ?? Math.min((s.height - c.entH) * 0.82, ped + c.colH * 0.86);
    const out = { s, y0, ...c, ped, span, r: span / 2, spring: crown - span / 2, cap: columnDims(c.order, c.D, c.colH).capital };
    y0 += s.height;
    return out;
  });
  for (let py = 0; py < h; py++) {
    const ym = ((py + 0.5) / h) * H;
    let k = 0;
    while (k < st.length - 1 && ym >= st[k].y0 + st[k].s.height) k++;
    const S = st[k];
    const yl = ym - S.y0;
    const hs = S.s.height;
    const zE = hs - S.entH;
    for (let px = 0; px < w; px++) {
      const xb = ((px + 0.5) / w) * 2;
      const bi = Math.floor(xb);
      const xm = (xb - bi) * bay;
      const dc = Math.min(xm, bay - xm); // distance to the nearest column axis (the bay edges)
      let rgb: RGB = STONE;
      let shade = 1;
      let hgt = 0;
      if (yl >= zE) {
        const e = entablatureShade((yl - zE) / S.entH);
        shade = e.shade;
        hgt = e.h;
      } else if (S.s.kind === 'attic') {
        const win = S.s.windows === 'all' || (S.s.windows === 'alternate' && bi === 1);
        if (S.s.order !== 'none' && dc < S.D / 2 && yl > S.ped) {
          shade = dc > S.D / 2 - 0.05 ? 0.82 : 1.05;
          hgt = 0.3;
        }
        if (yl < S.ped && yl > S.ped - 0.08) shade *= 0.85;
        if (win && Math.abs(xm - bay / 2) < bay * 0.12 && yl > hs * 0.38 && yl < hs * 0.6) {
          rgb = VOID;
          shade = 0.9;
          hgt = -1;
        }
        const yc = hs * 0.62;
        for (const f of [0.25, 0.5, 0.75]) {
          if (Math.abs(xm - bay * f) >= 0.15) continue;
          if (Math.abs(yl - yc) < 0.15) {
            shade = yl > yc ? 1.12 : 0.95;
            hgt = 0.6;
          } else if (yl < yc - 0.15 && yl > yc - 0.45) shade = 0.72;
        }
      } else {
        const dx = xm - bay / 2;
        const adx = Math.abs(dx);
        const archTop = S.spring + Math.sqrt(Math.max(0, S.r * S.r - dx * dx));
        const band = Math.max(0.12, S.span * 0.09);
        const rr = Math.hypot(dx, yl - S.spring);
        if (adx < S.r && yl < archTop) {
          if (S.ped > 0 && yl < S.ped * 0.9) {
            // parapet between the pedestals
            shade = yl > S.ped * 0.9 - 0.06 ? 1.1 : 0.9;
            hgt = -0.2;
          } else {
            // the ambulatory behind: its inner wall in skylight, the vault's shadow at the top
            const f = (yl - S.ped) / Math.max(0.1, archTop - S.ped);
            rgb = AMBULATORY;
            shade = (k === 0 ? 0.82 : 0.95) - 0.45 * f * f;
            hgt = -1;
          }
        } else if (yl >= S.spring && rr < S.r + band) {
          shade = rr < S.r + 0.05 ? 0.8 : 1.07;
          hgt = 0.2;
        } else if (yl < S.spring && yl > S.spring - 0.12 && adx < S.r + 0.3) {
          shade = 1.07;
          hgt = 0.2;
        }
        // Pedestals and half-columns on the bay edges (the capital a little wider).
        const capZone = yl > S.ped + S.colH - S.cap;
        const rad = (S.D / 2) * (capZone ? 1.25 : 1);
        if (S.ped > 0 && yl < S.ped && dc < 0.7 * S.D) {
          rgb = STONE;
          shade = yl > S.ped - 0.1 ? 1.1 : 1.0;
          hgt = 0.5;
        } else if (yl >= S.ped && dc < rad) {
          const q = dc / rad;
          const side = xm < bay / 2 ? 1 : -1;
          rgb = STONE;
          shade = 0.82 + 0.26 * Math.sqrt(1 - q * q) + 0.08 * q * side + (capZone ? 0.04 : 0);
          hgt = 0.8 * Math.sqrt(1 - q * q);
        }
      }
      const n = 1 + 0.14 * (noise(px / w, py / h) - 0.5);
      const i = py * w + px;
      put(color, i, rgb, shade * n);
      height[i] = hgt;
    }
  }
  return { w, h, color, normal: heightToNormal(height, w, h, 1.5) };
}

/**
 * One row of seats for the sloped far cavea (v repeats once per row, up the slope): the riser
 * (greyer marble, in its own shade), the lit nosing, then the white marble tread darkening
 * towards the next riser.
 */
export function seatRowsTexture(w = 8, h = 64): FarTexture {
  const color = new Uint8ClampedArray(w * h * 4);
  const riser: RGB = [214, 212, 206];
  for (let py = 0; py < h; py++) {
    const v = (py + 0.5) / h;
    const [rgb, shade] = v < 0.36 ? [riser, 0.66 + 0.12 * (v / 0.36)] : v < 0.41 ? [MARBLE, 1.1] : [MARBLE, 1.0 - 0.12 * ((v - 0.41) / 0.59)];
    for (let px = 0; px < w; px++) put(color, py * w + px, rgb as RGB, shade as number);
  }
  return { w, h, color };
}

/**
 * The porticus in summa cavea seen from the arena: one intercolumniation wide (a column centred
 * on u = 0), v from the stylobate (0) to the entablature top (1). The back of the portico is in
 * shade.
 */
export function colonnadeTexture(D: number, spacing: number, colH: number, entH: number, w = 64, h = 128): FarTexture {
  const color = new Uint8ClampedArray(w * h * 4);
  const Ht = 0.15 + colH + entH;
  const back: RGB = [150, 136, 116];
  for (let py = 0; py < h; py++) {
    const y = ((py + 0.5) / h) * Ht;
    for (let px = 0; px < w; px++) {
      const x = ((px + 0.5) / w) * spacing;
      const dc = Math.min(x, spacing - x);
      let rgb: RGB = MARBLE;
      let shade = 1;
      if (y > Ht - entH) shade = entablatureShade((y - (Ht - entH)) / entH).shade;
      else if (y < 0.15) shade = 1.05;
      else if (dc < D / 2) {
        const q = dc / (D / 2);
        shade = 0.8 + 0.25 * Math.sqrt(1 - q * q);
      } else {
        rgb = back;
        shade = 0.95 - 0.4 * ((y - 0.15) / (colH + 0.15));
      }
      put(color, py * w + px, rgb, shade);
    }
  }
  return { w, h, color };
}

// ---------------------------------------------------------------- materials

const farMaterials = new Map<string, THREE.MeshStandardMaterial>();

function textureMaterial(key: string, make: () => FarTexture, repeatV: boolean, roughness: number): THREE.MeshStandardMaterial {
  let mat = farMaterials.get(key);
  if (mat) return mat;
  const tex = make();
  const data = (d: Uint8ClampedArray, srgb: boolean) => {
    const t = new THREE.DataTexture(d, tex.w, tex.h, THREE.RGBAFormat, THREE.UnsignedByteType);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = repeatV ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true;
    t.anisotropy = 8;
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.needsUpdate = true;
    return t;
  };
  mat = new THREE.MeshStandardMaterial({ map: data(tex.color, true), roughness, metalness: 0 });
  if (tex.normal) {
    mat.normalMap = data(tex.normal, false);
    mat.normalScale.setScalar(0.8);
  }
  mat.name = `far:${key.split('|')[0]}`;
  farMaterials.set(key, mat);
  return mat;
}

// ---------------------------------------------------------------- geometry

/**
 * A closed band of quads between two rings of n points, smooth-shaded round the ring. `uv(i, s)`
 * gets the unwrapped index i ∈ [0, n] (so the closing quad continues the texture) and s = 0 for
 * ring A, 1 for ring B; each quad faces the side of `hint(i)`.
 */
function ringBand(n: number, a: (i: number) => THREE.Vector3, bRing: (i: number) => THREE.Vector3, uv: (i: number, s: 0 | 1) => V2, hint: (i: number) => THREE.Vector3): THREE.BufferGeometry {
  const A = Array.from({ length: n }, (_, i) => a(i));
  const B = Array.from({ length: n }, (_, i) => bRing(i));
  const qn: THREE.Vector3[] = [];
  const flip: boolean[] = [];
  const e1 = new THREE.Vector3();
  const e2 = new THREE.Vector3();
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    e1.subVectors(A[j], A[i]);
    e2.subVectors(B[i], A[i]);
    const nn = new THREE.Vector3().crossVectors(e1, e2);
    if (nn.lengthSq() < 1e-12) nn.subVectors(B[j], A[i]).cross(e1).negate();
    nn.normalize();
    const f = nn.dot(hint(i)) < 0;
    if (f) nn.negate();
    qn.push(nn);
    flip.push(f);
  }
  const vn = (i: number) => qn[(i - 1 + n) % n].clone().add(qn[i % n]).normalize();
  const pos: number[] = [];
  const nor: number[] = [];
  const uvs: number[] = [];
  const emit = (i: number, s: 0 | 1) => {
    const p = (s ? B : A)[i % n];
    const nn = vn(i % n);
    pos.push(p.x, p.y, p.z);
    nor.push(nn.x, nn.y, nn.z);
    const t = uv(i, s);
    uvs.push(t[0], t[1]);
  };
  for (let i = 0; i < n; i++) {
    const order: [number, 0 | 1][] = flip[i]
      ? [[i, 0], [i, 1], [i + 1, 1], [i, 0], [i + 1, 1], [i + 1, 0]]
      : [[i, 0], [i + 1, 0], [i + 1, 1], [i, 0], [i + 1, 1], [i, 1]];
    for (const [k, s] of order) emit(k, s);
  }
  return makeGeometry(pos, nor, uvs);
}

/** Cumulative arc length round a ring of points (index 0..n, closed). */
function arcLengths(pts: THREE.Vector3[]): number[] {
  const out = [0];
  for (let i = 1; i <= pts.length; i++) out.push(out[i - 1] + pts[i % pts.length].distanceTo(pts[i - 1]));
  return out;
}

export interface AmphitheatreFarResult {
  height: number;
  triangles: number;
}

/** Build the far-LOD shell of amphitheatre(spec) into `b` (see the file comment). */
export function amphitheatreFar(b: MeshBuilder, spec: AmphitheatreSpec, at?: THREE.Matrix4): AmphitheatreFarResult {
  const m = at ?? new THREE.Matrix4();
  const tri0 = b.triangleCount;
  const f = spec.facade;
  const c = spec.cavea;
  const n = f.bays;
  const stoneMat: MaterialId = f.material ?? 'travertine';
  const riserMat: MaterialId = c.riserMaterial ?? c.material ?? 'travertine';
  const walkMat: MaterialId = c.seatMaterial ?? 'marble';
  // Facade: bay corners on the mid-wall ellipse (as ellipticalArcade, phase 0.5), outer face.
  const rxm = f.rx - f.depth / 2;
  const rzm = f.rz - f.depth / 2;
  const ts = equalArcParams(rxm, rzm, n, 4096, 0.5);
  const outerAt = (i: number, y: number, extra = 0) => {
    const t = ts[i % n];
    const [x, z] = ellipseAt(rxm, rzm, t);
    const [nx, nz] = ellipseNormal(rxm, rzm, t);
    const d = f.depth / 2 + extra;
    return new THREE.Vector3(x + nx * d, y, z + nz * d);
  };
  const outN = (i: number) => {
    const [nx, nz] = ellipseNormal(rxm, rzm, ts[i % n]);
    return new THREE.Vector3(nx, 0, nz);
  };
  const H = f.storeys.reduce((a, s) => a + s.height, 0);
  const bayWidth = outerAt(0, 0, -f.depth / 2).distanceTo(outerAt(1, 0, -f.depth / 2));
  const pier = f.pier ?? bayWidth * 0.36;
  const tex = textureMaterial(`facade|${JSON.stringify(f.storeys)}|${bayWidth.toFixed(3)}|${pier.toFixed(3)}`, () => arcadeFacadeTexture(f.storeys, bayWidth, pier), false, 0.85);
  const up = () => new THREE.Vector3(0, 1, 0);
  const down = () => new THREE.Vector3(0, -1, 0);
  b.add(ringBand(n, (i) => outerAt(i, 0), (i) => outerAt(i, H), (i, s) => [i / 2, s], outN), tex, m, { uv: 'keep' });
  // Cornice bands with their shadow lines at each storey top (front, soffit, top).
  let y = 0;
  let projTop = 0;
  for (const s of f.storeys) {
    y += s.height;
    const entH = storeyColumn(s, bayWidth).entH;
    const proj = Math.max(0.2, entH * 0.3);
    const yb = y - entH * 0.4;
    projTop = proj;
    b.add(ringBand(n, (i) => outerAt(i, yb, proj), (i) => outerAt(i, y, proj), (i, k) => [i, k], outN), stoneMat, m);
    b.add(ringBand(n, (i) => outerAt(i, yb, -0.05), (i) => outerAt(i, yb, proj), (i, k) => [i, k], down), stoneMat, m, { castShadow: false });
    if (y < H - 1e-6) b.add(ringBand(n, (i) => outerAt(i, y, -0.05), (i) => outerAt(i, y, proj), (i, k) => [i, k], up), stoneMat, m, { castShadow: false });
  }
  // Velarium masts at the attic's bay centres (four-sided, rising half a storey above the top).
  if (f.masts) {
    const attic = f.storeys[f.storeys.length - 1];
    const ya = H - attic.height;
    const len = attic.height * 0.9;
    const masts: THREE.BufferGeometry[] = [];
    for (let i = 0; i < n; i++) {
      const p = outerAt(i, 0, 0.17).add(outerAt(i + 1, 0, 0.17)).multiplyScalar(0.5);
      const g = new THREE.CylinderGeometry(0.12, 0.14, len, 4, 1, true);
      g.translate(p.x, ya + attic.height * 0.62 + len / 2, p.z);
      masts.push(g.toNonIndexed());
    }
    for (const g of masts) b.add(g, 'wood_dark', m);
  }

  // Cavea: sampled on arena-ellipse parameters matching the facade's bay corners, so the top ring
  // joins the two curves quad by quad.
  const ax = c.arenaRx;
  const az = c.arenaRz;
  let prev = -Infinity;
  const ta = ts.map((t) => {
    const [x, z] = ellipseAt(rxm, rzm, t);
    let a = Math.atan2(z / az, x / ax);
    while (a < prev) a += Math.PI * 2;
    prev = a;
    return a;
  });
  const arenaAt = (i: number, d: number, yy: number) => {
    const t = ta[i % n];
    const [x, z] = ellipseAt(ax, az, t);
    const [nx, nz] = ellipseNormal(ax, az, t);
    return new THREE.Vector3(x + nx * d, yy, z + nz * d);
  };
  const inward = (i: number) => {
    const [nx, nz] = ellipseNormal(ax, az, ta[i % n]);
    return new THREE.Vector3(-nx, 1, -nz).normalize();
  };
  const facingArena = (i: number) => {
    const [nx, nz] = ellipseNormal(ax, az, ta[i % n]);
    return new THREE.Vector3(-nx, 0, -nz);
  };
  const { profile, slopes, reach, height } = caveaFarProfile(c);
  const seats = textureMaterial('seats', () => seatRowsTexture(), true, 0.8);
  for (let k = 0; k < profile.length - 1; k++) {
    const [x0, y0] = profile[k];
    const [x1, y1] = profile[k + 1];
    const slope = slopes.find((sl) => sl.index === k);
    if (slope) {
      const ring = Array.from({ length: n }, (_, i) => arenaAt(i, x0, y0));
      const L = arcLengths(ring);
      b.add(ringBand(n, (i) => arenaAt(i, x0, y0), (i) => arenaAt(i, x1, y1), (i, s) => [L[i] / 2, s * slope.rows], inward), seats, m, { uv: 'keep' });
    } else {
      const vertical = Math.abs(x1 - x0) < 1e-6;
      b.add(ringBand(n, (i) => arenaAt(i, x0, y0), (i) => arenaAt(i, x1, y1), (i, s) => [i, s], inward), vertical ? riserMat : walkMat, m);
    }
  }
  // Summa cavea: the colonnade band, its lean-to roof and the back wall up to the facade top.
  let yWall = height;
  if (c.topPortico) {
    const tp = c.topPortico;
    const order: Order = tp.order ?? 'corinthian';
    const colH = tp.columnHeight ?? 6;
    const D = diameterForHeight(order, colH);
    const spacing = 3.2 * D;
    const entH = entablatureDims(order, colH).total;
    const topW = c.topWalk ?? 3.5;
    const cOff = reach - topW + 0.9;
    const yTop = height + 0.15 + colH + entH;
    const ring = Array.from({ length: n }, (_, i) => arenaAt(i, cOff, height));
    const L = arcLengths(ring);
    const cols = textureMaterial(`colonnade|${order}|${colH}`, () => colonnadeTexture(D, spacing, colH, entH), false, 0.6);
    b.add(ringBand(n, (i) => arenaAt(i, cOff, height), (i) => arenaAt(i, cOff, yTop), (i, s) => [L[i] / spacing, s], facingArena), cols, m, { uv: 'keep' });
    const rise = Math.tan((15 * Math.PI) / 180) * (topW - 0.4);
    b.add(ringBand(n, (i) => arenaAt(i, cOff - 0.5, yTop), (i) => arenaAt(i, reach, yTop + rise), (i, s) => [i, s], inward), 'roof_tile', m);
    yWall = yTop + rise - 0.3;
  }
  b.add(ringBand(n, (i) => arenaAt(i, reach, yWall), (i) => arenaAt(i, reach, H), (i, s) => [i, s], facingArena), stoneMat, m);
  // Top: from the back wall over the corridors to the attic cornice.
  b.add(ringBand(n, (i) => arenaAt(i, reach, H), (i) => outerAt(i, H, projTop), (i, s) => [i, s], up), stoneMat, m);
  // Arena floor.
  const shape = new THREE.Shape(Array.from({ length: n }, (_, i) => arenaAt(i, 0, 0)).map((p) => new THREE.Vector2(p.x, -p.z)));
  const floor = new THREE.ShapeGeometry(shape, 1);
  floor.rotateX(-Math.PI / 2);
  floor.translate(0, 0.03, 0);
  b.add(floor, c.arenaMaterial ?? 'sand', m, { castShadow: false });
  return { height: H, triangles: b.triangleCount - tri0 };
}
