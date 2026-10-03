/**
 * Mediterranean plant species of Rome's gardens, hills and riverbanks. Each `makeTree(species,
 * variant)` returns a near mesh (separate bark / foliage parts) and a far LOD (one cheap merged
 * part), modelled at 1:1 with the origin at the base of the trunk.
 *
 * - umbrella_pine (Pinus pinea): tall bare leaning trunk, a few limbs splaying out, and the broad
 *   flat-topped "umbrella" canopy — the signature tree of the Roman skyline.
 * - cypress (Cupressus sempervirens): narrow dark flame.
 * - plane (Platanus orientalis): big rounded crown, pale mottled bark (shade trees of porticoes).
 * - olive: short gnarled twin trunks, open silvery crown.
 * - laurel (bay), fig: dense rounded small trees.
 * - oleander: flowering shrub; reeds (Arundo donax): riverbank canes.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { MATERIAL_BASE, type MaterialId } from '../../gfx/materialIds';
import { clump, mergeParts, noise3, taperedTube, tintGeometry, twoSided } from './geom';

export const TREE_SPECIES = ['umbrella_pine', 'cypress', 'plane', 'olive', 'laurel', 'fig', 'oleander', 'reeds'] as const;
export type TreeSpecies = (typeof TREE_SPECIES)[number];

export const TREE_VARIANTS = 3;

export type WindKind = 'tree' | 'shrub' | 'reed' | 'flower';

export interface TreePart {
  geometry: THREE.BufferGeometry;
  material: MaterialId;
  wind: WindKind;
  /** Per-vertex flower heads (aHead attribute) — rendered with per-instance colour. */
  heads?: boolean;
  /**
   * The vertex colours carry the full albedo (material colour × tint × AO), so the part renders
   * with one neutral white material. Far LODs use this to merge bark and foliage into one draw.
   */
  baked?: boolean;
}

export interface TreeModel {
  species: TreeSpecies;
  variant: number;
  near: TreePart[];
  /** Low-detail stand-in (single part); empty = cull beyond the near distance. */
  far: TreePart[];
  height: number;
  /** Trunk collider radius (0 = no collider). */
  trunkRadius: number;
  /** Canopy radius (for bounds / spacing). */
  radius: number;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

function bend(a: THREE.Vector3, b: THREE.Vector3, n: number, sag: THREE.Vector3): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    out.push(a.clone().lerp(b, t).addScaledVector(sag, Math.sin(t * Math.PI)));
  }
  return out;
}

const radii = (n: number, r0: number, r1: number, pow = 1) => Array.from({ length: n + 1 }, (_, i) => r0 + (r1 - r0) * Math.pow(i / n, pow));

/**
 * Multiply a part's vertex colours by a library material's flat colour (linear), for `baked` far
 * LODs. MATERIAL_BASE is the documented flat / LOD colour of each id; at far-LOD range the
 * textured near materials average out to about that colour.
 */
function bakeAlbedo(g: THREE.BufferGeometry, id: MaterialId, k: [number, number, number] = [1, 1, 1]): THREE.BufferGeometry {
  const c = new THREE.Color(MATERIAL_BASE[id].color);
  return tintGeometry(g, c.r * k[0], c.g * k[1], c.b * k[2]);
}

// ------------------------------------------------------------------ umbrella pine

function umbrellaPine(r: Rng): Omit<TreeModel, 'species' | 'variant'> {
  const H = r.range(12.5, 17.5);
  const cd = r.range(2.8, 3.8); // canopy depth
  const R = r.range(5.2, 7.4); // canopy radius
  const yb = H - cd;
  const leanA = r.range(0, Math.PI * 2), lean = r.range(0.06, 0.2);
  const hs = yb - r.range(1.6, 2.8);
  const split = V(Math.cos(leanA) * Math.sin(lean) * hs, hs, Math.sin(leanA) * Math.sin(lean) * hs);
  const trunkPath = bend(V(0, -0.3, 0), split, 6, V(-Math.cos(leanA) * 0.35, 0, -Math.sin(leanA) * 0.35));
  const bark = (t: number) => 0.55 + 0.45 * t;
  const near: THREE.BufferGeometry[] = [];
  const r0 = r.range(0.3, 0.4);
  near.push(taperedTube(trunkPath, radii(6, r0 * 1.15, r0 * 0.62, 0.7), 8, bark, 0.12, r.int(0, 999)));
  // Canopy centre sits over the split, nudged toward the lean.
  const cc = V(split.x + Math.cos(leanA) * 0.6, yb + cd * 0.45, split.z + Math.sin(leanA) * 0.6);
  const crad = V(R, cd * 0.6, R);
  // Limbs: 3-5 splaying out and up, each forking into two.
  const nl = r.int(3, 5);
  const limbEnds: THREE.Vector3[] = [];
  for (let i = 0; i < nl; i++) {
    const a = (i / nl) * Math.PI * 2 + r.range(-0.3, 0.3);
    const rr = R * r.range(0.32, 0.55);
    const end = V(cc.x + Math.cos(a) * rr, yb + r.range(0.1, 0.5), cc.z + Math.sin(a) * rr);
    limbEnds.push(end);
    near.push(taperedTube(bend(split, end, 3, V(0, 0.5, 0)), radii(3, r0 * 0.55, 0.08), 6, (t) => 0.6 + 0.3 * t));
    for (const s of [-1, 1]) {
      const b = a + s * r.range(0.4, 0.8);
      const tip = V(end.x + Math.cos(b) * R * 0.25, yb + cd * 0.35, end.z + Math.sin(b) * R * 0.25);
      near.push(taperedTube([end, end.clone().lerp(tip, 0.5).add(V(0, 0.2, 0)), tip], [0.09, 0.06, 0.03], 5, () => 0.7));
    }
  }
  const barkGeo = mergeParts(near);
  // Canopy: a broad, nearly flat-topped mat of flattened clumps (gently domed), with a ragged
  // rim; the underside is flat and in deep shade.
  const clumps: THREE.BufferGeometry[] = [];
  const nc = Math.round(R * R * 0.75);
  for (let i = 0; i < nc; i++) {
    const rr = R * Math.sqrt(r.next()) * 0.9, a = r.range(0, Math.PI * 2);
    const rn = rr / R;
    const y = yb + cd * (0.5 + 0.16 * (1 - rn * rn)) + r.range(-0.12, 0.12);
    const s = r.range(1.15, 1.75) * (R / 6.2);
    clumps.push(clump({ center: V(cc.x + Math.cos(a) * rr, y, cc.z + Math.sin(a) * rr), radius: V(s, r.range(0.8, 1.1) * cd * 0.26, s * r.range(0.85, 1.15)), flatBottom: -0.3, seed: r.int(0, 9999), rough: 0.32 }, cc, crad));
  }
  const ring = r.int(12, 16);
  for (let i = 0; i < ring; i++) {
    const a = (i / ring) * Math.PI * 2 + r.range(-0.12, 0.12);
    const rr = R * r.range(0.86, 1.0);
    const s = r.range(1.0, 1.5) * (R / 6.2);
    clumps.push(clump({ center: V(cc.x + Math.cos(a) * rr, yb + cd * r.range(0.36, 0.5), cc.z + Math.sin(a) * rr), radius: V(s, cd * 0.22, s), flatBottom: -0.25, seed: r.int(0, 9999), rough: 0.35 }, cc, crad));
  }
  const foliage = mergeParts(clumps);
  // Far LOD: a domed lens (about 0.3× as deep as it is wide) with a flattened, shaded underside —
  // a central dome ringed by five lobes, so the rim is scalloped like the real crown rather than a
  // ruled ellipse — on a trunk that keeps its full girth up to the split. Bark and foliage colours
  // are baked into the vertex colours so the whole stand-in is one draw with a neutral material.
  const lobes = [clump({ center: V(cc.x, yb + cd * 0.42, cc.z), radius: V(R * 0.64, cd * 0.62, R * 0.64), detail: 1, rough: 0.12, flatBottom: -0.35, seed: 3 }, cc, crad)];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + r.range(-0.25, 0.25), rr = R * r.range(0.55, 0.62);
    lobes.push(clump({ center: V(cc.x + Math.cos(a) * rr, yb + cd * r.range(0.3, 0.42), cc.z + Math.sin(a) * rr), radius: V(R * 0.42, cd * 0.48, R * 0.42), detail: 1, rough: 0.16, flatBottom: -0.35, seed: 10 + i }, cc, crad));
  }
  const farCanopy = bakeAlbedo(mergeParts(lobes), 'foliage_pine');
  const farTrunk = bakeAlbedo(taperedTube([V(0, -0.3, 0), split, cc.clone().setY(yb + cd * 0.3)], [r0 * 1.1, r0, r0 * 0.7], 5, () => 0.85), 'bark', [1.25, 1.1, 1.0]);
  return {
    near: [{ geometry: barkGeo, material: 'bark', wind: 'tree' }, { geometry: foliage, material: 'foliage_pine', wind: 'tree' }],
    far: [{ geometry: mergeParts([farCanopy, farTrunk]), material: 'foliage_pine', wind: 'tree', baked: true }],
    height: H,
    trunkRadius: r0,
    radius: R,
  };
}

// ------------------------------------------------------------------ cypress

function cypress(r: Rng, detail: 'near' | 'far'): THREE.BufferGeometry {
  const H = r.range(9, 16), rmax = H * r.range(0.052, 0.068);
  const rings = detail === 'near' ? 18 : 7, seg = detail === 'near' ? 10 : 6;
  const pos: number[] = [], col: number[] = [];
  const pts: THREE.Vector3[][] = [];
  const seed = r.int(0, 9999);
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const base = 0.62 + 0.38 * THREE.MathUtils.smoothstep(t, 0, 0.22);
    const taper = t < 0.25 ? 1 : Math.pow((1 - t) / 0.75, 0.75);
    const y = 0.5 + t * (H - 0.5);
    const ring: THREE.Vector3[] = [];
    for (let k = 0; k < seg; k++) {
      const a = (k / seg) * Math.PI * 2;
      const lump = detail === 'near' ? 1 + (noise3(Math.cos(a) * 1.3, y * 0.9, Math.sin(a) * 1.3, seed) - 0.5) * 0.45 : 1;
      const rr = rmax * base * taper * lump;
      ring.push(V(Math.cos(a) * rr, y, Math.sin(a) * rr));
    }
    pts.push(ring);
  }
  for (let i = 0; i < rings; i++) {
    const c0 = 0.5 + 0.5 * (i / rings), c1 = 0.5 + 0.5 * ((i + 1) / rings);
    for (let k = 0; k < seg; k++) {
      const k1 = (k + 1) % seg;
      const a = pts[i][k], b = pts[i][k1], c = pts[i + 1][k1], d = pts[i + 1][k];
      pos.push(a.x, a.y, a.z, c.x, c.y, c.z, b.x, b.y, b.z, a.x, a.y, a.z, d.x, d.y, d.z, c.x, c.y, c.z);
      col.push(c0, c0, c0, c1, c1, c1, c0, c0, c0, c0, c0, c0, c1, c1, c1, c1, c1, c1);
    }
  }
  // Bottom cap.
  for (let k = 0; k < seg; k++) {
    const a = pts[0][k], b = pts[0][(k + 1) % seg];
    pos.push(0, 0.5, 0, a.x, a.y, a.z, b.x, b.y, b.z);
    col.push(0.35, 0.35, 0.35, 0.45, 0.45, 0.45, 0.45, 0.45, 0.45);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Soften: blend normals with the radial direction.
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  const p = new THREE.Vector3(), n = new THREE.Vector3();
  const posA = g.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < nor.count; i++) {
    p.fromBufferAttribute(posA, i);
    n.fromBufferAttribute(nor, i);
    const radial = V(p.x, 0.25 * rmax, p.z).normalize();
    n.multiplyScalar(0.4).addScaledVector(radial, 0.6).normalize();
    nor.setXYZ(i, n.x, n.y, n.z);
  }
  (g.userData as { height: number }).height = H;
  (g.userData as { r: number }).r = rmax;
  return g;
}

function cypressModel(r: Rng): Omit<TreeModel, 'species' | 'variant'> {
  const seed = r.int(0, 1e6);
  const near = cypress(new Rng(seed), 'near');
  const far = cypress(new Rng(seed), 'far');
  const H = (near.userData as { height: number }).height;
  const trunk = taperedTube([V(0, -0.3, 0), V(0, 1.0, 0)], [0.16, 0.13], 6, () => 0.6);
  return {
    near: [{ geometry: mergeParts([near]), material: 'foliage_cypress', wind: 'tree' }, { geometry: mergeParts([trunk]), material: 'bark', wind: 'tree' }],
    far: [{ geometry: mergeParts([bakeAlbedo(far, 'foliage_cypress')]), material: 'foliage_cypress', wind: 'tree', baked: true }],
    height: H,
    trunkRadius: 0.2,
    radius: (near.userData as { r: number }).r,
  };
}

// ------------------------------------------------------------------ broadleaf (plane, olive, laurel, fig)

interface BroadSpec {
  H: number;
  trunkR: number;
  /** Height where the trunk divides. */
  splitH: number;
  limbs: number;
  crownC: THREE.Vector3;
  crownR: THREE.Vector3;
  clumps: number;
  clumpR: [number, number];
  /** 0 = clumps fill the crown, 1 = only on its shell. */
  shell: number;
  barkTint: [number, number, number];
  foliage: MaterialId;
  tint: [number, number, number];
  twinTrunk?: boolean;
  gnarl?: number;
}

function broadleaf(r: Rng, s: BroadSpec): Omit<TreeModel, 'species' | 'variant'> {
  const parts: THREE.BufferGeometry[] = [];
  const lean = V(r.range(-0.4, 0.4), 0, r.range(-0.4, 0.4));
  const split = V(lean.x, s.splitH, lean.z);
  const g = s.gnarl ?? 0.1;
  const stems = s.twinTrunk ? 2 : 1;
  for (let k = 0; k < stems; k++) {
    const off = stems > 1 ? V(Math.cos(k * Math.PI) * s.trunkR * 0.6, 0, Math.sin(k * Math.PI) * s.trunkR * 0.6) : V(0, 0, 0);
    const path = bend(V(off.x, -0.3, off.z), split.clone().add(off.clone().multiplyScalar(0.5)), 5, V(r.range(-1, 1) * g * 3, 0, r.range(-1, 1) * g * 3));
    parts.push(tintGeometry(taperedTube(path, radii(5, s.trunkR * (stems > 1 ? 0.75 : 1) * 1.15, s.trunkR * 0.6), 7, (t) => 0.6 + 0.4 * t, g * 3, r.int(0, 999)), ...s.barkTint));
  }
  for (let i = 0; i < s.limbs; i++) {
    const a = (i / s.limbs) * Math.PI * 2 + r.range(-0.4, 0.4);
    const end = V(s.crownC.x + Math.cos(a) * s.crownR.x * 0.55, s.crownC.y + r.range(-0.2, 0.3) * s.crownR.y, s.crownC.z + Math.sin(a) * s.crownR.z * 0.55);
    parts.push(tintGeometry(taperedTube(bend(split, end, 3, V(r.range(-1, 1) * g * 4, 0.3, r.range(-1, 1) * g * 4)), radii(3, s.trunkR * 0.55, 0.06), 5, () => 0.75), ...s.barkTint));
  }
  const clumps: THREE.BufferGeometry[] = [];
  for (let i = 0; i < s.clumps; i++) {
    const dir = V(r.gauss(), r.gauss() * 0.8 + 0.15, r.gauss()).normalize();
    const dist = s.shell + (1 - s.shell) * Math.cbrt(r.next());
    const c = s.crownC.clone().add(dir.multiply(s.crownR).multiplyScalar(dist * 0.78));
    const cr = r.range(s.clumpR[0], s.clumpR[1]);
    clumps.push(clump({ center: c, radius: V(cr, cr * r.range(0.75, 0.95), cr), seed: r.int(0, 9999), rough: 0.3 }, s.crownC, s.crownR, s.tint));
  }
  // Far LOD: one lumpy crown on a trunk that keeps its girth to the split, colours baked (see pine).
  const far = bakeAlbedo(clump({ center: s.crownC, radius: s.crownR.clone().multiplyScalar(0.92), detail: 2, rough: 0.22, seed: 5 }, s.crownC, s.crownR, s.tint), s.foliage);
  const farTrunk = bakeAlbedo(taperedTube([V(0, -0.3, 0), split, s.crownC], [s.trunkR * 1.1, s.trunkR, s.trunkR * 0.6], 5, () => 0.8), 'bark', s.barkTint);
  return {
    near: [{ geometry: mergeParts(parts), material: 'bark', wind: 'tree' }, { geometry: mergeParts(clumps), material: s.foliage, wind: 'tree' }],
    far: [{ geometry: mergeParts([far, farTrunk]), material: s.foliage, wind: 'tree', baked: true }],
    height: s.H,
    trunkRadius: s.trunkR,
    radius: Math.max(s.crownR.x, s.crownR.z),
  };
}

function plane(r: Rng) {
  const H = r.range(14, 20);
  return broadleaf(r, {
    H, trunkR: r.range(0.42, 0.55), splitH: r.range(3.2, 4.8), limbs: r.int(3, 4),
    crownC: V(r.range(-0.6, 0.6), H * 0.64, r.range(-0.6, 0.6)), crownR: V(H * 0.36, H * 0.3, H * 0.36),
    clumps: r.int(24, 32), clumpR: [1.8, 2.8], shell: 0.45, barkTint: [1.45, 1.42, 1.25], foliage: 'foliage_broad', tint: [1, 1.02, 0.95],
  });
}

function olive(r: Rng) {
  const H = r.range(4.5, 6.5);
  return broadleaf(r, {
    H, trunkR: r.range(0.22, 0.32), splitH: r.range(1.1, 1.7), limbs: r.int(4, 5),
    crownC: V(r.range(-0.4, 0.4), H * 0.62, r.range(-0.4, 0.4)), crownR: V(H * 0.5, H * 0.34, H * 0.5),
    clumps: r.int(14, 20), clumpR: [0.9, 1.4], shell: 0.55, barkTint: [1.05, 1.0, 0.95], foliage: 'foliage_olive', tint: [1.05, 1.08, 1.05], twinTrunk: true, gnarl: 0.18,
  });
}

function laurel(r: Rng) {
  const H = r.range(5, 8);
  return broadleaf(r, {
    H, trunkR: r.range(0.15, 0.22), splitH: r.range(1.0, 1.6), limbs: 3,
    crownC: V(0, H * 0.55, 0), crownR: V(H * 0.28, H * 0.45, H * 0.28),
    clumps: r.int(16, 22), clumpR: [0.9, 1.3], shell: 0.2, barkTint: [0.9, 0.85, 0.8], foliage: 'foliage_broad', tint: [0.72, 0.78, 0.7],
  });
}

function fig(r: Rng) {
  const H = r.range(4, 5.5);
  return broadleaf(r, {
    H, trunkR: r.range(0.18, 0.25), splitH: r.range(0.7, 1.1), limbs: 4,
    crownC: V(0, H * 0.6, 0), crownR: V(H * 0.55, H * 0.36, H * 0.55),
    clumps: r.int(14, 18), clumpR: [1.0, 1.5], shell: 0.4, barkTint: [1.3, 1.3, 1.25], foliage: 'foliage_broad', tint: [1.0, 1.08, 0.9], twinTrunk: true, gnarl: 0.08,
  });
}

// ------------------------------------------------------------------ shrubs & reeds

function oleander(r: Rng): Omit<TreeModel, 'species' | 'variant'> {
  const H = r.range(2.0, 2.8);
  const stems: THREE.BufferGeometry[] = [];
  const clumps: THREE.BufferGeometry[] = [];
  const cc = V(0, H * 0.6, 0), cr = V(H * 0.5, H * 0.45, H * 0.5);
  for (let i = 0; i < 6; i++) {
    const a = r.range(0, Math.PI * 2);
    const top = V(Math.cos(a) * H * 0.35, H * r.range(0.6, 0.85), Math.sin(a) * H * 0.35);
    stems.push(taperedTube(bend(V(Math.cos(a) * 0.08, -0.1, Math.sin(a) * 0.08), top, 2, V(0, 0, 0)), [0.035, 0.028, 0.015], 4, () => 0.7));
  }
  for (let i = 0; i < 11; i++) {
    const dir = V(r.gauss(), r.gauss() * 0.6 + 0.2, r.gauss()).normalize();
    const c = cc.clone().add(dir.multiply(cr).multiplyScalar(0.6));
    const s = r.range(0.45, 0.7);
    clumps.push(clump({ center: c, radius: V(s, s * 0.85, s), seed: r.int(0, 9999), rough: 0.35 }, cc, cr, [0.8, 0.88, 0.78]));
  }
  // Flowers: small clusters on the crown surface; aHead = 1 lets the instance colour tint them.
  const flowers: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 34; i++) {
    const dir = V(r.gauss(), Math.abs(r.gauss()) * 0.8 + 0.2, r.gauss()).normalize();
    const c = cc.clone().add(dir.multiply(cr).multiplyScalar(r.range(0.85, 1.05)));
    const f = clump({ center: c, radius: V(0.12, 0.08, 0.12), detail: 0, rough: 0.2, seed: i }, cc, cr, [1.6, 1.6, 1.6]);
    f.setAttribute('aHead', new THREE.Float32BufferAttribute(new Float32Array(f.getAttribute('position').count).fill(1), 1));
    flowers.push(f);
  }
  const fl = mergeParts(flowers);
  return {
    near: [
      { geometry: mergeParts(stems), material: 'bark', wind: 'shrub' },
      { geometry: mergeParts(clumps), material: 'foliage_broad', wind: 'shrub' },
      { geometry: fl, material: 'fabric_white', wind: 'shrub', heads: true },
    ],
    far: [],
    height: H,
    trunkRadius: 0,
    radius: cr.x,
  };
}

function reeds(r: Rng): Omit<TreeModel, 'species' | 'variant'> {
  const pos: number[] = [], col: number[] = [];
  const n = r.int(28, 40);
  for (let i = 0; i < n; i++) {
    const a = r.range(0, Math.PI * 2), d = Math.sqrt(r.next()) * 0.7;
    const bx = Math.cos(a) * d, bz = Math.sin(a) * d;
    const h = r.range(1.6, 2.8);
    const lean = V(bx * 0.4 + r.range(-0.2, 0.2), 0, bz * 0.4 + r.range(-0.2, 0.2));
    const w = 0.035;
    const segs = 3;
    const ang = r.range(0, Math.PI);
    const side = V(Math.cos(ang) * w, 0, Math.sin(ang) * w);
    for (let k = 0; k < segs; k++) {
      const t0 = k / segs, t1 = (k + 1) / segs;
      const p0 = V(bx, t0 * h, bz).addScaledVector(lean, t0 * t0), p1 = V(bx, t1 * h, bz).addScaledVector(lean, t1 * t1);
      const s0 = side.clone().multiplyScalar(1 - t0 * 0.8), s1 = side.clone().multiplyScalar(1 - t1 * 0.8);
      const a0 = p0.clone().sub(s0), b0 = p0.clone().add(s0), a1 = p1.clone().sub(s1), b1 = p1.clone().add(s1);
      pos.push(a0.x, a0.y, a0.z, b0.x, b0.y, b0.z, b1.x, b1.y, b1.z, a0.x, a0.y, a0.z, b1.x, b1.y, b1.z, a1.x, a1.y, a1.z);
      const c0 = 0.5 + 0.6 * t0, c1 = 0.5 + 0.6 * t1;
      col.push(c0, c0, c0 * 0.9, c0, c0, c0 * 0.9, c1, c1, c1 * 0.9, c0, c0, c0 * 0.9, c1, c1, c1 * 0.9, c1, c1, c1 * 0.9);
    }
    // Leaf blades sticking out.
    for (let k = 0; k < 2; k++) {
      const y = h * r.range(0.3, 0.75);
      const la = r.range(0, Math.PI * 2);
      const base = V(bx, y, bz).addScaledVector(lean, (y / h) ** 2);
      const tip = base.clone().add(V(Math.cos(la) * 0.55, -0.15, Math.sin(la) * 0.55));
      const sd = V(-Math.sin(la) * 0.04, 0.02, Math.cos(la) * 0.04);
      pos.push(base.x - sd.x, base.y - sd.y, base.z - sd.z, base.x + sd.x, base.y + sd.y, base.z + sd.z, tip.x, tip.y, tip.z);
      col.push(0.8, 0.85, 0.7, 0.8, 0.85, 0.7, 1.0, 1.0, 0.85);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  // Make normals mostly upward so the double-sided blades shade evenly.
  const nor = g.getAttribute('normal') as THREE.BufferAttribute;
  for (let i = 0; i < nor.count; i++) {
    const v = V(nor.getX(i) * 0.4, 0.9, nor.getZ(i) * 0.4).normalize();
    nor.setXYZ(i, v.x, v.y, v.z);
  }
  return { near: [{ geometry: mergeParts([twoSided(g)], 1), material: 'foliage_olive', wind: 'reed' }], far: [], height: 2.8, trunkRadius: 0, radius: 0.9 };
}

// ------------------------------------------------------------------ registry

const cache = new Map<string, TreeModel>();

export function makeTree(species: TreeSpecies, variant = 0): TreeModel {
  const v = ((variant % TREE_VARIANTS) + TREE_VARIANTS) % TREE_VARIANTS;
  const key = `${species}#${v}`;
  let m = cache.get(key);
  if (!m) {
    const r = new Rng(key);
    const body =
      species === 'umbrella_pine' ? umbrellaPine(r)
      : species === 'cypress' ? cypressModel(r)
      : species === 'plane' ? plane(r)
      : species === 'olive' ? olive(r)
      : species === 'laurel' ? laurel(r)
      : species === 'fig' ? fig(r)
      : species === 'oleander' ? oleander(r)
      : reeds(r);
    m = { species, variant: v, ...body };
    cache.set(key, m);
  }
  return m;
}
