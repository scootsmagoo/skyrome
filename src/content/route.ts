/**
 * The golden path (GDD §17.2) as a line on the atlas: from the cart stand outside the Porta Capena
 * up the valley of the Circus Maximus under the Palatine, through the Velabrum and along the Vicus
 * Tuscus into the Forum. Content that has to stand "on the way" (street people, lamps, caches,
 * shrines) is placed by distance along this line and a side offset, so it lands on the real
 * street and not in a wall.
 *
 * Everything here is in atlas REAL metres (x east, z south, origin Miliarium Aureum), like
 * docs/CONTENT.md §1; src/content/places.ts turns the result into game metres.
 */

export type P2 = readonly [number, number];

/**
 * The corridor, in walking order. The vertices come from the atlas: the Via Appia outside the gate
 * (507, 955 → the cart stand at 523, 974), the gate, the street below the Palatine (via the road
 * 'street-north-of-circus', 406,840 → -96,471) and the Vicus Tuscus (-73,452 → 97,62).
 */
export const GOLDEN_PATH: readonly P2[] = [
  [523, 974],
  [507, 955],
  [406, 840],
  [156, 657],
  [-96, 471],
  [-73, 452],
  [-45, 311],
  [45, 140],
  [66, 131],
  [97, 62],
];

const SEG: number[] = [];
let total = 0;
for (let i = 0; i < GOLDEN_PATH.length - 1; i++) {
  const l = Math.hypot(GOLDEN_PATH[i + 1][0] - GOLDEN_PATH[i][0], GOLDEN_PATH[i + 1][1] - GOLDEN_PATH[i][1]);
  SEG.push(l);
  total += l;
}

/** Length of the corridor in real metres (about 1,265 m; 760 game m). */
export const GOLDEN_PATH_LENGTH = total;

/**
 * A point `d` real metres along the corridor and `side` real metres to the right of the walking
 * direction (negative = left; the Circus is on the left of the street below the Palatine).
 */
export function onPath(d: number, side = 0): [number, number] {
  let rest = Math.max(0, Math.min(total, d));
  for (let i = 0; i < SEG.length; i++) {
    if (rest <= SEG[i] || i === SEG.length - 1) {
      const a = GOLDEN_PATH[i];
      const b = GOLDEN_PATH[i + 1];
      const t = SEG[i] ? Math.min(1, rest / SEG[i]) : 0;
      const dx = (b[0] - a[0]) / (SEG[i] || 1);
      const dz = (b[1] - a[1]) / (SEG[i] || 1);
      // Walking direction (dx, dz); the right-hand side of it in the +x east, +z south frame is (-dz, dx).
      return [a[0] + (b[0] - a[0]) * t - dz * side, a[1] + (b[1] - a[1]) * t + dx * side];
    }
    rest -= SEG[i];
  }
  return [GOLDEN_PATH[0][0], GOLDEN_PATH[0][1]];
}

/** Distance along the corridor of the point of the corridor nearest to (x, z), and how far off it is (real metres). */
export function projectOnPath(x: number, z: number): { d: number; off: number } {
  let best = { d: 0, off: Infinity };
  let acc = 0;
  for (let i = 0; i < SEG.length; i++) {
    const a = GOLDEN_PATH[i];
    const b = GOLDEN_PATH[i + 1];
    const l = SEG[i] || 1;
    const t = Math.max(0, Math.min(1, ((x - a[0]) * (b[0] - a[0]) + (z - a[1]) * (b[1] - a[1])) / (l * l)));
    const off = Math.hypot(x - (a[0] + (b[0] - a[0]) * t), z - (a[1] + (b[1] - a[1]) * t));
    if (off < best.off) best = { d: acc + t * l, off };
    acc += l;
  }
  return best;
}
