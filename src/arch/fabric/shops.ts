/**
 * Taberna interiors: the shallow, enterable shop rooms behind the wide street openings of insulae
 * and domus frontages. Each kind dresses the room with its trade (counters with sunken dolia,
 * hourglass mills and ovens, fullers' vats, forges…).
 *
 * Shop frame: origin at the centre of the opening on the outer facade plane, at the shop floor
 * (y = 0). The room spans x ∈ [−w/2, w/2], z ∈ [t, depth] (t = front wall thickness); the street is −z.
 */
import type { Rng } from '../../core/Rng';
import type { MaterialId } from '../../gfx/materialIds';
import { bowl, jug, placeProp, produce } from '../props';
import type { Draw } from './draw';

export const SHOP_KINDS = [
  'thermopolium', 'bakery', 'fullonica', 'cobbler', 'butcher', 'wine', 'smithy', 'barber', 'moneychanger', 'general', 'pottery', 'textile',
] as const;
export type ShopKind = (typeof SHOP_KINDS)[number];

export interface ShopRoom {
  w: number;
  depth: number;
  /** Ceiling height above the shop floor. */
  h: number;
  /** Front wall thickness. */
  t: number;
  wealth: number;
}

/** Weighted shop kinds by neighbourhood wealth (0 poor … 1 rich). */
export function pickShopKind(rng: Rng, wealth: number): ShopKind {
  const w = wealth;
  return rng.weighted<ShopKind>([
    ['thermopolium', 3],
    ['bakery', 1.5],
    ['fullonica', 1.2 * (1 - w)],
    ['cobbler', 1.2],
    ['butcher', 1],
    ['wine', 2],
    ['smithy', 1.4 * (1 - w)],
    ['barber', 0.8 + w],
    ['moneychanger', 0.2 + 1.2 * w],
    ['general', 1.5],
    ['pottery', 1],
    ['textile', 0.6 + w],
  ]);
}

/** Room shell (floor, side and back walls with a painted dado, timber ceiling) plus trade fittings. */
export function shopInterior(d: Draw, kind: ShopKind, room: ShopRoom, rng: Rng) {
  const { w, depth, h, t } = room;
  const hw = w / 2;
  const wallMat: MaterialId = room.wealth > 0.55 ? 'plaster_white' : rng.chance(0.5) ? 'plaster_cream' : 'plaster_white';
  const dado: MaterialId = rng.chance(0.65) ? 'plaster_red' : 'plaster_ochre';
  const floor: MaterialId = room.wealth > 0.6 ? 'mosaic' : rng.chance(0.5) ? 'terracotta' : 'concrete';
  // Shell — slabs sit just outside the room volume so their inner faces are the visible walls.
  d.span(floor, -hw - 0.1, -0.12, t - 0.02, hw + 0.1, 0, depth + 0.1);
  d.span(wallMat, -hw - 0.15, 0, t, -hw, h, depth);
  d.span(wallMat, hw, 0, t, hw + 0.15, h, depth);
  d.span(wallMat, -hw - 0.15, 0, depth, hw + 0.15, h, depth + 0.15);
  d.span(dado, -hw - 0.01, 0, t, -hw + 0.012, 1.0, depth - 0.01, { shadow: false });
  d.span(dado, hw - 0.012, 0, t, hw + 0.01, 1.0, depth - 0.01, { shadow: false });
  d.span(dado, -hw, 0, depth - 0.012, hw, 1.0, depth + 0.01, { shadow: false });
  d.span('wood', -hw - 0.15, h, t - 0.05, hw + 0.15, h + 0.1, depth + 0.15, { shadow: false });
  for (let z = t + 0.4; z < depth - 0.1; z += 0.65) d.span('wood_dark', -hw, h - 0.14, z - 0.07, hw, h, z + 0.07, { shadow: false });
  // Doorway to the back room (dark) on most shops.
  const backDoor = rng.chance(0.7) && w > 2.2;
  const bdx = rng.chance(0.5) ? hw - 0.75 : -hw + 0.75;
  if (backDoor) {
    d.span('black', bdx - 0.45, 0, depth - 0.02, bdx + 0.45, 2.15, depth - 0.005, { shadow: false });
    d.span('wood_dark', bdx - 0.55, 2.15, depth - 0.06, bdx + 0.55, 2.27, depth, { shadow: false });
  }
  const r = rng;
  const z0 = t + 0.05; // first usable depth
  const back = depth - 0.05;
  const midz = (z0 + back) / 2;
  const avoidX = backDoor ? bdx : 99;

  const lararium = () => {
    // Painted shrine niche on the back wall (Pompeian shop lararium).
    const x = Math.abs(avoidX - (-hw + 0.7)) > 1 ? -hw + 0.7 : hw - 0.7;
    d.span('plaster_ochre', x - 0.35, 1.35, depth - 0.02, x + 0.35, 2.05, depth - 0.008, { shadow: false });
    d.span('plaster_red', x - 0.18, 1.5, depth - 0.03, x + 0.18, 1.85, depth - 0.019, { shadow: false });
    d.span('travertine', x - 0.42, 1.3, depth - 0.18, x + 0.42, 1.36, depth, { shadow: false });
    placeProp(d, 'oil_lamp', x, 1.36, depth - 0.1, Math.PI, { collide: false });
  };

  switch (kind) {
    case 'thermopolium': {
      const counterH = 0.95, cd = 0.62;
      const top: MaterialId = room.wealth > 0.4 ? 'marble_veined' : 'travertine';
      const front: MaterialId = r.chance(0.6) ? 'plaster_red' : 'plaster_ochre';
      const cx1 = hw - 1.0;
      // L-shaped masonry counter: along the street, returning along the left wall.
      d.span(front, -hw, 0, z0, cx1, counterH - 0.05, z0 + cd, { collide: true });
      d.span(top, -hw, counterH - 0.05, z0 - 0.03, cx1 + 0.04, counterH, z0 + cd + 0.02);
      d.span('plaster_white', -hw + 0.3, 0.15, z0 - 0.012, cx1 - 0.3, counterH - 0.2, z0 - 0.001, { shadow: false });
      d.span(front, -hw, 0, z0 + cd, -hw + cd, counterH - 0.05, z0 + cd + 1.3, { collide: true });
      d.span(top, -hw - 0.02, counterH - 0.05, z0 + cd, -hw + cd + 0.03, counterH, z0 + cd + 1.3);
      // Sunken dolia: terracotta rims flush with the counter top.
      const nd = Math.max(1, Math.floor((cx1 + hw - 0.3) / 0.62));
      for (let i = 0; i < nd; i++) {
        const x = -hw + 0.45 + i * 0.62;
        d.cyl('terracotta', x, counterH + 0.012, z0 + cd / 2, 0.22, 0.03, 14, { open: true, shadow: false });
        d.cyl('black', x, counterH + 0.006, z0 + cd / 2, 0.2, 0.012, 14, { shadow: false });
      }
      d.cyl('terracotta', -hw + cd / 2, counterH + 0.012, z0 + cd + 0.7, 0.2, 0.03, 14, { open: true, shadow: false });
      d.cyl('black', -hw + cd / 2, counterH + 0.006, z0 + cd + 0.7, 0.18, 0.012, 14, { shadow: false });
      // Stepped display shelf at the end of the counter.
      for (let s = 0; s < 3; s++) d.span(top, cx1 - 0.35 + s * 0.0, counterH + s * 0.12, z0 + 0.05 + s * 0.15, cx1, counterH + (s + 1) * 0.12, z0 + cd);
      jug(d, cx1 - 0.18, counterH + 0.36, z0 + cd - 0.12, 0.9);
      bowl(d, cx1 - 0.18, counterH + 0.24, z0 + 0.28, 0.8);
      jug(d, -hw + 0.2, counterH, z0 + 0.15, 0.8, 'black');
      // Back: amphorae against the wall, a small hearth with a pot.
      for (let i = 0; i < 3; i++) placeProp(d, 'amphora_tall', hw - 0.3 - i * 0.32, 0, back - 0.15, 0, { rx: -0.2, collide: false });
      d.span('brick', -0.5, 0, back - 0.6, 0.3, 0.75, back);
      d.ellipsoid('glow_fire', -0.1, 0.77, back - 0.3, 0.2, 0.03, 0.15, { seg: [8, 4], shadow: false });
      d.cyl('bronze', -0.1, 0.86, back - 0.3, 0.14, 0.16, 10, { rTop: 0.12 });
      lararium();
      break;
    }
    case 'bakery': {
      if (depth - t > 3.4 && w > 2.4) placeProp(d, 'oven', hw - 1.05, 0, back - 1.0, 0, { scale: Math.min(1, (w / 2 - 0.05) / 1.1) * 0.95 });
      if (depth - t > 4.4 && w > 2.6) placeProp(d, 'grain_mill', -hw + 1.05, 0, midz + 0.2, r.range(0, 1), { scale: 0.85 });
      // Counter with round loaves (panis quadratus).
      d.span('plaster_white', -hw + 0.1, 0, z0, hw - 1.1, 0.9, z0 + 0.55, { collide: true });
      d.span('travertine', -hw + 0.05, 0.9, z0 - 0.02, hw - 1.05, 0.95, z0 + 0.57);
      for (let i = 0; i < Math.floor((w - 1.3) / 0.24); i++) {
        d.cyl('plaster_ochre', -hw + 0.25 + i * 0.24, 0.98, z0 + 0.15 + (i % 2) * 0.22, 0.1, 0.06, 8, { rTop: 0.08, shadow: false });
      }
      for (let i = 0; i < 3; i++) placeProp(d, 'sack', -hw + 0.3 + i * 0.4, 0, back - 0.3, 0, { variant: i % 2, collide: false });
      break;
    }
    case 'fullonica': {
      const n = Math.max(1, Math.min(3, Math.floor((depth - t - 0.4) / 1.05)));
      for (let i = 0; i < n; i++) placeProp(d, 'vat', -hw + 0.68, 0, z0 + 0.6 + i * 1.05, Math.PI / 2, { variant: i % 3 });
      // Lines of drying cloth across the room.
      d.rod('wood_dark', { x: -hw, y: 2.2, z: midz }, { x: hw, y: 2.2, z: midz }, 0.025, 5);
      const cloth: MaterialId[] = ['fabric_white', 'fabric_red', 'fabric_ochre', 'fabric_blue', 'fabric_white', 'fabric_purple'];
      for (let i = 0; i < Math.floor(w / 0.6); i++) {
        const x = -hw + 0.2 + i * 0.6;
        d.span(r.pick(cloth), x, 1.0 + r.range(0, 0.4), midz - 0.008, x + 0.45, 2.18, midz + 0.008);
      }
      break;
    }
    case 'cobbler': {
      placeProp(d, 'table', -0.2, 0, midz, 0, { variant: 0 });
      placeProp(d, 'stool', -0.2, 0, midz + 0.7, 0, { collide: false });
      placeProp(d, 'shelf', hw - 0.25, 0, midz, -Math.PI / 2, { variant: 2, scale: 0.9 });
      for (let i = 0; i < 6; i++) d.box('wood_dark', -0.6 + i * 0.16, 0.8, midz - 0.15 + (i % 2) * 0.1, 0.1, 0.08, 0.26, { ry: r.range(-0.3, 0.3), shadow: false });
      break;
    }
    case 'butcher': {
      d.span('plaster_white', -hw + 0.1, 0, z0, hw - 1.0, 0.92, z0 + 0.6, { collide: true });
      d.span('marble', -hw + 0.05, 0.92, z0 - 0.02, hw - 0.95, 0.97, z0 + 0.62);
      for (let i = 0; i < Math.floor((w - 1.2) / 0.4); i++) d.ellipsoid('plaster_red', -hw + 0.35 + i * 0.4, 1.02, z0 + 0.3, 0.14, 0.06, 0.1, { seg: [8, 5], shadow: false });
      placeProp(d, 'chopping_block', 0.2, 0, midz + 0.3, r.range(0, 3));
      d.rod('iron', { x: -hw, y: 2.3, z: midz - 0.4 }, { x: hw, y: 2.3, z: midz - 0.4 }, 0.015, 4, { shadow: false });
      for (let i = 0; i < Math.floor(w / 0.55); i++) {
        const x = -hw + 0.3 + i * 0.55;
        d.rod('iron', { x, y: 2.3, z: midz - 0.4 }, { x, y: 2.1, z: midz - 0.4 }, 0.006, 3, { shadow: false });
        d.ellipsoid(i % 3 === 0 ? 'plaster_cream' : 'plaster_red', x, 1.85, midz - 0.4, 0.13, 0.26, 0.1, { seg: [8, 6] });
      }
      break;
    }
    case 'wine': {
      d.span('plaster_red', -hw + 0.1, 0, z0, hw - 1.0, 0.95, z0 + 0.55, { collide: true });
      d.span('travertine', -hw + 0.05, 0.95, z0 - 0.02, hw - 0.95, 1.0, z0 + 0.57);
      for (let i = 0; i < 3; i++) jug(d, -hw + 0.4 + i * 0.4, 1.0, z0 + 0.25, 1.1, i === 1 ? 'black' : 'terracotta');
      if (w > 2.4) placeProp(d, 'amphora_rack', -hw + 0.32, 0, midz + 0.4, Math.PI / 2, { scale: Math.min(1, (depth - t - 1.2) / 1.8) });
      for (let i = 0; i < 4; i++) placeProp(d, 'amphora_tall', hw - 0.3, 0, back - 0.2 - i * 0.32, 0, { rx: 0.18, collide: false });
      placeProp(d, 'dolium', hw - 0.7, 0, midz, 0, { variant: 0, scale: 0.75 });
      lararium();
      break;
    }
    case 'smithy': {
      placeProp(d, 'forge', 0.0, 0, back - 0.8, 0, { scale: Math.min(1, w / 2.3) });
      placeProp(d, 'anvil', -0.3, 0, midz - 0.3, 0.3);
      placeProp(d, 'trough', hw - 0.4, 0, midz - 0.2, Math.PI / 2, { scale: 0.7 });
      for (let i = 0; i < 5; i++) d.span('iron', -hw + 0.03, 1.2 + i * 0.05, z0 + 0.4 + i * 0.25, -hw + 0.06, 1.75, z0 + 0.44 + i * 0.25, { shadow: false });
      break;
    }
    case 'barber': {
      placeProp(d, 'stool', 0, 0, midz, 0, { variant: 2 });
      placeProp(d, 'bench', -hw + 0.25, 0, midz, Math.PI / 2, { variant: 0 });
      placeProp(d, 'lampstand', hw - 0.4, 0, midz - 0.5, 0);
      d.cyl('bronze', hw - 0.02, 1.5, midz + 0.4, 0.2, 0.02, 14, { rz: Math.PI / 2, shadow: false });
      bowl(d, hw - 0.4, 1.37, midz - 0.5, 1.4, 'bronze');
      break;
    }
    case 'moneychanger': {
      placeProp(d, 'table', 0, 0, z0 + 0.8, 0, { variant: 0 });
      for (let i = 0; i < 7; i++) {
        const hgt = 0.02 + r.range(0, 0.06);
        d.cyl(i % 3 === 0 ? 'gilded_bronze' : 'bronze', -0.4 + i * 0.13, 0.76 + hgt / 2, z0 + 0.7 + (i % 2) * 0.1, 0.022, hgt, 8, { shadow: false });
      }
      d.rod('bronze', { x: 0.35, y: 0.76, z: z0 + 0.75 }, { x: 0.35, y: 1.1, z: z0 + 0.75 }, 0.01, 4, { shadow: false });
      d.rod('bronze', { x: 0.2, y: 1.1, z: z0 + 0.75 }, { x: 0.5, y: 1.1, z: z0 + 0.75 }, 0.008, 4, { shadow: false });
      placeProp(d, 'stool', 0, 0, z0 + 1.4, 0, { variant: 1, collide: false });
      d.span('wood_dark', -hw + 0.1, 0, back - 0.6, -hw + 1.0, 0.65, back - 0.05, { collide: true });
      for (const y of [0.15, 0.5]) d.span('iron', -hw + 0.08, y, back - 0.62, -hw + 1.02, y + 0.06, back - 0.03, { shadow: false });
      lararium();
      break;
    }
    case 'pottery':
    case 'general':
    case 'textile': {
      const v = kind === 'textile' ? 1 : kind === 'pottery' ? 0 : r.int(0, 2);
      placeProp(d, 'shelf', -hw + 0.2, 0, midz, Math.PI / 2, { variant: v, scale: Math.min(1, (depth - t - 0.3) / 1.4) });
      if (w > 2.6) placeProp(d, 'shelf', hw - 0.2, 0, midz, -Math.PI / 2, { variant: (v + 1) % 3, scale: Math.min(1, (depth - t - 0.3) / 1.4) });
      if (kind === 'textile' && depth - t > 3) placeProp(d, 'loom', 0, 0, back - 0.45, 0);
      else {
        placeProp(d, 'basket', -0.3, 0, z0 + 0.5, 0, { variant: 0, collide: false });
        placeProp(d, 'crate', 0.35, 0, z0 + 0.6, 0.2, { variant: 2 });
        placeProp(d, 'sack', 0.0, 0, back - 0.4, 0, { collide: false });
      }
      break;
    }
  }
}

/** Goods and furniture spilling onto the sidewalk in front of an open shop (street frame: z < 0). */
export function shopFrontage(d: Draw, kind: ShopKind, ow: number, rng: Rng) {
  const side = rng.chance(0.5) ? -1 : 1;
  const x = side * (ow / 2 + 0.45);
  switch (kind) {
    case 'wine':
    case 'thermopolium':
      if (rng.chance(0.6)) placeProp(d, 'amphora_tall', x, 0, -0.35, 0, { rx: 0.15, collide: false });
      if (rng.chance(0.5)) placeProp(d, 'bench_masonry', -x * 1.6, 0, -0.35, 0, { variant: 1 });
      break;
    case 'fullonica':
      // Urine-collecting jars by the door (the fullers' famous supply).
      placeProp(d, 'amphora_globular', x, 0, -0.35, 0, { collide: false });
      placeProp(d, 'amphora_globular', x + side * 0.55, 0, -0.3, 1, { collide: false });
      break;
    case 'general':
    case 'pottery':
      if (rng.chance(0.7)) placeProp(d, 'basket', x, 0, -0.45, 0, { variant: 0, collide: false });
      if (rng.chance(0.5)) placeProp(d, 'crate', x + side * 0.7, 0, -0.45, 0.3, { variant: 2 });
      break;
    case 'bakery':
      if (rng.chance(0.5)) placeProp(d, 'basket', x, 0, -0.45, 0, { variant: 1, collide: false });
      break;
    case 'smithy':
      if (rng.chance(0.5)) placeProp(d, 'handcart', x + side * 0.3, 0, -0.9, Math.PI / 2 + 0.2);
      break;
    default:
      if (rng.chance(0.35)) placeProp(d, 'bench', x, 0, -0.35, 0, { variant: 0 });
  }
}
