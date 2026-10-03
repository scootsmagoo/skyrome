/**
 * Horrea: a brick warehouse block around a courtyard — two storeys of storage cells opening onto
 * the court, blank outer walls with slit windows, and a monumental brick gateway with engaged
 * columns and a pediment (after the Horrea Epagathiana at Ostia). The gate passage and courtyard
 * are walkable.
 *
 * Local frame: footprint centred, entrance on the −z front, floor y = 0.
 */
import * as THREE from 'three';
import { Rng } from '../../core/Rng';
import { MeshBuilder } from '../../gfx/MeshBuilder';
import { placeProp } from '../props';
import { Draw } from './draw';
import { roof } from './roof';
import { flatGround, type BuildingOutput, type LocalGround, type Spot } from './types';
import { archBand, band, doorLeaves, wall, type Opening } from './wall';

export interface HorreaSpec {
  width: number;
  depth: number;
  seed?: number;
  groundAt?: LocalGround;
}

const T = 0.7;

export function horrea(spec: HorreaSpec): BuildingOutput {
  const rng = new Rng(spec.seed ?? 3);
  const b = new MeshBuilder();
  const d = new Draw(b);
  const spots: Spot[] = [];
  const W = spec.width, D = spec.depth;
  const ground = spec.groundAt ?? flatGround;
  let gmin = 0;
  for (const [x, z] of [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]]) gmin = Math.min(gmin, ground(x, z));
  const yMin = gmin - 0.5;
  const H1 = 4.6, H = 8.8;
  const wing = Math.min(8, Math.min(W, D) * 0.3);
  const cw = W - 2 * wing, cd = D - 2 * wing;
  const gateW = 3.0, gateH = 4.2;

  // Outer walls with slit windows high up; the front carries the gateway.
  const slits = (len: number): Opening[] => {
    const out: Opening[] = [];
    const n = Math.max(1, Math.floor(len / 3.5));
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (len * (i + 0.5)) / n;
      if (Math.abs(x) < gateW) continue;
      out.push({ x0: x - 0.22, x1: x + 0.22, y0: 2.8, y1: 3.8 }, { x0: x - 0.3, x1: x + 0.3, y0: 6.3, y1: 7.5, arch: 0.3 });
    }
    return out;
  };
  const F = d.at(0, 0, -D / 2);
  const gate: Opening = { x0: -gateW / 2, x1: gateW / 2, y0: 0, y1: gateH, arch: gateW / 2 };
  wall(F, 'brick', -W / 2, W / 2, yMin, H, T, [gate, ...slits(W)]);
  const sides: [Draw, number][] = [
    [d.at(-W / 2, 0, 0, Math.PI / 2), D - 2 * T],
    [d.at(W / 2, 0, 0, -Math.PI / 2), D - 2 * T],
    [d.at(0, 0, D / 2, Math.PI), W],
  ];
  for (const [fr, len] of sides) {
    wall(fr, 'brick', -len / 2, len / 2, yMin, H, T, slits(len));
    band(fr, 'travertine', -len / 2 - (len === W ? 0 : T), len / 2 + (len === W ? 0 : T), H1 - 0.1, 0.14, 0.06);
  }
  band(F, 'travertine', -W / 2, W / 2, H1 - 0.1, 0.14, 0.06);
  for (const fr of [F, ...sides.map((s) => s[0])]) band(fr, 'travertine', -W / 2, W / 2, H - 0.25, 0.25, 0.18);

  // Gateway: engaged brick columns, travertine archivolt, pediment.
  archBand(F, 'travertine', 0, gateH - gateW / 2, gateW / 2, gateW / 2, 0.28, 0.05);
  for (const s of [-1, 1]) {
    const x = s * (gateW / 2 + 0.75);
    F.cyl('brick', x, (gateH + 1.0) / 2, -0.12, 0.28, gateH + 1.0, 10);
    F.span('travertine', x - 0.38, 0, -0.5, x + 0.38, 0.35, 0.05);
    F.span('travertine', x - 0.36, gateH + 1.0, -0.46, x + 0.36, gateH + 1.25, 0.05);
  }
  F.span('travertine', -gateW / 2 - 1.2, gateH + 1.25, -0.5, gateW / 2 + 1.2, gateH + 1.55, 0.05);
  const ped = new THREE.Shape([new THREE.Vector2(-gateW / 2 - 1.3, 0), new THREE.Vector2(gateW / 2 + 1.3, 0), new THREE.Vector2(0, 1.1)]);
  const pg = new THREE.ExtrudeGeometry(ped, { depth: 0.45, bevelEnabled: false });
  F.geo(pg, 'brick', 0, gateH + 1.55, -0.5);
  pg.dispose();
  F.span('marble', -0.9, gateH + 0.45, -0.07, 0.9, gateH + 0.95, 0.0, { shadow: false }); // inscription
  // Passage through the front wing (vaulted, plastered).
  const P = d.at(0, 0, -D / 2);
  P.span('cobbles', -gateW / 2, -0.25, -0.2, gateW / 2, 0.0, wing);
  for (const s of [-1, 1]) P.span('plaster_cream', s * gateW / 2, 0, T, s * (gateW / 2 + 0.2), gateH, wing);
  P.span('concrete', -gateW / 2 - 0.2, gateH - 0.6, T, gateW / 2 + 0.2, gateH - 0.4, wing);
  doorLeaves(P, { x0: -gateW / 2, x1: gateW / 2, y0: 0, y1: gateH - gateW / 2 }, 1.4, 1, 'wood_dark', false);

  // Courtyard: two storeys of cells behind arched doors, upper windows.
  const cz = 0;
  const yard: [Draw, number][] = [
    [d.at(0, 0, cz - cd / 2, Math.PI), cw + 2 * T],
    [d.at(0, 0, cz + cd / 2, 0), cw + 2 * T],
    [d.at(-cw / 2, 0, cz, -Math.PI / 2), cd],
    [d.at(cw / 2, 0, cz, Math.PI / 2), cd],
  ];
  yard.forEach(([fr, len], wi) => {
    const ops: Opening[] = [];
    const n = Math.max(1, Math.floor(len / 3.4));
    for (let i = 0; i < n; i++) {
      const x = -len / 2 + (len * (i + 0.5)) / n;
      if (wi === 0 && Math.abs(x) < gateW) { ops.push({ x0: -gateW / 2, x1: gateW / 2, y0: 0, y1: gateH, arch: gateW / 2 }); continue; }
      ops.push({ x0: x - 1.0, x1: x + 1.0, y0: 0, y1: 2.9, arch: 1.0 });
      ops.push({ x0: x - 0.45, x1: x + 0.45, y0: H1 + 0.9, y1: H1 + 2.2 });
    }
    const cut = wall(fr, 'brick', -len / 2, len / 2, -0.3, H, T, ops);
    for (const o of cut) {
      if (o.y0 > 1) { fr.span('black', o.x0, o.y0, T * 0.6, o.x1, o.y1, T * 0.6 + 0.02, { shadow: false }); continue; }
      if (wi === 0 && o.x1 - o.x0 > 2.5) continue;
      archBand(fr, 'travertine', (o.x0 + o.x1) / 2, 1.9, 1.0, 1.0, 0.2, 0.03);
      const C = fr.at((o.x0 + o.x1) / 2, 0, 0);
      const open = rng.chance(0.4);
      C.span('black', -1, 0, T + 2.5, 1, 2.9, T + 2.52, { shadow: false });
      if (open) {
        C.span('concrete', -1.0, -0.05, T, 1.0, 0.01, T + 2.5);
        for (const s of [-1, 1]) C.span('plaster_cream', s * 1.0, 0, T, s * 1.1, 2.9, T + 2.5);
        for (let k = 0; k < 4; k++) placeProp(C, rng.chance(0.5) ? 'amphora_tall' : 'sack', -0.6 + k * 0.4, 0, T + 2.1, 0, { collide: false, rx: 0.15 });
        doorLeaves(C, { x0: -1, x1: 1, y0: 0, y1: 1.9 }, T, 1);
      } else doorLeaves(C, { x0: -1, x1: 1, y0: 0, y1: 1.9 }, T, 0);
    }
    band(fr, 'travertine', -len / 2, len / 2, H1 - 0.1, 0.14, 0.06);
  });
  d.span('cobbles', -cw / 2, -0.3, cz - cd / 2, cw / 2, 0.0, cz + cd / 2);
  d.solid(-cw / 2 - 0.1, -1, cz - cd / 2 - 0.1, cw / 2 + 0.1, 0, cz + cd / 2 + 0.1);
  d.solid(-gateW / 2, -1, -D / 2 - 0.2, gateW / 2, 0, cz - cd / 2);
  // Dark storage mass inside the wings (behind slits and cell doors).
  const iw = W / 2 - T - 0.01, id = D / 2 - T - 0.01;
  d.span('black', -iw, 0, -id, iw, H - 0.05, cz - cd / 2 - T - 0.01, { shadow: false });
  d.span('black', -iw, 0, cz + cd / 2 + T + 0.01, iw, H - 0.05, id, { shadow: false });
  d.span('black', -iw, 0, cz - cd / 2 - T, -cw / 2 - T - 0.01, H - 0.05, cz + cd / 2 + T, { shadow: false });
  d.span('black', cw / 2 + T + 0.01, 0, cz - cd / 2 - T, iw, H - 0.05, cz + cd / 2 + T, { shadow: false });
  // Courtyard life.
  placeProp(d, 'amphora_stack', -cw / 2 + 2, 0, cz + 1, 0.3);
  placeProp(d, 'cart', cw / 2 - 2.5, 0, cz - 1, 0.4, { variant: 1 });
  for (let i = 0; i < 4; i++) placeProp(d, 'sack', 1 + i * 0.5, 0, cz + cd / 2 - 1.2, rng.range(0, 6), { collide: false });
  placeProp(d, 'puteal', 0, 0, cz, 0, { variant: 2 });
  spots.push({ id: 'gate', kind: 'houseDoor', position: new THREE.Vector3(0, 0, -D / 2 - 0.6), facing: Math.PI, tag: 'horrea' });
  spots.push({ id: 'yard', kind: 'workshop', position: new THREE.Vector3(1.5, 0, cz), facing: 0, tag: 'horrea' });

  roof(d, { kind: 'ring', w: W, d: D, y: H, inner: { w: cw, d: cd }, overhang: 0.4, pitch: 0.33 });

  // Colliders: four wings, leaving the gate passage open.
  const g = gateW / 2;
  d.solid(-W / 2, yMin, -D / 2, -g, H, cz - cd / 2);
  d.solid(g, yMin, -D / 2, W / 2, H, cz - cd / 2);
  d.solid(-g, gateH - 0.6, -D / 2, g, H, cz - cd / 2);
  d.solid(-W / 2, yMin, cz + cd / 2, W / 2, H, D / 2);
  d.solid(-W / 2, yMin, cz - cd / 2, -cw / 2, H, cz + cd / 2);
  d.solid(cw / 2, yMin, cz - cd / 2, W / 2, H, cz + cd / 2);
  return { builder: b, spots, height: H };
}
