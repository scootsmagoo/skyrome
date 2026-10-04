/**
 * Lamps along the golden path (the owner's note that the walk from the Porta Capena was dark and
 * bland): lanterns at the gate, at the crossroads shrines and the street stations, at the shops
 * and inns, at Dromo's cart, and a lamp hung on a house wall every ~45 m along the street below the
 * Palatine. Pure data; src/content/install.ts gives each one something to burn in (the fire on a
 * shrine's altar, a lantern on an iron bracket where there is a wall, else a lantern on a post) and
 * asks the light pool (`game.lights.request`, flagged `night`) for its light, so they glow in the
 * fourth watch and go out one by one at dawn. A lamp that needs a wall and finds none is not placed:
 * nobody hangs a lamp over open ground. Positions are golden-path points or place ids with an offset.
 */
import { GOLDEN_PATH_LENGTH } from './route';

export interface LampSpec {
  at: string | { d: number; side: number };
  dx?: number;
  dz?: number;
  /** Height above the ground, m (a hung lamp ~3 m, a lantern on a pole ~2.2, on the ground 0.6). */
  height: number;
  intensity?: number;
  distance?: number;
  /** Warm colour override (sRGB hex). */
  color?: string;
  /** What it burns in: a shrine's altar fire, or a lantern (on a wall bracket, else on a post). */
  mount?: 'altar' | 'lantern';
  /** Only on a wall within this many metres (else not placed). */
  wallOnly?: number;
}

const STATIONS = ['capena-intus', 'capena-statio', 'via-scopator', 'via-carbonarius', 'via-lucernarius', 'via-plaustrum', 'circi-mimus', 'circi-ficus', 'circi-botularius', 'circi-factiones', 'schola-viae', 'via-aquarius', 'via-capraria', 'via-augur', 'via-tusci-alta'];
const SHRINES = ['compitum-capenae', 'compitum-circi', 'compitum-vici-tusci', 'compitum-velabri', 'compitum-boarii', 'compitum-acili', 'signum-vortumni', 'shrine-venus-cloacina'];
const SHOPS = ['popina-vici-tusci', 'seplasia-vici-tusci', 'taberna-armorum', 'caupona-carcerum', 'pistrinum-velabri', 'fullonica-velabri', 'taberna-vestiarii', 'excubitorium-velabri', 'statio-cohortium-urbanarum', 'castor-loculi', 'ludus-gate', 'astrologi-circi', 'tabernae-aemiliae', 'insula-tuccii', 'insula-nutans'];

export function lampSpecs(): LampSpec[] {
  const out: LampSpec[] = [];
  // The gate: a lamp each side of the arch and Dromo's lantern on the cart.
  out.push({ at: 'courier-ambush', dx: -3, dz: 1, height: 2.6, intensity: 14 }, { at: 'courier-ambush', dx: 3, dz: -1, height: 2.6, intensity: 14 }, { at: 'night-cart', dx: 2, dz: 1, height: 1.6, intensity: 10 });
  for (const id of STATIONS) out.push({ at: id, dx: 1.5, dz: 0.5, height: 2.2, intensity: 10 });
  for (const id of SHRINES) out.push({ at: id, height: 1.25, intensity: 11, mount: 'altar' });
  for (const id of SHOPS) out.push({ at: id, dx: -1.5, dz: -1, height: 2.4, intensity: 12 });
  // A hung lamp every ~45 m of the corridor, alternating sides.
  for (let d = 70, i = 0; d < GOLDEN_PATH_LENGTH - 20; d += 45, i++) out.push({ at: { d, side: i % 2 ? 5 : -5 }, height: 3, intensity: 9, distance: 11, wallOnly: 4 });
  return out;
}
