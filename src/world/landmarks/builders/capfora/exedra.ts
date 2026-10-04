/**
 * Curved walls for the Imperial Fora: the exedrae of the Forum of Augustus (a circular segment
 * opening off a portico, with two tiers of statue niches) and the horseshoe court behind the
 * Temple of Minerva. GAME metres.
 *
 * Frame (as the kit's `apse()`): centre at the origin, the wall bulges towards +z; a point at angle
 * a is (R sin a, y, R cos a). With `chord` = c > 0 only the part beyond the line z = c is built
 * (a segment: |a| ≤ acos(c / R)), so the exedra can open off a straight wall at z = c.
 */
import * as THREE from 'three';
import { ProfileBuilder, lathe, mul, T } from '../../../../arch/common/geom';
import type { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { figure, type Detail, type FigureKind } from './ornament';

export interface NicheRow {
  /** Height of the niche bottom above the exedra floor. */
  sill: number;
  height: number;
  width: number;
  statue?: FigureKind;
  statueScale?: number;
}

export interface ExedraSpec {
  R: number;
  thickness: number;
  height: number;
  chord?: number;
  floorY?: number;
  material?: MaterialId;
  innerMaterial?: MaterialId;
  niches?: { count: number; rows: NicheRow[]; skipCentre?: boolean };
  roof?: boolean;
  detail?: Detail;
  collide?: boolean;
  /** Bottom of the outer wall below the floor (negative), so it reaches the ground outside. */
  base?: number;
  /** Angular ranges [a0, a1] left open (gates). */
  gaps?: [number, number][];
  /**
   * Dressing of the OUTER face where it shows in a neighbouring space (the SE exedra of the Forum
   * of Augustus bulges into the Forum of Nerva): bands (string courses, an entablature, an attic
   * cornice) and pilasters, heights in this frame.
   */
  outer?: {
    bands?: { y: number; h: number; proj: number; material?: MaterialId }[];
    pilasters?: { count: number; y0: number; y1: number; width: number; proj?: number; material?: MaterialId };
    /** Only dress this angular range (default: the whole segment). */
    range?: [number, number];
  };
}

export interface ExedraResult {
  /** Half-angle of the segment. */
  half: number;
  /** Niche centres (local, at the niche bottom on the inner face) with the inward heading. */
  niches: { x: number; y: number; z: number; a: number; row: number }[];
}

export function exedraWall(b: MeshBuilder, spec: ExedraSpec, at: THREE.Matrix4): ExedraResult {
  const R = spec.R;
  const t = spec.thickness;
  const H = spec.height;
  const c = spec.chord ?? 0;
  const half = Math.acos(Math.min(0.999, Math.max(-0.999, c / R)));
  const detail = spec.detail ?? 'high';
  const seg = Math.max(8, Math.round(((detail === 'high' ? 28 : 12) * half) / (Math.PI / 2)));
  const y0 = spec.floorY ?? 0;
  const mat = spec.material ?? 'peperino';
  const inner = spec.innerMaterial ?? 'marble';
  const base = Math.min(-0.5, spec.base ?? -1.5);
  // Wall pieces between the gaps.
  const pieces: [number, number][] = [];
  {
    let a = -half;
    for (const [g0, g1] of [...(spec.gaps ?? [])].sort((p, q) => p[0] - q[0])) {
      if (g0 > a) pieces.push([a, Math.min(g0, half)]);
      a = Math.max(a, g1);
    }
    if (a < half) pieces.push([a, half]);
  }
  for (const [a0, a1] of pieces) {
    const range = { segments: Math.max(2, Math.round((seg * (a1 - a0)) / (2 * half))), theta0: a0, theta1: a1 };
    // Outer face (outward normal) and top.
    b.add(lathe(new ProfileBuilder(R + t, base).up(H - base).in(t).build(), range), mat, at);
    // Inner face (inward normal): profile runs downward.
    b.add(lathe(new ProfileBuilder(R, H).to(R, base).build(), range), inner, at);
    // A dado on the inner face.
    b.add(lathe(new ProfileBuilder(R - 0.06, y0).up(1.1).in(-0.06).build(), range), 'marble_pavonazzetto', at);
    // End faces.
    for (const a of [a0, a1]) {
      const g = new THREE.BoxGeometry(t, H - base, 0.05);
      g.translate(0, (H + base) / 2, 0);
      g.rotateY(a);
      g.translate((R + t / 2) * Math.sin(a), 0, (R + t / 2) * Math.cos(a));
      b.add(g, mat, at);
    }
  }
  // Outer dressing.
  if (spec.outer) {
    const [o0, o1] = spec.outer.range ?? [-half, half];
    for (const [p0, p1] of pieces) {
      const a0 = Math.max(p0, o0);
      const a1 = Math.min(p1, o1);
      if (a1 - a0 < 0.02) continue;
      const range = { segments: Math.max(2, Math.round((seg * (a1 - a0)) / (2 * half))), theta0: a0, theta1: a1 };
      for (const bnd of spec.outer.bands ?? []) {
        const r0 = R + t;
        const prof = new ProfileBuilder(r0, bnd.y).out(bnd.proj).up(bnd.h).in(bnd.proj).build();
        b.add(lathe(prof, range), bnd.material ?? 'marble', at);
      }
    }
    const pil = spec.outer.pilasters;
    if (pil) {
      for (let k = 0; k < pil.count; k++) {
        const a = o0 + ((o1 - o0) * (k + 0.5)) / pil.count;
        if (!pieces.some(([p0, p1]) => a > p0 && a < p1)) continue;
        const pr = pil.proj ?? 0.25;
        const g = new THREE.BoxGeometry(pil.width, pil.y1 - pil.y0, pr);
        g.translate(0, (pil.y0 + pil.y1) / 2, pr / 2);
        g.rotateY(a);
        g.translate((R + t) * Math.sin(a), 0, (R + t) * Math.cos(a));
        b.add(g, pil.material ?? 'marble', at);
      }
    }
  }
  // Floor of the segment (fan from the chord midpoint); the floor also gets a trimesh collider.
  const fan = (y: number, up: boolean, m: MaterialId, collide = false) => {
    const pos: number[] = [];
    const nor: number[] = [];
    const ny = up ? 1 : -1;
    const n = seg;
    for (let i = 0; i < n; i++) {
      const a0 = -half + (2 * half * i) / n;
      const a1 = -half + (2 * half * (i + 1)) / n;
      const p0 = [R * Math.sin(a0), y, R * Math.cos(a0)];
      const p1 = [R * Math.sin(a1), y, R * Math.cos(a1)];
      const tri = up ? [[0, y, c], p0, p1] : [[0, y, c], p1, p0];
      for (const p of tri) {
        pos.push(p[0], p[1], p[2]);
        nor.push(0, ny, 0);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    b.add(g, m, at);
    if (collide) b.collider({ kind: 'trimesh', geometry: g.clone(), matrix: at.clone() });
  };
  fan(y0, true, 'paving_travertine', true);
  if (spec.roof ?? true) {
    fan(H - 1.2, false, 'plaster_white');
    // Tiled roof over the segment, falling from the wall towards the chord, hidden behind the wall top.
    const pos: number[] = [];
    for (let i = 0; i < seg; i++) {
      const a0 = -half + (2 * half * i) / seg;
      const a1 = -half + (2 * half * (i + 1)) / seg;
      const A = [0, H - 1.0, c];
      const B = [R * Math.sin(a1), H - 0.2, R * Math.cos(a1)];
      const C = [R * Math.sin(a0), H - 0.2, R * Math.cos(a0)];
      pos.push(...A, ...C, ...B);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    b.add(g, 'roof_tile', at);
  }
  // Niches: framed recesses on the inner face with statues.
  const niches: ExedraResult['niches'] = [];
  if (spec.niches) {
    const { count, rows } = spec.niches;
    rows.forEach((row, ri) => {
      for (let i = 0; i < count; i++) {
        const a = -half + (2 * half * (i + 0.5)) / count;
        if (spec.niches!.skipCentre && count % 2 === 1 && i === (count - 1) / 2) continue;
        const r = R;
        const local = new THREE.Matrix4().makeRotationY(a).setPosition(r * Math.sin(a), y0 + row.sill, r * Math.cos(a));
        const m = mul(at, local);
        // Back panel (dark: the niche depth reads in shadow), marble frame, ledge — all proud of the
        // inner face (local −z points into the exedra).
        const back = new THREE.BoxGeometry(row.width, row.height, 0.04);
        back.translate(0, row.height / 2, -0.03);
        b.add(back, 'plaster_dark', m, { castShadow: false });
        for (const sx of [-1, 1]) {
          const jamb = new THREE.BoxGeometry(0.16, row.height + 0.16, 0.22);
          jamb.translate(sx * (row.width / 2 + 0.08), row.height / 2, -0.11);
          b.add(jamb, 'marble', m);
        }
        const lint = new THREE.BoxGeometry(row.width + 0.56, 0.18, 0.3);
        lint.translate(0, row.height + 0.09, -0.15);
        b.add(lint, 'marble', m);
        const ledge = new THREE.BoxGeometry(row.width + 0.36, 0.14, 0.5);
        ledge.translate(0, -0.07, -0.25);
        b.add(ledge, 'marble', m);
        if (row.statue) figure(b, row.statue, mul(m, T(0, 0, -0.3)), { scale: row.statueScale ?? Math.min(1.3, row.height / 1.9), material: 'bronze', detail: ri === 0 ? detail : 'low' });
        niches.push({ x: r * Math.sin(a), y: y0 + row.sill, z: r * Math.cos(a), a, row: ri });
      }
    });
  }
  if (spec.collide ?? true) {
    for (const [p0, p1] of pieces) {
    const n = Math.max(2, Math.round(((seg / 2) * (p1 - p0)) / (2 * half)));
    for (let i = 0; i < n; i++) {
      const a0 = p0 + ((p1 - p0) * i) / n;
      const a1 = p0 + ((p1 - p0) * (i + 1)) / n;
      const am = (a0 + a1) / 2;
      const rm = R + t / 2;
      const len = 2 * rm * Math.sin((a1 - a0) / 2) + 0.15;
      const w = mul(at, new THREE.Matrix4().makeRotationY(am).setPosition(rm * Math.sin(am), (H + base) / 2, rm * Math.cos(am)));
      const pos = new THREE.Vector3();
      const q = new THREE.Quaternion();
      w.decompose(pos, q, new THREE.Vector3());
      b.collider({ kind: 'box', center: pos, half: new THREE.Vector3(len / 2, (H - base) / 2, t / 2), rotation: q });
    }
    }
  }
  return { half, niches };
}
