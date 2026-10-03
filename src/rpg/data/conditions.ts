/**
 * Conditions: injuries, poisons, states, diseases, omens and blessings — docs/GDD.md §14.9
 * (conditions), §14.6 (blessings, vows, omens, curses), §14.8 (baths and rest), §8.5 (food and
 * wine), §6.2 (bleeding). Apply with `sheet.applyCondition(id)`; the effect source is
 * `${kind}:${id}` (stacks add `#2`, `#3`). `hasCondition('veneno')` is true while any poison runs.
 * Durations are real seconds at timeScale 20 (Infinity = until cured; 1 game hour = 180 s,
 * 1 game day = 4320 s). `percent` effects scale with the pool's max.
 */
import type { ConditionDef } from '../types';
import { DEVOTION, STANDING } from './balance';

const DAY = DEVOTION.blessingSeconds;
const HOUR = DAY / 24;
const LARES = DEVOTION.laresSeconds;

/** Any active poison counts as this condition (§14.9 `veneno`). */
export const POISONED = 'veneno';

export const CONDITIONS: ConditionDef[] = [
  // ---- injuries (§14.9)
  { id: 'cruentus', kind: 'injury', name: 'Bleeding', latin: 'cruentus', maxStacks: 3, description: 'An open cut: 2 damage a second for 6 s, up to three at once. A bandage stops it.', effects: [{ kind: 'damage', target: 'health', amount: 2, duration: 6 }] },
  { id: 'injured', kind: 'injury', name: 'Injured', latin: 'saucius', description: 'Lost in the arena or fell from a height: −20% max health for a game day. A physician or rest helps.', effects: [{ kind: 'fortify', target: 'health', amount: -20, percent: true, duration: DAY }] },
  // ---- poisons (§8.5); together they are `veneno`
  { id: 'aconitum', kind: 'poison', name: 'Poisoned (aconite)', latin: 'aconitum', description: 'Wolfsbane: 4 damage a second for 10 s.', effects: [{ kind: 'damage', target: 'health', amount: 4, duration: 10 }] },
  { id: 'cicuta', kind: 'poison', name: 'Poisoned (hemlock)', latin: 'cicuta', description: 'The Athenian poison: stamina returns half as fast for 60 s.', effects: [{ kind: 'modifier', target: 'stamina.regen', amount: -0.5, duration: 60 }] },
  { id: 'taxus', kind: 'poison', name: 'Poisoned (yew)', latin: 'taxus', description: 'Yew: 2 damage a second for 30 s.', effects: [{ kind: 'damage', target: 'health', amount: 2, duration: 30 }] },
  // ---- states (§8.5, §14.8)
  { id: 'ebrius', kind: 'state', name: 'Tipsy', latin: 'ebrius', description: '−5% accuracy; +5 persuasion with the plebs. 60 s.', effects: [{ kind: 'flag', target: 'ebrius', amount: 1, duration: 60 }] },
  { id: 'satur', kind: 'state', name: 'Well Fed', latin: 'satur', description: '+10% max stamina for 2 game hours.', effects: [{ kind: 'fortify', target: 'stamina', amount: 10, percent: true, duration: 2 * HOUR }] },
  { id: 'caecatus', kind: 'state', name: 'Blinded', latin: 'caecatus', description: 'Sand or smoke in the eyes: vision blurred for a moment. An eye salve clears it.', effects: [{ kind: 'flag', target: 'caecatus', amount: 1, duration: 3 }] },
  { id: 'lautus', kind: 'state', name: 'Washed', latin: 'lautus', description: 'Fresh from the baths: +10 persuasion and +10% stamina regeneration for 12 game hours.', effects: [{ kind: 'modifier', target: 'stamina.regen', amount: STANDING.lautusStaminaRegen, duration: STANDING.lautusHours * HOUR }, { kind: 'flag', target: 'lautus', amount: 1, duration: STANDING.lautusHours * HOUR }] },
  { id: 'sordidus', kind: 'state', name: 'Filthy', latin: 'sordidus', description: 'Bloody or filthy: −10 persuasion with everyone but the underworld until you wash.', effects: [{ kind: 'flag', target: 'sordidus', amount: 1, duration: Infinity }] },
  { id: 'quietus', kind: 'state', name: 'Rested', latin: 'quietus', description: 'A night in a rented bed: skills improve 5% faster for 8 game hours.', effects: [{ kind: 'modifier', target: 'xp.mult', amount: 0.05, duration: 8 * HOUR }] },
  { id: 'bene-quietus', kind: 'state', name: 'Well Rested', latin: 'bene quietus', description: 'A night in your own bed: skills improve 10% faster for 8 game hours.', effects: [{ kind: 'modifier', target: 'xp.mult', amount: 0.1, duration: 8 * HOUR }] },
  { id: 'votum', kind: 'state', name: 'Under a Vow', latin: 'votum', description: 'You have vowed an offering for success: +10% damage resistance and +10% stamina regeneration until the quest ends.', effects: [{ kind: 'modifier', target: 'damage.taken', amount: -0.1, duration: Infinity }, { kind: 'modifier', target: 'stamina.regen', amount: 0.1, duration: Infinity }] },
  // ---- diseases (until cured)
  { id: 'febris', kind: 'disease', name: 'Tertian Fever', latin: 'febris tertiana', contagion: 0.1, description: 'Marsh fever from the low districts in late summer: −15% max stamina until cured by a fever draught, a physician or Aesculapius.', effects: [{ kind: 'fortify', target: 'stamina', amount: -15, percent: true, duration: Infinity }] },
  { id: 'lippitudo', kind: 'disease', name: 'Lippitudo', latin: 'lippitudo', contagion: 0.2, description: 'Inflamed, weeping eyes, common in the dust of the city. (Extra.)', effects: [{ kind: 'modifier', target: 'damage.ranged', amount: -0.25, duration: Infinity }, { kind: 'modifier', target: 'persuade.chance', amount: -0.1, duration: Infinity }] },
  { id: 'scabies', kind: 'disease', name: 'The Itch', latin: 'scabies', contagion: 0.25, description: 'Caught in the cheaper baths. Everyone notices you scratching. (Extra.)', effects: [{ kind: 'modifier', target: 'persuade.chance', amount: -0.1, duration: Infinity }, { kind: 'modifier', target: 'stealth.noise', amount: -0.1, duration: Infinity }] },
  { id: 'tussis', kind: 'disease', name: 'Insula Cough', latin: 'tussis', contagion: 0.2, description: 'A wet cough from damp, smoky tenements. (Extra.)', effects: [{ kind: 'fortify', target: 'stamina', amount: -20, duration: Infinity }] },
  // ---- omens and curses (§14.6)
  { id: 'infaustus', kind: 'omen', name: 'Ill-omened', latin: 'infaustus', description: 'You have offended the gods: −10% on luck rolls (blows, lifts, locks) and −5 disposition with the pious, until a piaculum.', effects: [{ kind: 'modifier', target: 'luck', amount: -0.1, duration: Infinity }, { kind: 'flag', target: 'infaustus', amount: 1, duration: Infinity }] },
  { id: 'omen-faustum', kind: 'omen', name: 'Good Omen', latin: 'omen faustum', description: 'You accepted a good omen this morning: +5% chance of a lucky blow today.', effects: [{ kind: 'modifier', target: 'crit.chance', amount: 0.05, duration: DAY }] },
  { id: 'omen-malum', kind: 'omen', name: 'Bad Omen', latin: 'omen malum', description: 'You did not turn aside this morning’s bad omen: −5% luck today.', effects: [{ kind: 'modifier', target: 'luck', amount: -0.05, duration: DAY }] },
  { id: 'defixus', kind: 'omen', name: 'Cursed', latin: 'defixus', description: 'You learned of a curse tablet against you and wore no amulet: −5% luck and −5 persuasion for 3 days. It works only because you believe it.', effects: [{ kind: 'modifier', target: 'luck', amount: -0.05, duration: 3 * DAY }, { kind: 'modifier', target: 'persuade.chance', amount: -0.05, duration: 3 * DAY }] },
  // ---- the Lares favor: free at any compitum shrine, 2 game hours (its own slot)
  { id: 'favor-larum', kind: 'blessing', slot: 'lares', god: 'Lares Compitales', name: 'Favor of the Lares', latin: 'favor Larum', description: 'The Lares of the crossroads: +10% stamina regeneration for 2 game hours.', effects: [{ kind: 'modifier', target: 'stamina.regen', amount: 0.1, duration: LARES }] },
  // ---- temple blessings (§14.6): 24 game hours, one at a time, for an offering
  blessing('iuppiter', 'Jupiter Optimus Maximus', 'temple-jupiter-capitolinus', '−10% damage taken.', [{ kind: 'modifier', target: 'damage.taken', amount: -0.1, duration: DAY }]),
  blessing('mars', 'Mars Ultor', 'temple-mars-ultor', '+10% melee damage.', ['damage.blades', 'damage.spear', 'damage.blunt', 'damage.unarmed'].map((target) => ({ kind: 'modifier' as const, target, amount: 0.1, duration: DAY }))),
  blessing('minerva', 'Minerva', 'temple-minerva-nerva', '+15% XP for Smithing, Medicine, and Locks & Seals.', ['xp.fabrica', 'xp.medicina', 'xp.locks-seals'].map((target) => ({ kind: 'modifier' as const, target, amount: 0.15, duration: DAY }))),
  blessing('venus', 'Venus Genetrix', 'temple-venus-genetrix', '+10 persuasion.', [{ kind: 'modifier', target: 'persuade.chance', amount: 0.1, duration: DAY }]),
  blessing('castores', 'Castor and Pollux', 'temple-castor-pollux', '+5% move speed; +15% Riding & Driving XP.', [{ kind: 'modifier', target: 'speed.move', amount: 0.05, duration: DAY }, { kind: 'modifier', target: 'xp.equitatio', amount: 0.15, duration: DAY }]),
  blessing('saturnus', 'Saturn', 'temple-saturn', '+5% sell prices.', [{ kind: 'modifier', target: 'price.sell', amount: 0.05, duration: DAY }]),
  blessing('vesta', 'Vesta', 'temple-vesta', '+25% fire resistance; better rest.', [{ kind: 'modifier', target: 'fire.resist', amount: 0.25, duration: DAY }, { kind: 'flag', target: 'rest.better', amount: 1, duration: DAY }]),
  blessing('hercules', 'Hercules', ['ara-maxima', 'temple-hercules-victor'], '+20 kg carry; +10% blunt damage.', [{ kind: 'modifier', target: 'carry.max', amount: 20, duration: DAY }, { kind: 'modifier', target: 'damage.blunt', amount: 0.1, duration: DAY }]),
  blessing('portunus', 'Portunus', 'temple-portunus', 'The god of keys: lock set zones 15% wider.', [{ kind: 'modifier', target: 'lockpick.ease', amount: 0.15, duration: DAY }]),
  blessing('fortuna', 'Fortuna', 'sant-omobono-temples', '+5% on crits and luck rolls.', [{ kind: 'modifier', target: 'luck', amount: 0.05, duration: DAY }]),
  blessing('magna-mater', 'Magna Mater', 'temple-magna-mater', '+15 max stamina.', [{ kind: 'fortify', target: 'stamina', amount: 15, duration: DAY }]),
  blessing('apollo', 'Apollo', ['temple-apollo-palatinus', 'temple-apollo-sosianus'], '+10% ranged damage.', [{ kind: 'modifier', target: 'damage.ranged', amount: 0.1, duration: DAY }]),
  blessing('aesculapius', 'Aesculapius', 'temple-aesculapius', '+50% healing from remedies; cures disease when granted.', [{ kind: 'modifier', target: 'potion.strength', amount: 0.5, duration: DAY }, { kind: 'cure', target: 'disease', amount: 1 }]),
  blessing('nemesis', 'Nemesis', 'colosseum', '+25% crowd favor gained in the arena.', [{ kind: 'modifier', target: 'arena.favor', amount: 0.25, duration: DAY }]),
  blessing('diana', 'Diana', 'temple-diana-aventine', 'Night stealth and ranged damage +15%.', [{ kind: 'modifier', target: 'damage.ranged', amount: 0.15, duration: DAY }, { kind: 'flag', target: 'diana.night', amount: 1, duration: DAY }]),
  blessing('ceres', 'Ceres', 'temple-ceres', 'Food effects ×1.5.', [{ kind: 'modifier', target: 'food.strength', amount: 0.5, duration: DAY }]),
  blessing('isis', 'Isis', 'iseum-campense', 'Poison resistance +25%.', [{ kind: 'modifier', target: 'poison.resist', amount: 0.25, duration: DAY }]),
  blessing('laverna', 'Laverna', 'porta-lavernalis', 'Pickpocketing +15%.', [{ kind: 'modifier', target: 'pickpocket.chance', amount: 0.15, duration: DAY }]),
];

function blessing(god: string, name: string, temple: string | string[], effect: string, effects: ConditionDef['effects']): ConditionDef {
  return { id: `benedictio-${god}`, kind: 'blessing', slot: 'temple', god: name, temple, name: `Blessing of ${name}`, latin: `benedictio`, description: `${effect} For a game day.`, effects };
}

/** The temple blessing granted at a landmark, if any. */
export function blessingAt(templeId: string): ConditionDef | undefined {
  return CONDITIONS.find((c) => c.slot === 'temple' && (Array.isArray(c.temple) ? c.temple.includes(templeId) : c.temple === templeId));
}
