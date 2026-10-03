/**
 * PROVISIONAL loot tables (GDD pending). Weighted picks with level gates; nested tables via
 * `table`. Roll with `rollLoot(id, level, rng)` from src/rpg/loot.ts.
 */
import type { LootTableDef } from '../types';

export const LOOT_TABLES: LootTableDef[] = [
  // ---- building blocks
  {
    id: 'food', rolls: [1, 1], entries: [
      { item: 'panis', weight: 6 }, { item: 'caseus', weight: 3 }, { item: 'olivae', weight: 3 }, { item: 'ficus', weight: 3 },
      { item: 'lucanica', weight: 2 }, { item: 'ova', weight: 2 }, { item: 'poma', weight: 3 }, { item: 'posca', weight: 3 }, { item: 'vinum', weight: 3 },
      { item: 'garum', weight: 1 }, { item: 'vinum_falernum', weight: 1, minLevel: 5 },
    ],
  },
  {
    id: 'medicine', rolls: [1, 1], entries: [
      { item: 'potio_minor', weight: 6 }, { item: 'potio', weight: 3, minLevel: 6 }, { item: 'potio_maior', weight: 1, minLevel: 16 },
      { item: 'unguentum', weight: 3 }, { item: 'cortex_salicis', weight: 1 }, { item: 'theriaca', weight: 1, minLevel: 10 },
    ],
  },
  {
    id: 'valuables', rolls: [1, 1], entries: [
      { item: 'anulus_ferreus', weight: 4 }, { item: 'fascinum', weight: 4 }, { item: 'tali', weight: 4 }, { item: 'vitrum', weight: 3 },
      { item: 'anulus_signatorius', weight: 2, minLevel: 5 }, { item: 'calix_argenteus', weight: 1, minLevel: 10 }, { item: 'aureus', weight: 1, minLevel: 8 },
      { item: 'nodus_isidis', weight: 1, minLevel: 6 }, { item: 'piper', weight: 2 }, { item: 'tus', weight: 2 },
    ],
  },
  {
    id: 'weapons.common', rolls: [1, 1], entries: [
      { item: 'pugio', weight: 4 }, { item: 'fustis', weight: 4 }, { item: 'gladius_rusty', weight: 3 }, { item: 'gladius', weight: 2, minLevel: 4 },
      { item: 'hasta', weight: 2 }, { item: 'securis', weight: 2 }, { item: 'iaculum', weight: 2, count: [2, 4] },
      { item: 'gladius_mainz', weight: 1, minLevel: 8 }, { item: 'spatha', weight: 1, minLevel: 12 }, { item: 'gladius_noric', weight: 1, minLevel: 20 },
    ],
  },
  // ---- people
  {
    id: 'citizen', rolls: [0, 1], chanceNone: 0.3, denarii: { range: [0.25, 3], perLevel: 0.1, chance: 0.8 },
    entries: [{ table: 'food', weight: 5 }, { item: 'tessera_frumentaria', weight: 2 }, { item: 'tali', weight: 1 }, { item: 'lucerna', weight: 1 }],
  },
  {
    id: 'thug', rolls: [1, 2], chanceNone: 0.25, denarii: { range: [1, 6], perLevel: 0.15, chance: 0.9 },
    entries: [{ table: 'food', weight: 4 }, { item: 'tali', weight: 2 }, { item: 'uncus', weight: 2, count: [1, 3] }, { table: 'valuables', weight: 1 }, { item: 'vinum', weight: 2 }],
  },
  {
    id: 'brigand', rolls: [1, 3], chanceNone: 0.2, denarii: { range: [3, 12], perLevel: 0.15, chance: 0.9 },
    entries: [{ table: 'food', weight: 3 }, { table: 'medicine', weight: 2 }, { table: 'valuables', weight: 2 }, { table: 'weapons.common', weight: 1 }, { item: 'sagitta', weight: 1, count: [4, 12] }],
  },
  {
    id: 'guard', rolls: [1, 2], chanceNone: 0.3, denarii: { range: [2, 8], perLevel: 0.1, chance: 0.9 },
    entries: [{ table: 'food', weight: 4 }, { item: 'posca', weight: 3 }, { table: 'medicine', weight: 1 }],
  },
  {
    id: 'veteran', rolls: [1, 2], chanceNone: 0.2, denarii: { range: [5, 15], perLevel: 0.12, chance: 1 },
    entries: [{ table: 'food', weight: 2 }, { table: 'medicine', weight: 2 }, { item: 'posca', weight: 2 }, { item: 'signum_mithrae', weight: 1 }, { item: 'torques', weight: 0.3, minLevel: 15 }],
  },
  {
    id: 'gladiator', rolls: [1, 2], chanceNone: 0.25, denarii: { range: [2, 10], perLevel: 0.12, chance: 0.7 },
    entries: [{ table: 'food', weight: 2 }, { table: 'medicine', weight: 3 }, { item: 'strigilis', weight: 1 }, { item: 'embrocatio', weight: 2 }, { item: 'fascinum', weight: 1 }],
  },
  {
    id: 'praetorian', rolls: [1, 3], chanceNone: 0.15, denarii: { range: [15, 40], perLevel: 0.1, chance: 1 },
    entries: [{ table: 'medicine', weight: 3 }, { table: 'valuables', weight: 2 }, { item: 'aureus', weight: 1 }, { item: 'vinum_falernum', weight: 1 }],
  },
  {
    id: 'champion', rolls: [2, 3], denarii: { range: [20, 60], perLevel: 0.1, chance: 1 },
    entries: [{ table: 'medicine', weight: 3 }, { table: 'valuables', weight: 3 }, { table: 'weapons.common', weight: 1 }, { item: 'aureus', weight: 1, count: [1, 2] }],
  },
  {
    id: 'boss', rolls: [3, 4], denarii: { range: [60, 150], perLevel: 0.1, chance: 1 },
    entries: [{ table: 'medicine', weight: 3 }, { table: 'valuables', weight: 4 }, { item: 'aureus', weight: 2, count: [1, 4] }, { item: 'torques', weight: 1 }, { item: 'calix_argenteus', weight: 1 }],
  },
  {
    id: 'animal', rolls: [0, 1], chanceNone: 0.6,
    entries: [{ item: 'corium', weight: 1 }],
  },
  // ---- containers
  {
    id: 'chest.common', rolls: [1, 3], chanceNone: 0.15, denarii: { range: [1, 10], perLevel: 0.1, chance: 0.6 },
    entries: [{ table: 'food', weight: 5 }, { item: 'lucerna', weight: 2 }, { item: 'oleum', weight: 2 }, { item: 'tunica', weight: 1 }, { item: 'charta', weight: 1 }, { table: 'medicine', weight: 1 }, { table: 'valuables', weight: 1 }],
  },
  {
    id: 'chest.rich', rolls: [2, 4], denarii: { range: [15, 60], perLevel: 0.12, chance: 1 },
    entries: [{ table: 'valuables', weight: 5 }, { item: 'vinum_falernum', weight: 2 }, { item: 'garum_sociorum', weight: 1 }, { item: 'purpura', weight: 0.3, minLevel: 10 }, { item: 'tunica_linea', weight: 1 }, { table: 'medicine', weight: 2 }],
  },
  {
    id: 'strongbox', rolls: [1, 2], denarii: { range: [20, 80], perLevel: 0.12, chance: 1 },
    entries: [{ item: 'aureus', weight: 3, count: [1, 3] }, { table: 'valuables', weight: 4 }, { item: 'anulus_aureus', weight: 0.5, minLevel: 12 }],
  },
  {
    id: 'shrine', rolls: [1, 2], chanceNone: 0.3, denarii: { range: [0.25, 4], chance: 0.7 },
    entries: [{ item: 'tus', weight: 3 }, { item: 'lucerna', weight: 3 }, { item: 'fascinum', weight: 1 }, { item: 'defixio', weight: 1 }],
  },
  {
    id: 'tomb', rolls: [1, 3], chanceNone: 0.25, denarii: { range: [0.5, 8], perLevel: 0.1, chance: 0.5 },
    entries: [{ item: 'lucerna', weight: 4 }, { item: 'vitrum', weight: 2 }, { table: 'valuables', weight: 2 }, { item: 'defixio_furtum', weight: 0.5 }, { item: 'defixio_prasina', weight: 0.5 }, { item: 'bulla_aurea', weight: 0.3, minLevel: 8 }],
  },
];
