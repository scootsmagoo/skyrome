/**
 * Weapons and ammunition — docs/GDD.md §8.1 (absolute damage: iron gladius 13, stagger 12) and
 * the attack-type table of §6.2 (`attackTypes`: the gladius thrusts, cuts, thrusts). Quality tiers
 * are generated: Noric steel ×1.15 damage / ×2.5 value, Bilbilis steel (blades only) ×1.3 / ×6,
 * officer's silvered ×1.0 / ×4 and +5 persuasion with soldiers (`<base>-noric`, `-bilbilis`, `-silvered`).
 */
import type { ItemDef } from '../../types';
import { AS, weapon, ws } from './build';

export const BASE_WEAPONS: ItemDef[] = [
  weapon('caestus', 'Caestus', 'caestus', ws('unarmed', 'brawling', 7, 'blunt', 1.4, 0.5, 12), 0.6, 8, 'none', 'Oxhide boxing thongs studded with metal. Always knocks out rather than kills.', { tags: ['knockout'] }),
  weapon('pugio', 'Pugio', 'pugio', ws('blade', 'blades', 8, 'thrust', 1.3, 0.55, 6), 0.4, 6, 'pugio', 'The broad legionary dagger. Sneak attacks ×4; the off-hand finisher.', { tags: ['dagger'] }),
  weapon('sica', 'Sica', 'sica', ws('blade', 'blades', 11, 'cut', 1.15, 0.7, 10), 0.6, 18, 'sica', 'A curved Thracian short sword that hooks round shields: it ignores a quarter of block mitigation.', { tags: ['dagger', 'hook'] }),
  weapon('gladius', 'Gladius', 'gladius', ws('blade', 'blades', 13, 'thrust', 1, 0.75, 12, { alt: { damageType: 'cut', damage: 11 }, attackTypes: { light: ['thrust', 'cut', 'thrust'], overhead: 'cut', forward: 'thrust', side: 'cut' } }), 1.2, 22, 'gladius', 'The Pompeii-pattern short sword: parallel edges and a short point. The all-rounder.'),
  weapon('spatha', 'Spatha', 'spatha', ws('blade', 'blades', 14, 'cut', 0.9, 0.95, 14, { alt: { damageType: 'thrust', damage: 12 }, attackTypes: { light: ['cut', 'cut', 'thrust'], overhead: 'cut', forward: 'thrust', side: 'cut' } }), 1.4, 35, 'spatha', 'The long cavalry sword, made to reach down from the saddle.'),
  weapon('dolabra', 'Dolabra', 'dolabra', ws('blade', 'blades', 15, 'cut', 0.85, 0.8, 22), 2, 10, 'axe', 'The pick-axe of soldiers and Vigiles: it digs ditches and breaks doors.', { tags: ['tool', 'breaks-doors'] }),
  weapon('falx', 'Falx', 'falx Dacica', ws('blade', 'blades', 24, 'cut', 0.7, 1.2, 30, { twoHanded: true }), 2.8, 60, 'spatha', 'The two-handed Dacian falx. It ignores half of any block, and its power sweep cannot be blocked at all.', { tags: ['falx', 'dacian', 'hook'] }),
  weapon('hasta', 'Hasta', 'hasta', ws('spear', 'spear', 14, 'thrust', 0.9, 1.8, 14), 2, 12, 'hasta', 'A thrusting spear, light enough to use one-handed behind a shield.'),
  weapon('lancea', 'Lancea', 'lancea', ws('spear', 'spear', 11, 'thrust', 1, 1.5, 10, { thrownDamage: 18, projectileSpeed: 28 }), 1.2, 8, 'hasta', 'A light auxiliary spear, for thrusting or throwing.', { stackable: true }),
  weapon('venabulum', 'Venabulum', 'venabulum', ws('spear', 'spear', 16, 'thrust', 0.85, 1.9, 18), 2.4, 20, 'hasta', 'A broad-bladed boar spear with a crossbar. +25% against beasts; brace it against a charge.', { tags: ['venatio'] }),
  weapon('tridens', 'Tridens', 'tridens', ws('spear', 'spear', 13, 'thrust', 0.9, 1.8, 12), 2.2, 25, 'trident', 'The retiarius’s trident: a fisherman’s spear made for the arena.', { tags: ['retiarius'] }),
  weapon('pilum', 'Pilum', 'pilum', ws('thrown', 'spear', 10, 'thrust', 0.8, 1.6, 20, { thrownDamage: 30, projectileSpeed: 25 }), 2, 10, 'pilum', 'The heavy legionary javelin. It sticks in shields: the bearer’s block is halved until he drops the shield.', { tags: ['sticks-in-shields'] }),
  weapon('iaculum', 'Iaculum', 'iaculum', ws('thrown', 'spear', 6, 'thrust', 1, 1, 12, { thrownDamage: 18, projectileSpeed: 28 }), 0.8, 4, 'pilum', 'A light javelin. Carry up to five.'),
  weapon('rete', 'Rete', 'rete', ws('thrown', 'spear', 0, 'blunt', 1, 6, 0, { projectileSpeed: 14 }), 2, 15, 'net', 'The retiarius’s weighted net: it entangles for 3 s (bosses 1.5 s). Struggle free by mashing E or F.', { tags: ['net', 'retiarius'], stackable: false }),
  weapon('fustis', 'Fustis', 'fustis', ws('blunt', 'brawling', 10, 'blunt', 1.05, 0.8, 20), 1, 1, 'fustis', 'A hardwood cudgel. Knocks out rather than kills, up to a soldier.', { tags: ['knockout-miles'] }),
  weapon('clava', 'Clava', 'clava', ws('blunt', 'brawling', 13, 'blunt', 0.9, 0.8, 26), 1.8, 3, 'fustis', 'A knotted club. Knocks out rather than kills, up to a soldier.', { tags: ['knockout-miles'] }),
  weapon('vitis', 'Vitis', 'vitis', ws('blunt', 'brawling', 9, 'blunt', 1.1, 0.85, 18), 0.6, 0, 'fustis', 'A centurion’s vine staff: badge and whip. +50% stagger against soldiers. Not sold.', { tags: ['knockout-miles', 'vitis'] }),
  weapon('arcus', 'Arcus', 'arcus', ws('bow', 'archery', 16, 'thrust', 1, 0.5, 10, { twoHanded: true, projectileSpeed: 55, ammo: 'sagitta' }), 1, 45, 'bow', 'A composite bow of horn, wood and sinew. Full draw 0.9 s; a partial draw from 0.4 s does half.'),
  weapon('funda', 'Funda', 'funda', ws('sling', 'archery', 0, 'blunt', 1, 0.5, 25, { projectileSpeed: 60, ammo: 'glans-plumbea' }), 0.1, 1, 'sling', 'A braided wool sling. Loud: it alerts everyone within 15 m.'),
  // arma lusoria (§6.10): practice arms never kill — 0 health is a knockout
  weapon('rudis', 'Rudis', 'rudis', ws('blade', 'blades', 11, 'blunt', 1, 0.75, 14, { practice: true }), 1, 1, 'gladius', 'A wooden practice sword, issued by the Ludus armory. It never kills: a fighter at 0 health is knocked out. It trains Blades, not Brawling — and it is the token of freedom given to a gladiator on his release.', { tags: ['lusoria', 'training'] }),
  weapon('tridens-lusorius', 'Practice Trident', 'tridens lusorius', ws('spear', 'spear', 8, 'blunt', 0.9, 1.8, 12, { practice: true }), 2, 0, 'trident', 'A blunted trident for practice bouts. It never kills. Not sold.', { tags: ['lusoria', 'training', 'retiarius'] }),
  // extras
  weapon('malleus', 'Malleus', 'malleus', ws('blunt', 'brawling', 16, 'blunt', 0.65, 0.9, 32, { twoHanded: true }), 5, 6, 'hammer', 'A stonemason’s sledgehammer from the building sites of Trajan’s Forum. (Extra.)', { tags: ['tool'] }),
  weapon('fax', 'Torch', 'fax', ws('blunt', 'brawling', 3, 'blunt', 1, 0.6, 4), 0.8, 2 * AS, 'torch', 'Pine splints bound with pitch. Light radius 8 m for 2 game hours; disperses rats, lights pitch, and makes you +50% visible.', { slot: 'offHand', type: 'tool', stackable: true, tags: ['light'], equipFlags: ['torch.lit'] }),
];

export const AMMO: ItemDef[] = [
  { id: 'sagitta', name: 'Arrow', latin: 'sagitta', type: 'ammo', slot: 'ammo', weight: 0.05, value: 0.2, stackable: true, weapon: ws('bow', 'archery', 0, 'thrust', 1, 0, 0), description: 'A reed arrow with an iron trilobate head. Half of them can be recovered.', icon: '➶' },
  { id: 'glans-plumbea', name: 'Lead Sling Bullet', latin: 'glans plumbea', type: 'ammo', slot: 'ammo', weight: 0.05, value: 0.1, stackable: true, weapon: ws('sling', 'archery', 12, 'blunt', 1, 0, 0), description: 'An almond-shaped lead bullet.', icon: '•', tags: ['lead'] },
  { id: 'glans-inscripta', name: 'Inscribed Sling Bullet', latin: 'glans inscripta', type: 'ammo', slot: 'ammo', weight: 0.05, value: 0.5, stackable: true, weapon: ws('sling', 'archery', 13.2, 'blunt', 1, 0, 0), description: 'A lead bullet cast with FERI — “Strike!” — and a thunderbolt. A collectible (12 to find).', icon: '•', tags: ['lead', 'collectible'] },
  { id: 'lapis', name: 'Sling Stone', latin: 'lapis', type: 'ammo', slot: 'ammo', weight: 0.06, value: 0, stackable: true, weapon: ws('sling', 'archery', 8, 'blunt', 1, 0, 0, { projectileSpeed: 45 }), description: 'A smooth river stone. Free for the picking up.', icon: '•' },
];

/** §8.1 quality tiers, generated for blades and spear heads. */
const QUALITY = {
  noric: { suffix: 'noric', name: 'Noric-steel', latin: 'Noricus', dmg: 1.15, value: 2.5, desc: 'Forged from the hard steel of Noricum.' },
  bilbilis: { suffix: 'bilbilis', name: 'Bilbilis-steel', latin: 'Bilbilitanus', dmg: 1.3, value: 6, desc: 'Quenched in the icy Salo at Bilbilis, Martial’s home town: the best steel in the empire.' },
  silvered: { suffix: 'silvered', name: 'Officer’s Silvered', latin: 'argentatus', dmg: 1, value: 4, desc: 'Silver-mounted for an officer; soldiers listen to its owner (+5 persuasion with soldiers).' },
} as const;

function variant(base: ItemDef, q: keyof typeof QUALITY): ItemDef {
  const Q = QUALITY[q];
  const w = base.weapon!;
  return {
    ...base,
    id: `${base.id}-${Q.suffix}`,
    name: `${Q.name} ${base.name}`,
    latin: `${base.latin} ${Q.latin}`,
    value: Math.round(base.value * Q.value),
    description: `${Q.desc} ${base.description}`,
    weapon: { ...w, damage: +(w.damage * Q.dmg).toFixed(2), alt: w.alt ? { ...w.alt, damage: +(w.alt.damage * Q.dmg).toFixed(2) } : undefined, thrownDamage: w.thrownDamage ? +(w.thrownDamage * Q.dmg).toFixed(2) : undefined },
    tags: [...(base.tags ?? []), q],
    equipFlags: q === 'silvered' ? [...(base.equipFlags ?? []), 'dress.silvered'] : base.equipFlags,
  };
}

export const byId = (id: string) => BASE_WEAPONS.find((w) => w.id === id)!;
export const VARIANTS: ItemDef[] = [
  ...['pugio', 'sica', 'gladius', 'spatha', 'falx', 'hasta', 'lancea', 'venabulum'].map((id) => variant(byId(id), 'noric')),
  ...['pugio', 'sica', 'gladius', 'spatha'].map((id) => variant(byId(id), 'bilbilis')),
  ...['pugio', 'gladius', 'spatha'].map((id) => variant(byId(id), 'silvered')),
];

/** §8.1 uniques (v1.0). */
export const UNIQUES: ItemDef[] = [
  { ...variant(byId('gladius'), 'bilbilis'), id: 'gladius-primi-pali', name: 'Gladius of the Primus Palus', latin: 'gladius primi pali', value: 600, weapon: { ...byId('gladius').weapon!, damage: 13 * 1.4, alt: { damageType: 'cut', damage: 11 * 1.4 } }, description: 'The champion of the Ludus Magnus fought a hundred bouts with this Bilbilis blade. The grip is worn to the shape of one hand.', tags: ['unique', 'bilbilis'] },
  { ...byId('falx'), id: 'falx-mucaporis', name: 'Falx of Mucapor', latin: 'falx Mucaporis', value: 400, weapon: { ...byId('falx').weapon!, damage: 24 * 1.15 }, description: 'The Dacian champion’s falx, black with age, its inner edge honed like a razor.', tags: ['unique', 'falx', 'dacian', 'hook'] },
  { ...byId('vitis'), id: 'vitis-vituli', name: 'Vitis of “Vitulus”', latin: 'vitis Vituli', value: 0, weapon: { ...byId('vitis').weapon!, damage: 11, stagger: 24 }, description: 'The rogue centurion’s vine staff. Soldiers flinch at it by habit.', tags: ['unique', 'knockout-miles', 'vitis'] },
  { ...byId('rete'), id: 'rete-nerei', name: 'Net of Nereus', latin: 'rete Nerei', value: 120, description: 'The champion retiarius’s net, weighted with lead: it entangles 1 s longer.', tags: ['unique', 'net', 'retiarius', 'entangle+1'] },
  { ...byId('pugio'), id: 'pugio-bruti', name: 'The “Dagger of Brutus”', latin: 'pugio Bruti', value: 3, description: 'Sold as the very blade of the Ides of March. The hilt is new and the blade is Gallic; a smith (Smithing 40) would laugh.', tags: ['unique', 'dagger', 'fake'] },
];
