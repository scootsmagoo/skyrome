/**
 * Brick street fronts for the outer faces of the Markets of Trajan (and any other plain Trajanic
 * brick face): storeys of tabernae with travertine frames (most still shuttered at dawn),
 * mezzanine windows with grilles, travertine string courses, arched windows between brick
 * pilasters, and a corbelled cornice. Built on the city-fabric wall helpers so the Markets match
 * the insulae around them.
 *
 * Works in a WALL FRAME (as src/arch/fabric does): the outer face lies at z = 0 facing −z, the wall
 * runs x0 → x1 and extends into +z, the floor is y = 0.
 */
import * as THREE from 'three';
import { Rng } from '../../../core/Rng';
import { Draw } from '../../../arch/fabric/draw';
import { archBand, band, doorFrame, plankShutters, wall, windowDetails, type Opening } from '../../../arch/fabric/wall';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import { placeProp } from '../../../arch/props/props';
import { solidBox } from './trajan-kit';
import type { Lamps } from './trajan-lights';

export interface BrickFrontSpec {
  x0: number;
  x1: number;
  /** Storey heights from the floor (y = 0) upwards. */
  storeys: number[];
  /** The ground storey is a row of tabernae (otherwise windows like the others). */
  shops?: boolean;
  /** Target bay width (default 3.8 m). */
  bay?: number;
  seed?: number | string;
  /** Wall foot below the floor (default −0.4, so falling ground never shows a gap). */
  yBase?: number;
  /** Share of the shops still shuttered (default 0.65: the game starts at dawn). */
  shut?: number;
  /** Brick pilasters between the bays of the upper storeys (default true). */
  pilasters?: boolean;
  /** Dark plane behind the openings, for faces with solid fill behind them (default true). */
  backdrop?: boolean;
  /** Depth of the collider behind the face (default 1.5: wall + shop depth; 0 = none). */
  colliderDepth?: number;
  /** Cornice at the top (default true). */
  cornice?: boolean;
  /**
   * Lamps: a torch in an iron bracket on every third pier of a shop front, and an oil lamp
   * burning inside the open shops (it is before dawn).
   */
  lamps?: Lamps;
}

export interface BrickFront {
  /** Centre (wall frame) of every taberna opening and whether it is open. */
  shops: { x: number; open: boolean }[];
  /** Top of the wall (y). */
  top: number;
}

const T = 0.6;

export function brickFront(b: MeshBuilder, m: THREE.Matrix4, s: BrickFrontSpec): BrickFront {
  const d = new Draw(b, m);
  const rng = new Rng(`trajan-front:${s.seed ?? 0}`);
  const W = s.x1 - s.x0;
  const n = Math.max(1, Math.round(W / (s.bay ?? 3.8)));
  const bw = W / n;
  const top = s.storeys.reduce((a, h) => a + h, 0);
  const yB = s.yBase ?? -0.4;
  const shops: { x: number; open: boolean }[] = [];
  const ops: Opening[] = [];
  const shopOps: { o: Opening; open: boolean }[] = [];
  const mezz: Opening[] = [];
  const wins: Opening[] = [];
  let y = 0;
  s.storeys.forEach((h, k) => {
    for (let i = 0; i < n; i++) {
      const cx = s.x0 + (i + 0.5) * bw;
      if (k === 0 && s.shops) {
        const hw = Math.min(1.3, bw / 2 - 0.45);
        if (hw < 0.6) continue;
        const o: Opening = { x0: cx - hw, x1: cx + hw, y0: y, y1: y + Math.min(2.9, h - 1.2) };
        const open = !rng.chance(s.shut ?? 0.65);
        shopOps.push({ o, open });
        shops.push({ x: cx, open });
        ops.push(o);
        if (h >= 3.9) {
          const mo: Opening = { x0: cx - 0.45, x1: cx + 0.45, y0: o.y1 + 0.45, y1: o.y1 + 1.0 };
          mezz.push(mo);
          ops.push(mo);
        }
      } else {
        const wh = Math.min(2.2, h - 1.3);
        if (wh < 1.0) continue;
        const ww = Math.min(1.15, bw * 0.4);
        const y0 = y + Math.max(0.8, (h - wh) * 0.55);
        const o: Opening = { x0: cx - ww / 2, x1: cx + ww / 2, y0, y1: y0 + wh, arch: ww / 2 };
        wins.push(o);
        ops.push(o);
      }
    }
    y += h;
  });
  const cut = new Set(wall(d, 'brick', s.x0, s.x1, yB, top, T, ops));
  for (const { o, open } of shopOps) {
    if (!cut.has(o)) continue;
    doorFrame(d, o, 'travertine');
    if (!open) plankShutters(d, o, T, rng, rng.chance(0.5));
  }
  for (const o of mezz) if (cut.has(o)) windowDetails(d, o, { sill: 'travertine', grille: true, t: T });
  for (const o of wins) {
    if (!cut.has(o)) continue;
    const r = rng.next();
    windowDetails(d, o, { sill: 'travertine', shutters: r < 0.3 ? 'closed' : r < 0.45 ? 'half' : null, t: T });
    const hw = (o.x1 - o.x0) / 2;
    archBand(d, 'terracotta', (o.x0 + o.x1) / 2, o.y1 - (o.arch ?? hw), hw + 0.02, o.arch ?? hw, 0.2, 0.03);
  }
  if (s.backdrop ?? true) d.span('black', s.x0, yB, T + 0.9, s.x1, top - 0.3, T + 0.92);
  // String courses at the storey lines, pilasters between the upper bays, the cornice.
  let ys = 0;
  for (let k = 0; k < s.storeys.length - 1; k++) {
    ys += s.storeys[k];
    band(d, 'travertine', s.x0, s.x1, ys - 0.1, 0.18, 0.08);
  }
  const yP = s.shops ? s.storeys[0] : 0;
  if ((s.pilasters ?? true) && top - yP > 2.5) {
    for (let i = 0; i <= n; i++) {
      const px = s.x0 + i * bw;
      d.span('brick', Math.max(s.x0, px - 0.28), yP + 0.08, -0.12, Math.min(s.x1, px + 0.28), top - 0.5, 0.01);
    }
  }
  if (s.cornice ?? true) {
    band(d, 'brick', s.x0 - 0.04, s.x1 + 0.04, top - 0.52, 0.22, 0.14);
    band(d, 'travertine', s.x0 - 0.08, s.x1 + 0.08, top - 0.3, 0.3, 0.26);
  }
  if (s.lamps && s.shops) {
    for (let i = 1; i < n; i += 3) {
      const at = new THREE.Matrix4().makeTranslation(s.x0 + i * bw, 2.75, -0.01);
      placeProp(d.sub(at), 'torch_bracket', 0, 0, 0, 0);
      s.lamps.add('torch', new THREE.Vector3(0, 0.53, -0.3), m.clone().multiply(at));
    }
    shopOps.forEach(({ o, open }) => {
      if (open && cut.has(o)) s.lamps!.add('lamp', new THREE.Vector3((o.x0 + o.x1) / 2, 2.2, 1.2), m);
    });
  }
  const depth = s.colliderDepth ?? 1.5;
  if (depth > 0) solidBox(b, m, (s.x0 + s.x1) / 2, (yB + top) / 2, depth / 2, W, top - yB, depth);
  return { shops, top };
}
