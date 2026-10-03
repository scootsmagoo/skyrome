/**
 * PROVISIONAL skills, perks and backgrounds (GDD pending). Sixteen skills in three groups, like
 * Skyrim's warrior/thief/mage constellations: Martial (health), Stealth (stamina) and Civic
 * (pietas — duty to gods, family and state, the game's "magicka").
 *
 * Perk modifiers are additive fractions (0.2 = +20%) except `*.max` and `carry.max`, which are flat
 * points. Flags are free-form strings that other systems test with sheet.hasFlag().
 */
import type { BackgroundDef, ModifierId, PerkDef, SkillDef } from '../types';

export const SKILLS: SkillDef[] = [
  // ---- Martial
  { id: 'blades', name: 'Blades', latin: 'Gladius', attribute: 'health', category: 'martial', description: 'Swords and daggers: the gladius, spatha, pugio and sica.', howToTrain: 'Land hits with a blade.' },
  { id: 'spear', name: 'Spear', latin: 'Hasta', attribute: 'health', category: 'martial', description: 'Spears, tridents and thrown javelins — including the legionary pilum.', howToTrain: 'Land hits with a spear or javelin.' },
  { id: 'blunt', name: 'Clubs & Axes', latin: 'Fustis', attribute: 'health', category: 'martial', description: 'Cudgels, clubs, hammers, axes and the dolabra.', howToTrain: 'Land hits with a club, hammer or axe.' },
  { id: 'block', name: 'Shield', latin: 'Scutum', attribute: 'health', category: 'martial', description: 'Catching blows on a shield or blade, and bashing with the boss.', howToTrain: 'Block attacks.' },
  { id: 'heavyArmor', name: 'Heavy Armor', latin: 'Lorica', attribute: 'health', category: 'martial', description: 'Fighting in iron and bronze: segmentata, mail, scale and gladiatorial helmets.', howToTrain: 'Take hits while wearing heavy armor.' },
  { id: 'fabrica', name: 'Smithing', latin: 'Fabrica', attribute: 'health', category: 'martial', description: 'The forge and the workshop: repairing and improving arms and armor.', howToTrain: 'Work at a forge or workbench.' },
  // ---- Stealth
  { id: 'ranged', name: 'Missiles', latin: 'Missilia', attribute: 'stamina', category: 'stealth', description: 'Composite bows and slings, as used by the Syrian archers and Balearic slingers.', howToTrain: 'Hit targets with arrows or sling bullets.' },
  { id: 'lightArmor', name: 'Light Armor', latin: 'Armatura Levis', attribute: 'stamina', category: 'stealth', description: 'Leather, padded linen and a light helmet.', howToTrain: 'Take hits while wearing light armor.' },
  { id: 'unarmed', name: 'Pugilism', latin: 'Pugilatus', attribute: 'stamina', category: 'stealth', description: 'Boxing and pankration, bare-fisted or in the caestus.', howToTrain: 'Land punches.' },
  { id: 'sneak', name: 'Sneak', latin: 'Furtim', attribute: 'stamina', category: 'stealth', description: 'Moving unseen through dark streets and crowded markets.', howToTrain: 'Stay hidden near people who would notice you.' },
  { id: 'lockpicking', name: 'Lockpicking', latin: 'Ars Claustrorum', attribute: 'stamina', category: 'stealth', description: 'Opening the bronze locks of strongboxes, storerooms and house doors.', howToTrain: 'Pick locks.' },
  { id: 'pickpocket', name: 'Pickpocket', latin: 'Sectio Zonarum', attribute: 'stamina', category: 'stealth', description: 'A cutpurse ("sector zonarius") slices purses from belts in the crowd.', howToTrain: 'Steal from pockets and purses.' },
  // ---- Civic
  { id: 'rhetoric', name: 'Rhetoric', latin: 'Rhetorica', attribute: 'pietas', category: 'civic', description: 'Persuasion, intimidation and the orator’s art.', howToTrain: 'Persuade and intimidate; barter.' },
  { id: 'mercatura', name: 'Trade', latin: 'Mercatura', attribute: 'stamina', category: 'civic', description: 'Haggling in the markets and warehouses of the greatest city in the world.', howToTrain: 'Buy and sell.' },
  { id: 'medicina', name: 'Medicine', latin: 'Medicina', attribute: 'pietas', category: 'civic', description: 'Herbs, salves and draughts after Celsus and Dioscorides.', howToTrain: 'Prepare remedies.' },
  { id: 'religio', name: 'Religion', latin: 'Religio', attribute: 'pietas', category: 'civic', description: 'Sacrifice, prayer and the right words at the right altar: blessings and omens.', howToTrain: 'Pray at shrines and make offerings.' },
];

export const SKILL_IDS = SKILLS.map((s) => s.id);

/** Five-rank damage perk ladder at 0/20/40/60/80 (Skyrim's Armsman/Overdraw pattern). */
function ladder(skill: string, base: string, names: string[], mod: ModifierId, each: number, desc: (pct: number) => string): PerkDef[] {
  return names.map((name, i) => ({
    id: `${base}${i + 1}`,
    skill,
    name,
    description: desc(Math.round(each * (i + 1) * 100)),
    requiresLevel: i * 20,
    requiresPerk: i ? `${base}${i}` : undefined,
    modifiers: { [mod]: each },
  }));
}

export const PERKS: PerkDef[] = [
  // ---- Blades
  ...ladder('blades', 'blades.arm', ['Sword Arm', 'Sword Arm II', 'Sword Arm III', 'Sword Arm IV', 'Sword Arm V'], 'damage.blades', 0.2, (p) => `Blades do ${p}% more damage.`),
  { id: 'blades.punctim', skill: 'blades', name: 'Punctim, Non Caesim', description: 'Thrust, don’t slash: power attacks do 25% more damage.', requiresLevel: 30, requiresPerk: 'blades.arm1', modifiers: { 'damage.power': 0.25 } },
  { id: 'blades.stance', skill: 'blades', name: 'Legionary Stance', description: 'Attacks cost 25% less stamina.', requiresLevel: 20, requiresPerk: 'blades.arm1', modifiers: { 'stamina.attackCost': 0.25 } },
  { id: 'blades.iugulum', skill: 'blades', name: 'Iugulum', description: 'Blade power attacks can strike the throat for a critical hit.', requiresLevel: 70, requiresPerk: 'blades.punctim', flags: ['blades.crit'] },
  // ---- Spear
  ...ladder('spear', 'spear.arm', ['Hastatus', 'Hastatus II', 'Hastatus III', 'Hastatus IV', 'Hastatus V'], 'damage.spear', 0.2, (p) => `Spears and javelins do ${p}% more damage.`),
  { id: 'spear.reach', skill: 'spear', name: 'Long Reach', description: 'Spear attacks reach 30 cm farther.', requiresLevel: 30, requiresPerk: 'spear.arm1', flags: ['spear.reach'] },
  { id: 'spear.pilum', skill: 'spear', name: 'Pilum Volley', description: 'A thrown pilum lodged in a shield makes it useless to the bearer.', requiresLevel: 40, requiresPerk: 'spear.arm2', flags: ['spear.pilumBreak'] },
  { id: 'spear.phalanx', skill: 'spear', name: 'Shieldbreaker', description: 'Spear power attacks stagger blocking enemies.', requiresLevel: 60, requiresPerk: 'spear.reach', flags: ['spear.guardBreak'] },
  // ---- Blunt
  ...ladder('blunt', 'blunt.arm', ['Heavy Hand', 'Heavy Hand II', 'Heavy Hand III', 'Heavy Hand IV', 'Heavy Hand V'], 'damage.blunt', 0.2, (p) => `Clubs, hammers and axes do ${p}% more damage.`),
  { id: 'blunt.stun', skill: 'blunt', name: 'Stunning Blow', description: 'Blunt attacks do 50% more poise damage.', requiresLevel: 30, requiresPerk: 'blunt.arm1', flags: ['blunt.stagger'] },
  { id: 'blunt.skullcracker', skill: 'blunt', name: 'Skullcracker', description: 'Blunt power attacks ignore 25% of armor.', requiresLevel: 50, requiresPerk: 'blunt.stun', flags: ['blunt.ignoreArmor'] },
  // ---- Block
  { id: 'block.wall1', skill: 'block', name: 'Shield Wall', description: 'Blocking absorbs 4% more damage.', requiresLevel: 0, modifiers: { 'block.mitigation': 0.04 } },
  { id: 'block.wall2', skill: 'block', name: 'Shield Wall II', description: 'Blocking absorbs 8% more damage.', requiresLevel: 25, requiresPerk: 'block.wall1', modifiers: { 'block.mitigation': 0.04 } },
  { id: 'block.wall3', skill: 'block', name: 'Shield Wall III', description: 'Blocking absorbs 12% more damage.', requiresLevel: 50, requiresPerk: 'block.wall2', modifiers: { 'block.mitigation': 0.04 } },
  { id: 'block.testudo', skill: 'block', name: 'Testudo', description: 'Blocking costs 30% less stamina.', requiresLevel: 30, requiresPerk: 'block.wall1', modifiers: { 'block.staminaCost': 0.3 } },
  { id: 'block.umbo', skill: 'block', name: 'Umbo', description: 'A shield bash with the iron boss staggers any foe.', requiresLevel: 40, requiresPerk: 'block.wall1', flags: ['block.bashStagger'] },
  { id: 'block.deflect', skill: 'block', name: 'Deflect Missiles', description: 'Arrows and sling bullets do no damage when blocked.', requiresLevel: 60, requiresPerk: 'block.testudo', flags: ['block.missiles'] },
  { id: 'block.riposte', skill: 'block', name: 'Riposte', description: 'A block timed at the last moment staggers the attacker.', requiresLevel: 80, requiresPerk: 'block.umbo', flags: ['block.timedRiposte'] },
  // ---- Heavy armor
  { id: 'heavy.miles1', skill: 'heavyArmor', name: 'Miles', description: 'Heavy armor rating +20%.', requiresLevel: 0, modifiers: { 'armor.heavy': 0.2 } },
  { id: 'heavy.miles2', skill: 'heavyArmor', name: 'Miles II', description: 'Heavy armor rating +40%.', requiresLevel: 25, requiresPerk: 'heavy.miles1', modifiers: { 'armor.heavy': 0.2 } },
  { id: 'heavy.miles3', skill: 'heavyArmor', name: 'Miles III', description: 'Heavy armor rating +60%.', requiresLevel: 50, requiresPerk: 'heavy.miles2', modifiers: { 'armor.heavy': 0.2 } },
  { id: 'heavy.conditioning', skill: 'heavyArmor', name: 'Twenty Miles a Day', description: 'Worn heavy armor weighs nothing and does not slow you.', requiresLevel: 40, requiresPerk: 'heavy.miles1', flags: ['heavy.weightless'] },
  { id: 'heavy.rock', skill: 'heavyArmor', name: 'Like a Rock', description: 'In full heavy armor you are much harder to stagger.', requiresLevel: 60, requiresPerk: 'heavy.conditioning', flags: ['heavy.staggerResist'] },
  // ---- Smithing
  { id: 'fab.iron', skill: 'fabrica', name: 'Ironworker', description: 'Repair and improve iron arms and armor.', requiresLevel: 0, flags: ['fabrica.iron'] },
  { id: 'fab.repair', skill: 'fabrica', name: 'Armorer', description: 'Repairs at a workbench restore twice as much.', requiresLevel: 20, requiresPerk: 'fab.iron', flags: ['fabrica.repair'] },
  { id: 'fab.noric', skill: 'fabrica', name: 'Noric Steel', description: 'Work the hard steel of Noricum.', requiresLevel: 40, requiresPerk: 'fab.iron', flags: ['fabrica.noric'] },
  { id: 'fab.masterwork', skill: 'fabrica', name: 'Masterwork', description: 'Improvements are twice as effective.', requiresLevel: 70, requiresPerk: 'fab.noric', flags: ['fabrica.masterwork'] },
  // ---- Missiles
  ...ladder('ranged', 'ranged.arm', ['Overdraw', 'Overdraw II', 'Overdraw III', 'Overdraw IV', 'Overdraw V'], 'damage.ranged', 0.2, (p) => `Bows and slings do ${p}% more damage.`),
  { id: 'ranged.slinger', skill: 'ranged', name: 'Balearic Slinger', description: 'Slings fire faster and lead bullets stagger.', requiresLevel: 20, requiresPerk: 'ranged.arm1', flags: ['ranged.slinger'] },
  { id: 'ranged.eagle', skill: 'ranged', name: 'Eagle Eye', description: 'Hold block while aiming to zoom.', requiresLevel: 30, requiresPerk: 'ranged.arm1', flags: ['ranged.zoom'] },
  { id: 'ranged.quick', skill: 'ranged', name: 'Syrian Draw', description: 'Draw a bow 30% faster.', requiresLevel: 60, requiresPerk: 'ranged.eagle', flags: ['ranged.quickDraw'] },
  // ---- Light armor
  { id: 'light.agile1', skill: 'lightArmor', name: 'Auxiliary', description: 'Light armor rating +20%.', requiresLevel: 0, modifiers: { 'armor.light': 0.2 } },
  { id: 'light.agile2', skill: 'lightArmor', name: 'Auxiliary II', description: 'Light armor rating +40%.', requiresLevel: 25, requiresPerk: 'light.agile1', modifiers: { 'armor.light': 0.2 } },
  { id: 'light.agile3', skill: 'lightArmor', name: 'Auxiliary III', description: 'Light armor rating +60%.', requiresLevel: 50, requiresPerk: 'light.agile2', modifiers: { 'armor.light': 0.2 } },
  { id: 'light.unhindered', skill: 'lightArmor', name: 'Unhindered', description: 'Worn light armor weighs nothing.', requiresLevel: 30, requiresPerk: 'light.agile1', flags: ['light.weightless'] },
  { id: 'light.wind', skill: 'lightArmor', name: 'Wind Walker', description: 'Stamina regenerates 50% faster.', requiresLevel: 60, requiresPerk: 'light.unhindered', modifiers: { 'stamina.regen': 0.5 } },
  // ---- Pugilism
  { id: 'unarmed.fists1', skill: 'unarmed', name: 'Iron Fist', description: 'Punches do 50% more damage.', requiresLevel: 0, modifiers: { 'damage.unarmed': 0.5 } },
  { id: 'unarmed.fists2', skill: 'unarmed', name: 'Iron Fist II', description: 'Punches do 100% more damage.', requiresLevel: 30, requiresPerk: 'unarmed.fists1', modifiers: { 'damage.unarmed': 0.5 } },
  { id: 'unarmed.fists3', skill: 'unarmed', name: 'Iron Fist III', description: 'Punches do 150% more damage.', requiresLevel: 60, requiresPerk: 'unarmed.fists2', modifiers: { 'damage.unarmed': 0.5 } },
  { id: 'unarmed.pankration', skill: 'unarmed', name: 'Pankratiast', description: 'Unarmed power attacks knock opponents down.', requiresLevel: 40, requiresPerk: 'unarmed.fists1', flags: ['unarmed.knockdown'] },
  // ---- Sneak
  { id: 'sneak.shadow1', skill: 'sneak', name: 'Stealth', description: 'You are 15% harder to detect.', requiresLevel: 0, modifiers: { 'stealth.visibility': 0.15, 'stealth.noise': 0.15 } },
  { id: 'sneak.shadow2', skill: 'sneak', name: 'Stealth II', description: 'You are 30% harder to detect.', requiresLevel: 25, requiresPerk: 'sneak.shadow1', modifiers: { 'stealth.visibility': 0.15, 'stealth.noise': 0.15 } },
  { id: 'sneak.shadow3', skill: 'sneak', name: 'Stealth III', description: 'You are 45% harder to detect.', requiresLevel: 50, requiresPerk: 'sneak.shadow2', modifiers: { 'stealth.visibility': 0.15, 'stealth.noise': 0.15 } },
  { id: 'sneak.backstab', skill: 'sneak', name: 'Backstab', description: 'Sneak attacks with melee weapons do ×4 damage instead of ×3.', requiresLevel: 30, requiresPerk: 'sneak.shadow1', modifiers: { 'damage.sneak': 1 } },
  { id: 'sneak.sicarius', skill: 'sneak', name: 'Sicarius', description: 'Sneak attacks with a pugio or sica do ×8 damage.', requiresLevel: 50, requiresPerk: 'sneak.backstab', flags: ['sneak.dagger'] },
  { id: 'sneak.lightfoot', skill: 'sneak', name: 'Light Foot', description: 'You no longer set off pressure plates and tripwires.', requiresLevel: 40, requiresPerk: 'sneak.shadow1', flags: ['sneak.lightFoot'] },
  { id: 'sneak.vanish', skill: 'sneak', name: 'Into the Crowd', description: 'Crouching in a crowd makes pursuers lose you.', requiresLevel: 70, requiresPerk: 'sneak.shadow3', flags: ['sneak.vanish'] },
  // ---- Lockpicking
  { id: 'lock.novice', skill: 'lockpicking', name: 'Novice Locks', description: 'Simple locks are 20% easier to pick.', requiresLevel: 0, modifiers: { 'lockpick.ease': 0.2 } },
  { id: 'lock.adept', skill: 'lockpicking', name: 'Adept Locks', description: 'Locks are another 20% easier to pick.', requiresLevel: 25, requiresPerk: 'lock.novice', modifiers: { 'lockpick.ease': 0.2 } },
  { id: 'lock.wax', skill: 'lockpicking', name: 'Wax Impression', description: 'Press a key into wax to have a copy made by a locksmith.', requiresLevel: 40, requiresPerk: 'lock.adept', flags: ['lockpick.waxKey'] },
  { id: 'lock.expert', skill: 'lockpicking', name: 'Expert Locks', description: 'Locks are another 20% easier to pick.', requiresLevel: 50, requiresPerk: 'lock.adept', modifiers: { 'lockpick.ease': 0.2 } },
  { id: 'lock.master', skill: 'lockpicking', name: 'Master Locks', description: 'Even the locks of the Horrea open for you; picks rarely break.', requiresLevel: 75, requiresPerk: 'lock.expert', modifiers: { 'lockpick.ease': 0.2 }, flags: ['lockpick.unbreakable'] },
  // ---- Pickpocket
  { id: 'pick.fingers1', skill: 'pickpocket', name: 'Light Fingers', description: 'Pickpocketing is 20% more likely to succeed.', requiresLevel: 0, modifiers: { 'pickpocket.chance': 0.2 } },
  { id: 'pick.fingers2', skill: 'pickpocket', name: 'Light Fingers II', description: 'Pickpocketing is 40% more likely to succeed.', requiresLevel: 25, requiresPerk: 'pick.fingers1', modifiers: { 'pickpocket.chance': 0.2 } },
  { id: 'pick.fingers3', skill: 'pickpocket', name: 'Light Fingers III', description: 'Pickpocketing is 60% more likely to succeed.', requiresLevel: 50, requiresPerk: 'pick.fingers2', modifiers: { 'pickpocket.chance': 0.2 } },
  { id: 'pick.cutpurse', skill: 'pickpocket', name: 'Cutpurse', description: 'Slit purses hold twice as many coins.', requiresLevel: 30, requiresPerk: 'pick.fingers1', flags: ['pickpocket.purse'] },
  { id: 'pick.misdirection', skill: 'pickpocket', name: 'Misdirection', description: 'Steal rings and amulets someone is wearing.', requiresLevel: 70, requiresPerk: 'pick.fingers3', flags: ['pickpocket.equipped'] },
  // ---- Rhetoric
  { id: 'rhet.periods', skill: 'rhetoric', name: 'Ciceronian Periods', description: 'Persuasion is 15% more likely to succeed.', requiresLevel: 20, modifiers: { 'persuade.chance': 0.15 } },
  { id: 'rhet.haggle', skill: 'rhetoric', name: 'Silver Tongue', description: 'Buy 5% cheaper and sell 5% dearer.', requiresLevel: 10, modifiers: { 'price.buy': 0.05, 'price.sell': 0.05 } },
  { id: 'rhet.intimidate', skill: 'rhetoric', name: 'Gravitas', description: 'Intimidation options appear, and are more likely to work.', requiresLevel: 40, requiresPerk: 'rhet.periods', flags: ['rhetoric.intimidate'] },
  { id: 'rhet.clientela', skill: 'rhetoric', name: 'Clientela', description: 'Gain 25% more reputation with every faction.', requiresLevel: 30, requiresPerk: 'rhet.periods', flags: ['rhetoric.clients'] },
  { id: 'rhet.orator', skill: 'rhetoric', name: 'Orator of the Rostra', description: 'Persuasion is another 15% more likely to succeed.', requiresLevel: 60, requiresPerk: 'rhet.intimidate', modifiers: { 'persuade.chance': 0.15 } },
  // ---- Trade
  { id: 'merc.haggle1', skill: 'mercatura', name: 'Haggler', description: 'Buy 10% cheaper and sell 10% dearer.', requiresLevel: 0, modifiers: { 'price.buy': 0.1, 'price.sell': 0.1 } },
  { id: 'merc.haggle2', skill: 'mercatura', name: 'Haggler II', description: 'Buy 20% cheaper and sell 20% dearer.', requiresLevel: 20, requiresPerk: 'merc.haggle1', modifiers: { 'price.buy': 0.1, 'price.sell': 0.1 } },
  { id: 'merc.haggle3', skill: 'mercatura', name: 'Haggler III', description: 'Buy 30% cheaper and sell 30% dearer.', requiresLevel: 40, requiresPerk: 'merc.haggle2', modifiers: { 'price.buy': 0.1, 'price.sell': 0.1 } },
  { id: 'merc.mule', skill: 'mercatura', name: 'Marius’ Mule', description: 'Carry 20 kg more, like a legionary on the march.', requiresLevel: 30, requiresPerk: 'merc.haggle1', modifiers: { 'carry.max': 20 } },
  { id: 'merc.fence', skill: 'mercatura', name: 'No Questions Asked', description: 'Sell stolen goods to any merchant, and fences pay full price.', requiresLevel: 50, requiresPerk: 'merc.haggle2', flags: ['barter.fence', 'barter.fenceFull'] },
  { id: 'merc.investor', skill: 'mercatura', name: 'Negotiator', description: 'Invest in a shop to raise its purse for good.', requiresLevel: 70, requiresPerk: 'merc.fence', flags: ['barter.invest'] },
  // ---- Medicine
  { id: 'med.physician1', skill: 'medicina', name: 'Medicus', description: 'Remedies you take are 20% stronger.', requiresLevel: 0, modifiers: { 'potion.strength': 0.2 } },
  { id: 'med.physician2', skill: 'medicina', name: 'Medicus II', description: 'Remedies you take are 40% stronger.', requiresLevel: 25, requiresPerk: 'med.physician1', modifiers: { 'potion.strength': 0.2 } },
  { id: 'med.physician3', skill: 'medicina', name: 'Medicus III', description: 'Remedies you take are 60% stronger.', requiresLevel: 50, requiresPerk: 'med.physician2', modifiers: { 'potion.strength': 0.2 } },
  { id: 'med.herbalist', skill: 'medicina', name: 'Herbalist', description: 'Gather twice as many herbs.', requiresLevel: 20, requiresPerk: 'med.physician1', flags: ['medicina.doubleHarvest'] },
  { id: 'med.antidote', skill: 'medicina', name: 'Mithridatism', description: 'Like Mithridates, you resist poisons by half.', requiresLevel: 40, requiresPerk: 'med.herbalist', flags: ['poison.resist'] },
  { id: 'med.immune', skill: 'medicina', name: 'Hale', description: 'You no longer catch diseases.', requiresLevel: 60, requiresPerk: 'med.antidote', flags: ['disease.immune'] },
  // ---- Religion
  { id: 'rel.devotion1', skill: 'religio', name: 'Devotion', description: 'Blessings last 50% longer.', requiresLevel: 0, modifiers: { 'blessing.duration': 0.5 } },
  { id: 'rel.devotion2', skill: 'religio', name: 'Devotion II', description: 'Blessings last twice as long.', requiresLevel: 25, requiresPerk: 'rel.devotion1', modifiers: { 'blessing.duration': 0.5 } },
  { id: 'rel.pious', skill: 'religio', name: 'Pius', description: '+25 pietas.', requiresLevel: 20, requiresPerk: 'rel.devotion1', modifiers: { 'pietas.max': 25 } },
  { id: 'rel.augur', skill: 'religio', name: 'Augur', description: 'Read the flight of birds: omens point toward hidden things.', requiresLevel: 40, requiresPerk: 'rel.pious', flags: ['religio.omens'] },
  { id: 'rel.favor', skill: 'religio', name: 'Favour of the Gods', description: 'Pietas returns 50% faster.', requiresLevel: 60, requiresPerk: 'rel.augur', modifiers: { 'pietas.regen': 0.5 } },
  { id: 'rel.pontifex', skill: 'religio', name: 'Pontifex', description: 'You can hold the blessings of two gods at once.', requiresLevel: 80, requiresPerk: 'rel.favor', flags: ['religio.twoBlessings'] },
];

/** Starting backgrounds (the character-creation choice). Skill bonuses add to the base of 15. */
export const BACKGROUNDS: BackgroundDef[] = [
  {
    id: 'veteran',
    name: 'Veteran of Dacia',
    latin: 'Veteranus',
    description: 'Twenty-five years under the eagles ended with Sarmizegetusa in flames. Your discharge bronze says you are a citizen; your knees say you are old.',
    skills: { blades: 10, block: 10, heavyArmor: 5, spear: 5 },
    kit: [{ id: 'gladius', equip: true }, { id: 'tunica', equip: true }, { id: 'caligae', equip: true }, { id: 'sagum', equip: true }, { id: 'posca', count: 2 }, { id: 'panis', count: 2 }],
    denarii: 25,
  },
  {
    id: 'freedman',
    name: 'Freedman',
    latin: 'Libertus',
    description: 'You wore the felt cap at your manumission and still keep accounts for your old master’s house. You know what everything costs.',
    skills: { mercatura: 10, rhetoric: 5, pickpocket: 5, lockpicking: 5 },
    kit: [{ id: 'pugio', equip: true }, { id: 'tunica', equip: true }, { id: 'soleae', equip: true }, { id: 'pileus', equip: true }, { id: 'tabula_cerata' }, { id: 'panis', count: 2 }],
    denarii: 60,
  },
  {
    id: 'provincial',
    name: 'Provincial',
    latin: 'Provincialis',
    description: 'You came down the Via Flaminia from Gaul with a bow, a cloak and no friends. Rome is louder than you were told.',
    skills: { ranged: 10, lightArmor: 10, sneak: 5 },
    kit: [{ id: 'arcus', equip: true }, { id: 'sagitta', count: 24, equip: true }, { id: 'tunica', equip: true }, { id: 'paenula', equip: true }, { id: 'soleae', equip: true }, { id: 'caseus' }],
    denarii: 15,
  },
  {
    id: 'rudiarius',
    name: 'Freed Gladiator',
    latin: 'Rudiarius',
    description: 'You won the wooden sword in the arena and walked out alive. Crowds still know your face in the Subura.',
    skills: { blades: 5, unarmed: 10, block: 5, lightArmor: 5 },
    kit: [{ id: 'sica', equip: true }, { id: 'tunica_brevis', equip: true }, { id: 'soleae', equip: true }, { id: 'rudis' }, { id: 'lucanica' }],
    denarii: 30,
  },
  {
    id: 'medicus',
    name: 'Greek Physician',
    latin: 'Medicus',
    description: 'Trained at Alexandria, you treat senators who distrust you and slaves who cannot pay you.',
    skills: { medicina: 15, rhetoric: 5, religio: 5 },
    kit: [{ id: 'pugio', equip: true }, { id: 'tunica_linea', equip: true }, { id: 'pallium', equip: true }, { id: 'calcei', equip: true }, { id: 'potio_minor', count: 3 }, { id: 'unguentum' }],
    denarii: 40,
  },
];
