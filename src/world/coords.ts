/**
 * Real-world ↔ game coordinates.
 *
 * src/data/atlas.ts records Rome in REAL meters (origin: Miliarium Aureum, +x east, +z south,
 * elevations in m above sea level at ancient ground level). The game renders everything at a
 * uniform WORLD_SCALE (horizontal AND vertical, so slopes keep their real angles), while
 * human-scale details (doors, steps, people, generic houses) stay 1:1.
 */
export const WORLD_SCALE = 0.6;

/** Real meters (x east, z south) → game meters. */
export function toGame(x: number, z: number): [number, number] {
  return [x * WORLD_SCALE, z * WORLD_SCALE];
}

/** Elevation (m ASL, ancient) → game y. */
export function elevToY(asl: number): number {
  return asl * WORLD_SCALE;
}

/** Game meters → real meters. */
export function toReal(x: number, z: number): [number, number] {
  return [x / WORLD_SCALE, z / WORLD_SCALE];
}

export function yToElev(y: number): number {
  return y / WORLD_SCALE;
}

/** Scale a real length to game length. */
export function len(realMeters: number): number {
  return realMeters * WORLD_SCALE;
}
