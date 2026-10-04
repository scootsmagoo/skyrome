/**
 * Street containers (docs/CONTENT.md §6.1; GDD §12.3, AC-23 "at least 40 street containers"): slabs
 * with a hollow under them, cracks stuffed with rags, dropped bundles, amphora stacks, market
 * baskets, offering boxes at the crossroads shrines, carts' loads, a coin in a basin, a tool left on
 * a step. Pure data: where each one is, what it holds (a loot table of src/rpg/data/loot.ts), who
 * owns it and what opens it. The installer (src/content/install.ts) turns each into an interactable,
 * rolls its loot once, and remembers what was taken in the world deltas.
 *
 * Ownership (GDD §12.3, §14.1): taking from an owned container is theft (`furtum`, twice the value)
 * if someone sees. Locks: v0.1 has no lockpicking, so a locked container opens with its key or not at
 * all. Interior containers (flats, strongboxes, the Ludus lockers) wait for their interiors: they are
 * listed here with `interior: true` and placed only when the world registers the place for them.
 */
import { onPath } from './route';

export type ContainerKind =
  | 'latebra-silicis'
  | 'fissura-muri'
  | 'sarcina-abiecta'
  | 'amphora-stack'
  | 'corbis-mercatoris'
  | 'cista-insulae'
  | 'arca-tabernae'
  | 'arca-compiti'
  | 'cella-ludi'
  | 'silt-niche'
  | 'cista-muris'
  | 'cista-regis-cloacae'
  | 'plaustrum'
  | 'moneta-in-fonte'
  | 'instrumentum-abiectum'
  | 'fasciculus';

export interface ContainerSpec {
  /** Stable id (also the world-delta key). */
  id: string;
  kind: ContainerKind;
  /** A place id (location registry or atlas landmark), or a point on the golden path (real metres along, side). */
  at: string | { d: number; side: number };
  /** Offset from the place, game metres. */
  dx?: number;
  dz?: number;
  /** Loot table (src/rpg/data/loot.ts). Fixed loot lives in a table of `always` entries. */
  table: string;
  /** Owner id (an NPC or the vicus) and display name; missing = nobody's (taking is no crime). */
  owner?: string;
  ownerName?: string;
  /** Opens with this key item; without it the container stays locked. */
  key?: string;
  /** Locked and picking is not in v0.1 (the bible's `mediocris`/`simplex` locks without a key). */
  locked?: 'simplex' | 'mediocris';
  /** Waits for an interior cell: not placed in the street. */
  interior?: boolean;
  /** Sits on a cart (the NPC module's props): the prompt only exists once the cart does. */
  needs?: 'cart';
}

export interface ContainerStyle {
  verb: string;
  label: string;
  /** Prompt height above the ground, m. */
  height: number;
}

export const CONTAINER_STYLES: Record<ContainerKind, ContainerStyle> = {
  'latebra-silicis': { verb: 'Lift', label: 'A loose paving slab', height: 0.2 },
  'fissura-muri': { verb: 'Search', label: 'A crack stuffed with rags', height: 0.9 },
  'sarcina-abiecta': { verb: 'Search', label: 'A dropped bundle', height: 0.3 },
  'amphora-stack': { verb: 'Search', label: 'Stacked amphorae', height: 0.7 },
  'corbis-mercatoris': { verb: 'Search', label: 'A market basket', height: 0.6 },
  'cista-insulae': { verb: 'Open', label: 'A tenant’s chest', height: 0.5 },
  'arca-tabernae': { verb: 'Open', label: 'A shop strongbox', height: 0.5 },
  'arca-compiti': { verb: 'Open', label: 'The offering box', height: 0.8 },
  'cella-ludi': { verb: 'Open', label: 'A gladiator’s locker', height: 0.8 },
  'silt-niche': { verb: 'Search', label: 'A silted niche in the drain wall', height: 0.7 },
  'cista-muris': { verb: 'Open', label: 'The Mouse’s strongbox', height: 0.5 },
  'cista-regis-cloacae': { verb: 'Search', label: 'The Rex’s heap of stolen goods', height: 0.5 },
  plaustrum: { verb: 'Search', label: 'A cart’s load', height: 1.0 },
  'moneta-in-fonte': { verb: 'Take', label: 'A coin in the basin', height: 0.3 },
  'instrumentum-abiectum': { verb: 'Take', label: 'A dropped tool', height: 0.3 },
  fasciculus: { verb: 'Search', label: 'A bundle on a cart', height: 0.8 },
};

const P = (d: number, side: number) => ({ d, side });

/** The compita (crossroads shrines) with their offering boxes. */
export const COMPITA = ['compitum-capenae', 'compitum-circi', 'compitum-vici-tusci', 'compitum-velabri', 'compitum-boarii', 'compitum-acili'] as const;

const unowned = (id: string, kind: ContainerKind, at: ContainerSpec['at'], table: string, extra: Partial<ContainerSpec> = {}): ContainerSpec => ({ id, kind, at, table, ...extra });

export const CONTAINERS: ContainerSpec[] = [
  // ---- unowned: nobody's, taking is no crime (§6.1: 20 of them, 24 with the Cloaca's)
  unowned('ctn-latebra-vortumni', 'latebra-silicis', 'signum-vortumni', 'cache.street', { dx: 2, dz: 1 }),
  unowned('ctn-latebra-metae', 'latebra-silicis', 'meta-sudans', 'cache.street', { dx: -4, dz: 5 }),
  unowned('ctn-latebra-circi', 'latebra-silicis', 'compitum-circi', 'cache.street', { dx: -2, dz: 2 }),
  unowned('ctn-latebra-boarii', 'latebra-silicis', 'forum-boarium', 'cache.street', { dx: 8, dz: 3 }),
  unowned('ctn-latebra-portuni', 'latebra-silicis', 'temple-portunus', 'cache.street', { dx: 6, dz: -9 }),
  unowned('ctn-latebra-juliae', 'latebra-silicis', 'basilica-julia-gradus', 'cache.street', { dx: 3, dz: 3 }),
  unowned('ctn-fissura-tuccii', 'fissura-muri', 'insula-tuccii', 'cache.street', { dx: 3, dz: 2 }),
  unowned('ctn-fissura-nutantis', 'fissura-muri', 'insula-nutans', 'cache.street', { dx: -4, dz: 1 }),
  unowned('ctn-fissura-mariorum', 'fissura-muri', 'insula-mariorum', 'cache.street', { dx: 3, dz: -3 }),
  unowned('ctn-fissura-pistrini', 'fissura-muri', 'pistrinum-velabri', 'cache.street', { dx: -2, dz: 4 }),
  unowned('ctn-fissura-viae-1', 'fissura-muri', P(170, 6), 'cache.street'),
  unowned('ctn-fissura-viae-2', 'fissura-muri', P(290, 6), 'cache.street'),
  unowned('ctn-fissura-viae-3', 'fissura-muri', P(470, 6), 'cache.street'),
  unowned('ctn-fissura-metae', 'fissura-muri', 'meta-sudans', 'cache.street', { dx: 6, dz: -2 }),
  unowned('ctn-fissura-ludi', 'fissura-muri', 'ludus-gate', 'cache.street', { dx: 4, dz: 3 }),
  unowned('ctn-sarcina-nutantis', 'sarcina-abiecta', 'insula-nutans', 'cache.street', { dx: 6, dz: 6 }),
  unowned('ctn-sarcina-astrologi', 'sarcina-abiecta', 'astrologi-circi', 'cache.street', { dx: -5, dz: 3 }),
  unowned('ctn-sarcina-carcerum', 'sarcina-abiecta', 'caupona-carcerum', 'cache.street', { dx: 4, dz: -4 }),
  unowned('ctn-amphora-combusta', 'amphora-stack', 'taberna-collapsa', 'amphora.wine', { dx: 2, dz: 1 }),
  unowned('ctn-cista-muris', 'cista-muris', 'taberna-collapsa', 'cista-muris', { dx: -2, dz: -2, key: 'clavis-cellae-muris', locked: 'simplex' }),
  // the Cloaca's landing (misc-venus-cloacina)
  unowned('ctn-silt-1', 'silt-niche', 'cloaca-maxima-outlet', 'cloaca.silt', { dx: -3, dz: 6 }),
  unowned('ctn-silt-2', 'silt-niche', 'cloaca-maxima-outlet', 'cloaca.silt', { dx: 0, dz: 7 }),
  unowned('ctn-silt-3', 'silt-niche', 'cloaca-maxima-outlet', 'cloaca.silt', { dx: 3, dz: 6 }),
  unowned('ctn-cista-regis', 'cista-regis-cloacae', 'cloaca-maxima-outlet', 'cista-regis-cloacae', { dx: 0, dz: 10 }),

  // ---- loose things on the street (§6.1: the 20 "loose props" that keep AC-23 at 40 without crime)
  unowned('ctn-moneta-mercurii', 'moneta-in-fonte', 'fons-mercurii', 'loose.coin', { dx: 1, dz: 1 }),
  unowned('ctn-moneta-metae', 'moneta-in-fonte', 'lacus-metae', 'loose.coin', { dx: 1, dz: -1 }),
  unowned('ctn-moneta-velabri', 'moneta-in-fonte', 'lacus-velabri', 'loose.coin', { dx: -1, dz: 1 }),
  unowned('ctn-moneta-juturnae', 'moneta-in-fonte', 'lacus-juturnae', 'loose.coin', { dx: 1, dz: 2 }),
  unowned('ctn-moneta-curtii', 'moneta-in-fonte', 'lacus-curtius', 'loose.coin', { dx: 2, dz: 0 }),
  unowned('ctn-instrumentum-1', 'instrumentum-abiectum', P(95, -2), 'loose.tool'),
  unowned('ctn-instrumentum-2', 'instrumentum-abiectum', P(235, 3), 'loose.tool'),
  unowned('ctn-instrumentum-3', 'instrumentum-abiectum', P(330, -2), 'loose.tool'),
  unowned('ctn-instrumentum-4', 'instrumentum-abiectum', P(520, 3), 'loose.tool'),
  unowned('ctn-instrumentum-juliae', 'instrumentum-abiectum', 'basilica-julia-gradus', 'loose.tool', { dx: -6, dz: 2 }),
  unowned('ctn-instrumentum-fori', 'instrumentum-abiectum', 'forum-trajan', 'loose.tool', { dx: 10, dz: 4 }),
  unowned('ctn-instrumentum-columnae', 'instrumentum-abiectum', 'column-trajan', 'loose.tool', { dx: 5, dz: 5 }),
  unowned('ctn-fasciculus-plaustri', 'fasciculus', 'via-plaustrum', 'loose.bundle', { dx: 2, dz: 1, needs: 'cart' }),
  unowned('ctn-fasciculus-carri', 'fasciculus', 'capena-extra', 'loose.bundle', { dx: 3, dz: -2, needs: 'cart' }),
  unowned('ctn-fasciculus-portus', 'fasciculus', 'portus-tiberinus', 'loose.bundle', { dx: 4, dz: 2 }),
  unowned('ctn-fasciculus-boarii', 'fasciculus', 'forum-boarium', 'loose.bundle', { dx: -6, dz: -2 }),
  unowned('ctn-fasciculus-circi', 'fasciculus', P(380, -8), 'loose.bundle'),
  unowned('ctn-fasciculus-horreorum', 'fasciculus', 'horrea-agrippiana', 'loose.bundle', { dx: 8, dz: 3 }),
  unowned('ctn-fasciculus-armorum', 'fasciculus', 'taberna-armorum', 'loose.bundle', { dx: 5, dz: 4 }),
  unowned('ctn-fasciculus-arcus', 'fasciculus', 'arch-titus', 'loose.bundle', { dx: 5, dz: 3 }),

  // ---- owned (taking is furtum if seen)
  { id: 'ctn-amphorae-porci', kind: 'amphora-stack', at: 'popina-vici-tusci', dx: 3, dz: 2, table: 'amphora.wine', owner: 'npc-chreste', ownerName: 'Vibia Chreste' },
  { id: 'ctn-amphorae-carcerum', kind: 'amphora-stack', at: 'caupona-carcerum', dx: -3, dz: 2, table: 'amphora.wine', owner: 'npc-dama', ownerName: 'Novius Dama' },
  { id: 'ctn-amphorae-horreorum', kind: 'amphora-stack', at: 'horrea-agrippiana', dx: -6, dz: 5, table: 'amphora.wine', owner: 'horrea-agrippiana', ownerName: 'the Horrea Agrippiana' },
  { id: 'ctn-amphorae-seplasiae', kind: 'amphora-stack', at: 'seplasia-vici-tusci', dx: 2, dz: 2, table: 'amphora.wine', owner: 'npc-fadia', ownerName: 'Fadia Musa' },
  { id: 'ctn-amphorae-pistrini', kind: 'amphora-stack', at: 'pistrinum-velabri', dx: 3, dz: -2, table: 'amphora.wine', owner: 'npc-philadelphus', ownerName: 'Philadelphus' },
  { id: 'ctn-amphorae-fullonicae', kind: 'amphora-stack', at: 'fullonica-velabri', dx: -2, dz: 3, table: 'amphora.wine', owner: 'npc-cerinthus', ownerName: 'Cerinthus' },
  { id: 'ctn-amphorae-vestiarii', kind: 'amphora-stack', at: 'taberna-vestiarii', dx: 2, dz: 3, table: 'amphora.wine', owner: 'npc-tychicus', ownerName: 'Tychicus' },
  { id: 'ctn-amphorae-aemiliae', kind: 'amphora-stack', at: 'tabernae-aemiliae', dx: -4, dz: 3, table: 'amphora.wine', owner: 'npc-hermogenes', ownerName: 'Hermogenes' },
  { id: 'ctn-corbis-ficus', kind: 'corbis-mercatoris', at: 'circi-ficus', dx: 1, dz: 1, table: 'food', owner: 'npc-caunea', ownerName: 'Caunea' },
  { id: 'ctn-corbis-botularii', kind: 'corbis-mercatoris', at: 'circi-botularius', dx: -1, dz: 1, table: 'food', owner: 'npc-niger', ownerName: 'Sextus Niger' },
  { id: 'ctn-corbis-boarii', kind: 'corbis-mercatoris', at: 'forum-boarium', dx: 4, dz: 7, table: 'food', owner: 'forum-boarium', ownerName: 'a cattle-market stall' },
  { id: 'ctn-corbis-viae-1', kind: 'corbis-mercatoris', at: P(1090, 5), table: 'food', owner: 'vicus-tuscus', ownerName: 'a stallholder' },
  { id: 'ctn-corbis-viae-2', kind: 'corbis-mercatoris', at: P(1135, -4), table: 'food', owner: 'vicus-tuscus', ownerName: 'a stallholder' },
  { id: 'ctn-corbis-viae-3', kind: 'corbis-mercatoris', at: P(1185, 5), table: 'food', owner: 'vicus-tuscus', ownerName: 'a stallholder' },
  ...COMPITA.map<ContainerSpec>((c) => ({ id: `ctn-arca-${c}`, kind: 'arca-compiti', at: c, dx: 1.2, dz: 0.4, table: 'shrine', owner: c, ownerName: 'the vicus' })),
  { id: 'ctn-plaustrum-dromonis', kind: 'plaustrum', at: 'capena-extra', dx: 5, dz: 2.5, table: 'amphora.wine', owner: 'npc-dromo', ownerName: 'Dromo’s master', needs: 'cart' },
  { id: 'ctn-plaustrum-cornicis', kind: 'plaustrum', at: 'via-plaustrum', dx: -2, dz: 1, table: 'building.load', owner: 'npc-cornix', ownerName: 'Cornix', needs: 'cart' },

  // ---- owned, indoors (placed when the interior exists)
  { id: 'ctn-cista-primae', kind: 'cista-insulae', at: 'insula-nutans-cenaculum', table: 'chest.common', owner: 'npc-prima', ownerName: 'Iulia Prima', interior: true },
  { id: 'ctn-cista-mariorum', kind: 'cista-insulae', at: 'insula-mariorum', table: 'chest.common', owner: 'npc-marius-fuscus', ownerName: 'Marius Fuscus', interior: true },
  { id: 'ctn-cista-tuccii', kind: 'cista-insulae', at: 'insula-tuccii', table: 'chest.common', owner: 'npc-florus', ownerName: 'Tuccius Florus', interior: true },
  { id: 'ctn-cista-abdetis', kind: 'cista-insulae', at: 'insula-nutans-tectum', table: 'chest.common', owner: 'npc-syri-nutans', ownerName: 'Abdes', interior: true },
  { id: 'ctn-arca-armorum', kind: 'arca-tabernae', at: 'taberna-armorum', table: 'strongbox', owner: 'npc-euhodus', ownerName: 'Euhodus', locked: 'mediocris', interior: true },
  { id: 'ctn-arca-porci', kind: 'arca-tabernae', at: 'popina-vici-tusci', table: 'strongbox', owner: 'npc-chreste', ownerName: 'Vibia Chreste', locked: 'mediocris', interior: true },
  { id: 'ctn-arca-aemiliae', kind: 'arca-tabernae', at: 'tabernae-aemiliae', table: 'strongbox', owner: 'npc-hermogenes', ownerName: 'Hermogenes', locked: 'mediocris', interior: true },
  ...[0, 1, 2, 3, 4, 5].map<ContainerSpec>((i) => ({ id: `ctn-cella-ludi-${i + 1}`, kind: 'cella-ludi', at: 'ludus-cellae', dx: (i - 2.5) * 1.2, dz: 0, table: 'locker.ludus', owner: 'ludus-magnus', ownerName: 'a gladiator', interior: true })),
];

/** Game-metre point of a spec on the golden path (real metres → game), for specs given as `{ d, side }`. */
export function routePoint(at: { d: number; side: number }): [number, number] {
  return onPath(at.d, at.side);
}

export const STREET_CONTAINERS = CONTAINERS.filter((c) => !c.interior);
export const UNOWNED_CONTAINERS = STREET_CONTAINERS.filter((c) => !c.owner);
