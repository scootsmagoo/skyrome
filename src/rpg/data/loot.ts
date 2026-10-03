/**
 * Loot tables. The per-tier tables follow docs/GDD.md §6.14 (coin range, common drops with their
 * chances, rare drops); `extras` roll independently with their own chance. What an NPC wears and
 * wields also drops (the combat/AI side adds that). Container tables are provisional.
 * Roll with `rollLoot(id, level, rng)` (src/rpg/loot.ts).
 */
import type { LootTableDef } from '../types';

export const LOOT_TABLES: LootTableDef[] = [
  // ---- building blocks
  { id: 'food', rolls: [1, 1], entries: [{ item: 'panis', weight: 6 }, { item: 'caseus', weight: 3 }, { item: 'olivae', weight: 3 }, { item: 'ficus', weight: 3 }, { item: 'botulus', weight: 2 }, { item: 'posca', weight: 3 }, { item: 'vinum', weight: 3 }, { item: 'libum', weight: 1 }] },
  { id: 'remedy', rolls: [1, 1], entries: [{ item: 'fascia', weight: 6, count: [1, 3] }, { item: 'emplastrum', weight: 3 }, { item: 'theriaca', weight: 1 }, { item: 'febrifugum', weight: 1 }] },
  { id: 'valuables', rolls: [1, 1], entries: [{ item: 'nugae', weight: 5 }, { item: 'vasa-arretina', weight: 4 }, { item: 'vitrum', weight: 3 }, { item: 'piper', weight: 2 }, { item: 'argentum', weight: 1 }, { item: 'gemma', weight: 1 }, { item: 'aureus', weight: 1 }] },
  { id: 'weapon.noric', rolls: [1, 1], entries: [{ item: 'gladius-noric', weight: 4 }, { item: 'spatha-noric', weight: 2 }, { item: 'pugio-noric', weight: 2 }, { item: 'sica-noric', weight: 2 }, { item: 'hasta-noric', weight: 2 }] },
  { id: 'weapon.bilbilis', rolls: [1, 1], entries: [{ item: 'gladius-bilbilis', weight: 3 }, { item: 'spatha-bilbilis', weight: 2 }, { item: 'pugio-bilbilis', weight: 1 }, { item: 'sica-bilbilis', weight: 1 }] },
  { id: 'armor.gladiator', rolls: [1, 1], entries: [{ item: 'manica-linea', weight: 4 }, { item: 'ocrea', weight: 4 }, { item: 'ocreae', weight: 2 }, { item: 'galea-thraecis', weight: 1 }, { item: 'galea-murmillonis', weight: 1 }, { item: 'cardiophylax', weight: 1 }] },
  { id: 'armor.piece', rolls: [1, 1], entries: [{ item: 'galea-gallica', weight: 3 }, { item: 'galea-italica', weight: 2 }, { item: 'manica-ferrea', weight: 2 }, { item: 'ocreae', weight: 2 }, { item: 'lorica-hamata', weight: 1 }] },
  // ---- by tier (§6.14)
  {
    id: 'civilian', rolls: [1, 1], chanceNone: 0.4, denarii: { range: [0, 1] },
    entries: [{ table: 'food', weight: 3 }, { item: 'tabula-cerata', weight: 1 }],
    extras: [{ item: 'tali', chance: 0.1 }],
  },
  {
    id: 'thug', rolls: [0, 0], entries: [], denarii: { range: [0.25, 3] },
    extras: [{ item: 'fustis', chance: 0.25 }, { item: 'pugio', chance: 0.25 }, { item: 'panis', chance: 0.3 }, { item: 'tali', chance: 0.15 }, { item: 'nugae', chance: 0.1 }],
  },
  {
    id: 'bruiser', rolls: [1, 1], entries: [{ item: 'caestus', weight: 1 }, { item: 'clava', weight: 1 }], denarii: { range: [1, 6] },
    extras: [{ item: 'posca', chance: 0.6 }, { item: 'tessera-collegii', chance: 0.2 }],
  },
  {
    id: 'skirmisher', rolls: [0, 0], entries: [], denarii: { range: [1, 5] },
    extras: [{ item: 'glans-plumbea', chance: 0.5, count: [3, 8] }, { item: 'sagitta', chance: 0.5, count: [3, 8] }, { item: 'glans-inscripta', chance: 0.15 }],
  },
  {
    id: 'miles', rolls: [0, 0], entries: [], denarii: { range: [3, 10] },
    extras: [{ item: 'gladius', chance: 0.6 }, { item: 'galea-gallica', chance: 0.25 }, { item: 'fascia', chance: 0.6 }, { item: 'tabula-stipendii', chance: 0.1 }],
  },
  {
    id: 'veteran', rolls: [0, 0], entries: [], denarii: { range: [10, 40] },
    extras: [{ table: 'weapon.noric', chance: 0.4 }, { table: 'armor.gladiator', chance: 0.3 }, { table: 'weapon.bilbilis', chance: 0.1 }, { table: 'remedy', chance: 0.4 }],
  },
  {
    id: 'champion', rolls: [0, 0], entries: [], denarii: { range: [10, 40] },
    extras: [{ table: 'weapon.noric', chance: 0.4 }, { table: 'armor.gladiator', chance: 0.3 }, { table: 'weapon.bilbilis', chance: 0.1 }, { table: 'remedy', chance: 0.5 }],
  },
  {
    id: 'elite', rolls: [1, 1], entries: [{ table: 'weapon.noric', weight: 3 }, { table: 'weapon.bilbilis', weight: 1 }], denarii: { range: [20, 60] },
    extras: [{ table: 'armor.piece', chance: 0.6 }, { item: 'epistula-signata', chance: 0.2 }],
  },
  { id: 'boss', rolls: [0, 0], entries: [], denarii: { range: [50, 150] }, extras: [{ table: 'valuables', chance: 1 }] },
  { id: 'beast', rolls: [0, 0], entries: [], extras: [{ item: 'corium', chance: 0.5 }] },
  // ---- containers (provisional)
  {
    id: 'chest.common', rolls: [1, 3], chanceNone: 0.15, denarii: { range: [1, 10], chance: 0.6 },
    entries: [{ table: 'food', weight: 5 }, { item: 'lucerna', weight: 2 }, { item: 'tunica', weight: 1 }, { item: 'tabula-cerata', weight: 1 }, { table: 'remedy', weight: 1 }, { table: 'valuables', weight: 1 }],
  },
  {
    id: 'chest.rich', rolls: [2, 4], denarii: { range: [15, 60] },
    entries: [{ table: 'valuables', weight: 5 }, { item: 'vinum-falernum', weight: 2, count: [2, 6] }, { item: 'purpura', weight: 0.3 }, { item: 'tunica-linea', weight: 1 }, { table: 'remedy', weight: 2 }],
  },
  { id: 'strongbox', rolls: [1, 2], denarii: { range: [20, 80] }, entries: [{ item: 'aureus', weight: 3, count: [1, 3] }, { table: 'valuables', weight: 4 }] },
  { id: 'shrine', rolls: [1, 2], chanceNone: 0.3, denarii: { range: [0.25, 4], chance: 0.7 }, entries: [{ item: 'tus', weight: 3 }, { item: 'lucerna', weight: 3 }, { item: 'libum', weight: 2 }, { item: 'fascinum', weight: 1 }, { item: 'defixio', weight: 1 }] },
  { id: 'tomb', rolls: [1, 3], chanceNone: 0.25, denarii: { range: [0.5, 8], chance: 0.5 }, entries: [{ item: 'lucerna', weight: 4 }, { item: 'vitrum', weight: 2 }, { table: 'valuables', weight: 2 }, { item: 'defixio-furtum', weight: 0.5 }, { item: 'defixio-prasina', weight: 0.5 }, { item: 'bulla', weight: 0.3 }] },

  // ---- docs/CONTENT.md §6.2: street caches, loads, lockers, the Cloaca, enemy types, purses
  {
    id: 'cache.street', rolls: [1, 1], chanceNone: 0.2, denarii: { range: [0.25, 4], chance: 0.5 },
    entries: [
      { item: 'nugae', weight: 3 }, { item: 'tali', weight: 2 }, { item: 'dupondius-domitiani', weight: 3 }, { item: 'denarius-columnae', weight: 2, count: [1, 3] },
      { item: 'fascia', weight: 2 }, { item: 'vasa-arretina', weight: 1 }, { item: 'fascinum', weight: 0.5 }, { item: 'defixio', weight: 0.5 },
      { item: 'hamulus', weight: 0.5 }, { item: 'glans-inscripta', weight: 0.3 },
    ],
  },
  {
    id: 'amphora.wine', rolls: [1, 2], chanceNone: 0.25,
    entries: [{ item: 'vinum', weight: 5, count: [1, 3] }, { item: 'posca', weight: 3 }, { item: 'vinum-melius', weight: 2 }, { item: 'vinum-falernum', weight: 0.5 }, { item: 'olivae', weight: 2 }, { item: 'acetum', weight: 1 }],
  },
  { id: 'building.load', rolls: [1, 1], entries: [{ item: 'ferrum', weight: 2 }, { item: 'malleus', weight: 0.3 }, { item: 'lucerna', weight: 1 }] },
  {
    id: 'locker.ludus', rolls: [1, 2], chanceNone: 0.1, denarii: { range: [0.25, 3], chance: 0.4 },
    entries: [
      { item: 'fascia', weight: 4, count: [1, 2] }, { item: 'posca', weight: 3 }, { item: 'panis', weight: 3 }, { item: 'tali', weight: 2 },
      { item: 'manica-linea', weight: 1 }, { item: 'fasciae', weight: 1 }, { item: 'lucerna', weight: 1 }, { item: 'emplastrum', weight: 1 },
    ],
  },
  {
    id: 'cloaca.silt', rolls: [1, 2], chanceNone: 0.3, denarii: { range: [0.25, 3], chance: 0.6 },
    entries: [
      { item: 'nugae', weight: 4 }, { item: 'dupondius-domitiani', weight: 3 }, { item: 'vitrum', weight: 1 }, { item: 'glans-plumbea', weight: 1, count: [2, 5] },
      { item: 'anulus-signatorius', weight: 0.3 }, { item: 'gemma', weight: 0.2 }, { item: 'defixio-furtum', weight: 0.5 },
    ],
  },
  { id: 'rixator', rolls: [0, 0], entries: [], denarii: { range: [0, 1] }, extras: [{ item: 'tali', chance: 0.2 }, { item: 'vinum', chance: 0.3 }, { item: 'panis', chance: 0.2 }] },
  { id: 'vigil', rolls: [0, 0], entries: [], denarii: { range: [0.5, 2] }, extras: [{ item: 'lucerna', chance: 0.6 }, { item: 'fascia', chance: 0.5 }, { item: 'hama', chance: 0.2 }] },
  { id: 'cloacarius', rolls: [0, 0], entries: [], denarii: { range: [0.25, 3] }, extras: [{ table: 'cloaca.silt', chance: 0.5 }, { item: 'fax', chance: 0.3 }, { item: 'tunica', chance: 0.2 }] },
  { id: 'sicarius', rolls: [0, 0], entries: [], denarii: { range: [10, 30] }, extras: [{ item: 'aconitum', chance: 0.4 }, { item: 'sica', chance: 0.6 }, { item: 'epistula-signata', chance: 0.1 }, { item: 'aureus', chance: 0.1 }] },
  // pickpocket purses by class (v0.2, GDD §14.4)
  { id: 'purse.plebs', rolls: [1, 1], chanceNone: 0.3, denarii: { range: [0.25, 3] }, entries: [{ item: 'tali', weight: 1 }, { item: 'libum', weight: 1 }, { item: 'nugae', weight: 1 }] },
  { id: 'purse.mercator', rolls: [1, 1], chanceNone: 0.3, denarii: { range: [3, 15] }, entries: [{ item: 'tessera-collegii', weight: 2 }, { item: 'vasa-arretina', weight: 1 }, { item: 'tabula-cerata', weight: 2 }] },
  { id: 'purse.miles', rolls: [1, 1], chanceNone: 0.5, denarii: { range: [2, 8] }, entries: [{ item: 'tabula-stipendii', weight: 2 }, { item: 'tali', weight: 1 }] },
  { id: 'purse.elite', rolls: [1, 1], chanceNone: 0.2, denarii: { range: [10, 40] }, entries: [{ item: 'anulus-signatorius', weight: 1 }, { item: 'gemma', weight: 1 }, { item: 'aureus', weight: 1 }] },

  // ---- docs/CONTENT.md §6.3: fixed (authored) loot. Conditional items (Mus' sica if he surrendered it) are the quest's job.
  { id: 'body.npc-festus', rolls: [0, 0], entries: [], denarii: { range: [6.1875, 6.1875] }, always: [{ item: 'pugio' }, { item: 'quest-epistula-festi' }] },
  { id: 'cista-muris', rolls: [0, 0], entries: [], denarii: { range: [18, 18] }, always: [{ item: 'quest-sacculum-festi' }, { item: 'quest-tabula-rasa' }, { item: 'quest-drachma-parthica' }, { item: 'nugae', count: 2 }, { item: 'fascia', count: 2 }] },
  { id: 'body.npc-mus', rolls: [0, 0], entries: [], denarii: { range: [3, 6] }, always: [{ item: 'clavis-cellae-muris' }, { item: 'sica-muris' }, { item: 'pugio' }, { item: 'cucullus' }] },
  {
    id: 'cista-regis-cloacae', rolls: [1, 1], entries: [{ table: 'valuables', weight: 1 }], denarii: { range: [30, 40] },
    always: [{ item: 'pugio-noric' }, { item: 'quest-tabella-drachmae' }, { item: 'tunica-linea' }, { item: 'lacerna' }, { item: 'palla' }, { item: 'defixio-furtum' }],
  },
  { id: 'body.npc-rex-cloacae', rolls: [0, 0], entries: [], denarii: { range: [12, 20] }, always: [{ item: 'gladius' }, { item: 'pugio' }, { item: 'thorax-coriaceus' }, { item: 'nugae' }] },
  { id: 'body.boss-suchus', rolls: [0, 0], entries: [], always: [{ item: 'corium', count: 2 }, { item: 'nugae' }] },
];
