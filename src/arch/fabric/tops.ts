/**
 * What an insula carries above its last masonry floor, so a street of them does not end in one
 * row of identical hipped roofs:
 *
 * - 'roof': the tiled hip or gable roof (roof.ts).
 * - 'terrace': a flat roof terrace (solarium) behind a parapet, with a pergola, planters and the
 *   stair's hut. Rome's richer tenements had them (Seneca's and Pliny's roof gardens).
 * - 'timber': the top storey is timber-framed (opus craticium: posts, rails and braces with plaster
 *   between), cheaper and lighter, which is why Rome's top floors burned first.
 *
 * `insulaTop` is a pure hash of the lot's seed, so the far massing (city/massing.ts) makes the same
 * choice as the building it stands in for.
 */
import type { MaterialId } from '../../gfx/materialIds';
import { hedge } from '../vegetation/decor';
import type { Draw } from './draw';
import { roof } from './roof';
import type { Opening } from './wall';
import type { Rng } from '../../core/Rng';

export type InsulaTop = 'roof' | 'terrace' | 'timber';

function unit(seed: number): number {
  let h = Math.imul((seed ^ 0x51ed27) | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h ^= h >>> 13;
  return (h >>> 0) / 4294967296;
}

/** The top of an insula on this lot: terraces for the better-off, timber top storeys for the poor. */
export function insulaTop(seed: number, wealth: number, courtyard: boolean): InsulaTop {
  if (courtyard) return 'roof';
  const h = unit(seed);
  if (h < 0.1 + 0.2 * wealth) return 'terrace';
  if (h > 0.72 + 0.16 * wealth) return 'timber';
  return 'roof';
}

/**
 * Flat roof terrace over a body `w` wide from z0 to z1 (front to back) at `y`: deck, parapet with
 * coping, the stair hut with a lean-to roof, a pergola, planters. `low`: deck and parapet only.
 */
export function terraceTop(d: Draw, w: number, z0: number, z1: number, y: number, wallMat: MaterialId, coping: MaterialId, rng: Rng, low: boolean) {
  const t = 0.3, ph = 1.05;
  d.span('terracotta', -w / 2, y - 0.3, z0, w / 2, y, z1);
  // Parapet (front, back, sides) with a coping stone.
  d.span(wallMat, -w / 2, y, z0, w / 2, y + ph, z0 + t);
  d.span(wallMat, -w / 2, y, z1 - t, w / 2, y + ph, z1);
  d.span(wallMat, -w / 2, y, z0 + t, -w / 2 + t, y + ph, z1 - t);
  d.span(wallMat, w / 2 - t, y, z0 + t, w / 2, y + ph, z1 - t);
  if (low) return;
  for (const [x0, x1, a, b] of [[-w / 2 - 0.04, w / 2 + 0.04, z0 - 0.04, z0 + t + 0.02], [-w / 2 - 0.04, w / 2 + 0.04, z1 - t - 0.02, z1 + 0.04], [-w / 2 - 0.04, -w / 2 + t + 0.02, z0 + t, z1 - t], [w / 2 - t - 0.02, w / 2 + 0.04, z0 + t, z1 - t]] as const) {
    d.span(coping, x0, y + ph, a, x1, y + ph + 0.07, b);
  }
  // The stair hut at a back corner (the stair comes up here), with a lean-to roof.
  const side = rng.chance(0.5) ? -1 : 1;
  const hw = 2.4, hd = 2.6, hh = 2.5;
  const hx = side * (w / 2 - t - hw / 2), hz = z1 - t - hd / 2;
  d.span(wallMat, hx - hw / 2, y, hz - hd / 2, hx + hw / 2, y + hh, hz + hd / 2);
  d.span('wood_dark', hx - 0.45, y, hz - hd / 2 - 0.02, hx + 0.45, y + 2.0, hz - hd / 2 + 0.02, { shadow: false });
  roof(d.at(hx, 0, hz), { kind: 'shed', w: hw, d: hd, y: y + hh, overhang: 0.25, pitch: 0.3, wallMat, wallT: 0.3, ridges: false });
  // Pergola over the front half: posts, two beams, cross laths; a vine over part of it.
  const px0 = -w / 2 + t + 0.6, px1 = side < 0 ? w / 2 - t - 0.6 : w / 2 - t - 0.6 - (hw + 0.4) * 0;
  const pz0 = z0 + t + 0.7, pz1 = Math.min(z0 + t + 0.7 + 3.2, hz - hd / 2 - 0.8);
  const top = y + 2.35;
  if (pz1 - pz0 > 1.5 && px1 - px0 > 2.5) {
    const nx = Math.max(2, Math.round((px1 - px0) / 2.4));
    for (let i = 0; i <= nx; i++) {
      const x = px0 + ((px1 - px0) * i) / nx;
      for (const z of [pz0, pz1]) d.span('wood', x - 0.06, y, z - 0.06, x + 0.06, top, z + 0.06);
    }
    for (const z of [pz0, pz1]) d.span('wood', px0 - 0.25, top, z - 0.07, px1 + 0.25, top + 0.14, z + 0.07);
    const nl = Math.round((px1 - px0) / 0.55);
    for (let i = 0; i <= nl; i++) {
      const x = px0 + ((px1 - px0) * i) / nl;
      d.span('wood', x - 0.03, top + 0.14, pz0 - 0.3, x + 0.03, top + 0.2, pz1 + 0.3, { shadow: false });
    }
    // Vine leaves on part of the laths.
    const vx = rng.range(px0, px0 + (px1 - px0) * 0.4);
    hedge(d.at(0, top + 0.2, 0), vx, pz0 - 0.2, Math.min(px1, vx + rng.range(2, 4)), pz1 + 0.2, 0.18, Math.round(vx * 13 + pz0 * 7));
  }
  // Planters along the front parapet, with clipped box or herbs.
  for (let x = -w / 2 + t + 0.6; x < w / 2 - t - 0.8; x += rng.range(1.6, 2.6)) {
    if (!rng.chance(0.6)) continue;
    d.span('terracotta', x, y, z0 + t + 0.05, x + 0.7, y + 0.42, z0 + t + 0.45);
    hedge(d.at(0, y + 0.42, 0), x + 0.05, z0 + t + 0.1, x + 0.65, z0 + t + 0.4, 0.38, Math.round(x * 31));
  }
}

/**
 * Timber framing over the top storey of one face (frame `F`: x along the wall, the face at z = 0,
 * out is −z), from x0 to x1 and y0 (the storey's floor) to y1 (under the cornice). `openings` are the
 * windows cut in that storey: posts frame them, rails run under and over them, and the rest is
 * plaster panels braced on the diagonal.
 */
export function timberTop(F: Draw, x0: number, x1: number, y0: number, y1: number, openings: readonly Opening[], plaster: MaterialId) {
  const wood: MaterialId = 'wood_dark';
  const zo = -0.05, zi = -0.006; // proud of the face
  const pw = 0.14; // post width
  const wins = openings.filter((o) => o.y0 >= y0 - 0.05 && o.y1 <= y1 + 0.3).sort((a, b) => a.x0 - b.x0);
  // Posts: both ends, both jambs of every window, and fill so no panel is wider than ~1.4 m.
  const fixed: number[] = [x0 + pw / 2, x1 - pw / 2];
  for (const o of wins) fixed.push(o.x0 - pw / 2, o.x1 + pw / 2);
  fixed.sort((a, b) => a - b);
  const posts: number[] = [];
  for (let i = 0; i < fixed.length; i++) {
    const p = fixed[i];
    if (posts.length && p - posts[posts.length - 1] < pw * 1.2) continue;
    if (posts.length) {
      const prev = posts[posts.length - 1];
      const inWin = wins.some((o) => o.x0 >= prev - 0.01 && o.x1 <= p + 0.01);
      const gap = p - prev;
      if (!inWin && gap > 1.6) {
        const k = Math.ceil(gap / 1.4);
        for (let j = 1; j < k; j++) posts.push(prev + (gap * j) / k);
      }
    }
    posts.push(p);
  }
  // Rails at the floor and under the cornice, the full length.
  F.span(wood, x0, y0 - 0.02, zo, x1, y0 + 0.16, zi);
  F.span(wood, x0, y1 - 0.18, zo, x1, y1, zi);
  for (const x of posts) F.span(wood, x - pw / 2, y0 + 0.16, zo, x + pw / 2, y1 - 0.18, zi);
  // Bays between posts: a window's sill and lintel rails with panels under and over it, or a plaster
  // panel with a brace.
  for (let i = 0; i + 1 < posts.length; i++) {
    const a = posts[i] + pw / 2, b = posts[i + 1] - pw / 2;
    if (b - a < 0.1) continue;
    const o = wins.find((w) => w.x0 >= a - 0.05 && w.x1 <= b + 0.05);
    if (o) {
      F.span(wood, a, o.y0 - 0.12, zo, b, o.y0, zi);
      F.span(wood, a, o.y1, zo, b, o.y1 + 0.12, zi);
      if (o.y0 - 0.12 - (y0 + 0.16) > 0.1) F.span(plaster, a, y0 + 0.16, zo + 0.025, b, o.y0 - 0.12, zi);
      if (y1 - 0.18 - (o.y1 + 0.12) > 0.1) F.span(plaster, a, o.y1 + 0.12, zo + 0.025, b, y1 - 0.18, zi);
    } else {
      F.span(plaster, a, y0 + 0.16, zo + 0.025, b, y1 - 0.18, zi);
      const up = (i % 2) === 0;
      F.rod(wood, { x: a, y: up ? y0 + 0.2 : y1 - 0.22, z: zo + 0.02 }, { x: b, y: up ? y1 - 0.22 : y0 + 0.2, z: zo + 0.02 }, 0.055, 4, { shadow: false });
    }
  }
}
