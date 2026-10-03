/**
 * Street religion: the compital shrine of the Lares at a crossroads, the household lararium niche,
 * a wall aedicula with a statuette, and a plastered street altar. All in a local frame with the
 * front facing −z, standing on y = 0 (wall pieces: origin on the wall face, wall behind at z > 0).
 */
import * as THREE from 'three';
import type { Rng } from '../../core/Rng';
import type { MaterialId } from '../../gfx/materialIds';
import { placeProp, statueFigure } from '../props';
import type { Draw } from './draw';
import { roof } from './roof';

/** Little pediment (gable roof + tympanum) of width w over a front at height y. */
function pediment(d: Draw, w: number, depth: number, y: number, mat: MaterialId, tiles: boolean) {
  const shape = new THREE.Shape([new THREE.Vector2(-w / 2, 0), new THREE.Vector2(w / 2, 0), new THREE.Vector2(0, w * 0.22)]);
  const g = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: false });
  d.geo(g, mat, 0, y, -0.02);
  g.dispose();
  if (tiles) roof(d.at(0, 0, depth / 2), { kind: 'gable', w, d: depth, y: y + 0.02, axis: 'z', overhang: 0.12, pitch: Math.atan(0.44), ridges: false });
}

/**
 * Compitum shrine: a podium with a small columned aedicula and painted Lares on the back wall,
 * and an altar in front. ~2.2 × 2.6 m footprint, 4.6 m tall.
 */
export function compitalShrine(d: Draw, rng: Rng) {
  const stone: MaterialId = rng.chance(0.5) ? 'travertine' : 'tufa';
  d.span(stone, -1.1, -0.4, -0.3, 1.1, 0.15, 1.9);
  d.span('plaster_white', -1.0, 0.15, -0.2, 1.0, 1.25, 1.8);
  d.span(stone, -1.08, 1.25, -0.28, 1.08, 1.4, 1.88);
  d.span('plaster_red', -0.98, 0.3, -0.21, 0.98, 1.1, -0.19, { shadow: false });
  // Painted back wall: two dancing Lares (ochre figures) flanking the Genius, snakes below.
  d.span('plaster_white', -0.9, 1.4, 1.45, 0.9, 3.4, 1.8);
  d.span('plaster_red', -0.85, 1.6, 1.43, 0.85, 3.2, 1.45, { shadow: false });
  for (const x of [-0.5, 0, 0.5]) d.span(x === 0 ? 'plaster_white' : 'plaster_ochre', x - 0.1, 2.0, 1.42, x + 0.1, 2.85, 1.43, { shadow: false });
  d.span('foliage_olive', -0.7, 1.7, 1.42, 0.7, 1.78, 1.43, { shadow: false });
  for (const s of [-1, 1]) {
    d.span('plaster_white', s * 0.9 - 0.12, 1.4, 0.2, s * 0.9 + 0.12, 3.4, 1.8);
    d.cyl('marble', s * 0.78, 1.4 + 0.95, 0.0, 0.11, 1.9, 10, { rTop: 0.095 });
    d.span('marble', s * 0.78 - 0.16, 1.4, -0.16, s * 0.78 + 0.16, 1.5, 0.16);
    d.span('marble', s * 0.78 - 0.15, 3.3, -0.15, s * 0.78 + 0.15, 3.42, 0.15);
  }
  d.span('marble', -1.05, 3.42, -0.25, 1.05, 3.68, 1.85);
  pediment(d, 2.2, 2.1, 3.68, 'plaster_white', true);
  placeProp(d, 'oil_lamp', 0.0, 1.4, 1.2, Math.PI, { collide: false });
  placeProp(d, 'altar', 0, 0, -1.1, 0, { variant: 0 });
  d.solid(-1.1, -0.4, -0.3, 1.1, 3.7, 1.9);
}

/** Household lararium: a painted niche with a tiny pediment, mounted on a wall (origin on the face). */
export function lararium(d: Draw, y = 1.5) {
  d.span('plaster_ochre', -0.55, y - 0.15, -0.02, 0.55, y + 0.95, 0.0, { shadow: false });
  d.span('black', -0.3, y, -0.01, 0.3, y + 0.6, -0.005, { shadow: false });
  d.span('plaster_red', -0.28, y + 0.02, -0.012, 0.28, y + 0.58, -0.008, { shadow: false });
  d.span('travertine', -0.45, y - 0.05, -0.25, 0.45, y + 0.02, 0.0);
  for (const s of [-1, 1]) d.span('plaster_white', s * 0.38 - 0.05, y, -0.08, s * 0.38 + 0.05, y + 0.65, 0.0);
  pediment(d, 0.95, 0.12, y + 0.65, 'plaster_white', false);
  placeProp(d, 'oil_lamp', 0, y + 0.02, -0.13, Math.PI, { collide: false });
}

/** Street aedicula: a deeper wall niche with columns, pediment and a statuette of a god. */
export function aedicula(d: Draw, rng: Rng, y = 1.2) {
  d.span('travertine', -0.8, y - 0.2, -0.45, 0.8, y, 0.0);
  d.span('black', -0.5, y, -0.02, 0.5, y + 1.25, 0.0, { shadow: false });
  for (const s of [-1, 1]) {
    d.cyl('marble', s * 0.62, y + 0.65, -0.28, 0.08, 1.3, 8);
    d.span('travertine', s * 0.62 - 0.12, y + 1.3, -0.4, s * 0.62 + 0.12, y + 1.38, -0.16);
  }
  d.span('travertine', -0.8, y + 1.38, -0.42, 0.8, y + 1.55, 0.0);
  pediment(d, 1.6, 0.42, y + 1.55, 'travertine', true);
  statueFigure(d.at(0, y, -0.2).sub(new THREE.Matrix4().makeScale(0.55, 0.55, 0.55)), rng.chance(0.5) ? 'bronze' : 'marble', rng);
}

/** Plastered street altar with painted serpents (agathodaimones). */
export function streetAltar(d: Draw) {
  d.span('plaster_white', -0.55, 0, -0.4, 0.55, 1.05, 0.4);
  d.span('travertine', -0.62, 1.05, -0.47, 0.62, 1.15, 0.47);
  d.span('plaster_red', -0.5, 0.15, -0.41, 0.5, 0.95, -0.4, { shadow: false });
  for (const s of [-1, 1]) d.box('plaster_ochre', s * 0.22, 0.55, -0.415, 0.08, 0.7, 0.01, { rz: s * 0.5, shadow: false });
  d.ellipsoid('glow_fire', 0, 1.16, 0, 0.18, 0.03, 0.14, { seg: [8, 4], shadow: false });
  d.solid(-0.62, 0, -0.47, 0.62, 1.15, 0.47);
}
