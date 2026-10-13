/**
 * The bankers' strongbox at the Basilica Paulli (`tabernae-aemiliae`, `ctn-arca-aemiliae`, Hermogenes'
 * iron-banded box). The Basilica Aemilia's tabernae are real walk-in shops (forum-basilicas.ts: a
 * `shopInterior` behind each bay, the money-changers' with their boxes in the left back corner), so
 * there is no cell to build: the interior is the shop, and the strongbox's container is set at the box
 * the builder draws in the money-changer's shop nearest the place (`<place>:interior` is the box's own
 * floor point, which src/content/install.ts reads for interior containers).
 */
import type { Game } from '../../../core/Game';
import { WORLD_SCALE } from '../../coords';
import { locationOf } from './common';

export const AEMILIA = 'tabernae-aemiliae';
const LANDMARK = 'basilica-aemilia';
const ARGENTARIUS = /^basilica-paulli-argentarius-\d+$/;

/** Where the builder's strongbox stands, from the argentarius' vendor spot, in the landmark's frame (forum-basilicas.ts). */
export function strongboxOffset(S = WORLD_SCALE): { x: number; z: number } {
  const bays = 16;
  const bay = (100 * S - 1.2) / bays;
  const hw = (bay - 0.6) / 2;
  const shopD = 3.4;
  // The box (shops.ts): x from −hw + 0.1 to −hw + 1.0, z from `back` − 0.6 to `back` − 0.05 with back = depth − 0.05;
  // the vendor stands 1.4 m into the shop.
  const back = shopD - 0.05;
  return { x: -hw + 0.55, z: back - 0.325 - 1.4 };
}

/** Register `tabernae-aemiliae:interior` at the strongbox of the money-changer's shop nearest the place. False if the world cannot say. */
export function registerAemiliaStrongbox(game: Game): boolean {
  const lm = game.landmarks?.get(LANDMARK);
  const at = locationOf(game, AEMILIA);
  if (!lm || !at) return false;
  let best: { x: number; y: number; z: number; d: number } | null = null;
  for (const s of lm.spots) {
    if (!ARGENTARIUS.test(s.id)) continue;
    const d = Math.hypot(s.position.x - at.x, s.position.z - at.z);
    if (!best || d < best.d) best = { x: s.position.x, y: s.position.y, z: s.position.z, d };
  }
  if (!best) return false;
  const o = strongboxOffset();
  // The offset is in the landmark's frame: x along the facade (cos, −sin of the rotation), z into the building.
  const c = Math.cos(lm.rotationY), s = Math.sin(lm.rotationY);
  game.locations?.add({
    id: `${AEMILIA}:interior`,
    name: 'Hermogenes’ strongbox',
    position: { x: best.x + o.x * c + o.z * s, y: best.y, z: best.z - o.x * s + o.z * c },
    radius: 0.3,
    discoverable: false,
  });
  return true;
}
