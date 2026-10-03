/**
 * PROVISIONAL item catalogue (GDD/CONTENT pending): ~140 Roman items of AD 113.
 *
 * Prices: `value` is a fair retail price in denarii (1 d = 4 sestertii = 16 asses). Anchors: a
 * legionary earned 300 d a year; a loaf cost 2 asses; a cup of ordinary wine 1–2 asses and of
 * Falernian 4 asses (Pompeii graffiti); a tunic a few denarii. Arms and armor are priced for play
 * (tens to hundreds) rather than strict history. Weights are real kilograms.
 *
 * Weapon damage is on a Skyrim-like scale (gladius 8 ≈ steel sword); see combat-math.ts.
 */
import type { ArmorStats, Effect, ItemDef, WeaponStats } from '../types';

const AS = 1 / 16;

// ------------------------------------------------------------------ builders

function weapon(id: string, name: string, latin: string, w: WeaponStats, weight: number, value: number, model: NonNullable<ItemDef['visual']>['weapon'], description: string, extra: Partial<ItemDef> = {}): ItemDef {
  const thrown = w.class === 'thrown';
  return { id, name, latin, type: 'weapon', slot: 'mainHand', weapon: w, weight, value, description, visual: { weapon: model }, stackable: thrown, icon: '⚔', ...extra };
}
const blade = (damage: number, speed: number, reach: number, stagger: number, twoHanded = false): WeaponStats => ({ class: 'blade', skill: 'blades', damage, speed, reach, stagger, twoHanded });
const spear = (damage: number, speed: number, reach: number, stagger: number, twoHanded = false): WeaponStats => ({ class: 'spear', skill: 'spear', damage, speed, reach, stagger, twoHanded });
const blunt = (damage: number, speed: number, reach: number, stagger: number, twoHanded = false): WeaponStats => ({ class: 'blunt', skill: 'blunt', damage, speed, reach, stagger, twoHanded });

function armor(id: string, name: string, latin: string, slot: ItemDef['slot'], a: ArmorStats, weight: number, value: number, look: NonNullable<ItemDef['visual']>, description: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: a.weightClass === 'clothing' ? 'clothing' : 'armor', slot, armor: a, weight, value, description, visual: look, icon: a.weightClass === 'clothing' ? '👕' : '🛡', ...extra };
}
const heavy = (rating: number): ArmorStats => ({ rating, weightClass: 'heavy' });
const light = (rating: number): ArmorStats => ({ rating, weightClass: 'light' });
const cloth = (rating = 0): ArmorStats => ({ rating, weightClass: 'clothing' });

function food(id: string, name: string, latin: string, weight: number, value: number, effects: Effect[], description: string, tags: string[] = ['food']): ItemDef {
  return { id, name, latin, type: 'consumable', weight, value, effects, description, stackable: true, icon: tags.includes('drink') ? '🍷' : '🍞', tags };
}
function medicine(id: string, name: string, latin: string, weight: number, value: number, effects: Effect[], description: string): ItemDef {
  return { id, name, latin, type: 'consumable', weight, value, effects, description, stackable: true, icon: '⚱', tags: ['medicine'] };
}
const heal = (amount: number): Effect => ({ kind: 'restore', target: 'health', amount });
const rest = (amount: number): Effect => ({ kind: 'restore', target: 'stamina', amount });
const regen = (target: string, amount: number, duration: number): Effect => ({ kind: 'regen', target, amount, duration });

function book(id: string, name: string, latin: string, value: number, text: string, description: string, teaches?: string, weight = 0.4): ItemDef {
  return { id, name, latin, type: 'book', weight, value, text, teaches, description, icon: '📜', stackable: true };
}
function misc(id: string, name: string, latin: string, weight: number, value: number, description: string, extra: Partial<ItemDef> = {}): ItemDef {
  return { id, name, latin, type: 'misc', weight, value, description, stackable: true, icon: '◆', ...extra };
}

// ------------------------------------------------------------------ weapons

const WEAPONS: ItemDef[] = [
  weapon('pugio', 'Pugio', 'pugio', blade(5, 1.3, 0.8, 0.1), 0.4, 6, 'pugio', 'A broad-bladed legionary dagger. Every soldier carries one; so does every cutthroat.', { tags: ['dagger'] }),
  weapon('sica', 'Sica', 'sica', blade(6, 1.25, 0.85, 0.15), 0.6, 12, 'sica', 'A short curved Thracian blade, favoured by the thraex in the arena and by assassins outside it.', { tags: ['dagger'] }),
  weapon('gladius_rusty', 'Worn Gladius', 'gladius vetus', blade(6, 1, 1.05, 0.3), 1.2, 4, 'gladius', 'A pitted short sword that has seen better legions.'),
  weapon('gladius', 'Gladius', 'gladius', blade(8, 1, 1.05, 0.3), 1.2, 20, 'gladius', 'The Pompeii-pattern short sword of the legions: parallel edges, a short point, made for thrusting from behind a shield.'),
  weapon('gladius_mainz', 'Gladius Hispaniensis', 'gladius Hispaniensis', blade(9, 0.95, 1.1, 0.35), 1.4, 28, 'gladius', 'An older, longer pattern with a wasp-waisted blade and a long tapering point.'),
  weapon('gladius_noric', 'Noric Steel Gladius', 'gladius Noricus', blade(10, 1, 1.05, 0.35), 1.2, 90, 'gladius', 'Forged from the famous hard steel of Noricum. It holds an edge through a whole campaign.'),
  weapon('gladius_tribuni', 'Tribune’s Gladius', 'gladius tribunicius', blade(11, 1.05, 1.05, 0.35), 1.1, 240, 'gladius', 'Noric steel with an ivory grip and a silvered scabbard, carried by a young man of good family on his first command.'),
  weapon('spatha', 'Spatha', 'spatha', blade(9, 0.9, 1.25, 0.4), 1.6, 45, 'spatha', 'The long sword of the auxiliary cavalry, made to reach down from the saddle.'),
  weapon('falx', 'Dacian Falx', 'falx Dacica', blade(17, 0.75, 1.4, 0.85, true), 3, 120, 'spatha', 'A two-handed inward-curved blade that could split a helmet. Trajan’s legionaries added greaves and arm guards because of it.', { tags: ['dacian', 'trophy'] }),
  weapon('rudis', 'Rudis', 'rudis', blade(3, 1.1, 1, 0.2), 0.8, 1, 'gladius', 'The wooden sword given to a gladiator on his release. Worth nothing to anyone but its owner.', { tags: ['keepsake'] }),
  weapon('hasta', 'Hasta', 'hasta', spear(9, 0.9, 2, 0.4), 2.2, 15, 'hasta', 'A thrusting spear with a leaf-shaped iron head, light enough to use with a shield.'),
  weapon('lancea', 'Lancea', 'lancea', spear(8, 1, 1.8, 0.35), 1.6, 12, 'hasta', 'A light auxiliary spear that can be thrust or thrown.'),
  weapon('fuscina', 'Trident', 'fuscina', spear(10, 0.9, 1.7, 0.4), 2.4, 30, 'trident', 'The retiarius’s three-pronged fishing spear, a joke in the arena until it finds your throat.'),
  weapon('pilum', 'Pilum', 'pilum', { class: 'thrown', skill: 'spear', damage: 14, speed: 0.7, reach: 1.6, stagger: 0.6, projectileSpeed: 22 }, 2, 8, 'pilum', 'The heavy legionary javelin. Its long iron shank bends on impact so it cannot be thrown back.'),
  weapon('iaculum', 'Iaculum', 'iaculum', { class: 'thrown', skill: 'spear', damage: 8, speed: 1, reach: 1.4, stagger: 0.3, projectileSpeed: 25 }, 0.8, 3, 'pilum', 'A light hunting javelin.'),
  weapon('fustis', 'Fustis', 'fustis', blunt(6, 1.05, 0.95, 0.5), 1, 1, 'fustis', 'A hardwood cudgel. The vigiles carry them; so do the men the vigiles are looking for.'),
  weapon('clava', 'Clava', 'clava', blunt(14, 0.75, 1.2, 0.9, true), 4.5, 6, 'fustis', 'A knotted club of the kind Hercules carries in every statue in Rome.'),
  weapon('malleus', 'Malleus', 'malleus', blunt(16, 0.65, 1.25, 1, true), 6, 15, 'hammer', 'A stonemason’s sledgehammer from the building sites of Trajan’s Forum.'),
  weapon('securis', 'Securis', 'securis', blunt(9, 0.9, 1, 0.5), 1.4, 12, 'axe', 'A single-bladed axe like the one bound into the lictor’s fasces.'),
  weapon('dolabra', 'Dolabra', 'dolabra', blunt(10, 0.85, 1.05, 0.55), 1.8, 10, 'axe', 'The legionary’s pick-axe: one side for digging ditches, the other for everything else.'),
  weapon('caestus', 'Caestus', 'caestus', { class: 'unarmed', skill: 'unarmed', damage: 7, speed: 1.15, reach: 0.75, stagger: 0.35 }, 0.6, 8, 'none', 'Boxing thongs of oxhide, studded with metal. The Greeks say the Romans ruined boxing with them.'),
  weapon('arcus', 'Composite Bow', 'arcus', { class: 'bow', skill: 'ranged', damage: 12, speed: 1, reach: 0.5, stagger: 0.3, twoHanded: true, projectileSpeed: 55, ammo: 'sagitta' }, 1, 40, 'bow', 'A recurved bow of horn, wood and sinew in the eastern style.'),
  weapon('arcus_syrius', 'Hamian Bow', 'arcus Hamiorum', { class: 'bow', skill: 'ranged', damage: 15, speed: 1, reach: 0.5, stagger: 0.35, twoHanded: true, projectileSpeed: 62, ammo: 'sagitta' }, 1.1, 140, 'bow', 'A powerful composite bow of the Syrian archers of Hama, whose cohort guards the frontier.'),
  weapon('funda', 'Sling', 'funda', { class: 'sling', skill: 'ranged', damage: 9, speed: 1.1, reach: 0.5, stagger: 0.4, projectileSpeed: 40, ammo: 'glans' }, 0.1, 1, 'sling', 'A braided woollen sling. Balearic boys were not fed until they hit their bread with one.'),
  weapon('fax', 'Torch', 'fax', blunt(3, 1, 0.9, 0.2), 0.8, AS, 'torch', 'Pine splints bound with pitch. Lights the way home after the cena.', { slot: 'offHand', type: 'tool', stackable: true, tags: ['light'] }),
];

const AMMO: ItemDef[] = [
  { id: 'sagitta', name: 'Arrow', latin: 'sagitta', type: 'ammo', slot: 'ammo', weight: 0.03, value: 2 * AS, stackable: true, weapon: { class: 'bow', skill: 'ranged', damage: 2, speed: 1, reach: 0, stagger: 0 }, description: 'A reed arrow with an iron trilobate head.', icon: '➶' },
  { id: 'glans', name: 'Lead Sling Bullet', latin: 'glans plumbea', type: 'ammo', slot: 'ammo', weight: 0.05, value: AS, stackable: true, weapon: { class: 'sling', skill: 'ranged', damage: 3, speed: 1, reach: 0, stagger: 0.1 }, description: 'An almond-shaped lead bullet. Some are cast with a message for the target: “Take this!”', icon: '•' },
  { id: 'lapis', name: 'Sling Stone', latin: 'lapis', type: 'ammo', slot: 'ammo', weight: 0.06, value: 0, stackable: true, weapon: { class: 'sling', skill: 'ranged', damage: 1, speed: 1, reach: 0, stagger: 0.05 }, description: 'A smooth river stone from the Tiber bank.', icon: '•' },
];

// ------------------------------------------------------------------ shields

const SHIELDS: ItemDef[] = [
  { id: 'scutum', name: 'Scutum', latin: 'scutum', type: 'shield', slot: 'offHand', weight: 8, value: 35, shield: { rating: 25, blockMitigation: 0.8 }, visual: { shield: 'scutum' }, description: 'The curved rectangular legionary shield of glued plywood, leather and a bronze-rimmed iron boss.', icon: '▮' },
  { id: 'scutum_ovale', name: 'Oval Shield', latin: 'clipeus', type: 'shield', slot: 'offHand', weight: 5.5, value: 25, shield: { rating: 18, blockMitigation: 0.72 }, visual: { shield: 'scutum-oval' }, description: 'The flat oval shield of the auxiliaries and the urban cohorts.', icon: '⬮' },
  { id: 'parma', name: 'Parma', latin: 'parma', type: 'shield', slot: 'offHand', weight: 3.5, value: 15, shield: { rating: 12, blockMitigation: 0.65 }, visual: { shield: 'parma' }, description: 'A round cavalry shield, quick to bring up.', icon: '●' },
  { id: 'parmula', name: 'Parmula', latin: 'parmula', type: 'shield', slot: 'offHand', weight: 2.5, value: 18, shield: { rating: 9, blockMitigation: 0.6 }, visual: { shield: 'parmula' }, description: 'The small square shield of the thraex, painted in his ludus colours.', icon: '▪' },
  { id: 'crates', name: 'Wicker Practice Shield', latin: 'scutum vimineum', type: 'shield', slot: 'offHand', weight: 3, value: 2, shield: { rating: 6, blockMitigation: 0.5 }, visual: { shield: 'scutum' }, description: 'Woven twice as heavy as a real shield, so that real ones feel light.', icon: '▮' },
];

// ------------------------------------------------------------------ armor

const ARMOR: ItemDef[] = [
  armor('lorica_segmentata', 'Lorica Segmentata', 'lorica segmentata', 'body', heavy(40), 9, 350, { armor: { body: { kind: 'lorica-segmentata', metal: 'iron' } } }, 'Overlapping iron hoops on leather straps, the plate armor of Trajan’s legions on his column.'),
  armor('lorica_hamata', 'Mail Shirt', 'lorica hamata', 'body', heavy(34), 11, 260, { armor: { body: { kind: 'lorica-hamata', metal: 'iron' } } }, 'Thirty thousand riveted iron rings. Heavy on the shoulders, kind to the ribs.'),
  armor('lorica_squamata', 'Scale Armor', 'lorica squamata', 'body', heavy(36), 12, 300, { armor: { body: { kind: 'lorica-squamata', metal: 'bronze' } } }, 'Bronze scales wired to a linen backing. It shimmers like a fish and rattles like one too.'),
  armor('thoracomachus', 'Padded Jerkin', 'thoracomachus', 'body', light(14), 2.5, 25, { armor: { body: { kind: 'padded' } } }, 'Quilted linen stuffed with wool, worn alone or under mail.'),
  armor('lorica_corio', 'Leather Cuirass', 'lorica coriacea', 'body', light(18), 4, 45, { armor: { body: { kind: 'leather' } } }, 'Hardened oxhide shaped to the chest, favoured by hunters and bodyguards.'),
  armor('galea_gallica', 'Imperial Gallic Helmet', 'galea', 'head', heavy(16), 2.2, 120, { armor: { helmet: { kind: 'imperial-gallic', metal: 'iron' } } }, 'An iron helmet with a deep neck guard, brow ridge and embossed eyebrows.'),
  armor('galea_italica', 'Imperial Italic Helmet', 'galea', 'head', heavy(15), 2.3, 90, { armor: { helmet: { kind: 'imperial-italic', metal: 'bronze' } } }, 'A bronze helmet made in Italian workshops, a little old-fashioned now.'),
  armor('galea_attica', 'Praetorian Helmet', 'galea Attica', 'head', heavy(18), 2.5, 320, { armor: { helmet: { kind: 'praetorian-attic', crest: '#9b1c1c', metal: 'gilded' } } }, 'A crested Attic-style parade helmet of the Praetorian Guard, gilded and embossed.'),
  armor('galea_murmillo', 'Murmillo Helmet', 'galea gladiatoria', 'head', heavy(20), 4, 150, { armor: { helmet: { kind: 'murmillo', metal: 'bronze' } } }, 'A broad-brimmed gladiator’s helmet with a fish crest and a grille visor. Heavy, hot and nearly impenetrable.'),
  armor('cassis_corio', 'Leather Cap', 'galerus', 'head', light(5), 0.5, 6, { armor: { helmet: { kind: 'leather-cap' } } }, 'A stitched leather cap. Better than nothing against a falling roof tile.'),
  armor('manica', 'Manica', 'manica', 'hands', heavy(6), 1.5, 40, { armor: { manica: 'right' } }, 'An articulated iron arm guard, adopted by the legions after the Dacian falx took too many sword arms.'),
  armor('ocreae', 'Greaves', 'ocreae', 'legs', heavy(8), 1.6, 40, { armor: { greaves: 'both' } }, 'Bronze shin guards on leather padding.'),
  armor('caligae', 'Caligae', 'caligae', 'feet', light(3), 1.2, 4, {}, 'Hobnailed military sandal-boots. You can hear a cohort coming from the next street.'),
];

// ------------------------------------------------------------------ clothing

const CLOTHING: ItemDef[] = [
  armor('tunica', 'Wool Tunic', 'tunica', 'body', cloth(), 0.6, 3, { garment: { kind: 'tunica', color: '#c9b48a' } }, 'A plain belted tunic of undyed wool, the clothing of every working Roman.'),
  armor('tunica_linea', 'Linen Tunic', 'tunica linea', 'body', cloth(), 0.4, 12, { garment: { kind: 'tunica', color: '#ece3cf' } }, 'Fine Egyptian linen, cool in the Roman summer.', { equipModifiers: { 'price.buy': 0.02 } }),
  armor('tunica_brevis', 'Work Tunic', 'exomis', 'body', cloth(), 0.5, 1.5, { garment: { kind: 'tunica-short', color: '#9c8462' } }, 'A short tunic fastened on one shoulder, for porters, smiths and slaves.'),
  armor('tunica_longa', 'Long Tunic', 'tunica talaris', 'body', cloth(), 0.7, 4, { garment: { kind: 'tunica-long', color: '#b98f5e' } }, 'An ankle-length tunic.'),
  armor('tunica_rubra', 'Red Tunic', 'tunica russata', 'body', cloth(), 0.6, 8, { garment: { kind: 'tunica', color: '#8f2a1f' } }, 'Madder-dyed red wool. Soldiers wear red; so do supporters of the Reds at the Circus.'),
  armor('stola', 'Stola', 'stola', 'body', cloth(), 1, 30, { garment: { kind: 'stola', color: '#7d5a7a' } }, 'The long sleeveless overdress of a respectable married woman.', { equipModifiers: { 'persuade.chance': 0.03 } }),
  armor('toga', 'Toga', 'toga virilis', 'cloak', cloth(1), 3, 60, { garment: { kind: 'toga', color: '#efe8d8' } }, 'Six metres of white wool, draped by a slave if you have one. The dress of a citizen at the Forum.', { equipModifiers: { 'persuade.chance': 0.05 } }),
  armor('paenula', 'Paenula', 'paenula', 'cloak', cloth(1), 1.8, 15, { garment: { kind: 'paenula', color: '#6b5236' } }, 'A hooded travelling cloak of thick wool. It sheds rain and hides faces.', { equipModifiers: { 'stealth.visibility': 0.05 } }),
  armor('lacerna', 'Lacerna', 'lacerna', 'cloak', cloth(), 0.8, 20, { garment: { kind: 'lacerna', color: '#3f5a7a' } }, 'A light, fashionable cloak pinned at the shoulder.'),
  armor('sagum', 'Military Cloak', 'sagum', 'cloak', cloth(1), 1.5, 12, { garment: { kind: 'sagum', color: '#8a2f22' } }, 'A rectangle of heavy red wool pinned at the right shoulder: a soldier’s blanket and cloak.'),
  armor('palla', 'Palla', 'palla', 'cloak', cloth(), 1, 15, { garment: { kind: 'palla', color: '#5e6f4a' } }, 'A woman’s mantle, drawn over the head in the street and at sacrifice.', { equipModifiers: { 'blessing.duration': 0.05 } }),
  armor('pallium', 'Greek Mantle', 'pallium', 'cloak', cloth(), 1.2, 10, { garment: { kind: 'lacerna', color: '#a5916c' } }, 'The rectangular himation of Greek philosophers and physicians.'),
  armor('pileus', 'Felt Cap', 'pileus', 'head', cloth(), 0.2, 1, { armor: { helmet: { kind: 'pileus' } } }, 'A conical felt cap, the badge of a freed slave.'),
  armor('soleae', 'Sandals', 'soleae', 'feet', cloth(), 0.3, 1.5, {}, 'Simple indoor sandals. Wearing them in the Forum is a little lazy.'),
  armor('calcei', 'Calcei', 'calcei', 'feet', cloth(), 0.6, 6, {}, 'Closed leather shoes laced at the ankle, worn with the toga.'),
];

// ------------------------------------------------------------------ food & drink

const FOOD: ItemDef[] = [
  food('panis', 'Bread', 'panis plebeius', 0.3, 2 * AS, [heal(5)], 'A round loaf of coarse bread scored into eight wedges, stamped by the baker.'),
  food('panis_siligineus', 'White Bread', 'panis siligineus', 0.3, 4 * AS, [heal(8)], 'Soft bread of fine wheat flour, the kind the rich eat.'),
  food('puls', 'Porridge', 'puls', 0.5, 2 * AS, [heal(6), regen('stamina', 1, 30)], 'A bowl of spelt porridge with beans: what Romans ate before they conquered the world.'),
  food('caseus', 'Cheese', 'caseus', 0.4, 4 * AS, [heal(6)], 'A hard smoked cheese from the Velabrum.'),
  food('olivae', 'Olives', 'olivae', 0.2, 2 * AS, [heal(3)], 'Brined olives in a twist of cloth.'),
  food('ficus', 'Dried Figs', 'ficus aridae', 0.1, 2 * AS, [heal(3)], 'Dried figs threaded on a string. Cato waved one in the Senate to show how close Carthage was.', ['food', 'fig']),
  food('palmulae', 'Dates', 'palmulae', 0.1, 8 * AS, [heal(4), rest(5)], 'Sweet dates from Syria.'),
  food('poma', 'Apple', 'pomum', 0.15, AS, [heal(3)], 'A small sharp apple from the Alban hills.'),
  food('ova', 'Boiled Eggs', 'ova', 0.1, AS, [heal(4)], 'Two hard-boiled eggs. A proper dinner goes “ab ovo usque ad mala” — from the egg to the apples.'),
  food('lucanica', 'Lucanian Sausage', 'lucanica', 0.3, 6 * AS, [heal(12)], 'A smoked pork sausage spiced with pepper, cumin and rue.'),
  food('mel', 'Honey', 'mel', 0.4, 8 * AS, [heal(5), rest(10)], 'A small jar of thyme honey.', ['food', 'ingredient']),
  food('allec', 'Allec', 'allec', 0.3, AS, [heal(2)], 'The pungent sludge left at the bottom of the garum vat. The poor spread it on bread.'),
  food('garum', 'Garum', 'garum', 0.3, 8 * AS, [heal(4), regen('health', 0.3, 30)], 'Fermented fish sauce. Romans put it on everything.'),
  food('garum_sociorum', 'Garum of the Allies', 'garum sociorum', 0.3, 12, [regen('health', 1.2, 60)], 'The finest garum, from mackerel at Carthago Nova. Pliny says it costs as much as perfume.'),
  food('posca', 'Posca', 'posca', 0.8, AS, [rest(15)], 'Sour wine cut with water: the soldier’s drink, cheap and thirst-quenching.', ['drink']),
  food('lora', 'Lora', 'lora', 0.8, AS, [rest(10)], 'Thin wine from the second pressing of the grape skins, given to farm slaves in winter.', ['drink', 'wine']),
  food('vinum', 'Wine', 'vinum', 1.5, 4 * AS, [rest(20), { kind: 'modifier', target: 'persuade.chance', amount: 0.05, duration: 120 }], 'A jug of ordinary Italian red from a tavern counter.', ['drink', 'wine']),
  food('mulsum', 'Mulsum', 'mulsum', 1.5, 8 * AS, [rest(20), heal(5)], 'Wine sweetened with honey, served at the start of a meal.', ['drink', 'wine']),
  food('vinum_falernum', 'Falernian Wine', 'vinum Falernum', 1.5, 3, [rest(30), { kind: 'modifier', target: 'persuade.chance', amount: 0.1, duration: 300 }], 'The most famous vintage of Campania, amber and strong. Horace would have approved.', ['drink', 'wine']),
  food('vinum_caecubum', 'Caecuban Wine', 'vinum Caecubum', 1.5, 6, [rest(40), { kind: 'fortify', target: 'stamina', amount: 20, duration: 300 }], 'A rare old Caecuban, the wine Horace saved for Cleopatra’s defeat.', ['drink', 'wine']),
  food('aqua', 'Waterskin', 'aqua', 1, 0, [rest(8)], 'Cold water from the Aqua Marcia — the best in Rome.', ['drink']),
];

// ------------------------------------------------------------------ medicine & ingredients

const MEDICINE: ItemDef[] = [
  medicine('potio_minor', 'Herbal Draught', 'potio herbacea', 0.25, 4, [heal(25)], 'A bitter infusion of hyssop and honey from a street-corner healer.'),
  medicine('potio', 'Physician’s Draught', 'potio medici', 0.25, 10, [heal(50)], 'A compound remedy prepared by a Greek physician to a recipe of Celsus.'),
  medicine('potio_maior', 'Draught of Aesculapius', 'potio Aesculapii', 0.25, 25, [heal(100)], 'Prepared in the god’s sanctuary on the Tiber Island. Patients swear by it.'),
  medicine('unguentum', 'Wound Salve', 'unguentum', 0.2, 6, [regen('health', 2, 20)], 'Honey, wax and copper salts in a little tin, to be smeared on cuts.'),
  medicine('theriaca', 'Theriac', 'theriaca', 0.15, 30, [{ kind: 'cure', target: 'poison', amount: 1 }], 'Nero’s physician Andromachus perfected this antidote of sixty-four ingredients, including viper flesh.'),
  medicine('collyrium', 'Eye Salve', 'collyrium', 0.05, 3, [{ kind: 'cure', target: 'disease:lippitudo', amount: 1 }], 'A dried stick of eye salve stamped with the oculist’s name. Dissolve in egg white.'),
  medicine('cortex_salicis', 'Willow Bark Tea', 'decoctum salicis', 0.2, 2, [{ kind: 'cure', target: 'disease:febris', amount: 1 }, rest(5)], 'A bitter decoction that cools the tertian fever.'),
  medicine('aqua_insulae', 'Water of the Tiber Island', 'aqua Insulae', 0.5, 8, [{ kind: 'cure', target: 'disease', amount: 1 }], 'Water drawn at the sanctuary of Aesculapius. It cures any sickness, the priests say.'),
  medicine('embrocatio', 'Athlete’s Embrocation', 'oleum athletae', 0.3, 8, [{ kind: 'fortify', target: 'stamina', amount: 25, duration: 300 }], 'Olive oil infused with herbs, rubbed in before the palaestra.'),
  medicine('papaveris', 'Poppy Tincture', 'lacrima papaveris', 0.1, 12, [{ kind: 'fortify', target: 'health', amount: 30, duration: 120 }, { kind: 'modifier', target: 'speed.move', amount: -0.1, duration: 120 }], 'The milk of the poppy. It dulls pain — and wits.'),
];

const INGREDIENTS: ItemDef[] = [
  misc('ruta', 'Rue', 'ruta', 0.05, 4 * AS, 'A bitter herb against poison and the evil eye.', { type: 'ingredient', tags: ['herb'] }),
  misc('allium', 'Garlic', 'allium', 0.05, AS, 'Pliny lists sixty-one remedies made from garlic.', { type: 'ingredient', tags: ['herb'] }),
  misc('hyssopus', 'Hyssop', 'hyssopus', 0.05, 4 * AS, 'A fragrant herb for coughs and wounds.', { type: 'ingredient', tags: ['herb'] }),
  misc('papaver', 'Poppy Heads', 'papaver', 0.05, 8 * AS, 'Dried poppy heads, scored for their milk.', { type: 'ingredient', tags: ['herb'] }),
  misc('mandragora', 'Mandrake Root', 'mandragora', 0.1, 2, 'A forked root used to put patients to sleep before surgery.', { type: 'ingredient', tags: ['herb'] }),
  misc('absinthium', 'Wormwood', 'absinthium', 0.05, 4 * AS, 'Steeped in wine to cure worms and sea-sickness.', { type: 'ingredient', tags: ['herb'] }),
];

// ------------------------------------------------------------------ books & letters

const BOOKS: ItemDef[] = [
  book('liber_strategemata', 'Frontinus, Strategemata', 'Strategemata', 25, 'Since I alone of those interested in military science have undertaken to reduce its rules to system… I deem it a duty to collect the adroit operations of generals, which the Greeks embrace under the one name strategemata.\n\nWhen the enemy hold a height, send a few men to show themselves on the far side; draw them down; then take the hill they have left.\n\nAt Cynoscephalae the Macedonian phalanx could not turn. A spear wall is strong only where it faces.', 'Sextus Julius Frontinus, three times consul, on the stratagems of famous generals.', 'spear'),
  book('liber_onasander', 'Onasander, The General', 'Strategicus', 20, 'The general should be chosen as temperate, self-restrained, vigilant, frugal, hardened to labour, alert, free from avarice, neither too young nor too old.\n\nLet the front rank lock shields so that no blade finds a gap; the man who lowers his shield to strike opens the whole line.', 'A Greek handbook on generalship, dedicated to a Roman consul.', 'block'),
  book('liber_cynegeticus', 'Xenophon, On Hunting', 'Cynegeticus', 15, 'The hare runs in circles and returns to its form; set your nets where it began.\n\nThe young man who hunts learns to bear cold and heat, to aim true when his breath is short, and to wait.', 'An old Athenian’s advice on hounds, nets and the hunting bow.', 'ranged'),
  book('liber_lanista', 'Rules of the Ludus Magnus', 'Leges Ludi', 10, 'I. The tiro trains at the palus, the wooden post, until his arm can no longer lift the wooden sword. Then he trains more.\n\nII. Strike to the thigh when the shield rises, to the throat when it falls.\n\nIII. Do not look at the crowd. The crowd does not fight for you.', 'A doctor’s copybook from the imperial gladiator school beside the Colosseum.', 'blades'),
  book('liber_institutio', 'Quintilian, Institutio Oratoria XII', 'Institutio Oratoria', 40, 'Let the orator, then, whom I am forming be such as is defined by Marcus Cato: a good man, skilled in speaking — vir bonus dicendi peritus.\n\nIt is feeling and force of imagination that make us eloquent.', 'The last book of Quintilian’s education of the orator, published in the reign of Domitian.', 'rhetoric'),
  book('liber_cato', 'Cato, On Agriculture', 'De Agri Cultura', 20, 'When the master arrives at the farm… let him sell oil if the price is satisfactory, and the surplus wine and grain; let him sell worn-out oxen, blemished cattle and sheep, wool, hides, an old wagon, old tools, an old slave, a sickly slave.\n\nThe master of the house should be a seller, not a buyer — patrem familias vendacem, non emacem esse oportet.', 'The elder Cato’s practical, flinty handbook on running an estate.', 'mercatura'),
  book('liber_celsus', 'Celsus, On Medicine', 'De Medicina', 45, 'Medicine should be rational, but should draw its instruction from evident causes.\n\nThe surgeon should be youthful or at any rate nearer youth than age, with a strong and steady hand that never trembles, and be no less quick with the left hand than with the right.', 'Aulus Cornelius Celsus’s encyclopaedia of medicine, in clear Latin.', 'medicina'),
  book('liber_amores', 'Ovid, Amores I', 'Amores', 15, 'Doorkeeper — shameful! — bound by a hard chain, swing on its hinge the stubborn door.\n\nI ask for little: let the door open a crack, so that I can slip through sideways. Long love has thinned my body for such tricks.', 'Ovid’s love elegies, including the locked-out lover’s plea to the doorkeeper. Not on the shelves of the Palatine library.', 'lockpicking'),
  book('liber_vitruvius', 'Vitruvius, On Architecture X', 'De Architectura', 35, 'All these must be built with due reference to durability, convenience and beauty — firmitas, utilitas, venustas.\n\nA machine is a combination of timber fastened together, chiefly efficacious in moving great weights.', 'Vitruvius’s tenth book: machines, water-lifts, and how to forge and fit them.', 'fabrica'),
  book('liber_res_gestae', 'The Deeds of the Divine Augustus', 'Res Gestae Divi Augusti', 15, 'In my sixth consulship I restored eighty-two temples of the gods in the city, neglecting none that needed repair at that time.\n\nThe doors of the temple of Janus Quirinus, which our ancestors ordered closed whenever there was peace throughout the empire by land and sea, were closed three times while I was princeps.', 'A copy of the inscription on Augustus’s mausoleum in the Campus Martius.', 'religio'),
  book('liber_satyricon', 'Petronius, Satyricon (fragment)', 'Satyricon', 12, '…and while everyone was staring at the roast boar, Ascyltos slipped a silver cup into the fold of his toga, and I a napkin full of cakes.\n\nTrimalchio, who had been a slave himself, was too busy counting his estates to notice.', 'A scandalous, half-burned novel of thieves and freedmen from Nero’s day.', 'pickpocket'),
  book('liber_aquaeductu', 'Frontinus, On the Aqueducts', 'De Aquaeductu', 20, 'With such an array of indispensable structures carrying so many waters, compare, if you will, the idle Pyramids or the useless, though famous, works of the Greeks!\n\nThe Aqua Marcia is the coldest and best; the Anio Vetus is often muddy; the Alsietina is unfit to drink and serves only for the Naumachia and gardens.', 'The water commissioner’s report on the nine aqueducts of Rome, AD 97.'),
  book('epistula_plinii', 'Copy of a Letter of Pliny', 'Epistula ad Traianum', 2, 'It is my custom, my lord, to refer to you all matters about which I am in doubt…\n\nThose who denied they were or had ever been Christians, who repeated after me an invocation to the gods and offered prayer with incense and wine to your image, I thought should be discharged.', 'A copy, passed around the Forum, of a letter from the governor of Bithynia to the emperor.', undefined, 0.05),
];

// ------------------------------------------------------------------ curse tablets, amulets, keys

const CURSES: ItemDef[] = [
  misc('defixio', 'Blank Lead Tablet', 'tabella plumbea', 0.2, 8 * AS, 'A thin sheet of lead, ready to be inscribed with a curse, folded, pierced with a nail and dropped in a grave or a spring.', { tags: ['curse'] }),
  { id: 'defixio_prasina', name: 'Curse Tablet against the Greens', latin: 'defixio', type: 'book', weight: 0.2, value: 1, icon: '✠', tags: ['curse'], description: 'A folded lead tablet pierced by a nail, scratched with a curse on the chariot team of the Greens.', text: 'I adjure you, demon, whoever you are: from this hour, this day, this moment, torture and kill the horses of the Green — Eucherius, Prasinus, Callidromus — and their driver. Bind their legs, their running, their victory. Now, now, quickly, quickly!' },
  { id: 'defixio_furtum', name: 'Curse Tablet against a Thief', latin: 'defixio', type: 'book', weight: 0.2, value: 1, icon: '✠', tags: ['curse'], description: 'A plea to Mercury to punish whoever stole a cloak from the baths.', text: 'To the god Mercury I give the one who stole my hooded cloak, whether man or woman, slave or free. Let him not sleep, nor eat, nor drink, nor sit, nor lie, until he brings it to your temple.' },
];

const AMULETS: ItemDef[] = [
  { id: 'bulla_aurea', name: 'Golden Bulla', latin: 'bulla aurea', type: 'misc', slot: 'neck', weight: 0.05, value: 60, icon: '◎', equipModifiers: { 'pietas.max': 10 }, description: 'The locket a freeborn boy wears against evil until he takes the toga of manhood.' },
  { id: 'fascinum', name: 'Fascinum', latin: 'fascinum', type: 'misc', slot: 'neck', weight: 0.02, value: 2, icon: '◎', equipModifiers: { 'health.regen': 0.1 }, description: 'A small bronze phallic charm. Nothing turns aside the evil eye like a joke.' },
  { id: 'nodus_isidis', name: 'Knot of Isis', latin: 'nodus Isiacus', type: 'misc', slot: 'neck', weight: 0.02, value: 15, icon: '◎', equipModifiers: { 'pietas.regen': 0.25 }, description: 'A faience tyet amulet from the Iseum in the Campus Martius.' },
  { id: 'signum_mithrae', name: 'Token of Mithras', latin: 'signum Mithrae', type: 'misc', slot: 'neck', weight: 0.03, value: 10, icon: '◎', equipModifiers: { 'stamina.max': 10 }, description: 'A bronze disc stamped with the bull-slaying god. Members of the cult know what it means.' },
  { id: 'torques', name: 'Gold Torc', latin: 'torques', type: 'misc', slot: 'neck', weight: 0.4, value: 120, icon: '◎', equipModifiers: { 'health.max': 10 }, description: 'A twisted gold neck ring taken from a Gaul or Dacian. Soldiers are decorated with smaller ones.' },
  { id: 'anulus_aureus', name: 'Equestrian Gold Ring', latin: 'anulus aureus', type: 'misc', slot: 'finger', weight: 0.01, value: 150, icon: '○', equipModifiers: { 'price.buy': 0.05 }, description: 'The gold ring of the equestrian order. Shopkeepers notice it.' },
  { id: 'anulus_signatorius', name: 'Signet Ring', latin: 'anulus signatorius', type: 'misc', slot: 'finger', weight: 0.01, value: 25, icon: '○', equipModifiers: { 'persuade.chance': 0.05 }, description: 'An iron ring set with a carnelian intaglio of Minerva, for sealing letters.' },
  { id: 'anulus_ferreus', name: 'Iron Ring', latin: 'anulus ferreus', type: 'misc', slot: 'finger', weight: 0.01, value: 1, icon: '○', description: 'A plain iron ring in the old Roman fashion.' },
];

const KEYS: ItemDef[] = [
  { id: 'clavis_cenaculum', name: 'Key to a Suburan Flat', latin: 'clavis', type: 'key', weight: 0.05, value: 0, icon: '⚷', description: 'A bronze slide key for a third-floor flat in an insula of the Subura.' },
  { id: 'clavis_horrea', name: 'Key to the Horrea Galbana', latin: 'clavis horreorum', type: 'key', weight: 0.08, value: 0, icon: '⚷', description: 'A heavy iron key to one of the storerooms of Rome’s great warehouses by the river.' },
  { id: 'clavis_carcer', name: 'Key of the Tullianum', latin: 'clavis carceris', type: 'key', weight: 0.1, value: 0, icon: '⚷', description: 'The key to the cells of the Carcer below the Capitol, where Jugurtha and Vercingetorix died.' },
];

// ------------------------------------------------------------------ tools & goods

const GOODS: ItemDef[] = [
  { id: 'uncus', name: 'Lockpick', latin: 'uncus', type: 'tool', weight: 0.02, value: 8 * AS, stackable: true, icon: '⌐', tags: ['lockpick'], description: 'A bent bronze pick. Owning one is not a crime. Being found with one at night is a conversation.' },
  { id: 'lucerna', name: 'Oil Lamp', latin: 'lucerna', type: 'tool', weight: 0.3, value: 4 * AS, stackable: true, icon: '🪔', tags: ['light'], description: 'A mould-made clay lamp with a gladiator on the discus.' },
  { id: 'strigilis', name: 'Strigil', latin: 'strigilis', type: 'tool', weight: 0.2, value: 2, icon: '⌒', description: 'A curved bronze scraper for oil and sweat at the baths.' },
  { id: 'tabula_cerata', name: 'Wax Tablet', latin: 'tabula cerata', type: 'misc', weight: 0.3, value: 8 * AS, icon: '▭', description: 'Two wooden leaves filled with black wax and a bronze stylus. For notes, accounts and love letters.' },
  { id: 'charta', name: 'Papyrus Roll', latin: 'charta', type: 'misc', weight: 0.1, value: 1, stackable: true, icon: '▭', description: 'A blank roll of Egyptian papyrus.' },
  misc('tali', 'Knucklebones', 'tali', 0.05, 4 * AS, 'Four sheep’s knucklebones for gambling. The best throw is the Venus; the worst is the dogs.'),
  misc('aureus', 'Aureus of Trajan', 'aureus', 0.007, 25, 'A gold coin worth 25 denarii, showing the emperor laureate: IMP TRAIANO AVG GER DAC.', { tags: ['coin'] }),
  misc('tessera_frumentaria', 'Grain Dole Token', 'tessera frumentaria', 0.01, 8 * AS, 'A lead token entitling a citizen to his monthly ration of free grain at the Porticus Minucia.'),
  misc('oleum', 'Jar of Olive Oil', 'oleum', 1, 8 * AS, 'Oil from Baetica, for lamps, cooking and the baths.'),
  misc('sal', 'Salt', 'sal', 0.5, 4 * AS, 'Salt from the Ostian flats, carried up the Via Salaria.'),
  misc('piper', 'Bag of Pepper', 'piper', 0.5, 8, 'Black pepper from India, stored in the Horrea Piperataria by the Via Sacra.', { tags: ['spice'] }),
  misc('tus', 'Frankincense', 'tus', 0.2, 5, 'Arabian incense, burned at every altar in Rome.', { tags: ['offering'] }),
  misc('purpura', 'Vial of Tyrian Purple', 'purpura', 0.1, 100, 'Dye from ten thousand murex snails. Only the emperor wears a whole garment of it.', { tags: ['luxury'] }),
  misc('vitrum', 'Glass Beaker', 'vitrum', 0.3, 3, 'Blown glass, clear as water, from a workshop near the Porta Capena.'),
  misc('calix_argenteus', 'Silver Cup', 'calix argenteus', 0.4, 40, 'A silver drinking cup chased with olive branches.', { tags: ['luxury'] }),
  misc('ferrum', 'Iron Bar', 'ferrum', 2, 2, 'A bar of wrought iron, for the smith.', { tags: ['metal'] }),
  misc('aes', 'Bronze Ingot', 'aes', 2, 4, 'A cast ingot of bronze.', { tags: ['metal'] }),
  misc('corium', 'Leather Hide', 'corium', 1.5, 2, 'A tanned oxhide.'),
  misc('linum', 'Bolt of Linen', 'linum', 2, 6, 'Egyptian linen, still smelling of the warehouse.'),
];

export const ITEMS: ItemDef[] = [
  ...WEAPONS,
  ...AMMO,
  ...SHIELDS,
  ...ARMOR,
  ...CLOTHING,
  ...FOOD,
  ...MEDICINE,
  ...INGREDIENTS,
  ...BOOKS,
  ...CURSES,
  ...AMULETS,
  ...KEYS,
  ...GOODS,
];
