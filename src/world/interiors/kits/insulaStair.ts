/**
 * Kit 'insula-stair': behind an insula's stair door. A plastered passage, a straight flight up to
 * the first landing with the tenants' doors, and one rented flat (cenaculum) open off it: a main
 * room with a window bay, a sleeping alcove, a table and stools, a brazier, a shelf of pots. The
 * flight carries on up into the dark (the floors above are other people's).
 *
 * Local frame: the street door's threshold at the origin, +z into the building, x along the wall,
 * the passage floor at y = 0 (the street door's sill). 1:1 metres.
 */
import { Rng } from '../../../core/Rng';
import type { MaterialId } from '../../../gfx/materialIds';
import { Draw } from '../../../arch/fabric/draw';
import { placeProp } from '../../../arch/props';
import type { Spot } from '../../landmarks/types';
import type { InteriorKit, KitBuilt, KitContext, KitLamp, KitPlan } from '../generic';
import * as THREE from 'three';

const RISE = 0.19, RUN = 0.27;
const STEPS = 17; // one storey (3.2 m)
const PW = 1.5; // passage and stair width
const PASS = 3.2; // passage length (z 0.6 … PASS)
const CEIL = 3.0;

interface Layout {
  wealth: number;
  /** The flat opens off the landing to this side (+1 right, −1 left). */
  side: 1 | -1;
  landZ0: number;
  landZ1: number;
  landY: number;
  flatW: number;
  flatD: number;
  walls: MaterialId;
  dado: MaterialId;
}

function layout(seed: number, wealth: number): Layout {
  const r = new Rng(seed ^ 0x3c6ef372);
  const landY = STEPS * RISE;
  const landZ0 = PASS + STEPS * RUN;
  return {
    wealth,
    side: r.chance(0.5) ? 1 : -1,
    landZ0,
    landZ1: landZ0 + 2.6,
    landY,
    flatW: r.range(4.6, 6.2) + wealth * 1.2,
    flatD: r.range(4.2, 5.4),
    walls: wealth > 0.55 ? 'plaster_white' : 'plaster_cream',
    dado: r.chance(0.6) ? 'plaster_red' : 'plaster_ochre',
  };
}

function plan(seed: number, wealth: number): KitPlan {
  const L = layout(seed, wealth);
  const xa = Math.min(-PW / 2 - 0.3, L.side < 0 ? -PW / 2 - L.flatW - 0.4 : -PW / 2 - 0.3);
  const xb = Math.max(PW / 2 + 0.3, L.side > 0 ? PW / 2 + L.flatW + 0.4 : PW / 2 + 0.3);
  return {
    bounds: { min: { x: xa, y: -0.6, z: -0.4 }, max: { x: xb, y: L.landY + 6, z: L.landZ1 + 3 } },
    entry: { position: { x: 0, y: 0.05, z: 1.1 }, heading: 0 },
    exitAt: { x: 0, y: 1.2, z: 0.5 },
    route: [{ x: 0, y: 0, z: 1.1 }, { x: 0, y: 0, z: PASS - 0.2 }, { x: 0, y: L.landY, z: L.landZ0 + 0.8 }, { x: L.side * (PW / 2 + 2.2), y: L.landY, z: L.landZ0 + 1.3 }],
  };
}

/** A room box: floor, ceiling, four walls (with the openings left as gaps in `skip`), all solid. */
function room(d: Draw, x0: number, x1: number, z0: number, z1: number, y: number, h: number, walls: MaterialId, dado: MaterialId, floor: MaterialId) {
  const t = 0.25;
  d.span(floor, x0, y - 0.2, z0, x1, y, z1);
  d.solid(x0, y - 0.6, z0, x1, y, z1);
  d.span('wood_dark', x0, y + h, z0, x1, y + h + 0.15, z1, { shadow: false });
  // Ceiling beams.
  for (let x = x0 + 0.6; x < x1 - 0.3; x += 0.9) d.span('wood_dark', x - 0.07, y + h - 0.16, z0, x + 0.07, y + h, z1, { shadow: false });
  return { t, walls, dado };
}

/** A wall from (x0,z0) to (x1,z1) (axis-aligned), with an optional doorway gap [g0,g1] along it. */
function wallRun(d: Draw, x0: number, z0: number, x1: number, z1: number, y: number, h: number, mat: MaterialId, dado: MaterialId, gap?: [number, number], gapH = 2.2) {
  const t = 0.2;
  const alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0);
  const a = alongX ? Math.min(x0, x1) : Math.min(z0, z1);
  const b = alongX ? Math.max(x0, x1) : Math.max(z0, z1);
  const segs: [number, number, number, number][] = gap ? [[a, gap[0], y, y + h], [gap[1], b, y, y + h], [gap[0], gap[1], y + gapH, y + h]] : [[a, b, y, y + h]];
  for (const [s0, s1, ya, yb] of segs) {
    if (s1 - s0 < 0.02) continue;
    if (alongX) {
      d.span(mat, s0, ya, z0 - t / 2, s1, yb, z0 + t / 2);
      if (ya === y) d.span(dado, s0, ya, z0 - t / 2 - 0.01, s1, ya + 1.0, z0 + t / 2 + 0.01, { shadow: false });
      d.solid(s0, ya, z0 - t / 2, s1, yb, z0 + t / 2);
    } else {
      d.span(mat, x0 - t / 2, ya, s0, x0 + t / 2, yb, s1);
      if (ya === y) d.span(dado, x0 - t / 2 - 0.01, ya, s0, x0 + t / 2 + 0.01, ya + 1.0, s1, { shadow: false });
      d.solid(x0 - t / 2, ya, s0, x0 + t / 2, yb, s1);
    }
  }
}

function build(ctx: KitContext): KitBuilt {
  const L = layout(ctx.seed, ctx.wealth);
  const r = new Rng(ctx.seed);
  const b = ctx.builder();
  const d = new Draw(b);
  const { walls, dado } = L;
  const spots: Spot[] = [];
  const lamps: KitLamp[] = [];
  const hx = PW / 2;

  // ---- the passage from the street door
  room(d, -hx, hx, 0, PASS, 0, CEIL, walls, dado, 'cobbles');
  wallRun(d, -hx, 0, -hx, PASS, 0, CEIL, walls, dado);
  wallRun(d, hx, 0, hx, PASS, 0, CEIL, walls, dado);
  // The street door seen from inside: shut leaves in the doorway.
  d.span('wood_dark', -0.6, 0, -0.05, 0.6, 2.4, 0.05);
  d.span(walls, -hx, 2.4, -0.1, hx, CEIL, 0.1);
  d.span(walls, -hx, 0, -0.1, -0.6, 2.4, 0.1);
  d.span(walls, 0.6, 0, -0.1, hx, 2.4, 0.1);
  d.solid(-hx, 0, -0.3, hx, CEIL, 0.05);
  lamps.push({ position: { x: 0, y: 2.3, z: 1.6 }, intensity: 4, distance: 7 });
  // A painted notice by the stair foot (lodgings to let: the Pompeian kind).
  d.span('plaster_white', hx - 0.12, 1.3, 1.4, hx - 0.1, 1.9, 2.4, { shadow: false });

  // ---- the flight up
  for (let i = 0; i < STEPS; i++) {
    const z = PASS + i * RUN, y = (i + 1) * RISE;
    d.span('travertine', -hx, y - RISE - 0.02, z, hx, y, z + RUN + 0.02);
    d.solid(-hx, 0, z, hx, y, z + RUN);
  }
  // Stair walls up to the landing, and a sloping soffit.
  for (const s of [-1, 1]) wallRun(d, s * hx, PASS, s * hx, L.landZ0, 0, L.landY + CEIL, walls, dado);
  d.span('wood_dark', -hx, L.landY + CEIL - 0.3, PASS, hx, L.landY + CEIL, L.landZ0, { shadow: false });

  // ---- the landing, with a door each side and one at the end; the flat's is open
  const ly = L.landY;
  const lz0 = L.landZ0, lz1 = L.landZ1;
  const lw = hx + 0.5;
  room(d, -lw, lw, lz0, lz1, ly, CEIL, walls, dado, 'wood');
  const doorZ = (lz0 + lz1) / 2;
  // (the wall on the flat's side is the flat's own, below)
  wallRun(d, -L.side * lw, lz0, -L.side * lw, lz1, ly, CEIL, walls, dado);
  wallRun(d, -lw, lz1, lw, lz1, ly, CEIL, walls, dado);
  // Where the landing is wider than the stair: the wall across, from the passage floor up.
  for (const s of [-1, 1]) d.span(walls, Math.min(s * hx, s * lw), -0.3, lz0 - 0.1, Math.max(s * hx, s * lw), ly + CEIL, lz0 + 0.1);
  // The closed doors of the other tenants: on the far side and at the end.
  d.span('wood_dark', -L.side * (lw - 0.13) - 0.03, ly, doorZ - 0.5, -L.side * (lw - 0.13) + 0.03, ly + 2.15, doorZ + 0.5);
  d.span('wood_dark', -0.5, ly, lz1 - 0.13, 0.5, ly + 2.15, lz1 - 0.08);
  // The flight on up: the next flight's first steps, then dark.
  for (let i = 0; i < 4; i++) d.span('travertine', -lw + 0.1, ly + i * RISE, lz1 - 1.2 - i * 0.27, -lw + 1.0, ly + (i + 1) * RISE, lz1 - 0.95 - i * 0.27);
  lamps.push({ position: { x: 0, y: ly + 2.2, z: doorZ }, intensity: 4, distance: 6 });
  spots.push({ id: 'landing', kind: 'spot', position: new THREE.Vector3(0, ly, doorZ), heading: 0 } as Spot);

  // ---- the flat (cenaculum): main room off the landing, an alcove at the back
  const fx0 = L.side > 0 ? lw : -lw - L.flatW;
  const fx1 = L.side > 0 ? lw + L.flatW : -lw;
  const fz0 = doorZ - L.flatD / 2, fz1 = doorZ + L.flatD / 2;
  room(d, fx0, fx1, fz0, fz1, ly, CEIL, walls, dado, L.wealth > 0.5 ? 'mosaic' : 'wood');
  wallRun(d, fx0, fz0, fx1, fz0, ly, CEIL, walls, dado);
  wallRun(d, fx0, fz1, fx1, fz1, ly, CEIL, walls, dado);
  // The wall to the landing, with the flat's doorway.
  wallRun(d, L.side * lw, fz0, L.side * lw, fz1, ly, CEIL, walls, dado, [doorZ - 0.5, doorZ + 0.5]);
  // Open door leaf, swung back against the flat's wall.
  d.span('wood_dark', L.side * (lw + 0.12), ly, doorZ + 0.5, L.side * (lw + 0.17), ly + 2.15, doorZ + 1.45);
  const far = L.side > 0 ? fx1 : fx0;
  wallRun(d, far, fz0, far, fz1, ly, CEIL, walls, dado, [doorZ - 0.7, doorZ + 0.7], 1.9);
  // The window in the far wall: daylight beyond it (a pale plane) and a sill.
  const out = L.side;
  d.span('plaster_white', far + out * 0.6, ly + 0.9, doorZ - 0.7, far + out * 0.62, ly + 1.9, doorZ + 0.7, { shadow: false });
  // Daylight through it: a cool light just inside the window.
  lamps.push({ position: { x: far - out * 0.6, y: ly + 1.6, z: doorZ }, color: 0xd8e4ff, intensity: 6, distance: 7 });
  d.span('travertine', far - out * 0.15, ly + 0.85, doorZ - 0.8, far + out * 0.15, ly + 0.92, doorZ + 0.8);
  d.solid(far - 0.15, ly, doorZ - 0.7, far + 0.15, ly + 0.92, doorZ + 0.7);
  d.solid(far + out * 0.3 - 0.15, ly, doorZ - 0.8, far + out * 0.3 + 0.15, ly + CEIL, doorZ + 0.8);
  // Furniture: bed in the corner, table and stools, a brazier, a shelf with pots, a chest.
  const ix = (k: number) => (L.side > 0 ? fx0 + k : fx1 - k);
  const P = d.at(0, ly, 0);
  d.span('wood', ix(L.flatW - 2.1) - 0.0, ly, fz1 - 1.05, ix(L.flatW - 0.25), ly + 0.45, fz1 - 0.2);
  d.span('fabric_white', ix(L.flatW - 2.05), ly + 0.45, fz1 - 1.0, ix(L.flatW - 0.3), ly + 0.6, fz1 - 0.25, { shadow: false });
  d.solid(Math.min(ix(L.flatW - 2.1), ix(L.flatW - 0.25)), ly, fz1 - 1.05, Math.max(ix(L.flatW - 2.1), ix(L.flatW - 0.25)), ly + 0.6, fz1 - 0.2);
  placeProp(P, 'table', ix(L.flatW * 0.45), 0, doorZ - 0.3, r.range(0, Math.PI));
  placeProp(P, 'stool', ix(L.flatW * 0.45) + 0.7, 0, doorZ - 0.6, 0);
  placeProp(P, 'stool', ix(L.flatW * 0.45) - 0.6, 0, doorZ + 0.3, 0);
  placeProp(P, 'brazier', ix(1.0), 0, fz0 + 0.8, 0);
  placeProp(P, 'shelf', ix(L.flatW * 0.5), 0, fz0 + 0.25, 0);
  placeProp(P, 'amphora_tall', ix(0.5), 0, fz1 - 0.4, 0);
  placeProp(P, 'oil_lamp', ix(L.flatW * 0.45), 0.78, doorZ - 0.3, 0);
  lamps.push({ position: { x: ix(L.flatW * 0.45), y: ly + 1.1, z: doorZ - 0.3 }, intensity: 5, distance: 8 });
  spots.push({ id: 'flat', kind: 'spot', position: new THREE.Vector3(ix(L.flatW * 0.5), ly, doorZ + 0.6), heading: 0 } as Spot);

  const object = b.build('interior:insula-stair');
  return { object, colliders: [...b.colliders], spots, lamps };
}

export const insulaStairKit: InteriorKit = {
  id: 'insula-stair',
  name: 'An insula stair',
  latin: 'Scalae insulae',
  plan,
  build,
};
