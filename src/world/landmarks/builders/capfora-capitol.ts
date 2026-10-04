/**
 * The Capitolium: the Temple of Jupiter Optimus Maximus with the Area Capitolina, the Temple of
 * Jupiter Tonans at the precinct's gate, and the Tarpeian Rock — capfora crew.
 *
 * Jupiter Optimus Maximus is Domitian's rebuilding (c. AD 82) on the archaic platform: a widely
 * spaced Corinthian hexastyle of Pentelic marble with a deep porch (three rows of six) and
 * colonnaded flanks, a triple cella (Minerva, Jupiter, Juno), gilded doors and the gilded bronze
 * roof tiles that flash over the whole city, Jupiter's quadriga on the apex and gilded figures on
 * the corners. Domitian put only his own name on it; since his damnatio memoriae it has been
 * chiselled away. The Area Capitolina round it (see `areaCapitolina`) is crowded with the great
 * altar, votive statues, honorific columns, trophies, the shrines of Fides, Ops, Mens, Venus Erucina
 * and Jupiter Feretrius, the bronze tablets of the laws, a portico on the west brink and the Arch of
 * Scipio over the gate stair.
 */
import * as THREE from 'three';
import { plainArch } from '../../../arch/classical/arch';
import { column } from '../../../arch/classical/column';
import { equestrian, seatedDeity } from '../../../arch/classical/statues';
import { templeLayout } from '../../../arch/classical/temple';
import { T, TRS, gridSurface, linspace, mul, type V2 } from '../../../arch/common/geom';
import type { Opening } from '../../../arch/common/walls';
import { stairs, stepCount } from '../../../arch/common/stairs';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { farColonnade, farWall, leanTo, templeFar } from './capfora/far';
import { S, padY, spotAt, type CapSpot } from './capfora/frame';
import { altar, box, figure, footing, groundMin, inscription, labrum, pedestalStatue, post, span, stairsToGround, terrace, trophy } from './capfora/ornament';
import { forumPortico } from './capfora/portico';
import { cliffFace } from './capfora/cliff';
import { addLamp, brazier, lampstand, plantTrees, torch } from './capfora/life';
import { PAINT, friezeRelief, paint } from './capfora/paint';
import { capTemple, smallTemple } from './capfora/temple';

// ------------------------------------------------------------------ Jupiter Optimus Maximus

const JOM_SPEC = {
  order: 'corinthian' as const,
  plan: 'sine_postico' as const,
  front: 6,
  sides: 6,
  pronaos: 2,
  D: 2.0 * S,
  columnHeight: 19.5 * S,
  intercolumniation: 'diastyle' as const,
  podiumHeight: 5 * S,
  material: 'marble' as MaterialId,
  podiumMaterial: 'tufa' as MaterialId,
  pitchDeg: 13.5,
};
/** The archaic platform is 53 m wide: the podium grows this far beyond the stylobate. */
const JOM_MARGIN = (53 * S) / 2;

function jomPlan() {
  const L = templeLayout(JOM_SPEC);
  const margin = JOM_MARGIN - L.stylobate.x1;
  const front = L.stairs.z0;
  const back = L.stylobate.z1 + margin;
  const dz = -(front + back) / 2; // centre the whole (stair to back) on the atlas centre
  return { L, margin, dz, front: front + dz, back: back + dz };
}

function buildJOM(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const { L, margin, dz, front } = jomPlan();
  const at = T(0, 0, dz);
  const hw = JOM_MARGIN;
  // The platform's foundations down the slopes (the west cliff falls away beside it).
  footing(b, 'tufa', g, -hw, front, hw, L.stylobate.z1 + margin + dz, 0.0, I, false);

  const res = capTemple(
    b,
    {
      ...JOM_SPEC,
      detail,
      podiumMargin: margin,
      porchRows: 2,
      cellae: 3,
      centralShare: 0.4,
      interior: true,
      hiColumns: 'front',
      roofMaterial: 'gilded_bronze',
      antefix: 'gilded_bronze',
      doorMaterial: 'gilded_bronze',
      tympanum: paint(PAINT.blue, 0.85),
      frieze: friezeRelief('garland'),
      apex: 'quadriga',
      cornerStatues: true,
      furnish: (bb, info) => {
        const y = info.y;
        const zc = info.z1 - 2.6;
        const [c0, c1, c2] = info.cells;
        // Minerva (viewer's right, −x), Jupiter in the middle, Juno Regina (viewer's left, +x).
        const mx = (c0.x0 + c0.x1) / 2;
        const jx = (c1.x0 + c1.x1) / 2;
        const ux = (c2.x0 + c2.x1) / 2;
        // Jupiter: colossal, enthroned, gold and ivory, sceptre and thunderbolt.
        span(bb, 'marble', jx - 2.2, y, zc - 2.0, jx + 2.2, y + 1.2, zc + 1.6, info.at, true);
        seatedDeity(bb, mul(info.at, TRS(jx, y + 1.2, zc, 0, 0, 0, 2.6)), { material: 'marble', throneMaterial: 'gilded_bronze', detail: info.detail });
        box(bb, 'gilded_bronze', jx + 1.05, y + 3.9, zc - 0.9, 0.6, 0.12, 0.12, info.at);
        // Juno Regina and Minerva, standing.
        for (const [x, kind] of [
          [ux, 'draped'],
          [mx, 'draped'],
        ] as const) {
          span(bb, 'marble', x - 1.0, y, zc - 1.0, x + 1.0, y + 0.9, zc + 1.0, info.at, true);
          figure(bb, kind, mul(info.at, TRS(x, y + 0.9, zc, 0, 0, 0)), { scale: 2.3, material: 'marble', detail: info.detail });
        }
        // Minerva's spear and shield.
        box(bb, 'gilded_bronze', mx + 0.75, y + 0.9 + 2.3, zc - 0.2, 0.06, 4.6, 0.06, info.at);
        const sh = new THREE.CylinderGeometry(0.7, 0.7, 0.08, 16);
        sh.rotateX(Math.PI / 2);
        sh.translate(mx - 0.8, y + 1.9, zc - 0.5);
        bb.add(sh, 'gilded_bronze', info.at);
      },
    },
    at,
  );

  // Domitian's dedication, with his name chiselled out after his damnatio memoriae (AD 96).
  const archY = L.podiumHeight + L.H + 0.42;
  const text = inscription(b, ['I · O · M', 'IMP CAESAR DIVI VESPASIANI F .............. AVG GERMANICVS RESTITVIT'], L.spanX * 0.88, 0.62, mul(at, T(0, archY, L.entablature.z0 - 0.03)), 'bronze');
  spots.push(
    spotAt('dedication', 'inscription', 0, 0, front - 4, 0, front, {
      label: 'The dedication of the Capitolium',
      text,
      gloss: 'To Jupiter Best and Greatest: the Emperor Caesar, son of the deified Vespasian, [ — ] Augustus Germanicus, restored (this temple). Domitian inscribed only his own name (Suetonius, Dom. 5); since his memory was condemned in 96 it has been cut away, leaving a scar in the bronze letters.',
    }),
  );
  const st = res.stairTop.clone().add(new THREE.Vector3(0, 0, dz));
  spots.push(spotAt('steps-top', 'vista', 0, st.y, st.z + 0.8, 0, st.z - 60, { label: 'The steps of the Capitolium: Rome below' }));
  if (res.interior) {
    const it = res.interior;
    spots.push(spotAt('cella-iovis', 'shrine', (it.cells[1].x0 + it.cells[1].x1) / 2, it.y, it.z1 + dz - 7, (it.cells[1].x0 + it.cells[1].x1) / 2, it.z1 + dz, { label: 'Jupiter Optimus Maximus, enthroned' }));
    spots.push(spotAt('cella-iunonis', 'shrine', (it.cells[2].x0 + it.cells[2].x1) / 2, it.y, it.z1 + dz - 6, (it.cells[2].x0 + it.cells[2].x1) / 2, it.z1 + dz, { label: 'Juno Regina' }));
    spots.push(spotAt('cella-minervae', 'shrine', (it.cells[0].x0 + it.cells[0].x1) / 2, it.y, it.z1 + dz - 6, (it.cells[0].x0 + it.cells[0].x1) / 2, it.z1 + dz, { label: 'Minerva' }));
  }

  // The great altar of Jupiter before the steps, its fire always burning.
  const az = front - 4.2;
  altar(b, 4.0, 2.2, 1.4, T(0, 0, az), { detail, fire: true });
  addLamp(ctx, 0, 1.75, az, 'brazier');
  // Bronze lampstands either side of the central door of the cella, braziers at the top of the steps.
  for (const d of res.doors.slice(1, 2)) for (const sx of [-1, 1]) lampstand(ctx, b, d.x + sx * 2.6, d.y, d.z + dz - 1.2);
  for (const sx of [-1, 1]) brazier(ctx, b, sx * 9.6, res.stairTop.y, res.stairTop.z + dz + 0.45);
  spots.push(spotAt('altar', 'shrine', 0, 0, az - 2.4, 0, az, { label: 'The great altar of Jupiter' }));
  spots.push(spotAt('flamen', 'npc', 2.4, 0, az - 1.0, 0, az, { label: 'The Flamen Dialis at the sacrifice' }));

  areaCapitolina(ctx, b, detail, spots, front, L.stylobate.z1 + margin + dz);
}

// ------------------------------------------------------------------ the Area Capitolina

/**
 * The precinct round the temple (JOM local frame, game m). The UPPER AREA is paved at the level of
 * the archaic platform (y = 0) on artificial substructures: in front of the temple down to the
 * brow over the Tarpeian Rock, along the west flank to the brink over the Campus (closed by a long
 * portico) and behind the temple. The LOWER FORECOURT at the head of the Clivus Capitolinus lies at
 * the level of the Temple of Jupiter Tonans; a stair climbs from it through the Fornix of Scipio
 * (190 BC, seven gilded statues and two horses on top, two marble basins in front) into the area.
 * Measured against the terrain: the plateau round the platform lies 2–3.6 m below it, and the brink
 * of the west cliff starts ~38 m west of the axis (tests/capfora.test.ts checks nothing floats).
 */
export const AREA = {
  front: -44,
  west: 35,
  north: 20,
  /** z range of the gate stair on the east edge (from the forecourt). */
  gate: [-43.5, -35.5] as [number, number],
  /** Half-width of the stair down from the front edge towards the Tarpeian brink. */
  stairHalf: 6.2,
  /** Lower forecourt rectangle (east of the platform's front corner). */
  fore: { x0: -28.5, z0: -48, z1: -35 },
  /** W portico: depth (column axes to the back wall) and back-wall thickness. */
  porticoDepth: 4.2,
  porticoWall: 0.8,
};

function areaCapitolina(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[], front: number, back: number) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  const hw = JOM_MARGIN;
  const A = AREA;
  const e = -hw;
  // ---- the upper area: a U round the temple platform (the platform itself is the temple's)
  const poly: V2[] = [
    [e, front],
    [e, A.gate[1]],
    [e, A.gate[0]],
    [e, A.front],
    [-A.stairHalf, A.front],
    [A.stairHalf, A.front],
    [A.west, A.front],
    [A.west, A.north],
    [e, A.north],
    [e, back],
    [hw, back],
    [hw, front],
  ];
  terrace(b, poly, 0, g, { material: 'tufa', paving: 'paving_travertine', thickness: 0.8, skipEdges: [1, 4, 9, 10, 11], parapet: 1.05, parapetEdges: [0, 3, 5, 7, 8], buttress: { edges: [0, 3, 5, 6, 7], every: 6.4 } });
  // Joints of the paving: travertine bands every 4.5 m in front of the temple (high detail).
  if (detail === 'high') for (let z = A.front + 3; z < front - 1; z += 4.5) span(b, 'travertine', e + 0.2, 0.0, z - 0.09, A.west - A.porticoWall - A.porticoDepth - 1.2, 0.012, z + 0.09, I);

  // Broad steps from the front edge down to the brow over the Tarpeian Rock.
  {
    const fl = stairsToGround(b, g, 0, 2 * A.stairHalf, T(0, 0, A.front));
    const z0 = A.front - fl.length;
    const gOut = fl.foot;
    // Cheeks either side of the flight, carrying statues.
    for (const sx of [-1, 1]) {
      const x = sx * (A.stairHalf + 0.45);
      span(b, 'tufa', x - 0.45, Math.min(gOut, groundMin(g, x - 0.5, z0, x + 0.5, A.front)) - 0.3, z0, x + 0.45, 0.9, A.front, I, true);
      span(b, 'travertine', x - 0.55, 0.9, z0 - 0.05, x + 0.55, 1.05, A.front, I);
    }
    spots.push(spotAt('area-front', 'vista', 0, 0, A.front + 1.2, 0, A.front - 60, { label: 'The brow of the Capitol: the Velabrum, the river and the Palatine below' }));
  }

  // ---- the lower forecourt and the gate (Fornix Scipionis)
  const foreY = padY(ctx, 'temple-jupiter-tonans') - padY(ctx, 'temple-jupiter-capitolinus') + 0.04;
  const F = A.fore;
  terrace(
    b,
    [
      [e, F.z1],
      [F.x0, F.z1],
      [F.x0, -41],
      [F.x0, -47],
      [F.x0, F.z0],
      [e, F.z0],
      [e, A.front],
    ],
    foreY,
    g,
    { material: 'tufa', paving: 'paving_basalt', thickness: 0.7, skipEdges: [2, 6] },
  );
  {
    // Steps from the Clivus Capitolinus (arriving from the east along z ≈ −44) onto the forecourt.
    stairsToGround(b, g, foreY, 6, TRS(F.x0, 0, -44, 0, Math.PI / 2, 0));
    spots.push(spotAt('clivus-top', 'spawn', F.x0 + 2, foreY, -44, -hw, -44, { label: 'Top of the Clivus Capitolinus' }));
  }
  {
    // The gate stair from the forecourt up to the area.
    const { count, rise } = stepCount(-foreY, 0.2);
    const zc = (A.gate[0] + A.gate[1]) / 2;
    stairs(b, { width: A.gate[1] - A.gate[0], rise, run: 0.36, count, material: 'travertine' }, TRS(e - count * 0.36, foreY, zc, 0, Math.PI / 2, 0));
    // The arch over the top of the stair, its passage running east–west (frame −z faces the forecourt).
    const gAt = TRS(e + 1.15, 0, zc, 0, Math.PI / 2, 0);
    const arch = plainArch(b, { span: 4.6, height: 6.4, pier: 1.3, depth: 1.8, material: 'travertine', detail }, gAt);
    const yTop = arch.height + 0.45;
    // Seven gilded statues and two gilded horses on the attic.
    for (let k = 0; k < 7; k++) {
      const x = -arch.width / 2 + 1.0 + ((arch.width - 2.0) * k) / 6;
      if (k === 0 || k === 6) equestrian(b, mul(gAt, TRS(x, yTop, 0, 0, Math.PI / 2, 0, 0.62)), { material: 'gilded_bronze', detail: 'low', plinth: false });
      else figure(b, k % 2 ? 'armored' : 'togate', mul(gAt, TRS(x, yTop, -0.1, 0, 0, 0)), { scale: 1.0, material: 'gilded_bronze', detail: 'low' });
    }
    for (const dz2 of [-1, 1]) torch(ctx, b, e + 1.15 - 0.9, 2.9, zc + dz2 * (arch.width / 2 - 0.65), Math.PI / 2);
    const text = inscription(b, ['P · CORNELIVS · P · F · SCIPIO', 'AFRICANVS'], 3.8, 0.62, mul(gAt, T(0, arch.height - 0.55, -0.92)), 'carved', { depth: 0.04 });
    // Scipio's two marble basins in front of the arch, on the forecourt.
    for (const dz of [-2.4, 2.4]) {
      const bx = e - count * 0.36 - 2.2;
      span(b, 'marble', bx - 0.35, foreY, zc + dz - 0.35, bx + 0.35, foreY + 0.5, zc + dz + 0.35, I, true);
      labrum(b, 0.85, TRS(bx, foreY + 0.45, zc + dz, 0, 0, 0), detail);
    }
    const sx = e - count * 0.36 - 4.5;
    spots.push(
      spotAt('fornix-scipionis', 'inscription', sx, foreY, zc, e, zc, {
        label: 'The Arch of Scipio',
        text,
        gloss: 'Publius Cornelius Scipio Africanus, son of Publius. Before he left for the war against Antiochus (190 BC) he set up an arch on the Capitol facing the road up, with seven gilded statues and two horses, and two marble basins in front of it (Livy 37.3). The text is a reconstruction.',
      }),
    );
    spots.push(spotAt('votive-seller', 'stall', F.x0 + 2.2, foreY, F.z1 - 2.2, F.x0 + 6, F.z1 - 5, { label: 'Seller of votive figurines, incense and garlands' }));
    spots.push(spotAt('gate-guard', 'npc', e - 0.6, 0, A.gate[1] + 0.8, e - 6, zc, { label: 'Temple slave keeping the gate of the Area Capitolina' }));
    spots.push(spotAt('forecourt-crowd', 'npc', F.x0 + 5, foreY, -45.5, e, zc, { label: 'Pilgrims and petitioners climbing to the Capitol' }));
  }

  // ---- the west portico on the brink over the Campus
  const colX = A.west - A.porticoWall - A.porticoDepth;
  const pLen = A.north - A.front;
  const pAt = TRS(colX, 0, A.north, 0, Math.PI / 2, 0);
  // Inside: statue niches every other bay (none behind the bronze tablets); high windows light the
  // portico through the outer wall.
  const openings: Opening[] = [];
  const bayN = Math.round(pLen / 3.2);
  const bay = pLen / bayN;
  for (let k = 0; k < bayN; k++) {
    const u = (k + 0.5) * bay;
    const zz = A.north - u;
    if (k % 2 === 0 && !(zz > -39 && zz < -25)) openings.push({ kind: 'niche', x: u, width: 1.1, height: 2.6, sill: 0.8, depth: 0.35 });
    if (k % 2 === 1) openings.push({ kind: 'window', x: u, width: 1.3, height: 2.1, sill: 4.3, arched: true, frame: false });
  }
  const por = forumPortico(
    b,
    {
      length: pLen,
      depth: A.porticoDepth,
      order: 'ionic',
      H: 6.0,
      spacing: 3.2,
      material: 'marble',
      fluted: true,
      detail: 'low',
      columnDetail: 'low',
      floorY: 0.4,
      groundMin: 0,
      wallMaterial: 'travertine',
      wallThickness: A.porticoWall,
      openings,
      nicheStatues: 'togate',
      ceiling: 'plain',
      endWalls: [true, true],
    },
    pAt,
  );
  // Outside, over the brink: pilasters every two bays, a string course at the area's level and a
  // crowning cornice, so the long back wall reads as architecture from the Campus below.
  {
    const xo = A.west;
    const top = por.wallTop;
    for (let k = 0; k <= bayN; k += 2) {
      const z = A.north - k * bay;
      span(b, 'marble', xo, -0.2, z - 0.38, xo + 0.22, top - 0.5, z + 0.38, I);
    }
    span(b, 'marble', xo, -0.25, A.front - 0.3, xo + 0.3, 0.12, A.north + 0.3, I);
    span(b, 'marble', xo, top - 0.55, A.front - 0.5, xo + 0.42, top - 0.1, A.north + 0.5, I);
    span(b, 'marble', xo, top - 0.1, A.front - 0.6, xo + 0.55, top + 0.12, A.north + 0.6, I);
  }
  // Bronze tablets of laws, treaties and veterans' discharges fixed to the wall behind the temple of
  // Fides (the military diplomas quote it: "post aedem Fidei populi Romani in muro").
  {
    const xw = A.west - A.porticoWall - 0.03;
    for (let r = 0; r < 2; r++)
      for (let k = 0; k < 7; k++) {
        const z = -37 + k * 1.55;
        const y = 1.35 + r * 0.95;
        box(b, 'bronze', xw, y, z, 0.03, 0.72, 1.2, I, false, 0);
      }
    const text = inscription(
      b,
      ['DESCRIPTVM · ET · RECOGNITVM', 'EX · TABVLA · AENEA · QVAE · FIXA · EST', 'ROMAE · IN · CAPITOLIO', 'POST · AEDEM · FIDEI · P · R · IN · MVRO'],
      1.9,
      0.95,
      TRS(xw - 0.04, 3.55, -32.4, 0, Math.PI / 2, 0),
      'bronze',
      { depth: 0.03 },
    );
    spots.push(
      spotAt('tabulae-aeneae', 'inscription', xw - 2.6, 0.4, -32.4, xw, -32.4, {
        label: 'Bronze tablets behind the Temple of Fides',
        text,
        gloss: "Copied and checked from the bronze tablet that is fixed at Rome on the Capitol, on the wall behind the temple of the Faith of the Roman People. Every veteran's discharge diploma ends with these words: the originals hang here by the hundred, beside laws and treaties.",
      }),
    );
  }

  // ---- shrines in the area: Fides, Ops, Mens and Venus Erucina along the west side (facing east),
  // and the tiny archaic Jupiter Feretrius by the front edge (facing south)
  const xs = (colX - 0.72 + hw) / 2;
  const shrines: { id: string; z: number; w: number; d: number; P: number; H: number; n: number; order: 'tuscan' | 'ionic' | 'corinthian'; mat: MaterialId; label: string; tymp: string }[] = [
    { id: 'fides', z: -31.5, w: 4.4, d: 6.4, P: 1.1, H: 4.2, n: 4, order: 'ionic', mat: 'marble', label: 'Temple of Fides (Good Faith): treaties are kept here', tymp: PAINT.blue },
    { id: 'ops', z: -18.5, w: 5.0, d: 7.4, P: 1.2, H: 4.8, n: 4, order: 'corinthian', mat: 'marble', label: 'Temple of Ops, goddess of plenty', tymp: PAINT.redOchre },
    { id: 'mens', z: -6.5, w: 3.8, d: 5.4, P: 0.9, H: 3.6, n: 4, order: 'ionic', mat: 'plaster_white', label: 'Temple of Mens (Right Thinking), vowed after Lake Trasimene', tymp: PAINT.green },
    { id: 'venus-erucina', z: 3.0, w: 3.8, d: 5.4, P: 0.9, H: 3.6, n: 4, order: 'ionic', mat: 'marble', label: 'Temple of Venus of Eryx', tymp: PAINT.cinnabar },
  ];
  for (const s of shrines) {
    smallTemple(b, { w: s.w, d: s.d, P: s.P, H: s.H, n: s.n, order: s.order, mat: s.mat, podium: 'tufa', roof: 'roof_tile', tympanum: paint(s.tymp, 0.85), detail }, TRS(xs, 0, s.z, 0, Math.PI / 2, 0));
    spots.push(spotAt(s.id, 'shrine', xs - s.d / 2 - 2.2, 0, s.z, xs, s.z, { label: s.label }));
  }
  smallTemple(b, { w: 3.4, d: 4.8, P: 0.9, H: 3.2, n: 4, order: 'tuscan', mat: 'tufa', podium: 'tufa', roof: 'roof_tile', tympanum: paint(PAINT.redOchre), detail }, TRS(-10.6, 0, -35.2, 0, 0, 0));
  spots.push(spotAt('feretrius', 'shrine', -10.6, 0, -39.4, -10.6, -35.2, { label: 'Shrine of Jupiter Feretrius: Romulus dedicated the spolia opima here' }));

  // ---- statues, columns and trophies of the triumphators crowding the area
  const kinds: ('togate' | 'general' | 'equestrian' | 'emperor')[] = ['togate', 'general', 'equestrian', 'togate', 'emperor', 'general'];
  let k = 0;
  for (const sx of [-1, 1]) {
    for (const z of [-41, -36.5, -32, -27.5]) {
      if (sx < 0 && z > -38 && z < -31) continue; // Feretrius
      const kind = kinds[k++ % kinds.length];
      pedestalStatue(b, kind, TRS(sx * 7.6, 0, z, 0, sx < 0 ? Math.PI / 2 : -Math.PI / 2, 0), { scale: 1.05, ph: 1.6, material: k % 3 === 0 ? 'gilded_bronze' : 'bronze', detail: 'low' });
    }
  }
  // Honorific columns flanking the head of the front stair, gilded statues on top.
  for (const sx of [-1, 1]) {
    const x = sx * (A.stairHalf + 3.2);
    const z = A.front + 2.0;
    span(b, 'marble', x - 0.75, 0, z - 0.75, x + 0.75, 1.3, z + 0.75, I, true);
    column(b, { order: 'doric', D: 0.62, height: 6.2, material: 'marble', detail: 'low' }, T(x, 1.3, z));
    figure(b, sx < 0 ? 'armored' : 'togate', TRS(x, 7.55, z, 0, 0, 0), { scale: 1.1, material: 'gilded_bronze', detail: 'low' });
  }
  for (const x of [-12.6, 12.6]) trophy(b, TRS(x, 0, -24.5, 0, 0, 0), 'bronze');
  // Statues on the parapet line behind the temple and a row of altars and votive bases on the west side.
  for (let i = 0; i < 6; i++) {
    const z = -12 + i * 5.2;
    const x = -hw - 0.0;
    void x;
    figure(b, i % 3 === 0 ? 'armored' : 'togate', TRS(A.west - A.porticoWall - A.porticoDepth - 2.6, 0, z + 2.6, 0, -Math.PI / 2, 0), { scale: 1.05, material: i % 2 ? 'bronze' : 'marble', detail: 'low' });
  }
  spots.push(spotAt('votive-statues', 'inscription', -7.6 + 2.2, 0, -41, -7.6, -41, { label: 'Statues and trophies of the triumphators', text: 'TROPAEA', gloss: 'Generals who triumphed climbed the Capitol to lay their laurels in the lap of Jupiter; the area is crowded with their statues, trophies and votive gifts, so many that emperors have had some of them moved to the Campus Martius.' }));
  spots.push(spotAt('haruspex', 'npc', 4.0, 0, front - 6.0, 0, front - 4.2, { label: 'A haruspex reading the entrails at the great altar' }));
  spots.push(spotAt('portico-bench', 'sit', colX + 1.4, 0.4, -10, colX - 3, -10, { label: 'Bench in the portico of the Area Capitolina' }));
  spots.push(spotAt('area-capitolina', 'spawn', 0, 0, A.front + 4, 0, 0, { label: 'Area Capitolina' }));
  void por;
}

function jomFar(b: MeshBuilder) {
  const { L, margin, dz } = jomPlan();
  const at = T(0, 0, dz);
  const A = AREA;
  span(b, 'tufa', -JOM_MARGIN, -2, L.stylobate.z0 + dz, JOM_MARGIN, L.podiumHeight, L.stylobate.z1 + margin + dz, undefined);
  templeFar(b, L, at, { podium: 'tufa', roof: 'gilded_bronze' });
  box(b, 'gilded_bronze', 0, L.totalHeight + 1.0, L.entablature.z0 + dz, 3.4, 2.6, 2.2, undefined);
  // The area's substructures and paving, and the west portico on the brink.
  span(b, 'tufa', -JOM_MARGIN, -3.6, A.front, A.west, 0, A.north, undefined);
  span(b, 'paving_travertine', -JOM_MARGIN, 0, A.front, A.west, 0.05, A.north, undefined);
  const colX = A.west - A.porticoWall - A.porticoDepth;
  farWall(b, 'tufa', A.west - A.porticoWall / 2, A.front, A.west - A.porticoWall / 2, A.north, A.porticoWall, 0, 9.4);
  // (leanTo slopes along its z: rotate so that runs along local x, its x along local −z)
  leanTo(b, 'roof_tile', -A.north, -A.front, colX - 0.6, 7.8, A.west, 9.0, TRS(0, 0, 0, 0, Math.PI / 2, 0));
  farColonnade(b, 'marble', A.front, A.north, 0, 0.4, 6.0, 20, 0.67, TRS(colX, 0, 0, 0, -Math.PI / 2, 0));
}

// ------------------------------------------------------------------ Jupiter Tonans

const TONANS_SPEC = {
  order: 'corinthian' as const,
  plan: 'prostyle' as const,
  front: 6,
  sides: 7,
  width: 15 * S,
  intercolumniation: 'systyle' as const,
  podiumHeight: 3 * S,
  material: 'marble' as MaterialId,
  podiumMaterial: 'marble' as MaterialId,
  pitchDeg: 14,
};

function buildTonans(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const L = templeLayout({ ...TONANS_SPEC, detail });
  const dz = -(L.stairs.z0 + L.stylobate.z1) / 2;
  const at = T(0, 0.05, dz);
  footing(b, 'marble', ctx.groundAt, L.stylobate.x0, L.stairs.z0 + dz, L.stylobate.x1, L.stylobate.z1 + dz, 0.05, undefined, false);
  const res = capTemple(b, { ...TONANS_SPEC, detail, roofMaterial: 'roof_tile', tympanum: paint(PAINT.blue, 0.85), interior: false, hiColumns: 'front', frieze: friezeRelief('garland') }, at);
  // Augustus hung bells on the gable: the Thunderer is Capitoline Jupiter's doorkeeper (Suet. Aug. 91).
  const e = L.entablature;
  const yTop = 0.05 + L.podiumHeight + L.H + e.height;
  const apex = res.apexY + 0.05 - yTop;
  const half = (e.x1 - e.x0) / 2 + 0.2;
  const zb = e.z0 + dz - 0.45;
  const bell = new THREE.CylinderGeometry(0.05, 0.16, 0.28, detail === 'high' ? 10 : 6, 1, true);
  for (const sx of [-1, 1]) {
    for (let i = 1; i <= 5; i++) {
      const t = i / 6;
      const x = sx * half * (1 - t);
      const y = yTop + apex * t - 0.1;
      post(b, 'iron', x, y - 0.45, zb, 0.45, 0.012, undefined, 4);
      b.add(bell.clone().translate(x, y - 0.6, zb), 'bronze');
    }
  }
  const archY = 0.05 + L.podiumHeight + L.H + 0.25;
  const text = inscription(b, ['IOVI TONANTI', 'IMP CAESAR DIVI F AVGVSTVS'], L.spanX * 0.8, 0.5, mul(at, T(0, archY, e.z0 - 0.03)), 'bronze');
  const sf = res.stairFoot.z + dz;
  spots.push(
    spotAt('bells', 'inscription', 0, 0.05, sf - 5, 0, sf, {
      label: 'The bells of Jupiter the Thunderer',
      text,
      gloss: "Augustus built this temple after lightning grazed his litter in Spain and killed the slave lighting his way. When Capitoline Jupiter complained in a dream that it stole his worshippers, Augustus hung bells on its gable, as on a doorkeeper's house (Suetonius, Aug. 29, 91).",
    }),
  );
  spots.push(spotAt('altar', 'shrine', 0, 0.05, sf - 1.5, 0, sf + 3, { label: 'Altar of Jupiter Tonans' }));
  altar(b, 1.8, 1.1, 1.0, T(0, 0.05, sf - 3.0), { detail });
}

function tonansFar(b: MeshBuilder) {
  const L = templeLayout(TONANS_SPEC);
  templeFar(b, L, T(0, 0.05, -(L.stairs.z0 + L.stylobate.z1) / 2), { podium: 'marble' });
}

// ------------------------------------------------------------------ the Tarpeian Rock

function buildTarpeian(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const I = new THREE.Matrix4();
  // The execution ledge at the cliff top: paved, a low kerb at the brink, parapets on the sides.
  const x0 = -1.5;
  const x1 = 12.5;
  const z0 = -8.6;
  const z1 = 0.5;
  const y = 0.12;
  footing(b, 'tufa', g, x0, z0, x1, z1, y - 0.05, I, true);
  span(b, 'paving_travertine', x0, y - 0.05, z0, x1, y, z1, I);
  span(b, 'tufa', x0, y, z0, x1, y + 0.25, z0 + 0.35, I, true);
  for (const x of [x0, x1 - 0.4]) span(b, 'tufa', x, y, z0, x + 0.4, y + 0.9, z1, I, true);
  // Libation stone of Tarpeia, buried on the hill she betrayed.
  altar(b, 0.9, 0.7, 0.9, TRS(x0 + 2.2, y, z1 - 1.2, 0, 0, 0), { detail, material: 'tufa' });
  spots.push(spotAt('tarpeia', 'shrine', x0 + 2.2, y, z1 - 2.6, x0 + 2.2, z1 - 1.2, { label: "Tarpeia's libation stone" }));
  spots.push(
    spotAt('brink', 'vista', 5.5, y, z0 + 1.2, 5.5, z0 - 40, {
      label: 'The Tarpeian Rock',
      text: 'SAXVM TARPEIVM',
      gloss: 'From here traitors and murderers are thrown down. Below: the Vicus Iugarius, the vegetable market, the Theatre of Marcellus and the bend of the Tiber.',
    }),
  );
  spots.push(spotAt('lictor', 'npc', 9.5, y, z1 - 1.5, 5.5, z0, { label: 'A lictor on watch' }));
  // The cliff itself: a stratified tufa face over the steep stretch of the terrain, leaving the
  // Centum Gradus (the hundred steps down to the Forum Holitorium side) open at x ≈ −8 … −12.
  cliffFace(b, g, {
    x0: -46,
    x1: 44,
    step: detail === 'high' ? 1.5 : 3,
    zStart: 3,
    zEnd: -34,
    rows: detail === 'high' ? 12 : 6,
    gaps: [[-14.5, -5.5]],
    clampTop: (x) => (x > x0 - 0.6 && x < x1 + 0.6 ? z0 - 0.4 : undefined),
    seed: 'tarpeian',
    boulders: true,
  });
  // A wild fig and a few shrubs rooted in the cracks at the foot (the Ficus of the cliffs).
  plantTrees(ctx, b, [
    { sp: 'fig', x: -20, z: -17, s: 0.9 },
    { sp: 'fig', x: 22, z: -15.5, s: 0.8 },
    { sp: 'oleander', x: 30, z: -16, s: 0.9 },
    { sp: 'laurel', x: -32, z: -12, s: 0.85 },
  ]);
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['temple-jupiter-capitolinus'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildJOM(ctx, b, d, spots), { far: ctx.detail === 'high' && jomFar, cull: 480 }),
  },
  {
    handles: ['temple-jupiter-tonans'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildTonans(ctx, b, d, spots), { far: ctx.detail === 'high' && tonansFar, cull: 300 }),
  },
  {
    handles: ['tarpeian-rock'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildTarpeian(ctx, b, d, spots), { far: ctx.detail === 'high', cull: 400 }),
  },
];
