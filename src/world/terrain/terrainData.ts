/**
 * Per-sample terrain data for the splat shader and for `Terrain.surfaceAt`, at the heightmap's
 * resolution. Pure (no Three.js), so it is unit-tested and could run in a worker.
 *
 * Two RGBA8 grids, row-major by z like `Heightmap.heights`:
 *   A: R,G = surface normal x,z (×0.5+0.5)   B = signed distance to a paved road edge   A = to a pad edge
 *   B: R = pad surface kind (0 earth, 0.5 gravel, 1 travertine)   G = urban wear   B = garden lushness
 *      A = local water level above the main river level (/ WATER_OFFSET_RANGE), for canals
 *
 * Distances are GAME meters, negative inside, encoded over ±SDF_RANGE. Stored as distance fields
 * (not masks) so bilinear filtering in the shader gives crisp, sub-texel road and pad edges even
 * though a sample is 2 m apart and roads are only 3–6 m wide.
 */
import { WORLD_SCALE } from '../coords';
import { footprintPolygon, signedDistance, type Heightmap, type P2 } from './heightmap';
import { chain, footOn, resolveQuays } from './riverbanks';

/** Range (game m) of the encoded distance fields. */
export const SDF_RANGE = 8;
/** Range (game m) of the encoded local water offset. */
export const WATER_OFFSET_RANGE = 8;

export type PadKind = 'earth' | 'gravel' | 'travertine';
export const PAD_KIND_VALUE: Record<PadKind, number> = { earth: 0, gravel: 0.5, travertine: 1 };

export interface TerrainDataInputs {
  /** City regions (REAL m) with a 0..1 building density: bare, trodden ground between houses. */
  regions?: readonly { polygon: readonly P2[]; density: number }[];
  /** Garden / grove polygons (REAL m): lush green grass. */
  gardens?: readonly (readonly P2[])[];
  /** Surface of a building pad's apron by pad id (default earth). */
  padKind?: (padId: string) => PadKind;
}

export interface TerrainData {
  nx: number;
  nz: number;
  a: Uint8Array;
  b: Uint8Array;
}

export function encodeSdf(sd: number): number {
  const v = 0.5 + sd / (2 * SDF_RANGE);
  return Math.round(Math.min(1, Math.max(0, v)) * 255);
}

export function decodeSdf(byte: number): number {
  return (byte / 255 - 0.5) * 2 * SDF_RANGE;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Squared distance to segment ab and nothing else (hot loop). */
function segD(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz;
  let t = l2 > 0 ? ((px - ax) * dx + (pz - az) * dz) / l2 : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const ex = ax + dx * t - px, ez = az + dz * t - pz;
  return Math.sqrt(ex * ex + ez * ez);
}

export function buildTerrainData(hm: Heightmap, inputs: TerrainDataInputs = {}): TerrainData {
  const { nx, nz, spacing: sp, minX, minZ, heights } = hm;
  const S = WORLD_SCALE;
  const N = nx * nz;
  const a = new Uint8Array(N * 4);
  const b = new Uint8Array(N * 4);
  const R = SDF_RANGE;
  const feat = hm.features;

  // Index range of samples covering a game-space box.
  const range = (x0: number, x1: number, z0: number, z1: number) => ({
    i0: Math.max(0, Math.floor((x0 - minX) / sp)),
    i1: Math.min(nx - 1, Math.ceil((x1 - minX) / sp)),
    j0: Math.max(0, Math.floor((z0 - minZ) / sp)),
    j1: Math.min(nz - 1, Math.ceil((z1 - minZ) / sp)),
  });

  // ---- normals (same central differences as Heightmap.normalAt)
  for (let j = 0; j < nz; j++) {
    const jm = Math.max(0, j - 1), jp = Math.min(nz - 1, j + 1);
    for (let i = 0; i < nx; i++) {
      const im = Math.max(0, i - 1), ip = Math.min(nx - 1, i + 1);
      const hx = (heights[j * nx + ip] - heights[j * nx + im]) * (2 / (ip - im || 1));
      const hz = (heights[jp * nx + i] - heights[jm * nx + i]) * (2 / (jp - jm || 1));
      const ny = 2 * sp;
      const l = Math.hypot(hx, ny, hz);
      const k = (j * nx + i) * 4;
      a[k] = Math.round((-hx / l * 0.5 + 0.5) * 255);
      a[k + 1] = Math.round((-hz / l * 0.5 + 0.5) * 255);
    }
  }

  // ---- paved roads: distance to the road edge
  const roadSd = new Float32Array(N).fill(R);
  // ---- pads (+ unpaved paths and quay tops): distance and kind of the nearest
  const padSd = new Float32Array(N).fill(R);
  const padKind = new Float32Array(N);

  const stampSegments = (pts: readonly P2[], halfW: number, kind: number | null) => {
    for (let s = 0; s < pts.length - 1; s++) {
      const ax = pts[s][0] * S, az = pts[s][1] * S, bx = pts[s + 1][0] * S, bz = pts[s + 1][1] * S;
      const r = range(Math.min(ax, bx) - halfW - R, Math.max(ax, bx) + halfW + R, Math.min(az, bz) - halfW - R, Math.max(az, bz) + halfW + R);
      for (let j = r.j0; j <= r.j1; j++) {
        const z = minZ + j * sp;
        for (let i = r.i0; i <= r.i1; i++) {
          const x = minX + i * sp;
          const sd = segD(x, z, ax, az, bx, bz) - halfW;
          const k = j * nx + i;
          if (kind === null) {
            if (sd < roadSd[k]) roadSd[k] = sd;
          } else if (sd < padSd[k]) {
            padSd[k] = sd;
            padKind[k] = kind;
          }
        }
      }
    }
  };

  for (const road of feat?.roads ?? []) {
    const paving = road.paving ?? 'basalt';
    const half = (road.width * S) / 2;
    if (paving === 'basalt' || paving === 'steps') stampSegments(road.points, half, null);
    else stampSegments(road.points, half, PAD_KIND_VALUE[paving === 'gravel' ? 'gravel' : 'earth']);
  }
  if (!feat) {
    // Hand-made grid: approximate the fields from the 0..1 masks.
    for (let k = 0; k < N; k++) {
      roadSd[k] = (0.5 - hm.roadMask[k]) * 2 * sp;
      padSd[k] = (0.5 - hm.padMask[k]) * 2 * sp;
    }
  }

  for (const pad of feat?.pads ?? []) {
    const poly = pad.polygon.map((p) => [p[0] * S, p[1] * S] as const);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    const kind = PAD_KIND_VALUE[inputs.padKind?.(pad.id) ?? 'earth'];
    const r = range(x0 - R, x1 + R, z0 - R, z1 + R);
    for (let j = r.j0; j <= r.j1; j++) {
      const z = minZ + j * sp;
      for (let i = r.i0; i <= r.i1; i++) {
        const k = j * nx + i;
        const sd = signedDistance(minX + i * sp, z, poly);
        if (sd < padSd[k]) {
          padSd[k] = sd;
          padKind[k] = kind;
        }
      }
    }
  }

  // Quay tops are travertine paving.
  for (const river of feat?.rivers ?? []) {
    const line = chain(river.centerline);
    for (const q of resolveQuays(feat!.quays, river.id, line)) {
      const width = q.quay.width ?? 12;
      const maxHalf = Math.max(...river.width) / 2;
      const pad = maxHalf + width + R / S + 20;
      const xs = [q.quay.from[0], q.quay.to[0]], zs = [q.quay.from[1], q.quay.to[1]];
      const r = range((Math.min(...xs) - pad) * S, (Math.max(...xs) + pad) * S, (Math.min(...zs) - pad) * S, (Math.max(...zs) + pad) * S);
      for (let j = r.j0; j <= r.j1; j++) {
        const z = (minZ + j * sp) / S;
        for (let i = r.i0; i <= r.i1; i++) {
          const x = (minX + i * sp) / S;
          const f = footOn(line, x, z);
          if (f.side !== q.side) continue;
          const w0 = river.width[f.i] ?? river.width[river.width.length - 1];
          const w1 = river.width[f.i + 1] ?? w0;
          const half = (w0 + (w1 - w0) * f.t) / 2;
          const sd = Math.max(half - 0.5 - f.d, f.d - (half + width), q.s0 - f.s, f.s - q.s1) * S;
          const k = j * nx + i;
          if (sd < padSd[k]) {
            padSd[k] = sd;
            padKind[k] = 1;
          }
        }
      }
    }
  }

  // ---- urban wear: soft membership in the regions, on a coarse grid then upsampled
  const regions = (inputs.regions ?? []).map((r) => ({ density: r.density, polygon: r.polygon.map((p) => [p[0] * S, p[1] * S] as const) }));
  const urban = coarseField(hm, 8, (x, z) => {
    let wsum = 0, dsum = 0;
    for (const reg of regions) {
      const sd = signedDistance(x, z, reg.polygon);
      const w = 1 - smooth(-55, 55, sd);
      if (w > 0) {
        wsum += w;
        dsum += w * reg.density;
      }
    }
    return wsum > 0 ? dsum / Math.max(1, wsum) : 0;
  });

  // ---- garden lushness
  const lush = new Float32Array(N);
  for (const g of inputs.gardens ?? []) {
    const poly = g.map((p) => [p[0] * S, p[1] * S] as const);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const [x, z] of poly) {
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    const r = range(x0 - 15, x1 + 15, z0 - 15, z1 + 15);
    for (let j = r.j0; j <= r.j1; j++) {
      for (let i = r.i0; i <= r.i1; i++) {
        const sd = signedDistance(minX + i * sp, minZ + j * sp, poly);
        const v = 1 - smooth(-12, 12, sd);
        const k = j * nx + i;
        if (v > lush[k]) lush[k] = v;
      }
    }
  }

  // ---- local water level (canals above the main river)
  const waterOff = new Float32Array(N);
  const waterDist = new Float32Array(N).fill(Infinity);
  for (const river of feat?.rivers ?? []) {
    const off = river.waterLevel * S - hm.waterLevelY;
    if (Math.abs(off) < 0.05) continue;
    const maxHalf = (Math.max(...river.width) / 2) * S;
    const reach = maxHalf + 30;
    const pts = river.centerline;
    for (let s = 0; s < pts.length - 1; s++) {
      const ax = pts[s][0] * S, az = pts[s][1] * S, bx = pts[s + 1][0] * S, bz = pts[s + 1][1] * S;
      const r = range(Math.min(ax, bx) - reach, Math.max(ax, bx) + reach, Math.min(az, bz) - reach, Math.max(az, bz) + reach);
      for (let j = r.j0; j <= r.j1; j++) {
        for (let i = r.i0; i <= r.i1; i++) {
          const d = segD(minX + i * sp, minZ + j * sp, ax, az, bx, bz);
          const k = j * nx + i;
          if (d < reach && d < waterDist[k]) {
            waterDist[k] = d;
            waterOff[k] = off * (1 - smooth(reach - 12, reach, d));
          }
        }
      }
    }
  }

  for (let k = 0; k < N; k++) {
    const q = k * 4;
    a[q + 2] = encodeSdf(roadSd[k]);
    a[q + 3] = encodeSdf(padSd[k]);
    b[q] = Math.round(padKind[k] * 255);
    b[q + 1] = Math.round(Math.min(1, Math.max(0, urban[k])) * 255);
    b[q + 2] = Math.round(lush[k] * 255);
    b[q + 3] = Math.round(Math.min(1, Math.max(0, waterOff[k] / WATER_OFFSET_RANGE)) * 255);
  }
  return { nx, nz, a, b };
}

/** Evaluate f(gameX, gameZ) every `stride` samples and bilinearly upsample to the full grid. */
function coarseField(hm: Heightmap, stride: number, f: (x: number, z: number) => number): Float32Array {
  const { nx, nz, spacing: sp, minX, minZ } = hm;
  const cx = Math.ceil((nx - 1) / stride) + 1;
  const cz = Math.ceil((nz - 1) / stride) + 1;
  const c = new Float32Array(cx * cz);
  for (let j = 0; j < cz; j++) for (let i = 0; i < cx; i++) c[j * cx + i] = f(minX + i * stride * sp, minZ + j * stride * sp);
  const out = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) {
    const fj = j / stride, j0 = Math.min(cz - 2, Math.floor(fj)), tj = fj - j0;
    for (let i = 0; i < nx; i++) {
      const fi = i / stride, i0 = Math.min(cx - 2, Math.floor(fi)), ti = fi - i0;
      const k = j0 * cx + i0;
      const top = c[k] + (c[k + 1] - c[k]) * ti;
      const bot = c[k + cx] + (c[k + cx + 1] - c[k + cx]) * ti;
      out[j * nx + i] = top + (bot - top) * tj;
    }
  }
  return out;
}

/** Bilinear sample of one channel (0..1) of a data grid at game (x, z). */
export function sampleChannel(hm: Heightmap, data: Uint8Array, channel: number, x: number, z: number): number {
  const fx = Math.min(Math.max((x - hm.minX) / hm.spacing, 0), hm.nx - 1.0001);
  const fz = Math.min(Math.max((z - hm.minZ) / hm.spacing, 0), hm.nz - 1.0001);
  const ix = Math.floor(fx), iz = Math.floor(fz);
  const tx = fx - ix, tz = fz - iz;
  const k = (iz * hm.nx + ix) * 4 + channel;
  const r = hm.nx * 4;
  const top = data[k] + (data[k + 4] - data[k]) * tx;
  const bot = data[k + r] + (data[k + r + 4] - data[k + r]) * tx;
  return (top + (bot - top) * tz) / 255;
}

/** Helper for callers: a landmark footprint polygon (REAL m) from atlas fields. */
export function gardenPolygon(center: P2, rotation: number, footprint: Parameters<typeof footprintPolygon>[2]): P2[] {
  return footprintPolygon(center, rotation, footprint);
}
