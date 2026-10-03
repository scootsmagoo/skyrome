/**
 * Item catalogue — docs/GDD.md §7.2 (prices) and §8 (weapons, clothing, armor, shields,
 * consumables, misc, books), with the GDD's ids. Values are in denarii (1 as = 1/16, 1 quadrans =
 * 1/64). Weapon damage and stagger are the GDD's absolute numbers (iron gladius 13, stagger 12).
 *
 * Quality tiers (§8.1) are generated: Noric steel ×1.15 damage / ×2.5 value, Bilbilis steel
 * (blades only) ×1.3 / ×6, officer's silvered ×1.0 / ×4 and +5 persuasion with soldiers. Ids are
 * `<base>-noric`, `<base>-bilbilis`, `<base>-silvered`.
 *
 * A few period items beyond the GDD tables are kept (marked "extra") for loot and flavour.
 */
import type { ArmorFamily, ArmorStats, DamageType, Effect, ItemDef, WeaponStats } from '../types';

const AS = 1 / 16;

// ------------------------------------------------------------------ builders

type Visual = NonNullable<ItemDef['visual']>;

function weapon(id: string, name: string, latin: string, w: WeaponStats, weight: number, value: number, model: Visual['weapon'], description: string, extra: Partial<ItemDef> = {}): ItemDef {
  const thrown = w.class === 'thrown';
  return { id, name, latin, type: 'weapon', slot: 'mainHand', weapon: w, weight, value, description, visual: { weapon: model }, stackable: thrown, icon: '⚔', ...extra };
}
const ws = (cls: WeaponStats['class'], skill: string, damage: number, damageType: DamageType, speed: number, reach: number, stagger: number, extra: Partial<WeaponStats> = {}): WeaponStats => ({ class: cls, skill, damage, damageType, speed, reach, stagger, ...extra });

function armor(id: string, name: string, latin: string, slot: ItemDef['slot'], a: ArmorStats, weight: number, value: number, look: Visual, description: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: a.weightClass === 'clothing' ? 'clothing' : 'armor', slot, armor: a, weight, value, description, visual: look, icon: a.weightClass === 'clothing' ? '👕' : '🛡', ...extra };
}
const heavy = (rating: number, family?: ArmorFamily): ArmorStats => ({ rating, weightClass: 'heavy', family });
const light = (rating: number, family?: ArmorFamily): ArmorStats => ({ rating, weightClass: 'light', family });
const cloth = (rating = 0): ArmorStats => ({ rating, weightClass: 'clothing', family: 'cloth' });

function food(id: string, name: string, latin: string, weight: number, value: number, effects: Effect[], description: string, tags: string[] = ['food']): ItemDef {
  return { id, name, latin, type: 'consumable', weight, value, effects, description, stackable: true, icon: tags.includes('drink') ? '🍷' : '🍞', tags };
}
function remedy(id: string, name: string, latin: string, weight: number, value: number, effects: Effect[], description: string, tags: string[] = []): ItemDef {
  return { id, name, latin, type: 'consumable', weight, value, effects, description, stackable: true, icon: '⚱', tags: ['medicine', ...tags] };
}
/** Restore `hp` over `seconds` (GDD food heals over time). */
const hot = (hp: number, seconds: number): Effect => ({ kind: 'regen', target: 'health', amount: hp / seconds, duration: seconds });
const stam = (amount: number): Effect => ({ kind: 'restore', target: 'stamina', amount });
const cond = (id: string): Effect => ({ kind: 'condition', target: id, amount: 1 });

function book(id: string, name: string, latin: string, value: number, teaches: string | undefined, description: string, text: string, tags: string[] = []): ItemDef {
  return { id, name, latin, type: 'book', weight: 0.4, value, text, teaches, description, icon: '📜', stackable: true, tags: ['book', ...tags] };
}
function misc(id: string, name: string, latin: string, weight: number, value: number, description: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: 'misc', weight, value, description, stackable: true, icon: '◆', ...extra };
}

// ------------------------------------------------------------------ weapons (§8.1)

const BASE_WEAPONS: ItemDef[] = [
  weapon('caestus', 'Caestus', 'caestus', ws('unarmed', 'brawling', 7, 'blunt', 1.4, 0.5, 12), 0.6, 8, 'none', 'Oxhide boxing thongs studded with metal. Always knocks out rather than kills.', { tags: ['knockout'] }),
  weapon('pugio', 'Pugio', 'pugio', ws('blade', 'blades', 8, 'thrust', 1.3, 0.55, 6), 0.4, 6, 'pugio', 'The broad legionary dagger. Sneak attacks ×4; the off-hand finisher.', { tags: ['dagger'] }),
  weapon('sica', 'Sica', 'sica', ws('blade', 'blades', 11, 'cut', 1.15, 0.7, 10), 0.6, 18, 'sica', 'A curved Thracian short sword that hooks round shields: it ignores a quarter of block mitigation.', { tags: ['dagger', 'hook'] }),
  weapon('gladius', 'Gladius', 'gladius', ws('blade', 'blades', 13, 'thrust', 1, 0.75, 12, { alt: { damageType: 'cut', damage: 11 } }), 1.2, 22, 'gladius', 'The Pompeii-pattern short sword: parallel edges and a short point. The all-rounder.'),
  weapon('spatha', 'Spatha', 'spatha', ws('blade', 'blades', 14, 'cut', 0.9, 0.95, 14, { alt: { damageType: 'thrust', damage: 12 } }), 1.4, 35, 'spatha', 'The long cavalry sword, made to reach down from the saddle.'),
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
  // extras
  weapon('rudis', 'Rudis', 'rudis', ws('blade', 'blades', 4, 'blunt', 1.1, 0.75, 8), 0.8, 1, 'gladius', 'A wooden practice sword — and the token of freedom given to a gladiator on his release.', { tags: ['training'] }),
  weapon('malleus', 'Malleus', 'malleus', ws('blunt', 'brawling', 16, 'blunt', 0.65, 0.9, 32, { twoHanded: true }), 5, 6, 'hammer', 'A stonemason’s sledgehammer from the building sites of Trajan’s Forum. (Extra.)', { tags: ['tool'] }),
  weapon('fax', 'Torch', 'fax', ws('blunt', 'brawling', 3, 'blunt', 1, 0.6, 4), 0.8, 2 * AS, 'torch', 'Pine splints bound with pitch. Light radius 8 m for 2 game hours; disperses rats, lights pitch, and makes you +50% visible.', { slot: 'offHand', type: 'tool', stackable: true, tags: ['light'], equipFlags: ['torch.lit'] }),
];

const AMMO: ItemDef[] = [
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

const byId = (id: string) => BASE_WEAPONS.find((w) => w.id === id)!;
const VARIANTS: ItemDef[] = [
  ...['pugio', 'sica', 'gladius', 'spatha', 'falx', 'hasta', 'lancea', 'venabulum'].map((id) => variant(byId(id), 'noric')),
  ...['pugio', 'sica', 'gladius', 'spatha'].map((id) => variant(byId(id), 'bilbilis')),
  ...['pugio', 'gladius', 'spatha'].map((id) => variant(byId(id), 'silvered')),
];

/** §8.1 uniques (v1.0). */
const UNIQUES: ItemDef[] = [
  { ...variant(byId('gladius'), 'bilbilis'), id: 'gladius-primi-pali', name: 'Gladius of the Primus Palus', latin: 'gladius primi pali', value: 600, weapon: { ...byId('gladius').weapon!, damage: 13 * 1.4, alt: { damageType: 'cut', damage: 11 * 1.4 } }, description: 'The champion of the Ludus Magnus fought a hundred bouts with this Bilbilis blade. The grip is worn to the shape of one hand.', tags: ['unique', 'bilbilis'] },
  { ...byId('falx'), id: 'falx-mucaporis', name: 'Falx of Mucapor', latin: 'falx Mucaporis', value: 400, weapon: { ...byId('falx').weapon!, damage: 24 * 1.15 }, description: 'The Dacian champion’s falx, black with age, its inner edge honed like a razor.', tags: ['unique', 'falx', 'dacian', 'hook'] },
  { ...byId('vitis'), id: 'vitis-vituli', name: 'Vitis of “Vitulus”', latin: 'vitis Vituli', value: 0, weapon: { ...byId('vitis').weapon!, damage: 11, stagger: 24 }, description: 'The rogue centurion’s vine staff. Soldiers flinch at it by habit.', tags: ['unique', 'knockout-miles', 'vitis'] },
  { ...byId('rete'), id: 'rete-nerei', name: 'Net of Nereus', latin: 'rete Nerei', value: 120, description: 'The champion retiarius’s net, weighted with lead: it entangles 1 s longer.', tags: ['unique', 'net', 'retiarius', 'entangle+1'] },
  { ...byId('pugio'), id: 'pugio-bruti', name: 'The “Dagger of Brutus”', latin: 'pugio Bruti', value: 3, description: 'Sold as the very blade of the Ides of March. The hilt is new and the blade is Gallic; a smith (Smithing 40) would laugh.', tags: ['unique', 'dagger', 'fake'] },
];

// ------------------------------------------------------------------ shields (§8.4)

const SHIELDS: ItemDef[] = [
  { id: 'scutum', name: 'Scutum', latin: 'scutum', type: 'shield', slot: 'offHand', weight: 7.5, value: 45, shield: { rating: 30, blockMitigation: 0.85, missiles: 1 }, visual: { shield: 'scutum' }, description: 'The curved rectangular shield of legionary, murmillo and secutor. Stops every missile.', icon: '▮' },
  { id: 'scutum-ovale', name: 'Oval Shield', latin: 'clipeus', type: 'shield', slot: 'offHand', weight: 6, value: 35, shield: { rating: 26, blockMitigation: 0.78, missiles: 0.9 }, visual: { shield: 'scutum-oval' }, description: 'The flat oval clipeus of auxiliaries and praetorians.', icon: '⬮' },
  { id: 'parma', name: 'Parma', latin: 'parma', type: 'shield', slot: 'offHand', weight: 3, value: 25, shield: { rating: 20, blockMitigation: 0.65, missiles: 0.7 }, visual: { shield: 'parma' }, description: 'A round shield of cavalry and hoplomachi.', icon: '●' },
  { id: 'parmula', name: 'Parmula', latin: 'parmula', type: 'shield', slot: 'offHand', weight: 2.5, value: 20, shield: { rating: 18, blockMitigation: 0.58, missiles: 0.6 }, visual: { shield: 'parmula' }, description: 'The small square shield of the thraex.', icon: '▪' },
  { id: 'galerus', name: 'Galerus', latin: 'galerus', type: 'shield', slot: 'offHand', weight: 1.2, value: 25, shield: { rating: 0, blockMitigation: 0.35, missiles: 0.2 }, visual: { shield: 'none' }, description: 'The retiarius’s raised shoulder guard. It only protects the left side.', icon: '◣', tags: ['retiarius'] },
];

// ------------------------------------------------------------------ clothing & status items (§8.2)

const CLOTHING: ItemDef[] = [
  armor('tunica', 'Tunic', 'tunica', 'body', cloth(), 0.5, 4, { garment: { kind: 'tunica', color: '#e2d6bc' } }, 'A plain belted tunic of undyed wool.'),
  armor('tunica-crassa', 'Thick Tunic', 'tunica crassa', 'body', cloth(2), 0.9, 6, { garment: { kind: 'tunica', color: '#b8a27c' } }, 'A tunic of heavy wool, good against the cold and the occasional knife.'),
  armor('toga', 'Toga', 'toga', 'cloak', cloth(), 3.5, 25, { garment: { kind: 'toga', color: '#efe8d8' } }, 'Citizens only — anyone else wearing it commits usurpatio togae. +10 persuasion with elites and officials, −5 with Subura plebs; sprinting costs 50% more and attacks are 20% slower. Required at a salutatio and in court.', { tags: ['citizen-only'], equipFlags: ['dress.toga'], equipModifiers: { 'stamina.sprintCost': -0.5 } }),
  armor('toga-fina', 'Fine Toga', 'toga pura', 'cloak', cloth(), 3.5, 80, { garment: { kind: 'toga', color: '#f5f1e6' } }, 'Fine Apulian wool, fulled to a gleam. Citizens only. As the toga.', { tags: ['citizen-only'], equipFlags: ['dress.toga'], equipModifiers: { 'stamina.sprintCost': -0.5 } }),
  armor('paenula', 'Paenula', 'paenula', 'cloak', cloth(), 1.5, 8, { garment: { kind: 'paenula', color: '#6b5236' } }, 'A hooded travelling cloak. Hooded at night, witnesses identify you only half the time; it keeps off the rain.', { equipFlags: ['hooded'] }),
  armor('sagum', 'Sagum', 'sagum', 'cloak', cloth(1), 1.8, 6, { garment: { kind: 'sagum', color: '#8a2f22' } }, 'A rectangle of heavy wool pinned at the shoulder: a soldier’s cloak and blanket.'),
  armor('lacerna', 'Lacerna', 'lacerna', 'cloak', cloth(), 0.8, 10, { garment: { kind: 'lacerna', color: '#3f5a7a' } }, 'A fashionable light cloak: +3 persuasion at the games.', { equipFlags: ['dress.lacerna'] }),
  armor('bracae', 'Bracae', 'bracae', 'legs', cloth(1), 0.6, 3, {}, 'Gallic trousers. Useful in winter, barbarous in the Forum.'),
  armor('fasciae', 'Leg Wrappings', 'fasciae', 'legs', cloth(1), 0.2, 1, {}, 'Wool bands wound round the shins.'),
  armor('caligae', 'Caligae', 'caligae', 'feet', cloth(1), 1, 5, {}, 'Hobnailed military boots: footsteps 20% louder on stone.', { equipFlags: ['hobnails'] }),
  armor('calcei', 'Calcei', 'calcei', 'feet', cloth(), 0.6, 4, {}, 'Closed leather shoes, worn with the toga.'),
  armor('soleae', 'Soleae', 'soleae', 'feet', cloth(), 0.3, 1, {}, 'Indoor sandals. In the street: −5 persuasion with elites.', { equipFlags: ['dress.soleae'] }),
  armor('carbatinae', 'Carbatinae', 'carbatinae', 'feet', cloth(), 0.5, 1, {}, 'Rustic one-piece leather shoes.'),
  armor('cucullus', 'Hood', 'cucullus', 'head', cloth(), 0.2, 1, {}, 'A loose hood: as the paenula’s, witnesses identify you only half the time at night.', { equipFlags: ['hooded'] }),
  armor('petasus', 'Petasus', 'petasus', 'head', cloth(1), 0.2, 1, {}, 'A broad-brimmed sun hat for travellers.'),
  // extras
  armor('tunica-linea', 'Linen Tunic', 'tunica linea', 'body', cloth(), 0.4, 12, { garment: { kind: 'tunica', color: '#ece3cf' } }, 'Fine Egyptian linen, cool in the Roman summer. (Extra.)'),
  armor('tunica-longa', 'Long Tunic', 'tunica talaris', 'body', cloth(), 0.7, 5, { garment: { kind: 'tunica-long', color: '#b98f5e' } }, 'An ankle-length tunic in the eastern fashion. (Extra.)'),
  armor('stola', 'Stola', 'stola', 'body', cloth(), 1, 30, { garment: { kind: 'stola', color: '#7d5a7a' } }, 'The long overdress of a respectable married woman. (Extra.)'),
  armor('palla', 'Palla', 'palla', 'cloak', cloth(), 1, 15, { garment: { kind: 'palla', color: '#5e6f4a' } }, 'A woman’s mantle, drawn over the head at sacrifice. (Extra.)'),
  armor('pallium', 'Pallium', 'pallium', 'cloak', cloth(), 1.2, 10, { garment: { kind: 'lacerna', color: '#a5916c' } }, 'The Greek mantle of philosophers and physicians. (Extra.)'),
  armor('pileus', 'Pileus', 'pileus', 'head', cloth(), 0.2, 1, { armor: { helmet: { kind: 'pileus' } } }, 'A conical felt cap, worn at manumission. (Extra.)'),
];

const JEWELLERY: ItemDef[] = [
  { id: 'fascinum', name: 'Fascinum', latin: 'fascinum', type: 'misc', slot: 'neck', weight: 0.05, value: 2, icon: '◎', equipFlags: ['amulet'], description: 'A small bronze phallic charm. Amulets negate curse tablets and halve the chance of a bad daily omen.' },
  { id: 'bulla', name: 'Golden Bulla', latin: 'bulla aurea', type: 'misc', slot: 'neck', weight: 0.05, value: 25, icon: '◎', equipFlags: ['amulet'], description: 'The locket a freeborn boy wears until he takes the toga of manhood. As an amulet, it negates curse tablets.' },
  { id: 'lunula', name: 'Lunula', latin: 'lunula', type: 'misc', slot: 'neck', weight: 0.05, value: 10, icon: '◎', equipFlags: ['amulet'], description: 'A crescent-moon pendant worn by girls and women against the evil eye.' },
  { id: 'anulus-aureus', name: 'Gold Ring', latin: 'anulus aureus', type: 'misc', slot: 'finger', weight: 0.01, value: 50, icon: '○', equipFlags: ['dress.anulus-aureus'], description: 'The gold ring of the equestrian order: equites only (otherwise a crime). +10 persuasion with elites.' },
  { id: 'anulus-signatorius', name: 'Signet Ring', latin: 'anulus signatorius', type: 'misc', slot: 'finger', weight: 0.01, value: 5, icon: '○', description: 'An iron ring with a carnelian intaglio for sealing letters. It can be copied (the Forger perk).' },
  // extras
  { id: 'nodus-isidis', name: 'Knot of Isis', latin: 'nodus Isiacus', type: 'misc', slot: 'neck', weight: 0.02, value: 15, icon: '◎', equipFlags: ['amulet'], description: 'A faience tyet amulet from the Iseum Campense. (Extra.)' },
  { id: 'torques', name: 'Gold Torc', latin: 'torques', type: 'misc', weight: 0.4, value: 120, icon: '◎', tags: ['valuable'], description: 'A twisted gold neck ring taken from a Gaul or a Dacian — loot, not jewellery for a Roman. (Extra.)' },
];

// ------------------------------------------------------------------ armor (§8.3)

const ARMOR: ItemDef[] = [
  armor('subarmalis', 'Subarmalis', 'subarmalis', 'body', light(10, 'padded'), 3, 20, { armor: { body: { kind: 'padded' } } }, 'A padded linen jerkin, worn alone or under mail.'),
  armor('thorax-coriaceus', 'Leather Cuirass', 'thorax coriaceus', 'body', light(14, 'padded'), 5, 35, { armor: { body: { kind: 'leather' } } }, 'Hardened oxhide shaped to the chest.'),
  armor('cardiophylax', 'Cardiophylax', 'cardiophylax', 'body', light(10, 'padded'), 2, 30, { armor: { body: { kind: 'padded' } } }, 'The provocator’s small chest plate on a padded harness.'),
  armor('lorica-hamata', 'Mail Shirt', 'lorica hamata', 'body', heavy(30, 'mail'), 9, 190, { armor: { body: { kind: 'lorica-hamata', metal: 'iron' } } }, 'Thousands of riveted iron rings: heavy on the shoulders, kind to the ribs.'),
  armor('lorica-squamata', 'Scale Shirt', 'lorica squamata', 'body', heavy(32, 'mail'), 10, 220, { armor: { body: { kind: 'lorica-squamata', metal: 'bronze' } } }, 'Bronze scales wired to a linen backing.'),
  armor('lorica-segmentata', 'Lorica Segmentata', 'lorica segmentata', 'body', heavy(38, 'plate'), 8.5, 260, { armor: { body: { kind: 'lorica-segmentata', metal: 'iron' } } }, 'Segmented iron plate of the Corbridge type, as on Trajan’s Column. Military issue: 390 den. on the black market.', { tags: ['military'] }),
  armor('thorax-musculus', 'Muscle Cuirass', 'thorax', 'body', heavy(34, 'plate'), 9, 320, { armor: { body: { kind: 'lorica-segmentata', metal: 'bronze' } } }, 'A bronze cuirass modelled on a hero’s torso, for officers.'),
  armor('galea-gallica', 'Imperial Gallic Helmet', 'galea', 'head', heavy(12), 1.8, 60, { armor: { helmet: { kind: 'imperial-gallic', metal: 'iron' } } }, 'An iron helmet with a deep neck guard and embossed brows.'),
  armor('galea-italica', 'Imperial Italic Helmet', 'galea', 'head', heavy(11), 1.9, 55, { armor: { helmet: { kind: 'imperial-italic', metal: 'bronze' } } }, 'A bronze helmet from Italian workshops.'),
  armor('galea-cruciata', 'Cross-braced Gallic Helmet', 'galea', 'head', heavy(14), 2.1, 80, { armor: { helmet: { kind: 'imperial-gallic', metal: 'iron' } } }, 'A Gallic helmet with iron cross-braces added in the Dacian wars, after the falx split too many skulls.'),
  armor('galea-attica', 'Praetorian Helmet', 'galea Attica', 'head', heavy(12), 2, 150, { armor: { helmet: { kind: 'praetorian-attic', crest: '#9b1c1c', metal: 'gilded' } } }, 'The Guard’s crested Attic-style helmet.'),
  armor('galea-murmillonis', 'Murmillo Helmet', 'galea murmillonis', 'head', heavy(14), 3.5, 90, { armor: { helmet: { kind: 'murmillo', metal: 'bronze' } } }, 'Broad brim and tall crest; a grille visor narrows your view.', { equipFlags: ['visor.medium'] }),
  armor('galea-thraecis', 'Thraex Helmet', 'galea thraecis', 'head', heavy(13), 3.3, 90, { armor: { helmet: { kind: 'thraex', metal: 'bronze' } } }, 'A griffin-crested helmet with a grille visor.', { equipFlags: ['visor.medium'] }),
  armor('galea-secutoris', 'Secutor Helmet', 'galea secutoris', 'head', heavy(16), 3.8, 90, { armor: { helmet: { kind: 'secutor', metal: 'bronze' } } }, 'A smooth egg of bronze with two eyeholes: no net can catch it, and you see very little.', { equipFlags: ['visor.strong', 'net.proof'] }),
  armor('galea-hoplomachi', 'Hoplomachus Helmet', 'galea hoplomachi', 'head', heavy(13), 3.3, 85, { armor: { helmet: { kind: 'hoplomachus', metal: 'bronze' } } }, 'A Greek-style gladiator’s helmet with a feathered crest.', { equipFlags: ['visor.medium'] }),
  armor('galea-provocatoris', 'Provocator Helmet', 'galea provocatoris', 'head', heavy(13), 3.2, 80, { armor: { helmet: { kind: 'provocator', metal: 'bronze' } } }, 'A visored helmet with a neck guard, like a legionary’s.', { equipFlags: ['visor.medium'] }),
  armor('galea-equitis', 'Eques Helmet', 'galea equitis', 'head', heavy(12), 2.8, 80, { armor: { helmet: { kind: 'imperial-italic', metal: 'bronze' } } }, 'A brimmed visored helmet for the mounted gladiator.', { equipFlags: ['visor.medium'] }),
  armor('manica-linea', 'Linen Manica', 'manica linea', 'hands', light(4), 1, 15, { armor: { manica: 'right' } }, 'A quilted linen arm guard.', { tags: ['manica'] }),
  armor('manica-ferrea', 'Iron Manica', 'manica ferrea', 'hands', heavy(7), 2, 60, { armor: { manica: 'right' } }, 'A segmented iron arm guard of the kind the Dacian falx made necessary.', { tags: ['manica'] }),
  armor('manica-thraecis-aurata', 'Gilded Thraex Manica', 'manica aurata', 'hands', light(9), 1.2, 160, { armor: { manica: 'right' } }, 'A famous thraex’s gilded arm guard.', { tags: ['manica', 'unique'] }),
  armor('ocrea', 'Greave', 'ocrea', 'legs', light(3), 0.8, 18, { armor: { greaves: 'left' } }, 'A single bronze greave, gladiator fashion.'),
  armor('ocreae', 'High Greaves', 'ocreae', 'legs', light(6), 1.8, 40, { armor: { greaves: 'both' } }, 'A pair of high bronze greaves.'),
];

// ------------------------------------------------------------------ food & drink, remedies, poisons (§8.5)

const FOOD: ItemDef[] = [
  food('panis', 'Bread', 'panis', 0.33, AS, [hot(8, 8)], 'A one-libra loaf scored into eight wedges.'),
  food('puls', 'Puls', 'puls', 0.5, AS, [hot(12, 8), stam(10)], 'A bowl of spelt porridge.'),
  food('caseus', 'Cheese', 'caseus', 0.3, 2 * AS, [hot(6, 8)], 'A portion of hard smoked cheese.'),
  food('olivae', 'Olives', 'olivae', 0.3, 3 * AS, [hot(4, 8)], 'A small jar of brined olives.'),
  food('ficus', 'Dried Figs', 'ficus aridae', 0.2, 2 * AS, [hot(4, 8)], 'A bag of dried figs (or dates).', ['food', 'fig']),
  food('botulus', 'Sausage', 'botulus', 0.3, 2 * AS, [hot(15, 10)], 'A smoked pork sausage.'),
  food('patina', 'Garum Dish', 'patina', 0.5, 8 * AS, [hot(20, 10), { kind: 'modifier', target: 'stamina.regen', amount: 0.1, duration: 15 }], 'Something baked with fish sauce — Romans put garum on everything.'),
  food('cena', 'Full Dinner', 'cena', 1.5, 3, [hot(40, 20), cond('satur')], 'A full dinner at a good caupona: from the egg to the apples.'),
  food('libum', 'Honey Cake', 'libum', 0.1, AS, [{ kind: 'restore', target: 'health', amount: 5 }], 'A honey cake — the standard small offering.', ['food', 'offering']),
  food('mel', 'Honey', 'mel', 0.3, 6 * AS, [{ kind: 'restore', target: 'health', amount: 5 }], 'A small jar of thyme honey.', ['food', 'ingredient']),
  food('aqua', 'Water', 'aqua', 0.5, 0, [stam(5)], 'Water from a street fountain (lacus): free, and it partly washes off the grime.', ['drink', 'water']),
  food('posca', 'Posca', 'posca', 0.6, AS, [stam(30), { kind: 'modifier', target: 'stamina.regen', amount: 0.2, duration: 60 }], 'Sour wine cut with water: the soldier’s drink.', ['drink']),
  food('vinum', 'House Wine', 'vinum', 0.25, AS, [stam(15), cond('ebrius')], 'A cup of house wine. “Here you drink for an as.”', ['drink', 'wine']),
  food('vinum-melius', 'Better Wine', 'vinum melius', 0.25, 2 * AS, [stam(20), cond('ebrius')], 'A cup of better wine: “give two and you’ll drink better.”', ['drink', 'wine']),
  food('vinum-falernum', 'Falernian', 'vinum Falernum', 0.25, 4 * AS, [stam(25), cond('ebrius'), { kind: 'fortify', target: 'rhetoric', amount: 5, duration: 120 }], 'A cup of Falernian: “give four and you’ll drink Falernian.” +5 Rhetoric for 120 s.', ['drink', 'wine']),
  food('mulsum', 'Mulsum', 'mulsum', 0.25, 2 * AS, [stam(20), cond('ebrius')], 'Wine sweetened with honey.', ['drink', 'wine']),
];

const REMEDIES: ItemDef[] = [
  remedy('fascia', 'Bandage', 'fascia', 0.05, 2 * AS, [hot(25, 5), { kind: 'cure', target: 'injury:cruentus', amount: 1 }], 'A roll of clean linen: +25 health over 5 s; stops bleeding.', ['bandage']),
  remedy('emplastrum', 'Poultice', 'emplastrum', 0.1, 4 * AS, [hot(40, 10)], 'A plaster of herbs and honey: +40 health over 10 s.'),
  remedy('collyrium', 'Eye Salve', 'collyrium', 0.05, 4 * AS, [{ kind: 'cure', target: 'state:caecatus', amount: 1 }], 'A stick of eye salve stamped with the oculist’s name. Cures blindness from sand or smoke.'),
  remedy('theriaca', 'Theriac', 'theriaca', 0.15, 15, [{ kind: 'cure', target: 'poison', amount: 1 }, { kind: 'flag', target: 'poison.resist', amount: 1, duration: 180 }], 'Andromachus’ antidote of sixty-four ingredients (also sold as Mithridatium): cures poison and halves it for a game hour.'),
  remedy('febrifugum', 'Fever Draught', 'febrifugum', 0.2, 2, [{ kind: 'cure', target: 'disease:febris', amount: 1 }], 'A bitter draught of willow and wormwood. Cures the fever.'),
  remedy('soporificum', 'Soporific', 'soporificum', 0.1, 10, [], 'Poppy and mandragora, to coat a weapon: for 3 hits, a struck target up to elite collapses after 3 s.', ['weapon-coating']),
];

const INGREDIENTS: ItemDef[] = [
  ...[
    ['papaver', 'Poppy', 'papaver', 8 * AS, 'Dried poppy heads, scored for their milk.'],
    ['mandragora', 'Mandrake', 'mandragora', 2, 'A forked root given before surgery.'],
    ['allium', 'Garlic', 'allium', AS, 'Pliny lists sixty-one remedies made from garlic.'],
    ['acetum', 'Vinegar', 'acetum', AS, 'Sour wine vinegar — the base of posca and of many remedies.'],
    ['myrrha', 'Myrrh', 'myrrha', 2, 'Arabian resin for wounds and embalming.'],
    ['absinthium', 'Wormwood', 'absinthium', 4 * AS, 'Steeped in wine against worms and sea-sickness.'],
    ['helleborus', 'Hellebore', 'helleborus', 8 * AS, 'Black hellebore: a purge for madness, a poison for the careless.'],
    ['ruta', 'Rue', 'ruta', 4 * AS, 'A bitter herb against poison and the evil eye.'],
    ['salvia', 'Sage', 'salvia', 2 * AS, 'Sage, for the throat and for wounds.'],
  ].map(([id, name, latin, value, desc]) => misc(id as string, name as string, latin as string, 0.05, value as number, desc as string, { type: 'ingredient', tags: ['herb'] })),
  misc('tus', 'Incense', 'tus', 0.05, AS, 'A pinch of Arabian frankincense, burned at every altar in Rome (a box costs 1 den.).', { type: 'ingredient', tags: ['offering', 'herb'] }),
  misc('aconitum', 'Aconite', 'aconitum', 0.05, 3, 'Wolfsbane: 4 damage a second for 10 s.', { type: 'ingredient', tags: ['poison'] }),
  misc('cicuta', 'Hemlock', 'cicuta', 0.05, 2, 'The Athenian poison: halves stamina regeneration for 60 s.', { type: 'ingredient', tags: ['poison'] }),
  misc('taxus', 'Yew', 'taxus', 0.05, 2, 'Yew needles: 2 damage a second for 30 s.', { type: 'ingredient', tags: ['poison'] }),
];

// ------------------------------------------------------------------ tools, misc goods, coins, keys (§8.5–8.6)

const TOOLS: ItemDef[] = [
  { id: 'hamulus', name: 'Lockpick', latin: 'hamulus', type: 'tool', weight: 0.02, value: 1, stackable: true, icon: '⌐', tags: ['lockpick'], description: 'A bent bronze pick. Owning one is not a crime; being found with one at night is a conversation.' },
  { id: 'instrumentum-fabri', name: 'Repair Kit', latin: 'instrumentum fabri', type: 'tool', weight: 1.5, value: 8, stackable: true, icon: '⚒', tags: ['repair-kit'], description: 'Rivets, wire, whetstone and leather: +25% condition in the field (needs the Armorer of the Legion perk).' },
  { id: 'lucerna', name: 'Clay Lamp', latin: 'lucerna', type: 'tool', weight: 0.3, value: AS, stackable: true, icon: '🪔', tags: ['light'], description: 'A mould-made clay lamp for interiors and for the lararium.' },
  { id: 'tabula-cerata', name: 'Wax Tablet', latin: 'tabula cerata', type: 'misc', weight: 0.3, value: 3 * AS, stackable: true, icon: '▭', description: 'Two leaves of black wax with a stylus: notes, forged messages, quest letters.' },
  misc('stilus', 'Stylus', 'stilus', 0.02, AS, 'A bronze stylus: one end to write, the other to erase.'),
  misc('cera-signatoria', 'Sealing Wax', 'cera signatoria', 0.05, 2 * AS, 'Red sealing wax, for resealing letters (Locks & Seals).'),
  misc('defixio', 'Curse Tablet', 'defixio', 0.2, 2 * AS, 'A blank lead sheet. Inscribe it, nail it and deposit it at a grave, well or spring. It harms only a target who learns of it.', { tags: ['curse'] }),
  misc('clavus', 'Nail', 'clavus', 0.02, AS, 'An iron nail, to pierce a curse tablet.', { tags: ['curse'] }),
  misc('tabella-votiva', 'Votive Tablet', 'tabella votiva', 0.2, 0, 'A little bronze tablet for a temple wall: V·S·L·M, votum solvit libens merito, “paid the vow, willingly and deservedly”. Given when you pay a vow (§14.6).'),
  misc('tessera-frumentaria', 'Grain Token', 'tessera frumentaria', 0.01, 25, 'A lead token for the monthly grain dole at the Porticus Minucia. Worth 25 den. on the black market.'),
  misc('tessera-theatralis', 'Theatre Token', 'tessera theatralis', 0.01, AS, 'A bone token for a seat at the theatre.'),
  misc('tali', 'Knucklebones', 'tali', 0.05, 4 * AS, 'Four sheep’s knucklebones. Dice games are illegal outside the Saturnalia.'),
  misc('fritillus', 'Dice Cup', 'fritillus', 0.1, 4 * AS, 'A turned-wood dice cup.'),
  misc('piper', 'Black Pepper', 'piper nigrum', 0.33, 4, 'A libra of black pepper from India, stored in the Horrea Piperataria.', { tags: ['valuable', 'spice'] }),
  misc('piper-album', 'White Pepper', 'piper album', 0.33, 7, 'A libra of white pepper.', { tags: ['valuable', 'spice'] }),
  misc('piper-longum', 'Long Pepper', 'piper longum', 0.33, 15, 'A libra of long pepper, the dearest kind (Pliny NH 12.28).', { tags: ['valuable', 'spice'] }),
  misc('argentum', 'Silver Plate', 'argentum', 0.6, 40, 'A silver dish chased with olive branches.', { tags: ['valuable'] }),
  misc('vasa-arretina', 'Arretine Ware', 'vasa Arretina', 0.6, 2, 'Glossy red Arretine bowls stamped with the potter’s name.', { tags: ['valuable'] }),
  misc('vitrum', 'Glass Beaker', 'vitrum', 0.3, 3, 'Blown glass, clear as water.', { tags: ['valuable'] }),
  misc('purpura', 'Tyrian Purple', 'purpura', 0.1, 100, 'A vial of dye from ten thousand murex snails.', { tags: ['valuable', 'luxury'] }),
  misc('diploma', 'Discharge Diploma', 'diploma militare', 0.1, 0, 'Two bronze tablets, wired shut and witnessed by seven, granting a veteran citizenship and the right to marry.', { tags: ['keepsake', 'document'] }),
  misc('gemma', 'Carnelian Gem', 'gemma', 0.01, 30, 'A carnelian cut with a tiny Fortuna. (Extra.)', { tags: ['valuable'] }),
  misc('tessera-collegii', 'Collegium Token', 'tessera collegii', 0.02, 4 * AS, 'A bronze token of a trade club, stamped with its patron god. A pass to its back rooms.', { tags: ['token'] }),
  misc('tabula-stipendii', 'Pay Tablet', 'tabula stipendii', 0.1, 2, 'A soldier’s pay record with the deductions: hay, boots, the burial club, the camp Saturnalia.', { tags: ['document'] }),
  misc('epistula-signata', 'Sealed Letter', 'epistula signata', 0.05, 0, 'A sealed letter from a dead man’s purse. Someone will want it back.', { tags: ['document', 'quest-lead'] }),
  misc('nugae', 'Stolen Trinket', 'nugae', 0.05, 3, 'A pretty thing someone else paid for: a hairpin, a bronze mirror, a cheap ring.', { tags: ['valuable'] }),
  misc('corium', 'Hide', 'corium', 1.5, 2, 'A tanned hide. (Extra.)'),
  misc('ferrum', 'Iron Bar', 'ferrum', 2, 2, 'Wrought iron for the forge.', { tags: ['metal'] }),
  // Coins convert to denarii when picked up (§7.1).
  misc('aureus', 'Aureus', 'aureus', 0.007, 25, 'A gold aureus of Trajan: 25 denarii.', { tags: ['coin'] }),
  misc('denarius-columnae', 'New Denarius', 'denarius', 0.003, 1, 'A new denarius showing the Column.', { tags: ['coin'] }),
  misc('dupondius-domitiani', 'Worn Dupondius', 'dupondius', 0.013, 2 * AS, 'A worn dupondius of Domitian.', { tags: ['coin'] }),
];

// ------------------------------------------------------------------ books (§8.6) and curse tablets

const BOOKS: ItemDef[] = [
  book('liber-celsus', 'Celsus, On Medicine', 'De Medicina', 5, 'medicina', 'Aulus Cornelius Celsus’ encyclopaedia of medicine, in clear Latin.', 'Medicine should be rational, but should draw its instruction from evident causes.\n\nThe surgeon should be youthful or at any rate nearer youth than age, with a strong and steady hand that never trembles, and be no less quick with the left hand than with the right.'),
  book('liber-dioscorides', 'Dioscorides, On Medical Materials', 'De Materia Medica', 5, 'medicina', 'A Greek army doctor’s catalogue of six hundred plants and what they do.', 'Poppy: the juice, drunk in the amount of a bitter vetch, relieves pain, induces sleep and helps digestion. Taken in excess it brings lethargy, and kills.\n\nMandragora root, steeped in wine, is given to those who cannot sleep, and to those who are to be cut or burned, so they will not feel it.', ['greek']),
  book('liber-scribonius', 'Scribonius Largus, Compositions', 'Compositiones', 5, 'medicina', 'The court physician of Claudius on compound remedies.', 'For pain of the head: the live black torpedo-fish, placed on the spot that hurts, until the pain ceases and the part grows numb.\n\nA physician must be full of mercy and humanity, as the will of medicine itself requires.'),
  book('liber-strategemata', 'Frontinus, Strategemata', 'Strategemata', 5, 'shield', 'Sextus Julius Frontinus, three times consul, on the stratagems of famous generals.', 'Since I alone of those interested in military science have undertaken to reduce its rules to system… I deem it a duty to collect the adroit operations of generals, which the Greeks embrace under the one name strategemata.\n\nWhen the line holds and the shields lock, the enemy wears himself out on them.'),
  book('liber-onasander', 'Onasander, The General', 'Strategikos', 5, 'blades', 'A Greek handbook on generalship, dedicated to a Roman consul.', 'The general should be chosen as temperate, self-restrained, vigilant, frugal, hardened to labour, alert, free from avarice, neither too young nor too old.\n\nA man who strikes from behind his shield and recovers it at once outlives a braver man who does not.', ['greek']),
  book('liber-vitruvius', 'Vitruvius, On Architecture', 'De Architectura', 5, 'fabrica', 'Vitruvius’ ten books, including the machines of Book X.', 'All these must be built with due reference to durability, convenience and beauty — firmitas, utilitas, venustas.\n\nA machine is a combination of timber fastened together, chiefly efficacious in moving great weights.'),
  book('liber-aquaeductu', 'Frontinus, On the Aqueducts', 'De Aquaeductu', 5, 'fabrica', 'The water commissioner’s report on the aqueducts of Rome, AD 97.', 'With such an array of indispensable structures carrying so many waters, compare, if you will, the idle Pyramids or the useless, though famous, works of the Greeks!\n\nThe water-men tap the pipes and sell what is the people’s; the fraud is old and the cure is inspection.'),
  book('liber-martialis', 'Martial, Epigrams I', 'Epigrammata', 5, 'rhetoric', 'A fine copy of Martial’s first book, from the very shop it advertises.', 'You who want to have my little books with you everywhere… buy this one, which parchment confines in small pages.\n\nYou ask where I am sold? Atrectus’ shop in the Argiletum, opposite the Forum of Caesar: from the first or second shelf he will hand you a Martial, polished with pumice and decked in purple, for five denarii.'),
  book('liber-plinii-epistulae', 'Pliny, Letters', 'Epistulae', 5, 'rhetoric', 'The younger Pliny’s polished letters, books I–IX.', 'You often urge me to collect and publish the more carefully written of my letters. I have collected them, not keeping to the order of time.\n\nAn advocate should be brief only when the case allows it; the judge must be given time to be persuaded.'),
  book('liber-columella', 'Columella, On Agriculture', 'De Re Rustica', 5, 'mercatura', 'A Spanish landowner’s hard-headed book on estates, prices and profit.', 'The master who buys land must buy it with his eyes open: a field that does not pay its keep is a debt with a view.\n\nNothing is cheaper than what you do not need to buy.'),
  book('liber-fasti', 'Ovid, Fasti', 'Fasti', 5, 'religio', 'Ovid’s poem on the Roman calendar and its rites.', 'When midnight has come and lends silence to sleep… he rises, his feet bare, and throws black beans behind him, saying: “These I give; with these beans I redeem me and mine.”\n\nNine times he says it without looking back.'),
  book('liber-naturalis-28', 'Pliny the Elder, Natural History XXVIII', 'Naturalis Historia', 5, 'religio', 'Book 28 of the Natural History: remedies, words and rites.', 'Have words and formal incantations any power? The wisest men reject the belief, yet in our lives as a body we believe it at every hour, though we do not feel it.\n\nIt is thought that without a prayer it is useless to sacrifice.'),
  book('liber-xenophon-equitandi', 'Xenophon, On Horsemanship', 'De Re Equestri', 5, 'equitatio', 'An Athenian cavalry officer on choosing and riding horses.', 'Never deal with a horse in a fit of temper. Anger is a thing that has no forethought.\n\nWhat a horse does under compulsion he does without understanding, and there is no beauty in it.', ['greek']),
  book('liber-commentarii-doctoris', 'Commentarii Doctoris', 'Commentarii Doctoris', 1, 'spear', 'A gladiator trainer’s notes from the Ludus Magnus (fictional).', 'I. The tiro trains at the palus until his arm can no longer lift the wooden sword. Then he trains more.\n\nII. With the spear, keep the point between his eyes and your feet behind it. A spear that wanders is a spear for the enemy.'),
  // extras
  book('liber-quintiliani', 'Quintilian, Institutio Oratoria XII', 'Institutio Oratoria', 5, 'rhetoric', 'The last book of Quintilian’s education of the orator. (Extra.)', 'Let the orator, then, whom I am forming be such as is defined by Marcus Cato: a good man, skilled in speaking — vir bonus dicendi peritus.\n\nIt is feeling and force of imagination that make us eloquent.'),
  book('liber-amores', 'Ovid, Amores I', 'Amores', 1, 'locks-seals', 'Ovid’s love elegies, including the locked-out lover’s plea to the doorkeeper. (Extra.)', 'Doorkeeper — shameful! — bound by a hard chain, swing on its hinge the stubborn door.\n\nI ask for little: let the door open a crack, so that I can slip through sideways.'),
  book('liber-satyricon', 'Petronius, Satyricon (fragment)', 'Satyricon', 1, 'pickpocket', 'A scandalous half-burned novel of thieves and freedmen. (Extra.)', '…and while everyone stared at the roast boar, Ascyltos slipped a silver cup into the fold of his toga, and I a napkin full of cakes.\n\nTrimalchio, who had been a slave himself, was too busy counting his estates to notice.'),
  book('liber-cynegeticus', 'Xenophon, On Hunting', 'Cynegeticus', 5, 'archery', 'An Athenian’s advice on hounds, nets and the hunting bow. (Extra.)', 'The hare runs in circles and returns to its form; set your nets where it began.\n\nThe young man who hunts learns to bear cold and heat, and to aim true when his breath is short.', ['greek']),
  book('liber-res-gestae', 'The Deeds of the Divine Augustus', 'Res Gestae Divi Augusti', 1, undefined, 'A copy of the inscription on Augustus’ mausoleum. (Extra.)', 'In my sixth consulship I restored eighty-two temples of the gods in the city, neglecting none that needed repair at that time.\n\nThe doors of Janus Quirinus, which our ancestors ordered closed whenever there was peace by land and sea, were closed three times while I was princeps.'),
  { id: 'defixio-prasina', name: 'Curse Tablet against the Greens', latin: 'defixio', type: 'book', weight: 0.2, value: 1, icon: '✠', tags: ['curse'], description: 'A folded lead tablet pierced by a nail, scratched with a curse on the Green team. (Extra.)', text: 'I adjure you, demon, whoever you are: from this hour, this day, this moment, bind the horses of the Green and their driver. Bind their legs, their running, their victory. Now, now, quickly, quickly!' },
  { id: 'defixio-furtum', name: 'Curse Tablet against a Bath Thief', latin: 'defixio', type: 'book', weight: 0.2, value: 1, icon: '✠', tags: ['curse'], description: 'A plea to Mercury to punish whoever stole a cloak at the baths. (Extra.)', text: 'To the god Mercury I give the one who stole my hooded cloak, whether man or woman, slave or free. Let him not sleep, nor eat, nor drink, nor sit, nor lie, until he brings it to your temple.' },
];

export const ITEMS: ItemDef[] = [
  ...BASE_WEAPONS,
  ...VARIANTS,
  ...UNIQUES,
  ...AMMO,
  ...SHIELDS,
  ...CLOTHING,
  ...JEWELLERY,
  ...ARMOR,
  ...FOOD,
  ...REMEDIES,
  ...INGREDIENTS,
  ...TOOLS,
  ...BOOKS,
];
