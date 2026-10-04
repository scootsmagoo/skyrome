/**
 * Circus Maximus, Trajan's stone rebuild (dedicated AD 103), in its local frame (see circusLayout).
 *
 * - Stands: podium and balustrade, a marble lower tier (senators' terrace and six rows), a
 *   praecinctio, a travertine upper tier (eight rows), a second walkway and a roofed timber gallery
 *   at the top, all swept round the ring. Aisles (0.2 m half-steps) and balteus flights make every
 *   level walkable. Gaps are left for the entrance tunnels, the pulvinar, the Temple of Sol and the
 *   Arch of Titus passage (those are built by their own landmark builders).
 * - Facade: three storeys of arcades (Tuscan half-columns, Ionic on pedestals, a Corinthian attic)
 *   instanced round the whole ring, with shops (tabernae) in the ground-storey arches.
 * - Six vaulted entrance tunnels to the track, each with a vomitorium stair to the first walkway.
 * - Track: sand draped over the ground; the spina, carceres and metae are in circusParts.ts.
 */
import * as THREE from 'three';
import { Draw } from '../../../../arch/fabric/draw';
import { paintedSign } from '../../../../arch/common/inscription';
import { velum } from '../../../../arch/fabric/awnings';
import { placeProp } from '../../../../arch/props/props';
import { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import type { LandmarkContext } from '../../types';
import {
  CIRCUS,
  carceresFront,
  channelGap,
  circusSection,
  curveZ,
  carceresFaceBays,
  facadeBays,
  ringPoint,
  stationAtZ,
  stations,
  aisleStations,
  totalStations,
  type CircusSection,
  type FacadeBay,
  type Interval,
} from './circusLayout';
import { relById, relLocal } from './frames';
import { buildPlaza } from '../../../../arch/fabric/streets';
import { LANDMARK_BY_ID, ROADS } from '../../../../data/atlas';
import type { LandmarkData } from '../../types';
import { bandColliders, cutFace, cutting, pieces, riser, ringFrame, ringStrip, tread, type RingGap } from './ring';
import { InstanceLod, facing, instanced } from './runtime';
import { archBandLite, archDoorWall, rectHoleWall } from './shapes';
import { Spots, halfColumn, lowColumn } from './util';

const T = CIRCUS.wall;
const STONE: MaterialId = 'travertine';

// ---------------------------------------------------------------- gaps

export interface CircusGaps {
  ring: RingGap[];
  /** Tunnel stations (centre) with their side (+1 Palatine / −1 Aventine). */
  tunnels: { s: number; z: number; side: 1 | -1 }[];
  /** Arch of Titus channel (x range, local). */
  channel: [number, number];
  /** Pulvinar and Temple of Sol slots: z range on their straight. */
  pulvinar: [number, number];
  sol: [number, number];
}

/** Tunnel z positions (centres) per side; snapped to facade bay centres. */
const TUNNELS_Z: Record<1 | -1, number[]> = { 1: [-118, 20, 104], [-1]: [-118, -4, 96] };

let gapsCache: CircusGaps | null = null;
export function circusGaps(): CircusGaps {
  if (gapsCache) return gapsCache;
  const sec = circusSection();
  const w1 = sec.walks[0];
  const inner = CIRCUS.halfW - CIRCUS.track - T;
  // Facade bay centres on the straights (shared with facadeBays()).
  const zs0 = -CIRCUS.halfLen;
  const n = Math.round((curveZ() - zs0) / CIRCUS.bay);
  const bw = (curveZ() - zs0) / n;
  const snap = (z: number) => zs0 + (Math.round((z - zs0) / bw - 0.5) + 0.5) * bw;
  const tunnels: CircusGaps['tunnels'] = [];
  for (const side of [1, -1] as const) for (const z of TUNNELS_Z[side]) tunnels.push({ s: stationAtZ(snap(z), side), z: snap(z), side });
  const ring: RingGap[] = [];
  const hw = CIRCUS.tunnelW / 2;
  for (const t of tunnels) ring.push({ kind: 'tunnel', at: () => [t.s - hw, t.s + hw], uMin: 0, uMax: w1.u0 });
  // Pulvinar and Temple of Sol: slots through the upper stands, from the first balteus wall back.
  const pul = relById('circus-maximus', 'pulvinar');
  const pulHalf = (25 * 0.6) / 2;
  const pulvinar: [number, number] = [pul.z - pulHalf - 0.3, pul.z + pulHalf + 0.3];
  const sol = relById('circus-maximus', 'temple-sol-circus');
  const solHalf = (12 * 0.6) / 2;
  const solZ: [number, number] = [sol.z - solHalf - 0.4, sol.z + solHalf + 0.4];
  ring.push({ kind: 'temple', at: () => [stationAtZ(pulvinar[0], 1), stationAtZ(pulvinar[1], 1)], uMin: w1.u1, uMax: inner });
  ring.push({ kind: 'temple', at: () => [stationAtZ(solZ[1], -1), stationAtZ(solZ[0], -1)], uMin: w1.u1, uMax: inner });
  // Arch of Titus channel through the curved end.
  const arch = relById('circus-maximus', 'arch-titus-circus');
  const halfArch = (17 * 0.6) / 2 + 0.4;
  const channel: [number, number] = [arch.x - halfArch, arch.x + halfArch];
  ring.push({
    kind: 'open',
    at: (u: number) => channelGap(channel[0], channel[1], u) ?? [0, 0],
    uMin: 0,
    uMax: inner,
  });
  gapsCache = { ring, tunnels, channel, pulvinar, sol: solZ };
  return gapsCache;
}

// ---------------------------------------------------------------- stands

function buildStands(b: MeshBuilder, sec: CircusSection, gaps: CircusGaps, detail: 'high' | 'low') {
  const G = gaps.ring;
  const inner = sec.band - T;
  // Podium wall + balustrade, terrace.
  riser(b, 'marble', G, 0, 0, sec.podium + 1.0, 'in');
  tread(b, 'marble', G, 0, sec.terrace[0], sec.podium + 1.0);
  riser(b, 'marble', G, sec.terrace[0], sec.podium, sec.podium + 1.0, 'out');
  tread(b, 'marble', G, sec.terrace[0], sec.terrace[1], sec.podium);
  // Rows.
  for (const r of sec.rows) {
    const seat: MaterialId = r.tier === 1 ? 'marble' : STONE;
    riser(b, r.tier === 1 ? 'marble' : STONE, G, r.u0, r.prevY, r.y, 'in');
    tread(b, seat, G, r.u0, r.u1, r.y);
  }
  // Walkways with their balteus walls and ledges.
  for (const w of sec.walks) {
    tread(b, 'paving_travertine', G, w.u0, w.u1, w.y);
    riser(b, 'marble', G, w.u1, w.y, w.y1, 'in');
    tread(b, 'marble', G, w.u1, w.u2, w.y1);
  }
  // Gallery floor (timber), its colonnade beam and lean-to roof.
  const g = sec.gallery;
  tread(b, 'wood', G, g.u0, g.u1, g.y);
  const beamY0 = g.y + g.colH;
  const beamY1 = g.eaveY;
  const u0 = g.colU - 0.3;
  riser(b, 'marble', G, u0, beamY0, beamY1, 'in');
  tread(b, 'marble', G, u0, inner, beamY0, 'down');
  // The gallery's back wall: plastered, with a red dado (it hides the facade's inner openings).
  riser(b, 'plaster_red', G, inner - 0.01, g.y, g.y + 1.25, 'in');
  riser(b, 'plaster_cream', G, inner - 0.01, g.y + 1.25, CIRCUS.height - 0.6, 'in');
  const roofHigh = CIRCUS.height - 0.7;
  const gr = cutting(G, u0, inner);
  ringStrip(b, 'roof_tile', u0 - 0.25, beamY1, inner, roofHigh, pieces(gr, u0 - 0.25), pieces(gr, inner), 'auto');
  ringStrip(b, 'wood_dark', u0, beamY1 - 0.12, inner, roofHigh - 0.15, pieces(gr, u0), pieces(gr, inner), 'down');
  // Cut faces at every gap edge.
  const outline: [number, number][] = [[0, 0], [0, sec.podium + 1.0], [sec.terrace[0], sec.podium + 1.0], [sec.terrace[0], sec.podium], ...sec.outline.slice(2)];
  for (const gap of G) {
    for (const edge of [0, 1] as const) cutFace(b, gap.kind === 'temple' ? 'concrete' : STONE, outline, gap, edge);
  }
  // Colliders: every tread is a solid band from the ground (or the shop ceiling, or the tunnel
  // ceiling) up to its surface.
  const lifts = gaps.tunnels.map((t) => ({ at: [t.s - CIRCUS.tunnelW / 2 - 0.05, t.s + CIRCUS.tunnelW / 2 + 0.05] as Interval, y: CIRCUS.tunnelH + 0.3 }));
  const band = (ua: number, ub: number, top: number) => {
    if (ub <= CIRCUS.shopBack + 1e-3) bandColliders(b, G, ua, ub, top, 0, ua >= sec.walks[0].u0 - 1e-3 ? lifts : []);
    else if (ua >= CIRCUS.shopBack - 1e-3) bandColliders(b, G, ua, ub, top, CIRCUS.shopCeiling, lifts);
    else {
      bandColliders(b, G, ua, CIRCUS.shopBack, top, 0, ua >= sec.walks[0].u0 - 1e-3 ? lifts : []);
      bandColliders(b, G, CIRCUS.shopBack, ub, top, CIRCUS.shopCeiling, lifts);
    }
  };
  band(0, sec.terrace[0], sec.podium + 1.0);
  band(sec.terrace[0], sec.terrace[1], sec.podium);
  for (const r of sec.rows) band(r.u0, r.u1, r.y);
  for (const w of sec.walks) {
    band(w.u0, w.u1, w.y);
    band(w.u1, w.u2, w.y1);
  }
  band(g.u0, g.u1, g.y);
  // Gallery colonnade: low-poly columns instanced round the ring.
  return { colU: g.colU, colY: g.y, colH: g.colH, detail };
}

/** Stations of objects spaced ~`spacing` apart along the ring at offset u (skipping gaps that cut it). */
function ringStations(G: RingGap[], u: number, spacing: number, margin = 0.6): number[] {
  const out: number[] = [];
  const st = stations();
  const k = (CIRCUS.track + u) / CIRCUS.track; // arc length per station on the curve
  for (const [p0, p1] of pieces(cutting(G, u, u), u)) {
    // Split the piece into straight and curved runs and space objects evenly in each.
    const cuts = [p0, p1, st.curveStart, st.curveEnd].filter((s) => s >= p0 && s <= p1).sort((a, b) => a - b);
    for (let i = 0; i < cuts.length - 1; i++) {
      const a = cuts[i], c = cuts[i + 1];
      const curve = (a + c) / 2 > st.curveStart && (a + c) / 2 < st.curveEnd;
      const len = (c - a) * (curve ? k : 1);
      const m0 = a === p0 ? margin : 0;
      const m1 = c === p1 ? margin : 0;
      const L = len - m0 - m1;
      if (L <= 0.1) continue;
      const n = Math.max(1, Math.round(L / spacing));
      for (let j = 0; j <= n; j++) {
        if (j === 0 && a !== p0 && out.length) continue; // shared run boundary
        out.push(a + (m0 + (L * j) / n) / (curve ? k : 1));
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------- aisles

function buildAisles(b: MeshBuilder, sec: CircusSection, gaps: CircusGaps, detail: 'high' | 'low') {
  const allGaps: Interval[] = gaps.ring.map((g) => g.at(0));
  for (const g of gaps.ring) if (g.kind === 'temple') allGaps.push(g.at(sec.walks[0].u1));
  const list = aisleStations(19, allGaps, 3);
  const W = 1.1;
  for (const s of list) {
    const F = ringFrame(s, 0);
    const d = new Draw(b, F);
    const step = (ua: number, ub: number, y0: number, y1: number, mat: MaterialId) => {
      if (detail === 'high') d.box(mat, 0, (y0 + y1) / 2, (ua + ub) / 2, W, y1 - y0, ub - ua);
      d.solid(-W / 2, y0, ua, W / 2, y1, ub);
    };
    // Terrace → first row, then a half-step in front of every row.
    for (const r of sec.rows) {
      const mid = (r.prevY + r.y) / 2;
      step(r.u0 - 0.35, r.u0 + 0.01, r.prevY, mid, r.tier === 1 ? 'marble' : STONE);
    }
    // Flights of four 0.2 m steps up each balteus wall.
    for (const w of sec.walks) {
      const n = Math.round((w.y1 - w.y) / 0.2);
      for (let k = 1; k <= n; k++) step(w.u1 - (n - k + 1) * 0.34, w.u1 + 0.01, w.y, w.y + ((w.y1 - w.y) * k) / n, 'marble');
    }
  }
  return list;
}

// ---------------------------------------------------------------- tunnels

function buildTunnels(b: MeshBuilder, sec: CircusSection, gaps: CircusGaps) {
  const w1 = sec.walks[0];
  const inner = sec.band - T;
  const hw = CIRCUS.tunnelW / 2;
  const H = CIRCUS.tunnelH;
  for (const t of gaps.tunnels) {
    // Frame at the tunnel centre on the track edge: +z outward, x along −tangent.
    const d = new Draw(b, ringFrame(t.s, 0));
    // Side walls of the covered part (under the upper stands and the shops).
    for (const sx of [-1, 1]) {
      d.span(STONE, sx * hw, 0, w1.u0, sx * (hw + 0.4), H, inner, { collide: true });
    }
    // Vault (flat soffit with a coffered look: two slabs) and the lintel over the inner mouth.
    d.span('concrete', -hw - 0.4, H, w1.u0, hw + 0.4, H + 0.3, inner);
    d.span(STONE, -hw, H, w1.u0 - 0.02, hw, w1.y, w1.u0 + 0.35);
    // Paving through the passage.
    d.span('paving_travertine', -hw, -0.05, -0.2, hw, 0.03, inner + T);
    // Vomitorium stair along the left wall of the open cut: track level → first walkway.
    const n = Math.ceil(w1.y / 0.225);
    const rise = w1.y / n;
    const run = Math.min(0.34, (w1.u0 - 0.05) / n);
    for (let k = 1; k <= n; k++) {
      const y = rise * k;
      const z0 = w1.u0 - (n - k + 1) * run;
      d.span(k % 2 ? STONE : 'marble', -hw, 0, z0, -hw + 1.0, y, w1.u0, { collide: true });
    }
    // Parapet on the open side of the stair and on the cut edges above the seats.
    d.span(STONE, -hw + 1.0, 0, 0.2, -hw + 1.18, 0.9, 0.5);
    for (const sx of [-1, 1]) {
      for (const r of sec.rows.filter((rr) => rr.tier === 1)) {
        d.span('marble', sx * (hw + 0.02), r.y, r.u0, sx * (hw + 0.25), r.y + 0.85, r.u1, { collide: true });
      }
      d.span('marble', sx * (hw + 0.02), sec.podium, sec.terrace[0], sx * (hw + 0.25), sec.podium + 0.85, sec.terrace[1], { collide: true });
    }
    // Railing at the stair's open edge (the drop to the tunnel floor).
    for (let k = 4; k <= n; k += 4) {
      const y = rise * k;
      const z = w1.u0 - (n - k + 0.5) * run;
      d.box('bronze', -hw + 1.05, y + 0.5, z, 0.05, 1.0, 0.05);
    }
    d.rod('bronze', { x: -hw + 1.05, y: rise * 4 + 1.0, z: w1.u0 - (n - 3.5) * run }, { x: -hw + 1.05, y: w1.y + 1.0, z: w1.u0 - 0.2 }, 0.03, 4);
  }
}

/** Stands, aisles and entrance tunnels. */
export function buildStandsAll(b: MeshBuilder, sec: CircusSection, gaps: CircusGaps, detail: 'high' | 'low') {
  buildStands(b, sec, gaps, detail);
  const aisles = buildAisles(b, sec, gaps, detail);
  buildTunnels(b, sec, gaps);
  return { aisles };
}

// ---------------------------------------------------------------- facade

const H1 = CIRCUS.storeys[0];
const H2 = CIRCUS.storeys[1];
const H3 = CIRCUS.storeys[2];

/** One facade bay, three storeys, in the bay frame (outer face z = 0 facing −z, wall to z = T). */
/** Low-poly facade bay for distant parts of the ring: the same massing, few triangles. */
function facadeBayFar(w: number): MeshBuilder {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const M = STONE;
  const span1 = CIRCUS.span;
  const spring1 = CIRCUS.shopCeiling - span1 / 2;
  const top1 = H1 - 0.9;
  d.geo(archDoorWall(w, top1, span1, spring1, T, 4), M);
  d.box(M, -w / 2, top1 / 2, -0.15, 0.62, top1, 0.3);
  d.box(M, 0, top1 + 0.3, (T - 0.2) / 2, w + 0.02, 0.6, T + 0.2);
  d.box(M, 0, H1 - 0.15, (T - 0.5) / 2, w + 0.02, 0.3, T + 0.5);
  const y2 = H1, plinth = 0.95, top2 = H2 - 1.15, span2 = 2.8;
  d.box(M, 0, y2 + plinth / 2, (T - 0.16) / 2, w + 0.02, plinth, T + 0.16);
  d.geo(archDoorWall(w, top2 - plinth, span2, top2 - plinth - span2 / 2 - 0.05, T, 4), M, 0, y2 + plinth, 0);
  d.poly('black', [{ x: -span2 / 2, y: y2 + plinth, z: 0.85 }, { x: -span2 / 2, y: y2 + top2, z: 0.85 }, { x: span2 / 2, y: y2 + top2, z: 0.85 }, { x: span2 / 2, y: y2 + plinth, z: 0.85 }], { doubleSided: true });
  d.box(M, -w / 2, y2 + top2 / 2, -0.12, 0.5, top2, 0.24);
  d.box(M, 0, y2 + top2 + 0.33, (T - 0.17) / 2, w + 0.02, 0.66, T + 0.17);
  d.box(M, 0, y2 + H2 - 0.25, (T - 0.45) / 2, w + 0.02, 0.5, T + 0.45);
  const y3 = H1 + H2, top3 = H3 - 1.1;
  d.geo(rectHoleWall(w, top3, [[0, 1.3, 1.1, 1.5]], T), M, 0, y3, 0);
  d.box(M, -w / 2, y3 + top3 / 2, -0.06, 0.56, top3, 0.12);
  d.box(M, 0, y3 + top3 + 0.4, (T - 0.6) / 2, w + 0.02, 0.8, T + 0.6);
  d.box(M, 0, y3 + H3 - 0.15, T / 2, w + 0.02, 0.3, T);
  return b;
}

function facadeBay(w: number, detail: 'high' | 'low'): MeshBuilder {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const M = STONE;
  const hi = detail === 'high';
  // Storey 1: arched shop openings, Tuscan half-columns.
  const span1 = CIRCUS.span;
  const spring1 = CIRCUS.shopCeiling - span1 / 2;
  const top1 = H1 - 0.9;
  d.geo(archDoorWall(w, top1, span1, spring1, T, hi ? 7 : 5), M);
  if (hi) {
    for (const s of [-1, 1]) {
      const x0 = span1 / 2, x1 = w / 2;
      d.box(M, s * (x0 + x1) / 2, spring1 - 0.08, -0.04, x1 - x0, 0.16, 0.1);
    }
    d.geo(archBandLite(span1 / 2, span1 / 2 + 0.28, spring1, 0.07), M);
    d.box(M, 0, CIRCUS.shopCeiling + 0.16, -0.08, 0.34, 0.5, 0.16);
  }
  halfColumn(d, M, -w / 2, 0, 0.62, top1, 'tuscan');
  d.box(M, 0, top1 + 0.3, (T - 0.2) / 2, w + 0.02, 0.6, T + 0.2);
  d.box(M, 0, H1 - 0.15, (T - 0.5) / 2, w + 0.02, 0.3, T + 0.5);
  // Storey 2: arches with balustrades on a plinth, Ionic half-columns on pedestals.
  const y2 = H1;
  const plinth = 0.95;
  const top2 = H2 - 1.15;
  d.box(M, 0, y2 + plinth / 2, (T - 0.16) / 2, w + 0.02, plinth, T + 0.16);
  const span2 = 2.8;
  d.geo(archDoorWall(w, top2 - plinth, span2, top2 - plinth - span2 / 2 - 0.05, T, hi ? 7 : 5), M, 0, y2 + plinth, 0);
  d.box(M, 0, y2 + plinth + 0.5, 0.5, span2, 1.0, 0.25);
  d.poly('black', [
    { x: -span2 / 2, y: y2 + plinth, z: 0.85 },
    { x: -span2 / 2, y: y2 + top2, z: 0.85 },
    { x: span2 / 2, y: y2 + top2, z: 0.85 },
    { x: span2 / 2, y: y2 + plinth, z: 0.85 },
  ], { doubleSided: true });
  if (hi) d.geo(archBandLite(span2 / 2, span2 / 2 + 0.24, y2 + top2 - span2 / 2 - 0.05, 0.06), M);
  d.box(M, -w / 2, y2 + plinth / 2, -0.2, 0.78, plinth, 0.4);
  halfColumn(d, M, -w / 2, y2 + plinth, 0.5, top2 - plinth, 'ionic');
  d.box(M, 0, y2 + top2 + 0.33, (T - 0.17) / 2, w + 0.02, 0.66, T + 0.17);
  d.box(M, 0, y2 + H2 - 0.25, (T - 0.45) / 2, w + 0.02, 0.5, T + 0.45);
  // Storey 3: attic wall with Corinthian pilasters and square windows; crowning cornice.
  const y3 = H1 + H2;
  const top3 = H3 - 1.1;
  d.geo(rectHoleWall(w, top3, [[0, 1.3, 1.1, 1.5]], T), M, 0, y3, 0);
  d.poly('black', [
    { x: -0.55, y: y3 + 1.3, z: 0.8 },
    { x: -0.55, y: y3 + 2.8, z: 0.8 },
    { x: 0.55, y: y3 + 2.8, z: 0.8 },
    { x: 0.55, y: y3 + 1.3, z: 0.8 },
  ], { doubleSided: true });
  d.box(M, -w / 2, y3 + 0.12 + (top3 - 0.62) / 2, -0.06, 0.56, top3 - 0.62, 0.12);
  d.box(M, -w / 2, y3 + 0.1, -0.08, 0.7, 0.2, 0.16);
  d.box(M, -w / 2, y3 + top3 - 0.25, -0.1, 0.74, 0.5, 0.2);
  if (hi) d.box(M, 0, y3 + 1.22, -0.06, 1.5, 0.1, 0.14);
  d.box(M, 0, y3 + top3 + 0.2, (T - 0.1) / 2, w + 0.02, 0.4, T + 0.1);
  d.box(M, 0, y3 + top3 + 0.6, (T - 0.6) / 2, w + 0.02, 0.4, T + 0.6);
  d.box(M, 0, y3 + H3 - 0.15, T / 2, w + 0.02, 0.3, T);
  return b;
}

/** Shop room shell behind a ground-storey arch (bay frame): divider, back wall, vault, loft. */
function shopShell(w: number): MeshBuilder {
  const b = new MeshBuilder();
  const d = new Draw(b).noShadow();
  const depth = CIRCUS.halfW - CIRCUS.track - T - CIRCUS.shopBack; // 3.4
  const z0 = T;
  const z1 = T + depth;
  const H = CIRCUS.shopCeiling;
  d.span('plaster_cream', -w / 2, 0, z0, -w / 2 + 0.5, H, z1);
  d.span('plaster_red', -w / 2 - 0.01, 0, z0, -w / 2 + 0.51, 1.05, z1 - 0.01);
  d.poly('plaster_cream', [{ x: -w / 2, y: 0, z: z1 }, { x: -w / 2, y: H, z: z1 }, { x: w / 2, y: H, z: z1 }, { x: w / 2, y: 0, z: z1 }]);
  d.poly('plaster_red', [{ x: -w / 2, y: 0, z: z1 - 0.01 }, { x: -w / 2, y: 1.05, z: z1 - 0.01 }, { x: w / 2, y: 1.05, z: z1 - 0.01 }, { x: w / 2, y: 0, z: z1 - 0.01 }]);
  d.poly('concrete', [{ x: -w / 2, y: H, z: z0 }, { x: w / 2, y: H, z: z0 }, { x: w / 2, y: H, z: z1 }, { x: -w / 2, y: H, z: z1 }]);
  d.poly('cobbles', [{ x: -w / 2, y: 0.02, z: z0 - T }, { x: -w / 2, y: 0.02, z: z1 }, { x: w / 2, y: 0.02, z: z1 }, { x: w / 2, y: 0.02, z: z0 - T }]);
  // Loft (pergula) over the back half, on a beam.
  d.span('wood_dark', -w / 2 + 0.5, 2.55, z0 + 1.6, w / 2, 2.7, z1);
  d.span('wood_dark', -w / 2 + 0.5, 2.38, z0 + 1.55, w / 2, 2.55, z0 + 1.75);
  return b;
}

/** Shop fittings by kind (bay frame). Returns the builder; colliders are added separately. */
function shopFit(w: number, kind: 'taberna' | 'shutters' | 'popina' | 'stair' | 'blind' | 'tunnel'): MeshBuilder {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const di = d.noShadow();
  const z0 = T;
  if (kind === 'taberna') {
    // L-shaped masonry counter with a marble top, amphorae and a shelf.
    di.span('plaster_red', -0.1, 0, z0 + 0.25, 1.5, 0.95, z0 + 0.75);
    di.span('plaster_red', 1.0, 0, z0 + 0.75, 1.5, 0.95, z0 + 1.8);
    di.span('marble', -0.15, 0.95, z0 + 0.2, 1.55, 1.02, z0 + 0.8);
    di.span('wood', -w / 2 + 0.6, 1.5, z0 + 3.0, w / 2 - 0.1, 1.56, z0 + 3.38);
    for (let i = 0; i < 2; i++) amphora(di, -0.6 + i * 0.9, 1.56, z0 + 3.18, 0.5);
    for (let i = 0; i < 2; i++) amphora(di, -1.2 + i * 0.5, 0, z0 + 2.6, 0.75);
  } else if (kind === 'popina') {
    di.span('plaster_red', 0.0, 0, z0 + 0.3, 1.55, 0.95, z0 + 0.85);
    di.span('plaster_red', 1.05, 0, z0 + 0.85, 1.55, 0.95, z0 + 2.0);
    di.span('marble', -0.05, 0.95, z0 + 0.25, 1.6, 1.02, z0 + 0.9);
    for (const x of [0.4, 1.15]) di.cyl('black', x, 1.0, z0 + 0.57, 0.2, 0.05, 8);
    di.span('brick', w / 2 - 1.1, 0, z0 + 2.4, w / 2 - 0.1, 0.8, z0 + 3.3);
    di.box('glow_fire', w / 2 - 0.6, 0.86, z0 + 2.85, 0.5, 0.06, 0.5);
    di.cyl('bronze', w / 2 - 0.6, 0.95, z0 + 2.85, 0.22, 0.18, 8);
  } else if (kind === 'shutters') {
    // Plank shutters across most of the opening, a door gap on the right.
    for (let i = 0; i < 5; i++) di.span('wood', -1.58 + i * 0.4, 0, 0.88, -1.2 + i * 0.4, 2.9, 0.98);
    di.span('wood_dark', -1.6, 2.9, 0.86, 1.6, 3.05, 1.0);
    di.span('black', -1.6, 0, 1.1, 1.6, CIRCUS.shopCeiling, 1.12);
  } else if (kind === 'stair') {
    // Stair to the upper floors (closed by a door at the landing).
    for (let i = 0; i < 12; i++) di.span(STONE, -w / 2 + 0.6, 0, z0 + 0.4 + i * 0.25, -w / 2 + 1.7, 0.22 * (i + 1), z0 + 3.4);
    di.span('wood_dark', -w / 2 + 0.6, 2.64, z0 + 3.3, -w / 2 + 1.7, 4.4, z0 + 3.38);
  } else if (kind === 'blind') {
    // Walled-up arch with a small door (the pulvinar's service stair, the towers).
    d.geo(archDoorWall(CIRCUS.span + 0.1, CIRCUS.shopCeiling + 0.02, 1.3, 1.75, 0.5, 6), 'travertine', 0, 0, 0.45);
    di.span('bronze', -0.65, 0, 0.6, 0.65, 2.4, 0.68);
    di.span('black', -0.66, 0, 0.75, 0.66, 2.4, 0.78);
  }
  return b;
}

/** Low-poly amphora (Dressel 2-4 profile) standing at (x, y, z), height h. */
export function amphora(d: Draw, x: number, y: number, z: number, h: number) {
  d.cyl('terracotta', x, y + h * 0.4, z, h * 0.06, h * 0.8, 6, { rTop: h * 0.17, open: true });
  d.cyl('terracotta', x, y + h * 0.9, z, h * 0.17, h * 0.2, 5, { rTop: h * 0.04, open: true });
}

interface BayUse {
  bay: FacadeBay;
  kind: 'taberna' | 'shutters' | 'popina' | 'stair' | 'blind' | 'tunnel';
}

/** Decide what each ground-storey arch holds. */
function bayUses(gaps: CircusGaps, bays: FacadeBay[]): BayUse[] {
  const out: BayUse[] = [];
  const kinds = ['taberna', 'shutters', 'popina', 'taberna', 'shutters', 'stair', 'taberna', 'shutters', 'popina', 'shutters'] as const;
  let k = 0;
  for (const bay of bays) {
    let kind: BayUse['kind'] = kinds[k++ % kinds.length];
    const straight = bay.side === 1 || bay.side === -1;
    if (straight && bay.z < carceresFront() + 2) kind = 'blind';
    if (bay.side === 2 && Math.abs(bay.x) > CIRCUS.track - 0.5) kind = 'blind';
    if (straight && gaps.tunnels.some((t) => t.side === bay.side && Math.abs(t.z - bay.z) < 0.5)) kind = 'tunnel';
    if (bay.side === 1 && bay.z > gaps.pulvinar[0] - 2 && bay.z < gaps.pulvinar[1] + 2) kind = 'blind';
    out.push({ bay, kind });
  }
  return out;
}

export interface FacadeResult {
  group: THREE.Group;
  /** Distance LOD of the instanced bays and shop fronts (driven by the landmark's System). */
  lod: InstanceLod;
  uses: BayUse[];
  /** Bays dressed with an awning or wares (lamps go there). */
  dressed: { bay: FacadeBay; kind: string }[];
}

export function buildFacade(b: MeshBuilder, gaps: CircusGaps, detail: 'high' | 'low'): FacadeResult {
  const group = new THREE.Group();
  group.name = 'circus-facade';
  const bays = [...facadeBays([gaps.channel[0], gaps.channel[1]]), ...carceresFaceBays()];
  const W = bays[0].w;
  const mats = bays.map((bay) => facing(bay.x, 0, bay.z, bay.nx, bay.nz, bay.w / W));
  const lod = new InstanceLod(110);
  // Near and far versions of the bays; everything at the shop fronts is drawn near only.
  const add = (tb: MeshBuilder, name: string, ms: THREE.Matrix4[], mode: 'near' | 'far' = 'near') => {
    const g = instanced(tb, name, ms);
    group.add(g);
    lod.add(g, ms, mode);
  };
  add(facadeBay(W, detail), 'circus-bays', mats);
  add(facadeBayFar(W), 'circus-bays-far', mats, 'far');
  const uses = bayUses(gaps, bays);
  // Shop shells for every bay that isn't a tunnel.
  const shellMats = uses.filter((u) => u.kind !== 'tunnel').map((u) => facing(u.bay.x, 0, u.bay.z, u.bay.nx, u.bay.nz, u.bay.w / W));
  if (detail === 'high') add(shopShell(W), 'circus-shops', shellMats);
  for (const kind of ['taberna', 'shutters', 'popina', 'stair', 'blind'] as const) {
    const ms = uses.filter((u) => u.kind === kind).map((u) => facing(u.bay.x, 0, u.bay.z, u.bay.nx, u.bay.nz, u.bay.w / W));
    if (!ms.length || (detail === 'low' && kind !== 'blind')) continue;
    add(shopFit(W, kind), `circus-${kind}`, ms);
  }
  // Painted shop signs over a few doors (one texture per sign).
  if (detail === 'high') {
    const signs: [string[], number][] = [
      [['Vina', 'Setina · Falerna'], 0],
      [['Mathematicus', 'Fata Narro'], 1],
      [['Popina', 'Panis · Pulmentarium'], 2],
      [['Prasina', 'Pittacia · Sortes'], 3],
    ];
    for (const [lines, i] of signs) {
      const sb = new MeshBuilder();
      paintedSign(sb, lines, 2.2, 0.55, new THREE.Matrix4().makeTranslation(0, CIRCUS.shopCeiling + 0.55, -0.12));
      const pick = uses.filter((u) => (u.kind === 'taberna' || u.kind === 'popina') && u.bay.side !== 0).filter((_, j) => j % 5 === i);
      add(sb, `circus-sign-${i}`, pick.map((u) => facing(u.bay.x, 0, u.bay.z, u.bay.nx, u.bay.nz, u.bay.w / W)));
    }
  }
  // Street dressing in front of the shops: striped awnings, wares on the sidewalk (high detail).
  const dressed: { bay: FacadeBay; kind: string }[] = [];
  if (detail === 'high') {
    const shopsOut = uses.filter((u) => (u.kind === 'taberna' || u.kind === 'popina') && u.bay.side !== 2);
    const awn: [MaterialId, MaterialId][] = [['fabric_white', 'fabric_red'], ['fabric_white', 'fabric_ochre'], ['fabric_white', 'fabric_blue']];
    for (let v = 0; v < 3; v++) {
      const ab = new MeshBuilder();
      velum(new Draw(ab).at(0, 0, -0.35), CIRCUS.span + 0.5, 1.8, CIRCUS.shopCeiling - 0.35, awn[v]);
      const pick = shopsOut.filter((_, j) => j % 2 === 0 && (j / 2) % 3 === v);
      add(ab, `circus-awning-${v}`, pick.map((u) => facing(u.bay.x, 0, u.bay.z, u.bay.nx, u.bay.nz, u.bay.w / W)));
      for (const u of pick) dressed.push({ bay: u.bay, kind: 'awning' });
    }
    const wares: [string, (dd: Draw) => void][] = [
      ['wine', (dd) => { for (const [x, z] of [[0.9, -1.2], [1.35, -1.45], [1.15, -0.95]]) amphora(dd, x, 0, z, 0.95); placeProp(dd, 'stool', -1.0, 0, -1.0, 0.5, { variant: 2 }); }],
      ['goods', (dd) => { placeProp(dd, 'table', -0.6, 0, -1.25, 0.05, { variant: 1 }); placeProp(dd, 'basket', 0.9, 0, -1.1, 0.4, { variant: 0 }); placeProp(dd, 'basket', 1.3, 0, -1.4, 1.0, { variant: 2 }); }],
      ['cook', (dd) => { dd.cyl('iron', 1.2, 0.35, -1.2, 0.05, 0.7, 5); dd.cyl('bronze', 1.2, 0.75, -1.2, 0.3, 0.1, 8, { rTop: 0.36 }); dd.box('glow_fire', 1.2, 0.82, -1.2, 0.36, 0.04, 0.36); placeProp(dd, 'bench', -0.8, 0, -1.3, 0, { variant: 0 }); }],
    ];
    for (const [k, [name, make]] of wares.entries()) {
      const wb = new MeshBuilder();
      make(new Draw(wb));
      const pick = shopsOut.filter((u, j) => (name === 'cook' ? u.kind === 'popina' : u.kind === 'taberna' && j % 4 === (k === 0 ? 1 : 3)));
      add(wb, `circus-wares-${name}`, pick.map((u) => facing(u.bay.x, 0, u.bay.z, u.bay.nx, u.bay.nz)));
      for (const u of pick) dressed.push({ bay: u.bay, kind: name });
    }
  }
  // Colliders: the solid facade above the arches, piers between arches, shop dividers, counters.
  const top = CIRCUS.height;
  const q = new THREE.Quaternion();
  const boxAt = (bay: FacadeBay, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    const m = facing(bay.x, 0, bay.z, bay.nx, bay.nz);
    const c = new THREE.Vector3((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2).applyMatrix4(m);
    q.setFromRotationMatrix(m);
    b.collider({ kind: 'box', center: c, half: new THREE.Vector3((x1 - x0) / 2, (y1 - y0) / 2, (z1 - z0) / 2), rotation: q.clone() });
  };
  const L = CIRCUS.halfLen;
  const zc = curveZ();
  for (const side of [1, -1]) {
    // One long box per straight above the ground-storey arches.
    const x = side * (CIRCUS.halfW - T / 2);
    b.collider({ kind: 'box', center: new THREE.Vector3(x, (CIRCUS.shopCeiling + top) / 2, (zc - L) / 2), half: new THREE.Vector3(T / 2, (top - CIRCUS.shopCeiling) / 2, (zc + L) / 2) });
  }
  for (const u of uses) {
    const bay = u.bay;
    const w = bay.w;
    if (bay.side === 0 || bay.side === 2) boxAt(bay, -w / 2, w / 2, CIRCUS.shopCeiling, top, 0, T);
    // Half-piers either side of the arch.
    boxAt(bay, -w / 2, -CIRCUS.span / 2, 0, CIRCUS.shopCeiling, 0, T);
    boxAt(bay, CIRCUS.span / 2, w / 2, 0, CIRCUS.shopCeiling, 0, T);
    if (u.kind === 'tunnel') continue;
    boxAt(bay, -w / 2, -w / 2 + 0.5, 0, CIRCUS.shopCeiling, T, T + 3.4);
    if (u.kind === 'taberna') {
      boxAt(bay, -0.15, 1.55, 0, 1.02, T + 0.2, T + 0.8);
      boxAt(bay, 1.0, 1.55, 0, 1.02, T + 0.8, T + 1.8);
    }
    if (u.kind === 'popina') {
      boxAt(bay, -0.05, 1.6, 0, 1.02, T + 0.25, T + 0.9);
      boxAt(bay, 1.05, 1.6, 0, 1.02, T + 0.9, T + 2.0);
    }
    if (u.kind === 'shutters') boxAt(bay, -1.6, 0.4, 0, 2.9, 0.86, 1.0);
    if (u.kind === 'blind') boxAt(bay, -CIRCUS.span / 2, CIRCUS.span / 2, 0, CIRCUS.shopCeiling, 0.4, 1.0);
  }
  for (const dr of dressed) {
    const bay = dr.bay;
    if (dr.kind === 'awning') for (const sx of [-1, 1]) {
      const m = facing(bay.x, 0, bay.z, bay.nx, bay.nz);
      const c = new THREE.Vector3(sx * ((CIRCUS.span + 0.5) / 2 - 0.05), 1.6, -2.15).applyMatrix4(m);
      b.collider({ kind: 'cylinder', center: c, halfHeight: 1.6, radius: 0.08 });
    }
    else if (dr.kind === 'wine') boxAt(bay, 0.5, 1.7, 0, 1.2, -1.9, -0.7);
    else if (dr.kind === 'goods') boxAt(bay, -1.3, 0.1, 0, 0.8, -1.7, -0.8);
    else if (dr.kind === 'cook') boxAt(bay, 0.8, 1.6, 0, 0.9, -1.6, -0.8);
  }
  // Closing piers at the ends of the curved-end opening (the Arch of Titus passage).
  const zc2 = curveZ();
  const R = CIRCUS.halfW;
  for (const [x, dir] of [[gaps.channel[0], -1], [gaps.channel[1], 1]] as const) {
    const phi = Math.acos(Math.max(-1, Math.min(1, x / R)));
    const nx = Math.cos(phi), nz = Math.sin(phi);
    // Tangent pointing away from the opening (into the bays).
    const tx = -nz * -dir, tz = nx * -dir;
    const px = R * nx + tx * 0.6, pz = zc2 + R * nz + tz * 0.6;
    const m = facing(px, 0, pz, nx, nz);
    const pd = new Draw(b, m);
    pd.span(STONE, -0.7, 0, -0.3, 0.7, CIRCUS.height, T + 0.2, { collide: true });
    pd.span(STONE, -0.8, 0, -0.42, 0.8, 0.6, T + 0.2);
    pd.span(STONE, -0.8, CIRCUS.height - 0.7, -0.5, 0.8, CIRCUS.height, T + 0.2);
  }
  return { group, uses, dressed, lod };
}

// ---------------------------------------------------------------- gallery colonnade

export function buildGallery(group: THREE.Group, b: MeshBuilder, sec: CircusSection, gaps: CircusGaps, detail: 'high' | 'low') {
  const g = sec.gallery;
  const ss = ringStations(gaps.ring, g.colU, 4.2, 0.8);
  const cb = new MeshBuilder();
  const cd = new Draw(cb);
  lowColumn(cd, 'marble', 0, 0, 0, 0.42, g.colH, { cap: 'tuscan', seg: 6, lite: true });
  const mats = ss.map((s) => {
    const p = ringPoint(s, g.colU);
    return new THREE.Matrix4().makeTranslation(p.x, g.y, p.z);
  });
  group.add(instanced(cb, 'circus-gallery-columns', mats));
  for (const s of ss) {
    const p = ringPoint(s, g.colU);
    b.collider({ kind: 'cylinder', center: new THREE.Vector3(p.x, g.y + g.colH / 2, p.z), halfHeight: g.colH / 2, radius: 0.24 });
  }
  // A timber rail along the gallery's front edge.
  return ss.length;
}

// ---------------------------------------------------------------- sidewalk round the outside

/**
 * A raised travertine sidewalk (crepido) along the outer facade, with a curb, round the straights,
 * the curve (open at the Arch of Titus passage) and the carceres' outer face.
 */
export function buildSidewalk(b: MeshBuilder, gaps: CircusGaps, ground: (x: number, z: number) => number) {
  const u0 = CIRCUS.halfW - CIRCUS.track;
  const u1 = u0 + 2.6;
  const lift = 0.14;
  const gap: RingGap = { kind: 'open', at: (u: number) => channelGap(gaps.channel[0], gaps.channel[1], u) ?? [0, 0], uMin: 0, uMax: u1 + 1 };
  const G = [gap];
  const yAt = (x: number, z: number) => Math.max(lift, ground(x, z) + 0.12);
  const walk: number[] = [], curb: number[] = [], face: number[] = [];
  const st = stations();
  const q = new THREE.Quaternion();
  const ax = new THREE.Vector3(0, 1, 0);
  for (const [p0, p1] of pieces(G, (u0 + u1) / 2)) {
    // Stations every ~3 m on the straights and every 3.75° on the curve.
    const ss: number[] = [p0];
    for (let s = p0; s < p1; ) {
      const onCurve = s >= st.curveStart && s < st.curveEnd;
      s = Math.min(p1, s + (onCurve ? (Math.PI / 48) * CIRCUS.track : 3));
      ss.push(s);
    }
    for (let i = 0; i < ss.length - 1; i++) {
      const A = ringPoint(ss[i], u0), B = ringPoint(ss[i + 1], u0);
      const C = ringPoint(ss[i + 1], u1 - 0.3), D = ringPoint(ss[i], u1 - 0.3);
      const E = ringPoint(ss[i + 1], u1), F = ringPoint(ss[i], u1);
      const y = (p: { x: number; z: number }) => yAt(p.x, p.z);
      const v = (p: { x: number; z: number }, dy = 0) => [p.x, y(p) + dy, p.z];
      // Winding: outward is +u; viewed from above, A→D→C is counter-clockwise for increasing s on the +x straight.
      walk.push(...v(A), ...v(D), ...v(C), ...v(A), ...v(C), ...v(B));
      curb.push(...v(D, 0.01), ...v(F, 0.01), ...v(E, 0.01), ...v(D, 0.01), ...v(E, 0.01), ...v(C, 0.01));
      face.push(F.x, y(F) + 0.01, F.z, E.x, y(E) + 0.01, E.z, E.x, y(E) - 0.45, E.z, F.x, y(F) + 0.01, F.z, E.x, y(E) - 0.45, E.z, F.x, y(F) - 0.45, F.z);
      // Collider: one box per piece, at the higher of its ends.
      const top = Math.max(y(A), y(B), y(E), y(F));
      const m0 = ringPoint(ss[i], (u0 + u1) / 2), m1 = ringPoint(ss[i + 1], (u0 + u1) / 2);
      const len = Math.hypot(m1.x - m0.x, m1.z - m0.z);
      if (len < 0.05) continue;
      q.setFromAxisAngle(ax, Math.atan2(-(m1.z - m0.z), m1.x - m0.x));
      b.collider({ kind: 'box', center: new THREE.Vector3((m0.x + m1.x) / 2, (top - 0.6) / 2, (m0.z + m1.z) / 2), half: new THREE.Vector3(len / 2 + 0.03, (top + 0.6) / 2, (u1 - u0) / 2), rotation: q.clone() });
    }
  }
  const add = (mat: MaterialId, pos: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.computeVertexNormals();
    // Make every face point up/outward whatever the winding (flip triangles whose normal points down).
    const n = g.getAttribute('normal') as THREE.BufferAttribute;
    const P = g.getAttribute('position') as THREE.BufferAttribute;
    for (let t = 0; t < P.count; t += 3) {
      if (n.getY(t) < -0.01) {
        for (const k of [0, 1, 2]) n.setXYZ(t + k, -n.getX(t + k), -n.getY(t + k), -n.getZ(t + k));
        const x1 = P.getX(t + 1), y1 = P.getY(t + 1), z1 = P.getZ(t + 1);
        P.setXYZ(t + 1, P.getX(t + 2), P.getY(t + 2), P.getZ(t + 2));
        P.setXYZ(t + 2, x1, y1, z1);
      }
    }
    g.computeVertexNormals();
    b.add(g, mat, undefined, { castShadow: false });
  };
  add('paving_travertine', walk);
  add('travertine', curb);
  b.add((() => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(face, 3)); g.computeVertexNormals(); return g; })(), 'travertine');
  // The straights run on past the carceres front to the outer corners, and along the outer face.
  const d = new Draw(b);
  const zo = -CIRCUS.halfLen, zf = carceresFront();
  const yc = Math.max(yAt(-CIRCUS.halfW, zo), yAt(CIRCUS.halfW, zo), yAt(0, zo - 2));
  for (const s of [-1, 1]) {
    const xa = s * CIRCUS.halfW, xb = s * (CIRCUS.halfW + 2.6);
    d.span('paving_travertine', Math.min(xa, xb), yc - 0.4, zo - 2.6, Math.max(xa, xb), yc, zf, { collide: true });
  }
  d.span('paving_travertine', -CIRCUS.halfW, yc - 0.4, zo - 2.6, CIRCUS.halfW, yc, zo, { collide: true });
  d.span('travertine', -CIRCUS.halfW - 2.6, yc - 0.5, zo - 2.62, CIRCUS.halfW + 2.6, yc + 0.01, zo - 2.3);
}

// ---------------------------------------------------------------- paved apron to the streets

/** An atlas road's centreline in the circus frame (game m). */
function roadInCircus(id: string): [number, number][] {
  const host = LANDMARK_BY_ID['circus-maximus'] as LandmarkData;
  const road = ROADS.find((r) => r.id === id);
  if (!road) return [];
  return road.points.map((p) => {
    const r = relLocal(host, { center: p, rotation: 0 });
    return [r.x, r.z];
  });
}

/** x of a polyline at z (linear between its points, clamped at the ends). */
function polyX(pts: [number, number][], z: number): number {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i], [bx, bz] = pts[i + 1];
    if ((z - az) * (z - bz) <= 0 && az !== bz) return ax + ((bx - ax) * (z - az)) / (bz - az);
  }
  const first = pts[0], last = pts[pts.length - 1];
  return Math.abs(z - first[1]) < Math.abs(z - last[1]) ? first[0] : last[0];
}

/**
 * A paved apron from the sidewalk's curb out to the streets that run along both long sides (the
 * atlas's street north and south of the Circus): the shops face a paved street front instead of
 * a strip of earth. Stops short of the carceres' corners and of the curved end.
 */
export function buildApron(b: MeshBuilder, ground: (x: number, z: number) => number) {
  const edge = CIRCUS.halfW + 2.6 + 0.02;
  for (const [side, id, z0, z1] of [[1, 'street-north-of-circus', carceresFront() + 2, curveZ() - 4], [-1, 'street-south-of-circus', carceresFront() + 8, curveZ() - 4]] as const) {
    const road = roadInCircus(id);
    if (road.length < 2) continue;
    const outer = (z: number) => {
      // The road's inner edge (half its 5 m width in from the centreline), at most 12 m out.
      const x = Math.abs(polyX(road, z)) - 2.6;
      return side * Math.max(edge + 1.5, Math.min(edge + 12, x));
    };
    const pts: [number, number][] = [];
    const n = Math.ceil((z1 - z0) / 12);
    for (let i = 0; i <= n; i++) pts.push([side * edge, z0 + ((z1 - z0) * i) / n]);
    for (let i = n; i >= 0; i--) {
      const z = z0 + ((z1 - z0) * i) / n;
      pts.push([outer(z), z]);
    }
    buildPlaza(b, side > 0 ? pts : pts.reverse(), ground, { material: 'paving_travertine', lift: 0.08, skirt: 0.35, cell: 3 });
  }
}

// ---------------------------------------------------------------- track

export function buildTrack(b: MeshBuilder, ctx: LandmarkContext) {
  const r = CIRCUS.track;
  const zc = curveZ();
  const z0 = carceresFront() - 0.5;
  const z1 = zc + r;
  const nx = 20;
  const nz = Math.ceil((z1 - z0) / 2.5);
  const pos: number[] = [];
  const P = (i: number, j: number) => {
    let x = -r + (2 * r * i) / nx;
    const z = z0 + ((z1 - z0) * j) / nz;
    // Clamp into the semicircle at the curved end.
    if (z > zc) {
      const dz = z - zc;
      const lim = Math.sqrt(Math.max(0, r * r - dz * dz));
      x = Math.max(-lim, Math.min(lim, x));
    }
    const y = Math.max(0, ctx.groundAt(x, z)) + 0.04;
    return [x, y, z];
  };
  const grid: number[][][] = [];
  for (let j = 0; j <= nz; j++) {
    grid.push([]);
    for (let i = 0; i <= nx; i++) grid[j].push(P(i, j));
  }
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const a = grid[j][i], c = grid[j][i + 1], e = grid[j + 1][i + 1], f = grid[j + 1][i];
      pos.push(...a, ...f, ...e, ...a, ...e, ...c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  b.add(g, 'sand', undefined, { castShadow: false, uvScale: 3 });
}

/** Stations of the six tunnels and a few shops, for spots. */
export function circusStations() {
  return { total: totalStations(), ...stations() };
}
