/**
 * The Forum square and the small monuments standing in it: the Golden Milestone (which also lays
 * the travertine paving of the whole square, with basalt strips where the streets cross it, and
 * the honorific statues along its edges), the Navel of the City with the mundus stone, the Rostra
 * with its ship rams, statues and the rostral column of Duilius, the Lapis Niger, the Volcanal, the
 * Lacus Curtius with the sacred trees and Marsyas, the empty site of Domitian's horse, the Shrine
 * of Venus Cloacina with the Cloaca grate, the Servilian basin with Agrippa's hydra, and the
 * bronze shrine of Janus Geminus with its doors standing open for the coming Parthian war.
 */
import * as THREE from 'three';
import { armoredEmperor, equestrian, togate } from '../../../arch/classical/statues';
import { column } from '../../../arch/classical/column';
import { podium } from '../../../arch/classical/podium';
import { ProfileBuilder, lathe, tube } from '../../../arch/common/geom';
import { stairs } from '../../../arch/common/stairs';
import { prism } from '../../../arch/common/walls';
import { LANDMARK_BY_ID } from '../../../data/atlas';
import { footprintPolygon } from '../../terrain/heightmap';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { FORUM_INSCRIPTIONS, FORUM_PLAZA, plazaRoadStrips, type P2 } from './forum-data';
import { drapedFemale, figure, nudeMale } from './forum-figures';
import { T, TRS, altar, atlasToLocal, balustrade, inscription, landmark, mul, paint, pave, pedestal, plantTrees, rect, ring, shipRam, type Part, type V2 } from './forum-kit';
import { curtiusMaterial, panel } from './forum-reliefs';

const text = (id: string) => FORUM_INSCRIPTIONS[id].latin;

/** Atlas footprint of another landmark in this landmark's local frame (game metres), grown by `grow` real metres. */
function localOutline(ctx: LandmarkContext, id: string, grow = 0): V2[] {
  const lm = LANDMARK_BY_ID[id];
  return footprintPolygon(lm.center, lm.rotation, lm.footprint, grow).map(([x, z]) => atlasToLocal(ctx, x, z));
}

// ---------------------------------------------------------------- the paved square

/** Honorific statues along the edges of the square (atlas real metres, facing bearing). */
const SQUARE_STATUES: { at: P2; face: number; kind: 'togate' | 'armored' }[] = [
  // in front of the steps of the Basilica Iulia, facing the square
  { at: [13.6, 25.1], face: 24, kind: 'togate' },
  { at: [31.6, 33.2], face: 24, kind: 'armored' },
  { at: [49.6, 41.2], face: 24, kind: 'togate' },
  { at: [67.6, 49.2], face: 24, kind: 'togate' },
  { at: [83.6, 56.3], face: 24, kind: 'armored' },
  // before the portico of the Basilica Paulli
  { at: [101.8, -6.1], face: 213, kind: 'togate' },
  { at: [117.8, 4.4], face: 213, kind: 'armored' },
  { at: [133.8, 15.0], face: 213, kind: 'togate' },
  { at: [149.8, 25.5], face: 213, kind: 'togate' },
];

/** The small monuments that pave their own ground (holes in the square's paving). */
const OWN_FLOORS = ['comitium-lapis-niger', 'lacus-curtius', 'equus-domitiani-site', 'volcanal'];

function forumSquare(p: Part) {
  const { ctx, b, hi, S } = p;
  const poly = FORUM_PLAZA.map(([x, z]) => atlasToLocal(ctx, x, z));
  const strips = plazaRoadStrips().map((s) => s.map(([x, z]) => atlasToLocal(ctx, x, z)));
  const holes = [...strips, ...OWN_FLOORS.map((id) => localOutline(ctx, id, 0.4))];
  pave(p, poly, { exclude: holes, material: 'paving_travertine', lift: 0.06, cell: hi ? 3 : 8 });
  for (const s of strips) pave(p, s, { material: 'paving_basalt', lift: 0.075, cell: hi ? 3 : 8 });
  if (!hi) return;
  // Honorific statues on moulded bases.
  const dedication = ['Senatus Populusque Romanus', 'Ob Merita'];
  SQUARE_STATUES.forEach((s, i) => {
    const [x, z] = atlasToLocal(ctx, s.at[0], s.at[1]);
    const y = ctx.groundAt(x, z) + 0.06;
    const rot = -((s.face - ctx.lm.rotation) * Math.PI) / 180;
    const at = TRS(x, y, z, 0, rot, 0);
    const h = pedestal(b, at, 0.95, 0.8, 1.55, 'marble', i % 3 === 0 ? dedication : undefined);
    const st = mul(at, T(0, h, 0));
    if (s.kind === 'togate') togate(b, st, { material: i % 2 ? 'marble' : 'bronze', scale: 1.08, detail: 'low' });
    else armoredEmperor(b, st, { material: 'bronze', scale: 1.08, detail: 'low' });
    if (i === 0) p.spot('forum-statue-base', 'inscription', x + Math.sin(rot) * -1.4, y, z - Math.cos(rot) * 1.4, rot);
  });
  void S;
}

// ---------------------------------------------------------------- miliarium aureum

function miliarium(p: Part) {
  const { b, d, hi } = p;
  const seg = hi ? 40 : 16;
  // two round steps
  d.cyl('travertine', 0, 0.09, 0, 1.35, 0.18, seg, { collide: true });
  d.cyl('travertine', 0, 0.27, 0, 1.08, 0.18, seg, { collide: true });
  // moulded marble drum
  const prof = new ProfileBuilder(0.86, 0.36).up(0.08).torus(0.1, 0.04, 4).in(0.04).cymaReversa(-0.06, 0.1, 3).to(0.74, 1.0).cymaReversa(0.06, 0.08, 3).up(0.04).out(0.04).up(0.08).to(0, 1.24).build();
  b.add(lathe(prof, { segments: seg }), 'marble');
  d.solidCyl(0, 0.8, 0, 0.86, 0.9);
  // the column sheathed in gilded bronze, with moulded bands and a capital
  const shaft = new ProfileBuilder(0.4, 1.24).up(0.06).torus(0.1, 0.05, 4).to(0.36, 1.45).to(0.33, 3.3).torus(0.08, 0.04, 4).to(0.42, 3.42).to(0.46, 3.52).up(0.08).to(0.18, 3.62).ovolo(0.12, 0.16, 4).to(0, 3.92).build();
  b.add(lathe(shaft, { segments: hi ? 32 : 12 }), 'gilded_bronze');
  if (hi) for (const y of [1.9, 2.55]) d.cyl('bronze', 0, y, 0, 0.36, 0.05, 32);
  d.solidCyl(0, 2.6, 0, 0.42, 2.7);
  // carved dedication on a tablet against the drum
  d.box('marble', 0, 0.72, -0.78, 1.0, 0.5, 0.2);
  inscription(b, T(0, 0.72, -0.885), text('miliarium-aureum'), 0.92, 0.42, 'carved', { sizes: [1, 0.85] });
  p.spot('miliarium-aureum', 'inscription', 0, 0.06, -2.0, 0);
}

// ---------------------------------------------------------------- rostra

function rostra(p: Part) {
  const { b, d, hi } = p;
  const W = 24 * p.S;
  // 3 m real; raised to 2.4 m so an orator stands clear above the crowd (a human-scale function)
  const H = 2.4;
  const z0 = -3.6;
  const z1 = 1.8;
  podium(b, { outline: rect(-W / 2, z0, W / 2, z1), height: H, material: 'marble', topMaterial: 'paving_travertine', detail: p.detail, colliders: [[-W / 2, z0, W / 2, z1]] });
  // stair at the back
  const n = 12;
  const run = 0.32;
  stairs(b, { width: 5, rise: H / n, run, count: n, material: 'travertine' }, TRS(0, 0, z1 + n * run, 0, Math.PI, 0));
  for (const sx of [-1, 1]) d.box('marble', sx * 2.7, H / 2, z1 + (n * run) / 2, 0.4, H, n * run, { collide: true });
  // bronze rams in two staggered rows on the front
  for (const [y, k, off] of [
    [0.75, 8, 0],
    [1.65, 9, 0.5],
  ] as const) {
    for (let i = 0; i < k; i++) {
      const x = -W / 2 + 1.0 + ((i + off) * (W - 2.0)) / (k - 1 + off * 2);
      shipRam(b, TRS(x, y, z0 - 0.02, 0, 0, 0), hi ? 1.15 : 1.0);
    }
  }
  // marble balustrade on top, open at the stair
  const y = H;
  const e = 0.18;
  balustrade(d, -W / 2 + e, z0 + e, W / 2 - e, z0 + e, { y });
  balustrade(d, W / 2 - e, z0 + e, W / 2 - e, z1 - e, { y });
  balustrade(d, -W / 2 + e, z1 - e, -W / 2 + e, z0 + e, { y });
  balustrade(d, W / 2 - e, z1 - e, 2.9, z1 - e, { y });
  balustrade(d, -2.9, z1 - e, -W / 2 + e, z1 - e, { y });
  // honorific statues: gilded equestrians at the front corners, togate bronzes at the back
  for (const sx of hi ? [-1, 1] : []) {
    const at = TRS(sx * (W / 2 - 1.6), y, -1.2, 0, 0, 0);
    d.box('marble', sx * (W / 2 - 1.6), y + 0.6, -1.2, 1.0, 1.2, 2.8, { collide: true });
    equestrian(b, mul(at, T(0, 1.2, 0)), { material: 'gilded_bronze', scale: 0.95, detail: 'low' });
    const at2 = TRS(sx * 4.4, y, 0.9, 0, 0, 0);
    const h = pedestal(b, at2, 0.8, 0.7, 1.1);
    togate(b, mul(at2, T(0, h, 0)), { material: 'bronze', scale: 1.05, detail: 'low' });
  }
  // the rostral column of Duilius beside the platform's south end
  {
    const cx = W / 2 + 1.7;
    const cz = -1.6;
    const at = T(cx, 0, cz);
    const h = pedestal(b, at, 1.3, 1.3, 1.5, 'marble', hi ? text('rostra-duilius') : undefined);
    const colH = 6.2;
    column(b, { order: 'doric', D: 0.62, height: colH, fluted: false, material: 'marble', detail: p.detail, collide: false }, mul(at, T(0, h, 0)));
    for (const [yy, k] of [
      [1.5, 0],
      [3.0, 0.5],
      [4.5, 0],
    ] as const) {
      for (let i = 0; i < 4; i++) {
        const a = ((i + k) / 4) * Math.PI * 2;
        shipRam(b, mul(at, TRS(Math.sin(a) * 0.3, h + yy, -Math.cos(a) * 0.3, 0, -a, 0)), 0.75);
      }
    }
    togate(b, mul(at, T(0, h + colH, 0)), { material: 'gilded_bronze', scale: 1.0, detail: 'low' });
    d.solidCyl(cx, (h + colH) / 2, cz, 0.7, h + colH);
    p.spot('rostra-duilius', 'inscription', cx, 0.06, cz - 1.6, 0);
  }
  p.spot('rostra-orator', 'npc', 0, H, z0 + 1.0, Math.PI);
  p.spot('rostra-vista', 'vista', 2.0, H, z0 + 1.6, Math.PI);
  p.spot('rostra-crowd', 'npc', 0, 0.06, z0 - 5, 0);
}

// ---------------------------------------------------------------- umbilicus urbis and the mundus

function umbilicus(p: Part) {
  const { d, hi } = p;
  const seg = hi ? 36 : 14;
  d.cyl('brick', 0, 0.12, 0, 1.4, 0.24, seg);
  d.cyl('marble_veined', 0, 0.62, 0, 1.32, 0.8, seg, { collide: true });
  d.cyl('marble', 0, 1.06, 0, 1.42, 0.1, seg);
  d.cyl('marble_veined', 0, 1.38, 0, 1.02, 0.55, seg, { collide: true });
  d.cyl('marble', 0, 1.69, 0, 1.1, 0.08, seg);
  d.cyl('marble_veined', 0, 1.88, 0, 0.72, 0.3, seg);
  d.cyl('marble', 0, 2.06, 0, 0.78, 0.06, seg);
  // the lapis manalis: the round stone that closes the mundus, opened three days a year
  d.cyl('peperino', 2.3, 0.1, 0.6, 0.62, 0.12, 20, { collide: true });
  d.cyl('iron', 2.3, 0.17, 0.6, 0.08, 0.04, 8);
  p.spot('umbilicus-urbis', 'shrine', 0, 0.06, -2.2, 0);
  p.spot('mundus', 'shrine', 2.3, 0.16, -0.4, 0);
}

// ---------------------------------------------------------------- lapis niger

function lapisNiger(p: Part) {
  const { b, d } = p;
  const w = 6 * p.S;
  const dp = 5 * p.S;
  const black = paint('#1c1b1a', 0.28);
  b.add(prism(rect(-w / 2 - 0.3, -dp / 2 - 0.3, w / 2 + 0.3, dp / 2 + 0.3), -0.3, 0.1), 'paving_travertine');
  b.add(prism(rect(-w / 2, -dp / 2, w / 2, dp / 2), 0.09, 0.12), black);
  d.solid(-w / 2, -0.3, -dp / 2, w / 2, 0.12, dp / 2);
  const y = 0.1;
  balustrade(d, -w / 2, -dp / 2, w / 2, -dp / 2, { y, h: 0.85 });
  balustrade(d, w / 2, -dp / 2, w / 2, dp / 2, { y, h: 0.85 });
  balustrade(d, w / 2, dp / 2, -w / 2, dp / 2, { y, h: 0.85 });
  balustrade(d, -w / 2, dp / 2, -w / 2, -dp / 2, { y, h: 0.85 });
  p.spot('lapis-niger', 'inscription', 0, 0.12, -dp / 2 - 0.9, 0);
}

// ---------------------------------------------------------------- volcanal

function volcanal(p: Part) {
  const { d, ctx } = p;
  const w = 6 * p.S;
  const dp = 5 * p.S;
  // the rock outcrop of the archaic shrine, cut flat on top
  pave(p, rect(-w / 2 - 0.3, -dp / 2 - 0.3, w / 2 + 0.3, dp / 2 + 0.3), { material: 'paving_travertine', lift: 0.06 });
  d.span('tufa', -w / 2 + 0.3, -0.2, -dp / 2 + 0.3, w / 2 - 0.3, 0.45, dp / 2 - 0.3, { collide: true });
  for (const [x, z, r] of [
    [-1.0, -0.6, 0.6],
    [0.9, 0.4, 0.7],
    [0.2, -0.8, 0.45],
  ] as const) d.ellipsoid('rock', x, 0.42, z, r, 0.22, r * 0.8);
  altar(d, 0, 0.45, 0.2, { w: 0.8, h: 0.8, mat: 'tufa' });
  // bronze railing round it
  const rail = { y: 0.06, h: 0.9, mat: 'bronze' as const, lattice: true };
  balustrade(d, -w / 2, -dp / 2, w / 2, -dp / 2, rail);
  balustrade(d, w / 2, -dp / 2, w / 2, dp / 2, rail);
  balustrade(d, w / 2, dp / 2, -w / 2, dp / 2, rail);
  balustrade(d, -w / 2, dp / 2, -w / 2, -dp / 2, rail);
  p.spot('volcanal', 'shrine', 0, ctx.groundAt(0, -dp / 2 - 0.9) + 0.06, -dp / 2 - 0.9, 0);
}

// ---------------------------------------------------------------- lacus curtius

function lacusCurtius(p: Part) {
  const { b, d, hi } = p;
  const h = 9 * p.S * 0.5;
  const out: V2[] = [
    [-h, -h],
    [h, -h],
    [h * 0.82, h],
    [-h * 0.82, h],
  ];
  pave(p, out, { material: 'marble_veined', lift: 0.09, cell: 2 });
  const y = 0.09;
  // parapet with an opening at the front
  balustrade(d, -h, -h, -0.7, -h, { y, h: 0.9 });
  balustrade(d, 0.7, -h, h, -h, { y, h: 0.9 });
  balustrade(d, h, -h, h * 0.82, h, { y, h: 0.9 });
  balustrade(d, h * 0.82, h, -h * 0.82, h, { y, h: 0.9 });
  balustrade(d, -h * 0.82, h, -h, -h, { y, h: 0.9 });
  // the old pit, now a well-head where coins are thrown
  d.cyl('marble', 0, y + 0.42, -0.2, 0.55, 0.84, hi ? 24 : 10, { collide: true });
  d.cyl('black', 0, y + 0.845, -0.2, 0.42, 0.01, hi ? 20 : 8);
  // the altar and the relief of Curtius at the back
  altar(d, -1.2, y, 1.3, { w: 0.8, h: 0.9 });
  d.box('marble', 0.9, y + 0.45, 1.75, 1.9, 0.9, 0.35, { collide: true });
  if (hi) panel(b, curtiusMaterial(), 1.5, 1.12, TRS(0.9, y + 0.9 + 0.62, 1.58, 0, 0, 0));
  d.box('marble', 0.9, y + 0.9 + 0.62, 1.72, 1.7, 1.3, 0.25);
  // the Naevius inscription: bronze letters set in the paving outside the enclosure
  if (hi) inscription(b, TRS(0, 0.075, -h - 1.2, Math.PI / 2, 0, 0), text('lacus-curtius-naevius'), 3.2, 0.5, 'bronze', { depth: 0.01 });
  // Marsyas, the satyr with the wineskin, symbol of civic liberty
  {
    const at = TRS(-h - 1.6, 0.06, -0.4, 0, 0.3, 0);
    const ph = pedestal(b, at, 0.9, 0.9, 1.2);
    figure(b, mul(at, T(0, ph, 0)), hi, 'bronze', 1.0, (s) => nudeMale(s, { right: 'raised', left: 'wineskin', satyr: true, belly: true, head: { beard: true } }));
  }
  // the sacred fig, olive and vine beside it
  plantTrees(p, [
    { species: 'fig', x: h + 1.8, z: 1.2, scale: 0.75 },
    { species: 'olive', x: h + 1.6, z: -1.8, scale: 0.7 },
  ]);
  {
    const vx = h + 2.2;
    for (const [x, z] of [
      [vx - 0.6, -0.5],
      [vx + 0.6, -0.5],
      [vx - 0.6, 0.0],
      [vx + 0.6, 0.0],
    ] as const) d.cyl('wood', x, 0.95, z, 0.05, 1.9, 6);
    d.box('wood', vx, 1.9, -0.25, 1.4, 0.06, 0.7);
    d.ellipsoid('foliage_broad', vx, 1.95, -0.25, 0.8, 0.25, 0.45);
    d.cyl('bark', vx, 0.95, -0.25, 0.05, 1.9, 5);
  }
  p.spot('lacus-curtius', 'shrine', 0, y, -h + 0.5, 0);
  p.spot('lacus-curtius-naevius', 'inscription', 0, 0.06, -h - 2.2, 0);
}

// ---------------------------------------------------------------- equus domitiani (empty site)

function equusSite(p: Part) {
  const { b, ctx } = p;
  const rngSlabs = ctx.rng.fork('slabs');
  const w = 12 * p.S;
  const dp = 6 * p.S;
  // newer paving of whiter marble, laid in a different bond from the square's travertine
  pave(p, rect(-w / 2 - 0.25, -dp / 2 - 0.25, w / 2 + 0.25, dp / 2 + 0.25), { material: 'paving_travertine', lift: 0.06 });
  const nx = 6;
  const nz = 3;
  const sw = w / nx;
  const sd = dp / nz;
  for (let i = 0; i < nx; i++)
    for (let j = 0; j < nz; j++) {
      const x = -w / 2 + (i + 0.5) * sw;
      const z = -dp / 2 + (j + 0.5) * sd;
      const g = ctx.groundAt(x, z);
      const hgt = 0.075 + rngSlabs.range(0, 0.025);
      const mat = rngSlabs.chance(0.25) ? 'marble_veined' : 'marble';
      b.add(prism(rect(x - sw / 2 + 0.015, z - sd / 2 + 0.015, x + sw / 2 - 0.015, z + sd / 2 - 0.015), g - 0.05, g + hgt), mat);
    }
  // one slab sits loose and askew: something is hidden under it
  const lx = w / 2 - sw / 2;
  const lz = dp / 2 - sd / 2;
  const g = ctx.groundAt(lx, lz);
  b.add(prism(rect(lx - sw / 2 + 0.05, lz - sd / 2 + 0.05, lx + sw / 2 - 0.05, lz + sd / 2 - 0.05), g + 0.06, g + 0.13), 'marble_veined', TRS(0, 0, 0, 0, 0.0, 0.02));
  p.spot('equus-domitiani-cache', 'container', lx, g + 0.12, lz - sd, 0);
  p.spot('equus-domitiani-site', 'vista', 0, g + 0.1, -dp / 2 - 1.5, 0);
}

// ---------------------------------------------------------------- venus cloacina

function cloacina(p: Part) {
  const { b, d, hi } = p;
  const seg = hi ? 36 : 14;
  // a low round platform of two steps
  d.cyl('travertine', 0, 0.1, 0, 1.65, 0.2, seg, { collide: true });
  d.cyl('marble', 0, 0.3, 0, 1.4, 0.2, seg, { collide: true });
  const y = 0.4;
  // the round balustrade: marble posts with bronze lattice, open at the front
  const n = 10;
  const pts = ring(1.25, n, Math.PI / n);
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const c = pts[(i + 1) % n];
    const mid = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
    if (mid[1] < -1.0) continue; // the entrance faces the square
    balustrade(d, a[0], a[1], c[0], c[1], { y, h: 1.0, lattice: true, post: 0.9 });
  }
  // the two cult statues of Venus Cloacina on a shared base
  d.box('marble', 0, y + 0.3, 0.3, 1.3, 0.6, 0.7, { collide: true });
  for (const sx of [-1, 1]) {
    figure(b, TRS(sx * 0.33, y + 0.6, 0.3, 0, 0, 0), hi, 'marble', 0.82, (s) => drapedFemale(s, { right: sx < 0 ? 'patera' : 'breast', left: 'mantle', plinth: false, head: { crown: 'diadem' } }));
  }
  // the grate over the Cloaca Maxima behind the shrine
  const gz = 2.6;
  d.box('black', 0, 0.02, gz, 1.2, 0.04, 0.9);
  d.box('travertine', 0, 0.08, gz, 1.5, 0.08, 1.2);
  d.box('black', 0, 0.1, gz, 1.1, 0.06, 0.8);
  for (let i = 0; i < 7; i++) d.box('iron', -0.48 + i * 0.16, 0.14, gz, 0.04, 0.04, 0.84);
  d.box('iron', 0, 0.14, gz - 0.3, 1.1, 0.04, 0.05).box('iron', 0, 0.14, gz + 0.3, 1.1, 0.04, 0.05);
  p.spot('shrine-venus-cloacina', 'shrine', 0, 0.06, -2.2, 0);
  p.spot('cloaca-maxima-grate', 'door', 0, 0.12, gz - 0.9, 0);
}

// ---------------------------------------------------------------- lacus servilius

function servilius(p: Part) {
  const { b, d, hi } = p;
  const w = 4 * p.S + 0.6;
  const dp = 3 * p.S + 0.4;
  const t = 0.18;
  // marble basin
  d.span('marble', -w / 2, 0, -dp / 2, w / 2, 0.75, -dp / 2 + t, { collide: true });
  d.span('marble', -w / 2, 0, dp / 2 - t, w / 2, 0.75, dp / 2, { collide: true });
  d.span('marble', -w / 2, 0, -dp / 2, -w / 2 + t, 0.75, dp / 2, { collide: true });
  d.span('marble', w / 2 - t, 0, -dp / 2, w / 2, 0.75, dp / 2, { collide: true });
  d.span('marble', -w / 2 + t, 0, -dp / 2 + t, w / 2 - t, 0.1, dp / 2 - t);
  d.span('water', -w / 2 + t, 0.5, -dp / 2 + t, w / 2 - t, 0.58, dp / 2 - t);
  // Agrippa's bronze hydra on a pillar at the back
  const px = 0;
  const pz = dp / 2 - 0.35;
  d.box('marble', px, 0.6, pz, 0.6, 1.2, 0.5, { collide: true });
  const body: THREE.Vector3[] = [];
  for (let i = 0; i <= 16; i++) {
    const a = i * 0.75;
    const r = 0.26 - i * 0.008;
    body.push(new THREE.Vector3(px + Math.sin(a) * r, 1.24 + i * 0.03, pz + Math.cos(a) * r));
  }
  b.add(tube(body, 0.07, hi ? 8 : 5), 'bronze');
  const heads = hi ? 7 : 4;
  for (let i = 0; i < heads; i++) {
    const a = -1.2 + (2.4 * i) / (heads - 1);
    const base = new THREE.Vector3(px, 1.55, pz);
    const mid = new THREE.Vector3(px + Math.sin(a) * 0.3, 1.85 + (i % 2) * 0.1, pz - 0.15 - Math.cos(a) * 0.12);
    const tip = new THREE.Vector3(px + Math.sin(a) * 0.48, 1.7 + (i % 2) * 0.12, pz - 0.38 - Math.cos(a) * 0.15);
    b.add(tube([base, mid, tip], (k) => 0.05 - k * 0.012, hi ? 6 : 4), 'bronze');
    d.ellipsoid('bronze', tip.x, tip.y, tip.z, 0.06, 0.045, 0.09, { seg: [8, 6] });
    if (i % 2 === 0) d.rod('water', { x: tip.x, y: tip.y - 0.02, z: tip.z - 0.06 }, { x: tip.x * 0.9, y: 0.56, z: tip.z - 0.3 }, 0.018, 5);
  }
  p.spot('lacus-servilius', 'shrine', 0, 0.06, -dp / 2 - 0.8, 0);
  p.spot('lacus-servilius-water', 'npc', w / 2 + 0.6, 0.06, 0, -Math.PI / 2);
}

// ---------------------------------------------------------------- janus geminus

function janus(p: Part) {
  const { b, d, hi } = p;
  const W = 4 * p.S;
  const L = 7 * p.S;
  const H = 2.95;
  const t = 0.16;
  const mat = 'bronze' as const;
  // stepped travertine base
  d.span('travertine', -W / 2 - 0.35, 0, -L / 2 - 0.35, W / 2 + 0.35, 0.16, L / 2 + 0.35, { collide: true });
  const y0 = 0.16;
  // side walls with a lattice window in each, between pilasters
  for (const sx of [-1, 1]) {
    const x = sx * (W / 2 - t / 2);
    d.box(mat, x, y0 + H / 2, 0, t, H, L, { collide: true });
    if (hi) {
      for (const zz of [-L / 2 + 0.12, L / 2 - 0.12, 0]) d.box(mat, x + sx * 0.06, y0 + H / 2, zz, 0.06, H, 0.22);
      d.box('black', x + sx * 0.085, y0 + 1.9, 0, 0.01, 0.6, L * 0.5);
      for (let i = -3; i <= 3; i++) d.box(mat, x + sx * 0.095, y0 + 1.9, i * (L * 0.07), 0.02, 0.6, 0.03, { rx: 0.0, ry: 0, rz: 0 });
      for (const yy of [1.65, 1.9, 2.15]) d.box(mat, x + sx * 0.095, y0 + yy, 0, 0.02, 0.03, L * 0.5);
    }
  }
  // lintels and a cornice round the top, a flat bronze roof
  for (const sz of [-1, 1]) {
    d.box(mat, 0, y0 + H - 0.25, sz * (L / 2 - 0.1), W, 0.5, 0.2);
    // the double doors stand OPEN (Rome is going to war): leaves swung outward against the walls
    for (const sx of [-1, 1]) {
      const lw = W / 2 - t - 0.02;
      const hx = sx * (W / 2 - t);
      const phi = 1.75;
      const cx = hx - sx * Math.cos(phi) * (lw / 2);
      const cz = sz * (L / 2 + Math.sin(phi) * (lw / 2));
      d.box(mat, cx, y0 + (H - 0.5) / 2, cz, lw, H - 0.52, 0.06, { ry: sx * sz * phi });
    }
  }
  d.box(mat, 0, y0 + H + 0.12, 0, W + 0.3, 0.24, L + 0.3);
  d.box(mat, 0, y0 + H + 0.3, 0, W + 0.1, 0.12, L + 0.1);
  // two-faced Janus on a low base inside
  d.box('marble', 0, y0 + 0.25, 0, 0.55, 0.5, 0.55, { collide: true });
  figure(b, T(0, y0 + 0.5, 0), hi, 'bronze', 1.0, (s) => nudeMale(s, { right: 'spear', left: 'down', cloak: true, plinth: false, head: { janus: true, beard: true } }));
  p.spot('janus-geminus', 'shrine', 0, y0, -L / 2 - 1.0, 0);
}

// ---------------------------------------------------------------- builders

export const builders: LandmarkBuilder[] = [
  {
    handles: ['miliarium-aureum'],
    build: (ctx) =>
      landmark(
        ctx,
        (p) => {
          miliarium(p);
          forumSquare(p);
        },
        { near: 170 },
      ),
  },
  { handles: ['rostra'], build: (ctx) => landmark(ctx, rostra, { near: 130 }) },
  { handles: ['umbilicus-urbis'], build: (ctx) => landmark(ctx, umbilicus, { cull: 320 }) },
  { handles: ['comitium-lapis-niger'], build: (ctx) => landmark(ctx, lapisNiger, { cull: 260 }) },
  { handles: ['volcanal'], build: (ctx) => landmark(ctx, volcanal, { cull: 260 }) },
  { handles: ['lacus-curtius'], build: (ctx) => landmark(ctx, lacusCurtius, { cull: 240 }) },
  { handles: ['equus-domitiani-site'], build: (ctx) => landmark(ctx, equusSite, { cull: 260 }) },
  { handles: ['shrine-venus-cloacina'], build: (ctx) => landmark(ctx, cloacina, { cull: 220 }) },
  { handles: ['lacus-servilius'], build: (ctx) => landmark(ctx, servilius, { cull: 300 }) },
  { handles: ['janus-geminus'], build: (ctx) => landmark(ctx, janus, { cull: 300 }) },
];
