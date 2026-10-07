/**
 * Stable material ids used by every procedural generator. The material library
 * (src/gfx/materials.ts) maps them to shared THREE materials (textured PBR where available,
 * flat colors otherwise). Never create per-object materials for these surfaces.
 */
export const MATERIAL_IDS = [
  // stone
  'marble', // Luna/Carrara white marble (temples, columns)
  'marble_veined', // grey-veined marble (Proconnesian / cipollino)
  'marble_giallo', // giallo antico (yellow)
  'marble_pavonazzetto', // white with purple veins
  'porphyry', // imperial purple-red
  'travertine', // creamy, porous (Colosseum, Theatre of Marcellus)
  'tufa', // brownish-grey volcanic tuff (Servian wall, old temples)
  'peperino', // dark grey tuff (Forum of Augustus firewall)
  'basalt', // dark grey lava stone (selce)
  'rock', // natural rock (cliffs)
  // masonry / plaster
  'brick', // opus testaceum, warm red-orange brick-faced concrete
  'reticulatum', // opus reticulatum diamond tufa
  'concrete', // exposed Roman concrete / rubble
  'plaster_white',
  'plaster_cream',
  'plaster_ochre',
  'plaster_red', // Pompeian red
  'plaster_dark', // black/dark band dados
  'stucco_painted', // painted frieze bands
  // roofs & metal
  'roof_tile', // terracotta tegulae/imbrices
  'gilded_bronze', // gilded roof tiles, statues
  'bronze',
  'iron',
  'lead',
  'terracotta',
  // wood & fabric
  'wood', // light weathered timber
  'wood_dark',
  'wood_painted', // painted shutters/balconies (reddish)
  'fabric_white',
  'fabric_red',
  'fabric_purple',
  'fabric_ochre',
  'fabric_blue',
  // ground
  'paving_basalt', // polygonal basalt road paving
  'paving_travertine', // forum slabs
  'cobbles',
  'gravel',
  'dirt',
  'grass',
  'dry_grass',
  'sand',
  'mud',
  // nature
  'bark',
  'foliage_pine',
  'foliage_cypress',
  'foliage_broad',
  'foliage_olive',
  // misc
  'water',
  'mosaic', // floor mosaic
  'black', // dark openings (doorways, windows)
  'interior', // the dark rooms behind upper windows (some lamplit at night)
  'glow_fire', // emissive (braziers, lamps)
] as const;

export type MaterialId = (typeof MATERIAL_IDS)[number];

/** Flat fallback colors (sRGB) and roughness/metalness used until textures load or as LOD. */
export const MATERIAL_BASE: Record<MaterialId, { color: number; roughness: number; metalness?: number; emissive?: number }> = {
  marble: { color: 0xeeeae2, roughness: 0.45 },
  marble_veined: { color: 0xd9d8d3, roughness: 0.45 },
  marble_giallo: { color: 0xd9b56c, roughness: 0.45 },
  marble_pavonazzetto: { color: 0xe8e0dc, roughness: 0.45 },
  porphyry: { color: 0x6e2a2f, roughness: 0.4 },
  travertine: { color: 0xd8ccb2, roughness: 0.85 },
  tufa: { color: 0xa8957a, roughness: 0.95 },
  peperino: { color: 0x7c7a74, roughness: 0.95 },
  basalt: { color: 0x4d4c4a, roughness: 0.8 },
  rock: { color: 0x8f8572, roughness: 0.95 },
  brick: { color: 0xb5643f, roughness: 0.9 },
  reticulatum: { color: 0xa69479, roughness: 0.95 },
  concrete: { color: 0x9c9384, roughness: 0.95 },
  plaster_white: { color: 0xe9e2d3, roughness: 0.9 },
  plaster_cream: { color: 0xe3d3b0, roughness: 0.9 },
  plaster_ochre: { color: 0xcf9f55, roughness: 0.9 },
  plaster_red: { color: 0x9e3326, roughness: 0.9 },
  plaster_dark: { color: 0x2f2a27, roughness: 0.9 },
  stucco_painted: { color: 0xb8473a, roughness: 0.85 },
  roof_tile: { color: 0xa9512f, roughness: 0.85 },
  gilded_bronze: { color: 0xd9a94a, roughness: 0.3, metalness: 1 },
  bronze: { color: 0x8a6a3c, roughness: 0.45, metalness: 1 },
  iron: { color: 0x5b5d61, roughness: 0.5, metalness: 1 },
  lead: { color: 0x7d8086, roughness: 0.6, metalness: 0.6 },
  terracotta: { color: 0xb8653d, roughness: 0.85 },
  wood: { color: 0x8a6a48, roughness: 0.85 },
  wood_dark: { color: 0x4f3a28, roughness: 0.85 },
  wood_painted: { color: 0x7d3324, roughness: 0.8 },
  fabric_white: { color: 0xe8e2d4, roughness: 1 },
  fabric_red: { color: 0x9b2d22, roughness: 1 },
  fabric_purple: { color: 0x5b1f45, roughness: 1 },
  fabric_ochre: { color: 0xc49447, roughness: 1 },
  fabric_blue: { color: 0x3c5a7d, roughness: 1 },
  paving_basalt: { color: 0x585653, roughness: 0.8 },
  paving_travertine: { color: 0xd3c8b0, roughness: 0.8 },
  cobbles: { color: 0x8a8274, roughness: 0.9 },
  gravel: { color: 0xa39a87, roughness: 1 },
  dirt: { color: 0x8c7356, roughness: 1 },
  grass: { color: 0x6f7f3e, roughness: 1 },
  dry_grass: { color: 0xa79a5c, roughness: 1 },
  sand: { color: 0xc8b48a, roughness: 1 },
  mud: { color: 0x6a5a45, roughness: 0.9 },
  bark: { color: 0x5c4a3a, roughness: 1 },
  foliage_pine: { color: 0x3f5a2c, roughness: 0.9 },
  foliage_cypress: { color: 0x2f4527, roughness: 0.9 },
  foliage_broad: { color: 0x55702f, roughness: 0.9 },
  foliage_olive: { color: 0x7d8a5c, roughness: 0.9 },
  water: { color: 0x3d5f5a, roughness: 0.1 },
  mosaic: { color: 0xcdbb9a, roughness: 0.6 },
  black: { color: 0x0b0a09, roughness: 1 },
  interior: { color: 0x0b0a09, roughness: 1 },
  glow_fire: { color: 0xffa040, roughness: 1, emissive: 0xff8a2a },
};
