/**
 * Tiber Island: the sanctuary of Aesculapius (a modest Ionic temple with an incubation portico
 * where the sick sleep hoping for dream cures, a well, anatomical votives and the god's
 * serpents), the travertine ship's prow at the downstream tip with its relief of Aesculapius'
 * serpent staff and an ox head, and the small obelisk standing as the stone ship's mast.
 */
import * as THREE from 'three';
import * as atlas from '../../../data/atlas';
import { T, extrudePolygon, tube, type V2 } from '../../../arch/common/geom';
import { inscriptionPanel } from '../../../arch/common/inscription';
import { obelisk } from '../../../arch/classical/monuments';
import { buildPlaza } from '../../../arch/fabric';
import { placeProp } from '../../../arch/props';
import type { LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { altar, centredTemple, draw, offsetAway, riverEnv, simpleColonnade, spot, V } from './river-kit';
import { riverLife } from './river-life';

// ------------------------------------------------------------------ Aesculapius

function templeAesculapius(ctx: LandmarkContext) {
  const { S, lm, rng } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const fp = lm.footprint as { w: number; d: number };
  // Founded 291 BC; the form is unknown [C]: a tetrastyle Ionic prostyle temple on a podium.
  const { L, dz, front, back } = centredTemple(ctx, b, {
    order: 'ionic', plan: 'prostyle', front: 4, sides: 6, pronaos: 2, width: fp.w * S * 0.82, podiumHeight: 2.6 * S,
    material: 'plaster_white', cellaMaterial: 'plaster_cream', podiumMaterial: 'travertine', roofMaterial: 'roof_tile', fluted: true, detail: 'low',
  });
  const d = draw(b);
  // Altar before the steps, with one of the god's serpents coiled on it.
  const za = front - 1.8;
  altar(d.at(0, ctx.groundAt(0, za), za), 1.4, 0.95, 1.05, 'travertine', false);
  serpent(d.at(0, ctx.groundAt(0, za) + 1.08, za), 0.32, hi);
  // Incubation portico along the NE flank (+x): sleepers on pallets, votive shelves, a well.
  const px0 = L.stylobate.x1 + 1.6;
  const pd = 3.6;
  const pz0 = front + 0.5;
  const pz1 = back + 2.5;
  d.span('paving_travertine', px0 - 0.6, 0, pz0 - 0.4, px0 + pd + 0.6, 0.25, pz1 + 0.4, { collide: true });
  // Back wall (stuccoed) with a dado, columns on the temple side.
  d.span('plaster_cream', px0 + pd, 0.25, pz0 - 0.4, px0 + pd + 0.5, 4.6, pz1 + 0.4, { collide: true });
  d.span('plaster_red', px0 + pd - 0.02, 0.25, pz0 - 0.4, px0 + pd, 1.3, pz1 + 0.4, { shadow: false });
  simpleColonnade(d, [[px0, pz1], [px0, pz0]], { y: 0.25, height: 3.8, D: 0.38, spacing: 2.6, mat: 'plaster_white', roofDepth: pd + 0.5, collide: true });
  const spots: Spot[] = [
    spot('temple-aesculapius:altar', 'shrine', 0, ctx.groundAt(0, za - 1.4), za - 1.4, 0),
    spot('temple-aesculapius:door', 'door', 0, L.podiumHeight, L.cella.z0 + dz - 0.8, Math.PI),
  ];
  // Pallets for the sick (incubants) and the votive shelves.
  for (let k = 0; k < (hi ? 5 : 3); k++) {
    const z = pz0 + 1.2 + k * ((pz1 - pz0 - 2.4) / (hi ? 4 : 2));
    const x = px0 + pd - 1.0;
    d.span('wood', x - 0.4, 0.25, z - 0.95, x + 0.4, 0.45, z + 0.95, { collide: true });
    d.span('fabric_white', x - 0.38, 0.45, z - 0.9, x + 0.38, 0.52, z + 0.9, { shadow: false });
    if (k % 2 === 0) d.ellipsoid('fabric_ochre', x, 0.62, z - 0.2, 0.22, 0.12, 0.6, { seg: [8, 5] }); // a sleeper under a blanket
    // On the pallet (its top at 0.45 m, the mattress 0.52 m).
    spots.push(spot(`temple-aesculapius:incubant-${k}`, k % 2 === 0 ? 'npc' : 'sit', x, 0.52, z, -Math.PI / 2));
  }
  // Shelves of terracotta anatomical votives (legs, feet, eyes, hands, wombs) on the back wall.
  const sx = px0 + pd - 0.18;
  for (const y of [1.6, 2.3]) {
    d.span('wood', sx - 0.2, y, pz0 + 0.3, sx + 0.05, y + 0.05, pz1 - 0.3, { shadow: false });
    for (let z = pz0 + 0.6; z < pz1 - 0.6; z += 0.45) {
      const k = rng.int(0, 3);
      if (k === 0) d.box('terracotta', sx - 0.08, y + 0.17, z, 0.08, 0.28, 0.08); // leg
      else if (k === 1) d.ellipsoid('terracotta', sx - 0.08, y + 0.1, z, 0.06, 0.06, 0.12, { seg: [6, 4] }); // eyes / womb
      else if (k === 2) d.box('terracotta', sx - 0.08, y + 0.08, z, 0.12, 0.06, 0.18); // foot
      else d.cyl('terracotta', sx - 0.08, y + 0.12, z, 0.05, 0.18, 6); // hand / finger
    }
  }
  // In front of the row of pallets, facing the shelves on the back wall.
  spots.push(spot('temple-aesculapius:votives', 'container', px0 + pd - 1.9, 0.25, (pz0 + pz1) / 2, Math.PI / 2));
  // The sacred well (puteal) at the portico's end and a thank-offering inscription.
  placeProp(d, 'puteal', px0 + pd / 2, 0.25, pz1 + 1.6, 0, { variant: 1 });
  spots.push(spot('temple-aesculapius:well', 'npc', px0 + pd / 2 - 1.1, 0.25, pz1 + 1.6, Math.PI / 2));
  inscriptionPanel(b, { lines: ['AESCVLAPIO·DEO', 'VOTVM·SOLVIT·LIBENS·MERITO'], width: 1.5, height: 0.6, style: 'carved' }, T(px0 + pd - 0.01, 3.1, (pz0 + pz1) / 2).multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2)), { depth: 0.04 });
  spots.push(spot('temple-aesculapius:ex-voto', 'inscription', px0 + pd - 1.6, 0.25, (pz0 + pz1) / 2 + 0.8, Math.PI / 2));
  riverLife(ctx, spots);
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

/** A coiled serpent (Aesculapius' snake) lying on a surface at y = 0, ~`r` across. */
function serpent(d: ReturnType<typeof draw>, r: number, hi: boolean) {
  const pts: THREE.Vector3[] = [];
  const n = hi ? 40 : 16;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const a = t * Math.PI * 4.2;
    const rr = r * (1 - t * 0.6);
    pts.push(V(Math.cos(a) * rr, 0.04 + t * 0.12, Math.sin(a) * rr));
  }
  pts.push(V(pts[n].x + 0.06, 0.24, pts[n].z - 0.04));
  d.geo(tube(pts, (i) => 0.035 * (i < n - 2 ? 1 : 0.7), hi ? 6 : 4), 'bronze');
}

// ------------------------------------------------------------------ the prow

function islandProw(ctx: LandmarkContext) {
  const { S, lm } = ctx;
  const hi = ctx.detail === 'high';
  const b = ctx.builder();
  const env = riverEnv(ctx);
  const d = draw(b);
  const island = atlas.ISLANDS[0];
  const top = island.elevation * S - env.baseY; // island ground (local y)
  const bed = env.bedY;
  // The tip portion of the island outline (local game metres), densified, then pushed out a little
  // so the facing stands in the water where the bank drops.
  const all = island.outline.map(([x, z]) => env.local(x, z));
  const R = 18 * S;
  const sel: V2[] = [];
  const n = all.length;
  // Walk the outline, keep the run of vertices near the prow (the tip), in order.
  let start = -1;
  for (let i = 0; i < n; i++) if (Math.hypot(all[i][0], all[i][1]) < R && Math.hypot(all[(i - 1 + n) % n][0], all[(i - 1 + n) % n][1]) >= R) start = i;
  if (start < 0) start = 0;
  for (let k = -1; k <= n; k++) {
    const p = all[(start + k + n) % n];
    if (k >= 0 && Math.hypot(p[0], p[1]) >= R) {
      sel.push(p);
      break;
    }
    sel.push(p);
  }
  const line = densify(sel, 1.0).filter(([x, z]) => Math.hypot(x, z) < R);
  // Island centroid (local) tells which side of the outline is water.
  let cx = 0, cz = 0;
  for (const [x, z] of all) {
    cx += x / n;
    cz += z / n;
  }
  // The facing stands where the bank meets the water: march outward from the outline to the
  // waterline (the terrain module may shape the tip differently), then smooth.
  const unit = offsetAway(line, 1, [cx, cz]).map((p, i) => [p[0] - line[i][0], p[1] - line[i][1]] as V2);
  let face: V2[] = line.map((p, i) => {
    const [nx, nz] = unit[i];
    let s = 0;
    while (s < 5 && ctx.groundAt(p[0] + nx * s, p[1] + nz * s) > env.waterY + 0.25) s += 0.3;
    return [p[0] + nx * (s + 0.7), p[1] + nz * (s + 0.7)] as V2;
  });
  for (let pass = 0; pass < 3; pass++) face = face.map((p, i) => (i === 0 || i === face.length - 1 ? p : ([(face[i - 1][0] + 2 * p[0] + face[i + 1][0]) / 4, (face[i - 1][1] + 2 * p[1] + face[i + 1][1]) / 4] as V2)));
  const inner = offsetAway(line, -3.6, [cx, cz]);
  const h0 = bed - 0.5;
  const h1 = top + 0.15;
  // Hull facing: a band of travertine panels from below the bed to the island top, coursed.
  for (let i = 0; i < face.length - 1; i++) {
    const [ax, az] = face[i];
    const [bx, bz] = face[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    if (len < 1e-3) continue;
    const ang = Math.atan2(-(bz - az), bx - ax);
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    d.box('travertine', mx, (h0 + h1) / 2, mz, len + 0.05, h1 - h0, 1.2, { ry: ang, collide: true });
    if (hi) for (let y = h0 + 1.6; y < h1 - 0.3; y += 0.9) d.box('travertine', mx, y, mz, len + 0.06, 0.08, 1.26, { ry: ang }); // strakes
    d.box('travertine', mx, h1 + 0.45, mz, len + 0.05, 0.9, 0.45, { ry: ang, collide: true }); // bulwark / parapet
    d.box('tufa', mx, (h0 + env.waterY + 0.5) / 2, mz, len + 0.06, env.waterY + 0.5 - h0, 1.28, { ry: ang }); // weed-darkened foot
  }
  // Deck over the whole tip inside the facing (closed by the chord between its ends), so the
  // tip reads as a ship's deck.
  buildPlaza(b, face, () => h1 - 0.02, { material: 'paving_travertine', collide: true, lift: 0, cell: 1.5, skirt: 3 });
  void inner;
  // The stem: the sharpest point of the facing gets a projecting stem post and a beak moulding.
  let tipI = 0;
  let best = Infinity;
  for (let i = 0; i < face.length; i++) {
    const p = face[i];
    const dd = Math.hypot(p[0] - 0, p[1] + 30 * S);
    if (dd < best) {
      best = dd;
      tipI = i;
    }
  }
  const tip = face[tipI];
  const prev = face[Math.max(0, tipI - 2)];
  const next = face[Math.min(face.length - 1, tipI + 2)];
  const out = new THREE.Vector2(tip[0] - (prev[0] + next[0]) / 2, tip[1] - (prev[1] + next[1]) / 2).normalize();
  const stemAng = Math.atan2(-out.y, out.x);
  const st = d.at(tip[0] + out.x * 0.5, 0, tip[1] + out.y * 0.5, stemAng + Math.PI / 2);
  st.box('travertine', 0, (h0 + h1 + 1.2) / 2, 0, 0.9, h1 + 1.2 - h0, 0.9, { collide: true });
  // The stem post curls up and back like a ship's prow ornament, with a painted eye either side.
  const curl: THREE.Vector3[] = [];
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 0.9;
    curl.push(V(0, h1 + 1.2 + Math.sin(a) * 0.9, -0.2 + Math.cos(a) * 0.9 - 0.9));
  }
  st.geo(tube(curl, (i) => 0.28 - i * 0.015, 8), 'travertine');
  for (const sx of [-1, 1]) {
    st.ellipsoid('plaster_white', sx * 0.47, h1 - 0.9, 0.4, 0.04, 0.22, 0.34, { seg: [8, 6] });
    st.ellipsoid('black', sx * 0.5, h1 - 0.9, 0.4, 0.03, 0.11, 0.12, { seg: [8, 6] });
  }
  // Relief on the city (left-branch) side, a few metres back from the stem: Aesculapius' bust and
  // his serpent staff, and an ox head (bucranium).
  // Frame on the facing at index i whose local +z points out over the water.
  const outFrame = (i: number) => {
    const ox = face[i][0] - line[i][0], oz = face[i][1] - line[i][1];
    return { at: d.at(face[i][0], 0, face[i][1], Math.atan2(ox, oz)), ang: Math.atan2(ox, oz) };
  };
  const relI = Math.min(face.length - 2, tipI + 5);
  const ra = face[relI];
  const rb = face[relI + 1];
  const { at: rel, ang: rAng } = outFrame(relI);
  const ry = top - 2.4;
  rel.box('travertine', 0, ry, 0.62, 3.4, 2.6, 0.1); // panel frame proud of the face (−z out)
  // staff with the serpent
  rel.cyl('travertine', -0.7, ry, 0.72 + 0.08, 0.07, 2.2, 6);
  const coil: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = i / 24;
    coil.push(V(-0.7 + Math.cos(t * Math.PI * 6) * 0.16, ry - 1.0 + t * 2.0, 0.84 + Math.sin(t * Math.PI * 6) * 0.06));
  }
  rel.geo(tube(coil, 0.05, 5), 'travertine');
  // bust of the god (head and shoulders in high relief)
  rel.ellipsoid('travertine', 0.5, ry - 0.2, 0.75, 0.55, 0.45, 0.16, { seg: [10, 6] });
  rel.ellipsoid('travertine', 0.5, ry + 0.45, 0.78, 0.22, 0.27, 0.16, { seg: [10, 7] });
  // ox head further along
  const ox = outFrame(Math.min(face.length - 1, relI + 4)).at;
  ox.ellipsoid('travertine', 0, top - 1.6, 0.7, 0.32, 0.42, 0.14, { seg: [8, 6] });
  for (const s of [-1, 1]) ox.rod('travertine', V(s * 0.2, top - 1.3, 0.74), V(s * 0.55, top - 1.0, 0.72), 0.06, 5, { rTop: 0.02 });
  const spots: Spot[] = [
    spot('island-prow:bow', 'vista', tip[0] - out.x * 2.5, h1 - 0.02, tip[1] - out.y * 2.5, Math.atan2(out.x, out.y)),
    // On the deck a metre inside the bulwark, looking out and down over the carved panel.
    spot('island-prow:relief', 'inscription', (ra[0] + rb[0]) / 2 - unit[relI][0], h1 - 0.02, (ra[1] + rb[1]) / 2 - unit[relI][1], rAng),
  ];
  void inscriptionPanel;
  void extrudePolygon;
  riverLife(ctx, spots);
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

function densify(pts: V2[], step: number): V2[] {
  const out: V2[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, az] = pts[i];
    const [bx, bz] = pts[i + 1];
    const len = Math.hypot(bx - ax, bz - az);
    const n = Math.max(1, Math.ceil(len / step));
    for (let k = 0; k < n; k++) out.push([ax + ((bx - ax) * k) / n, az + ((bz - az) * k) / n]);
  }
  out.push(pts[pts.length - 1]);
  // Light smoothing so the hull reads as one curve.
  return out.map((p, i) => {
    if (i === 0 || i === out.length - 1) return p;
    const a = out[i - 1], c = out[i + 1];
    return [(a[0] + 2 * p[0] + c[0]) / 4, (a[1] + 2 * p[1] + c[1]) / 4] as V2;
  });
}

// ------------------------------------------------------------------ the obelisk (mast)

function islandObelisk(ctx: LandmarkContext) {
  const { lm } = ctx;
  const b = ctx.builder();
  const hi = ctx.detail === 'high';
  // 14 m real overall: a small red-granite obelisk on a marble pedestal and two steps.
  obelisk(b, { height: 6.4, pedestal: 1.5, hieroglyphs: true, gildedTip: false, pedestalMaterial: 'marble', detail: hi ? 'high' : 'low' });
  b.collider({ kind: 'box', center: new THREE.Vector3(0, 1.0, 0), half: new THREE.Vector3(1.0, 1.0, 1.0) });
  const spots: Spot[] = [
    spot('island-obelisk:glyphs', 'inscription', 0, 0, -2.2, 0),
    spot('island-obelisk:mast', 'vista', 2.2, 0, 0, -Math.PI / 2),
  ];
  riverLife(ctx, spots);
  return { object: b.build(lm.id), colliders: b.colliders, spots };
}

export const builders: LandmarkBuilder[] = [
  { handles: ['temple-aesculapius'], build: templeAesculapius },
  { handles: ['island-prow'], build: islandProw },
  { handles: ['island-obelisk'], build: islandObelisk },
];
