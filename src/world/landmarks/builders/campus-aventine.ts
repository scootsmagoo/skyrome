/**
 * The Aventine: Trajan's private house and the old federal Temple of Diana.
 * - privata-traiani: the wealthy domus where Trajan lived before his accession, atrium and
 *   peristyle behind a plain street front; clients still wait on the bench for the morning
 *   salutatio, and a porter keeps the door (Plotina's friends gather here).
 * - temple-diana-aventine: rebuilt by L. Cornificius (36 BC): octastyle and — per the Marble Plan —
 *   dipteral (FLAG); here an octastyle peripteral in marble with a second row across the front, the
 *   altar before it and the ancient bronze stele of the league's law (lex arae Dianae, Dion. Hal.
 *   4.26) by the steps. On 13 August slaves keep holiday here; runaways seek the goddess.
 */
import { placeProp } from '../../../arch/props';
import { domus } from '../../../arch/fabric/domus';
import { inscriptionPanel } from '../../../arch/common/inscription';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { T, dims, draw, farDraw, finish, mul, plinth, spot, tiledRoof, liftAll } from './generic-common';
import { liteColumnAt } from './generic-civic-lib';
import { appendBuilding } from './generic-civic';
import { fitTemple } from './generic-sacred';
import { temple } from '../../../arch/classical/temple';
import { altar } from './generic-common';

function buildPrivataTraiani(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  const g = (x: number, z: number) => ctx.groundAt(x, z);
  const out = domus({ width: w, depth: dd, seed: 98, wealth: 1, groundAt: g, detail: detail === 'high' ? 'full' : 'low', shops: true, upperFloor: true });
  appendBuilding(d, out, 0, 0, 0, 0, spots, lm.id);
  // A marble plaque by the door and the clients' bench along the street front.
  const y = Math.max(g(0, -dd / 2 - 0.5), g(-3, -dd / 2 - 0.5));
  inscriptionPanel(d.b, { lines: ['PRIVATA TRAIANI'], width: 1.8, height: 0.42, style: 'carved' }, mul(d.m, T(-2.2, y + 2.6, -dd / 2 - 0.06)), { depth: 0.05 });
  for (let k = 0; k < 2; k++) placeProp(d, 'bench_masonry', -4.5 - k * 1.8, g(-4.5 - k * 1.8, -dd / 2 - 0.9), -dd / 2 - 0.9, 0);
  spots.push(
    spot(`${lm.id}:door`, 'door', 0, g(0, -dd / 2 - 0.8), -dd / 2 - 0.8, 0),
    spot(`${lm.id}:porter`, 'npc', 1.3, g(1.3, -dd / 2 - 0.5), -dd / 2 - 0.5, Math.PI),
    spot(`${lm.id}:clients`, 'sit', -4.5, g(-4.5, -dd / 2 - 0.9) + 0.45, -dd / 2 - 0.9, Math.PI),
    spot(`${lm.id}:plaque`, 'inscription', -2.2, g(-2.2, -dd / 2 - 1.6), -dd / 2 - 1.6, 0),
  );
  far.span('plaster_cream', -w / 2, 0, -dd / 2, w / 2, 7, dd / 2);
  tiledRoof(far, 'hip', 0, 0, w, dd, 7, 'low');
  return finish(lm.id, d, spots, far);
}

function buildDianaAventine(ctx: LandmarkContext): LandmarkBuild {
  const { lm, detail } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  plinth(d, ctx, -w / 2, -dd / 2, w / 2, dd / 2, 0.02, 'travertine');
  // Leave room in front for the altar court.
  const fit = fitTemple(w * 0.97, dd * 0.86, { order: 'ionic', plan: 'peripteral', front: 8, material: 'marble', podiumMaterial: 'travertine', cellaMaterial: 'marble', roofMaterial: 'roof_tile', detail, maxHighColumns: 12 });
  const oz = fit.offsetZ + dd * 0.07;
  temple(d.b, fit.spec, mul(d.m, T(0, 0, oz)));
  const L = fit.layout;
  // The second (inner) row across the front of a dipteral plan, between the outer ring and the cella.
  const zr = oz + (L.stylobate.z0 + L.cella.z0) / 2 + 0.6;
  for (let i = 0; i < 6; i++) {
    const x = -L.spanX / 2 + L.axial * (i + 1);
    liteColumnAt(d, x, L.podiumHeight, zr, L.H, L.D, 'marble', 'ionic', detail);
  }
  const front = oz + L.podiumFront;
  altar(d, 0, 0, (front - dd / 2) / 2, 2.2, 1.3, 1.1, 'marble');
  // The bronze stele of the Latin league's law beside the steps.
  const sx = L.stairs.x1 + 1.6;
  d.box('travertine', sx, 0.3, front - 1.2, 1.4, 0.6, 0.8, { collide: true });
  d.box('bronze', sx, 0.6 + 1.3, front - 1.2, 1.0, 2.6, 0.2, { collide: true });
  inscriptionPanel(d.b, { lines: ['LEX ARAE DIANAE', 'IN AVENTINO', 'FOEDVS LATINVM'], width: 0.9, height: 2.2, style: 'bronze', sizes: [1, 0.8, 0.8] }, mul(d.m, T(sx, 0.6 + 1.3, front - 1.32)), { depth: 0.02, bodyMaterial: 'bronze' });
  spots.push(
    spot(`${lm.id}:door`, 'door', 0, L.podiumHeight, oz + L.cella.z0 - 0.6, 0),
    spot(`${lm.id}:altar`, 'shrine', 0, 0, (front - dd / 2) / 2 - 1.8, 0),
    spot(`${lm.id}:lex`, 'inscription', sx, 0, front - 2.4, 0),
    spot(`${lm.id}:suppliant`, 'npc', -L.stairs.x1 - 1.2, 0, front - 0.8, 0),
    spot(`${lm.id}:steps`, 'sit', L.stairs.x0 + 0.6, 0.66, front + 1, Math.PI),
  );
  far.span('travertine', L.stylobate.x0, 0, front, L.stylobate.x1, L.podiumHeight, oz + L.stylobate.z1);
  far.span('marble', L.stylobate.x0, L.podiumHeight, oz + L.stylobate.z0, L.stylobate.x1, L.podiumHeight + L.H + L.entablature.height, oz + L.stylobate.z1);
  tiledRoof(far, 'gable', 0, oz + (L.stylobate.z0 + L.stylobate.z1) / 2, L.stylobate.x1 - L.stylobate.x0, L.stylobate.z1 - L.stylobate.z0, L.podiumHeight + L.H + L.entablature.height, 'low', { axis: 'z', pitchDeg: 14 });
  return finish(lm.id, d, spots, far);
}

export const builders: LandmarkBuilder[] = liftAll([
  { handles: ['privata-traiani'], build: buildPrivataTraiani },
  { handles: ['temple-diana-aventine'], build: buildDianaAventine },
]);
