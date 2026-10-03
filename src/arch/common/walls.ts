/**
 * Wall segments with openings (doors, windows, arched passages, niches), optional ashlar
 * coursing, door/window frames and door leaves. Also `prism()` for extruding a floor-plan
 * outline vertically and `orientOutline()` for the sweep convention.
 *
 * Wall frame: the wall runs along +x from x = 0 to `length`, occupies z ∈ [−t/2, t/2] and
 * y ∈ [0, height]. The FRONT face (frames, leaves) is at z = −t/2, matching the "facade faces −z"
 * convention.
 */
import * as THREE from 'three';
import type { MeshBuilder } from '../../gfx/MeshBuilder';
import type { MaterialId } from '../../gfx/materialIds';
import { ProfileBuilder, extrudePolygon, gridSurface, linspace, sweep, type V2 } from './geom';

export interface Opening {
  kind: 'door' | 'window' | 'arch' | 'niche';
  /** Centre along the wall (m from x = 0). */
  x: number;
  width: number;
  /** Clear height to the top of the opening (to the crown for arched ones). */
  height: number;
  /** Bottom of the opening (windows, niches). Default 0 for doors/arches, 1.2 m for windows. */
  sill?: number;
  /** Semicircular head. Default true for 'arch' and 'niche'. */
  arched?: boolean;
  /** Niche depth (default 0.6 × wall thickness). */
  depth?: number;
  /** Moulded frame (architrave) on the front face. Default true for doors/windows. */
  frame?: boolean;
  /** Door leaves: 'closed', 'open' or none. Default 'closed' for doors. */
  leaves?: 'closed' | 'open' | 'none';
  leafMaterial?: MaterialId;
}

export interface WallSpec {
  length: number;
  height: number;
  thickness: number;
  material?: MaterialId;
  frameMaterial?: MaterialId;
  openings?: Opening[];
  /** Ashlar course height: alternate courses step 1 cm proud so the joints read in light. */
  courses?: number;
  collide?: boolean;
  detail?: 'high' | 'low';
}

/** Ensure an XZ outline has positive signed area (x·z' − x'·z), the orientation sweep() expects. */
export function orientOutline(pts: V2[]): V2[] {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x0, z0] = pts[i];
    const [x1, z1] = pts[(i + 1) % pts.length];
    a += x0 * z1 - x1 * z0;
  }
  return a >= 0 ? pts : [...pts].reverse();
}

/** Vertical prism from an XZ outline between y0 and y1 (podia, wings, floors). */
export function prism(outline: V2[], y0: number, y1: number): THREE.BufferGeometry {
  // extrudePolygon works in XY extruding along −Z; map (x, z) → shape (x, −z) and rotate so −Z → +Y.
  const g = extrudePolygon(
    outline.map(([x, z]) => [x, -z] as V2),
    y1 - y0,
  );
  g.rotateX(-Math.PI / 2);
  g.translate(0, y1, 0);
  return g;
}

function addBox(b: MeshBuilder, mat: MaterialId, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Matrix4, collide: boolean) {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
  const local = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  b.box(mat, x1 - x0, y1 - y0, z1 - z0, m.clone().multiply(local), { collide });
}

/** Solid wall piece; with `courses`, built as alternating ashlar courses. */
function solidPiece(b: MeshBuilder, spec: WallSpec, x0: number, x1: number, y0: number, y1: number, m: THREE.Matrix4) {
  const t = spec.thickness;
  const mat = spec.material ?? 'travertine';
  const collide = spec.collide ?? true;
  if (!spec.courses || spec.detail === 'low') {
    addBox(b, mat, x0, x1, y0, y1, -t / 2, t / 2, m, collide);
    return;
  }
  const c = spec.courses;
  const k0 = Math.floor(y0 / c);
  for (let k = k0; k * c < y1; k++) {
    const ya = Math.max(y0, k * c);
    const yb = Math.min(y1, (k + 1) * c);
    const proud = k % 2 === 0 ? 0.012 : 0;
    addBox(b, mat, x0, x1, ya, yb, -t / 2 - proud, t / 2 + proud, m, false);
  }
  if (collide) {
    const pos = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, 0).applyMatrix4(m);
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    b.collider({ kind: 'box', center: pos, half: new THREE.Vector3((x1 - x0) / 2, (y1 - y0) / 2, t / 2), rotation: q });
  }
}

/** The masonry above an arched opening between x0..x1 from the springing line ys to y1. */
function archHead(b: MeshBuilder, spec: WallSpec, cx: number, r: number, ys: number, y1: number, m: THREE.Matrix4, n: number) {
  const t = spec.thickness;
  const mat = spec.material ?? 'travertine';
  const outline: V2[] = [[cx - r, ys]];
  for (let i = 1; i < n; i++) {
    const a = Math.PI - (Math.PI * i) / n;
    outline.push([cx + Math.cos(a) * r, ys + Math.sin(a) * r]);
  }
  outline.push([cx + r, ys], [cx + r, y1], [cx - r, y1]);
  const g = extrudePolygon(outline, t);
  g.translate(0, 0, t / 2);
  b.add(g, mat, m);
  // intrados (soffit) is part of the extrusion's side walls already.
  if (spec.collide ?? true) {
    const pos = new THREE.Vector3(cx, (ys + r * 0.7 + y1) / 2, 0).applyMatrix4(m);
    const q = new THREE.Quaternion();
    m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
    const h = Math.max(0.05, y1 - (ys + r * 0.7));
    b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(r, h / 2, t / 2), rotation: q });
  }
}

/** Moulded frame (architrave) around an opening on the front face (z = −t/2). */
function frame(b: MeshBuilder, mat: MaterialId, o: Opening, y0: number, y1: number, t: number, m: THREE.Matrix4, detail: 'high' | 'low') {
  const fw = Math.min(0.35, Math.max(0.12, o.width * 0.14));
  const prof = new ProfileBuilder(0, 0).out(0.03).up(fw * 0.45).out(0.015).up(fw * 0.4).cymaReversa(0.025, fw * 0.15, detail === 'high' ? 3 : 1).in(0.07).build();
  // Profile x is outward (−z) from the wall face; y is the band width growing away from the opening.
  // Sweep around the opening along a U path; outward = −z.
  const hw = o.width / 2;
  if (o.arched) {
    const r = hw;
    const ys = y1 - r;
    const pts: THREE.Vector3[] = [new THREE.Vector3(o.x + hw, y0, -t / 2)];
    const n = detail === 'high' ? 16 : 8;
    for (let i = 0; i <= n; i++) {
      const a = (Math.PI * i) / n;
      pts.push(new THREE.Vector3(o.x + Math.cos(a) * r, ys + Math.sin(a) * r, -t / 2));
    }
    pts.push(new THREE.Vector3(o.x - hw, y0, -t / 2));
    b.add(sweep(prof, pts, { outward: new THREE.Vector3(0, 0, -1), caps: true }), mat, m);
  } else {
    const pts = [new THREE.Vector3(o.x + hw, y0, -t / 2), new THREE.Vector3(o.x + hw, y1, -t / 2), new THREE.Vector3(o.x - hw, y1, -t / 2), new THREE.Vector3(o.x - hw, y0, -t / 2)];
    b.add(sweep(prof, pts, { outward: new THREE.Vector3(0, 0, -1), caps: true }), mat, m);
    if (o.kind === 'door') {
      // Cornice (hood) over the door.
      const cw = o.width + 2 * fw + 0.3;
      const hood = new THREE.BoxGeometry(cw, 0.12, 0.3);
      hood.translate(o.x, y1 + fw + 0.2, -t / 2 - 0.15);
      b.add(hood, mat, m);
      const frieze = new THREE.BoxGeometry(cw - 0.2, 0.2, 0.08);
      frieze.translate(o.x, y1 + fw + 0.04, -t / 2 - 0.04);
      b.add(frieze, mat, m);
    }
  }
}

/** Panelled door leaves (bronze or wood) set in the opening. */
function leaves(b: MeshBuilder, o: Opening, y0: number, y1: number, t: number, m: THREE.Matrix4, detail: 'high' | 'low') {
  const mat = o.leafMaterial ?? 'bronze';
  const h = (o.arched ? y1 - o.width / 2 : y1) - y0;
  const lw = o.width / 2;
  const th = 0.08;
  const open = o.leaves === 'open';
  for (const side of [-1, 1]) {
    const hinge = new THREE.Vector3(o.x + side * lw, y0, -t / 2 + 0.25);
    const leaf = new THREE.Matrix4().makeTranslation(hinge.x, hinge.y, hinge.z);
    if (open) leaf.multiply(new THREE.Matrix4().makeRotationY(side * -1.35));
    const mm = m.clone().multiply(leaf);
    const g = new THREE.BoxGeometry(lw - 0.01, h, th);
    g.translate((-side * lw) / 2, h / 2, 0);
    b.add(g, mat, mm);
    if (detail === 'high') {
      // Raised panels: two columns of three.
      const rows = Math.max(2, Math.round(h / 1.4));
      for (let r = 0; r < rows; r++) {
        const ph = (h - 0.25) / rows - 0.12;
        const p = new THREE.BoxGeometry(lw - 0.3, ph, 0.04);
        p.translate((-side * lw) / 2, 0.15 + r * (ph + 0.12) + ph / 2, -th / 2 - 0.015);
        b.add(p, mat, mm);
        // studs
        const stud = new THREE.SphereGeometry(0.035, 6, 4);
        stud.translate((-side * lw) / 2, 0.15 + r * (ph + 0.12) + ph / 2, -th / 2 - 0.05);
        b.add(stud, 'gilded_bronze', mm);
      }
      // ring handle
      const ring = new THREE.TorusGeometry(0.09, 0.015, 4, 10);
      ring.translate(-side * 0.18, h * 0.45, -th / 2 - 0.03);
      b.add(ring, 'bronze', mm);
    }
  }
}

/** Build a wall with openings into `b`. */
export function wall(b: MeshBuilder, spec: WallSpec, at?: THREE.Matrix4) {
  const m = at ?? new THREE.Matrix4();
  const t = spec.thickness;
  const H = spec.height;
  const detail = spec.detail ?? 'high';
  const ops = [...(spec.openings ?? [])].sort((a, c) => a.x - c.x);
  let x = 0;
  for (const o0 of ops) {
    const o: Opening = { ...o0, arched: o0.arched ?? (o0.kind === 'arch' || o0.kind === 'niche') };
    const hw = o.width / 2;
    const xa = o.x - hw;
    const xb = o.x + hw;
    const y0 = o.sill ?? (o.kind === 'window' ? 1.2 : o.kind === 'niche' ? 0.6 : 0);
    const y1 = Math.min(H - 0.05, y0 + o.height);
    // pier before the opening
    solidPiece(b, spec, x, xa, 0, H, m);
    // below (sill)
    if (y0 > 0) solidPiece(b, spec, xa, xb, 0, y0, m);
    if (o.arched) {
      const ys = y1 - hw;
      archHead(b, spec, o.x, hw, ys, H, m, detail === 'high' ? 16 : 8);
    } else {
      solidPiece(b, spec, xa, xb, y1, H, m);
    }
    if (o.kind === 'niche') {
      // back of the niche + semi-dome
      const depth = o.depth ?? t * 0.6;
      const mat = spec.material ?? 'travertine';
      addBox(b, mat, xa, xb, y0, o.arched ? y1 - hw : y1, -t / 2 + depth, t / 2, m, spec.collide ?? true);
      if (o.arched) {
        const n = detail === 'high' ? 12 : 6;
        const dome = gridSurface(linspace(Math.PI / 2, Math.PI * 1.5, n), linspace(0, Math.PI / 2, n / 2), (a, e, out) =>
          out.set(o.x + Math.sin(a) * hw * Math.cos(e), y1 - hw + Math.sin(e) * hw, -t / 2 + depth + Math.cos(a) * depth * Math.cos(e)),
        { flip: true });
        b.add(dome, mat, m);
      }
    } else if (o.kind === 'window' && (o.leaves ?? 'none') === 'none') {
      // dark glazing-less void reads as an opening at distance
      addBox(b, 'black', xa + 0.01, xb - 0.01, y0, o.arched ? y1 - hw : y1, -0.02, 0.02, m, false);
    }
    if (o.frame ?? (o.kind === 'door' || o.kind === 'window')) frame(b, spec.frameMaterial ?? 'marble', o, y0, y1, t, m, detail);
    if (o.kind === 'door' && (o.leaves ?? 'closed') !== 'none') leaves(b, o, y0, y1, t, m, detail);
    x = xb;
  }
  solidPiece(b, spec, x, spec.length, 0, H, m);
}
