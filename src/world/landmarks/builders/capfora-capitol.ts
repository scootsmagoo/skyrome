/**
 * The Capitolium: the Temple of Jupiter Optimus Maximus with the Area Capitolina, the Temple of
 * Jupiter Tonans at the precinct's gate, and the Tarpeian Rock — capfora crew.
 *
 * Jupiter Optimus Maximus is Domitian's rebuilding (c. AD 82) on the archaic platform: a widely
 * spaced Corinthian hexastyle of Pentelic marble with a deep porch (three rows of six) and
 * colonnaded flanks, a triple cella (Minerva, Jupiter, Juno), gilded doors and the gilded bronze
 * roof tiles that flash over the whole city, Jupiter's quadriga on the apex and gilded figures on
 * the corners. Domitian put only his own name on it; since his damnatio memoriae it has been
 * chiselled away. The Area Capitolina in front is crowded with the great altar, votive statues,
 * trophies and the little shrines of Jupiter Feretrius and Fides.
 */
import * as THREE from 'three';
import { armoredEmperor, seatedDeity, togate } from '../../../arch/classical/statues';
import { templeLayout } from '../../../arch/classical/temple';
import { T, TRS, gridSurface, linspace, mul } from '../../../arch/common/geom';
import { stairs, stepCount } from '../../../arch/common/stairs';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { templeFar } from './capfora/far';
import { S, spotAt, type CapSpot } from './capfora/frame';
import { altar, box, figure, footing, groundMin, inscription, pedestalStatue, post, span, terrace, trophy } from './capfora/ornament';
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
  const text = inscription(b, ['I · O · M', 'IMP CAESAR DIVI VESPASIANI F . . . . . . . . . . . . . AVG GERMANICVS RESTITVIT'], L.spanX * 0.88, 0.62, mul(at, T(0, archY, L.entablature.z0 - 0.03)), 'bronze');
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

  // ---- the Area Capitolina in front: a paved terrace with the great altar and the votive crowd
  const zt0 = -18.6 - 9.5; // front edge of the terrace (game m)
  const zt1 = front + 0.2;
  // (Its front-left corner stops short of the Temple of Jupiter Tonans, by the precinct gate.)
  terrace(
    b,
    [
      [-hw + 0.6, zt0],
      [hw + 1.5, zt0],
      [hw + 1.5, zt1],
      [-hw - 1.5, zt1],
      [-hw - 1.5, zt0 + 6.5],
      [-hw + 0.6, zt0 + 6.5],
    ],
    0,
    g,
    { material: 'tufa', paving: 'paving_travertine', thickness: 0.8, skipEdges: [2] },
  );
  // Broad steps from the terrace down to the Clivus Capitolinus in front.
  {
    const gOut = Math.min(-0.1, groundMin(g, -6, zt0 - 5, 6, zt0 - 1));
    const { count, rise } = stepCount(-gOut, 0.19);
    stairs(b, { width: 12, rise, run: 0.36, count, material: 'travertine' }, T(0, gOut, zt0 - 0.4 - count * 0.36));
    footing(b, 'tufa', g, -6, zt0 - 0.4 - count * 0.36, 6, zt0, gOut, I, false);
  }
  // The great altar of Jupiter.
  const az = front - 4.2;
  altar(b, 4.0, 2.2, 1.4, T(0, 0, az), { detail, fire: true });
  spots.push(spotAt('altar', 'shrine', 0, 0, az - 2.4, 0, az, { label: 'The great altar of Jupiter' }));
  spots.push(spotAt('flamen', 'npc', 2.4, 0, az - 1.0, 0, az, { label: 'The Flamen Dialis at the sacrifice' }));
  spots.push(spotAt('area-capitolina', 'spawn', 0, 0, zt0 + 1.5, 0, 0, { label: 'Area Capitolina' }));
  // Votive statues and trophies of generals crowding the precinct.
  const kinds: ('togate' | 'general' | 'equestrian' | 'emperor')[] = ['togate', 'general', 'togate', 'equestrian', 'togate', 'emperor', 'general', 'togate'];
  let k = 0;
  for (const x of [-hw + 1.6, -hw + 6.5, hw - 5.5, hw + 0.3]) {
    for (const z of [zt0 + 2.0, zt0 + 5.6]) {
      const kind = kinds[k++ % kinds.length];
      pedestalStatue(b, kind, TRS(x, 0, z, 0, x < 0 ? -0.25 : 0.25, 0), { scale: 1.05, ph: 1.6, material: k % 3 === 0 ? 'gilded_bronze' : 'bronze', detail: 'low' });
    }
  }
  for (const x of [-hw + 2.5, hw - 2.5]) trophy(b, TRS(x, 0, zt0 + 4.0, 0, 0, 0), 'bronze');
  spots.push(spotAt('votive-statues', 'inscription', -hw + 2.5, 0, zt0 + 1.0, -hw + 2.5, zt0 + 4.0, { label: 'Statues and trophies of the triumphators', text: 'TROPAEA', gloss: 'Generals who triumphed climbed the Capitol to lay their laurels in the lap of Jupiter; the precinct is crowded with their statues and trophies.' }));
  // The little shrines of Jupiter Feretrius (Romulus' spolia opima) and Fides on the precinct edge.
  smallTemple(b, { w: 3.4, d: 4.8, P: 0.9, H: 3.2, n: 4, order: 'tuscan', mat: 'tufa', podium: 'tufa', roof: 'roof_tile', tympanum: paint(PAINT.redOchre), detail }, TRS(-hw + 2.4, 0, -2, 0, Math.PI / 2, 0));
  spots.push(spotAt('feretrius', 'shrine', -hw + 6.0, 0, -2, -hw + 2.4, -2, { label: 'Shrine of Jupiter Feretrius (the spolia opima)' }));
  smallTemple(b, { w: 4.2, d: 6.0, P: 1.1, H: 4.0, n: 4, order: 'ionic', mat: 'marble', podium: 'tufa', roof: 'roof_tile', tympanum: paint(PAINT.blue), detail }, TRS(hw - 2.6, 0, 5, 0, -Math.PI / 2, 0));
  spots.push(spotAt('fides', 'shrine', hw - 6.6, 0, 5, hw - 2.6, 5, { label: 'Temple of Fides (Good Faith): treaties are kept here' }));
  void togate;
  void armoredEmperor;
}

function jomFar(b: MeshBuilder) {
  const { L, margin, dz } = jomPlan();
  const at = T(0, 0, dz);
  span(b, 'tufa', -JOM_MARGIN, -2, L.stylobate.z0 + dz, JOM_MARGIN, L.podiumHeight, L.stylobate.z1 + margin + dz, undefined);
  templeFar(b, L, at, { podium: 'tufa', roof: 'gilded_bronze' });
  box(b, 'gilded_bronze', 0, L.totalHeight + 1.0, L.entablature.z0 + dz, 3.4, 2.6, 2.2, undefined);
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
  // The rock face: a jagged skin of stone draped over the cliff below the ledge.
  {
    const xs = linspace(-30, 36, detail === 'high' ? 54 : 22);
    const vs = linspace(0, 1, detail === 'high' ? 16 : 7);
    const zTop = -6.2;
    const zBot = -30;
    const noise = (x: number, v: number) => Math.sin(x * 1.7 + v * 9.1) * 0.35 + Math.sin(x * 0.53 - v * 4.7) * 0.6 + Math.sin(x * 3.1 + v * 17) * 0.15;
    const face = gridSurface(xs, vs, (x, v, out) => {
      const z = zTop + (zBot - zTop) * v;
      const n = noise(x, v);
      // Always proud of the terrain: lift and push outwards (−z), never into the hill.
      return out.set(x, g(x, z) + 0.4 + Math.abs(n) * 0.45, z - Math.abs(n) * 0.7 - 0.2);
    });
    b.add(face, 'rock', I, { uvScale: 3 });
  }
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
