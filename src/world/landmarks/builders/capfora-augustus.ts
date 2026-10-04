/**
 * Forum of Augustus (dedicated 2 BC) and the Temple of Mars Ultor — capfora crew.
 *
 * Forum (local frame, facade/entrance towards −z = SW): a marble-paved square between two
 * porticoes of giallo antico columns raised on steps, their attic carrying caryatids alternating
 * with Ammon shields; two exedrae opening off the porticoes with two tiers of niches for the
 * bronze summi viri (Aeneas with Anchises and Ascanius in the NW one, Romulus with the spolia
 * opima in the SE one, each with its elogium); the bronze quadriga of Augustus inscribed PATER
 * PATRIAE in the middle; the Arches of Drusus and Germanicus beside the temple; the Hall of the
 * Colossus in the N corner; and the 33 m peperino firewall with travertine bands that screens the
 * Subura (a game edge, GDD §12.1), pierced by one closed gate (the Arco dei Pantani).
 *
 * Temple (own frame): Corinthian octastyle peripteros sine postico in Luna marble, columns
 * D 1.76 m / H 17.7 m, on a 3.5 m podium with a frontal stair and an altar; its back wall against
 * the firewall. Enterable cella with side colonnades, coffers, an apse with Mars, Venus and Divus
 * Julius, and the standards recovered from Parthia.
 */
import * as THREE from 'three';
import { column } from '../../../arch/classical/column';
import { plainArch } from '../../../arch/classical/arch';
import { armoredEmperor, quadriga, seatedDeity, togate } from '../../../arch/classical/statues';
import { templeLayout } from '../../../arch/classical/temple';
import { T, TRS, mul } from '../../../arch/common/geom';
import { stairs, stepCount } from '../../../arch/common/stairs';
import { wall } from '../../../arch/common/walls';
import type { MeshBuilder } from '../../../gfx/MeshBuilder';
import type { MaterialId } from '../../../gfx/materialIds';
import type { LandmarkBuilder, LandmarkContext } from '../types';
import { makeLandmark, type Detail } from './capfora/build';
import { exedraWall } from './capfora/exedra';
import { farColonnade, farWall, leanTo, templeFar } from './capfora/far';
import { S, sharedFloor, spotAt, type CapSpot } from './capfora/frame';
import { altar, box, figure, footing, groundMin, inscription, span, stairsToGround, standard } from './capfora/ornament';
import { PAINT, paint } from './capfora/paint';
import { forumPortico } from './capfora/portico';
import { capTemple } from './capfora/temple';
import { addLamp } from './capfora/life';

/** Plan of the Forum of Augustus in REAL metres (local frame). Shared with the Forum of Nerva. */
export const AUGUSTUS = {
  halfW: 45,
  halfD: 62.5,
  /** Portico column axes |x|, first and last z of the porticoes. */
  colX: 33,
  porticoZ0: -60.5,
  porticoZ1: 44,
  /** Exedrae: centre (±cx, cz), inner radius R, chord on the back-wall line |x| = halfW. */
  exedra: { cx: 42, cz: -20, R: 17, t: 2 },
  firewallH: 33,
  /** Door from the SE portico into the Forum of Nerva (z, real). */
  nervaDoorZ: -46,
};

const Y0 = 0.12; // top of the square's paving above the pad

// ------------------------------------------------------------------ the forum

function buildForum(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const g = ctx.groundAt;
  const A = AUGUSTUS;
  const hw = A.halfW * S;
  const hd = A.halfD * S;
  const colX = A.colX * S;
  const depth = hw - colX;
  const z0 = A.porticoZ0 * S;
  const z1 = A.porticoZ1 * S;
  const I = new THREE.Matrix4();

  // ---- the square: marble paving over a foundation that reaches the lowest ground
  const sqX = colX - 0.4;
  const sqZ0 = -hd + 0.7;
  const sqZ1 = hd - 0.3;
  const gmin = groundMin(g, -sqX, sqZ0, sqX, sqZ1);
  // Ground around the enclosure (the Forum of Nerva lies 1.2 m lower on the SE side).
  const gWide = Math.min(gmin, groundMin(g, -hw - 14, -hd - 3, hw + 14, hd + 3));
  span(b, 'travertine', -sqX, Math.min(-0.3, gmin - 0.3), sqZ0, sqX, Y0 - 0.04, sqZ1, I, true);
  span(b, 'paving_travertine', -sqX, Y0 - 0.04, sqZ0, sqX, Y0, sqZ1, I);
  if (detail === 'high') {
    // Bands of coloured marble dividing the paving into great panels (as found in the square).
    for (let z = sqZ0 + 6; z < sqZ1 - 2; z += 6) span(b, 'marble_giallo', -sqX, Y0 - 0.035, z - 0.15, sqX, Y0 + 0.004, z + 0.15, I);
    for (const x of [-sqX * 0.5, 0, sqX * 0.5]) span(b, 'marble_pavonazzetto', x - 0.15, Y0 - 0.035, sqZ0, x + 0.15, Y0 + 0.004, sqZ1, I);
  }

  // ---- porticoes (NW = +x faces −x, SE = −x faces +x)
  const ex = A.exedra;
  const hc = Math.sqrt(ex.R * ex.R - (A.halfW - ex.cx) ** 2) * S;
  const ecz = ex.cz * S;
  const L = z1 - z0;
  const floorY = 0.66;
  let portico = { wallTop: 12, corniceY: 9, atticTop: 11, floorY, columnsX: [] as number[], D: 0.6 };
  for (const side of [1, -1]) {
    const at = side > 0 ? mul(I, TRS(colX, Y0, z1, 0, Math.PI / 2, 0)) : mul(I, TRS(-colX, Y0, z0, 0, -Math.PI / 2, 0));
    const u = (z: number) => (side > 0 ? z1 - z : z - z0);
    const gap: [number, number] = [Math.min(u(ecz - hc), u(ecz + hc)), Math.max(u(ecz - hc), u(ecz + hc))];
    // Niches for statues every other bay, outside the exedra opening (and the door to Nerva).
    const ops = [];
    const nb = Math.round(L / 3.0);
    for (let k = 1; k < nb; k += 2) {
      const x = ((k + 0.5) * L) / nb;
      if (x > gap[0] - 2 && x < gap[1] + 2) continue;
      if (side < 0 && Math.abs(x - u(A.nervaDoorZ * S)) < 3) continue;
      ops.push({ kind: 'niche' as const, x, width: 1.3, height: 3.1, sill: 0.8, depth: 0.45 });
    }
    if (side < 0) ops.push({ kind: 'door' as const, x: u(A.nervaDoorZ * S), width: 2.6, height: 4.2, leaves: 'open' as const, leafMaterial: 'bronze' as MaterialId });
    portico = forumPortico(
      b,
      {
        length: L,
        depth,
        order: 'corinthian',
        H: 10 * S,
        spacing: 3.0,
        material: 'marble_giallo',
        trimMaterial: 'marble',
        fluted: true,
        detail,
        columnDetail: 'low',
        floorY,
        groundMin: gWide,
        wallMaterial: 'marble',
        wallThickness: 1.2,
        openings: ops,
        gaps: [gap],
        nicheStatues: 'togate',
        attic: { height: 3.0, kind: 'caryatid', material: 'marble' },
        endWalls: [side < 0, side > 0],
      },
      at,
    );
    // Cipollino screen across the exedra opening, carrying a lintel at the portico ceiling.
    const hScreen = portico.corniceY - floorY - 0.4;
    const nS = 4;
    for (let k = 0; k < nS; k++) {
      const z = ecz - hc + ((k + 0.5) * 2 * hc) / nS;
      column(b, { order: 'corinthian', D: hScreen / 10, height: hScreen, fluted: true, material: 'marble_veined', trimMaterial: 'marble', detail: 'low' }, T(side * hw, Y0 + floorY, z));
    }
    span(b, 'marble', side * hw - 0.5, Y0 + floorY + hScreen, ecz - hc, side * hw + 0.5, Y0 + portico.wallTop, ecz + hc, I);
    // The exedra itself.
    const eAt = mul(I, TRS(side * ex.cx * S, Y0 + floorY, ecz, 0, side * (Math.PI / 2), 0));
    const eH = portico.wallTop + 2.5 - floorY;
    const res = exedraWall(
      b,
      {
        R: ex.R * S,
        thickness: ex.t * S,
        height: eH,
        chord: (A.halfW - ex.cx) * S,
        base: gWide - floorY - Y0 - 0.4,
        // The SE exedra's back bulges into the Forum of Nerva: there it is veneered and carries the
        // Forum of Nerva's entablature and attic lines round its curve, between pilasters.
        material: side < 0 ? 'marble_veined' : 'peperino',
        outer: side < 0 ? nervaDressing(sharedFloor(ctx, 'forum-nerva', 0.7) - (Y0 + floorY)) : undefined,
        innerMaterial: 'marble',
        detail,
        niches: {
          count: 9,
          skipCentre: true,
          rows: [
            { sill: 0.8, height: 3.0, width: 1.3, statue: 'togate' },
            { sill: 5.0, height: 2.3, width: 1.0, statue: side > 0 ? 'togate' : 'armored', statueScale: 0.95 },
          ],
        },
      },
      eAt,
    );
    void res;
    // The centrepiece: Aeneas (NW) or Romulus (SE) in a great niche at the apex, with the elogium.
    const R = ex.R * S;
    const apex = mul(eAt, TRS(0, 0, R - 0.02, 0, 0, 0));
    box(b, 'plaster_dark', 0, 3.4, 0.03, 3.4, 6.2, 0.04, apex);
    for (const sx of [-1, 1]) box(b, 'marble_giallo', sx * 1.9, 3.3, -0.12, 0.4, 6.6, 0.3, apex);
    box(b, 'marble', 0, 6.75, -0.15, 4.4, 0.4, 0.4, apex);
    box(b, 'marble', 0, 0.55, -0.9, 3.0, 1.1, 1.6, apex, true);
    const grp = mul(apex, T(0, 1.1, -0.9));
    if (side > 0) {
      // Aeneas carrying Anchises, leading the boy Ascanius.
      armoredEmperor(b, mul(grp, TRS(0, 0, 0, 0, 0, 0, 1.6)), { material: 'bronze', detail, plinth: false });
      figure(b, 'draped', mul(grp, TRS(-0.05, 2.15, 0.25, 0, 0, 0)), { scale: 0.75, material: 'bronze', detail });
      figure(b, 'nude', mul(grp, TRS(0.75, 0, -0.1, 0, -0.2, 0)), { scale: 0.62, material: 'bronze', detail });
    } else {
      // Romulus with the spolia opima (a trophy of the king Acron's armour) on his shoulder.
      armoredEmperor(b, mul(grp, TRS(0, 0, 0, 0, 0, 0, 1.6)), { material: 'bronze', detail, plinth: false, spear: false });
      box(b, 'bronze', 0.45, 2.75, 0.1, 0.45, 0.55, 0.25, grp);
      box(b, 'wood_dark', 0.45, 2.4, 0.1, 0.06, 1.6, 0.06, grp);
    }
    const lines =
      side > 0
        ? ['AENEAS VENERIS ET ANCHISAE FILIVS', 'TROIANOS QVI CAPTA TROIA BELLO SVPERFVERANT', 'IN ITALIAM ADDVXIT']
        : ['ROMVLVS MARTIS FILIVS', 'VRBEM ROMAM CONDIDIT ET REGNAVIT ANNOS DVODEQVADRAGINTA', 'SPOLIA OPIMA IOVI FERETRIO CONSECRAVIT'];
    const text = inscription(b, lines, 2.6, 0.75, mul(apex, T(0, 0.55, -1.71)), 'painted', { ground: '#efe6d2', ink: '#a3271f' });
    const pFront = new THREE.Vector3(0, 0, -3.2).applyMatrix4(apex);
    const pPanel = new THREE.Vector3(0, 0.55, -1.71).applyMatrix4(apex);
    spots.push(
      spotAt(side > 0 ? 'elogium-aeneas' : 'elogium-romulus', 'inscription', pFront.x, Y0 + floorY, pFront.z, pPanel.x, pPanel.z, {
        label: side > 0 ? 'Aeneas, son of Venus' : 'Romulus, son of Mars',
        text,
        gloss:
          side > 0
            ? 'Aeneas, son of Venus and Anchises, led the Trojans who had survived the war to Italy after Troy was taken.'
            : 'Romulus, son of Mars, founded the city of Rome and reigned 38 years; he dedicated the spolia opima to Jupiter Feretrius.',
      }),
    );
  }
  const pTop = Y0 + portico.wallTop;

  // ---- front wall (SW) with a wide central entrance and steps down to the street
  {
    const t = 1.2;
    const fz = -hd + t / 2;
    const gw = 11;
    const wH = pTop - 1.0;
    const yb = Math.min(-0.5, groundMin(g, -hw, -hd - 2, hw, -hd + 1) - 0.4);
    const ops = [
      { kind: 'door' as const, x: hw + 0.6, width: gw, height: wH - 2.4 - Y0, leaves: 'none' as const, frame: false, sill: Y0 - yb },
      { kind: 'arch' as const, x: hw + 0.6 - colX - depth / 2, width: 3.2, height: 5.2, sill: Y0 + floorY - yb },
      { kind: 'arch' as const, x: hw + 0.6 + colX + depth / 2, width: 3.2, height: 5.2, sill: Y0 + floorY - yb },
    ];
    wall(b, { length: 2 * hw + 1.2, height: wH - yb, thickness: t, material: 'travertine', openings: ops, detail, courses: 0.6 * S * 1.6, collide: true }, T(-hw - 0.6, yb, fz));
    // Marble cornice along the top and pilasters framing the entrance.
    span(b, 'marble', -hw - 0.7, wH - 0.5, fz - t / 2 - 0.15, hw + 0.7, wH, fz + t / 2, I);
    for (const sx of [-1, 1]) span(b, 'marble', sx * (gw / 2 + 0.3) - 0.45, Y0, fz - t / 2 - 0.25, sx * (gw / 2 + 0.3) + 0.45, wH - 0.5, fz - t / 2 + 0.05, I);
    // Steps down to the ground outside the entrance.
    stairsToGround(b, g, Y0, gw, T(0, 0, -hd));
    spots.push(spotAt('entrance', 'spawn', 0, Y0, -hd - 3, 0, 0, { label: 'Entrance to the Forum of Augustus' }));
  }

  // ---- the quadriga of Augustus, PATER PATRIAE
  {
    const qz = -22 * S;
    const pw = 3.6;
    const pd = 5.2;
    const ph = 2.6;
    span(b, 'marble', -pw / 2 - 0.3, Y0, qz - pd / 2 - 0.3, pw / 2 + 0.3, Y0 + 0.35, qz + pd / 2 + 0.3, I, true);
    span(b, 'marble', -pw / 2, Y0 + 0.35, qz - pd / 2, pw / 2, Y0 + ph - 0.25, qz + pd / 2, I, true);
    span(b, 'marble', -pw / 2 - 0.15, Y0 + ph - 0.25, qz - pd / 2 - 0.15, pw / 2 + 0.15, Y0 + ph, qz + pd / 2 + 0.15, I);
    quadriga(b, mul(I, TRS(0, Y0 + ph, qz + 0.4, 0, 0, 0, 1.15)), { detail: 'low', plinth: false, material: 'gilded_bronze' });
    const lines = ['IMP CAESARI AVGVSTO', 'PATRI PATRIAE', 'SENATVS POPVLVSQVE ROMANVS'];
    const text = inscription(b, lines, 2.8, 1.2, mul(I, T(0, Y0 + 1.35, qz - pd / 2 - 0.02)), 'bronze');
    spots.push(
      spotAt('quadriga-inscription', 'inscription', 0, Y0, qz - pd / 2 - 2.5, 0, qz, {
        label: 'The quadriga of Augustus',
        text,
        gloss: 'To Imperator Caesar Augustus, Father of his Country — the Senate and People of Rome. (Res Gestae 35: the title was inscribed beneath the quadriga in this forum.)',
      }),
    );
  }

  // ---- the firewall (peperino ashlar, travertine bands), wrapping the NE half
  const fH = A.firewallH * S;
  {
    const t = 2.4 * S;
    // Inner face of the wall (the body extends outwards); the N corner is square for the Hall of
    // the Colossus, the E corner cut on the skew (the deliberately irregular plan).
    const pts: [number, number][] = [
      [47, -3.4],
      [47, 62.6],
      [-37, 62.6],
      [-47, 47],
      [-47, -3.4],
    ].map(([x, z]) => [x * S, z * S]);
    const gateU = 22 * S; // along the back segment, from its NW (N) end
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i];
      const [cx, cz] = pts[i + 1];
      const len = Math.hypot(cx - ax, cz - az);
      const ry = Math.atan2(-(cz - az), cx - ax);
      const yb = Math.min(-0.8, groundMin(g, Math.min(ax, cx) - 2, Math.min(az, cz) - 2, Math.max(ax, cx) + 2, Math.max(az, cz) + 2) - 0.5);
      // The wall frame runs along +x; its front (−z side) must face the forum (inside).
      const at = mul(I, TRS(ax, yb, az, 0, ry, 0));
      const ops = i === 1 ? [{ kind: 'arch' as const, x: gateU, width: 3.4, height: 6.0, sill: Y0 - yb }] : [];
      // Local −z of this frame points out of the forum: the body sits outside the inner-face line.
      wall(b, { length: len, height: fH - yb + Y0, thickness: t, material: 'peperino', openings: ops, detail, courses: detail === 'high' ? 0.62 : undefined, collide: true }, mul(at, T(0, 0, -t / 2)));
      // Two travertine string courses dividing the wall into three zones (both faces).
      for (const fy of [fH / 3, (2 * fH) / 3]) box(b, 'travertine', len / 2, Y0 + fy - yb, -t / 2, len + 0.1, 0.45, t + 0.24, at);
      box(b, 'travertine', len / 2, Y0 + fH - yb + 0.2, -t / 2, len + 0.2, 0.4, t + 0.3, at);
    }
    // Arco dei Pantani: travertine arch frame and closed bronze doors (to the Subura — outside).
    const [ax, az] = pts[1];
    const [cx, cz] = pts[2];
    const ux = (cx - ax) / Math.hypot(cx - ax, cz - az);
    const uz = (cz - az) / Math.hypot(cx - ax, cz - az);
    const gx = ax + ux * gateU;
    const gz = az + uz * gateU;
    const ry = Math.atan2(-uz, ux);
    const gAt = mul(I, TRS(gx, Y0, gz, 0, ry, 0));
    // The gate frame on the forum side (local +z here), doors closed half-way through the wall.
    for (const sx of [-1, 1]) box(b, 'travertine', sx * 2.0, 3.2, 0.15, 0.6, 6.4, 0.5, gAt);
    box(b, 'travertine', 0, 6.6, 0.15, 4.8, 0.8, 0.5, gAt);
    box(b, 'bronze', 0, 2.3, -t / 2, 3.4, 4.6, 0.1, gAt, true);
    spots.push(spotAt('gate-subura', 'door', gx - uz * 1.6, Y0, gz + ux * 1.6, gx, gz, { label: 'Gate to the Subura (closed)' }));
  }

  // ---- Hall of the Colossus (N corner): the Genius of Augustus, ~12 m
  {
    const x0 = (A.colX + 1) * S;
    const x1 = 47 * S;
    const za = (A.porticoZ1 + 0.5) * S;
    const zb = 62.4 * S;
    span(b, 'travertine', x0, Math.min(-0.3, groundMin(g, x0, za, x1, zb) - 0.3), za, x1, Y0 + floorY - 0.04, zb, I, true);
    span(b, 'marble_giallo', x0, Y0 + floorY - 0.04, za, x1, Y0 + floorY, zb, I);
    // Walls: SE side opens towards the temple court through two columns; SW side opens to the portico.
    const hH = portico.wallTop + 3;
    span(b, 'marble', x0 - 0.6, Y0, zb - 1.5, x0 + 0.6, Y0 + hH, zb, I, true);
    span(b, 'marble', x0 - 0.6, Y0, za, x0 + 0.6, Y0 + hH * 0.2, za + 1.4, I, true);
    for (const k of [0.33, 0.66]) column(b, { order: 'corinthian', D: 0.75, height: portico.corniceY - floorY - 0.5, material: 'marble_pavonazzetto', trimMaterial: 'marble', detail: 'low' }, T(x0, Y0 + floorY, za + (zb - za) * k));
    span(b, 'marble', x0 - 0.6, Y0 + portico.corniceY - 0.5, za, x0 + 0.6, Y0 + hH, zb, I);
    span(b, 'plaster_white', x0, Y0 + hH - 0.4, za, x1, Y0 + hH - 0.2, zb, I);
    span(b, 'roof_tile', x0 - 0.5, Y0 + hH - 0.2, za - 0.3, x1, Y0 + hH + 0.3, zb, I);
    // The colossus against the back wall on a high base.
    const cx = (x0 + x1) / 2 + 0.6;
    const cz = zb - 2.6;
    span(b, 'marble', cx - 2.2, Y0 + floorY, cz - 1.6, cx + 2.2, Y0 + floorY + 1.5, cz + 1.6, I, true);
    togate(b, mul(I, TRS(cx, Y0 + floorY + 1.5, cz, 0, Math.PI * 0.65, 0, 4.4)), { material: 'marble', detail, plinth: false });
    spots.push(spotAt('hall-colossus', 'shrine', cx - 4.5, Y0 + floorY, cz - 3.5, cx, cz, { label: 'Hall of the Colossus: the Genius of Augustus' }));
  }

  // ---- Arches of Drusus and Germanicus (AD 19) beside the temple
  {
    const az = 26 * S;
    for (const side of [1, -1]) {
      const x = side * 25 * S;
      const at = mul(I, TRS(x, Y0, az, 0, 0, 0));
      plainArch(b, { span: 4.0, height: 6.4, pier: 1.6, depth: 2.4, material: 'marble', detail }, at);
      const lines = side > 0 ? ['GERMANICO CAESARI', 'TI AVGVSTI F'] : ['DRVSO CAESARI', 'TI AVGVSTI F'];
      inscription(b, lines, 3.2, 0.9, mul(at, T(0, 7.3, -1.24)), 'bronze');
      armoredEmperor(b, mul(at, TRS(0, 8.25, 0, 0, 0, 0, 1.1)), { material: 'gilded_bronze', detail: 'low' });
    }
  }

  // ---- life: a magistrate's spot, a bench in the portico, boys taking the toga virilis
  spots.push(spotAt('magistrate', 'npc', 0, Y0, 8, 0, 20, { label: 'Praetor setting out for his province' }));
  spots.push(spotAt('toga-virilis', 'npc', -6, Y0, -4, 0, 20, { label: 'A family at the toga virilis ceremony' }));
  spots.push(spotAt('portico-nw', 'sit', colX + 3, Y0 + floorY, -15, colX - 5, -15, { label: 'Bench in the NW portico' }));
}

/** Bands and pilasters of the Forum of Nerva's order (columns 6 m) at a floor `y0` (exedra frame). */
function nervaDressing(y0: number) {
  return {
    bands: [
      { y: y0 - 0.05, h: 0.45, proj: 0.18, material: 'marble' as MaterialId },
      { y: y0 + 6.0, h: 0.85, proj: 0.12, material: 'marble' as MaterialId },
      { y: y0 + 6.85, h: 0.56, proj: 0.38, material: 'marble' as MaterialId },
      { y: y0 + 7.41, h: 1.9, proj: 0.06, material: 'marble' as MaterialId },
      { y: y0 + 9.3, h: 0.22, proj: 0.24, material: 'marble' as MaterialId },
    ],
    pilasters: { count: 9, y0: y0 + 0.4, y1: y0 + 6.0, width: 0.85, proj: 0.2, material: 'marble' as MaterialId },
  };
}

// ------------------------------------------------------------------ the temple

const MARS_SPEC = {
  order: 'corinthian' as const,
  plan: 'sine_postico' as const,
  front: 8,
  sides: 9,
  D: 1.76 * S,
  columnHeight: 17.7 * S,
  intercolumniation: 'pycnostyle' as const,
  podiumHeight: 3.5 * S,
  material: 'marble' as MaterialId,
  podiumMaterial: 'marble' as MaterialId,
  pitchDeg: 13.5,
};

function buildMarsUltor(ctx: LandmarkContext, b: MeshBuilder, detail: Detail, spots: CapSpot[]) {
  const spec = { ...MARS_SPEC, detail };
  const L = templeLayout(spec);
  // Back of the stylobate against the firewall (forum z = 62.5 real ↔ 20.8 real in this frame).
  const dz = 20.6 * S - L.stylobate.z1;
  const at = T(0, 0, dz);
  // The square's paving is 0.12 above the pad: the temple stands on it.
  const m = mul(at, T(0, Y0, 0));
  footing(b, 'travertine', ctx.groundAt, L.stylobate.x0, L.stairs.z0 + dz, L.stylobate.x1, L.stylobate.z1 + dz, Y0, undefined, false);
  const res = capTemple(
    b,
    {
      ...spec,
      roofMaterial: 'roof_tile',
      doorMaterial: 'bronze',
      tympanum: paint(PAINT.blue, 0.85),
      interior: true,
      hiColumns: 'front',
      innerColumns: 5,
      apse: 0.8,
      floor: 'marble_giallo',
      cornerStatues: true,
      furnish: (bb, info) => {
        const zc = info.z1 - ((info.x1 - info.x0) / 2) * 0.8 - 0.05;
        const y = info.y + 0.9;
        // Mars Ultor (armoured, bearded) in the middle, Venus with Cupid on his right, Divus Julius on his left.
        armoredEmperor(bb, mul(info.at, TRS(0, y, zc + 1.2, 0, 0, 0, 2.6)), { material: 'marble', detail: info.detail, plinth: true, spear: true });
        figure(bb, 'draped', mul(info.at, TRS(-2.6, y, zc + 0.6, 0, 0.25, 0)), { scale: 2.3, material: 'marble', detail: info.detail });
        figure(bb, 'nude', mul(info.at, TRS(-1.75, y, zc - 0.2, 0, 0.3, 0)), { scale: 0.8, material: 'marble', detail: info.detail });
        togate(bb, mul(info.at, TRS(2.6, y, zc + 0.6, 0, -0.25, 0, 2.2)), { material: 'marble', detail: info.detail, plinth: true });
        // The standards recovered from Parthia (20 BC), set up before the apse.
        for (const sx of [-1, 1]) for (let k = 0; k < 2; k++) standard(bb, mul(info.at, T(sx * (3.6 + k * 0.7), info.y, zc - 2.2 - k * 0.6)), 2.8, info.detail);
        span(bb, 'marble', -4.8, info.y, zc - 3.2, 4.8, info.y + 0.05, zc - 1.8, info.at);
      },
    },
    m,
  );
  // Altar in front of the stair.
  const az = res.stairFoot.z + dz - 2.2;
  altar(b, 2.6, 1.6, 1.15, T(0, Y0, az), { detail, fire: true });
  addLamp(ctx, 0, Y0 + 1.5, az, 'brazier');
  // Dedication on the architrave (reconstructed text; the original is lost).
  const L2 = res.layout;
  const archY = Y0 + L2.podiumHeight + L2.H + 0.35;
  const text = inscription(b, ['IMP CAESAR DIVI F AVGVSTVS PONT MAX COS XIII P P MARTI VLTORI'], L2.spanX * 0.78, 0.48, mul(at, T(0, archY, L2.entablature.z0 - 0.03)), 'bronze');
  const sf = res.stairFoot.clone().add(new THREE.Vector3(0, Y0, dz));
  spots.push(
    spotAt('dedication', 'inscription', 0, Y0, sf.z - 6, 0, sf.z, {
      label: 'Dedication of the Temple of Mars Ultor',
      text,
      gloss: 'Imperator Caesar Augustus, son of the deified, pontifex maximus, consul for the 13th time, father of his country, to Mars the Avenger. (Reconstructed: the original inscription is lost.)',
    }),
  );
  spots.push(spotAt('altar', 'shrine', 0, Y0, az - 2.2, 0, az, { label: 'Altar of Mars Ultor' }));
  spots.push(spotAt('priest', 'npc', 1.6, Y0, az - 0.8, 0, az - 6, { label: 'Priest at the altar' }));
  const st = res.stairTop.clone().add(new THREE.Vector3(0, Y0, dz));
  spots.push(spotAt('steps-top', 'vista', 0, st.y, st.z + 0.6, 0, st.z - 40, { label: 'Top of the steps of Mars Ultor' }));
  if (res.interior) {
    const it = res.interior;
    const d0 = res.doors[0].clone().add(new THREE.Vector3(0, Y0, dz));
    spots.push(spotAt('cella-door', 'door', d0.x, d0.y, d0.z - 0.8, d0.x, d0.z + 5, { label: 'Doors of the cella' }));
    spots.push(spotAt('signa-parthica', 'shrine', 0, it.y + Y0, it.z1 + dz - 9, 0, it.z1 + dz, { label: 'The standards recovered from Parthia' }));
  }
}

// ------------------------------------------------------------------ far stand-ins

function forumFar(b: MeshBuilder) {
  const A = AUGUSTUS;
  const hw = A.halfW * S;
  const hd = A.halfD * S;
  const colX = A.colX * S;
  const z0 = A.porticoZ0 * S;
  const z1 = A.porticoZ1 * S;
  const top = 11.1;
  span(b, 'paving_travertine', -colX, -0.5, -hd, colX, Y0, hd, undefined);
  for (const sd of [-1, 1]) {
    const xa = sd * colX;
    const xb = sd * (hw + 1.2);
    span(b, 'marble', Math.min(xa, xb) + (sd > 0 ? 0.6 : 0), Y0 + 7.8, z0, Math.max(xa, xb) - (sd < 0 ? 0.6 : 0), Y0 + top, z1, undefined);
    span(b, 'marble', sd > 0 ? hw : xb, 0, z0, sd > 0 ? xb : -hw, Y0 + top + 1.5, z1, undefined);
    leanTo(b, 'roof_tile', Math.min(xa, xb), Math.max(xa, xb), z0, Y0 + top, z1, Y0 + top, undefined);
    farColonnade(b, 'marble_giallo', z0, z1, 0, Y0 + 0.66, 6.0, 20, 0.6, TRS(xa, 0, 0, 0, -Math.PI / 2, 0));
    const ex = A.exedra;
    const g = new THREE.CylinderGeometry((ex.R + ex.t) * S, (ex.R + ex.t) * S, 14, 10, 1, true, sd > 0 ? 0 : Math.PI, Math.PI);
    g.translate(0, 7, 0);
    b.add(g, 'peperino', T(sd * hw, 0, ex.cz * S));
  }
  const fH = A.firewallH * S + Y0;
  const pts: [number, number][] = [
    [47, -3.4],
    [47, 62.6],
    [-37, 62.6],
    [-47, 47],
    [-47, -3.4],
  ].map(([x, z]) => [x * S, z * S]);
  for (let i = 0; i < pts.length - 1; i++) farWall(b, 'peperino', pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], 1.4, -1, fH);
  farWall(b, 'travertine', -hw, -hd + 0.6, hw, -hd + 0.6, 1.2, -1, Y0 + top);
  span(b, 'gilded_bronze', -1.5, Y0 + 2.6, -22 * S - 2, 1.5, Y0 + 5, -22 * S + 2, undefined);
}

function marsFar(b: MeshBuilder) {
  const L = templeLayout(MARS_SPEC);
  templeFar(b, L, T(0, Y0, 20.6 * S - L.stylobate.z1), { podium: 'marble' });
}

export const builders: LandmarkBuilder[] = [
  {
    handles: ['forum-augustus'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildForum(ctx, b, d, spots), { far: ctx.detail === 'high' && forumFar, cull: 340 }),
  },
  {
    handles: ['temple-mars-ultor'],
    build: (ctx) => makeLandmark(ctx, (b, d, spots) => buildMarsUltor(ctx, b, d, spots), { far: ctx.detail === 'high' && marsFar, cull: 330 }),
  },
];

/** Exported for the Forum of Nerva builder (shared walls). */
export const AUGUSTUS_Y0 = Y0;
