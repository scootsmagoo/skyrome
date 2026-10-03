/**
 * Conditions: diseases, injuries, poisons, states, omens and blessings. Numbers follow
 * docs/GDD.md §6.2 (bleeding), §8.5 (poisons, wine, dinner), §6.10 (injured after missio);
 * blessings follow the research §B8.3 (GDD §14.6 is pending). Apply with
 * `sheet.applyCondition(id)`; the effect source is `${kind}:${id}` (stacks add `#2`, `#3`).
 * Durations are real seconds (Infinity = until cured; 1 game hour = 180 s; 1 game day = 4320 s).
 */
import type { ConditionDef } from '../types';
import { DEVOTION } from './balance';

const DAY = DEVOTION.blessingSeconds;
const HOUR = DAY / 24;

export const CONDITIONS: ConditionDef[] = [
  // ---- injuries
  { id: 'cruor', kind: 'injury', name: 'Bleeding', latin: 'cruor', maxStacks: 3, description: 'An open cut: 2 damage a second for 6 s, up to three at once. A bandage stops it.', effects: [{ kind: 'damage', target: 'health', amount: 2, duration: 6 }] },
  { id: 'saucius', kind: 'injury', name: 'Injured', latin: 'saucius', description: 'Spared in the arena and patched up in the saniarium: −20% max health for a game day.', effects: [{ kind: 'fortify', target: 'health', amount: -20, duration: DAY }] },
  // ---- poisons (§8.5)
  { id: 'aconitum', kind: 'poison', name: 'Aconite', latin: 'aconitum', description: 'Wolfsbane: 4 damage a second for 10 s.', effects: [{ kind: 'damage', target: 'health', amount: 4, duration: 10 }] },
  { id: 'cicuta', kind: 'poison', name: 'Hemlock', latin: 'cicuta', description: 'The Athenian poison: stamina returns half as fast for 60 s.', effects: [{ kind: 'modifier', target: 'stamina.regen', amount: -0.5, duration: 60 }] },
  { id: 'taxus', kind: 'poison', name: 'Yew', latin: 'taxus', description: 'Yew: 2 damage a second for 30 s.', effects: [{ kind: 'damage', target: 'health', amount: 2, duration: 30 }] },
  // ---- states
  { id: 'ebrius', kind: 'state', name: 'Tipsy', latin: 'ebrius', description: '−5% accuracy; +5 persuasion with the plebs. 60 s.', effects: [{ kind: 'flag', target: 'ebrius', amount: 1, duration: 60 }] },
  { id: 'satur', kind: 'state', name: 'Well Fed', latin: 'satur', description: '+10% max stamina for 2 game hours.', effects: [{ kind: 'fortify', target: 'stamina', amount: 10, duration: 2 * HOUR }] },
  { id: 'caecatus', kind: 'state', name: 'Blinded', latin: 'caecatus', description: 'Sand or smoke in the eyes. An eye salve cures it.', effects: [{ kind: 'flag', target: 'caecatus', amount: 1, duration: 10 }] },
  // ---- diseases (until cured; GDD §14.9 is pending)
  { id: 'febris', kind: 'disease', name: 'Tertian Fever', latin: 'febris tertiana', contagion: 0.15, description: 'The marsh fever of the Campus Martius. A fever draught or a physician cures it.', effects: [{ kind: 'modifier', target: 'stamina.regen', amount: -0.5, duration: Infinity }, { kind: 'fortify', target: 'health', amount: -15, duration: Infinity }] },
  { id: 'lippitudo', kind: 'disease', name: 'Lippitudo', latin: 'lippitudo', contagion: 0.2, description: 'Inflamed, weeping eyes, common in the dust of the city.', effects: [{ kind: 'modifier', target: 'damage.ranged', amount: -0.25, duration: Infinity }, { kind: 'modifier', target: 'persuade.chance', amount: -0.1, duration: Infinity }] },
  { id: 'scabies', kind: 'disease', name: 'The Itch', latin: 'scabies', contagion: 0.25, description: 'Caught in the cheaper baths. Everyone notices you scratching.', effects: [{ kind: 'modifier', target: 'persuade.chance', amount: -0.1, duration: Infinity }, { kind: 'modifier', target: 'stealth.noise', amount: -0.1, duration: Infinity }] },
  { id: 'tussis', kind: 'disease', name: 'Insula Cough', latin: 'tussis', contagion: 0.2, description: 'A wet cough from damp, smoky tenements.', effects: [{ kind: 'fortify', target: 'stamina', amount: -20, duration: Infinity }] },
  // ---- omens (impiety, cured by a piaculum)
  { id: 'infaustus', kind: 'omen', name: 'Ill-omened', latin: 'infaustus', description: 'You have offended the gods; people are uneasy around you until you make expiation.', effects: [{ kind: 'modifier', target: 'persuade.chance', amount: -0.1, duration: Infinity }, { kind: 'modifier', target: 'price.buy', amount: -0.05, duration: Infinity }] },
  // ---- blessings: one game day, one at a time (modest: ±5–25%, GDD §2.4)
  { id: 'lares', kind: 'blessing', god: 'Lares Compitales', name: 'Blessing of the Crossroads', latin: 'favor Larum', description: 'The Lares of the 265 crossroads shrines: +10 health and stamina.', effects: [{ kind: 'fortify', target: 'health', amount: 10, duration: DAY }, { kind: 'fortify', target: 'stamina', amount: 10, duration: DAY }] },
  { id: 'iuppiter', kind: 'blessing', god: 'Jupiter Optimus Maximus', name: 'Blessing of Jupiter', latin: 'favor Iovis', description: '+20 health.', effects: [{ kind: 'fortify', target: 'health', amount: 20, duration: DAY }] },
  { id: 'mars', kind: 'blessing', god: 'Mars Ultor', name: 'Blessing of Mars', latin: 'favor Martis', description: 'Mars the Avenger, in the Forum of Augustus: melee damage +10%.', effects: [{ kind: 'modifier', target: 'damage.blades', amount: 0.1, duration: DAY }, { kind: 'modifier', target: 'damage.spear', amount: 0.1, duration: DAY }, { kind: 'modifier', target: 'damage.blunt', amount: 0.1, duration: DAY }, { kind: 'modifier', target: 'damage.unarmed', amount: 0.1, duration: DAY }] },
  { id: 'minerva', kind: 'blessing', god: 'Minerva', name: 'Blessing of Minerva', latin: 'favor Minervae', description: 'Wisdom and craft: skills improve 10% faster.', effects: [{ kind: 'modifier', target: 'xp.mult', amount: 0.1, duration: DAY }] },
  { id: 'mercurius', kind: 'blessing', god: 'Mercury', name: 'Blessing of Mercury', latin: 'favor Mercurii', description: 'God of merchants and thieves: prices 5% better, lifting 10% easier.', effects: [{ kind: 'modifier', target: 'price.buy', amount: 0.05, duration: DAY }, { kind: 'modifier', target: 'price.sell', amount: 0.05, duration: DAY }, { kind: 'modifier', target: 'pickpocket.chance', amount: 0.1, duration: DAY }] },
  { id: 'fortuna', kind: 'blessing', god: 'Fortuna', name: 'Blessing of Fortuna', latin: 'favor Fortunae', description: 'Fortune of This Very Day: locks and pockets 10% easier.', effects: [{ kind: 'modifier', target: 'lockpick.ease', amount: 0.1, duration: DAY }, { kind: 'modifier', target: 'pickpocket.chance', amount: 0.1, duration: DAY }] },
  { id: 'hercules', kind: 'blessing', god: 'Hercules Victor', name: 'Blessing of Hercules', latin: 'favor Herculis', description: 'At the Ara Maxima: carry 15 kg more.', effects: [{ kind: 'modifier', target: 'carry.max', amount: 15, duration: DAY }] },
  { id: 'venus', kind: 'blessing', god: 'Venus Genetrix', name: 'Blessing of Venus', latin: 'favor Veneris', description: 'Mother of the Julian line: +5 Rhetoric.', effects: [{ kind: 'fortify', target: 'rhetoric', amount: 5, duration: DAY }] },
  { id: 'diana', kind: 'blessing', god: 'Diana', name: 'Blessing of Diana', latin: 'favor Dianae', description: 'The huntress on the Aventine: bows and slings +10%.', effects: [{ kind: 'modifier', target: 'damage.ranged', amount: 0.1, duration: DAY }] },
  { id: 'aesculapius', kind: 'blessing', god: 'Aesculapius', name: 'Blessing of Aesculapius', latin: 'favor Aesculapii', description: 'The healer of the Tiber Island: remedies and bandages 15% stronger.', effects: [{ kind: 'modifier', target: 'potion.strength', amount: 0.15, duration: DAY }] },
  { id: 'laverna', kind: 'blessing', god: 'Laverna', name: 'Blessing of Laverna', latin: 'favor Lavernae', description: 'The thieves’ goddess: 10% harder to see and hear.', effects: [{ kind: 'modifier', target: 'stealth.visibility', amount: 0.1, duration: DAY }, { kind: 'modifier', target: 'stealth.noise', amount: 0.1, duration: DAY }] },
  { id: 'nemesis', kind: 'blessing', god: 'Nemesis', name: 'Blessing of Nemesis', latin: 'favor Nemesis', description: 'From the amphitheatre’s shrines: power attacks +10%.', effects: [{ kind: 'modifier', target: 'damage.power', amount: 0.1, duration: DAY }] },
  { id: 'isis', kind: 'blessing', god: 'Isis', name: 'Blessing of Isis', latin: 'favor Isidis', description: 'The Queen of Heaven, at the Iseum Campense: +10 pietas.', effects: [{ kind: 'fortify', target: 'pietas', amount: 10, duration: DAY }] },
  { id: 'mithras', kind: 'blessing', god: 'Mithras', name: 'Blessing of Mithras', latin: 'favor Mithrae', description: 'The bull-slayer of the soldiers’ mysteries: +15 stamina.', effects: [{ kind: 'fortify', target: 'stamina', amount: 15, duration: DAY }] },
];
