/**
 * Castra Praetoria (AD 23): the fortress of the Praetorian Guard on the NE edge of the city
 * (§3.35). 440 × 380 m with rounded corners; brick-faced concrete walls 4.73 m high with
 * battlements — freestanding at their original height in 113 (the raising and the Aurelian Wall
 * come later); a gate in the middle of each side with towers (the one facing the city assumed W,
 * FLAG); vaulted rooms along the inside of the walls, rows of barracks, the principia with the
 * shrine of the standards, a small bath and the parade ground. Also home to the urban cohorts.
 *
 * The walls are a human-scale defence, so they keep their real height (not ×0.6) and still stop
 * a person; the plan is scaled.
 */
import { placeProp } from '../../../arch/props';
import type { LandmarkBuild, LandmarkBuilder, LandmarkContext, Spot } from '../types';
import { dims, draw, farDraw, finish, groundRange, inscription, plinth, spot } from './generic-common';
import { fort, thermae } from './generic-civic';

function buildCastraPraetoria(ctx: LandmarkContext): LandmarkBuild {
  const { lm } = ctx;
  const d = draw(ctx);
  const far = farDraw();
  const { w, d: dd } = dims(ctx);
  const spots: Spot[] = [];
  fort(d, ctx, w, dd, spots, far, { wallH: 4.73, wallT: 1.8, wallMat: 'brick', gates: [0.5, 0.5, 0.5, 0.5], corner: 14, wallCells: true, barracks: true });
  // The front gate (porta praetoria towards the city) carries the dedication.
  const gy = ctx.groundAt(0, -dd / 2);
  inscription(d, ['COHORTES PRAETORIAE'], 0, gy + 6.2, -dd / 2 - 0.95, 5, 0.6);
  // Camp baths in the SE quarter and the training ground with its posts (pali) by the W gate.
  const bx = w * 0.3, bz = dd * 0.3, bw = 30, bd = 26;
  const { max } = groundRange(ctx, bx - bw / 2, bz - bd / 2, bx + bw / 2, bz + bd / 2, 3);
  const B = d.at(bx, max, bz);
  const sub = { ...ctx, groundAt: (x: number, z: number) => ctx.groundAt(x + bx, z + bz) - max };
  thermae(B, sub, bw, bd, 8, spots, far, { natatio: false, palaestrae: false, rotunda: false, title: 'BALNEVM' });
  for (let i = 0; i < 8; i++) {
    const x = -w * 0.32 + (i % 4) * 2.2, z = -dd * 0.32 + Math.floor(i / 4) * 2.4;
    d.cyl('wood_dark', x, ctx.groundAt(x, z) + 0.9, z, 0.12, 1.8, 6, { collide: true });
  }
  placeProp(d, 'cart', -w * 0.25, ctx.groundAt(-w * 0.25, -dd * 0.38), -dd * 0.38, 0.4);
  spots.push(
    spot(`${lm.id}:pali`, 'npc', -w * 0.32 + 3, ctx.groundAt(-w * 0.32 + 3, -dd * 0.32 - 1.5), -dd * 0.32 - 1.5, 0),
    spot(`${lm.id}:tribune`, 'npc', 2.5, ctx.groundAt(2.5, -dd * 0.06 - dd * 0.09 - 4), -dd * 0.06 - dd * 0.09 - 4, Math.PI),
    spot(`${lm.id}:spawn`, 'spawn', 0, ctx.groundAt(0, -dd / 2 - 10), -dd / 2 - 10, 0),
  );
  void plinth;
  return finish(lm.id, d, spots, far, 2600);
}

export const builders: LandmarkBuilder[] = [{ handles: ['castra-praetoria'], build: buildCastraPraetoria }];
