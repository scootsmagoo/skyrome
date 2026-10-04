/**
 * Circus Maximus parts: the spina (euripus basins with the lap counters, shrines and statues; the
 * obelisk itself is its own landmark), the two metae, the carceres with the Porta Pompae and the
 * oppida towers, the track lines, and the cheap far stand-in.
 */
import * as THREE from 'three';
import { Draw } from '../../../../arch/fabric/draw';
import { inscriptionPanel } from '../../../../arch/common/inscription';
import { T as Tm, TRS } from '../../../../arch/common/geom';
import { armoredEmperor, seatedDeity } from '../../../../arch/classical/statues';
import { MeshBuilder } from '../../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../../gfx/materialIds';
import { CIRCUS, carceresFront, carceresStalls, circusSection, curveZ, facadeBays } from './circusLayout';
import { cutting, pieces, ringStrip } from './ring';
import { archBand, archDoorWall, dolphin, egg, lion, metaCone } from './shapes';
import { Spots, gableRoof, lowColumn } from './util';

const SP = CIRCUS.spina;
export const spinaStart = () => SP.z - SP.length / 2;
export const spinaEnd = () => SP.z + SP.length / 2;

/** Monuments on the spina: z (local circus) and kind. The obelisk plinth sits at the atlas obelisk. */
export function spinaLayout(obeliskZ: number) {
  const z0 = spinaStart();
  const z1 = spinaEnd();
  type Kind = 'dolphins' | 'murcia' | 'victory' | 'cybele' | 'obelisk' | 'shrine' | 'eggs' | 'statue';
  const items: { z: number; len: number; kind: Kind }[] = [
    { z: z0 + 5, len: 6, kind: 'dolphins' },
    { z: z0 + 27, len: 5, kind: 'murcia' },
    { z: z0 + 50, len: 4, kind: 'victory' },
    { z: z0 + 73, len: 5, kind: 'cybele' },
    { z: obeliskZ, len: 9, kind: 'obelisk' },
    { z: obeliskZ + 25, len: 5, kind: 'shrine' },
    { z: obeliskZ + 48, len: 4, kind: 'victory' },
    { z: obeliskZ + 71, len: 4, kind: 'statue' },
    { z: z1 - 6, len: 8, kind: 'eggs' },
  ];
  return { z0, z1, items };
}

export function buildSpina(b: MeshBuilder, obeliskZ: number, spots: Spots, detail: 'high' | 'low') {
  const d = new Draw(b).at(SP.x, 0, 0);
  const hi = detail === 'high';
  const { z0, z1, items } = spinaLayout(obeliskZ);
  const W = SP.width;
  const H = SP.height;
  const hw = W / 2;
  // Solid plinths under the monuments and at both ends; basins (euripi) between them.
  const solids = items.map((it) => [it.z - it.len / 2, it.z + it.len / 2] as [number, number]);
  let cur = z0;
  for (const [a, c] of solids) {
    if (a > cur + 0.5) basin(d, cur, a, hw, H);
    d.span('marble', -hw, 0, a, hw, H, c, { collide: true });
    d.span(STONE, -hw - 0.12, H, a, hw + 0.12, H + 0.15, c);
    cur = c;
  }
  if (z1 > cur + 0.5) basin(d, cur, z1, hw, H);
  // Base moulding all round (a plinth band), then the metae beyond each end.
  d.span(STONE, -hw - 0.15, 0, z0 - 0.15, hw + 0.15, 0.3, z1 + 0.15);
  meta(d, z0, -1, spots, 'meta-secunda');
  meta(d, z1, 1, spots, 'meta-prima');
  for (const it of items) {
    const m = d.at(0, H + 0.15, it.z);
    if (it.kind === 'dolphins' || it.kind === 'eggs') counter(m, it.kind, hi);
    else if (it.kind === 'murcia' || it.kind === 'shrine') aedicula(b, m, it.kind === 'murcia', hi);
    else if (it.kind === 'victory') victoryColumn(b, m, hi);
    else if (it.kind === 'cybele') cybele(b, m, hi);
    else if (it.kind === 'statue') {
      m.span('marble', -0.7, 0, -0.7, 0.7, 1.6, 0.7, { collide: true });
      armoredEmperor(b, m.m.clone().multiply(TRS(0, 1.6, 0, 0, Math.PI / 2, 0)), { material: 'gilded_bronze', scale: 1.1, detail: 'low' });
    }
  }
  // Shrine spots: Murcia (spina), Consus (the buried altar by the carceres-end turning post).
  const murcia = items.find((i) => i.kind === 'murcia')!;
  spots.add('circus-shrine-murcia', 'shrine', SP.x + hw + 0.6, 0, murcia.z, -Math.PI / 2);
  // The altar of Consus lies underground, uncovered only at the Consualia: a round cover stone.
  d.cyl('marble', -hw - 2.4, 0.06, z0 - 1.2, 0.9, 0.12, 14);
  d.cyl('bronze', -hw - 2.4, 0.13, z0 - 1.2, 0.18, 0.04, 8);
  spots.add('circus-altar-consus', 'shrine', SP.x - hw - 2.4, 0, z0 - 2.6, 0);
}

const STONE: MaterialId = 'travertine';

function basin(d: Draw, a: number, c: number, hw: number, H: number) {
  // Side walls, end walls, floor and water.
  d.span('marble', -hw, 0, a, -hw + 0.45, H, c, { collide: true });
  d.span('marble', hw - 0.45, 0, a, hw, H, c, { collide: true });
  d.span(STONE, -hw - 0.12, H, a, -hw + 0.5, H + 0.15, c);
  d.span(STONE, hw - 0.5, H, a, hw + 0.12, H + 0.15, c);
  d.span('concrete', -hw + 0.45, 0, a, hw - 0.45, 0.35, c, { collide: true });
  d.span('water', -hw + 0.45, 0.35, a, hw - 0.45, H - 0.25, c);
  // Little bridges across the euripus every ~12 m.
  const n = Math.floor((c - a) / 12);
  for (let i = 1; i <= n; i++) {
    const z = a + ((c - a) * i) / (n + 1);
    d.span(STONE, -hw + 0.45, H - 0.2, z - 0.5, hw - 0.45, H, z + 0.5);
  }
}

/** Turning post: semicircular podium (round side away from the spina) carrying three gilded cones. */
function meta(d: Draw, zEnd: number, dir: 1 | -1, spots: Spots, id: string) {
  const r = 2.8;
  const m = d.at(0, 0, zEnd + dir * 0.2);
  const seg = 12;
  for (let i = 0; i < seg; i++) {
    const a0 = (Math.PI * i) / seg;
    const a1 = (Math.PI * (i + 1)) / seg;
    const am = (a0 + a1) / 2;
    const x = Math.cos(am) * r * 0.5;
    const z = dir * Math.sin(am) * r * 0.5;
    const len = 2 * r * Math.sin((a1 - a0) / 2);
    m.box('marble', x, 0.8, z, r, 1.6, len + 0.05, { ry: -Math.atan2(z, x) + Math.PI / 2 });
  }
  m.span('marble', -r, 0, dir > 0 ? -0.1 : 0, r, 1.6, dir > 0 ? 0 : 0.1);
  m.solidCyl(0, 0.8, dir * r * 0.4, r * 0.9, 1.6);
  for (const x of [-1.45, 0, 1.45]) {
    m.geo(metaCone(0.42, 5.2), 'gilded_bronze', x, 1.6, dir * 1.0);
    m.solidCyl(x, 4.2, dir * 1.0, 0.45, 5.2);
  }
  spots.add(`circus-${id}`, 'vista', SP.x, 0, zEnd + dir * 4.5, dir > 0 ? Math.PI : 0);
}

/** Lap counter: four columns carrying an architrave with seven dolphins or seven eggs. */
function counter(d: Draw, kind: 'dolphins' | 'eggs', hi: boolean) {
  const H = 3.0;
  const D = 0.3;
  for (const x of [-1.7, 1.7]) {
    for (const z of [-0.7, 0.7]) lowColumn(d, 'marble', x, 0, z, D, H, { cap: 'ionic', collide: true, seg: hi ? 8 : 6 });
  }
  d.span('marble', -2.0, H, -0.95, 2.0, H + 0.35, 0.95);
  d.span(STONE, -2.1, H + 0.35, -1.0, 2.1, H + 0.5, 1.0);
  for (let i = 0; i < 7; i++) {
    const x = -1.65 + (3.3 * i) / 6;
    if (kind === 'dolphins') {
      // Six heads down (laps run), one still up: the race is in its last lap.
      d.geo(dolphin(), 'bronze', x, H + 0.95, 0, { rx: i < 6 ? 0.9 : -0.4, sx: 0.8, sy: 0.8, sz: 0.8 });
    } else {
      d.geo(egg(), i < 6 ? 'marble' : 'gilded_bronze', x, H + 0.5, 0);
    }
  }
}

/** Small shrine: four columns, gable roof, a statue inside. */
function aedicula(b: MeshBuilder, d: Draw, murcia: boolean, hi: boolean) {
  const W = 3.0, Dp = 2.6, H = 2.6;
  d.span('marble', -W / 2, 0, -Dp / 2, W / 2, 0.3, Dp / 2, { collide: true });
  for (const x of [-W / 2 + 0.3, W / 2 - 0.3]) for (const z of [-Dp / 2 + 0.3, Dp / 2 - 0.3]) lowColumn(d, 'marble', x, 0.3, z, 0.26, H, { cap: 'corinthian', collide: true, seg: hi ? 8 : 6 });
  d.span('marble', -W / 2, 0.3 + H, -Dp / 2, W / 2, 0.3 + H + 0.4, Dp / 2);
  gableRoof(d, -W / 2, -Dp / 2, W / 2, Dp / 2, 0.3 + H + 0.4, { axis: 'z', pitch: 0.3, over: 0.15, gables: 'marble' });
  d.span(murcia ? 'plaster_red' : 'marble', -W / 2 + 0.3, 0.3, Dp / 2 - 0.35, W / 2 - 0.3, 0.3 + H, Dp / 2 - 0.25);
  seatedDeity(b, d.m.clone().multiply(TRS(0, 0.3, 0.2, 0, 0, 0)), { material: murcia ? 'marble' : 'gilded_bronze', scale: 0.62, detail: 'low' });
}

function victoryColumn(b: MeshBuilder, d: Draw, hi: boolean) {
  d.span('marble', -0.6, 0, -0.6, 0.6, 1.1, 0.6, { collide: true });
  lowColumn(d, 'marble_giallo', 0, 1.1, 0, 0.45, 4.6, { cap: 'corinthian', capMat: 'marble', collide: true, seg: hi ? 10 : 6 });
  // Gilded Victory with spread wings and a wreath.
  const y = 5.7;
  d.cyl('gilded_bronze', 0, y + 0.55, 0, 0.16, 1.1, 8, { rTop: 0.1 });
  d.ellipsoid('gilded_bronze', 0, y + 1.22, 0, 0.11, 0.13, 0.11);
  for (const s of [-1, 1]) d.box('gilded_bronze', s * 0.32, y + 1.0, 0.12, 0.5, 0.7, 0.04, { rz: s * 0.5, ry: s * 0.3 });
  d.cyl('gilded_bronze', 0.2, y + 1.45, -0.12, 0.12, 0.03, 10, { rx: Math.PI / 2 });
}

function cybele(b: MeshBuilder, d: Draw, hi: boolean) {
  d.span('marble', -0.9, 0, -1.3, 0.9, 1.0, 1.3, { collide: true });
  d.geo(lion(), 'bronze', 0, 1.0, 0, { sx: 1.25, sy: 1.25, sz: 1.25 });
  seatedDeity(b, d.m.clone().multiply(TRS(0, 2.05, 0.15, 0, 0, 0)), { material: 'bronze', scale: 0.72, detail: 'low' });
}

// ---------------------------------------------------------------- track lines

export function buildTrackLines(b: MeshBuilder, obeliskZ: number) {
  const d = new Draw(b);
  const y = 0.07;
  const z0 = spinaStart();
  // Alba linea: from the spina end to the Aventine podium (the lane line at the start).
  d.span('plaster_white', -CIRCUS.track + 0.2, 0.02, z0 - 0.12, SP.x - SP.width / 2 - 0.2, y, z0 + 0.12);
  // Finish line opposite the pulvinar.
  d.span('plaster_white', -CIRCUS.track + 0.2, 0.02, obeliskZ - 0.15, SP.x - SP.width / 2 - 0.2, y, obeliskZ + 0.15);
}

// ---------------------------------------------------------------- carceres

/**
 * Carceres (local circus frame): the outer face is part of the facade ring (instanced bays) except
 * the Porta Pompae; here: the block, twelve stalls on their arc with herms and lattice gates, the
 * Porta Pompae passage with the magistrate's tribunal above it, the upper loggia and the towers.
 */
export function buildCarceres(b: MeshBuilder, spots: Spots, detail: 'high' | 'low') {
  const d = new Draw(b);
  const hi = detail === 'high';
  const zo = -CIRCUS.halfLen; // outer face
  const zf = carceresFront();
  const zi = zo + CIRCUS.wall; // inner face of the outer wall
  const X = CIRCUS.track; // 24
  const Xo = CIRCUS.halfW; // 42
  const stalls = carceresStalls();
  const stallD = 4.2;
  const H1 = 4.6; // stall storey
  const H2 = 4.2; // loggia storey
  const pompa = 3.2;
  // Block behind the stalls, split round the Porta Pompae, leaving room for the shops that open
  // in the outer facade's ground-storey arches.
  const back = zf - stallD;
  const shop = zi + 3.4;
  for (const s of [-1, 1]) {
    const a = s * pompa, c = s * X;
    d.span('brick', Math.min(a, c), 0, shop, Math.max(a, c), H1 + H2, back + 0.05, { collide: true });
    d.span('brick', Math.min(a, c), CIRCUS.shopCeiling, zi, Math.max(a, c), H1 + H2, shop, { collide: true });
  }
  d.span('brick', -pompa, 6.2, zi, pompa, H1 + H2, back);
  // Roof over the block and the loggia, falling from the outer facade toward the track.
  const roofHi = CIRCUS.storeys[0] + CIRCUS.storeys[1] + 1.2;
  shed(d, -X, X, zi, roofHi, zf + 1.6, H1 + H2 + 0.6);
  // Stalls: front walls on the arc (facing the track) with arched gates, dark interiors, herms.
  for (const st of stalls) {
    const ang = -Math.atan2(st.x, 110) + Math.PI; // local −z faces the track
    const m = d.at(st.x, 0, st.z, ang);
    const span = st.w - 0.8;
    m.geo(archDoorWall(st.w, H1, span, H1 - 1.0 - span / 2, 0.6, hi ? 8 : 5), STONE);
    m.span('black', -span / 2, 0, 0.6, span / 2, H1 - 1.0, stallD - 0.1);
    m.span('dirt', -span / 2, 0.01, 0.6, span / 2, 0.03, stallD - 0.1);
    // Lattice gates (two leaves), closed.
    const gw = span / 2;
    for (const sx of [-1, 1]) {
      const gx = (sx * gw) / 2;
      m.span('wood_painted', gx - gw / 2 + 0.02, 0.05, 0.25, gx + gw / 2 - 0.02, 0.18, 0.33);
      m.span('wood_painted', gx - gw / 2 + 0.02, 2.4, 0.25, gx + gw / 2 - 0.02, 2.52, 0.33);
      if (hi) for (let k = 0; k < 4; k++) m.span('wood_painted', gx - gw / 2 + 0.1 + (k * (gw - 0.2)) / 3 - 0.03, 0.05, 0.26, gx - gw / 2 + 0.1 + (k * (gw - 0.2)) / 3 + 0.03, 2.52, 0.32);
      if (hi) m.span('bronze', gx - gw / 2 + 0.02, 1.25, 0.24, gx + gw / 2 - 0.02, 1.3, 0.34);
    }
    m.solid(-st.w / 2, 0, 0.2, st.w / 2, H1, 0.6);
    herm(m, -st.w / 2 + 0.2, hi);
    // Stall number painted over the gate.
    m.span('plaster_red', -0.3, H1 - 0.75, -0.02, 0.3, H1 - 0.35, 0.0);
    // Masonry behind the stall up to the block.
    const behind = st.z - stallD;
    if (behind > back + 0.05) d.span('brick', st.x - st.w / 2, 0, back, st.x + st.w / 2, H1 + H2, behind + 0.05, { collide: true });
    // Upper loggia over the stall.
    const u = d.at(st.x, H1, st.z, ang);
    u.span(STONE, -st.w / 2, 0, -0.2, st.w / 2, 0.45, 0.6);
    u.span('black', -st.w / 2, 0.45, 1.2, st.w / 2, H2, 1.3);
    u.span(STONE, -st.w / 2, H2 - 0.5, -0.2, st.w / 2, H2, 1.2);
    lowColumn(u, STONE, -st.w / 2 + 0.25, 0.45, 0.1, 0.32, H2 - 0.95, { cap: 'ionic', seg: hi ? 8 : 6 });
    u.span('marble', -st.w / 2 + 0.4, 0.45, 0.05, st.w / 2 - 0.4, 1.4, 0.15);
    u.span('brick', -st.w / 2, 0, 0.6, st.w / 2, H2, stallD - 0.1);
  }
  // Piers closing the ends of the stall arc against the towers.
  const last = stalls[stalls.length - 1];
  const sagEnd = 110 - Math.sqrt(110 * 110 - X * X);
  for (const s of [-1, 1]) d.span(STONE, s * (last.x + last.w / 2 - 0.05), 0, zf - 0.6, s * (X + 0.2), H1 + H2, zf + sagEnd + 0.4, { collide: true });
  // Porta Pompae (inner face): a tall arch with the magistrate's tribunal above.
  const pf = d.at(0, 0, zf, Math.PI);
  pf.geo(archDoorWall(2 * pompa, H1 + H2, 4.2, 4.0, 0.8), 'marble');
  pf.span('marble', -pompa - 0.2, H1 + H2, -0.1, pompa + 0.2, H1 + H2 + 0.6, 0.8);
  // Passage through the block.
  for (const s of [-1, 1]) d.span('marble', s * 2.1, 0, zi, s * pompa, 6.2, zf, { collide: true });
  d.span('paving_travertine', -2.1, -0.05, zo - 0.3, 2.1, 0.04, zf + 0.5);
  d.span('concrete', -2.1, 6.1, zi, 2.1, 6.3, zf);
  // Tribunal: projecting balcony on brackets, four columns, a pediment roof, the editor's seat.
  const tb = d.at(0, H1 + 0.2, zf);
  tb.span('marble', -3.0, 0, 0, 3.0, 0.35, 2.8, { collide: true });
  for (const x of [-2.4, -0.8, 0.8, 2.4]) tb.box('marble', x, -0.35, 1.2, 0.3, 0.7, 2.4);
  tb.span('marble', -3.0, 0.35, 2.6, 3.0, 1.35, 2.8, { collide: true });
  for (const x of [-2.7, 2.7]) for (const z of [0.2, 2.5]) lowColumn(tb, 'marble', x, 0.35, z, 0.26, 3.0, { cap: 'corinthian', seg: hi ? 8 : 6 });
  tb.span('marble', -3.0, 3.35, -0.1, 3.0, 3.75, 2.8);
  gableRoof(tb, -3.0, -0.1, 3.0, 2.8, 3.75, { axis: 'z', pitch: 0.28, over: 0.2, gables: 'marble' });
  tb.span('fabric_purple', -2.9, 0.36, 2.55, 2.9, 1.3, 2.6);
  tb.span('wood_dark', -0.5, 0.35, 0.6, 0.5, 1.3, 1.2);
  spots.add('circus-tribunal', 'vista', 0, H1 + 0.55, zf + 1.6, 0);
  // Towers (oppida) at both ends: walls closing the stands, rising above the facade, crenellated.
  const topT = CIRCUS.height + 4.6;
  for (const s of [-1, 1]) {
    const x0 = s * X, x1 = s * Xo;
    d.span(STONE, x0, 0, zf - 0.6, x1, CIRCUS.height, zf + 0.6, { collide: true });
    d.span('brick', Math.min(x0, x1), 0, zi, Math.max(x0, x1), CIRCUS.height - 1, zf - 0.6, { collide: true });
    const tx0 = s * (Xo - 13), tx1 = s * Xo;
    const lo = Math.min(tx0, tx1), hiX = Math.max(tx0, tx1);
    d.span(STONE, lo, CIRCUS.height - 0.3, zo, hiX, topT, zf + 0.6);
    d.span(STONE, lo - 0.2, topT, zo - 0.2, hiX + 0.2, topT + 0.35, zf + 0.8);
    // Merlons.
    const nM = 7;
    for (let i = 0; i < nM; i++) {
      const x = lo + ((hiX - lo) * (i + 0.5)) / nM;
      d.span(STONE, x - 0.55, topT + 0.35, zo - 0.2, x + 0.55, topT + 1.4, zo + 0.5);
      d.span(STONE, x - 0.55, topT + 0.35, zf + 0.1, x + 0.55, topT + 1.4, zf + 0.8);
    }
    for (const z of [zo + 2, zf - 1]) {
      const xe = s > 0 ? hiX : lo;
      d.span(STONE, xe - 0.5, topT + 0.35, z - 0.55, xe + 0.5, topT + 1.4, z + 0.55);
    }
    // Windows on the tower faces.
    for (const z of [zo, zf + 0.6]) {
      const zz = z === zo ? zo - 0.02 : zf + 0.62;
      for (let i = 0; i < 3; i++) {
        const x = lo + ((hiX - lo) * (i + 0.5)) / 3;
        d.span('black', x - 0.5, CIRCUS.height + 1.0, zz - 0.01, x + 0.5, CIRCUS.height + 2.6, zz + 0.01);
      }
    }
    // A statue group on the tower top: a gilded charioteer's quadriga stand-in (Victory).
    d.cyl('gilded_bronze', (lo + hiX) / 2, topT + 1.3, (zo + zf) / 2, 0.25, 2.2, 8, { rTop: 0.12 });
  }
  // Porta Pompae, outer face (replaces the central facade bay): a tall arch between Corinthian
  // columns, an attic with Trajan's dedication of the rebuilt circus (text reconstructed), and the
  // facade's upper storeys continued above.
  const po = d.at(0, 0, zo);
  const W = 4.8;
  const Hc = 7.0;
  po.geo(archDoorWall(2 * W, Hc + 0.6, 4.2, 4.0, CIRCUS.wall + 0.2), 'marble', 0, 0, -0.1);
  po.geo(archBand(2.1, 2.5, 4.0, 0.12), 'marble', 0, 0, -0.1);
  for (const s of [-1, 1]) lowColumn(po, 'marble', s * 3.4, 0, -0.55, 0.7, Hc, { cap: 'corinthian', collide: true, seg: hi ? 10 : 6 });
  po.span('marble', -W - 0.1, Hc, -0.95, W + 0.1, Hc + 0.8, CIRCUS.wall);
  po.span('marble', -W, Hc + 0.8, -0.35, W, Hc + 3.4, CIRCUS.wall);
  po.span('marble', -W - 0.1, Hc + 3.4, -0.55, W + 0.1, Hc + 3.75, CIRCUS.wall);
  po.span(STONE, -W, Hc + 3.75, 0, W, CIRCUS.height - 0.3, CIRCUS.wall);
  po.span(STONE, -W - 0.02, CIRCUS.height - 1.3, -0.6, W + 0.02, CIRCUS.height - 0.9, CIRCUS.wall);
  po.span(STONE, -W - 0.02, CIRCUS.height - 0.3, 0, W + 0.02, CIRCUS.height, CIRCUS.wall);
  for (const x of [-2.4, 2.4]) po.span('black', x - 0.55, Hc + 5.0, -0.02, x + 0.55, Hc + 6.6, 0.0);
  inscriptionPanel(
    b,
    {
      lines: ['Imp Caesar Divi Nervae F Nerva Traianus', 'Aug Germ Dacicus Pont Max Trib Pot VII', 'Imp IIII Cos V P P', 'Circum Maximum Ampliatum Et Exornatum'],
      width: 8.6,
      height: 2.3,
      style: 'bronze',
      ground: '#e8e2d4',
      sizes: [1, 1, 0.9, 0.9],
      border: true,
    },
    po.m.clone().multiply(Tm(0, Hc + 2.1, -0.37)),
    { depth: 0.1, bodyMaterial: 'marble' },
  );
  spots.add('circus-dedication', 'inscription', 0, 0, zo - 7, 0);
  spots.add('circus-porta-pompae', 'door', 0, 0, zo - 1.5, 0);
  return { stalls };
}

function herm(d: Draw, x: number, hi: boolean) {
  d.span('marble', x - 0.22, 0, -0.25, x + 0.22, 2.9, 0.05);
  d.span('marble', x - 0.3, 2.9, -0.3, x + 0.3, 3.15, 0.05);
  d.ellipsoid('marble', x, 3.42, -0.12, 0.17, 0.22, 0.18, { seg: hi ? [10, 7] : [6, 4] });
  d.span('marble', x - 0.26, 0, -0.32, x + 0.26, 0.3, 0.05);
}

/** Lean-to roof slab from (zHigh, yHigh) down to (zLow, yLow), x0..x1. */
function shed(d: Draw, x0: number, x1: number, zHigh: number, yHigh: number, zLow: number, yLow: number) {
  const up = zLow > zHigh;
  const quad = up
    ? [x0, yHigh, zHigh, x0, yLow, zLow, x1, yLow, zLow, x0, yHigh, zHigh, x1, yLow, zLow, x1, yHigh, zHigh]
    : [x1, yHigh, zHigh, x1, yLow, zLow, x0, yLow, zLow, x1, yHigh, zHigh, x0, yLow, zLow, x0, yHigh, zHigh];
  d.tris('roof_tile', quad, { uvScale: 2 });
}

// ---------------------------------------------------------------- far stand-in

/** Cheap massing of the whole circus (a few hundred triangles) for distant views. */
export function circusFar(): THREE.Object3D {
  const b = new MeshBuilder();
  const d = new Draw(b);
  const sec = circusSection();
  const inner = sec.band - CIRCUS.wall;
  const none: Parameters<typeof cutting>[0] = [];
  const all = pieces(none, 0);
  const H = CIRCUS.height;
  // Outer facade: outer face, top; the stands as one slope; the gallery roof.
  ringStrip(b, 'travertine', sec.band, 0, sec.band, H, all, all, 'out', Math.PI / 12);
  ringStrip(b, 'travertine', inner, H, sec.band, H, all, all, 'up', Math.PI / 12);
  ringStrip(b, 'marble', 0, sec.podium, sec.walks[1].u1, sec.walks[1].y, all, all, 'auto', Math.PI / 12);
  ringStrip(b, 'roof_tile', sec.walks[1].u1, sec.gallery.eaveY, inner, H - 0.5, all, all, 'auto', Math.PI / 12);
  ringStrip(b, 'marble', 0, 0, 0, sec.podium, all, all, 'in', Math.PI / 12);
  // Dark arcade band (a stripe of openings) on the outer face.
  ringStrip(b, 'black', sec.band + 0.05, 1.0, sec.band + 0.05, CIRCUS.shopCeiling - 0.6, all, all, 'out', Math.PI / 12);
  // Track, spina, carceres block, towers.
  d.span('sand', -CIRCUS.track, 0.02, carceresFront(), CIRCUS.track, 0.06, curveZ());
  d.span('marble', SP.x - SP.width / 2, 0, spinaStart(), SP.x + SP.width / 2, SP.height + 1.0, spinaEnd());
  d.span('travertine', -CIRCUS.halfW, 0, -CIRCUS.halfLen, CIRCUS.halfW, H, carceresFront());
  for (const s of [-1, 1]) d.span('travertine', s * (CIRCUS.halfW - 13), 0, -CIRCUS.halfLen, s * CIRCUS.halfW, H + 5.5, carceresFront() + 0.6);
  const g = b.build('circus-far');
  g.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) {
      (o as THREE.Mesh).castShadow = false;
    }
  });
  return g;
}

/** Facade bay count (for reports). */
export const facadeBayCount = () => facadeBays().length;
