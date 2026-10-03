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
import type { ColliderSpec, MeshBuilder } from '../../gfx/MeshBuilder';
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
  /**
   * Windows: 'open' (default) leaves a true opening with reveals; 'dark' adds an unlit-looking
   * back plane at the inner face of the reveal (far detail, buildings without interiors);
   * 'grille' adds iron bars; 'shutters' closes it with timber shutters.
   */
  fill?: 'open' | 'dark' | 'grille' | 'shutters';
  /** Niche lining (default: the wall material). Lighter plaster reads better in dark walls. */
  liningMaterial?: MaterialId;
  /** Identifier reported back in WallResult.doors (default 'door<i>'). */
  id?: string;
}

/** A door built by wall(): what an interaction/lock system needs to open it later. */
export interface WallDoor {
  id: string;
  /** Centre of the leaf pair in the builder's frame (where `at` put the wall). */
  position: THREE.Vector3;
  /** Leaf-plane frame in the builder's frame: x along the wall, y up, −z out of the facade. */
  matrix: THREE.Matrix4;
  width: number;
  height: number;
  /** The collider closing the doorway (present in b.colliders while the door is shut), or null. */
  collider: ColliderSpec | null;
}

export interface WallResult {
  doors: WallDoor[];
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

function addBox(b: MeshBuilder, mat: MaterialId, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number, m: THREE.Matrix4, collide: boolean, colliderOnly = false) {
  if (x1 - x0 < 1e-4 || y1 - y0 < 1e-4) return;
  const local = new THREE.Matrix4().makeTranslation((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  const w = m.clone().multiply(local);
  if (!colliderOnly) {
    b.box(mat, x1 - x0, y1 - y0, z1 - z0, w, { collide });
    return;
  }
  const pos = new THREE.Vector3();
  const q = new THREE.Quaternion();
  w.decompose(pos, q, new THREE.Vector3());
  b.collider({ kind: 'box', center: pos, half: new THREE.Vector3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), rotation: q });
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

/** Leaf plane: the leaves stand 0.25 m behind the front face (a reveal in front of them). */
const LEAF_SET = 0.25;
const LEAF_T = 0.08;

/** Panelled door leaves (bronze or wood) set in the opening; arched doors get a lunette panel. */
function leaves(b: MeshBuilder, o: Opening, y0: number, y1: number, t: number, m: THREE.Matrix4, detail: 'high' | 'low') {
  const mat = o.leafMaterial ?? 'bronze';
  const h = (o.arched ? y1 - o.width / 2 : y1) - y0;
  const lw = o.width / 2;
  const th = LEAF_T;
  const open = o.leaves === 'open';
  const zLeaf = -t / 2 + Math.min(LEAF_SET, t / 2);
  for (const side of [-1, 1]) {
    const hinge = new THREE.Vector3(o.x + side * lw, y0, zLeaf);
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
  if (o.arched) {
    // Fixed lunette over the leaves (a solid tympanum panel in the leaf plane).
    const r = o.width / 2;
    const n = detail === 'high' ? 12 : 6;
    const pts: V2[] = [[o.x - r, 0]];
    for (let i = 1; i < n; i++) {
      const a = Math.PI - (Math.PI * i) / n;
      pts.push([o.x + Math.cos(a) * r, Math.sin(a) * r]);
    }
    pts.push([o.x + r, 0]);
    const g = extrudePolygon(pts, th);
    g.translate(0, y0 + h, zLeaf + th / 2);
    b.add(g, mat, m);
  }
}

/** Shared dark "void" for windows seen from afar: unpolished, no reflections, not pure black. */
let voidMat: THREE.MeshStandardMaterial | null = null;
export function windowVoidMaterial(): THREE.MeshStandardMaterial {
  if (!voidMat) {
    voidMat = new THREE.MeshStandardMaterial({ color: 0x2b2622, roughness: 1, metalness: 0, envMapIntensity: 0 });
    voidMat.name = 'window-void';
  }
  return voidMat;
}

/** Outline of an opening (rectangle with an optional semicircular head) in the wall plane. */
function openingOutline(o: Opening, y0: number, y1: number, inset: number, n: number): V2[] {
  const hw = o.width / 2 - inset;
  if (!o.arched) return [[o.x - hw, y0], [o.x + hw, y0], [o.x + hw, y1 - inset], [o.x - hw, y1 - inset]];
  const ys = y1 - o.width / 2;
  const pts: V2[] = [[o.x - hw, y0], [o.x + hw, y0]];
  for (let i = 0; i <= n; i++) {
    const a = (Math.PI * i) / n;
    pts.push([o.x + Math.cos(a) * hw, ys + Math.sin(a) * hw]);
  }
  return pts;
}

/** Window fillings: dark back plane, iron grille or timber shutters. */
function windowFill(b: MeshBuilder, o: Opening, y0: number, y1: number, t: number, m: THREE.Matrix4, detail: 'high' | 'low') {
  const fill = o.fill ?? 'open';
  if (fill === 'open') return;
  const n = detail === 'high' ? 12 : 6;
  if (fill === 'dark') {
    // A thin card flush with the inner face of the reveal, covering the whole (arched) outline.
    const g = extrudePolygon(openingOutline(o, y0, y1, -0.02, n), 0.02);
    g.translate(0, 0, t / 2 + 0.02);
    b.add(g, windowVoidMaterial(), m, { castShadow: false });
    return;
  }
  if (fill === 'grille') {
    // Iron bars in the middle of the reveal: verticals every ~12 cm and two cross bars.
    const zc = 0;
    const top = o.arched ? y1 - o.width / 2 : y1;
    const nb = Math.max(2, Math.round(o.width / 0.13));
    for (let i = 1; i < nb; i++) {
      const x = o.x - o.width / 2 + (o.width * i) / nb;
      const dx = x - o.x;
      const h = o.arched ? top + Math.sqrt(Math.max(0, (o.width / 2) ** 2 - dx * dx)) - y0 : top - y0;
      b.box('iron', 0.022, h, 0.022, m.clone().multiply(new THREE.Matrix4().makeTranslation(x, y0 + h / 2, zc)), { castShadow: false });
    }
    for (const f of [0.33, 0.66]) b.box('iron', o.width, 0.03, 0.03, m.clone().multiply(new THREE.Matrix4().makeTranslation(o.x, y0 + (top - y0) * f, zc)), { castShadow: false });
    return;
  }
  // Shutters: two closed board leaves just inside the front reveal (plus a lunette board).
  const top = o.arched ? y1 - o.width / 2 : y1;
  const z = -t / 2 + Math.min(0.12, t / 3);
  for (const side of [-1, 1]) {
    b.box('wood_painted', o.width / 2 - 0.01, top - y0, 0.05, m.clone().multiply(new THREE.Matrix4().makeTranslation(o.x + (side * o.width) / 4, (y0 + top) / 2, z)));
  }
  if (o.arched) {
    const g = extrudePolygon(openingOutline(o, top, y1, 0, n).slice(2), 0.05);
    g.translate(0, 0, z + 0.025);
    b.add(g, 'wood_painted', m);
  }
}

/**
 * An arched niche: a half-elliptical recess (depth at the centre, 0 at the front corners) with a
 * quarter-ellipsoid head, lining the hole that the piers, sill and arch head leave in the wall.
 * A plug fills the rest of the wall thickness behind it, so nothing can be seen through.
 */
function niche(b: MeshBuilder, spec: WallSpec, o: Opening, y0: number, y1: number, m: THREE.Matrix4, detail: 'high' | 'low') {
  const t = spec.thickness;
  const hw = o.width / 2;
  const depth = Math.min(o.depth ?? t * 0.6, t - 0.06);
  const mat = spec.material ?? 'travertine';
  const lining = o.liningMaterial ?? mat;
  const ys = o.arched ? y1 - hw : y1;
  const zf = -t / 2;
  const n = detail === 'high' ? 16 : 8;
  const as = linspace(Math.PI / 2, Math.PI * 1.5, n);
  // Recess wall: P(a, y) = (x + hw sin a, y, zf − depth cos a); ∂a × ∂y faces into the niche.
  b.add(gridSurface(as, [y0, ys], (a, y, out) => out.set(o.x + Math.sin(a) * hw, y, zf - Math.cos(a) * depth)), lining, m);
  if (o.arched) {
    // Head (conch): ∂a × ∂e also faces into the niche; the crown sits on the front arch.
    // Stop a hair short of the pole: a degenerate row would get a fallback normal (a dark tick).
    const es = linspace(0, Math.PI / 2 - 1e-3, Math.max(3, n / 2));
    b.add(gridSurface(as, es, (a, e, out) => out.set(o.x + Math.sin(a) * hw * Math.cos(e), ys + Math.sin(e) * hw, zf - Math.cos(a) * depth * Math.cos(e))), lining, m);
  } else {
    // Flat soffit over a square-headed niche.
    const g = gridSurface(as, [0, 1], (a, k, out) => out.set(o.x + Math.sin(a) * hw * k, ys, zf - Math.cos(a) * depth * k), { flip: true });
    b.add(g, lining, m);
  }
  // Niche floor between the front edge and the curve.
  const fl = gridSurface(as, [0, 1], (a, k, out) => out.set(o.x + Math.sin(a) * hw * k, y0, zf - Math.cos(a) * depth * k));
  b.add(fl, lining, m);
  // Plug: the whole opening outline from the recess's deepest plane to the back face.
  const plug = extrudePolygon(openingOutline(o, y0, y1, 0, n), t / 2 - (zf + depth));
  plug.translate(0, 0, t / 2);
  b.add(plug, mat, m);
  if (spec.collide ?? true) addBox(b, mat, o.x - hw, o.x + hw, y0, ys, zf + depth, t / 2, m, true, true);
}

/** Build a wall with openings into `b`. Returns the doors it made (for interactions/locks). */
export function wall(b: MeshBuilder, spec: WallSpec, at?: THREE.Matrix4): WallResult {
  const m = at ?? new THREE.Matrix4();
  const t = spec.thickness;
  const H = spec.height;
  const detail = spec.detail ?? 'high';
  const collide = spec.collide ?? true;
  const ops = [...(spec.openings ?? [])].sort((a, c) => a.x - c.x);
  const doors: WallDoor[] = [];
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
    if (o.kind === 'niche') niche(b, spec, o, y0, y1, m, detail);
    else if (o.kind === 'window') windowFill(b, o, y0, y1, t, m, detail);
    if (o.frame ?? (o.kind === 'door' || o.kind === 'window')) frame(b, spec.frameMaterial ?? 'marble', o, y0, y1, t, m, detail);
    if (o.kind === 'door' && (o.leaves ?? 'closed') !== 'none') {
      leaves(b, o, y0, y1, t, m, detail);
      // A closed door blocks the way: one box over the leaf pair, in the leaf plane.
      const h = (o.arched ? y1 - hw : y1) - y0;
      const zLeaf = -t / 2 + Math.min(LEAF_SET, t / 2);
      const local = new THREE.Matrix4().makeTranslation(o.x, y0 + h / 2, zLeaf);
      const frameM = m.clone().multiply(local);
      let collider: ColliderSpec | null = null;
      if ((o.leaves ?? 'closed') === 'closed' && collide) {
        const pos = new THREE.Vector3();
        const q = new THREE.Quaternion();
        frameM.decompose(pos, q, new THREE.Vector3());
        collider = { kind: 'box', center: pos, half: new THREE.Vector3(hw, h / 2, LEAF_T / 2 + 0.02), rotation: q };
        b.collider(collider);
      }
      doors.push({ id: o.id ?? `door${doors.length}`, position: new THREE.Vector3().setFromMatrixPosition(frameM), matrix: frameM, width: o.width, height: h, collider });
    }
    x = xb;
  }
  solidPiece(b, spec, x, spec.length, 0, H, m);
  return { doors };
}
