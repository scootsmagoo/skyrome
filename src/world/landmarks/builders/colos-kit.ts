/**
 * Shared helpers for the Colosseum-valley landmarks (prefix `colos-`):
 *
 * - `Oval`: an elliptical arena edge and the family of curves PARALLEL to it (constant ring widths,
 *   as in the real amphitheatre plan), with bays laid at equal arc length on any ring and radial
 *   lines along the shared normals.
 * - `InstanceLod` (a System) + `lodInstances()`: repeated pieces (arcade bays, statues, bollards…)
 *   as InstancedMeshes with per-instance distance LOD — the near level only where the camera is,
 *   one shared geometry per level, a handful of draw calls for 80 bays.
 * - `romanNumeral()`, `numeralMaterial()` (one canvas atlas for every carved entrance number).
 * - `statueGeometry()`: cheap standing statues for arch niches and roof lines.
 * - Small drawing helpers used by several builders (ring sweeps, terrain-following paving).
 *
 * Exports no builders itself (the registry glob tolerates that).
 */
import * as THREE from 'three';
import type { Game, System } from '../../../core/Game';
import { MeshBuilder, type ColliderSpec } from '../../../gfx/MeshBuilder';
import { Forest, vegetation, type TreeSpecies } from '../../../arch/vegetation';
import type { MaterialId } from '../../../gfx/materialIds';
import { ProfileBuilder, sweep, type Profile, type V2 } from '../../../arch/common/geom';
import { armoredEmperor, togate } from '../../../arch/classical/statues';
import type { LandmarkBuilder } from '../types';

export const builders: LandmarkBuilder[] = [];

// ---------------------------------------------------------------- oval (parallel-curve) geometry

/**
 * An ellipse (semi-axes a along x, b along z) and its parallel curves. A point on ring `x` is the
 * ellipse point at parameter t pushed out along the normal by x (x = 0 is the ellipse itself).
 */
export class Oval {
  constructor(
    readonly a: number,
    readonly b: number,
  ) {}

  normal(t: number): V2 {
    const nx = Math.cos(t) / this.a;
    const nz = Math.sin(t) / this.b;
    const l = Math.hypot(nx, nz);
    return [nx / l, nz / l];
  }

  point(t: number, x: number): V2 {
    const [nx, nz] = this.normal(t);
    return [this.a * Math.cos(t) + nx * x, this.b * Math.sin(t) + nz * x];
  }

  /**
   * Parameters t_k (k = 0..n−1) at arc-length fractions (k + phase)/n along ring `x`, starting at
   * t = 0 (the +x end) and running towards +z. phase −0.5 puts BOUNDARIES there, so that bay k
   * (from t_k to t_k+1) is centred on fraction k/n — bays 0, n/4, n/2, 3n/4 sit on the axes.
   */
  equalArc(n: number, x: number, phase = 0, samples = 4096): number[] {
    const cum: number[] = [0];
    let [x0, z0] = this.point(0, x);
    for (let i = 1; i <= samples; i++) {
      const [x1, z1] = this.point((i / samples) * Math.PI * 2, x);
      cum.push(cum[i - 1] + Math.hypot(x1 - x0, z1 - z0));
      x0 = x1;
      z0 = z1;
    }
    const total = cum[samples];
    const out: number[] = [];
    let j = 0;
    for (let k = 0; k < n; k++) {
      let target = ((k + phase) / n) * total;
      target = ((target % total) + total) % total;
      if (target < cum[j]) j = 0;
      while (j < samples && cum[j + 1] < target) j++;
      const f = (target - cum[j]) / (cum[j + 1] - cum[j] || 1);
      out.push(((j + f) / samples) * Math.PI * 2);
    }
    return out;
  }

  /** Perimeter of ring x. */
  perimeter(x: number, samples = 2048): number {
    let p = 0;
    let [x0, z0] = this.point(0, x);
    for (let i = 1; i <= samples; i++) {
      const [x1, z1] = this.point((i / samples) * Math.PI * 2, x);
      p += Math.hypot(x1 - x0, z1 - z0);
      x0 = x1;
      z0 = z1;
    }
    return p;
  }

  /** Polyline on ring x from t0 to t1 (t1 > t0; may exceed 2π), n segments, at height y. */
  path(t0: number, t1: number, x: number, y: number, n: number): THREE.Vector3[] {
    const out: THREE.Vector3[] = [];
    for (let i = 0; i <= n; i++) {
      const [px, pz] = this.point(t0 + ((t1 - t0) * i) / n, x);
      out.push(new THREE.Vector3(px, y, pz));
    }
    return out;
  }

  /** Closed polyline on ring x through the given parameters. */
  loop(ts: number[], x: number, y: number): THREE.Vector3[] {
    return ts.map((t) => {
      const [px, pz] = this.point(t, x);
      return new THREE.Vector3(px, y, pz);
    });
  }

  /**
   * Frame of the chord from t0 to t1 on ring x: local +x along the chord, local −z OUTWARD, +z
   * inward, origin at the chord start (y = 0). Returns the matrix and the chord length.
   */
  chordFrame(t0: number, t1: number, x: number): { m: THREE.Matrix4; len: number } {
    const a = this.point(t0, x);
    const c = this.point(t1, x);
    const dx = c[0] - a[0];
    const dz = c[1] - a[1];
    const len = Math.hypot(dx, dz);
    const xh = new THREE.Vector3(dx / len, 0, dz / len);
    const zh = new THREE.Vector3(-dz / len, 0, dx / len);
    const m = new THREE.Matrix4().makeBasis(xh, new THREE.Vector3(0, 1, 0), zh).setPosition(a[0], 0, a[1]);
    return { m, len };
  }

  /**
   * Frame on the radial line at t: local +z points INWARD (towards the arena), +x along the
   * tangent (direction of increasing t), origin on ring x.
   */
  radialFrame(t: number, x: number): THREE.Matrix4 {
    const [nx, nz] = this.normal(t);
    const [px, pz] = this.point(t, x);
    const zh = new THREE.Vector3(-nx, 0, -nz);
    const xh = new THREE.Vector3(-nz, 0, nx);
    return new THREE.Matrix4().makeBasis(xh, new THREE.Vector3(0, 1, 0), zh).setPosition(px, 0, pz);
  }

  /** Parameter t whose ring-x point lies closest to the radial direction of local angle `phi`. */
  paramAtAngle(phi: number): number {
    // For an ellipse, the point at parameter t lies at polar angle atan2(b sin t, a cos t).
    return Math.atan2(this.a * Math.sin(phi), this.b * Math.cos(phi));
  }
}

/**
 * Sweep a section profile (x = outward offset from the oval, y = up) round an oval between t0 and
 * t1 (n segments). The profile is placed so its +x is the ring's outward normal.
 */
export function ovalSweep(oval: Oval, profile: Profile, t0: number, t1: number, n: number, opts: { closed?: boolean; caps?: boolean } = {}): THREE.BufferGeometry {
  // sweep() puts profile +x on the right-hand side of the path, (t.z, 0, −t.x). Increasing t runs
  // east → south → west → north (clockwise seen from above), whose right-hand side is OUTWARD.
  // We sweep along the base curve (x = 0) so profile x maps to the true offset.
  const pts: THREE.Vector3[] = [];
  const count = opts.closed ? n : n + 1;
  for (let i = 0; i < count; i++) {
    const [px, pz] = oval.point(t0 + ((t1 - t0) * i) / n, 0);
    pts.push(new THREE.Vector3(px, 0, pz));
  }
  return sweep(profile, pts, { closed: opts.closed, caps: opts.caps });
}

// ---------------------------------------------------------------- instance LOD

interface LodLevelSet {
  meshes: THREE.InstancedMesh[];
  /** Instances whose anchor is within this distance (m) use this level. */
  maxDist: number;
}

export interface LodSetSpec {
  /** Name for debugging. */
  name: string;
  /** Per-instance transform (local to `parent`). */
  matrices: THREE.Matrix4[];
  /** Per-instance LOD anchor (local to `parent`); default: the matrix translation. */
  anchors?: THREE.Vector3[];
  /** Levels from nearest to farthest, each a builder of ONE instance's geometry. */
  levels: { builder: MeshBuilder; maxDist: number }[];
  /** Hide instances beyond the last level's maxDist (default: keep them at the last level). */
  cullBeyond?: boolean;
}

export class LodSet {
  readonly levels: LodLevelSet[] = [];
  /** When set, every instance uses this level (−1 hides them all); null = distance LOD. */
  private forced: number | null = null;
  readonly anchors: THREE.Vector3[];
  readonly assign: Int8Array;
  private lastCam = new THREE.Vector3(1e9, 1e9, 1e9);
  private readonly inv = new THREE.Matrix4();
  private readonly cam = new THREE.Vector3();

  constructor(
    readonly root: THREE.Object3D,
    readonly spec: LodSetSpec,
  ) {
    this.anchors = spec.anchors ?? spec.matrices.map((m) => new THREE.Vector3().setFromMatrixPosition(m));
    this.assign = new Int8Array(spec.matrices.length).fill(-2);
    const n = spec.matrices.length;
    spec.levels.forEach((lv, li) => {
      const g = lv.builder.build(`${spec.name}:L${li}`);
      const meshes: THREE.InstancedMesh[] = [];
      for (const child of g.children) {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh) continue;
        const im = new THREE.InstancedMesh(mesh.geometry, mesh.material, n);
        im.name = mesh.name;
        im.castShadow = mesh.castShadow;
        im.receiveShadow = true;
        im.count = 0;
        im.visible = false;
        im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        root.add(im);
        meshes.push(im);
      }
      this.levels.push({ meshes, maxDist: lv.maxDist });
    });
  }

  /** Force a level for all instances (−1 = hidden), or null to return to distance LOD. */
  setForced(level: number | null) {
    if (level === this.forced) return;
    this.forced = level;
    this.dirty = true;
  }

  private dirty = false;

  /** Re-assign levels for a camera at world position `camWorld`. Returns true if anything changed. */
  update(camWorld: THREE.Vector3, force = false): boolean {
    if (this.dirty) {
      force = true;
      this.dirty = false;
    }
    this.root.updateWorldMatrix(true, false);
    this.inv.copy(this.root.matrixWorld).invert();
    this.cam.copy(camWorld).applyMatrix4(this.inv);
    if (!force && this.cam.distanceToSquared(this.lastCam) < 0.25) return false;
    this.lastCam.copy(this.cam);
    const L = this.levels;
    let changed = force;
    for (let i = 0; i < this.anchors.length; i++) {
      if (this.forced !== null) {
        const lv = Math.min(this.forced, L.length - 1);
        if (lv !== this.assign[i]) {
          this.assign[i] = lv;
          changed = true;
        }
        continue;
      }
      const d = this.anchors[i].distanceTo(this.cam);
      const cur = this.assign[i];
      let lv = -1;
      for (let k = 0; k < L.length; k++) {
        // 6% hysteresis: stay at the current level a little longer.
        const lim = L[k].maxDist * (cur === k ? 1.06 : 1);
        if (d <= lim) {
          lv = k;
          break;
        }
      }
      if (lv < 0 && !this.spec.cullBeyond) lv = L.length - 1;
      if (lv !== cur) {
        this.assign[i] = lv;
        changed = true;
      }
    }
    if (!changed) return false;
    for (let k = 0; k < L.length; k++) {
      let c = 0;
      for (let i = 0; i < this.anchors.length; i++) {
        if (this.assign[i] !== k) continue;
        for (const im of L[k].meshes) im.setMatrixAt(c, this.spec.matrices[i]);
        c++;
      }
      for (const im of L[k].meshes) {
        im.count = c;
        im.visible = c > 0;
        im.instanceMatrix.needsUpdate = true;
        if (c > 0) im.computeBoundingSphere();
      }
    }
    return true;
  }
}

/** Per-frame hooks (water animation, zone visibility…) registered by builders. */
export type FrameHook = (dt: number, t: number, camWorld: THREE.Vector3) => void;

/**
 * One System for the whole module: keeps every LodSet in step with the camera and runs the small
 * per-frame hooks (animated water). Lives after the camera (priority 101).
 */
export class InstanceLod implements System {
  readonly name = 'colos-instance-lod';
  readonly priority = 101;
  private sets: LodSet[] = [];
  private hooks: FrameHook[] = [];
  private time = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(private readonly game: Game) {}

  add(set: LodSet) {
    this.sets.push(set);
    // Start sensibly even before the first frame.
    const cam = this.game.camera?.position ?? new THREE.Vector3(1e6, 0, 1e6);
    set.update(cam, true);
  }

  hook(fn: FrameHook) {
    this.hooks.push(fn);
  }

  lateUpdate(dt: number) {
    this.time += dt;
    const cam = this.game.camera.getWorldPosition(this.tmp);
    for (const s of this.sets) {
      if (!visibleInScene(s.root)) continue;
      s.update(cam);
    }
    for (const h of this.hooks) h(dt, this.time, cam);
  }

  /** Force a re-evaluation (after teleports / dev camera jumps). */
  refresh() {
    const cam = this.game.camera.getWorldPosition(this.tmp);
    for (const s of this.sets) s.update(cam, true);
  }
}

function visibleInScene(o: THREE.Object3D): boolean {
  let p: THREE.Object3D | null = o;
  while (p) {
    if (!p.visible) return false;
    p = p.parent;
  }
  return true;
}

/** The module's LOD system (created on first use). Null without a running game (unit tests). */
export function instanceLod(game: Game | undefined): InstanceLod | null {
  if (!game || typeof (game as Partial<Game>).addSystem !== 'function') return null;
  const g = game as Game & { colosLod?: InstanceLod };
  if (!g.colosLod || !(game.getSystem?.('colos-instance-lod'))) {
    g.colosLod = game.addSystem(new InstanceLod(game));
  }
  return g.colosLod;
}

/**
 * Add a LOD-instanced set under `parent`. Without a game (tests) the set is still built and
 * evaluated once against a camera at `fallbackCam` (default: far away).
 */
export function lodInstances(game: Game | undefined, parent: THREE.Object3D, spec: LodSetSpec, fallbackCam?: THREE.Vector3): LodSet {
  const root = new THREE.Group();
  root.name = `lod:${spec.name}`;
  parent.add(root);
  const set = new LodSet(root, spec);
  const sys = instanceLod(game);
  if (sys) sys.add(set);
  else set.update(fallbackCam ?? new THREE.Vector3(1e6, 0, 1e6), true);
  return set;
}

/** Count triangles of every (instanced) mesh under `o` as currently assigned. */
export function countTriangles(o: THREE.Object3D): number {
  let n = 0;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || !m.visible) return;
    const g = m.geometry;
    const tris = (g.index ? g.index.count : g.getAttribute('position').count) / 3;
    const inst = (m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1;
    n += tris * inst;
  });
  return Math.round(n);
}

// ---------------------------------------------------------------- roman numerals

export function romanNumeral(n: number): string {
  const table: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let s = '';
  let r = Math.max(0, Math.floor(n));
  for (const [v, sym] of table) {
    while (r >= v) {
      s += sym;
      r -= v;
    }
  }
  return s;
}

/** Atlas layout for `numeralMaterial`: numbers 1..80 in an 8 × 10 grid. */
export const NUMERAL_GRID = { cols: 8, rows: 10 };

/** UV rectangle [u0, v0, u1, v1] of number n (1..80) in the numeral atlas. */
export function numeralUV(n: number): [number, number, number, number] {
  const i = n - 1;
  const c = i % NUMERAL_GRID.cols;
  const r = Math.floor(i / NUMERAL_GRID.cols);
  const u0 = c / NUMERAL_GRID.cols;
  const u1 = (c + 1) / NUMERAL_GRID.cols;
  // Canvas rows run top-down; texture v runs bottom-up (flipY).
  const v1 = 1 - r / NUMERAL_GRID.rows;
  const v0 = 1 - (r + 1) / NUMERAL_GRID.rows;
  return [u0, v0, u1, v1];
}

let numeralMat: THREE.MeshStandardMaterial | null = null;

/**
 * Carved, red-painted (rubricated) Roman numerals with a transparent ground (alpha-tested), so a
 * quad laid 1 cm proud of any stone face shows just the letters. One shared material.
 */
export function numeralMaterial(): THREE.MeshStandardMaterial {
  if (numeralMat) return numeralMat;
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.8, alphaTest: 0.45, transparent: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  mat.name = 'colos:numerals';
  numeralMat = mat;
  if (typeof document === 'undefined') return mat;
  const W = 1024;
  const H = 640;
  const draw = () => {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;
    ctx.clearRect(0, 0, W, H);
    const cw = W / NUMERAL_GRID.cols;
    const ch = H / NUMERAL_GRID.rows;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fam = document.fonts?.check?.('600 20px Cinzel') ? 'Cinzel, serif' : "'Times New Roman', serif";
    for (let n = 1; n <= NUMERAL_GRID.cols * NUMERAL_GRID.rows; n++) {
      const i = n - 1;
      const cx = (i % NUMERAL_GRID.cols) * cw + cw / 2;
      const cy = Math.floor(i / NUMERAL_GRID.cols) * ch + ch / 2;
      const text = romanNumeral(n);
      let px = ch * 0.78;
      ctx.font = `600 ${px}px ${fam}`;
      const w = ctx.measureText(text).width;
      if (w > cw * 0.9) {
        px *= (cw * 0.9) / w;
        ctx.font = `600 ${px}px ${fam}`;
      }
      // Dark groove edge, then the red paint.
      ctx.fillStyle = 'rgba(60,30,20,1)';
      ctx.fillText(text, cx + 1, cy + 1.5);
      ctx.fillStyle = 'rgba(150,40,26,1)';
      ctx.fillText(text, cx, cy);
    }
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 8;
    mat.map = tex;
    mat.needsUpdate = true;
  };
  draw();
  // Redraw once the inscription font has arrived (it is loaded by the inscription module).
  document.fonts?.ready?.then(() => {
    if (document.fonts.check('600 20px Cinzel')) draw();
  });
  return mat;
}

/** A flat quad (w × h) centred at the origin facing −z, with UVs [u0, v0, u1, v1]. */
export function uvQuad(w: number, h: number, uv: [number, number, number, number]): THREE.BufferGeometry {
  const [u0, v0, u1, v1] = uv;
  const g = new THREE.BufferGeometry();
  // Facing −z: counter-clockwise seen from −z means x decreasing to the right... use explicit order.
  const p = [w / 2, -h / 2, 0, -w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, -h / 2, 0, -w / 2, h / 2, 0, w / 2, h / 2, 0];
  // Seen from −z, +x is on the LEFT, so the text's left edge (u0) is at +x.
  const t = [u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1];
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(t, 2));
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- statues

/**
 * A standing statue on a small plinth, facing −z, origin at the plinth bottom (life size ≈ 1.85 m
 * before `scale`). 'near' uses the classical kit's sculpted figures (togate citizen for even
 * variants, cuirassed emperor for odd ones; ≈ 1.7–2.5k triangles at their low detail), 'mid' a
 * ≈ 90-triangle silhouette with the same outline (drapery bell, shoulders, head, raised arm).
 */
export function statueGeometry(b: MeshBuilder, at: THREE.Matrix4, opts: { level: 'near' | 'mid'; variant?: number; body?: MaterialId; attr?: MaterialId; plinth?: MaterialId; scale?: number }) {
  const s = opts.scale ?? 1;
  const body = opts.body ?? 'marble';
  const v = opts.variant ?? 0;
  const m = (x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) =>
    at.clone().multiply(new THREE.Matrix4().compose(new THREE.Vector3(x * s, y * s, z * s), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx * s, sy * s, sz * s)));
  b.add(new THREE.BoxGeometry(0.66, 0.2, 0.56), opts.plinth ?? body, m(0, 0.1, 0));
  if (opts.level === 'near') {
    const fm = at.clone().multiply(new THREE.Matrix4().makeTranslation(0, 0.2 * s, 0));
    if (v % 2 === 0) togate(b, fm, { material: body, scale: s, detail: 'low', plinth: false });
    else armoredEmperor(b, fm, { material: body, scale: s, detail: 'low', plinth: false });
    return;
  }
  // Silhouette: drapery bell, torso, shoulders, head, one raised arm (variant).
  b.add(new THREE.CylinderGeometry(0.2, 0.26, 1.1, 6), body, m(0, 0.2 + 0.55, 0, 0, 0, 0, 1, 1, 0.75));
  b.add(new THREE.CylinderGeometry(0.21, 0.19, 0.42, 6), body, m(0, 1.48, 0, 0, 0, 0, 1.1, 1, 0.7));
  b.add(new THREE.CylinderGeometry(0.055, 0.06, 0.09, 4), body, m(0, 1.73, 0));
  b.add(new THREE.SphereGeometry(0.105, 5, 4), body, m(0, 1.86, -0.01));
  if (v % 2 === 1) b.add(new THREE.CylinderGeometry(0.045, 0.055, 0.62, 4), body, m(0.3, 1.82, -0.06, -0.3, 0, -0.5));
  else b.add(new THREE.CylinderGeometry(0.045, 0.05, 0.42, 4), body, m(0.25, 1.34, -0.15, -1.1, 0, 0));
}

// ---------------------------------------------------------------- misc helpers

/** Matrix from translation + yaw. */
export function TY(x: number, y: number, z: number, yaw = 0): THREE.Matrix4 {
  const m = new THREE.Matrix4().makeRotationY(yaw);
  m.setPosition(x, y, z);
  return m;
}

/** Local → local transform helper: parent × T(x,y,z) × Ry(yaw). */
export function at(parent: THREE.Matrix4, x: number, y: number, z: number, yaw = 0): THREE.Matrix4 {
  return parent.clone().multiply(TY(x, y, z, yaw));
}

/** Box from (x0,y0,z0) to (x1,y1,z1) in frame m, optional collider. */
export function span(b: MeshBuilder, mat: MaterialId | THREE.Material, m: THREE.Matrix4, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, collide = false, castShadow = true) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const az = Math.min(z0, z1), bz = Math.max(z0, z1);
  if (bx - ax < 1e-4 || by - ay < 1e-4 || bz - az < 1e-4) return;
  b.box(mat, bx - ax, by - ay, bz - az, m.clone().multiply(new THREE.Matrix4().makeTranslation((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2)), { collide, castShadow });
}

/** Collider-only box from (x0,y0,z0) to (x1,y1,z1) in frame m. */
export function solid(b: MeshBuilder, m: THREE.Matrix4, x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
  const ax = Math.min(x0, x1), bx = Math.max(x0, x1);
  const ay = Math.min(y0, y1), by = Math.max(y0, y1);
  const az = Math.min(z0, z1), bz = Math.max(z0, z1);
  if (bx - ax < 1e-3 || by - ay < 1e-3 || bz - az < 1e-3) return;
  const w = m.clone().multiply(new THREE.Matrix4().makeTranslation((ax + bx) / 2, (ay + by) / 2, (az + bz) / 2));
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  w.decompose(pos, q, sc);
  b.collider({ kind: 'box', center: pos, half: new THREE.Vector3((bx - ax) / 2, (by - ay) / 2, (bz - az) / 2), rotation: q });
}

/**
 * A straight flight in frame m climbing towards +z from (0, y0, z0): `count` risers of `rise`,
 * treads `run`, width w centred on x = cx. Each step is a solid block down to y0 with a collider.
 */
export function flight(b: MeshBuilder, mat: MaterialId, m: THREE.Matrix4, cx: number, w: number, y0: number, z0: number, rise: number, run: number, count: number, collide = true) {
  for (let i = 0; i < count; i++) {
    span(b, mat, m, cx - w / 2, y0, z0 + i * run, cx + w / 2, y0 + (i + 1) * rise, z0 + (i + 1) * run, collide, false);
  }
}

/** Riser count and exact rise for a height, aiming at `target` (≤ 0.22 m keeps flights walkable). */
export function risers(height: number, target = 0.2): { count: number; rise: number } {
  const count = Math.max(1, Math.ceil(height / target - 1e-6));
  return { count, rise: height / count };
}

/**
 * Entrance steps from the terrain up to a raised floor `y0` in front of a wall whose outer face is at
 * z = zFront (front = −z): a straight flight centred on x, each step a solid block with a collider.
 * Nothing when the ground there is within 15 cm of the floor.
 */
export function frontSteps(b: MeshBuilder, groundAt: (x: number, z: number) => number, x: number, zFront: number, y0: number, width: number, mat: MaterialId = 'travertine') {
  const g = Math.min(groundAt(x, zFront - 1.5), groundAt(x - width / 2, zFront - 1.0), groundAt(x + width / 2, zFront - 1.0));
  const drop = y0 - g;
  if (drop < 0.15) return;
  const { count, rise } = risers(drop, 0.2);
  const run = 0.32;
  const m = TY(x, g, zFront - count * run);
  for (let i = 0; i < count; i++) span(b, mat, m, -width / 2, -0.4, i * run, width / 2, (i + 1) * rise, count * run, true, false);
  // Sloping parapets either side of a tall flight.
  if (drop > 0.9) {
    const L = count * run;
    const a = Math.atan2(drop, L);
    for (const sx of [-1, 1]) {
      const pm = m.clone().multiply(new THREE.Matrix4().makeTranslation(sx * (width / 2 + 0.15), drop / 2 + 0.2, L / 2)).multiply(new THREE.Matrix4().makeRotationX(-a));
      b.box(mat, 0.3, 1.3, Math.hypot(drop, L) + 0.2, pm, { collide: true });
    }
  }
}

/**
 * Terrain-following paving for a ring band between ovals x0..x1 (segments round × rings across).
 * Heights come from `ground(lx, lz)` (relative to the pad) plus `lift`; never below `minY`.
 * With `maxRise`, the band stops (per segment, smoothed) where the ground climbs above that height,
 * so a plaza ends at a kerb at the foot of a hillside instead of paving the bank; `kerb` draws that
 * edge stone (also round the flat parts). Returns the outer offset per segment.
 */
export function ovalPaving(
  b: MeshBuilder,
  oval: Oval,
  x0: number,
  x1: number,
  segs: number,
  rings: number,
  ground: (x: number, z: number) => number,
  mat: MaterialId,
  lift = 0.04,
  minY = -Infinity,
  opts: { maxRise?: number; kerb?: MaterialId } = {},
): number[] {
  const tAt = (i: number) => (i / segs) * Math.PI * 2;
  const gAt = (t: number, x: number) => {
    const [px, pz] = oval.point(t, x);
    return Math.max(minY, ground(px, pz));
  };
  // Outer edge per segment vertex.
  let xr = new Array<number>(segs).fill(x1);
  if (opts.maxRise !== undefined) {
    for (let i = 0; i < segs; i++) {
      for (let x = x0; x <= x1 + 1e-6; x += 0.25) {
        if (gAt(tAt(i), x) > opts.maxRise) {
          xr[i] = Math.max(x0 + 0.6, x - 0.25);
          break;
        }
      }
    }
    // Smooth: the minimum over a 5-wide window, then a 3-tap average.
    const mn = xr.map((_, i) => Math.min(...[-2, -1, 0, 1, 2].map((k) => xr[(i + k + segs) % segs])));
    xr = mn.map((_, i) => (mn[(i - 1 + segs) % segs] + mn[i] * 2 + mn[(i + 1) % segs]) / 4);
  }
  const pos: number[] = [];
  const P = (i: number, j: number): [number, number, number] => {
    const ii = i % segs;
    const t = tAt(i);
    const x = x0 + ((xr[ii] - x0) * j) / rings;
    const [px, pz] = oval.point(t, x);
    return [px, gAt(t, x) + lift, pz];
  };
  for (let i = 0; i < segs; i++) {
    for (let j = 0; j < rings; j++) {
      const a = P(i, j), c = P(i + 1, j), d = P(i + 1, j + 1), e = P(i, j + 1);
      // Up-facing winding: t increases towards +z (clockwise from above) and x outward.
      pos.push(...a, ...c, ...e, ...c, ...d, ...e);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.add(g, mat, undefined, { castShadow: false });
  if (opts.kerb) {
    // Kerb: a 0.35 m stone along the outer edge, its top 0.12 m above the paving, its outer face
    // down into the ground.
    const kp: number[] = [];
    const K = (i: number, dx: number, dy: number): [number, number, number] => {
      const ii = i % segs;
      const t = tAt(i);
      const x = xr[ii] + dx;
      const [px, pz] = oval.point(t, x);
      return [px, gAt(t, xr[ii]) + lift + dy, pz];
    };
    for (let i = 0; i < segs; i++) {
      const a = K(i, 0, 0.12), c = K(i + 1, 0, 0.12), d = K(i + 1, 0.35, 0.12), e = K(i, 0.35, 0.12);
      kp.push(...a, ...c, ...e, ...c, ...d, ...e);
      const f = K(i, 0.35, -0.6), h = K(i + 1, 0.35, -0.6);
      kp.push(...e, ...d, ...f, ...d, ...h, ...f);
      const a2 = K(i, 0, -0.05), c2 = K(i + 1, 0, -0.05);
      kp.push(...a2, ...c2, ...a, ...c2, ...c, ...a);
    }
    const kg = new THREE.BufferGeometry();
    kg.setAttribute('position', new THREE.Float32BufferAttribute(kp, 3));
    kg.computeVertexNormals();
    b.add(kg, opts.kerb, undefined, { castShadow: false });
  }
  return xr;
}

/** Simple rectangular-section ring band (e.g. a wall or slab) between ovals x0..x1, heights y0..y1. */
export function ovalBand(oval: Oval, x0: number, x1: number, y0: number, y1: number, t0: number, t1: number, n: number, closed = false): THREE.BufferGeometry {
  const prof = new ProfileBuilder(x0, y0).to(x1, y0).to(x1, y1).to(x0, y1).to(x0, y0).build();
  return ovalSweep(oval, prof, t0, t1, n, { closed, caps: !closed });
}

// ---------------------------------------------------------------- readable inscriptions

export interface ReadableSpec {
  /** Unique id (also the spot id it belongs to). */
  id: string;
  /** Landmark-local point the player aims at (the inscribed face). */
  at: THREE.Vector3;
  /** Reach from the eye (m): monumental lettering reads from further away. */
  reach?: number;
  title: string;
  /** The Latin as cut, a blank line, then the English (italics with *…*). */
  text: string;
}

interface ReaderGame {
  interactions?: { add(i: { id: string; position(): THREE.Vector3; reach?: number; verb(): string; label(): string; detail?(): string | null; enabled?(): boolean; interact(game: unknown): void }): unknown };
  ui?: { openBook?(b: { title: string; kind: 'tablet'; text: string }): void };
}

/**
 * Make inscriptions readable now ("Read" with the interaction key opens the text in the book
 * reader). Positions follow `root`'s world matrix, which buildLandmarks sets once the build returns.
 * No-op without a running game (tests) or without the interaction system. The same texts are kept
 * on the `inscription` spots' ids so the gameplay team can replace this with a generic reader.
 */
export function addReadables(game: Game | undefined, root: THREE.Object3D, items: ReadableSpec[]) {
  const g = game as unknown as ReaderGame | undefined;
  if (!g?.interactions?.add) return;
  for (const it of items) {
    const local = it.at.clone();
    const out = new THREE.Vector3();
    g.interactions.add({
      id: `colos:${it.id}`,
      position: () => out.copy(local).applyMatrix4(root.matrixWorld),
      reach: it.reach ?? 4,
      verb: () => 'Read',
      label: () => it.title,
      detail: () => 'Inscription',
      enabled: () => root.visible,
      interact: () => g.ui?.openBook?.({ title: it.title, kind: 'tablet', text: it.text }),
    });
  }
}

// ---------------------------------------------------------------- trees in landmark-local space

/** A Forest whose instances live in its group's LOCAL frame (inside a landmark object). */
export class LocalForest extends Forest {
  private readonly inv = new THREE.Matrix4();
  private readonly lc = new THREE.Vector3();
  override update(cam: THREE.Vector3, force = false) {
    this.group.updateWorldMatrix(true, false);
    this.inv.copy(this.group.matrixWorld).invert();
    super.update(this.lc.copy(cam).applyMatrix4(this.inv), force);
  }
}

export interface TreeSpot {
  species: TreeSpecies;
  x: number;
  y: number;
  z: number;
  scale?: number;
}

/**
 * Plant trees under `parent` (landmark-local coordinates). Registers them with the vegetation
 * system for LOD and wind when a game is running. Returns trunk colliders (local).
 */
export function plantTrees(game: Game | undefined, parent: THREE.Object3D, trees: TreeSpot[], seed = 3): ColliderSpec[] {
  if (!trees.length) return [];
  const f = new LocalForest({ near: 120, far: 1400, seed });
  for (const t of trees) f.add(t.species, t.x, t.y, t.z, { scale: t.scale ?? 1, rotationY: (t.x * 7.3 + t.z * 3.1) % (Math.PI * 2) });
  parent.add(f.build());
  if (game && typeof (game as Partial<Game>).addSystem === 'function' && game.camera) vegetation(game).addForest(f);
  else f.update(new THREE.Vector3(1e6, 0, 1e6), true);
  return f.colliders();
}
