/**
 * Forum of Caesar (Forum Iulium), the Temple of Venus Genetrix and the Basilica Argentaria —
 * capfora crew. All three are freshly rebuilt by Trajan; the temple is rededicated on 12 May 113,
 * the day after the game starts, so it is hung with garlands.
 *
 * Plan (`fcPlan`): ~160 x 75 m overall, laid out on the temple's axis. Double colonnades (two rows
 * of columns) run down both long sides from the SE end to the NW end wall, flanking the temple;
 * behind the SW portico, two storeys of shops (tabernae) from the Curia's corner to the Basilica
 * Argentaria, whose arcade opens onto the portico beside the temple; the gilded Equus Caesaris in
 * the square, the Appiades fountain before the temple's rostrum.
 *
 * Temple: Corinthian octastyle peripteros sine postico, pycnostyle, on a 5 m podium with a central
 * rostrum and two lateral flights within the front; Trajanic frieze of cupids among acanthus;
 * festoons; enterable cella with an apse for Arcesilaus' Venus Genetrix, the gilded Cleopatra and
 * Timomachus' paintings.
 */
import * as THREE from 'three';
import { arcade } from '../../../arch/classical/arch';
import { column } from '../../../arch/classical/column';
import { equestrian, togate } from '../../../arch/classical/statues';
import { templeLayout } from '../../../arch/classical/temple';
import { podium } from '../../../arch/classical/podium';
import { T, TRS, mul } from '../../../arch/common/geom';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { farColonnade, farWall, leanTo, templeFar } from './capfora/far';
import { S, landmark, realLocal, relMatrix, sharedFloor, spotAt, type CapSpot } from './capfora/frame';
import { basin, box, festoon, figure, footing, groundMin, inscription, span, stairsToGround } from './capfora/ornament';
import { PAINT, friezeRelief, paint } from './capfora/paint';
import { forumPortico } from './capfora/portico';
import { tabernae } from './capfora/tabernae';
import { capTemple } from './capfora/temple';
import { brazier, cellaLamps } from './capfora/life';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props/props';

/**
 * The square's paving: one absolute level for the forum, its temple and its basilica, 1.32 m above
 * the forum's pad (the pads of the Forum of Augustus and the basilica raise the ground by up to
 * 1.2 m inside the forum, so the floor must clear them).
 */
const FLOOR_ABOVE_PAD = 1.32;
const floorY = (ctx: LandmarkContext) => sharedFloor(ctx, 'forum-caesar', FLOOR_ABOVE_PAD);

// ------------------------------------------------------------------ the temple's plan

const VG_SPEC = {
  order: 'corinthian' as const,
  plan: 'sine_postico' as const,
  front: 8,
  sides: 9,
  D: 1.5 * S,
  columnHeight: 15 * S,
  intercolumniation: 'pycnostyle' as const,
  podiumHeight: 5 * S,
  stairs: 'none' as const,
  material: 'marble' as MaterialId,
  podiumMaterial: 'marble' as MaterialId,
  pitchDeg: 13.5,
};

/** Key lines of the temple in its own frame (game m): stylobate, rostrum, flights. */
export function vgPlan() {
  const L = templeLayout(VG_SPEC);
  const P = L.podiumHeight;
  const { count, rise } = stepCount(P, 0.215);
  const run = 0.34;
  const flight = count * run;
  const dz = 1.5; // the whole temple sits 1.5 m back from the atlas centre
  const s = { x0: L.stylobate.x0, x1: L.stylobate.x1, z0: L.stylobate.z0 + dz, z1: L.stylobate.z1 + dz };
  const rw = 3.2; // rostrum half-width
  const wing = 2.0;
  const front = s.z0 - flight - 0.4;
  return { L, P, count, rise, run, flight, dz, s, rw, wing, front };
}

// ------------------------------------------------------------------ the forum's plan

/**
 * The forum's plan in ITS frame (game m): the axis `xa` is the temple's; the front row of each
 * portico stands `W2` off it (the portico steps clear the temple's podium by 1.5 m), the back walls
 * `half` off it; the shops (6 m deep) run behind the SW portico from the Curia's rear corner
 * (`zShops`) to the basilica (`zBas`); the NW end wall closes behind the temple.
 */
export function fcPlan(game: LandmarkContext['game']) {
  const fctx = { game, lm: landmark('forum-caesar') };
  const tp = new THREE.Vector3().setFromMatrixPosition(relMatrix(fctx, 'temple-venus-genetrix'));
  const bp = new THREE.Vector3().setFromMatrixPosition(relMatrix(fctx, 'basilica-argentaria'));
  const xa = tp.x;
  const W2 = 11.8;
  const depth = 12 * S;
  const half = W2 + depth;
  const wallT = 0.6;
  const shopD = 6.0;
  const zSE = -80 * S + 0.8;
  const zNW = 80 * S;
  const zBas = bp.z - 23 * S;
  // The Curia's rear corner stands behind the SE end of the SW side: the shops stop short of it.
  const cu = landmark('curia-julia');
  let zShops = zSE;
  if (cu.footprint.kind === 'rect') {
    const th = (cu.rotation * Math.PI) / 180;
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const lx = (sx * cu.footprint.w) / 2;
      const lz = (sz * cu.footprint.d) / 2;
      const [fx, fz] = realLocal(fctx.lm, cu.center[0] + lx * Math.cos(th) - lz * Math.sin(th), cu.center[1] + lx * Math.sin(th) + lz * Math.cos(th));
      if (fx * S < xa + half + wallT + shopD) zShops = Math.max(zShops, fz * S + 1.0);
    }
  }
  return { tp, xa, W2, depth, half, wallT, shopD, zSE, zNW, zBas, zShops, colNE: xa - W2, colSW: xa + W2 };
}

// ------------------------------------------------------------------ the forum

function buildForum(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const Y0 = floorY(ctx);
  const I = new THREE.Matrix4();
  const P = fcPlan(ctx.game);
  const { xa, W2, depth, half, wallT, zSE, zNW, zBas, zShops, colNE, colSW } = P;
  const vg = vgPlan();
  const zTempleFront = P.tp.z + vg.front; // rostrum face
  const hi = detail === 'high';

  // ---- the square: white marble before the temple, travertine flags down the rest, on one bed
  const gmin = groundMin(g, xa - half - wallT, zSE, xa + half + P.shopD, zNW);
  span(b, 'travertine', xa - half, Math.min(-0.3, gmin - 0.3), zSE - 0.4, xa + half, Y0 - 0.04, zNW, I, true);
  span(b, 'paving_travertine', colNE + 0.5, Y0 - 0.04, zSE - 0.4, colSW - 0.5, Y0, zNW, I);
  span(b, 'marble', colNE + 0.5, Y0 - 0.035, zTempleFront - 3, colSW - 0.5, Y0 + 0.002, zNW, I);
  if (hi) for (let z = zSE + 4; z < zTempleFront - 4; z += 4.5) span(b, 'marble', colNE + 0.5, Y0 - 0.035, z - 0.1, colSW - 0.5, Y0 + 0.004, z + 0.1, I);

  // ---- double porticoes the whole length: NE (faces +x, statues in niches in its marble back
  // wall) and SW (faces −x; the shops and the basilica open off it)
  const L = zNW - zSE;
  const pSpec = {
    length: L,
    depth,
    order: 'corinthian' as const,
    H: 8 * S,
    spacing: 2.8,
    material: 'marble' as MaterialId,
    fluted: true,
    detail,
    columnDetail: 'low' as Detail,
    floorY: 0.4,
    groundMin: gmin,
    wallThickness: wallT,
    frieze: hi ? friezeRelief('cupids') : undefined,
    innerRow: depth / 2,
  };
  const ne = forumPortico(
    b,
    {
      ...pSpec,
      wallMaterial: 'marble',
      openings: Array.from({ length: Math.floor(L / 7.5) }, (_, k) => ({ kind: 'niche' as const, x: 3.75 + k * 7.5, width: 1.2, height: 2.9, sill: 0.7, depth: 0.35 })),
      nicheStatues: 'togate',
      endWalls: [true, false],
    },
    mul(I, TRS(colNE, Y0, zSE, 0, -Math.PI / 2, 0)),
  );
  forumPortico(b, { ...pSpec, wallMaterial: 'none', endWalls: [false, true] }, mul(I, TRS(colSW, Y0, zNW, 0, Math.PI / 2, 0)));
  const wallTop = Y0 + ne.wallTop;
  const yb = Math.min(-0.5, gmin - 0.4);
  // SE of the shops (the Curia's rear stands behind) a plain wall closes the SW portico.
  if (zShops > zSE + 0.5) span(b, 'marble', xa + half, yb, zSE - 0.4, xa + half + wallT, wallTop, zShops, I, true);
  // NW end wall behind the temple.
  span(b, 'marble', xa - half - wallT, yb, zNW, xa + half + wallT, wallTop, zNW + wallT, I, true);

  // ---- the shops behind the SW portico (two storeys, the Trajanic upper floor)
  const tab = tabernae(
    b,
    {
      length: zBas - zShops,
      depth: P.shopD,
      storeyH: 3.4,
      storeys: 2,
      material: 'brick',
      detail,
      seed: 'forum-caesar',
      groundMin: gmin,
      open: [
        { index: 2, kind: 'moneychanger' },
        { index: 5, kind: 'textile' },
        { index: 9, kind: 'moneychanger' },
        { index: 12, kind: 'wine' },
      ],
      passages: [7],
    },
    mul(I, TRS(xa + half, Y0 + 0.4, zBas, 0, Math.PI / 2, 0)),
  );
  for (const s of tab.shops) {
    if (!s.open) continue;
    const z = zBas - s.x;
    spots.push(spotAt(`taberna-${Math.round(s.x)}`, 'vendor', xa + half + 1.5, Y0 + 0.4, z, xa, z, { label: s.kind === 'moneychanger' ? 'Argentarius (money-changer)' : `Shopkeeper (${s.kind})` }));
  }

  // ---- the SE end: steps down to the Argiletum
  {
    stairsToGround(b, g, Y0, 2 * W2 - 3.4, T(xa, 0, zSE - 0.4));
    spots.push(spotAt('entrance', 'spawn', xa, Y0, zSE + 3, xa, zSE + 20, { label: 'Forum of Caesar' }));
  }

  // ---- the Equus Caesaris: gilded bronze on a marble base, in front of the temple
  {
    const ez = zTempleFront - 9;
    span(b, 'marble', xa - 1.3, Y0, ez - 2.4, xa + 1.3, Y0 + 2.0, ez + 2.4, I, true);
    span(b, 'marble', xa - 1.45, Y0 + 1.9, ez - 2.55, xa + 1.45, Y0 + 2.1, ez + 2.55, I);
    equestrian(b, mul(I, TRS(xa, Y0 + 2.1, ez, 0, 0, 0, 1.25)), { material: 'gilded_bronze', detail: hi ? 'high' : 'low', plinth: false });
    const text = inscription(b, ['C IVLIO CAESARI', 'DICTATORI'], 2.2, 0.7, mul(I, T(xa, Y0 + 1.1, ez - 2.42)), 'carved');
    spots.push(
      spotAt('equus-caesaris', 'inscription', xa, Y0, ez - 5, xa, ez, {
        label: 'The Equus Caesaris',
        text,
        gloss: "Caesar's horse, they say, had almost human forefeet and would let no one else ride it; he set up its statue before the temple of Venus Genetrix (Suetonius, Iul. 61). The base text is a reconstruction.",
      }),
    );
  }
  spots.push(spotAt('festival-crowd', 'npc', xa + 3, Y0, zTempleFront - 4, xa, zTempleFront, { label: 'Crowd gathering for the rededication (12 May)' }));

  // ---- the eve of the rededication (12 May 113): the square is being dressed for the ceremony
  {
    const d = new Draw(b);
    // Tripod incense burners down the axis between the Equus and the SE end, garlanded posts
    // between them (festoons hung post to post), torches lit at dusk.
    const zs: number[] = [];
    for (let z = zTempleFront - 16; z > zSE + 8; z -= 9) zs.push(z);
    for (const [i, z] of zs.entries()) {
      for (const sx of [-1, 1]) {
        const x = xa + sx * 5.8;
        brazier(ctx, b, x, Y0, z);
        // Garland pole with a laurel crown and ribbons.
        span(b, 'wood_painted', x - 0.06, Y0, z + 2.2 - 0.06, x + 0.06, Y0 + 3.4, z + 2.2 + 0.06, I, true);
        if (i > 0) festoon(b, new THREE.Vector3(x, Y0 + 3.3, z + 2.2), new THREE.Vector3(x, Y0 + 3.3, z + 2.2 + 9), { sag: 0.9, r: 0.12, detail: hi ? 'high' : 'low' });
      }
    }
    // Wooden stands for the senators and the magistrates along the NE portico (seats 0.45 m).
    {
      const x0 = colNE + 2.4;
      const zA = zSE + 14;
      const zB = zSE + 30;
      for (let r = 0; r < 4; r++) {
        const h = 0.45 * (r + 1);
        span(b, 'wood', x0 + r * 0.75, Y0, zA, x0 + (r + 1) * 0.75, Y0 + h, zB, I, true);
      }
      span(b, 'fabric_red', x0 - 0.05, Y0 + 0.1, zA - 0.02, x0 + 0.02, Y0 + 0.45, zB + 0.02, I);
      // The steps up the stand at its ends (0.225 m risers).
      for (const z of [zA - 0.9, zB + 0.1]) for (let r = 0; r < 8; r++) span(b, 'wood', x0 + r * 0.375, Y0, z, x0 + (r + 1) * 0.375, Y0 + 0.225 * (r + 1), z + 0.8, I, true);
      spots.push(spotAt('stands', 'sit', x0 + 1.9, Y0 + 1.35, (zA + zB) / 2, xa, (zA + zB) / 2, { label: 'Stands for the senators at the rededication' }));
    }
    // Garland and incense sellers on the square before the SW portico, the counters facing the
    // square, and workmen with ladders by the temple.
    const sx0 = colSW - 3.4;
    const stallZ = [zSE + 8, zSE + 22, zSE + 36];
    stallZ.forEach((z, i) => {
      placeProp(d, i === 1 ? 'stall_cloth' : 'stall_fruit', sx0, Y0, z, Math.PI / 2, { collide: true });
      spots.push(spotAt(`stall-${i}`, 'stall', sx0 + 1.25, Y0, z, sx0 - 6, z, { label: i === 1 ? 'Seller of ribbons and festive wreaths' : 'Garland seller (roses and laurel for 12 May)' }));
    });
    placeProp(d, 'amphora_stack', sx0 + 0.4, Y0, zSE + 29, Math.PI / 2, { collide: true });
    spots.push(spotAt('herald', 'npc', xa - 2, Y0, zSE + 6, xa, zSE + 20, { label: 'Herald announcing the rededication by the Emperor tomorrow' }));
    spots.push(spotAt('praeco-notice', 'inscription', xa + 7.5, Y0, zSE + 4, xa + 9, zSE + 2.5, {
      label: 'Painted notice of the rededication',
      text: 'IV IDVS MAIAS / IMP CAESAR NERVA TRAIANVS AVG / AEDEM VENERIS GENETRICIS / DEDICABIT',
      gloss: 'On the fourth day before the Ides of May the Emperor Caesar Nerva Trajan Augustus will dedicate the temple of Venus Genetrix. (A painted notice; the Column in his forum is dedicated the same day.)',
    }));
    // The notice board itself (painted, on two posts).
    for (const dx of [-0.8, 0.8]) span(b, 'wood_dark', xa + 9 + dx - 0.06, Y0, zSE + 2.5 - 0.06, xa + 9 + dx + 0.06, Y0 + 2.2, zSE + 2.5 + 0.06, I, true);
    inscription(b, ['IV IDVS MAIAS', 'IMP CAESAR NERVA TRAIANVS AVG', 'AEDEM VENERIS GENETRICIS', 'DEDICABIT'], 1.9, 0.95, TRS(xa + 9, Y0 + 1.55, zSE + 2.5 - 0.04, 0, Math.PI, 0), 'painted', { ground: '#efe6d2', ink: '#a3271f' });
  }
  // A marble bench against the NE back wall, between two niches.
  {
    const zb = zSE + 7.5 * 5;
    const xb = colNE - depth;
    span(b, 'marble', xb + 0.02, Y0 + 0.4, zb - 1.3, xb + 0.5, Y0 + 0.85, zb + 1.3, I, true);
    spots.push(spotAt('portico-ne', 'sit', xb + 0.75, Y0 + 0.4, zb, colNE + 3, zb, { label: 'Bench in the NE portico' }));
  }
}

// ------------------------------------------------------------------ the temple

function buildVenusGenetrix(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const Y0 = floorY(ctx);
  const vg = vgPlan();
  const { L, P, s, rw, wing, front } = vg;
  const at = T(0, Y0, vg.dz);
  const m = at;
  footing(b, 'travertine', ctx.groundAt, s.x0, front, s.x1, s.z1, Y0, undefined, false);
  // Rostrum and the two lateral flights in front of the porch, within the temple's width.
  podium(b, { outline: [[-rw, front - vg.dz], [rw, front - vg.dz], [rw, s.z0 - vg.dz], [-rw, s.z0 - vg.dz]], height: P, material: 'marble', topMaterial: 'paving_travertine', detail }, m);
  for (const sx of [-1, 1]) {
    const xw0 = sx > 0 ? s.x1 - wing : s.x0;
    const xw1 = sx > 0 ? s.x1 : s.x0 + wing;
    podium(b, { outline: [[xw0, front - vg.dz], [xw1, front - vg.dz], [xw1, s.z0 - vg.dz], [xw0, s.z0 - vg.dz]], height: P, material: 'marble', topMaterial: 'paving_travertine', detail }, m);
    const fx0 = sx > 0 ? rw : s.x0 + wing;
    const fx1 = sx > 0 ? s.x1 - wing : -rw;
    stairs(b, { width: fx1 - fx0, rise: vg.rise, run: vg.run, count: vg.count, material: 'marble' }, mul(m, T((fx0 + fx1) / 2, 0, front - vg.dz)));
    // Landing between the flight and the porch.
    span(b, 'marble', fx0, 0, s.z0 - vg.dz - 0.4 - 0.02, fx1, P, s.z0 - vg.dz, m, true);
  }
  const res = capTemple(
    b,
    {
      ...VG_SPEC,
      detail,
      roofMaterial: 'roof_tile',
      doorMaterial: 'bronze',
      tympanum: paint(PAINT.blue, 0.85),
      frieze: friezeRelief('cupids'),
      festoons: true,
      interior: true,
      hiColumns: 'front',
      innerColumns: 4,
      apse: 0.85,
      furnish: (bb, info) => {
        const zc = info.z1 - ((info.x1 - info.x0) / 2) * 0.85 - 0.05;
        const y = info.y + 0.9;
        // Venus Genetrix (Arcesilaus): draped, the apple of Paris in her hand.
        figure(bb, 'draped', mul(info.at, TRS(0, y, zc + 1.0, 0, 0, 0)), { scale: 2.7, material: 'marble', detail: info.detail });
        box(bb, 'gilded_bronze', 0.75, y + 2.75, zc + 0.55, 0.16, 0.16, 0.16, info.at);
        // The gilded Cleopatra that Caesar set beside the goddess.
        figure(bb, 'draped', mul(info.at, TRS(2.6, info.y, zc - 0.6, 0, -0.35, 0)), { scale: 1.15, material: 'gilded_bronze', detail: info.detail });
        span(bb, 'marble', 2.1, info.y, zc - 1.1, 3.1, info.y + 0.05, zc - 0.1, info.at);
        // Timomachus' Ajax and Medea: two panel paintings on the side walls.
        for (const sx of [-1, 1]) {
          const x = sx < 0 ? info.x0 + 0.06 : info.x1 - 0.06;
          const z = (info.z0 + zc) / 2;
          span(bb, 'wood_dark', x - 0.05, info.y + 2.0, z - 1.3, x + 0.05, info.y + 4.0, z + 1.3, info.at);
          span(bb, paint(sx < 0 ? PAINT.redOchre : PAINT.blue, 0.9), x - sx * 0.06 - 0.01, info.y + 2.15, z - 1.15, x - sx * 0.06 + 0.01, info.y + 3.85, z + 1.15, info.at);
        }
        cellaLamps(ctx, bb, info.at, 0, info.y, zc - 2.2, 4.4);
        // The corslet of British pearls on a stand.
        span(bb, 'marble', -3.1, info.y, zc - 1.0, -2.3, info.y + 1.0, zc - 0.2, info.at, true);
        box(bb, 'fabric_white', -2.7, info.y + 1.35, zc - 0.6, 0.45, 0.6, 0.25, info.at);
      },
    },
    m,
  );
  // The Appiades fountain before the rostrum: a long basin with five nymphs.
  {
    const fz = front - 1.6 + vg.dz * 0;
    basin(b, 6.2, 1.8, 0.55, T(0, Y0, front - 1.3), { material: 'marble' });
    for (let k = 0; k < 5; k++) {
      const x = -2.4 + k * 1.2;
      span(b, 'marble', x - 0.2, Y0, front - 1.4, x + 0.2, Y0 + 0.8, front - 1.0, undefined, false);
      figure(b, 'draped', TRS(x, Y0 + 0.8, front - 1.2, 0, 0, 0), { scale: 0.75, material: 'bronze', detail });
    }
    spots.push(spotAt('appiades', 'shrine', 0, Y0, fz - 2.8, 0, fz, { label: 'The Appiades fountain' }));
  }
  // Festoons on the rostrum's front and garlands on the cella doors (12 May 113).
  for (const sx of [-1, 1]) festoon(b, new THREE.Vector3(sx * rw, Y0 + P - 0.15, front - 0.05), new THREE.Vector3(0, Y0 + P - 0.15, front - 0.05), { sag: 0.7, r: 0.16, detail, ribbons: true });
  // Rededication inscription on the architrave (reconstructed text).
  const archY = Y0 + P + L.H + 0.33;
  const text = inscription(b, ['VENERI GENETRICI IMP CAESAR NERVA TRAIANVS AVG GERM DACICVS PONT MAX TR POT XVII IMP VI COS VI P P RESTITVIT'], L.spanX * 0.9, 0.42, mul(at, T(0, archY, L.entablature.z0 - 0.03)), 'bronze');
  spots.push(
    spotAt('dedication', 'inscription', 0, Y0, front - 6.5, 0, front, {
      label: 'Rededication of the Temple of Venus Genetrix',
      text,
      gloss: 'To Venus the Mother: the Emperor Caesar Nerva Trajan Augustus, conqueror of Germany and Dacia, pontifex maximus, in his 17th year of tribunician power, six times hailed imperator, six times consul, father of his country, restored (this temple). Rededicated 12 May 113. (Reconstructed text.)',
    }),
  );
  spots.push(spotAt('rostrum', 'vista', 0, Y0 + P, front + 0.8, 0, front - 30, { label: 'The rostrum of Venus Genetrix' }));
  spots.push(spotAt('forum', 'spawn', 3.6, Y0, front - 6.5, 0, front, { label: 'Before the Temple of Venus Genetrix' }));
  spots.push(spotAt('workmen', 'npc', s.x1 + 0.6, Y0, s.z0 + 4, s.x1 + 0.6, s.z0 + 10, { label: 'Marble workers finishing the cupid frieze' }));
  if (res.interior) {
    const it = res.interior;
    spots.push(spotAt('cult-statue', 'shrine', 0, it.y + Y0, it.z1 + vg.dz - 7, 0, it.z1 + vg.dz, { label: 'Venus Genetrix, ancestress of the Julii' }));
    spots.push(spotAt('pearl-corslet', 'container', -2.7, it.y + Y0, it.z1 + vg.dz - 6.2, -2.7, it.z1 + vg.dz - 4, { label: 'Corslet of British pearls (dedicated by Caesar)' }));
  }
}

// ------------------------------------------------------------------ the Basilica Argentaria

function buildBasilica(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const hw = (46 * S) / 2;
  // Behind the forum's SW portico: the hall's front is the portico's back line (the two frames are
  // exactly a right angle apart, so that line is z = const here), 14 m deep.
  const P = fcPlan(ctx.game);
  const fm = relMatrix(ctx, 'forum-caesar');
  const z0 = new THREE.Vector3(P.xa + P.half, 0, 0).applyMatrix4(fm).z;
  const z1 = z0 + 14 * S;
  const Yf = floorY(ctx); // the forum's paving in this frame
  const fy = Yf + 0.62; // one step up from the portico floor (Yf + 0.4)
  const gmin = groundMin(g, -hw - 2, z0 - 2, hw + 2, z1 + 2);
  span(b, 'tufa', -hw, Math.min(-0.3, gmin - 0.3), z0, hw, fy, z1, I, true);
  span(b, 'paving_travertine', -hw, fy - 0.03, z0, hw, fy, z1, I);
  // The stretch of the front that opens onto the portico (SE of the forum's NW end wall).
  const xCut = Math.max(-hw, Math.min(hw, new THREE.Vector3(P.xa + P.half, 0, P.zNW + P.wallT).applyMatrix4(fm).x));
  // Two-storey arcade of tufa piers with travertine trim along the NE front.
  const bays = 9;
  const bay = (2 * hw) / bays;
  arcade(
    b,
    {
      bays,
      bay,
      pier: bay * 0.32,
      depth: 1.0,
      storeys: [
        { order: 'tuscan', height: 5.2 },
        { order: 'tuscan', height: 4.4, pedestal: 0.9 },
      ],
      material: 'tufa',
      detail,
      columnDetail: 'low',
      corridor: 0,
    },
    T(-hw, fy, z0 + 0.5),
  );
  const H = fy + 5.2 + 4.4;
  // Upper floor, back and end walls, roof.
  span(b, 'wood_dark', -hw, fy + 5.0, z0 + 1.0, hw, fy + 5.25, z1 - 0.6, I, true);
  wall(b, { length: 2 * hw, height: H, thickness: 0.8, material: 'brick', detail, openings: [{ kind: 'door', x: hw * 0.35, width: 2.4, height: 3.2, leaves: 'open' }, { kind: 'door', x: hw * 1.65, width: 2.4, height: 3.2, leaves: 'open' }], collide: true }, TRS(hw, 0, z1 - 0.4, 0, Math.PI, 0));
  for (const sx of [-1, 1]) span(b, 'brick', sx * hw - (sx > 0 ? 0 : 0.8), 0, z0, sx * hw + (sx > 0 ? 0.8 : 0), H, z1, I, true);
  const rise = (z1 - z0) * 0.25;
  leanTo(b, 'roof_tile', -hw - 0.8, hw + 0.8, z0 + 0.2, H + 0.2, z1, H + rise, I);
  // The stairs at the SW (back) end: two flights up to the doors from the lower ground behind.
  for (const x of [-hw * 0.65, hw * 0.65]) {
    const gb = g(x, z1 + 3);
    if (fy - gb > 0.2) {
      const { count, rise: r } = stepCount(fy - gb, 0.19);
      stairs(b, { width: 2.4, rise: r, run: 0.34, count, material: 'travertine' }, TRS(x, gb, z1 + count * 0.34, 0, Math.PI, 0));
    }
  }
  // The bankers' tables (mensae argentariae) with scales and coin heaps, a strongbox.
  for (let k = 0; k < 4; k++) {
    const x = -hw + bay * (1.5 + k * 2);
    const z = z0 + 3.4;
    span(b, 'marble', x - 0.9, fy, z - 0.4, x + 0.9, fy + 0.95, z + 0.4, I, true);
    if (detail === 'high') {
      box(b, 'bronze', x - 0.4, fy + 1.0, z, 0.3, 0.06, 0.3, I);
      box(b, 'gilded_bronze', x + 0.3, fy + 0.99, z - 0.1, 0.12, 0.05, 0.12, I);
      box(b, 'bronze', x + 0.5, fy + 0.99, z + 0.1, 0.1, 0.04, 0.1, I);
    }
    spots.push(spotAt(`mensa-${k}`, 'vendor', x, fy, z + 1.0, x, z, { label: 'Argentarius at his table' }));
  }
  box(b, 'wood_dark', hw - 2.2, fy + 0.45, z1 - 1.6, 1.2, 0.9, 0.8, I, true);
  box(b, 'iron', hw - 2.2, fy + 0.92, z1 - 1.6, 1.25, 0.06, 0.85, I);
  spots.push(spotAt('strongbox', 'container', hw - 2.2, fy, z1 - 2.6, hw - 2.2, z1 - 1.6, { label: 'Strongbox of the argentarii (owned)' }));
  // Schoolboys' graffito scratched on a pier: the first line of Aeneid II.
  const text = inscription(b, ['CONTICVERE OMNES', 'INTENTIQVE ORA TENEBANT'], 1.4, 0.5, mul(I, TRS(-hw + bay * 4, fy + 1.6, z0 + 0.5 + 0.5 + 0.03, 0, Math.PI, 0)), 'painted', { ground: '#d9cdb8', ink: '#3a3530' });
  spots.push(
    spotAt('graffito', 'inscription', -hw + bay * 4, fy, z0 + 2.4, -hw + bay * 4, z0 + 1, {
      label: 'A schoolboy’s graffito',
      text,
      gloss: '“All fell silent and held their gaze intent” — the opening of Aeneid II, scratched by a pupil of the school that meets here between the bankers’ tables.',
    }),
  );
  // In the SW portico before the arcade.
  spots.push(spotAt('portico', 'spawn', (xCut + hw) / 2, Yf + 0.4, z0 - 2.2, (xCut + hw) / 2, z0, { label: 'The Basilica Argentaria, off the portico of the Forum of Caesar' }));
}

// ------------------------------------------------------------------ far stand-ins

function forumFar(ctx: LandmarkContext) {
  const Y0 = floorY(ctx);
  return (b: MeshBuilder) => {
    const P = fcPlan(ctx.game);
    const { xa, half, depth, zSE, zNW } = P;
    span(b, 'paving_travertine', xa - half, -0.4, zSE, xa + half, Y0, zNW, undefined);
    for (const sd of [-1, 1]) {
      farWall(b, sd > 0 ? 'brick' : 'marble', xa + sd * (half + 0.3), zSE, xa + sd * (half + 0.3), zNW, 0.6, -0.5, 8.5);
      const xc = xa + sd * P.W2;
      leanTo(b, 'roof_tile', Math.min(xc, xa + sd * half), Math.max(xc, xa + sd * half), zSE, 6.6, zNW, 7.6);
      farColonnade(b, 'marble', zSE, zNW, 0, Y0 + 0.4, 4.8, 34, 0.5, TRS(xc, 0, 0, 0, -Math.PI / 2, 0));
      void depth;
    }
    // The shops' block behind the SW portico.
    span(b, 'brick', xa + half, -0.4, P.zShops, xa + half + P.shopD, Y0 + 7.4, P.zBas, undefined);
  };
}

const vgFar = (ctx: LandmarkContext) => (b: MeshBuilder) => {
  const Y0 = floorY(ctx);
  const vg = vgPlan();
  templeFar(b, vg.L, T(0, Y0, vg.dz), { podium: 'marble' });
  span(b, 'marble', -vg.rw, Y0, vg.front, vg.rw, Y0 + vg.P, vg.s.z0, undefined);
};

function basilicaFar(ctx: LandmarkContext) {
  return (b: MeshBuilder) => {
    const hw = (46 * S) / 2;
    const P = fcPlan(ctx.game);
    const z0 = new THREE.Vector3(P.xa + P.half, 0, 0).applyMatrix4(relMatrix(ctx, 'forum-caesar')).z;
    const z1 = z0 + 14 * S;
    const top = floorY(ctx) + 10.2;
    span(b, 'tufa', -hw, 0, z0, hw, top, z1, undefined);
    leanTo(b, 'roof_tile', -hw, hw, z0, top, z1, top + 2, undefined);
  };
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['forum-caesar'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildForum(ctx, b, d, spots), { far: ctx.detail === 'high' && forumFar(ctx), cull: 320 }),
  },
  {
    handles: ['temple-venus-genetrix'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildVenusGenetrix(ctx, b, d, spots), { far: ctx.detail === 'high' && vgFar(ctx), cull: 330 }),
  },
  {
    handles: ['basilica-argentaria'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildBasilica(ctx, b, d, spots), { far: ctx.detail === 'high' && basilicaFar(ctx), cull: 280 }),
  },
];
