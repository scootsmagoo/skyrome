/**
 * Kit 'domus': behind a house's front door. The fauces (entrance passage, a mosaic dog by the door
 * for the richer), the atrium with its impluvium under the open compluvium, bedrooms (cubicula) off
 * both sides, the household shrine (lararium), the tablinum at the back opening onto the atrium, and
 * in a richer house a dining room (triclinium) beside it. Red dado, white upper walls, a timber
 * ceiling round the opening in the roof; daylight falls through the compluvium.
 *
 * Local frame: the street door's threshold at the origin, +z into the house, floor at y = 0.
 */
import * as THREE from 'three';
import { Rng } from '../../../core/Rng';
import type { MaterialId } from '../../../gfx/materialIds';
import { Draw } from '../../../arch/fabric/draw';
import { lararium } from '../../../arch/fabric/shrines';
import { placeProp } from '../../../arch/props';
import type { Spot } from '../../landmarks/types';
import type { InteriorKit, KitBuilt, KitContainer, KitContext, KitLamp, KitPlan } from '../generic';
import { chest, room, wallRun } from './parts';

const FW = 2.0; // fauces width
const FL = 4.0; // fauces length
const H = 5.2; // atrium wall height
const RD = 3.4; // side room depth
const TD = 4.4; // tablinum depth

interface Layout {
  aw: number;
  ad: number;
  /** Bedrooms per side. */
  rooms: number;
  triclinium: boolean;
  upper: MaterialId;
  dado: MaterialId;
  floor: MaterialId;
}

function layout(seed: number, wealth: number): Layout {
  const r = new Rng(seed ^ 0x6a09e667);
  return {
    aw: r.range(8.5, 10) + wealth * 2.5,
    ad: r.range(8.5, 10) + wealth * 2,
    rooms: wealth > 0.6 ? 3 : 2,
    triclinium: wealth > 0.45 || r.chance(0.4),
    upper: r.chance(0.7) ? 'plaster_white' : 'plaster_cream',
    dado: r.chance(0.75) ? 'plaster_red' : 'plaster_ochre',
    floor: wealth > 0.5 ? 'mosaic' : 'paving_travertine',
  };
}

function plan(seed: number, wealth: number): KitPlan {
  const L = layout(seed, wealth);
  const az0 = FL, az1 = FL + L.ad;
  return {
    bounds: { min: { x: -L.aw / 2 - RD - 0.5, y: -0.7, z: -0.4 }, max: { x: L.aw / 2 + RD + 0.5, y: H + 3, z: az1 + TD + 0.5 } },
    entry: { position: { x: 0, y: 0.05, z: 1.2 }, heading: 0 },
    exitAt: { x: 0, y: 1.3, z: 0.5 },
    route: [{ x: 0, y: 0, z: 1.2 }, { x: 0, y: 0, z: az0 + 1 }, { x: L.aw / 4, y: 0, z: (az0 + az1) / 2 }, { x: 0, y: 0, z: az1 + TD / 2 }],
  };
}

function build(ctx: KitContext): KitBuilt {
  const L = layout(ctx.seed, ctx.wealth);
  const r = new Rng(ctx.seed);
  const b = ctx.builder();
  const d = new Draw(b);
  const spots: Spot[] = [];
  const lamps: KitLamp[] = [];
  const { aw, ad, upper, dado, floor } = L;
  const az0 = FL, az1 = FL + ad, ax = aw / 2;

  // ---- fauces
  room(d, -FW / 2, FW / 2, 0, az0, 0, 4.0, upper, dado, 'mosaic');
  wallRun(d, -FW / 2, 0, -FW / 2, az0, 0, 4.0, upper, dado);
  wallRun(d, FW / 2, 0, FW / 2, az0, 0, 4.0, upper, dado);
  // The street door from inside (shut), and the wall round it.
  d.span('wood_dark', -FW / 2 + 0.1, 0, -0.05, FW / 2 - 0.1, 3.4, 0.05);
  d.span(upper, -FW / 2, 3.4, -0.1, FW / 2, 4.0, 0.1);
  d.solid(-FW / 2, 0, -0.3, FW / 2, 4.0, 0.05);
  // A dark threshold panel in the mosaic (the richer houses' guard dog, cave canem).
  if (ctx.wealth > 0.55) d.span('black', -0.5, 0.005, 0.6, 0.5, 0.012, 1.6, { shadow: false });

  // ---- atrium: floor, the wall round it (doorways for the side rooms), the ceiling round the compluvium
  d.span(floor, -ax, -0.2, az0, ax, 0, az1);
  d.solid(-ax, -0.6, az0, ax, 0, az1);
  // Front wall either side of the fauces.
  wallRun(d, -ax, az0, -FW / 2, az0, 0, H, upper, dado);
  wallRun(d, FW / 2, az0, ax, az0, 0, H, upper, dado);
  d.span(upper, -FW / 2, 4.0, az0 - 0.1, FW / 2, H, az0 + 0.1);
  // Side walls, each cut by its bedroom doors.
  const step = ad / L.rooms;
  for (const s of [-1, 1]) {
    for (let i = 0; i < L.rooms; i++) {
      const z0 = az0 + i * step, z1 = z0 + step, zc = (z0 + z1) / 2;
      wallRun(d, s * ax, z0, s * ax, z1, 0, H, upper, dado, [zc - 0.55, zc + 0.55], 2.3);
      // The bedroom: floor, ceiling, outer wall, partitions.
      const ox = s * (ax + RD);
      room(d, Math.min(s * ax, ox), Math.max(s * ax, ox), z0, z1, 0, 3.2, upper, dado, floor);
      wallRun(d, ox, z0, ox, z1, 0, 3.4, upper, dado);
      wallRun(d, s * ax, z0, ox, z0, 0, 3.4, upper, dado);
      wallRun(d, s * ax, z1, ox, z1, 0, 3.4, upper, dado);
      // A bed against the far wall, a stool, a chest or a lamp.
      const bx0 = ox - s * 0.95, bx1 = ox - s * 0.12;
      d.span('wood', Math.min(bx0, bx1), 0, zc - 1.0, Math.max(bx0, bx1), 0.5, zc + 1.0);
      d.span('fabric_white', Math.min(bx0, bx1) + 0.04, 0.5, zc - 0.95, Math.max(bx0, bx1) - 0.04, 0.66, zc + 0.95, { shadow: false });
      d.solid(Math.min(bx0, bx1), 0, zc - 1.0, Math.max(bx0, bx1), 0.66, zc + 1.0);
      placeProp(d, 'stool', s * (ax + 1.0), 0, zc + (r.chance(0.5) ? 0.9 : -0.9), r.range(0, 3));
      if (r.chance(0.5)) placeProp(d, 'lampstand', ox - s * 0.4, 0, zc + 1.3, 0);
      lamps.push({ position: { x: s * (ax + RD / 2), y: 2.2, z: zc }, intensity: 3, distance: 5 });
    }
  }
  // Back wall: the tablinum's wide opening in the middle, the triclinium's door to one side.
  const tw = Math.min(aw * 0.42, 4.6);
  wallRun(d, -ax, az1, -tw / 2, az1, 0, H, upper, dado);
  wallRun(d, tw / 2, az1, ax, az1, 0, H, upper, dado);
  d.span(upper, -tw / 2, 4.0, az1 - 0.1, tw / 2, H, az1 + 0.1);
  // Ceiling round the compluvium, on beams; the opening's rim.
  const cw = aw * 0.34, cd = ad * 0.34, cz = (az0 + az1) / 2;
  const cy = H;
  d.span('wood_dark', -ax, cy, az0, ax, cy + 0.2, cz - cd / 2, { shadow: false });
  d.span('wood_dark', -ax, cy, cz + cd / 2, ax, cy + 0.2, az1, { shadow: false });
  d.span('wood_dark', -ax, cy, cz - cd / 2, -cw / 2, cy + 0.2, cz + cd / 2, { shadow: false });
  d.span('wood_dark', cw / 2, cy, cz - cd / 2, ax, cy + 0.2, cz + cd / 2, { shadow: false });
  for (const s of [-1, 1]) {
    d.span('wood_dark', s * cw / 2 - 0.15, cy - 0.3, cz - cd / 2 - 0.15, s * cw / 2 + 0.15, cy, cz + cd / 2 + 0.15);
    d.span('wood_dark', -cw / 2 - 0.15, cy - 0.3, cz + s * cd / 2 - 0.15, cw / 2 + 0.15, cy, cz + s * cd / 2 + 0.15);
  }
  // Terracotta antefixes and the roof's inner slope seen through the opening.
  d.span('roof_tile', -cw / 2 - 0.3, cy + 0.2, cz - cd / 2 - 0.3, cw / 2 + 0.3, cy + 0.32, cz - cd / 2, { shadow: false });
  d.span('roof_tile', -cw / 2 - 0.3, cy + 0.2, cz + cd / 2, cw / 2 + 0.3, cy + 0.32, cz + cd / 2 + 0.3, { shadow: false });
  // The impluvium under it: a marble rim, a shallow basin of rainwater.
  const iw = cw - 0.2, id = cd - 0.2, rim = 0.28;
  d.span('marble', -iw / 2 - rim, 0, cz - id / 2 - rim, iw / 2 + rim, 0.16, cz - id / 2);
  d.span('marble', -iw / 2 - rim, 0, cz + id / 2, iw / 2 + rim, 0.16, cz + id / 2 + rim);
  d.span('marble', -iw / 2 - rim, 0, cz - id / 2, -iw / 2, 0.16, cz + id / 2);
  d.span('marble', iw / 2, 0, cz - id / 2, iw / 2 + rim, 0.16, cz + id / 2);
  d.span('marble', -iw / 2, -0.25, cz - id / 2, iw / 2, -0.2, cz + id / 2);
  d.span('water', -iw / 2, -0.2, cz - id / 2, iw / 2, 0.06, cz + id / 2, { shadow: false });
  d.solid(-iw / 2 - rim, 0, cz - id / 2 - rim, iw / 2 + rim, 0.16, cz + id / 2 + rim);
  // The sky over the opening (the cell is under the city: it would show the streets' underside).
  d.span('plaster_white', -cw / 2 - 1, H + 2.6, cz - cd / 2 - 1, cw / 2 + 1, H + 2.65, cz + cd / 2 + 1, { shadow: false });
  for (const s of [-1, 1]) {
    d.span(upper, s * cw / 2 + s * 0.3 - 0.05, H + 0.2, cz - cd / 2 - 1, s * cw / 2 + s * 0.3 + 0.05, H + 2.6, cz + cd / 2 + 1, { shadow: false });
    d.span(upper, -cw / 2 - 1, H + 0.2, cz + s * cd / 2 + s * 0.3 - 0.05, cw / 2 + 1, H + 2.6, cz + s * cd / 2 + s * 0.3 + 0.05, { shadow: false });
  }
  lamps.push({ position: { x: 0, y: H + 2.2, z: cz }, color: 0xeef3ff, intensity: 12, distance: 5 });
  // Daylight through the compluvium: a cool light under the opening, warm lamps on the walls.
  lamps.push({ position: { x: 0, y: H - 0.6, z: cz }, color: 0xdfe8ff, intensity: 14, distance: 14 });
  // The cartibulum (marble table) at the impluvium's far edge, a puteal.
  placeProp(d, 'table_marble', 0, 0, cz + id / 2 + 1.1, 0);
  if (r.chance(0.6)) placeProp(d, 'puteal', iw / 2 + 1.0, 0, cz - id / 2 - 0.6, 0, { variant: 1 });
  // The lararium on the front wall, beside the fauces.
  const side = r.chance(0.5) ? -1 : 1;
  lararium(d.at(side * (FW / 2 + 1.4), 0, az0 + 0.1, Math.PI), 1.45);
  placeProp(d, 'altar', side * (FW / 2 + 1.4), 0, az0 + 0.6, Math.PI, { scale: 0.5 });
  lamps.push({ position: { x: side * (FW / 2 + 1.4), y: 1.6, z: az0 + 0.5 }, intensity: 3, distance: 4 });
  spots.push({ id: 'lararium', kind: 'shrine', position: new THREE.Vector3(side * (FW / 2 + 1.4), 0, az0 + 1.2), heading: Math.PI });
  spots.push({ id: 'atrium', kind: 'spot', position: new THREE.Vector3(-ax / 2, 0, cz), heading: 0 });

  // ---- tablinum: the master's office, open to the atrium
  room(d, -tw / 2, tw / 2, az1, az1 + TD, 0, 4.0, upper, dado, floor);
  wallRun(d, -tw / 2, az1, -tw / 2, az1 + TD, 0, 4.0, upper, dado);
  wallRun(d, tw / 2, az1, tw / 2, az1 + TD, 0, 4.0, upper, dado);
  wallRun(d, -tw / 2, az1 + TD, tw / 2, az1 + TD, 0, 4.0, upper, dado);
  placeProp(d, 'table', 0, 0, az1 + TD * 0.55, 0);
  placeProp(d, 'shelf', -tw / 2 + 0.35, 0, az1 + TD * 0.5, Math.PI / 2);
  placeProp(d, 'stool', 0.3, 0, az1 + TD * 0.55 + 0.8, 0);
  lamps.push({ position: { x: 0, y: 2.4, z: az1 + TD / 2 }, intensity: 4, distance: 6 });
  // The master's strongbox in the corner behind the desk: the household's coin and papers. Locked by wealth.
  const sx = tw / 2 - 0.55, sz = az1 + TD - 0.5;
  chest(d, 'strongbox', sx, 0, sz, 0);
  const containers: KitContainer[] = [{
    id: 'arca',
    position: { x: sx, y: 0, z: sz },
    spec: {
      kind: 'arca-tabernae',
      label: 'The master’s strongbox',
      table: ctx.wealth > 0.8 ? 'chest.rich' : ctx.wealth > 0.45 ? 'strongbox' : 'chest.common',
      owner: `household:${ctx.seed}`,
      ownerName: 'the household',
      locked: ctx.wealth > 0.8 ? 'difficilis' : 'mediocris',
    },
  }];
  spots.push({ id: 'tablinum', kind: 'spot', position: new THREE.Vector3(0, 0, az1 + TD * 0.55 + 0.8), heading: Math.PI });

  // ---- triclinium beside it (three couches round a table), or a store room
  const tx0 = tw / 2 + 0.2, tx1 = ax;
  if (tx1 - tx0 > 2.6) {
    room(d, tx0, tx1, az1, az1 + TD, 0, 3.6, upper, dado, floor);
    wallRun(d, tx0, az1, tx0, az1 + TD, 0, 3.6, upper, dado);
    wallRun(d, tx1, az1, tx1, az1 + TD, 0, 3.6, upper, dado);
    wallRun(d, tx0, az1 + TD, tx1, az1 + TD, 0, 3.6, upper, dado);
    // Its doorway is in the atrium's back wall (open).
    const dz = az1, dx = (tx0 + tx1) / 2;
    d.span('black', dx - 0.55, 0, dz - 0.11, dx + 0.55, 0.01, dz + 0.11, { shadow: false });
    if (L.triclinium) {
      const mx = (tx0 + tx1) / 2, mz = az1 + TD / 2;
      for (const [x0, z0, x1, z1] of [[tx0 + 0.15, mz - 1.2, tx0 + 1.0, mz + 1.2], [tx1 - 1.0, mz - 1.2, tx1 - 0.15, mz + 1.2], [tx0 + 0.15, az1 + TD - 1.0, tx1 - 0.15, az1 + TD - 0.15]] as const) {
        d.span('wood', x0, 0, z0, x1, 0.55, z1);
        d.span('fabric_red', x0 + 0.04, 0.55, z0 + 0.04, x1 - 0.04, 0.68, z1 - 0.04, { shadow: false });
        d.solid(x0, 0, z0, x1, 0.68, z1);
      }
      placeProp(d, 'table', mx, 0, mz, 0, { scale: 0.8 });
    } else {
      placeProp(d, 'amphora_rack', (tx0 + tx1) / 2, 0, az1 + TD - 0.6, Math.PI);
      placeProp(d, 'dolium', tx1 - 0.7, 0, az1 + 0.9, 0);
    }
    lamps.push({ position: { x: (tx0 + tx1) / 2, y: 2.3, z: az1 + TD / 2 }, intensity: 3, distance: 5 });
  }
  // Wall paintings: framed panels of red, ochre and black on the atrium's upper zone.
  for (const s of [-1, 1]) {
    for (let z = az0 + 1.2; z < az1 - 1; z += 2.4) {
      const pm: MaterialId = r.pick(['plaster_red', 'plaster_ochre', 'plaster_dark']);
      d.span(pm, s * ax - s * 0.11 - 0.005, 2.1, z - 0.7, s * ax - s * 0.11 + 0.005, 3.4, z + 0.7, { shadow: false });
    }
  }

  const object = b.build('interior:domus');
  return { object, colliders: [...b.colliders], spots, lamps, containers };
}

export const domusKit: InteriorKit = {
  id: 'domus',
  name: 'A house',
  latin: 'Domus',
  plan,
  build,
};
