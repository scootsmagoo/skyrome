/**
 * Forum Holitorium: the riverside vegetable market outside the Carmental Gate, its three
 * Republican temples in a row facing the market (Janus — Ionic, Juno Sospita — Ionic hexastyle,
 * Spes — Doric in travertine), and the Columna Lactaria where infants are left and wet-nurses
 * hired.
 */
import * as THREE from 'three';
import { T } from '../../../arch/common/geom';
import { inscriptionPanel, paintedSign } from '../../../arch/common/inscription';
import type { V2 } from '../../../arch/common/geom';
import { buildPlaza, lacus, velum } from '../../../arch/fabric';
import { placeProp } from '../../../arch/props';
import type { MaterialId } from '../../../gfx/materialIds';
import type { TempleSpec } from '../../../arch/classical/temple';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { altar, draw, fittedTemple, footprintLocal, friezeInscription, insideAny, neighbourFootprints, riverEnv, roadCorridors, spot } from './river-kit';

// ------------------------------------------------------------------ the three temples

interface TrioSpec {
  spec: TempleSpec;
  frieze: string[];
  altarMat: MaterialId;
}

const TRIO: Record<string, TrioSpec> = {
  // Duilius' temple (260 BC), restored by Tiberius and dedicated by Germanicus in AD 17.
  'temple-janus-holitorium': {
    spec: { order: 'ionic', plan: 'peripteral', front: 6, material: 'plaster_white', cellaMaterial: 'plaster_white', podiumMaterial: 'travertine', roofMaterial: 'roof_tile', fluted: false },
    frieze: ['IANO', 'TI·CAESAR·AVGVSTVS·RESTITVIT'],
    altarMat: 'travertine',
  },
  // The largest of the three (194 BC): Ionic hexastyle peripteral, stuccoed peperino.
  'temple-juno-sospita': {
    spec: { order: 'ionic', plan: 'peripteral', front: 6, material: 'plaster_cream', cellaMaterial: 'plaster_cream', podiumMaterial: 'peperino', roofMaterial: 'roof_tile', fluted: true },
    frieze: ['IVNONI·SOSPITAE·MATRI·REGINAE'],
    altarMat: 'peperino',
  },
  // Spes (258 BC; restored AD 17): Doric peripteral in travertine and peperino.
  'temple-spes': {
    spec: { order: 'doric', plan: 'peripteral', front: 6, material: 'travertine', cellaMaterial: 'peperino', podiumMaterial: 'peperino', roofMaterial: 'roof_tile', fluted: true },
    frieze: ['SPEI', 'TI·CAESAR·AVGVSTVS·RESTITVIT'],
    altarMat: 'travertine',
  },
};

function trioTemple(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const t = TRIO[lm.id];
  const b = ctx.builder();
  const gl = ctx.groundAt;
  const fp = lm.footprint as { w: number; d: number };
  // M fidelity (GDD §12.1): low-detail columns keep the three side by side affordable.
  const { L, dz, front } = fittedTemple(ctx, b, { ...t.spec, width: fp.w * S * 0.94, podiumHeight: 3.2 * S, detail: 'low' }, fp.d * S - 2.2);
  friezeInscription(b, L, dz, t.frieze);
  const d = draw(b);
  // Altar in front of the steps, on the market.
  const za = front - 1.6;
  altar(d.at(0, gl(0, za), za), 1.3, 0.9, 1.05, t.altarMat);
  const spots: Spot[] = [
    spot(`${lm.id}:altar`, 'shrine', 0, gl(0, za - 1.4), za - 1.4, 0),
    spot(`${lm.id}:steps`, 'sit', (L.stairs.x0 + L.stairs.x1) / 2 + 0.8, L.stairs.rise * 2, L.stairs.z0 + dz + L.stairs.run * 2.5, Math.PI),
    spot(`${lm.id}:dedication`, 'inscription', 0, 0, front - 4, 0),
  ];
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

// ------------------------------------------------------------------ the market

function forumHolitorium(ctx: LandmarkContext) {
  const { S, lm, rng } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const d = draw(b);
  const fp = lm.footprint as { w: number; d: number };
  const W = fp.w * S;
  const D = fp.d * S;
  const gl = (x: number, z: number) => ctx.groundAt(x, z) + 0.1; // on the paving
  // Paved square minus the neighbours' footprints (temples, gate, Sant'Omobono) and the streets.
  const nb = neighbourFootprints(ctx, env, { grow: 2.5, skip: ['columna-lactaria'] });
  const roads = roadCorridors(ctx, env, 0.6);
  const square: V2[] = [[-W / 2, -D / 2], [W / 2, -D / 2], [W / 2, D / 2], [-W / 2, D / 2]];
  buildPlaza(b, square, (x, z) => ctx.groundAt(x, z), { material: 'paving_travertine', exclude: [...nb.map((n) => n.poly), ...roads], collide: true, lift: 0.1, cell: 2 });
  const blocked = [...nb.map((n) => n.poly), ...roads];
  const lac = footprintLocal(env, { center: [-335, 160], rotation: 73, footprint: { kind: 'rect', w: 9, d: 9 } });
  blocked.push(lac);
  const free = (x: number, z: number, r = 2.2) => {
    if (Math.abs(x) > W / 2 - r || Math.abs(z) > D / 2 - r) return false;
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * Math.PI * 2;
      if (insideAny(x + Math.cos(a) * r, z + Math.sin(a) * r, blocked)) return false;
    }
    return !insideAny(x, z, blocked);
  };
  const spots: Spot[] = [];
  // Rows of greengrocers' stalls under striped awnings, facing the aisles between them.
  const kinds = ['stall_fruit', 'stall_fruit', 'stall_fruit', 'stall_pottery', 'stall_cloth'] as const;
  const awnings: [MaterialId, MaterialId][] = [['fabric_white', 'fabric_red'], ['fabric_white', 'fabric_ochre'], ['fabric_white', 'fabric_blue']];
  let n = 0;
  const maxStalls = hi ? 16 : 8;
  for (let row = -1; row <= 1 && n < maxStalls; row++) {
    const z = row * 8.5;
    for (let x = -W / 2 + 5; x <= W / 2 - 5 && n < maxStalls; x += 6.2) {
      const xx = x + rng.range(-0.6, 0.6);
      if (!free(xx, z)) continue;
      const face = row === 0 ? (n % 2 ? 0 : Math.PI) : row < 0 ? Math.PI : 0; // toward the aisles
      const s = d.at(xx, gl(xx, z), z, face);
      placeProp(s, kinds[n % kinds.length], 0, 0, 0, 0, { variant: n % 3 });
      if (hi && n % 2 === 0) velum(s.at(0, 0, 1.0), 3.0, 2.4, 2.5, awnings[n % awnings.length]);
      // Baskets and sacks of produce around the stall.
      for (let k = 0; k < (hi ? 3 : 1); k++) placeProp(s, k % 2 ? 'basket' : 'sack', rng.range(-1.4, 1.4), 0, rng.range(0.9, 1.6), rng.range(0, 6), { variant: k % 3, collide: false });
      spots.push(spot(`forum-holitorium:stall-${n}`, 'stall', xx, gl(xx, z), z + (face === 0 ? 0.9 : -0.9), face + Math.PI));
      n++;
    }
  }
  // The aediles' table of standard measures (mensa ponderaria): a stone slab with hollows.
  const mp = findFree(free, [[W * 0.32, -D * 0.36], [W * 0.38, D * 0.32], [-W * 0.3, -D * 0.36], [0, -D * 0.4]]);
  if (mp) {
    const m = d.at(mp[0], gl(mp[0], mp[1]), mp[1]);
    m.span('travertine', -1.3, 0, -0.45, 1.3, 0.12, 0.45);
    m.span('travertine', -1.1, 0.12, -0.3, -0.7, 0.85, 0.3, { collide: true });
    m.span('travertine', 0.7, 0.12, -0.3, 1.1, 0.85, 0.3, { collide: true });
    m.span('travertine', -1.35, 0.85, -0.5, 1.35, 1.05, 0.5, { collide: true });
    [-0.9, -0.35, 0.2, 0.75].forEach((x, i) => m.cyl('black', x, 1.051, 0, 0.12 + i * 0.03, 0.005, 10, { shadow: false }));
    inscriptionPanel(b, { lines: ['MENSA·PONDERARIA', 'AED·CVR'], width: 1.4, height: 0.32, style: 'carved' }, T(mp[0], gl(mp[0], mp[1]) + 0.95, mp[1] - 0.51), { depth: 0.01 });
    spots.push(spot('forum-holitorium:mensa-ponderaria', 'vendor', mp[0], gl(mp[0], mp[1]), mp[1] + 1.1, Math.PI));
    spots.push(spot('forum-holitorium:measures', 'inscription', mp[0], gl(mp[0], mp[1]), mp[1] - 1.3, 0));
  }
  // A public fountain (lacus) for the market.
  const lp = findFree(free, [[-W * 0.38, D * 0.3], [W * 0.4, -D * 0.1], [-W * 0.4, -D * 0.1]]);
  if (lp) {
    const ls = lacus(d.at(lp[0], gl(lp[0], lp[1]), lp[1]), rng, { stone: 'travertine' });
    ls.forEach((p, i) => spots.push(spot(`forum-holitorium:fountain-${i}`, 'npc', lp[0] + p.x, gl(lp[0], lp[1]), lp[1] + p.z, p.facing)));
  }
  // Painted notice: an aedile's edict on prices by the market's north corner.
  const np = findFree(free, [[-W * 0.42, -D * 0.4], [W * 0.42, -D * 0.4]]);
  if (np) {
    const y = gl(np[0], np[1]);
    d.span('wood_dark', np[0] - 0.06, y, np[1] - 0.06, np[0] + 0.06, y + 2.2, np[1] + 0.06, { collide: true });
    paintedSign(b, ['EDICTVM AEDILIVM', 'DE PRETIIS OLERVM'], 1.4, 0.8, T(np[0], y + 1.6, np[1] - 0.08));
    spots.push(spot('forum-holitorium:edict', 'inscription', np[0], y, np[1] - 1.2, 0));
  }
  // A strongbox of a stall-holder (owned: theft) by an amphora stack.
  const cp = findFree(free, [[W * 0.42, D * 0.38], [-W * 0.1, D * 0.4]]);
  if (cp) {
    const s = d.at(cp[0], gl(cp[0], cp[1]), cp[1]);
    placeProp(s, 'amphora_stack', 0, 0, 0, 0.4, { variant: 1 });
    placeProp(s, 'crate', 1.3, 0, 0.2, 0.2, { variant: 0 });
    spots.push(spot('forum-holitorium:strongbox', 'container', cp[0] + 1.3, gl(cp[0], cp[1]), cp[1] - 0.6, 0));
  }
  spots.push(spot('forum-holitorium:centre', 'spawn', 0, gl(0, 0), 0, 0));
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

function findFree(free: (x: number, z: number, r?: number) => boolean, cands: [number, number][]): [number, number] | null {
  for (const c of cands) if (free(c[0], c[1], 2.4)) return c;
  return null;
}

// ------------------------------------------------------------------ Columna Lactaria

function columnaLactaria(ctx: LandmarkContext) {
  const { lm } = ctx;
  const b = ctx.builder();
  const d = draw(b);
  const hi = ctx.detail === 'high';
  // A plain column on a worn, stepped base, stained where milk is poured; votive jugs, a basket.
  d.span('tufa', -0.95, 0, -0.95, 0.95, 0.32, 0.95, { collide: true });
  d.span('travertine', -0.72, 0.32, -0.72, 0.72, 0.62, 0.72, { collide: true });
  d.cyl('travertine', 0, 0.66, 0, 0.36, 0.08, 14);
  d.cyl('travertine', 0, 0.7 + 1.45, 0, 0.27, 2.9, hi ? 14 : 8, { rTop: 0.235, collide: true });
  d.cyl('travertine', 0, 3.67, 0, 0.25, 0.14, 14, { rTop: 0.32 });
  d.span('travertine', -0.36, 3.74, -0.36, 0.36, 3.86, 0.36);
  // Milk stains down the base (lighter streaks) and the offerings.
  d.span('plaster_white', -0.2, 0.33, -0.725, 0.12, 0.6, -0.72, { shadow: false });
  for (const [x, z, s] of [[0.5, -0.5, 1], [-0.45, -0.55, 0.8], [0.55, 0.45, 0.9]] as const) d.ellipsoid('terracotta', x, 0.62 + 0.1 * s, z, 0.08 * s, 0.11 * s, 0.08 * s, { seg: [8, 6] });
  placeProp(d, 'basket', 0.2, 0.32, -0.95, 0.3, { variant: 2, collide: false });
  inscriptionPanel(b, { lines: ['COLVMNA', 'LACTARIA'], width: 0.9, height: 0.3, style: 'carved', ground: '#d8ccb2' }, T(0, 0.47, -0.725), { depth: 0.01, bodyMaterial: 'travertine' });
  const spots: Spot[] = [
    spot('columna-lactaria:offering', 'shrine', 0, 0, -1.6, 0),
    spot('columna-lactaria:nutrix-0', 'npc', -1.6, 0, -0.8, Math.PI / 2 + 0.4),
    spot('columna-lactaria:nutrix-1', 'npc', 1.5, 0, 0.9, -Math.PI / 2 - 0.3),
    spot('columna-lactaria:inscription', 'inscription', 0.3, 0, -1.4, 0),
  ];
  void THREE;
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-janus-holitorium', 'temple-juno-sospita', 'temple-spes'], build: trioTemple },
  { handles: ['forum-holitorium'], build: forumHolitorium },
  { handles: ['columna-lactaria'], build: columnaLactaria },
];
